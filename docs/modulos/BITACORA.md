# Bitácora: Módulos a medida

Una entrada por sesión, la más reciente arriba. La completa la sesión al cerrar (`/cerrar-sesion`). Sirve para retomar en otra computadora u otro día sin tener que explicar nada. En las entradas no van datos personales de clientes: se usan ids cortos y cantidades.

## Plantilla

```markdown
## AAAA-MM-DD · equipo <nombre> · rama <rama>

**Pasos:** F?.? (estado al cerrar)

**Hecho:**
- ...

**Quedó a medias (si aplica):** archivo, función y qué falta exactamente.

**Decisiones nuevas:** DECISIONES #...

**Verificaciones:** tests N/N, check:optimizer, tsc frontend y backend, build.

**Commits:** hash y mensaje, o "sin commit: los cambios están solo en este equipo".

**Próximo paso:** F?.?, y lo primero que hay que hacer.

**Esperando a Gonzalo o a ROMA:** P? (ver PLAN §6).
```

---

## 2026-10-03 (11) · equipo Pinformatico15 · rama main

**Pasos:** F3.2 terminado.

**Hecho:** del lado del navegador:
- la compresión de imágenes (`lib/imageCompression.ts`), con el codificador separado del canvas para poder testearla;
- 5 tests;
- `api/moduleImages.ts`;
- el hook `useModuleImage`.

**Verificaciones:**
- frontend `npm test`: 39, 12, 5 y 5, todos en verde;
- `tsc` y build en verde.

**No probado en el navegador:** la compresión real con canvas y el hook. Se usan en las pantallas de F3.3 y F3.4.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F3.3, pantalla del catálogo:
- tipos en `frontend/src/types`;
- rutas `/configuracion-modulos`;
- menú "Catálogo de módulos";
- tarjetas, filtros, métricas, duplicar y activar/desactivar (spec §6.1).

---

## 2026-10-03 (10) · equipo Pinformatico15 · rama main

**Pasos:**
- F3.1 terminado.
- F3.2: el backend está hecho; falta el frontend.

**Hecho:**
- **API `/api/modulos`** (spec §13.1), en `backend/src/modules/catalog/`. Las rutas fijas van antes de `/:id`.
- **Validaciones de §5.6** en `validateModuleInput`: devuelve todos los errores juntos. Si el módulo está activo, las fórmulas tienen que evaluar sin errores; inactivo, se guarda como borrador.
- **Endpoints de imagen** con el almacenamiento en disco: un 413 claro por encima de 1 MB, un 415 si el tipo real no es imagen, `ETag` y 304.
- **Prueba de punta a punta** `herramientas/e2e-f31.mjs`: 30 de 30, y la base y la carpeta de imágenes quedan como estaban.

**Verificaciones:** `tsc` y build en verde.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:**
1. F3.2 en el frontend: compresión a 1200 px con WebP o JPEG de hasta 1 MB, y el hook `useModuleImage`.
2. F3.3: tipos, rutas, menú y pantalla del catálogo.

---

## 2026-10-03 (9) · equipo Pinformatico15 · rama main

**Decisión de Gonzalo (DECISIONES 12):** las imágenes de los módulos van como archivos en el servidor, comprimidas y con 1 MB como máximo. Cambia la spec D5, que las guardaba en la base. El ABM de módulos ya estaba en la spec, en la sección 6.

**Hecho:**
- **`UPLOADS_DIR`** en `env.ts`, más el volumen `uploads_data` en `docker-compose.yml` y `backend/uploads/` en `.gitignore`.
- **Migración `20261003180000_imagenes_en_disco`:** `modulos_imagen` deja de guardar los bytes y pasa a guardar `archivo` y `tamanoBytes`.
- **`module-images.service.ts`**, con validación de tamaño y de tipo real y escritura atómica.
- **El importador guarda las imágenes como archivos:** 11 archivos, 271 KB en total, sin duplicar al correrlo de nuevo.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F3.1, la API del catálogo, en `backend/src/modules/catalog/`. Después, F3.2: los endpoints de imagen y la compresión en el navegador.

---

## 2026-10-03 (8) · equipo Pinformatico15 · rama main

**Pasos:** F2.5 terminado. La Fase 2 está completa.

**Hecho:**
- **`findPiecesThatDoNotFit`** en `cutOptimizer.ts`: el encaje con el criterio del optimizador.
- **Script `catalogo:planilla-revision`** (`backend/src/scripts/planilla-revision-catalogo.ts`).
- **Planilla generada** en `docs/modulos/revision-roma/`: 33 modelos, 305 piezas y 3 que no entran en 1830 × 2600.
  - `PLACARD_2_PUERTAS_UN_LADO_PERCHERO`: el fondo de 2498 × 1998.
  - `PLACARD_EN_ESPEJO_2_PUERTAS`: el fondo de 2000 × 2000, y las puertas de 962 × 1934, que no rotan.

**Para Gonzalo:** mandar la planilla a ROMA. Sus respuestas resuelven P5 y P6.

**Verificaciones:** `tsc` del backend en verde; `check:optimizer` en verde.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F3.1, la API del catálogo (`backend/src/modules/modules/`).

---

## 2026-10-03 (7) · equipo Pinformatico15 · rama main

**Pasos:** F2.4 terminado.

**Hecho:** importador `prisma/seed-modulos.ts` (spec §16; DECISIONES 6). Hace:
- categorías;
- upsert por código, respetando `version > 1` salvo con `--force`;
- perfiles Estándar (el predeterminado) y Económico;
- fondos sin canto;
- variante de fondo del escobero;
- imágenes;
- validación con el motor: un módulo activo con errores se importa inactivo.

Se verificó sobre la copia del backup (ver PLAN F2.4). El catálogo quedó importado en el contenedor `carpinteria-analisis-db`.

**Verificaciones:**
- `tsc` y build del backend en verde;
- test de paridad del motor: 12 de 12.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F2.5, planilla de revisión para ROMA: por modelo, piezas, rol, cantos propuestos y rotación, y los dos modelos que no entran en la placa.

---

## 2026-10-03 (6) · equipo Pinformatico15 · rama main

**Pasos:** F2.3 terminado.

**Hecho:**
- **Materiales y vínculos con el catálogo y las solicitudes de módulos** (spec §5.6):
  - se muestran en el listado;
  - bloquean el borrado definitivo con un 409 claro, en lugar del P2003 de la base;
  - al desactivar el material, avisan en la pantalla de Materiales.
- **Prueba de punta a punta** `herramientas/e2e-f23.mjs`: 4 de 4. Usa un módulo de prueba que se borra al terminar.

**Verificaciones:** `tsc` en verde en frontend y backend.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F2.4, importador `backend/prisma/seed-modulos.ts` (spec §16; DECISIONES 6).

---

## 2026-10-03 (5) · equipo Pinformatico15 · rama main

**Pasos:** F2.2 terminado.

**Hecho:**
- **Esquema:** enums `TipoPedido` y `OrigenDetalle`.
  - `Pedido` suma `numero`, `tipo`, `fechaEntrega @db.Date`, `emailContacto`, `direccionEntrega` y `costoHerrajes`.
  - `DetallePedido` suma `pedidoModuloId`, `piezaCodigo`, `origen` y `orden`.
  - Hay dos tablas nuevas, `PedidoModulo` y `PedidoHerraje`, y las relaciones de color en `Material`.
- **Migración `20261003150000_pedido_tipo_y_modulos`:** `numero` se completa a mano en orden de creación, con una secuencia y `setval`.
- **Verificado sobre la copia:**
  - los conteos y el presupuesto total no cambian;
  - los números van del 1 al 65 en orden, todos los pedidos quedan como `CORTE` y no queda diferencia entre el esquema y la base;
  - pasan `e2e-f04` y `e2e-f05`, y los pedidos nuevos toman número desde el 66.

**Verificaciones:** `tsc` del backend en verde. El frontend no cambió.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F2.3, que `countMaterialLinks` y `canDeletePermanently` cuenten los vínculos nuevos, con un 409 claro (spec §5.6).

---

## 2026-10-03 (4) · equipo Pinformatico15 · rama main

**Pasos:** F0.9 terminado. La Fase 0 está completa.

**Hecho:**
- **Banco de pruebas** `frontend/src/lib/cutOptimizer.bench.ts` (`npm run bench:optimizer`): compara contra una versión base con `--base` y suma pedidos reales con `--datos`.
- **Optimizador** (DECISIONES 0.12): prueba los otros órdenes de candidatos y hace una segunda búsqueda en materiales chicos. Ahorra placas en 2 de 156 casos (uno real), no empeora ninguno y todo se puede cortar.
- **Gonzalo eligió esperar más a cambio de ahorrar.** Los tiempos se agilizan al final (F7.4).
- **Script `pedidos:completar-detalle`:** guarda el detalle recalculado de los pedidos anteriores. Sin él, el dashboard superaría los 60 s; con él tarda 67 ms. En la copia completó 65 pedidos y 8 difieren de su constancia: el pedido `e28a8556` ahora coincide.
- **`guillotina.d.mts`** para usar el verificador desde TypeScript.

**Verificaciones:**
- tests 39, 12 y 5, todos en verde (el de 40 piezas, con el nuevo límite de 8 s);
- `check:optimizer` y `tsc` en verde;
- `npm run build` en verde.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F2.2, migración de pedidos.

---

## 2026-10-03 (3) · equipo Pinformatico15 · rama main

**Decisiones de Gonzalo:**
- **F0.8 descartado:** no va a haber datos de las placas que se usaron en pedidos anteriores, y lo de atrás no es prioridad.
- **Regla nueva, la 2 de CLAUDE.md:** de ahora en adelante, resultados óptimos para el carpintero (menos placas) y reales para el dueño (se pueden cortar), para que nadie pierda plata.

**Consecuencia:** F0.9 se redefinió como "el optimizador da el mejor resultado posible" y pasa a ser el próximo paso, antes de F2.2.

---

## 2026-10-03 (2) · equipo Pinformatico15 · rama main

**Decisión de Gonzalo (F0.7):** las 7 constancias desactualizadas se respetan con los importes ya informados a los clientes. No hubo cambios de código. Ver DECISIONES 0.5.

---

## 2026-10-03 · equipo Pinformatico15 · rama main

**Pasos:** F2.1 terminado.

**Hecho:**
- **Modelos del catálogo en `schema.prisma`**: CategoriaModulo, Modulo, ModuloImagen, ModuloParametro, ModuloPieza, ModuloPerfilCanto, ModuloPiezaCanto, ConfiguracionModulos (con clave foránea al material de fondo, DECISIONES 9), Herraje y ModuloHerraje. También las relaciones inversas en `Material`.
- **Migración `20261003120000_modulos_catalogo`**:
  - se generó con `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, con `DATABASE_URL` apuntando al contenedor;
  - se aplicó con `migrate deploy`, sin diferencias;
  - las claves foráneas se revisaron: cascada desde el módulo, SetNull en el material de fondo y Restrict en el material fijo y en el herraje.

**Nota para F2.3:** las claves foráneas nuevas a `materiales` hacen que el borrado permanente de un material usado en el catálogo falle con P2003. Hay que contarlas en `countMaterialLinks` (spec §5.6).

**Verificaciones:**
- tests 39, 12 y 5, todos en verde;
- `check:optimizer` y `tsc` en verde;
- `npm run build` en verde.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F2.2, migración de pedidos. Se genera con `--create-only` (o con `migrate diff`) y se edita a mano el backfill de `numero` por `fechaCreacion` (spec §5.5, punto 2). Lleva `fechaEntrega @db.Date` (DECISIONES 8).

---

## 2026-10-02 (noche, 3) · equipo Pinformatico15 · rama main

**Pasos:** F0.10 terminado. Con eso, todo el código de la Fase 0 está hecho.

**Hecho:**
- `buildPiecesFromRows` normaliza las piezas rotables a ancho ≤ largo, girando los cantos, y la clave del grupo no distingue un giro de 180° (DECISIONES 0.11).
- Test T39.
- Sobre el backup: 0 cambios de placas en 101 pares, y todas las placas se pueden cortar.

**Verificaciones:**
- tests 39, 12 y 5, todos en verde;
- `check:optimizer` y `tsc` en verde;
- `npm run build` en verde.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F2.1, esquema del catálogo de módulos (spec §5.1, §5.2 y §5.4; DECISIONES 9).

**Esperando a Gonzalo o a ROMA:**
- F0.7: decidir qué hacer con las constancias desactualizadas;
- F0.8: placas reales del taller;
- P1 a P8.

---

## 2026-10-02 (noche, 2) · equipo Pinformatico15 · rama main

**Pasos:** F0.6 terminado.

**Hecho:** `CutOptimizer.tsx` (DECISIONES 0.10):
- espera la configuración real del optimizador antes de calcular;
- muestra como error, y sin costo, lo que el backend rechazaría;
- busca las placas por nombre solo entre placas;
- muestra el desglose global igual al de la constancia.

**No probado a mano:** la pantalla en el navegador. Conviene verlo cuando Gonzalo levante el entorno local (PLAN §3.1):
- el plano en el formulario y en el detalle;
- un pedido con un material inactivo, en edición.

**Verificaciones:**
- tests 38, 12 y 5, todos en verde;
- `check:optimizer` y `tsc` en verde;
- `npm run build` en verde.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F0.10, piezas rotables cargadas al revés. Después, la Fase 2: modelo de datos del catálogo.

**Esperando a Gonzalo o a ROMA:** P1 a P8, sin cambios.

---

## 2026-10-02 (noche) · equipo Pinformatico15 · rama main

**Pasos:** F0.5 terminado.

**Hecho:**
- **Migración `20261002150000_reserva_stock`:** agrega `Pedido.reservaStock` y marca como forzados los 24 pedidos anteriores que avanzaron sin descontar stock. Se probó con `migrate deploy` sobre la copia: no queda diferencia entre el esquema y la base.
- **Reglas del stock comprometido** (DECISIONES 0.9) en `order-stock.service.ts` y en las rutas de pedidos: cambio de estado con bloqueo optimista, devolución exacta y borrado que devuelve el stock.
- **Edición de materiales por diferencia de stock**, en `materials.routes.ts` y `MaterialsPage.tsx`.
- **Diálogo de stock insuficiente** para cualquier estado que descuente, en `OrderDetailPage.tsx`.
- **Listado de materiales:** ya no marca como faltantes las placas propias.
- **Prueba de punta a punta**, `herramientas/e2e-f05.mjs`, contra la copia del backup: 22 de 22. La de F0.4 también quedó en `herramientas/`, junto con un LEEME.

**Atención:** al probar, quedó vivo un backend viejo en el puerto 4100 y la primera corrida probó el código anterior. Al terminar, verificar siempre que el puerto quedó libre (se explica en `herramientas/LEEME.md`).

**Verificaciones:**
- tests 38, 12 y 5, todos en verde;
- `check:optimizer` y `tsc` en verde;
- `npm run build` en verde.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F0.6, plano de cortes coherente con el backend:
- esperar la configuración real antes de calcular;
- no mostrar un costo parcial si una pieza no entra;
- no omitir los materiales inactivos en la edición.

**Esperando a Gonzalo o a ROMA:** P1 a P8, sin cambios.

---

## 2026-10-02 (tarde) · equipo Pinformatico15 · rama main

**Pasos:** F0.4 terminado.

**Hecho:**
- **Migración `20261002120000_estimacion_detalle_e_indice`:** agrega `Pedido.estimacionDetalle` y `DetallePedido.indice`, con backfill por `ctid`, más un índice `(pedidoId, indice)`. Se probó con `migrate deploy` sobre el contenedor: no queda diferencia entre el esquema y la base.
- **El snapshot guarda el detalle del cálculo**, `normalizeDetails` numera las filas y todas las lecturas usan `DETALLES_ORDENADOS` (`order-queries.ts`).
- **El listado de materiales y el dashboard leen el detalle guardado** (`orderMaterialBoards`). En los pedidos anteriores, el diálogo de materiales avisa que se recalculó.
- **Prueba de punta a punta:** backend local en el puerto 4100 contra la copia, sin push, con un pedido de prueba de 38 filas que después se borró. 12 de 12 chequeos: orden de las filas, detalle guardado, el listado igual a la constancia, y editar sin cambios o con las filas invertidas da el mismo snapshot.
- **En la copia del backup** quedaron vacías las suscripciones push, para no notificar a nadie en las pruebas.

**Verificaciones:**
- tests 38, 12 y 5, todos en verde;
- `check:optimizer` y `tsc` en verde;
- `npm run build` en verde.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F0.5, reserva de stock exacta. Reservar desde `estimacionDetalle`, guardar lo reservado por material y liberar exactamente eso, con transiciones idempotentes, actualización condicional del estado y ajuste de stock por delta.

**Esperando a Gonzalo o a ROMA:** P1 a P8, sin cambios.

**Decisión de Gonzalo:** no se despliega nada a la VPS hasta terminar y probar todo en local, con Docker y PostgreSQL. El pase a producción quedó como el paso F8 del plan.

---

## 2026-10-02 · equipo Pinformatico15 · rama main

**Pasos:** F0.3 terminado. F0.1b sigue pendiente porque lo despliega Gonzalo en el servidor.

**Hecho:**
- **`frontend/src/lib/orderEstimate.ts`**, la única función de placas y presupuesto (DECISIONES 0.3 y 0.8). Está sincronizada a `backend/src/shared/`, porque se agregó a `sharedFiles` del script de sincronización.
- **`order-estimate.service.ts` y `order-stock.service.ts`** la usan para el snapshot, el listado de materiales, el stock y el dashboard. Se eliminó `calculateBoardsForMaterial`.
- **`CutOptimizer.tsx`** calcula con la misma función y toma el total de ella. Se eliminó `calculateRowEdgeCost`.
- **`backend/tsconfig.json`** tiene `rewriteRelativeImportExtensions`.
- **Tests:** `orderEstimate.test.ts`, con la paridad entre modulos, carga fusionada, de a una pieza y permutada, y los casos de redondeo, errores y faltante.
- **Script `npm --prefix backend run pedidos:recalcular`** (`backend/src/scripts/recalcular-pedidos.ts`).
- **Medido sobre el backup**, en el contenedor `carpinteria-analisis-db`, con los mismos precios:
  - 0 cambios de placas;
  - como mucho 1,2 centavos por importe.

  Contra lo guardado, solo los 9 pedidos ya conocidos del estimador viejo (DECISIONES 0.5) tienen otra cantidad de placas. Las diferencias de plata vienen de aumentos de precios posteriores.

**Verificaciones:**
- frontend `npm test`: 38 de 38, 12 de 12 y 5 de 5;
- `check:optimizer` en verde;
- `tsc` en verde en frontend y backend;
- `npm run build` en verde, y el backend compilado carga `orderEstimate.js`.

No se probó el plano en el navegador: la lógica es la misma función que cubren los tests.

**Commits:** ver `git log`, si Gonzalo aprobó el commit.

**Próximo paso:**
1. F0.4: migración con el detalle del cálculo en el snapshot (placas por material y mm por canto) y columna `indice` en `DetallePedido`.
2. Antes de desplegar, F0.1b: desplegar F0.1 y F0.3 juntos, frontend y backend.

**Esperando a Gonzalo o a ROMA:** P1 a P8 (PLAN §6), sin cambios.

---

## 2026-10-01 · equipo Pinformatico15 · rama main

**Pasos:**
- F1, F0.1 y F0.2 terminados.
- Plan de trabajo armado.

**Hecho:**
- **Análisis de la spec contra el código real.** La spec da por existente `useFormDraft`: llegó con el pull de `6018f7a` (manejo de sesión y borradores). El paquete de referencia se movió a `docs/modulos/`, que es la ruta que usa la spec.
- **F1, motor de fórmulas.**
  - `frontend/src/lib/moduleFormula.ts` y su copia en `backend/src/shared/`.
  - Tests con la paridad 305/305.
  - `scripts/sync-optimizer.mjs` sincroniza los dos archivos compartidos.
  - Datos del catálogo e imágenes en `backend/prisma/data/`.
- **Auditoría de paridad de cálculo.** Workflow de 29 agentes, con verificación adversarial de cada hallazgo. Resultado: DECISIONES 0.1 a 0.6 y reglas R1 a R8.
- **F0.1, optimizador.** El desempate usaba el id de pieza, que lleva el número de fila, y las mismas piezas en otro orden podían dar otra cantidad de placas. Ejemplo con el catálogo: 2 o 3 placas. Se corrigió en `cutOptimizer.ts`, con los tests T36 a T38, que fallan con el código anterior.
- **F0.2, impacto en producción.**
  - Backup `carpinteria_2026-10-01_03-00-01.backup`, que está en Descargas de este equipo y no en el repo.
  - Se restauró en el contenedor Docker descartable `carpinteria-analisis-db`, en `127.0.0.1:55432`.
  - Resultado: la corrección no cambia ningún pedido.
  - Además aparecieron 7 constancias abiertas calculadas con el estimador viejo (DECISIONES 0.5).
- **Comparación con el estimador viejo** (DECISIONES 0.6). El viejo daba menos placas porque 138 de sus 307 placas no se pueden cortar con guillotina. El optimizador actual no es peor.
- **Plan de trabajo:**
  - `docs/modulos/PLAN.md` y esta bitácora;
  - `CLAUDE.md` en la raíz;
  - los comandos `/continuar` y `/cerrar-sesion` en `.claude/commands/`;
  - `.gitignore` para backups y configuración local.

**Verificaciones:**
- frontend `npm test`: 38 de 38 del optimizador y 12 de 12 del motor;
- `check:optimizer` en verde;
- `tsc` en verde en frontend y backend.

**Commits:** por pedido de Gonzalo, en `main` y separados por tema: F0.1, F1, docs del paquete y plan, y CLAUDE.md con los comandos. Push a `origin/main` (ver `git log`). La rama local `feature/modulos-a-medida` queda sin uso.

**Fuera del repo, solo en este equipo:**
- el backup en Descargas;
- el contenedor `carpinteria-analisis-db`;
- los scripts de la medición F0.2, en el directorio temporal de la sesión.

Para repetir la medición en otra computadora: restaurar un backup (PLAN §7) y usar el script que va a dejar F0.3.

**Próximo paso:**
1. F0.1b: desplegar frontend y backend juntos.
2. F0.3: presupuesto exacto con una función compartida.

**Esperando a Gonzalo o a ROMA:**
- P1: Herrajes.
- P2: las 7 constancias.
- P3: placas reales del taller.
- P4: despliegue de F0.1.
- P6: dos modelos que no entran en la placa.
- P7: placa de 26000.
- P8: el contenedor con el backup.
