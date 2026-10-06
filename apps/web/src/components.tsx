import { ReactNode, useEffect, useRef } from 'react';
import { ArrowUpRight, ArrowRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, Config, Service, money } from './api';
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
export function Loading() {
  return (
    <div className="skeletons" role="status" aria-label="Загрузка">
      <span />
      <span />
      <span />
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error" role="alert">
      <p>{error instanceof Error ? error.message : 'Не удалось загрузить данные.'}</p>
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
          Повторить загрузку <Arrow />
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
    <section className="split-section" id={id}>
      <div className="section-label">
        <span className="tiny-cross">+</span>
        {label}
      </div>
      <div className="section-content">{children}</div>
    </section>
  );
}
export function ServiceRows({ services, config }: { services: Service[]; config: Config }) {
  return (
    <div className="service-rows">
      {services.map((s, i) => (
        <Link className="service-row" key={s.id} to={`/book?service=${s.id}&step=2`}>
          <span className="row-number">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3>{s.name}</h3>
            <p>{s.description}</p>
          </div>
          <div className="service-price">
            <strong>{money(s.priceMinor, config.currency)}</strong>
            <span>{s.durationMinutes} мин</span>
          </div>
          <span className="row-arrow" aria-label="Выбрать">
            <ArrowUpRight aria-hidden="true" />
          </span>
        </Link>
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
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
