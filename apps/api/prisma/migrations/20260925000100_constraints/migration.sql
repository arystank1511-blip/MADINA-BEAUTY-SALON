CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Service" ADD CONSTRAINT "Service_values" CHECK ("priceMinor">=0 AND "durationMinutes" BETWEEN 5 AND 600 AND "bufferAfterMinutes" BETWEEN 0 AND 120);
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_valid" CHECK (weekday BETWEEN 1 AND 7 AND "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "startTime"<"endTime");
ALTER TABLE "RecurringBreak" ADD CONSTRAINT "RecurringBreak_valid" CHECK (weekday BETWEEN 1 AND 7 AND "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "startTime"<"endTime");
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_valid" CHECK ("startsAt"<"endsAt");
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK (email=lower(trim(email)));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_valid" CHECK ("startsAt"<"endsAt" AND "endsAt"<="occupiedUntil" AND "priceMinor">=0 AND "durationMinutes">0 AND "bufferAfterMinutes">=0 AND "endsAt"="startsAt"+"durationMinutes"*interval '1 minute' AND "occupiedUntil"="endsAt"+"bufferAfterMinutes"*interval '1 minute');
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancellation" CHECK ((status='CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL) OR (status<>'CANCELLED' AND "cancelledAt" IS NULL AND "cancelledById" IS NULL));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_overlap" EXCLUDE USING gist ("masterId" WITH =, tstzrange("startsAt", "occupiedUntil", '[)') WITH &&) WHERE (status <> 'CANCELLED');
