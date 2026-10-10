import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api, Config, dateLabel, money, phoneLabel } from '../api';
import { ButtonLink, ErrorBox, Loading } from '../components';
import { useT } from '../i18n';

interface GiftInfo {
  code: string;
  amountMinor: number;
  recipient: string;
  sender: string;
  expiresAt: string;
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
}

/** A gift certificate as a page to print or send: /gift/<code>. */
export function Gift({ config }: { config: Config }) {
  const { code = '' } = useParams();
  const { t, locale } = useT();
  const q = useQuery({
    queryKey: ['gift', code],
    queryFn: () => api<GiftInfo>(`/gift/${encodeURIComponent(code)}`),
    retry: false,
  });
  if (q.isPending) return <Loading />;
  if (q.error)
    return (
      <section className="page success-page">
        <h1>{t('Сертификат не найден')}</h1>
        <ErrorBox error={q.error} />
        <ButtonLink to="/">{t('На главную')}</ButtonLink>
      </section>
    );
  const g = q.data;
  return (
    <section className="page gift-page">
      <article className={`gift-card ${g.status !== 'ACTIVE' ? 'inactive' : ''}`}>
        <img className="gift-logo" src="/images/madina-logo-header.svg" alt={config.name} />
        <p className="eyebrow">{t('ПОДАРОЧНЫЙ СЕРТИФИКАТ')}</p>
        <p className="gift-amount">{money(g.amountMinor, config.currency)}</p>
        <p className="gift-to">
          {t('Для: {name}', { name: g.recipient })}
          {g.sender && (
            <>
              <br />
              <span>{g.sender}</span>
            </>
          )}
        </p>
        <dl>
          <div>
            <dt>{t('Код')}</dt>
            <dd>{g.code}</dd>
          </div>
          <div>
            <dt>{t('Действует до')}</dt>
            <dd>{dateLabel(g.expiresAt, config.timezone, locale)}</dd>
          </div>
        </dl>
        <p className="caption">
          {t('На любые услуги салона. Запись: {site} или WhatsApp {phone}.', {
            site: location.host + '/book',
            phone: phoneLabel(config.whatsapp),
          })}
          <br />
          {t(config.address)}
        </p>
        {g.status !== 'ACTIVE' && (
          <p className="gift-status">
            {g.status === 'USED' ? t('Сертификат уже использован') : t('Срок действия истёк')}
          </p>
        )}
      </article>
      <div className="form-actions no-print">
        <button className="button" onClick={() => print()}>
          <Printer size={18} /> {t('Распечатать')}
        </button>
        <ButtonLink to="/book" secondary>
          {t('Записаться')}
        </ButtonLink>
      </div>
    </section>
  );
}
