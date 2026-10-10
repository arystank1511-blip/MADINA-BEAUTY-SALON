-- Salon expenses, so statistics can show profit.
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Expense_date_check" CHECK ("date" ~ '^\d{4}-\d{2}-\d{2}$'),
    CONSTRAINT "Expense_amount_check" CHECK ("amountMinor" > 0)
);
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- Supplies with a low-stock threshold.
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "lowAlertedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Material_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Material_quantity_check" CHECK ("quantity" >= 0 AND "minQuantity" >= 0)
);
CREATE UNIQUE INDEX "Material_name_key" ON "Material"("name");
