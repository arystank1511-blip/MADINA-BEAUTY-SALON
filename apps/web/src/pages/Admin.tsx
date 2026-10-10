import { FormEvent, Fragment, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Temporal } from '@js-temporal/polyfill';
import { Check } from 'lucide-react';
import {
  addDays,
  api,
  Appointment,
  clientName,
  Config,
  dateLabel,
  Master,
  money,
  Page,
  send,
  Service,
  timeLabel,
  TimeOff,
  todayIn,
  useMasters,
  useServices,
  Window,
} from '../api';
import { ButtonLink, ErrorBox, Loading, Modal, WhatsAppIcon } from '../components';
import { intl, minutesUntil, Remind, Reminded } from '../remind';
import { methodNames, Paid, PaymentDialog } from '../payment';
export const statusNames = {
  PENDING: 'Ждёт подтверждения',
  CONFIRMED: 'Подтверждена',
  CANCELLED: 'Отменена',
  COMPLETED: 'Завершена',
  NO_SHOW: 'Не пришёл',
};
/** A site request nobody confirmed within the hold: its time is free again. */
const expired = (a: Appointment) =>
  a.status === 'PENDING' && !!a.holdUntil && Date.parse(a.holdUntil) <= Date.now();
const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const fd = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
export function Admin({ config }: { config: Config }) {
  const [tab, setTab] = useState('Записи');
  return (
    <section className="page admin-page">
      <div className="page-top">
        <div>
          <p className="eyebrow">УПРАВЛЕНИЕ / {config.name}</p>
          <h1>Рабочее пространство.</h1>
        </div>
        <div className="admin-toolbar-actions">
          <ButtonLink to="/master">Мой день</ButtonLink>
        </div>
      </div>
      <nav className="tabs" aria-label="Разделы управления">
        {[
          'Записи',
          'Статистика',
          'Напоминания',
          'Возврат клиентов',
          'WhatsApp',
          'Услуги',
          'Мастера',
          'Расписание',
          'Пароль',
        ].map((t) => (
          <button
            key={t}
            aria-current={tab === t ? 'page' : undefined}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === 'Записи' ? (
        <Appointments config={config} />
      ) : tab === 'Статистика' ? (
        <Statistics config={config} />
      ) : tab === 'Напоминания' ? (
        <Reminders config={config} />
      ) : tab === 'Возврат клиентов' ? (
        <Growth config={config} />
      ) : tab === 'WhatsApp' ? (
        <WhatsAppApi config={config} />
      ) : tab === 'Услуги' ? (
        <Services config={config} />
      ) : tab === 'Мастера' ? (
        <Masters />
      ) : tab === 'Пароль' ? (
        <Password />
      ) : (
        <Schedule config={config} />
      )}
    </section>
  );
}
function Appointments({ config }: { config: Config }) {
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState({ from: '', to: '', masterId: '', status: '' }),
    [action, setAction] = useState<{
      appointment: Appointment;
      type: 'cancel' | 'complete' | 'no-show' | 'confirm';
    } | null>(null);
  const [paying, setPaying] = useState<Appointment | null>(null);
  const client = useQueryClient(),
    masters = useMasters(true);
  const queryString = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)),
  }).toString();
  const q = useQuery({
    queryKey: ['appointments', 'admin', queryString],
    queryFn: () => api<Page<Appointment>>('/admin/appointments?' + queryString),
  });
  const mutation = useMutation({
    mutationFn: () =>
      send(`/admin/appointments/${action!.appointment.id}/${action!.type}`, 'PATCH'),
    onSuccess: () => {
      setAction(null);
      for (const key of ['appointments', 'availability', 'day', 'pending', 'reminders'])
        void client.invalidateQueries({ queryKey: [key] });
    },
  });
  const change = (key: string, value: string) => {
    setPage(1);
    setFilter({ ...filter, [key]: value });
  };
  return (
    <>
      <div className="filters">
        <label>
          С даты
          <input type="date" value={filter.from} onChange={(e) => change('from', e.target.value)} />
        </label>
        <label>
          По дату
          <input type="date" value={filter.to} onChange={(e) => change('to', e.target.value)} />
        </label>
        <label>
          Мастер
          <select value={filter.masterId} onChange={(e) => change('masterId', e.target.value)}>
            <option value="">Все мастера</option>
            {masters.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Статус
          <select value={filter.status} onChange={(e) => change('status', e.target.value)}>
            <option value="">Все статусы</option>
            {Object.entries(statusNames).map(([v, label]) => (
              <option value={v} key={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Клиент</th>
                  <th>Услуга / мастер</th>
                  <th>Стоимость</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.items.map((a, i) => (
                  <Fragment key={a.id}>
                    {(i === 0 ||
                      dateLabel(q.data.items[i - 1].startsAt, config.timezone) !==
                        dateLabel(a.startsAt, config.timezone)) && (
                      <tr className="date-row">
                        <th colSpan={6}>{dateLabel(a.startsAt, config.timezone)}</th>
                      </tr>
                    )}
                    <tr>
                      <td>
                        {timeLabel(a.startsAt, config.timezone)}
                        <small>{a.durationMinutes} мин</small>
                      </td>
                      <td>
                        {clientName(a)}
                        <small>{a.customer?.email || a.guestPhone}</small>
                      </td>
                      <td>
                        {a.serviceName}
                        <small>{a.master.name}</small>
                      </td>
                      <td>
                        {money(a.priceMinor, config.currency)}
                        <Paid a={a} config={config} />
                      </td>
                      <td>
                        {expired(a) ? (
                          <span className="badge cancelled">Истекла, не подтвердили</span>
                        ) : (
                          <span className={`badge ${a.status.toLowerCase()}`}>
                            {statusNames[a.status]}
                          </span>
                        )}
                        <Reminded a={a} config={config} />
                      </td>
                      <td>
                        {a.status === 'PENDING' && !expired(a) && (
                          <button
                            className="confirm-button"
                            onClick={() => {
                              mutation.reset();
                              setAction({ appointment: a, type: 'confirm' });
                            }}
                          >
                            Подтвердить
                          </button>
                        )}
                        {(a.status === 'CONFIRMED' || a.status === 'PENDING') &&
                          !expired(a) &&
                          new Date(a.startsAt) > new Date() && (
                            <button
                              onClick={() => {
                                mutation.reset();
                                setAction({ appointment: a, type: 'cancel' });
                              }}
                            >
                              Отменить
                            </button>
                          )}
                        {(a.status === 'CONFIRMED' || a.status === 'PENDING') &&
                          !expired(a) &&
                          new Date(a.startsAt) > new Date() && (
                            <Remind a={a} config={config} className="table-remind" />
                          )}
                        {(a.status === 'CONFIRMED' ||
                          (a.status === 'COMPLETED' &&
                            Date.now() - Date.parse(a.startsAt) < 7 * 86400000)) &&
                          new Date(a.startsAt) <= new Date() && (
                            <button
                              onClick={() => {
                                mutation.reset();
                                setAction({ appointment: a, type: 'no-show' });
                              }}
                            >
                              Не пришёл
                            </button>
                          )}
                        {(a.status === 'CONFIRMED' || a.status === 'COMPLETED') &&
                          new Date(a.startsAt) <= new Date() && (
                            <button onClick={() => setPaying(a)}>
                              {a.paidMinor === null ? 'Оплата' : 'Изменить оплату'}
                            </button>
                          )}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {!q.data?.items.length && <div className="empty">Записей по этим условиям нет.</div>}
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Назад
            </button>
            <span>
              {page} · Всего {q.data?.total}
            </span>
            <button
              disabled={!q.data || page * 20 >= q.data.total}
              onClick={() => setPage(page + 1)}
            >
              Далее
            </button>
          </div>
        </>
      )}
      {paying && <PaymentDialog a={paying} config={config} onClose={() => setPaying(null)} />}
      {action && (
        <Modal
          title={
            action.type === 'cancel'
              ? 'Отменить запись?'
              : action.type === 'no-show'
                ? 'Клиент не пришёл?'
                : action.type === 'confirm'
                  ? 'Подтвердить запись?'
                  : 'Завершить посещение?'
          }
          onClose={() => !mutation.isPending && setAction(null)}
        >
          <p>
            {clientName(action.appointment)} · {action.appointment.serviceName}
          </p>
          {mutation.error && <ErrorBox error={mutation.error} />}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={mutation.isPending}
              onClick={() => setAction(null)}
            >
              Назад
            </button>
            <button
              className="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Подтвердить
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
/** Visits in the next 24 hours: who still needs a reminder and who already got one. */
function Reminders({ config }: { config: Config }) {
  const q = useQuery({
    queryKey: ['reminders'],
    queryFn: () => api<Appointment[]>('/admin/reminders'),
    refetchInterval: 60000,
  });
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>Напоминания</h2>
          <p className="caption">
            За час до визита в Telegram приходит уведомление со ссылкой «Напомнить клиенту в
            WhatsApp». Здесь видно, кому уже напомнили, и можно напомнить вручную: нажмите
            «Напомнить» и в WhatsApp — «Отправить».
          </p>
        </div>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <div className="empty">В ближайшие 24 часа записей нет.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Клиент</th>
                <th>Услуга</th>
                <th>Напоминание</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => {
                const left = minutesUntil(a.startsAt);
                return (
                  <tr key={a.id} className={left !== null && left <= 60 ? 'soon-row' : ''}>
                    <td>
                      {timeLabel(a.startsAt, config.timezone)}
                      <small>
                        {left !== null && left <= 60
                          ? `через ${left} мин`
                          : dateLabel(a.startsAt, config.timezone)}
                      </small>
                    </td>
                    <td>
                      {clientName(a)}
                      <small>{a.guestPhone || a.customer?.email || 'без телефона'}</small>
                    </td>
                    <td>
                      {a.serviceName}
                      {a.status === 'PENDING' && (
                        <small>
                          <span className="badge pending">{statusNames.PENDING}</span>
                        </small>
                      )}
                    </td>
                    <td>
                      {a.remindedAt ? (
                        <Reminded a={a} config={config} />
                      ) : (
                        <span className="caption">Ещё не напомнили</span>
                      )}
                      {a.waSentAt && (
                        <small className="wa-ok">WhatsApp: отправлено автоматически</small>
                      )}
                      {a.waError && !a.waSentAt && (
                        <small className="field-error">WhatsApp API: {a.waError}</small>
                      )}
                      {a.alertedAt && <small>Telegram: уведомление отправлено</small>}
                    </td>
                    <td>
                      {a.guestPhone ? (
                        <Remind a={a} config={config} className="table-remind" />
                      ) : (
                        <small>Нет телефона</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
interface StatsData {
  from: string;
  to: string;
  completed: number;
  noShows: number;
  cancelled: number;
  noShowRate: number;
  revenueMinor: number;
  averageMinor: number;
  cashMinor: number;
  kaspiMinor: number;
  unpaid: number;
  clients: number;
  newClients: number;
  days: { date: string; revenueMinor: number; visits: number }[];
  services: { name: string; visits: number; revenueMinor: number }[];
}
/** Salon numbers for a period: revenue by day, payments, services and clients. */
function Statistics({ config }: { config: Config }) {
  const today = todayIn(config.timezone);
  const monthStart = today.slice(0, 8) + '01';
  const lastMonthEnd = addDays(monthStart, -1);
  const presets = [
    { label: 'Сегодня', from: today, to: today },
    { label: '7 дней', from: addDays(today, -6), to: today },
    { label: 'Этот месяц', from: monthStart, to: today },
    { label: 'Прошлый месяц', from: lastMonthEnd.slice(0, 8) + '01', to: lastMonthEnd },
  ];
  const [range, setRange] = useState(presets[2]);
  const q = useQuery({
    queryKey: ['stats', range.from, range.to],
    queryFn: () => api<StatsData>(`/admin/stats?from=${range.from}&to=${range.to}`),
  });
  const m = (v: number) => money(v, config.currency);
  const s = q.data;
  const peak = s ? Math.max(...s.days.map((d) => d.revenueMinor), 1) : 1;
  const short = (date: string) =>
    new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(date + 'T12:00:00Z'),
    );
  return (
    <>
      <div className="filters stats-range">
        <div className="segmented" role="group" aria-label="Период">
          {presets.map((p) => (
            <button
              key={p.label}
              aria-pressed={range.from === p.from && range.to === p.to}
              onClick={() => setRange(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label>
          С даты
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) =>
              e.target.value && setRange({ ...range, label: '', from: e.target.value })
            }
          />
        </label>
        <label>
          По дату
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) =>
              e.target.value && setRange({ ...range, label: '', to: e.target.value })
            }
          />
        </label>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : (
        s && (
          <>
            <div className="stat-tiles">
              <div className="stat-tile">
                <span>Выручка</span>
                <strong>{m(s.revenueMinor)}</strong>
                {s.unpaid > 0 && (
                  <small>
                    {s.unpaid} {s.unpaid === 1 ? 'визит' : 'визитов'} без отметки оплаты — по прайсу
                  </small>
                )}
              </div>
              <div className="stat-tile">
                <span>Визитов</span>
                <strong>{s.completed}</strong>
                <small>Средний чек {m(s.averageMinor)}</small>
              </div>
              <div className="stat-tile">
                <span>Клиентов</span>
                <strong>{s.clients}</strong>
                <small>Новых: {s.newClients}</small>
              </div>
              <div className="stat-tile">
                <span>Не пришли</span>
                <strong>{s.noShows}</strong>
                <small>
                  {Math.round(s.noShowRate * 100)}% визитов · отмен: {s.cancelled}
                </small>
              </div>
            </div>
            <div className="stat-tiles two">
              <div className="stat-tile">
                <span>Наличные</span>
                <strong>{m(s.cashMinor)}</strong>
              </div>
              <div className="stat-tile">
                <span>{methodNames.KASPI}</span>
                <strong>{m(s.kaspiMinor)}</strong>
              </div>
            </div>
            {s.days.length > 1 && (
              <figure className="panel day-chart">
                <figcaption>Выручка по дням</figcaption>
                <div className="bars" role="list">
                  {s.days.map((d) => (
                    <div
                      key={d.date}
                      className="bar"
                      role="listitem"
                      tabIndex={0}
                      aria-label={`${short(d.date)}: ${m(d.revenueMinor)}, визитов ${d.visits}`}
                      data-tip={`${short(d.date)} · ${m(d.revenueMinor)} · визитов: ${d.visits}`}
                    >
                      <i style={{ height: `${(d.revenueMinor / peak) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="bars-axis">
                  <span>{short(s.days[0].date)}</span>
                  <span>{short(s.days[s.days.length - 1].date)}</span>
                </div>
              </figure>
            )}
            <h3>Услуги</h3>
            {!s.services.length ? (
              <div className="empty">За этот период завершённых визитов нет.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Услуга</th>
                      <th>Визитов</th>
                      <th>Выручка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.services.map((v) => (
                      <tr key={v.name}>
                        <td>{v.name}</td>
                        <td>{v.visits}</td>
                        <td>{m(v.revenueMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}
interface GrowthVisit {
  id: string;
  guestName: string | null;
  guestPhone: string;
  serviceName: string;
  startsAt: string;
  visits?: number;
  text: string;
}
interface GrowthData {
  settings: { reviewUrl: string; returnWeeks: number };
  reviews: GrowthVisit[];
  returns: GrowthVisit[];
}
/** WhatsApp link with a ready text; opening it marks the visit so it leaves the list. */
function SendWhatsApp({ v, mark, label }: { v: GrowthVisit; mark: string; label: string }) {
  const client = useQueryClient();
  const done = useMutation({
    mutationFn: () => send(`/admin/appointments/${v.id}/${mark}`, 'PATCH'),
    onSettled: () => void client.invalidateQueries({ queryKey: ['growth'] }),
  });
  const phone = intl(v.guestPhone);
  if (!phone) return <small>Неполный номер</small>;
  return (
    <a
      className="table-remind"
      href={`https://wa.me/${phone}?text=${encodeURIComponent(v.text)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => done.mutate()}
    >
      <WhatsAppIcon size={18} /> {label}
    </a>
  );
}
function GrowthList({
  title,
  caption,
  empty,
  items,
  mark,
  label,
  config,
}: {
  title: string;
  caption: string;
  empty: string;
  items: GrowthVisit[];
  mark: string;
  label: string;
  config: Config;
}) {
  return (
    <section className="growth-list">
      <h3>
        {title} <span className="count">{items.length}</span>
      </h3>
      <p className="caption">{caption}</p>
      {!items.length ? (
        <div className="empty">{empty}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.guestName || 'Клиент'}
                    <small>{v.guestPhone}</small>
                  </td>
                  <td>
                    {v.serviceName}
                    <small>
                      {dateLabel(v.startsAt, config.timezone)}
                      {v.visits && v.visits > 1 ? ` · визитов за год: ${v.visits}` : ''}
                    </small>
                  </td>
                  <td>
                    <SendWhatsApp v={v} mark={mark} label={label} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
/** Review requests after a visit and «пора подстричься» invitations. */
function Growth({ config }: { config: Config }) {
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const q = useQuery({ queryKey: ['growth'], queryFn: () => api<GrowthData>('/admin/growth') });
  const save = useMutation({
    mutationFn: (body: unknown) => send('/admin/growth', 'PUT', body),
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['growth'] });
    },
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const { settings, reviews, returns } = q.data;
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>Возврат клиентов</h2>
          <p className="caption">
            Нажмите кнопку — откроется WhatsApp клиента с готовым текстом, останется «Отправить».
            Клиент сразу уходит из списка. Если во вкладке «WhatsApp» указаны шаблоны отзыва и
            приглашения, сообщения уходят сами.
          </p>
        </div>
      </div>
      <GrowthList
        title="Попросить отзыв"
        caption="Визиты за последнюю неделю. Одного клиента просим не чаще раза в 3 месяца."
        empty="Сейчас некого просить об отзыве."
        items={reviews}
        mark="review-requested"
        label="Попросить отзыв"
        config={config}
      />
      <GrowthList
        title="Пора подстричься"
        caption={`Клиенты, у которых последний визит был ${settings.returnWeeks} недель назад или раньше и новой записи нет.`}
        empty="Сейчас некого приглашать — все записаны или были недавно."
        items={returns}
        mark="invited"
        label="Пригласить"
        config={config}
      />
      <form
        className="panel wa-form"
        key={JSON.stringify(settings)}
        onSubmit={(e) => {
          const f = fd(e);
          setSaved(false);
          save.mutate({
            reviewUrl: String(f.get('reviewUrl')).trim(),
            returnWeeks: Number(f.get('returnWeeks')),
          });
        }}
      >
        <h3>Настройки</h3>
        <label>
          Ссылка на отзывы (2GIS, Google)
          <input
            name="reviewUrl"
            type="url"
            required
            pattern="https://.*"
            defaultValue={settings.reviewUrl}
          />
        </label>
        <label>
          Приглашать снова через, недель
          <input
            name="returnWeeks"
            type="number"
            min="2"
            max="26"
            required
            defaultValue={settings.returnWeeks}
          />
        </label>
        {save.error && <ErrorBox error={save.error} />}
        {saved && (
          <p role="status" className="price-saved">
            Сохранено.
          </p>
        )}
        <button className="button" disabled={save.isPending}>
          Сохранить
        </button>
      </form>
    </>
  );
}
interface WhatsAppSettings {
  enabled: boolean;
  phoneNumberId: string;
  templateName: string;
  reviewTemplate: string;
  returnTemplate: string;
  language: string;
  tokenHint: string;
}
/** WhatsApp Business API: the salon's own Meta credentials for automatic client reminders. */
function WhatsAppApi({ config }: { config: Config }) {
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const q = useQuery({
    queryKey: ['whatsapp'],
    queryFn: () => api<WhatsAppSettings>('/admin/whatsapp'),
  });
  const save = useMutation({
    mutationFn: (body: unknown) => send<WhatsAppSettings>('/admin/whatsapp', 'PUT', body),
    onSuccess: (data) => {
      client.setQueryData(['whatsapp'], data);
      setSaved(true);
    },
  });
  const test = useMutation({
    mutationFn: (phone: string) =>
      send<{ ok: boolean; error?: string }>('/admin/whatsapp/test', 'POST', { phone }),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const f = fd(e);
    setSaved(false);
    save.mutate(
      {
        enabled: f.get('enabled') === 'on',
        phoneNumberId: String(f.get('phoneNumberId')).trim(),
        accessToken: String(f.get('accessToken')).trim(),
        templateName: String(f.get('templateName')).trim(),
        reviewTemplate: String(f.get('reviewTemplate')).trim(),
        returnTemplate: String(f.get('returnTemplate')).trim(),
        language: String(f.get('language')).trim() || 'ru',
      },
      {
        onSuccess: () => ((form.elements.namedItem('accessToken') as HTMLInputElement).value = ''),
      },
    );
  }
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const s = q.data;
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>WhatsApp Business API</h2>
          <p className="caption">
            Когда включено, за час до визита клиент сам получает напоминание в WhatsApp — нажимать
            ничего не нужно. Сообщения отправляются от вашего бизнес-номера через Meta по
            одобренному шаблону. Meta берёт плату за сообщения по своему тарифу.
          </p>
        </div>
        <span className={`badge ${s.enabled ? 'confirmed' : 'cancelled'}`}>
          {s.enabled ? 'Включено' : 'Выключено'}
        </span>
      </div>
      <form className="panel wa-form" onSubmit={submit} key={JSON.stringify(s)}>
        <label className="checkbox">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> Автоматически
          напоминать клиентам за час до визита
        </label>
        <label>
          Phone number ID
          <input
            name="phoneNumberId"
            inputMode="numeric"
            pattern="\d*"
            maxLength={30}
            placeholder="например 123456789012345"
            defaultValue={s.phoneNumberId}
          />
        </label>
        <label>
          Access token (постоянный)
          <input
            name="accessToken"
            type="password"
            autoComplete="off"
            maxLength={1000}
            placeholder={
              s.tokenHint ? `Сохранён (${s.tokenHint}). Оставьте пустым, чтобы не менять` : 'EAAG…'
            }
          />
        </label>
        <div className="form-grid">
          <label>
            Имя шаблона
            <input
              name="templateName"
              maxLength={512}
              pattern="[a-z0-9_]*"
              placeholder="reminder_1h"
              defaultValue={s.templateName}
            />
          </label>
          <label>
            Язык шаблона
            <input name="language" maxLength={6} placeholder="ru" defaultValue={s.language} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Шаблон «Отзыв» (необязательно)
            <input
              name="reviewTemplate"
              maxLength={512}
              pattern="[a-z0-9_]*"
              placeholder="review_request"
              defaultValue={s.reviewTemplate}
            />
          </label>
          <label>
            Шаблон «Пора подстричься» (необязательно)
            <input
              name="returnTemplate"
              maxLength={512}
              pattern="[a-z0-9_]*"
              placeholder="come_back"
              defaultValue={s.returnTemplate}
            />
          </label>
        </div>
        {save.error && <ErrorBox error={save.error} />}
        {saved && (
          <p role="status" className="price-saved">
            Настройки сохранены.
          </p>
        )}
        <button className="button" disabled={save.isPending}>
          {save.isPending ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>
      <form
        className="panel wa-form"
        onSubmit={(e) => {
          const f = fd(e);
          test.mutate(String(f.get('phone')));
        }}
      >
        <h3>Проверка</h3>
        <p className="caption">
          Сначала сохраните настройки. Пробное напоминание придёт на этот номер — так видно, что всё
          подключено правильно.
        </p>
        <label>
          Номер WhatsApp
          <input name="phone" type="tel" required minLength={10} placeholder="+7 777 123 45 67" />
        </label>
        {test.error && <ErrorBox error={test.error} />}
        {test.data &&
          (test.data.ok ? (
            <p role="status" className="price-saved">
              Отправлено. Проверьте WhatsApp на этом номере.
            </p>
          ) : (
            <p role="alert" className="field-error">
              Meta не отправила сообщение: {test.data.error}
            </p>
          ))}
        <button className="button secondary" disabled={test.isPending}>
          {test.isPending ? 'Отправляем…' : 'Отправить пробное сообщение'}
        </button>
      </form>
      <section className="panel wa-help">
        <h3>Как получить данные в Meta</h3>
        <ol>
          <li>
            Зайдите на <strong>developers.facebook.com</strong> → «Мои приложения» → «Создать
            приложение» → тип «Бизнес» → добавьте продукт <strong>WhatsApp</strong>. Привяжите
            бизнес-аккаунт Meta (business.facebook.com).
          </li>
          <li>
            WhatsApp → <strong>API Setup</strong>: добавьте номер салона (на нём не должен быть
            открыт обычный WhatsApp — номер переходит в API). Скопируйте{' '}
            <strong>Phone number ID</strong> сюда.
          </li>
          <li>
            Постоянный токен: business.facebook.com → Настройки компании → Пользователи →{' '}
            <strong>Системные пользователи</strong> → добавить (роль «Администратор») → «Назначить
            активы» (приложение и аккаунт WhatsApp) → «Создать токен» с разрешениями{' '}
            <code>whatsapp_business_messaging</code> и <code>whatsapp_business_management</code>,
            срок «Никогда». Вставьте токен сюда.
          </li>
          <li>
            WhatsApp Manager → <strong>Шаблоны сообщений</strong> → «Создать»: категория{' '}
            <strong>«Служебные» (Utility)</strong>, язык «Русский», имя например{' '}
            <code>reminder_1h</code>. Текст (переменные именно в таком порядке):
            <pre>
              {`Здравствуйте, {{1}}! Напоминаем, вы записаны {{2}} — {{3}}.
Салон «${config.name}», ${config.address}.
Если планы изменятся, напишите нам в ответ.`}
            </pre>
            {'{{1}}'} — имя клиента, {'{{2}}'} — «сегодня в 14:00», {'{{3}}'} — услуга. Дождитесь
            статуса «Активен» (обычно от минут до суток).
          </li>
          <li>
            По желанию ещё два шаблона (категория «Маркетинг»), для вкладки «Возврат клиентов»:
            <pre>
              {`review_request: Здравствуйте, {{1}}! Спасибо, что были у нас в «${config.name}». Будем рады вашему отзыву: {{2}}

come_back: Здравствуйте, {{1}}! Давно вас не видели в «${config.name}» — пора обновить стрижку? Записаться: {{2}}`}
            </pre>
            {'{{1}}'} — имя, {'{{2}}'} — ссылка (на отзывы или на запись).
          </li>
          <li>
            В разделе «Оплата» WhatsApp Manager добавьте карту — без неё Meta не отправляет
            сообщения клиентам.
          </li>
          <li>Сохраните настройки здесь, отправьте пробное сообщение и включите галочку.</li>
        </ol>
        <p className="caption">
          Токен хранится только в базе сайта и обратно в браузер не показывается. Если Meta откажет,
          причина появится во вкладке «Напоминания» и в уведомлении Telegram, а ссылка «Напомнить
          клиенту» там останется как запасной вариант.
        </p>
      </section>
    </>
  );
}
function Services({ config }: { config: Config }) {
  const query = useServices(true),
    client = useQueryClient();
  const [edit, setEdit] = useState<Service | null | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      send(edit ? `/admin/services/${edit.id}` : '/admin/services', edit ? 'PATCH' : 'POST', body),
    onSuccess: () => {
      setEdit(undefined);
      void client.invalidateQueries({ queryKey: ['services'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    const f = fd(e);
    mutation.mutate({
      category: String(f.get('category')).trim(),
      name: String(f.get('name')),
      description: String(f.get('description')),
      priceMinor: Math.round(Number(f.get('price')) * 100),
      priceFrom: f.get('priceFrom') === 'on',
      durationMinutes: Number(f.get('duration')),
      bufferAfterMinutes: Number(f.get('buffer')),
      isActive: f.get('active') === 'on',
    });
  }
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>Услуги и цены</h2>
          <p className="caption">
            Введите новую цену и нажмите «Сохранить» — на сайте она обновится сразу.
          </p>
        </div>
        <button
          className="button"
          onClick={() => {
            mutation.reset();
            setEdit(null);
          }}
        >
          Добавить услугу +
        </button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Зал</th>
                <th>Название</th>
                <th>Цена</th>
                <th>Время</th>
                <th>Буфер</th>
                <th>Активность</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data?.map((s) => (
                <tr key={s.id}>
                  <td>{s.category || '—'}</td>
                  <td>{s.name}</td>
                  <td>
                    <PriceEditor service={s} config={config} />
                  </td>
                  <td>{s.durationMinutes} мин</td>
                  <td>{s.bufferAfterMinutes} мин</td>
                  <td>{s.isActive ? 'Активна' : 'Неактивна'}</td>
                  <td>
                    <button
                      onClick={() => {
                        mutation.reset();
                        setEdit(s);
                      }}
                    >
                      Изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit !== undefined && (
        <Modal
          title={edit ? 'Редактировать услугу' : 'Новая услуга'}
          onClose={() => !mutation.isPending && setEdit(undefined)}
        >
          <form onSubmit={submit}>
            <label>
              Зал
              <input
                name="category"
                maxLength={60}
                list="service-categories"
                defaultValue={edit?.category ?? 'Женский зал'}
              />
              <datalist id="service-categories">
                <option value="Мужской зал" />
                <option value="Женский зал" />
              </datalist>
            </label>
            <label>
              Название
              <input name="name" required minLength={2} maxLength={150} defaultValue={edit?.name} />
            </label>
            <label>
              Описание
              <textarea name="description" maxLength={2000} defaultValue={edit?.description} />
            </label>
            <div className="form-grid">
              <label>
                Цена ({config.currency})
                <input
                  type="number"
                  name="price"
                  min="0"
                  max="1000000"
                  step="0.01"
                  required
                  defaultValue={edit ? edit.priceMinor / 100 : 6000}
                />
              </label>
              <label>
                Длительность, мин
                <input
                  type="number"
                  name="duration"
                  min="5"
                  max="600"
                  required
                  defaultValue={edit?.durationMinutes || 30}
                />
              </label>
              <label>
                Буфер после услуги, мин
                <input
                  type="number"
                  name="buffer"
                  min="0"
                  max="120"
                  required
                  defaultValue={edit?.bufferAfterMinutes ?? 15}
                />
              </label>
            </div>
            <label className="checkbox">
              <input type="checkbox" name="active" defaultChecked={edit?.isActive ?? true} />{' '}
              Доступна для записи
            </label>
            <label className="checkbox">
              <input type="checkbox" name="priceFrom" defaultChecked={edit?.priceFrom ?? true} />{' '}
              Цена «от» (минимальная)
            </label>
            {mutation.error && <ErrorBox error={mutation.error} />}
            <button className="button" disabled={mutation.isPending}>
              Сохранить
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Password() {
  const [done, setDone] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      send('/auth/password', 'POST', body),
    onSuccess: () => setDone(true),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const f = fd(e);
    const next = String(f.get('next'));
    setDone(false);
    setMismatch(next !== String(f.get('repeat')));
    if (next !== String(f.get('repeat'))) return;
    mutation.mutate(
      { currentPassword: String(f.get('current')), newPassword: next },
      { onSuccess: () => form.reset() },
    );
  }
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>Смена пароля</h2>
          <p className="caption">
            Не менее 12 символов. После смены все остальные устройства выйдут из админки.
          </p>
        </div>
      </div>
      <form className="panel password-form" onSubmit={submit}>
        <label>
          Текущий пароль
          <input type="password" name="current" autoComplete="current-password" required />
        </label>
        <label>
          Новый пароль
          <input
            type="password"
            name="next"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <label>
          Повторите новый пароль
          <input
            type="password"
            name="repeat"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        {mismatch && <small className="field-error">Пароли не совпадают.</small>}
        {mutation.error && <ErrorBox error={mutation.error} />}
        {done && (
          <p role="status" className="price-saved">
            Пароль изменён.
          </p>
        )}
        <button className="button" disabled={mutation.isPending}>
          {mutation.isPending ? 'Сохраняем…' : 'Сменить пароль'}
        </button>
      </form>
    </>
  );
}
function PriceEditor({ service, config }: { service: Service; config: Config }) {
  const client = useQueryClient();
  const [value, setValue] = useState(String(service.priceMinor / 100));
  const [saved, setSaved] = useState(false);
  useEffect(() => setValue(String(service.priceMinor / 100)), [service.priceMinor]);
  const mutation = useMutation({
    mutationFn: (priceMinor: number) =>
      send(`/admin/services/${service.id}`, 'PATCH', { priceMinor }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void client.invalidateQueries({ queryKey: ['services'] });
    },
  });
  const priceMinor = Math.round(Number(value) * 100);
  const valid = value.trim() !== '' && Number.isFinite(priceMinor) && priceMinor >= 0;
  const changed = valid && priceMinor !== service.priceMinor;
  return (
    <form
      className="price-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) mutation.mutate(priceMinor);
      }}
    >
      <label>
        <span className="sr-only">
          Цена «{service.name}», {config.currency}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="1000000"
          step="1"
          value={value}
          onChange={(e) => {
            mutation.reset();
            setValue(e.target.value);
          }}
        />
      </label>
      <button
        disabled={!changed || mutation.isPending}
        aria-label={`Сохранить цену «${service.name}»`}
      >
        {mutation.isPending ? '…' : saved ? <Check size={18} /> : 'Сохранить'}
      </button>
      {saved && (
        <small role="status" className="price-saved">
          Цена обновлена
        </small>
      )}
      {mutation.error && (
        <small className="field-error" role="alert">
          {mutation.error.message}
        </small>
      )}
    </form>
  );
}
function Masters() {
  const query = useMasters(true),
    services = useServices(true),
    client = useQueryClient();
  const [edit, setEdit] = useState<Master | null | undefined>(undefined);
  const [showInactive, setShowInactive] = useState(false);
  const mutation = useMutation({
    mutationFn: async ({ body, serviceIds }: { body: unknown; serviceIds: string[] }) => {
      const m = await send<Master>(
        edit ? `/admin/masters/${edit.id}` : '/admin/masters',
        edit ? 'PATCH' : 'POST',
        body,
      );
      await send(`/admin/masters/${m.id}/services`, 'PUT', { serviceIds });
    },
    onSuccess: () => {
      setEdit(undefined);
      void client.invalidateQueries({ queryKey: ['masters'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    const f = fd(e);
    mutation.mutate({
      body: {
        name: String(f.get('name')),
        description: String(f.get('description')),
        ...(f.get('avatarUrl') ? { avatarUrl: String(f.get('avatarUrl')) } : {}),
        isActive: f.get('active') === 'on',
      },
      serviceIds: f.getAll('service').map(String),
    });
  }
  return (
    <>
      <div className="admin-toolbar">
        <h2>Команда</h2>
        <div className="admin-toolbar-actions">
          <button className="text-button" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? 'Скрыть архивных' : 'Показать архивных'}
          </button>
          <button
            className="button"
            onClick={() => {
              mutation.reset();
              setEdit(null);
            }}
          >
            Добавить мастера +
          </button>
        </div>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Мастер</th>
                <th>Услуги</th>
                <th>Активность</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data
                ?.filter((m) => showInactive || m.isActive)
                .map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name}
                      <small>{m.description}</small>
                    </td>
                    <td>{m.services.map((s) => s.service.name).join(', ')}</td>
                    <td>{m.isActive ? 'Активен' : 'Неактивен'}</td>
                    <td>
                      <button
                        onClick={() => {
                          mutation.reset();
                          setEdit(m);
                        }}
                      >
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {edit !== undefined && (
        <Modal
          title={edit ? 'Редактировать мастера' : 'Новый мастер'}
          onClose={() => !mutation.isPending && setEdit(undefined)}
        >
          <form onSubmit={submit}>
            <label>
              Имя
              <input name="name" required minLength={2} maxLength={100} defaultValue={edit?.name} />
            </label>
            <label>
              Описание
              <textarea name="description" maxLength={2000} defaultValue={edit?.description} />
            </label>
            <label>
              Фото: HTTPS-ссылка или /images/…
              <input name="avatarUrl" defaultValue={edit?.avatarUrl || ''} />
            </label>
            <label className="checkbox">
              <input type="checkbox" name="active" defaultChecked={edit?.isActive ?? true} />{' '}
              Доступен для записи
            </label>
            <fieldset>
              <legend>Оказываемые услуги</legend>
              {services.data?.map((s) => (
                <label className="checkbox" key={s.id}>
                  <input
                    type="checkbox"
                    name="service"
                    value={s.id}
                    defaultChecked={edit?.services.some((ms) => ms.serviceId === s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </fieldset>
            {mutation.error && <ErrorBox error={mutation.error} />}
            {!edit && (
              <p className="caption">
                После добавления откройте «Расписание» и задайте рабочие часы мастера.
              </p>
            )}
            <button className="button" disabled={mutation.isPending}>
              Сохранить
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Schedule({ config }: { config: Config }) {
  const masters = useMasters(true);
  const [masterId, setMasterId] = useState('');
  const active = masterId || masters.data?.find((master) => master.isActive)?.id;
  return (
    <>
      <div className="admin-toolbar">
        <h2>Расписание</h2>
        <label>
          Мастер
          <select value={active || ''} onChange={(e) => setMasterId(e.target.value)}>
            {masters.data
              ?.filter((m) => m.isActive)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="caption">
        Локальное время салона: {config.timezone}. Изменения не могут вытеснить подтверждённые
        посещения.
      </p>
      {masters.error && <ErrorBox error={masters.error} />}{' '}
      {active && <ScheduleEditor key={active} id={active} config={config} />}
    </>
  );
}
function ScheduleEditor({ id, config }: { id: string; config: Config }) {
  const client = useQueryClient(),
    base = `/admin/masters/${id}`;
  const [hours, setHours] = useState<Window[]>([]),
    [breakEdit, setBreakEdit] = useState<Window | null>(null),
    [offEdit, setOffEdit] = useState<TimeOff | null>(null),
    [notice, setNotice] = useState('');
  const q = useQuery({
    queryKey: ['schedule', id],
    queryFn: async () => {
      const [hours, breaks, offs] = await Promise.all([
        api<Window[]>(base + '/working-hours'),
        api<Window[]>(base + '/breaks'),
        api<TimeOff[]>(base + '/time-offs'),
      ]);
      return { hours, breaks, offs };
    },
  });
  useEffect(() => {
    if (q.data) setHours(q.data.hours);
  }, [q.data]);
  const m = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      send(base + path, method, body || {}),
    onSuccess: () => {
      setBreakEdit(null);
      setOffEdit(null);
      setNotice('Расписание сохранено.');
      void client.invalidateQueries({ queryKey: ['schedule', id] });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
  const toInstant = (value: FormDataEntryValue | null) =>
    Temporal.PlainDateTime.from(String(value))
      .toZonedDateTime(config.timezone, { disambiguation: 'reject' })
      .toInstant()
      .toString();
  const toLocal = (value: string) =>
    Temporal.Instant.from(value)
      .toZonedDateTimeISO(config.timezone)
      .toPlainDateTime()
      .toString()
      .slice(0, 16);
  const [localError, setLocalError] = useState<unknown>(null);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  function hourChange(day: number, field: 'startTime' | 'endTime', value: string) {
    setHours(hours.map((h) => (h.weekday === day ? { ...h, [field]: value } : h)));
  }
  return (
    <>
      {m.error && <ErrorBox error={m.error} />}{' '}
      {localError != null && <ErrorBox error={localError} />}{' '}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="schedule-grid">
        <section className="panel">
          <h3>Рабочие часы</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate({
                path: '/working-hours',
                method: 'PUT',
                body: {
                  hours: hours.map(({ weekday, startTime, endTime }) => ({
                    weekday,
                    startTime,
                    endTime,
                  })),
                },
              });
            }}
          >
            {days.map((day, i) => {
              const h = hours.find((h) => h.weekday === i + 1);
              return (
                <div className="hours-row" key={day}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={!!h}
                      onChange={(e) =>
                        setHours(
                          e.target.checked
                            ? [...hours, { weekday: i + 1, startTime: '10:00', endTime: '18:00' }]
                            : hours.filter((w) => w.weekday !== i + 1),
                        )
                      }
                    />
                    {day}
                  </label>
                  {h ? (
                    <>
                      <input
                        aria-label={`${day}: начало`}
                        type="time"
                        required
                        value={h.startTime}
                        onChange={(e) => hourChange(i + 1, 'startTime', e.target.value)}
                      />
                      <input
                        aria-label={`${day}: окончание`}
                        type="time"
                        required
                        value={h.endTime}
                        onChange={(e) => hourChange(i + 1, 'endTime', e.target.value)}
                      />
                    </>
                  ) : (
                    <span className="muted">Выходной</span>
                  )}
                </div>
              );
            })}
            <button className="button" disabled={m.isPending}>
              Сохранить часы
            </button>
          </form>
        </section>
        <section className="panel">
          <h3>Регулярные перерывы</h3>
          {q.data?.breaks.map((b) => (
            <div className="schedule-item" key={b.id}>
              <span>
                {days[b.weekday - 1]}
                <small>
                  {b.startTime}–{b.endTime}
                </small>
              </span>
              <button disabled={m.isPending} onClick={() => setBreakEdit(b)}>
                Изменить
              </button>
              <button
                disabled={m.isPending}
                onClick={() => m.mutate({ path: `/breaks/${b.id}`, method: 'DELETE' })}
              >
                Удалить
              </button>
            </div>
          ))}
          <form
            key={breakEdit?.id || 'new-break'}
            onSubmit={(e) => {
              const f = fd(e);
              m.mutate({
                path: breakEdit ? `/breaks/${breakEdit.id}` : '/breaks',
                method: breakEdit ? 'PUT' : 'POST',
                body: {
                  weekday: Number(f.get('weekday')),
                  startTime: String(f.get('startTime')),
                  endTime: String(f.get('endTime')),
                },
              });
            }}
          >
            <h4>{breakEdit ? 'Изменить перерыв' : 'Добавить перерыв'}</h4>
            <label>
              День
              <select name="weekday" defaultValue={breakEdit?.weekday || 1}>
                {days.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                С
                <input
                  type="time"
                  required
                  name="startTime"
                  defaultValue={breakEdit?.startTime || '13:00'}
                />
              </label>
              <label>
                До
                <input
                  type="time"
                  required
                  name="endTime"
                  defaultValue={breakEdit?.endTime || '14:00'}
                />
              </label>
            </div>
            <button className="button secondary" disabled={m.isPending}>
              {breakEdit ? 'Сохранить перерыв' : 'Добавить перерыв'}
            </button>
            {breakEdit && (
              <button type="button" onClick={() => setBreakEdit(null)}>
                Отмена редактирования
              </button>
            )}
          </form>
        </section>
      </div>
      <section className="panel">
        <h3>Отсутствия</h3>
        {q.data?.offs.map((o) => (
          <div className="schedule-item" key={o.id}>
            <span>
              {dateLabel(o.startsAt, config.timezone)} {timeLabel(o.startsAt, config.timezone)} →{' '}
              {dateLabel(o.endsAt, config.timezone)} {timeLabel(o.endsAt, config.timezone)}
              <small>{o.reason}</small>
            </span>
            <button disabled={m.isPending} onClick={() => setOffEdit(o)}>
              Изменить
            </button>
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ path: `/time-offs/${o.id}`, method: 'DELETE' })}
            >
              Удалить
            </button>
          </div>
        ))}
        <form
          key={offEdit?.id || 'new-off'}
          onSubmit={(e) => {
            const f = fd(e);
            try {
              setLocalError(null);
              m.mutate({
                path: offEdit ? `/time-offs/${offEdit.id}` : '/time-offs',
                method: offEdit ? 'PUT' : 'POST',
                body: {
                  startsAt: toInstant(f.get('startsAt')),
                  endsAt: toInstant(f.get('endsAt')),
                  reason: String(f.get('reason')),
                },
              });
            } catch {
              setLocalError(
                new Error('Это локальное время неоднозначно или не существует. Выберите другое.'),
              );
            }
          }}
        >
          <h4>{offEdit ? 'Изменить отсутствие' : 'Добавить отсутствие'}</h4>
          <div className="form-grid">
            <label>
              Начало
              <input
                type="datetime-local"
                name="startsAt"
                required
                defaultValue={offEdit ? toLocal(offEdit.startsAt) : ''}
              />
            </label>
            <label>
              Окончание
              <input
                type="datetime-local"
                name="endsAt"
                required
                defaultValue={offEdit ? toLocal(offEdit.endsAt) : ''}
              />
            </label>
            <label>
              Причина
              <input name="reason" maxLength={300} defaultValue={offEdit?.reason} />
            </label>
          </div>
          <button className="button secondary" disabled={m.isPending}>
            Сохранить отсутствие
          </button>
          {offEdit && (
            <button type="button" onClick={() => setOffEdit(null)}>
              Отмена редактирования
            </button>
          )}
        </form>
      </section>
    </>
  );
}
