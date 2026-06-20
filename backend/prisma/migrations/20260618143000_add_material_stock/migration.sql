ALTER TABLE "materiales"
ADD COLUMN "stockPlacas" INTEGER;

UPDATE "materiales"
SET "stockPlacas" = 0
WHERE "tipo" = 'PLACA' AND "stockPlacas" IS NULL;
