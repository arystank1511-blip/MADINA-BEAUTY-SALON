import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  Clock,
  Gift,
  MapPin,
  Phone,
  Wallet,
  Scissors,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { byCategory, Config, money, phoneLabel, Service, useMasters, useServices } from '../api';
import {
  ButtonLink,
  ErrorBox,
  Halftone,
  Loading,
  Section,
  ServiceRows,
  WhatsAppIcon,
  WhatsAppLink,
} from '../components';
import { Gallery, PromoBanner, useGallery, useLoyalty } from '../site';
import { useT } from '../i18n';
export function Home({ config }: { config: Config }) {
  const services = useServices(),
    masters = useMasters(),
    gallery = useGallery();
  const { t } = useT();
  return (
    <>
      <PromoBanner />
      <section className="hero">
        <Halftone id="hero" />
        <div className="hero-top">
          <span>{t('ПАРИКМАХЕРСКАЯ «{name}»', { name: config.name.toUpperCase() })}</span>
          <span>{t('С. ЗЕРЕНДА')}</span>
        </div>
        <div className="hero-body">
          <h1 className="hero-logo">
            <img
              src="/images/madina-logo-header.svg"
              alt={config.name}
              width="640"
              height="160"
              fetchPriority="high"
            />
          </h1>
          <h2>
            {t('Стрижки. Цвет.')}
            <br />
            {t('Ваш характер.')}
          </h2>
          <p>
            {t('Выберите услугу и удобное время,')}
            <br className="mobile-break" /> {t('а подтвердим в WhatsApp.')}
          </p>
          <div className="hero-actions">
            <ButtonLink to="/book">{t('Записаться')}</ButtonLink>
            <WhatsAppLink
              config={config}
              className="button ghost"
              text={t('Здравствуйте! Хочу записаться в салон «{name}».', { name: config.name })}
            >
              WhatsApp
            </WhatsAppLink>
          </div>
          <HeroFacts config={config} services={services.data} />
        </div>
        <div className="hero-bottom">
          <span>{t('ВАША ИНДИВИДУАЛЬНОСТЬ. НАША РАБОТА.')}</span>
          <a href="#about" aria-label={t('Подробнее о салоне')}>
            {t('Листайте вниз')} <span className="scroll-cue">↓</span>
          </a>
        </div>
      </section>
      <Section id="about" label={t('О САЛОНЕ')}>
        <h2 className="statement">
          {t('Красота')}
          <br />
          {t('начинается')} <span>{t('с вас.')}</span>
        </h2>
        <div className="about-copy">
          <p>
            {t(
              'Работаем с тем, что делает вас собой: текстурой волос, привычками и настроением. Находим стрижку, цвет и уход, с которыми комфортно каждый день.',
            )}
          </p>
          <p>
            {t('От первого разговора до последнего штриха. Внимательно, спокойно и без лишнего.')}
          </p>
        </div>
        <Highlights config={config} services={services.data} />
      </Section>
      <Section id="services" label={t('УСЛУГИ')}>
        <div className="section-heading">
          <h2>{t('Выберите свой образ.')}</h2>
          <Link className="text-button" to="/services">
            {t('Все услуги')} <ArrowUpRight size={18} />
          </Link>
        </div>
        {services.isPending ? (
          <Loading />
        ) : services.error ? (
          <ErrorBox error={services.error} retry={() => void services.refetch()} />
        ) : (
          <HomeServices services={services.data || []} config={config} />
        )}
      </Section>
      <Section id="masters" label={t('МАСТЕР')}>
        <h2>{t('В хороших руках.')}</h2>
        <p className="section-intro">{t('Внимание к деталям в каждой работе.')}</p>
        {masters.isPending ? (
          <Loading />
        ) : masters.error ? (
          <ErrorBox error={masters.error} retry={() => void masters.refetch()} />
        ) : (
          <div className={`master-grid ${masters.data?.length === 1 ? 'single' : ''}`}>
            {masters.data?.map((m, i) => (
              <article className="master-card" key={m.id}>
                <div className="portrait">
                  {m.avatarUrl ? (
                    <img
                      src={m.avatarUrl}
                      alt={t('Мастер {name}', { name: m.name })}
                      width="600"
                      height="800"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="master-placeholder" aria-hidden="true">
                      <img src="/images/madina-logo.svg" alt="" loading="lazy" />
                    </div>
                  )}
                  <span>0{i + 1}</span>
                </div>
                <div className="master-info">
                  <div className="master-title">
                    <h3>{m.name}</h3>
                  </div>
                  <p>{t(m.description)}</p>
                  <ul className="chips" aria-label={t('Что делает мастер')}>
                    {[...new Set(m.services.map((s) => s.service.category).filter(Boolean))].map(
                      (c) => (
                        <li key={c}>{t(c)}</li>
                      ),
                    )}
                    <li>{servicesCount(m.services.length, t)}</li>
                  </ul>
                  <ButtonLink to={`/book?master=${m.id}&pinned=${m.id}`}>
                    {t('Записаться к {name}', { name: m.name })}
                  </ButtonLink>
                </div>
              </article>
            ))}
          </div>
        )}
        {masters.data && masters.data.length > 1 && (
          <p className="caption">{t('Выберите услугу и удобное время для записи.')}</p>
        )}
      </Section>
      {!!gallery.data?.length && (
        <Section id="works" label={t('РАБОТЫ')}>
          <h2>{t('Наши работы.')}</h2>
          <p className="section-intro">{t('Фото из салона — до и после.')}</p>
          <Gallery photos={gallery.data} />
        </Section>
      )}
      <Section id="how" label={t('КАК ЗАПИСАТЬСЯ')}>
        <h2>
          {t('Ваше время.')}
          <br />
          {t('Всего четыре шага.')}
        </h2>
        <div className="steps-grid">
          {(
            [
              [Scissors, 'Услуга', 'Выберите то, что нужно вашим волосам.'],
              [UserRound, 'Мастер', 'Опытный мастер позаботится о вашем образе.'],
              [CalendarClock, 'Дата и время', 'Выберите удобное окно в расписании.'],
              [WhatsAppIcon, 'WhatsApp', 'Отправьте заявку — подтвердим время в чате.'],
            ] as const
          ).map(([Icon, title, text], i) => (
            <div key={title}>
              <span className="step-top">
                0{i + 1}
                <span className="step-icon">
                  <Icon size={22} />
                </span>
              </span>
              <h3>{t(title)}</h3>
              <p>{t(text)}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section id="contacts" label={t('КОНТАКТЫ')}>
        <h2>
          {t('Место для новой вас.')}
          <br />
          {t('И нового вас.')}
        </h2>
        <div className="contact-grid">
          <div>
            <span className="contact-icon">
              <MapPin size={20} />
            </span>
            <span>{t('АДРЕС')}</span>
            <p>{t(config.address)}</p>
            <small>
              <a
                className="contact-link"
                href={config.map}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('Открыть в 2ГИС ↗')}
              </a>
            </small>
          </div>
          <div>
            <span className="contact-icon">
              <Clock size={20} />
            </span>
            <span>{t('ВРЕМЯ РАБОТЫ')}</span>
            <p>{t(config.hours)}</p>
            <small>{t('Запись с 10:00')}</small>
          </div>
          <div>
            <span className="contact-icon">
              <WhatsAppIcon size={20} />
            </span>
            <span>WHATSAPP</span>
            <p>
              <a
                className="contact-link"
                href={`https://wa.me/${config.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {phoneLabel(config.whatsapp)}
              </a>
            </p>
            <small>
              {t('Запись и вопросы — в чате')} ·{' '}
              <a className="contact-link" href={`tel:+${config.whatsapp}`}>
                <Phone size={13} aria-hidden="true" /> {t('Позвонить')}
              </a>
            </small>
          </div>
          <div>
            <span className="contact-icon">
              <Wallet size={20} />
            </span>
            <span>{t('ОПЛАТА')}</span>
            <p>{t(config.payment)}</p>
            <small>{t('Оплата в салоне после услуги')}</small>
          </div>
        </div>
      </Section>
      <section className="closing">
        <Halftone id="closing" />
        <div>
          <p>
            <Sparkles size={14} className="sparkle" aria-hidden="true" />{' '}
            {t('НАЧНЁМ С ВАШЕГО ЖЕЛАНИЯ')}
          </p>
          <h2>{t('Время перемен.')}</h2>
          <ButtonLink to="/book">{t('Выбрать время')}</ButtonLink>
          <span className="closing-word" aria-hidden="true">
            {config.name}
          </span>
        </div>
      </section>
      <MobileCta config={config} />
    </>
  );
}
export function Catalog({ config }: { config: Config }) {
  const services = useServices();
  const { t } = useT();
  return (
    <section className="page">
      <p className="eyebrow">{t('УСЛУГИ / {name}', { name: config.name })}</p>
      <h1>
        {t('Ваша следующая')}
        <br />
        <span className="muted">{t('любимая стрижка.')}</span>
      </h1>
      <p className="page-intro">{t('Прозрачная стоимость. Время только для вас.')}</p>
      {services.isPending ? (
        <Loading />
      ) : services.error ? (
        <ErrorBox error={services.error} retry={() => void services.refetch()} />
      ) : (
        <ServiceRows services={services.data || []} config={config} />
      )}
    </section>
  );
}

type T = ReturnType<typeof useT>['t'];
/** «29 услуг» with Russian plural forms; Kazakh has a single form. */
function servicesCount(n: number, t: T) {
  const mod10 = n % 10,
    mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return t('{n} услуга', { n });
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t('{n} услуги', { n });
  return t('{n} услуг', { n });
}
const cheapest = (services: Service[] = []) =>
  services.length ? Math.min(...services.map((s) => s.priceMinor)) : null;
/** The cheapest haircut says more than the cheapest wash; falls back to any service. */
const cheapestHaircut = (services: Service[] = []) =>
  cheapest(services.filter((s) => /стриж|нулевк/i.test(s.name))) ?? cheapest(services);

/** Salon-local «HH:MM» now, and the opening hours parsed from «Ежедневно · 10:00–18:00». */
function useOpenStatus(config: Config) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const hours = config.hours.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  if (!hours) return null;
  const pad = (s: string) => s.padStart(5, '0');
  const [open, close] = [pad(hours[1]), pad(hours[2])];
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  if (time >= open && time < close) return { open: true, close, opens: open, today: true };
  return { open: false, close, opens: open, today: time < open };
}

/** Three answers a visitor wants first: open now?, where?, how much? */
function HeroFacts({ config, services }: { config: Config; services?: Service[] }) {
  const { t } = useT();
  const status = useOpenStatus(config);
  const from = cheapestHaircut(services);
  const address = t(config.address).split(', ').slice(0, 3).join(', ');
  return (
    <ul className="hero-facts">
      {status && (
        <li className={status.open ? 'is-open' : 'is-closed'}>
          <span className="status-dot" aria-hidden="true" />
          {status.open
            ? t('Открыто до {time}', { time: status.close })
            : status.today
              ? t('Откроемся сегодня в {time}', { time: status.opens })
              : t('Откроемся завтра в {time}', { time: status.opens })}
        </li>
      )}
      <li>
        <a href={config.map} target="_blank" rel="noopener noreferrer">
          <MapPin size={15} aria-hidden="true" /> {address}
        </a>
      </li>
      {from !== null && (
        <li>
          <Scissors size={15} aria-hidden="true" />{' '}
          {t('Стрижки от {price}', { price: money(from, config.currency) })}
        </li>
      )}
    </ul>
  );
}

/** Why come here, in four short facts (replaces a second copy of the logo). */
function Highlights({ config, services }: { config: Config; services?: Service[] }) {
  const { t } = useT();
  const from = cheapest(services);
  const items = [
    [Users, t('Мужской и женский зал'), t('Стрижки для всей семьи — от малышей до взрослых.')],
    [
      Sparkles,
      services ? servicesCount(services.length, t) : t('Услуги'),
      from === null
        ? ''
        : t('Цены от {price}. Окончательную стоимость мастер назовёт до начала работы.', {
            price: money(from, config.currency),
          }),
    ],
    [
      CalendarClock,
      t('Запись онлайн'),
      t('Без регистрации: выберите время, подтвердим в WhatsApp.'),
    ],
    [Wallet, t('Удобная оплата'), t('Наличными или Kaspi QR в салоне.')],
  ] as const;
  const loyalty = useLoyalty().data;
  return (
    <ul className="highlights">
      {items.map(([Icon, title, text]) => (
        <li key={title}>
          <span className="contact-icon">
            <Icon size={20} aria-hidden="true" />
          </span>
          <h3>{title}</h3>
          {text && <p>{text}</p>}
        </li>
      ))}
      {loyalty && (
        <li className="wide">
          <span className="contact-icon">
            <Gift size={20} aria-hidden="true" />
          </span>
          <h3>
            {t('Каждый {n}-й визит — {reward}', { n: loyalty.every, reward: loyalty.reward })}
          </h3>
          <p>{t('Визиты считаем по номеру телефона, ничего копить и показывать не нужно.')}</p>
        </li>
      )}
    </ul>
  );
}

/** The home page shows one hall at a time and its first services; the full list is on /services. */
function HomeServices({ services, config }: { services: Service[]; config: Config }) {
  const { t } = useT();
  const groups = byCategory(services);
  const [hall, setHall] = useState(0);
  const group = groups[Math.min(hall, groups.length - 1)];
  if (!group) return null;
  const shown = group.items.slice(0, 6);
  return (
    <>
      {groups.length > 1 && (
        <div className="hall-tabs" role="tablist" aria-label={t('Залы')}>
          {groups.map((g, i) => (
            <button
              key={g.category}
              role="tab"
              id={`hall-tab-${i}`}
              aria-selected={i === hall}
              aria-controls="hall-panel"
              onClick={() => setHall(i)}
            >
              {t(g.category || 'Услуги')} <span>{g.items.length}</span>
            </button>
          ))}
        </div>
      )}
      <div id="hall-panel" role="tabpanel" aria-labelledby={`hall-tab-${hall}`}>
        <ServiceRows services={shown.map((s) => ({ ...s, category: '' }))} config={config} />
      </div>
      {group.items.length > shown.length && (
        <Link className="button secondary more-services" to="/services">
          {t('Все услуги зала · {n}', { n: group.items.length })} <ArrowUpRight size={18} />
        </Link>
      )}
    </>
  );
}

/** On phones, once the first screen is scrolled away, booking stays one tap away. */
function MobileCta({ config }: { config: Config }) {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const hero = document.querySelector('.hero');
    if (!hero || !('IntersectionObserver' in window)) return;
    observer.current = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting));
    observer.current.observe(hero);
    return () => observer.current?.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.toggle('has-mobile-cta', show);
    return () => document.body.classList.remove('has-mobile-cta');
  }, [show]);
  return (
    <div className={`mobile-cta ${show ? 'show' : ''}`} aria-hidden={!show}>
      <ButtonLink to="/book" tabIndex={show ? 0 : -1}>
        {t('Записаться')}
      </ButtonLink>
      <WhatsAppLink
        config={config}
        className="button ghost"
        text={t('Здравствуйте! Хочу записаться в салон «{name}».', { name: config.name })}
        tabIndex={show ? 0 : -1}
        aria-label={t('Написать в WhatsApp')}
      >
        {''}
      </WhatsAppLink>
    </div>
  );
}
