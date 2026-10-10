import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, X } from 'lucide-react';
import {
  addDays,
  api,
  ApiError,
  Config,
  dateLabel,
  money,
  send,
  Slot,
  timeLabel,
  todayIn,
} from '../api';
import { ButtonLink, ErrorBox, Loading, WhatsAppLink } from '../components';
import { useT } from '../i18n';

interface VisitInfo {
  id: string;
  name: string;
  serviceId: string;
  serviceName: string;
  masterId: string;
  master: string;
  priceMinor: number;
  durationMinutes: number;
  startsAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'EXPIRED';
  canChange: boolean;
  changeBeforeMinutes: number;
}

const STATUS: Record<VisitInfo['status'], string> = {
  PENDING: 'Ждёт подтверждения мастера',
  CONFIRMED: 'Подтверждена',
  CANCELLED: 'Отменена',
  COMPLETED: 'Состоялась',
  NO_SHOW: 'Пропущена',
  EXPIRED: 'Бронь истекла',
};

/** The client's own visit, opened from the personal link «/v/<ref>». */
export function Visit({ config }: { config: Config }) {
  const { ref = '' } = useParams();
  const { t, locale } = useT();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [mode, setMode] = useState<'view' | 'move' | 'cancel'>('view');
  const [date, setDate] = useState(''),
    [time, setTime] = useState('');
  const visit = useQuery({
    queryKey: ['visit', ref],
    queryFn: () => api<VisitInfo>(`/visit/${encodeURIComponent(ref)}`),
    retry: false,
  });
  const v = visit.data;
  const day =
    date ||
    (v
      ? new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date(v.startsAt))
      : '');
  const slots = useQuery({
    queryKey: ['availability', v?.serviceId, v?.masterId, day],
    queryFn: ({ signal }) =>
      api<{ slots: Slot[] }>(
        `/availability?serviceId=${v!.serviceId}&masterId=${v!.masterId}&date=${day}`,
        { signal },
      ),
    enabled: mode === 'move' && !!v && !!day,
    staleTime: 0,
  });
  const cancel = useMutation({
    mutationFn: () => send(`/visit/${encodeURIComponent(ref)}/cancel`, 'POST'),
    onSuccess: () => {
      setMode('view');
      void visit.refetch();
    },
  });
  const move = useMutation({
    mutationFn: () =>
      send<{ ref: string }>(`/visit/${encodeURIComponent(ref)}/reschedule`, 'POST', {
        startsAt: time,
      }),
    onSuccess: (r) => {
      setMode('view');
      setTime('');
      setDate('');
      void client.invalidateQueries({ queryKey: ['availability'] });
      // The moved visit is a new record with its own link.
      navigate(`/v/${r.ref}`, { replace: true });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setTime('');
        void slots.refetch();
      }
    },
  });
  const whatsapp = (text: string) => (
    <WhatsAppLink config={config} text={text}>
      {t('Написать в WhatsApp')}
    </WhatsAppLink>
  );
  if (visit.isPending) return <Loading />;
  if (visit.error)
    return (
      <section className="page success-page">
        <h1>{t('Запись не найдена')}</h1>
        <ErrorBox error={visit.error} />
        <div className="form-actions">
          {whatsapp(`Здравствуйте! Хочу уточнить свою запись в салоне «${config.name}».`)}
          <ButtonLink to="/" secondary>
            {t('На главную')}
          </ButtonLink>
        </div>
      </section>
    );
  if (!v) return null;
  const when = `${dateLabel(v.startsAt, config.timezone, locale)}, ${timeLabel(v.startsAt, config.timezone)}`;
  const active = v.status === 'CONFIRMED' || v.status === 'PENDING';
  const today = todayIn(config.timezone);
  return (
    <section className="page visit-page">
      <p className="eyebrow">{t('МОЯ ЗАПИСЬ')}</p>
      <h1>{v.name ? t('{name}, ваша запись', { name: v.name }) : t('Ваша запись')}</h1>
      <div className="review">
        <h3>{t(v.serviceName)}</h3>
        <p>
          {v.master} · {t('{n} мин', { n: v.durationMinutes })}
        </p>
        <p>
          <strong>{when}</strong>
        </p>
        <p className={`visit-status ${active ? 'active' : ''}`}>
          {v.status === 'CONFIRMED' ? <Check size={16} /> : null} {t(STATUS[v.status])}
        </p>
        <strong>{money(v.priceMinor, config.currency)}</strong>
      </div>
      {(cancel.error || move.error) && <ErrorBox error={cancel.error || move.error} />}
      {active && !v.canChange && (
        <div className="empty">
          <p>
            {t(
              'Менять запись онлайн можно не позже чем за {n} ч до визита. Напишите нам — договоримся.',
              { n: v.changeBeforeMinutes / 60 },
            )}
          </p>
          {whatsapp(`Здравствуйте! Моя запись: ${v.serviceName}, ${when}. Хочу её изменить.`)}
        </div>
      )}
      {v.canChange && mode === 'view' && (
        <div className="form-actions">
          <button className="button" onClick={() => setMode('move')}>
            <CalendarClock size={18} /> {t('Перенести')}
          </button>
          <button className="button secondary" onClick={() => setMode('cancel')}>
            <X size={18} /> {t('Отменить запись')}
          </button>
        </div>
      )}
      {v.canChange && mode === 'cancel' && (
        <div className="empty">
          <h3>{t('Отменить запись?')}</h3>
          <p>{t('Время освободится для других клиентов.')}</p>
          <div className="form-actions">
            <button className="button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending ? t('Отменяем…') : t('Да, отменить')}
            </button>
            <button className="button secondary" onClick={() => setMode('view')}>
              {t('Оставить запись')}
            </button>
          </div>
        </div>
      )}
      {v.canChange && mode === 'move' && (
        <div className="visit-move">
          <label className="date-picker">
            {t('Новая дата')}
            <input
              type="date"
              min={today}
              max={addDays(today, 59)}
              value={day}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value);
                  setTime('');
                }
              }}
            />
          </label>
          {slots.isFetching ? (
            <Loading />
          ) : slots.error ? (
            <ErrorBox error={slots.error} retry={() => void slots.refetch()} />
          ) : slots.data?.slots.length ? (
            <div className="slots" aria-label={t('Свободное время')}>
              {slots.data.slots.map((s) => (
                <button
                  key={s.startsAt}
                  aria-pressed={time === s.startsAt}
                  className={time === s.startsAt ? 'selected' : ''}
                  onClick={() => setTime(s.startsAt)}
                >
                  {timeLabel(s.startsAt, config.timezone)}
                </button>
              ))}
            </div>
          ) : (
            <p>{t('На эту дату свободного времени нет')}</p>
          )}
          <div className="form-actions">
            <button
              className="button"
              disabled={!time || move.isPending}
              onClick={() => move.mutate()}
            >
              {move.isPending
                ? t('Переносим…')
                : time
                  ? t('Перенести на {time}', { time: timeLabel(time, config.timezone) })
                  : t('Выберите время')}
            </button>
            <button className="button secondary" onClick={() => setMode('view')}>
              {t('Назад')}
            </button>
          </div>
        </div>
      )}
      {!active && (
        <div className="form-actions">
          <ButtonLink to="/book">{t('Записаться снова')}</ButtonLink>
        </div>
      )}
    </section>
  );
}
