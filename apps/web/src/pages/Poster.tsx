import { useState } from 'react';
import { Printer } from 'lucide-react';
import '@fontsource/cormorant-garamond/600.css';
import { Config, phoneLabel } from '../api';
import { WhatsAppIcon } from '../components';
import { Qr } from '../qr';

/**
 * A printable A4 poster «Записаться онлайн» and a sheet of 10 business cards, both with a QR code
 * to the booking page. Opened from the admin «Сайт» tab.
 */
export function Poster({ config }: { config: Config }) {
  const [kind, setKind] = useState<'poster' | 'cards'>('poster');
  const book = `${location.origin}/book`;
  const site = `${location.host}/book`;
  const print = (k: 'poster' | 'cards') => {
    setKind(k);
    // Let React render the chosen sheet before the print dialog opens.
    setTimeout(() => window.print(), 50);
  };
  return (
    <section className={`page poster-page print-${kind}`}>
      <div className="poster-actions no-print">
        <h1>Плакат и визитки</h1>
        <p className="caption">
          QR-код ведёт на запись. Плакат повесьте у зеркала или на входе, визитки отдавайте после
          стрижки. Печать на обычной бумаге A4, лучше в цвете.
        </p>
        <div className="form-actions">
          <button className="button" onClick={() => print('poster')}>
            <Printer size={18} /> Печать плаката
          </button>
          <button className="button secondary" onClick={() => print('cards')}>
            <Printer size={18} /> Печать визиток (10 шт. на листе)
          </button>
        </div>
      </div>

      <article className="poster-sheet">
        <div className="poster-band">
          <img src="/images/madina-logo.svg" alt="" className="poster-mark" />
          <span>ПАРИКМАХЕРСКАЯ</span>
        </div>
        <div className="poster-body">
          <p className="poster-eyebrow">ОНЛАЙН-ЗАПИСЬ · ОНЛАЙН ЖАЗЫЛУ</p>
          <h2>
            Записаться
            <br />
            за одну минуту
          </h2>
          <div className="poster-qr">
            <Qr text={book} className="poster-qr-code" />
          </div>
          <p className="poster-scan">Наведите камеру телефона на код</p>
          <p className="poster-scan-kk">Телефон камерасын кодқа бағыттаңыз</p>
          <ol className="poster-steps">
            <li>
              <b>1</b>Выберите услугу
            </li>
            <li>
              <b>2</b>Удобное время
            </li>
            <li>
              <b>3</b>Подтвердим в WhatsApp
            </li>
          </ol>
          <div className="poster-foot">
            <span>
              <WhatsAppIcon size={18} /> {phoneLabel(config.whatsapp)}
            </span>
            <span>{site}</span>
          </div>
        </div>
      </article>

      <div className="cards-sheet">
        {Array.from({ length: 10 }, (_, i) => (
          <article className="biz-card" key={i}>
            <div className="biz-band">
              <img src="/images/madina-logo.svg" alt="" />
            </div>
            <div className="biz-body">
              <p className="biz-title">Онлайн-запись</p>
              <Qr text={book} className="biz-qr" />
              <p className="biz-line">
                <WhatsAppIcon size={11} /> {phoneLabel(config.whatsapp)}
              </p>
              <p className="biz-addr">{config.address.split(',').slice(0, 3).join(',')}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
