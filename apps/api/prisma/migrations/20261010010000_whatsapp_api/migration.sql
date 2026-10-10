-- Automatic client reminders through the WhatsApp Business (Cloud) API.
ALTER TABLE "Appointment" ADD COLUMN "waSentAt" TIMESTAMPTZ(3);
ALTER TABLE "Appointment" ADD COLUMN "waError" TEXT;

-- Settings edited in the admin. The WhatsApp access token lives here, never in the repository.
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
