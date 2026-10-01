# Especificación de desarrollo: Módulos a medida (productos terminados)

**Proyecto:** Sistema de Gestión de Solicitudes de Corte, ROMA Amoblamientos
**Ampliación aprobada por el cliente:** Módulos a medida, con Herrajes como ítem opcional (ver §0.4)
**Repositorio:** `carpinteria-main` (frontend React + MUI + Vite, backend Express + Prisma + PostgreSQL)
**Versión del documento:** 1.0 · 1 de octubre de 2026
**Autor:** Soluciones Tecnológicas (líder técnico del proyecto)

---

## 0. Cómo usar este documento

### 0.1 Para quién es

Lo va a leer un agente de desarrollo (Claude) que trabaja sobre el repositorio. Es la fuente de verdad del alcance. Si algo del código actual contradice este documento, **gana el código actual** en lo que ya existe y **gana este documento** en lo nuevo. Si encontrás una contradicción que no podés resolver, dejá la decisión anotada en `docs/modulos/DECISIONES.md` y seguí con la opción marcada como "por defecto".

### 0.2 Contenido del paquete

| Archivo | Para qué sirve |
|---|---|
| `ESPECIFICACION-MODULOS-A-MEDIDA.md` | Este documento. |
| `modulos-muebles.json` | Los 33 modelos de `muebles.xlsx` ya convertidos: medidas, piezas, fórmulas en la sintaxis del motor, rol de cada pieza, cantos provisorios y **los valores que da el Excel** para cada pieza (fixtures de test). |
| `imagenes/*.jpg` | Fotos de 11 modelos, nombradas por `codigo` del módulo. |
| `referencia/moduleFormula.ts` | Implementación de referencia del motor de fórmulas, sin `eval`. **Ya pasa la paridad con las 305 piezas del Excel.** |
| `referencia/moduleFormula.test.ts` | Tests (`node --test --experimental-strip-types`), con la misma convención que `cutOptimizer.test.ts`. |
| `Prototipo - Modulos a medida.html` (carpeta del proyecto) | Prototipo navegable que el cliente vio y aprobó. Es la referencia visual y de flujo: abrilo en el navegador. |

### 0.3 Reglas de trabajo

1. **No romper lo que existe.** Las solicitudes de corte de los carpinteros tienen que seguir funcionando exactamente igual: listado, carga, edición, exportación, stock, notificaciones y dashboard.
2. Trabajar en una rama (`feature/modulos-a-medida`), con commits chicos por fase (§18).
3. Toda tabla o columna nueva va con **migración Prisma** (`npx prisma migrate dev --name <nombre>`), siguiendo el estilo de `backend/prisma/migrations/`. No editar migraciones viejas.
4. El motor de fórmulas vive en `frontend/src/lib/moduleFormula.ts` y se copia a `backend/src/shared/moduleFormula.ts` con `scripts/sync-optimizer.mjs`, extendido para sincronizar ambos archivos. `--check` tiene que fallar si las copias difieren.
5. Validar con **zod** en el backend, igual que `order.schemas.ts`. Los mensajes de error van en español, claros y accionables.
6. Toda acción relevante deja registro en `HistorialPedido` (solicitudes) o en `Auditoria` (catálogo y configuración), como ya se hace.
7. UI en español rioplatense, con el mismo tono que el sistema ("Cargá", "Elegí"), usando MUI y el `theme.ts` existente. No introducir librerías de UI nuevas.
8. No agregar dependencias si no son imprescindibles. Para imágenes alcanza con `express.raw` (D5).

### 0.4 Alcance comercial

- **Incluido:** catálogo de módulos, editor de despiece con fórmulas, perfiles de canto, carga de los 33 modelos, solicitud de módulos (asistente), edición igual a la actual, estados y fecha de entrega, Excel para la máquina, hoja de taller, presupuesto estimado.
- **Opcional (Herrajes):** se construye detrás de un interruptor (`ConfiguracionModulos.herrajesHabilitados`). **Antes de empezar la Fase 6, confirmá con Gonzalo si el cliente lo contrató.** Si no lo contrató, el modelo de datos puede quedar creado, pero no se muestra nada en la UI.
- **Fuera de alcance:** integración directa con la máquina, renders/3D, stock de herrajes, cálculo automático del plazo de entrega según la carga del taller, portal para el cliente final, acceso de carpinteros a este módulo.

### 0.5 Definición de terminado

- Los 33 modelos están importados y el test de paridad pasa (305/305).
- Un administrador puede, sin tocar el Excel, crear una solicitud de módulos para un cliente, editarla, exportar el Excel de máquina, imprimir las hojas de taller y llevarla de Pendiente a Entregada.
- El Excel exportado de una solicitud de módulos tiene **las mismas columnas y el mismo formato** que el de una solicitud de corte.
- El optimizador de cortes, el presupuesto, el resumen de materiales y la reserva de stock funcionan sobre las solicitudes de módulos sin código duplicado.
- No hay regresiones en el flujo de carpinteros (§15).
- `npm run build` pasa en frontend y backend, los tests pasan y `sync-optimizer --check` está en verde.

---

## 1. Contexto del negocio

### 1.1 Qué hace ROMA

ROMA corta placas de melamina con una seccionadora alimentada por un Excel, y después aplica el canto (pegado) en una canteadora. Recibe solicitudes de corte de carpinteros a través de este sistema. Además **fabrica y vende muebles modulares a medida** (cocinas, placares, baños, dormitorio).

### 1.2 Cómo trabajan hoy los muebles

1. Un cliente pide, por ejemplo, una cocina: 1 bajo mesada de 2 puertas de 1200 mm, 1 cajonera, 2 alacenas, etc.
2. Alguien abre `muebles.xlsx` (una hoja por modelo), carga ancho, alto y profundidad, y el Excel calcula las piezas.
3. Copia pieza por pieza a una **solicitud de corte** del sistema: material, largo, ancho, cantidad y cantos.
4. Exporta el Excel de máquina, corta, cantea y arma.

El paso 3 es lento y es donde se cometen los errores. El módulo nuevo lo elimina.

### 1.3 Glosario de carpintería

Hay que conocer estos términos para entender las fórmulas y los nombres de las piezas.

| Término | Significado |
|---|---|
| **Placa** | Tablero de melamina (aglomerado o MDF revestido), normalmente de 18 mm. Sus dimensiones están en `Material.anchoPlaca` y `altoPlaca` (por ejemplo, 2750 × 1830 mm). |
| **Esqueleto / casco** | La caja del mueble: laterales, piso, techo, estantes, divisiones, travesaños. Va de un color. |
| **Frentes** | Lo que se ve de frente: puertas, frentes de cajón, placas fijas. Pueden ir de otro color. |
| **Fondo** | Panel trasero. En muebles de cocina suele ser fibrofácil/MDF de 3 mm o 5,5 mm, no melamina de 18. En las fórmulas aparece con −2/−4 mm porque va calzado o encastrado. |
| **Canto (tapacanto)** | Tira de PVC que cubre el borde visible de la placa. Espesores habituales: 0,45 mm (interior/económico), 1 mm y 2 mm (frentes, más resistente). En el sistema es un `Material` de tipo `CANTO`, vinculado a una placa (`placaMaterialId`) para heredar el color. |
| **L1, L2, A1, A2** | Los 4 bordes de una pieza: los dos largos y los dos anchos. Así los usan el Excel de máquina y el sistema (`cantoLargo1`… `cantoAncho2`). |
| **Veta / sentido** | Los diseños de madera tienen dirección. Por convención, **`largo` es la medida paralela a la veta**. Una pieza con veta no se puede rotar en la placa (`permiteRotar = false`); el blanco liso y los fondos sí. |
| **Travesaño** | Listón horizontal (por ejemplo, 80 mm) que une los laterales arriba en los bajo mesada, donde apoya la mesada. |
| **Gola** | Perfil o hueco horizontal que hace de tirador integrado (no hay manijas). En el Excel aparece como dos tiras de 60 y 40 mm. En las fotos es negra. |
| **Zócalo** | Frente inferior del bajo mesada, retirado, que tapa las patas. En las fotos es negro. |
| **Placa fija** | Panel de frente que no abre, típico de los esquineros. |
| **Parante** | Pieza vertical de refuerzo o tope (por ejemplo, de 70 mm). |
| **Baulera** | Espacio superior del placard, con su propio techo y divisores. |
| **Interior de cajón** | Laterales, contrafrente y trasera del cajón (por ejemplo, 120 o 200 mm de alto). Tiene su propio **fondo de cajón**. |
| **Holgura / luz** | Separación entre puertas o entre puerta y casco. Las fórmulas la descuentan (`ANCHO / 2 - 4`: 2 mm por lado). |
| **Descuento de espesor** | `- 18` o `- 36` en las fórmulas es descontar 1 o 2 espesores de placa de 18 mm. Por eso las fórmulas dependen de que el esqueleto sea de 18 mm (§8.6). |
| **Espesor de sierra / perfilado** | Ya configurados en `ConfiguracionOptimizador` (4,3 mm de sierra y 10 mm de borde). El optimizador los usa; las fórmulas de módulos no. |
| **Hoja de taller** | Hoja impresa que acompaña al mueble en la fábrica: qué piezas lo componen, para controlar y armar. |

---

## 2. Objetivo funcional

El administrador elige módulos de un catálogo, define medidas y colores, y el sistema genera **una solicitud de módulos**. Es un `Pedido` de tipo `MODULOS`, separado de las solicitudes de corte de los carpinteros, con:

- todas las piezas calculadas por fórmula, con material y cantos resueltos;
- estados (Pendiente → En proceso → Terminada → Entregada, más Rechazada como ya existe) y fecha de entrega comprometida;
- edición igual a la actual (Datos / Cortes / Cantos / Resumen) mientras está Pendiente;
- Excel para la máquina con el formato actual, plano de cortes, presupuesto estimado, resumen de materiales y reserva de stock (reutilizados);
- hoja de taller imprimible, con un módulo por página;
- (opcional) herrajes por módulo.

Lo usa **solo el rol ADMIN**.

---

## 3. Lo que ya existe y hay que conocer

> Leé estos archivos antes de escribir código. Los nombres están tal cual aparecen en el repositorio.

### 3.1 Backend

- `backend/src/app.ts`: monta los routers en `/api/*`. `express.json({ limit: "2mb" })`.
- `backend/src/middlewares/auth.ts`: `authenticate` (JWT) y `authorize(Rol.ADMIN)`.
- `backend/src/utils/http.ts`: `AppError(status, message, { code, details })` y `asyncHandler`.
- `backend/prisma/schema.prisma`: `Pedido`, `DetallePedido`, `Material` (`PLACA`/`CANTO`; un canto tiene `placaMaterialId` y `espesorMm` ∈ {0.45, 1, 2}), `HistorialPedido`, `Auditoria`, `ConfiguracionOptimizador`, `ConfiguracionPresupuesto`.
- `modules/orders/orders.routes.ts`:
  - `normalizeDetails()` valida materiales y cantos activos y arma `cantoXNombre` con `resolveCantoName()` → `"Canto {placa} {espesor}mm"`. Completa `numeroCliente`/`nombreCliente` con los datos del pedido. **Reutilizala**, pero tené en cuenta que hoy no está exportada, usa el `prisma` global (no un `tx`) y **devuelve un objeto con campos fijos**, así que descarta cualquier campo extra. Extraela a `order-details.service.ts`, que acepte un cliente de Prisma o transacción opcional y que **pase sin tocar** `pedidoModuloId`, `piezaCodigo`, `origen` y `orden` cuando vengan. El comportamiento para `CORTE` no cambia.
  - `canEditOrder(estado)`: se puede editar si **no** está EN_PROCESO, TERMINADA ni ENTREGADA. Los no-admin solo pueden editar si está PENDIENTE.
  - `PUT /:id` reemplaza todos los detalles (`deleteMany` + `create`) y recalcula `buildOrderEstimateSnapshot`.
  - `PATCH /:id/status` reserva o libera stock (`order-stock.service.ts`) y registra el historial. **Sirve tal cual para los módulos.**
  - `GET /export?ids=` arma el Excel con `buildOrdersWorkbook`.
  - `GET /:id/materiales` → `buildOrderMaterialsSummary`.
  - Al crear un pedido manda push (`sendNewOrderPushNotification`). **Para los módulos no hay que mandarlo**: lo crea el mismo admin.
- `modules/orders/order-estimate.service.ts`: `buildOrderEstimateSnapshot(tx, detalles)` calcula placas con el **mismo optimizador del frontend** (`shared/cutOptimizer.ts`), costo de placas, mano de obra por placa, material y pegado de cantos por espesor, y `faltanteStock`. Si una pieza no entra en la placa, lanza `AppError(400, "Hay piezas que no entran en la placa X")`.
- `modules/orders/excel.service.ts`. **Ojo:** el README está desactualizado. Las columnas reales son: `codigo barra`, `Material`, `largo`, `ancho`, `cantidad`, **4 columnas vacías**, `canto largo 1`, `canto largo 2`, `canto ancho 1`, `canto ancho 2`, `permite rotar` (`"true"`/`"false"`), `codigo barra centro p`, `Remark`, `numero cliente`, `nombre cliente`, `nombre producto`. **No cambies este formato.**
- `modules/stats/stats.routes.ts`: el dashboard cuenta todos los pedidos y calcula las alertas de stock de los pendientes.

### 3.2 Frontend

- `App.tsx`: rutas; las de administración van envueltas en `<ProtectedRoute roles={["ADMIN"]}>`.
- `layouts/AppLayout.tsx`: el menú lateral (`mainNavItems`, `settingsNavItems`) y la Snackbar de notificación (`navigate(..., { state: { notification } })`).
- `pages/OrderFormPage.tsx`: el asistente **Datos / Cortes / Cantos / Resumen**, con borrador local (`useFormDraft`), vista previa (`/orders/preview`) y comprobante.
- `components/OrderItemsTable.tsx`:
  - modo por defecto: tabla de **Partes** (# · Placa · Largo · Ancho · Cantidad · Nombre · Rotar · duplicar/eliminar · "Agregar pieza");
  - `mode="edges"`: **Cantos por pieza** (Partes · Tipo · Todos · Largo 1/2 · Ancho 1/2), con hasta `maxEdgeTypeRows = 4` tipos de canto por pieza.
  - **La edición de solicitudes de módulos tiene que usar este componente**, extendido para agrupar por módulo (§10).
- `components/CutOptimizer.tsx`: plano de cortes. `components/OrderMaterialsDialog.tsx`: resumen de materiales. `components/OrderReceiptDialog.tsx`: comprobante. `components/StatusChip.tsx`: chips de estado.
- `hooks/useFormDraft.ts`: borradores por usuario (reutilizar en el asistente nuevo).
- `theme/theme.ts`: paleta naranja `#f28c28`, grafito y arena; tipografía Aptos/Segoe UI.
- `lib/cutOptimizer.ts` + `cutOptimizer.test.ts` (`npm test` en el frontend).

---

## 4. Decisiones de arquitectura

### D1. Reutilizar `Pedido` con un discriminador `tipo`

Se agrega `Pedido.tipo: TipoPedido = CORTE | MODULOS` (por defecto `CORTE`). Una solicitud de módulos **es un Pedido**, con sus `DetallePedido` materializados.

**Por qué:** así se reutilizan sin duplicar el Excel, el optimizador, el presupuesto, el resumen de materiales, el stock, los estados, el historial y el borrado. La alternativa (tablas propias) obligaba a duplicar o generalizar todos esos servicios.

**Costo:** hay que filtrar `tipo = CORTE` en los listados existentes (§15).

### D2. Materializar el despiece y guardar una copia de la definición

Al crear la solicitud, cada pieza calculada se guarda como `DetallePedido` (material, medidas en mm enteros, cantos con id y nombre). Además, cada módulo de la solicitud (`PedidoModulo`) guarda en `definicionSnapshot` (JSON) la definición del catálogo con la que se calculó.

**Por qué:**

- Si mañana se corrige una fórmula del catálogo, las solicitudes ya creadas **no cambian solas**: el taller puede estar cortando con esas medidas.
- Las ediciones manuales (§10) quedan sobre datos concretos.
- Se puede "recalcular desde el catálogo" a propósito (§10.6).

### D3. Motor de fórmulas propio, compartido entre frontend y backend

Hay un parser descendente recursivo, **sin `eval` ni `new Function`** (las fórmulas las escriben usuarios). Un único archivo se sincroniza a ambos lados, igual que `cutOptimizer.ts`. La referencia está en `referencia/moduleFormula.ts`.

### D4. Los colores son materiales `PLACA`; los cantos se resuelven por color y espesor

El "color de esqueleto", el "color de frentes" y el "color de cantos" que se eligen en la solicitud son **ids de `Material` tipo `PLACA`**. El canto de cada borde se resuelve como el `Material` `CANTO` activo con `placaMaterialId = colorCanto` y `espesorMm = espesor definido en el perfil`. Así se aprovecha que el sistema ya modela los cantos vinculados a la placa (`"Canto Blanco 0,45mm"`).

### D5. Imágenes guardadas en la base

La tabla `ModuloImagen` guarda `bytea` + `mime`. Se sirve con `GET /api/modulos/:id/imagen` (ETag/caché) y se sube con `PUT` usando `express.raw({ type: "image/*", limit: "3mb" })`. El frontend la reduce a 1200 px como máximo en un `<canvas>` antes de subirla.

**Ojo con la autenticación:** `authenticate` solo lee `Authorization: Bearer`, así que un `<img src="/api/modulos/:id/imagen">` recibe 401. El frontend tiene que pedir la imagen con el cliente axios existente (`responseType: "blob"`), mostrarla con `URL.createObjectURL` (y liberarla con `revokeObjectURL`) y cachearla en memoria por `moduloId + fechaActualizacion`. Hacé un hook `useModuleImage(moduloId)`.

**Por qué:** no hay almacenamiento de archivos en el sistema. Un volumen nuevo complica docker-compose y los backups, y la base ya tiene backup. Hoy hay 11 imágenes y, aunque fueran las 33 a ~150 KB, el peso es despreciable.

### D6. Número correlativo legible

Se agrega `Pedido.numero Int @unique @default(autoincrement())`, con backfill por `fechaCreacion` en la migración. En las solicitudes de módulos se muestra como **`M-{numero}`**, y se usa en el código de barra, el Remark y la hoja de taller. Las solicitudes de corte no muestran el número (no hay que cambiar su UI).

### D7. Separación de permisos

Todo lo nuevo es exclusivo de ADMIN, tanto en las rutas del backend (`authorize(Rol.ADMIN)`) como en el frontend (`ProtectedRoute roles={["ADMIN"]}` y ocultar en el menú). Un carpintero nunca ve ni recibe nada de este módulo.

---

## 5. Modelo de datos (Prisma)

> Los nombres de tabla van en snake_case con `@@map`, como el resto del esquema. Todos los ids son `uuid`.

### 5.1 Enums nuevos

```prisma
enum TipoPedido {
  CORTE
  MODULOS
}

enum TipoParametroModulo {
  MEDIDA     // mm, se pide al cargar (ANCHO, ALTO, PROFUNDIDAD, LUZ_ABAJO...)
  ENTERO     // cantidad entera que se pide al cargar (ej. ESTANTES)
  OPCION     // lista de opciones numeradas (ej. VARIANTE: 1 = puertas arriba/abajo, 2 = ...)
  CALCULADO  // no se pide; se calcula con una formula (ej. LUZ_ARRIBA en Torre horno)
}

enum RolPiezaModulo {
  ESQUELETO  // toma el color de esqueleto de la solicitud
  FRENTE     // toma el color de frentes
  FONDO      // toma el material de fondo (ConfiguracionModulos.materialFondoId o el del modulo)
  FIJO       // usa siempre ModuloPieza.materialFijoId (ej. zocalo/gola negros, si ROMA lo decide)
}

enum LadoCanto {
  LARGO_1
  LARGO_2
  ANCHO_1
  ANCHO_2
}

enum OrigenDetalle {
  CALCULADO  // salio del motor sin cambios
  EDITADO    // salio del motor y se modifico a mano
  MANUAL     // se agrego a mano (en un modulo o como pieza adicional)
}
```

### 5.2 Catálogo

```prisma
model CategoriaModulo {
  id      String   @id @default(uuid())
  nombre  String   @unique   // "Bajo mesada", "Alacenas", "Placares y torres", "Dormitorio y otros"
  orden   Int      @default(0)
  activo  Boolean  @default(true)
  modulos Modulo[]
  @@map("categorias_modulo")
}

model Modulo {
  id                  String   @id @default(uuid())
  codigo              String   @unique          // UPPER_SNAKE, ej. BAJO_MESADA_2_PUERTAS
  nombre              String                    // "Bajo mesada 2 puertas"
  categoriaId         String
  descripcion         String?
  activo              Boolean  @default(true)
  espesorDisenoMm     Float    @default(18)     // espesor con el que estan escritas las formulas (§8.6)
  materialFondoId     String?                   // si es null usa ConfiguracionModulos.materialFondoId
  observaciones       String?                   // notas internas (ej. las de importacion del Excel)
  version             Int      @default(1)      // +1 en cada guardado; se copia al snapshot
  fechaCreacion       DateTime @default(now())
  fechaActualizacion  DateTime @updatedAt
  categoria     CategoriaModulo     @relation(fields: [categoriaId], references: [id])
  materialFondo Material?           @relation("ModuloFondo", fields: [materialFondoId], references: [id], onDelete: SetNull)
  imagen        ModuloImagen?
  parametros    ModuloParametro[]
  piezas        ModuloPieza[]
  perfiles      ModuloPerfilCanto[]
  herrajes      ModuloHerraje[]
  pedidos       PedidoModulo[]
  @@index([categoriaId])
  @@index([activo])
  @@map("modulos")
}

model ModuloImagen {
  moduloId           String   @id
  mime               String   // image/jpeg | image/png | image/webp
  datos              Bytes
  fechaActualizacion DateTime @updatedAt
  modulo Modulo @relation(fields: [moduloId], references: [id], onDelete: Cascade)
  @@map("modulos_imagen")
}

model ModuloParametro {
  id           String              @id @default(uuid())
  moduloId     String
  clave        String              // UPPER_SNAKE: ANCHO, ALTO, PROFUNDIDAD, LUZ_ABAJO...
  etiqueta     String              // "Ancho", "Luz abajo"...
  tipo         TipoParametroModulo @default(MEDIDA)
  valorDefecto Float?
  minimo       Float?
  maximo       Float?
  opciones     Json?               // OPCION: [{ "valor": 1, "etiqueta": "Puerta larga abajo" }, ...]
  formula      String?             // CALCULADO
  ayuda        String?             // texto de ayuda en el formulario
  orden        Int                 @default(0)
  modulo Modulo @relation(fields: [moduloId], references: [id], onDelete: Cascade)
  @@unique([moduloId, clave])
  @@map("modulos_parametro")
}

model ModuloPieza {
  id              String         @id @default(uuid())
  moduloId        String
  codigo          String         // UPPER_SNAKE unico dentro del modulo: PISO, LATERAL, PUERTAS, GOLA2...
  nombre          String         // como sale en el Excel de maquina ("nombre producto") y en la hoja de taller
  rol             RolPiezaModulo @default(ESQUELETO)
  materialFijoId  String?        // obligatorio si rol = FIJO
  formulaLargo    String
  formulaAncho    String
  formulaCantidad String         @default("1")
  permiteRotar    Boolean        @default(false)
  orden           Int            @default(0)
  observaciones   String?
  modulo       Modulo    @relation(fields: [moduloId], references: [id], onDelete: Cascade)
  materialFijo Material? @relation("ModuloPiezaFijo", fields: [materialFijoId], references: [id], onDelete: Restrict)
  cantos       ModuloPiezaCanto[]
  @@unique([moduloId, codigo])
  @@map("modulos_pieza")
}

model ModuloPerfilCanto {
  id            String  @id @default(uuid())
  moduloId      String
  nombre        String  // "Estandar", "Economico"
  descripcion   String?
  orden         Int     // 1 o 2 (maximo dos perfiles por modulo, validado en el servicio)
  predeterminado Boolean @default(false) // exactamente uno por modulo
  modulo Modulo @relation(fields: [moduloId], references: [id], onDelete: Cascade)
  lados  ModuloPiezaCanto[]
  @@unique([moduloId, orden])
  @@map("modulos_perfil_canto")
}

model ModuloPiezaCanto {
  id        String    @id @default(uuid())
  perfilId  String
  piezaId   String
  lado      LadoCanto
  espesorMm Float     // 0.45 | 1 | 2 (mismos valores que ALLOWED_CANTO_THICKNESSES)
  perfil ModuloPerfilCanto @relation(fields: [perfilId], references: [id], onDelete: Cascade)
  pieza  ModuloPieza       @relation(fields: [piezaId], references: [id], onDelete: Cascade)
  @@unique([perfilId, piezaId, lado])
  @@map("modulos_pieza_canto")
}

model ConfiguracionModulos {
  id                    String   @id @default("default")
  materialFondoId       String?  // material PLACA por defecto para piezas FONDO (ej. Fibrofacil blanco 3 mm)
  redondeo              String   @default("REDONDEAR") // REDONDEAR | TRUNCAR (§7.6)
  diasEntregaDefecto    Int      @default(15)
  diasAvisoVencimiento  Int      @default(3)
  herrajesHabilitados   Boolean  @default(false)
  fechaActualizacion    DateTime @updatedAt
  @@map("configuracion_modulos")
}
```

### 5.3 Solicitud de módulos

```prisma
model Pedido {
  // ... campos actuales sin cambios ...
  numero            Int        @unique @default(autoincrement())   // D6
  tipo              TipoPedido @default(CORTE)
  fechaEntrega      DateTime?  // fecha comprometida (solo MODULOS; puede usarse en CORTE a futuro)
  emailContacto     String?
  direccionEntrega  String?
  costoHerrajes     Float      @default(0)   // 0 si herrajes deshabilitado
  modulos           PedidoModulo[]
  herrajes          PedidoHerraje[]
  @@index([tipo])
  @@index([fechaEntrega])
}

model PedidoModulo {
  id                 String   @id @default(uuid())
  pedidoId           String
  moduloId           String?  // SetNull: si se borra el modulo del catalogo, la solicitud conserva el snapshot
  posicion           Int      // 1..n: "Modulo 1", "Modulo 2"...
  nombreModulo       String   // snapshot
  valores            Json     // { "ANCHO": 1200, "ALTO": 780, "PROFUNDIDAD": 580 }
  colorEsqueletoId   String
  colorFrentesId     String
  colorCantoId       String   // Material PLACA cuyo color usan los cantos
  perfilCantoOrden   Int      @default(1)
  observaciones      String?  // sale en la hoja de taller
  definicionSnapshot Json     // copia completa del modulo usado (parametros, piezas, perfiles, herrajes, version)
  pedido   Pedido   @relation(fields: [pedidoId], references: [id], onDelete: Cascade)
  modulo   Modulo?  @relation(fields: [moduloId], references: [id], onDelete: SetNull)
  colorEsqueleto Material @relation("PMEsqueleto", fields: [colorEsqueletoId], references: [id], onDelete: Restrict)
  colorFrentes   Material @relation("PMFrentes",   fields: [colorFrentesId],   references: [id], onDelete: Restrict)
  colorCanto     Material @relation("PMCanto",     fields: [colorCantoId],     references: [id], onDelete: Restrict)
  detalles DetallePedido[]
  herrajes PedidoHerraje[]
  @@unique([pedidoId, posicion])
  @@index([moduloId])
  @@map("pedidos_modulo")
}

model DetallePedido {
  // ... campos actuales sin cambios ...
  pedidoModuloId  String?        // null = pieza de corte normal o "pieza adicional" de una solicitud de modulos
  piezaCodigo     String?        // codigo de ModuloPieza de donde salio (null si MANUAL)
  origen          OrigenDetalle? // null en solicitudes de corte
  orden           Int            @default(0) // para mantener el orden del despiece
  pedidoModulo    PedidoModulo?  @relation(fields: [pedidoModuloId], references: [id], onDelete: Cascade)
  @@index([pedidoModuloId])
}
```

> `Material` necesita las relaciones inversas (`ModuloFondo`, `ModuloPiezaFijo`, `PMEsqueleto`, `PMFrentes`, `PMCanto`). Agregalas con nombres de relación explícitos.

### 5.4 Herrajes (opcional)

```prisma
model Herraje {
  id                 String   @id @default(uuid())
  nombre             String   @unique  // "Bisagra cazoleta 35 mm"
  unidad             String   @default("unidad") // unidad | par | juego | metro
  valor              Float    @default(0)
  activo             Boolean  @default(true)
  fechaCreacion      DateTime @default(now())
  fechaActualizacion DateTime @updatedAt
  modulos  ModuloHerraje[]
  pedidos  PedidoHerraje[]
  @@map("herrajes")
}

model ModuloHerraje {
  id              String  @id @default(uuid())
  moduloId        String
  herrajeId       String
  formulaCantidad String  // ej. "PUERTAS.cant * SI(PUERTAS.largo > 900; 3; 2)"
  orden           Int     @default(0)
  modulo  Modulo  @relation(fields: [moduloId], references: [id], onDelete: Cascade)
  herraje Herraje @relation(fields: [herrajeId], references: [id], onDelete: Restrict)
  @@unique([moduloId, herrajeId])
  @@map("modulos_herraje")
}

model PedidoHerraje {
  id             String  @id @default(uuid())
  pedidoId       String
  pedidoModuloId String?
  herrajeId      String?
  nombre         String  // snapshot
  unidad         String
  cantidad       Float
  valorUnitario  Float   // snapshot del precio al crear/editar
  pedido       Pedido        @relation(fields: [pedidoId], references: [id], onDelete: Cascade)
  pedidoModulo PedidoModulo? @relation(fields: [pedidoModuloId], references: [id], onDelete: Cascade)
  herraje      Herraje?      @relation(fields: [herrajeId], references: [id], onDelete: SetNull)
  @@map("pedidos_herraje")
}
```

### 5.5 Migraciones

1. `modulos_catalogo`: enums, catálogo, `ConfiguracionModulos` **y los modelos de herrajes** (`Herraje`, `ModuloHerraje`), porque `Modulo.herrajes` los referencia. Que el opcional no esté contratado no impide crear las tablas: solo se oculta la UI.
2. `pedido_tipo_y_modulos`, generada con **`prisma migrate dev --create-only`** y editada a mano antes de aplicarla, porque si no Prisma agrega la columna como `SERIAL` y numera los pedidos existentes en orden arbitrario. Incluye `Pedido.numero` (crear la secuencia, `UPDATE` con `row_number() OVER (ORDER BY "fechaCreacion")`, `setval` al máximo, `SET DEFAULT nextval(...)`, `NOT NULL` y `UNIQUE`), `tipo` (default `CORTE` para todo lo existente), `fechaEntrega`, `emailContacto`, `direccionEntrega`, `costoHerrajes`, `PedidoModulo` y las columnas nuevas de `DetallePedido`.
`PedidoHerraje` va en la migración 2, junto con `PedidoModulo`.

Probá la migración sobre una copia de `carpinteria.backup` (está en la raíz del repo) antes de darla por buena.

### 5.6 Reglas de integridad que la base no cubre (validar en servicio)

- Un módulo tiene entre 1 y 2 perfiles de canto, y **exactamente uno** predeterminado.
- `clave` de parámetro y `codigo` de pieza: `^[A-Z][A-Z0-9_]*$`. No pueden coincidir entre sí dentro del mismo módulo, ni con nombres de función (`SI`, `MIN`, `MAX`, `ENTERO`, `REDONDEAR`, `ABS`, `Y`, `O`) ni con constantes (`ESP`).
- `rol = FIJO` exige `materialFijoId`, de tipo PLACA y activo.
- `ModuloPiezaCanto.espesorMm` ∈ {0.45, 1, 2}.
- Para guardar un módulo **activo**, todas sus fórmulas tienen que evaluar sin errores con los valores por defecto. Un módulo inactivo se puede guardar con errores, como borrador.
- No se puede borrar en forma permanente un módulo con `PedidoModulo` asociados: solo desactivarlo (mismo criterio que `canDeletePermanently` de Materiales).
- **Ajuste en Materiales:** hoy `DELETE /api/materiales/:id/permanent` solo mira `countMaterialLinks`, que cuenta filas de `DetallePedido`. Con las claves foráneas nuevas en `Restrict`, el borrado fallaría con un P2003 sin manejar. Extendé `countMaterialLinks` (y `canDeletePermanently` del listado) para contar `Modulo.materialFondoId`, `ModuloPieza.materialFijoId`, `PedidoModulo.colorEsqueletoId/colorFrentesId/colorCantoId` y `ConfiguracionModulos.materialFondoId` (este último no tiene clave foránea: si se borra, quedaría apuntando a un id inexistente). Si hay vínculos, devolvé 409 con un mensaje claro. Desactivar un color usado en el catálogo se permite, pero el material deja de aparecer en el selector y hay que avisar.

---

## 6. Catálogo de módulos: reglas funcionales

### 6.1 Listado (`/configuracion-modulos`)

- Tarjetas con imagen (o un marcador "Sin imagen"), nombre, categoría, cantidad de piezas y de medidas, y chips de estado: **Activo**, **Inactivo**, **Con errores** (alguna fórmula no evalúa) y **N observaciones** (las de importación pendientes).
- Filtros por categoría, búsqueda por nombre y "Mostrar inactivos".
- Encabezado con métricas (módulos, piezas con fórmula, observaciones pendientes).
- Acciones: **Nuevo módulo**, **Duplicar** (copia completa con código `X_COPIA`, inactivo) y **Activar/Desactivar**.

### 6.2 Editor (`/configuracion-modulos/:id`), con pestañas

1. **General:** nombre, código (editable solo si no tiene pedidos), categoría, descripción, estado, espesor de diseño, material de fondo propio (opcional), imagen (subir, reemplazar, quitar) y observaciones. Si el módulo vino del Excel, muestra el recuadro "Revisar al importar" con `observaciones`.
2. **Medidas:** tabla editable (clave, etiqueta, tipo, valor por defecto, mínimo, máximo, opciones o fórmula, ayuda) con orden por arrastre o flechas.
3. **Despiece y cantos:**
   - Panel "Probar con medidas": inputs con los parámetros pedibles, precargados con los valores por defecto.
   - Tabla de piezas: nombre, código, *va en* (rol), material fijo (si el rol es FIJO), fórmula de largo, de ancho y de cantidad, rotar, **resultado en vivo** (`L × A ×cant`), y los 4 lados de canto para el **Perfil A** y el **Perfil B**, con un selector de espesor por lado (sin canto / 0,45 / 1 / 2).
   - Errores por fórmula en rojo, debajo del input, con el mensaje del motor ("Depende de PISO, que tiene un error", "Referencia circular: A → B → A").
   - Autocompletado de variables: al tipear, sugerir claves de parámetros y `CODIGO.largo/ancho/cant` de las otras piezas.
   - Agregar, duplicar, eliminar y reordenar piezas. Al eliminar una pieza referenciada por otras, avisar cuáles se rompen.
4. **Perfiles de canto:** nombre y descripción de cada perfil (máximo 2) y cuál es el predeterminado. Botón "Copiar Perfil A a B".
5. **Herrajes** *(solo si está habilitado)*: herraje, fórmula de cantidad y resultado con las medidas de prueba.

**Guardar:** `PUT` de la definición completa, transaccional (reemplaza parámetros, piezas, cantos y herrajes), incrementa `version` y registra `Auditoria` (`EDITAR_MODULO`). Hay que avisar si se sale con cambios sin guardar.

### 6.3 Categorías

Se crean con el seed (Bajo mesada, Alacenas, Placares y torres, Dormitorio y otros). Un ABM mínimo puede ir como pestaña o diálogo dentro del catálogo.

---

## 7. Motor de fórmulas

> La implementación de referencia está en `referencia/moduleFormula.ts`. Movela a `frontend/src/lib/moduleFormula.ts`, sumá sus tests a `npm test` del frontend y sincronizala al backend. **Si cambiás el motor, el test de paridad con las 305 piezas tiene que seguir pasando.**

### 7.1 Sintaxis

| Elemento | Ejemplo | Nota |
|---|---|---|
| Número | `36`, `9.5` | El decimal va con punto. La coma es separador de argumentos. |
| Medida (parámetro) | `ANCHO`, `LUZ_ABAJO` | No distingue mayúsculas: se normaliza a MAYÚSCULAS. |
| Otra pieza | `PISO.largo`, `LATERAL.ancho`, `PUERTAS.cant` | Accesores `largo`, `ancho` y `cant`. Se usan los valores **exactos, sin redondear** (paridad con el Excel). |
| Constante | `ESP` | Espesor de diseño del módulo (`espesorDisenoMm`). Se pasa como `evaluateModule(def, valores, { constantes: { ESP: modulo.espesorDisenoMm } })`. No la usa la carga inicial; es para fórmulas nuevas (§8.6). |
| Operadores | `+ - * /`, paréntesis, menos unario | Precedencia habitual. |
| Comparación | `= <> < <= > >=` | Devuelve 1 o 0. Se usa dentro de `SI`, `Y` y `O`. |
| Funciones | `SI(c; a; b)`, `MIN(a; b; ...)`, `MAX(...)`, `ENTERO(x)`, `REDONDEAR(x; dec)`, `ABS(x)`, `Y(...)`, `O(...)` | Los argumentos se separan con `;` o `,`. `SI` evalúa solo la rama elegida. |

### 7.2 Evaluación

- La evaluación es perezosa y memoizada, con detección de ciclos (pila de claves en curso).
- Los parámetros `CALCULADO` se evalúan con la misma regla. Pueden referenciar piezas: por ejemplo, `LUZ_ARRIBA = LATERAL.largo - LUZ_MICRO - LUZ_ABAJO - LUZ_HORNO - 54`.
- **Cantidad:** tiene que ser un entero ≥ 0. Si es 0, la pieza **no se genera**; así se implementan piezas condicionales y variantes, por ejemplo `SI(ANCHO > 1000; 3; 2)` laterales, o la "Opción 2" del escobero con un parámetro `OPCION`.
- Largo y ancho tienen que dar > 0 después del redondeo.
- Los errores se devuelven por pieza (`{ ref, mensaje }`) y **no cortan** la evaluación de las demás.

### 7.3 Mensajes de error (exactos, en español)

`La formula esta vacia` · `La formula esta incompleta` · `La formula supera los 500 caracteres` · `La formula tiene demasiados niveles de parentesis o funciones` · `Se esperaba ")"` · `Sobra "x"` · `No se esperaba "x"` · `Falta el valor de X` · `Falta el valor` · `Caracter no valido "x"` · `Funcion desconocida FOO` · `SI recibe 3 valores` · `Despues del punto va largo, ancho o cant` · `No existe la medida X` · `No existe la pieza X` · `Depende de X, que tiene un error` · `Referencia circular: A -> B -> A` · `Division por cero` · `La cantidad debe ser un entero mayor o igual a 0 (dio 2.5)` · `Medida invalida: 0 x 120 mm` · `Minimo 300` / `Maximo 2750` (rangos de parámetros).

En la UI se pueden mostrar con tildes. Si los ajustás, actualizá los tests.

### 7.4 Rendimiento

Hay que parsear una sola vez por fórmula (caché de AST). Un módulo típico tiene menos de 30 piezas; una solicitud de 20 módulos se evalúa en menos de 50 ms. En el frontend, evaluar en cada cambio con `useMemo`, sin debounce.

### 7.5 Seguridad

No usar `eval` ni `Function`. El largo de cada fórmula está limitado a 500 caracteres y la profundidad de anidamiento a 50 (`MAX_FORMULA_LENGTH`, `MAX_FORMULA_DEPTH`, ya implementados en la referencia).

### 7.6 Redondeo

El Excel trabaja con decimales; la máquina y `DetallePedido` usan **mm enteros** (`Int`). Se redondea **solo el resultado final** de largo y ancho de cada pieza, según `ConfiguracionModulos.redondeo`: por defecto `REDONDEAR` (al mm más cercano, la mitad hacia arriba); alternativa `TRUNCAR`. Las referencias entre piezas usan valores exactos. **Pendiente de confirmar con ROMA** (§19): el default queda así hasta que digan otra cosa.

---

## 8. De un módulo configurado a las piezas de corte

### 8.1 Entrada (por cada módulo de la solicitud)

`moduloId`, `valores` (parámetros pedibles), `colorEsqueletoId`, `colorFrentesId`, `colorCantoId` (los tres son Material PLACA activos), `perfilCantoOrden` (1 o 2) y `observaciones`.

### 8.2 Algoritmo `buildModuleDetails(definicion, linea, contextoPedido)`

1. Evaluar con el motor. Si hay errores → `AppError(400, "El modulo N (Nombre) tiene errores", { code: "MODULE_FORMULA_ERRORS", details: { posicion, errores } })`.
2. Por cada pieza generada (respetando `orden`):
   - **Material:** `ESQUELETO` → color de esqueleto; `FRENTE` → color de frentes; `FONDO` → `modulo.materialFondoId ?? configuracion.materialFondoId` (si los dos son null → error "Configurá el material de fondo en Catálogo de módulos"); `FIJO` → `materialFijoId`.
   - **Cantos:** se toman los `ModuloPiezaCanto` del perfil elegido. Por cada lado con espesor `e`, se busca el `Material` CANTO activo con `placaMaterialId = colorCantoId` y `espesorMm = e`. Si no existe → error que dice **qué canto falta**: `Falta el canto de 2 mm para "Gris grafito". Cargalo en Materiales.`, con `code: "MISSING_EDGE_MATERIAL"` y el detalle de todos los faltantes juntos, no de a uno.
   - **Medidas:** largo y ancho redondeados (§7.6), y cantidad.
   - **DetallePedido:**
     - `codigoBarra` = `M{numero}-{posicion:02}-{orden:02}` (ej. `M1044-01-03`). En la vista previa, sin número: `M----01-03`. Como `numero` lo asigna la base, **dentro de la transacción creá primero el `Pedido`**, leé su `numero` y recién ahí creá los `PedidoModulo` y `DetallePedido`.
     - `material` = nombre de la placa.
     - `cantoXId` / `cantoXNombre` / `cantoX` vía `normalizeDetails()`.
     - `permiteRotar` = el de la pieza.
     - `remark` = `Módulo {posicion} · {nombreModulo}`.
     - `nombreProducto` = nombre de la pieza.
     - `numeroCliente` / `nombreCliente` = los del pedido.
     - `pedidoModuloId`, `piezaCodigo`, `origen = CALCULADO`, `orden`.
3. Herrajes (si está habilitado): evaluar `formulaCantidad` de cada `ModuloHerraje` con `resultado.evaluarExpresion(formula)` (el mismo contexto del módulo: medidas y piezas), redondear hacia arriba a entero y crear `PedidoHerraje` con el precio vigente.

### 8.3 Validación contra el tamaño de placa

Antes de llamar al estimador, verificá por pieza que entre en el área útil de la placa: `anchoPlaca − 2·perfiladoBordeMm` × `altoPlaca − 2·perfiladoBordeMm`, considerando la rotación si `permiteRotar`. Si no entra, devolvé un error **por pieza**: `"Lateral" del Módulo 3 (2534 × 580) no entra en la placa Blanco 18 mm (2730 × 1810 útil)`. Así se evita el error genérico del estimador.

### 8.4 Presupuesto y stock

Se llama a `buildOrderEstimateSnapshot(tx, detalles)` sin cambios y se suma `costoHerrajes` a `presupuestoEstimado` cuando corresponda. Conviene hacerlo en un wrapper `buildModuleOrderEstimate` para no tocar el servicio existente. La reserva y liberación de stock al cambiar de estado ya funciona porque los detalles son `DetallePedido`.

### 8.5 Vista previa

`POST /api/pedidos-modulos/preview` devuelve el pedido completo calculado (detalles, agrupación por módulo, estimación, herrajes y errores), **sin persistir**. El paso 4 del asistente lo usa.

### 8.6 Riesgo del espesor de placa

Las fórmulas del Excel tienen el 18 mm "hardcodeado" (`- 36` = 2 × 18). Si alguien elige una melamina de 15 mm para el esqueleto, el mueble sale mal. Regla: **los selectores de color de esqueleto y de frentes solo muestran placas con `espesorMm = modulo.espesorDisenoMm`**. Si no hay ninguna, el selector se muestra vacío con el mensaje "No hay placas de 18 mm activas". La constante `ESP` queda disponible para escribir fórmulas paramétricas en el futuro.

### 8.7 Descuento por espesor de canto

**No se aplica** en v1. Las fórmulas de ROMA ya incluyen sus holguras, y el sistema actual corta la medida tal cual se carga. Queda en §19 para confirmar.

---

## 9. Solicitud de módulos: flujo y reglas

### 9.1 Listado (`/modulos`)

- Indicadores arriba: en curso, módulos a fabricar, vencen esta semana y atrasadas.
- Tabla: N° (`M-1044`), cliente (+ teléfono), referencia del trabajo (`observaciones`), cantidad de módulos, fecha de creación, fecha de entrega, **semáforo de plazo** y estado (`StatusChip`).
- Filtros: estado, búsqueda (cliente, teléfono, referencia y número) y rango de fechas de entrega.
- Orden: por fecha de entrega ascendente, primero las que no están entregadas.
- Selección múltiple y **Exportar** (`GET /api/orders/export?ids=`).

**Semáforo:**

| Estado del plazo | Condición | Color |
|---|---|---|
| Entregada | `estado = ENTREGADA` | gris |
| Atrasada N d | hoy > fechaEntrega | rojo |
| Faltan N d | 0 ≤ días ≤ `diasAvisoVencimiento` | amarillo |
| Faltan N d | más días | verde |

Los días se cuentan como días calendario en la zona `America/Argentina/Buenos_Aires`.

### 9.2 Asistente "Nueva solicitud de módulos" (`/modulos/nueva`), 4 pasos

Usá el `Stepper` de MUI como en `OrderFormPage`. Guardá un borrador con `useFormDraft` (clave `${draftScope(user?.id)}modules:new`, con el mismo prefijo por usuario que `OrderFormPage`) y ofrecé recuperarlo, con el mismo texto que hoy.

1. **Cliente y entrega:**
   - Nombre o razón social (obligatorio, mínimo 2).
   - Teléfono (obligatorio, mínimo 6, igual que `orderSchema.numeroContacto`).
   - Email (opcional, formato válido).
   - Dirección de entrega (opcional).
   - Fecha de entrega comprometida (obligatoria; por defecto hoy + `diasEntregaDefecto`; no puede ser anterior a hoy).
   - Referencia del trabajo, que va a `observaciones` (ej. "Cocina completa").
   - *Mejora opcional:* autocompletar clientes ya cargados en solicitudes de módulos anteriores, buscando por nombre o teléfono.
2. **Elegir módulos:**
   - Grilla de tarjetas del catálogo activo, con imagen, nombre, categoría y cantidad de piezas.
   - Filtros por categoría y búsqueda.
   - Click en la tarjeta para marcar o desmarcar; cuando está marcada aparece un control de cantidad (− n +).
   - Contador "N módulos elegidos". No deja avanzar sin al menos uno.
3. **Medidas y colores:**
   - Un bloque "Colores por defecto" (esqueleto, frentes, cantos) con el botón **Aplicar a todos**.
   - Una tarjeta por **cada unidad** de módulo: si se eligieron 2 alacenas, hay 2 tarjetas, porque cada una puede tener medidas distintas.
   - Cada tarjeta tiene imagen, inputs de los parámetros pedibles (con la unidad mm, mínimo y máximo, y la ayuda), los tres colores, el perfil de cantos (botones segmentados con los nombres de los perfiles) y las observaciones del módulo.
   - Botón **Copiar medidas a los N iguales** en la primera tarjeta de cada grupo del mismo modelo.
   - Validación en vivo con el motor: si una medida rompe una fórmula, se muestra el error en la tarjeta.
4. **Revisar despiece:**
   - Llama a `/preview`.
   - Una tarjeta por módulo con la tabla de piezas: pieza, material, largo, ancho, cantidad y **cantos L1 L2 A1 A2 como botones conmutables**, mostrando el espesor.
   - El cambio manual se marca en otro color (en el prototipo, azul) y la pieza pasa a `origen = EDITADO`.
   - Panel lateral fijo con el resumen: módulos, piezas, placas por material y m², metros de canto por canto, herrajes (si está habilitado) y presupuesto estimado (placas, mano de obra, cantos, herrajes y total), con la leyenda "Las placas finales las define el optimizador".
   - Abajo, el plano de cortes (`CutOptimizer`) colapsable.
   - Botón **Crear solicitud** → `POST /api/pedidos-modulos` → navegar al detalle con la notificación "Solicitud M-1044 creada".

### 9.3 Detalle (`/modulos/:id`)

- **Encabezado:** "Solicitud M-1044", `StatusChip` y acciones. **Editar** (solo si `canEditOrder`). **Cambiar estado** con el mismo `Select` que `OrderDetailPage` y el mismo manejo del 409 `STOCK_SHORTAGE_CONFIRMATION_REQUIRED` (diálogo para confirmar sin stock). **Exportar Excel**, **Imprimir hojas de taller**, **Materiales** (`OrderMaterialsDialog`) y **Eliminar** (con el mismo diálogo, libera stock si estaba reservado).
- **Tarjeta de datos:** cliente, teléfono, email, dirección, referencia, fecha de entrega (editable acá mismo con un selector de fecha, registra `CAMBIAR_FECHA_ENTREGA` en el historial con el valor anterior y el nuevo) y semáforo. También el *stepper* de estados: Pendiente → En proceso → Terminada → Entregada (Rechazada se muestra aparte).
- **Pestañas:**
  - **Despiece:** por módulo. Las piezas con `origen ≠ CALCULADO` llevan la etiqueta "Editada" o "Agregada". Al final va el grupo "Piezas adicionales". Al costado, el resumen.
  - **Excel para la máquina:** vista previa con las columnas reales (§3.1) y el botón de descarga.
  - **Hoja de taller:** vista previa de las páginas y el botón Imprimir (§11.2).
  - **Plano de cortes:** `CutOptimizer` con `autoCalculate`.
  - **Historial:** fecha, usuario y acción legible.

### 9.4 Historial (`HistorialPedido.accion`)

`CREAR_PEDIDO_MODULOS`, `EDITAR_PEDIDO` (con resumen del cambio en `valorNuevo`: "Datos del cliente; 2 piezas modificadas; 1 pieza agregada"), `CAMBIAR_ESTADO`, `CAMBIAR_FECHA_ENTREGA` y `RECALCULAR_MODULO` (§10.6).

---

## 10. Editar una solicitud de módulos

> Requisito explícito del cliente: **"que sea igual al que ya tenemos"**. El objetivo es que se puedan modificar los cantos, agregar piezas y cambiar los datos del cliente.

### 10.1 Cuándo

Igual que hoy: `canEditOrder(estado)`, es decir, no se puede si está EN_PROCESO, TERMINADA o ENTREGADA. El botón no aparece en esos estados, y el backend responde 403 con el mismo mensaje existente.

### 10.2 Pantalla (`/modulos/:id/editar`)

Usa el mismo `Stepper` **Datos / Cortes / Cantos / Resumen** que `OrderFormPage`. Lo ideal es reutilizar ese mismo componente con una prop `kind="MODULOS"` o extraer las partes comunes. **No hagas una pantalla visualmente distinta.**

1. **Datos:** cliente, teléfono, email, dirección, fecha de entrega y observaciones.
2. **Cortes:** `OrderItemsTable`, extendido con una prop opcional `groups` que inserta filas de encabezado por módulo.
   - El encabezado muestra "Módulo 1 · Bajo mesada 2 puertas · 1200 × 780 × 580 mm" y un botón **Agregar pieza a este módulo**.
   - Al final va el grupo **Piezas adicionales (sin módulo)**.
   - Las columnas y acciones son las de siempre: placa, largo, ancho, cantidad, nombre, rotar, duplicar y eliminar.
   - Una pieza nueva dentro de un módulo toma por defecto el color de esqueleto de ese módulo.
   - Sin la prop `groups`, el componente se comporta **exactamente como hoy** (no puede haber regresiones en las solicitudes de corte).
3. **Cantos:** `OrderItemsTable mode="edges"`, con la misma agrupación. Las reglas son las existentes: hasta 4 tipos de canto por pieza y un lado solo puede tener un canto.
4. **Resumen:**
   - Datos de contacto y cantidad de piezas y unidades.
   - **Cambios detectados**, comparando contra lo guardado: N piezas modificadas, N agregadas y N eliminadas, más los cambios de datos del cliente y de la fecha.
   - `CutOptimizer` y presupuesto recalculado.
   - Botón **Revisar y guardar**, que abre el comprobante igual que hoy.

### 10.3 Guardado

`PUT /api/pedidos-modulos/:id`:

- reemplaza los detalles, igual que `PUT /api/orders/:id`, pero **conservando** `pedidoModuloId`, `piezaCodigo` y `orden`;
- marca `origen = EDITADO` en los detalles que cambiaron respecto de lo guardado y `MANUAL` en los nuevos;
- recalcula el presupuesto y los herrajes;
- si estaba EN_PROCESO con stock reservado (por ahora no ocurre, porque no se puede editar en ese estado), libera y vuelve a reservar como en el código actual;
- registra `EDITAR_PEDIDO` con el resumen.

### 10.4 Lo que la edición NO cambia

Ni las medidas ni los colores del módulo, porque son el "pedido de origen", ni el catálogo. Si hace falta cambiar las medidas de un módulo, se usa §10.6.

### 10.5 Borrador

Usar `useFormDraft` con la clave `${draftScope(user?.id)}modules:{id}`, con la misma lógica de `baseline` que `OrderFormPage`.

### 10.6 Recalcular un módulo desde el catálogo (opcional en v1, recomendado)

En el detalle, cada módulo tiene un menú **Cambiar medidas o colores**. Abre un diálogo con los parámetros, los colores y el perfil, muestra cómo quedan las piezas y advierte: "Se van a reemplazar las N piezas de este módulo. Se pierden los cambios manuales de este módulo." Al confirmar, regenera los detalles de ese `PedidoModulo` con la **definición actual del catálogo**, actualiza el snapshot y registra `RECALCULAR_MODULO`. Solo es posible en estados editables.

---

## 11. Salidas

### 11.1 Excel para la máquina

Se reutiliza `buildOrdersWorkbook` **sin cambiar las columnas**. Para no alterar el comportamiento actual, hay que tocar `GET /api/orders/export` con cuidado:

- Ordenar los detalles **solo** de los pedidos `MODULOS`: por `posicion` del módulo y después por `orden`, con las piezas adicionales al final. Los de `CORTE` quedan exactamente como hoy (sin `orderBy`).
- Hoy, con `ids` vacío exporta **todos** los pedidos. Agregá `tipo` como filtro opcional (`?tipo=CORTE|MODULOS`); el frontend actual sigue sin mandarlo. Así el resultado para quien exporta desde Solicitudes no cambia.
- El nombre del archivo hoy es fijo (`pedidos-carpinteria.xlsx`). Si se exporta **un único** pedido `MODULOS`, usá `pedido-M{numero}.xlsx`; en cualquier otro caso, el nombre actual.

El resto: Se usan los valores definidos en §8.2 (código de barra, Remark y nombre del producto). El archivo se llama `pedido-M{numero}.xlsx`. Con varias solicitudes se mantiene `pedidos-carpinteria.xlsx`.

### 11.2 Hoja de taller

Ruta de impresión `/modulos/:id/taller` (o una vista dentro del detalle), con CSS `@media print`, `@page { size: A4; margin: 12mm }` y `page-break-after: always` por módulo. Botón Imprimir (`window.print()`).

Contenido de cada página:

- **Encabezado:** logo de ROMA (de `frontend/assets/roma_logo.png` o de la configuración de empresa), "M-1044 · Módulo 2 de 5", cliente y fecha de entrega.
- **Bloque superior:** imagen del módulo (o un recuadro vacío), nombre, medidas pedidas, color de esqueleto y de frentes (con muestra de color si el material la tiene), cantos (color y perfil) y observaciones del módulo.
- **Tabla de despiece:** casilla para tildar · pieza · material · largo · ancho · cantidad · cantos (lados y espesor, por ejemplo "L1 L2 A1 A2 (2 mm)" o "L1 (0,45)"). Las piezas editadas o agregadas van marcadas.
- **Herrajes** (si está habilitado): casilla · herraje · cantidad.
- **Pie:** recuadro de observaciones del taller y líneas de firma "Armó", "Controló" y "Fecha".
- Si hay piezas adicionales, se agrega **una página extra** con esas piezas.
- La tipografía tiene que ser legible al imprimir en blanco y negro, con un tamaño mínimo de 10 pt en la tabla. **Una página por módulo:** si el despiece no entra, achicá el interlineado; no partas el módulo en dos páginas salvo que sea inevitable (más de 30 piezas).

### 11.3 Presupuesto y materiales

Se reutilizan `OrderMaterialsDialog` y el comprobante (`OrderReceiptDialog`), sumando la línea de herrajes cuando está habilitado.

---

## 12. Herrajes (opcional, detrás de un interruptor)

- **Configuración › Herrajes:** ABM (nombre, unidad, precio, activo) y ajuste masivo de precio por porcentaje, igual que en Materiales.
- **En el módulo:** lista de herrajes con fórmula de cantidad, por ejemplo:
  - Bisagra cazoleta 35 mm: `PUERTAS.cant * SI(PUERTAS.largo > 900; 3; 2)` (en las puertas altas va una bisagra más).
  - Corredera telescópica (par): `FREN_CAJ.cant + FREN_CAJ2.cant`.
  - Pata regulable: `SI(ANCHO > 1000; 6; 4)`.
  - Soporte de estante: `ESTANTE.cant * 4`.
  - Pistón a gas (levadizas): `PUERTA.cant * 2`.
- **En la solicitud:** total por módulo y general, en la hoja de taller y en el presupuesto (`costoHerrajes`).
- La lista real de herrajes y sus reglas **la tiene que pasar ROMA**. No inventes reglas definitivas: dejá los ejemplos de arriba como datos de demostración solo en el seed de desarrollo, no en producción.

---

## 13. API

Todas las rutas usan `authenticate` + `authorize(Rol.ADMIN)` y responden JSON. Los errores siguen el formato de `errorMiddleware`.

### 13.1 Catálogo `/api/modulos`

| Método y ruta | Descripción |
|---|---|
| `GET /api/modulos?categoriaId&search&incluirInactivos` | Listado con `_count` de piezas y parámetros, `tieneImagen`, `estadoFormulas` (`OK` / `CON_ERRORES`) y `observaciones`. |
| `GET /api/modulos/:id` | Definición completa (parámetros, piezas con cantos por perfil, perfiles y herrajes). |
| `POST /api/modulos` | Crea un módulo (`moduloSchema`). |
| `PUT /api/modulos/:id` | Reemplaza la definición completa en una transacción e incrementa `version`. |
| `PATCH /api/modulos/:id/active` | `{ activo }`. Para activar, tiene que evaluar sin errores. (Misma convención que `PATCH /api/materiales/:id/active`.) |
| `POST /api/modulos/:id/duplicar` | Copia el módulo; la copia queda inactiva. |
| `DELETE /api/modulos/:id` | Solo si no tiene `PedidoModulo`; si tiene, responde 409 sugiriendo desactivarlo. |
| `PUT /api/modulos/:id/imagen` | Cuerpo binario, `Content-Type: image/jpeg|png|webp`, máximo 3 MB. |
| `GET /api/modulos/:id/imagen` | Binario con `ETag` y `Cache-Control: private, max-age=86400`. |
| `DELETE /api/modulos/:id/imagen` | Quita la imagen. |
| `POST /api/modulos/evaluar` | `{ definicion, valores }` → `{ piezas, errores, herrajes }`. Sirve para borradores no guardados (el editor también evalúa local). |
| `GET/POST /api/modulos/categorias` · `PUT /api/modulos/categorias/:id` | ABM de categorías. |
| `GET/PUT /api/modulos/configuracion` | `ConfiguracionModulos`. |

> **Orden de registro en Express:** `/categorias`, `/configuracion` y `POST /evaluar` van **antes** de `/:id`; si no, Express los toma como un id.

`moduloSchema` (zod):

```ts
{
  codigo: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  nombre: z.string().min(2),
  categoriaId: z.string().uuid(),
  descripcion: z.string().optional().nullable(),
  activo: z.boolean(),
  espesorDisenoMm: z.coerce.number().positive(),
  materialFondoId: z.string().uuid().nullable().optional(),
  observaciones: z.string().optional().nullable(),
  parametros: z.array(z.object({
    clave: claveRegex,
    etiqueta: z.string().min(1),
    tipo: z.nativeEnum(TipoParametroModulo),
    valorDefecto: z.number().nullable(),
    minimo: z.number().nullable(),
    maximo: z.number().nullable(),
    opciones: z.array(z.object({ valor: z.number(), etiqueta: z.string() })).nullable(),
    formula: z.string().max(500).nullable(),
    ayuda: z.string().nullable(),
    orden: z.number().int()
  })).min(1),
  perfiles: z.array(z.object({
    orden: z.union([z.literal(1), z.literal(2)]),
    nombre: z.string().min(1),
    descripcion: z.string().nullable(),
    predeterminado: z.boolean()
  })).min(1).max(2),
  piezas: z.array(z.object({
    codigo: claveRegex,
    nombre: z.string().min(1),
    rol: z.nativeEnum(RolPiezaModulo),
    materialFijoId: z.string().uuid().nullable(),
    formulaLargo: z.string().max(500),
    formulaAncho: z.string().max(500),
    formulaCantidad: z.string().max(500),
    permiteRotar: z.boolean(),
    orden: z.number().int(),
    observaciones: z.string().nullable(),
    cantos: z.array(z.object({
      perfilOrden: z.union([z.literal(1), z.literal(2)]),
      lado: z.nativeEnum(LadoCanto),
      espesorMm: z.union([z.literal(0.45), z.literal(1), z.literal(2)])
    }))
  })),   // min(1) solo si activo = true (validar con superRefine); un borrador inactivo puede no tener piezas
  herrajes: z.array(z.object({
    herrajeId: z.string().uuid(),
    formulaCantidad: z.string().max(500),
    orden: z.number().int()
  })).optional()
}
```

Además, en el servicio: unicidad de claves y códigos, nombres reservados, perfiles válidos y evaluación con los valores por defecto (si `activo` es true).

### 13.2 Solicitudes `/api/pedidos-modulos`

| Método y ruta | Descripción |
|---|---|
| `GET /api/pedidos-modulos?estado&search&entregaDesde&entregaHasta` | Listado de `Pedido` con `tipo = MODULOS`, incluyendo `_count.modulos`, `numero` y `fechaEntrega`. |
| `POST /api/pedidos-modulos/preview` | Calcula sin guardar (§8.5). |
| `POST /api/pedidos-modulos` | Crea la solicitud en una transacción (Pedido + PedidoModulo + DetallePedido + PedidoHerraje + historial). **No manda push.** Devuelve el pedido con `numero`. |
| `GET /api/pedidos-modulos/:id` | Pedido con módulos (incluye snapshot y colores), detalles ordenados, herrajes e historial. |
| `PUT /api/pedidos-modulos/:id` | Edición (§10.3). |
| `PATCH /api/pedidos-modulos/:id/fecha-entrega` | `{ fechaEntrega }`, con historial. |
| `POST /api/pedidos-modulos/:id/modulos/:pedidoModuloId/recalcular` | §10.6. |

`crearPedidoModulosSchema`:

```ts
{
  cliente: z.string().min(2),
  numeroContacto: z.string().min(6),
  emailContacto: z.string().email().optional().nullable(),
  direccionEntrega: z.string().optional().nullable(),
  fechaEntrega: z.string().date(),          // YYYY-MM-DD, >= hoy
  observaciones: z.string().optional().nullable(),
  modulos: z.array(z.object({
    moduloId: z.string().uuid(),
    valores: z.record(z.string(), z.number()),
    colorEsqueletoId: z.string().uuid(),
    colorFrentesId: z.string().uuid(),
    colorCantoId: z.string().uuid(),
    perfilCantoOrden: z.union([z.literal(1), z.literal(2)]),
    observaciones: z.string().optional().nullable(),
    // cambios de canto hechos en el paso 4 (por codigo de pieza)
    cantosOverride: z.record(z.string(), z.object({
      LARGO_1: espesorCanto.nullable(),   // const espesorCanto = z.union([z.literal(0.45), z.literal(1), z.literal(2)])
      LARGO_2: espesorCanto.nullable(),
      ANCHO_1: espesorCanto.nullable(),
      ANCHO_2: espesorCanto.nullable()
    })).optional()
  })).min(1).max(100)
}
```

En `cantosOverride`, el valor de cada lado es el espesor o `null` si va sin canto. Las piezas con override se crean con `origen = EDITADO`.

`PUT /api/pedidos-modulos/:id` recibe los datos del cliente más `detalles: detailSchema[]`, extendido con `id?`, `pedidoModuloId`, `piezaCodigo` y `orden`.

### 13.3 Endpoints existentes que se reutilizan

- `PATCH /api/orders/:id/status`: funciona para los dos tipos.
- `GET /api/orders/export?ids=`, con los ajustes de §11.1 (orden de detalles en `MODULOS`, filtro `tipo` opcional y nombre de archivo).
- `GET /api/orders/:id/materiales`.
- `DELETE /api/orders/:id`.

Verificá que ninguno asuma `tipo = CORTE`.

### 13.4 Herrajes `/api/herrajes` (opcional)

`GET` (con `incluirInactivos`), `POST`, `PUT /:id`, `PATCH /:id/active` y `POST /adjust-values` (`{ herrajeIds, percentage }`), con la misma convención de nombres que Materiales (`/:id/active`, `/adjust-values` con `{ materialIds, percentage }`).

---

## 14. Frontend

### 14.1 Rutas nuevas (todas con `ProtectedRoute roles={["ADMIN"]}`)

`/modulos` · `/modulos/nueva` · `/modulos/:id` · `/modulos/:id/editar` · `/modulos/:id/taller` · `/configuracion-modulos` · `/configuracion-modulos/nuevo` · `/configuracion-modulos/:id` · `/configuracion-herrajes`

Agregá `/modulos` a la detección de "sección admin" de `ProtectedRoute`.

### 14.2 Menú (`AppLayout`)

- **Principal**, solo para ADMIN: "Módulos a medida" (ícono de mueble o `ViewModule`), debajo de "Solicitar cortes".
- **Configuración:** "Catálogo de módulos" y "Herrajes" (este último solo si `herrajesHabilitados`).
- El título de la barra superior cambia según la sección.

### 14.3 Tipos (`frontend/src/types/index.ts`)

Agregá `TipoPedido`, `Modulo`, `ModuloParametro`, `ModuloPieza`, `ModuloPerfilCanto`, `PedidoModulo` y `Herraje`, y extendé `Order` (`numero`, `tipo`, `fechaEntrega`, `emailContacto`, `direccionEntrega`, `costoHerrajes`, `modulos?`) y `OrderDetail` (`pedidoModuloId`, `piezaCodigo`, `origen`, `orden`).

### 14.4 Componentes nuevos sugeridos

`ModuleCatalogPage`, `ModuleEditorPage` (con `FormulaInput` con autocompletado y `PieceEdgesToggles`), `ModuleOrdersPage`, `ModuleOrderWizard` (`ModulePickerGrid`, `ModuleLineCard`, `ModuleDespieceCard`, `ModuleSummaryAside`), `ModuleOrderDetailPage`, `WorkshopSheets` (impresión), `DeliveryChip` (semáforo) y `HerrajesPage`.

### 14.5 Criterios de UX

- Mismo lenguaje visual del sistema: `Paper`, encabezados de tabla `#f7f1e8`, botón principal con el degradado naranja y chips de estado existentes.
- Todo número de medida en mm, alineado a la derecha y con `tabular-nums`.
- **Responsive:** el asistente y el detalle tienen que poder usarse en una tablet (el taller usa tablets). En el celular alcanza con consultar.
- **Accesibilidad:** los botones de canto L1, L2, A1 y A2 tienen `aria-pressed` y `title` con el lado y el espesor; los inputs de fórmula tienen `aria-invalid` y `aria-describedby` apuntando al mensaje de error.
- **Estados vacíos y de carga:** "Todavía no hay solicitudes de módulos" con el botón para crear la primera; esqueletos de carga en las grillas.
- **Copy:** los botones dicen lo que hacen ("Crear solicitud", "Guardar cambios", "Imprimir hojas (5)") y las notificaciones confirman lo hecho ("Solicitud M-1044 creada").

---

## 15. Impacto en lo existente: checklist de no-regresión

- [ ] `GET /api/orders` filtra `tipo: CORTE` **por defecto**. `OrdersPage` (Solicitudes / Mis solicitudes) no muestra módulos.
- [ ] `POST/PUT /api/orders` crea y edita solo `CORTE`. `PUT /api/orders/:id` sobre un pedido `MODULOS` responde 400 ("Editá esta solicitud desde Módulos a medida").
- [ ] `GET /api/orders/:id` sobre un `MODULOS` funciona, pero el frontend redirige `/pedidos/:id` → `/modulos/:id` si `tipo = MODULOS`.
- [ ] **Dashboard (`/api/stats`):** los totales y las alertas de stock **incluyen ambos tipos**, porque el stock de placas es uno solo. Agregá un desglose `byTipo` para mostrar "de los cuales N son módulos a medida".
- [ ] No hay notificaciones push ni WhatsApp al crear solicitudes de módulos.
- [ ] Un carpintero no puede acceder a ninguna ruta nueva (403 en la API y redirección en el frontend).
- [ ] `OrderItemsTable` sin la prop `groups` se ve y funciona idéntico.
- [ ] Exportar varias solicitudes de corte sigue dando el mismo Excel byte a byte, salvo la fecha de creación del archivo.
- [ ] Materiales: el cálculo de `canDeletePermanently` y los avisos de desactivación contemplan el uso en el catálogo y en las solicitudes de módulos.
- [ ] `cutOptimizer.test.ts` sigue pasando y `sync-optimizer --check` está en verde con los dos archivos.

---

## 16. Carga inicial de los 33 modelos

- Script `backend/prisma/seed-modulos.ts` con el comando `npm run prisma:seed:modulos` (y su versión compilada para producción, como `prisma:seed:prod`).
- Lee `backend/prisma/data/modulos-muebles.json` y `backend/prisma/data/imagenes/*.jpg` (copiá los del paquete).
- Es **idempotente**: hace upsert por `codigo`. Si el módulo ya existe y `version > 1` (alguien lo editó en el sistema), **no lo pisa**, salvo que se pase `--force`.
- Crea las categorías que falten.
- Por cada módulo:
  - parámetros tal cual (la `clave` en el JSON ya está normalizada, por ejemplo `PROFUNDIDAD`);
  - piezas con `rol` y `permiteRotar` del JSON;
  - **dos perfiles**: "Estándar" (predeterminado; FRENTE con los 4 lados a 2 mm y ESQUELETO con los lados de `cantosProvisorios` a 0,45 mm) y "Económico" (los mismos lados, todo a 0,45 mm). Las piezas **FONDO no llevan canto** en ningún perfil (en el JSON todas tienen los 4 lados en 0);
  - imagen si existe;
  - `observaciones` = `observacionesImportacion` unidas con saltos de línea;
  - activo si `activo` es true en el JSON. "Interior de placard + frente" queda inactivo porque no tiene fórmulas.
- El test de paridad (`moduleFormula.test.ts`) **es parte del CI**.

> **Importante:** `rol`, `cantosProvisorios` y `permiteRotar` son una **propuesta por heurística**. El catálogo queda usable para la demo y las pruebas, pero **ROMA tiene que revisarlo modelo por modelo** antes de la puesta en marcha (§19). Por eso esos módulos muestran el chip "N observaciones".

---

## 17. Pruebas y criterios de aceptación

### 17.1 Unitarias

- **Motor:** paridad 305/305, sintaxis, errores, ciclos, `SI` perezoso, cantidad 0, rangos y redondeo `REDONDEAR`/`TRUNCAR` (por ejemplo 412,5 → 413 / 412).
- **`buildModuleDetails`:** resolución de material por rol, cantos por perfil y color, error de canto faltante con todos los faltantes juntos, código de barra, Remark y orden.
- **Validación de pieza que no entra en la placa**, con y sin rotación.
- **Diferencias de edición:** clasificación en modificadas, agregadas y eliminadas.

### 17.2 Integración (API)

- Crear una solicitud con 3 módulos → `numero` asignado, detalles = suma de piezas, `presupuestoEstimado` igual al de `buildOrderEstimateSnapshot` más herrajes, historial `CREAR_PEDIDO_MODULOS`.
- Editarla en Pendiente → OK; pasarla a En proceso → reserva stock; editarla en En proceso → 403.
- Exportar → mismas columnas; Remark y código de barra correctos.
- Un carpintero → 403 en todas las rutas nuevas.
- `GET /api/orders` como admin no trae `MODULOS`.

### 17.3 Prueba de aceptación manual (con ROMA)

1. Crear "Cocina Ferreyra": Bajo mesada 2 puertas de 1200, Cajonera 3 cajones, 2 Alacenas 2 puertas de 780 y Módulo microondas; esqueleto Blanco, frentes Gris grafito, cantos Blanco, perfil Estándar.
2. Comparar el despiece pieza por pieza con el que da `muebles.xlsx` con las mismas medidas. Tiene que coincidir, salvo el redondeo acordado.
3. En el paso 4, cambiar los cantos de un estante. Crear la solicitud.
4. Editarla: agregar una "Tapa mesada extra" en piezas adicionales, ponerle canto 2 mm en los 4 lados y cambiar el teléfono del cliente. Guardar.
5. Exportar el Excel y cargarlo en el software de la máquina. **Lo tiene que leer sin tocar nada.**
6. Imprimir las hojas de taller: una por módulo más la de adicionales, legibles en blanco y negro.
7. Pasarla a En proceso → baja el stock de placas. Pasarla a Terminada y después a Entregada. Revisar el historial.

---

## 18. Plan de trabajo por fases

Cada fase es un PR que se puede revisar por separado.

| Fase | Entregable | Notas |
|---|---|---|
| 1 | **Motor de fórmulas** en `lib` + `shared`, sync script, tests de paridad en verde | Partir de `referencia/`. |
| 2 | **Modelo de datos y migraciones**, `ConfiguracionModulos`, seed de categorías, **importador de los 33 modelos** | Probar la migración sobre `carpinteria.backup`. |
| 3 | **API del catálogo** (respetando el orden de rutas de §13.1) + página de catálogo + editor (General, Medidas, Despiece y cantos, Perfiles) + imágenes | El editor evalúa en vivo con el motor. |
| 4 | **API de solicitudes** (preview, crear, obtener, listado), `buildModuleDetails`, validaciones de placa y canto; listado y asistente de 4 pasos | Reutilizar el estimador. |
| 5 | **Detalle, edición** (con `OrderItemsTable` y `groups`), fecha de entrega, estados, exportación, **hoja de taller**, historial, checklist de no-regresión §15 | — |
| 6 | **Herrajes** (si está contratado): ABM, fórmulas por módulo, salidas | Detrás del interruptor. |
| 7 | **Recalcular módulo** (§10.6), autocompletar clientes, pulido de UX, prueba de aceptación con ROMA | — |

---

## 19. Decisiones pendientes con ROMA

Mientras no respondan, se implementa la opción **por defecto**. Todas son configurables o fáciles de cambiar.

| # | Tema | Pregunta | Por defecto |
|---|---|---|---|
| 1 | Cantos por modelo | ¿Qué lados de cada pieza llevan canto y de qué espesor? | Heurística: frentes con 4 lados a 2 mm; esqueleto con 1 largo (el visible) a 0,45 mm; fondos sin canto. |
| 2 | Material por pieza | ¿Qué piezas van en color de esqueleto y cuáles en color de frentes? | Heurística del JSON (puertas, frentes y placas fijas = FRENTE). |
| 3 | Fondos | ¿De qué material son los fondos (fibrofácil 3 mm, 5,5 mm, melamina 18)? | Configurable en `ConfiguracionModulos.materialFondoId`; hay que cargar el material. |
| 4 | Zócalo y gola | En las fotos son negros. ¿Llevan un color propio? | Por ahora, color de esqueleto. Si dicen que sí, pasan a `rol = FIJO` con su material, o se agrega un cuarto color "Detalles" en la solicitud. |
| 5 | Color del canto de los frentes | ¿El canto de las puertas sigue el color de los frentes o el "color de cantos" único? | Color de cantos único, tal como se aprobó. Dejá el código preparado para resolver el color de canto por rol si lo piden. |
| 6 | Largo y ancho, veta | Unificar la convención: `largo` = sentido de la veta. Revisar las puertas de Bajo 4p, Armario y Esquinero placa fija 2p, que están invertidas respecto de otros modelos. | Se importa tal cual el Excel, con `permiteRotar = false` en melaminas y `true` en fondos. |
| 7 | Redondeo | 5 modelos dan medidas con decimales. ¿Redondear o truncar? | REDONDEAR al mm. |
| 8 | Descuento por canto | ¿Las fórmulas ya contemplan el espesor del canto de 2 mm? | Sí: no se descuenta nada. |
| 9 | Casos particulares | Escobero "Opción 2" (fondo entero o partido); fondo del Módulo microondas sin cantidad; "Interior de placard + frente" sin fórmulas. | Escobero: parámetro `OPCION` `VARIANTE_FONDO` (1/2) y cantidades con `SI`. El fondo del microondas se importa con cantidad 1. El interior de placard queda inactivo. |
| 10 | Herrajes | ¿Contrataron el opcional? ¿Cuál es la lista y cuáles son las reglas? | Interruptor apagado. |
| 11 | Plazos | ¿Días por defecto para la entrega y para el aviso de vencimiento? | 15 y 3. |

> **Nota sobre el escobero:** en el Excel, debajo del fondo hay un bloque "Opción 2" con dos piezas (1577 × 286 y 658 × 286, que suman el alto). Es una **variante de fondo**: entero (opción 1, pieza `FONDO` de 2233 × 286) o partido en dos (opción 2, piezas `OPCION2` y `OPCION22`, ya renombradas en el JSON a "Fondo abajo/arriba (opción 2)"). Al importar, agregá el parámetro `VARIANTE_FONDO` (OPCION: 1 = "Fondo entero", 2 = "Fondo en dos partes", valor por defecto 1), poné `formulaCantidad = SI(VARIANTE_FONDO = 1; 1; 0)` en `FONDO` y `SI(VARIANTE_FONDO = 2; 1; 0)` en `OPCION2` y `OPCION22`. Confirmá con ROMA cuándo se usa cada una (por ejemplo, si el fondo entero no entra en la placa).

---

## 20. Riesgos y cómo mitigarlos

| Riesgo | Mitigación |
|---|---|
| Fórmulas mal cargadas → piezas mal cortadas (desperdicio de placa) | Paridad automática con el Excel; vista en vivo en el editor; módulos con errores no se pueden activar; aceptación con ROMA comparando con su planilla. |
| Esqueleto con un espesor distinto al de diseño | Filtrar los colores por `espesorDisenoMm` (§8.6). |
| Cambios en el catálogo alteran pedidos en curso | Despiece materializado + snapshot (D2). Recalcular solo a pedido. |
| Regresiones en las solicitudes de corte | Filtro por `tipo`, prop `groups` opcional, checklist §15 y tests. |
| Falta un canto (color × espesor) en Materiales | Error claro que lista **todos** los faltantes antes de crear; en el editor de perfiles, advertir qué colores no tienen cantos de esos espesores. |
| Excel incompatible con la máquina | No tocar `buildOrdersWorkbook`; prueba real de importación en la máquina (§17.3 paso 5). |
| Rendimiento del estimador con pedidos grandes (muchas piezas) | El optimizador ya se usa así; medir con 20 módulos (alrededor de 300 piezas). Si tarda más de 2 s en `/preview`, cachear por hash de detalles. |

---

## 21. Anexo: catálogo importado

Resumen de los 33 modelos de `muebles.xlsx`, tal como vienen en `modulos-muebles.json`. Las medidas por defecto son las de la hoja del Excel.

| Código | Nombre | Categoría | Medidas (por defecto, mm) | Piezas | Imagen | Observaciones |
|---|---|---|---|---|---|---|
| `CAJONERA_3_CAJONES` | Cajonera 3 cajones | Bajo mesada | ANCHO=560, ALTO=780, PROFUNDIDAD=580 | 15 | Sí | — |
| `ESPECIERO` | Especiero | Bajo mesada | ANCHO=230, ALTO=780, PROFUNDIDAD=580 | 10 | — | — |
| `ALACENA_LEVADIZA_2_PUERTAS` | Alacena levadiza 2 puertas | Alacenas | ANCHO=1150, ALTO=890, PROFUNDIDAD=300 | 6 | — | "Puerta" da medidas con decimales (412.5 mm): se redondea al mm. |
| `ESCOBERO` | Escobero | Placares y torres | ANCHO=290, ALTO=2235, PROFUNDIDAD=560, LUZ_ABAJO=1550 | 10 | — | El Excel trae dos variantes de fondo (entero o partido en dos): se configura como variante elegible. |
| `MESA_DE_LUZ_FLOTANTE` | Mesa de luz flotante | Dormitorio y otros | ANCHO=550, ALTO=370, PROFUNDIDAD=330 | 7 | — | — |
| `MESA_DE_LUZ` | Mesa de luz | Dormitorio y otros | ANCHO=500, ALTO=610, PROFUNDIDAD=400 | 11 | — | — |
| `ESQUINERO_PLACA_FIJA` | Esquinero placa fija | Bajo mesada | ANCHO=1140, ALTO=780, PROFUNDIDAD=580 | 12 | — | — |
| `CAJONERA_DOBLE_4_CAJONES` | Cajonera doble 4 cajones | Bajo mesada | ANCHO=1459, ALTO=780, PROFUNDIDAD=580 | 12 | — | "Frent caj" da medidas con decimales (725.5 mm): se redondea al mm.; "Int caj (2)" da medidas con decimales (639.5 mm): se redondea al mm.; "Fondo caj" da medidas con decimales (673.5 mm): se redondea al mm. |
| `MODULO_SOBRE_HELADERA` | Módulo sobre heladera | Alacenas | ANCHO=700, ALTO=446, PROFUNDIDAD=580 | 5 | — | — |
| `ALACENA_4_PUERTAS_LEVADIZAS` | Alacena 4 puertas levadizas | Alacenas | ANCHO=1250, ALTO=960, PROFUNDIDAD=330 | 6 | — | — |
| `ALACENA_PLACA_FIJA` | Alacena placa fija | Alacenas | ANCHO=1113, ALTO=820, PROFUNDIDAD=580, ANCHO_PLACA_FIJA=620 | 7 | — | — |
| `ALACENA_1_PUERTA` | Alacena 1 puerta | Alacenas | ANCHO=564, ALTO=1000, PROFUNDIDAD=330 | 5 | Sí | — |
| `MODULO_MICROONDAS` | Módulo microondas | Alacenas | ANCHO=530, ALTO=700, PROFUNDIDAD=330, PROF_PISO=400, LUZ_MICRO=350 | 6 | Sí | "Fondo" no tiene cantidad en el Excel (se asumió 1). |
| `ARMARIO_2_PUERTAS` | Armario 2 puertas | Placares y torres | ANCHO=1200, ALTO=1820, PROFUNDIDAD=430 | 7 | — | — |
| `MODULO_ABIERTO` | Módulo abierto | Dormitorio y otros | ANCHO=900, ALTO=800, PROFUNDIDAD=300 | 6 | — | — |
| `TORRE_HORNO` | Torre horno | Placares y torres | ALTO=2570, ANCHO=636, PROFUNDIDAD=580, LUZ_ABAJO=762, LUZ_HORNO=600, LUZ_MICRO=350, LUZ_ARRIBA=ƒ | 7 | — | "Luz arriba" es un valor calculado a partir de otras medidas. |
| `DESPENSERO_4_PUERTAS` | Despensero 4 puertas | Placares y torres | ANCHO=1050, ALTO=2100, PROFUNDIDAD=580, LUZ_ABAJO=777 | 9 | — | — |
| `BAJO_MESADA_2_PUERTAS` | Bajo mesada 2 puertas | Bajo mesada | ANCHO=1200, ALTO=780, PROFUNDIDAD=580 | 10 | Sí | — |
| `PLACARD_EN_ESPEJO_2_PUERTAS` | Placard en espejo 2 puertas | Placares y torres | ANCHO=2000, ALTO=2100, PROFUNDIDAD=600, DIV_BAULERA=300 | 14 | — | — |
| `PLACARD_3_PUERTAS_DE_EMBUTIR` | Placard 3 puertas de embutir | Placares y torres | ANCHO=2600, ALTO=2400, PROFUNDIDAD=600, ALTO_BAULERA=432 | 15 | — | "Piso techo" da medidas con decimales (854.7 mm): se redondea al mm.; "Estante" da medidas con decimales (818.7 mm): se redondea al mm.; "Divis. está" da medidas con decimales (353.3 mm): se redondea al mm.; "Están chic" da medidas con decimales (284.9 mm): se redondea al mm.; "Frent caj" da medidas con decimales (499.8 mm): se redondea al mm.; "Int cajón" da medidas con decimales (384.3 mm): se redondea al mm.; "Techo baule" da medidas con decimales (854.7 mm): se redondea al mm.; "Puertas" da medidas con decimales (834.7 mm): se redondea al mm. |
| `INTERIOR_DE_PLACARD_FRENTE` | Interior de placard + frente | Placares y torres | ANCHO=2185, ALTO=2515, ANCHO_MODULOS=550 | 0 | — | **Inactivo.** La hoja no tiene fórmulas cargadas: el módulo queda incompleto hasta definirlas. |
| `BAJO_MESADA_2_PUERTAS_3_CAJONES` | Bajo mesada 2 puertas 3 cajones | Bajo mesada | ANCHO=1000, ALTO=780, PROFUNDIDAD=560, ANCHO_FRENTE_CAJON=370 | 17 | — | — |
| `ESQUINERO_PLACA_FIJA_2_PUERTAS` | Esquinero placa fija 2 puertas | Bajo mesada | ANCHO=1500, ALTO=750, PROFUNDIDAD=560 | 10 | — | — |
| `PLACARD_2_PUERTAS_UN_LADO_PERCHERO` | Placard 2 puertas un lado perchero | Placares y torres | ANCHO=2000, ALTO=2600, PROFUNDIDAD=600, ALTO_BAULERA=450 | 15 | — | — |
| `CAJONERA_2_CAJONES` | Cajonera 2 cajones | Bajo mesada | ANCHO=630, ALTO=800, PROFUNDIDAD=580 | 12 | Sí | — |
| `ESQUINERO` | Esquinero | Bajo mesada | ANCHO=940, ANCHO_2=870, ALTO=780, PROFUNDIDAD=560 | 9 | — | Tiene dos parámetros llamados "Ancho": se renombran Ancho 1 / Ancho 2. |
| `ALACENA_2_PUERTAS` | Alacena 2 puertas | Alacenas | ANCHO=780, ALTO=500, PROFUNDIDAD=300 | 5 | Sí | — |
| `BAJO_MESADA_1_PUERTA` | Bajo mesada 1 puerta | Bajo mesada | ANCHO=570, ALTO=780, PROFUNDIDAD=580 | 10 | Sí | — |
| `BAJO_MESADA_3_PUERTAS` | Bajo mesada 3 puertas | Bajo mesada | ANCHO=1546, ALTO=880, PROFUNDIDAD=610 | 11 | Sí | "Estante" da medidas con decimales (488.3 mm): se redondea al mm.; "Estante" da medidas con decimales (1003.7 mm): se redondea al mm.; "Puertas" da medidas con decimales (511.3 mm): se redondea al mm. |
| `VANITORY_2_CAJONES` | Vanitory 2 cajones | Bajo mesada | ANCHO=1181, ALTO=650, PROFUNDIDAD=550 | 15 | — | — |
| `BAJO_MESADA_4_PUERTAS` | Bajo mesada 4 puertas | Bajo mesada | ANCHO=1500, ALTO=780, PROFUNDIDAD=580 | 10 | Sí | — |
| `ALACENA_3_PUERTAS` | Alacena 3 puertas | Alacenas | ANCHO=1171, ALTO=500, PROFUNDIDAD=300 | 6 | Sí | "Estante" da medidas con decimales (753.7 mm): se redondea al mm.; "Estante" da medidas con decimales (363.3 mm): se redondea al mm.; "Puertas" da medidas con decimales (386.3 mm): se redondea al mm. |
| `ALACENA_4_PUERTAS` | Alacena 4 puertas | Alacenas | ANCHO=1600, ALTO=500, PROFUNDIDAD=330 | 5 | Sí | — |

Total: 33 modelos, 305 piezas con fórmula, 11 con imagen. `ƒ` = medida calculada.
