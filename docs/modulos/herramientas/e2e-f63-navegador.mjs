// Prueba de F6.3: herrajes en la solicitud de módulos (DECISIONES 57), por la API y en el navegador. Edge sin ventana,
// contra el backend local (puerto 4100, copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// Usa una copia activa de BAJO_MESADA_2_PUERTAS con dos herrajes: bisagra (PUESTAS.cant * 2, por defecto la común) y
// corredera (1, por medida PROFUNDIDAD - 50, línea Telescópica de 350 y 450). Prende los herrajes y al final los deja como
// estaban.
// - API, vista previa: cantidad, modelo por defecto y por medida, costo de herrajes aparte y el presupuesto de placas
//   igual al de corte (paridad); elegir otro modelo del mismo tipo; otro tipo da 400; apagados no hay herrajes.
// - API, alta: guarda cada herraje con su copia (nombre, unidad, tipo, medida y precio de hoy) y su origen; editar las
//   piezas no los cambia; un precio nuevo no cambia lo guardado; recalcular el módulo los regenera.
// - Navegador: el paso 4 del asistente muestra los herrajes del módulo con su subtotal; elegir otro modelo recalcula el
//   resumen; "Volver al que corresponde"; crear y ver los herrajes en el detalle.
// Crea tipos, herrajes, la copia del módulo y solicitudes "Prueba F6.3 ..."; borra todo al final. No toca otros datos.
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
const PREFIJO = "Prueba F6.3";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f63-capturas");
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
const nombreA = psql(`select trim(nombre) from materiales where id = '${colorA}'`);
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);
const fecha = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const ESTIMADO = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado"];
const sinCampos = (definition) => {
  const { id, categoria, version, fechaActualizacion, imagen, tienePedidos, estadoFormulas, errores, ...rest } = definition;
  return rest;
};

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
  const linea = (extra = {}) => ({ moduloId: copiaId, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1, ...extra });
  const datos = { cliente: `${PREFIJO} api`, numeroContacto: "2664000000" };

  // ---------------------------------------------------------------- API: vista previa
  const vista = await api("POST", "/pedidos-modulos/preview", { ...datos, modulos: [linea()] });
  const herrajes = vista.data?.modulos?.[0]?.herrajes ?? [];
  check(
    "vista previa: bisagras por defecto (4) y la corredera por medida (530 mm: la de 450)",
    vista.status === 200 &&
      JSON.stringify(herrajes.map((h) => [h.herrajeId, h.cantidad, h.eleccion, h.valorUnitario, h.unidad])) ===
        JSON.stringify([
          [comun.id, 4, "POR_DEFECTO", 850, "unidad"],
          [t450.id, 1, "POR_MEDIDA", 10500, "par"]
        ]),
    JSON.stringify(herrajes.map((h) => [h.nombre, h.cantidad, h.eleccion]))
  );
  check("vista previa: costo de herrajes aparte y el total con herrajes", vista.data.costoHerrajes === 13900 && vista.data.presupuestoConHerrajes === vista.data.presupuestoEstimado + 13900, `${vista.data.costoHerrajes}`);
  const comoCorte = (await api("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: vista.data.detalles })).data;
  check("vista previa: el presupuesto de placas sigue igual al de corte (paridad)", ESTIMADO.every((campo) => comoCorte[campo] === vista.data[campo]));
  const elegida = await api("POST", "/pedidos-modulos/preview", { ...datos, modulos: [linea({ herrajesOverride: { [comun.id]: suave.id } })] });
  const bisagraElegida = elegida.data.modulos[0].herrajes[0];
  check("elegir otro modelo del mismo tipo: va el elegido y el costo cambia", bisagraElegida.herrajeId === suave.id && bisagraElegida.eleccion === "ELEGIDO" && elegida.data.costoHerrajes === 4 * 1900 + 10500);
  const otroTipo = await api("POST", "/pedidos-modulos/preview", { ...datos, modulos: [linea({ herrajesOverride: { [comun.id]: pataReg.id } })] });
  check("elegir uno de otro tipo: 400 MODULE_HARDWARE_INVALID", otroTipo.status === 400 && otroTipo.data?.code === "MODULE_HARDWARE_INVALID");
  setEnabled(false);
  const apagados = await api("POST", "/pedidos-modulos/preview", { ...datos, modulos: [linea()] });
  check("herrajes apagados: no hay herrajes y el costo es 0", apagados.data.modulos[0].herrajes.length === 0 && apagados.data.costoHerrajes === 0);
  setEnabled(true);

  // ---------------------------------------------------------------- API: alta, edición, precios y recalcular
  const creada = await api("POST", "/pedidos-modulos", { ...datos, fechaEntrega: fecha, modulos: [linea({ herrajesOverride: { [comun.id]: suave.id } })] });
  creadas.push(creada.data.id);
  const o = creada.data;
  check(
    "alta: guarda cada herraje con su copia y su origen",
    JSON.stringify(o.herrajes.map((h) => [h.nombre, h.unidad, h.tipo, h.linea, h.medidaMm, h.cantidad, h.valorUnitario, h.origen, h.pedidoModuloId === o.modulos[0].id])) ===
      JSON.stringify([
        [`${PREFIJO} Cierre suave`, "unidad", `${PREFIJO} Bisagra`, null, null, 4, 1900, "EDITADO", true],
        [`${PREFIJO} Telescópica 450`, "par", `${PREFIJO} Corredera`, "Telescópica", 450, 1, 10500, "CALCULADO", true]
      ]),
    JSON.stringify(o.herrajes.map((h) => [h.nombre, h.origen]))
  );
  check("alta: el costo de herrajes guardado", o.costoHerrajes === 4 * 1900 + 10500 && o.presupuestoConHerrajes === o.presupuestoEstimado + o.costoHerrajes);
  await api("PUT", `/herrajes/${suave.id}`, { nombre: suave.nombre, tipoId: bisagra.id, unidad: "unidad", valor: 2500 });
  const despuesPrecio = (await api("GET", `/pedidos-modulos/${o.id}`)).data;
  check("un precio nuevo no cambia lo guardado", despuesPrecio.herrajes[0].valorUnitario === 1900 && despuesPrecio.costoHerrajes === o.costoHerrajes);
  const editada = await api("PUT", `/pedidos-modulos/${o.id}`, {
    cliente: o.cliente,
    numeroContacto: "2664111111",
    fechaEntrega: o.fechaEntrega,
    fechaActualizacion: o.fechaActualizacion,
    detalles: o.detalles.map((d, i) => (i === 0 ? { ...d, cantidad: d.cantidad + 1 } : d))
  });
  check("editar las piezas no cambia los herrajes ni su costo", editada.status === 200 && editada.data.herrajes.length === 2 && editada.data.costoHerrajes === o.costoHerrajes);
  const recalculo = await api("POST", `/pedidos-modulos/${o.id}/modulos/${o.modulos[0].id}/recalcular`, {
    ...linea({ valores: { PROFUNDIDAD: 400 } }),
    version: o.modulos[0].definicionSnapshot.version,
    fechaActualizacion: editada.data.fechaActualizacion
  });
  const regenerados = recalculo.data?.herrajes ?? [];
  check(
    "recalcular el módulo regenera sus herrajes (profundidad 400: la de 350; bisagra por defecto otra vez)",
    recalculo.status === 200 &&
      JSON.stringify(regenerados.map((h) => [h.nombre, h.cantidad, h.origen])) ===
        JSON.stringify([
          [`${PREFIJO} Cazoleta común`, 4, "CALCULADO"],
          [`${PREFIJO} Telescópica 350`, 1, "CALCULADO"]
        ]) &&
      recalculo.data.costoHerrajes === 4 * 850 + 9100,
    `${recalculo.status} ${JSON.stringify(regenerados.map((h) => h.nombre))} ${recalculo.data?.message ?? ""}`
  );

  // ---------------------------------------------------------------- navegador: el asistente
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
  await page.goto(`${APP}/modulos/nueva`);
  await page.getByLabel("Nombre o razón social").waitFor({ timeout: 30000 });
  await page.getByLabel("Nombre o razón social").fill(`${PREFIJO} navegador`);
  await page.getByLabel("Teléfono").fill("2664000000");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Buscar por nombre o código").fill(PREFIJO);
  await page.getByRole("button", { name: `${PREFIJO} Bajo mesada`, exact: true }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  const tarjeta = page.getByRole("region", { name: `Módulo 1 · ${PREFIJO} Bajo mesada`, exact: true });
  await tarjeta.waitFor({ timeout: 15000 });
  for (const label of ["Esqueleto", "Frentes"]) {
    await tarjeta.getByLabel(label).click();
    await page.getByRole("option", { name: new RegExp(`^${nombreA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ·`) }).first().click();
  }
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  const herrajesCard = page.getByRole("region", { name: "Herrajes del módulo 1" });
  await herrajesCard.waitFor({ timeout: 60000 });
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor({ timeout: 60000 });
  const filas = (await herrajesCard.locator("tbody tr").allInnerTexts()).map(norm);
  check("paso 4: los herrajes del módulo con su modelo y subtotal", filas.length === 2 && filas[0].includes("4") && filas[0].includes("Cazoleta común") && filas[1].includes("Por medida: necesita 530 mm"), filas.join(" || "));
  const resumen = () => page.locator("aside, [aria-label='Resumen']").first();
  const totalHerrajes = async () => norm(await page.getByText("Herrajes", { exact: true }).locator("xpath=..").innerText());
  check("paso 4: el resumen suma los herrajes", (await totalHerrajes()).includes(money(13900)), await totalHerrajes());
  await page.screenshot({ path: join(shotsDir, "a1-paso4-herrajes.png"), fullPage: true });
  await herrajesCard.getByRole("combobox", { name: `Modelo de ${PREFIJO} Bisagra del módulo 1` }).click();
  await page.getByRole("option", { name: `${PREFIJO} Cierre suave` }).click();
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor({ timeout: 60000 });
  await page.waitForFunction((esperado) => document.body.innerText.replace(/\s+/g, " ").includes(esperado), `Herrajes ${money(4 * 2500 + 10500)}`, { timeout: 60000 }).catch(() => undefined);
  check("elegir otro modelo recalcula el resumen (con el precio de hoy)", (await totalHerrajes()).includes(money(4 * 2500 + 10500)), await totalHerrajes());
  check("aparece Volver al que corresponde", (await herrajesCard.getByRole("button", { name: "Volver al que corresponde" }).count()) === 1);
  await herrajesCard.getByRole("button", { name: "Volver al que corresponde" }).click();
  await page.waitForFunction((esperado) => document.body.innerText.replace(/\s+/g, " ").includes(esperado), `Herrajes ${money(13900)}`, { timeout: 60000 }).catch(() => undefined);
  check("volver al que corresponde: otra vez la común", (await totalHerrajes()).includes(money(13900)));
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.waitForURL(/\/modulos\/[0-9a-f-]{36}$/, { timeout: 60000 });
  const detalleId = new URL(page.url()).pathname.split("/").pop();
  creadas.push(detalleId);
  const enDetalle = page.getByRole("region", { name: "Herrajes del módulo 1" });
  await enDetalle.waitFor({ timeout: 30000 });
  const filasDetalle = (await enDetalle.locator("tbody tr").allInnerTexts()).map(norm);
  check("detalle: los herrajes guardados del módulo", filasDetalle.length === 2 && filasDetalle[0].includes("Cazoleta común") && filasDetalle[1].includes("Telescópica 450"), filasDetalle.join(" || "));
  await page.screenshot({ path: join(shotsDir, "a2-detalle-herrajes.png"), fullPage: true });
  // El comprobante de la edicion (Revisar y guardar): suma los herrajes guardados, que editar no cambia. No se confirma.
  const guardada = (await api("GET", `/orders/${detalleId}`)).data;
  await page.goto(`${APP}/modulos/${detalleId}/editar`);
  await page.getByLabel("Teléfono").waitFor({ timeout: 30000 });
  await page.getByLabel("Teléfono").fill("2664999999");
  for (let paso = 0; paso < 3; paso++) {
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.waitForTimeout(400);
  }
  await page.getByRole("button", { name: "Revisar y guardar" }).click();
  const constancia = page.getByRole("dialog");
  await constancia.getByText("Constancia de solicitud").first().waitFor({ timeout: 60000 });
  await constancia.getByText(`Herrajes: ${money(13900)}`).waitFor({ timeout: 30000 }).catch(() => undefined);
  const textoConstancia = norm(await constancia.innerText());
  check(
    "constancia: los herrajes aparte y el total con herrajes",
    guardada.costoHerrajes === 13900 && textoConstancia.includes(`Herrajes: ${money(13900)}`) && textoConstancia.includes(money(guardada.presupuestoEstimado + 13900)),
    `${guardada.costoHerrajes}`
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shotsDir, "a3-constancia-herrajes.png") });
  await constancia.getByRole("button", { name: "Cerrar" }).click();
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
const inesperados = errors.filter((error) => !/status of 400/.test(error));
check("sin errores en la consola", inesperados.length === 0, inesperados.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
