-- Modulos a medida, catalogo (PLAN F2.1; spec §5.1, §5.2 y §5.4). Solo crea tablas nuevas: no toca las
-- existentes. Las tablas de herrajes se crean aunque el opcional no este contratado (spec §5.5).

-- CreateEnum
CREATE TYPE "TipoParametroModulo" AS ENUM ('MEDIDA', 'ENTERO', 'OPCION', 'CALCULADO');

-- CreateEnum
CREATE TYPE "RolPiezaModulo" AS ENUM ('ESQUELETO', 'FRENTE', 'FONDO', 'FIJO');

-- CreateEnum
CREATE TYPE "LadoCanto" AS ENUM ('LARGO_1', 'LARGO_2', 'ANCHO_1', 'ANCHO_2');

-- CreateTable
CREATE TABLE "categorias_modulo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_modulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "espesorDisenoMm" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "materialFondoId" TEXT,
    "observaciones" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulos_imagen" (
    "moduloId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "datos" BYTEA NOT NULL,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modulos_imagen_pkey" PRIMARY KEY ("moduloId")
);

-- CreateTable
CREATE TABLE "modulos_parametro" (
    "id" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipo" "TipoParametroModulo" NOT NULL DEFAULT 'MEDIDA',
    "valorDefecto" DOUBLE PRECISION,
    "minimo" DOUBLE PRECISION,
    "maximo" DOUBLE PRECISION,
    "opciones" JSONB,
    "formula" TEXT,
    "ayuda" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modulos_parametro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulos_pieza" (
    "id" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "RolPiezaModulo" NOT NULL DEFAULT 'ESQUELETO',
    "materialFijoId" TEXT,
    "formulaLargo" TEXT NOT NULL,
    "formulaAncho" TEXT NOT NULL,
    "formulaCantidad" TEXT NOT NULL DEFAULT '1',
    "permiteRotar" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "observaciones" TEXT,

    CONSTRAINT "modulos_pieza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulos_perfil_canto" (
    "id" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL,
    "predeterminado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "modulos_perfil_canto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulos_pieza_canto" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,
    "lado" "LadoCanto" NOT NULL,
    "espesorMm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "modulos_pieza_canto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_modulos" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "materialFondoId" TEXT,
    "redondeo" TEXT NOT NULL DEFAULT 'REDONDEAR',
    "diasEntregaDefecto" INTEGER NOT NULL DEFAULT 15,
    "diasAvisoVencimiento" INTEGER NOT NULL DEFAULT 3,
    "herrajesHabilitados" BOOLEAN NOT NULL DEFAULT false,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_modulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "herrajes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "herrajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulos_herraje" (
    "id" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "herrajeId" TEXT NOT NULL,
    "formulaCantidad" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modulos_herraje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_modulo_nombre_key" ON "categorias_modulo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "modulos_codigo_key" ON "modulos"("codigo");

-- CreateIndex
CREATE INDEX "modulos_categoriaId_idx" ON "modulos"("categoriaId");

-- CreateIndex
CREATE INDEX "modulos_activo_idx" ON "modulos"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "modulos_parametro_moduloId_clave_key" ON "modulos_parametro"("moduloId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "modulos_pieza_moduloId_codigo_key" ON "modulos_pieza"("moduloId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "modulos_perfil_canto_moduloId_orden_key" ON "modulos_perfil_canto"("moduloId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "modulos_pieza_canto_perfilId_piezaId_lado_key" ON "modulos_pieza_canto"("perfilId", "piezaId", "lado");

-- CreateIndex
CREATE UNIQUE INDEX "herrajes_nombre_key" ON "herrajes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "modulos_herraje_moduloId_herrajeId_key" ON "modulos_herraje"("moduloId", "herrajeId");

-- AddForeignKey
ALTER TABLE "modulos" ADD CONSTRAINT "modulos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_modulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos" ADD CONSTRAINT "modulos_materialFondoId_fkey" FOREIGN KEY ("materialFondoId") REFERENCES "materiales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_imagen" ADD CONSTRAINT "modulos_imagen_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_parametro" ADD CONSTRAINT "modulos_parametro_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_pieza" ADD CONSTRAINT "modulos_pieza_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_pieza" ADD CONSTRAINT "modulos_pieza_materialFijoId_fkey" FOREIGN KEY ("materialFijoId") REFERENCES "materiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_perfil_canto" ADD CONSTRAINT "modulos_perfil_canto_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_pieza_canto" ADD CONSTRAINT "modulos_pieza_canto_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "modulos_perfil_canto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_pieza_canto" ADD CONSTRAINT "modulos_pieza_canto_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "modulos_pieza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_modulos" ADD CONSTRAINT "configuracion_modulos_materialFondoId_fkey" FOREIGN KEY ("materialFondoId") REFERENCES "materiales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_herraje" ADD CONSTRAINT "modulos_herraje_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_herraje" ADD CONSTRAINT "modulos_herraje_herrajeId_fkey" FOREIGN KEY ("herrajeId") REFERENCES "herrajes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

