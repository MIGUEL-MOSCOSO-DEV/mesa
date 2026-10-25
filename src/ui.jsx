import React, { useState, useEffect, useId, useRef, useCallback } from 'react';
import { ArrowRight, LogOut, LoaderCircle, X, Check, Menu } from 'lucide-react';
import { api } from './api.js';
import { config } from './config.js';

export function Brand() {
  return (
    <a className="brand" href="/">
      <span className="brand-symbol">
        <config.Icon size={22} />
      </span>
      {config.name}
      <i>.</i>
    </a>
  );
}
export function Button({ children, busy, variant = 'primary', className = '', ...props }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={'button ' + variant + ' ' + className}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Field({ label, hint, children, ...props }) {
  const id = useId();
  const description = hint ? id + '-hint' : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ? (
        React.cloneElement(children, { id, 'aria-describedby': description })
      ) : (
        <input {...props} id={id} aria-describedby={description} />
      )}{' '}
      {hint && <small id={description}>{hint}</small>}
    </div>
  );
}
export function Notice({ error, success }) {
  return error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : success ? (
    <div className="notice success" role="status">
      <Check size={16} />
      {success}
    </div>
  ) : null;
}
export function Empty({ icon: Icon = config.Icon, title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-symbol">
        <Icon size={30} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '')}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function perform(task, message = '') {
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await task();
      setSuccess(message);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, success, perform };
}
export function useData(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!path) return;
    const result = await api(path);
    setData(result);
    setError('');
    return result;
  }, [path]);
  useEffect(() => {
    let active = true;
    setData(null);
    if (path)
      api(path)
        .then((result) => {
          if (active) {
            setData(result);
            setError('');
          }
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    return () => {
      active = false;
    };
  }, [path]);
  return { data, error, reload, setData };
}
export function money(cents, currency = 'USD') {
  return new Intl.NumberFormat('es', { style: 'currency', currency }).format(cents / 100);
}
export function dateLabel(value) {
  return value
    ? new Intl.DateTimeFormat('es', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value.slice(0, 10) + 'T00:00:00Z'))
    : 'Sin fecha';
}
export const today = () => new Date().toISOString().slice(0, 10);
export function Heading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Stat({ label, value, note, icon: Icon }) {
  return (
    <article className="stat">
      <div>
        <span>{label}</span>
        {Icon && <Icon size={18} />}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
export function Shell({ user, onUserChange, page, onPage, items, children, footer }) {
  const [menu, setMenu] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => {
      setNarrow(query.matches);
      if (!query.matches) setMenu(false);
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const task = useTask();
  return (
    <div className={'shell ' + config.slug}>
      {menu && (
        <button className="menu-overlay" aria-label="Cerrar menú" onClick={() => setMenu(false)} />
      )}
      <aside inert={narrow && !menu} className={'sidebar ' + (menu ? 'open' : '')}>
        <Brand />
        <span className="nav-label">{config.workspace}</span>
        <nav>
          {items.map(({ id, label, Icon, count }) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => {
                onPage(id);
                setMenu(false);
              }}
            >
              <Icon size={19} />
              {label}
              {count !== undefined && <span>{count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-message">
            <span>✦</span>
            <h3>{config.sidebarTitle}</h3>
            <p>{config.sidebarNote}</p>
          </div>
          <div className="account">
            <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{config.accountLabel}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              onClick={() =>
                task.perform(async () => {
                  await api('/auth/logout', { method: 'POST', body: {} });
                  onUserChange(null);
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>{config.workspace}</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{items.find((item) => item.id === page)?.label || config.name}</strong>
          </div>
          <span className="topbar-note">
            <i />
            {config.topbarNote}
          </span>
        </header>
        <main>
          <Notice error={task.error} />
          {children}
        </main>
        <footer className="app-footer">
          <span>{footer || config.footer}</span>
          <span>
            {config.name} <span>✦</span>
          </span>
        </footer>
      </div>
    </div>
  );
}

export function Session({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/auth/me')
      .then(({ user }) => setUser(user))
      .catch((error) => {
        if (error.message !== 'Inicia sesión para continuar.') setError(error.message);
      })
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="loading">
        <Brand />
        <LoaderCircle className="spin" size={23} />
      </div>
    );
  if (user) return children(user, setUser);
  return <Auth onLogin={setUser} initialError={error} />;
}
function Auth({ onLogin, initialError }) {
  const [register, setRegister] = useState(false);
  const task = useTask();
  function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    task.perform(async () => {
      const { user } = await api('/auth/' + (register ? 'register' : 'login'), {
        method: 'POST',
        body,
      });
      onLogin(user);
    });
  }
  return (
    <main className={'auth-screen ' + config.slug}>
      <section className="auth-story">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">{config.authEyebrow}</span>
          <h1>
            {config.authTitle}
            <em>{config.authAccent}</em>
          </h1>
          <p>{config.authDescription}</p>
          <div className="auth-features">
            {config.features.map((feature, index) => (
              <span key={feature}>
                <span>0{index + 1}</span>
                {feature}
              </span>
            ))}
          </div>
        </div>
        <span className="auth-foot">{config.footer}</span>
        <span className="auth-orbit" aria-hidden="true" />
      </section>
      <section className="auth-panel">
        <div className="auth-mobile">
          <Brand />
        </div>
        <div className="auth-form">
          <span className="eyebrow">{config.name.toUpperCase()} · TU ESPACIO</span>
          <h2>{register ? 'Un buen comienzo.' : 'Qué bueno verte.'}</h2>
          <p>
            {register
              ? 'Crea tu cuenta y empieza a tu manera.'
              : 'Todo listo para continuar donde lo dejaste.'}
          </p>
          <form className="stack" onSubmit={submit}>
            <Notice error={task.error || initialError} />
            {register && (
              <Field
                label="Tu nombre"
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            )}
            <Field
              label="Correo electrónico"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
            <Field
              label="Contraseña"
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
              hint={register ? 'Al menos 10 caracteres.' : undefined}
            />
            <Button busy={task.busy}>
              {register ? 'Crear mi cuenta' : 'Entrar a ' + config.name}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {register ? '¿Ya tienes cuenta?' : '¿Primera vez por aquí?'}{' '}
            <button onClick={() => setRegister(!register)}>
              {register ? 'Inicia sesión' : 'Crea tu cuenta'}
            </button>
          </p>
          <div className="auth-note">
            <Check size={14} /> Tus datos, en tu propio espacio.
          </div>
        </div>
      </section>
    </main>
  );
}

export function Profile({ user, onUserChange, labels = {} }) {
  const task = useTask();
  function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    task.perform(async () => {
      const { user: updated } = await api('/workspace/profile', { method: 'PUT', body });
      onUserChange(updated);
    }, 'Cambios guardados.');
  }
  return (
    <>
      <Heading
        eyebrow="A TU MANERA"
        title={labels.title || 'Tu espacio'}
        description="Los detalles que hacen tuyo este lugar."
      />
      <form className="panel padded stack profile-form" onSubmit={submit}>
        <Notice error={task.error} success={task.success} />
        <Field
          label="Tu nombre"
          name="name"
          defaultValue={user.name}
          required
          minLength={2}
          maxLength={100}
        />
        <Field
          label={labels.label || 'Nombre del espacio'}
          name="label"
          defaultValue={user.label}
          required
          maxLength={160}
        />
        <Field label="Moneda predeterminada">
          <select name="currency" defaultValue={user.currency}>
            {['USD', 'PEN', 'EUR', 'MXN', 'COP', 'CLP', 'ARS', 'GBP'].map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </Field>
        <p className="muted small">
          Sesión iniciada con {user.email}. Los documentos ya creados conservan su moneda original.
        </p>
        <Button busy={task.busy}>Guardar cambios</Button>
      </form>
    </>
  );
}
