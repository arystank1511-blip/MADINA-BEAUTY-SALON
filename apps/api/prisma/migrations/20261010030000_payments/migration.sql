-- Actual payment per visit: prices are «от», so the paid amount can differ from the list price.
ALTER TABLE "Appointment" ADD COLUMN "paidMinor" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_paid_check"
  CHECK ("paidMinor" IS NULL OR "paidMinor" >= 0);
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_payment_method_check"
  CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('CASH', 'KASPI'));
