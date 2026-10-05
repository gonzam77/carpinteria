// Prueba de F4.3: alta, detalle y listado de solicitudes de modulos, contra el backend local (puerto 4100) y la copia
// del backup con el catalogo importado.
// - El alta guarda exactamente lo que mostro la vista previa: placas, cada componente del presupuesto, las filas
//   (solo cambia el codigo de barra, que pasa a tener el numero) y los modulos con su copia de la definicion.
// - Los m² por material son la suma exacta de las piezas (R3).
// - El stock se reserva y se devuelve exacto al cambiar el estado, como en corte, y una carrera entre borrar y
//   cambiar el estado no pierde ni duplica placas.
// - Listado: cada busqueda y filtro trae lo que corresponde y excluye lo demas; orden por entrega, entregadas al final.
// - Errores: datos, version del modulo cambiada (409) y permisos.
//
// Cambia la copia por un rato y la deja como estaba: carga una placa de 3 mm como fondo si la configuracion no
// tiene, pone 500 placas de stock en los materiales que usa y borra las solicitudes que crea (todas con cliente
// "Prueba F4.3 ..."). Si encuentra restos de una corrida anterior que se corto, no toca nada y avisa.
// No imprime datos de clientes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = fileURLToPath(new URL("../../../backend/", import.meta.url));
const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const BASE = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F4.3";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const admin = jwt.sign({ id: psql("select id from usuarios where rol='ADMIN' limit 1"), email: "prueba@local", rol: "ADMIN" }, SECRET, { expiresIn: "2h" });
const carpintero = jwt.sign({ id: psql("select id from usuarios where rol='CARPINTERO' limit 1"), email: "carp@local", rol: "CARPINTERO" }, SECRET, { expiresIn: "2h" });

const call = async (method, path, body, token = admin) => {
  const response = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures++;
};
// jsonb reordena las claves: los objetos se comparan con las claves ordenadas.
const canonical = (value) =>
  Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Restos de una corrida anterior que se corto: no se toca nada.
const restos = psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`);
if (restos !== "0") {
  console.log(`MAL hay ${restos} solicitudes "${PREFIJO}..." de una corrida anterior que se corto. Borralas (DELETE /api/orders/:id, que devuelve el stock),`);
  console.log('    revisa el stock de los colores y que configuracion_modulos."materialFondoId" tenga lo de antes (en la copia original, null).');
  process.exit(1);
}

// Fechas en la zona del negocio (spec §9.1).
const ymd = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const hoy = ymd(new Date());
const enDias = (dias) => ymd(new Date(Date.now() + dias * 86400000));

// ---------------------------------------------------------------- datos de la copia
const colores = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 0.45) < 1e-6)
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 2) < 1e-6)
  order by p.nombre limit 2`).split("\n");
const fondo = psql(`select id from materiales where tipo = 'PLACA' and activo and "espesorMm" = 3 and "anchoPlaca" is not null limit 1`);
const fondoAntes = psql(`select coalesce("materialFondoId", 'null') from configuracion_modulos where id = 'default'`);
const fondoConfig = fondoAntes === "null" ? fondo : fondoAntes;
const pedidosAntes = psql("select count(*) from pedidos");
const modulosPedidosAntes = psql("select count(*) from pedidos_modulo");
const usados = [...new Set([...colores, fondoConfig])];
const lista = (ids) => ids.map((id) => `'${id}'`).join(",");
const stockAntes = new Map(psql(`select id, coalesce("stockPlacas"::text, 'null') from materiales where id in (${lista(usados)})`).split("\n").map((row) => row.split("|")));
check("datos de prueba", colores.length === 2 && Boolean(fondoConfig) && stockAntes.size === usados.length);

const codigos = ["BAJO_MESADA_2_PUERTAS", "ALACENA_2_PUERTAS", "PLACARD_3_PUERTAS_DE_EMBUTIR"];
const modulos = new Map(psql(`select codigo, id from modulos where codigo in (${codigos.map((c) => `'${c}'`).join(",")})`).split("\n").map((row) => row.split("|")));
const [colorA, colorB] = colores;
const bajo = modulos.get("BAJO_MESADA_2_PUERTAS");
const placard = modulos.get("PLACARD_3_PUERTAS_DE_EMBUTIR");
const piso = (await call("GET", `/modulos/${bajo}`)).data.piezas[0].codigo;
const lines = [
  { moduloId: bajo, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, colorCantoId: colorA, perfilCantoOrden: 1, observaciones: "Va contra la pared" },
  { moduloId: modulos.get("ALACENA_2_PUERTAS"), valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, colorCantoId: colorB, perfilCantoOrden: 2 },
  { moduloId: placard, valores: {}, colorEsqueletoId: colorB, colorFrentesId: colorA, colorCantoId: colorA, perfilCantoOrden: 1 },
  { moduloId: bajo, valores: { ANCHO: 900 }, colorEsqueletoId: colorA, colorFrentesId: colorB, colorCantoId: colorA, perfilCantoOrden: 1, cantosOverride: { [piso]: { LARGO_1: 2, LARGO_2: 2, ANCHO_1: null, ANCHO_2: null } } }
];
const placardLine = lines[2];
const datos = (extra = {}) => ({
  cliente: `${PREFIJO} alfa`,
  numeroContacto: "000000",
  emailContacto: "prueba@ejemplo.com",
  direccionEntrega: "Calle de prueba 123",
  fechaEntrega: enDias(15),
  observaciones: "Cocina de prueba",
  ...extra
});

const COMPONENTS = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado", "faltanteStock", "costoHerrajes", "presupuestoConHerrajes"];
const ROW_FIELDS = [
  "materialId", "material", "largo", "ancho", "cantidad", "cantoLargo1Id", "cantoLargo1Nombre", "cantoLargo1", "cantoLargo2Id", "cantoLargo2Nombre", "cantoLargo2",
  "cantoAncho1Id", "cantoAncho1Nombre", "cantoAncho1", "cantoAncho2Id", "cantoAncho2Nombre", "cantoAncho2", "permiteRotar", "codigoBarraCentro", "remark",
  "numeroCliente", "nombreCliente", "nombreProducto", "indice", "piezaCodigo", "origen", "orden"
];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
const MODULE_FIELDS = ["posicion", "moduloId", "nombreModulo", "valores", "colorEsqueletoId", "colorFrentesId", "colorCantoId", "perfilCantoOrden", "observaciones"];

const creados = [];
const crear = async (body) => {
  const response = await call("POST", "/pedidos-modulos", body);
  if (response.status === 201) creados.push(response.data.id);
  return response;
};
const stockDe = (ids) => new Map(psql(`select id, "stockPlacas" from materiales where id in (${lista(ids)})`).split("\n").map((row) => row.split("|")).map(([id, stock]) => [id, Number(stock)]));

try {
  if (fondoAntes === "null") psql(`update configuracion_modulos set "materialFondoId" = '${fondo}' where id = 'default'`);
  psql(`update materiales set "stockPlacas" = 500 where id in (${lista(usados)})`);

  // ---------------------------------------------------------------- vista previa y alta
  const preview = await call("POST", "/pedidos-modulos/preview", { ...datos(), modulos: lines });
  check("vista previa", preview.status === 200, `${preview.status} ${preview.data?.message ?? ""}`);
  const versiones = preview.data.modulos.map((modulo) => modulo.version);
  const conVersion = lines.map((line, index) => ({ ...line, version: versiones[index] }));

  const created = await crear({ ...datos(), modulos: conVersion });
  check("alta", created.status === 201, `${created.status} ${created.data?.message ?? ""}`);
  const order = created.data;

  const diferencias = COMPONENTS.filter((key) => order[key] !== preview.data[key]);
  check("el alta guarda las mismas placas y cada componente que la vista previa", diferencias.length === 0, diferencias.join(", ") || `${order.placasEstimadas} placas, $${order.presupuestoEstimado}`);
  check("y el mismo detalle del calculo", same(order.estimacionDetalle, preview.data.estimacionDetalle));
  check(
    "las mismas filas, en el mismo orden",
    order.detalles.length === preview.data.detalles.length && order.detalles.every((row, index) => same(pick(row, ROW_FIELDS), pick(preview.data.detalles[index], ROW_FIELDS))),
    `${order.detalles.length} filas`
  );
  check(
    "codigo de barra con el numero del pedido",
    Number.isInteger(order.numero) && order.detalles.every((row, index) => row.codigoBarra === preview.data.detalles[index].codigoBarra.replace("M---", `M${order.numero}`)),
    order.detalles[0].codigoBarra
  );
  const moduloDe = new Map(order.modulos.map((modulo) => [modulo.id, modulo.posicion]));
  check("cada fila con el pedidoModuloId de su modulo", order.detalles.every((row, index) => moduloDe.get(row.pedidoModuloId) === preview.data.detalles[index].posicionModulo));
  check("una pieza con cantos cambiados queda EDITADO", order.detalles.filter((row) => row.origen === "EDITADO").length === 1 && order.detalles.every((row) => row.origen));

  // Modulos guardados: cada uno igual al de la vista previa y al pedido, con la copia de SU definicion (spec D2).
  check(
    "cada modulo guardado igual al de la vista previa",
    order.modulos.length === lines.length && order.modulos.every((modulo, index) => same(pick(modulo, MODULE_FIELDS), pick(preview.data.modulos[index], MODULE_FIELDS))),
    order.modulos.map((modulo) => modulo.nombreModulo).join(", ")
  );
  check(
    "colores y perfil de cada modulo como se pidieron",
    order.modulos.every(
      (modulo, index) =>
        modulo.moduloId === lines[index].moduloId &&
        modulo.colorEsqueleto.id === lines[index].colorEsqueletoId &&
        modulo.colorFrentes.id === lines[index].colorFrentesId &&
        modulo.colorCanto.id === lines[index].colorCantoId &&
        modulo.perfilCantoOrden === lines[index].perfilCantoOrden
    )
  );
  const definiciones = new Map();
  for (const line of lines) if (!definiciones.has(line.moduloId)) definiciones.set(line.moduloId, (await call("GET", `/modulos/${line.moduloId}`)).data);
  const sinExtras = ({ imagen: _i, tienePedidos: _t, estadoFormulas: _e, errores: _r, ...rest }) => rest;
  check(
    "la copia de la definicion es la de su modulo, completa y sin imagen ni tienePedidos",
    order.modulos.every(
      (modulo, index) =>
        modulo.definicionSnapshot.id === lines[index].moduloId &&
        !("imagen" in modulo.definicionSnapshot) &&
        !("tienePedidos" in modulo.definicionSnapshot) &&
        same(modulo.definicionSnapshot, sinExtras(definiciones.get(lines[index].moduloId)))
    )
  );

  // m² por material (R3): la suma exacta de las piezas, en mm² enteros.
  const mm2 = new Map();
  for (const row of order.detalles) mm2.set(row.materialId, (mm2.get(row.materialId) ?? 0) + row.largo * row.ancho * row.cantidad);
  check(
    "m² por material: la suma exacta de las piezas",
    order.estimacionDetalle.porMaterial.every((item) => Number.isInteger(item.mm2) && item.mm2 === mm2.get(item.materialId)) && order.estimacionDetalle.porMaterial.length === mm2.size,
    order.estimacionDetalle.porMaterial.map((item) => `${(item.mm2 / 1e6).toFixed(2)} m²`).join(", ")
  );

  // Datos de la solicitud
  check("tipo, estado y numero", order.tipo === "MODULOS" && order.estado === "PENDIENTE" && order.numero > Number(psql(`select max(numero) from pedidos where id <> '${order.id}'`)));
  check("fecha de entrega como AAAA-MM-DD, sin correrse de dia", order.fechaEntrega === datos().fechaEntrega, order.fechaEntrega);
  check("datos del cliente", order.cliente === datos().cliente && order.emailContacto === datos().emailContacto && order.direccionEntrega === datos().direccionEntrega && order.observaciones === datos().observaciones);
  check("historial CREAR_PEDIDO_MODULOS", order.historial.length === 1 && order.historial[0].accion === "CREAR_PEDIDO_MODULOS");
  check(
    "en la base: modulos y filas guardados",
    psql(`select count(*) from pedidos_modulo where "pedidoId" = '${order.id}'`) === String(lines.length) &&
      psql(`select count(*) from detalle_pedidos where "pedidoId" = '${order.id}' and "pedidoModuloId" is not null and origen is not null`) === String(order.detalles.length)
  );
  const detalle = await call("GET", `/pedidos-modulos/${order.id}`);
  check("GET /pedidos-modulos/:id devuelve lo mismo que el alta", detalle.status === 200 && JSON.stringify(detalle.data) === JSON.stringify(order));

  // ---------------------------------------------------------------- listado: busquedas, filtros y orden
  // B: mas nueva y con la entrega mas lejana. C: la entrega mas cercana, pero entregada.
  const b = await crear({ ...datos({ cliente: `${PREFIJO} beta`, numeroContacto: "111111", observaciones: "Placard de prueba", fechaEntrega: enDias(30) }), modulos: [placardLine] });
  const c = await crear({ ...datos({ cliente: `${PREFIJO} gamma`, numeroContacto: "222222", observaciones: "Vestidor", fechaEntrega: enDias(5) }), modulos: [placardLine] });
  check("altas de las solicitudes B y C", b.status === 201 && c.status === 201, `${b.status} ${c.status}`);
  const entregada = await call("PATCH", `/orders/${c.data.id}/status`, { estado: "ENTREGADA" });
  check("C pasa a ENTREGADA", entregada.status === 200, `${entregada.status} ${entregada.data?.message ?? ""}`);
  const nuestras = new Map([
    [order.id, "A"],
    [b.data.id, "B"],
    [c.data.id, "C"]
  ]);
  const listar = async (query = "") => {
    const result = await call("GET", `/pedidos-modulos${query ? `?${query}` : ""}`);
    return { status: result.status, letras: (result.data ?? []).filter((item) => nuestras.has(item.id)).map((item) => nuestras.get(item.id)).join(""), data: result.data };
  };
  const todas = await listar();
  check("orden: por fecha de entrega y las entregadas al final (no por la mas nueva)", todas.letras === "ABC", todas.letras);
  const filaA = todas.data.find((item) => item.id === order.id);
  check(
    "listado: numero, cantidad de modulos, fecha y total",
    filaA && filaA.numero === order.numero && filaA.cantidadModulos === lines.length && filaA.fechaEntrega === datos().fechaEntrega && filaA.presupuestoConHerrajes === order.presupuestoConHerrajes
  );
  for (const [label, query, esperado] of [
    ["numero M-", `search=M-${order.numero}`, "A"],
    ["numero", `search=${b.data.numero}`, "B"],
    ["telefono", "search=111111", "B"],
    ["cliente", "search=GAMMA", "C"],
    ["referencia", "search=cocina%20de%20prueba", "A"],
    ["texto que no existe", "search=zz-no-existe-zz", ""],
    ["numero que no existe", "search=M-999999999", ""],
    ["estado ENTREGADA", "estado=ENTREGADA", "C"],
    ["estado PENDIENTE", "estado=PENDIENTE", "AB"],
    ["entrega exacta", `entregaDesde=${datos().fechaEntrega}&entregaHasta=${datos().fechaEntrega}`, "A"],
    ["entrega hasta", `entregaHasta=${enDias(14)}`, "C"],
    ["entrega desde", `entregaDesde=${enDias(16)}`, "B"]
  ]) {
    const result = await listar(query);
    check(`busqueda por ${label}`, result.status === 200 && result.letras === esperado, `${result.letras || "ninguna"}`);
  }
  check("filtro mal formado: 400", (await call("GET", "/pedidos-modulos?entregaDesde=ayer")).status === 400);
  const corte = (await call("GET", "/orders")).data;
  check("GET /orders no muestra las solicitudes de modulos", !corte.some((item) => nuestras.has(item.id)));
  check("GET /pedidos-modulos/:id de un pedido de corte: 404", (await call("GET", `/pedidos-modulos/${corte[0]?.id}`)).status === 404);

  // ---------------------------------------------------------------- stock, como en corte
  const porMaterial = order.estimacionDetalle.porMaterial;
  const ids = porMaterial.map((item) => item.materialId);
  const inicial = stockDe(ids);
  const enProceso = await call("PATCH", `/orders/${order.id}/status`, { estado: "EN_PROCESO" });
  const tomado = stockDe(ids);
  check(
    "pasar a EN_PROCESO descuenta exactamente las placas de la constancia",
    enProceso.status === 200 && porMaterial.every((item) => tomado.get(item.materialId) === inicial.get(item.materialId) - item.placas),
    porMaterial.map((item) => `${inicial.get(item.materialId)}->${tomado.get(item.materialId)}`).join(", ")
  );
  check("filtro por estado EN_PROCESO", (await listar("estado=EN_PROCESO")).letras === "A");
  const fila0 = order.detalles[0];
  const comoCorte = await call("PUT", `/orders/${order.id}`, { cliente: "x", numeroContacto: "000000", detalles: [{ materialId: fila0.materialId, largo: fila0.largo, ancho: fila0.ancho, cantidad: 1 }] });
  check("PUT de corte sobre una solicitud de modulos: 400 ORDER_IS_MODULES", comoCorte.status === 400 && comoCorte.data?.code === "ORDER_IS_MODULES", `${comoCorte.status} ${comoCorte.data?.code}`);
  const vuelta = await call("PATCH", `/orders/${order.id}/status`, { estado: "PENDIENTE" });
  check("volver a PENDIENTE devuelve exactamente lo descontado", vuelta.status === 200 && porMaterial.every((item) => stockDe(ids).get(item.materialId) === inicial.get(item.materialId)));

  // Carrera entre borrar y cambiar de estado: nunca se pierden ni se duplican placas.
  const antesCarrera = stockDe(usados);
  const resultados = [];
  for (let vez = 0; vez < 6; vez += 1) {
    const d = await crear({ ...datos({ cliente: `${PREFIJO} carrera` }), modulos: [placardLine] });
    if (d.status !== 201) continue;
    const [patch, del] = await Promise.all([call("PATCH", `/orders/${d.data.id}/status`, { estado: "EN_PROCESO" }), call("DELETE", `/orders/${d.data.id}`)]);
    resultados.push(`${patch.status}/${del.status}`);
    if (del.status !== 204) {
      const again = await call("DELETE", `/orders/${d.data.id}`);
      if (again.status !== 204) resultados.push(`borrado final ${again.status}`);
    }
  }
  const despuesCarrera = stockDe(usados);
  check(
    "carrera entre borrar y cambiar de estado: el stock queda exacto",
    resultados.length === 6 && usados.every((id) => despuesCarrera.get(id) === antesCarrera.get(id)) && resultados.every((item) => /^(200|404|409)\/(204|404|409)$/.test(item)),
    resultados.join(" ")
  );

  // La misma carrera, sin depender de la suerte: se lee el pedido, se cambia el estado por la API y recien ahi se
  // intenta borrar con la lectura vieja. Tiene que responder 409 sin tocar el stock, en las dos direcciones
  // (antes: si el cambio tomaba stock, se perdia; si lo devolvia, se devolvia dos veces).
  // Cada caso con un modulo distinto: asi una placa perdida en uno no se compensa con una devuelta de mas en el otro.
  const carrera = async (estadoInicial, estadoNuevo, linea) => {
    const e = await crear({ ...datos({ cliente: `${PREFIJO} carrera fija` }), modulos: [linea] });
    if (estadoInicial !== "PENDIENTE") await call("PATCH", `/orders/${e.data.id}/status`, { estado: estadoInicial });
    const dir = mkdtempSync(join(tmpdir(), "f43-"));
    const script = join(dir, "carrera.mts");
    const backend = (path) => new URL(`../../../backend/src/${path}`, import.meta.url).href;
    writeFileSync(
      script,
      `import { prisma } from ${JSON.stringify(backend("config/prisma.ts"))};
import { deleteOrderReturningStock } from ${JSON.stringify(backend("modules/orders/order-stock.service.ts"))};
const stock = async () => Object.fromEntries((await prisma.material.findMany({ where: { id: { in: ${JSON.stringify(usados)} } } })).map((m) => [m.id, m.stockPlacas]));
const vieja = await prisma.pedido.findUniqueOrThrow({ where: { id: ${JSON.stringify(e.data.id)} }, include: { detalles: true } });
const response = await fetch(${JSON.stringify(`${BASE}/orders/${e.data.id}/status`)}, { method: "PATCH", headers: { Authorization: "Bearer " + process.env.TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ estado: ${JSON.stringify(estadoNuevo)} }) });
const despuesDelCambio = await stock();
let code = "BORRADO";
try { await deleteOrderReturningStock(prisma, vieja); } catch (error) { code = error.code ?? error.message; }
console.log(JSON.stringify({ patch: response.status, code, existe: Boolean(await prisma.pedido.findUnique({ where: { id: vieja.id } })), despuesDelCambio, despuesDelBorrado: await stock() }));
await prisma.$disconnect();
`
    );
    const output = execFileSync(join(backendDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx"), [script], {
      cwd: backendDir,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...process.env, TOKEN: admin, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://carpinteria:analisis_local@127.0.0.1:55432/carpinteria", JWT_SECRET: SECRET }
    });
    const result = JSON.parse(output.trim().split("\n").pop());
    check(
      `borrar con una lectura vieja (${estadoInicial} -> ${estadoNuevo} en el medio): 409 y el stock no se toca`,
      result.patch === 200 && result.code === "ORDER_CHANGED" && result.existe && same(result.despuesDelBorrado, result.despuesDelCambio),
      `${result.patch} ${result.code}`
    );
  };
  await carrera("PENDIENTE", "EN_PROCESO", placardLine);
  await carrera("EN_PROCESO", "PENDIENTE", lines[1]);

  // ---------------------------------------------------------------- errores
  const intento = async (label, body, status, test = () => true) => {
    const before = psql("select count(*) from pedidos");
    const response = await crear(body);
    const sinCambios = status >= 400 ? psql("select count(*) from pedidos") === before : true;
    check(label, response.status === status && test(response.data) && sinCambios, `${response.status} ${String(response.data?.message ?? "").slice(0, 120)}`);
  };
  const texto = (data) => JSON.stringify(data);
  await intento("fecha de entrega anterior a hoy: 400", { ...datos({ fechaEntrega: enDias(-1) }), modulos: lines }, 400, (data) => texto(data).includes("no puede ser anterior a hoy"));
  await intento("hoy si se puede", { ...datos({ fechaEntrega: hoy }), modulos: [placardLine] }, 201);
  await intento("email invalido: 400", { ...datos({ emailContacto: "no-es-un-email" }), modulos: lines }, 400, (data) => texto(data).includes("El email no es valido"));
  await intento("cliente demasiado corto: 400", { ...datos({ cliente: "A" }), modulos: lines }, 400, (data) => texto(data).includes("al menos 2"));
  await intento("un campo desconocido: 400", { ...datos(), fechaEntraga: enDias(3), modulos: lines }, 400, (data) => texto(data).includes("no se reconocen"));
  await intento(
    "el modulo cambio desde la vista previa: 409 y no se crea nada",
    { ...datos(), modulos: conVersion.map((line, index) => (index === 1 ? { ...line, version: line.version + 1000 } : line)) },
    409,
    (data) => data.code === "MODULE_CHANGED" && data.details.modulos[0].posicion === 2
  );
  await intento("sin modulos: 400", { ...datos(), modulos: [] }, 400);
  const prohibido = await call("POST", "/pedidos-modulos", { ...datos(), modulos: lines }, carpintero);
  check("un carpintero no accede (403)", prohibido.status === 403 && (await call("GET", "/pedidos-modulos", undefined, carpintero)).status === 403);
} catch (error) {
  check(`la prueba se corto: ${error.message}`, false);
} finally {
  // Cada paso por separado: si uno falla, los demas igual corren.
  const paso = (label, action) => {
    try {
      action();
    } catch (error) {
      check(`limpieza: ${label}`, false, error.message);
    }
  };
  for (const id of creados) {
    const removed = await call("DELETE", `/orders/${id}`).catch((error) => ({ status: error.message }));
    if (removed.status !== 204 && removed.status !== 404) check(`limpieza: borrar ${String(id).slice(0, 8)}`, false, String(removed.status));
  }
  paso("stock devuelto", () => {
    // Con todo borrado, el stock tiene que volver exacto a lo que se puso al empezar (500).
    const final = stockDe(usados);
    check("al borrar todo, el stock vuelve exacto", usados.every((id) => final.get(id) === 500), usados.map((id) => final.get(id)).join(", "));
  });
  paso("stock original", () => {
    for (const [id, stock] of stockAntes) psql(`update materiales set "stockPlacas" = ${stock} where id = '${id}'`);
  });
  paso("configuracion", () => psql(`update configuracion_modulos set "materialFondoId" = ${fondoAntes === "null" ? "null" : `'${fondoAntes}'`} where id = 'default'`));
  paso("verificacion final", () => {
    check("solicitudes de prueba borradas (con sus modulos y filas)", psql("select count(*) from pedidos") === pedidosAntes && psql("select count(*) from pedidos_modulo") === modulosPedidosAntes);
    check(
      "stock y configuracion como estaban",
      [...stockAntes].every(([id, stock]) => psql(`select coalesce("stockPlacas"::text, 'null') from materiales where id = '${id}'`) === stock) &&
        psql(`select coalesce("materialFondoId", 'null') from configuracion_modulos where id = 'default'`) === fondoAntes
    );
  });
}

console.log(failures ? `\n${failures} con problemas` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
