import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Config, useMasters, useServices } from '../api';
import { ButtonLink, ErrorBox, Halftone, Loading, Section, ServiceRows } from '../components';
export function Home({ config }: { config: Config }) {
  const services = useServices(),
    masters = useMasters();
  return (
    <>
      <section className="hero">
        <Halftone id="hero" />
        <div className="hero-top">
          <span>ПРОСТРАНСТВО ВАШЕГО СТИЛЯ</span>
          <span>АЛМАТЫ · ДЕМО-САЛОН</span>
        </div>
        <div className="hero-body">
          <h1>{config.name}</h1>
          <h2>
            Стрижки. Цвет.
            <br />
            Ваш характер.
          </h2>
          <p>
            Выберите услугу, мастера
            <br className="mobile-break" /> и удобное время онлайн.
          </p>
          <ButtonLink to="/book">Записаться</ButtonLink>
        </div>
        <div className="hero-bottom">
          <span>ВАША ИНДИВИДУАЛЬНОСТЬ. НАША РАБОТА.</span>
          <a href="#about" aria-label="Подробнее о салоне">
            Листайте вниз <span>↓</span>
          </a>
        </div>
      </section>
      <Section id="about" label="О САЛОНЕ">
        <h2 className="statement">
          Хорошая форма
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
        <div className="interior">
          <img
            src="/images/interior.jpg"
            alt="Демонстрационная фотография интерьера парикмахерской"
            loading="lazy"
          />
          <span>ПРОСТРАНСТВО ДЛЯ ПЕРЕМЕН ↗</span>
        </div>
      </Section>
      <Section id="services" label="УСЛУГИ">
        <div className="section-heading">
          <h2>Найдите свою форму.</h2>
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
      <Section id="masters" label="МАСТЕРА">
        <h2>В хороших руках.</h2>
        <p className="section-intro">Разный почерк. Общее внимание к деталям.</p>
        {masters.isPending ? (
          <Loading />
        ) : masters.error ? (
          <ErrorBox error={masters.error} retry={() => void masters.refetch()} />
        ) : (
          <div className="master-grid">
            {masters.data?.map((m, i) => (
              <article className="master-card" key={m.id}>
                <div className="portrait">
                  <img
                    src={m.avatarUrl || '/images/team.png'}
                    alt={`Демонстрационный портрет мастера ${m.name}`}
                    loading="lazy"
                  />
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
        <p className="caption">
          Демонстрационная команда. Фотографии используются как иллюстрации.
        </p>
      </Section>
      <Section id="how" label="КАК ЗАПИСАТЬСЯ">
        <h2>
          Ваше время.
          <br />
          Всего четыре шага.
        </h2>
        <div className="steps-grid">
          {[
            ['Услуга', 'Выберите то, что нужно вашим волосам.'],
            ['Мастер', 'Найдите специалиста под свою задачу.'],
            ['Дата и время', 'Выберите удобное окно в расписании.'],
            ['Подтверждение', 'Проверьте детали. Будем ждать вас.'],
          ].map(([title, text], i) => (
            <div key={title}>
              <span>0{i + 1}</span>
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
            <span>АДРЕС</span>
            <p>{config.address}</p>
          </div>
          <div>
            <span>ВРЕМЯ РАБОТЫ</span>
            <p>{config.hours}</p>
            <small>{config.timezone}</small>
          </div>
          <div>
            <span>КОНТАКТ</span>
            <p>{config.contact}</p>
            <small>Демонстрационные данные</small>
          </div>
        </div>
      </Section>
      <section className="closing">
        <Halftone id="closing" />
        <div>
          <p>НАЧНЁМ С ВАШЕГО ЖЕЛАНИЯ</p>
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
        <span className="muted">любимая форма.</span>
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
