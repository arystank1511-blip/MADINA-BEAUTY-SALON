-- Services are grouped into the salon's two halls, and most prices are "from" a minimum.
ALTER TABLE "Service" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Service" ADD COLUMN "priceFrom" BOOLEAN NOT NULL DEFAULT false;

-- The salon's price list (October 2026) replaces the earlier placeholder services.
-- Old services are only hidden: past and upcoming appointments keep their snapshots.
UPDATE "Service" SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "isActive" = true;

INSERT INTO "Service" ("id", "category", "name", "description", "durationMinutes", "bufferAfterMinutes", "priceMinor", "priceFrom", "createdAt", "updatedAt")
VALUES
  ('00000000-0000-4000-8000-000000000040'::uuid, 'Мужской зал', 'Нулевка', 'Машинкой под ноль.', 20, 10, 100000, false, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '0 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000041'::uuid, 'Мужской зал', 'Детская стрижка (1–15 лет)', 'Аккуратная стрижка для мальчиков от 1 года до 15 лет.', 30, 10, 200000, false, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '1 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000042'::uuid, 'Мужской зал', 'Мужская стрижка (от 15 лет)', 'С мытьём головы.', 30, 10, 250000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '2 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000043'::uuid, 'Мужской зал', 'Креативная стрижка', 'Цезарь, удлинённая и другие модельные стрижки.', 40, 10, 300000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '3 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000044'::uuid, 'Мужской зал', 'Покраска', 'Окрашивание волос.', 60, 10, 200000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '4 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000045'::uuid, 'Мужской зал', 'Окантовка', 'Аккуратный контур.', 20, 10, 200000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '5 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000046'::uuid, 'Мужской зал', 'Стрижка под насадки', 'Машинкой под насадку.', 20, 10, 150000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '6 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000047'::uuid, 'Мужской зал', 'Химзавивка на короткие волосы', '', 90, 10, 500000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '7 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000048'::uuid, 'Мужской зал', 'Химзавивка на удлинённые волосы', '', 120, 10, 600000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '8 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000049'::uuid, 'Мужской зал', 'Мытьё головы', 'Цена зависит от длины и густоты волос.', 10, 5, 30000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '9 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000050'::uuid, 'Мужской зал', 'Укладка', '', 20, 10, 50000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '10 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000051'::uuid, 'Женский зал', 'Чёлка', 'Стрижка чёлки.', 15, 5, 50000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '11 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000052'::uuid, 'Женский зал', 'Детская стрижка', '', 30, 10, 150000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '12 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000053'::uuid, 'Женский зал', 'Стрижка на короткие волосы', '', 40, 10, 250000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '13 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000054'::uuid, 'Женский зал', 'Стрижка на удлинённые волосы', 'Каре, каприз, каскад и другие.', 50, 10, 300000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '14 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000055'::uuid, 'Женский зал', 'Стрижка на длинные волосы', '', 60, 10, 350000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '15 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000056'::uuid, 'Женский зал', 'Кончики по всей длине', 'Подравнивание кончиков волос.', 30, 10, 300000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '16 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000057'::uuid, 'Женский зал', 'Мытьё коротких волос', '', 15, 5, 50000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '17 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000058'::uuid, 'Женский зал', 'Мытьё удлинённых волос', '', 20, 5, 100000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '18 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000059'::uuid, 'Женский зал', 'Сушка коротких волос', '', 15, 5, 50000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '19 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000060'::uuid, 'Женский зал', 'Сушка удлинённых волос', '', 20, 5, 100000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '20 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000061'::uuid, 'Женский зал', 'Сушка и укладка', '', 30, 10, 100000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '21 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000062'::uuid, 'Женский зал', 'Мелирование', '', 120, 10, 500000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '22 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000063'::uuid, 'Женский зал', 'Химзавивка на короткие волосы', '', 120, 10, 500000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '23 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000064'::uuid, 'Женский зал', 'Химзавивка на удлинённые волосы', '', 150, 10, 600000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '24 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000065'::uuid, 'Женский зал', 'Покраска коротких волос', '', 90, 10, 250000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '25 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000066'::uuid, 'Женский зал', 'Локоны', '', 60, 10, 500000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '26 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000067'::uuid, 'Женский зал', 'Пряди', 'Окрашивание прядей.', 90, 10, 300000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '27 second', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000068'::uuid, 'Женский зал', 'Укладка', 'Вечерняя или праздничная укладка.', 60, 10, 300000, true, TIMESTAMPTZ '2026-10-08 00:00:00+00' + interval '28 second', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
UPDATE "Service" SET "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" BETWEEN '00000000-0000-4000-8000-000000000040'::uuid AND '00000000-0000-4000-8000-000000000068'::uuid;

INSERT INTO "MasterService" ("masterId", "serviceId")
SELECT m."id", s."id"
FROM "Master" m CROSS JOIN "Service" s
WHERE m."name" = 'Нургуль' AND m."isActive" = true
  AND s."id" BETWEEN '00000000-0000-4000-8000-000000000040'::uuid AND '00000000-0000-4000-8000-000000000068'::uuid
ON CONFLICT DO NOTHING;
