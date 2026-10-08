// Prueba de F7.2, pulido (spec §14.5 y los pendientes de DECISIONES 44): Edge sin ventana, contra el backend local
// (puerto 4100, copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// - Clientes de solicitudes anteriores: GET /api/pedidos-modulos/clientes busca por nombre o teléfono, sin repetidos,
//   con 400 si la búsqueda es corta y 403 para un carpintero; en el paso 1 del asistente, elegir uno completa nombre y
//   teléfono, y email y dirección solo si estaban vacíos.
// - Botones principales deshabilitados sin el degradado (el tema, en todas las pantallas).
// - El foco del teclado se ve en las grillas (también en la de Solicitudes de corte, la de los carpinteros), y con el
//   mouse no aparece el contorno.
// - Chips de plazo con contraste de 4,5:1 o más.
// - P14: en el formulario de corte (alta y edición), Siguiente en Cantos lleva al Resumen sin abrir el comprobante ni
//   pedirlo al servidor; "Revisar y enviar" ("Revisar y guardar" al editar) lo abre. No se guarda nada.
// Crea solicitudes "Prueba F7.2 ..." por la API y las borra al final. No imprime datos de clientes reales.
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
const PREFIJO = "Prueba F7.2";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f72-capturas");
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
const carpintero = jwt.sign({ id: psql("select id from usuarios where rol='CARPINTERO' limit 1"), email: "carp@local", rol: "CARPINTERO" }, SECRET, { expiresIn: "2h" });
const api = async (method, path, body, auth = token) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
const contar = () => psql(`select (select count(*) from pedidos) || '/' || (select count(*) from detalle_pedidos) || '/' || (select count(*) from historial_pedidos) || '/' || (select count(*) from pedidos_modulo)`);
const antes = contar();
const [colorA] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
  and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 1`).split("\n");
const ALACENA = psql(`select id from modulos where codigo = 'ALACENA_2_PUERTAS'`);
const fecha = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const creadas = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  // ---------------------------------------------------------------- A. API de clientes
  const alta = async (cliente, numeroContacto, extra = {}, dias = 10) => {
    const r = await api("POST", "/pedidos-modulos", { cliente, numeroContacto, fechaEntrega: fecha(dias), modulos: [{ moduloId: ALACENA, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorA, perfilCantoOrden: 1 }], ...extra });
    if (r.status !== 201) throw new Error(`no se pudo crear (${r.status})`);
    creadas.push(r.data.id);
    return r.data;
  };
  await alta(`${PREFIJO} Ferretería Norte`, "2664 55-1234", { emailContacto: "norte@example.com", direccionEntrega: "Calle Vieja 1" }, 5);
  await alta(`${PREFIJO} ferretería norte`, "2664551234", { direccionEntrega: "Calle Nueva 2" }, 6);
  await alta(`${PREFIJO} Carpintería Sur`, "2664778899", { emailContacto: "sur@example.com" });
  const porNombre = await api("GET", `/pedidos-modulos/clientes?q=${encodeURIComponent(`${PREFIJO} ferre`)}`);
  check(
    "API: por nombre, un cliente por nombre y teléfono, con lo más reciente y lo que falte de antes",
    porNombre.status === 200 &&
      porNombre.data.length === 1 &&
      porNombre.data[0].direccionEntrega === "Calle Nueva 2" &&
      porNombre.data[0].emailContacto === "norte@example.com",
    JSON.stringify(porNombre.data.map((c) => [c.cliente.replace(PREFIJO, "").trim(), c.direccionEntrega, c.emailContacto]))
  );
  const porTelefono = await api("GET", "/pedidos-modulos/clientes?q=2664-778");
  check("API: por teléfono, sin importar espacios y guiones", porTelefono.status === 200 && porTelefono.data.some((c) => c.cliente === `${PREFIJO} Carpintería Sur`));
  check("API: búsqueda corta, 400", (await api("GET", "/pedidos-modulos/clientes?q=a")).status === 400);
  check("API: carpintero, 403", (await api("GET", `/pedidos-modulos/clientes?q=${encodeURIComponent(PREFIJO)}`, undefined, carpintero)).status === 403);

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

  // ---------------------------------------------------------------- B. paso 1 del asistente
  await page.goto(`${APP}/modulos/nueva`);
  const nombreCliente = page.getByLabel("Nombre o razón social");
  await nombreCliente.waitFor({ timeout: 30000 });
  await nombreCliente.fill(`${PREFIJO} carpin`);
  const opcion = page.getByRole("option", { name: new RegExp(`${PREFIJO} Carpintería Sur`) });
  await opcion.waitFor({ timeout: 15000 });
  check("asistente: sugiere el cliente con su teléfono y email", norm(await opcion.innerText()) === `${PREFIJO} Carpintería Sur 2664778899 · sur@example.com`, norm(await opcion.innerText()));
  await page.screenshot({ path: join(shotsDir, "b1-sugerencias.png") });
  await page.getByLabel("Dirección de entrega").fill("Obra de este trabajo");
  await nombreCliente.fill("");
  await nombreCliente.fill(`${PREFIJO} carpin`);
  await opcion.waitFor({ timeout: 15000 });
  await opcion.click();
  check(
    "asistente: elegirlo completa nombre, teléfono y email, y no pisa la dirección escrita",
    (await nombreCliente.inputValue()) === `${PREFIJO} Carpintería Sur` &&
      (await page.getByLabel("Teléfono").inputValue()) === "2664778899" &&
      (await page.getByLabel("Email").inputValue()) === "sur@example.com" &&
      (await page.getByLabel("Dirección de entrega").inputValue()) === "Obra de este trabajo"
  );
  await nombreCliente.fill(`${PREFIJO} Cliente nuevo`);
  await page.waitForTimeout(800);
  check("asistente: un cliente nuevo se escribe igual (sin elegir de la lista)", (await nombreCliente.inputValue()) === `${PREFIJO} Cliente nuevo` && (await page.getByRole("option").count()) === 0);

  // ---------------------------------------------------------------- C. botón principal deshabilitado
  await page.goto(`${APP}/modulos?q=${encodeURIComponent("sin resultados zzzz")}`);
  const exportar = page.getByRole("button", { name: /^Exportar selección/ });
  await exportar.waitFor({ timeout: 30000 });
  const estilo = await exportar.evaluate((button) => ({ image: getComputedStyle(button).backgroundImage, shadow: getComputedStyle(button).boxShadow }));
  check("deshabilitado: sin el degradado ni la sombra (del tema)", (await exportar.isDisabled()) && estilo.image === "none" && estilo.shadow === "none", JSON.stringify(estilo));
  await page.goto(`${APP}/pedidos/nuevo`);
  const siguiente = page.getByRole("button", { name: "Siguiente" });
  await siguiente.waitFor({ timeout: 30000 });
  check("habilitado: el botón principal sigue con el degradado", (await siguiente.evaluate((button) => getComputedStyle(button).backgroundImage)).startsWith("linear-gradient"));

  // ---------------------------------------------------------------- D. foco del teclado en la grilla de Solicitudes (corte)
  await page.goto(`${APP}/pedidos`);
  const celda = page.locator(".MuiDataGrid-row").first().locator(".MuiDataGrid-cell").nth(1);
  await celda.waitFor({ timeout: 30000 });
  await celda.click();
  const conMouse = await celda.evaluate((cell) => getComputedStyle(cell).outlineStyle);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const enfocada = page.locator(".MuiDataGrid-cell:focus");
  const conTeclado = await enfocada.evaluate((cell) => ({ style: getComputedStyle(cell).outlineStyle, color: getComputedStyle(cell).outlineColor, width: getComputedStyle(cell).outlineWidth }));
  check("Solicitudes: con el mouse, sin contorno (como antes)", conMouse === "none", conMouse);
  check("Solicitudes: con el teclado, contorno grafito de 2 px", conTeclado.style === "solid" && conTeclado.color === "rgb(35, 32, 29)" && conTeclado.width === "2px", JSON.stringify(conTeclado));
  await page.screenshot({ path: join(shotsDir, "d1-foco.png") });

  // ---------------------------------------------------------------- F. P14: Siguiente lleva al Resumen
  let comprobantesPedidos = 0;
  page.on("request", (request) => request.url().includes("/orders/preview") && (comprobantesPedidos += 1));
  const alResumen = async (boton) => {
    for (let paso = 0; paso < 3; paso++) {
      await page.getByRole("button", { name: "Siguiente" }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole("heading", { name: "Datos de contacto" }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    const sinComprobante = (await page.getByRole("dialog").count()) === 0 && comprobantesPedidos === 0;
    await page.getByRole("button", { name: boton }).click();
    const abre = await page.getByRole("dialog").getByText("Constancia de solicitud").first().waitFor({ timeout: 60000 }).then(() => true, () => false);
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
    return { sinComprobante, abre };
  };
  // Alta de corte: el cliente, una pieza y los tres pasos.
  comprobantesPedidos = 0;
  await page.goto(`${APP}/pedidos/nuevo`);
  await page.getByLabel("Cliente").waitFor({ timeout: 30000 });
  await page.getByLabel("Cliente").fill(`${PREFIJO} corte`);
  await page.getByLabel("Teléfono de contacto").fill("2664000000");
  await page.getByRole("button", { name: "Siguiente" }).click();
  const placa = page.getByPlaceholder("Buscar material");
  await placa.click();
  await placa.fill("Blanco");
  await page.getByRole("option").first().click();
  const numeros = page.locator("tbody tr").first().locator('input[type="number"]');
  await numeros.nth(0).fill("700");
  await numeros.nth(1).fill("400");
  await numeros.nth(2).fill("2");
  // Ya esta en Cortes: los dos Siguiente que faltan y el Resumen.
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("heading", { name: "Datos de contacto" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const altaSinComprobante = (await page.getByRole("dialog").count()) === 0 && comprobantesPedidos === 0;
  await page.screenshot({ path: join(shotsDir, "f1-resumen-corte.png") });
  await page.getByRole("button", { name: "Revisar y enviar" }).click();
  const altaAbre = await page.getByRole("dialog").getByText("Constancia de solicitud").first().waitFor({ timeout: 60000 }).then(() => true, () => false);
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
  check("P14 alta de corte: Siguiente muestra el Resumen sin abrir el comprobante", altaSinComprobante, `pedidos de comprobante: ${comprobantesPedidos}`);
  check("P14 alta de corte: Revisar y enviar abre el comprobante", altaAbre);
  // Edicion de una de corte pendiente (no se guarda).
  const corte = psql(`select id from pedidos where tipo = 'CORTE' and estado = 'PENDIENTE' order by "fechaCreacion" desc limit 1`);
  comprobantesPedidos = 0;
  await page.goto(`${APP}/pedidos/${corte}/editar`);
  await page.getByRole("button", { name: "Siguiente" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const edicion = await alResumen("Revisar y guardar");
  check("P14 edición de corte: Siguiente muestra el Resumen sin abrir el comprobante", edicion.sinComprobante);
  check("P14 edición de corte: Revisar y guardar abre el comprobante", edicion.abre);

  // ---------------------------------------------------------------- E. contraste de los chips de plazo
  await page.goto(`${APP}/modulos?q=${encodeURIComponent(PREFIJO)}`);
  await page.locator(".MuiDataGrid-row").first().waitFor({ timeout: 30000 });
  const chips = await page.locator('.MuiDataGrid-cell[data-field="fechaEntrega"] .MuiChip-root, .MuiDataGrid-cell .MuiChip-root').evaluateAll((items) =>
    items.map((chip) => ({ text: chip.innerText.trim(), fg: getComputedStyle(chip).color, bg: getComputedStyle(chip).backgroundColor }))
  );
  const plazos = chips.filter((chip) => /^Faltan|^Vence|^Hoy|^Atrasada|^Mañana/.test(chip.text));
  const minimo = Math.min(...plazos.map((chip) => contraste(chip.fg, chip.bg)));
  check("chips de plazo: contraste de 4,5:1 o más", plazos.length > 0 && minimo >= 4.5, `${plazos.length} chips, mínimo ${minimo.toFixed(2)}`);
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
check("sin errores en la consola ni respuestas fallidas", errors.length === 0, errors.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
