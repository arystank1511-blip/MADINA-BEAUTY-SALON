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
import { LangSwitch, useT } from './i18n';
// Booking and login load on demand, so the home page ships less JavaScript.
const Book = lazy(() => import('./pages/Book').then((m) => ({ default: m.Book })));
const Auth = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Auth })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const MasterDay = lazy(() => import('./pages/MasterDay').then((m) => ({ default: m.MasterDay })));
/** `admin`: owner only; `staff`: owner or master («Мой день»). */
function Gate({
  children,
  admin = false,
  staff = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
  staff?: boolean;
}) {
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
  const role = me.data.role;
  if (staff && role !== 'ADMIN' && role !== 'MASTER') return <Navigate to="/" replace />;
  if (admin && role !== 'ADMIN')
    return <Navigate to={role === 'MASTER' ? '/master' : '/'} replace />;
  return children;
}
export function App() {
  const settings = useConfig(),
    me = useMe(),
    client = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const location = useLocation();
  const { t } = useT();
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
    if (settings.data)
      document.title = t('{name} · Парикмахерская в Зеренде', { name: settings.data.name });
  }, [settings.data, t]);
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
        {t('Перейти к содержимому')}
      </a>
      <header>
        <div className="header-inner">
          <Link to="/" className="logo" aria-label={t('{name}, главная', { name: config.name })}>
            <img src="/images/madina-logo-header.svg" alt="" />
          </Link>
          <nav aria-label={t('Основная навигация')} className={menu ? 'open' : ''}>
            <Link to="/services">{t('Услуги')}</Link>
            <Link to="/#masters">{t('Мастер')}</Link>
            <Link to="/#about">{t('О салоне')}</Link>
            <Link to="/#contacts">{t('Контакты')}</Link>
            {(me.data?.role === 'ADMIN' || me.data?.role === 'MASTER') && (
              <Link to="/master">Мой день</Link>
            )}
            {me.data?.role === 'ADMIN' && <Link to="/admin">Управление</Link>}
            {me.data && (
              <button className="nav-logout" onClick={() => void logout()}>
                {t('Выйти')}
              </button>
            )}
            <LangSwitch className="in-menu" />
          </nav>
          <LangSwitch className="in-header" />
          <ButtonLink to="/book">{t('Записаться')}</ButtonLink>
          <button
            className="menu-button"
            aria-label={menu ? t('Закрыть меню') : t('Открыть меню')}
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
          <Route
            path="/book"
            element={
              <Suspense fallback={<Loading />}>
                <Book config={config} />
              </Suspense>
            }
          />
          <Route
            path="/login"
            element={
              <Suspense fallback={<Loading />}>
                <Auth config={config} />
              </Suspense>
            }
          />
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
            path="/master"
            element={
              <Gate staff>
                <Suspense fallback={<Loading />}>
                  <MasterDay config={config} />
                </Suspense>
              </Gate>
            }
          />
          <Route
            path="/admin/new"
            element={
              <Gate admin>
                <Suspense fallback={<Loading />}>
                  <Book config={config} admin />
                </Suspense>
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
          <p>
            {t('Парикмахерская «{name}».', { name: config.name })}
            <br />
            {t(config.address)}
          </p>
        </div>
        <div className="footer-links">
          <Link to="/services">{t('Услуги')}</Link>
          <Link to="/#masters">{t('Мастер')}</Link>
          <Link to="/book">
            {t('Записаться')} <Arrow />
          </Link>
          <a href={`https://wa.me/${config.whatsapp}`} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={16} /> {phoneLabel(config.whatsapp)}
          </a>
        </div>
      </footer>
      {!/^\/(admin|master)/.test(location.pathname) && <WhatsAppFloat config={config} />}
    </>
  );
}
function NotFound({ config }: { config: Config }) {
  const { t } = useT();
  return (
    <section className="not-found">
      <Halftone id="404" />
      <div>
        <p className="error-number">404</p>
        <h1>{t('Страница не найдена')}</h1>
        <p>{t('Вернёмся на главную салона.')}</p>
        <ButtonLink to="/">{t('На главную {name}', { name: config.name })}</ButtonLink>
      </div>
    </section>
  );
}
