-- DECISIONES 45: el canto de cada lado se elige por pieza y queda en las filas (detalle_pedidos). Ya no hay un color
-- de canto unico por modulo de la solicitud. Produccion no tiene solicitudes de modulos todavia.

-- DropForeignKey
ALTER TABLE "pedidos_modulo" DROP CONSTRAINT "pedidos_modulo_colorCantoId_fkey";

-- AlterTable
ALTER TABLE "pedidos_modulo" DROP COLUMN "colorCantoId";
