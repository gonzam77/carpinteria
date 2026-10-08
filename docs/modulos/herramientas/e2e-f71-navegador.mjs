// Prueba en el navegador de "Cambiar medidas o colores" (F7.1, spec §10.6): Edge sin ventana, contra el backend local
// (puerto 4100, copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// - El botón está en cada módulo del Despiece de una solicitud editable; no en una en proceso ni en un módulo que ya no
//   está en el catálogo.
// - El diálogo abre con lo guardado (medidas, colores, perfil, fondo y observaciones); una medida vacía no deja seguir.
// - "Ver cómo queda": el aviso de cuántas piezas se reemplazan y cuántos cambios a mano se pierden, las piezas nuevas y
//   el pedido entero antes y después. Cambiar algo después obliga a volver a calcular.
// - "Recalcular el módulo": aviso, despiece sin las marcas del módulo recalculado e historial con las medidas de antes.
// Crea solicitudes "Prueba F7.1 navegador ..." y las borra al final. No imprime datos de clientes.
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
const PREFIJO = "Prueba F7.1 navegador";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f71-capturas");
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

if (psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralas antes (DELETE /api/orders/:id).`);
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
const contar = () => psql(`select (select count(*) from pedidos) || '/' || (select count(*) from detalle_pedidos) || '/' || (select count(*) from historial_pedidos) || '/' || (select count(*) from pedidos_modulo)`);
const antes = contar();
const [colorA, colorB] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
  and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 2`).split("\n");
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);
const ALACENA = psql(`select id from modulos where codigo = 'ALACENA_2_PUERTAS'`);
const fecha = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const creadas = [];
try {
  const alta = await api("POST", "/pedidos-modulos", {
    cliente: `${PREFIJO} principal`,
    numeroContacto: "2664000000",
    fechaEntrega: fecha,
    modulos: [
      { moduloId: BAJO, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1, observaciones: "Contra la pared" },
      { moduloId: ALACENA, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorA, perfilCantoOrden: 1 }
    ]
  });
  creadas.push(alta.data.id);
  const o = alta.data;
  const [m1, m2] = o.modulos;
  const primera = o.detalles.find((d) => d.pedidoModuloId === m1.id);
  await api("PUT", `/pedidos-modulos/${o.id}`, {
    cliente: o.cliente,
    numeroContacto: o.numeroContacto,
    fechaEntrega: o.fechaEntrega,
    fechaActualizacion: o.fechaActualizacion,
    detalles: o.detalles.map((d) => (d.id === primera.id ? { ...d, cantidad: d.cantidad + 1 } : d))
  });
  const piezasM1 = o.detalles.filter((d) => d.pedidoModuloId === m1.id).length;

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
  await page.goto(`${APP}/modulos/${o.id}`);
  const region1 = page.getByRole("region", { name: /^Módulo 1 · / });
  await region1.waitFor({ timeout: 30000 });
  const botones = page.getByRole("button", { name: "Cambiar medidas o colores" });
  check("un botón por módulo en una pendiente", (await botones.count()) === 2);

  // ---------------------------------------------------------------- abrir con lo guardado
  await region1.getByRole("button", { name: "Cambiar medidas o colores" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Ancho (mm)").waitFor({ timeout: 30000 });
  check("título del diálogo", norm(await dialogo.getByRole("heading").first().innerText()) === "Cambiar medidas o colores · Módulo 1 · Bajo mesada 2 puertas");
  const ancho = dialogo.getByLabel("Ancho (mm)");
  check(
    "abre con lo guardado: medidas y observaciones",
    (await ancho.inputValue()) === String(m1.valores.ANCHO) && (await dialogo.getByLabel("Alto (mm)").inputValue()) === String(m1.valores.ALTO) && (await dialogo.getByLabel("Observaciones del módulo").inputValue()) === "Contra la pared"
  );
  check("abre con los colores guardados", norm(await dialogo.getByLabel("Frentes").innerText()).startsWith(m1.colorFrentes.nombre.trim()), norm(await dialogo.getByLabel("Frentes").innerText()));
  await ancho.fill("");
  check("una medida vacía no deja ver cómo queda", await dialogo.getByRole("button", { name: "Ver cómo queda" }).isDisabled());
  await ancho.fill("900");

  // ---------------------------------------------------------------- vista previa
  await dialogo.getByRole("button", { name: "Ver cómo queda" }).click();
  const aviso = dialogo.getByText(/^Se van a reemplazar las/);
  await aviso.waitFor({ timeout: 60000 });
  const textoAviso = norm(await aviso.innerText());
  check("aviso: piezas que se reemplazan y el cambio a mano que se pierde", textoAviso.startsWith(`Se van a reemplazar las ${piezasM1} piezas de este módulo por`) && textoAviso.includes("Se pierden los cambios manuales de este módulo (1 pieza editada o agregada)."), textoAviso);
  const nuevas = await dialogo.getByRole("table", { name: "Piezas nuevas" }).locator("tbody tr").count();
  check("las piezas nuevas", nuevas > 0, String(nuevas));
  const resumen = norm(await dialogo.getByLabel("Pedido entero, antes y después").innerText());
  check("el pedido entero antes y después", /^Pedido entero: \d+ → \d+ placas · \$ ?[\d.]+ → \$ ?[\d.]+$/.test(resumen), resumen);
  await page.screenshot({ path: join(shotsDir, "a1-vista-previa.png") });
  await dialogo.getByLabel("Observaciones del módulo").fill("Contra la pared, sin zócalo");
  check("cambiar algo después obliga a volver a calcular", (await dialogo.getByRole("button", { name: "Ver cómo queda" }).count()) === 1 && (await aviso.count()) === 0);
  await dialogo.getByRole("button", { name: "Ver cómo queda" }).click();
  await aviso.waitFor({ timeout: 60000 });

  // ---------------------------------------------------------------- recalcular
  await dialogo.getByRole("button", { name: "Recalcular el módulo" }).click();
  const avisado = await page.getByText("Módulo 1 recalculado.").waitFor({ timeout: 60000 }).then(() => true, () => false);
  // El dialogo se va con una animacion corta: el aviso puede llegar antes de que termine.
  const cerrado = await dialogo.waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false);
  check("recalcular: cierra y avisa", avisado && cerrado);
  const guardada = (await api("GET", `/pedidos-modulos/${o.id}`)).data;
  const pm1 = guardada.modulos.find((m) => m.id === m1.id);
  check("guardado: ancho 900 y las observaciones nuevas", pm1.valores.ANCHO === 900 && pm1.observaciones === "Contra la pared, sin zócalo");
  check("despiece: el módulo 1 ya no tiene la pieza editada", (await region1.getByText("Editada", { exact: true }).count()) === 0 && guardada.detalles.filter((d) => d.pedidoModuloId === m1.id).every((d) => d.origen === "CALCULADO"));
  await page.getByRole("tab", { name: "Historial" }).click();
  const historial = norm(await page.getByText(/^Recalculó el módulo 1/).innerText());
  check("historial: el módulo, las medidas nuevas y las de antes", historial === `Recalculó el módulo 1 · Bajo mesada 2 puertas · 900 × 780 × 580 mm (antes 1.200 × 780 × 580 mm)`, historial);
  await page.screenshot({ path: join(shotsDir, "a2-historial.png") });

  // ---------------------------------------------------------------- sin el botón
  psql(`update pedidos_modulo set "moduloId" = null where id = '${m2.id}'`);
  await page.reload();
  await region1.waitFor({ timeout: 30000 });
  check("un módulo que ya no está en el catálogo no tiene el botón", (await page.getByRole("region", { name: /^Módulo 2 · / }).getByRole("button", { name: "Cambiar medidas o colores" }).count()) === 0 && (await botones.count()) === 1);
  psql(`update pedidos set estado = 'EN_PROCESO' where id = '${o.id}'`);
  await page.reload();
  await region1.waitFor({ timeout: 30000 });
  check("en proceso no hay botón", (await botones.count()) === 0);
  psql(`update pedidos set estado = 'PENDIENTE' where id = '${o.id}'`);
  await context.close();
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n")[0]}`, false);
} finally {
  for (const id of creadas) {
    psql(`update pedidos set estado = 'PENDIENTE' where id = '${id}' and not "stockReservado"`);
    const removed = await api("DELETE", `/orders/${id}`);
    if (removed.status !== 204 && removed.status !== 200) check("limpieza: borrar la solicitud de prueba", false, String(removed.status));
  }
  check("limpieza: la copia queda como estaba", contar() === antes, contar());
  await browser.close();
}
check("sin errores en la consola ni respuestas fallidas", errors.length === 0, errors.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
