// Prueba de F5.5: el checklist de no regresión (spec §15) y la integración por la API (spec §17.2), contra el backend
// local (puerto 4100) y la copia del backup con el catálogo importado.
// §15:
// - GET /api/orders trae solo corte por defecto (admin y carpintero); ?tipo=MODULOS a un carpintero no le muestra nada ajeno.
// - POST /api/orders crea CORTE; PUT /api/orders/:id sobre una de módulos da 400 ORDER_IS_MODULES.
// - GET /api/orders/:id sobre una de módulos responde (el frontend la lleva a /modulos/:id: e2e-f51).
// - Dashboard: los totales incluyen los dos tipos, byTipo y byStatus[].modulos cuentan los de módulos, y la demanda de
//   placas de una de módulos pendiente entra en las alertas de stock.
// - El alta de módulos no llama a las notificaciones (push ni WhatsApp): se revisa el código.
// - Un carpintero recibe 403 en todas las rutas nuevas.
// - Exportar todas las de corte da el mismo Excel que el backend de antes de F5.3 (con BASE_ANTES), archivo por
//   archivo dentro del .xlsx, salvo la fecha de creación (docProps/core.xml).
// §17.2:
// - Alta con 3 módulos: número, filas = suma de las piezas de la vista previa, presupuesto = el de corte con las
//   mismas filas (sin herrajes todavía) e historial CREAR_PEDIDO_MODULOS.
// - Editar en Pendiente; pasar a En proceso reserva el stock exacto; editar en En proceso da 403; volver a Pendiente lo
//   devuelve exacto.
// - Exportar: mismas columnas, Remark vacío (DECISIONES 20) y código de barra M{n}-PP-OO.
// Crea solicitudes "Prueba F5.5 ..." y las borra; pone stock en los materiales que usa y lo restaura. Deja la copia como
// estaba. No imprime datos de clientes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");

const BASE = process.env.BASE ?? "http://127.0.0.1:4100/api";
const BASE_ANTES = process.env.BASE_ANTES ?? "";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F5.5";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const adminId = psql("select id from usuarios where rol='ADMIN' limit 1");
const carpinteroId = psql("select id from usuarios where rol='CARPINTERO' limit 1");
const admin = jwt.sign({ id: adminId, email: "prueba@local", rol: "ADMIN" }, SECRET, { expiresIn: "2h" });
const carpintero = jwt.sign({ id: carpinteroId, email: "carp@local", rol: "CARPINTERO" }, SECRET, { expiresIn: "2h" });

const call = async (method, path, body, token = admin, base = BASE) => {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
};
let failures = 0;
let total = 0;
const check = (label, ok, extra = "") => {
  total++;
  console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures++;
};

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralas (DELETE /api/orders/:id) y revisá el stock.`);
  process.exit(1);
}
const contar = () =>
  psql(`select (select count(*) from pedidos) || '/' || (select count(*) from detalle_pedidos) || '/' || (select count(*) from historial_pedidos) || '/' || (select count(*) from pedidos_modulo) || '/' || (select md5(string_agg(id || coalesce("stockPlacas"::text, 'null'), ',' order by id)) from materiales)`);
const antes = contar();

const [colorA, colorB] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
  and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 2`).split("\n");
const fondo = psql(`select "materialFondoId" from configuracion_modulos where id = 'default'`);
const modulo = (codigo) => psql(`select id from modulos where codigo = '${codigo}'`);
const usados = [colorA, colorB, fondo];
const stockAntes = new Map(psql(`select id, coalesce("stockPlacas"::text, 'null') from materiales where id in (${usados.map((id) => `'${id}'`).join(",")})`).split("\n").map((row) => row.split("|")));
const stock = (id) => Number(psql(`select coalesce("stockPlacas", 0) from materiales where id = '${id}'`));
const fecha = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const lineas = [
  { moduloId: modulo("BAJO_MESADA_2_PUERTAS"), valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 },
  { moduloId: modulo("ALACENA_2_PUERTAS"), valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorA, perfilCantoOrden: 1 },
  { moduloId: modulo("BAJO_MESADA_2_PUERTAS"), valores: { ANCHO: 900 }, colorEsqueletoId: colorB, colorFrentesId: colorB, perfilCantoOrden: 2 }
];
check("datos de prueba", Boolean(colorA && colorB && fondo && lineas.every((linea) => linea.moduloId)));

const creadas = [];
try {
  // ================================================================ §17.2 alta con 3 módulos
  const preview = await call("POST", "/pedidos-modulos/preview", { cliente: `${PREFIJO} tres`, numeroContacto: "2664000000", modulos: lineas });
  const alta = await call("POST", "/pedidos-modulos", { cliente: `${PREFIJO} tres`, numeroContacto: "2664000000", fechaEntrega: fecha, modulos: lineas });
  check("alta: 201", alta.status === 201, String(alta.status));
  const o = alta.data;
  creadas.push(o.id);
  check("alta: número asignado y 3 módulos", Number.isInteger(o.numero) && o.numero > 0 && o.modulos.length === 3);
  const piezasPreview = preview.data.modulos.reduce((sum, item) => sum + item.piezas, 0);
  check("alta: filas = suma de las piezas de la vista previa", o.detalles.length === piezasPreview && piezasPreview > 0, `${o.detalles.length} de ${piezasPreview}`);
  const comoCorte = await call("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: o.detalles });
  const CAMPOS = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado"];
  check(
    "alta: presupuesto = el de corte con las mismas filas, más herrajes (0)",
    CAMPOS.every((campo) => comoCorte.data[campo] === o[campo]) && o.costoHerrajes === 0 && o.presupuestoConHerrajes === o.presupuestoEstimado,
    CAMPOS.filter((campo) => comoCorte.data[campo] !== o[campo]).join(",")
  );
  check("alta: historial CREAR_PEDIDO_MODULOS", o.historial.length === 1 && o.historial[0].accion === "CREAR_PEDIDO_MODULOS");

  // ================================================================ §15 listados, PUT de corte, detalle
  const listaAdmin = await call("GET", "/orders");
  check("§15 GET /api/orders (admin) no trae módulos", listaAdmin.status === 200 && !listaAdmin.data.some((p) => p.tipo === "MODULOS" || p.id === o.id));
  check("§15 GET /api/orders?tipo=MODULOS (admin) sí la trae", (await call("GET", "/orders?tipo=MODULOS")).data.some((p) => p.id === o.id));
  const listaCarp = await call("GET", "/orders", undefined, carpintero);
  check("§15 GET /api/orders (carpintero) no trae módulos", listaCarp.status === 200 && !listaCarp.data.some((p) => p.tipo === "MODULOS"));
  const carpModulos = await call("GET", "/orders?tipo=MODULOS", undefined, carpintero);
  check("§15 ?tipo=MODULOS a un carpintero no le muestra solicitudes ajenas", carpModulos.status === 200 && carpModulos.data.every((p) => p.usuarioId === carpinteroId));
  const putCorte = await call("PUT", `/orders/${o.id}`, { cliente: "x", numeroContacto: "000000", detalles: o.detalles });
  check("§15 PUT /api/orders/:id sobre módulos: 400 ORDER_IS_MODULES", putCorte.status === 400 && putCorte.data?.code === "ORDER_IS_MODULES" && /Solicitudes de módulos/.test(putCorte.data?.message ?? ""), putCorte.data?.message);
  const detalle = await call("GET", `/orders/${o.id}`);
  check("§15 GET /api/orders/:id sobre módulos responde", detalle.status === 200 && detalle.data.tipo === "MODULOS");
  const corte = await call("POST", "/orders", { cliente: `${PREFIJO} corte`, numeroContacto: "2664000000", detalles: [{ materialId: colorA, largo: 500, ancho: 400, cantidad: 2 }] });
  if (corte.data?.id) creadas.push(corte.data.id);
  check("§15 POST /api/orders crea CORTE", corte.status === 201 && corte.data.tipo === "CORTE", String(corte.status));

  // ================================================================ §15 dashboard
  const stats = (await call("GET", "/stats")).data;
  const porTipo = Object.fromEntries(psql(`select tipo, count(*) from pedidos group by tipo`).split("\n").map((row) => row.split("|")));
  const modulosPorEstado = Object.fromEntries(psql(`select estado, count(*) from pedidos where tipo = 'MODULOS' group by estado`).split("\n").filter(Boolean).map((row) => row.split("|")));
  check("§15 dashboard: el total incluye los dos tipos", stats.totalOrders === Number(porTipo.CORTE ?? 0) + Number(porTipo.MODULOS ?? 0), `${stats.totalOrders}`);
  check(
    "§15 dashboard: byTipo cuenta las de módulos",
    stats.byTipo.find((item) => item.tipo === "MODULOS")?.total === Number(porTipo.MODULOS) && stats.byTipo.find((item) => item.tipo === "CORTE")?.total === Number(porTipo.CORTE),
    JSON.stringify(stats.byTipo)
  );
  check(
    "§15 dashboard: cada estado dice cuántas son de módulos",
    stats.byStatus.every((item) => item.modulos === Number(modulosPorEstado[item.estado] ?? 0)) && stats.byStatus.reduce((sum, item) => sum + item.total, 0) === stats.totalOrders,
    JSON.stringify(stats.byStatus)
  );
  // Punto 8 (2026-10-09): las metricas de las solicitudes de modulos.
  const activasDb = Number(psql(`select count(*) from pedidos where tipo = 'MODULOS' and estado in ('PENDIENTE', 'EN_PROCESO', 'TERMINADA')`));
  const enCursoDb = Number(psql(`select coalesce(round(sum("presupuestoEstimado" + "costoHerrajes")::numeric, 2), 0) from pedidos where tipo = 'MODULOS' and estado in ('PENDIENTE', 'EN_PROCESO', 'TERMINADA')`));
  check(
    "punto 8: módulos en curso, su presupuesto, 6 meses y los más pedidos",
    stats.modulos &&
      stats.modulos.activas === activasDb &&
      Math.abs(stats.modulos.presupuestoActivo - enCursoDb) < 0.01 &&
      stats.modulos.meses.length === 6 &&
      stats.modulos.topModulos.length > 0 &&
      stats.modulos.proximas.length === Math.min(6, activasDb),
    `${stats.modulos?.activas} activas (${activasDb}), ${stats.modulos?.presupuestoActivo} (${enCursoDb})`
  );
  // La demanda de placas de una de módulos pendiente entra en las alertas: sin stock de colorA, la alerta suma sus placas.
  psql(`update materiales set "stockPlacas" = 0 where id = '${colorA}'`);
  const placasA = o.estimacionDetalle.porMaterial.find((item) => item.materialId === colorA)?.placas ?? 0;
  const alerta = (await call("GET", "/stats")).data.stockAlerts.find((item) => item.materialId === colorA);
  await call("DELETE", `/orders/${o.id}`).then(() => undefined); // se vuelve a crear abajo para el resto
  const sinElla = (await call("GET", "/stats")).data.stockAlerts.find((item) => item.materialId === colorA);
  creadas.splice(creadas.indexOf(o.id), 1);
  check(
    "§15 dashboard: las placas de la solicitud de módulos pendiente entran en la alerta de stock",
    placasA > 0 && alerta && alerta.placasPendientes - (sinElla?.placasPendientes ?? 0) === placasA && alerta.pedidosPendientes - (sinElla?.pedidosPendientes ?? 0) === 1,
    `${placasA} placas; ${alerta?.placasPendientes} con ella, ${sinElla?.placasPendientes ?? 0} sin ella`
  );

  // ================================================================ §17.2 editar, reservar y devolver stock
  for (const id of usados) psql(`update materiales set "stockPlacas" = 500 where id = '${id}'`);
  const otra = (await call("POST", "/pedidos-modulos", { cliente: `${PREFIJO} stock`, numeroContacto: "2664000000", fechaEntrega: fecha, modulos: lineas })).data;
  creadas.push(otra.id);
  const editada = await call("PUT", `/pedidos-modulos/${otra.id}`, { cliente: otra.cliente, numeroContacto: "2664111111", fechaEntrega: otra.fechaEntrega, fechaActualizacion: otra.fechaActualizacion, detalles: otra.detalles });
  check("§17.2 editar en Pendiente: 200", editada.status === 200 && editada.data.numeroContacto === "2664111111");
  const porMaterial = editada.data.estimacionDetalle.porMaterial;
  const stockPrevio = new Map(usados.map((id) => [id, stock(id)]));
  const enProceso = await call("PATCH", `/orders/${otra.id}/status`, { estado: "EN_PROCESO" });
  check(
    "§17.2 pasar a En proceso reserva el stock exacto",
    enProceso.status === 200 && enProceso.data.stockReservado === true && porMaterial.every((item) => stock(item.materialId) === stockPrevio.get(item.materialId) - item.placas),
    porMaterial.map((item) => `${item.placas}: ${stockPrevio.get(item.materialId)} -> ${stock(item.materialId)}`).join(", ")
  );
  const enProcesoData = (await call("GET", `/pedidos-modulos/${otra.id}`)).data;
  const bloqueada = await call("PUT", `/pedidos-modulos/${otra.id}`, { cliente: otra.cliente, numeroContacto: "2664222222", fechaEntrega: otra.fechaEntrega, fechaActualizacion: enProcesoData.fechaActualizacion, detalles: enProcesoData.detalles });
  check("§17.2 editar en En proceso: 403", bloqueada.status === 403, String(bloqueada.status));
  const vuelta = await call("PATCH", `/orders/${otra.id}/status`, { estado: "PENDIENTE" });
  check("§17.2 volver a Pendiente devuelve el stock exacto", vuelta.status === 200 && usados.every((id) => stock(id) === stockPrevio.get(id)));

  // ================================================================ §17.2 exportar
  const response = await fetch(`${BASE}/orders/export?ids=${otra.id}`, { headers: { Authorization: `Bearer ${admin}` } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const filas = [];
  workbook.getWorksheet("Pedidos").eachRow((row) => filas.push(Array.from({ length: 19 }, (_, index) => String(row.getCell(index + 1).value ?? ""))));
  const ENCABEZADO = ["codigo barra", "Material", "largo", "ancho", "cantidad", "", "", "", "", "canto largo 1", "canto largo 2", "canto ancho 1", "canto ancho 2", "permite rotar", "codigo barra centro p", "Remark", "numero cliente", "nombre cliente", "nombre producto"];
  check("§17.2 exportar: mismas columnas", JSON.stringify(filas[0]) === JSON.stringify(ENCABEZADO));
  check(
    "§17.2 exportar: código de barra M{n}-PP-OO y Remark vacío",
    filas.length - 1 === otra.detalles.length && filas.slice(1).every((fila) => new RegExp(`^M${otra.numero}-0[1-3]-\\d\\d$`).test(fila[0]) && fila[15] === "")
  );

  // ================================================================ §15 carpintero: 403 en todas las rutas nuevas
  const id = otra.id;
  const moduloId = lineas[0].moduloId;
  const rutas = [
    ["GET", "/pedidos-modulos"],
    ["POST", "/pedidos-modulos/preview"],
    ["POST", "/pedidos-modulos"],
    ["GET", `/pedidos-modulos/${id}`],
    ["PATCH", `/pedidos-modulos/${id}/fecha-entrega`],
    ["PUT", `/pedidos-modulos/${id}`],
    ["GET", "/modulos"],
    ["POST", "/modulos"],
    ["GET", `/modulos/${moduloId}`],
    ["PUT", `/modulos/${moduloId}`],
    ["PATCH", `/modulos/${moduloId}/active`],
    ["POST", `/modulos/${moduloId}/duplicar`],
    ["DELETE", `/modulos/${moduloId}`],
    ["GET", `/modulos/${moduloId}/imagen`],
    ["PUT", `/modulos/${moduloId}/imagen`],
    ["DELETE", `/modulos/${moduloId}/imagen`],
    ["GET", "/modulos/categorias"],
    ["POST", "/modulos/categorias"],
    ["PUT", "/modulos/categorias/x"],
    ["GET", "/modulos/configuracion"],
    ["PUT", "/modulos/configuracion"],
    ["POST", "/modulos/evaluar"],
    ["GET", "/stats"],
    ["GET", "/orders/export"]
  ];
  const noProhibidas = [];
  for (const [method, path] of rutas) {
    const r = await call(method, path, method === "GET" || method === "DELETE" ? undefined : {}, carpintero);
    if (r.status !== 403) noProhibidas.push(`${method} ${path} ${r.status}`);
  }
  check(`§15 carpintero: 403 en las ${rutas.length} rutas nuevas (y en stats y export)`, noProhibidas.length === 0, noProhibidas.join(", "));

  // ================================================================ §15 sin notificaciones al crear módulos
  const fuentes = ["module-orders.service.ts", "module-orders.routes.ts"].map((name) => readFileSync(new URL(`../../../backend/src/modules/module-orders/${name}`, import.meta.url), "utf8")).join("\n");
  check("§15 el alta de módulos no importa ni llama a push ni a WhatsApp", !/from "[^"]*(push-notifications|whatsapp)[^"]*"/i.test(fuentes) && !/\bsend\w*(Push|Whatsapp)\w*\(/.test(fuentes));

  // ================================================================ §15 Excel de corte igual que antes de F5.3
  if (BASE_ANTES) {
    const bajar = async (base) => JSZip.loadAsync(Buffer.from(await (await fetch(`${base}/orders/export?ids=${psql("select string_agg(id, ',' order by \"fechaCreacion\") from pedidos where tipo = 'CORTE' and cliente not like 'Prueba%'")}`, { headers: { Authorization: `Bearer ${admin}` } })).arrayBuffer()));
    const [ahora, antesF53] = await Promise.all([bajar(BASE), bajar(BASE_ANTES)]);
    const nombres = Object.keys(ahora.files).sort();
    const distintos = [];
    for (const name of nombres) {
      if (name === "docProps/core.xml") continue;
      const [a, b] = await Promise.all([ahora.file(name)?.async("string"), antesF53.file(name)?.async("string")]);
      if (a !== b) distintos.push(name);
    }
    check(
      "§15 exportar todas las de corte: el mismo .xlsx que antes de F5.3, salvo la fecha (docProps/core.xml)",
      JSON.stringify(nombres) === JSON.stringify(Object.keys(antesF53.files).sort()) && distintos.length === 0,
      distintos.join(", ") || `${nombres.length} archivos iguales`
    );
  } else {
    console.log("--  sin BASE_ANTES: no se compara el Excel con el backend de antes de F5.3");
  }
} catch (error) {
  check("la prueba terminó sin excepciones", false, error.message);
} finally {
  for (const id of creadas) {
    psql(`update pedidos set estado = 'PENDIENTE' where id = '${id}' and not "stockReservado"`);
    const removed = await call("DELETE", `/orders/${id}`);
    if (removed.status !== 204 && removed.status !== 200) console.log(`MAL no se pudo borrar una solicitud de prueba (${removed.status})`);
  }
  for (const [id, valor] of stockAntes) psql(`update materiales set "stockPlacas" = ${valor} where id = '${id}'`);
  check("la copia quedó como estaba (pedidos, filas, historial, módulos y stock)", contar() === antes);
  console.log(`\n${total - failures}/${total} ok`);
  process.exit(failures ? 1 : 0);
}
