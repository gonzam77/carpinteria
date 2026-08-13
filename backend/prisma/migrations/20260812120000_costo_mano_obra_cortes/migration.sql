ALTER TABLE "pedidos"
ADD COLUMN "costoManoObraCortes" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Los presupuestos existentes ya incluian este importe en el total, aunque no
-- se guardaba por separado. Se reconstruye para conservar el desglose historico.
UPDATE "pedidos"
SET "costoManoObraCortes" = GREATEST(
  0,
  "presupuestoEstimado" - "costoPlacas" - "costoCantos"
);
