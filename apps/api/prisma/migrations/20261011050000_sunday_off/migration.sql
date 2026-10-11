-- The salon is closed on Sunday: no online booking that day. The owner can open a
-- Sunday again in the admin «Расписание».
DELETE FROM "WorkingHours" WHERE "weekday" = 7;
