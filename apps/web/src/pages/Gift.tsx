import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Qr } from '../qr';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import { api, Config, dateLabel, money } from '../api';
import { ButtonLink, ErrorBox, Loading, WhatsAppIcon } from '../components';
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
  const url = `${location.origin}/gift/${g.code}`;
  // «10 000 ₸» → the number large, the currency sign smaller beside it.
  const amount = money(g.amountMinor, config.currency);
  const sign = amount.replace(/[\d\s\u00a0\u202f.,]/g, '');
  const digits = amount.replace(sign, '').trim();
  return (
    <section className="page gift-page">
      <div className="gc-sheet">
        <article className={`gc ${g.status !== 'ACTIVE' ? 'inactive' : ''}`}>
          <aside className="gc-band" aria-hidden="true">
            <img src="/images/madina-logo.svg" alt="" className="gc-mark" />
            <span className="gc-band-sub">{t('ПАРИКМАХЕРСКАЯ')}</span>
          </aside>
          <div className="gc-body">
            <div className="gc-head">
              <span className="gc-eyebrow">{t('ПОДАРОЧНЫЙ СЕРТИФИКАТ')}</span>
              <span className="gc-no">№ {g.code}</span>
            </div>
            <p className="gc-amount">
              {digits}
              <span>{sign}</span>
            </p>
            <div className="gc-names">
              <p>
                <small>{t('Для')}</small>
                <strong>{g.recipient}</strong>
              </p>
              {g.sender && (
                <p>
                  <small>{t('От кого')}</small>
                  <em>{g.sender}</em>
                </p>
              )}
            </div>
            <div className="gc-foot">
              <dl>
                <div>
                  <dt>{t('Код')}</dt>
                  <dd className="gc-code">{g.code}</dd>
                </div>
                <div>
                  <dt>{t('Действует до')}</dt>
                  <dd>{dateLabel(g.expiresAt, config.timezone, locale).replace(/ г\.$/, '')}</dd>
                </div>
              </dl>
              <div className="gc-qr-wrap">
                <Qr text={url} />
                <span>{t('Проверить')}</span>
              </div>
            </div>
          </div>
          {g.status !== 'ACTIVE' && (
            <span className="gc-stamp">
              {g.status === 'USED' ? t('Использован') : t('Срок истёк')}
            </span>
          )}
        </article>
        <p className="gc-cut no-screen">✂ {t('линия отреза')}</p>
      </div>
      <div className="form-actions no-print">
        <button className="button" onClick={() => print()}>
          <Printer size={18} /> {t('Распечатать')}
        </button>
        {/* No number: WhatsApp asks whom to send the certificate to. */}
        <a
          className="button ghost"
          href={`https://wa.me/?text=${encodeURIComponent(
            t('Подарочный сертификат в салон «{name}» для вас: {url}', { name: config.name, url }),
          )}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsAppIcon size={18} /> {t('Отправить в WhatsApp')}
        </a>
        <ButtonLink to="/book" secondary>
          {t('Записаться')}
        </ButtonLink>
      </div>
      <p className="caption gc-hint no-print">
        {t('Для печати выберите альбомную ориентацию — сертификат займёт половину листа A4.')}
      </p>
    </section>
  );
}
