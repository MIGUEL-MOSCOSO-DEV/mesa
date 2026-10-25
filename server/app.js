import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { createBase, finishApi, problem, text } from './core.js';
import { createToken, hashToken, sessionToken } from './auth.js';
import { transaction } from './db.js';
import { transitions, orderTotal } from '../shared/orders.js';

const productSchema = z.object({
  name: text(120).min(1),
  description: text(1000),
  category: text(80).min(1),
  priceCents: z.number().int().min(0).max(1000000),
  available: z.boolean(),
});
const orderSchema = z
  .object({
    customerName: text(100).min(2),
    note: text(1000),
    requestKey: z.string().uuid(),
    items: z
      .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(20) }))
      .min(1)
      .max(30),
  })
  .refine(
    (input) => new Set(input.items.map((item) => item.productId)).size === input.items.length,
    'No repitas productos.',
  );
const readProduct = (row) => ({
  ...row,
  priceCents: row.price_cents,
  available: Boolean(row.available),
  user_id: undefined,
  price_cents: undefined,
});
const readTable = (row) => ({ id: row.id, name: row.name, active: Boolean(row.active) });
const readOrder = (row) => ({
  id: row.id,
  number: row.number,
  status: row.status,
  tableId: row.table_id,
  tableName: row.table_name,
  customerName: row.customer_name,
  note: row.note,
  items: JSON.parse(row.items),
  totalCents: row.total_cents,
  currency: row.currency,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createApp(db, options = { appUrl: 'http://localhost:3100' }) {
  const { app, workspace, origin } = createBase(db, options);
  const changes = new EventEmitter();
  changes.setMaxListeners(100);
  const publish = (userId) => changes.emit(userId);
  function tableByToken(token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw problem(404, 'La mesa no está disponible.');
    const table = db
      .prepare(
        'SELECT dining_tables.*,users.profile FROM dining_tables JOIN users ON users.id=dining_tables.user_id WHERE token_hash=? AND active=1',
      )
      .get(hashToken(token));
    if (!table) throw problem(404, 'La mesa no está disponible.');
    return table;
  }
  function orderById(id, userId) {
    const row = db
      .prepare(
        'SELECT orders.*,dining_tables.name AS table_name FROM orders JOIN dining_tables ON dining_tables.id=orders.table_id WHERE orders.id=? AND orders.user_id=?',
      )
      .get(id, userId);
    if (!row) throw problem(404, 'No se encontró el pedido.');
    return readOrder(row);
  }
  app.get('/api/menu/:token', (req, res) => {
    const table = tableByToken(req.params.token);
    const profile = JSON.parse(table.profile);
    res.json({
      business: { name: profile.label, currency: profile.currency },
      table: readTable(table),
      products: db
        .prepare('SELECT * FROM products WHERE user_id=? AND available=1 ORDER BY category,name')
        .all(table.user_id)
        .map(readProduct),
    });
  });
  const orderLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados pedidos. Espera unos minutos.' },
  });
  app.post('/api/menu/:token/orders', orderLimit, (req, res) => {
    const input = orderSchema.parse(req.body);
    const tracking = createToken();
    const result = transaction(db, () => {
      const table = tableByToken(req.params.token);
      const previous = db
        .prepare('SELECT id FROM orders WHERE table_id=? AND request_key=?')
        .get(table.id, input.requestKey);
      if (previous)
        throw problem(
          409,
          'Este pedido ya fue enviado. Revisa la pantalla de seguimiento antes de volver a pedir.',
        );
      const items = input.items.map((item) => {
        const product = db
          .prepare('SELECT * FROM products WHERE id=? AND user_id=? AND available=1')
          .get(item.productId, table.user_id);
        if (!product) throw problem(409, 'Un producto ya no está disponible. Actualiza la carta.');
        return {
          productId: product.id,
          name: product.name,
          priceCents: product.price_cents,
          quantity: item.quantity,
        };
      });
      const number = db
        .prepare('SELECT COALESCE(MAX(number),0)+1 AS number FROM orders WHERE user_id=?')
        .get(table.user_id).number;
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO orders(id,user_id,table_id,number,customer_name,note,items,total_cents,currency,tracking_hash,request_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        id,
        table.user_id,
        table.id,
        number,
        input.customerName,
        input.note,
        JSON.stringify(items),
        orderTotal(items),
        JSON.parse(table.profile).currency,
        hashToken(tracking),
        input.requestKey,
        now,
        now,
      );
      publish(table.user_id);
      return orderById(id, table.user_id);
    });
    res.status(201).json({ order: result, trackingUrl: origin + '/order/' + tracking });
  });
  app.get('/api/order/:token', (req, res) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(req.params.token))
      throw problem(404, 'No se encontró el pedido.');
    const row = db
      .prepare(
        'SELECT orders.*,dining_tables.name AS table_name FROM orders JOIN dining_tables ON dining_tables.id=orders.table_id WHERE tracking_hash=?',
      )
      .get(hashToken(req.params.token));
    if (!row) throw problem(404, 'No se encontró el pedido.');
    res.json({ order: readOrder(row) });
  });
  workspace.get('/state', (req, res) =>
    res.json({
      products: db
        .prepare('SELECT * FROM products WHERE user_id=? ORDER BY category,name')
        .all(req.user.id)
        .map(readProduct),
      tables: db
        .prepare('SELECT * FROM dining_tables WHERE user_id=? ORDER BY created_at,rowid')
        .all(req.user.id)
        .map(readTable),
      orders: db
        .prepare(
          'SELECT orders.*,dining_tables.name AS table_name FROM orders JOIN dining_tables ON dining_tables.id=orders.table_id WHERE orders.user_id=? ORDER BY orders.created_at DESC',
        )
        .all(req.user.id)
        .map(readOrder),
    }),
  );
  workspace.get('/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const tokenHash = hashToken(sessionToken(req));
    const send = () => {
      if (
        !db
          .prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?')
          .get(tokenHash, Date.now())
      )
        return res.end();
      res.write('data: {}\n\n');
    };
    send();
    changes.on(req.user.id, send);
    const timer = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    req.on('close', () => {
      clearInterval(timer);
      changes.off(req.user.id, send);
    });
  });
  workspace.post('/products', (req, res) => {
    const input = productSchema.parse(req.body);
    const id = randomUUID();
    db.prepare(
      'INSERT INTO products(id,user_id,name,description,category,price_cents,available) VALUES(?,?,?,?,?,?,?)',
    ).run(
      id,
      req.user.id,
      input.name,
      input.description,
      input.category,
      input.priceCents,
      Number(input.available),
    );
    publish(req.user.id);
    res.status(201).json({ id });
  });
  workspace.put('/products/:id', (req, res) => {
    const input = productSchema.parse(req.body);
    const result = db
      .prepare(
        'UPDATE products SET name=?,description=?,category=?,price_cents=?,available=? WHERE id=? AND user_id=?',
      )
      .run(
        input.name,
        input.description,
        input.category,
        input.priceCents,
        Number(input.available),
        req.params.id,
        req.user.id,
      );
    if (!result.changes) throw problem(404, 'No se encontró el producto.');
    publish(req.user.id);
    res.json({ ok: true });
  });
  workspace.delete('/products/:id', (req, res) => {
    const result = db
      .prepare('DELETE FROM products WHERE id=? AND user_id=?')
      .run(req.params.id, req.user.id);
    if (!result.changes) throw problem(404, 'No se encontró el producto.');
    publish(req.user.id);
    res.json({ ok: true });
  });
  workspace.post('/tables', (req, res) => {
    const input = z.object({ name: text(80).min(1) }).parse(req.body);
    const id = randomUUID();
    const token = createToken();
    db.prepare('INSERT INTO dining_tables(id,user_id,name,token_hash) VALUES(?,?,?,?)').run(
      id,
      req.user.id,
      input.name,
      hashToken(token),
    );
    res
      .status(201)
      .json({ table: { id, name: input.name, active: true }, url: origin + '/menu/' + token });
  });
  workspace.put('/tables/:id', (req, res) => {
    const input = z.object({ name: text(80).min(1), active: z.boolean() }).parse(req.body);
    const result = db
      .prepare('UPDATE dining_tables SET name=?,active=? WHERE id=? AND user_id=?')
      .run(input.name, Number(input.active), req.params.id, req.user.id);
    if (!result.changes) throw problem(404, 'No se encontró la mesa.');
    res.json({ ok: true });
  });
  workspace.post('/tables/:id/link', (req, res) => {
    const token = createToken();
    const result = db
      .prepare('UPDATE dining_tables SET token_hash=? WHERE id=? AND user_id=?')
      .run(hashToken(token), req.params.id, req.user.id);
    if (!result.changes) throw problem(404, 'No se encontró la mesa.');
    res.json({ url: origin + '/menu/' + token });
  });
  workspace.patch('/orders/:id/status', (req, res) => {
    const input = z
      .object({ status: z.enum(['preparing', 'ready', 'served', 'cancelled']) })
      .parse(req.body);
    const order = orderById(req.params.id, req.user.id);
    if (!transitions[order.status].includes(input.status))
      throw problem(409, 'Ese cambio de estado no está permitido.');
    db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(
      input.status,
      new Date().toISOString(),
      order.id,
    );
    publish(req.user.id);
    res.json({ order: orderById(order.id, req.user.id) });
  });
  workspace.get('/export', (req, res) => {
    const rows = db
      .prepare(
        'SELECT orders.*,dining_tables.name AS table_name FROM orders JOIN dining_tables ON dining_tables.id=orders.table_id WHERE orders.user_id=?',
      )
      .all(req.user.id);
    res
      .attachment('mesa-orders.json')
      .json({ exportedAt: new Date().toISOString(), orders: rows.map(readOrder) });
  });
  return finishApi(app);
}
