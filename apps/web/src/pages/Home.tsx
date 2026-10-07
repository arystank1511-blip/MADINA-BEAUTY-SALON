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
export function Home({ config }: { config: Config }) {
  const services = useServices(),
    masters = useMasters();
  return (
    <>
      <section className="hero">
        <Halftone id="hero" />
        <div className="hero-top">
          <span>ПАРИКМАХЕРСКАЯ «МАДИНА»</span>
          <span>С. ЗЕРЕНДА</span>
        </div>
        <div className="hero-body">
          <h1 className="hero-logo">
            <img src="/images/madina-logo-header.svg" alt={config.name} />
          </h1>
          <h2>
            Стрижки. Цвет.
            <br />
            Ваш характер.
          </h2>
          <p>
            Выберите услугу и удобное время,
            <br className="mobile-break" /> а подтвердим в WhatsApp.
          </p>
          <div className="hero-actions">
            <ButtonLink to="/book">Записаться</ButtonLink>
            <WhatsAppLink
              config={config}
              className="button ghost"
              text={`Здравствуйте! Хочу записаться в салон «${config.name}».`}
            >
              WhatsApp
            </WhatsAppLink>
          </div>
        </div>
        <div className="hero-bottom">
          <span>ВАША ИНДИВИДУАЛЬНОСТЬ. НАША РАБОТА.</span>
          <a href="#about" aria-label="Подробнее о салоне">
            Листайте вниз <span className="scroll-cue">↓</span>
          </a>
        </div>
      </section>
      <Section id="about" label="О САЛОНЕ">
        <h2 className="statement">
          Красота
          <br />
          начинается <span>с вас.</span>
        </h2>
        <div className="about-copy">
          <p>
            Работаем с тем, что делает вас собой: текстурой волос, привычками и настроением. Находим
            стрижку, цвет и уход, с которыми комфортно каждый день.
          </p>
          <p>От первого разговора до последнего штриха. Внимательно, спокойно и без лишнего.</p>
        </div>
        <div className="interior brand-panel">
          <Halftone id="about" />
          <img
            src="/images/madina-logo.svg"
            alt={`Парикмахерская «${config.name}»`}
            loading="lazy"
          />
          <p className="brand-panel-tags" aria-hidden="true">
            Стрижки · Окрашивание · Укладка · Уход
          </p>
          <span>ПРОСТРАНСТВО ДЛЯ ПЕРЕМЕН ↗</span>
        </div>
      </Section>
      <Section id="services" label="УСЛУГИ">
        <div className="section-heading">
          <h2>Выберите свой образ.</h2>
          <Link className="text-button" to="/services">
            Все услуги <ArrowUpRight size={18} />
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
      <Section id="masters" label="МАСТЕР">
        <h2>В хороших руках.</h2>
        <p className="section-intro">Внимание к деталям в каждой работе.</p>
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
                    <img src={m.avatarUrl} alt={`Мастер ${m.name}`} loading="lazy" />
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
                    aria-label={`Выбрать мастера ${m.name}`}
                    to={`/book?master=${m.id}&pinned=${m.id}`}
                  >
                    <ArrowUpRight />
                  </Link>
                </div>
                <p>{m.description}</p>
                <p className="master-services">
                  {m.services.map((s) => s.service.name).join(' · ')}
                </p>
              </article>
            ))}
          </div>
        )}
        <p className="caption">Выберите услугу и удобное время для записи.</p>
      </Section>
      <Section id="how" label="КАК ЗАПИСАТЬСЯ">
        <h2>
          Ваше время.
          <br />
          Всего четыре шага.
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
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section id="contacts" label="КОНТАКТЫ">
        <h2>
          Место для новой вас.
          <br />И нового вас.
        </h2>
        <div className="contact-grid">
          <div>
            <span className="contact-icon">
              <MapPin size={20} />
            </span>
            <span>АДРЕС</span>
            <p>{config.address}</p>
            <small>
              <a
                className="contact-link"
                href={config.map}
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть в 2ГИС ↗
              </a>
            </small>
          </div>
          <div>
            <span className="contact-icon">
              <Clock size={20} />
            </span>
            <span>ВРЕМЯ РАБОТЫ</span>
            <p>{config.hours}</p>
            <small>Запись с 10:00</small>
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
            <small>Запись и вопросы — в чате</small>
          </div>
          <div>
            <span className="contact-icon">
              <Wallet size={20} />
            </span>
            <span>ОПЛАТА</span>
            <p>{config.payment}</p>
            <small>Оплата в салоне после услуги</small>
          </div>
        </div>
      </Section>
      <section className="closing">
        <Halftone id="closing" />
        <div>
          <p>
            <Sparkles size={14} className="sparkle" aria-hidden="true" /> НАЧНЁМ С ВАШЕГО ЖЕЛАНИЯ
          </p>
          <h2>Время перемен.</h2>
          <ButtonLink to="/book">Выбрать время</ButtonLink>
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
  return (
    <section className="page">
      <p className="eyebrow">УСЛУГИ / {config.name}</p>
      <h1>
        Ваша следующая
        <br />
        <span className="muted">любимая стрижка.</span>
      </h1>
      <p className="page-intro">Прозрачная стоимость. Время только для вас.</p>
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
