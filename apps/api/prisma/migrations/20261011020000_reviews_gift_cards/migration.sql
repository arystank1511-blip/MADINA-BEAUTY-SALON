-- Client reviews shown on the site.
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "Review_text_check" CHECK (length("text") BETWEEN 2 AND 600)
);
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- Gift certificates sold in the salon.
CREATE TABLE "GiftCard" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "sender" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "redeemedAt" TIMESTAMPTZ(3),
    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GiftCard_amount_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "GiftCard_code_check" CHECK ("code" ~ '^[A-Z0-9]{8}$')
);
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");
CREATE INDEX "GiftCard_createdAt_idx" ON "GiftCard"("createdAt");
