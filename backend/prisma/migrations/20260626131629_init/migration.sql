-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'CARPINTERO', 'OPERARIO', 'EMPLEADO');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'TERMINADA', 'ENTREGADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "TipoMaterial" AS ENUM ('PLACA', 'CANTO');

-- CreateTable
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

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "numeroContacto" TEXT,
    "observaciones" TEXT,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "stockReservado" BOOLEAN NOT NULL DEFAULT false,
    "placasEstimadas" INTEGER NOT NULL DEFAULT 0,
    "costoPlacas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costoCantos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metrosCanto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presupuestoEstimado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "faltanteStock" BOOLEAN NOT NULL DEFAULT false,
    "usuarioId" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materiales" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoMaterial" NOT NULL DEFAULT 'PLACA',
    "valor" DOUBLE PRECISION NOT NULL,
    "espesorMm" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "anchoPlaca" INTEGER,
    "altoPlaca" INTEGER,
    "colorCanto" TEXT,
    "stockPlacas" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_pedidos" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "materialId" TEXT,
    "codigoBarra" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "largo" INTEGER NOT NULL,
    "ancho" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "cantoLargo1Id" TEXT,
    "cantoLargo1Nombre" TEXT,
    "cantoLargo1" BOOLEAN NOT NULL DEFAULT false,
    "cantoLargo2Id" TEXT,
    "cantoLargo2Nombre" TEXT,
    "cantoLargo2" BOOLEAN NOT NULL DEFAULT false,
    "cantoAncho1Id" TEXT,
    "cantoAncho1Nombre" TEXT,
    "cantoAncho1" BOOLEAN NOT NULL DEFAULT false,
    "cantoAncho2Id" TEXT,
    "cantoAncho2Nombre" TEXT,
    "cantoAncho2" BOOLEAN NOT NULL DEFAULT false,
    "permiteRotar" BOOLEAN NOT NULL DEFAULT false,
    "codigoBarraCentro" TEXT,
    "remark" TEXT,
    "numeroCliente" TEXT,
    "nombreCliente" TEXT,
    "nombreProducto" TEXT,

    CONSTRAINT "detalle_pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "configuracion_optimizador" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "espesorSierraMm" DOUBLE PRECISION NOT NULL DEFAULT 4.3,
    "perfiladoBordeMm" INTEGER NOT NULL DEFAULT 10,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_optimizador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_empresa" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "nombre" TEXT NOT NULL DEFAULT 'ROMA',
    "telefono" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "usuarioId" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_googleId_key" ON "usuarios"("googleId");

-- CreateIndex
CREATE INDEX "pedidos_estado_idx" ON "pedidos"("estado");

-- CreateIndex
CREATE INDEX "pedidos_cliente_idx" ON "pedidos"("cliente");

-- CreateIndex
CREATE INDEX "pedidos_fechaCreacion_idx" ON "pedidos"("fechaCreacion");

-- CreateIndex
CREATE UNIQUE INDEX "materiales_nombre_key" ON "materiales"("nombre");

-- CreateIndex
CREATE INDEX "materiales_tipo_idx" ON "materiales"("tipo");

-- CreateIndex
CREATE INDEX "materiales_activo_idx" ON "materiales"("activo");

-- CreateIndex
CREATE INDEX "detalle_pedidos_materialId_idx" ON "detalle_pedidos"("materialId");

-- CreateIndex
CREATE INDEX "historial_pedidos_pedidoId_idx" ON "historial_pedidos"("pedidoId");

-- CreateIndex
CREATE INDEX "auditorias_entidad_idx" ON "auditorias"("entidad");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_usuarioId_idx" ON "push_subscriptions"("usuarioId");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "detalle_pedidos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "detalle_pedidos_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materiales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_pedidos" ADD CONSTRAINT "historial_pedidos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_pedidos" ADD CONSTRAINT "historial_pedidos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
