import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  Clock,
  MapPin,
  Wallet,
  Scissors,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Config, phoneLabel, useMasters, useServices } from '../api';
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
import { Gallery, PromoBanner, useGallery } from '../site';
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
            <img src="/images/madina-logo-header.svg" alt={config.name} />
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
        <div className="interior brand-panel">
          <Halftone id="about" />
          <img
            src="/images/madina-logo.svg"
            alt={t('Парикмахерская «{name}»', { name: config.name })}
            loading="lazy"
          />
          <p className="brand-panel-tags" aria-hidden="true">
            {t('Мужской зал · Женский зал · Стрижки · Покраска · Укладки')}
          </p>
          <span>{t('ПРОСТРАНСТВО ДЛЯ ПЕРЕМЕН ↗')}</span>
        </div>
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
          <ServiceRows services={services.data || []} config={config} />
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
                      loading="lazy"
                    />
                  ) : (
                    <div className="master-placeholder" aria-hidden="true">
                      <img src="/images/madina-logo.svg" alt="" loading="lazy" />
                    </div>
                  )}
                  <span>0{i + 1}</span>
                </div>
                <div className="master-title">
                  <h3>{m.name}</h3>
                  <Link
                    className="icon-button"
                    aria-label={t('Выбрать мастера {name}', { name: m.name })}
                    to={`/book?master=${m.id}&pinned=${m.id}`}
                  >
                    <ArrowUpRight />
                  </Link>
                </div>
                <p>{t(m.description)}</p>
                <p className="master-services">
                  {m.services.map((s) => t(s.service.name)).join(' · ')}
                </p>
              </article>
            ))}
          </div>
        )}
        <p className="caption">{t('Выберите услугу и удобное время для записи.')}</p>
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
            <small>{t('Запись и вопросы — в чате')}</small>
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
