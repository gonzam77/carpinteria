# Decisiones de implementación: Módulos a medida

Decisiones tomadas durante el desarrollo que la especificación no resolvía o en las que el código real difiere. Cada una indica la opción aplicada y si queda pendiente de confirmar. El plan de trabajo está en [PLAN.md](PLAN.md).

## Fase 0: cálculo único y exacto

Requisito del dueño: para las mismas piezas, la cantidad de placas y cada componente del presupuesto tienen que dar exactamente igual se carguen como solicitud de corte o desde módulos, y en todas las pantallas y servicios. Una auditoría (2026-10-01) confirmó que hoy no se cumple del todo.

| # | Tema | Decisión | Estado |
|---|---|---|---|
| 0.1 | El optimizador daba otra cantidad de placas según el orden y la partición de las filas: el último desempate entre acomodos (`layoutSignature`) usaba el id de pieza, que lleva el índice de fila. Ejemplo real: frentes de 5 modelos del catálogo, 2 o 3 placas según el orden. | El desempate usa `groupKey` (medidas, rotación e ids de canto) en lugar del id (`cutOptimizer.ts`, `compareCandidates` y `layoutSignature`). El resultado pasa a depender solo de las piezas físicas. Tests T36 a T38 (fallan con el código anterior). Es determinista, no óptimo: el caso de T36 da siempre 2 placas, aunque algunos órdenes daban 1. | Aplicada, sin commit |
| 0.2 | Impacto de 0.1 en producción | Medido sobre el backup del 2026-10-01 (65 pedidos, 43 abiertos): la corrección no cambia la cantidad de placas de ningún pedido. Con el optimizador anterior, ningún pedido real cambiaba de cantidad en 8 formas de carga probadas, pero 6 cambiaban de acomodo; con el corregido, 0. La variante "mejor de los empates" no ahorraría ninguna placa en esos pedidos: se descarta por ahora. Desplegar frontend y backend juntos. | Medido: se puede desplegar |
| 0.3 | Sumas de plata y metros en coma flotante que dependen del orden y la partición ($1 y 0,01 m de diferencia), y tres implementaciones distintas del mismo cálculo (constancia, listado de materiales, plano). | `computeOrderEstimate` en `frontend/src/lib/orderEstimate.ts`, copiado a `backend/src/shared/`. Acumula mm enteros por material y canto. Calcula la plata una vez por grupo (material y canto) en centavos, con redondeo mitad hacia arriba, y los totales son la suma de esos grupos. La usan el snapshot, el listado de materiales, la reserva de stock, el dashboard y el plano del navegador, que además toma el total de ahí en lugar de sumarlo por su cuenta. El backend compila los imports `.ts` con `rewriteRelativeImportExtensions`. Medido sobre el backup con los mismos precios: 0 cambios de placas o faltantes, como mucho 1,2 centavos por importe, 1 pedido con otro total en pesos y 3 con otros metros en el listado (ahora exactos). | Aplicada (2026-10-02) |
| 0.4 | La reserva y la liberación de stock recalculan en vez de usar lo reservado; algunas transiciones de estado reservan dos veces o nunca; los detalles se leen sin `ORDER BY`; dos cambios de estado simultáneos reservan doble; editar un material pisa el stock. | Guardar las placas por material en el snapshot y lo reservado por material; liberar exactamente eso; corregir las transiciones; orden estable de detalles (columna `indice`); actualización condicional del estado; ajuste de stock por delta. | Pendiente (F0.4 y F0.5) |
| 0.5 | 9 pedidos (7 abiertos) tienen una constancia que no coincide con lo que el sistema recalcula hoy (reserva, listado, plano). No lo causa 0.1: esas constancias se calcularon con el estimador anterior del backend (antes de "Unificar el optimizador", 2026-09-25), que reproduce 53 de los 54 presupuestos previos a esa fecha. En los 7 abiertos, la diferencia neta es de +$583.019 a precios de hoy: 5 pedidos con una placa menos de la necesaria (uno con dos) y 2 con una de más. | Decisión comercial pendiente: recalcular esas constancias o respetar lo cotizado. En cualquier caso, la reserva de stock tiene que usar el mismo número que la constancia. | Pendiente (F0.7) |
| 0.6 | ¿El optimizador actual da más placas que el estimador viejo? | Sobre los 101 pares pedido-material de producción: el viejo (MaxRects) da 307 placas, pero 138 no se pueden cortar con guillotina (125 aun sin contar la sierra); el actual da 317, todas cortables. En los 12 casos en que el viejo daba menos, su acomodo tenía placas no cortables y su número era justo la cota por superficie. Con 10 y 100 veces más búsqueda, el actual baja una placa en 1 solo caso (`e28a8556`, Hickory natural, 14 piezas: de 3 a 2, cortable). El actual está en la cota por superficie en 69 de 101. Conclusión: el actual no es peor; el viejo prometía acomodos imposibles. | Medido. Validación definitiva con la máquina pendiente (F0.8) |
| 0.8 | Precios con más de 2 decimales | El cálculo usa los precios y tarifas redondeados a centavos (`toCentavos`). En producción no hay ninguno con más de 2 decimales, y el ajuste por porcentaje ya redondea a centavos, así que no se cambian los tipos de columna ni se agrega validación. | Aplicada |
| 0.7 | Convención y valores de placas en producción | `anchoPlaca` es el lado corto y `altoPlaca` el largo (1830 × 2600 en 56 placas activas; también 1830 × 2690 y 2070 × 2800). Perfilado 5 mm y sierra 4,3 mm. El ancho de la pieza va contra `anchoPlaca` y el largo contra `altoPlaca`, igual que en `buildPiecesFromRows`. | Confirmado con datos |

## Fase 1: Motor de fórmulas

| # | Tema | Decisión | Estado |
|---|---|---|---|
| 1 | Ubicación de los datos del catálogo | `modulos-muebles.json` e `imagenes/` se copian a `backend/prisma/data/`, donde los lee el seed (Fase 2). El Dockerfile del backend ya copia `prisma/`, así que el seed de producción los encuentra. `docs/modulos/` queda solo como referencia. | Aplicada |
| 2 | Test de paridad | `frontend/src/lib/moduleFormula.test.ts` lee `backend/prisma/data/modulos-muebles.json`: verifica los mismos datos que se importan, sin duplicar el JSON. Se ejecuta con `npm test` del frontend. | Aplicada |
| 3 | Mejoras al motor de referencia | Se validan los parámetros `ENTERO` (entero) y `OPCION` (valor dentro de la lista). Las claves de `valores` se normalizan a mayúsculas. El redondeo tolera errores de punto flotante (`412.4999999` → 413). `evaluarExpresion` usa la caché de AST y restaura el contexto. Se exportan `validateIdentifier`, `IDENTIFIER_PATTERN`, `FORMULA_FUNCTIONS` y `FORMULA_CONSTANTS` para las validaciones del catálogo (§5.6). La paridad 305/305 se mantiene. | Aplicada |
| 4 | Mensajes nuevos del motor | `Tiene que ser un numero entero` y `Elegi una de las opciones`, en el mismo estilo sin tildes que el resto. | Aplicada |

## Reglas de diseño para los módulos

Salen de la auditoría del 2026-10-01: son los puntos donde la implementación de la spec, tal como está escrita, podría calcular distinto que una solicitud de corte.

| # | Regla | Dónde aplica |
|---|---|---|
| R1 | `presupuestoEstimado` de una solicitud de módulos es exactamente el de `buildOrderEstimateSnapshot` (o el de la función de F0.3), igual que en corte. `costoHerrajes` y el total con herrajes van en campos aparte. Esto se aparta de spec §8.4, que suma los herrajes adentro. `OrderReceiptDialog` deja de deducir la mano de obra por resta. | F4.2, F6 |
| R2 | La validación "entra en la placa" (spec §8.3) usa la función de encaje del optimizador, exportada desde `cutOptimizer.ts`; no se escribe otra. El ejemplo de §8.3 tiene los ejes invertidos respecto de la convención real (0.7). | F3.4, F4.2 |
| R3 | El panel del paso 4 del asistente y el resumen de la edición muestran solo lo que devuelve `/preview`. Los m² se calculan en la función compartida con mm enteros, y nunca se estiman placas a partir de la superficie. | F4.4, F5.2 |
| R4 | Recalcular un módulo (spec §10.6) recalcula el pedido entero: las placas no se suman por módulo. | F7.1 |
| R5 | Si hace falta la caché de spec §20, vive dentro de la función compartida. La clave es el multiconjunto canónico de piezas (`groupKey` y cantidad), las medidas útiles, la sierra y la versión del optimizador. Nunca se cachean costos. | F0.3, F4.3 |
| R6 | Un único armador de piezas en `moduleFormula.ts` (por ejemplo `buildModulePieces`), con el modo de redondeo obligatorio, tomado de `ConfiguracionModulos`. Hacia `DetallePedido`, el optimizador y los m² solo salen enteros redondeados. | F3.4, F4.2 |
| R7 | La cantidad de herrajes se redondea hacia arriba con la misma tolerancia que `roundMm`. | F6 |
| R8 | La vista previa, el alta, la edición y el recálculo de módulos pasan por `normalizeDetails`, que además valida que largo, ancho y cantidad sean enteros. | F4.1, F4.2 |

## Hallazgos menores de la auditoría

Son los de severidad baja, que no pasaron por verificación adversarial. Quedan asignados a un paso del plan, donde se confirman o se descartan.

| Hallazgo | Paso |
|---|---|
| Los importes que se muestran por separado no suman el total mostrado | F0.3 |
| El plano muestra el desglose por material y la constancia, totales globales | F0.6 |
| Editar y guardar sin cambios rehace el snapshot con los precios de hoy | F0.4 |
| El formulario no exige enteros: el plano calcula con decimales que el backend rechaza | F0.6, R8 |
| El plano asigna filas a materiales por id o por nombre, sin filtrar el tipo | F0.6 |
| Una pieza rotable cargada como ancho × largo o al revés no se trata igual | F0.10 |
| El resumen marca como faltantes las placas que el mismo pedido ya reservó | F0.5 |
| El dashboard descarta en silencio los pedidos que no puede calcular | F0.5, F5.5 |
| "Pedidos activos" cuenta todos los pedidos y "piezas cargadas" cuenta filas | F5.5 |
| Tests de tiempo que fallan si la PC está ocupada | PLAN §2.1 (nota) |

## Pendientes para las próximas fases

| # | Tema | Opción por defecto |
|---|---|---|
| 5 | `useFormDraft` y `draftScope` llegaron con el commit `6018f7a` (`frontend/src/hooks/useFormDraft.ts`), junto con el borrador de `OrderFormPage`. | Resuelto: el asistente de módulos los reutiliza con la clave `${draftScope(user?.id)}modules:new` y la edición con `modules:{id}`, con la misma lógica de `baseline` que `OrderFormPage` (§9.2, §10.5). |
| 6 | Escobero: el JSON no trae `VARIANTE_FONDO` y las tres piezas de fondo tienen cantidad 1. | El seed agrega el parámetro y las cantidades con `SI` (§19). El JSON queda intacto porque es el fixture de paridad. |
| 7 | Código de barra de piezas sin módulo ("Piezas adicionales") y de piezas agregadas al editar. | `M{numero}-00-{orden}` para las adicionales; el `orden` de una pieza nueva continúa desde el máximo de su grupo. |
| 8 | `fechaEntrega` como `DateTime` puede correrse un día por la zona horaria. | Usar `@db.Date`. |
| 9 | `ConfiguracionModulos.materialFondoId` sin clave foránea (§5.6). | Agregar la relación con `onDelete: SetNull` en lugar de contarla a mano en `countMaterialLinks`. |
| 10 | Herrajes (Fase 6). | Confirmar con Gonzalo si el cliente lo contrató antes de empezar. |
| 11 | Orden de los detalles: la spec usa `DetallePedido.orden` para el orden de la pieza dentro del módulo. | Columna aparte `indice` para la posición en el pedido, en corte y en módulos (F0.4). |
