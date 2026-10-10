import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Config, dateLabel, send } from './api';
import { ErrorBox, Loading, WhatsAppIcon } from './components';
import { intl } from './remind';

export interface Rated {
  id: string;
  guestName: string | null;
  guestPhone: string | null;
  serviceName: string;
  startsAt: string;
  rating: number;
  feedback: string | null;
  ratedAt: string;
}
export interface Referred {
  id: string;
  guestName: string | null;
  guestPhone: string | null;
  startsAt: string;
  status: string;
  referrerPhone: string;
  referrerName: string;
  referralThankedAt: string | null;
  text: string;
}
export const SOURCE_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  '2gis': '2ГИС',
  maps: 'Google / Яндекс Карты',
  friends: 'Друзья, родные',
  passing: 'Проходили мимо',
  other: 'Другое',
};
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const fd = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};

/** Clients' own ratings of their visits; low ones first need a call. */
export function RatingsList({ items, config }: { items: Rated[]; config: Config }) {
  if (!items.length) return null;
  const low = items.filter((r) => r.rating <= 3);
  const avg = items.reduce((s, r) => s + r.rating, 0) / items.length;
  return (
    <section className="growth-list">
      <h3>
        ⭐ Оценки клиентов <span className="count">{items.length}</span>
      </h3>
      <p className="caption">
        Средняя за 2 месяца: {avg.toFixed(1)}. Довольных (4–5) сайт сразу отправляет в 2ГИС, а
        оценки 1–3 приходят только вам — свяжитесь с клиентом.
        {low.length > 0 && ` Требуют внимания: ${low.length}.`}
      </p>
      <div className="table-wrap">
        <table className="compact">
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className={r.rating <= 3 ? 'low' : ''}>
                <td>
                  <span className="stars">{stars(r.rating)}</span>
                  <small>{dateLabel(r.ratedAt, config.timezone).replace(/ \d{4} г\.$/, '')}</small>
                </td>
                <td>
                  {r.guestName || 'Клиент'}
                  <small>{r.serviceName}</small>
                  {r.feedback && <em className="feedback">«{r.feedback}»</em>}
                </td>
                <td>
                  {r.rating <= 3 && intl(r.guestPhone || '') && (
                    <a
                      className="table-remind"
                      href={`https://wa.me/${intl(r.guestPhone || '')}?text=${encodeURIComponent(
                        `Здравствуйте${r.guestName ? ', ' + r.guestName : ''}! Это салон «${config.name}». Спасибо за честную оценку — расскажите, пожалуйста, что было не так? Хотим исправить.`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <WhatsAppIcon size={18} /> Написать
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** «Приведи подругу»: who came on a recommendation, and a thank-you to whoever recommended. */
export function ReferralsList({ items, config }: { items: Referred[]; config: Config }) {
  const client = useQueryClient();
  const thank = useMutation({
    mutationFn: (id: string) => send(`/admin/appointments/${id}/referral-thanked`, 'PATCH'),
    onSettled: () => void client.invalidateQueries({ queryKey: ['growth'] }),
  });
  if (!items.length) return null;
  return (
    <section className="growth-list">
      <h3>
        🤝 По рекомендации <span className="count">{items.length}</span>
      </h3>
      <p className="caption">
        Новый клиент пришёл по совету — поблагодарите того, кто посоветовал. Кнопка откроет WhatsApp
        с готовым текстом про подарок.
      </p>
      <div className="table-wrap">
        <table className="compact">
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.guestName || 'Клиент'}
                  <small>{dateLabel(r.startsAt, config.timezone).replace(/ \d{4} г\.$/, '')}</small>
                </td>
                <td>
                  {r.referrerName || 'Посоветовал(а)'}
                  <small>+{r.referrerPhone}</small>
                </td>
                <td>
                  {r.referralThankedAt ? (
                    <small>✓ Поблагодарили</small>
                  ) : r.status !== 'COMPLETED' ? (
                    <small>Ждём визита</small>
                  ) : (
                    <a
                      className="table-remind"
                      href={`https://wa.me/${r.referrerPhone}?text=${encodeURIComponent(r.text)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => thank.mutate(r.id)}
                    >
                      <WhatsAppIcon size={18} /> Поблагодарить
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Switch for «Приведи подругу»; off by default, so the site says nothing about it. */
export function ReferralForm() {
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const q = useQuery({
    queryKey: ['referral-settings'],
    queryFn: () => api<{ enabled: boolean; reward: string }>('/admin/referral'),
  });
  const save = useMutation({
    mutationFn: (body: unknown) => send('/admin/referral', 'PUT', body),
    onSuccess: () => {
      setSaved(true);
      for (const key of ['referral-settings', 'offers', 'day', 'growth'])
        void client.invalidateQueries({ queryKey: [key] });
    },
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const s = q.data;
  return (
    <form
      className="panel wa-form"
      key={JSON.stringify(s)}
      onSubmit={(e) => {
        const f = fd(e);
        setSaved(false);
        save.mutate({ enabled: f.get('enabled') === 'on', reward: String(f.get('reward')).trim() });
      }}
    >
      <h3>🤝 «Приведи подругу»</h3>
      <p className="caption">
        Пока выключено, на сайте об этом ничего нет. Когда включите, при записи появится поле «Кто
        вам нас посоветовал?», а здесь — список, кого поблагодарить. Подарок получают оба.
      </p>
      <label className="checkbox">
        <input name="enabled" type="checkbox" defaultChecked={s.enabled} /> Включить
      </label>
      <label>
        Подарок обоим
        <input
          name="reward"
          required
          minLength={2}
          maxLength={60}
          placeholder="скидка 10%"
          defaultValue={s.reward}
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
  );
}

/** Where this period's clients heard about the salon. */
export function SourcesStats({
  sources,
  ratingAvg,
  ratings,
}: {
  sources: { source: string; visits: number }[];
  ratingAvg: number | null;
  ratings: number;
}) {
  const total = sources.reduce((s, x) => s + x.visits, 0);
  return (
    <div className="stat-tiles two">
      <div className="stat-tile">
        <span>Откуда узнали</span>
        {total ? (
          <ul className="source-bars">
            {sources.map((x) => (
              <li key={x.source}>
                <span>{SOURCE_NAMES[x.source] ?? x.source}</span>
                <i style={{ width: `${Math.round((x.visits / total) * 100)}%` }} />
                <b>{x.visits}</b>
              </li>
            ))}
          </ul>
        ) : (
          <small>Пока нет ответов — клиенты отвечают при записи на сайте.</small>
        )}
      </div>
      <div className="stat-tile">
        <span>Оценка клиентов</span>
        <strong>{ratingAvg === null ? '—' : `${ratingAvg.toFixed(1)} ★`}</strong>
        <small>{ratings ? `Оценок: ${ratings}` : 'Оценки придут после просьб об отзыве'}</small>
      </div>
    </div>
  );
}
