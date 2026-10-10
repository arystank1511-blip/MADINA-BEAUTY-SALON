import { useEffect, useState } from 'react';
import { api, send } from './api';

type State = 'loading' | 'unsupported' | 'install' | 'off' | 'on' | 'denied';
const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhone shows web push only for a site added to the home screen. */
const needsInstall = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(navigator as Navigator & { standalone?: boolean }).standalone &&
  !matchMedia('(display-mode: standalone)').matches;
const keyBytes = (base64: string) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};
const save = (s: PushSubscription) => send('/push/subscribe', 'POST', s.toJSON());

/** «Мой день» as an app: the right manifest while on this page, so «install» opens /master. */
export function useMasterManifest() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const before = link.href;
    link.href = '/master.webmanifest';
    return () => {
      link.href = before;
    };
  }, []);
}

/** Turns push notifications on this device on and off. */
export function NotifyCard() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tested, setTested] = useState(false);
  useEffect(() => {
    if (!supported()) return setState(needsInstall() ? 'install' : 'unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    void navigator.serviceWorker
      .register('/sw.js')
      .then((r) => r.pushManager.getSubscription())
      .then(async (s) => {
        // Keep the server in step with this browser (e.g. after a new login).
        if (s) await save(s).catch(() => undefined);
        setState(s ? 'on' : 'off');
      })
      .catch(() => setState('unsupported'));
  }, []);
  async function enable() {
    setBusy(true);
    setError('');
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setState('denied');
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const { publicKey } = await api<{ publicKey: string }>('/push/key');
      const s =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      await save(s);
      setState('on');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось включить уведомления.');
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    const registration = await navigator.serviceWorker.getRegistration();
    const s = await registration?.pushManager.getSubscription();
    if (s) {
      await send('/push/unsubscribe', 'POST', { endpoint: s.endpoint }).catch(() => undefined);
      await s.unsubscribe();
    }
    setState('off');
    setBusy(false);
  }
  async function test() {
    setTested(false);
    await send('/push/test', 'POST');
    setTested(true);
  }
  if (state === 'loading' || state === 'unsupported') return null;
  return (
    <section className={`md-notify ${state}`}>
      {state === 'on' ? (
        <>
          <p>🔔 Уведомления включены: новые заявки и записи через час придут на этот телефон.</p>
          <div className="md-notify-actions">
            <button className="md-btn ghost" onClick={() => void test()}>
              Проверить
            </button>
            <button className="md-btn ghost" disabled={busy} onClick={() => void disable()}>
              Выключить
            </button>
          </div>
          {tested && (
            <p className="price-saved">Отправили — уведомление придёт через пару секунд.</p>
          )}
        </>
      ) : state === 'off' ? (
        <>
          <p>Чтобы не пропускать заявки с сайта, включите уведомления на этом телефоне.</p>
          <button className="md-btn yes big" disabled={busy} onClick={() => void enable()}>
            🔔 Включить уведомления
          </button>
          {error && <p className="field-error">{error}</p>}
        </>
      ) : state === 'install' ? (
        <p>
          🔔 Чтобы получать уведомления на iPhone, сначала добавьте «Мой день» на экран «Домой»:
          нажмите <strong>Поделиться</strong> → <strong>На экран «Домой»</strong>, откройте значок
          «Мой день» и включите уведомления там.
        </p>
      ) : (
        <p>
          🔕 Уведомления запрещены в настройках браузера. Откройте настройки сайта (значок замка
          рядом с адресом) → Уведомления → Разрешить, затем обновите страницу.
        </p>
      )}
    </section>
  );
}
