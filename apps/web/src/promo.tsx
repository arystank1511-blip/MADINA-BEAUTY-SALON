import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Config, phoneLabel } from './api';

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="button secondary"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          },
          () => undefined,
        )
      }
    >
      {done ? 'Скопировано ✓' : 'Копировать'}
    </button>
  );
}

function Block({ title, text, hint }: { title: string; text: string; hint?: string }) {
  return (
    <div className="promo-block">
      <div className="promo-block-head">
        <h4>{title}</h4>
        <Copy text={text} />
      </div>
      <pre>{text}</pre>
      {hint && <p className="caption">{hint}</p>}
    </div>
  );
}

/**
 * Ready texts and step-by-step instructions for the salon's map cards (2GIS, Google, Yandex),
 * Instagram and WhatsApp Business, all pointing to online booking.
 */
export function PromoKit({ config }: { config: Config }) {
  const book = `${location.origin}/book`;
  const phone = phoneLabel(config.whatsapp);
  const about = [
    `Парикмахерская «${config.name}» в Зеренде. Мужской и женский зал: стрижки для всей семьи — от малышей до взрослых, окрашивание, укладки и причёски.`,
    `Онлайн-запись без регистрации за одну минуту: ${book}`,
    `WhatsApp: ${phone}. Оплата наличными или Kaspi QR.`,
  ].join('\n');
  const bio = [
    `✂️ Парикмахерская «${config.name}» · Зеренда`,
    '👩‍👧‍👦 Мужской и женский зал',
    `📍 ${config.address.split(',').slice(0, 3).join(',')}`,
    '👇 Запись онлайн за минуту',
  ].join('\n');
  const greeting = [
    `Здравствуйте! Это парикмахерская «${config.name}» 💇‍♀️`,
    `Записаться самому за минуту, со свободным временем: ${book}`,
    'Или напишите, на какую услугу и когда удобно — ответим.',
  ].join('\n');
  const away = [
    `Здравствуйте! Сейчас мы не на связи, ответим утром.`,
    `Записаться можно прямо сейчас, без ожидания: ${book}`,
  ].join('\n');
  return (
    <section className="panel promo-kit">
      <h3>Продвижение: карты, Instagram, WhatsApp</h3>
      <p className="caption">
        Люди в селе выбирают по карте и отзывам. Заполните карточки один раз — дальше клиенты сами
        находят салон и записываются по ссылке. Тексты ниже уже готовы, нажмите «Копировать».
      </p>

      <h4 className="promo-step">1. 2ГИС — самое важное</h4>
      <ol className="promo-list">
        <li>
          Откройте приложение 2ГИС → найдите салон по адресу. Если его нет: «Добавить организацию»
          (или сайт <b>business.2gis.kz</b>).
        </li>
        <li>Рубрика «Парикмахерские», адрес: {config.address}.</li>
        <li>
          Часы работы: {config.hours}. Телефон и WhatsApp: {phone}.
        </li>
        <li>
          Сайт / ссылка для записи: <b>{book}</b>
        </li>
        <li>Описание — текст ниже. Фото: вход, зал, кресло, 5–10 работ, прайс.</li>
      </ol>
      <Block title="Описание салона (2ГИС, Google, Яндекс)" text={about} />

      <h4 className="promo-step">2. Google Карты и Яндекс Карты</h4>
      <ol className="promo-list">
        <li>
          Google: <b>business.google.com</b> → «Добавить компанию». Подтверждение — по SMS или
          звонку.
        </li>
        <li>
          Яндекс: <b>yandex.kz/sprav</b> → «Добавить организацию».
        </li>
        <li>Те же данные, описание и фото. В поле «Сайт» и «Запись» — ссылка выше.</li>
      </ol>

      <h4 className="promo-step">3. Instagram</h4>
      <ol className="promo-list">
        <li>Профиль → «Редактировать» → «Описание» — текст ниже.</li>
        <li>
          «Ссылки» → «Добавить внешнюю ссылку»: <b>{book}</b>, название «Записаться онлайн».
        </li>
        <li>
          Сделайте «Актуальное»: «Цены» (скрин прайса с сайта), «Работы» (до/после), «Запись»
          (видео, как записаться по ссылке).
        </li>
      </ol>
      <Block
        title="Описание профиля Instagram"
        text={bio}
        hint="Instagram разрешает до 150 знаков."
      />

      <h4 className="promo-step">4. WhatsApp Business</h4>
      <ol className="promo-list">
        <li>
          Настройки → «Инструменты для бизнеса» → «Приветственное сообщение» — первый текст ниже.
        </li>
        <li>«Сообщение об отсутствии» (по расписанию, вечером и ночью) — второй текст.</li>
        <li>«Профиль компании» → «Сайт»: ссылка на запись.</li>
      </ol>
      <Block title="Приветственное сообщение" text={greeting} />
      <Block title="Сообщение об отсутствии" text={away} />

      <h4 className="promo-step">5. В салоне</h4>
      <p>
        Плакат с QR-кодом у зеркала и визитки, которые Нургуль отдаёт после стрижки:{' '}
        <Link to="/poster" target="_blank">
          открыть плакат и визитки для печати
        </Link>
        .
      </p>
    </section>
  );
}
