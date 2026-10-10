import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, Config, money, send, todayIn } from './api';
import { ErrorBox, Loading } from './components';

interface Expense {
  id: string;
  date: string;
  category: string;
  amountMinor: number;
  note: string;
}
interface Material {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
}
const fd = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
const short = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(date + 'T12:00:00Z'),
  );

/** Expenses of the chosen period: add one, see the list by category. */
export function ExpensesPanel({ from, to, config }: { from: string; to: string; config: Config }) {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['expenses', from, to],
    queryFn: () =>
      api<{
        items: Expense[];
        categories: string[];
        expensesMinor: number;
        expenseCategories: { category: string; amountMinor: number }[];
      }>(`/admin/expenses?from=${from}&to=${to}`),
  });
  const refresh = () => {
    for (const key of ['expenses', 'stats']) void client.invalidateQueries({ queryKey: [key] });
  };
  const add = useMutation({
    mutationFn: (body: unknown) => send('/admin/expenses', 'POST', body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => send(`/admin/expenses/${id}`, 'DELETE'),
    onSettled: refresh,
  });
  const m = (v: number) => money(v, config.currency);
  const today = todayIn(config.timezone);
  return (
    <section className="panel">
      <h3>Расходы</h3>
      <p className="caption">
        Аренда, материалы, зарплата — всё, что тратит салон. Прибыль в статистике = выручка −
        расходы за тот же период.
      </p>
      <form
        className="expense-form"
        onSubmit={(e) => {
          const f = fd(e);
          add.mutate({
            date: String(f.get('date')),
            category: String(f.get('category')),
            amountMinor: Math.round(Number(f.get('amount')) * 100),
            note: String(f.get('note')).trim(),
          });
          e.currentTarget.reset();
        }}
      >
        <label>
          Дата
          <input
            name="date"
            type="date"
            required
            max={today}
            defaultValue={to < today ? to : today}
          />
        </label>
        <label>
          Статья
          <select name="category" required>
            {(q.data?.categories ?? ['Материалы']).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Сумма, ₸
          <input name="amount" type="number" min="1" step="1" required />
        </label>
        <label>
          Комментарий
          <input name="note" maxLength={200} placeholder="Краска, 5 тюбиков" />
        </label>
        <button className="button" disabled={add.isPending}>
          Добавить
        </button>
      </form>
      {add.error && <ErrorBox error={add.error} />}
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : !q.data.items.length ? (
        <p className="caption">За этот период расходов нет.</p>
      ) : (
        <>
          <p className="expense-totals">
            {q.data.expenseCategories.map((c) => (
              <span key={c.category}>
                {c.category}: <strong>{m(c.amountMinor)}</strong>
              </span>
            ))}
          </p>
          <div className="table-wrap">
            <table className="compact">
              <tbody>
                {q.data.items.map((e) => (
                  <tr key={e.id}>
                    <td>{short(e.date)}</td>
                    <td>
                      {e.category}
                      {e.note && <small>{e.note}</small>}
                    </td>
                    <td>{m(e.amountMinor)}</td>
                    <td>
                      <button
                        className="button secondary"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(e.id)}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** CSV files that open in Excel: visits and expenses for the period, all clients. */
export function ExportLinks({ from, to }: { from: string; to: string }) {
  const link = (kind: string, label: string) => (
    <a
      className="button secondary"
      href={`/api/v1/admin/export/${kind}?from=${from}&to=${to}`}
      download
    >
      <Download size={18} /> {label}
    </a>
  );
  return (
    <section className="panel">
      <h3>Выгрузка в Excel</h3>
      <p className="caption">Файлы CSV открываются в Excel и Google Таблицах.</p>
      <div className="form-actions export-links">
        {link('visits', 'Записи за период')}
        {link('expenses', 'Расходы за период')}
        {link('clients', 'Все клиенты')}
      </div>
    </section>
  );
}

/** Supplies: stock levels, quick −1/+ buttons, and an alert when something runs low. */
export function StockTab() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Material | null>(null);
  const q = useQuery({
    queryKey: ['materials'],
    queryFn: () => api<Material[]>('/admin/materials'),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['materials'] });
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      id ? send(`/admin/materials/${id}`, 'PATCH', body) : send('/admin/materials', 'POST', body),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const stock = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      send(`/admin/materials/${id}/stock`, 'POST', { delta }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => send(`/admin/materials/${id}`, 'DELETE'),
    onSettled: () => {
      setEditing(null);
      refresh();
    },
  });
  const low = q.data?.filter((m) => m.quantity <= m.minQuantity) ?? [];
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>Склад</h2>
          <p className="caption">
            Отмечайте расход кнопкой «−1», а покупку — «+». Когда остаток дойдёт до минимума, придёт
            уведомление в Telegram и на телефон, а в понедельничном отчёте будет напоминание.
          </p>
        </div>
      </div>
      {low.length > 0 && (
        <p className="stock-low" role="status">
          Заканчивается: {low.map((m) => `${m.name} (${m.quantity} ${m.unit})`).join(', ')}
        </p>
      )}
      <form
        className="panel wa-form"
        key={editing?.id ?? 'new'}
        onSubmit={(e) => {
          const f = fd(e);
          save.mutate({
            id: editing?.id,
            body: {
              name: String(f.get('name')).trim(),
              unit: String(f.get('unit')).trim(),
              quantity: Number(f.get('quantity')),
              minQuantity: Number(f.get('minQuantity')),
            },
          });
        }}
      >
        <h3>{editing ? `Изменить: ${editing.name}` : 'Добавить материал'}</h3>
        <label>
          Название
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            placeholder="Краска Estel 7/1"
            defaultValue={editing?.name}
          />
        </label>
        <label>
          Единица
          <input
            name="unit"
            required
            maxLength={12}
            list="units"
            placeholder="шт"
            defaultValue={editing?.unit ?? 'шт'}
          />
          <datalist id="units">
            <option value="шт" />
            <option value="уп" />
            <option value="мл" />
            <option value="г" />
          </datalist>
        </label>
        <label>
          Остаток
          <input
            name="quantity"
            type="number"
            min="0"
            required
            defaultValue={editing?.quantity ?? 0}
          />
        </label>
        <label>
          Предупредить, когда останется
          <input
            name="minQuantity"
            type="number"
            min="0"
            required
            defaultValue={editing?.minQuantity ?? 2}
          />
        </label>
        {save.error && <ErrorBox error={save.error} />}
        <div className="form-actions">
          <button className="button" disabled={save.isPending}>
            {editing ? 'Сохранить' : 'Добавить'}
          </button>
          {editing && (
            <>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={remove.isPending}
                onClick={() => remove.mutate(editing.id)}
              >
                Удалить
              </button>
            </>
          )}
        </div>
      </form>
      {stock.error && <ErrorBox error={stock.error} />}
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <div className="empty">Материалов пока нет. Добавьте краски, шампуни, расходники.</div>
      ) : (
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Материал</th>
                <th>Остаток</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((m) => (
                <tr key={m.id} className={m.quantity <= m.minQuantity ? 'low' : ''}>
                  <td>
                    <button className="inline-link" onClick={() => setEditing(m)}>
                      {m.name}
                    </button>
                    <small>минимум {m.minQuantity}</small>
                  </td>
                  <td>
                    <strong>
                      {m.quantity} {m.unit}
                    </strong>
                  </td>
                  <td className="stock-buttons">
                    <button
                      className="button secondary"
                      aria-label={`Списать 1 ${m.unit}: ${m.name}`}
                      disabled={stock.isPending || m.quantity === 0}
                      onClick={() => stock.mutate({ id: m.id, delta: -1 })}
                    >
                      −1
                    </button>
                    <button
                      className="button secondary"
                      aria-label={`Приход: ${m.name}`}
                      disabled={stock.isPending}
                      onClick={() => {
                        const n = Number(prompt(`Сколько ${m.unit} пришло?`, '1'));
                        if (Number.isInteger(n) && n > 0) stock.mutate({ id: m.id, delta: n });
                      }}
                    >
                      +
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
