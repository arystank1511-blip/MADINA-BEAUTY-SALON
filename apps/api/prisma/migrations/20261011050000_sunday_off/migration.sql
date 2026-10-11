-- The salon is closed on Sunday: no online booking that day. The owner can open a
-- Sunday again in the admin «Расписание». Sunday breaks go too: a break outside the
-- working day would block saving the schedule.
DELETE FROM "RecurringBreak" WHERE "weekday" = 7;
DELETE FROM "WorkingHours" WHERE "weekday" = 7;
