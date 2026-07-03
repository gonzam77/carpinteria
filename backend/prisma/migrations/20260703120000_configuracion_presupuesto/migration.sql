-- CreateTable
CREATE TABLE "configuracion_presupuesto" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "manoObraCantoPorMetro" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manoObraCortePorPieza" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_presupuesto_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "materiales" DROP COLUMN "valorManoObra";
