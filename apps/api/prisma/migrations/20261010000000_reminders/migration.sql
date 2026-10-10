-- One-hour reminders: the Telegram heads-up is sent once; the WhatsApp reminder is marked when sent.
ALTER TABLE "Appointment" ADD COLUMN "alertedAt" TIMESTAMPTZ(3);
ALTER TABLE "Appointment" ADD COLUMN "remindedAt" TIMESTAMPTZ(3);
