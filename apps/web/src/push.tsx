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
const sameKey = (s: PushSubscription, key: Uint8Array) => {
  const own = s.options.applicationServerKey;
  if (!own) return true;
  const bytes = new Uint8Array(own);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
};
/**
 * This device's subscription for the salon's current key. A subscription made with another key
 * (an old one, or from a test copy of the site) looks «on» but never receives anything,
 * so it is replaced; `renew` replaces it anyway.
 */
async function subscribeHere(renew = false) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('/push/key');
  const key = keyBytes(publicKey);
  let s = await registration.pushManager.getSubscription();
  if (s && (renew || !sameKey(s, key))) {
    await s.unsubscribe().catch(() => undefined);
    s = null;
  }
  s ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  await save(s);
  return s;
}
interface TestResult {
  sent: number;
  devices: number;
  here?: 'sent' | 'failed' | 'missing';
  status?: number;
}
const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

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
  const [tested, setTested] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (!supported()) return setState(needsInstall() ? 'install' : 'unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    void navigator.serviceWorker
      .register('/sw.js')
      .then((r) => r.pushManager.getSubscription())
      .then(async (s) => {
        // Keep the server in step with this browser (e.g. after a new login or a new key).
        if (s && Notification.permission === 'granted')
          await subscribeHere().catch(() => undefined);
        setState(s ? 'on' : 'off');
      })
      .catch(() => setState('unsupported'));
  }, []);
  async function enable() {
    setBusy(true);
    setError('');
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setState('denied');
      await subscribeHere();
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
    setTested(null);
    setError('');
    setTesting(true);
    try {
      if (Notification.permission !== 'granted') return setState('denied');
      const run = async (renew: boolean) => {
        const s = await subscribeHere(renew);
        return send<TestResult>('/push/test', 'POST', { endpoint: s.endpoint });
      };
      let result = await run(false);
      // The push service refused this phone, or the server forgot it: subscribe anew and retry.
      if (result.here !== 'sent') result = await run(true);
      setTested(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось отправить проверку.');
    } finally {
      setTesting(false);
    }
  }
  if (state === 'loading' || state === 'unsupported') return null;
  return (
    <section className={`md-notify ${state}`}>
      {state === 'on' ? (
        <>
          <p>🔔 Уведомления включены: новые заявки и записи через час придут на этот телефон.</p>
          <div className="md-notify-actions">
            <button className="md-btn ghost" disabled={testing} onClick={() => void test()}>
              {testing ? 'Проверяем…' : 'Проверить'}
            </button>
            <button className="md-btn ghost" disabled={busy} onClick={() => void disable()}>
              Выключить
            </button>
          </div>
          {tested?.here === 'sent' ? (
            <div className="md-notify-help">
              <p className="price-saved">
                Отправили на этот телефон
                {tested.devices > 1 ? ` (и ещё на ${tested.devices - 1})` : ''}. Уведомление придёт
                через пару секунд.
              </p>
              <p>Не пришло за 10 секунд? Значит, его прячет сам телефон:</p>
              {isIphone() ? (
                <ul>
                  <li>Сайт открыт с иконки «Мой день» на экране «Домой», а не в Safari.</li>
                  <li>
                    Настройки → Уведомления → «Мой день» → «Допуск уведомлений» включён, стиль —
                    «Баннеры».
                  </li>
                  <li>Выключен режим «Не беспокоить» или «Фокусирование».</li>
                </ul>
              ) : (
                <ul>
                  <li>
                    Настройки → Приложения → Chrome (или ваш браузер) → Уведомления: включены, и для
                    сайта тоже.
                  </li>
                  <li>Выключен режим «Не беспокоить».</li>
                  <li>
                    Настройки → Батарея: для браузера снято ограничение (на Xiaomi, Redmi, Huawei,
                    Samsung — «Без ограничений» и «Автозапуск»).
                  </li>
                  <li>Лучше всего уведомления работают в Google Chrome.</li>
                </ul>
              )}
            </div>
          ) : tested ? (
            <p className="field-error">
              Сервер не смог доставить уведомление на этот телефон
              {tested.status ? ` (ошибка ${tested.status})` : ''}. Нажмите «Выключить», затем
              «Включить уведомления» и проверьте ещё раз.
            </p>
          ) : null}
          {error && <p className="field-error">{error}</p>}
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
