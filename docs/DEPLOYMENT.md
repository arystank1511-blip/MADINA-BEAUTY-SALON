# Развёртывание

## Vercel

Облачная версия: https://forma-salon-booking.vercel.app. Frontend и API находятся в одном проекте Vercel, PostgreSQL — в Neon, регион Frankfurt. Пошаговая конфигурация: [VERCEL.md](VERCEL.md).

## Демо на локальной машине

`docker compose up --build -d --wait`, затем `docker compose exec api pnpm db:seed`. Сайт: http://localhost:8080. Это готовый локальный продукт с настоящей PostgreSQL. Публикация репозитория в GitHub сама по себе не публикует работающий сервер.

## Публичный сервер

Нужны сервер с Docker и домен. Оплачиваемые ресурсы автоматически не создаются. Для развёртывания:

1. Клонируйте репозиторий на сервер, задайте `.env` с сильным `POSTGRES_PASSWORD`, `APP_ORIGIN=https://ваш-домен`, `NODE_ENV=production`, `DEMO_MODE=false`, настройками салона.
2. Настройте HTTPS reverse proxy перед портом 8080. Передавайте весь `/api` на этот же origin. Не открывайте PostgreSQL и API напрямую в интернет. Ограничьте доступ к host-порту 8080 только reverse proxy.
3. `docker compose up --build -d --wait`. Миграции — отдельный сервис перед стартом API. Не запускайте demo seed в production.
4. Задайте в окружении терминала `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` (пароль не менее 14 символов). Выполните `docker compose exec -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD api pnpm --filter @forma/api exec tsx prisma/create-admin.ts`. Команда выполняется в контейнере с настроенным DATABASE_URL, не меняет существующий аккаунт и не выводит пароль. Не сохраняйте пароль в истории команд или репозитории.
5. Проверьте `/api/v1/ready`, вход, создание и отмену тестового посещения, HTTPS/Secure cookie и точный APP_ORIGIN.
6. Настройте резервное копирование PostgreSQL, обновления образов и общий rate limit на reverse proxy при нескольких API-экземплярах. API в Compose доверяет только одному hop (`TRUST_PROXY=1`), а nginx заменяет X-Forwarded-For фактическим remote_addr. Если перед nginx есть ещё один proxy, настройте nginx real_ip_header и set_real_ip_from только для адреса доверенного внешнего proxy. Не открывайте API напрямую при TRUST_PROXY=1.

Для отдельного публичного демо создайте отдельную БД без реальных клиентов. Чтобы подготовить demo seed, запустите одноразовый контейнер с `NODE_ENV=development DEMO_MODE=true`, затем обслуживайте это демо в production HTTPS-режиме. Демо-учётные записи административные: не используйте такую БД для реального салона.

## Обновление

Сначала резервная копия и тестовый прогон миграций на копии БД. Затем `docker compose build`, остановка старых api/web, `docker compose run --rm migrate`, `docker compose up -d --wait`. Расширение GiST и ограничение пересечений находятся в версионируемой SQL-миграции; не заменяйте миграции на `prisma db push`.
