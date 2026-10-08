// Prueba de F6.1: Configuración › Herrajes (spec §12 y §13.4, DECISIONES 57), por la API y en el navegador. Edge sin
// ventana, contra el backend local (puerto 4100, copia del backup) y Vite (puerto 5180, con
// VITE_API_URL=http://127.0.0.1:4100/api).
// - API: tipos (alta, nombre repetido 409, cambio de nombre, desactivar); herrajes (alta con y sin medida, la medida pide
//   línea, unidad desconocida, orden del listado, inactivos ocultos, edición, activar y desactivar, ajuste de precios
//   por porcentaje con auditoría, borrar uno sin uso 204 y uno usado 409); carpintero 403.
// - Pantalla: el interruptor "Herrajes habilitados" (se restaura al final), crear un tipo y un herraje con el
//   formulario, el aviso de medida sin línea, editar, ajustar precios de los elegidos, desactivar, mostrar inactivos y
//   borrar.
// Crea tipos y herrajes "Prueba F6.1 ..." y los borra al final (los tipos y la auditoría, por SQL). No toca otros datos.
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
const PREFIJO = "Prueba F6.1";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f61-capturas");
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

if (psql(`select count(*) from herrajes where nombre like '${PREFIJO}%'`) !== "0" || psql(`select count(*) from tipos_herraje where nombre like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay herrajes o tipos "${PREFIJO}..." de una corrida anterior que se cortó: borralos antes.`);
  process.exit(1);
}
const [adminId, nombre, apellido, email] = psql(`select id, nombre, apellido, email from usuarios where rol = 'ADMIN' order by "fechaCreacion" limit 1`).split("|");
const admin = { id: adminId, nombre, apellido, email, rol: "ADMIN" };
const token = jwt.sign({ id: admin.id, email: admin.email, rol: admin.rol }, SECRET, { expiresIn: "2h" });
const carpintero = jwt.sign({ id: psql("select id from usuarios where rol='CARPINTERO' limit 1"), email: "carp@local", rol: "CARPINTERO" }, SECRET, { expiresIn: "2h" });
const api = async (method, path, body, auth = token) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
const contar = () => psql(`select (select count(*) from herrajes) || '/' || (select count(*) from tipos_herraje) || '/' || (select count(*) from modulos_herraje) || '/' || (select count(*) from pedidos)`);
const antes = contar();
const configAntes = psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`);
const auditoriaAntes = psql(`select coalesce(max("fechaCreacion")::text, '') from auditorias`);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  // ================================================================ API
  const bisagra = await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Bisagra` });
  const corredera = await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Corredera` });
  check("API tipos: alta", bisagra.status === 201 && corredera.status === 201);
  check("API tipos: nombre repetido, 409", (await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Bisagra` })).status === 409);
  const renombrado = await api("PUT", `/herrajes/tipos/${bisagra.data.id}`, { nombre: `${PREFIJO} Bisagras` });
  check("API tipos: cambio de nombre", renombrado.status === 200 && renombrado.data.nombre === `${PREFIJO} Bisagras`);

  const alta = (data) => api("POST", "/herrajes", data);
  const comun = await alta({ nombre: `${PREFIJO} Cazoleta común`, tipoId: bisagra.data.id, unidad: "unidad", valor: 850 });
  const tel400 = await alta({ nombre: `${PREFIJO} Telescópica 400`, tipoId: corredera.data.id, unidad: "par", valor: 9800, linea: "Telescópica", medidaMm: 400 });
  const tel350 = await alta({ nombre: `${PREFIJO} Telescópica 350`, tipoId: corredera.data.id, unidad: "par", valor: 9100, linea: "Telescópica", medidaMm: 350 });
  check("API herrajes: alta con y sin medida", comun.status === 201 && tel400.status === 201 && tel350.status === 201 && tel400.data.medidaMm === 400 && tel400.data.tipo.nombre === `${PREFIJO} Corredera`);
  const sinLinea = await alta({ nombre: `${PREFIJO} Sin línea`, tipoId: corredera.data.id, unidad: "par", valor: 1, medidaMm: 300 });
  check("API herrajes: con medida y sin línea, 400 con el mensaje", sinLinea.status === 400 && JSON.stringify(sinLinea.data).includes("tiene que tener su línea"));
  check("API herrajes: unidad desconocida, 400", (await alta({ nombre: `${PREFIJO} X`, tipoId: corredera.data.id, unidad: "caja", valor: 1 })).status === 400);
  check("API herrajes: tipo que no existe, 400", (await alta({ nombre: `${PREFIJO} X`, tipoId: "00000000-0000-4000-8000-000000000000", unidad: "unidad", valor: 1 })).status === 400);
  check("API herrajes: nombre repetido, 409", (await alta({ nombre: `${PREFIJO} Cazoleta común`, tipoId: bisagra.data.id, unidad: "unidad", valor: 1 })).status === 409);
  const lista = (await api("GET", "/herrajes")).data.filter((h) => h.nombre.startsWith(PREFIJO)).map((h) => h.nombre.replace(`${PREFIJO} `, ""));
  check("API herrajes: listado por tipo, línea y medida", JSON.stringify(lista) === JSON.stringify(["Cazoleta común", "Telescópica 350", "Telescópica 400"]), lista.join(", "));
  const editado = await api("PUT", `/herrajes/${comun.data.id}`, { nombre: `${PREFIJO} Cazoleta común`, tipoId: bisagra.data.id, unidad: "unidad", valor: 900 });
  check("API herrajes: edición", editado.status === 200 && editado.data.valor === 900 && editado.data.linea === null);
  const ajuste = await api("POST", "/herrajes/adjust-values", { herrajeIds: [comun.data.id, tel400.data.id], percentage: 10.5 });
  const precios = (await api("GET", "/herrajes")).data.filter((h) => h.nombre.startsWith(PREFIJO)).map((h) => h.valor);
  check("API herrajes: ajuste de precios redondeado a centavos, solo los elegidos", ajuste.data?.updatedCount === 2 && JSON.stringify(precios) === JSON.stringify([994.5, 9100, 10829]), precios.join(", "));
  check("API herrajes: el ajuste queda en la auditoría", psql(`select count(*) from auditorias where accion = 'AJUSTAR_VALOR_HERRAJES' and "fechaCreacion"::text > '${auditoriaAntes}'`) === "1");
  await api("PATCH", `/herrajes/${tel350.data.id}/active`, { activo: false });
  const activos = (await api("GET", "/herrajes")).data.filter((h) => h.nombre.startsWith(PREFIJO)).length;
  const todos = (await api("GET", "/herrajes?incluirInactivos=true")).data.filter((h) => h.nombre.startsWith(PREFIJO)).length;
  check("API herrajes: un inactivo no sale salvo con incluirInactivos", activos === 2 && todos === 3);
  // Uno usado en un módulo del catálogo no se puede borrar del todo.
  const moduloId = psql("select id from modulos order by codigo limit 1");
  psql(`insert into modulos_herraje (id, "moduloId", "herrajeId", "formulaCantidad", orden) values (gen_random_uuid(), '${moduloId}', '${comun.data.id}', '2', 99)`);
  const usado = await api("DELETE", `/herrajes/${comun.data.id}`);
  check("API herrajes: uno usado no se borra (409 con el uso)", usado.status === 409 && usado.data?.code === "HARDWARE_IN_USE");
  psql(`delete from modulos_herraje where "herrajeId" = '${comun.data.id}'`);
  check("API herrajes: uno sin uso se borra (204)", (await api("DELETE", `/herrajes/${tel350.data.id}`)).status === 204);
  check(
    "API: carpintero, 403",
    (await api("GET", "/herrajes", undefined, carpintero)).status === 403 && (await api("GET", "/herrajes/tipos", undefined, carpintero)).status === 403 && (await api("POST", "/herrajes", {}, carpintero)).status === 403
  );

  // ================================================================ pantalla
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR" });
  const page = await context.newPage();
  page.on("console", (message) => message.type() === "error" && !message.location().url.includes("favicon") && errors.push(`console: ${message.text()}`));
  page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
  page.on("response", (response) => response.status() >= 400 && !response.url().includes("favicon") && errors.push(`HTTP ${response.status()} ${response.url().replace(API, "")}`));
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("authMethod", "admin");
    },
    { token, user: admin }
  );
  await page.goto(`${APP}/configuracion-herrajes`);
  await page.getByRole("heading", { name: "Herrajes", exact: true }).waitFor({ timeout: 30000 });
  check("pantalla: en el menú de Configuración, con el título de la barra", (await page.getByRole("link", { name: "Herrajes" }).count()) === 1);
  const interruptor = page.getByLabel("Herrajes habilitados en las solicitudes de módulos");
  await interruptor.waitFor();
  const estaba = await interruptor.isChecked();
  await interruptor.click();
  await page.getByText(estaba ? /Herrajes deshabilitados/ : /Herrajes habilitados en las solicitudes de módulos\./).first().waitFor({ timeout: 15000 });
  check("pantalla: el interruptor cambia la configuración", psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`) === (estaba ? "f" : "t"));

  await page.getByLabel("Tipo nuevo").fill(`${PREFIJO} Pata`);
  await page.getByRole("button", { name: "Agregar tipo" }).click();
  await page.getByText(`Tipo "${PREFIJO} Pata" creado.`).waitFor({ timeout: 15000 });
  check("pantalla: crear un tipo", (await page.getByLabel("Tipos de herraje").getByText(`${PREFIJO} Pata · 0`).count()) === 1);

  const form = page.locator("form").filter({ has: page.getByLabel("Nombre del modelo") });
  await form.getByLabel("Tipo").click();
  await page.getByRole("option", { name: `${PREFIJO} Corredera` }).click();
  await form.getByLabel("Nombre del modelo").fill(`${PREFIJO} Telescópica 450`);
  await form.getByLabel("Precio").fill("10500");
  await form.getByLabel("Medida", { exact: true }).fill("450");
  await form.getByRole("button", { name: "Crear" }).click();
  const aviso = page.getByRole("alert").filter({ hasText: "Hay datos para corregir." });
  check("pantalla: medida sin línea, el aviso", (await aviso.waitFor({ timeout: 5000 }).then(() => true, () => false)) && (await aviso.innerText()).includes("tiene que tener su línea"));
  await form.getByLabel("Línea").fill("Telescópica");
  await form.getByRole("button", { name: "Crear" }).click();
  await page.getByText(`Herraje "${PREFIJO} Telescópica 450" creado.`).waitFor({ timeout: 15000 });
  const fila = page.getByRole("row", { name: new RegExp(`${PREFIJO} Telescópica 450`) });
  check("pantalla: crear un herraje con medida", norm(await fila.innerText()).includes("Telescópica 450 mm Par") || norm(await fila.innerText()).includes("450 mm"), norm(await fila.innerText()));

  await page.getByRole("button", { name: `Editar ${PREFIJO} Telescópica 450` }).click();
  await form.getByLabel("Precio").fill("11000");
  await form.getByRole("button", { name: "Guardar" }).click();
  await page.getByText(`Herraje "${PREFIJO} Telescópica 450" guardado.`).waitFor({ timeout: 15000 });
  check("pantalla: editar", norm(await fila.innerText()).includes("11.000"));

  await page.getByLabel(`Elegir ${PREFIJO} Telescópica 450`).check();
  await page.getByLabel("Porcentaje").fill("-10");
  await page.getByRole("button", { name: "Ajustar precios (1)" }).click();
  await page.getByText(/Precios ajustados un -10 % en 1 herrajes/).waitFor({ timeout: 15000 });
  check("pantalla: ajustar precios de los elegidos", norm(await fila.innerText()).includes("9.900"), norm(await fila.innerText()));

  await fila.getByRole("button", { name: "Desactivar" }).click();
  await page.getByText(`"${PREFIJO} Telescópica 450" desactivado.`).waitFor({ timeout: 15000 });
  check("pantalla: desactivar lo saca del listado", (await page.getByRole("row", { name: new RegExp(`${PREFIJO} Telescópica 450`) }).count()) === 0);
  await page.getByLabel("Mostrar inactivos").check();
  await fila.waitFor({ timeout: 15000 });
  check("pantalla: mostrar inactivos", norm(await fila.innerText()).includes("Inactivo"));
  await page.screenshot({ path: join(shotsDir, "a1-herrajes.png"), fullPage: true });
  await page.getByRole("button", { name: `Borrar ${PREFIJO} Telescópica 450` }).click();
  await page.getByText(`"${PREFIJO} Telescópica 450" borrado.`).waitFor({ timeout: 15000 });
  check("pantalla: borrar uno sin uso", (await page.getByRole("row", { name: new RegExp(`${PREFIJO} Telescópica 450`) }).count()) === 0);
  await context.close();
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n")[0]}`, false);
} finally {
  psql(`delete from modulos_herraje where "herrajeId" in (select id from herrajes where nombre like '${PREFIJO}%')`);
  psql(`delete from herrajes where nombre like '${PREFIJO}%'`);
  psql(`delete from tipos_herraje where nombre like '${PREFIJO}%'`);
  psql(`delete from auditorias where accion = 'AJUSTAR_VALOR_HERRAJES' and "fechaCreacion"::text > '${auditoriaAntes}'`);
  psql(`update configuracion_modulos set "herrajesHabilitados" = ${configAntes === "t"} where id = 'default'`);
  check("limpieza: la copia queda como estaba (herrajes, tipos, módulos, pedidos y configuración)", contar() === antes && psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`) === configAntes, contar());
  await browser.close();
}
const inesperados = errors.filter((error) => !/HTTP 40[09] /.test(error) && !/status of 40[09]/.test(error));
check("sin errores en la consola (salvo los 400/409 provocados)", inesperados.length === 0, inesperados.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
