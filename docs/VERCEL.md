# Vercel + PostgreSQL

Приложение развёртывается одним Vercel-проектом **madina_beauty** (команда lion-26fd, бывшее имя forma-salon-booking) из корня репозитория. Он подключён к GitHub: слияние в `main` выкладывает production, каждый PR получает preview. Статика React собирается в `apps/web/dist`, а `api/index.js` запускает скомпилированный NestJS как одну Node.js Function. Создание приложения кешируется между запросами тёплого экземпляра, включая одновременные запросы при холодном старте.

`vercel.json` задаёт сборку, регион Frankfurt, маршруты `/api/*` и fallback для страниц React. Используется `routes` с неназванной regex-группой: именованный параметр `:path*` в rewrites добавлялся Vercel к query и отклонялся строгой DTO-валидацией. Docker остаётся самостоятельным способом запуска и не используется Vercel.

## Настройка

1. Создайте Vercel-проект с корнем репозитория `.` и подключите отдельную базу Neon PostgreSQL на бесплатном тарифе. Используйте базу только для этого демо. Расширение `btree_gist` обязательно.
2. Сохраните `DATABASE_URL` в переменных Vercel для нужного окружения. Используйте pooled URL Neon с `sslmode=require`, `connection_limit=5` и `pool_timeout=15` для API. Прямой URL можно использовать локально для миграций.
3. Установите `DEMO_MODE=true`, `NODE_ENV=production`, `TRUST_PROXY=1`, `SALON_TIMEZONE=Asia/Almaty`, `SALON_CURRENCY=KZT`. Для Vercel включите системные переменные окружения.
4. Перед первым деплоем примените `pnpm db:migrate` с URL новой облачной базы. Для создания демо-данных один раз выполните `pnpm db:seed` с `DEMO_MODE=true` и `NODE_ENV=development` только в процессе seed. Обслуживание сайта должно оставаться в production, чтобы cookie использовали HTTPS.
5. `vercel deploy --target preview` создаёт preview. Для первого деплоя указывайте target явно: CLI может назначить первый деплой нового проекта production автоматически. Сервер принимает точные системные адреса этого Vercel-проекта (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`). Для собственного домена задайте точный `APP_ORIGIN=https://ваш-домен`. Подстановочные маски и пользовательский Host не используются для CSRF.
6. Миграции новых версий выполняйте отдельно до деплоя. Автоматическая сборка намеренно не меняет схему БД для каждого preview.

## Проверки

`pnpm --filter @forma/api build && pnpm test:vercel` проверяет настоящий обработчик Function через HTTP: одновременный холодный старт, маршруты Nest/Swagger и отклонение постороннего Origin.

Сессии и записи хранятся в PostgreSQL. Транзакции и EXCLUDE продолжают защищать пересечения между разными Vercel-инстансами. Лимит попыток авторизации остаётся локальным для экземпляра; для усиления публичного сервиса нужен общий лимит на уровне платформы или внешнего хранилища.

Источники: [Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration), [Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite), [Neon integration](https://vercel.com/marketplace/neon/neon).
