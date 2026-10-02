-- Modulos a medida, solicitudes (PLAN F2.2; spec §5.3 y §5.5, punto 2). Todo lo existente queda como
-- solicitud de CORTE; las columnas nuevas son nullable o tienen default.

-- CreateEnum
CREATE TYPE "TipoPedido" AS ENUM ('CORTE', 'MODULOS');

-- CreateEnum
CREATE TYPE "OrigenDetalle" AS ENUM ('CALCULADO', 'EDITADO', 'MANUAL');

-- AlterTable
ALTER TABLE "detalle_pedidos" ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "origen" "OrigenDetalle",
ADD COLUMN     "pedidoModuloId" TEXT,
ADD COLUMN     "piezaCodigo" TEXT;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "costoHerrajes" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "direccionEntrega" TEXT,
ADD COLUMN     "emailContacto" TEXT,
ADD COLUMN     "fechaEntrega" DATE,
ADD COLUMN     "tipo" "TipoPedido" NOT NULL DEFAULT 'CORTE';

-- Numero correlativo (spec D6 y §5.5, punto 2). Editado a mano: Prisma lo genera como SERIAL, que numeraria
-- los pedidos existentes en un orden arbitrario. Aca se numeran por fecha de creacion (desempate por id) y
-- la secuencia sigue desde el ultimo numero.
CREATE SEQUENCE "pedidos_numero_seq" AS INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "numero" INTEGER;
UPDATE "pedidos" AS p
SET "numero" = numerados.n
FROM (SELECT id, row_number() OVER (ORDER BY "fechaCreacion", id)::integer AS n FROM "pedidos") AS numerados
WHERE p.id = numerados.id;
SELECT setval('"pedidos_numero_seq"', COALESCE((SELECT MAX("numero") FROM "pedidos"), 0) + 1, false);
ALTER TABLE "pedidos" ALTER COLUMN "numero" SET DEFAULT nextval('"pedidos_numero_seq"');
ALTER TABLE "pedidos" ALTER COLUMN "numero" SET NOT NULL;
ALTER SEQUENCE "pedidos_numero_seq" OWNED BY "pedidos"."numero";

-- CreateTable
CREATE TABLE "pedidos_modulo" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "moduloId" TEXT,
    "posicion" INTEGER NOT NULL,
    "nombreModulo" TEXT NOT NULL,
    "valores" JSONB NOT NULL,
    "colorEsqueletoId" TEXT NOT NULL,
    "colorFrentesId" TEXT NOT NULL,
    "colorCantoId" TEXT NOT NULL,
    "perfilCantoOrden" INTEGER NOT NULL DEFAULT 1,
    "observaciones" TEXT,
    "definicionSnapshot" JSONB NOT NULL,

    CONSTRAINT "pedidos_modulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_herraje" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "pedidoModuloId" TEXT,
    "herrajeId" TEXT,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "valorUnitario" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "pedidos_herraje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedidos_modulo_moduloId_idx" ON "pedidos_modulo"("moduloId");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_modulo_pedidoId_posicion_key" ON "pedidos_modulo"("pedidoId", "posicion");

-- CreateIndex
CREATE INDEX "detalle_pedidos_pedidoModuloId_idx" ON "detalle_pedidos"("pedidoModuloId");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");

-- CreateIndex
CREATE INDEX "pedidos_tipo_idx" ON "pedidos"("tipo");

-- CreateIndex
CREATE INDEX "pedidos_fechaEntrega_idx" ON "pedidos"("fechaEntrega");

-- AddForeignKey
ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "detalle_pedidos_pedidoModuloId_fkey" FOREIGN KEY ("pedidoModuloId") REFERENCES "pedidos_modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_modulo" ADD CONSTRAINT "pedidos_modulo_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_modulo" ADD CONSTRAINT "pedidos_modulo_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_modulo" ADD CONSTRAINT "pedidos_modulo_colorEsqueletoId_fkey" FOREIGN KEY ("colorEsqueletoId") REFERENCES "materiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_modulo" ADD CONSTRAINT "pedidos_modulo_colorFrentesId_fkey" FOREIGN KEY ("colorFrentesId") REFERENCES "materiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_modulo" ADD CONSTRAINT "pedidos_modulo_colorCantoId_fkey" FOREIGN KEY ("colorCantoId") REFERENCES "materiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_herraje" ADD CONSTRAINT "pedidos_herraje_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_herraje" ADD CONSTRAINT "pedidos_herraje_pedidoModuloId_fkey" FOREIGN KEY ("pedidoModuloId") REFERENCES "pedidos_modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_herraje" ADD CONSTRAINT "pedidos_herraje_herrajeId_fkey" FOREIGN KEY ("herrajeId") REFERENCES "herrajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

