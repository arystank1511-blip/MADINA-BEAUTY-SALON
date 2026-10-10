-- The owner asked not to mention discounts on the site for now: the birthday discount is off
-- until switched on again in «Возврат клиентов» → «Настройки».
UPDATE "Setting"
SET "value" = jsonb_set("value", '{birthdayDiscount}', '0')
WHERE "key" = 'growth' AND "value" ? 'birthdayDiscount';
