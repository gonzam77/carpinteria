-- Formulas por defecto de cada herraje: se precargan al agregarlo a un modulo (solo agrega columnas opcionales).
ALTER TABLE "herrajes" ADD COLUMN "formulaCantidadDefecto" TEXT,
ADD COLUMN "formulaMedidaDefecto" TEXT;
