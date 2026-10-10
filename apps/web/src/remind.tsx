import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, Appointment, Config, dateLabel, send, timeLabel, todayIn } from './api';
import { WhatsAppIcon } from './components';

/** Kazakhstan number in international form (7XXXXXXXXXX) for tel: and wa.me links, or ''. */
export const intl = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return '7' + d;
  if (d.length === 11 && d.startsWith('8')) return '7' + d.slice(1);
  return d.length >= 11 ? d : '';
};
/** Salon-local calendar date (YYYY-MM-DD) of an instant. */
export const dayOf = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
/** Minutes until a visit starts, or null once it has started. */
export const minutesUntil = (iso: string) => {
  const left = Math.round((Date.parse(iso) - Date.now()) / 60000);
  return left > 0 ? left : null;
};

function reminderText(a: Appointment, config: Config) {
  const today = todayIn(config.timezone);
  const day = dayOf(a.startsAt, config.timezone);
  const when =
    day === today
      ? 'сегодня'
      : day === addDays(today, 1)
        ? 'завтра'
        : dateLabel(a.startsAt, config.timezone).replace(/ \d{4} г\.$/, '');
  return [
    `Здравствуйте${a.guestName ? ', ' + a.guestName : ''}!`,
    `Напоминаю, вы записаны ${when} в ${timeLabel(a.startsAt, config.timezone)} — ${a.serviceName}.`,
    `Салон «${config.name}», ${config.address}.`,
    a.manageUrl
      ? `Перенести или отменить: ${a.manageUrl}`
      : 'Если планы изменятся, напишите, пожалуйста.',
    'Спасибо!',
  ].join('\n');
}

/**
 * Opens the client's WhatsApp with a ready reminder (the sender only taps «Отправить»)
 * and marks the visit as reminded, so the master and the admin both see it.
 */
export function Remind({
  a,
  config,
  className = 'md-btn remind',
}: {
  a: Appointment;
  config: Config;
  className?: string;
}) {
  const client = useQueryClient();
  const mark = useMutation({
    mutationFn: () => send(`/admin/appointments/${a.id}/reminded`, 'PATCH'),
    onSettled: () => {
      for (const key of ['day', 'reminders', 'appointments'])
        void client.invalidateQueries({ queryKey: [key] });
    },
  });
  const phone = intl(a.guestPhone || '');
  if (!phone) return null;
  return (
    <a
      className={className}
      href={`https://wa.me/${phone}?text=${encodeURIComponent(reminderText(a, config))}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => mark.mutate()}
    >
      <WhatsAppIcon size={20} /> {a.remindedAt ? 'Напомнить ещё раз' : 'Напомнить'}
    </a>
  );
}

/** «✓ Напомнили в 13:05» once the client got a reminder. */
export function Reminded({ a, config }: { a: Appointment; config: Config }) {
  if (!a.remindedAt) return null;
  return (
    <span className="reminded">
      ✓ Напомнили{' '}
      {dayOf(a.remindedAt, config.timezone) === todayIn(config.timezone)
        ? 'в'
        : dateLabel(a.remindedAt, config.timezone).replace(/ \d{4} г\.$/, '') + ','}{' '}
      {timeLabel(a.remindedAt, config.timezone)}
    </span>
  );
}
