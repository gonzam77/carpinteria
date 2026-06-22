CREATE TABLE "configuracion_empresa" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "nombre" TEXT NOT NULL DEFAULT 'ROMA',
  "telefono" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "fechaActualizacion" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "configuracion_empresa_pkey" PRIMARY KEY ("id")
);

INSERT INTO "configuracion_empresa" ("id", "nombre", "telefono", "email", "fechaActualizacion")
VALUES ('default', 'ROMA', '', '', NOW())
ON CONFLICT ("id") DO NOTHING;
