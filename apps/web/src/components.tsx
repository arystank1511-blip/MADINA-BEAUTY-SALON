import { ReactNode, useEffect, useRef } from 'react';
import { ArrowUpRight, ArrowRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, Config, Service, byCategory, price, whatsappLink } from './api';
import { useT } from './i18n';
export const Arrow = () => <ArrowRight aria-hidden="true" size={18} />;
export function ButtonLink({
  to,
  children,
  secondary = false,
}: {
  to: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={`button ${secondary ? 'secondary' : ''}`} to={to}>
      {children}
      <Arrow />
    </Link>
  );
}
export function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="wa-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0 0 12.04 2Zm0 18.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.24 8.24 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.25 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23a7.46 7.46 0 0 1-1.38-1.72c-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}
/** Opens the salon chat in WhatsApp. Used as the only way for guests to book. */
export function WhatsAppLink({
  config,
  text,
  children,
  className = 'button whatsapp',
  onClick,
}: {
  config: Config;
  text?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      className={className}
      href={whatsappLink(config, text)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
    >
      <WhatsAppIcon />
      {children}
    </a>
  );
}
export function WhatsAppFloat({ config }: { config: Config }) {
  const { t } = useT();
  return (
    <a
      className="whatsapp-float"
      href={whatsappLink(
        config,
        t('Здравствуйте! Хочу записаться в салон «{name}».', { name: config.name }),
      )}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('Написать в WhatsApp')}
    >
      <WhatsAppIcon size={28} />
    </a>
  );
}
export function Loading() {
  const { t } = useT();
  return (
    <div className="skeletons" role="status" aria-label={t('Загрузка')}>
      <span />
      <span />
      <span />
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useT();
  return (
    <div className="error" role="alert">
      <p>{error instanceof Error ? t(error.message) : t('Не удалось загрузить данные.')}</p>
      {error instanceof ApiError && error.conflicts.length > 0 && (
        <ul>
          {error.conflicts.map((a) => (
            <li key={a.id}>
              {a.customer.name}: {a.serviceName} · {a.startsAt}
            </li>
          ))}
        </ul>
      )}
      {retry && (
        <button type="button" className="text-button" onClick={retry}>
          {t('Повторить загрузку')} <Arrow />
        </button>
      )}
    </div>
  );
}
export function Section({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section className="split-section reveal" id={id}>
      <div className="section-label">
        <span className="tiny-cross">+</span>
        {label}
      </div>
      <div className="section-content">{children}</div>
    </section>
  );
}
export function ServiceRows({ services, config }: { services: Service[]; config: Config }) {
  const { t, lang } = useT();
  return (
    <div className="service-rows">
      {byCategory(services).map((group) => (
        <div className="service-group" key={group.category}>
          {group.category && <h3 className="service-group-title">{t(group.category)}</h3>}
          {group.items.map((s, i) => (
            <Link className="service-row" key={s.id} to={`/book?service=${s.id}&step=2`}>
              <span className="row-number">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{t(s.name)}</h3>
                {s.description && <p>{t(s.description)}</p>}
              </div>
              <div className="service-price">
                <strong>{price(s, config.currency, lang)}</strong>
                <span>{t('{n} мин', { n: s.durationMinutes })}</span>
              </div>
              <span className="row-arrow" aria-label={t('Выбрать')}>
                <ArrowUpRight aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
export function Halftone({ id }: { id: string }) {
  return (
    <svg
      className="halftone"
      viewBox="0 0 1400 680"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id={`dots-${id}`} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.3" fill="#E60012" />
        </pattern>
        <mask id={`wave-${id}`}>
          <rect width="1400" height="680" fill="black" />
          <path
            d="M 590 -150 C 400 180, 1330 250, 980 840"
            fill="none"
            stroke="white"
            strokeWidth="220"
          />
          <path
            d="M 1030 -140 C 700 170, 1680 300, 1350 850"
            fill="none"
            stroke="white"
            strokeWidth="110"
          />
        </mask>
        <linearGradient id={`fade-${id}`}>
          <stop stopColor="#050505" />
          <stop offset=".5" stopColor="#050505" stopOpacity=".05" />
        </linearGradient>
      </defs>
      <rect width="1400" height="680" fill={`url(#dots-${id})`} mask={`url(#wave-${id})`} />
      <rect width="1400" height="680" fill={`url(#fade-${id})`} />
    </svg>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      // Also undo showModal during StrictMode's effect replay before capturing focus again.
      dialog?.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Keep React in control: callers may refuse to close while a mutation is pending.
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-top">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label={t('Закрыть')} onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
