# Herramientas de verificación

Scripts para comprobar los cálculos y el stock contra una copia restaurada de un backup (PLAN §7). Ninguno se usa en producción.

| Archivo | Para qué sirve |
|---|---|
| `guillotina.mjs` | Verifica si un acomodo de piezas se puede cortar con cortes de guillotina. Se ejecuta con `node guillotina.mjs` para correr la autoprueba. |
| `e2e-f04.mjs` | Prueba de punta a punta de F0.4: orden de las filas, detalle guardado en la constancia, listado de materiales y edición sin cambios. |
| `e2e-f05.mjs` | Prueba de punta a punta de F0.5: reserva y devolución exacta de stock, transiciones, concurrencia, forzado sin stock, edición de materiales y borrado. |

## Cómo correr las pruebas de punta a punta

1. Restaurar un backup en el contenedor descartable `carpinteria-analisis-db` (PLAN §7) y aplicar las migraciones:

   ```bash
   cd backend
   DATABASE_URL=postgresql://carpinteria:analisis_local@127.0.0.1:55432/carpinteria npx prisma migrate deploy
   ```

2. Vaciar las suscripciones push **de la copia**, para no notificar a nadie:

   ```bash
   docker exec carpinteria-analisis-db psql -U carpinteria -d carpinteria -c "delete from push_subscriptions"
   ```

3. Levantar el backend en el puerto 4100 contra esa copia, sin claves de push ni de WhatsApp:

   ```bash
   cd backend
   DATABASE_URL=postgresql://carpinteria:analisis_local@127.0.0.1:55432/carpinteria JWT_SECRET=prueba-local-analisis-0123456789 PORT=4100 PUSH_VAPID_PUBLIC_KEY= PUSH_VAPID_PRIVATE_KEY= WHATSAPP_TOKEN= npx tsx src/server.ts
   ```

4. En otra terminal, correr `node docs/modulos/herramientas/e2e-f05.mjs`. En Git Bash hay que anteponer `MSYS_NO_PATHCONV=1`.

Los scripts crean un pedido de prueba, lo borran al terminar y dejan el stock como estaba. Al final, apagar el backend y verificar que el puerto 4100 quedó libre: si queda un proceso viejo, la próxima corrida prueba el código anterior.
