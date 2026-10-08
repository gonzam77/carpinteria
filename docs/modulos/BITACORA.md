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

## 2026-10-08 (28) · equipo Pinformatico15 · rama main

**Pasos:** F5.5 terminado. La Fase 5 está completa.

**Hecho:**
- Push de los 2 commits de F5.4, con el OK de Gonzalo.
- Dashboard: `/api/stats` con `byTipo` y `byStatus[].modulos` (`stats-summary.ts` y su test), y en pantalla "de los cuales N son módulos a medida" y "N de módulos a medida" por estado (DECISIONES 52).
- e2e-f55 nueva: el checklist de spec §15 y la integración de spec §17.2. Para el Excel de corte se levantó el backend de antes de F5.3 en un worktree temporal (puerto 4101) y se comparó archivo por archivo; después se borró la junction y el worktree.

**Checklist de spec §15, con su evidencia:**
1. `GET /api/orders` solo corte por defecto y Solicitudes sin módulos: e2e-f55 (admin y carpintero) y e2e-f45 (listados).
2. `POST` crea CORTE y `PUT /api/orders/:id` sobre módulos da 400 `ORDER_IS_MODULES`: e2e-f55 y e2e-f52.
3. `GET /api/orders/:id` sobre módulos responde y `/pedidos/:id` lleva a `/modulos/:id`: e2e-f55 y e2e-f51.
4. Dashboard con los dos tipos y `byTipo`: e2e-f55, `stats-summary.test.ts` y una captura revisada.
5. Sin push ni WhatsApp al crear módulos: e2e-f55 (el código del alta no los importa ni los llama).
6. Carpintero: 403 en las 24 rutas nuevas (e2e-f55) y redirección en el frontend (e2e-f51 y e2e-f54).
7. `OrderItemsTable` sin `groups` igual: e2e-f52-navegador (formulario de corte sin grupos, con Agregar pieza abajo) y el código (sin grupos, `rows.map` como antes).
8. Excel de corte igual byte a byte salvo la fecha: e2e-f55 contra el backend de antes de F5.3 (16 archivos del .xlsx iguales; solo cambia `docProps/core.xml`) y e2e-f53.
9. Materiales, `canDeletePermanently` y avisos: e2e-f23 4/4.
10. `cutOptimizer.test.ts` (39) y `check:optimizer` en verde, ahora con cuatro archivos compartidos.

**Decisiones nuevas:** DECISIONES 52.

**Verificaciones:**
- frontend `npm test` (10 suites en verde), backend `npm test` (32), `tsc`, `check:optimizer` y build en verde.
- e2e contra la copia: f55 27/27, f53 21/21, f05 22/22 y f04 12/12. La copia quedó como estaba.

**Commits:** dos commits locales (código y pruebas, y documentación). El push espera el OK de Gonzalo.

**Próximo paso:** Fase 6, herrajes. Lo primero: leer spec §12 y §13.4 y "Tener en cuenta" de PLAN Fase 6. Las reglas reales las pasa ROMA.

**Esperando a Gonzalo o a ROMA:** P5, P6 y P14; las reglas de los herrajes.

---

## 2026-10-08 (27) · equipo Pinformatico15 · rama main

**Pasos:** F5.4 terminado.

**Hecho:**
- Push de los 2 commits de F5.3, con el OK de Gonzalo.
- Hoja de taller (DECISIONES 51): `ModuleOrderWorkshopPage` en `/modulos/:id/taller`, para imprimir en A4, con una hoja por módulo y otra de piezas adicionales. Lógica sin React en `moduleWorkshop.ts`: hojas, orden igual al Excel, marcas, cantos por lado y medidas con su nombre. Botón "Hoja de taller" en el detalle.
- Pruebas: `moduleWorkshop.test.ts` y e2e-f54-navegador nueva. Esta revisa el PDF impreso: una página por hoja aunque un módulo tenga 26 piezas. Ojo: `page.pdf` usa los estilos de pantalla si antes se llamó `emulateMedia({ media: "screen" })`.

**Decisiones nuevas:** DECISIONES 51.

**Verificaciones:**
- frontend `npm test` (39, 17, 6, 5, 8, 21, 11, 5, 5 y 4), backend `npm test` (30), `tsc`, `check:optimizer` y build en verde.
- e2e contra la copia: f54 23/23, f51-navegador 63/63, f52-navegador 40/40 y f45-navegador 139/139 (el detalle con el botón nuevo). La copia quedó como estaba.

**Commits:** dos commits locales (código y pruebas, y documentación). El push espera el OK de Gonzalo.

**Próximo paso:** F5.5, no regresión y pruebas de integración: leer spec §15 y §17.2 y "Tener en cuenta" de PLAN F5.5.

**Esperando a Gonzalo o a ROMA:** P5, P6 y P14.

---

## 2026-10-07 (26) · equipo Pinformatico15 · rama main

**Pasos:** F5.3 terminado.

**Hecho:**
- Push de los 3 commits de F5.2, con el OK de Gonzalo. GitHub respondió `remote rejected ... (Internal Server Error)` durante unos 15 minutos (7 intentos, githubstatus.com sin incidentes); el intento siguiente entró. Si vuelve a pasar, esperar y reintentar.
- Excel para la máquina (DECISIONES 50): las filas de módulos salen por módulo y orden, con las adicionales al final; corte, como antes. `?tipo` opcional y `pedido-M{numero}.xlsx` para una sola de módulos. `buildOrdersWorkbook` sin cambios.
- Pruebas: test del backend `export-order.test.ts` y e2e-f53 nueva.
- P14 (el comprobante que se abre solo al llegar al Resumen) sigue sin respuesta: queda como está.

**Decisiones nuevas:** DECISIONES 50.

**Verificaciones:**
- backend `npm test` (30), `tsc`, `check:optimizer` y build en verde.
- e2e contra la copia: f53 21/21, f51-navegador 63/63 y f45-navegador 139/139 (leen el Excel exportado), f52 43/43. La copia quedó como estaba.

**Commits:** dos commits locales (código y pruebas, y documentación). El push espera el OK de Gonzalo.

**Próximo paso:** F5.4, la hoja de taller: leer spec §11.2 y "Tener en cuenta" de PLAN F5.4.

**Esperando a Gonzalo o a ROMA:** P5, P6 y P14.

---

## 2026-10-07 (25) · equipo Pinformatico15 · rama main

**Pasos:** F5.2 terminado.

**Hecho:**
- Push de los 3 commits de F5.1, con el OK de Gonzalo.
- Edición de una solicitud de módulos con el mismo formulario que corte (DECISIONES 49): `OrderFormPage kind="MODULOS"` en `/modulos/:id/editar`, con email, dirección y fecha de entrega en Datos, Cortes y Cantos agrupados por módulo (`OrderItemsTable` con la prop opcional `groups`), "Cambios detectados" en el Resumen y borrador `modules:{id}`. "Editar" en el detalle, solo en los estados editables.
- Backend: `PUT /api/pedidos-modulos/:id`. Conserva la identidad de cada fila, marca EDITADO o MANUAL, numera las nuevas (adicionales `M{n}-00-OO`), no toca los módulos, recalcula con el mismo código que corte, controla la versión (409) y deja el resumen en el historial. Test del esquema.
- Código compartido nuevo: `moduleOrderChanges.ts` (cuenta los cambios para el Resumen y para el historial), sincronizado con `sync:optimizer`.
- `AppLayout` ahora saca solo la notificación del `state`: así el detalle conserva a dónde volver después de guardar.
- El título del detalle va en una línea y las acciones bajan abajo del título por debajo de 1200 px.
- Pruebas: e2e-f52 (API) y e2e-f52-navegador nuevas; f51 y f44 ajustadas (ahora esperan "Editar").
- Encontrado, sin tocar: en el formulario de corte, al tocar Siguiente en Cantos ya se abre el comprobante (P14).

**Decisiones nuevas:** DECISIONES 49.

**Verificaciones:**
- frontend `npm test` (39, 17, 6, 5, 8, 21, 11, 5 y 5), backend `npm test` (27), `tsc`, `check:optimizer` y build en verde.
- e2e contra la copia: f52 43/43, f52-navegador 40/40, f51 63/63, f45-navegador 139/139, f44-navegador sin fallas (ajustada: espera Editar), f43, f42 (paridad en los 30 módulos), f31 y f05 sin fallas, f04 12/12 y f23 4/4. La copia quedó como estaba.

**Commits:** tres commits locales (código, pruebas y documentación). El push espera el OK de Gonzalo.

**Próximo paso:** F5.3, el Excel para la máquina. Lo primero: leer "Tener en cuenta" de PLAN F5.3.

**Esperando a Gonzalo o a ROMA:** P5, P6 y P14.

---

## 2026-10-07 (24) · equipo Pinformatico15 · rama main

**Pasos:** F5.1 terminado.

**Hecho:**
- Push de los 6 commits de F4.6 y F4.7, con el OK de Gonzalo.
- Detalle propio de la solicitud de módulos en `/modulos/:id` (`ModuleOrderDetailPage`, DECISIONES 48): encabezado con estado, semáforo y acciones (Estado, Materiales, Exportar Excel, Eliminar), tarjeta de datos, fecha de entrega editable, stepper, pestañas Despiece (con el resumen guardado), Plano de cortes e Historial legible.
- Backend: `PATCH /api/pedidos-modulos/:id/fecha-entrega`, con historial `CAMBIAR_FECHA_ENTREGA`, 409 si está entregada o si cambió mientras tanto. Test del esquema.
- Diálogos de cambio de estado y link de WhatsApp compartidos con el detalle de corte (mismo JSX). El detalle de corte ya solo atiende solicitudes de corte y redirige las de módulos.
- El asistente, al crear, va al detalle con "Solicitud M-N creada" (DECISIONES 35).
- Pruebas: e2e-f51-navegador nueva (detalle), y f43, f44 y f45 ajustadas (tres agentes en paralelo, uno por archivo).

**Decisiones nuevas:** DECISIONES 48; cambian la 35 y la 43.

**Verificaciones:**
- frontend `npm test` (39, 17, 6, 5, 8, 21, 11 y 3), backend `npm test` (26), `tsc`, `check:optimizer` y build en verde.
- e2e contra la copia: f51 63/63, f45 139/139, f44 114/114, f43 96/96, f42 106/106, f31 30/30, f05 22/22, f04 12/12 y f23 4/4. La copia quedó como estaba.

**Commits:** tres commits locales (código, pruebas y documentación). El push espera el OK de Gonzalo.

**Próximo paso:** F5.2, la edición con el mismo formulario que corte. Lo primero: leer spec §10 y "Tener en cuenta" de PLAN F5.2.

**Esperando a Gonzalo o a ROMA:** P5 y P6.

---

## 2026-10-07 (23) · equipo Pinformatico15 · rama main

**Pasos:** F4.7 terminado. La Fase 4 está completa.

**Hecho:**
- Gonzalo decidió que cada pieza se configure libremente, como en la solicitud de corte: por defecto el canto del color de la placa de la pieza, y un lado sin canto de su color queda sin canto, con la opción de elegir uno o dejarlo así (DECISIONES 45). También decidió que las solicitudes de módulos sigan en su propio listado; se editan en F5.2 con el mismo formulario que las de corte.
- Backend: el armado elige el canto por defecto por pieza y lado, acepta cambios a mano por lado con cualquier canto activo o ninguno, avisa los lados sin canto (`cantosSinElegir`) y ya no responde `MISSING_EDGE_MATERIAL`. Migración `20261007120000_cantos_por_pieza`: saca `pedidos_modulo.colorCantoId`.
- Código compartido: `buildModulePieces` da solo los espesores del perfil (sincronizado con `sync:optimizer`).
- Asistente: sin color de cantos en el paso 3; en el paso 4, un selector por lado con todos los cantos activos. La tabla del despiece se reacomodó para que entre en una notebook.
- Las pruebas de punta a punta f42, f43 y f44 se reescribieron para la regla nueva (tres agentes en paralelo, uno por archivo); f45 sacó el color de canto de sus datos de prueba.

**Decisiones nuevas:** DECISIONES 45 (aplicada); cambia la 33.

**Verificaciones:**
- frontend `npm test` (39, 17, 6, 5, 8, 21 y 11), backend `npm test` (25), `tsc`, `check:optimizer` y build en verde.
- e2e contra la copia: f42 106/106, f43 80/80, f44 110/110, f45 137/137, f31 30/30, f05 22/22, f04 12/12 y f23 4/4. La copia quedó como estaba, con la migración nueva aplicada.

**Commits:** tres commits locales (código, pruebas y documentación). El push espera el OK de Gonzalo.

**Próximo paso:** F5.1, el detalle de la solicitud de módulos. Lo primero: leer "Tener en cuenta (de F4.5)" en PLAN F5.1.

**Esperando a Gonzalo o a ROMA:** P5 y P6.

---

## 2026-10-07 (22) · equipo Pinformatico15 · rama main

**Pasos:** F4.6 terminado.

**Hecho:**
- Gonzalo decidió P13: el backup se restauró en un contenedor nuevo `carpinteria-analisis-db` y queda hasta terminar la fase de desarrollo. Se le aplicaron las migraciones, el catálogo de módulos (`prisma:seed:modulos`) y el detalle guardado de los pedidos viejos (`pedidos:completar-detalle`), y se vaciaron las suscripciones push.
- **Tildes en toda la interfaz** (DECISIONES 15): textos de 64 archivos del frontend y del backend, con voseo en todos lados. Lo hicieron seis agentes en paralelo, con archivos separados. Otro agente ajustó los textos que buscan las pruebas de punta a punta, y un revisor recorrió todos los textos del código: no quedaron palabras sin tilde ni cambios que no fueran textos. El Excel no cambió.
- **Un color por estado** en `StatusChip` (DECISIONES 46), con contraste de 5:1 o más.
- **Filas de módulos sin Remark** (DECISIONES 20).

**Decisiones nuevas:** P13 (DECISIONES 47). Se aplicaron la 15, la 20 y la 46.

**Verificaciones:**
- frontend `npm test` (39, 17, 6, 5, 8, 21 y 11), backend `npm test` (25), `tsc`, `check:optimizer` y build en verde.
- e2e contra la copia: f45 137/137, f44 98/98, f43 66/66, f42 93/93, f31 30/30, f05 22/22, f04 12/12 y f23 4/4. La copia quedó como estaba.

**Commits:** tres commits locales (colores, tildes y sin Remark, documentación). El push espera el OK de Gonzalo.

**Próximo paso:** F4.7, el color de los cantos por tipo de placa (DECISIONES 45). Lo primero: proponer el diseño a Gonzalo.

**Esperando a Gonzalo o a ROMA:** el OK del diseño de F4.7; P5 y P6.

---

## 2026-10-07 (21) · equipo Pinformatico15 · rama main

**Pasos:** respuestas de Gonzalo a las decisiones pendientes. Se agregan F4.6 y F4.7.

**Hecho:**
- Push de los 68 commits locales (hasta F4.5), con el OK de Gonzalo.
- Se borró el contenedor `carpinteria-analisis-db` con su volumen, como pidió Gonzalo. El archivo del backup sigue en la carpeta Descargas de este equipo.
- Decisiones registradas:
  - Herrajes contratados: la Fase 6 se hace (DECISIONES 10).
  - La interfaz lleva tildes (DECISIONES 15).
  - Las filas de módulos van sin Remark por ahora (DECISIONES 20).
  - La vista previa se acepta como está (DECISIONES 24).
  - Color de los cantos por tipo de placa, por defecto el de la placa si existe (DECISIONES 45).
  - Un color por estado (DECISIONES 46).
  - Pase a producción, la placa con el cero de más y el contenedor (DECISIONES 47).
- PLAN §6 al día. Pasos nuevos: F4.6 (tildes, colores de estado, sin Remark) y F4.7 (cantos por tipo de placa).

**Decisiones nuevas:** DECISIONES 45 a 47; cambian la 10, 15, 20 y 24.

**Verificaciones:** solo documentación; no cambió código.

**Commits:** un commit local de documentación. El push espera el OK de Gonzalo.

**Próximo paso:** F4.6. Antes, que Gonzalo decida P13: con qué base corren las pruebas de punta a punta.

**Esperando a Gonzalo o a ROMA:** P13, P5 y P6.

---

## 2026-10-06 (20) · equipo Pinformatico15 · rama main

**Pasos:** F4.5 terminado.

**Hecho:**
- El listado `/modulos` (`ModuleOrdersPage`), solo para ADMIN:
  - indicadores, semáforo de plazo (`DeliveryChip`) y orden (DECISIONES 41);
  - filtros en la URL (estado, búsqueda y rango de entrega), con borradores para la búsqueda y las fechas (DECISIONES 42);
  - selección y exportación a Excel: `pedido-M{numero}.xlsx` con una sola y `pedidos-carpinteria.xlsx` con varias;
  - accesibilidad de la grilla (DECISIONES 44).
- La lógica sin React está en `lib/moduleOrdersList.ts`, con 11 tests, que también corren en otras zonas horarias y en los cambios de horario. "Hoy" es el de Argentina (`useTodayInArgentina`) y cambia solo a la medianoche.
- El menú "Modulos a medida" abre `/modulos`, y el título de la barra cambia según la sección, solo en las de ADMIN (DECISIONES 43).
- Detalle provisorio en `/modulos/:id`: el detalle común, con redirección entre `/pedidos/:id` y `/modulos/:id` según el tipo. "Volver" y "Eliminar" vuelven al listado con los filtros. El éxito del asistente y "Ver M-N" ya van ahí.
- **Backend:** el orden por defecto pone las rechazadas después de las en curso (`compareForList`, con 3 tests; DECISIONES 27 y 41). Sin migraciones.
- **Cinco revisiones, cada una sobre los arreglos de la anterior:** 34, 21, 20, 17 y 7 hallazgos confirmados, todos arreglados. Los más importantes:
  - Las fechas no se podían escribir con el teclado. Después aparecieron, de a una por revisión: cada dígito filtraba por un día intermedio, borrar un segmento sacaba el filtro, recorrer el calendario con las flechas filtraba por los días recorridos, una pausa que terminaba tarde deshacía el menú o atrás, y una fecha elegida no se aplicaba si enseguida se recorría el calendario y se volvía con Escape. Quedó una regla simple: la pausa aplica lo que estaba elegido cuando empezó (DECISIONES 42).
  - Un error de búsqueda quedaba pegado y tapaba el estado vacío.
  - La selección exportaba filas que no se veían (con un error o un rango invertido), y el pie de la grilla las contaba.
  - Las rechazadas aparecían arriba de las atrasadas.
  - Pasada la medianoche, el semáforo seguía con el día anterior.
  - Saltar con el historial del navegador entre el detalle de una solicitud de módulos y uno de corte entraba en un ciclo de redirecciones.
  - Los indicadores podían quedar cargando para siempre.
  - La grilla, que se desmonta con el catálogo vacío, volvía a montarse con una referencia vieja: ahora `ModuleOrdersGrid` tiene la suya.
  - En una notebook, Plazo y Estado no se veían sin desplazar la tabla; el foco del teclado no se veía y la grilla no tenía nombre.
- Prueba en el navegador `herramientas/e2e-f45-navegador.mjs` (137 chequeos), que queda para repetir. Cada arreglo de las revisiones 2 a 5 se comprobó metiendo el defecto a propósito (pruebas de mutación): la prueba lo detecta.
- e2e-f44 ajustada al detalle en `/modulos/:id`.

**Decisiones nuevas:** DECISIONES 41 a 44. Cambian la 27 (orden) y la 39 (menú).

**Verificaciones:**
- frontend `npm test`: 39, 17, 6, 5, 8, 21 y 11 (listado) en verde.
- backend `npm test`: 25 en verde.
- `tsc` de frontend y backend, `check:optimizer` y build en verde.
- e2e contra la copia: e2e-f45-navegador 137/137, e2e-f44-navegador 98/98 y e2e-f43 66/66.
- La copia quedó con 65 pedidos, 0 solicitudes de módulos, 1404 filas, 145 entradas de historial y el stock de antes. Un corte del backend de prueba a mitad de una corrida dejó 7 solicitudes "Prueba F4.5"; se borraron por la API.

**Commits:** cinco commits locales (orden del backend, lógica del listado, pantalla, pruebas y documentación). El push espera el OK de Gonzalo.

**Próximo paso:** F5.1, el detalle de la solicitud de módulos. Lo primero: leer "Tener en cuenta (de F4.5)" en PLAN F5.1 (la ruta `/modulos/:id` ya existe, `returnTo` y los chequeos del detalle en e2e-f45).

**Esperando a Gonzalo o a ROMA:** P10, P11, P12, P6, P1, P5, P7, P8 y DECISIONES 15 (tildes).

---

## 2026-10-05 (19) · equipo Pinformatico15 · rama main

**Pasos:** F4.4 terminado.

**Hecho:**
- El asistente "Nueva solicitud de modulos" en `/modulos/nueva`, solo para ADMIN:
  - **Paso 1:** cliente y entrega.
  - **Paso 2:** grilla del catálogo, con búsqueda, categorías y teclado.
  - **Paso 3:** una tarjeta por unidad, con colores por defecto, fondo por módulo, perfil, copiar medidas y validación en vivo con el armador compartido.
  - **Paso 4:** despiece y resumen de la vista previa del servidor, cantos por pieza y plano.
  - Borrador y pantalla de éxito.
- Menú "Modulos a medida" y `/modulos` en la sección admin de `ProtectedRoute`.
- Componentes compartidos:
  - `CutOptimizer`: prop `hideCosts` y estado "Calculando...".
  - `EdgeToggleButtons`, sacado de `PieceEdgesToggles`.
  - `ModuleCard`: se puede elegir.
  - `useFormDraft`: `saveNow`.
  - El detalle común ya no ofrece "Editar" en solicitudes MODULOS.
- **Clave de alta (DECISIONES 40), el único cambio de backend del paso:**
  - `Pedido.claveAlta`, con la migración `20261005180000_clave_alta_pedido`: aditiva, generada con `migrate diff` contra la copia, aplicada con `migrate deploy` y sin diferencias después.
  - El alta con una clave que ya entró devuelve esa (200). También si llegan dos a la vez, o si el reintento trae una fecha vencida.
  - `GET /api/pedidos-modulos?clave=`.
- **Cuatro revisiones, cada una sobre los arreglos de la anterior:** 38, 13, 8 y 4 hallazgos confirmados, y ninguno descartado en las tres últimas. Se arreglaron todos menos el título de la barra superior, que pasa a F4.5. Los más importantes:
  - Los cantos del paso 4 se deducían de la lista de materiales cargada al abrir. Un canto cargado después se veía "sin canto" y, al tocar otro lado de la pieza, se borraba del pedido. Ahora salen del perfil o del cambio a mano (DECISIONES 33). Al cambiar de perfil, un cambio a mano arrastraba los lados del perfil viejo.
  - Mientras se creaba se podían tocar cantos, y el cambio se perdía.
  - El catálogo o la configuración podían cambiar con el asistente abierto y dejarlo trabado (DECISIONES 34).
  - Con una respuesta perdida, al salir mientras se creaba, o con un 5xx después de guardar, se podía crear dos veces. Primero se resolvió buscando la solicitud por parecido. La tercera revisión mostró que eso no alcanzaba, y lo reemplazó la clave de alta (DECISIONES 35 y 40).
  - El paso 1 aceptaba emails que el alta rechaza (DECISIONES 37).
  - "1.200" se leía como 1,2 mm.
  - El paso 3 decía "Listo" en módulos que el servidor rechaza: color de canto sin un espesor, o sin fondo activo.
  - Errores fuera de la vista, foco, accesibilidad y textos.
- Prueba en el navegador `docs/modulos/herramientas/e2e-f44-navegador.mjs` (Edge y Vite), que queda para repetir. Necesita `playwright-core` aparte (LEEME).
- e2e-f43 suma la clave de alta.

**Decisiones nuevas:** DECISIONES 33 a 40.

**Verificaciones:**
- frontend `npm test`: 39, 17, 6, 5, 8 y 21 (asistente) en verde.
- backend `npm test`: 22 en verde.
- `tsc` de frontend y backend, `check:optimizer` y build en verde.
- e2e contra la copia: e2e-f44-navegador 96/96, e2e-f43 66/66, e2e-f42 93/93, e2e-f05 22/22, e2e-f04 12/12 y e2e-f23 4/4.
- La copia quedó con 65 pedidos, 0 solicitudes de módulos, 1404 filas y 145 entradas de historial, y con las versiones y el estado de los módulos de antes. Tiene aplicada la migración nueva.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F4.5, el listado `/modulos`. Lo primero: llevar el ítem del menú a `/modulos` y hacer que el título de la barra superior cambie según la sección (PLAN F4.5).

**Esperando a Gonzalo o a ROMA:** P10, P11, P12, P6, P1, P5, P7, P8 y DECISIONES 15 (tildes).

---

## 2026-10-05 (18) · equipo Pinformatico15 · rama main

**Pasos:** fondo elegido en la solicitud, pedido por Gonzalo (sigue F4.4).

**Hecho:**
- Gonzalo pidió poder elegir el material de fondo en cada módulo de una solicitud, por las dudas (DECISIONES 32).
- Migración `20261005120000_fondo_por_modulo_de_solicitud`: `PedidoModulo.materialFondoId`, opcional, con clave foránea. Se generó con `migrate diff` contra la copia y se aplicó con `migrate deploy`; no queda diferencia.
- El armado acepta `materialFondoId` en cada módulo. Le gana al fondo del módulo y al de la configuración, se valida como los colores y se guarda el fondo usado.
- Materiales cuenta el vínculo nuevo.
- 2 tests unitarios nuevos. Una prueba de mutación con 4 errores introducidos a propósito: los detectaron los 4.
- e2e-f42 y e2e-f43 suman el fondo elegido. Además, e2e-f42 elige la placa fina en forma determinista: había dos de 5,5 mm y la consulta no fijaba cuál.

**Verificaciones:**
- backend `npm test`: 21 en verde.
- e2e contra la copia: e2e-f43 59/59, e2e-f42 93/93, e2e-f23 4/4, e2e-f05 22/22 y e2e-f04 12/12.
- La copia quedó con 65 pedidos, 0 solicitudes de módulos, 33 módulos y el fondo por defecto en Fibroplus blanco.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F4.4, el asistente de 4 pasos. En el paso 3 va el selector opcional de fondo por módulo (PLAN F4.4).

**Esperando a Gonzalo o a ROMA:** P10, P11, P12, P6, P1, P5, P7, P8 y DECISIONES 15 (tildes).

---

## 2026-10-05 (17) · equipo Pinformatico15 · rama main

**Pasos:** decisión P9 resuelta, sin cambiar de paso (sigue F4.4).

**Hecho:**
- Gonzalo eligió el material de fondo por defecto: la placa de 3 mm "Fibroplus blanco", que se puede cambiar (DECISIONES 31).
- El importador del catálogo la pone si la configuración no tiene una, respeta la que ya haya y acepta otra con `MODULOS_FONDO`.
- PLAN F8 ahora incluye correr el importador en producción. Antes no estaba listado.

**Verificaciones:**
- `tsc` del backend en verde.
- Importador corrido dos veces sobre la copia: la primera puso el fondo y la segunda lo respetó. Siguen 33 módulos en versión 1 y 11 imágenes.
- Vista previa de los 31 módulos activos con fondo: 29 ok y 2 que no entran (los placares de P6), sin otros errores.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F4.4, el asistente de 4 pasos.

**Esperando a Gonzalo o a ROMA:** P10, P11, P12, P6, P1, P5, P7, P8 y DECISIONES 15 (tildes).

---

## 2026-10-05 (16) · equipo Pinformatico15 · rama main

**Pasos:** F4.3 terminado.

**Hecho:**
- `POST`, `GET` y `GET /:id` de `/api/pedidos-modulos`, con el alta en una transacción que solo escribe. Hay control de versión del módulo (409 `MODULE_CHANGED`), copia de la definición e historial `CREAR_PEDIDO_MODULOS` (DECISIONES 25 a 27).
- `backend/src/utils/dates.ts`: fechas `AAAA-MM-DD` y "hoy" en Argentina (DECISIONES 26).
- `mm2` por material en el cálculo compartido y en `estimacionDetalle` (DECISIONES 28).
- **Revisión con 8 agentes** (spec, integridad, robustez y pruebas, con verificación escéptica): 16 hallazgos, 6 confirmados, todos corregidos:
  - la limpieza del e2e ahora resiste un corte y detecta restos de una corrida anterior;
  - búsquedas, filtros y orden del listado con controles negativos;
  - los módulos guardados y su copia de la definición, comparados campo por campo;
  - test del "hoy" de Argentina con reloj simulado y el proceso en UTC (detecta un "hoy" en UTC y uno con hora local);
  - transacciones de hasta 30 s (DECISIONES 29);
  - `DELETE /api/orders/:id` con bloqueo optimista (DECISIONES 30). Era una carrera de F0.5 que podía perder o duplicar placas; ahora tiene prueba determinista, que detecta el código anterior.

**Decisiones nuevas:** DECISIONES 25 a 30, y dos filas nuevas en "Hallazgos menores".

**Verificaciones:**
- backend `npm test`: 19; frontend `npm test`: 39, 17, 6, 5 y 8. Todo en verde.
- `tsc` de frontend y backend, `check:optimizer` y `npm run build`, en verde.
- e2e contra la copia: e2e-f43 56/56, e2e-f42 92/92, e2e-f05 22/22 y e2e-f04 12/12.
- Al terminar, la copia quedó con 65 pedidos, 33 módulos, 0 solicitudes de módulos y la configuración sin fondo.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F4.4, el asistente de 4 pasos (`/modulos/nueva`). Ver lo que dice PLAN F4.4 en "Tener en cuenta (de F4.2)" y "(de F4.3)".

**Esperando a Gonzalo o a ROMA:**
- P9: el material de fondo por defecto, que bloquea pedir módulos con fondo;
- P10, P11, P12, P6, P1, P5, P7, P8 y DECISIONES 15 (tildes).

---

## 2026-10-03 (15) · equipo Pinformatico15 · rama main

**Pasos:** F4.2 terminado.

**Hecho:**
- `buildModulePieces` en el código compartido (`moduleFormula.ts`, DECISIONES R6 y 18), con 5 tests nuevos. Uno compara sus medidas con las del motor en las 305 piezas del catálogo, con los dos redondeos.
- `backend/src/modules/module-orders/`:
  - `planModuleOrder`, el armado sin base de datos;
  - `buildModuleOrder` y `buildModuleOrderEstimate`;
  - `POST /api/pedidos-modulos/preview`, solo ADMIN. Se adelantó de F4.3 porque el criterio de terminado de F4.2 la necesita.
- Tests unitarios del backend: `cd backend && npm test` (14). `tsconfig.build.json` los deja fuera del build (DECISIONES 22).
- Fuera del paso: el aviso de encaje del editor de F3.4 muestra la placa en el mismo orden que la pieza, largo × ancho (DECISIONES 21).
- **Revisión con 8 agentes** en 4 frentes (spec, paridad, robustez y pruebas), con verificación escéptica de cada hallazgo. Hubo 21 hallazgos; se confirmaron 5, que eran 4 problemas distintos, y se corrigieron todos:
  - el perfil de cantos es obligatorio y los campos desconocidos se rechazan;
  - se sacó el doble cast entre `toDefinition` y el armador;
  - tests unitarios del armado, también con material fijo y fondo propio, que la copia no tiene;
  - chequeos del e2e que no podían fallar.
- **Segunda verificación (2 agentes):** confirmó las correcciones y armó la lista para cerrar el paso. A partir de ella se sumaron tests para 5 mutaciones que sobrevivían y los mensajes de zod en español.

**Decisiones nuevas:**
- DECISIONES 17 a 24;
- R1 y 11 actualizadas;
- la tabla de pendientes pasó a tener la columna Estado.

**Verificaciones:**
- frontend `npm test`: 39, 17, 5, 5 y 8; backend `npm test`: 14; todo en verde.
- `tsc` de frontend y backend, `check:optimizer` y `npm run build`, en verde.
- Mutación del armado: se metieron 16 errores a propósito y los tests detectaron los 16.
- `e2e-f42.mjs` contra la copia: 92/92.
  - Paridad `===` en placas y en cada componente en los 30 módulos que se pueden pedir: 60 casos, cada uno contra 4 cargas de corte. También en una solicitud de 7 módulos y en un módulo con material fijo y fondo propio.
  - La copia quedó como estaba: 33 módulos, la configuración sin fondo y 65 pedidos.
- Tiempos de la vista previa con 20 módulos: 1,5 a 1,8 s con placares, 4,5 s con bajo mesadas y 8,4 s con otra mezcla (medida del verificador). Con 100 módulos, unos 28 s (P12, DECISIONES 24).

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F4.3:
- el alta en una transacción: Pedido, `numero`, códigos con número, PedidoModulo con snapshot y valores, DetallePedido con `pedidoModuloId` e historial;
- el listado y el detalle;
- los m² por material en la función compartida.

**Esperando a Gonzalo o a ROMA:**
- P9: el material de fondo por defecto. Sin él, no se puede pedir ninguno de los 31 módulos (de 32) que tienen piezas de fondo.
- P10: colores sin cantos de 0,45 y de 2 mm.
- P11: el Remark en la máquina.
- P12: el tiempo de la vista previa.
- P6: los dos placares que no entran.
- P1, P5, P7, P8 y DECISIONES 15 (tildes).

---

## 2026-10-03 (14) · equipo Pinformatico15 · rama main

**Pasos:** F4.1 terminado.

**Hecho:**
- `normalizeDetails` pasó de `orders.routes.ts` a `order-details.service.ts`, con transacción opcional, paso directo de los campos de módulos y validación de enteros (R8).
- `GET /api/orders` filtra por `tipo`, `CORTE` por defecto.
- `PUT /api/orders/:id` sobre un pedido de módulos responde 400.
- Herramienta `herramientas/e2e-f41.mjs`, que compara antes y después.

**Verificaciones:**
- `e2e-f41.mjs` con el backend anterior (un worktree de `dc1442d` en el puerto 4101) y el nuevo (4100), sobre la copia del backup: 21 chequeos ok. Los 65 pedidos dan idéntico en detalle, materiales y vista previa; listados y dashboard iguales; alta y edición iguales en 3 pedidos.
- Frontend `npm test` en verde; `tsc` de frontend y backend, `check:optimizer` y build en verde.
- La copia quedó con sus 65 pedidos de corte. El worktree se borró.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F4.2:
- `buildModuleDetails` (spec §8.2) sobre `evaluateModuleDefinition` y `normalizeDetails`;
- el encaje de §8.3 con `findPiecesThatDoNotFit`;
- el envoltorio del presupuesto;
- el test de paridad corte contra módulos.

**Esperando a Gonzalo o a ROMA:**
- P1 y P5–P8;
- DECISIONES 15 (tildes);
- el material de fondo en la configuración del catálogo.

---

## 2026-10-03 (13) · equipo Pinformatico15 · rama main

**Pasos:** F3.4 terminado. Con eso, la Fase 3 está completa.

**Hecho:**
- `evaluateModuleDefinition` en el código compartido, que ahora usa también el backend (DECISIONES 13). Test nuevo en `moduleFormula.test.ts`.
- `lib/moduleEditor.ts` con sus tests (`npm run test:module-editor`, sumado a `npm test`).
- Editor `ModuleEditorPage`:
  - **General:** datos e imagen. Para un módulo nuevo, la imagen se sube después de crearlo.
  - **Medidas:** tabla editable con orden. Las calculadas muestran su valor.
  - **Despiece y cantos:** "Probar con medidas", resultado en vivo L × A × cant, errores por fórmula y por pieza, cantos por perfil, encaje y renombrar con actualización de las fórmulas.
  - **Perfiles:** agregar y quitar B, "Copiar Perfil A a B" y predeterminado.
  - Guardar (también con Ctrl+S), descartar, eliminar, aviso de cambios sin guardar y aviso de que un módulo con errores no se puede guardar activo.
- Diálogo "Configuracion" en el catálogo (DECISIONES 16).

**Decisiones nuevas:** DECISIONES 13 a 16.

**Verificaciones:**
- frontend `npm test`: 39, 13, 5, 5 y 8, todos en verde;
- `tsc` de frontend y backend, `check:optimizer` y build en verde;
- `e2e-f31.mjs` contra la copia del backup: todo ok;
- `drive-editor.mjs` en Edge headless: 35 chequeos OK. Al terminar quedan los 33 módulos y la configuración como estaba.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F4.1:
- extraer `normalizeDetails` a `order-details.service.ts` (R8);
- que `GET /api/orders` filtre `tipo = CORTE`;
- que `PUT` de un pedido MODULOS responda 400;
- un test de snapshot antes y después sobre los pedidos del backup.

**Esperando a Gonzalo o a ROMA:**
- P1 y P5–P8 (ver PLAN §6);
- tildes en la interfaz (DECISIONES 15);
- cargar el material de fondo por defecto en la configuración del catálogo.

---

## 2026-10-03 (12) · equipo Pinformatico15 · rama main

**Pasos:** F3.3 terminado.

**Hecho:**
- tipos del catálogo y `api/catalog.ts`;
- `ModuleCard` (tarjeta con imagen, "Sin imagen", chips de estado y observaciones);
- `ModuleCatalogPage` en `/configuracion-modulos` (solo ADMIN): métricas, filtros, búsqueda, inactivos, duplicar, activar/desactivar y ABM de categorías;
- ítem "Catálogo de módulos" en el menú de Configuración.

**Verificaciones:**
- `tsc` y build del frontend en verde; `check:optimizer` sincronizado;
- pantalla manejada en Edge headless (playwright-core, solo en el scratch) con backend en 4100 y Vite en 5180 sobre la copia del backup: 32 tarjetas, 11 imágenes, búsqueda "placard", diálogo de categorías, sin desborde a 390 px; duplicar crea la copia inactiva, desactivar y activar cambian la base. La copia se borró: quedan 33 módulos;
- el único error de consola es el 404 de `favicon.ico` del Vite de desarrollo.

**Commits:** locales. El push espera el OK de Gonzalo.

**Próximo paso:** F3.4, editor de módulo en `/configuracion-modulos/nuevo` y `/configuracion-modulos/:id` (las tarjetas ya navegan ahí): pestañas General, Medidas, Despiece y cantos, Perfiles; subir imagen con `uploadModuleImage`; aviso de cambios sin guardar; advertencia de encaje con `findPiecesThatDoNotFit`.

**Esperando a Gonzalo o a ROMA:** P1, P5–P8 (ver PLAN §6).

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
