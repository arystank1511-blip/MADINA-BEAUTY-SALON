-- Bookings made by the master for people without an account, and site requests
-- that hold a slot until the master confirms them.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TABLE "Appointment" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "Appointment" ADD COLUMN "guestName" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "guestPhone" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "holdUntil" TIMESTAMPTZ(3);
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_client"
  CHECK ("customerId" IS NOT NULL OR length(trim("guestName")) > 0);

-- Expired holds are cancelled by the system, so a canceller is optional now.
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_cancellation";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancellation" CHECK (
  (status = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
  OR (status <> 'CANCELLED' AND "cancelledAt" IS NULL AND "cancelledById" IS NULL)
);
