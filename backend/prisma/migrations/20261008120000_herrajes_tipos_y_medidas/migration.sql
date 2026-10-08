-- DECISIONES 57 (Fase 6): tipos de herraje, linea y medida de cada modelo, formula de medida en el modulo y, en la
-- solicitud, el tipo, la linea, la medida, el orden y el origen de cada herraje. Solo agrega: produccion no tiene
-- herrajes cargados todavia.

-- AlterTable
ALTER TABLE "herrajes" ADD COLUMN     "linea" TEXT,
ADD COLUMN     "medidaMm" DOUBLE PRECISION,
ADD COLUMN     "tipoId" TEXT;

-- AlterTable
ALTER TABLE "modulos_herraje" ADD COLUMN     "formulaMedida" TEXT;

-- AlterTable
ALTER TABLE "pedidos_herraje" ADD COLUMN     "linea" TEXT,
ADD COLUMN     "medidaMm" DOUBLE PRECISION,
ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "origen" "OrigenDetalle",
ADD COLUMN     "tipo" TEXT;

-- CreateTable
CREATE TABLE "tipos_herraje" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_herraje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_herraje_nombre_key" ON "tipos_herraje"("nombre");

-- CreateIndex
CREATE INDEX "herrajes_tipoId_idx" ON "herrajes"("tipoId");

-- AddForeignKey
ALTER TABLE "herrajes" ADD CONSTRAINT "herrajes_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "tipos_herraje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

