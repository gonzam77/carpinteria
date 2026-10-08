# Plan de trabajo: Módulos a medida

Fuente de verdad del avance. Cualquier sesión, en cualquier computadora, arranca leyendo este archivo y lo actualiza al cerrar (protocolo en [CLAUDE.md](../../CLAUDE.md)).

- Qué construir: [ESPECIFICACION-MODULOS-A-MEDIDA.md](ESPECIFICACION-MODULOS-A-MEDIDA.md) (la "spec"; las referencias §N son a ese documento).
- Decisiones tomadas: [DECISIONES.md](DECISIONES.md).
- Qué se hizo en cada sesión: [BITACORA.md](BITACORA.md).

---

## 1. Estado actual

**Actualizado:** 2026-10-07

- **Rama:** `main`, porque se trabaja directo sobre main (ver §4). Todo lo hecho hasta F7.1 está commiteado y subido (con el OK de Gonzalo). F7.2 está commiteado en local; su push espera el OK. Cada push espera su OK.
- **Último paso terminado:** F7.2 (pulido). Las Fases 0 a 5 están completas; la 6 (herrajes) espera que se definan las reglas.
- **Próximo paso:** **F7.4**, agilizar los tiempos del optimizador (sin dar nunca más placas). La **Fase 6** (herrajes) queda para después: Gonzalo pidió seguir y definir los herrajes más adelante (2026-10-08).
- **Para mandar a ROMA:** `docs/modulos/revision-roma/planilla-revision-catalogo.xlsx`.
- **Producción:** la VPS **no se toca hasta terminar y probar todo**. Lo decidió Gonzalo el 2026-10-02. Mientras tanto se desarrolla y se prueba en local, con Docker y PostgreSQL (§3.1). El pase a producción es el paso F8.
- **Esperando decisiones:** ver §6.

| Paso | Qué | Estado |
|---|---|---|
| F0.1 | Optimizador independiente del orden de las filas | [x] |
| F0.2 | Medir el impacto con el backup de producción | [x] |
| F0.3 | Presupuesto exacto con una función compartida | [x] |
| F0.4 | Una sola verdad por pedido: detalle por material y orden estable | [x] |
| F0.5 | Reserva de stock exacta y transiciones de estado | [x] |
| F0.6 | Plano de cortes coherente con el backend | [x] |
| F0.7 | Constancias desactualizadas (decisión comercial) | [x] se respetan |
| F0.8 | Validar contra las placas que usó la máquina | [-] descartado: no hay datos |
| F0.9 | Optimizador: el mejor resultado posible | [x] |
| F0.10 | Piezas rotables cargadas al revés | [x] |
| F1 | Motor de fórmulas | [x] |
| F2.1–F2.5 | Modelo de datos, migraciones e importador | [x] |
| F3.1–F3.4 | API y pantallas del catálogo | [x] |
| F4.1–F4.5 | API, asistente y listado de solicitudes de módulos | [x] |
| F4.6–F4.7 | Tildes, colores de estado, sin Remark y cantos por pieza | [x] |
| F5.1–F5.5 | Detalle, edición, Excel, hoja de taller, no regresión | [x] |
| F6 | Herrajes (contratados, DECISIONES 10) | [ ] se definen más adelante |
| F7.1–F7.3 | Recalcular módulo, pulido y aceptación con ROMA | [~] F7.1 y F7.2 hechos |
| F8 | Pase a producción (VPS), al final | [ ] |

---

## 2. Cómo usar este plan

- **Un paso entra, más o menos, en una sesión.** Si no entra, se marca `[~]` y la bitácora dice exactamente dónde quedó.
- **No se empieza un paso** si sus dependencias no están en `[x]`.
- **Estados:**

  | Marca | Significado |
  |---|---|
  | `[ ]` | pendiente |
  | `[~]` | en curso |
  | `[x]` | terminado |
  | `[!]` | bloqueado |
  | `[-]` | descartado |

- **Un paso está terminado** cuando:
  - se cumple su "Terminado cuando";
  - las verificaciones de §2.1 dan verde;
  - hay una entrada en la bitácora;
  - el estado está actualizado en §1.
- Lo que se decida en el camino va a [DECISIONES.md](DECISIONES.md), con número.
- **Si el código actual contradice la spec:** en lo que ya existe, gana el código; en lo nuevo, gana la spec. Si no se puede resolver, se anota en DECISIONES.md y se sigue con la opción por defecto (spec §0.1).

### 2.1 Verificaciones de siempre

```bash
cd frontend && npm test           # optimizador (39), motor de fórmulas (17), presupuesto (6), compresión de imágenes (5) y editor de módulos (8)
cd backend && npm test            # armado de solicitudes de módulos, fechas y esquemas (21), sin base de datos
npm run check:optimizer           # desde la raíz: el código compartido está sincronizado
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
npm run build                     # desde la raíz, antes de cerrar una fase
```

Son comandos de Bash. En PowerShell 5.1 no existe `&&`: ejecutalos en líneas separadas (`cd frontend`, `npm test`, `cd ..`) o separados por `;`.

Tres tests de tiempo del optimizador ("responde en menos de 1.5s", entre otros) pueden fallar si la PC está ocupada con otros procesos. Antes de dar un fallo por real, volvé a correrlos con la máquina libre.

Si un paso toca placas o presupuesto, además tiene que agregar o mantener un **test de paridad** (regla 1 de CLAUDE.md).

---

## 3. Preparar una computadora

1. **Instalar:**
   - Git;
   - Node 22 o superior (los tests usan `--experimental-strip-types`);
   - Docker Desktop;
   - Claude Code.
2. **Bajar el código:**

   ```bash
   git clone https://github.com/gonzam77/carpinteria.git
   cd carpinteria
   git checkout main                         # o la rama que diga §1
   npm run install:all
   ```

3. **Crear los `.env`.** No están en el repo: copialos desde un lugar seguro, nunca por chat ni commit.
   - `/.env` (lo usa docker-compose): `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`, `VITE_API_URL`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `WHATSAPP_*` y `PUSH_VAPID_*`.
   - `backend/.env`: `DATABASE_URL`, `JWT_SECRET` (16 caracteres o más), `JWT_EXPIRES_IN`, `PORT`, `FRONTEND_URL`, `SESSION_MAX_HOURS` (opcional, 24 por defecto), `WHATSAPP_*` y `PUSH_VAPID_*`.
   - `frontend/.env`: `VITE_API_URL`.
4. **Regenerar el cliente de Prisma:** `cd backend && npx prisma generate`. Hay que hacerlo **siempre después de un pull** que cambie `schema.prisma`; el cliente viejo compila, pero falla en runtime.
5. **Comprobar que todo funciona:** correr §2.1. Todo tiene que dar verde antes de tocar nada.
6. **Base local con datos reales (opcional; necesaria para probar migraciones):** ver §7.

### 3.1 Entorno local de pruebas

Todo se prueba en local antes de pensar en producción.

- **Levantar la app:** `docker compose up -d --build` levanta la base (`127.0.0.1:5433`), la API (`127.0.0.1:4000`) y la web (`127.0.0.1:5173`).
- **Desarrollo:** `npm run dev:backend` y `npm run dev:frontend`, con `docker compose up -d db`.
- **Migraciones:** el contenedor de la API aplica las migraciones al arrancar (`prisma migrate deploy`).
- **Datos reales:** para probar con los datos de producción, se restaura un backup en la base local siguiendo §7. Se cambia el nombre del contenedor y el puerto por los del compose, o se usa el contenedor descartable de §7 y se apunta `DATABASE_URL` a él.

---

## 4. Ramas, commits y despliegue

- **Se trabaja directamente sobre `main`.** Lo decidió Gonzalo el 2026-10-01.
- **La VPS no se actualiza hasta terminar y probar todo (F8).** Lo decidió Gonzalo el 2026-10-02. Aun así:
  - todo commit en `main` deja verdes las verificaciones de §2.1, incluido `npm run build`;
  - las migraciones nuevas no rompen lo existente (columnas nuevas con default o nullable), porque el día del pase se aplican sobre la base real.
- **Al empezar, `git pull`; al cerrar, commit y push.** Así otra computadora encuentra todo al día.
- **Commits separados, uno por paso o por tema**, con un mensaje que nombre el paso, por ejemplo `F2.1: esquema del catálogo de módulos`.
- **Commit y push solo con el OK de Gonzalo.** Al cerrar la sesión se le proponen los mensajes.
- **Si dos computadoras tocaron el plan o la bitácora a la vez,** al hacer pull se resuelve el conflicto quedándose con las dos entradas de la bitácora y con el estado más avanzado de cada paso.
- **Para deshacer un commit ya subido,** se usa `git revert <hash>` y nunca `push --force`.
- **Frontend y backend se despliegan juntos** cuando cambia código compartido (`frontend/src/lib/*.ts` y `backend/src/shared/*.ts`). En F8 se despliega todo junto.
- **Nunca** correr `prisma migrate reset`, borrar `prisma/migrations` ni editar migraciones viejas. El README tiene una sección de "reset" que es solo para una base de desarrollo descartable.

---

## 5. Pasos

Formato de cada paso: **Depende de** · **Leer** · **Hacer** · **Terminado cuando** · **Verificar**.

### Fase 0: Cálculo único y exacto

Requisito del dueño (regla 1 de CLAUDE.md): para las mismas piezas, las placas y cada componente del presupuesto dan exactamente igual en una solicitud de corte y en una de módulos, en todas las pantallas y servicios. La auditoría del 2026-10-01 encontró que hoy no se cumple del todo (DECISIONES 0.1 a 0.6). Esta fase va **antes de la Fase 4**, porque los módulos tienen que usar el cálculo ya corregido. Las Fases 2 y 3 no dependen de F0.3 a F0.6 y se pueden adelantar si hace falta.

#### F0.1 Optimizador independiente del orden de las filas · [x]
- **Hecho:** el desempate entre acomodos usa `groupKey` en lugar del id de pieza. Están en `frontend/src/lib/cutOptimizer.ts` (`compareCandidates` y `layoutSignature`), en su copia `backend/src/shared/cutOptimizer.ts` y en los tests T36 a T38 de `frontend/src/lib/cutOptimizer.test.ts`, que fallan con el código anterior.
- **Medido:** en producción no cambia la cantidad de placas de ningún pedido (DECISIONES 0.2).

#### F0.10 Piezas rotables cargadas al revés · [x]
- **Hecho (2026-10-02):** ver DECISIONES 0.11, con el test T39.
- **Depende de:** F0.1.
- **Problema:** una pieza rotable cargada como ancho × largo o como largo × ancho tiene distinto `groupKey`, y el optimizador puede tratarla distinto. Es un hallazgo menor de la auditoría, sin verificar.
- **Hacer:**
  1. Reproducirlo con un test.
  2. Si se confirma, normalizar la orientación de las piezas rotables en `createPieceGroupKey`, sin tocar las que tienen veta.
- **Terminado cuando:** las mismas piezas rotables cargadas en cualquier orientación dan las mismas placas, con un test agregado a T36 a T38.

#### F0.2 Medir el impacto con el backup de producción · [x]
Los resultados están en DECISIONES 0.2, 0.5 y 0.6. Los scripts de esa medición quedaron fuera del repo, salvo el verificador de cortes de guillotina, que está en [herramientas/](herramientas/). F0.3 tiene que dejar un script permanente que recalcule todos los pedidos de un backup y los compare con lo guardado, para repetir la medición antes de cada despliegue que toque cálculos.

#### F0.3 Presupuesto exacto con una función compartida · [x]
- **Hecho (2026-10-02):** ver DECISIONES 0.3 y 0.8. La función está en `frontend/src/lib/orderEstimate.ts`, con sus tests, y la usan el snapshot, el listado de materiales, la reserva de stock, el dashboard y el plano. El script de recálculo es `npm --prefix backend run pedidos:recalcular`.
- **Depende de:** F0.1.
- **Leer:**
  - DECISIONES 0.3;
  - `backend/src/modules/orders/order-estimate.service.ts`, completo;
  - `frontend/src/components/CutOptimizer.tsx` (`calculateCuts` y `calculateRowEdgeCost`);
  - `scripts/sync-optimizer.mjs`.
- **Hacer:**
  1. **Crear `frontend/src/lib/orderEstimate.ts`**, una función pura sin Prisma.
     - **Entrada:** detalles, placas (precio y medidas), cantos (precio y espesor), configuración del optimizador y tarifas.
     - **Salida:** placas por material; mm y metros por canto; los mismos campos que hoy guarda el snapshot (`placasEstimadas`, `costoPlacas`, `costoManoObraCortes`, `costoMaterialCantos`, `costoPegadoCantos`, `costoCantos`, `metrosCanto` y `presupuestoEstimado`); y `faltanteStock`.
  2. **Calcular de forma exacta:**
     - acumular **enteros**: mm de canto por id y lado, y placas por material;
     - calcular la plata **una sola vez por canto y por material**, en centavos;
     - mano de obra = placas totales × tarifa;
     - un único redondeo, siempre mitad hacia arriba;
     - total = suma de los componentes.
  3. **Compartir y reemplazar:**
     - agregar el archivo a `sharedFiles` en `scripts/sync-optimizer.mjs`;
     - usarlo en `buildOrderEstimateSnapshot`, `buildOrderMaterialsSummary`, `calculateOrderMaterialBoards` y `CutOptimizer.tsx`;
     - eliminar las fórmulas duplicadas.
  4. **Definir el redondeo de precios:** si no se pasan a centavos, validar `multipleOf(0.01)` en materiales y tarifas. Anotar la decisión.
- **Terminado cuando:** las mismas filas fusionadas, partidas o permutadas dan cada componente `===`, y la constancia, el listado de materiales y el plano muestran los mismos números para el mismo pedido.
- **Además:** dejar un script en el repo (por ejemplo `backend/scripts/recalcular-pedidos.ts`) que se conecte a una base restaurada (§7), recalcule todos los pedidos con el código actual y liste las diferencias contra lo guardado. Solo lee la base y muestra ids cortos y cantidades.
- **Verificar:**
  - tests nuevos de paridad con filas de módulos del catálogo y con cargas a mano equivalentes;
  - §2.1;
  - recalcular los pedidos del backup (§7) y anotar las diferencias de centavos frente a lo guardado.

#### F0.4 Una sola verdad por pedido · [x]
- **Hecho (2026-10-02):** ver DECISIONES 0.4 y 11. Están la migración `20261002120000_estimacion_detalle_e_indice`, `Pedido.estimacionDetalle` (que escribe `buildOrderEstimateSnapshot`), `DetallePedido.indice` y el helper `DETALLES_ORDENADOS` (`order-queries.ts`). El listado de materiales y el dashboard leen el detalle. Para los pedidos anteriores (`origen: RECALCULADO`), el listado muestra un aviso.
- **Depende de:** F0.3.
- **Leer:** DECISIONES 0.4 y 0.5; spec §5.3 (DetallePedido.orden).
- **Hacer:**
  1. **Detalle del snapshot:** migración que agrega a `Pedido` el detalle del cálculo (placas por material, mm por canto, y los precios y la configuración usados). Lo escribe la función de F0.3.
  2. **Lecturas desde el snapshot:** el listado de materiales y el dashboard leen ese detalle. Recalcular pasa a ser una acción explícita.
  3. **Orden estable de detalles:**
     - una columna `indice` en `DetallePedido` con la posición en el pedido, para corte y módulos. `orden` queda para el orden de la pieza dentro del módulo, como dice la spec;
     - `orderBy` en un helper único para todos los `include: { detalles }`;
     - completar `indice` en los pedidos existentes con el orden actual.
- **Terminado cuando:** leer un pedido, editarlo sin cambios y volver a leerlo da el mismo snapshot; y el listado y el dashboard coinciden con la constancia.
- **Verificar:** migración probada sobre el backup (§7); tests de lectura y edición sin cambios; §2.1.

#### F0.5 Reserva de stock exacta · [x]
- **Hecho (2026-10-02):** ver DECISIONES 0.4 y 0.9. Están la migración `20261002150000_reserva_stock`, `Pedido.reservaStock` y `order-stock.service.ts` (`takeOrderStock`, `returnOrderStock` y `hasStockCommitment`). El cambio de estado lleva bloqueo optimista; la edición de materiales ajusta el stock por diferencia; el diálogo de stock insuficiente vale para cualquier estado que descuente. La prueba de punta a punta es `herramientas/e2e-f05.mjs`: 22 de 22.
- **Depende de:** F0.4.
- **Leer:** DECISIONES 0.4; `order-stock.service.ts` y `PATCH /orders/:id/status` en `orders.routes.ts`.
- **Hacer:**
  1. Guardar lo reservado por material (tabla o JSON) y liberar exactamente eso, sin recalcular.
  2. Reservar desde las placas del snapshot, que son las de la constancia.
  3. Transiciones idempotentes:
     - no reservar si ya hay una reserva;
     - pasar de PENDIENTE a TERMINADA consume stock;
     - volver de TERMINADA o ENTREGADA a EN_PROCESO no reserva otra vez.
  4. Concurrencia: actualizar con la condición `estado = estado previo` y verificar la cuenta.
  5. Editar un material no pisa el stock: el ajuste va por delta.
- **Terminado cuando:** reservar, cambiar la configuración y el orden de los detalles, y liberar devuelve el stock al valor inicial; y dos cambios de estado simultáneos no reservan doble.
- **Verificar:** tests de servicio y §2.1.

#### F0.6 Plano de cortes coherente con el backend · [x]
- **Hecho (2026-10-02):** ver DECISIONES 0.10. Todo está en `CutOptimizer.tsx`. No se probó a mano en el navegador: la lógica de placas y costos es la función compartida que cubren los tests.
- **Depende de:** F0.3.
- **Hacer:**
  - `CutOptimizer.tsx` no calcula hasta tener la configuración real del optimizador;
  - si una pieza no entra o falta la medida de una placa, muestra el mismo error que el backend y ningún costo parcial;
  - en la edición, los materiales y cantos inactivos que usa el pedido no se omiten en silencio.
- **Terminado cuando:** el plano y la constancia nunca muestran números distintos para el mismo pedido y en el mismo momento.

#### F0.7 Constancias desactualizadas · [x]
- **Decidido (2026-10-03):** se respetan los importes ya informados a los clientes. No se recalculan. Ver DECISIONES 0.5.
- 7 pedidos abiertos tienen una constancia calculada con el estimador viejo (DECISIONES 0.5). Diferencia neta de +$583.019 a precios del 2026-10-01.
- **Decisión:** recalcular esas constancias (y avisar a los clientes) o respetar lo cotizado.
- **Si se recalcula:** acción de administrador "Recalcular presupuesto", con historial (`RECALCULAR_PRESUPUESTO`) y ajuste de la reserva por la diferencia, que va junto con F0.5.

#### F0.8 Validar contra las placas que usó la máquina · [-] descartado
- **Gonzalo, 2026-10-03:** no se va a tener el dato de las placas que se usaron en los pedidos anteriores, y lo de atrás no es prioridad. El objetivo pasa a F0.9.
- Pedir al taller cuántas placas usó la seccionadora en estos pedidos:

  | Pedido | Material | Estimador viejo | Optimizador actual |
  |---|---|---|---|
  | `be131014` | Kendal encerado | 1 | 2 |
  | `be131014` | Gris arcilla | 5 | 6 |
  | `e28a8556` | Hickory natural aglomerado | 2 | 3 |
  | `91e6e94e` | Chromix plata | 3 | 2 |

- Si la máquina usó menos que el optimizador actual, se evalúa F0.9 o se mejora el optimizador.

#### F0.9 Optimizador: el mejor resultado posible · [x]
- **Hecho (2026-10-03):** ver DECISIONES 0.12.
- **Por qué:** ver la regla 2 de CLAUDE.md, para que nadie pierda plata. Hay margen medido:
  - en producción, con 10 veces más búsqueda, el pedido `e28a8556` baja de 3 a 2 placas;
  - en el caso de T36, probar todas las opciones empatadas da 1 placa en lugar de 2 (DECISIONES 0.1 y 0.6).
- **Hacer:**
  1. **Banco de pruebas permanente** (`frontend/src/lib/cutOptimizer.bench.ts` o similar). Usa los casos de los tests, pedidos armados con el catálogo de módulos y casos al azar con semilla. Mide placas, distancia a la cota por superficie y tiempo de trabajo. Para pedidos reales, compara contra un backup restaurado (§7).
  2. **Probar mejoras deterministas,** porque el presupuesto se mide en unidades de trabajo y no en reloj:
     - correr la mejora con cada orden de candidatos empatado y quedarse con el mínimo;
     - dar más presupuesto solo cuando el resultado queda a una placa de la cota y el material tiene pocas piezas;
     - hacer una búsqueda exacta en casos chicos.
  3. **Quedarse con la combinación** que más placas ahorra sin que la constancia tarde demasiado. Hubo problemas de demora: commit "Time out constancia".
- **Terminado cuando:**
  - ningún caso del banco ni de producción da más placas que hoy;
  - se ahorra donde hay margen;
  - todas las placas se pueden cortar con guillotina (`herramientas/guillotina.mjs`);
  - pasan T36 a T39;
  - el tiempo en el peor pedido real no supera el actual en más de 2 segundos.
- **Al desplegar (F8):** recalcular los pedidos abiertos para ver cuáles bajan de placas, porque eso cambia presupuestos.

### Fase 1: Motor de fórmulas · [x]
- **Hecho:**
  - `frontend/src/lib/moduleFormula.ts`, copiado a `backend/src/shared/`;
  - `frontend/src/lib/moduleFormula.test.ts`, con la paridad 305/305 contra `backend/prisma/data/modulos-muebles.json`;
  - `scripts/sync-optimizer.mjs`, que sincroniza los dos archivos;
  - datos e imágenes en `backend/prisma/data/`.
- Las mejoras sobre la referencia están en DECISIONES 1 a 4.

### Fase 2: Modelo de datos, migraciones e importador (spec §5 y §16)

#### F2.1 Esquema del catálogo · [x]
- **Hecho (2026-10-03):** migración `20261003120000_modulos_catalogo`, generada con `prisma migrate diff` contra la copia del backup y aplicada sin diferencias. Crea 3 enums y 10 tablas, sin tocar las existentes. Las relaciones con los pedidos van en F2.2. Por ahora la API no usa estas tablas.
- **Depende de:** F1.
- **Leer:** spec §5.1, §5.2, §5.4 y §5.5 (punto 1); DECISIONES 9.
- **Hacer:**
  - enums, `CategoriaModulo`, `Modulo`, `ModuloImagen`, `ModuloParametro`, `ModuloPieza`, `ModuloPerfilCanto`, `ModuloPiezaCanto`, `ConfiguracionModulos`, `Herraje` y `ModuloHerraje`;
  - las relaciones inversas en `Material`, con nombres explícitos;
  - `ConfiguracionModulos.materialFondoId` con clave foránea y `SetNull` (DECISIONES 9);
  - la migración `modulos_catalogo`.
- **Terminado cuando:** `prisma migrate deploy` aplica sin errores sobre una copia del backup (§7) y el cliente generado compila.

#### F2.2 Migración de pedidos · [x]
- **Hecho (2026-10-03):** migración `20261003150000_pedido_tipo_y_modulos`. Se generó con `migrate diff` y se editó a mano el backfill de `numero`. Sobre la copia del backup:
  - mismos 65 pedidos y 1404 filas, y el mismo presupuesto total;
  - `numero` del 1 al 65 en orden de creación, y la secuencia sigue en 66;
  - todos quedan con `tipo = CORTE`;
  - no queda diferencia entre el esquema y la base;
  - las pruebas `e2e-f04` y `e2e-f05` pasan.
- **Depende de:** F2.1 (y F0.4, si ya agregó columnas a `DetallePedido`).
- **Leer:** spec §5.3 y §5.5 (punto 2); DECISIONES 8.
- **Hacer:**
  1. Generar `pedido_tipo_y_modulos` con `--create-only` y editarla a mano.
  2. `Pedido.numero` con backfill por `fechaCreacion` (secuencia, `row_number()`, `setval` y `UNIQUE`).
  3. `tipo` con `CORTE` por defecto, `fechaEntrega @db.Date` (DECISIONES 8), `emailContacto`, `direccionEntrega` y `costoHerrajes`.
  4. Las tablas `PedidoModulo` y `PedidoHerraje`.
  5. En `DetallePedido`: `pedidoModuloId`, `piezaCodigo`, `origen` y `orden`.
- **Terminado cuando**, sobre la copia del backup:
  - los 65 pedidos tienen `numero` del 1 al 65 en orden de creación;
  - todos quedan con `tipo = CORTE`;
  - los conteos coinciden antes y después.

#### F2.3 Materiales y los vínculos nuevos · [x]
- **Hecho (2026-10-03):** en `materials.routes.ts`, `catalogLinkCounts` cuenta los vínculos con 6 consultas agrupadas.
  - El listado devuelve `linkedModulesCount`, y `canDeletePermanently` lo tiene en cuenta.
  - El borrado definitivo responde 409 `MATERIAL_IN_USE_BY_MODULES`.
  - Desactivar un material vinculado responde 200 con un `aviso`, que la pantalla de Materiales muestra.
  - La prueba es `herramientas/e2e-f23.mjs`: 4 de 4.
- **Depende de:** F2.2.
- **Leer:** spec §5.6, el ajuste en Materiales.
- **Hacer:** que `countMaterialLinks` y `canDeletePermanently` cuenten los vínculos nuevos y respondan 409 con un mensaje claro, y avisar al desactivar un color que usa el catálogo.

#### F2.4 Importador de los 33 modelos · [x]
- **Hecho (2026-10-03):** `backend/prisma/seed-modulos.ts`, con `npm run prisma:seed:modulos` y `prisma:seed:modulos:prod`.
- **Validación:** verifica cada módulo con el motor y con `validateIdentifier`; si un módulo activo tiene errores, lo importa inactivo y lo anota.
- **Resultado sobre la copia:**
  - 33 módulos (32 activos), 4 categorías, 11 imágenes, 114 medidas, 305 piezas, 66 perfiles y 794 lados de canto;
  - es idempotente: la segunda corrida da los mismos conteos;
  - respeta `version > 1`, salvo con `--force`;
  - desde la base, 303 piezas dan igual que el Excel, y las 2 del fondo partido del escobero quedan apagadas por defecto;
  - la versión compilada también funciona.
- **Datos:** se leen de `prisma/data`, relativo al directorio de trabajo, o de `MODULOS_DATA_DIR`.
- **Depende de:** F2.2.
- **Leer:** spec §16, la nota del escobero en §19, y DECISIONES 6.
- **Hacer:**
  - `backend/prisma/seed-modulos.ts`, que lee `backend/prisma/data/`;
  - idempotente: upsert por `codigo`, sin pisar si `version` es mayor que 1, salvo con `--force`;
  - crea las categorías;
  - dos perfiles: Estándar (el predeterminado) y Económico; FONDO sin canto;
  - escobero con `VARIANTE_FONDO`, el fondo del microondas con cantidad 1, e "Interior de placard" inactivo;
  - imágenes;
  - scripts `prisma:seed:modulos` para desarrollo y la versión compilada para producción.
- **Terminado cuando:** correrlo dos veces sobre la copia del backup da el mismo resultado, y la paridad 305/305 sigue en verde. Esa paridad se mide sobre el JSON crudo, sin la transformación del escobero.

#### F2.5 Planilla de revisión para ROMA · [x]
- **Hecho (2026-10-03):**
  - la planilla es `docs/modulos/revision-roma/planilla-revision-catalogo.xlsx`, lista para que Gonzalo la mande;
  - se regenera desde la base con `npm --prefix backend run catalogo:planilla-revision -- <archivo.xlsx>`;
  - tiene tres hojas: Resumen, Piezas (con material, cantos de los dos perfiles, rotación, fórmulas y columnas para que ROMA corrija) y Cómo revisar;
  - marca las piezas que no entran con `findPiecesThatDoNotFit`, que ahora exporta `cutOptimizer.ts` (DECISIONES R2). Sobre la placa más común, de 1830 × 2600, son 3: los fondos de los dos placares y las puertas del placard en espejo.
- **Hacer:** generar un listado por modelo (piezas, rol, cantos propuestos y rotación) para que ROMA revise las heurísticas (spec §16 y §19, puntos 1, 2, 4 y 6). Marcar los dos modelos que no entran en la placa con sus medidas por defecto (§6).
- **Terminado cuando:** Gonzalo la tiene para mandar.

### Fase 3: API y pantallas del catálogo (spec §6, §13.1 y §14)

#### F3.1 API del catálogo · [x]
- **Hecho (2026-10-03):** `backend/src/modules/catalog/`, con `catalog.schemas.ts`, `catalog.service.ts` y `catalog.routes.ts`, montada en `/api/modulos`, solo para administradores.
- **Endpoints:** listado (con `estadoFormulas` y observaciones), detalle, alta, edición (con `version + 1`), activar y desactivar, duplicar (con la imagen), borrar (409 si tiene pedidos), evaluar, categorías y configuración.
- **Validaciones de §5.6:** juntan todos los errores en `details.errores`.
- **Auditoría:** cada acción queda registrada.
- **Prueba:** `herramientas/e2e-f31.mjs`, 30 de 30.
- **Depende de:** F2.4.
- **Hacer:**
  - `backend/src/modules/catalog/` con rutas, schemas zod (`moduloSchema`) y servicio;
  - **orden de las rutas:** `/categorias`, `/configuracion` y `POST /evaluar` van antes de `/:id`;
  - validaciones de §5.6: claves y códigos (`validateIdentifier` de `moduleFormula.ts`), perfiles, y que las fórmulas evalúen sin error si el módulo está activo;
  - `PUT` transaccional con `version + 1` y `Auditoria` (`EDITAR_MODULO`);
  - duplicar, activar y desactivar, y borrar con 409 si hay pedidos;
  - todo con `authenticate` y `authorize(ADMIN)`.
- **Terminado cuando:** hay tests de servicio y un carpintero recibe 403 en todas las rutas nuevas.

#### F3.2 Imágenes · [x]
- **Frontend hecho (2026-10-03):**
  - `lib/imageCompression.ts` lleva la imagen a 1200 px como máximo y la comprime a WebP, o a JPEG si el navegador no codifica WebP. Baja la calidad, y si hace falta el tamaño, hasta quedar debajo de 1 MB; si no lo logra, avisa. Tiene tests.
  - `api/moduleImages.ts` sube y quita imágenes.
  - `hooks/useModuleImage.ts` baja la imagen con la sesión, la muestra con `createObjectURL` y la cachea por módulo y versión.
- **Probado en el navegador (F3.3):** el hook muestra las 11 imágenes del catálogo. La compresión real con canvas se prueba en F3.4, al subir una imagen.
- **Depende de:** F3.1.
- **Ya hecho (2026-10-03):**
  - el almacenamiento en disco, la migración y el importador (DECISIONES 12);
  - los endpoints `PUT`, `GET` (con `ETag`, `Cache-Control` y 304) y `DELETE /api/modulos/:id/imagen`, probados en `e2e-f31.mjs`.
- **Falta, en el frontend:**
  - achicar a 1200 px en un `<canvas>` y comprimir a WebP o JPEG; si pasa de 1 MB, bajar la calidad, y si no alcanza, avisar;
  - el hook `useModuleImage` con `axios` en modo blob, `createObjectURL` y caché.

#### F3.3 Pantalla del catálogo · [x]
- **Hecho (2026-10-03):**
  - tipos del catálogo en `types/index.ts` y cliente `api/catalog.ts` (con `catalogErrorMessage`);
  - `components/ModuleCard.tsx` (tarjeta e imagen, reutilizable en el asistente de F4);
  - `pages/ModuleCatalogPage.tsx`: métricas, filtro por categoría, búsqueda, mostrar inactivos, Editar, Duplicar, Activar/Desactivar y el ABM de categorías;
  - ruta `/configuracion-modulos` (solo ADMIN) y menú "Catálogo de módulos" en Configuración.
- **Probado en Edge headless** contra la copia del backup: 32 tarjetas y 11 imágenes, búsqueda, categorías, sin desborde en celular, duplicar y activar/desactivar desde la pantalla (la copia de prueba se borró después).
- **Depende de:** F3.1.
- **Era:**
  - tipos en `frontend/src/types`;
  - rutas `/configuracion-modulos`;
  - menú "Catálogo de módulos";
  - tarjetas, filtros, métricas, duplicar y activar/desactivar (spec §6.1).

#### F3.4 Editor de módulo · [x]
- **Hecho (2026-10-03):**
  - `pages/ModuleEditorPage.tsx` en `/configuracion-modulos/nuevo` y `/configuracion-modulos/:id`, con las pestañas en `components/moduleEditor/` (General con imagen, Medidas, Despiece y cantos, Perfiles);
  - `FormulaInput` (autocompletado, `aria-invalid` y `aria-describedby`) y `PieceEdgesToggles` (`aria-pressed` y `title` por lado);
  - lógica sin React en `lib/moduleEditor.ts`, con 8 tests: borrador, cantos por perfil, referencias, renombrar en todas las fórmulas, autocompletado, opciones y encaje;
  - `evaluateModuleDefinition` compartida (DECISIONES 13), aviso de cambios sin guardar (DECISIONES 14) y el diálogo de configuración del catálogo (DECISIONES 16).
- **Probado en Edge headless:** `scratchpad/browser/drive-editor.mjs`, con 35 chequeos en verde. Un módulo real se probó sin guardarlo, y uno de prueba se creó, se editó y se borró.
- **Depende de:** F3.3.
- **Era:**
  - pestañas General, Medidas, Despiece y cantos (con `FormulaInput`, autocompletado y resultado en vivo, siempre con la configuración de redondeo real) y Perfiles (spec §6.2);
  - aviso si se sale con cambios sin guardar;
  - advertencia de encaje contra las placas candidatas, con la **misma función de encaje del optimizador** (DECISIONES R2 y R6).

### Fase 4: API y asistente de solicitudes de módulos (spec §8, §9 y §13.2)

#### F4.1 Preparar lo existente sin cambiar el flujo de corte · [x]
- **Hecho (2026-10-03):**
  - `backend/src/modules/orders/order-details.service.ts`: `normalizeDetails(detalles, cliente, numeroContacto, tx?)`. Pasa tal cual `pedidoModuloId`, `piezaCodigo`, `origen`, `orden` e `indice` si vienen; en corte no vienen, y la fila queda igual que antes. Rechaza con 400 `DETAIL_NOT_INTEGER` una medida o cantidad que no sea un entero positivo (R8).
  - `GET /api/orders` filtra `tipo` (por defecto `CORTE`; con `?tipo=MODULOS` se ven los de módulos).
  - `PUT /api/orders/:id` sobre un pedido MODULOS responde 400 `ORDER_IS_MODULES`.
- **Comprobado con `herramientas/e2e-f41.mjs`:** en los 65 pedidos del backup dan idéntico antes y después el listado, el detalle, el listado de materiales, la vista previa y el dashboard. El alta y la edición también dan igual, probadas con 3 pedidos.
- **Depende de:** F2.2 y F0.3.
- **Era:**
  - extraer `normalizeDetails` a `order-details.service.ts`, con transacción opcional y pasando sin tocar `pedidoModuloId`, `piezaCodigo`, `origen`, `orden` e `indice`, y validando enteros (DECISIONES R8);
  - `GET /api/orders` filtra `tipo = CORTE` por defecto;
  - `PUT /api/orders/:id` sobre un pedido MODULOS responde 400 (spec §15).
- **Terminado cuando:** las solicitudes de corte dan exactamente lo mismo que antes. Para comprobarlo: test que compara el snapshot antes y después en los pedidos del backup.

#### F4.2 Del módulo a las piezas · [x]
- **Hecho (2026-10-03):**
  - `buildModulePieces` en el código compartido (`moduleFormula.ts`, DECISIONES R6 y 18): las piezas de un módulo pedido, con medidas enteras, orden 1..n, cantos del perfil y cambios a mano.
  - `backend/src/modules/module-orders/`:
    - `module-order-plan.ts`: `planModuleOrder`, el armado sin base de datos (material por rol, cantos por color y espesor, encaje, errores; DECISIONES 19 a 21), con tests en `module-order-plan.test.ts` (`cd backend && npm test`, DECISIONES 22);
    - `module-orders.service.ts`: `buildModuleOrder` (lee de la base, arma y pasa por `normalizeDetails`) y `buildModuleOrderEstimate` (el presupuesto de corte sin cambios, más los herrajes aparte, R1);
    - `module-orders.schemas.ts` y `module-orders.routes.ts`: `POST /api/pedidos-modulos/preview`, solo ADMIN (contrato en DECISIONES 17).
  - Las filas salen sin `numero` (código `M----PP-OO`) ni `pedidoModuloId`: los completa el alta de F4.3.
- **Comprobado:** `herramientas/e2e-f42.mjs`, 92/92 contra la copia del backup:
  - paridad `===` en placas y en cada componente entre la vista previa de módulos y la de corte (tal cual, agregada, invertida y partida) en los 30 módulos que se pueden pedir, con los dos perfiles, en una solicitud de 7 módulos y en un módulo de prueba con material fijo y fondo propio;
  - cada fila en el material de su rol y cada canto del color de su módulo;
  - los errores de spec §8.2, §8.3 y §8.6, los 400 de datos mal formados y el 403 de un carpintero.
- **Era:**
  1. `buildModuleDetails` (spec §8.2): material por rol, cantos por perfil y color (con **todos** los faltantes juntos), `codigoBarra`, `remark` y `orden`.
  2. La validación de encaje de §8.3, con la función del optimizador exportada. No va una validación propia, porque la de la spec tiene los ejes invertidos (DECISIONES R2).
  3. El presupuesto, con un envoltorio fino sobre la función de F0.3:
     - `presupuestoEstimado` es **idéntico** al de corte;
     - `costoHerrajes` y el total con herrajes van en campos aparte (DECISIONES R1).
- **Terminado cuando:** pasa el **test de paridad corte contra módulos**. Las mismas piezas por `POST /api/orders/preview` y por `POST /api/pedidos-modulos/preview`, y la carga a mano equivalente (agregada y en otro orden), dan `===` en placas y en cada componente.

#### F4.3 Endpoints de solicitudes · [x]
- **Hecho (2026-10-05):**
  - `POST /api/pedidos-modulos`, `GET /api/pedidos-modulos` y `GET /api/pedidos-modulos/:id` (solo ADMIN), en `module-orders.service.ts` (DECISIONES 25 a 27).
  - El alta calcula afuera de la transacción y adentro solo escribe; si el módulo cambió desde la vista previa, responde 409 `MODULE_CHANGED`.
  - `fechaEntrega` va y vuelve como `AAAA-MM-DD`, y "hoy" es el de Argentina (`backend/src/utils/dates.ts`, DECISIONES 26).
  - Los m² por material, como `mm2` entero, en `computeOrderEstimate` y en `estimacionDetalle` (DECISIONES 28).
  - **Fuera del paso, de la revisión con agentes:**
    - las transacciones tienen hasta 30 s (DECISIONES 29);
    - `DELETE /api/orders/:id` tiene bloqueo optimista, que arregla una carrera que podía perder o duplicar placas (DECISIONES 30).
- **Comprobado:** `herramientas/e2e-f43.mjs`, 56/56 contra la copia:
  - el alta guarda exactamente lo que mostró la vista previa (placas, cada componente, detalle, filas y módulos con su copia de la definición);
  - los m² cuadran con las piezas;
  - el stock se reserva y se devuelve exacto, y la carrera entre borrar y cambiar de estado se prueba por concurrencia y en forma determinista;
  - cada búsqueda y filtro excluye lo que no corresponde, y el orden tiene las entregadas al final;
  - los errores responden lo que tienen que responder.
  También siguen en verde e2e-f42 (92), e2e-f05 (22) y e2e-f04 (12).
- **Depende de:** F4.2. La vista previa ya existe (`POST /api/pedidos-modulos/preview`).
- **Leer:** spec §13.2 y §8.5; DECISIONES 17, 18 y R5.
- **Era:**
  - el schema de alta: `moduleOrderPreviewSchema` más cliente (mínimo 2), numeroContacto (mínimo 6), emailContacto, direccionEntrega, fechaEntrega (YYYY-MM-DD, desde hoy en `America/Argentina/Buenos_Aires`) y observaciones;
  - `POST /api/pedidos-modulos` en una transacción: `buildModuleOrder(tx)` y `buildModuleOrderEstimate(tx)`, crear el `Pedido` MODULOS, leer su `numero`, reescribir los códigos con `moduleBarcode(numero, posicion, orden)`, crear los `PedidoModulo` (con `definicionSnapshot` y los `valores` efectivos) y los `DetallePedido` con su `pedidoModuloId`, e historial `CREAR_PEDIDO_MODULOS`. Sin push ni WhatsApp;
  - decidir qué pasa si el módulo cambió de versión entre la vista previa y el alta (la vista previa devuelve `version`);
  - `GET /api/pedidos-modulos` (listado con `_count.modulos`, `numero` y `fechaEntrega`) y `GET /api/pedidos-modulos/:id` (módulos con snapshot y colores, detalles con `DETALLES_ORDENADOS`, herrajes e historial);
  - los m² por material en la función compartida (`orderEstimate.ts`, con test de paridad) y en la respuesta de la vista previa, para el panel del paso 4 (spec §9.2, R3).
- **Terminado cuando:**
  - el alta guarda exactamente lo que mostró la vista previa: placas, cada componente y las filas;
  - `PATCH /api/orders/:id/status` reserva y devuelve el stock de un pedido MODULOS como el de uno de corte;
  - `GET /api/orders` sigue sin mostrar los de módulos;
  - e2e contra la copia, que deja la base como estaba.

#### F4.4 Asistente de 4 pasos · [x]
- **Depende de:** F4.3.
- **Hacer:**
  - `/modulos/nueva` con `Stepper`;
  - borrador con `useFormDraft` y la clave `${draftScope(user?.id)}modules:new`;
  - el paso 3 valida en vivo con el motor;
  - el paso 4 muestra **solo** lo que devuelve `/preview`, sin cálculos locales, y `CutOptimizer` con los detalles del backend (spec §9.2; DECISIONES R3).
- **Tener en cuenta (de F4.2):**
  - cada módulo se manda con los campos de spec §13.2 y nada más: la API rechaza campos desconocidos (DECISIONES 17). Un borrador viejo con una medida que el catálogo ya no tiene recibe 400: al recuperarlo hay que descartar esas claves (DECISIONES 18);
  - el perfil de cantos viene marcado con el predeterminado del módulo y siempre se manda;
  - la vista previa tarda de 1,5 a 8,4 s con 20 módulos (P12): no llamarla en cada clic de canto sin control (por ejemplo, un botón "Recalcular" o una espera corta), y mostrar que está calculando;
  - marcar en el selector los colores que no tienen los cantos que pide el perfil (P10).
- **Tener en cuenta (de F4.3):**
  - el alta manda la `version` de cada módulo que devolvió la vista previa. Si responde 409 `MODULE_CHANGED`, hay que avisar y volver a pedir la vista previa (DECISIONES 25);
  - `fechaEntrega` es `AAAA-MM-DD` y no se convierte a `Date` en el navegador (DECISIONES 26);
  - los m² del panel salen de `estimacionDetalle.porMaterial[].mm2` dividido por 1.000.000. No se calculan en el navegador (R3).
  - en el paso 3, cada módulo con piezas de fondo tiene un selector opcional "Material de fondo". Por defecto viene "el del catálogo" (del módulo o de la configuración), y se puede elegir cualquier placa activa (DECISIONES 32). Sin elegir, no se manda `materialFondoId`.
- **Hecho (2026-10-05):**
  - `/modulos/nueva` (solo ADMIN) con los 4 pasos: `ModuleOrderWizardPage` y `components/moduleOrderWizard/` (ClientStep, ModulePickerStep, UnitsStep y ReviewStep). La lógica sin React está en `lib/moduleOrderWizard.ts`, con 21 tests (`npm run test:module-order-wizard`). La API está en `api/moduleOrders.ts`.
  - Menú "Modulos a medida", debajo de "Solicitar cortes", y `/modulos` en la sección admin de `ProtectedRoute` (DECISIONES 39).
  - Vista previa de a una, con espera corta, y cantos tomados del perfil (DECISIONES 33). El catálogo y los materiales se revisan de nuevo antes de calcular (DECISIONES 34). El alta se protege contra duplicados y respuestas perdidas con una clave de alta (DECISIONES 35 y 40): es el único cambio de backend del paso, con la migración `20261005180000_clave_alta_pedido`. Hay borrador (DECISIONES 36), y validación igual a la del alta (DECISIONES 37).
  - Plano y resumen (DECISIONES 38). `CutOptimizer` suma la prop `hideCosts` y un estado "Calculando...". `EdgeToggleButtons` marca cada lado y avisa los espesores que faltan. El detalle común no ofrece "Editar" en solicitudes MODULOS.
  - Cuatro revisiones, cada una sobre los arreglos de la anterior: 38, 13, 8 y 4 hallazgos confirmados. Se arreglaron todos menos el título de la barra superior, que pasa a F4.5 (ver la bitácora).
  - Prueba en el navegador: `herramientas/e2e-f44-navegador.mjs` (Edge y Vite), 96 de 96. e2e-f43 suma la clave de alta: 66 de 66.

#### F4.5 Listado de solicitudes de módulos · [x]
- **Depende de:** F4.3.
- **Hacer:** `/modulos` con indicadores, semáforo (en la zona horaria `America/Argentina/Buenos_Aires`), filtros, orden y exportación (spec §9.1).
- **Tener en cuenta (de F4.4):**
  - el ítem "Modulos a medida" del menú hoy abre `/modulos/nueva`: pasarlo a `/modulos` (`AppLayout`, `mainNavItems`);
  - el título de la barra superior sigue fijo en "Panel de solicitudes". Spec §14.2 pide que cambie según la sección (DECISIONES 39; hallazgo C37 de la revisión);
  - el asistente ya usa `GET /api/pedidos-modulos?clave=<uuid>` para saber si un alta sin respuesta entró (clave de alta, DECISIONES 35 y 40). El listado puede usar `listModuleOrders` de `api/moduleOrders.ts`.
- **Hecho (2026-10-06):**
  - `/modulos` (solo ADMIN), en `ModuleOrdersPage`:
    - los indicadores, el semáforo (`DeliveryChip`) y el orden (DECISIONES 41);
    - los filtros en la URL, con borradores para la búsqueda y las fechas;
    - la selección y la exportación (DECISIONES 42).
  - La lógica sin React está en `lib/moduleOrdersList.ts`, con 11 tests (`npm run test:module-orders-list`). "Hoy" sale de `hooks/useTodayInArgentina.ts`.
  - Menú "Modulos a medida" a `/modulos` y título de la barra por sección, solo en las secciones de ADMIN.
  - Detalle provisorio en `/modulos/:id`: el detalle común, con redirección entre `/pedidos/:id` y `/modulos/:id` según el tipo, y "Volver" con los filtros (DECISIONES 43).
  - Accesibilidad de la grilla (DECISIONES 44).
  - **Backend:** el orden por defecto de `GET /api/pedidos-modulos` pone las rechazadas después de las en curso (`compareForList`, con 3 tests; DECISIONES 27 y 41). No hay migraciones.
  - Cinco revisiones, cada una sobre los arreglos de la anterior: 34, 21, 20, 17 y 7 hallazgos confirmados, todos arreglados. Entre ellos: las fechas que no se podían escribir, un error de búsqueda que quedaba pegado, la selección que exportaba filas ocultas, una pausa que deshacía el menú o atrás, los indicadores que quedaban cargando y una fecha elegida que no se aplicaba después de cerrar el calendario con Escape (ver la bitácora). Cada arreglo se comprobó metiendo el defecto a propósito: la prueba en el navegador lo detecta.
  - Pruebas en el navegador:
    - `herramientas/e2e-f45-navegador.mjs` (Edge, con barras de desplazamiento reales): 137 de 137;
    - e2e-f44 ajustada al detalle en `/modulos/:id`: 98 de 98;
    - e2e-f43: 66 de 66.

#### F4.6 Tildes, colores de estado y sin Remark · [x]
- **Depende de:** F4.5.
- **Hacer:**
  - tildes en todos los textos de la interfaz, también en las pantallas de los carpinteros y en los mensajes del backend que se muestran (DECISIONES 15). Lo que va a la máquina (el Excel) no cambia. Hay que ajustar los textos que buscan las pruebas en el navegador y los tests;
  - un color distinto para cada estado en `StatusChip` (DECISIONES 46);
  - las filas de las solicitudes de módulos sin Remark (DECISIONES 20): `moduleRemark` deja de usarse y sus tests cambian.
- **Terminado cuando:** no queda ningún texto visible sin tilde (búsqueda en el código), los colores de estado son distintos y con contraste, y las pruebas dan verde.
- **Hecho (2026-10-07):** tildes en los textos de 64 archivos del frontend y del backend, con voseo en todos lados (DECISIONES 15); un color por estado (DECISIONES 46); filas de módulos sin Remark (DECISIONES 20). Una revisión buscó en todos los textos del código palabras sin tilde o con tilde de más y cambios que no fueran textos: no quedó nada. Pruebas: tests unitarios, `tsc` y build en verde; e2e-f45 137/137, e2e-f44 98/98, e2e-f43 66/66, e2e-f42 93/93, e2e-f31 30/30, e2e-f05 22/22, e2e-f04 12/12 y e2e-f23 4/4, con sus textos ajustados.

#### F4.7 Cantos por pieza · [x]
- **Depende de:** F4.6.
- **Hacer:** lo de DECISIONES 45. Color de canto por separado para esqueleto y frentes, propuesto por defecto del mismo color que la placa si existe; si no, sin elegir y con la lista de cantos cargados. Cambian el armado (`buildModulePieces` y `planModuleOrder`), la vista previa, el alta (con su migración si se guarda por rol), el paso 3 del asistente y sus pruebas. Paridad: las mismas piezas tienen que dar las mismas placas y el mismo presupuesto (regla 1).
- **Antes de empezar:** proponer el diseño (qué se guarda y cómo se elige) y esperar el OK.
- **Hecho (2026-10-07):** Gonzalo pidió que cada pieza se configure libremente, como en corte, con el canto del mismo tipo que la pieza por defecto, y que un lado sin canto de su color quede sin canto (DECISIONES 45).
  - Backend: canto por defecto de la placa de cada pieza, cambios a mano por lado con cualquier canto activo o ninguno, `cantosSinElegir` en la vista previa y sin `MISSING_EDGE_MATERIAL`. Migración `20261007120000_cantos_por_pieza` (saca `pedidos_modulo.colorCantoId`), probada en la copia sin diferencias con el esquema.
  - `buildModulePieces` (código compartido) da solo los espesores del perfil; tests ajustados.
  - Asistente: sin el selector de color de cantos en el paso 3; en el paso 4, un selector por lado con todos los cantos activos, el de por defecto marcado, azul lo elegido a mano y ámbar lo que quedó sin canto. La tabla del despiece junta material y medidas en la celda de la pieza para que los cuatro lados entren en una notebook.
  - Pruebas: tests unitarios (backend 25, asistente 21) y de punta a punta: e2e-f42 106/106, e2e-f43 80/80, e2e-f44 110/110, e2e-f45 137/137, e2e-f31 30/30, e2e-f05 22/22, e2e-f04 12/12 y e2e-f23 4/4.

### Fase 5: Detalle, edición y salidas (spec §9.3, §10 y §11) · [x]

#### F5.1 Detalle de la solicitud · [x]
- **Depende de:** F4.3.
- **Hacer:**
  - encabezado con acciones;
  - tarjeta de datos;
  - fecha de entrega editable (`PATCH` con historial `CAMBIAR_FECHA_ENTREGA`);
  - stepper de estados con el manejo del 409 de stock;
  - pestañas e historial.
- **Tener en cuenta (de F4.3):**
  - el detalle sale de `GET /api/pedidos-modulos/:id`, con la fecha como `AAAA-MM-DD`;
  - borrar puede responder 409 `ORDER_CHANGED` (DECISIONES 30), igual que cambiar el estado. Hay que mostrarlo; hoy las pantallas de corte no muestran ningún error al borrar.
- **Tener en cuenta (de F4.4):**
  - después de crear, el asistente muestra una pantalla de éxito, y "Ver la solicitud" abre el detalle común, desde F4.5 en `/modulos/:id` (DECISIONES 35 y 43). Con el detalle propio, navegar a `/modulos/:id` con la notificación "Solicitud M-N creada" (spec §9.2);
  - `OrderDetailPage` oculta "Editar" cuando `order.tipo === "MODULOS"`;
  - para los cantos por pieza conviene reusar `unitPieceEdges`, `changedSides` y `EdgeToggleButtons` (con `editedSides`): los cantos salen del perfil o del cambio a mano, no de la lista de materiales.
- **Tener en cuenta (de F4.5):**
  - la ruta `/modulos/:id` ya existe y muestra el detalle común (`OrderDetailPage`), que redirige entre `/pedidos/:id` y `/modulos/:id` según el tipo (DECISIONES 43). En F5.1 cambia el componente de la ruta. La redirección de `/pedidos/:id` de una solicitud MODULOS tiene que quedar, o pasar a un componente chico;
  - el listado, el éxito del asistente y "Ver M-N" navegan con `state.returnTo`. "Volver" y "Eliminar" del detalle nuevo tienen que respetarlo, para volver al listado con sus filtros. Hay que validarlo como en `OrderDetailPage`: que empiece con `/` y no con `//`;
  - la notificación de AppLayout reemplaza el `state` por `{}`. Si el asistente navega al detalle con "Solicitud M-N creada" (spec §9.2), el `returnTo` se pierde: hay que decidir a dónde vuelve en ese caso (por defecto, `/modulos`);
  - e2e-f45 recorre el detalle (abrir, Volver, atrás, Eliminar con filtros, redirecciones): ajustar esos chequeos al detalle nuevo.
- **Hecho (2026-10-07):** `ModuleOrderDetailPage` en `/modulos/:id` con encabezado y acciones, tarjeta de datos con la fecha de entrega editable (`PATCH /api/pedidos-modulos/:id/fecha-entrega`, con historial), stepper, pestañas Despiece, Plano de cortes e Historial, y errores visibles (DECISIONES 48). El asistente va al detalle al crear (DECISIONES 35). Los diálogos de estado se comparten con el detalle de corte sin cambiarlo. Pruebas: tests unitarios (detalle 3, backend 26) y de punta a punta: e2e-f51 63/63 (nueva), e2e-f45 139/139, e2e-f44 114/114, e2e-f43 96/96, e2e-f42 106/106, e2e-f31 30/30, e2e-f05 22/22, e2e-f04 12/12 y e2e-f23 4/4.

#### F5.2 Edición, igual que la actual · [x]
- **Depende de:** F5.1.
- **Tener en cuenta (de F5.1):** el detalle (`ModuleOrderDetailPage`) todavía no tiene "Editar": sumarlo con `canEditOrder` y volver al detalle al guardar. Los cantos se editan por lado con cualquier canto, como en corte (DECISIONES 45).
- **Hacer:**
  - `OrderItemsTable` con la prop opcional `groups`. Sin la prop, tiene que verse y funcionar idéntico a hoy;
  - `OrderFormPage` reutilizado para módulos;
  - `PUT` que marca `origen` como EDITADO o MANUAL, y que mantiene el fondo guardado de cada módulo (`PedidoModulo.materialFondoId`, DECISIONES 32);
  - el resumen "Cambios detectados";
  - borrador `modules:{id}` (spec §10).
- **Hecho (2026-10-07):** `OrderFormPage kind="MODULOS"` en `/modulos/:id/editar` (Datos con email, dirección y fecha de entrega; Cortes y Cantos agrupados por módulo con `OrderItemsTable groups`; Resumen con "Cambios detectados"; borrador `modules:{id}`), "Editar" en el detalle, y `PUT /api/pedidos-modulos/:id` que conserva la identidad de cada fila, marca EDITADO o MANUAL, no toca los módulos y deja el resumen en el historial (DECISIONES 49). Los cambios se cuentan con `moduleOrderChanges.ts`, código compartido. Sin `groups`, la tabla de corte queda igual. Pruebas: tests unitarios (cambios 5, detalle 5, backend 27) y de punta a punta: e2e-f52 43/43 (nueva, API), e2e-f52-navegador 40/40 (nueva), e2e-f51-navegador 63/63, f45-navegador 139/139, f44-navegador sin fallas (ajustada: espera Editar), f43, f42 (paridad en los 30 módulos), f31 y f05 sin fallas, f04 12/12 y f23 4/4.

#### F5.3 Excel para la máquina · [x]
- **Depende de:** F4.3.
- **Hacer:**
  - ordenar por posición y orden **solo** en los pedidos MODULOS;
  - filtro `?tipo` opcional;
  - nombre de archivo `pedido-M{numero}.xlsx` cuando se exporta un único pedido de módulos (spec §11.1).
- **Terminado cuando:** exportar solicitudes de corte da el mismo Excel que antes.
- **Tener en cuenta (de F5.2):** desde la edición puede haber piezas adicionales (sin módulo): su código de barra es `M{numero}-00-{orden}` y van al final. Las piezas agregadas a un módulo siguen a las suyas con el orden siguiente (DECISIONES 49), así que ordenar por posición y orden las deja en su lugar.
- **Hecho (2026-10-07):** `GET /api/orders/export` ordena las filas de las solicitudes de módulos por posición y orden, con las adicionales al final (`export-order.ts`); las de corte salen como antes. Suma `?tipo=CORTE|MODULOS` opcional (zod, 400 si es otro) y el nombre `pedido-M{numero}.xlsx` para una sola de módulos. `buildOrdersWorkbook` no cambió (DECISIONES 50). Pruebas: tests del backend (30) y de punta a punta: e2e-f53 21/21 (nueva), f51-navegador 63/63 y f45-navegador 139/139 (leen el Excel exportado), f52 43/43.
- **Tener en cuenta (de F4.5):** el nombre del archivo que ve el usuario lo pone el navegador (`saveAs`), no el `Content-Disposition` del servidor: el CORS no expone ese encabezado. El listado de módulos ya baja `pedido-M{numero}.xlsx` con una sola solicitud y `pedidos-carpinteria.xlsx` con varias (DECISIONES 42); el detalle común sigue con `<cliente>-<fecha>.xlsx`.

#### F5.4 Hoja de taller · [x]
- **Depende de:** F5.1.
- **Tener en cuenta (de F5.3):** el Excel ordena las piezas de cada módulo por `orden`; la hoja de taller conviene que use el mismo orden (`machineRows` en `backend/src/modules/orders/export-order.ts`), así la hoja y el Excel coinciden pieza por pieza.
- **Hacer:** `/modulos/:id/taller`, en A4, una página por módulo y otra para las piezas adicionales (spec §11.2).
- **Hecho (2026-10-08):** `ModuleOrderWorkshopPage` en `/modulos/:id/taller`, sin el menú, con Volver e Imprimir. Una hoja A4 por módulo y una de piezas adicionales, con el encabezado, el bloque del módulo, el despiece en el orden del Excel (`moduleWorkshop.ts`), las marcas EDITADA y AGREGADA, los cantos por lado y espesor, y el pie con observaciones y firmas. Botón "Hoja de taller" en el detalle (DECISIONES 51). Pruebas: tests unitarios (hoja 4) y de punta a punta: e2e-f54-navegador 23/23 (nueva, con el PDF: una página por hoja aunque un módulo tenga 26 piezas), f51-navegador 63/63, f52-navegador 40/40 y f45-navegador 139/139 (el detalle con el botón nuevo).

#### F5.5 No regresión y pruebas de integración · [x]
- **Depende de:** F5.1 a F5.4.
- **Hacer:** dashboard con `byTipo`, el checklist completo de spec §15 y las pruebas de integración de spec §17.2.
- **Tener en cuenta (de F5.2 a F5.4):** las e2e de F5 (f51 a f54) ya recorren el detalle, la edición, el Excel y la hoja de taller contra la copia del backup; sirven de evidencia para varios puntos de §15. Falta P14 (el comprobante que se abre solo al llegar al Resumen).
- **Terminado cuando:** todos los puntos de §15 están tildados, con su evidencia en la bitácora.
- **Hecho (2026-10-08):** `/api/stats` suma `byTipo` y `byStatus[].modulos`, y el dashboard dice "de los cuales N son módulos a medida" y cuántas de cada estado son de módulos (DECISIONES 52). Los 10 puntos de spec §15 quedaron tildados, con la evidencia en la bitácora (entrada 28). e2e-f55 (nueva) cubre spec §17.2 y lo de §15 que faltaba probar, incluido el Excel de corte comparado archivo por archivo con el backend de antes de F5.3. Pruebas: tests del backend (32) y de punta a punta: e2e-f55 27/27, f53 21/21, f05 22/22 y f04 12/12.

### Fase 6: Herrajes · [ ] se definen más adelante
- **Gonzalo, 2026-10-08:** seguir con el resto y definir los herrajes más adelante.
- **Contratada** (Gonzalo, 2026-10-07, DECISIONES 10). Las reglas reales de cada herraje las pasa ROMA.
- **Tener en cuenta (de F5.4):** la hoja de taller todavía no tiene la sección de herrajes (casilla, herraje y cantidad, spec §11.2): sumarla en `ModuleOrderWorkshopPage` cuando estén habilitados.
- **Hacer:** lo de spec §12 y §13.4, detrás de `herrajesHabilitados`. Las cantidades se redondean con la misma tolerancia que `roundMm` (DECISIONES R7). Las reglas reales las tiene que pasar ROMA.

### Fase 7: Cierre (spec §10.6 y §17.3)

#### F7.1 Recalcular un módulo · [x]
Regenera las piezas de ese módulo y **recalcula el pedido entero** en la misma transacción: las placas no se suman por módulo (DECISIONES R4). Mantiene los colores y el fondo guardados del módulo (DECISIONES 32). Lo registra en el historial (`RECALCULAR_MODULO`).
- **Hecho (2026-10-08):** "Cambiar medidas o colores" en cada módulo del Despiece (`RecalcModuleDialog`, con la tarjeta del asistente) y `POST /api/pedidos-modulos/:id/modulos/:moduloPedidoId/recalcular` (más `/vista-previa`), que reemplaza solo las filas de ese módulo, guarda sus medidas, colores, fondo y copia de la definición, recalcula el pedido entero y deja `RECALCULAR_MODULO` (DECISIONES 53). Pruebas: tests unitarios (`module-recalc.test.ts`, detalle 6) y de punta a punta: e2e-f71 25/25 y e2e-f71-navegador 17/17 (nuevas), y sin fallas f52 43/43, f43, f42, f51-navegador 63/63, f52-navegador 40/40, f54-navegador 23/23, f45-navegador 139/139 y f44-navegador.

#### F7.2 Pulido · [x]
Autocompletar clientes, estados vacíos y de carga, y accesibilidad (spec §14.5).
- **Pendiente de F4.5 (DECISIONES 44):**
  - el contraste de los chips de semáforo y de estado: es la paleta del prototipo, con algunos pares apenas debajo de 4,5:1. Si se cambia, va en todo el sistema;
  - los textos con tilde de las grillas de MUI ("Filas por página"): se corrigen en `theme.ts` según lo que decida Gonzalo en DECISIONES 15;
  - el foco del teclado no se ve en las otras grillas (el tema lo saca): en el listado de módulos se agregó solo ahí;
  - los botones principales deshabilitados conservan el degradado del tema y parecen activos: en el listado de módulos se sacó solo en "Exportar seleccion".
- **Hecho (2026-10-08):** autocompletar clientes de solicitudes anteriores en el paso 1 del asistente (`GET /api/pedidos-modulos/clientes`); chips de plazo con contraste AA (verde y amarillo más oscuros); en el tema, los botones principales deshabilitados sin el degradado y el foco del teclado visible en todas las grillas. Los textos de las grillas de MUI ya tenían tildes (DECISIONES 15). Los botones de canto y los campos de fórmula ya cumplían spec §14.5 desde F3, y los estados vacíos y de carga del listado desde F4.5 (DECISIONES 54). Pruebas: tests (asistente 22, backend 35) y de punta a punta: e2e-f72-navegador 14/14 (nueva), f44-navegador sin fallas, f45-navegador 139/139, f51-navegador 63/63, f52-navegador 40/40, f54-navegador 23/23 y f71-navegador 17/17.

#### F7.4 Agilizar los tiempos del optimizador · [ ]
- **Por qué:** en F0.9 se aceptó esperar más para ahorrar placas (DECISIONES 0.12). Gonzalo pidió ver al final cómo agilizarlo.
- **Ideas:**
  - calcular el plano una sola vez y reutilizarlo entre la vista previa y el alta;
  - caché por multiconjunto canónico de piezas (R5);
  - mover el cálculo del navegador a un worker;
  - mover el optimizador del backend a `worker_threads`: hoy corre en el hilo de Node y, mientras calcula, frena las demás solicitudes y las transacciones abiertas (DECISIONES 29);
  - perfilar la búsqueda extra.
- **Regla:** ninguna optimización de tiempo puede dar más placas. Se mide con `npm --prefix frontend run bench:optimizer`.

#### F7.3 Aceptación con ROMA · [ ]
La prueba de spec §17.3 completa, incluida la importación real del Excel en la máquina.

---

### Fase 8: Pase a producción · [ ] al final
- **Depende de:** todas las fases anteriores, probadas en local por Gonzalo.
- **Hacer:**
  1. Hacer un backup reciente de producción y restaurarlo en local (§7). Desde esta versión, el backup incluye la base y el volumen de imágenes `uploads_data`.
  2. Correr `npm --prefix backend run pedidos:recalcular` y revisar las diferencias contra lo guardado (DECISIONES 0.5: constancias del estimador viejo).
  3. Correr `npm --prefix backend run pedidos:completar-detalle`, que guarda el detalle recalculado de los pedidos anteriores. Sin esto, el dashboard tarda más de 60 s (DECISIONES 0.12).
  4. Aplicar todas las migraciones sobre esa copia y probar la app completa.
     Importar el catálogo con `npm --prefix backend run prisma:seed:modulos:prod` (con `UPLOADS_DIR` apuntando al volumen de imágenes). También pone el material de fondo por defecto, "Fibroplus blanco" de 3 mm, si la configuración no tiene uno (DECISIONES 31); el resumen lo informa, y si esa placa no existe avisa para cargarlo a mano. Cargar los cantos que falten (P10).
  5. Recién ahí, en la VPS: backup, actualizar el código y reconstruir frontend y backend juntos. La API aplica sola las migraciones al arrancar.
     Después de desplegar, correr `pedidos:completar-detalle` y el importador del catálogo (`prisma:seed:modulos:prod`) contra la base de producción.
  6. Si algo falla: volver al backup y a la versión anterior.
- **Terminado cuando:** producción corre la versión nueva y los pedidos existentes muestran lo mismo que en la prueba local.

## 6. Decisiones pendientes (de Gonzalo o de ROMA)

| # | Tema | Quién | Por defecto mientras tanto |
|---|---|---|---|
| P1 | ¿Se contrató Herrajes? | Gonzalo | **Resuelto (2026-10-07):** sí. La Fase 6 se hace (DECISIONES 10) |
| P2 | Las 7 constancias desactualizadas (F0.7) | Gonzalo | Resuelto: se respetan los importes |
| P3 | Placas reales usadas por la máquina en 4 pedidos (F0.8) | Taller | Descartado (2026-10-03) |
| P4 | Pase a producción (F8), cuando todo esté probado | Gonzalo | **Resuelto (2026-10-07):** al terminar el plan y después de que Gonzalo lo pruebe en local, él hace el `git pull` en la VPS y corre las migraciones (DECISIONES 47) |
| P5 | Cantos, material por pieza, fondos, zócalo y gola, color de canto de los frentes, veta, redondeo y plazos | ROMA | Lo de spec §19 |
| P6 | `PLACARD_EN_ESPEJO_2_PUERTAS` (fondo de 2000×2000 y puertas de 962×1934 sin rotar) y `PLACARD_2_PUERTAS_UN_LADO_PERCHERO` (fondo de 2498×1998) no entran en placas de 1830 de ancho. Preguntas: ¿esas puertas se pueden girar según la veta? ¿Cómo arman esos fondos (partidos, como la variante del escobero)? | ROMA | Se importan, con advertencia. Desde F4.2, con sus medidas por defecto la vista previa responde 400 `MODULE_PIECES_DO_NOT_FIT` |
| P9 | Material de fondo por defecto (spec §19: ¿3 mm, 5,5 mm o 18 mm?). 31 de los 32 módulos activos tienen piezas de fondo | Gonzalo | **Resuelto (2026-10-05):** la placa de 3 mm "Fibroplus blanco", que se puede cambiar en Catálogo de módulos > Configuración, y cada módulo puede tener la suya. La pone el importador si la configuración no tiene una (DECISIONES 31) |
| P10 | De los 60 colores de 18 mm activos, 14 no tienen canto de 0,45 y de 2 mm (los que usa el perfil Estándar) y 11 no tienen ninguno | Gonzalo | **Resuelto (2026-10-07):** canto por defecto del color de la placa si existe; si no, sin elegir y con la lista de cantos cargados (DECISIONES 45, F4.7) |
| P11 | ¿La máquina lee bien el Remark "Modulo N · Nombre" (largo máximo y caracteres)? Hoy ninguna fila de producción lo usa | Taller | **Resuelto (2026-10-07):** por ahora no se usa el Remark (DECISIONES 20, F4.6) |
| P12 | La vista previa de 20 módulos tarda de 1,5 a 8,4 s, según las piezas (100 módulos: unos 28 s). Spec §20 pide caché si pasa de 2 s | Gonzalo | **Resuelto (2026-10-07):** se acepta como está; los tiempos se optimizan en F7.4 (DECISIONES 24) |
| P7 | La placa "metal cepillado bronce" figura como 1830×26000, con un cero de más | Gonzalo | **Resuelto (2026-10-07):** se deja como está; se le avisa al cliente (DECISIONES 47) |
| P8 | ¿Se conserva el contenedor `carpinteria-analisis-db` con el backup en la PC de la primera sesión? | Gonzalo | **Resuelto (2026-10-07):** se borró, con su volumen (DECISIONES 47) |
| P14 | En el formulario de corte (alta y edición), al tocar Siguiente en Cantos ya se abre el comprobante: el mismo botón pasa a ser el de enviar en ese clic, y el Resumen se ve recién al cerrarlo. Pasa también al editar módulos, que usa el mismo formulario | Gonzalo | Se deja como está, igual que hoy en corte. Corregirlo es una línea (una `key` en cada botón) |
| P13 | Base para las pruebas de punta a punta, ahora que no está el contenedor con el backup | Gonzalo | **Resuelto (2026-10-07):** el backup se restaura en `carpinteria-analisis-db` y se conserva hasta terminar la fase de desarrollo (DECISIONES 47) |

---

## 7. Datos de producción

- **Imágenes de los módulos:** están en el volumen `uploads_data` (en local, en `backend/uploads/`). El backup de producción tiene que incluir ese volumen además de la base (DECISIONES 12).
- **Los backups no se versionan nunca:** tienen nombres y teléfonos de clientes, y están en `.gitignore`. Se piden a Gonzalo y se guardan fuera del repo.
- **Se restauran solo en un contenedor local descartable**, nunca sobre la base del docker-compose ni sobre producción. En PowerShell:

  ```powershell
  docker run -d --name carpinteria-analisis-db -e POSTGRES_DB=carpinteria -e POSTGRES_USER=carpinteria -e POSTGRES_PASSWORD=analisis_local -p 127.0.0.1:55432:5432 postgres:16-alpine
  # esperar unos segundos a que acepte conexiones
  docker cp "$HOME\Downloads\<backup>.backup" carpinteria-analisis-db:/tmp/prod.backup
  docker exec carpinteria-analisis-db pg_restore --no-owner --no-privileges -U carpinteria -d carpinteria /tmp/prod.backup
  ```

  - En Git Bash hay que anteponer `MSYS_NO_PATHCONV=1` a los comandos `docker cp` y `docker exec`.
  - La URL para Prisma es `postgresql://carpinteria:analisis_local@127.0.0.1:55432/carpinteria`.
  - Para borrarlo: `docker rm -f carpinteria-analisis-db`.
- **Para recalcular todos los pedidos y compararlos con lo guardado** (antes de desplegar un cambio de cálculo): con `DATABASE_URL` apuntando al contenedor, correr `npm --prefix backend run pedidos:recalcular`. Solo lee la base. Antes hay que correr `npx prisma generate` en `backend`.
- **Para probar una migración:**
  1. Restaurar en un contenedor recién creado.
  2. `cd backend` y luego `DATABASE_URL=<url> npx prisma migrate deploy`. En PowerShell: `$env:DATABASE_URL="<url>"; npx prisma migrate deploy`.
  3. Verificar los conteos y los datos migrados.
- **En informes y en la bitácora se usan ids cortos y cantidades**, nunca nombres ni teléfonos.
