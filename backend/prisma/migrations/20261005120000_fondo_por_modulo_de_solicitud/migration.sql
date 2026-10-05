-- Fondo por modulo de la solicitud (DECISIONES 32): la placa que usaron las piezas de fondo, elegida en la
-- solicitud o la del modulo o la de la configuracion. Columna nueva y opcional: no toca datos existentes.

-- AlterTable
ALTER TABLE "pedidos_modulo" ADD COLUMN     "materialFondoId" TEXT;

-- AddForeignKey
ALTER TABLE "pedidos_modulo" ADD CONSTRAINT "pedidos_modulo_materialFondoId_fkey" FOREIGN KEY ("materialFondoId") REFERENCES "materiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
