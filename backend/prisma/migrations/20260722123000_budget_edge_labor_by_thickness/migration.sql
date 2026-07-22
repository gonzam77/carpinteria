ALTER TABLE "configuracion_presupuesto"
ADD COLUMN "manoObraCanto045Mm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "manoObraCanto1Mm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "manoObraCanto2Mm" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "configuracion_presupuesto"
SET
  "manoObraCanto045Mm" = "manoObraCantoPorMetro",
  "manoObraCanto1Mm" = "manoObraCantoPorMetro",
  "manoObraCanto2Mm" = "manoObraCantoPorMetro";

ALTER TABLE "configuracion_presupuesto"
DROP COLUMN "manoObraCantoPorMetro";
