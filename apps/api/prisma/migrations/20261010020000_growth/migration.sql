-- Bringing clients back: review requests after a visit and «пора подстричься» invitations.
ALTER TABLE "Appointment" ADD COLUMN "reviewRequestedAt" TIMESTAMPTZ(3);
ALTER TABLE "Appointment" ADD COLUMN "invitedAt" TIMESTAMPTZ(3);
CREATE INDEX "Appointment_guestPhone_idx" ON "Appointment"("guestPhone");
