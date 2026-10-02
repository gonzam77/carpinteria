-- Las imagenes de los modulos pasan de la base a archivos en el servidor (UPLOADS_DIR), por decision de
-- Gonzalo (DECISIONES 12). La tabla guarda solo el nombre del archivo, el tipo y el tamano.
-- La tabla todavia no se uso en produccion: las imagenes que hubiera las vuelve a cargar el importador.
DELETE FROM "modulos_imagen";
ALTER TABLE "modulos_imagen" DROP COLUMN "datos";
ALTER TABLE "modulos_imagen" ADD COLUMN "archivo" TEXT NOT NULL;
ALTER TABLE "modulos_imagen" ADD COLUMN "tamanoBytes" INTEGER NOT NULL;
