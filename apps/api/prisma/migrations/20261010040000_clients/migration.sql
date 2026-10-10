-- Client card: notes, birthday and the block list, keyed by the last 10 digits of the phone.
CREATE TABLE "Client" (
    "phone" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "birthday" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "greetedYear" INTEGER,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("phone"),
    CONSTRAINT "Client_phone_check" CHECK ("phone" ~ '^[0-9]{10}$'),
    CONSTRAINT "Client_birthday_check" CHECK ("birthday" IS NULL OR "birthday" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
);
