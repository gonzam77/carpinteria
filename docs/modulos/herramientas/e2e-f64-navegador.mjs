// Prueba de F6.4: herrajes en la edición, "Recalcular herrajes", recalcular un módulo y la hoja de taller (DECISIONES 57),
// por la API y en el navegador. Edge sin ventana, contra el backend local (puerto 4100, copia del backup) y Vite (puerto
// 5180, con VITE_API_URL=http://127.0.0.1:4100/api). Usa una copia activa de BAJO_MESADA_2_PUERTAS con una bisagra
// (PUESTAS.cant * 2, la común) y una corredera por medida (PROFUNDIDAD - 50, línea Telescópica de 350 y 450). Prende los
// herrajes y al final los deja como estaban.
// - API: editar sin herrajes los deja como están; ajustarlos (cantidad, modelo, agregar, quitar) guarda la copia y el
//   origen, y el historial los cuenta; sin cambios no escribe; un modelo inactivo, un módulo ajeno o una cantidad 0 no
//   pasan; "Recalcular herrajes" trae lo del catálogo (y reconoce lo que no cambió); apagados, 409; el presupuesto de
//   placas sigue igual al de corte.
// - Navegador: el Resumen de la edición con los herrajes (cantidad, modelo, agregar), los cambios detectados, el
//   comprobante y el guardado; el aviso de recalcular un módulo; "Recalcular herrajes"; la hoja de taller.
// Crea tipos, herrajes, la copia del módulo y solicitudes "Prueba F6.4 ..."; borra todo al final. No toca otros datos.
//
// No es dependencia del proyecto: necesita Microsoft Edge y playwright-core en una carpeta aparte
// (`npm i playwright-core` en una carpeta temporal y PLAYWRIGHT_DIR=<esa carpeta>). Las capturas van a SHOTS_DIR.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), "noop.js"))("playwright-core");
const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const APP = process.env.APP ?? "http://127.0.0.1:5180";
const API = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F6.4";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f64-capturas");
mkdirSync(shotsDir, { recursive: true });
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
let failures = 0;
let total = 0;
const check = (label, ok, detail = "") => {
  total++;
  console.log(`${ok ? "ok " : "MAL"} ${label}${detail ? ` | ${detail}` : ""}`);
  if (!ok) failures++;
};
const norm = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const money = (value) => norm(Number(value).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }));

if (psql(`select count(*) from herrajes where nombre like '${PREFIJO}%'`) !== "0" || psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay herrajes o solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralos antes.`);
  process.exit(1);
}
const [adminId, nombre, apellido, email] = psql(`select id, nombre, apellido, email from usuarios where rol = 'ADMIN' order by "fechaCreacion" limit 1`).split("|");
const admin = { id: adminId, nombre, apellido, email, rol: "ADMIN" };
const token = jwt.sign({ id: admin.id, email: admin.email, rol: admin.rol }, SECRET, { expiresIn: "2h" });
const api = async (method, path, body) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
const contar = () =>
  psql(`select (select count(*) from herrajes) || '/' || (select count(*) from tipos_herraje) || '/' || (select count(*) from modulos) || '/' || (select count(*) from pedidos) || '/' || (select count(*) from pedidos_herraje)`);
const antes = contar();
const configAntes = psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`);
const setEnabled = (value) => psql(`update configuracion_modulos set "herrajesHabilitados" = ${value} where id = 'default'`);
const [colorA, colorB] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
  and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 2`).split("\n");
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);
const fecha = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const ESTIMADO = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado"];
const sinCampos = (definition) => {
  const { id, categoria, version, fechaActualizacion, imagen, tienePedidos, estadoFormulas, errores, ...rest } = definition;
  return rest;
};
// El PUT de la edicion con lo que tiene la solicitud, y lo que se cambie encima.
const putBody = (order, extra = {}) => ({
  cliente: order.cliente,
  numeroContacto: order.numeroContacto,
  fechaEntrega: order.fechaEntrega,
  fechaActualizacion: order.fechaActualizacion,
  detalles: order.detalles,
  ...extra
});
const lineas = (order) => order.herrajes.map((h) => ({ id: h.id, pedidoModuloId: h.pedidoModuloId, herrajeId: h.herrajeId, cantidad: h.cantidad }));
const resumen = (order) => order.herrajes.map((h) => [h.nombre.replace(`${PREFIJO} `, ""), h.cantidad, h.valorUnitario, h.origen]);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
let copiaId = null;
const creadas = [];
try {
  // ---------------------------------------------------------------- datos de prueba
  setEnabled(true);
  const bisagra = (await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Bisagra` })).data;
  const corredera = (await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Corredera` })).data;
  const pata = (await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Pata` })).data;
  const alta = async (data) => (await api("POST", "/herrajes", data)).data;
  const comun = await alta({ nombre: `${PREFIJO} Cazoleta común`, tipoId: bisagra.id, unidad: "unidad", valor: 850 });
  const suave = await alta({ nombre: `${PREFIJO} Cierre suave`, tipoId: bisagra.id, unidad: "unidad", valor: 1900 });
  const vieja = await alta({ nombre: `${PREFIJO} Bisagra vieja`, tipoId: bisagra.id, unidad: "unidad", valor: 500 });
  await api("PATCH", `/herrajes/${vieja.id}/active`, { activo: false });
  const t350 = await alta({ nombre: `${PREFIJO} Telescópica 350`, tipoId: corredera.id, unidad: "par", valor: 9100, linea: "Telescópica", medidaMm: 350 });
  const t450 = await alta({ nombre: `${PREFIJO} Telescópica 450`, tipoId: corredera.id, unidad: "par", valor: 10500, linea: "Telescópica", medidaMm: 450 });
  const pataReg = await alta({ nombre: `${PREFIJO} Pata regulable`, tipoId: pata.id, unidad: "unidad", valor: 300 });
  const copia = (await api("POST", `/modulos/${BAJO}/duplicar`)).data;
  copiaId = copia.id;
  const activada = await api("PUT", `/modulos/${copiaId}`, {
    ...sinCampos(copia),
    nombre: `${PREFIJO} Bajo mesada`,
    activo: true,
    herrajes: [
      { herrajeId: comun.id, formulaCantidad: "PUESTAS.cant * 2", formulaMedida: null, orden: 1 },
      { herrajeId: t350.id, formulaCantidad: "1", formulaMedida: "PROFUNDIDAD - 50", orden: 2 }
    ]
  });
  check("datos de prueba: herrajes y la copia activa del módulo con sus herrajes", activada.status === 200 && Boolean(pataReg?.id), `${activada.status} ${activada.data?.message ?? ""}`);
  const linea = { moduloId: copiaId, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 };
  const nueva = async (cliente) => {
    const creada = await api("POST", "/pedidos-modulos", { cliente, numeroContacto: "2664000000", fechaEntrega: fecha, modulos: [linea] });
    creadas.push(creada.data.id);
    return creada.data;
  };

  // ---------------------------------------------------------------- API: editar con y sin herrajes
  let o = await nueva(`${PREFIJO} api`);
  check("alta: la bisagra común y la corredera de 450, calculadas", JSON.stringify(resumen(o)) === JSON.stringify([["Cazoleta común", 4, 850, "CALCULADO"], ["Telescópica 450", 1, 10500, "CALCULADO"]]), JSON.stringify(resumen(o)));
  const ids = o.herrajes.map((h) => h.id).join();
  let r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, { numeroContacto: "2664111111" }));
  check("editar sin mandar herrajes los deja como están", r.status === 200 && r.data.herrajes.map((h) => h.id).join() === ids && r.data.costoHerrajes === 13900, `${r.status} ${r.data?.message ?? ""}`);
  o = r.data;
  r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, { herrajes: lineas(o) }));
  check("los mismos herrajes y nada más: no hay cambios y no se escribe", r.status === 200 && r.data.fechaActualizacion === o.fechaActualizacion && r.data.historial.length === o.historial.length);
  await api("PUT", `/herrajes/${comun.id}`, { nombre: comun.nombre, tipoId: bisagra.id, unidad: "unidad", valor: 1000 });
  const [lBisagra, lCorredera] = lineas(o);
  r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, {
    herrajes: [{ ...lBisagra, cantidad: 6 }, { ...lCorredera, herrajeId: t350.id }, { id: null, pedidoModuloId: o.modulos[0].id, herrajeId: pataReg.id, cantidad: 4 }]
  }));
  check(
    "ajustar: la cantidad conserva el precio guardado, otro modelo y uno agregado van con el de hoy",
    r.status === 200 && JSON.stringify(resumen(r.data)) === JSON.stringify([["Cazoleta común", 6, 850, "EDITADO"], ["Telescópica 350", 1, 9100, "EDITADO"], ["Pata regulable", 4, 300, "MANUAL"]]),
    `${r.status} ${JSON.stringify(r.data?.herrajes ? resumen(r.data) : r.data)}`
  );
  check("ajustar: el costo de herrajes y el historial", r.data.costoHerrajes === 6 * 850 + 9100 + 4 * 300 && r.data.historial[0].accion === "EDITAR_PEDIDO" && r.data.historial[0].valorNuevo === "2 herrajes modificados y 1 herraje agregado", `${r.data.costoHerrajes} ${r.data.historial[0].valorNuevo}`);
  o = r.data;
  const comoCorte = (await api("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: o.detalles })).data;
  check("el presupuesto de placas sigue igual al de corte (paridad)", ESTIMADO.every((campo) => comoCorte[campo] === o[campo]));
  r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, { herrajes: [...lineas(o), { id: null, pedidoModuloId: o.modulos[0].id, herrajeId: vieja.id, cantidad: 1 }] }));
  check("un modelo inactivo no pasa: 400 con el herraje y el módulo", r.status === 400 && r.data.code === "MODULE_HARDWARE_INVALID" && JSON.stringify(r.data).includes(`Herraje 4 del módulo 1: el herraje \\"${PREFIJO} Bisagra vieja\\" está inactivo`), JSON.stringify(r.data));
  r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, { herrajes: [{ ...lineas(o)[0], pedidoModuloId: creadas[0] }] }));
  check("un herraje de un módulo que no es de la solicitud: 400", r.status === 400 && r.data.code === "MODULE_NOT_IN_ORDER", JSON.stringify(r.data));
  r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, { herrajes: [{ ...lineas(o)[0], cantidad: 0 }] }));
  check("cantidad 0: 400 (para sacarlo, se quita)", r.status === 400 && JSON.stringify(r.data).includes("al menos 1"), JSON.stringify(r.data).slice(0, 200));

  // ---------------------------------------------------------------- API: recalcular herrajes y apagados
  r = await api("POST", `/pedidos-modulos/${o.id}/herrajes/recalcular`);
  check(
    "recalcular herrajes: lo del catálogo con los precios de hoy, sin guardar",
    r.status === 200 &&
      JSON.stringify(r.data.herrajes.map((h) => [h.herrajeId, h.cantidad, h.id, h.valorUnitario])) === JSON.stringify([[comun.id, 4, null, 1000], [t450.id, 1, null, 10500]]) &&
      r.data.costoHerrajes === 4 * 1000 + 10500 &&
      (await api("GET", `/pedidos-modulos/${o.id}`)).data.costoHerrajes === o.costoHerrajes,
    JSON.stringify(r.data).slice(0, 300)
  );
  r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, { herrajes: r.data.herrajes.map((h) => ({ id: h.id, pedidoModuloId: h.pedidoModuloId, herrajeId: h.herrajeId, cantidad: h.cantidad })) }));
  check(
    "guardar lo recalculado: calculados otra vez, sin la pata",
    r.status === 200 && JSON.stringify(resumen(r.data)) === JSON.stringify([["Cazoleta común", 4, 1000, "CALCULADO"], ["Telescópica 450", 1, 10500, "CALCULADO"]]) && r.data.historial[0].valorNuevo === "2 herrajes agregados y 3 herrajes quitados",
    `${r.status} ${r.data?.historial?.[0]?.valorNuevo}`
  );
  o = r.data;
  r = await api("POST", `/pedidos-modulos/${o.id}/herrajes/recalcular`);
  check("recalcular sin nada distinto: reconoce los guardados (con su id)", r.data.herrajes.map((h) => h.id).join() === o.herrajes.map((h) => h.id).join() && r.data.costoHerrajes === o.costoHerrajes);
  setEnabled(false);
  r = await api("POST", `/pedidos-modulos/${o.id}/herrajes/recalcular`);
  check("apagados: recalcular herrajes da 409", r.status === 409 && r.data.code === "HARDWARE_DISABLED");
  r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, { herrajes: [] }));
  check("apagados: cambiar los herrajes da 409", r.status === 409 && r.data.code === "HARDWARE_DISABLED");
  r = await api("PUT", `/pedidos-modulos/${o.id}`, putBody(o, { numeroContacto: "2664222222" }));
  check("apagados: editar lo demás los deja como están", r.status === 200 && r.data.herrajes.length === 2 && r.data.costoHerrajes === o.costoHerrajes);
  setEnabled(true);

  // ---------------------------------------------------------------- navegador: editar los herrajes
  // Se crea con la común a 1000 (la subio la parte de la API) y despues sube a 1200: lo guardado sigue a 1000.
  const b = await nueva(`${PREFIJO} navegador`);
  await api("PUT", `/herrajes/${comun.id}`, { nombre: comun.nombre, tipoId: bisagra.id, unidad: "unidad", valor: 1200 });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR" });
  const page = await context.newPage();
  page.on("console", (message) => message.type() === "error" && !message.location().url.includes("favicon") && errors.push(`console: ${message.text()}`));
  page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("authMethod", "admin");
    },
    { token, user: admin }
  );
  const alResumen = async () => {
    await page.goto(`${APP}/modulos/${b.id}/editar`);
    await page.getByLabel("Teléfono").waitFor({ timeout: 30000 });
    for (let paso = 0; paso < 3; paso++) {
      await page.getByRole("button", { name: "Siguiente" }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole("region", { name: "Herrajes del módulo 1" }).waitFor({ timeout: 30000 });
  };
  await alResumen();
  const editor = page.getByRole("region", { name: "Herrajes del módulo 1" });
  const filas = async () => (await editor.locator("tbody tr").allInnerTexts()).map(norm);
  const inicio = await filas();
  check("Resumen: los herrajes guardados con su precio (aunque hoy cueste otro)", inicio.length === 2 && inicio[0].includes("Cazoleta común") && inicio[0].includes("$ 1.000,00") && inicio[1].includes("Telescópica 450"), inicio.join(" || "));
  check("Resumen: sin tocar nada, no hay cambios", (await page.getByText("No hay cambios para guardar.").count()) === 1);
  await editor.getByLabel("Cantidad del herraje 1 del módulo 1").fill("5");
  await editor.getByRole("combobox", { name: "Modelo del herraje 2 del módulo 1" }).click();
  await page.getByRole("option", { name: `${PREFIJO} Telescópica 350` }).click();
  await editor.getByRole("combobox", { name: "Agregar herraje al módulo 1" }).click();
  await page.getByRole("option", { name: new RegExp(`^${PREFIJO} Pata regulable`) }).click();
  await editor.getByLabel("Cantidad del herraje 3 del módulo 1").fill("4");
  const ajustadas = await filas();
  check(
    "ajustar en el Resumen: cantidad, otro modelo y uno agregado, con su precio y lo que se hizo",
    ajustadas.length === 3 && ajustadas[0].includes("$ 5.000,00") && ajustadas[0].includes("Modificado a mano") && ajustadas[1].includes("$ 9.100,00") && ajustadas[2].includes("Agregado a mano") && ajustadas[2].includes("$ 1.200,00"),
    ajustadas.join(" || ")
  );
  const cambios = norm(await page.getByRole("list", { name: "Cambios detectados" }).innerText());
  check("cambios detectados: los herrajes", cambios.includes("2 herrajes modificados") && cambios.includes("1 herraje agregado"), cambios);
  await page.waitForTimeout(500); // que termine de cerrarse el menu de agregar
  await page.screenshot({ path: join(shotsDir, "a1-resumen-herrajes.png"), fullPage: true });
  await page.getByRole("button", { name: "Revisar y guardar" }).click();
  const constancia = page.getByRole("dialog");
  await constancia.getByText("Constancia de solicitud").first().waitFor({ timeout: 60000 });
  await constancia.getByText(/^Herrajes:/).waitFor({ timeout: 30000 }).catch(() => undefined);
  const textoConstancia = norm(await constancia.innerText());
  check("comprobante: los herrajes como quedan", textoConstancia.includes(`Herrajes: ${money(5000 + 9100 + 1200)}`), textoConstancia.slice(300, 700));
  await page.getByRole("button", { name: "Confirmar cambios" }).click();
  await page.waitForURL(`**/modulos/${b.id}`, { timeout: 60000 });
  let guardada = (await api("GET", `/pedidos-modulos/${b.id}`)).data;
  check(
    "guardar: los herrajes ajustados en la solicitud",
    JSON.stringify(resumen(guardada)) === JSON.stringify([["Cazoleta común", 5, 1000, "EDITADO"], ["Telescópica 350", 1, 9100, "EDITADO"], ["Pata regulable", 4, 300, "MANUAL"]]) && guardada.costoHerrajes === 15300,
    JSON.stringify(resumen(guardada))
  );

  // ---------------------------------------------------------------- navegador: aviso de recalcular un modulo
  await page.getByRole("region", { name: /^Módulo 1 · / }).getByRole("button", { name: "Cambiar medidas o colores" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Ver cómo queda" }).click({ timeout: 30000 });
  const aviso = dialogo.getByText(/^Se van a reemplazar las/);
  await aviso.waitFor({ timeout: 60000 });
  const textoAviso = norm(await aviso.innerText());
  check("recalcular un módulo avisa los herrajes ajustados que se pierden", textoAviso.includes("Sus herrajes vuelven a lo del catálogo: se pierden 3 herrajes ajustados a mano."), textoAviso);
  const nuevos = norm(await dialogo.getByLabel("Herrajes nuevos").innerText());
  check("recalcular un módulo muestra cómo quedan sus herrajes", nuevos === `Herrajes: 4 × ${PREFIJO} Cazoleta común · 1 par × ${PREFIJO} Telescópica 450`, nuevos);
  await page.screenshot({ path: join(shotsDir, "a2-recalcular-modulo.png") });
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await dialogo.waitFor({ state: "detached", timeout: 10000 }).catch(() => undefined);

  // ---------------------------------------------------------------- navegador: Recalcular herrajes
  await alResumen();
  await page.getByRole("button", { name: "Recalcular herrajes" }).click();
  await page.getByText("Herrajes recalculados con lo del catálogo. Revisalos y guardá los cambios.").waitFor({ timeout: 30000 });
  const recalculadas = await filas();
  check(
    "Recalcular herrajes: lo del catálogo con el precio de hoy",
    recalculadas.length === 2 && recalculadas[0].includes("Cazoleta común") && recalculadas[0].includes("$ 1.200,00") && recalculadas[1].includes("Telescópica 450"),
    recalculadas.join(" || ")
  );
  const cambios2 = norm(await page.getByRole("list", { name: "Cambios detectados" }).innerText());
  check("cambios detectados después de recalcular", cambios2.includes("2 herrajes agregados") && cambios2.includes("3 herrajes quitados"), cambios2);
  await page.getByRole("button", { name: "Revisar y guardar" }).click();
  await page.getByRole("button", { name: "Confirmar cambios" }).click({ timeout: 60000 });
  await page.waitForURL(`**/modulos/${b.id}`, { timeout: 60000 });
  guardada = (await api("GET", `/pedidos-modulos/${b.id}`)).data;
  check(
    "guardar lo recalculado: calculados y con el precio de hoy",
    JSON.stringify(resumen(guardada)) === JSON.stringify([["Cazoleta común", 4, 1200, "CALCULADO"], ["Telescópica 450", 1, 10500, "CALCULADO"]]) && guardada.costoHerrajes === 4 * 1200 + 10500,
    JSON.stringify(resumen(guardada))
  );

  // ---------------------------------------------------------------- navegador: hoja de taller
  await page.goto(`${APP}/modulos/${b.id}/taller`);
  const tabla = page.getByRole("table", { name: "Herrajes" });
  await tabla.waitFor({ timeout: 30000 });
  const taller = (await tabla.locator("tbody tr").allInnerTexts()).map(norm);
  check(
    "hoja de taller: los herrajes del módulo con casilla y cantidad",
    taller.length === 2 && taller[0] === `${PREFIJO} Bisagra: ${PREFIJO} Cazoleta común 4` && taller[1] === `${PREFIJO} Corredera: ${PREFIJO} Telescópica 450 1 par`,
    taller.join(" || ")
  );
  await page.screenshot({ path: join(shotsDir, "a3-hoja-taller.png"), fullPage: true });
  await context.close();
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n").slice(0, 4).join(" / ")}`, false);
} finally {
  for (const id of creadas) await api("DELETE", `/orders/${id}`);
  if (copiaId) await api("DELETE", `/modulos/${copiaId}`);
  psql(`delete from modulos_herraje where "herrajeId" in (select id from herrajes where nombre like '${PREFIJO}%')`);
  psql(`delete from herrajes where nombre like '${PREFIJO}%'`);
  psql(`delete from tipos_herraje where nombre like '${PREFIJO}%'`);
  setEnabled(configAntes === "t");
  check("limpieza: la copia de la base queda como estaba", contar() === antes && psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`) === configAntes, contar());
  await browser.close();
}
const inesperados = errors.filter((error) => !/status of 40[09]/.test(error));
check("sin errores en la consola", inesperados.length === 0, inesperados.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
