-- AlterTable
ALTER TABLE "materiales" ADD COLUMN "valorManoObra" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "materiales" ADD COLUMN "placaMaterialId" TEXT;

-- CreateIndex
CREATE INDEX "materiales_placaMaterialId_idx" ON "materiales"("placaMaterialId");

-- AddForeignKey
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_placaMaterialId_fkey" FOREIGN KEY ("placaMaterialId") REFERENCES "materiales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
