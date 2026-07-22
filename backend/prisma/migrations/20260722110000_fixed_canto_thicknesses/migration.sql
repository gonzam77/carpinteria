UPDATE "materiales"
SET "espesorMm" = 0.45
WHERE tipo = 'CANTO' AND "espesorMm" = 0.4;

ALTER TABLE "materiales"
ADD CONSTRAINT "materiales_canto_espesor_mm_check"
CHECK (
  tipo <> 'CANTO'
  OR "espesorMm" IN (0.45, 1, 2)
);
