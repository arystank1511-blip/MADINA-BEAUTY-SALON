-- Real portrait for the salon's master. Keeps any photo the admin already set.
UPDATE "Master"
SET "avatarUrl" = '/images/nurgul.webp', "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Нургуль' AND "avatarUrl" IS NULL;
