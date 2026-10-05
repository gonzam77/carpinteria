# Herramientas de verificación

Scripts para comprobar los cálculos y el stock contra una copia restaurada de un backup (PLAN §7). Ninguno se usa en producción.

| Archivo | Para qué sirve |
|---|---|
| `guillotina.mjs` | Verifica si un acomodo de piezas se puede cortar con cortes de guillotina. Se ejecuta con `node guillotina.mjs` para correr la autoprueba. |
| `e2e-f04.mjs` | Prueba de punta a punta de F0.4: orden de las filas, detalle guardado en la constancia, listado de materiales y edición sin cambios. |
| `e2e-f44-navegador.mjs` | Prueba en el navegador de F4.4, el asistente "Nueva solicitud de modulos", con Edge sin ventana. Cubre permisos y menú, los 4 pasos con sus validaciones (iguales al alta), el teclado en la grilla, los colores sin el canto que hace falta y las medidas mal escritas. En los cantos por pieza revisa que se tomen del perfil, que se marque cada lado y que se avisen los espesores que faltan. Revisa que haya una sola vista previa a la vez (con el servidor demorado a propósito), el 409 `MODULE_CHANGED`, el doble click, el bloqueo mientras se crea, la respuesta perdida (busca la solicitud en vez de crearla otra vez), salir mientras se crea, el catálogo que cambia con el asistente abierto y el borrador. También comprueba que el plano dé las mismas placas que la vista previa, y el detalle común las mismas placas e importe guardados. Mira tablet y celular, que corte siga igual y la barra del editor de módulos. **Cambia la copia por un rato:** crea solicitudes "Prueba F4.4 ...", sube la versión de un módulo y desactiva otro, y al final deja todo como estaba. Necesita Vite (paso 5 de abajo), Microsoft Edge y `playwright-core` en una carpeta aparte; no es dependencia del proyecto. Tiene que dar todo ok. |
| `e2e-f43.mjs` | Prueba de F4.3: el alta de una solicitud de módulos guarda exactamente lo que mostró la vista previa (placas, cada componente, detalle, filas, módulos y su copia de la definición); m² por material; reserva y devolución exacta del stock; la carrera entre borrar y cambiar de estado (por concurrencia y determinista, con un script tsx sobre `deleteOrderReturningStock`); búsquedas, filtros y orden del listado con controles negativos; el fondo elegido en la solicitud (se guarda el usado y Materiales lo cuenta); la clave de alta (el mismo intento otra vez, dos a la vez y un reintento con una fecha vencida dan una sola solicitud, y la búsqueda por clave); errores (fecha, email, campos, versión cambiada, permisos). **Cambia la copia por un rato:** carga una placa de 3 mm como fondo si no hay, pone 500 placas en los materiales que usa y crea solicitudes "Prueba F4.3 ..." que borra al final, y deja todo como estaba. Si encuentra solicitudes "Prueba F4.3..." de una corrida que se cortó, no toca nada y avisa. Revisión manual: `select count(*) from pedidos where cliente like 'Prueba F4.3%'` tiene que dar 0, `select "materialFondoId" from configuracion_modulos` lo que tenía (en la copia original, null) y el stock de los colores, el de antes. Tiene que dar todo ok. |
| `e2e-f42.mjs` | Prueba de F4.2: paridad de placas y presupuesto entre `POST /api/pedidos-modulos/preview` y `POST /api/orders/preview` (las mismas filas tal cual, agregadas, invertidas y partidas) en cada módulo activo con los dos perfiles, en una solicitud de varios módulos (con un fondo elegido en la solicitud) y en un módulo de prueba con material fijo y fondo propio. También prueba las filas (material por rol, color de los cantos, código de barra, orden y origen), los errores de spec §8.2, §8.3 y §8.6, los 400 de datos mal formados y el 403. **Cambia la copia por un rato:** si la configuración no tiene fondo, carga una placa de 3 mm, y crea el módulo `PRUEBA_E2E_F42`; las dos cosas se deshacen al final. No guarda pedidos. Tiene que dar todo ok y listar los módulos que no entran con sus valores por defecto (hoy, los dos placares de P6). Si se cortó a mitad: `select codigo from modulos where codigo = 'PRUEBA_E2E_F42'` tiene que dar vacío y `select "materialFondoId" from configuracion_modulos` tiene que dar lo que tenía (en la copia original, null). |
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

5. Solo para `e2e-f44-navegador.mjs`, que maneja el navegador:
   - levantar el backend del paso 3 con `FRONTEND_URL=http://127.0.0.1:5180`;
   - levantar Vite contra ese backend: `cd frontend` y `VITE_API_URL=http://127.0.0.1:4100/api npx vite --host 127.0.0.1 --port 5180 --strictPort`;
   - instalar `playwright-core` en una carpeta temporal (`npm i playwright-core`), fuera del proyecto;
   - correr `PLAYWRIGHT_DIR=<esa carpeta> node docs/modulos/herramientas/e2e-f44-navegador.mjs`. Las capturas van a `SHOTS_DIR`, por defecto una carpeta del directorio temporal.

Los scripts crean un pedido de prueba, lo borran al terminar y dejan el stock como estaba. Al final, apagar el backend (y Vite, si se usó) y verificar que los puertos 4100 y 5180 quedaron libres: si queda un proceso viejo, la próxima corrida prueba el código anterior.
