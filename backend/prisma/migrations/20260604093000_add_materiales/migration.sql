CREATE TABLE "materiales" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "anchoPlaca" INTEGER NOT NULL,
    "altoPlaca" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materiales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "materiales_nombre_key" ON "materiales"("nombre");
CREATE INDEX "materiales_activo_idx" ON "materiales"("activo");

ALTER TABLE "detalle_pedidos" ADD COLUMN "materialId" TEXT;
CREATE INDEX "detalle_pedidos_materialId_idx" ON "detalle_pedidos"("materialId");

ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "detalle_pedidos_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materiales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
