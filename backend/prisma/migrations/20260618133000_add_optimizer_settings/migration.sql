CREATE TABLE "configuracion_optimizador" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "espesorSierraMm" DOUBLE PRECISION NOT NULL DEFAULT 4.3,
  "perfiladoBordeMm" INTEGER NOT NULL DEFAULT 10,
  "fechaActualizacion" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "configuracion_optimizador_pkey" PRIMARY KEY ("id")
);

INSERT INTO "configuracion_optimizador" ("id", "espesorSierraMm", "perfiladoBordeMm", "fechaActualizacion")
VALUES ('default', 4.3, 10, NOW())
ON CONFLICT ("id") DO NOTHING;
