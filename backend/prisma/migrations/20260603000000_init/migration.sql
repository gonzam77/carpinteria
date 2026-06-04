CREATE TYPE "Rol" AS ENUM ('ADMIN', 'CARPINTERO');
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'TERMINADA', 'RECHAZADA');

CREATE TABLE "usuarios" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "apellido" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT,
  "telefono" TEXT,
  "googleId" TEXT,
  "rol" "Rol" NOT NULL DEFAULT 'CARPINTERO',
  "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pedidos" (
  "id" TEXT NOT NULL,
  "cliente" TEXT NOT NULL,
  "numeroContacto" TEXT,
  "observaciones" TEXT,
  "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
  "usuarioId" TEXT NOT NULL,
  "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaActualizacion" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "detalle_pedidos" (
  "id" TEXT NOT NULL,
  "pedidoId" TEXT NOT NULL,
  "codigoBarra" TEXT NOT NULL,
  "material" TEXT NOT NULL,
  "largo" INTEGER NOT NULL,
  "ancho" INTEGER NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "cantoLargo1" BOOLEAN NOT NULL DEFAULT false,
  "cantoLargo2" BOOLEAN NOT NULL DEFAULT false,
  "cantoAncho1" BOOLEAN NOT NULL DEFAULT false,
  "cantoAncho2" BOOLEAN NOT NULL DEFAULT false,
  "codigoBarraCentro" TEXT,
  "remark" TEXT,
  "numeroCliente" TEXT,
  "nombreCliente" TEXT,
  "nombreProducto" TEXT,
  CONSTRAINT "detalle_pedidos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "historial_pedidos" (
  "id" TEXT NOT NULL,
  "pedidoId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "accion" TEXT NOT NULL,
  "valorAnterior" TEXT,
  "valorNuevo" TEXT,
  "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "historial_pedidos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auditorias" (
  "id" TEXT NOT NULL,
  "usuarioId" TEXT,
  "accion" TEXT NOT NULL,
  "entidad" TEXT NOT NULL,
  "entidadId" TEXT,
  "metadata" JSONB,
  "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auditorias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");
CREATE UNIQUE INDEX "usuarios_googleId_key" ON "usuarios"("googleId");
CREATE INDEX "pedidos_estado_idx" ON "pedidos"("estado");
CREATE INDEX "pedidos_cliente_idx" ON "pedidos"("cliente");
CREATE INDEX "pedidos_fechaCreacion_idx" ON "pedidos"("fechaCreacion");
CREATE INDEX "historial_pedidos_pedidoId_idx" ON "historial_pedidos"("pedidoId");
CREATE INDEX "auditorias_entidad_idx" ON "auditorias"("entidad");

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "detalle_pedidos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "historial_pedidos" ADD CONSTRAINT "historial_pedidos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "historial_pedidos" ADD CONSTRAINT "historial_pedidos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
