import React, { useState, useEffect } from 'react';
import {
  ChefHat,
  UtensilsCrossed,
  LayoutGrid,
  Settings2,
  Plus,
  Clock3,
  Flame,
  CheckCheck,
  ArrowRight,
  Search,
  Trash2,
  Pencil,
  QrCode,
  ExternalLink,
  Copy,
  ShoppingBag,
  Download,
} from 'lucide-react';
import QRCode from 'qrcode';
import { api } from './api.js';
import {
  Session,
  Shell,
  Profile,
  Heading,
  Stat,
  Button,
  Field,
  Modal,
  Empty,
  Notice,
  useTask,
  useData,
  money,
  dateLabel,
  today,
  Brand,
} from './ui.jsx';
import { statusLabels, ticketNumber } from '../shared/orders.js';
import MenuPage from './MenuPage.jsx';

export default function App() {
  const path = window.location.pathname.split('/');
  if (path[1] === 'menu' && path[2]) return <MenuPage token={path[2]} />;
  if (path[1] === 'order' && path[2]) return <Tracking token={path[2]} />;
  return <Session>{(user, setUser) => <Workspace user={user} onUserChange={setUser} />}</Session>;
}
function Workspace({ user, onUserChange }) {
  const [page, setPage] = useState('kitchen');
  const { data, error, reload } = useData('/workspace/state');
  useEffect(() => {
    const source = new EventSource('/api/workspace/events');
    source.onmessage = () => reload().catch(() => {});
    return () => source.close();
  }, [reload]);
  const items = [
    {
      id: 'kitchen',
      label: 'Cocina en vivo',
      Icon: ChefHat,
      count:
        data?.orders.filter((order) => ['new', 'preparing', 'ready'].includes(order.status))
          .length || 0,
    },
    { id: 'menu', label: 'La carta', Icon: UtensilsCrossed },
    { id: 'tables', label: 'Mesas y códigos QR', Icon: LayoutGrid },
    { id: 'settings', label: 'Mi restaurante', Icon: Settings2 },
  ];
  return (
    <Shell user={user} onUserChange={onUserChange} page={page} onPage={setPage} items={items}>
      <Notice error={error} />
      {!data ? (
        <div className="loading-inline">Preparando el servicio…</div>
      ) : page === 'kitchen' ? (
        <Kitchen orders={data.orders} reload={reload} user={user} />
      ) : page === 'menu' ? (
        <Products products={data.products} reload={reload} currency={user.currency} />
      ) : page === 'tables' ? (
        <Tables tables={data.tables} reload={reload} />
      ) : (
        <Profile
          user={user}
          onUserChange={onUserChange}
          labels={{ title: 'Mi restaurante', label: 'Nombre del restaurante' }}
        />
      )}
    </Shell>
  );
}
function Kitchen({ orders, reload, user }) {
  const [history, setHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const task = useTask();
  const todayOrders = orders.filter((order) => order.createdAt.slice(0, 10) === today());
  const revenue = {};
  for (const order of todayOrders.filter((order) => order.status === 'served'))
    revenue[order.currency] = (revenue[order.currency] || 0) + order.totalCents;
  const active = orders.filter((order) => ['new', 'preparing', 'ready'].includes(order.status));
  const matches = (order) =>
    [order.customerName, order.tableName, ticketNumber(order.number)]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase());
  function move(order, status) {
    task.perform(async () => {
      await api('/workspace/orders/' + order.id + '/status', { method: 'PATCH', body: { status } });
      setCancelling(null);
      await reload();
    });
  }
  return (
    <>
      <Heading
        eyebrow="CADA PEDIDO CUENTA"
        title="El pulso de tu cocina"
        description="Lo que entra, lo que se prepara y lo que está por salir."
        action={
          <span className="live-pill">
            <i /> Cocina en vivo
          </span>
        }
      />
      <section className="mesa-hero">
        <div>
          <span className="eyebrow">UN BUEN SERVICIO EMPIEZA AQUÍ</span>
          <h2>
            Todo a su tiempo.
            <br />
            <em>Todo en su mesa.</em>
          </h2>
          <p>Un espacio claro para que tu equipo mantenga el ritmo.</p>
        </div>
        <div className="plate-art" aria-hidden="true">
          <div />
          <span>✦</span>
          <i />
        </div>
      </section>
      <div className="stats-grid">
        <Stat
          label="Pedidos de hoy"
          value={todayOrders.length}
          icon={ShoppingBag}
          note="Registrados durante el día UTC"
        />
        <Stat
          label="En cocina"
          value={active.filter((order) => order.status !== 'ready').length}
          icon={Flame}
          note="Entre nuevos y en preparación"
        />
        <Stat
          label="Listos para salir"
          value={active.filter((order) => order.status === 'ready').length}
          icon={CheckCheck}
          note="Esperando llegar a la mesa"
        />
        <Stat
          label="Entregado hoy"
          value={
            Object.keys(revenue).length
              ? Object.entries(revenue)
                  .map(([currency, total]) => money(total, currency))
                  .join(' / ')
              : money(0, user.currency)
          }
          note="Importes por moneda, sin conversión"
        />
      </div>
      <Notice error={task.error} />
      <div className="section-bar">
        <div className="segmented">
          <button className={!history ? 'active' : ''} onClick={() => setHistory(false)}>
            Servicio activo <span>{active.length}</span>
          </button>
          <button className={history ? 'active' : ''} onClick={() => setHistory(true)}>
            Historial
          </button>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Buscar pedidos"
            placeholder="Mesa, nombre o número…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {history ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>Pedidos cerrados</h2>
            <a className="text-button" href="/api/workspace/export" download>
              <Download size={15} /> Exportar JSON
            </a>
          </div>
          {orders.filter(
            (order) => ['served', 'cancelled'].includes(order.status) && matches(order),
          ).length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Mesa</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {orders
                    .filter(
                      (order) => ['served', 'cancelled'].includes(order.status) && matches(order),
                    )
                    .map((order) => (
                      <tr key={order.id}>
                        <td>
                          {ticketNumber(order.number)}
                          <small>{dateLabel(order.createdAt)}</small>
                        </td>
                        <td>{order.tableName}</td>
                        <td>{order.customerName}</td>
                        <td>
                          <span className={'badge ' + order.status}>
                            {statusLabels[order.status]}
                          </span>
                        </td>
                        <td>{money(order.totalCents, order.currency)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Cada servicio deja su historia">
              Los pedidos entregados o cancelados aparecerán aquí.
            </Empty>
          )}
        </section>
      ) : (
        <div className="kitchen-board">
          {['new', 'preparing', 'ready'].map((status) => (
            <section className={'kitchen-lane ' + status} key={status}>
              <header>
                <span>
                  <i />
                  {statusLabels[status]}
                </span>
                <b>{active.filter((order) => order.status === status).length}</b>
              </header>
              <div className="lane-content">
                {active
                  .filter((order) => order.status === status && matches(order))
                  .reverse()
                  .map((order) => (
                    <article className="ticket" key={order.id}>
                      <div className="ticket-top">
                        <strong>{ticketNumber(order.number)}</strong>
                        <span>
                          <Clock3 size={13} />
                          {new Date(order.createdAt).toLocaleTimeString('es', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <h3>{order.tableName}</h3>
                      <p className="muted small">{order.customerName}</p>
                      <ul>
                        {order.items.map((item) => (
                          <li key={item.productId}>
                            <b>{item.quantity}×</b>
                            <span>{item.name}</span>
                          </li>
                        ))}
                      </ul>
                      {order.note && <p className="ticket-note">{order.note}</p>}
                      <div className="ticket-total">
                        <span>Total</span>
                        <strong>{money(order.totalCents, order.currency)}</strong>
                      </div>
                      <Button
                        busy={task.busy}
                        onClick={() =>
                          move(
                            order,
                            { new: 'preparing', preparing: 'ready', ready: 'served' }[status],
                          )
                        }
                      >
                        {status === 'new'
                          ? 'Enviar a cocina'
                          : status === 'preparing'
                            ? 'Marcar listo'
                            : 'Marcar entregado'}
                        <ArrowRight size={16} />
                      </Button>
                      <button
                        className="text-button cancel-order"
                        onClick={() => setCancelling(order)}
                      >
                        Cancelar pedido
                      </button>
                    </article>
                  ))}
                {!active.some((order) => order.status === status && matches(order)) && (
                  <div className="lane-empty">
                    <ChefHat size={24} />
                    <p>
                      {status === 'new'
                        ? 'Esperando el próximo pedido'
                        : status === 'preparing'
                          ? 'La cocina tiene espacio'
                          : 'Nada por salir, por ahora'}
                    </p>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {cancelling && (
        <Modal
          title={'Cancelar ' + ticketNumber(cancelling.number)}
          onClose={() => setCancelling(null)}
        >
          <div className="stack">
            <Notice error={task.error} />
            <p>El pedido se cerrará como cancelado y se conservará en el historial.</p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setCancelling(null)}>
                Volver
              </Button>
              <Button
                variant="danger"
                busy={task.busy}
                onClick={() => move(cancelling, 'cancelled')}
              >
                Cancelar pedido
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function Products({ products, reload, currency }) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [category, setCategory] = useState('all');
  const task = useTask();
  const categories = [...new Set(products.map((product) => product.category))];
  const filtered = products.filter(
    (product) => category === 'all' || product.category === category,
  );
  return (
    <>
      <Heading
        eyebrow="TU COCINA, BIEN PRESENTADA"
        title="La carta"
        description="Los platos que tus clientes van a descubrir."
        action={
          <Button
            onClick={() =>
              setEditing({
                name: '',
                description: '',
                category: '',
                priceCents: 0,
                available: true,
              })
            }
          >
            <Plus size={17} /> Nuevo producto
          </Button>
        }
      />
      <div className="section-bar">
        <div className="filter-pills">
          <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
            Toda la carta <span>{products.length}</span>
          </button>
          {categories.map((value) => (
            <button
              key={value}
              className={category === value ? 'active' : ''}
              onClick={() => setCategory(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <Notice error={task.error} />
      {!filtered.length ? (
        <section className="panel">
          <Empty
            icon={UtensilsCrossed}
            title="Tu carta está por abrir"
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  setEditing({
                    name: '',
                    description: '',
                    category: '',
                    priceCents: 0,
                    available: true,
                  })
                }
              >
                Agregar primer producto
              </Button>
            }
          >
            Crea tus categorías y añade los productos que servirás. Tú decides qué está disponible.
          </Empty>
        </section>
      ) : (
        <div className="product-grid">
          {filtered.map((product) => (
            <article
              className={'product-card panel ' + (!product.available ? 'unavailable' : '')}
              key={product.id}
            >
              <div className="product-art">
                <UtensilsCrossed size={32} strokeWidth={1.2} />
                <span>{product.category}</span>
              </div>
              <div className="product-content">
                <div className="product-title">
                  <h3>{product.name}</h3>
                  <strong>{money(product.priceCents, currency)}</strong>
                </div>
                <p>{product.description || 'Sin descripción.'}</p>
                <footer>
                  <button
                    className={'availability ' + (product.available ? 'on' : '')}
                    onClick={() =>
                      task.perform(async () => {
                        await api('/workspace/products/' + product.id, {
                          method: 'PUT',
                          body: { ...product, available: !product.available },
                        });
                        await reload();
                      })
                    }
                  >
                    <i />
                    {product.available ? 'Disponible' : 'No disponible'}
                  </button>
                  <div className="actions">
                    <button
                      className="icon-button"
                      aria-label={'Editar ' + product.name}
                      onClick={() => setEditing(product)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button danger-text"
                      aria-label={'Eliminar ' + product.name}
                      onClick={() => setDeleting(product)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </footer>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <ProductForm
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {deleting && (
        <Modal title="Eliminar producto" onClose={() => setDeleting(null)}>
          <div className="stack">
            <Notice error={task.error} />
            <p>
              ¿Eliminar <strong>{deleting.name}</strong> de la carta? Los pedidos anteriores
              conservarán sus datos.
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Volver
              </Button>
              <Button
                variant="danger"
                busy={task.busy}
                onClick={() =>
                  task.perform(async () => {
                    await api('/workspace/products/' + deleting.id, { method: 'DELETE' });
                    setDeleting(null);
                    await reload();
                  })
                }
              >
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function ProductForm({ product, onClose, onSaved }) {
  const task = useTask();
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get('name'),
      description: form.get('description'),
      category: form.get('category'),
      priceCents: Math.round(Number(form.get('price')) * 100),
      available: form.get('available') === 'on',
    };
    task.perform(async () => {
      await api('/workspace/products' + (product.id ? '/' + product.id : ''), {
        method: product.id ? 'PUT' : 'POST',
        body,
      });
      await onSaved();
    });
  }
  return (
    <Modal title={product.id ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Notice error={task.error} />
        <Field label="Nombre" name="name" defaultValue={product.name} required maxLength={120} />
        <div className="form-grid">
          <Field
            label="Categoría"
            name="category"
            defaultValue={product.category}
            required
            maxLength={80}
          />
          <Field
            label="Precio"
            name="price"
            type="number"
            min="0"
            max="10000"
            step="0.01"
            defaultValue={product.id ? product.priceCents / 100 : ''}
            required
          />
        </div>
        <Field label="Descripción">
          <textarea
            name="description"
            defaultValue={product.description}
            maxLength={1000}
            rows={3}
          />
        </Field>
        <label className="checkbox">
          <input type="checkbox" name="available" defaultChecked={product.available} /> Disponible
          en la carta
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button busy={task.busy}>Guardar producto</Button>
        </div>
      </form>
    </Modal>
  );
}
function Tables({ tables, reload }) {
  const [editing, setEditing] = useState(null);
  const [link, setLink] = useState('');
  const task = useTask();
  function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    task.perform(async () => {
      if (editing.id) {
        await api('/workspace/tables/' + editing.id, {
          method: 'PUT',
          body: { name: form.get('name'), active: form.get('active') === 'on' },
        });
      } else {
        const result = await api('/workspace/tables', {
          method: 'POST',
          body: { name: form.get('name') },
        });
        setLink(result.url);
      }
      setEditing(null);
      await reload();
    });
  }
  return (
    <>
      <Heading
        eyebrow="UN CÓDIGO, UNA BUENA EXPERIENCIA"
        title="Mesas y códigos QR"
        description="Cada mesa tiene su propia puerta a la carta."
        action={
          <Button onClick={() => setEditing({ name: '', active: true })}>
            <Plus size={17} /> Nueva mesa
          </Button>
        }
      />
      <Notice error={task.error} />
      <div className="info-strip">
        <QrCode size={20} />
        <p>
          Crea una mesa, guarda su enlace y descarga el QR. Renovar el código invalida el anterior.
        </p>
      </div>
      {tables.length ? (
        <div className="tables-grid">
          {tables.map((table) => (
            <article className="table-card panel" key={table.id}>
              <div className="table-card-top">
                <span className="table-icon">
                  <LayoutGrid size={25} />
                </span>
                <span className={'badge ' + (table.active ? 'ready' : 'cancelled')}>
                  {table.active ? 'Activa' : 'Pausada'}
                </span>
              </div>
              <h2>{table.name}</h2>
              <p>
                {table.active
                  ? 'Lista para recibir pedidos'
                  : 'La carta no acepta pedidos en esta mesa'}
              </p>
              <div className="actions">
                <Button variant="secondary" onClick={() => setEditing(table)}>
                  <Pencil size={15} /> Editar
                </Button>
                <Button
                  busy={task.busy}
                  onClick={() =>
                    task.perform(async () => {
                      const result = await api('/workspace/tables/' + table.id + '/link', {
                        method: 'POST',
                        body: {},
                      });
                      setLink(result.url);
                    })
                  }
                >
                  <QrCode size={16} /> Generar QR
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            icon={LayoutGrid}
            title="Pon la primera mesa"
            action={
              <Button variant="secondary" onClick={() => setEditing({ name: '', active: true })}>
                Crear una mesa
              </Button>
            }
          >
            Cada QR llevará al cliente a tu carta y asociará su pedido a la mesa correcta.
          </Empty>
        </section>
      )}
      {editing && (
        <Modal title={editing.id ? 'Editar mesa' : 'Nueva mesa'} onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={save}>
            <Notice error={task.error} />
            <Field
              label="Nombre de la mesa"
              name="name"
              defaultValue={editing.name}
              maxLength={80}
              required
            />
            {editing.id && (
              <label className="checkbox">
                <input type="checkbox" name="active" defaultChecked={editing.active} /> Aceptar
                pedidos
              </label>
            )}
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button busy={task.busy}>Guardar mesa</Button>
            </div>
          </form>
        </Modal>
      )}
      {link && <QrModal url={link} onClose={() => setLink('')} />}
    </>
  );
}
function QrModal({ url, onClose }) {
  const [image, setImage] = useState('');
  const task = useTask();
  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 640,
      margin: 3,
      color: { dark: '#272c28', light: '#ffffff' },
    }).then(setImage);
  }, [url]);
  return (
    <Modal title="La carta, a un escaneo" onClose={onClose}>
      <div className="qr-content stack">
        {image && <img src={image} alt="Código QR de la carta de esta mesa" />}
        <p className="muted small">
          Guarda este enlace antes de cerrar. Para usarlo fuera de este equipo, configura APP_URL
          con la dirección de tu servidor.
        </p>
        <a className="share-link" href={url} target="_blank" rel="noreferrer">
          {url}
          <ExternalLink size={15} />
        </a>
        <Notice error={task.error} success={task.success} />
        <div className="actions">
          <Button
            variant="secondary"
            onClick={() =>
              task.perform(() => navigator.clipboard.writeText(url), 'Enlace copiado.')
            }
          >
            <Copy size={16} /> Copiar
          </Button>
          {image && (
            <a className="button primary" href={image} download="mesa-qr.png">
              <Download size={16} /> Descargar QR
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
function Tracking({ token }) {
  const { data, error, reload } = useData('/order/' + token);
  useEffect(() => {
    const timer = setInterval(() => reload().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [reload]);
  const order = data?.order;
  return (
    <div className="tracking-page">
      <header>
        <Brand />
        <span className="eyebrow">TU PEDIDO, PASO A PASO</span>
      </header>
      <Notice error={error} />
      {order ? (
        <section className="tracking-card panel">
          <span className="tracking-icon">
            <ChefHat size={38} />
          </span>
          <span className="eyebrow">
            {order.tableName} · {ticketNumber(order.number)}
          </span>
          <h1>
            {order.status === 'new'
              ? 'Ya recibimos tu pedido.'
              : order.status === 'preparing'
                ? 'Algo bueno se está preparando.'
                : order.status === 'ready'
                  ? 'Tu pedido está listo.'
                  : order.status === 'served'
                    ? 'Buen provecho.'
                    : 'El pedido fue cancelado.'}
          </h1>
          <p>
            Hola, {order.customerName}.{' '}
            {order.status === 'cancelled'
              ? 'Consulta con el equipo del restaurante.'
              : 'Gracias por sentarte a nuestra mesa.'}
          </p>
          <div className="tracking-steps">
            {['new', 'preparing', 'ready', 'served'].map((status, index) => (
              <div
                key={status}
                className={
                  ['new', 'preparing', 'ready', 'served'].indexOf(order.status) >= index
                    ? 'complete'
                    : ''
                }
              >
                <span>{index + 1}</span>
                <small>{statusLabels[status]}</small>
              </div>
            ))}
          </div>
          <ul className="tracking-items">
            {order.items.map((item) => (
              <li key={item.productId}>
                <span>
                  {item.quantity}× {item.name}
                </span>
                <strong>{money(item.priceCents * item.quantity, order.currency)}</strong>
              </li>
            ))}
          </ul>
          <div className="ticket-total">
            <span>Total</span>
            <strong>{money(order.totalCents, order.currency)}</strong>
          </div>
          <p className="muted small">
            La pantalla se actualiza cada 5 segundos. Guarda este enlace para volver a consultar tu
            pedido.
          </p>
        </section>
      ) : (
        !error && <div className="loading-inline">Buscando tu pedido…</div>
      )}
    </div>
  );
}
