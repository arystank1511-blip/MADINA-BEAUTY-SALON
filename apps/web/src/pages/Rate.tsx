import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api, Config, dateLabel, send } from '../api';
import { ButtonLink, ErrorBox, Loading, WhatsAppLink } from '../components';
import { useT } from '../i18n';

interface VisitRating {
  name: string;
  serviceName: string;
  startsAt: string;
  canRate: boolean;
  rating: number | null;
  reviewUrl: string | null;
}

/**
 * «Как вам визит?» from the review request: 4–5 stars lead on to the public review page,
 * 1–3 stars ask what to improve and reach the owner privately.
 */
export function Rate({ config }: { config: Config }) {
  const { ref = '' } = useParams();
  const { t, locale } = useT();
  const [stars, setStars] = useState(0),
    [hover, setHover] = useState(0),
    [feedback, setFeedback] = useState('');
  const visit = useQuery({
    queryKey: ['visit', ref],
    queryFn: () => api<VisitRating>(`/visit/${encodeURIComponent(ref)}`),
    retry: false,
  });
  const rate = useMutation({
    mutationFn: (body: { rating: number; feedback?: string }) =>
      send<{ rating: number; reviewUrl: string | null }>(
        `/visit/${encodeURIComponent(ref)}/rate`,
        'POST',
        body,
      ),
  });
  if (visit.isPending) return <Loading />;
  if (visit.error)
    return (
      <section className="page success-page">
        <h1>{t('Ссылка не найдена')}</h1>
        <ErrorBox error={visit.error} />
        <ButtonLink to="/">{t('На главную')}</ButtonLink>
      </section>
    );
  const v = visit.data;
  const done = rate.data;
  const choose = (n: number) => {
    setStars(n);
    // Happy clients are done in one tap; for 1–3 stars we first ask what went wrong.
    if (n >= 4) rate.mutate({ rating: n });
  };
  return (
    <section className="page rate-page">
      <p className="eyebrow">{t('ВАШ ВИЗИТ')}</p>
      <h1>{v.name ? t('{name}, как вам у нас?', { name: v.name }) : t('Как вам у нас?')}</h1>
      <p className="page-intro">
        {t(v.serviceName)} · {dateLabel(v.startsAt, config.timezone, locale)}
      </p>
      {!v.canRate ? (
        <p>{t('Оценить визит можно после того, как он состоится.')}</p>
      ) : done && done.rating >= 4 ? (
        <div className="rate-done">
          <h2>{t('Спасибо! Нам очень приятно.')}</h2>
          {done.reviewUrl && (
            <>
              <p>
                {t(
                  'Поделитесь, пожалуйста, впечатлением в 2ГИС — это минута, а другим людям так проще выбрать мастера.',
                )}
              </p>
              <a className="button" href={done.reviewUrl} target="_blank" rel="noopener noreferrer">
                {t('Оставить отзыв')}
              </a>
            </>
          )}
        </div>
      ) : done ? (
        <div className="rate-done">
          <h2>{t('Спасибо, что рассказали.')}</h2>
          <p>
            {t(
              'Хозяйка салона прочитает ваше сообщение и свяжется с вами. Нам важно это исправить.',
            )}
          </p>
          <WhatsAppLink config={config}>{t('Написать в WhatsApp')}</WhatsAppLink>
        </div>
      ) : (
        <>
          <div className="stars-pick" role="radiogroup" aria-label={t('Оценка')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={stars === n}
                aria-label={t('{n} из 5', { n })}
                className={n <= (hover || stars) ? 'on' : ''}
                disabled={rate.isPending}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => choose(n)}
              >
                <Star size={40} fill="currentColor" aria-hidden="true" />
              </button>
            ))}
          </div>
          {stars > 0 && stars <= 3 && (
            <form
              className="rate-form"
              onSubmit={(e) => {
                e.preventDefault();
                rate.mutate({ rating: stars, feedback: feedback.trim() || undefined });
              }}
            >
              <label>
                {t('Что нам улучшить? Это прочитает только хозяйка салона.')}
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </label>
              <button className="button" disabled={rate.isPending}>
                {rate.isPending ? t('Отправляем…') : t('Отправить')}
              </button>
            </form>
          )}
          {rate.error && <ErrorBox error={rate.error} />}
        </>
      )}
    </section>
  );
}
