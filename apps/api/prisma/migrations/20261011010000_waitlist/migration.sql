-- Clients waiting for a free time on a full day.
CREATE TABLE "WaitlistEntry" (
    "id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "serviceId" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactedAt" TIMESTAMPTZ(3),
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WaitlistEntry_date_check" CHECK ("date" ~ '^\d{4}-\d{2}-\d{2}$'),
    CONSTRAINT "WaitlistEntry_phone_check" CHECK ("phone" ~ '^\d{11,15}$')
);
CREATE UNIQUE INDEX "WaitlistEntry_date_phone_key" ON "WaitlistEntry"("date", "phone");
CREATE INDEX "WaitlistEntry_date_idx" ON "WaitlistEntry"("date");
