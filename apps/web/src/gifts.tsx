import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Config, dateLabel, money, send } from './api';
import { ErrorBox, Loading } from './components';

export interface GiftCard {
  id: string;
  code: string;
  amountMinor: number;
  recipient: string;
  sender: string;
  phone: string | null;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
}
export interface Review {
  id: string;
  name: string;
  text: string;
  rating: number;
}
export const STATUS = { ACTIVE: 'Действует', USED: 'Использован', EXPIRED: 'Истёк' } as const;
const fd = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};

/** Certificates sold in the salon: issue one after payment, print it, mark it used. */
export function GiftCardsTab({ config }: { config: Config }) {
  const client = useQueryClient();
  const [created, setCreated] = useState<GiftCard | null>(null);
  const q = useQuery({
    queryKey: ['gift-cards'],
    queryFn: () => api<GiftCard[]>('/admin/gift-cards'),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => send<GiftCard>('/admin/gift-cards', 'POST', body),
    onSuccess: (g) => {
      setCreated(g);
      void client.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });
  const redeem = useMutation({
    mutationFn: ({ id, redeemed }: { id: string; redeemed: boolean }) =>
      send(`/admin/gift-cards/${id}/redeem`, 'PATCH', { redeemed }),
    onSettled: () => void client.invalidateQueries({ queryKey: ['gift-cards'] }),
  });
  const m = (v: number) => money(v, config.currency);
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>Подарочные сертификаты</h2>
          <p className="caption">
            Клиент оплачивает сертификат в салоне. Здесь вы оформляете его, печатаете или
            отправляете ссылку в WhatsApp, а когда им расплатились, отмечаете «Использован».
          </p>
        </div>
      </div>
      <form
        className="panel wa-form"
        onSubmit={(e) => {
          const f = fd(e);
          setCreated(null);
          create.mutate({
            amountMinor: Math.round(Number(f.get('amount')) * 100),
            recipient: String(f.get('recipient')).trim(),
            sender: String(f.get('sender')).trim(),
            phone: String(f.get('phone')).trim() || undefined,
            months: Number(f.get('months')),
          });
          e.currentTarget.reset();
        }}
      >
        <h3>Оформить сертификат</h3>
        <label>
          Сумма, ₸
          <input name="amount" type="number" min="1000" step="500" required placeholder="10000" />
        </label>
        <label>
          Кому
          <input name="recipient" required minLength={2} maxLength={60} placeholder="Айгерим" />
        </label>
        <label>
          От кого (необязательно)
          <input name="sender" maxLength={60} placeholder="от мамы" />
        </label>
        <label>
          Телефон покупателя (необязательно)
          <input name="phone" type="tel" maxLength={30} placeholder="+7 777 123 45 67" />
        </label>
        <label>
          Действует, месяцев
          <input name="months" type="number" min="1" max="12" required defaultValue={3} />
        </label>
        {create.error && <ErrorBox error={create.error} />}
        {created && (
          <p role="status" className="price-saved">
            Готово: сертификат {created.code} на {m(created.amountMinor)}.{' '}
            <Link to={`/gift/${created.code}`} target="_blank">
              Открыть для печати
            </Link>
          </p>
        )}
        <button className="button" disabled={create.isPending}>
          Оформить
        </button>
      </form>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <div className="empty">Сертификатов пока нет.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Код</th>
                <th>Кому</th>
                <th>Сумма</th>
                <th>До</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link to={`/gift/${g.code}`} target="_blank">
                      {g.code}
                    </Link>
                  </td>
                  <td>
                    {g.recipient}
                    {g.sender && <small>{g.sender}</small>}
                  </td>
                  <td>{m(g.amountMinor)}</td>
                  <td>{dateLabel(g.expiresAt, config.timezone)}</td>
                  <td>{STATUS[g.status]}</td>
                  <td>
                    {g.status !== 'EXPIRED' && (
                      <button
                        className="button secondary"
                        disabled={redeem.isPending}
                        onClick={() => redeem.mutate({ id: g.id, redeemed: g.status === 'ACTIVE' })}
                      >
                        {g.status === 'ACTIVE' ? 'Использован' : 'Вернуть'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {redeem.error && <ErrorBox error={redeem.error} />}
    </>
  );
}

/** Reviews shown on the home page; the owner copies them from 2GIS or WhatsApp. */
export function ReviewsAdmin() {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['reviews', 'admin'],
    queryFn: () => api<Review[]>('/admin/reviews'),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['reviews'] });
  const add = useMutation({
    mutationFn: (body: unknown) => send('/admin/reviews', 'POST', body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => send(`/admin/reviews/${id}`, 'DELETE'),
    onSettled: refresh,
  });
  return (
    <section className="panel">
      <h3>Отзывы на сайте</h3>
      <p className="caption">
        Скопируйте лучшие отзывы из 2GIS или WhatsApp. На главной видны последние 12, рядом ссылка
        на все отзывы (её можно поменять во вкладке «Возврат клиентов»). Пока отзывов нет, раздел
        скрыт.
      </p>
      <form
        className="wa-form"
        onSubmit={(e) => {
          const f = fd(e);
          add.mutate({
            name: String(f.get('name')).trim(),
            rating: Number(f.get('rating')),
            text: String(f.get('text')).trim(),
          });
          e.currentTarget.reset();
        }}
      >
        <label>
          Имя
          <input name="name" required minLength={2} maxLength={60} />
        </label>
        <label>
          Оценка
          <select name="rating" defaultValue="5">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {'★'.repeat(n)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Текст отзыва
          <textarea name="text" required minLength={2} maxLength={600} rows={3} />
        </label>
        {add.error && <ErrorBox error={add.error} />}
        <button className="button" disabled={add.isPending}>
          Добавить отзыв
        </button>
      </form>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <ul className="admin-reviews">
          {q.data.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.name}</strong> <span className="stars">{'★'.repeat(r.rating)}</span>
                <p>{r.text}</p>
              </div>
              <button
                className="button secondary"
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.id)}
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
