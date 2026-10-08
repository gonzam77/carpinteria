// Prueba en el navegador de F7.4: el plano de cortes se calcula en un hilo aparte del navegador y la página no se congela.
// Edge sin ventana, contra el backend local (puerto 4100, copia del backup) y Vite (puerto 5180, con
// VITE_API_URL=http://127.0.0.1:4100/api).
// - Una solicitud de 20 módulos (varios segundos de cálculo): mientras se calcula el plano, la página sigue dibujando
//   (ningún cuadro tarda más de medio segundo) y el botón dice "Calculando...".
// - El plano da las mismas placas que guardó la solicitud.
// Crea una solicitud "Prueba F7.4 navegador ..." y la borra al final. No imprime datos de clientes.
//
// No es dependencia del proyecto: necesita Microsoft Edge y playwright-core en una carpeta aparte
// (`npm i playwright-core` en una carpeta temporal y PLAYWRIGHT_DIR=<esa carpeta>).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const { chromium } = createRequire(join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), "noop.js"))("playwright-core");
const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const APP = process.env.APP ?? "http://127.0.0.1:5180";
const API = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F7.4 navegador";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
let failures = 0;
let total = 0;
const check = (label, ok, detail = "") => {
  total++;
  console.log(`${ok ? "ok " : "MAL"} ${label}${detail ? ` | ${detail}` : ""}`);
  if (!ok) failures++;
};
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
const SEMILLA = 1 + (Date.now() % 13);

const creadas = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  const alta = await api("POST", "/pedidos-modulos", {
    cliente: `${PREFIJO} veinte`,
    numeroContacto: "2664000000",
    fechaEntrega: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    modulos: Array.from({ length: 20 }, (_, i) => ({ moduloId: BAJO, valores: { ANCHO: 600 + i * 30 + SEMILLA }, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 }))
  });
  if (alta.status !== 201) throw new Error(`no se pudo crear (${alta.status})`);
  creadas.push(alta.data.id);
  const o = alta.data;

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
  await page.goto(`${APP}/modulos/${o.id}`);
  const pestaña = page.getByRole("tab", { name: "Plano de cortes" });
  await pestaña.waitFor({ timeout: 30000 });
  // Cada cuadro que dibuja la página: si el cálculo la ocupara, habría un hueco de varios segundos entre cuadros.
  await page.evaluate(() => {
    const state = { last: performance.now(), maxGap: 0, running: true };
    (window).__cuadros = state;
    const tick = (now) => {
      state.maxGap = Math.max(state.maxGap, now - state.last);
      state.last = now;
      if (state.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const inicio = Date.now();
  await pestaña.click();
  const calculando = await page.getByRole("button", { name: "Calculando..." }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  const resultado = page.getByText(/^Placas necesarias: \d+ - Costo estimado: /);
  await resultado.waitFor({ timeout: 120000 });
  const tiempo = Date.now() - inicio;
  const maxGap = await page.evaluate(() => {
    const state = (window).__cuadros;
    state.running = false;
    return Math.round(state.maxGap);
  });
  check("mientras calcula, el botón dice Calculando...", calculando);
  check("la página no se congela: ningún cuadro tarda más de medio segundo", maxGap < 500, `cálculo de ${tiempo} ms, el cuadro más lento ${maxGap} ms`);
  const placas = Number((await resultado.innerText()).match(/Placas necesarias: (\d+)/)[1]);
  check("el plano da las placas que guardó la solicitud", placas === o.placasEstimadas, `${placas} y ${o.placasEstimadas}`);
  await context.close();
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n")[0]}`, false);
} finally {
  for (const id of creadas) {
    const removed = await api("DELETE", `/orders/${id}`);
    if (removed.status !== 204 && removed.status !== 200) check("limpieza: borrar la solicitud de prueba", false, String(removed.status));
  }
  check("limpieza: la copia queda como estaba", contar() === antes, contar());
  await browser.close();
}
check("sin errores en la consola", errors.length === 0, errors.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
