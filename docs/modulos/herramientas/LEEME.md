# Herramientas de verificación

Scripts para comprobar los cálculos y el stock contra una copia restaurada de un backup (PLAN §7). Ninguno se usa en producción.

| Archivo | Para qué sirve |
|---|---|
| `guillotina.mjs` | Verifica si un acomodo de piezas se puede cortar con cortes de guillotina. Se ejecuta con `node guillotina.mjs` para correr la autoprueba. |
| `e2e-f04.mjs` | Prueba de punta a punta de F0.4: orden de las filas, detalle guardado en la constancia, listado de materiales y edición sin cambios. |
| `e2e-f42.mjs` | Prueba de F4.2: paridad de placas y presupuesto entre `POST /api/pedidos-modulos/preview` y `POST /api/orders/preview` (las mismas filas tal cual, agregadas, invertidas y partidas) en cada módulo activo con los dos perfiles, en una solicitud de varios módulos y en un módulo de prueba con material fijo y fondo propio. También prueba las filas (material por rol, color de los cantos, código de barra, orden y origen), los errores de spec §8.2, §8.3 y §8.6, los 400 de datos mal formados y el 403. **Cambia la copia por un rato:** si la configuración no tiene fondo, carga una placa de 3 mm, y crea el módulo `PRUEBA_E2E_F42`; las dos cosas se deshacen al final. No guarda pedidos. Tiene que dar todo ok y listar los módulos que no entran con sus valores por defecto (hoy, los dos placares de P6). Si se cortó a mitad: `select codigo from modulos where codigo = 'PRUEBA_E2E_F42'` tiene que dar vacío y `select "materialFondoId" from configuracion_modulos` tiene que dar lo que tenía (en la copia original, null). |
| `e2e-f41.mjs` | Prueba de F4.1, antes y después. Compara pedido por pedido dos backends sobre la misma copia: el anterior en el puerto 4101 (un `git worktree` del commit previo) y el actual en el 4100. Compara el listado, el detalle, el listado de materiales, la vista previa, el dashboard, el alta y la edición. También prueba que el listado excluya los pedidos de módulos, que `PUT` responda 400 sobre uno de ellos y que `normalizeDetails` se comporte bien. Sin el backend anterior, prueba solo lo nuevo. |
| `e2e-f31.mjs` | Prueba de punta a punta de F3.1 y F3.2: API del catálogo (listado, alta, validaciones, edición, activación, duplicar, borrar, evaluar, categorías y configuración), imágenes (subir, ETag, límite de 1 MB, tipo real) y permisos. Necesita el catálogo importado y `UPLOADS_DIR`. |
| `e2e-f23.mjs` | Prueba de punta a punta de F2.3: un material usado por el catálogo de módulos no se puede borrar definitivamente (409) y, al desactivarlo, avisa. |
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
