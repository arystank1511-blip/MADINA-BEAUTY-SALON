-- Where clients come from, who recommended them, and how they rated the visit.
ALTER TABLE "Appointment"
    ADD COLUMN "source" TEXT,
    ADD COLUMN "referrerPhone" TEXT,
    ADD COLUMN "referralThankedAt" TIMESTAMPTZ(3),
    ADD COLUMN "rating" INTEGER,
    ADD COLUMN "feedback" TEXT,
    ADD COLUMN "ratedAt" TIMESTAMPTZ(3),
    ADD CONSTRAINT "Appointment_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    ADD CONSTRAINT "Appointment_source_check"
        CHECK ("source" IN ('instagram', '2gis', 'maps', 'friends', 'passing', 'other')),
    ADD CONSTRAINT "Appointment_referrer_check" CHECK ("referrerPhone" ~ '^\d{11,15}$');
CREATE INDEX "Appointment_referrerPhone_idx" ON "Appointment"("referrerPhone");
