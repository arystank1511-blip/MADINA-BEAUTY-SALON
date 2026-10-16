-- On Saturdays the salon closes at 15:00. Existing appointments are kept and
-- still shown in the admin; breaks must stay inside the shorter day.
UPDATE "WorkingHours"
SET "endTime" = '15:00'
WHERE "weekday" = 6
  AND "endTime" > '15:00'
  AND "startTime" < '15:00';
DELETE FROM "RecurringBreak" WHERE "weekday" = 6 AND "endTime" > '15:00';
