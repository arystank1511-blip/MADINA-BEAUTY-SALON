import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Phone, Plus, Settings } from 'lucide-react';
import {
  addDays,
  api,
  ApiError,
  Appointment,
  clientName,
  Config,
  dateLabel,
  send,
  Service,
  timeLabel,
  todayIn,
} from '../api';
import { ErrorBox, Loading, Modal, WhatsAppIcon } from '../components';

interface Span {
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
}
interface Day {
  date: string;
  now: string;
  master: { id: string; name: string };
  services: Service[];
  /** serviceId → start times (ISO) where that service fits. */
  fits: Record<string, string[]>;
  hours: Span | null;
  breaks: Span[];
  timeOffs: { id: string; startsAt: string; endsAt: string; reason: string }[];
  /** Missed visits per phone key (last 10 digits). */
  noShows: Record<string, number>;
  appointments: Appointment[];
}
type Row =
  | { kind: 'free'; at: string }
  | { kind: 'visit'; at: string; visit: Appointment }
  | { kind: 'break'; at: string; until: string }
  | { kind: 'off'; at: string; until: string; reason: string };

const STEP = 30 * 60000;
const overlaps = (a: number, b: number, c: number, d: number) => a < d && b > c;
/** Kazakhstan number in international form (7XXXXXXXXXX) for tel: and wa.me links, or ''. */
const intl = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return '7' + d;
  if (d.length === 11 && d.startsWith('8')) return '7' + d.slice(1);
  return d.length >= 11 ? d : '';
};
const phoneKey = (phone: string | null) => {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};
/** Salon-local calendar date (YYYY-MM-DD) of an instant. */
const dayOf = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
const weekday = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(date + 'T12:00:00Z'),
  );

/** Everything that happens in a day, in time order, with free half-hours between visits. */
function rows(day: Day): Row[] {
  const busy: [number, number][] = [
    ...day.appointments.map((a) => [Date.parse(a.startsAt), Date.parse(a.occupiedUntil)]),
    ...day.breaks.map((b) => [Date.parse(b.startsAt), Date.parse(b.endsAt)]),
    ...day.timeOffs.map((o) => [Date.parse(o.startsAt), Date.parse(o.endsAt)]),
  ] as [number, number][];
  const list: Row[] = [
    ...day.appointments.map((visit) => ({ kind: 'visit' as const, at: visit.startsAt, visit })),
    ...day.breaks.map((b) => ({ kind: 'break' as const, at: b.startsAt, until: b.endsAt })),
    ...day.timeOffs.map((o) => ({
      kind: 'off' as const,
      at: o.startsAt,
      until: o.endsAt,
      reason: o.reason,
    })),
  ];
  const fitting = new Set(Object.values(day.fits).flat());
  if (day.hours)
    for (let t = Date.parse(day.hours.startsAt); t < Date.parse(day.hours.endsAt); t += STEP) {
      const at = new Date(t).toISOString();
      // Offer only times where some service fits before the next visit, break or closing.
      if (fitting.has(at) && !busy.some(([s, e]) => overlaps(t, t + STEP, s, e)))
        list.push({ kind: 'free', at });
    }
  return list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function MasterDay({ config }: { config: Config }) {
  const today = todayIn(config.timezone);
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [missing, setMissing] = useState<Appointment | null>(null);
  const client = useQueryClient();
  const day = useQuery({
    queryKey: ['day', date],
    queryFn: () => api<Day>('/admin/day?date=' + date),
    refetchInterval: 60000,
  });
  const pending = useQuery({
    queryKey: ['pending'],
    queryFn: () => api<Appointment[]>('/admin/pending'),
    refetchInterval: 60000,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['day'] });
    void client.invalidateQueries({ queryKey: ['pending'] });
    void client.invalidateQueries({ queryKey: ['appointments'] });
    void client.invalidateQueries({ queryKey: ['availability'] });
  };
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'confirm' | 'cancel' | 'no-show' }) =>
      send(`/admin/appointments/${id}/${action}`, 'PATCH'),
    onSuccess: () => {
      setCancelling(null);
      setMissing(null);
      refresh();
    },
    onError: refresh,
  });
  const time = (iso: string) => timeLabel(iso, config.timezone);
  const label = date === today ? 'Сегодня' : date === addDays(today, 1) ? 'Завтра' : weekday(date);

  return (
    <section className="page master-day">
      <div className="md-top">
        <div>
          <p className="eyebrow">МАСТЕР {day.data?.master.name.toUpperCase()}</p>
          <h1>Мой день</h1>
        </div>
        <Link to="/admin" className="md-settings" aria-label="Цены и настройки">
          <Settings />
        </Link>
      </div>

      {pending.data && pending.data.length > 0 && (
        <div className="md-pending" role="region" aria-label="Новые заявки">
          <h2>
            <span className="md-bell">🔔</span> Новые заявки с сайта: {pending.data.length}
          </h2>
          <p className="caption">
            Время придержано на 3 часа. Подтвердите или откажите, клиент ждёт ответа в WhatsApp.
          </p>
          {pending.data.map((a) => (
            <article className="md-card pending" key={a.id}>
              <Visit a={a} config={config} withDate />
              <div className="md-actions">
                <button
                  className="md-btn yes"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: a.id, action: 'confirm' })}
                >
                  ✓ Подтвердить
                </button>
                <button
                  className="md-btn no"
                  disabled={decide.isPending}
                  onClick={() => setCancelling(a)}
                >
                  ✕ Отказать
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="md-dates">
        <button
          className="md-arrow"
          aria-label="Предыдущий день"
          disabled={date <= addDays(today, -7)}
          onClick={() => setDate(addDays(date, -1))}
        >
          <ChevronLeft />
        </button>
        <div className="md-date">
          <strong>{label}</strong>
          <span>{dateLabel(date + 'T12:00:00Z', 'UTC')}</span>
        </div>
        <button
          className="md-arrow"
          aria-label="Следующий день"
          onClick={() => setDate(addDays(date, 1))}
        >
          <ChevronRight />
        </button>
      </div>
      <div className="md-chips">
        <button className={date === today ? 'on' : ''} onClick={() => setDate(today)}>
          Сегодня
        </button>
        <button
          className={date === addDays(today, 1) ? 'on' : ''}
          onClick={() => setDate(addDays(today, 1))}
        >
          Завтра
        </button>
        <label className="md-pick">
          📅 Дата
          <input
            type="date"
            min={addDays(today, -7)}
            max={addDays(today, 59)}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </div>

      {decide.error && <ErrorBox error={decide.error} />}
      {day.isPending ? (
        <Loading />
      ) : day.error ? (
        <ErrorBox error={day.error} retry={() => void day.refetch()} />
      ) : (
        <>
          <p className="md-summary">
            {day.data.hours
              ? `Работаю ${day.data.hours.start}–${day.data.hours.end} · записей: ${
                  day.data.appointments.length
                }`
              : 'Выходной день'}
          </p>
          <ol className="md-list">
            {rows(day.data).map((r) =>
              r.kind === 'free' ? (
                <li key={'f' + r.at}>
                  <button className="md-free" onClick={() => setAdding(r.at)}>
                    <span className="md-time">{time(r.at)}</span>
                    <span className="md-free-label">Свободно</span>
                    <span className="md-add">
                      <Plus size={20} /> Записать
                    </span>
                  </button>
                </li>
              ) : r.kind === 'visit' ? (
                <li key={r.visit.id}>
                  <article className={`md-card ${r.visit.status.toLowerCase()}`}>
                    <Visit
                      a={r.visit}
                      config={config}
                      missed={day.data.noShows[phoneKey(r.visit.guestPhone)] || 0}
                    />
                    {r.visit.status === 'PENDING' ? (
                      <div className="md-actions">
                        <button
                          className="md-btn yes"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: r.visit.id, action: 'confirm' })}
                        >
                          ✓ Подтвердить
                        </button>
                        <button className="md-btn no" onClick={() => setCancelling(r.visit)}>
                          ✕ Отказать
                        </button>
                      </div>
                    ) : (
                      r.visit.status === 'CONFIRMED' &&
                      (Date.parse(r.visit.startsAt) > Date.now() ? (
                        <div className="md-actions">
                          <Remind a={r.visit} config={config} />
                          <button className="md-btn ghost" onClick={() => setCancelling(r.visit)}>
                            Отменить запись
                          </button>
                        </div>
                      ) : (
                        <div className="md-actions">
                          <button className="md-btn ghost" onClick={() => setMissing(r.visit)}>
                            ✕ Не пришёл
                          </button>
                        </div>
                      ))
                    )}
                  </article>
                </li>
              ) : (
                <li key={r.kind + r.at}>
                  <div className="md-rest">
                    <span className="md-time">{time(r.at)}</span>
                    <span>
                      {r.kind === 'break' ? '☕ Перерыв' : `🚫 ${r.reason || 'Не работаю'}`} до{' '}
                      {time(r.until)}
                    </span>
                  </div>
                </li>
              ),
            )}
          </ol>
          {day.data.hours && !rows(day.data).some((r) => r.kind === 'free') && (
            <p className="md-summary">На этот день свободного времени не осталось.</p>
          )}
        </>
      )}

      {adding && day.data && (
        <AddVisit
          at={adding}
          day={day.data}
          config={config}
          onClose={() => setAdding(null)}
          onDone={() => {
            setAdding(null);
            refresh();
          }}
        />
      )}
      {missing && (
        <Modal title="Клиент не пришёл?" onClose={() => !decide.isPending && setMissing(null)}>
          <p className="md-confirm-text">
            {clientName(missing)} · {missing.serviceName}
            <br />
            {dateLabel(missing.startsAt, config.timezone)}, {time(missing.startsAt)}
          </p>
          <p className="caption">
            Отметка сохранится. Если клиент запишется снова, вы увидите, что он уже пропускал.
          </p>
          <div className="md-actions">
            <button
              className="md-btn no"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: missing.id, action: 'no-show' })}
            >
              Да, не пришёл
            </button>
            <button className="md-btn ghost" onClick={() => setMissing(null)}>
              Нет
            </button>
          </div>
        </Modal>
      )}
      {cancelling && (
        <Modal
          title={cancelling.status === 'PENDING' ? 'Отказать в заявке?' : 'Отменить запись?'}
          onClose={() => !decide.isPending && setCancelling(null)}
        >
          <p className="md-confirm-text">
            {clientName(cancelling)} · {cancelling.serviceName}
            <br />
            {dateLabel(cancelling.startsAt, config.timezone)}, {time(cancelling.startsAt)}
          </p>
          <p className="caption">Время снова станет свободным для записи.</p>
          <div className="md-actions">
            <button
              className="md-btn no"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: cancelling.id, action: 'cancel' })}
            >
              Да, отменить
            </button>
            <button className="md-btn ghost" onClick={() => setCancelling(null)}>
              Нет
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Visit({
  a,
  config,
  withDate,
  missed = 0,
}: {
  a: Appointment;
  config: Config;
  withDate?: boolean;
  missed?: number;
}) {
  const phone = intl(a.guestPhone || '');
  return (
    <>
      <div className="md-visit-time">
        <Clock size={18} />
        {withDate && `${dateLabel(a.startsAt, config.timezone)}, `}
        {timeLabel(a.startsAt, config.timezone)}–{timeLabel(a.endsAt, config.timezone)}
        {a.status === 'PENDING' && <span className="md-badge">ждёт ответа</span>}
        {a.status === 'NO_SHOW' && <span className="md-badge gray">не пришёл</span>}
      </div>
      <h3>{clientName(a)}</h3>
      <p>{a.serviceName}</p>
      {missed > 0 && a.status !== 'NO_SHOW' && (
        <p className="md-warn">
          ⚠ Уже не приходил(а): {missed} {missed === 1 ? 'раз' : missed < 5 ? 'раза' : 'раз'}.
          Напомните накануне.
        </p>
      )}
      {phone && (
        <div className="md-contacts">
          <a href={`tel:+${phone}`}>
            <Phone size={18} /> Позвонить
          </a>
          <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={18} /> WhatsApp
          </a>
        </div>
      )}
    </>
  );
}

/** Opens the client's WhatsApp with a ready reminder; the master only taps «Отправить». */
function Remind({ a, config }: { a: Appointment; config: Config }) {
  const phone = intl(a.guestPhone || '');
  if (!phone) return null;
  const today = todayIn(config.timezone);
  const day = dateLabel(a.startsAt, config.timezone).replace(/ \d{4} г\.$/, '');
  const when =
    dayOf(a.startsAt, config.timezone) === today
      ? 'сегодня'
      : dayOf(a.startsAt, config.timezone) === addDays(today, 1)
        ? 'завтра'
        : day;
  const text = [
    `Здравствуйте${a.guestName ? ', ' + a.guestName : ''}!`,
    `Напоминаю, вы записаны ${when} в ${timeLabel(a.startsAt, config.timezone)} — ${a.serviceName}.`,
    `Салон «${config.name}», ${config.address}.`,
    'Если планы изменятся, напишите, пожалуйста 🙏',
  ].join('\n');
  return (
    <a
      className="md-btn remind"
      href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <WhatsAppIcon size={20} /> Напомнить
    </a>
  );
}

function AddVisit({
  at,
  day,
  config,
  onClose,
  onDone,
}: {
  at: string;
  day: Day;
  config: Config;
  onClose: () => void;
  onDone: () => void;
}) {
  const services = day.services.filter((s) => day.fits[s.id]?.includes(at));
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const mutation = useMutation({
    mutationFn: (body: unknown) => send('/admin/quick-appointments', 'POST', body),
    onSuccess: onDone,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.mutate({
      masterId: day.master.id,
      serviceId,
      startsAt: at,
      guestName: String(f.get('name')).trim(),
      ...(String(f.get('phone')).trim() ? { guestPhone: String(f.get('phone')).trim() } : {}),
    });
  }
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  return (
    <Modal
      title={`Запись на ${timeLabel(at, config.timezone)}`}
      onClose={() => !mutation.isPending && onClose()}
    >
      <form className="md-form" onSubmit={submit}>
        <label>
          Имя клиента
          <input name="name" required minLength={2} maxLength={80} autoComplete="off" />
        </label>
        <label>
          Телефон (если есть)
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={30}
            pattern="[+0-9\s()\-]*"
            placeholder="+7"
            autoComplete="off"
          />
        </label>
        <fieldset>
          <legend>Услуга (показаны те, что успеют до следующей записи)</legend>
          <div className="md-services">
            {services.map((s) => (
              <button
                type="button"
                key={s.id}
                aria-pressed={serviceId === s.id}
                className={serviceId === s.id ? 'on' : ''}
                onClick={() => setServiceId(s.id)}
              >
                {s.name}
                <small>{s.durationMinutes} мин</small>
              </button>
            ))}
          </div>
        </fieldset>
        {conflict ? (
          <div className="error" role="alert">
            <p>
              Не помещается: это время занято или услуга не успевает закончиться до следующей
              записи, перерыва или конца дня. Выберите другое время или услугу.
            </p>
          </div>
        ) : (
          mutation.error && <ErrorBox error={mutation.error} />
        )}
        <button className="md-btn yes big" disabled={!serviceId || mutation.isPending}>
          {mutation.isPending ? 'Записываю…' : '✓ Записать'}
        </button>
      </form>
    </Modal>
  );
}
