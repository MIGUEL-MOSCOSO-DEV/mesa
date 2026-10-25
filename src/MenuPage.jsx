import React, { useState } from 'react';
import { Plus, Minus, ShoppingBag, ArrowRight, UtensilsCrossed, Check } from 'lucide-react';
import { api } from './api.js';
import { useData, useTask, Brand, Button, Field, Modal, Notice, Empty, money } from './ui.jsx';
export default function MenuPage({ token }) {
  const { data, error } = useData('/menu/' + token);
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState({});
  const [checkout, setCheckout] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const task = useTask();
  const products = data?.products || [];
  const categories = [...new Set(products.map((product) => product.category))];
  const selected = products.filter((product) => cart[product.id] > 0);
  const total = selected.reduce((sum, product) => sum + product.priceCents * cart[product.id], 0);
  const count = selected.reduce((sum, product) => sum + cart[product.id], 0);
  function change(id, delta) {
    setCart((current) => ({
      ...current,
      [id]: Math.min(20, Math.max(0, (current[id] || 0) + delta)),
    }));
  }
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    task.perform(async () => {
      const result = await api('/menu/' + token + '/orders', {
        method: 'POST',
        body: {
          customerName: form.get('customerName'),
          note: form.get('note'),
          requestKey,
          items: selected.map((product) => ({ productId: product.id, quantity: cart[product.id] })),
        },
      });
      sessionStorage.setItem('mesa-order-' + token, result.trackingUrl);
      window.location.assign(result.trackingUrl);
    });
  }
  return (
    <div className="menu-page">
      <header className="menu-header">
        <Brand />
        {data && <span>{data.table.name}</span>}
      </header>
      <Notice error={error} />
      {data ? (
        <>
          <section className="menu-intro">
            <span className="eyebrow">UN BUEN MOMENTO EMPIEZA AQUÍ</span>
            <h1>{data.business.name}</h1>
            <p>
              Elige lo que te apetece.
              <br />
              Nosotros nos encargamos del resto.
            </p>
            <UtensilsCrossed className="menu-intro-icon" size={85} strokeWidth={1} />
          </section>
          <div className="filter-pills menu-filters">
            <button
              className={category === 'all' ? 'active' : ''}
              onClick={() => setCategory('all')}
            >
              Toda la carta
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
          {products.length ? (
            <div className="public-products">
              {products
                .filter((product) => category === 'all' || product.category === category)
                .map((product) => (
                  <article className="menu-product panel" key={product.id}>
                    <div>
                      <span className="eyebrow">{product.category}</span>
                      <h2>{product.name}</h2>
                      <p>{product.description}</p>
                      <strong>{money(product.priceCents, data.business.currency)}</strong>
                    </div>
                    <div className="quantity-control">
                      <button
                        aria-label={'Quitar ' + product.name}
                        disabled={!cart[product.id]}
                        onClick={() => change(product.id, -1)}
                      >
                        <Minus size={16} />
                      </button>
                      <span>{cart[product.id] || 0}</span>
                      <button
                        aria-label={'Agregar ' + product.name}
                        disabled={cart[product.id] >= 20}
                        onClick={() => change(product.id, 1)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          ) : (
            <Empty title="La carta estará lista pronto">
              El restaurante todavía no tiene productos disponibles.
            </Empty>
          )}
          {count > 0 && (
            <div className="cart-bar">
              <span>
                <ShoppingBag size={20} />
                <strong>{count}</strong> {count === 1 ? 'producto' : 'productos'}
              </span>
              <Button onClick={() => setCheckout(true)}>
                Revisar pedido · {money(total, data.business.currency)}
                <ArrowRight size={17} />
              </Button>
            </div>
          )}
          {checkout && (
            <Modal title="Tu pedido" onClose={() => setCheckout(false)}>
              <form onSubmit={submit} className="stack">
                <Notice error={task.error} />
                <ul className="tracking-items">
                  {selected.map((product) => (
                    <li key={product.id}>
                      <span>
                        {cart[product.id]}× {product.name}
                      </span>
                      <strong>
                        {money(product.priceCents * cart[product.id], data.business.currency)}
                      </strong>
                    </li>
                  ))}
                </ul>
                <Field
                  label="Tu nombre"
                  name="customerName"
                  required
                  minLength={2}
                  maxLength={100}
                />
                <Field
                  label="Notas para cocina"
                  hint="Si tienes alergias, consulta también con el personal del restaurante."
                >
                  <textarea name="note" maxLength={1000} rows={3} />
                </Field>
                <div className="ticket-total">
                  <span>Total</span>
                  <strong>{money(total, data.business.currency)}</strong>
                </div>
                <Button busy={task.busy} disabled={!count}>
                  <Check size={17} /> Enviar pedido
                </Button>
                <p className="muted small">
                  El pedido se envía al restaurante. El pago se coordina directamente con su equipo.
                </p>
              </form>
            </Modal>
          )}
        </>
      ) : (
        !error && <div className="loading-inline">Abriendo la carta…</div>
      )}
      <footer className="public-foot">Mesa · Cada mesa, bien atendida.</footer>
    </div>
  );
}
