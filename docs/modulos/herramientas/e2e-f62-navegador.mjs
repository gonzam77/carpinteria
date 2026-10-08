// Prueba de F6.2: herrajes en el módulo del catálogo (DECISIONES 57), por la API y en el editor. Edge sin ventana,
// contra el backend local (puerto 4100, copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// Trabaja sobre una copia de BAJO_MESADA_2_PUERTAS (Duplicar), así no toca los módulos del catálogo.
// - Editor: pestaña Herrajes con su contador; agregar una bisagra con cantidad PUESTAS.cant * 2 (la pieza de las puertas
//   se llama PUESTAS en el catálogo importado) (4 con las medidas por
//   defecto) y una corredera con medida PROFUNDIDAD - 50 (530 mm: elige la telescópica de 450 de su línea); una fórmula
//   mala marca la pestaña con error; guardar y que quede al volver a abrir.
// - API: el módulo guarda la fórmula de medida; /modulos/evaluar da cantidad y medida; un módulo activo no se guarda con un
//   modelo por defecto inactivo, con un modelo repetido ni con una fórmula de herraje con error.
// Crea tipos y herrajes "Prueba F6.2 ..." y la copia del módulo, y los borra al final. No toca otros datos.
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
const PREFIJO = "Prueba F6.2";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f62-capturas");
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

if (psql(`select count(*) from herrajes where nombre like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay herrajes "${PREFIJO}..." de una corrida anterior que se cortó: borralos antes (y la copia del módulo).`);
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
const contar = () => psql(`select (select count(*) from herrajes) || '/' || (select count(*) from tipos_herraje) || '/' || (select count(*) from modulos_herraje) || '/' || (select count(*) from modulos)`);
const antes = contar();
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
let copiaId = null;
try {
  // ---------------------------------------------------------------- datos de prueba
  const bisagra = (await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Bisagra` })).data;
  const corredera = (await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Corredera` })).data;
  const alta = async (data) => (await api("POST", "/herrajes", data)).data;
  const cazoleta = await alta({ nombre: `${PREFIJO} Cazoleta común`, tipoId: bisagra.id, unidad: "unidad", valor: 850 });
  const inactiva = await alta({ nombre: `${PREFIJO} Cazoleta vieja`, tipoId: bisagra.id, unidad: "unidad", valor: 500 });
  await api("PATCH", `/herrajes/${inactiva.id}/active`, { activo: false });
  const t350 = await alta({ nombre: `${PREFIJO} Telescópica 350`, tipoId: corredera.id, unidad: "par", valor: 9100, linea: "Telescópica", medidaMm: 350 });
  const t450 = await alta({ nombre: `${PREFIJO} Telescópica 450`, tipoId: corredera.id, unidad: "par", valor: 10500, linea: "Telescópica", medidaMm: 450 });
  const copia = await api("POST", `/modulos/${BAJO}/duplicar`);
  copiaId = copia.data?.id;
  check("datos de prueba: tipos, herrajes y la copia del módulo", Boolean(cazoleta?.id && t350?.id && t450?.id && copiaId));

  // ---------------------------------------------------------------- editor
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
  await page.goto(`${APP}/configuracion-modulos/${copiaId}`);
  const pestaña = page.getByRole("tab", { name: /^Herrajes/ });
  await pestaña.waitFor({ timeout: 30000 });
  check("pestaña Herrajes con su contador en 0", norm(await pestaña.innerText()) === "Herrajes0" || norm(await pestaña.innerText()) === "Herrajes 0", norm(await pestaña.innerText()));
  await pestaña.click();
  await page.getByText("Este módulo no lleva herrajes.").waitFor({ timeout: 15000 });

  const linea = (n) => page.getByRole("region", { name: `Herraje ${n}` });
  const elegir = async (region, label, opcion) => {
    await region.getByLabel(label).click();
    await page.getByRole("option", { name: opcion }).click();
  };
  await page.getByRole("button", { name: "Agregar herraje" }).click();
  await elegir(linea(1), "Tipo", `${PREFIJO} Bisagra`);
  await elegir(linea(1), "Modelo por defecto", `${PREFIJO} Cazoleta común`);
  await linea(1).getByLabel("Cantidad").fill("PUESTAS.cant * 2");
  await page.waitForTimeout(400);
  const resultado1 = norm(await page.getByLabel("Resultado del herraje 1").innerText());
  check("bisagra: 4 × Cazoleta común con las medidas por defecto", resultado1 === `4 × ${PREFIJO} Cazoleta común`, resultado1);
  check("el modelo inactivo no se ofrece", await (async () => {
    await linea(1).getByLabel("Modelo por defecto").click();
    const visible = await page.getByRole("option", { name: new RegExp(`${PREFIJO} Cazoleta vieja`) }).count();
    await page.keyboard.press("Escape");
    return visible === 0;
  })());

  await page.getByRole("button", { name: "Agregar herraje" }).click();
  await elegir(linea(2), "Tipo", `${PREFIJO} Corredera`);
  await elegir(linea(2), "Modelo por defecto", new RegExp(`^${PREFIJO} Telescópica 350`));
  await linea(2).getByLabel("Cantidad").fill("2");
  check("corredera: aparece el campo de la medida", (await linea(2).getByLabel("Medida que necesita (mm)").count()) === 1);
  await linea(2).getByLabel("Medida que necesita (mm)").fill("PROFUNDIDAD - 50");
  await page.waitForTimeout(400);
  const resultado2 = norm(await page.getByLabel("Resultado del herraje 2").innerText());
  check("corredera: 530 mm, elige la telescópica de 450", resultado2 === `2 × ${PREFIJO} Telescópica 450 · necesita 530 mm: la más larga que entra`, resultado2);

  await linea(1).getByLabel("Cantidad").fill("PUERTAZ.cant * 2");
  await page.waitForTimeout(400);
  check("una fórmula mala marca la pestaña con error", norm(await pestaña.innerText()).includes("1 con error") && /Cantidad:/.test(await page.getByLabel("Resultado del herraje 1").innerText()), norm(await pestaña.innerText()));
  await linea(1).getByLabel("Cantidad").fill("PUESTAS.cant * 2");
  await page.screenshot({ path: join(shotsDir, "a1-herrajes-editor.png"), fullPage: true });

  await page.getByRole("button", { name: "Guardar cambios" }).first().click();
  await page.getByText(/Cambios guardados/).waitFor({ timeout: 30000 });
  const guardado = (await api("GET", `/modulos/${copiaId}`)).data;
  check(
    "guardado: las dos líneas, con la fórmula de medida",
    JSON.stringify(guardado.herrajes.map((h) => [h.herrajeId, h.formulaCantidad, h.formulaMedida, h.orden])) ===
      JSON.stringify([
        [cazoleta.id, "PUESTAS.cant * 2", null, 1],
        [t350.id, "2", "PROFUNDIDAD - 50", 2]
      ]),
    JSON.stringify(guardado.herrajes)
  );
  await page.reload();
  await pestaña.waitFor({ timeout: 30000 });
  await pestaña.click();
  await page.getByLabel("Resultado del herraje 2").waitFor({ timeout: 15000 });
  check("al volver a abrir, siguen las dos líneas", norm(await pestaña.innerText()).includes("2") && norm(await page.getByLabel("Resultado del herraje 2").innerText()).includes("Telescópica 450"));
  await context.close();

  // ---------------------------------------------------------------- API
  const evaluado = await api("POST", "/modulos/evaluar", { definicion: { ...guardado, herrajes: guardado.herrajes }, valores: { PROFUNDIDAD: 400 } });
  check("API evaluar: cantidad y medida que necesita", evaluado.status === 200 && JSON.stringify(evaluado.data.herrajes.map((h) => [h.cantidad, h.medidaNecesaria])) === JSON.stringify([[4, null], [2, 350]]), JSON.stringify(evaluado.data.herrajes));
  const base = { ...guardado, activo: true };
  delete base.id;
  const sinCampos = (definition) => {
    const { categoria, version, fechaActualizacion, imagen, tienePedidos, estadoFormulas, errores, ...rest } = definition;
    return rest;
  };
  const conInactivo = await api("PUT", `/modulos/${copiaId}`, sinCampos({ ...base, herrajes: [{ herrajeId: inactiva.id, formulaCantidad: "2", formulaMedida: null, orden: 1 }] }));
  check("API: un módulo activo con un modelo inactivo no se guarda", conInactivo.status === 400 && JSON.stringify(conInactivo.data).includes("está inactivo"), conInactivo.data?.message);
  const repetido = await api("PUT", `/modulos/${copiaId}`, sinCampos({ ...base, herrajes: [{ herrajeId: cazoleta.id, formulaCantidad: "2", orden: 1 }, { herrajeId: cazoleta.id, formulaCantidad: "1", orden: 2 }] }));
  check("API: un modelo repetido no se guarda", repetido.status === 400 && JSON.stringify(repetido.data).includes("repetido"));
  const malaFormula = await api("PUT", `/modulos/${copiaId}`, sinCampos({ ...base, herrajes: [{ herrajeId: cazoleta.id, formulaCantidad: "PUERTAZ.cant", orden: 1 }] }));
  check("API: un módulo activo con una fórmula de herraje con error no se guarda", malaFormula.status === 400 && JSON.stringify(malaFormula.data).includes("herraje 1"), JSON.stringify(malaFormula.data?.details ?? malaFormula.data).slice(0, 160));
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n")[0]}`, false);
} finally {
  if (copiaId) await api("DELETE", `/modulos/${copiaId}`);
  psql(`delete from modulos_herraje where "herrajeId" in (select id from herrajes where nombre like '${PREFIJO}%')`);
  psql(`delete from herrajes where nombre like '${PREFIJO}%'`);
  psql(`delete from tipos_herraje where nombre like '${PREFIJO}%'`);
  check("limpieza: la copia de la base queda como estaba", contar() === antes, contar());
  await browser.close();
}
const inesperados = errors.filter((error) => !/status of 400/.test(error));
check("sin errores en la consola", inesperados.length === 0, inesperados.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
