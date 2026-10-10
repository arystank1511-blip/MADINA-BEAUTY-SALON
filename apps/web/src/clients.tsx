import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Appointment, Config, dateLabel, money, send, timeLabel, todayIn } from './api';
import { ErrorBox, Loading, Modal, WhatsAppIcon } from './components';
import { intl } from './remind';

/** What the salon keeps about a client (by the last 10 digits of the phone). */
export interface ClientInfo {
  note: string;
  birthday: string | null;
  blocked: boolean;
}
export interface ClientSummary extends ClientInfo {
  phone: string;
  name: string;
  displayPhone: string;
  visits: number;
  noShows: number;
  spentMinor: number;
  lastVisit: string | null;
  nextVisit: string | null;
}
interface ClientCard extends ClientInfo {
  phone: string;
  name: string;
  displayPhone: string;
  history: (Appointment & { master: { name: string } })[];
}
export const phoneKey = (phone: string | null) => {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};
const months = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
/** «15 марта» from «03-15». */
export const birthdayLabel = (b: string) =>
  `${Number(b.slice(3))} ${months[Number(b.slice(0, 2)) - 1]}`;
export const isBirthdayToday = (b: string | null | undefined, zone: string) =>
  !!b && todayIn(zone).slice(5) === b;

/** Day and month pickers producing «MM-DD», or '' when not set. */
export function BirthdayInput({
  value,
  onChange,
  label = 'День рождения',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [month, day] = value ? value.split('-') : ['', ''];
  const set = (m: string, d: string) => onChange(m && d ? `${m}-${d}` : '');
  return (
    <fieldset className="birthday-input">
      <legend>{label}</legend>
      <select aria-label="День" value={day} onChange={(e) => set(month || '01', e.target.value)}>
        <option value="">День</option>
        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
          <option key={d} value={d}>
            {Number(d)}
          </option>
        ))}
      </select>
      <select aria-label="Месяц" value={month} onChange={(e) => set(e.target.value, day || '01')}>
        <option value="">Месяц</option>
        {months.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, '0')}>
            {m}
          </option>
        ))}
      </select>
      {value && (
        <button type="button" className="inline-link" onClick={() => onChange('')}>
          Очистить
        </button>
      )}
    </fieldset>
  );
}

const refresh = (client: ReturnType<typeof useQueryClient>) => {
  for (const key of ['clients', 'client', 'day', 'growth'])
    void client.invalidateQueries({ queryKey: [key] });
};

/** Master's quick note on a client («краска 6.1, 60 мл»), from «Мой день». */
export function NoteDialog({
  phone,
  info,
  name,
  onClose,
}: {
  phone: string;
  info?: ClientInfo;
  name: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [note, setNote] = useState(info?.note ?? '');
  const save = useMutation({
    mutationFn: () =>
      send(`/admin/clients/${phone}`, 'PUT', {
        note,
        birthday: info?.birthday ?? null,
        blocked: info?.blocked ?? false,
      }),
    onSuccess: () => {
      refresh(client);
      onClose();
    },
  });
  return (
    <Modal title={`Заметка: ${name}`} onClose={() => !save.isPending && onClose()}>
      <form
        className="payment-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <textarea
          aria-label="Заметка"
          autoFocus
          rows={5}
          maxLength={2000}
          placeholder="Например: краска 6.1, 60 мл; любит покороче на висках"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {save.error && <ErrorBox error={save.error} />}
        <button className="md-btn yes" disabled={save.isPending}>
          Сохранить
        </button>
      </form>
    </Modal>
  );
}

const statusShort = {
  PENDING: 'заявка',
  CONFIRMED: 'запись',
  CANCELLED: 'отменена',
  COMPLETED: 'был(а)',
  NO_SHOW: 'не пришёл',
} as const;

/** Admin client card: history, note, birthday and «только через WhatsApp». */
export function ClientCardDialog({
  phone,
  config,
  onClose,
}: {
  phone: string;
  config: Config;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['client', phone],
    queryFn: () => api<ClientCard>(`/admin/clients/${phone}`),
  });
  const [draft, setDraft] = useState<ClientInfo | null>(null);
  const info = draft ?? q.data ?? null;
  const save = useMutation({
    mutationFn: (body: ClientInfo) => send(`/admin/clients/${phone}`, 'PUT', body),
    onSuccess: () => {
      refresh(client);
      onClose();
    },
  });
  const wa = intl(q.data?.displayPhone || '');
  return (
    <Modal title={q.data?.name || 'Клиент'} onClose={() => !save.isPending && onClose()}>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        info && (
          <form
            className="client-card"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({
                note: info.note,
                birthday: info.birthday || null,
                blocked: info.blocked,
              });
            }}
          >
            <p className="client-contacts">
              {q.data.displayPhone}
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon size={16} /> WhatsApp
                </a>
              )}
            </p>
            <label>
              Заметка
              <textarea
                rows={4}
                maxLength={2000}
                placeholder="Краска, пожелания, аллергии"
                value={info.note}
                onChange={(e) => setDraft({ ...info, note: e.target.value })}
              />
            </label>
            <BirthdayInput
              value={info.birthday ?? ''}
              onChange={(birthday) => setDraft({ ...info, birthday })}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={info.blocked}
                onChange={(e) => setDraft({ ...info, blocked: e.target.checked })}
              />{' '}
              Только через WhatsApp — не принимать заявки с сайта
            </label>
            {save.error && <ErrorBox error={save.error} />}
            <button className="button" disabled={save.isPending}>
              Сохранить
            </button>
            <h3>История ({q.data.history.length})</h3>
            <ul className="client-history">
              {q.data.history.map((h) => (
                <li key={h.id} className={h.status.toLowerCase()}>
                  <span>
                    {dateLabel(h.startsAt, config.timezone)},{' '}
                    {timeLabel(h.startsAt, config.timezone)}
                  </span>
                  <span>{h.serviceName}</span>
                  <span>
                    {statusShort[h.status]}
                    {h.status === 'COMPLETED' &&
                      ` · ${money(h.paidMinor ?? h.priceMinor, config.currency)}`}
                  </span>
                </li>
              ))}
            </ul>
          </form>
        )
      )}
    </Modal>
  );
}
