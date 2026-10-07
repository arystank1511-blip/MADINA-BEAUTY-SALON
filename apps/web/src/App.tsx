import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Menu, X } from 'lucide-react';
import { Config, phoneLabel, send, useConfig, useMe } from './api';
import {
  Arrow,
  ButtonLink,
  ErrorBox,
  Halftone,
  Loading,
  WhatsAppFloat,
  WhatsAppIcon,
} from './components';
import { Home, Catalog } from './pages/Home';
import { Auth } from './pages/Auth';
import { Book } from './pages/Book';
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
function Gate({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorBox error={me.error} retry={() => void me.refetch()} />;
  if (!me.data)
    return (
      <Navigate
        to={'/login?returnTo=' + encodeURIComponent(location.pathname + location.search)}
        replace
      />
    );
  if (admin && me.data.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
}
export function App() {
  const settings = useConfig(),
    me = useMe(),
    client = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const location = useLocation();
  useEffect(() => {
    setMenu(false);
    if (location.hash) {
      setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 100);
    } else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('.reveal:not(.visible)');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [location.pathname, settings.data]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        document.querySelector<HTMLButtonElement>('.menu-button')?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menu]);
  useEffect(() => {
    if (settings.data) document.title = `${settings.data.name} · Салон красоты`;
  }, [settings.data]);
  if (settings.isPending)
    return (
      <div className="container">
        <Loading />
      </div>
    );
  if (settings.error || !settings.data)
    return (
      <div className="container">
        <ErrorBox error={settings.error} retry={() => void settings.refetch()} />
      </div>
    );
  const config = settings.data;
  async function logout() {
    try {
      await send('/auth/logout', 'POST');
      client.clear();
      window.location.assign('/');
    } catch (e) {
      setError(e);
    }
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <header>
        <div className="header-inner">
          <Link to="/" className="logo" aria-label={`${config.name}, главная`}>
            <img src="/images/madina-logo-header.svg" alt="" />
          </Link>
          <nav aria-label="Основная навигация" className={menu ? 'open' : ''}>
            <Link to="/services">Услуги</Link>
            <Link to="/#masters">Мастер</Link>
            <Link to="/#about">О салоне</Link>
            <Link to="/#contacts">Контакты</Link>
            {me.data?.role === 'ADMIN' && <Link to="/admin">Управление</Link>}
            {me.data && (
              <button className="nav-logout" onClick={() => void logout()}>
                Выйти
              </button>
            )}
          </nav>
          <ButtonLink to="/book">Записаться</ButtonLink>
          <button
            className="menu-button"
            aria-label={menu ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenu(false);
            }}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {error != null && <ErrorBox error={error} />}
      <main id="main" className="container">
        <Routes>
          <Route path="/" element={<Home config={config} />} />
          <Route path="/services" element={<Catalog config={config} />} />
          <Route path="/book" element={<Book config={config} />} />
          <Route path="/login" element={<Auth config={config} />} />
          <Route path="/register" element={<Navigate to="/book" replace />} />
          <Route path="/my" element={<Navigate to="/book" replace />} />
          <Route
            path="/admin"
            element={
              <Gate admin>
                <Suspense fallback={<Loading />}>
                  <Admin config={config} />
                </Suspense>
              </Gate>
            }
          />
          <Route
            path="/admin/new"
            element={
              <Gate admin>
                <Book config={config} admin />
              </Gate>
            }
          />
          <Route path="*" element={<NotFound config={config} />} />
        </Routes>
      </main>
      <footer className="container">
        <div>
          <Link className="logo" to="/">
            <img src="/images/madina-logo-header.svg" alt={config.name} />
          </Link>
          <p>Салон красоты «{config.name}».</p>
        </div>
        <div className="footer-links">
          <Link to="/services">Услуги</Link>
          <Link to="/#masters">Мастер</Link>
          <Link to="/book">
            Записаться <Arrow />
          </Link>
          <a href={`https://wa.me/${config.whatsapp}`} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={16} /> {phoneLabel(config.whatsapp)}
          </a>
        </div>
        {config.demo && (
          <p className="demo-note">
            Демонстрационный режим. Адрес, контакты, график, услуги и цены уточняйте в салоне.
          </p>
        )}
      </footer>
      {!location.pathname.startsWith('/admin') && <WhatsAppFloat config={config} />}
    </>
  );
}
function NotFound({ config }: { config: Config }) {
  return (
    <section className="not-found">
      <Halftone id="404" />
      <div>
        <p className="error-number">404</p>
        <h1>Страница не найдена</h1>
        <p>Вернёмся на главную салона.</p>
        <ButtonLink to="/">На главную {config.name}</ButtonLink>
      </div>
    </section>
  );
}
