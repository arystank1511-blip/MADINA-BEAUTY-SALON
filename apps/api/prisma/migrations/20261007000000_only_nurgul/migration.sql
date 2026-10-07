-- The salon works with a single master. Hide every other active profile;
-- appointments stay linked to them and the admin can re-activate a master later.
UPDATE "Master"
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "isActive" = true
  AND "name" <> 'Нургуль'
  AND EXISTS (SELECT 1 FROM "Master" WHERE "name" = 'Нургуль' AND "isActive" = true);
