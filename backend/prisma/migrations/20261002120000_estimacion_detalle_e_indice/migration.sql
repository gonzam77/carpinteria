-- Detalle del calculo de la constancia (placas por material, mm por canto, precios y configuracion usados).
-- Los pedidos anteriores quedan en NULL y se siguen calculando en vivo hasta que se recalculen a proposito.
ALTER TABLE "pedidos" ADD COLUMN "estimacionDetalle" JSONB;

-- Posicion de cada fila en su pedido, para leer siempre en el mismo orden.
ALTER TABLE "detalle_pedidos" ADD COLUMN "indice" INTEGER NOT NULL DEFAULT 0;

-- Las filas existentes se numeran en su orden fisico actual (ctid), que es el orden en que hoy las devuelve
-- la base: asi ningun pedido cambia lo que muestra.
UPDATE "detalle_pedidos" AS d
SET "indice" = numeradas.posicion
FROM (
  SELECT id, (row_number() OVER (PARTITION BY "pedidoId" ORDER BY ctid) - 1)::integer AS posicion
  FROM "detalle_pedidos"
) AS numeradas
WHERE d.id = numeradas.id;

CREATE INDEX "detalle_pedidos_pedidoId_indice_idx" ON "detalle_pedidos"("pedidoId", "indice");
