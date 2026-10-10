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
  useMe,
} from '../api';
import { ErrorBox, Loading, Modal, WhatsAppIcon } from '../components';
import { intl, minutesUntil, Remind, Reminded } from '../remind';
import { Paid, PaymentDialog } from '../payment';
import { ClientInfo, isBirthdayToday, NoteDialog } from '../clients';
import { PhotoUpload } from '../site';
import { NotifyCard, useMasterManifest } from '../push';

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
  /** Salon notes per phone key. */
  clients: Record<string, ClientInfo>;
  appointments: Appointment[];
  /** Clients who asked to be told if this day frees up. */
  waitlist: { id: string; name: string; phone: string; createdAt: string }[];
  /** «Каждый N-й визит — подарок», when switched on. */
  loyalty: { every: number; reward: string } | null;
  /** Visit id → which visit in a row it is for this client. */
  visitNumbers: Record<string, number>;
}
type Row =
  | { kind: 'free'; at: string }
  | { kind: 'visit'; at: string; visit: Appointment }
  | { kind: 'break'; at: string; until: string }
  | { kind: 'off'; at: string; until: string; reason: string };

const STEP = 30 * 60000;
const overlaps = (a: number, b: number, c: number, d: number) => a < d && b > c;
const phoneKey = (phone: string | null) => {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};
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
  const [paying, setPaying] = useState<Appointment | null>(null);
  const [noting, setNoting] = useState<Appointment | null>(null);
  const client = useQueryClient();
  const me = useMe();
  useMasterManifest();
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
        {me.data?.role === 'ADMIN' && (
          <Link to="/admin" className="md-settings" aria-label="Цены и настройки">
            <Settings />
          </Link>
        )}
      </div>
      <NotifyCard />

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
                      card={day.data.clients[phoneKey(r.visit.guestPhone)]}
                      onNote={() => setNoting(r.visit)}
                    />
                    <Gift day={day.data} id={r.visit.id} />
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
                    ) : r.visit.status === 'COMPLETED' ? (
                      <div className="md-actions">
                        <button className="md-btn pay" onClick={() => setPaying(r.visit)}>
                          {r.visit.paidMinor === null ? '₸ Оплата' : 'Изменить оплату'}
                        </button>
                        {r.visit.paidMinor === null && (
                          <button className="md-btn ghost" onClick={() => setMissing(r.visit)}>
                            ✕ Не пришёл
                          </button>
                        )}
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
                          <button className="md-btn pay" onClick={() => setPaying(r.visit)}>
                            ₸ Оплата
                          </button>
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
          <Waiting day={day.data} config={config} onDone={refresh} />
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
      <div className="md-photo">
        <PhotoUpload className="md-btn ghost big" />
      </div>
      {noting && (
        <NoteDialog
          phone={phoneKey(noting.guestPhone)}
          name={clientName(noting)}
          info={day.data?.clients[phoneKey(noting.guestPhone)]}
          onClose={() => setNoting(null)}
        />
      )}
      {paying && <PaymentDialog a={paying} config={config} onClose={() => setPaying(null)} />}
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
  card,
  onNote,
}: {
  a: Appointment;
  config: Config;
  withDate?: boolean;
  missed?: number;
  card?: ClientInfo;
  onNote?: () => void;
}) {
  const phone = intl(a.guestPhone || '');
  const soon = a.status === 'CONFIRMED' || a.status === 'PENDING' ? minutesUntil(a.startsAt) : null;
  return (
    <>
      <div className="md-visit-time">
        <Clock size={18} />
        {withDate && `${dateLabel(a.startsAt, config.timezone)}, `}
        {timeLabel(a.startsAt, config.timezone)}–{timeLabel(a.endsAt, config.timezone)}
        {a.status === 'PENDING' && <span className="md-badge">ждёт ответа</span>}
        {a.status === 'NO_SHOW' && <span className="md-badge gray">не пришёл</span>}
        {soon !== null && soon <= 60 && <span className="md-badge soon">через {soon} мин</span>}
      </div>
      <h3>
        {clientName(a)}
        {isBirthdayToday(card?.birthday, config.timezone) && (
          <span className="md-birthday"> 🎂 день рождения!</span>
        )}
      </h3>
      <p>{a.serviceName}</p>
      {card?.note && <p className="md-note">📝 {card.note}</p>}
      <Reminded a={a} config={config} />
      <Paid a={a} config={config} />
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
          {onNote && (
            <button type="button" onClick={onNote}>
              📝 Заметка
            </button>
          )}
        </div>
      )}
    </>
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

/** The day's waitlist: one tap offers the freed time in WhatsApp and crosses the client off. */
function Waiting({ day, config, onDone }: { day: Day; config: Config; onDone: () => void }) {
  const mark = useMutation({
    mutationFn: (id: string) => send(`/admin/waitlist/${id}/contacted`, 'PATCH'),
    onSettled: onDone,
  });
  if (!day.waitlist?.length) return null;
  const when = dateLabel(day.date + 'T12:00:00Z', 'UTC').replace(/ \d{4} г\.$/, '');
  return (
    <div className="md-waitlist" role="region" aria-label="Лист ожидания">
      <h3>Ждут этот день: {day.waitlist.length}</h3>
      <p className="md-summary">Освободилось время — предложите его. Клиент запишется сам.</p>
      {day.waitlist.map((w) => (
        <div className="md-wait" key={w.id}>
          <span>
            <strong>{w.name}</strong>
            <br />
            <a href={`tel:+${w.phone}`}>+{w.phone}</a>
          </span>
          <a
            className="md-btn yes"
            href={`https://wa.me/${w.phone}?text=${encodeURIComponent(
              `Здравствуйте, ${w.name}! В салоне «${config.name}» освободилось время ${when}. ` +
                `Записаться: ${location.origin}/book?date=${day.date}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => mark.mutate(w.id)}
          >
            <WhatsAppIcon size={20} /> Предложить
          </a>
        </div>
      ))}
    </div>
  );
}

/** 🎁 on the visit that earns the loyalty reward; the visit count otherwise. */
function Gift({ day, id }: { day: Day; id: string }) {
  const n = day.visitNumbers?.[id];
  if (!day.loyalty || !n) return null;
  if (n % day.loyalty.every === 0)
    return (
      <span className="gift-badge">
        🎁 {n}-й визит — {day.loyalty.reward}
      </span>
    );
  return null;
}
