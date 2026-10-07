// Prueba de F5.2 (API): edición de una solicitud de módulos (spec §10.3), contra el backend local (puerto 4100) y la
// copia del backup con el catálogo importado.
// - Sin cambios no escribe nada (ni historial ni fecha de actualización).
// - Con cambios: cada fila que sigue conserva su módulo, su código de pieza, su orden y su código de barra; la que cambió
//   pasa a EDITADO (una MANUAL sigue MANUAL); las nuevas son MANUAL, van al final de su grupo con el orden siguiente y el
//   código M{número}-{posición}-{orden} (las adicionales, posición 00); una copia con el mismo id cuenta como nueva. Las
//   filas quedan agrupadas por módulo (índice), con el cliente de la solicitud, y los módulos no cambian (spec §10.4).
// - El historial dice lo mismo que el resumen "Cambios detectados" (EDITAR_PEDIDO con el resumen).
// - Paridad (regla 1): placas y cada componente del presupuesto guardado son los de POST /api/orders/preview con las
//   mismas filas.
// - La fecha guardada puede haber pasado; una nueva no. Errores: 400 (fecha pasada, módulo de otra solicitud, datos mal
//   formados), 403 (en proceso, entregada, carpintero), 404 (corte, inexistente), 409 (stock descontado, versión vieja,
//   dos ediciones a la vez). El PUT de corte sigue rechazando una de módulos.
//
// Crea solicitudes "Prueba F5.2 ..." y las borra al final; los cambios de estado y de stock se hacen por SQL sobre esas
// solicitudes (sin tocar el stock de los materiales). Deja la copia como estaba. No imprime datos de clientes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const BASE = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F5.2";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const adminId = psql("select id from usuarios where rol='ADMIN' limit 1");
const admin = jwt.sign({ id: adminId, email: "prueba@local", rol: "ADMIN" }, SECRET, { expiresIn: "2h" });
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
let total = 0;
const check = (label, ok, extra = "") => {
  total++;
  console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures++;
};
const canonical = (value) =>
  Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const restos = psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`);
if (restos !== "0") {
  console.log(`MAL hay ${restos} solicitudes "${PREFIJO}..." de una corrida anterior que se cortó. Borralas (DELETE /api/orders/:id) y volvé a correr.`);
  process.exit(1);
}

const ymd = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const enDias = (dias) => ymd(new Date(Date.now() + dias * 86400000));

// ---------------------------------------------------------------- datos de la copia
const antes = {
  pedidos: psql("select count(*) from pedidos"),
  detalles: psql("select count(*) from detalle_pedidos"),
  historial: psql("select count(*) from historial_pedidos"),
  modulos: psql("select count(*) from pedidos_modulo"),
  stock: psql(`select md5(string_agg(id || coalesce("stockPlacas"::text, 'null'), ',' order by id)) from materiales`)
};
const [colorA, colorB] = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 0.45) < 1e-6)
  order by p.nombre limit 2`).split("\n");
const cantoOtro = psql(`select id from materiales where tipo = 'CANTO' and activo and "placaMaterialId" = '${colorB}' order by nombre, id limit 1`);
const modulosCat = new Map(psql(`select codigo, id from modulos where codigo in ('BAJO_MESADA_2_PUERTAS', 'ALACENA_2_PUERTAS')`).split("\n").map((row) => row.split("|")));
const bajo = modulosCat.get("BAJO_MESADA_2_PUERTAS");
const alacena = modulosCat.get("ALACENA_2_PUERTAS");
const corteId = psql("select id from pedidos where tipo = 'CORTE' order by \"fechaCreacion\" limit 1");
check("datos de prueba", Boolean(colorA && colorB && cantoOtro && bajo && alacena && corteId));

const creadas = [];
async function crear(sufijo, fechaEntrega = enDias(10)) {
  const response = await call("POST", "/pedidos-modulos", {
    cliente: `${PREFIJO} ${sufijo}`,
    numeroContacto: "2664000000",
    fechaEntrega,
    observaciones: "Cocina",
    modulos: [
      { moduloId: bajo, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 },
      { moduloId: alacena, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorA, perfilCantoOrden: 1 }
    ]
  });
  if (response.status !== 201) throw new Error(`no se pudo crear (${response.status}): ${JSON.stringify(response.data)}`);
  creadas.push(response.data.id);
  return response.data;
}
/** El cuerpo del PUT con lo que devolvió el GET (como lo arma el formulario). */
const cuerpo = (order, patch = {}) => ({
  cliente: order.cliente,
  numeroContacto: order.numeroContacto,
  emailContacto: order.emailContacto ?? "",
  direccionEntrega: order.direccionEntrega ?? "",
  fechaEntrega: order.fechaEntrega,
  observaciones: order.observaciones ?? "",
  fechaActualizacion: order.fechaActualizacion,
  detalles: order.detalles.map((detalle) => ({ ...detalle })),
  ...patch
});
const historial = (id) => psql(`select count(*) from historial_pedidos where "pedidoId" = '${id}'`);
const ESTIMADO = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado", "faltanteStock"];

try {
  // ---------------------------------------------------------------- sin cambios
  const original = await crear("principal");
  const n = original.numero;
  const [m1, m2] = original.modulos;
  const modulosAntes = psql(`select string_agg(id || valores::text || "colorEsqueletoId" || "colorFrentesId" || coalesce("materialFondoId", '') || "perfilCantoOrden", ',' order by posicion) from pedidos_modulo where "pedidoId" = '${original.id}'`);
  const sinCambios = await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(original));
  check("sin cambios: 200 y nada escrito", sinCambios.status === 200 && historial(original.id) === "1" && sinCambios.data.fechaActualizacion === original.fechaActualizacion, `${sinCambios.status} historial ${historial(original.id)}`);
  check("sin cambios: las mismas filas", same(sinCambios.data.detalles.map((d) => d.id), original.detalles.map((d) => d.id)));

  // ---------------------------------------------------------------- con cambios
  const filasM1 = original.detalles.filter((d) => d.pedidoModuloId === m1.id);
  const filasM2 = original.detalles.filter((d) => d.pedidoModuloId === m2.id);
  const [a, b, c] = filasM1;
  const borrada = filasM2[filasM2.length - 1];
  const nueva = (pedidoModuloId, nombreProducto) => ({
    materialId: colorA, material: "", codigoBarra: "XX", largo: 500, ancho: 300, cantidad: 1, permiteRotar: true, nombreProducto, pedidoModuloId,
    cantoLargo1: false, cantoLargo2: false, cantoAncho1: false, cantoAncho2: false
  });
  // Las filas como las deja el formulario: una adicional antes de todo (el servidor las agrupa), una cambiada de cantidad,
  // otra con un canto distinto, una copia de c (mismo id), una nueva en el módulo 1 y la última del módulo 2 borrada.
  const editadas = [
    nueva(null, "Tapa mesada extra"),
    { ...a, cantidad: a.cantidad + 1 },
    { ...b, cantoAncho2Id: cantoOtro, cantoAncho2: true },
    c,
    { ...c, nombreProducto: "Copia" },
    ...filasM1.slice(3),
    nueva(m1.id, "Estante extra"),
    ...filasM2.slice(0, -1)
  ];
  const nuevaFecha = enDias(12);
  const conCambios = await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(original, { numeroContacto: "2664111111", fechaEntrega: nuevaFecha, detalles: editadas }));
  check("con cambios: 200", conCambios.status === 200, `${conCambios.status} ${JSON.stringify(conCambios.data?.message ?? "")}`);
  const editada = conCambios.data;
  const ultimo = editada.historial[0];
  check(
    "historial: EDITAR_PEDIDO con el resumen",
    ultimo?.accion === "EDITAR_PEDIDO" && ultimo.valorNuevo === "2 piezas modificadas, 3 piezas agregadas y 1 pieza eliminada; cambió el teléfono y la fecha de entrega",
    ultimo?.valorNuevo
  );
  check("datos guardados", editada.numeroContacto === "2664111111" && editada.fechaEntrega === nuevaFecha && editada.cliente === original.cliente);
  check("los módulos no cambian (spec §10.4)", psql(`select string_agg(id || valores::text || "colorEsqueletoId" || "colorFrentesId" || coalesce("materialFondoId", '') || "perfilCantoOrden", ',' order by posicion) from pedidos_modulo where "pedidoId" = '${original.id}'`) === modulosAntes);

  const filas = editada.detalles;
  check("cantidad de filas", filas.length === original.detalles.length + 2, `${filas.length}`);
  check("indices 0..n-1 en orden", filas.every((d, index) => d.indice === index));
  const grupos = filas.map((d) => (d.pedidoModuloId === m1.id ? 1 : d.pedidoModuloId === m2.id ? 2 : 3));
  check("agrupadas: módulo 1, módulo 2 y adicionales al final", grupos.every((g, index) => index === 0 || grupos[index - 1] <= g), grupos.join(""));
  const guardadaDe = (fila) => filas.find((d) => d.piezaCodigo === fila.piezaCodigo && d.pedidoModuloId === fila.pedidoModuloId && d.orden === fila.orden);
  const a2 = guardadaDe(a);
  const b2 = guardadaDe(b);
  const c2 = guardadaDe(c);
  check("fila cambiada: EDITADO, mismo código de pieza, orden y código de barra", a2?.origen === "EDITADO" && a2.cantidad === a.cantidad + 1 && a2.codigoBarra === a.codigoBarra);
  check("canto cambiado: EDITADO", b2?.origen === "EDITADO" && b2.cantoAncho2Id === cantoOtro && b2.cantoAncho2 === true);
  check("fila sin cambios: sigue CALCULADO", c2?.origen === "CALCULADO" && c2.codigoBarra === c.codigoBarra);
  check("la fila borrada no está", !filas.some((d) => d.piezaCodigo === borrada.piezaCodigo && d.pedidoModuloId === m2.id && d.orden === borrada.orden));
  const manuales = filas.filter((d) => d.origen === "MANUAL");
  const maxM1 = Math.max(...filasM1.map((d) => d.orden));
  const copia = manuales.find((d) => d.nombreProducto === "Copia");
  const estante = manuales.find((d) => d.nombreProducto === "Estante extra");
  const tapa = manuales.find((d) => d.nombreProducto === "Tapa mesada extra");
  check("tres nuevas MANUAL sin código de pieza", manuales.length === 3 && manuales.every((d) => d.piezaCodigo === null));
  const pad = (value) => String(value).padStart(2, "0");
  check(
    "nuevas del módulo 1: orden siguiente y código M{n}-01-{orden}",
    copia?.pedidoModuloId === m1.id && copia.orden === maxM1 + 1 && copia.codigoBarra === `M${n}-01-${pad(maxM1 + 1)}` && estante?.orden === maxM1 + 2 && estante.codigoBarra === `M${n}-01-${pad(maxM1 + 2)}`,
    `${copia?.codigoBarra} ${estante?.codigoBarra}`
  );
  check("adicional: sin módulo, orden 1, código M{n}-00-01, la última", tapa?.pedidoModuloId === null && tapa.orden === 1 && tapa.codigoBarra === `M${n}-00-01` && filas[filas.length - 1] === tapa, tapa?.codigoBarra);
  check("todas las filas con el cliente de la solicitud", filas.every((d) => d.nombreCliente === original.cliente && d.numeroCliente === "2664111111"));
  check("ids nuevos para todas las filas (se reemplazan)", filas.every((d) => !original.detalles.some((o) => o.id === d.id)));

  // ---------------------------------------------------------------- paridad (regla 1)
  const preview = await call("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: filas });
  check(
    "paridad: el presupuesto guardado es el de corte con las mismas filas",
    preview.status === 200 && ESTIMADO.every((campo) => same(preview.data[campo], editada[campo])) && same(preview.data.estimacionDetalle, editada.estimacionDetalle),
    ESTIMADO.filter((campo) => !same(preview.data?.[campo], editada[campo])).join(",")
  );
  check("total con herrajes = presupuesto (sin herrajes todavía)", editada.presupuestoConHerrajes === editada.presupuestoEstimado && editada.costoHerrajes === 0);
  const ordenGuardado = psql(`select string_agg(coalesce(origen::text, '') || ':' || "codigoBarra", ',' order by indice) from detalle_pedidos where "pedidoId" = '${original.id}'`);
  check("la base tiene lo que devuelve la API", ordenGuardado === filas.map((d) => `${d.origen}:${d.codigoBarra}`).join(","));

  // ---------------------------------------------------------------- una editada sigue EDITADO; una MANUAL sigue MANUAL
  const vuelta = await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(editada, {
    detalles: editada.detalles.map((d) => (d.id === a2.id ? { ...d, cantidad: a.cantidad } : d.id === tapa.id ? { ...d, cantidad: 2 } : d))
  }));
  const a3 = vuelta.data?.detalles.find((d) => d.codigoBarra === a.codigoBarra);
  const tapa3 = vuelta.data?.detalles.find((d) => d.codigoBarra === tapa.codigoBarra);
  check("volver al valor calculado deja EDITADO; la MANUAL sigue MANUAL", vuelta.status === 200 && a3?.origen === "EDITADO" && tapa3?.origen === "MANUAL" && tapa3.cantidad === 2);
  check("historial: 2 piezas modificadas", vuelta.data?.historial[0]?.valorNuevo === "2 piezas modificadas", vuelta.data?.historial[0]?.valorNuevo);
  let actual = vuelta.data;

  // ---------------------------------------------------------------- fechas
  const pasada = await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(actual, { fechaEntrega: enDias(-1) }));
  check("una fecha nueva pasada: 400 DELIVERY_DATE_PAST", pasada.status === 400 && pasada.data?.code === "DELIVERY_DATE_PAST");
  psql(`update pedidos set "fechaEntrega" = '${enDias(-3)}' where id = '${original.id}'`);
  actual = (await call("GET", `/pedidos-modulos/${original.id}`)).data;
  const conPasada = await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(actual, { observaciones: "Cocina y lavadero" }));
  check("la fecha guardada que ya pasó se puede dejar", conPasada.status === 200 && conPasada.data.fechaEntrega === enDias(-3) && conPasada.data.historial[0].valorNuevo === "cambió la referencia");
  actual = conPasada.data;

  // ---------------------------------------------------------------- errores
  const otra = await crear("otra");
  const ajena = await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(actual, { detalles: [...actual.detalles, { ...actual.detalles[0], id: null, pedidoModuloId: otra.modulos[0].id }] }));
  check("una pieza de un módulo de otra solicitud: 400 MODULE_NOT_IN_ORDER", ajena.status === 400 && ajena.data?.code === "MODULE_NOT_IN_ORDER");
  check("sin piezas: 400", (await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(actual, { detalles: [] }))).status === 400);
  check("un campo desconocido: 400", (await call("PUT", `/pedidos-modulos/${original.id}`, { ...cuerpo(actual), estado: "PENDIENTE" })).status === 400);
  check("teléfono corto: 400", (await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(actual, { numeroContacto: "12" }))).status === 400);
  const vieja = await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(original, { observaciones: "Pisaría" }));
  check("una versión vieja: 409 ORDER_CHANGED", vieja.status === 409 && vieja.data?.code === "ORDER_CHANGED");
  check("corte: 404", (await call("PUT", `/pedidos-modulos/${corteId}`, cuerpo(actual))).status === 404);
  check("inexistente: 404", (await call("PUT", "/pedidos-modulos/00000000-0000-4000-8000-000000000000", cuerpo(actual))).status === 404);
  check("carpintero: 403", (await call("PUT", `/pedidos-modulos/${original.id}`, cuerpo(actual), carpintero)).status === 403);
  check("el PUT de corte sigue rechazando una de módulos", (await call("PUT", `/orders/${original.id}`, { cliente: "x", numeroContacto: "000000", detalles: actual.detalles })).data?.code === "ORDER_IS_MODULES");

  for (const estado of ["EN_PROCESO", "TERMINADA", "ENTREGADA"]) {
    psql(`update pedidos set estado = '${estado}' where id = '${otra.id}'`);
    const fresca = (await call("GET", `/pedidos-modulos/${otra.id}`)).data;
    const r = await call("PUT", `/pedidos-modulos/${otra.id}`, cuerpo(fresca, { observaciones: "No" }));
    check(`${estado}: 403`, r.status === 403 && /No se pueden editar/.test(r.data?.message ?? ""));
  }
  psql(`update pedidos set estado = 'RECHAZADA' where id = '${otra.id}'`);
  let fresca = (await call("GET", `/pedidos-modulos/${otra.id}`)).data;
  check("RECHAZADA se puede editar (como corte)", (await call("PUT", `/pedidos-modulos/${otra.id}`, cuerpo(fresca, { observaciones: "Sí" }))).status === 200);
  psql(`update pedidos set estado = 'PENDIENTE', "stockReservado" = true where id = '${otra.id}'`);
  fresca = (await call("GET", `/pedidos-modulos/${otra.id}`)).data;
  const conStock = await call("PUT", `/pedidos-modulos/${otra.id}`, cuerpo(fresca, { observaciones: "No" }));
  check("con stock descontado: 409", conStock.status === 409 && /stock descontado/.test(conStock.data?.message ?? ""));
  psql(`update pedidos set "stockReservado" = false where id = '${otra.id}'`);

  // ---------------------------------------------------------------- dos ediciones a la vez
  fresca = (await call("GET", `/pedidos-modulos/${otra.id}`)).data;
  const historialAntes = Number(historial(otra.id));
  const [uno, dos] = await Promise.all([
    call("PUT", `/pedidos-modulos/${otra.id}`, cuerpo(fresca, { observaciones: "Primera" })),
    call("PUT", `/pedidos-modulos/${otra.id}`, cuerpo(fresca, { observaciones: "Segunda" }))
  ]);
  const estados = [uno.status, dos.status].sort().join(",");
  check("dos ediciones a la vez: una entra y la otra 409", estados === "200,409", estados);
  check("dos ediciones a la vez: una sola entrada en el historial", Number(historial(otra.id)) === historialAntes + 1);
} catch (error) {
  check("la prueba terminó sin excepciones", false, error.message);
} finally {
  for (const id of creadas) {
    psql(`update pedidos set estado = 'PENDIENTE', "stockReservado" = false where id = '${id}'`);
    const removed = await call("DELETE", `/orders/${id}`);
    if (removed.status !== 200 && removed.status !== 204) console.log(`MAL no se pudo borrar una solicitud de prueba (${removed.status})`);
  }
  const despues = {
    pedidos: psql("select count(*) from pedidos"),
    detalles: psql("select count(*) from detalle_pedidos"),
    historial: psql("select count(*) from historial_pedidos"),
    modulos: psql("select count(*) from pedidos_modulo"),
    stock: psql(`select md5(string_agg(id || coalesce("stockPlacas"::text, 'null'), ',' order by id)) from materiales`)
  };
  check("la copia quedó como estaba", same(antes, despues), JSON.stringify(despues));
  console.log(`\n${total - failures}/${total} ok`);
  process.exit(failures ? 1 : 0);
}
