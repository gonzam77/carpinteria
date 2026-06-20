CREATE TYPE "TipoMaterial" AS ENUM ('PLACA', 'CANTO');

ALTER TABLE "materiales"
ADD COLUMN "tipo" "TipoMaterial" NOT NULL DEFAULT 'PLACA',
ADD COLUMN "colorCanto" TEXT,
ALTER COLUMN "anchoPlaca" DROP NOT NULL,
ALTER COLUMN "altoPlaca" DROP NOT NULL;

CREATE INDEX "materiales_tipo_idx" ON "materiales"("tipo");
