-- The salon closes at 18:00. Shorten the master's later shifts; existing
-- appointments are kept and still shown in the admin.
UPDATE "WorkingHours"
SET "endTime" = '18:00'
WHERE "endTime" > '18:00'
  AND "startTime" < '18:00'
  AND "masterId" IN (SELECT "id" FROM "Master" WHERE "name" = 'Нургуль');
