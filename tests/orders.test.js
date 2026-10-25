import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import { orderTotal, transitions } from '../shared/orders.js';
let f, owner, other, productId, tableId, token, orderId, tracking;
const product = {
  name: 'Producto de prueba',
  description: '',
  category: 'Pruebas',
  priceCents: 1234,
  available: true,
};
const payload = () => ({
  customerName: 'Contacto de prueba',
  note: '',
  requestKey: crypto.randomUUID(),
  items: [{ productId, quantity: 2, priceCents: 0 }],
});
before(async () => {
  f = await fixture();
  owner = await f.register('Owner');
  other = await f.register('Other');
});
after(async () => {
  await f.close();
});
test('el total usa céntimos enteros y los estados finales no retroceden', () => {
  assert.equal(
    orderTotal([
      { priceCents: 1234, quantity: 2 },
      { priceCents: 1, quantity: 3 },
    ]),
    2471,
  );
  assert.deepEqual(transitions.served, []);
  assert.deepEqual(transitions.cancelled, []);
});
test('el catálogo solo se modifica desde su cuenta', async () => {
  const result = await f.request('/workspace/products', {
    cookie: owner.cookie,
    method: 'POST',
    body: product,
  });
  assert.equal(result.status, 201);
  productId = result.data.id;
  assert.equal(
    (
      await f.request('/workspace/products/' + productId, {
        cookie: other.cookie,
        method: 'PUT',
        body: product,
      })
    ).status,
    404,
  );
  assert.equal(
    (await f.request('/workspace/state', { cookie: other.cookie })).data.products.length,
    0,
  );
});
test('la mesa abre una carta pública sin datos de la cuenta', async () => {
  const result = await f.request('/workspace/tables', {
    cookie: owner.cookie,
    method: 'POST',
    body: { name: 'Mesa de prueba' },
  });
  assert.equal(result.status, 201);
  tableId = result.data.table.id;
  token = new URL(result.data.url).pathname.split('/')[2];
  const menu = await f.request('/menu/' + token);
  assert.equal(menu.data.products[0].id, productId);
  assert.equal(JSON.stringify(menu.data).includes(owner.email), false);
});
test('el servidor fija precios y evita reenvíos del mismo pedido', async () => {
  const input = payload();
  const result = await f.request('/menu/' + token + '/orders', { method: 'POST', body: input });
  assert.equal(result.status, 201);
  assert.equal(result.data.order.totalCents, 2468);
  orderId = result.data.order.id;
  tracking = new URL(result.data.trackingUrl).pathname.split('/')[2];
  assert.equal(
    (await f.request('/menu/' + token + '/orders', { method: 'POST', body: input })).status,
    409,
  );
  assert.equal((await f.request('/order/' + tracking)).data.order.status, 'new');
});
test('comprueba el propietario y respeta el orden de preparación', async () => {
  assert.equal(
    (
      await f.request('/workspace/orders/' + orderId + '/status', {
        cookie: other.cookie,
        method: 'PATCH',
        body: { status: 'preparing' },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request('/workspace/orders/' + orderId + '/status', {
        cookie: owner.cookie,
        method: 'PATCH',
        body: { status: 'ready' },
      })
    ).status,
    409,
  );
  for (const status of ['preparing', 'ready', 'served'])
    assert.equal(
      (
        await f.request('/workspace/orders/' + orderId + '/status', {
          cookie: owner.cookie,
          method: 'PATCH',
          body: { status },
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await f.request('/workspace/orders/' + orderId + '/status', {
        cookie: owner.cookie,
        method: 'PATCH',
        body: { status: 'cancelled' },
      })
    ).status,
    409,
  );
});
test('un cambio posterior de precio conserva el pedido original', async () => {
  await f.request('/workspace/products/' + productId, {
    cookie: owner.cookie,
    method: 'PUT',
    body: { ...product, priceCents: 9999 },
  });
  assert.equal((await f.request('/order/' + tracking)).data.order.totalCents, 2468);
});
test('no acepta productos agotados ni cantidades negativas', async () => {
  await f.request('/workspace/products/' + productId, {
    cookie: owner.cookie,
    method: 'PUT',
    body: { ...product, available: false },
  });
  assert.equal((await f.request('/menu/' + token)).data.products.length, 0);
  assert.equal(
    (await f.request('/menu/' + token + '/orders', { method: 'POST', body: payload() })).status,
    409,
  );
  assert.equal(
    (
      await f.request('/menu/' + token + '/orders', {
        method: 'POST',
        body: { ...payload(), items: [{ productId, quantity: -1 }] },
      })
    ).status,
    400,
  );
});
test('renovar el QR invalida el anterior y pausar retira la carta', async () => {
  const old = token;
  const result = await f.request('/workspace/tables/' + tableId + '/link', {
    cookie: owner.cookie,
    method: 'POST',
    body: {},
  });
  token = new URL(result.data.url).pathname.split('/')[2];
  assert.equal((await f.request('/menu/' + old)).status, 404);
  assert.equal((await f.request('/menu/' + token)).status, 200);
  await f.request('/workspace/tables/' + tableId, {
    cookie: owner.cookie,
    method: 'PUT',
    body: { name: 'Mesa de prueba', active: false },
  });
  assert.equal((await f.request('/menu/' + token)).status, 404);
});
test('el canal en vivo envía eventos y se puede cerrar', async () => {
  const controller = new AbortController();
  const response = await fetch(f.base + '/api/workspace/events', {
    headers: { Cookie: owner.cookie },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-type').includes('text/event-stream'));
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.ok(new TextDecoder().decode(first.value).includes('data:'));
  controller.abort();
  await reader.cancel().catch(() => {});
});
test('la exportación pertenece solo al restaurante autenticado', async () => {
  assert.equal(
    (await f.request('/workspace/export', { cookie: owner.cookie })).data.orders.length,
    1,
  );
  assert.equal(
    (await f.request('/workspace/export', { cookie: other.cookie })).data.orders.length,
    0,
  );
});
