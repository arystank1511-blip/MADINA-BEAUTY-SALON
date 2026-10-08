import { FormEvent, Fragment, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Temporal } from '@js-temporal/polyfill';
import { Check } from 'lucide-react';
import {
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
  useMasters,
  useServices,
  Window,
} from '../api';
import { ButtonLink, ErrorBox, Loading, Modal } from '../components';
export const statusNames = {
  PENDING: 'Ждёт подтверждения',
  CONFIRMED: 'Подтверждена',
  CANCELLED: 'Отменена',
  COMPLETED: 'Завершена',
  NO_SHOW: 'Не пришёл',
};
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
        {['Записи', 'Услуги', 'Мастера', 'Расписание', 'Пароль'].map((t) => (
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
      type: 'cancel' | 'complete';
    } | null>(null);
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
      void client.invalidateQueries({ queryKey: ['appointments'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
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
                      <td>{money(a.priceMinor, config.currency)}</td>
                      <td>
                        <span className={`badge ${a.status.toLowerCase()}`}>
                          {statusNames[a.status]}
                        </span>
                      </td>
                      <td>
                        {(a.status === 'CONFIRMED' || a.status === 'PENDING') &&
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
                        {a.status === 'CONFIRMED' && new Date(a.endsAt) <= new Date() && (
                          <button
                            onClick={() => {
                              mutation.reset();
                              setAction({ appointment: a, type: 'complete' });
                            }}
                          >
                            Завершить
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
      {action && (
        <Modal
          title={action.type === 'cancel' ? 'Отменить запись?' : 'Завершить посещение?'}
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
