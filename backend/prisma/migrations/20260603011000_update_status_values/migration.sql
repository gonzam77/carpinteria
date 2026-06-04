UPDATE "pedidos" SET "estado" = 'EN_PROCESO' WHERE "estado" IN ('APROBADO', 'PRODUCCION');
UPDATE "pedidos" SET "estado" = 'TERMINADA' WHERE "estado" = 'FINALIZADO';
