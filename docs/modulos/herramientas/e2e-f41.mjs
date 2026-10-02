// Prueba de F4.1: las solicitudes de corte dan exactamente lo mismo antes y despues del cambio.
//
// Compara, pedido por pedido de la copia del backup, las respuestas de dos backends conectados a la misma base:
//   ANTES   (puerto 4101): el codigo anterior a F4.1, por ejemplo un `git worktree` del commit previo;
//   DESPUES (puerto 4100): el codigo actual.
// Ademas prueba lo nuevo: el listado no muestra pedidos de modulos, un PUT sobre uno responde 400 y
// normalizeDetails pasa sin tocar los campos de modulos y rechaza medidas que no son enteras.
//
// No imprime datos de clientes: solo ids cortos y cantidades.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = fileURLToPath(new URL("../../../backend/", import.meta.url));
const require = createRequire(join(backendDir, "package.json"));
const jwt = require("jsonwebtoken");

const AFTER = process.env.BASE_DESPUES ?? "http://127.0.0.1:4100/api";
const BEFORE = process.env.BASE_ANTES ?? "http://127.0.0.1:4101/api";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://carpinteria:analisis_local@127.0.0.1:55432/carpinteria";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-c", sql], { encoding: "utf8" }).trim();
const adminId = psql("select id from usuarios where rol='ADMIN' limit 1");
const token = jwt.sign({ id: adminId, email: "prueba@local", rol: "ADMIN" }, "prueba-local-analisis-0123456789", { expiresIn: "1h" });

const call = async (base, method, path, body) => {
  const response = await fetch(base + path, {
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
const short = (id) => String(id).slice(0, 8);

async function waitFor(base) {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await call(base, "GET", "/stats")).status === 200) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

// Campos que cambian en cada alta o vista previa (ids, fechas, numero) y no dicen nada del calculo.
const VOLATILE = new Set(["id", "pedidoId", "numero", "fechaCreacion", "fechaActualizacion"]);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !VOLATILE.has(key)).map(([key, inner]) => [key, stable(inner)]));
  }
  return value;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Las filas como las manda el formulario de corte.
const payloadOf = (order, cliente = order.cliente) => ({
  cliente,
  numeroContacto: order.numeroContacto && order.numeroContacto.length >= 6 ? order.numeroContacto : "000000",
  observaciones: order.observaciones,
  detalles: order.detalles.map((row) => ({
    materialId: row.materialId,
    codigoBarra: row.codigoBarra,
    material: row.material,
    largo: row.largo,
    ancho: row.ancho,
    cantidad: row.cantidad,
    cantoLargo1Id: row.cantoLargo1Id,
    cantoLargo1Nombre: row.cantoLargo1Nombre,
    cantoLargo1: row.cantoLargo1,
    cantoLargo2Id: row.cantoLargo2Id,
    cantoLargo2Nombre: row.cantoLargo2Nombre,
    cantoLargo2: row.cantoLargo2,
    cantoAncho1Id: row.cantoAncho1Id,
    cantoAncho1Nombre: row.cantoAncho1Nombre,
    cantoAncho1: row.cantoAncho1,
    cantoAncho2Id: row.cantoAncho2Id,
    cantoAncho2Nombre: row.cantoAncho2Nombre,
    cantoAncho2: row.cantoAncho2,
    permiteRotar: row.permiteRotar,
    codigoBarraCentro: row.codigoBarraCentro,
    remark: row.remark,
    numeroCliente: row.numeroCliente,
    nombreCliente: row.nombreCliente,
    nombreProducto: row.nombreProducto
  }))
});

if (!(await waitFor(AFTER))) throw new Error(`No responde el backend nuevo en ${AFTER}`);
const hasBefore = await waitFor(BEFORE);
if (!hasBefore) console.log(`aviso: no responde el backend anterior en ${BEFORE}; se prueba solo lo nuevo`);

// ---------------------------------------------------------------- antes y despues, pedido por pedido
if (hasBefore) {
  for (const path of ["/orders", "/orders?estado=PENDIENTE", "/orders?search=blanco", "/stats"]) {
    const [before, after] = await Promise.all([call(BEFORE, "GET", path), call(AFTER, "GET", path)]);
    check(`GET ${path} igual`, before.status === after.status && same(before.data, after.data), `${Array.isArray(after.data) ? after.data.length + " pedidos" : after.status}`);
  }

  const orders = (await call(AFTER, "GET", "/orders")).data;
  let previews = 0;
  let diffs = 0;
  for (const summary of orders) {
    const [before, after] = await Promise.all([call(BEFORE, "GET", `/orders/${summary.id}`), call(AFTER, "GET", `/orders/${summary.id}`)]);
    const [matBefore, matAfter] = await Promise.all([call(BEFORE, "GET", `/orders/${summary.id}/materiales`), call(AFTER, "GET", `/orders/${summary.id}/materiales`)]);
    const payload = payloadOf(after.data);
    const [prevBefore, prevAfter] = await Promise.all([call(BEFORE, "POST", "/orders/preview", payload), call(AFTER, "POST", "/orders/preview", payload)]);
    const ok =
      same(before.data, after.data) && same(matBefore.data, matAfter.data) && prevBefore.status === prevAfter.status && same(stable(prevBefore.data), stable(prevAfter.data));
    if (prevAfter.status === 200) previews++;
    if (!ok) {
      diffs++;
      console.log(`MAL pedido ${short(summary.id)}: detalle ${same(before.data, after.data)}, materiales ${same(matBefore.data, matAfter.data)}, vista previa ${prevBefore.status}/${prevAfter.status} ${same(stable(prevBefore.data), stable(prevAfter.data))}`);
    }
  }
  check(`${orders.length} pedidos: detalle, listado de materiales y vista previa iguales`, diffs === 0, `${previews} vistas previas calculadas, ${diffs} con diferencias`);
  if (diffs) failures++;

  // Alta y edicion: las mismas filas dan el mismo pedido en los dos backends.
  const sources = orders.filter((order) => order.estado === "PENDIENTE" || order.estado === "RECHAZADA").slice(0, 3);
  for (const source of sources) {
    const full = (await call(AFTER, "GET", `/orders/${source.id}`)).data;
    const payload = payloadOf(full, "Prueba F4.1");
    const [createdBefore, createdAfter] = await Promise.all([call(BEFORE, "POST", "/orders", payload), call(AFTER, "POST", "/orders", payload)]);
    if (createdBefore.status !== 201 || createdAfter.status !== 201) {
      check(`alta desde ${short(source.id)}`, createdBefore.status === createdAfter.status, `${createdBefore.status}/${createdAfter.status} ${createdAfter.data?.message ?? ""}`);
      continue;
    }
    check(`alta desde ${short(source.id)} igual`, same(stable(createdBefore.data), stable(createdAfter.data)), `${createdAfter.data.detalles.length} filas, ${createdAfter.data.placasEstimadas} placas`);
    const edit = { ...payload, cliente: "Prueba F4.1 editada", detalles: [...payload.detalles].reverse() };
    const [editedBefore, editedAfter] = await Promise.all([call(BEFORE, "PUT", `/orders/${createdBefore.data.id}`, edit), call(AFTER, "PUT", `/orders/${createdAfter.data.id}`, edit)]);
    check(`edicion de ${short(source.id)} igual`, editedBefore.status === 200 && editedAfter.status === 200 && same(stable(editedBefore.data), stable(editedAfter.data)), `${editedBefore.status}/${editedAfter.status}`);
    await Promise.all([call(BEFORE, "DELETE", `/orders/${createdBefore.data.id}`), call(AFTER, "DELETE", `/orders/${createdAfter.data.id}`)]);
  }
}

// ---------------------------------------------------------------- lo nuevo: pedidos de modulos
const anyOrder = (await call(AFTER, "GET", "/orders")).data.find((order) => order.estado === "PENDIENTE");
const full = (await call(AFTER, "GET", `/orders/${anyOrder.id}`)).data;
const created = await call(AFTER, "POST", "/orders", payloadOf(full, "Prueba F4.1 modulos"));
check("alta de un pedido de prueba", created.status === 201, `${created.status}`);
const moduleOrderId = created.data.id;
psql(`update pedidos set tipo = 'MODULOS' where id = '${moduleOrderId}'`);
try {
  const list = (await call(AFTER, "GET", "/orders")).data;
  check("el listado no muestra pedidos de modulos", !list.some((order) => order.id === moduleOrderId));
  const onlyModules = (await call(AFTER, "GET", "/orders?tipo=MODULOS")).data;
  check("con ?tipo=MODULOS aparece", onlyModules.length >= 1 && onlyModules.every((order) => order.tipo === "MODULOS"), `${onlyModules.length}`);
  const detail = await call(AFTER, "GET", `/orders/${moduleOrderId}`);
  check("GET /orders/:id de un pedido de modulos responde", detail.status === 200 && detail.data.tipo === "MODULOS");
  const put = await call(AFTER, "PUT", `/orders/${moduleOrderId}`, payloadOf(full, "Prueba F4.1 modulos"));
  check("PUT sobre un pedido de modulos responde 400", put.status === 400 && put.data?.code === "ORDER_IS_MODULES", put.data?.message);
  const materials = await call(AFTER, "GET", `/orders/${moduleOrderId}/materiales`);
  check("el listado de materiales funciona para los dos tipos", materials.status === 200, `${materials.data?.totalPlacas} placas`);
} finally {
  const removed = await call(AFTER, "DELETE", `/orders/${moduleOrderId}`);
  check("pedido de prueba borrado", removed.status === 204);
}

// ---------------------------------------------------------------- normalizeDetails, directo
const dir = mkdtempSync(join(tmpdir(), "f41-"));
const script = join(dir, "normalizar.mts");
const service = new URL("../../../backend/src/modules/orders/order-details.service.ts", import.meta.url).href;
const row = full.detalles[0];
writeFileSync(
  script,
  `import { normalizeDetails } from ${JSON.stringify(service)};
const base = ${JSON.stringify({ materialId: row.materialId, largo: row.largo, ancho: row.ancho, cantidad: row.cantidad, permiteRotar: false, cantoLargo1: false, cantoLargo2: false, cantoAncho1: false, cantoAncho2: false })};
const out: Record<string, unknown> = {};
const [corte] = await normalizeDetails([base as any], "Cliente", "000000");
out.corte = corte;
const [modulo] = await normalizeDetails([{ ...base, pedidoModuloId: null, piezaCodigo: "LATERAL", origen: "CALCULADO", orden: 3, indice: 7 } as any], "Cliente", "000000");
out.modulo = modulo;
try { await normalizeDetails([{ ...base, largo: 412.5 } as any], "Cliente", "000000"); out.decimal = "acepto"; } catch (error: any) { out.decimal = error.details?.code ?? error.code ?? error.message; }
console.log(JSON.stringify(out));
process.exit(0);
`
);
const result = JSON.parse(
  execFileSync("npx", ["tsx", script], { cwd: backendDir, encoding: "utf8", shell: true, env: { ...process.env, DATABASE_URL, JWT_SECRET: "prueba-local-analisis-0123456789" } })
    .trim()
    .split("\n")
    .pop()
);
check("corte: sin campos de modulos e indice por posicion", !("pedidoModuloId" in result.corte) && !("origen" in result.corte) && result.corte.indice === 0);
check(
  "modulos: pedidoModuloId, piezaCodigo, origen, orden e indice pasan sin tocar",
  result.modulo.pedidoModuloId === null && result.modulo.piezaCodigo === "LATERAL" && result.modulo.origen === "CALCULADO" && result.modulo.orden === 3 && result.modulo.indice === 7
);
check("una medida con decimales se rechaza (R8)", result.decimal === "DETAIL_NOT_INTEGER", result.decimal);

console.log(failures ? `\n${failures} con problemas` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
