-- Clave de alta de las solicitudes de modulos (DECISIONES 40): un UUID que genera el navegador por cada intento de
-- alta. Si el mismo intento llega dos veces (respuesta perdida y reintento), se devuelve la solicitud ya creada. Columna
-- nueva y opcional, con indice unico: no toca datos existentes (los nulos no chocan entre si).

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "claveAlta" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_claveAlta_key" ON "pedidos"("claveAlta");
