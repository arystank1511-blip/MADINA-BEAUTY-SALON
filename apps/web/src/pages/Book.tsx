import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft } from 'lucide-react';
import {
  addDays,
  api,
  ApiError,
  Appointment,
  Config,
  dateLabel,
  money,
  Page,
  send,
  Slot,
  timeLabel,
  todayIn,
  User,
  useMasters,
  useServices,
} from '../api';
import { Arrow, ButtonLink, ErrorBox, Loading, WhatsAppIcon, WhatsAppLink } from '../components';
export function Book({ config, admin = false }: { config: Config; admin?: boolean }) {
  const [params, setParams] = useSearchParams(),
    services = useServices(),
    masters = useMasters(),
    client = useQueryClient();
  const [error, setError] = useState<unknown>(null),
    [success, setSuccess] = useState<Appointment | null>(null),
    [customer, setCustomer] = useState(''),
    [guestName, setGuestName] = useState(''),
    [sent, setSent] = useState(false);
  const [customerPage, setCustomerPage] = useState(1);
  const serviceId = params.get('service') || '',
    masterId = params.get('master') || '',
    pinned = params.get('pinned') || '';
  const rawDate = params.get('date') || '',
    rawTime = params.get('time') || '';
  const parsedDate = new Date(rawDate + 'T12:00:00Z');
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(rawDate) &&
    Number.isFinite(+parsedDate) &&
    parsedDate.toISOString().slice(0, 10) === rawDate
      ? rawDate
      : todayIn(config.timezone);
  const time =
    /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(rawTime) &&
    Number.isFinite(Date.parse(rawTime))
      ? new Date(rawTime).toISOString()
      : '';
  const rawStep = Number(params.get('step'));
  const step = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= 4 ? rawStep : 1;
  const service = services.data?.find((s) => s.id === serviceId),
    master = masters.data?.find((m) => m.id === masterId);
  const availableMasters =
    masters.data?.filter((m) => m.services.some((s) => s.serviceId === serviceId)) || [];
  const pinnedMaster = masters.data?.find((m) => m.id === pinned);
  const availableServices =
    services.data?.filter(
      (s) => !pinnedMaster || pinnedMaster.services.some((ms) => ms.serviceId === s.id),
    ) || [];
  function change(values: Record<string, string | undefined>) {
    const p = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setParams(p, { replace: true });
  }
  useEffect(() => {
    if (services.data && masters.data) {
      if (serviceId && !service) {
        change({ service: undefined, master: undefined, time: undefined, step: '1' });
        return;
      }
      if (
        masterId &&
        (!master || (service && !master.services.some((s) => s.serviceId === serviceId)))
      )
        change({
          master: undefined,
          time: undefined,
          pinned: undefined,
          step: service ? '2' : '1',
        });
    }
  }, [services.data, masters.data, serviceId, masterId]);
  const availability = useQuery({
    queryKey: ['availability', serviceId, masterId, date],
    queryFn: ({ signal }) =>
      api<{ slots: Slot[] }>(
        `/availability?serviceId=${serviceId}&masterId=${masterId}&date=${date}`,
        { signal },
      ),
    enabled: !!service && !!master,
    staleTime: 0,
  });
  const customers = useQuery({
    queryKey: ['customers', customerPage],
    queryFn: () => api<Page<User>>(`/admin/customers?page=${customerPage}&pageSize=100`),
    enabled: admin,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const fresh = await availability.refetch();
      if (fresh.error) throw fresh.error;
      if (!fresh.data?.slots.some((s) => s.startsAt === time))
        throw new ApiError(409, 'SLOT_UNAVAILABLE', 'Это время уже занято. Выберите другой слот.');
      return send<Appointment>(admin ? '/admin/appointments' : '/appointments', 'POST', {
        serviceId,
        masterId,
        startsAt: time,
        ...(admin ? { customerId: customer } : {}),
      });
    },
    onSuccess: (a) => {
      setSuccess(a);
      void client.invalidateQueries({ queryKey: ['appointments'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (e) => {
      setError(e);
      if (e instanceof ApiError && e.status === 409) {
        change({ time: undefined, step: '3' });
        void availability.refetch();
      }
      if (e instanceof ApiError && e.status === 401)
        void client.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const whatsappText = [
    `Здравствуйте! Хочу записаться в салон «${config.name}».`,
    service && `Услуга: ${service.name} (${money(service.priceMinor, config.currency)})`,
    master && `Мастер: ${master.name}`,
    time && `Время: ${dateLabel(time, config.timezone)}, ${timeLabel(time, config.timezone)}`,
    guestName.trim() && `Меня зовут ${guestName.trim()}.`,
  ]
    .filter(Boolean)
    .join('\n');
  function notifySalon() {
    setSent(true);
    // Telegram notification is best effort: WhatsApp opens even if it fails.
    void send('/booking-requests', 'POST', {
      serviceId,
      ...(masterId ? { masterId } : {}),
      ...(time ? { startsAt: time } : {}),
      ...(guestName.trim() ? { name: guestName.trim() } : {}),
    }).catch(() => undefined);
  }
  const summary = (
    <>
      <p className="eyebrow">ВАША ЗАПИСЬ</p>
      <h3>{service?.name || 'Начнём с услуги'}</h3>
      <dl>
        <div>
          <dt>Мастер</dt>
          <dd>{master?.name || 'Не выбран'}</dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd>{dateLabel(date + 'T12:00:00Z', config.timezone)}</dd>
        </div>
        <div>
          <dt>Время</dt>
          <dd>{time ? timeLabel(time, config.timezone) : 'Не выбрано'}</dd>
        </div>
        <div>
          <dt>Длительность</dt>
          <dd>{service ? `${service.durationMinutes} мин` : '—'}</dd>
        </div>
      </dl>
      <div className="total">
        <span>Итого</span>
        <strong>{service ? money(service.priceMinor, config.currency) : '—'}</strong>
      </div>
      <p className="caption">
        Все часы указаны по времени салона:
        <br />
        {config.timezone}. Оплата в салоне.
      </p>
    </>
  );
  if (sent && !admin)
    return (
      <section className="page success-page">
        <span className="success-icon whatsapp-success">
          <WhatsAppIcon size={34} />
        </span>
        <p className="eyebrow">ПОЧТИ ГОТОВО</p>
        <h1>Отправьте сообщение.</h1>
        <p className="page-intro">
          Мы открыли WhatsApp с готовым текстом заявки. Отправьте его — мастер подтвердит время в
          ответ.
          <br />
          {service?.name}
          {time && ` · ${dateLabel(time, config.timezone)}, ${timeLabel(time, config.timezone)}`}
        </p>
        <div className="form-actions">
          <WhatsAppLink config={config} text={whatsappText}>
            Открыть WhatsApp ещё раз
          </WhatsAppLink>
          <ButtonLink to="/" secondary>
            На главную
          </ButtonLink>
        </div>
      </section>
    );
  if (success)
    return (
      <section className="page success-page">
        <span className="success-icon">
          <Check size={32} />
        </span>
        <p className="eyebrow">ДО ВСТРЕЧИ</p>
        <h1>Вы записаны.</h1>
        <p className="page-intro">
          {success.serviceName} · {success.master.name}
          <br />
          {dateLabel(success.startsAt, config.timezone)},{' '}
          {timeLabel(success.startsAt, config.timezone)}
          <br />
          {money(success.priceMinor, config.currency)}
        </p>
        <ButtonLink to="/admin">Все записи</ButtonLink>
      </section>
    );
  return (
    <section className="page booking-page">
      <p className="eyebrow">
        {admin ? 'ЗАПИСЬ КЛИЕНТА' : 'ОНЛАЙН-ЗАПИСЬ'} / {config.name}
      </p>
      <h1>Время для себя.</h1>
      <p className="page-intro">Выберите детали. Всё остальное оставьте нам.</p>
      <ol className="progress-steps">
        {['Услуга', 'Мастер', 'Дата и время', 'Подтверждение'].map((label, i) => (
          <li key={label} className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}>
            <button disabled={i + 1 > step} onClick={() => change({ step: String(i + 1) })}>
              <span>{step > i + 1 ? <Check size={16} /> : String(i + 1).padStart(2, '0')}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <div className="booking-grid">
        <div className="booking-main">
          {error != null && <ErrorBox error={error} />}
          <div className="booking-step-heading">
            {step > 1 && (
              <button
                className="icon-button"
                aria-label="Назад"
                onClick={() => change({ step: String(step - 1) })}
              >
                <ChevronLeft />
              </button>
            )}
            <h2>
              {['Выберите услугу', 'Выберите мастера', 'Когда вам удобно?', 'Всё верно?'][step - 1]}
            </h2>
          </div>
          {step === 1 &&
            (services.isPending ? (
              <Loading />
            ) : services.error ? (
              <ErrorBox error={services.error} retry={() => void services.refetch()} />
            ) : (
              <>
                {pinnedMaster && (
                  <p>
                    Услуги мастера {pinnedMaster.name}.{' '}
                    <button
                      className="inline-link"
                      onClick={() => change({ pinned: undefined, master: undefined })}
                    >
                      Показать все
                    </button>
                  </p>
                )}
                <div className="choice-list">
                  {availableServices.map((s) => (
                    <button
                      className={`choice ${serviceId === s.id ? 'selected' : ''}`}
                      key={s.id}
                      onClick={() => {
                        setError(null);
                        // With a single master for this service the choice is obvious: skip it.
                        const only = masters.data?.filter((m) =>
                          m.services.some((ms) => ms.serviceId === s.id),
                        );
                        const preset = pinned || (only?.length === 1 ? only[0].id : undefined);
                        change({
                          service: s.id,
                          master: preset,
                          time: undefined,
                          step: preset ? '3' : '2',
                        });
                      }}
                    >
                      <div>
                        <h3>{s.name}</h3>
                        <p>{s.description}</p>
                        <span>{s.durationMinutes} мин</span>
                      </div>
                      <strong>
                        {money(s.priceMinor, config.currency)}
                        {serviceId === s.id ? <Check size={18} /> : <Arrow />}
                      </strong>
                    </button>
                  ))}
                </div>
              </>
            ))}
          {step === 2 &&
            (masters.isPending ? (
              <Loading />
            ) : masters.error ? (
              <ErrorBox error={masters.error} retry={() => void masters.refetch()} />
            ) : !service ? (
              <ButtonLink to="/book">Выбрать услугу</ButtonLink>
            ) : (
              <div className="choice-list">
                {availableMasters.map((m) => (
                  <button
                    className={`choice ${masterId === m.id ? 'selected' : ''}`}
                    key={m.id}
                    onClick={() => {
                      setError(null);
                      change({ master: m.id, time: undefined, step: '3' });
                    }}
                  >
                    <div>
                      <h3>{m.name}</h3>
                      <p>{m.description}</p>
                    </div>
                    {masterId === m.id ? <Check /> : <Arrow />}
                  </button>
                ))}
                {availableMasters.length === 0 && (
                  <p>Для этой услуги пока нет доступных мастеров. Выберите другую услугу.</p>
                )}
              </div>
            ))}
          {step === 3 && (
            <>
              <label className="date-picker">
                Дата посещения
                <input
                  type="date"
                  min={todayIn(config.timezone)}
                  max={addDays(todayIn(config.timezone), 59)}
                  value={date}
                  onChange={(e) => {
                    if (e.target.value) {
                      setError(null);
                      change({ date: e.target.value, time: undefined });
                    }
                  }}
                />
              </label>
              <p className="caption">Время салона · {config.timezone}</p>
              {!service || !master ? (
                <p>Сначала выберите услугу и мастера.</p>
              ) : availability.isFetching ? (
                <Loading />
              ) : availability.error ? (
                <ErrorBox error={availability.error} retry={() => void availability.refetch()} />
              ) : availability.data?.slots.length ? (
                <>
                  <div className="slots" aria-label="Свободное время">
                    {availability.data.slots.map((s) => (
                      <button
                        aria-pressed={time === s.startsAt}
                        key={s.startsAt}
                        className={time === s.startsAt ? 'selected' : ''}
                        onClick={() => {
                          setError(null);
                          change({ time: s.startsAt });
                        }}
                      >
                        {timeLabel(s.startsAt, config.timezone)}
                      </button>
                    ))}
                  </div>
                  <button className="button" disabled={!time} onClick={() => change({ step: '4' })}>
                    Продолжить <Arrow />
                  </button>
                </>
              ) : (
                <div className="empty">
                  <h3>На эту дату свободного времени нет</h3>
                  <p>Попробуйте другой день или выберите другого мастера.</p>
                  <button
                    className="button secondary"
                    disabled={date >= addDays(todayIn(config.timezone), 59)}
                    onClick={() => change({ date: addDays(date, 1), time: undefined })}
                  >
                    Следующий день <Arrow />
                  </button>
                </div>
              )}
            </>
          )}
          {step === 4 && (
            <>
              <div className="review">
                <h3>{service?.name}</h3>
                <p>
                  {master?.name} · {service?.durationMinutes} мин
                </p>
                <p>
                  {time
                    ? `${dateLabel(time, config.timezone)} · ${timeLabel(time, config.timezone)}`
                    : 'Выберите время на предыдущем шаге.'}
                </p>
                <strong>{service && money(service.priceMinor, config.currency)}</strong>
              </div>
              {admin && (
                <>
                  <label>
                    Клиент
                    <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
                      <option value="">Выберите клиента</option>
                      {customers.data?.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="pagination">
                    <button
                      disabled={customerPage <= 1}
                      onClick={() => setCustomerPage(customerPage - 1)}
                    >
                      Назад
                    </button>
                    <button
                      disabled={!customers.data || customerPage * 100 >= customers.data.total}
                      onClick={() => setCustomerPage(customerPage + 1)}
                    >
                      Ещё клиенты
                    </button>
                  </div>
                  {customers.error && <ErrorBox error={customers.error} />}
                </>
              )}
              {!admin ? (
                <div className="login-prompt whatsapp-prompt">
                  <h3>Подтвердим в WhatsApp</h3>
                  <p>
                    Нажмите кнопку — откроется чат салона с готовым сообщением. Регистрация не
                    нужна.
                  </p>
                  <label>
                    Ваше имя (необязательно)
                    <input
                      autoComplete="given-name"
                      maxLength={80}
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                    />
                  </label>
                  <WhatsAppLink config={config} text={whatsappText} onClick={notifySalon}>
                    Записаться через WhatsApp
                  </WhatsAppLink>
                </div>
              ) : (
                <>
                  <p className="caption">
                    Запись на имя{' '}
                    {customers.data?.items.find((c) => c.id === customer)?.name ||
                      'выбранного клиента'}
                    .
                  </p>
                  <button
                    className="button"
                    disabled={
                      !time || !master || !service || mutation.isPending || (admin && !customer)
                    }
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? 'Подтверждаем…' : 'Подтвердить запись'}
                    <Arrow />
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <aside className="booking-summary">
          <div className="desktop-summary">{summary}</div>
          <details className="mobile-summary">
            <summary>Детали записи {service && money(service.priceMinor, config.currency)}</summary>
            {summary}
          </details>
        </aside>
      </div>
    </section>
  );
}
