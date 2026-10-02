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
