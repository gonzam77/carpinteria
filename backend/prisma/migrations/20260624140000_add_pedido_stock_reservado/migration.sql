ALTER TABLE "pedidos"
ADD COLUMN "stockReservado" BOOLEAN NOT NULL DEFAULT false;

UPDATE "pedidos"
SET "stockReservado" = true
WHERE "estado" = 'EN_PROCESO';
