// Prueba de F7.1 (API): recalcular un módulo de una solicitud desde el catálogo (spec §10.6, DECISIONES R4), contra el
// backend local (puerto 4100) y la copia del backup con el catálogo importado.
// - Vista previa: cuántas piezas se reemplazan y cuántas tenían cambios a mano, las piezas nuevas con su código de
//   barra, y el presupuesto del pedido entero antes y después (el de corte con las mismas filas). No escribe nada.
// - Aplicar: reemplaza solo las filas de ese módulo (las nuevas, CALCULADO y en su lugar), deja como estaban los otros
//   módulos y las adicionales, guarda medidas, colores, fondo y copia de la definición del módulo, recalcula el pedido
//   entero (paridad con corte) y deja RECALCULAR_MODULO en el historial.
// - Errores: otro módulo del catálogo (400), medidas que no sirven (400, con la posición real), un módulo que no es de la
//   solicitud (404), versión vieja de la solicitud o del módulo (409), módulo borrado del catálogo (409), en proceso (403),
//   carpintero (403).
// Crea solicitudes "Prueba F7.1 ..." y las borra al final. Deja la copia como estaba. No imprime datos de clientes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const BASE = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F7.1";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const admin = jwt.sign({ id: psql("select id from usuarios where rol='ADMIN' limit 1"), email: "prueba@local", rol: "ADMIN" }, SECRET, { expiresIn: "2h" });
const carpintero = jwt.sign({ id: psql("select id from usuarios where rol='CARPINTERO' limit 1"), email: "carp@local", rol: "CARPINTERO" }, SECRET, { expiresIn: "2h" });
const call = async (method, path, body, token = admin) => {
  const response = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
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
for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralas (DELETE /api/orders/:id).`);
  process.exit(1);
}
const contar = () => psql(`select (select count(*) from pedidos) || '/' || (select count(*) from detalle_pedidos) || '/' || (select count(*) from historial_pedidos) || '/' || (select count(*) from pedidos_modulo)`);
const antes = contar();

const [colorA, colorB] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
  and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 2`).split("\n");
const modulo = (codigo) => psql(`select id from modulos where codigo = '${codigo}'`);
const BAJO = modulo("BAJO_MESADA_2_PUERTAS");
const ALACENA = modulo("ALACENA_2_PUERTAS");
const fondoElegido = psql(`select id from materiales where tipo = 'PLACA' and activo and "espesorMm" = 5.5 and "anchoPlaca" is not null order by nombre limit 1`);
const fecha = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const ESTIMADO = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado"];
const firma = (d) => [d.codigoBarra, d.origen, d.piezaCodigo, d.largo, d.ancho, d.cantidad, d.materialId, d.cantoLargo1Id, d.nombreProducto].join("|");
check("datos de prueba", Boolean(colorA && colorB && BAJO && ALACENA && fondoElegido));

const creadas = [];
try {
  const alta = await call("POST", "/pedidos-modulos", {
    cliente: `${PREFIJO} principal`,
    numeroContacto: "2664000000",
    fechaEntrega: fecha,
    modulos: [
      { moduloId: BAJO, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 },
      { moduloId: ALACENA, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorA, perfilCantoOrden: 1, materialFondoId: fondoElegido, observaciones: "Sobre la mesada" },
      { moduloId: BAJO, valores: { ANCHO: 900 }, colorEsqueletoId: colorB, colorFrentesId: colorB, perfilCantoOrden: 1 }
    ]
  });
  creadas.push(alta.data.id);
  const o = alta.data;
  const [m1, m2, m3] = o.modulos;
  // Cambios a mano: una pieza del módulo 2 editada, una agregada al módulo 2 y una adicional.
  const deM2 = o.detalles.filter((d) => d.pedidoModuloId === m2.id);
  const editada = await call("PUT", `/pedidos-modulos/${o.id}`, {
    cliente: o.cliente,
    numeroContacto: o.numeroContacto,
    fechaEntrega: o.fechaEntrega,
    fechaActualizacion: o.fechaActualizacion,
    detalles: [
      ...o.detalles.map((d) => (d.id === deM2[0].id ? { ...d, cantidad: d.cantidad + 1 } : d)),
      { materialId: colorA, largo: 400, ancho: 300, cantidad: 1, permiteRotar: false, nombreProducto: "Agregada al 2", pedidoModuloId: m2.id },
      { materialId: colorA, largo: 600, ancho: 550, cantidad: 1, permiteRotar: false, nombreProducto: "Adicional", pedidoModuloId: null }
    ]
  });
  const pedido = editada.data;
  check("preparación: editada con 2 cambios en el módulo 2 y una adicional", editada.status === 200 && pedido.detalles.filter((d) => d.pedidoModuloId === m2.id && d.origen !== "CALCULADO").length === 2);
  const n = pedido.numero;
  const linea = (patch = {}) => ({ moduloId: ALACENA, valores: { ANCHO: 600, ALTO: 500, PROFUNDIDAD: 300 }, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1, materialFondoId: fondoElegido, observaciones: "Sobre la mesada", ...patch });
  const ruta = (pm = m2.id, id = pedido.id) => `/pedidos-modulos/${id}/modulos/${pm}/recalcular`;

  // ---------------------------------------------------------------- vista previa
  const historialAntes = pedido.historial.length;
  const filasAntes = pedido.detalles.map(firma).join("\n");
  const vista = await call("POST", `${ruta()}/vista-previa`, linea());
  check("vista previa: 200", vista.status === 200, `${vista.status} ${vista.data?.message ?? ""}`);
  const v = vista.data;
  const deM2Ahora = pedido.detalles.filter((d) => d.pedidoModuloId === m2.id);
  check("vista previa: piezas que se reemplazan y cambios manuales", v.piezasAntes === deM2Ahora.length && v.cambiosManuales === 2, `${v.piezasAntes} / ${v.cambiosManuales}`);
  check("vista previa: piezas nuevas con su código de barra M{n}-02-OO, todas calculadas", v.detalles.length > 0 && v.detalles.every((d) => new RegExp(`^M${n}-02-\\d\\d$`).test(d.codigoBarra) && d.origen === "CALCULADO" && d.pedidoModuloId === m2.id));
  check("vista previa: el ancho nuevo", v.valores.ANCHO === 600 && v.posicion === 2);
  const combinadas = [...pedido.detalles.filter((d) => d.pedidoModuloId !== m2.id), ...v.detalles];
  const comoCorte = (await call("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: combinadas })).data;
  check("vista previa: el presupuesto del pedido entero es el de corte con las mismas filas", ESTIMADO.every((campo) => comoCorte[campo] === v.despues[campo]), ESTIMADO.filter((campo) => comoCorte[campo] !== v.despues[campo]).join(","));
  check("vista previa: antes = lo guardado", v.antes.placasEstimadas === pedido.placasEstimadas && v.antes.presupuestoEstimado === pedido.presupuestoEstimado);
  const sinCambios = (await call("GET", `/pedidos-modulos/${pedido.id}`)).data;
  check("vista previa: no escribe nada", sinCambios.historial.length === historialAntes && sinCambios.detalles.map(firma).join("\n") === filasAntes && sinCambios.fechaActualizacion === pedido.fechaActualizacion);

  // ---------------------------------------------------------------- aplicar
  const aplicada = await call("POST", ruta(), { ...linea(), version: v.version, fechaActualizacion: pedido.fechaActualizacion });
  check("aplicar: 200", aplicada.status === 200, `${aplicada.status} ${aplicada.data?.message ?? ""}`);
  const r = aplicada.data;
  const deM2Nuevas = r.detalles.filter((d) => d.pedidoModuloId === m2.id);
  check("aplicar: el módulo 2 con las piezas de la vista previa, todas calculadas", JSON.stringify(deM2Nuevas.map((d) => [d.codigoBarra, d.largo, d.ancho, d.cantidad])) === JSON.stringify(v.detalles.map((d) => [d.codigoBarra, d.largo, d.ancho, d.cantidad])) && deM2Nuevas.every((d) => d.origen === "CALCULADO"));
  const otrasAntes = pedido.detalles.filter((d) => d.pedidoModuloId !== m2.id).map(firma);
  const otrasDespues = r.detalles.filter((d) => d.pedidoModuloId !== m2.id).map(firma);
  check("aplicar: los otros módulos y la adicional quedan como estaban", JSON.stringify(otrasAntes) === JSON.stringify(otrasDespues), `${otrasDespues.length} filas`);
  const grupos = r.detalles.map((d) => (d.pedidoModuloId === m1.id ? 1 : d.pedidoModuloId === m2.id ? 2 : d.pedidoModuloId === m3.id ? 3 : 4));
  check("aplicar: filas agrupadas por módulo, adicionales al final, índices 0..n-1", grupos.every((g, i) => i === 0 || grupos[i - 1] <= g) && r.detalles.every((d, i) => d.indice === i));
  const pm2 = r.modulos.find((m) => m.id === m2.id);
  check(
    "aplicar: el módulo guarda medidas, colores, fondo, observaciones y la copia de la definición",
    pm2.valores.ANCHO === 600 && pm2.colorFrentesId === colorB && pm2.materialFondoId === fondoElegido && pm2.observaciones === "Sobre la mesada" && pm2.definicionSnapshot?.version === v.version
  );
  const corteDespues = (await call("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: r.detalles })).data;
  check("aplicar: el pedido entero se recalcula (paridad con corte)", ESTIMADO.every((campo) => corteDespues[campo] === r[campo]) && ESTIMADO.every((campo) => r[campo] === v.despues[campo]));
  const h = r.historial[0];
  check(
    "aplicar: historial RECALCULAR_MODULO con el módulo antes y después",
    h.accion === "RECALCULAR_MODULO" && h.valorAnterior === "Módulo 2 · Alacena 2 puertas · 780 × 500 × 300 mm" && h.valorNuevo === "Módulo 2 · Alacena 2 puertas · 600 × 500 × 300 mm",
    `${h.valorAnterior} → ${h.valorNuevo}`
  );

  // ---------------------------------------------------------------- errores
  const otro = await call("POST", `${ruta()}/vista-previa`, linea({ moduloId: BAJO }));
  check("otro módulo del catálogo: 400 MODULE_MISMATCH", otro.status === 400 && otro.data?.code === "MODULE_MISMATCH");
  const mala = await call("POST", `${ruta()}/vista-previa`, linea({ valores: { ANCHO: -50, ALTO: 500, PROFUNDIDAD: 300 } }));
  const textoMala = JSON.stringify(mala.data);
  check("medidas que no sirven: 400 con la posición real (módulo 2)", mala.status === 400 && /[Mm]ódulo 2/.test(textoMala) && !/[Mm]ódulo 1\b/.test(textoMala), mala.data?.message);
  check("un módulo que no es de la solicitud: 404", (await call("POST", `${ruta("00000000-0000-4000-8000-000000000000")}/vista-previa`, linea())).status === 404);
  const vieja = await call("POST", ruta(), { ...linea(), version: v.version, fechaActualizacion: pedido.fechaActualizacion });
  check("una versión vieja de la solicitud: 409 ORDER_CHANGED", vieja.status === 409 && vieja.data?.code === "ORDER_CHANGED");
  const versionVieja = await call("POST", ruta(), { ...linea(), version: v.version + 7, fechaActualizacion: r.fechaActualizacion });
  check("una versión vieja del módulo: 409 MODULE_CHANGED", versionVieja.status === 409 && versionVieja.data?.code === "MODULE_CHANGED");
  check("carpintero: 403", (await call("POST", `${ruta()}/vista-previa`, linea(), carpintero)).status === 403 && (await call("POST", ruta(), linea(), carpintero)).status === 403);
  psql(`update pedidos set estado = 'EN_PROCESO' where id = '${pedido.id}'`);
  check("en proceso: 403 (también la vista previa)", (await call("POST", `${ruta()}/vista-previa`, linea())).status === 403 && (await call("POST", ruta(), { ...linea(), version: v.version })).status === 403);
  psql(`update pedidos set estado = 'PENDIENTE' where id = '${pedido.id}'`);
  psql(`update pedidos_modulo set "moduloId" = null where id = '${m3.id}'`);
  const borrado = await call("POST", `${ruta(m3.id)}/vista-previa`, { ...linea(), moduloId: BAJO, valores: {} });
  check("módulo borrado del catálogo: 409 MODULE_DELETED", borrado.status === 409 && borrado.data?.code === "MODULE_DELETED", borrado.data?.message);
} catch (error) {
  check("la prueba terminó sin excepciones", false, error.message);
} finally {
  for (const id of creadas) {
    psql(`update pedidos set estado = 'PENDIENTE' where id = '${id}' and not "stockReservado"`);
    const removed = await call("DELETE", `/orders/${id}`);
    if (removed.status !== 204 && removed.status !== 200) console.log(`MAL no se pudo borrar una solicitud de prueba (${removed.status})`);
  }
  check("la copia quedó como estaba", contar() === antes, contar());
  console.log(`\n${total - failures}/${total} ok`);
  process.exit(failures ? 1 : 0);
}
