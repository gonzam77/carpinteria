// Prueba en el navegador del asistente "Nueva solicitud de modulos" (F4.4): Edge sin ventana contra el backend local
// (puerto 4100, copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// - Permisos: sin sesion lleva a /admin; un carpintero no ve el menu ni entra.
// - Los 4 pasos: validaciones (como el alta), busqueda y teclado en la grilla, colores por defecto, fondo por modulo,
//   copiar medidas, perfil, medidas mal escritas, colores sin el canto que hace falta, cantos por pieza (tomados del
//   perfil, marcados por lado), error de un canto que no existe, volver y avanzar, plano con las mismas placas que la
//   vista previa, una sola vista previa a la vez (con el servidor demorado a proposito), 409 MODULE_CHANGED, doble
//   click, bloqueo mientras se crea, respuesta perdida (busca la solicitud en vez de crearla otra vez), salir mientras
//   se crea, lo guardado igual a la ultima vista previa, catalogo que cambia con el asistente abierto y borrador
//   (guardar, recuperar con fecha vencida, descartar).
// - Paridad entre pantallas: el detalle comun de la solicitud creada da las mismas placas e importe guardados.
// - Corte: el detalle y el formulario siguen igual. Tablet y celular sin scroll horizontal. Barra del editor de modulos.
// Crea solicitudes "Prueba F4.4 ..." y las borra al final; sube un rato la version de un modulo (409) y desactiva otro
// un rato (catalogo que cambia), y los deja como estaban. No imprime datos de clientes.
//
// No es dependencia del proyecto: necesita Microsoft Edge y playwright-core en una carpeta aparte
// (`npm i playwright-core` en una carpeta temporal y PLAYWRIGHT_DIR=<esa carpeta>). Las capturas van a SHOTS_DIR
// (por defecto, una carpeta en el directorio temporal).
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
const PREFIJO = "Prueba F4.4";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f44-capturas");
mkdirSync(shotsDir, { recursive: true });
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok " : "MAL"} ${label}${detail ? ` | ${detail}` : ""}`);
  if (!ok) failures++;
};
const norm = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const money = (value) => norm(Number(value).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }));
const decimals = (value) => Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const addDays = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const hoy = ymd(new Date());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- datos de la copia
const restos = psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`);
if (restos !== "0") {
  console.log(`MAL hay ${restos} solicitudes "${PREFIJO}..." de una corrida anterior que se corto: borralas antes (DELETE /api/orders/:id).`);
  process.exit(1);
}
const userRow = (rol) => {
  const [id, nombre, apellido, email] = psql(`select id, nombre, apellido, email from usuarios where rol='${rol}' order by "fechaCreacion" limit 1`).split("|");
  return { id, nombre, apellido, email, rol };
};
const admin = userRow("ADMIN");
const carpintero = userRow("CARPINTERO");
const tokenFor = (user) => jwt.sign({ id: user.id, email: user.email, rol: user.rol }, SECRET, { expiresIn: "2h" });
const adminToken = tokenFor(admin);
const api = async (method, path, body) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};

const dias = Number(psql(`select "diasEntregaDefecto" from configuracion_modulos where id='default'`));
const fondoConfig = psql(`select trim(m.nombre) from materiales m join configuracion_modulos c on c."materialFondoId" = m.id where c.id='default'`);
const conCanto = (espesor) => `exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - ${espesor}) < 1e-6)`;
const placas18 = `p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null`;
const colores = psql(`select p.id || '|' || trim(p.nombre) from materiales p where ${placas18} and ${conCanto(0.45)} and ${conCanto(2)} and not ${conCanto(1)} order by p.nombre limit 2`)
  .split("\n")
  .map((row) => row.split("|"));
const [[colorAId, colorANombre], [colorBId, colorBNombre]] = colores;
const colorA = `${colorANombre} · 18 mm`;
const colorB = `${colorBNombre} · 18 mm`;
// Un color con canto de 0,45 pero sin el de 2 mm que piden las puertas del perfil Estandar.
const colorSinDos = `${psql(`select trim(p.nombre) from materiales p where ${placas18} and ${conCanto(0.45)} and not ${conCanto(2)} order by p.nombre limit 1`)} · 18 mm`;
const [fondoId, fondoNombre] = psql(`select id || '|' || trim(nombre) from materiales where tipo = 'PLACA' and activo and "espesorMm" = 5.5 and "anchoPlaca" is not null order by nombre limit 1`).split("|");
const fondoLabel = `${fondoNombre} · 5,5 mm`;
const BAJO = psql("select id from modulos where codigo='BAJO_MESADA_2_PUERTAS'");
const ALACENA = psql("select id from modulos where codigo='ALACENA_2_PUERTAS'");
const ESPECIERO = psql("select id from modulos where codigo='ESPECIERO'");
const versionAlacena = psql(`select version from modulos where id='${ALACENA}'`);
const corteId = psql(`select id from pedidos where tipo='CORTE' and exists (select 1 from detalle_pedidos d where d."pedidoId" = pedidos.id) order by "fechaCreacion" desc limit 1`);
const contar = () => ({
  pedidos: psql("select count(*) from pedidos"),
  modulos: psql("select count(*) from pedidos_modulo"),
  detalles: psql("select count(*) from detalle_pedidos"),
  historial: psql("select count(*) from historial_pedidos")
});
const antes = contar();
const especieroActivo = psql(`select activo from modulos where id='${ESPECIERO}'`);
const espesores = new Map(
  psql(`select id || '|' || "espesorMm" from materiales`)
    .split("\n")
    .map((row) => row.split("|"))
    .map(([id, mm]) => [id, Number(mm).toLocaleString("es-AR", { maximumFractionDigits: 2 })])
);
check(
  "datos de prueba",
  Boolean(colorAId && colorBId && fondoId && BAJO && ALACENA && ESPECIERO && corteId && fondoConfig && !colorSinDos.startsWith(" ·")) && dias > 0 && especieroActivo === "t",
  `fondo de la configuracion: ${fondoConfig}`
);

// ---------------------------------------------------------------- navegador
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const expectedErrors = [];
const draftKey = `draft:u:${admin.id}:modules:new`;
async function newPage(user, viewport = { width: 1366, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
  const page = await context.newPage();
  if (user) {
    page.on("console", (message) => message.type() === "error" && !message.location().url.includes("favicon") && errors.push(`console: ${message.text()}`));
    page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
    page.on("response", (response) => response.status() >= 400 && !response.url().includes("favicon") && errors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url().replace(API, "")}`));
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "";
      if (!failure.includes("ERR_ABORTED") && !failure.includes("aborted")) errors.push(`requestfailed: ${request.method()} ${request.url().replace(API, "")} ${failure}`);
    });
    await page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("authMethod", user.rol === "ADMIN" ? "admin" : "google");
      },
      { token: tokenFor(user), user }
    );
  }
  return { context, page };
}

const creados = new Set();
try {
  // ---------------------------------------------------------------- A. permisos
  {
    const { context, page } = await newPage(null);
    await page.goto(`${APP}/modulos/nueva`);
    await page.waitForURL("**/admin", { timeout: 15000 }).catch(() => undefined);
    check("sin sesion, /modulos/nueva lleva al ingreso de administracion", new URL(page.url()).pathname === "/admin", new URL(page.url()).pathname);
    await context.close();
  }
  {
    const { context, page } = await newPage(carpintero);
    await page.goto(`${APP}/`);
    await page.getByRole("link", { name: "Solicitar cortes" }).waitFor();
    check("carpintero: el menu no tiene Modulos a medida", (await page.getByRole("link", { name: "Modulos a medida" }).count()) === 0);
    await page.goto(`${APP}/modulos/nueva`);
    await page.waitForTimeout(1500);
    check("carpintero: /modulos/nueva vuelve al inicio", new URL(page.url()).pathname === "/", new URL(page.url()).pathname);
    await context.close();
  }

  // ---------------------------------------------------------------- B. asistente completo
  const { context, page } = await newPage(admin);
  const shot = (name, fullPage = false) => page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage });
  const previewSent = [];
  const previewDone = [];
  const previewFailed = [];
  const previewBodies = [];
  const posts = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (request.url().endsWith("/pedidos-modulos/preview")) previewSent.push(request);
    else if (request.url().endsWith("/pedidos-modulos")) posts.push(request);
  });
  page.on("requestfinished", (request) => request.url().endsWith("/pedidos-modulos/preview") && previewDone.push(request));
  page.on("requestfailed", (request) => request.url().endsWith("/pedidos-modulos/preview") && previewFailed.push(request));
  page.on("response", async (response) => {
    if (response.url().endsWith("/pedidos-modulos/preview") && response.request().method() === "POST" && response.status() === 200) previewBodies.push(await response.json().catch(() => null));
    if (response.url().endsWith("/pedidos-modulos") && response.request().method() === "POST" && response.status() === 201) {
      const body = await response.json().catch(() => null);
      if (body?.id) creados.add(body.id);
    }
  });
  const nextPreview = () => page.waitForResponse((response) => response.url().endsWith("/pedidos-modulos/preview") && response.request().method() === "POST", { timeout: 90000 });
  const firstError = async () => norm(await page.locator(".MuiAlert-standardError").first().innerText({ timeout: 5000 }).catch(() => ""));
  const next = () => page.getByRole("button", { name: "Siguiente" }).click();
  const selectIn = async (scope, label, option) => {
    await scope.getByRole("combobox", { name: new RegExp(`^${label}`) }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await page.waitForTimeout(120);
  };
  const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  const card = (n, nombre) => page.getByRole("region", { name: `Modulo ${n} · ${nombre}`, exact: true });
  const estados = async () => (await page.locator("section[data-modulo] .MuiChip-label").allInnerTexts()).filter((label) => label === "Listo" || label === "Revisar");
  const moduleButton = (nombre) => page.getByRole("button", { name: nombre, exact: true });

  await page.goto(`${APP}/`);
  const menu = page.getByRole("link", { name: "Modulos a medida" });
  await menu.waitFor();
  const menuItems = await page.locator("nav a, .MuiDrawer-root a").evaluateAll((links) => [...new Set(links.map((link) => link.textContent.trim()))]);
  check("menu: Modulos a medida debajo de Solicitar cortes", menuItems.indexOf("Modulos a medida") === menuItems.indexOf("Solicitar cortes") + 1, menuItems.join(" / "));
  await menu.click();
  await page.waitForURL("**/modulos/nueva");
  await page.getByRole("heading", { name: "Nueva solicitud de modulos" }).waitFor();
  check("menu: queda marcado en el asistente", await menu.evaluate((link) => link.classList.contains("Mui-selected")));

  // Paso 1
  const fecha = page.getByLabel("Fecha de entrega comprometida");
  await page.waitForFunction(() => document.querySelector('input[type="date"]')?.value, null, { timeout: 15000 });
  check("paso 1: fecha por defecto, hoy en Argentina + dias de la configuracion", (await fecha.inputValue()) === addDays(hoy, dias), await fecha.inputValue());
  check("paso 1: teclado de telefono en el input", (await page.getByLabel("Telefono").getAttribute("inputmode")) === "tel");
  await shot("w1-cliente");
  await next();
  let text = await firstError();
  check("paso 1: sin datos no avanza y dice que falta", text.includes("Completa el cliente") && text.includes("Completa el telefono"), text);
  check("paso 1: el error toma el foco", await page.evaluate(() => document.activeElement?.classList.contains("MuiAlert-root")));
  await page.getByLabel("Nombre o razon social").fill(`${PREFIJO} navegador`);
  await page.getByLabel("Telefono").fill("000000");
  await page.getByLabel("Email").fill("ana@gmail.com.");
  await next();
  text = await firstError();
  check("paso 1: email que el alta rechaza (como zod)", text === "El email no es valido.", text);
  await page.getByLabel("Email").fill("prueba@ejemplo.com");
  await page.getByLabel("Direccion de entrega").fill("Calle de prueba 123");
  await page.getByLabel("Referencia del trabajo").fill("Cocina de prueba");
  await fecha.fill("2020-01-01");
  await next();
  text = await firstError();
  check("paso 1: fecha anterior a hoy", text === "La fecha de entrega no puede ser anterior a hoy.", text);
  const fechaElegida = addDays(hoy, 20);
  await fecha.fill(fechaElegida);
  await next();

  // Paso 2
  const search = page.getByLabel("Buscar por nombre o codigo");
  await search.waitFor();
  await next();
  text = await firstError();
  check("paso 2: sin modulos no avanza", text === "Elegi al menos un modulo.", text);
  const cardNames = () => page.locator('[role="button"][aria-pressed]').evaluateAll((cards) => cards.map((element) => element.getAttribute("aria-label")));
  await search.fill("bajo mesada 2");
  await page.waitForTimeout(200);
  let names = await cardNames();
  check("paso 2: la busqueda filtra", names.length > 0 && names.every((name) => /bajo mesada 2/i.test(name)), names.join(" / "));
  await moduleButton("Bajo mesada 2 puertas").click();
  check("paso 2: al elegir se borra el error", (await page.locator(".MuiAlert-standardError").count()) === 0);
  check("paso 2: click marca la tarjeta (aria-pressed, el nombre no cambia)", (await moduleButton("Bajo mesada 2 puertas").getAttribute("aria-pressed")) === "true");
  await page.getByRole("button", { name: "Una mas de Bajo mesada 2 puertas" }).click();
  await search.fill("alacena 2");
  await moduleButton("Alacena 2 puertas").click();
  await search.fill("");
  await moduleButton("Especiero").focus();
  await page.keyboard.press("Enter");
  check("paso 2: Enter marca la tarjeta", (await moduleButton("Especiero").getAttribute("aria-pressed")) === "true");
  await page.getByRole("button", { name: "Una menos de Especiero" }).click();
  await page.waitForTimeout(150);
  check(
    "paso 2: al bajar a 0 el foco vuelve a la tarjeta",
    (await moduleButton("Especiero").getAttribute("aria-pressed")) === "false" && (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Especiero"
  );
  await page.keyboard.press(" ");
  check("paso 2: espacio la marca", (await moduleButton("Especiero").getAttribute("aria-pressed")) === "true");
  await page.keyboard.press(" ");
  check("paso 2: espacio la desmarca", (await moduleButton("Especiero").getAttribute("aria-pressed")) === "false");
  const contador = norm(await page.locator(".MuiChip-label", { hasText: /elegidos?$/ }).innerText());
  check("paso 2: contador", contador === "3 modulos elegidos", contador);
  await page.getByRole("combobox", { name: /^Categoria/ }).click();
  const categorias = await page.getByRole("option").allInnerTexts();
  await page.keyboard.press("Escape");
  check("paso 2: filtro de categorias", categorias[0] === "Todas" && categorias.length > 2, categorias.join(" / "));
  await shot("w2-modulos");
  await page.evaluate(() => window.scrollTo(0, 2000));
  await next();

  // Paso 3
  await page.getByText("Colores por defecto").waitFor();
  check("paso 3: al cambiar de paso vuelve arriba", (await page.evaluate(() => window.scrollY)) < 10);
  const c1 = card(1, "Bajo mesada 2 puertas");
  const c2 = card(2, "Bajo mesada 2 puertas");
  const c3 = card(3, "Alacena 2 puertas");
  check("paso 3: una tarjeta por unidad, en el orden elegido, con encabezado", (await c1.count()) === 1 && (await c2.count()) === 1 && (await c3.count()) === 1);
  check("paso 3: medidas por defecto del catalogo", (await c1.getByLabel("Ancho (mm)").inputValue()) === "1200" && (await c3.getByLabel("Ancho (mm)").inputValue()) === "780");
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  text = await firstError();
  check("paso 3: sin colores no avanza y dice que falta", text.includes("Modulo 1 (Bajo mesada 2 puertas): falta elegir el color de esqueleto, el color de frentes, el color de los cantos"), text.slice(0, 160));
  check("paso 3: colores sin elegir dicen que hacer", (await c1.getByText("Elegi un color").count()) === 3);
  const barra = page.locator(".MuiPaper-root", { hasText: "Colores por defecto" });
  await selectIn(barra, "Esqueleto", colorA);
  await selectIn(barra, "Frentes", colorB);
  await selectIn(barra, "Cantos", colorA);
  await barra.getByRole("button", { name: "Aplicar a todos" }).click();
  check("paso 3: Aplicar a todos completa los colores", JSON.stringify(await estados()) === '["Listo","Listo","Listo"]', (await estados()).join(", "));
  // Un color de cantos sin el espesor que piden las puertas: la tarjeta queda para revisar y lo dice.
  await selectIn(c1, "Cantos", new RegExp(`^${colorSinDos.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  const helperCantos = norm(await c1.locator(".MuiFormHelperText-root.Mui-error").allInnerTexts());
  check("paso 3: color de cantos sin el canto de 2 mm marca la tarjeta", (await estados())[0] === "Revisar" && helperCantos.includes("sin canto de 2 mm"), helperCantos.slice(0, 120));
  await selectIn(c1, "Cantos", colorA);
  const fondoTexto = norm(await c1.getByRole("combobox", { name: /^Material de fondo/ }).innerText());
  check("paso 3: fondo del catalogo por defecto", fondoTexto === `El del catalogo (${fondoConfig})`, fondoTexto);
  await selectIn(c2, "Material de fondo", fondoLabel);
  check("paso 3: fondo elegido en el modulo 2", (await c2.getByText("Elegido para este modulo").count()) === 1);
  const ancho1 = c1.getByLabel("Ancho (mm)");
  await ancho1.fill("");
  await page.waitForTimeout(150);
  const vacia = norm(await c1.locator(".MuiFormHelperText-root.Mui-error").first().innerText().catch(() => ""));
  check("paso 3: medida vacia marca error en la tarjeta", (await estados())[0] === "Revisar" && vacia === "Falta el valor", vacia);
  await ancho1.fill("1.200");
  await page.waitForTimeout(150);
  const miles = norm(await c1.locator(".MuiFormHelperText-root.Mui-error").first().innerText().catch(() => ""));
  check("paso 3: punto de miles: lo dice en vez de leer 1,2 mm", miles === "Escribi la medida sin punto de miles (por ejemplo 1200)", miles);
  await ancho1.fill("720mm");
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  text = await firstError();
  check("paso 3: con errores no avanza y nombra la medida", text.startsWith("Modulo 1 (Bajo mesada 2 puertas): ANCHO: Escribi solo el numero, en mm"), text.slice(0, 160));
  await ancho1.fill("900");
  check("paso 3: al corregir se borra la lista de problemas", (await page.locator(".MuiAlert-standardError").count()) === 0);
  await c1.getByLabel("Alto (mm)").fill("800");
  await page.waitForTimeout(150);
  check("paso 3: medida corregida", (await estados())[0] === "Listo");
  check("paso 3: copiar medidas, en singular", (await c1.getByRole("button", { name: "Copiar medidas al otro igual" }).count()) === 1 && (await c2.getByRole("button", { name: /^Copiar medidas/ }).count()) === 0);
  await c1.getByRole("button", { name: "Copiar medidas al otro igual" }).click();
  check("paso 3: copio ancho y alto al modulo 2", (await c2.getByLabel("Ancho (mm)").inputValue()) === "900" && (await c2.getByLabel("Alto (mm)").inputValue()) === "800");
  await c1.getByLabel("Observaciones del modulo").fill("Va contra la pared");
  await c3.getByRole("button", { name: "Economico" }).click();
  check("paso 3: perfil de cantos", (await c3.getByRole("button", { name: "Economico" }).getAttribute("aria-pressed")) === "true");
  await shot("w3-medidas");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(300);
  check("paso 3 en tablet: sin scroll horizontal", await noHorizontalScroll());
  await shot("w3-medidas-tablet");
  await page.setViewportSize({ width: 1366, height: 900 });

  // Paso 4
  let response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  await page.getByText("Calculando placas y presupuesto con el optimizador").waitFor({ timeout: 10000 }).catch(() => undefined);
  let preview = await (await response).json();
  const body = JSON.parse(previewSent[previewSent.length - 1].postData());
  const permitidos = new Set(["moduloId", "valores", "colorEsqueletoId", "colorFrentesId", "colorCantoId", "perfilCantoOrden", "materialFondoId", "observaciones", "cantosOverride"]);
  check(
    "vista previa: manda los datos cargados y nada mas",
    body.cliente === `${PREFIJO} navegador` &&
      body.numeroContacto === "000000" &&
      body.modulos.length === 3 &&
      body.modulos.every((line) => Object.keys(line).every((key) => permitidos.has(key))) &&
      JSON.stringify(body.modulos.map((line) => line.moduloId)) === JSON.stringify([BAJO, BAJO, ALACENA]) &&
      JSON.stringify(body.modulos[0].valores) === JSON.stringify({ ANCHO: 900, ALTO: 800, PROFUNDIDAD: 580 }) &&
      JSON.stringify(body.modulos[1].valores) === JSON.stringify({ ANCHO: 900, ALTO: 800, PROFUNDIDAD: 580 }) &&
      body.modulos[0].observaciones === "Va contra la pared" &&
      body.modulos[0].materialFondoId === undefined &&
      body.modulos[1].materialFondoId === fondoId &&
      body.modulos[2].perfilCantoOrden === 2 &&
      body.modulos.every((line) => line.colorEsqueletoId === colorAId && line.colorFrentesId === colorBId && line.colorCantoId === colorAId && !line.cantosOverride),
    JSON.stringify(body.modulos.map((line) => Object.keys(line)))
  );
  const despiece = (n, nombre) => page.getByRole("region", { name: `Modulo ${n} · ${nombre}`, exact: true });
  await despiece(1, "Bajo mesada 2 puertas").waitFor();
  const filasPorModulo = [1, 2, 3].map((posicion) => preview.detalles.filter((row) => row.posicionModulo === posicion).length);
  const filasEnPantalla = [
    await despiece(1, "Bajo mesada 2 puertas").locator("tbody tr").count(),
    await despiece(2, "Bajo mesada 2 puertas").locator("tbody tr").count(),
    await despiece(3, "Alacena 2 puertas").locator("tbody tr").count()
  ];
  check("paso 4: una tarjeta por modulo con sus piezas", JSON.stringify(filasPorModulo) === JSON.stringify(filasEnPantalla) && filasPorModulo.every((count) => count > 0), filasEnPantalla.join(", "));
  // Los cantos que se ven son los de las filas del servidor (el perfil), lado por lado.
  const espesorDe = new Map(preview.estimacionDetalle.porCanto.map((item) => [item.cantoId, item.espesorMm]));
  const ladosFila = (row) => [row.cantoLargo1Id, row.cantoLargo2Id, row.cantoAncho1Id, row.cantoAncho2Id].map((id) => (id ? espesorDe.get(id) : null));
  const filasServidor = preview.detalles.filter((row) => row.posicionModulo === 1);
  let cantosIguales = true;
  for (let index = 0; index < filasServidor.length; index += 1) {
    const pressed = await despiece(1, "Bajo mesada 2 puertas").locator("tbody tr").nth(index).getByRole("button").evaluateAll((buttons) => buttons.slice(0, 4).map((button) => button.getAttribute("aria-pressed") === "true"));
    const servidor = ladosFila(filasServidor[index]).map((value) => value !== null);
    if (JSON.stringify(pressed) !== JSON.stringify(servidor)) cantosIguales = false;
  }
  check("paso 4: los cantos de la tabla coinciden con las filas del servidor", cantosIguales);

  const panel = page.getByRole("region", { name: "Resumen", exact: true });
  const panelOk = async (data, label) => {
    const panelText = norm(await panel.innerText());
    const placas = [...panelText.matchAll(/(\d+) placas?\b/g)].reduce((sum, match) => sum + Number(match[1]), 0);
    const piezas = data.detalles.reduce((sum, row) => sum + Number(row.cantidad), 0);
    const m2 = data.estimacionDetalle.porMaterial.every((item) =>
      panelText.includes(`${item.nombre.trim()} · ${espesores.get(item.materialId)} mm ${item.placas} ${item.placas === 1 ? "placa" : "placas"} ${decimals(item.mm2 / 1e6)} m² de piezas`)
    );
    const metros = data.estimacionDetalle.porCanto.every((item) => panelText.includes(`${decimals(item.mm / 1000)} m`));
    const importes = [
      `Placas ${money(data.costoPlacas)}`,
      `Mano de obra por cortes ${money(data.costoManoObraCortes)}`,
      `Cantos (material y pegado) ${money(data.costoCantos)}`,
      `Total ${money(data.presupuestoConHerrajes)}`
    ].every((part) => panelText.includes(part));
    check(
      `${label}: el resumen es el de la vista previa (placas, m², canto e importes)`,
      placas === data.placasEstimadas && panelText.includes(`Modulos 3 Piezas ${piezas}`) && m2 && metros && importes && !panelText.includes("Herrajes") && panelText.includes("Las placas finales las define el optimizador al cortar."),
      `${placas} placas en pantalla, ${data.placasEstimadas} en la vista previa`
    );
  };
  await panelOk(preview, "paso 4");
  await shot("w4-revisar");
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(200);
  const top = await panel.evaluate((element) => Math.round(element.getBoundingClientRect().top));
  check("paso 4: el resumen queda fijo al costado al bajar", top >= 80 && top <= 96, `top ${top}px`);
  await shot("w4-revisar-scroll");
  await page.evaluate(() => window.scrollTo(0, 0));

  // Cantos (P12): una sola vista previa a la vez. Con el servidor lento (3 s de demora), tres cambios seguidos dan
  // la que estaba en curso mas una sola con los tres, sin cortar ninguna; mientras falta, no deja crear.
  const fila = despiece(1, "Bajo mesada 2 puertas").locator("tbody tr").first();
  const filaPreview = filasServidor[0];
  const codigo = filaPreview.piezaCodigo;
  const lado = (index) => fila.getByRole("button").nth(index);
  const elegir = async (index, opcion) => {
    await lado(index).click();
    await page.getByRole("menuitem", { name: new RegExp(`^${opcion}`) }).click();
  };
  const objetivo = async (index) => ((await lado(index).getAttribute("aria-pressed")) === "true" ? "Sin canto" : "2 mm");
  const t0 = await objetivo(0);
  const t2 = await objetivo(2);
  const t3 = await objetivo(3);
  // Elegir lo que ya tiene no cambia nada ni recalcula.
  const enviadosSinCambio = previewSent.length;
  await lado(0).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${t0 === "Sin canto" ? "0,45 mm" : "Sin canto"}`) }).click();
  await page.waitForTimeout(1200);
  check("paso 4: elegir el canto que ya tiene no recalcula", previewSent.length === enviadosSinCambio && (await fila.getByText("Editada", { exact: true }).count()) === 0);
  const enviadosAntes = previewSent.length;
  const hechosAntes = previewDone.length;
  const cortadasAntes = previewFailed.length;
  const demora = async (route) => {
    await sleep(3000);
    await route.continue().catch(() => undefined);
  };
  await page.route("**/pedidos-modulos/preview", demora);
  const inicio = Date.now();
  const tiempos = [];
  await elegir(0, t0);
  tiempos.push(Date.now() - inicio);
  check("paso 4: avisa que se va a recalcular", (await page.getByText("Cambiaste cantos: en un momento se recalcula el resumen.").count()) === 1);
  await elegir(2, t2);
  tiempos.push(Date.now() - inicio);
  await elegir(3, t3);
  tiempos.push(Date.now() - inicio);
  const postsDuranteCalculo = posts.length;
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.waitForTimeout(200);
  check(
    "paso 4: mientras falta recalcular no deja crear",
    posts.length === postsDuranteCalculo && (await page.getByText("Espera a que termine el calculo para crear la solicitud.").count()) === 1
  );
  for (let waited = 0; previewDone.length < hechosAntes + 2 && waited < 60000; waited += 100) await page.waitForTimeout(100);
  await page.waitForTimeout(1500);
  await page.unroute("**/pedidos-modulos/preview", demora);
  preview = previewBodies[previewBodies.length - 1];
  const sentBody = JSON.parse(previewSent[previewSent.length - 1].postData());
  const override = sentBody.modulos[0].cantosOverride?.[codigo];
  const esperado = (t) => (t === "Sin canto" ? null : 2);
  check(
    "paso 4: cambios mientras se calcula, una sola vista previa mas con los tres y ninguna cortada",
    previewSent.length - enviadosAntes === 2 &&
      previewDone.length - hechosAntes === 2 &&
      previewFailed.length === cortadasAntes &&
      override &&
      override.LARGO_1 === esperado(t0) &&
      override.ANCHO_1 === esperado(t2) &&
      override.ANCHO_2 === esperado(t3),
    `${previewSent.length - enviadosAntes} enviadas, ${previewDone.length - hechosAntes} completas, ${previewFailed.length - cortadasAntes} cortadas; cambios a los ${tiempos.join(", ")} ms`
  );
  check(
    "paso 4: al terminar queda lista y se borra el aviso de espera",
    (await page.getByText("Despiece y resumen calculados por el servidor.").count()) === 1 && (await page.getByText("Espera a que termine el calculo para crear la solicitud.").count()) === 0
  );
  const editada = preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo);
  const azules = await fila.getByRole("button").evaluateAll((buttons) => buttons.slice(0, 4).map((button) => (button.getAttribute("aria-label") ?? "").endsWith("cambiado a mano")));
  check("paso 4: la pieza vuelve como EDITADO, con la marca y solo los lados cambiados", editada?.origen === "EDITADO" && (await fila.getByText("Editada", { exact: true }).count()) === 1 && JSON.stringify(azules) === "[true,false,true,true]", JSON.stringify(azules));
  await panelOk(preview, "paso 4 despues del cambio");

  // Un canto que el color no tiene: el menu lo avisa; si se elige igual, error claro, la ultima vista previa sigue a la
  // vista y no deja crear (con el detalle junto al boton).
  await lado(1).click();
  const nota = norm(await page.getByRole("menuitem", { name: /^1 mm/ }).innerText());
  check("paso 4: el menu avisa el espesor que el color no tiene", nota.includes("No hay canto de este espesor para el color elegido"), nota);
  response = nextPreview();
  await page.getByRole("menuitem", { name: /^1 mm/ }).click();
  const fallida = await response;
  await page.getByText("Volver a calcular").waitFor();
  text = await firstError();
  const repeticiones = (text.match(/Falta el canto de 1 mm/g) ?? []).length;
  check("paso 4: canto que no existe, error claro y sin repetir", fallida.status() === 400 && repeticiones === 1 && (await despiece(1, "Bajo mesada 2 puertas").count()) === 1, `${fallida.status()} ${text.slice(0, 140)}`);
  const postsAntes = posts.length;
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.waitForTimeout(300);
  const junto = norm(await page.locator(".MuiAlert-standardError").last().innerText());
  check(
    "paso 4: con error no crea y dice por que junto al boton",
    posts.length === postsAntes && junto.startsWith("Todavia no se puede crear: corregi lo que dice el aviso del despiece.") && junto.includes("Falta el canto de 1 mm"),
    junto.slice(0, 160)
  );
  await shot("w4-error-canto");
  response = nextPreview();
  await page.getByRole("button", { name: `Volver a los cantos del perfil en ${filaPreview.nombreProducto}` }).click();
  preview = await (await response).json();
  check(
    "paso 4: volver al perfil quita la marca y muestra los cantos del perfil al instante",
    preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo)?.origen !== "EDITADO" && (await fila.getByText("Editada", { exact: true }).count()) === 0
  );
  response = nextPreview();
  await elegir(0, t0);
  preview = await (await response).json();
  check("paso 4: pieza editada otra vez", preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo)?.origen === "EDITADO");

  // Volver al paso 3 y avanzar recalcula
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByText("Colores por defecto").waitFor();
  check("volver al paso 3 conserva el cambio de canto", (await c1.getByText("1 pieza con cantos cambiados").count()) === 1 && (await c1.getByRole("button", { name: "Volver todas al perfil" }).count()) === 1);
  response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  preview = await (await response).json();
  check("avanzar de nuevo recalcula", preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo)?.origen === "EDITADO");
  await despiece(1, "Bajo mesada 2 puertas").waitFor();

  // Plano de cortes: mismas placas que la vista previa (paridad), con "Calculando..." mientras calcula.
  await page.getByText("Plano de cortes", { exact: true }).click();
  const plano = page.locator(".MuiAccordion-root");
  await plano.getByRole("button", { name: "Optimizar cortes" }).click();
  await plano.getByText(/^Placas necesarias: \d+/).waitFor({ timeout: 60000 });
  const planoTexto = norm(await plano.getByText(/^Placas necesarias: \d+/).innerText());
  check("plano: mismas placas que la vista previa y sin importes", planoTexto === `Placas necesarias: ${preview.placasEstimadas}` && !norm(await plano.innerText()).includes("Costo"), planoTexto);
  await shot("w5-plano");

  for (const [width, height, label] of [
    [768, 1024, "tablet"],
    [390, 844, "celular"]
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    check(`paso 4 en ${label}: sin scroll horizontal`, await noHorizontalScroll());
    await shot(`w4-${label}`);
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForTimeout(300);

  // 409: el modulo cambio despues de la vista previa. Avisa, revisa el catalogo, recalcula solo y crea con la version nueva.
  psql(`update modulos set version = version + 1 where id = '${ALACENA}'`);
  response = nextPreview();
  const conflicto = page.waitForResponse((r) => r.url().endsWith("/pedidos-modulos") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  check("crear con el modulo cambiado: 409", (await conflicto).status() === 409);
  expectedErrors.push(/^HTTP 409 POST \/pedidos-modulos$/, /status of 409/);
  preview = await (await response).json();
  await page.waitForTimeout(500);
  text = norm(await page.locator(".MuiAlert-standardError").last().innerText());
  const avisoVersion = norm(await page.locator(".MuiAlert-standardWarning").first().innerText().catch(() => ""));
  check(
    "crear con el modulo cambiado: avisa, revisa el catalogo y vuelve a calcular",
    text.includes("Volve a revisar la vista previa antes de crear la solicitud.") && preview.modulos[2].version === Number(versionAlacena) + 1 && avisoVersion.includes("Se usa la version nueva de Alacena 2 puertas"),
    `${text.slice(0, 100)} || ${avisoVersion.slice(0, 100)}`
  );

  // Respuesta perdida y busqueda caida: el servidor crea A, pero no llegan ni la respuesta ni la busqueda inmediata.
  // Doble click: un solo alta. Mientras se crea, la tabla no se toca.
  const postsPrevios = posts.length;
  let creadaA = null;
  const perdida = async (route) => {
    await sleep(1500);
    const answer = await route.fetch();
    creadaA = await answer.json().catch(() => null);
    if (creadaA?.id) creados.add(creadaA.id);
    await route.abort("connectionreset");
  };
  let busquedasCortadas = 0;
  const busquedaCaida = async (route) => {
    if (busquedasCortadas === 0) {
      busquedasCortadas += 1;
      return route.abort("connectionreset");
    }
    return route.continue();
  };
  const listado = /\/pedidos-modulos\?clave=/;
  await page.route("**/pedidos-modulos", perdida);
  await page.route(listado, busquedaCaida);
  expectedErrors.push(/^requestfailed: (POST|GET) \/pedidos-modulos(\?clave=\S*)? net::ERR_CONNECTION_RESET$/, /ERR_CONNECTION_RESET/);
  await page.getByRole("button", { name: "Crear solicitud" }).dblclick();
  await page.waitForTimeout(300);
  check("mientras se crea, los cantos y volver quedan bloqueados", (await lado(0).isDisabled()) && (await page.getByRole("button", { name: "Volver", exact: true }).isDisabled()));
  await page.getByText("no se pudo revisar si quedo cargada", { exact: false }).waitFor({ timeout: 60000 });
  await page.unroute("**/pedidos-modulos", perdida);
  check(
    "respuesta perdida y busqueda caida: un solo alta, y dice que no pudo revisar (no que no se creo)",
    posts.length - postsPrevios === 1 &&
      Boolean(creadaA?.numero) &&
      psql(`select count(*) from pedidos where cliente like '${PREFIJO} navegador%'`) === "1" &&
      /^[0-9a-f-]{36}$/.test(JSON.parse(posts[posts.length - 1].postData()).claveAlta ?? ""),
    `${posts.length - postsPrevios} altas`
  );
  // Se cambia un canto: lo que se ve ya no es lo que se mando. Al crear, primero se busca con lo que se mando.
  response = nextPreview();
  await elegir(3, await objetivo(3));
  preview = await (await response).json();
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor();
  const postsAntesDeReintentar = posts.length;
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  const yaCargada = page.locator(".MuiAlert-standardError", { hasText: `La solicitud M-${creadaA.numero} ya habia quedado cargada` });
  await yaCargada.waitFor({ timeout: 30000 });
  check(
    "reintento con cambios: avisa que ya habia quedado cargada, ofrece verla y no crea otra",
    posts.length === postsAntesDeReintentar && (await yaCargada.getByRole("button", { name: `Ver M-${creadaA.numero}` }).count()) === 1
  );
  await page.unroute(listado, busquedaCaida);
  // Otra vez Crear: ahora si, una nueva con lo que se ve.
  const respuestaB = page.waitForResponse((r) => r.url().endsWith("/pedidos-modulos") && r.request().method() === "POST" && r.status() === 201, { timeout: 90000 });
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  const order = await (await respuestaB).json();
  creados.add(order.id);
  await page.getByRole("heading", { name: /^Solicitud M-\d+ creada$/ }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  const titulo = norm(await page.getByRole("heading", { name: /^Solicitud M-\d+ creada$/ }).innerText());
  check("despues del aviso, crear otra vez crea una nueva con lo que se ve", titulo === `Solicitud M-${order.numero} creada` && order.numero !== creadaA.numero && posts.length === postsAntesDeReintentar + 1, titulo);
  check("exito: el titulo toma el foco", await page.evaluate(() => document.activeElement?.tagName === "H1" && document.activeElement.textContent.includes("creada")));
  const createBody = JSON.parse(posts[posts.length - 1].postData());
  check(
    "alta: manda la version de la ultima vista previa y los datos del cliente",
    createBody.modulos.every((line, index) => line.version === preview.modulos[index].version) &&
      createBody.emailContacto === "prueba@ejemplo.com" &&
      createBody.direccionEntrega === "Calle de prueba 123" &&
      createBody.observaciones === "Cocina de prueba" &&
      createBody.fechaEntrega === fechaElegida
  );
  const componentes = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado", "faltanteStock", "costoHerrajes", "presupuestoConHerrajes"];
  const guardada = (await api("GET", `/pedidos-modulos/${order.id}`)).data;
  const distintos = componentes.filter((key) => guardada[key] !== preview[key]);
  check("alta: guarda lo que mostro la ultima vista previa", distintos.length === 0 && guardada.detalles.length === preview.detalles.length, distintos.join(", "));
  const pm = psql(`select posicion || ':' || coalesce("materialFondoId", '-') || ':' || coalesce(observaciones, '-') || ':' || "perfilCantoOrden" from pedidos_modulo where "pedidoId" = '${order.id}' order by posicion`).split("\n");
  check(
    "alta: fondo, observaciones y perfil por modulo",
    pm.length === 3 && pm[0].startsWith("1:") && pm[0].includes(":Va contra la pared:1") && pm[1].startsWith(`2:${fondoId}:`) && pm[2].endsWith(":2"),
    pm.map((row) => row.replace(fondoId, "fondo")).join(" ; ")
  );
  const origen = psql(`select d.origen from detalle_pedidos d join pedidos_modulo pm on pm.id = d."pedidoModuloId" where d."pedidoId" = '${order.id}' and pm.posicion = 1 and d."piezaCodigo" = '${codigo}'`);
  check("alta: la pieza cambiada queda EDITADO", origen === "EDITADO", origen);
  const borrador = await page.evaluate((key) => [localStorage.getItem(key), localStorage.getItem(`${key}~live`)], draftKey);
  check("alta: borra el borrador", borrador[0] === null && borrador[1] === null);
  await shot("w6-creada");

  // Cargar otra: asistente vacio, sin borrador
  await page.getByRole("button", { name: "Cargar otra solicitud" }).click();
  await page.getByLabel("Nombre o razon social").waitFor();
  check(
    "cargar otra: arranca de cero con la fecha por defecto",
    (await page.getByLabel("Nombre o razon social").inputValue()) === "" && (await fecha.inputValue()) === addDays(hoy, dias) && (await page.getByText("Tenes una solicitud sin terminar").count()) === 0
  );

  // ---------------------------------------------------------------- C. salir mientras se crea
  const armar = async (cliente, modulos) => {
    await page.getByLabel("Nombre o razon social").fill(cliente);
    await page.getByLabel("Telefono").fill("222222");
    await next();
    await search.waitFor();
    for (const nombre of modulos) await moduleButton(nombre).click();
    await next();
    await page.getByText("Colores por defecto").waitFor();
    await selectIn(barra, "Esqueleto", colorA);
    await selectIn(barra, "Frentes", colorB);
    await selectIn(barra, "Cantos", colorA);
    await barra.getByRole("button", { name: "Aplicar a todos" }).click();
  };
  await armar(`${PREFIJO} salir`, ["Bajo mesada 2 puertas"]);
  response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  await response;
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor();
  const lenta = async (route) => {
    await sleep(3000);
    await route.continue().catch(() => undefined);
  };
  await page.route("**/pedidos-modulos", lenta);
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(`${APP}/`);
  await page.getByRole("link", { name: "Modulos a medida" }).click();
  const esperando = await page
    .getByText("Se esta terminando de crear la solicitud que mandaste antes de salir de la pantalla.")
    .waitFor({ state: "visible", timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  await page.getByRole("heading", { name: /^Solicitud M-\d+ creada$/ }).waitFor({ timeout: 60000 });
  await page.unroute("**/pedidos-modulos", lenta);
  check(
    "salir mientras se crea: al volver espera ese alta y muestra el exito, sin ofrecer el borrador",
    esperando && psql(`select count(*) from pedidos where cliente = '${PREFIJO} salir'`) === "1" && (await page.getByText("Tenes una solicitud sin terminar").count()) === 0
  );
  for (const id of psql(`select id from pedidos where cliente like '${PREFIJO}%'`).split("\n").filter(Boolean)) creados.add(id);
  await page.getByRole("button", { name: "Cargar otra solicitud" }).click();
  await page.getByLabel("Nombre o razon social").waitFor();

  // ---------------------------------------------------------------- C2. salir mientras se crea y la respuesta se pierde
  // La marca de envio queda en el borrador en el momento. Al volver, se ofrece el borrador con el aviso y, al crearla,
  // primero se busca: aparece la que ya se habia creado y no se crea otra.
  await armar(`${PREFIJO} perdida`, ["Bajo mesada 2 puertas"]);
  response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  await response;
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor();
  let creadaC = null;
  const perdidaLenta = async (route) => {
    await sleep(2000);
    const answer = await route.fetch();
    creadaC = await answer.json().catch(() => null);
    if (creadaC?.id) creados.add(creadaC.id);
    await route.abort("connectionreset");
  };
  await page.route("**/pedidos-modulos", perdidaLenta);
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(`${APP}/`);
  await page.getByRole("link", { name: "Modulos a medida" }).click();
  const bannerPerdida = page.locator(".MuiAlert-root", { hasText: "Tenes una solicitud sin terminar" });
  await bannerPerdida.waitFor({ timeout: 60000 });
  await page.unroute("**/pedidos-modulos", perdidaLenta);
  check(
    "salir y perder la respuesta: al volver, el borrador trae el aviso de que se estaba creando",
    norm(await bannerPerdida.innerText()).includes("Se estaba creando cuando se cerro la pantalla") && Boolean(creadaC?.numero)
  );
  await bannerPerdida.getByRole("button", { name: "Recuperar" }).click();
  await page.getByText("Colores por defecto").waitFor();
  response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  await response;
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor();
  const postsC = posts.length;
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.getByRole("heading", { name: /^Solicitud M-\d+ creada$/ }).waitFor({ timeout: 30000 });
  check(
    "al recuperarlo y crear, manda la misma clave y el servidor devuelve la que ya se habia creado",
    posts.length === postsC + 1 &&
      JSON.parse(posts[posts.length - 1].postData()).claveAlta === psql(`select "claveAlta" from pedidos where cliente = '${PREFIJO} perdida'`) &&
      norm(await page.getByRole("heading", { name: /^Solicitud M-\d+ creada$/ }).innerText()) === `Solicitud M-${creadaC.numero} creada` &&
      psql(`select count(*) from pedidos where cliente = '${PREFIJO} perdida'`) === "1"
  );
  await page.getByRole("button", { name: "Cargar otra solicitud" }).click();
  await page.getByLabel("Nombre o razon social").waitFor();

  // ---------------------------------------------------------------- D. catalogo que cambia con el asistente abierto
  // Un modulo elegido mientras se cargan las definiciones tambien llega al paso 3.
  await page.getByLabel("Nombre o razon social").fill(`${PREFIJO} catalogo`);
  await page.getByLabel("Telefono").fill("222222");
  await next();
  await search.waitFor();
  const definicionLenta = async (route) => {
    await sleep(1500);
    await route.continue().catch(() => undefined);
  };
  await page.route(`**/api/modulos/${BAJO}`, definicionLenta);
  await moduleButton("Bajo mesada 2 puertas").click();
  await next();
  await page.waitForTimeout(300);
  await moduleButton("Especiero").click();
  await page.getByText("Colores por defecto").waitFor({ timeout: 30000 });
  await page.unroute(`**/api/modulos/${BAJO}`, definicionLenta);
  check(
    "paso 2: un modulo elegido mientras se cargaban las definiciones tambien tiene tarjeta",
    (await card(1, "Bajo mesada 2 puertas").count()) === 1 && (await card(2, "Especiero").count()) === 1
  );
  await selectIn(barra, "Esqueleto", colorA);
  await selectIn(barra, "Frentes", colorB);
  await selectIn(barra, "Cantos", colorA);
  await barra.getByRole("button", { name: "Aplicar a todos" }).click();
  psql(`update modulos set activo = false where id = '${ESPECIERO}'`);
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  const avisoQuitado = page.locator(".MuiAlert-standardWarning", { hasText: "Se quito Especiero" });
  await avisoQuitado.waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  check("catalogo: el aviso queda a la vista y con el foco", await avisoQuitado.evaluate((element) => element === document.activeElement || element.contains(document.activeElement)));
  check(
    "catalogo: un modulo desactivado se quita con aviso y se queda en el paso 3",
    (await card(2, "Especiero").count()) === 0 && (await page.getByText("Colores por defecto").count()) === 1 && (await card(1, "Bajo mesada 2 puertas").count()) === 1
  );
  psql(`update modulos set activo = true where id = '${ESPECIERO}'`);
  response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  await response;
  check("catalogo: despues de revisar, sigue con el que queda", JSON.parse(previewSent[previewSent.length - 1].postData()).modulos.length === 1);
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByLabel("Nombre o razon social").fill("");
  await page.getByLabel("Telefono").fill("");
  await page.goto(`${APP}/`);
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}~live`);
  }, draftKey);
  await page.waitForTimeout(2000);

  // ---------------------------------------------------------------- E. borrador
  await page.goto(`${APP}/modulos/nueva`);
  await page.getByLabel("Nombre o razon social").waitFor();
  await page.getByLabel("Nombre o razon social").fill(`${PREFIJO} borrador`);
  await page.getByLabel("Telefono").fill("111111");
  await next();
  await search.waitFor();
  await moduleButton("Bajo mesada 2 puertas").click();
  await next();
  await page.getByText("Colores por defecto").waitFor();
  await c1.getByLabel("Ancho (mm)").fill("700");
  await page.waitForTimeout(1500);
  let guardado = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), draftKey);
  check("borrador: se guarda solo", guardado?.value?.step === 2 && guardado.value.units?.[0]?.valores?.ANCHO === "700" && guardado.value.cliente === `${PREFIJO} borrador`);
  // Salir por el menu (sin recargar) y vencer la fecha del borrador, como si fuera de otro dia.
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(`${APP}/`);
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key));
    stored.value.fechaEntrega = "2020-01-01";
    localStorage.setItem(key, JSON.stringify(stored));
  }, draftKey);
  // Chromium guarda localStorage en diferido: sin esta espera, la pagina nueva puede leer el valor anterior.
  await page.waitForTimeout(2000);
  await page.goto(`${APP}/modulos/nueva`);
  const banner = page.locator(".MuiAlert-root", { hasText: "Tenes una solicitud sin terminar" });
  await banner.waitFor();
  check("borrador: lo ofrece al volver", norm(await banner.innerText()).includes("Tenes una solicitud sin terminar (1 modulo, guardada"), norm(await banner.innerText()));
  await banner.getByRole("button", { name: "Recuperar" }).click();
  await page.getByText("Colores por defecto").waitFor();
  const avisos = norm(await page.locator(".MuiAlert-standardWarning").first().innerText().catch(() => ""));
  check("borrador: vuelve al paso 3 con lo cargado", (await c1.getByLabel("Ancho (mm)").inputValue()) === "700", await c1.getByLabel("Ancho (mm)").inputValue());
  check("borrador: avisa que la fecha ya paso", avisos.includes("La fecha de entrega del borrador ya paso: se puso la de por defecto."), avisos);
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  check("borrador: datos del cliente y fecha por defecto", (await page.getByLabel("Nombre o razon social").inputValue()) === `${PREFIJO} borrador` && (await fecha.inputValue()) === addDays(hoy, dias));
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(`${APP}/`);
  await page.waitForTimeout(2000);
  await page.goto(`${APP}/modulos/nueva`);
  await banner.waitFor();
  await banner.getByRole("button", { name: "Descartar" }).click();
  await page.waitForTimeout(1200);
  guardado = await page.evaluate((key) => [localStorage.getItem(key), localStorage.getItem(`${key}~live`)], draftKey);
  check("borrador: descartar lo borra", (await banner.count()) === 0 && guardado[0] === null && guardado[1] === null && (await page.getByLabel("Nombre o razon social").inputValue()) === "");
  await page.waitForTimeout(1000);
  await page.reload();
  await page.getByLabel("Nombre o razon social").waitFor();
  await page.waitForTimeout(800);
  check("borrador: despues de descartar no vuelve a aparecer", (await banner.count()) === 0);

  // ---------------------------------------------------------------- F. otras pantallas
  // Mientras no exista el detalle de modulos (F5.1), "Ver la solicitud" lleva al detalle comun: tiene que andar, sin
  // "Editar" (el formulario de corte no la puede guardar), y el plano tiene que dar las mismas placas e importe guardados.
  await page.goto(`${APP}/pedidos/${order.id}`);
  const planoDetalle = page.getByText(/^Placas necesarias: \d+ - Costo estimado: /);
  await planoDetalle.waitFor({ timeout: 60000 });
  const detalleTexto = norm(await planoDetalle.innerText());
  check("detalle comun de la solicitud de modulos: plano = placas e importe guardados", detalleTexto === `Placas necesarias: ${guardada.placasEstimadas} - Costo estimado: ${money(guardada.presupuestoEstimado)}`, detalleTexto);
  check("detalle comun de la solicitud de modulos: sin Editar", (await page.getByRole("button", { name: "Editar", exact: true }).count()) === 0);
  await shot("w7-detalle-comun", true);
  // Corte: el detalle sigue mostrando los importes del plano y el boton Editar; el formulario abre igual.
  await page.goto(`${APP}/pedidos/${corteId}`);
  await page.getByText(/^Placas necesarias: \d+ - Costo estimado: /).waitFor({ timeout: 60000 });
  const estadoCorte = psql(`select estado from pedidos where id = '${corteId}'`);
  const editable = !["EN_PROCESO", "TERMINADA", "ENTREGADA"].includes(estadoCorte);
  check("corte: el detalle sigue con el costo en el plano y Editar si corresponde", (await page.getByRole("button", { name: "Editar", exact: true }).count()) === (editable ? 1 : 0), estadoCorte);
  await page.goto(`${APP}/pedidos/nuevo`);
  await page.getByRole("heading", { name: "Nueva solicitud de corte" }).waitFor();
  check("corte: el formulario de corte abre igual", (await page.getByRole("link", { name: "Solicitar cortes" }).evaluate((link) => link.classList.contains("Mui-selected"))) === true);
  // Editor de modulos (F3.4): con overflow-x: clip en <main>, su barra de cambios sin guardar queda pegada abajo al bajar.
  await page.goto(`${APP}/configuracion-modulos/${BAJO}`);
  await page.getByLabel("Codigo").waitFor({ timeout: 30000 });
  await page.getByLabel("Observaciones").first().fill("prueba sin guardar");
  await page.waitForTimeout(300);
  const barraEditor = page.getByText("Hay cambios sin guardar");
  if (await barraEditor.count()) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const box = await barraEditor.boundingBox();
    const viewport = page.viewportSize();
    check("editor: la barra de cambios sin guardar queda a la vista (sticky)", Boolean(box) && box.y + box.height <= viewport.height && box.y > viewport.height / 2, box ? `y ${Math.round(box.y)}` : "sin caja");
    await shot("w8-editor-barra");
  } else {
    check("editor: la barra de cambios sin guardar aparece", false);
  }
  await context.close();
} catch (error) {
  check(`la prueba se corto: ${error.message.split("\n")[0]}`, false);
} finally {
  psql(`update modulos set version = ${versionAlacena} where id = '${ALACENA}'`);
  psql(`update modulos set activo = ${especieroActivo === "t" ? "true" : "false"} where id = '${ESPECIERO}'`);
  for (const id of new Set([...creados, ...psql(`select id from pedidos where cliente like '${PREFIJO}%'`).split("\n").filter(Boolean)])) {
    const removed = await api("DELETE", `/orders/${id}`).catch((error) => ({ status: error.message }));
    if (removed.status !== 204 && removed.status !== 404) check(`limpieza: borrar ${String(id).slice(0, 8)}`, false, String(removed.status));
  }
  const despues = contar();
  check(
    "limpieza: la copia queda como estaba",
    JSON.stringify(despues) === JSON.stringify(antes) && psql(`select version from modulos where id='${ALACENA}'`) === versionAlacena && psql(`select activo from modulos where id='${ESPECIERO}'`) === especieroActivo,
    JSON.stringify(despues)
  );
  await browser.close();
}

// Errores esperados: el 409 y la respuesta cortada que se provocan a proposito, y el 400 del canto de 1 mm.
const esperados = [...expectedErrors, /^HTTP 400 POST \/pedidos-modulos\/preview$/, /status of 400/];
const inesperados = errors.filter((error) => !esperados.some((pattern) => pattern.test(error)));
check("sin errores en la consola ni respuestas fallidas inesperadas", inesperados.length === 0, inesperados.slice(0, 6).join(" || "));
console.log(failures ? `\n${failures} con problemas` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
