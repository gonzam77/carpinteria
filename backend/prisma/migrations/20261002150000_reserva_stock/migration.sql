-- Stock comprometido por cada pedido: las placas por material que se descontaron, para devolver exactamente
-- eso al volver a pendiente, rechazar o borrar. Antes solo se guardaba un booleano y se recalculaba.
ALTER TABLE "pedidos" ADD COLUMN "reservaStock" JSONB;

-- Pedidos que ya estan en un estado con stock comprometido (en proceso, terminado o entregado) pero sin
-- reserva: se avanzaron sin descontar stock (a la fuerza, o directo de pendiente a terminado). Se marcan
-- como reserva "forzada" para que ninguna transicion futura les descuente stock de golpe.
-- Los que tienen stockReservado = true quedan en NULL: se devuelven recalculando, como hasta ahora.
UPDATE "pedidos"
SET "reservaStock" = '{"version": 1, "forzada": true, "items": [], "legado": true}'::jsonb
WHERE "estado" IN ('EN_PROCESO', 'TERMINADA', 'ENTREGADA') AND "stockReservado" = false;
