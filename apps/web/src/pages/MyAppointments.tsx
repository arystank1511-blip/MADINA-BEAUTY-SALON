import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Appointment, Config, dateLabel, money, Page, send, timeLabel } from '../api';
import { Arrow, ButtonLink, ErrorBox, Loading, Modal } from '../components';
export const statusNames = {
  CONFIRMED: 'Подтверждена',
  CANCELLED: 'Отменена',
  COMPLETED: 'Завершена',
};
export function MyAppointments({ config }: { config: Config }) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Appointment | null>(null),
    [notice, setNotice] = useState('');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['appointments', 'my', page],
    queryFn: () => api<Page<Appointment>>(`/appointments/my?page=${page}`),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => send(`/appointments/${id}/cancel`, 'PATCH'),
    onSuccess: () => {
      setSelected(null);
      setNotice('Запись отменена. Вы можете выбрать новое время.');
      void client.invalidateQueries({ queryKey: ['appointments'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
  const future = (a: Appointment) => new Date(a.startsAt) > new Date() && a.status === 'CONFIRMED';
  return (
    <section className="page">
      <div className="page-top">
        <div>
          <p className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</p>
          <h1>Мои записи.</h1>
        </div>
        <ButtonLink to="/book">Новая запись</ButtonLink>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorBox error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.items.length ? (
        <div className="empty">
          <h2>Здесь будут ваши посещения</h2>
          <p>Самое время запланировать первое.</p>
          <ButtonLink to="/book">Выбрать услугу</ButtonLink>
        </div>
      ) : (
        <>
          {[
            ['Предстоящие', true],
            ['История посещений', false],
          ].map(([label, upcoming]) => (
            <div className="appointment-group" key={String(label)}>
              <h2>{label}</h2>
              {query.data.items
                .filter((a) => future(a) === upcoming)
                .map((a) => (
                  <article className="appointment-card" key={a.id}>
                    <div className="appointment-date">
                      <strong>{dateLabel(a.startsAt, config.timezone)}</strong>
                      <span>
                        {timeLabel(a.startsAt, config.timezone)} · {config.timezone}
                      </span>
                    </div>
                    <div>
                      <span className={`badge ${a.status.toLowerCase()}`}>
                        {statusNames[a.status]}
                      </span>
                      <h3>{a.serviceName}</h3>
                      <p>
                        {a.master.name} · {a.durationMinutes} мин
                      </p>
                    </div>
                    <strong>{money(a.priceMinor, config.currency)}</strong>
                    {future(a) && (
                      <button
                        className="text-button"
                        onClick={() => {
                          cancel.reset();
                          setSelected(a);
                        }}
                      >
                        Отменить <Arrow />
                      </button>
                    )}
                  </article>
                ))}
              {!query.data.items.some((a) => future(a) === upcoming) && (
                <p className="muted">На этой странице записей нет.</p>
              )}
            </div>
          ))}
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Назад
            </button>
            <span>Страница {page}</span>
            <button disabled={page * 20 >= query.data.total} onClick={() => setPage(page + 1)}>
              Далее
            </button>
          </div>
        </>
      )}
      {selected && (
        <Modal title="Отменить посещение?" onClose={() => !cancel.isPending && setSelected(null)}>
          <p>
            {selected.serviceName}
            <br />
            {dateLabel(selected.startsAt, config.timezone)} в{' '}
            {timeLabel(selected.startsAt, config.timezone)}
          </p>
          <p>Это время снова станет доступно для записи.</p>
          {cancel.error && <ErrorBox error={cancel.error} />}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={cancel.isPending}
              onClick={() => setSelected(null)}
            >
              Оставить запись
            </button>
            <button
              className="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(selected.id)}
            >
              {cancel.isPending ? 'Отменяем…' : 'Да, отменить'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
