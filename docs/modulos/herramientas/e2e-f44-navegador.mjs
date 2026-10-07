// Prueba en el navegador del asistente "Nueva solicitud de modulos" (F4.4): Edge sin ventana contra el backend local
// (puerto 4100, copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// - Permisos: sin sesion lleva a /admin; un carpintero no ve el menu ni entra.
// - Los 4 pasos: validaciones (como el alta), busqueda y teclado en la grilla, colores por defecto, fondo por modulo,
//   copiar medidas, perfil, medidas mal escritas, sin selector de color de cantos en el paso 3 (DECISIONES 45), cantos
//   por pieza y por lado (por defecto el de la placa de la pieza con el espesor del perfil; el menu con todos los
//   cantos activos; otro color, otro espesor o sin canto; el azul de lo cambiado y el ambar de un lado sin canto de su
//   color; volver al de por defecto), un error de la vista previa (inventado con page.route), volver y avanzar, plano
//   con las mismas placas que la vista previa, una sola vista previa a la vez (con el servidor demorado a proposito),
//   409 MODULE_CHANGED, doble click, bloqueo mientras se crea, respuesta perdida (busca la solicitud en vez de crearla
//   otra vez), salir mientras se crea, lo guardado igual a la ultima vista previa, catalogo que cambia con el
//   asistente abierto y borrador (guardar, recuperar con fecha vencida y con cantos del formato viejo, descartar).
// - Creada (F5.1): el asistente se reemplaza por el detalle /modulos/:id (atras no vuelve al asistente), con su titulo y
//   la notificacion; tambien al terminar un alta mientras se estaba en otra pantalla.
// - Paridad entre pantallas: el Resumen del detalle (lo guardado, GET /api/pedidos-modulos/:id) y su plano dan las mismas
//   placas e importe que la ultima vista previa.
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
// Un color con canto de 0,45 pero sin el de 2 mm que piden las puertas del perfil Estandar: en los frentes, las puertas
// van sin canto (en ambar), sin error (DECISIONES 45).
const [colorSinDosId, colorSinDosNombre] = psql(`select p.id || '|' || trim(p.nombre) from materiales p where ${placas18} and ${conCanto(0.45)} and not ${conCanto(2)} order by p.nombre limit 1`).split("|");
const colorSinDos = `${colorSinDosNombre} · 18 mm`;
// Los cantos activos, en el orden en que el servidor elige el de por defecto (nombre e id), con el texto del menu.
const mmText = (value) => Number(value).toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });
const cantos = psql(
  `select c.id || '|' || coalesce(c."placaMaterialId", '') || '|' || c."espesorMm" || '|' || trim(coalesce(p.nombre, c.nombre)) from materiales c left join materiales p on p.id = c."placaMaterialId" where c.tipo = 'CANTO' and c.activo order by c.nombre, c.id`
)
  .split("\n")
  .filter(Boolean)
  .map((row) => {
    const [id, placaId, mm, nombre] = row.split("|");
    return { id, placaId, mm: Number(mm), label: `${nombre} · ${mmText(mm)} mm` };
  });
const cantoDe = (placaId, mm) => cantos.find((canto) => canto.placaId === placaId && Math.abs(canto.mm - mm) < 1e-6)?.id ?? null;
const etiqueta = (id) => cantos.find((canto) => canto.id === id)?.label ?? `canto ${id}`;
const cantoA045 = cantoDe(colorAId, 0.45);
const cantoA2 = cantoDe(colorAId, 2);
const cantoB045 = cantoDe(colorBId, 0.45);
const cantoB2 = cantoDe(colorBId, 2);
const [fondoId, fondoNombre] = psql(`select id || '|' || trim(nombre) from materiales where tipo = 'PLACA' and activo and "espesorMm" = 5.5 and "anchoPlaca" is not null order by nombre limit 1`).split("|");
const fondoLabel = `${fondoNombre} · 5,5 mm`;
const BAJO = psql("select id from modulos where codigo='BAJO_MESADA_2_PUERTAS'");
const ALACENA = psql("select id from modulos where codigo='ALACENA_2_PUERTAS'");
const ESPECIERO = psql("select id from modulos where codigo='ESPECIERO'");
const versionAlacena = psql(`select version from modulos where id='${ALACENA}'`);
// Rol de cada pieza y espesor de cada lado en cada perfil: con eso y los colores, el canto por defecto de cada lado.
const piezasDe = (moduloId) => {
  const piezas = new Map(
    psql(`select codigo || '|' || rol from modulos_pieza where "moduloId" = '${moduloId}'`)
      .split("\n")
      .map((row) => row.split("|"))
      .map(([codigo, rol]) => [codigo, { rol, perfiles: { 1: {}, 2: {} } }])
  );
  const lados = psql(
    `select p.codigo || '|' || pf.orden || '|' || c.lado || '|' || c."espesorMm" from modulos_pieza p join modulos_pieza_canto c on c."piezaId" = p.id join modulos_perfil_canto pf on pf.id = c."perfilId" where p."moduloId" = '${moduloId}'`
  );
  for (const row of lados.split("\n").filter(Boolean)) {
    const [codigo, orden, lado, mm] = row.split("|");
    piezas.get(codigo).perfiles[orden][lado] = Number(mm);
  }
  return piezas;
};
const catalogoPiezas = new Map([
  [BAJO, piezasDe(BAJO)],
  [ALACENA, piezasDe(ALACENA)]
]);
const LADOS = [
  ["LARGO_1", "Largo 1", "cantoLargo1Id"],
  ["LARGO_2", "Largo 2", "cantoLargo2Id"],
  ["ANCHO_1", "Ancho 1", "cantoAncho1Id"],
  ["ANCHO_2", "Ancho 2", "cantoAncho2Id"]
];
/** Canto por defecto de un lado (DECISIONES 45): el de la placa de la pieza con el espesor del perfil, o null. */
const porDefecto = (modulo, piezaCodigo, lado) => {
  const pieza = catalogoPiezas.get(modulo.moduloId)?.get(piezaCodigo);
  const mm = pieza?.perfiles[modulo.perfilCantoOrden]?.[lado];
  if (mm === undefined) return null;
  const placa = pieza.rol === "ESQUELETO" ? modulo.colorEsqueletoId : pieza.rol === "FRENTE" ? modulo.colorFrentesId : null;
  return placa ? cantoDe(placa, mm) : null;
};
/** JSON con las claves ordenadas, para comparar cambios de canto sin depender del orden. */
const canonico = (value) =>
  JSON.stringify(value, (_key, item) => (item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item));
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
  Boolean(colorAId && colorBId && fondoId && BAJO && ALACENA && ESPECIERO && corteId && fondoConfig && colorSinDosId && colorSinDosNombre) &&
    Boolean(cantoA045 && cantoA2 && cantoB045 && cantoB2) &&
    cantoDe(colorSinDosId, 0.45) !== null &&
    cantoDe(colorSinDosId, 2) === null &&
    dias > 0 &&
    especieroActivo === "t",
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
    check("carpintero: el menu no tiene Modulos a medida", (await page.getByRole("link", { name: "Módulos a medida" }).count()) === 0);
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
  // Sobre <main>: tiene overflow-x clip, asi que en la pagina nunca hay scroll horizontal aunque algo se salga.
  const noHorizontalScroll = () =>
    page.evaluate(() => {
      const main = document.querySelector("main");
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth && main.scrollWidth <= main.clientWidth;
    });
  const card = (n, nombre) => page.getByRole("region", { name: `Módulo ${n} · ${nombre}`, exact: true });
  const estados = async () => (await page.locator("section[data-modulo] .MuiChip-label").allInnerTexts()).filter((label) => label === "Listo" || label === "Revisar");
  const moduleButton = (nombre) => page.getByRole("button", { name: nombre, exact: true });
  // Despues de crear (F5.1): el asistente se reemplaza por el detalle /modulos/:id, con el titulo "Solicitud M-<numero>" y
  // la notificacion "Solicitud M-<numero> creada" del layout (se cierra sola a los 4,2 s: se busca enseguida).
  const llegarAlDetalle = async (id, numero) => {
    await page.waitForURL(`${APP}/modulos/${id}`, { timeout: 60000 }).catch(() => undefined);
    const titulo = page.getByRole("heading", { level: 1, name: `Solicitud M-${numero}`, exact: true });
    const aviso = page.locator(".MuiSnackbar-root .MuiAlert-message", { hasText: `Solicitud M-${numero} creada` });
    const [conTitulo, conAviso] = await Promise.all([
      titulo.waitFor({ timeout: 30000 }).then(() => true).catch(() => false),
      aviso.waitFor({ timeout: 30000 }).then(() => true).catch(() => false)
    ]);
    const avisoTexto = conAviso ? norm(await aviso.first().innerText().catch(() => "")) : "";
    const pathname = new URL(page.url()).pathname;
    return {
      ok: pathname === `/modulos/${id}` && conTitulo && avisoTexto === `Solicitud M-${numero} creada`,
      detalle: `${pathname.replace(id, ":id")} | titulo ${conTitulo ? "si" : "no"} | aviso "${avisoTexto}"`
    };
  };

  await page.goto(`${APP}/`);
  const menu = page.getByRole("link", { name: "Módulos a medida" });
  await menu.waitFor();
  const menuItems = await page.locator("nav a, .MuiDrawer-root a").evaluateAll((links) => [...new Set(links.map((link) => link.textContent.trim()))]);
  check("menu: Modulos a medida debajo de Solicitar cortes", menuItems.indexOf("Módulos a medida") === menuItems.indexOf("Solicitar cortes") + 1, menuItems.join(" / "));
  // El menu lleva al listado (F4.5); desde ahi se entra al asistente.
  await menu.click();
  await page.waitForURL(`${APP}/modulos`);
  await page.getByRole("button", { name: "Nueva solicitud de módulos" }).click();
  await page.waitForURL("**/modulos/nueva");
  await page.getByRole("heading", { name: "Nueva solicitud de módulos" }).waitFor();
  check("menu: queda marcado en el asistente", await menu.evaluate((link) => link.classList.contains("Mui-selected")));

  // Paso 1
  const fecha = page.getByLabel("Fecha de entrega comprometida");
  await page.waitForFunction(() => document.querySelector('input[type="date"]')?.value, null, { timeout: 15000 });
  check("paso 1: fecha por defecto, hoy en Argentina + dias de la configuracion", (await fecha.inputValue()) === addDays(hoy, dias), await fecha.inputValue());
  check("paso 1: teclado de telefono en el input", (await page.getByLabel("Teléfono").getAttribute("inputmode")) === "tel");
  await shot("w1-cliente");
  await next();
  let text = await firstError();
  check("paso 1: sin datos no avanza y dice que falta", text.includes("Completá el cliente") && text.includes("Completá el teléfono"), text);
  check("paso 1: el error toma el foco", await page.evaluate(() => document.activeElement?.classList.contains("MuiAlert-root")));
  await page.getByLabel("Nombre o razón social").fill(`${PREFIJO} navegador`);
  await page.getByLabel("Teléfono").fill("000000");
  await page.getByLabel("Email").fill("ana@gmail.com.");
  await next();
  text = await firstError();
  check("paso 1: email que el alta rechaza (como zod)", text === "El email no es válido.", text);
  await page.getByLabel("Email").fill("prueba@ejemplo.com");
  await page.getByLabel("Dirección de entrega").fill("Calle de prueba 123");
  await page.getByLabel("Referencia del trabajo").fill("Cocina de prueba");
  await fecha.fill("2020-01-01");
  await next();
  text = await firstError();
  check("paso 1: fecha anterior a hoy", text === "La fecha de entrega no puede ser anterior a hoy.", text);
  const fechaElegida = addDays(hoy, 20);
  await fecha.fill(fechaElegida);
  await next();

  // Paso 2
  const search = page.getByLabel("Buscar por nombre o código");
  await search.waitFor();
  await next();
  text = await firstError();
  check("paso 2: sin modulos no avanza", text === "Elegí al menos un módulo.", text);
  const cardNames = () => page.locator('[role="button"][aria-pressed]').evaluateAll((cards) => cards.map((element) => element.getAttribute("aria-label")));
  await search.fill("bajo mesada 2");
  await page.waitForTimeout(200);
  let names = await cardNames();
  check("paso 2: la busqueda filtra", names.length > 0 && names.every((name) => /bajo mesada 2/i.test(name)), names.join(" / "));
  await moduleButton("Bajo mesada 2 puertas").click();
  check("paso 2: al elegir se borra el error", (await page.locator(".MuiAlert-standardError").count()) === 0);
  check("paso 2: click marca la tarjeta (aria-pressed, el nombre no cambia)", (await moduleButton("Bajo mesada 2 puertas").getAttribute("aria-pressed")) === "true");
  await page.getByRole("button", { name: "Una más de Bajo mesada 2 puertas" }).click();
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
  check("paso 2: contador", contador === "3 módulos elegidos", contador);
  await page.getByRole("combobox", { name: /^Categoría/ }).click();
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
  check(
    "paso 3: sin colores no avanza y dice que falta (sin color de cantos)",
    text.includes("Módulo 1 (Bajo mesada 2 puertas): falta elegir el color de esqueleto, el color de frentes.") && !text.includes("canto"),
    text.slice(0, 160)
  );
  check("paso 3: colores sin elegir dicen que hacer", (await c1.getByText("Elegí un color").count()) === 2);
  const barra = page.locator(".MuiPaper-root", { hasText: "Colores por defecto" });
  // DECISIONES 45: ya no se elige un color de cantos, ni en la barra ni en las tarjetas, y no hay avisos de espesores.
  const selectoresCantos = await page.getByRole("combobox", { name: /^Cantos/ }).count();
  const combosBarra = await barra.getByRole("combobox").count();
  check(
    "paso 3: no hay selector de color de cantos ni avisos de espesores",
    selectoresCantos === 0 && combosBarra === 2 && (await page.getByText(/sin canto de/).count()) === 0,
    `${selectoresCantos} selectores Cantos, ${combosBarra} en la barra`
  );
  await selectIn(barra, "Esqueleto", colorA);
  await selectIn(barra, "Frentes", colorB);
  await barra.getByRole("button", { name: "Aplicar a todos" }).click();
  check("paso 3: Aplicar a todos completa los colores", JSON.stringify(await estados()) === '["Listo","Listo","Listo"]', (await estados()).join(", "));
  // Frentes de un color sin canto de 2 mm (el que piden las puertas): la tarjeta sigue lista, sin error (DECISIONES 45).
  await selectIn(c2, "Frentes", colorSinDos);
  await page.waitForTimeout(150);
  check(
    "paso 3: frentes de un color sin el canto que piden las puertas no marcan la tarjeta",
    JSON.stringify(await estados()) === '["Listo","Listo","Listo"]' && (await c2.locator(".MuiFormHelperText-root.Mui-error").count()) === 0,
    (await estados()).join(", ")
  );
  const fondoTexto = norm(await c1.getByRole("combobox", { name: /^Material de fondo/ }).innerText());
  check("paso 3: fondo del catalogo por defecto", fondoTexto === `El del catálogo (${fondoConfig})`, fondoTexto);
  await selectIn(c2, "Material de fondo", fondoLabel);
  check("paso 3: fondo elegido en el modulo 2", (await c2.getByText("Elegido para este módulo").count()) === 1);
  const ancho1 = c1.getByLabel("Ancho (mm)");
  await ancho1.fill("");
  await page.waitForTimeout(150);
  const vacia = norm(await c1.locator(".MuiFormHelperText-root.Mui-error").first().innerText().catch(() => ""));
  check("paso 3: medida vacia marca error en la tarjeta", (await estados())[0] === "Revisar" && vacia === "Falta el valor", vacia);
  await ancho1.fill("1.200");
  await page.waitForTimeout(150);
  const miles = norm(await c1.locator(".MuiFormHelperText-root.Mui-error").first().innerText().catch(() => ""));
  check("paso 3: punto de miles: lo dice en vez de leer 1,2 mm", miles === "Escribí la medida sin punto de miles (por ejemplo 1200)", miles);
  await ancho1.fill("720mm");
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  text = await firstError();
  check("paso 3: con errores no avanza y nombra la medida", text.startsWith("Módulo 1 (Bajo mesada 2 puertas): ANCHO: Escribí solo el número, en mm"), text.slice(0, 160));
  await ancho1.fill("900");
  check("paso 3: al corregir se borra la lista de problemas", (await page.locator(".MuiAlert-standardError").count()) === 0);
  await c1.getByLabel("Alto (mm)").fill("800");
  await page.waitForTimeout(150);
  check("paso 3: medida corregida", (await estados())[0] === "Listo");
  check("paso 3: copiar medidas, en singular", (await c1.getByRole("button", { name: "Copiar medidas al otro igual" }).count()) === 1 && (await c2.getByRole("button", { name: /^Copiar medidas/ }).count()) === 0);
  await c1.getByRole("button", { name: "Copiar medidas al otro igual" }).click();
  check("paso 3: copio ancho y alto al modulo 2", (await c2.getByLabel("Ancho (mm)").inputValue()) === "900" && (await c2.getByLabel("Alto (mm)").inputValue()) === "800");
  await c1.getByLabel("Observaciones del módulo").fill("Va contra la pared");
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
  // Sin colorCantoId (DECISIONES 45): el esquema estricto lo rechaza.
  const permitidos = new Set(["moduloId", "valores", "colorEsqueletoId", "colorFrentesId", "perfilCantoOrden", "materialFondoId", "observaciones", "cantosOverride"]);
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
      body.modulos.every((line) => line.colorEsqueletoId === colorAId && !("colorCantoId" in line) && !line.cantosOverride) &&
      JSON.stringify(body.modulos.map((line) => line.colorFrentesId)) === JSON.stringify([colorBId, colorSinDosId, colorBId]),
    JSON.stringify(body.modulos.map((line) => Object.keys(line)))
  );
  const despiece = (n, nombre) => page.getByRole("region", { name: `Módulo ${n} · ${nombre}`, exact: true });
  await despiece(1, "Bajo mesada 2 puertas").waitFor();
  const filasPorModulo = [1, 2, 3].map((posicion) => preview.detalles.filter((row) => row.posicionModulo === posicion).length);
  const filasEnPantalla = [
    await despiece(1, "Bajo mesada 2 puertas").locator("tbody tr").count(),
    await despiece(2, "Bajo mesada 2 puertas").locator("tbody tr").count(),
    await despiece(3, "Alacena 2 puertas").locator("tbody tr").count()
  ];
  check("paso 4: una tarjeta por modulo con sus piezas", JSON.stringify(filasPorModulo) === JSON.stringify(filasEnPantalla) && filasPorModulo.every((count) => count > 0), filasEnPantalla.join(", "));
  // Cantos (DECISIONES 45): cuatro selects por pieza. El valor es el id del canto (o vacio, sin canto) en el input oculto
  // de MUI; cerrado se ve "<placa> · <mm> mm" o "Sin canto", y en el menu el de la placa de la pieza lleva
  // " (por defecto)".
  const nombresDespiece = ["Bajo mesada 2 puertas", "Bajo mesada 2 puertas", "Alacena 2 puertas"];
  const filasDe = (posicion) => despiece(posicion, nombresDespiece[posicion - 1]).locator("tbody tr");
  const escapar = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // El nombre accesible es el rotulo del lado mas su aria-label ("Largo 1 Largo 1 de Piso del módulo 1"): se busca por el final.
  const selectLado = (posicion, pieza, index) => page.getByRole("combobox", { name: new RegExp(`(^|\\s)${escapar(`${LADOS[index][1]} de ${pieza} del módulo ${posicion}`)}$`) });
  const mostrado = async (locator) => norm((await locator.innerText()).replace(/​/g, ""));
  const sinCantoVisible = (text) => text === "" || text.startsWith("Sin canto");
  const valoresFila = (fila) => fila.locator("input.MuiSelect-nativeInput").evaluateAll((inputs) => inputs.map((input) => input.value));
  const desenfocar = async () => {
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(250);
  };
  const AZUL = "rgb(47, 111, 219)";
  const contornos = async (fila) => {
    await desenfocar();
    return fila.locator(".MuiOutlinedInput-notchedOutline").evaluateAll((outlines) => outlines.map((outline) => getComputedStyle(outline).borderColor));
  };
  const diferenciasPorDefecto = [];
  for (const posicion of [1, 2, 3]) {
    const modulo = preview.modulos[posicion - 1];
    const filas = preview.detalles.filter((row) => row.posicionModulo === posicion);
    for (let index = 0; index < filas.length; index += 1) {
      const row = filas[index];
      const filaN = filasDe(posicion).nth(index);
      const esperado = LADOS.map(([ladoCodigo]) => porDefecto(modulo, row.piezaCodigo, ladoCodigo));
      const servidor = LADOS.map(([, , campo]) => row[campo] ?? null);
      const enPantalla = await valoresFila(filaN);
      const textos = [];
      for (let ladoIndex = 0; ladoIndex < 4; ladoIndex += 1) textos.push(await mostrado(filaN.getByRole("combobox").nth(ladoIndex)));
      const textosOk = esperado.every((id, ladoIndex) => (id ? textos[ladoIndex] === etiqueta(id) : sinCantoVisible(textos[ladoIndex])));
      if (
        JSON.stringify(servidor) !== JSON.stringify(esperado) ||
        JSON.stringify(enPantalla) !== JSON.stringify(esperado.map((id) => id ?? "")) ||
        !textosOk ||
        row.origen !== "CALCULADO"
      ) {
        diferenciasPorDefecto.push(`M${posicion} ${row.piezaCodigo}: ${textos.join(" / ")}`);
      }
    }
  }
  check(
    "paso 4: cada lado arranca con el canto de la placa de su pieza y el espesor del perfil (servidor y pantalla)",
    diferenciasPorDefecto.length === 0,
    diferenciasPorDefecto.slice(0, 3).join(" || ")
  );
  // Frentes sin canto de su color (modulo 2): las puertas van sin canto, en ambar, y la vista previa lo lista (sin error).
  const filaFrente2Index = preview.detalles.filter((row) => row.posicionModulo === 2).findIndex((row) => catalogoPiezas.get(BAJO).get(row.piezaCodigo)?.rol === "FRENTE");
  const frente2 = preview.detalles.filter((row) => row.posicionModulo === 2)[filaFrente2Index];
  const filaFrente2 = filasDe(2).nth(filaFrente2Index);
  const AVISO_AMBAR = "La placa no tiene canto de su color";
  const sinElegir = preview.modulos.map((modulo) => modulo.cantosSinElegir ?? []);
  const ambar = await filaFrente2.getByText(AVISO_AMBAR, { exact: true }).count();
  const colorAmbar = ambar ? await filaFrente2.getByText(AVISO_AMBAR, { exact: true }).first().evaluate((element) => getComputedStyle(element).color) : "";
  check(
    "paso 4: puertas de un color sin canto de 2 mm, sin canto en los 4 lados con el aviso ambar",
    Boolean(frente2) &&
      LADOS.every(([, , campo]) => frente2[campo] === null) &&
      sinElegir[0].length === 0 &&
      sinElegir[2].length === 0 &&
      sinElegir[1].length === 4 &&
      sinElegir[1].every((item) => item.piezaCodigo === frente2.piezaCodigo && item.espesorMm === 2 && item.placa === colorSinDosNombre) &&
      JSON.stringify(sinElegir[1].map((item) => item.lado).sort()) === JSON.stringify(LADOS.map(([lado]) => lado).sort()) &&
      ambar === 4 &&
      (await despiece(2, "Bajo mesada 2 puertas").getByText(AVISO_AMBAR, { exact: true }).count()) === 4 &&
      (await despiece(1, "Bajo mesada 2 puertas").getByText(AVISO_AMBAR, { exact: true }).count()) === 0 &&
      (await despiece(3, "Alacena 2 puertas").getByText(AVISO_AMBAR, { exact: true }).count()) === 0 &&
      colorAmbar === "rgb(138, 90, 0)",
    `${ambar} avisos, color ${colorAmbar}, cantosSinElegir ${sinElegir.map((list) => list.length).join("/")}`
  );
  await selectLado(2, frente2.nombreProducto, 0).click();
  const opcionesAmbar = await page.getByRole("option").allInnerTexts();
  await page.keyboard.press("Escape");
  check(
    "paso 4: en ese lado, el menu marca Sin canto como el de por defecto",
    norm(opcionesAmbar[0]) === "Sin canto (por defecto)" && opcionesAmbar.filter((option) => option.includes("(por defecto)")).length === 1,
    norm(opcionesAmbar[0])
  );
  await shot("w4-sin-canto-ambar");

  // El menu de un lado: Sin canto y todos los cantos activos, de cualquier color y espesor; el de por defecto, marcado.
  const filasServidor = preview.detalles.filter((row) => row.posicionModulo === 1);
  const filaPreview = filasServidor[0];
  const codigo = filaPreview.piezaCodigo;
  const nombrePieza = filaPreview.nombreProducto;
  const fila = filasDe(1).first();
  const lado = (index) => selectLado(1, nombrePieza, index);
  const defectoFila = LADOS.map(([ladoCodigo]) => porDefecto(preview.modulos[0], codigo, ladoCodigo));
  await lado(0).click();
  const opciones = (await page.getByRole("option").allInnerTexts()).map(norm);
  await page.keyboard.press("Escape");
  const sinSufijo = opciones.slice(1).map((option) => option.replace(/ \(por defecto\)$/, "")).sort();
  check(
    `paso 4: el menu de un lado tiene Sin canto y los ${cantos.length} cantos activos, con el de por defecto marcado`,
    (await lado(0).count()) === 1 &&
      defectoFila[0] === cantoA045 &&
      defectoFila.slice(1).every((id) => id === null) &&
      opciones[0] === "Sin canto" &&
      JSON.stringify(sinSufijo) === JSON.stringify(cantos.map((canto) => canto.label).sort()) &&
      JSON.stringify(opciones.filter((option) => option.endsWith("(por defecto)"))) === JSON.stringify([`${etiqueta(defectoFila[0])} (por defecto)`]),
    `${opciones.length} opciones; por defecto: ${opciones.filter((option) => option.endsWith("(por defecto)")).join(", ")}`
  );

  const panel = page.getByRole("region", { name: "Resumen", exact: true });
  // El resumen muestra los numeros de `data` (la vista previa en el paso 4, lo guardado en el detalle). Espera hasta 15 s:
  // el espesor de cada placa llega con los materiales, despues de la solicitud.
  const panelOk = async (data, label) => {
    const piezas = data.detalles.reduce((sum, row) => sum + Number(row.cantidad), 0);
    let ok = false;
    let placas = null;
    for (let waited = 0; !ok && waited <= 15000; waited += 250) {
      if (waited) await page.waitForTimeout(250);
      const panelText = norm(await panel.innerText().catch(() => ""));
      placas = [...panelText.matchAll(/(\d+) placas?\b/g)].reduce((sum, match) => sum + Number(match[1]), 0);
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
      ok =
        placas === data.placasEstimadas &&
        panelText.includes(`Módulos 3 Piezas ${piezas}`) &&
        m2 &&
        metros &&
        importes &&
        !panelText.includes("Herrajes") &&
        panelText.includes("Las placas finales las define el optimizador al cortar.");
    }
    check(`${label}: el resumen muestra esos números (placas, m², canto e importes)`, ok, `${placas} placas en pantalla, ${data.placasEstimadas} esperadas`);
  };
  await panelOk(preview, "paso 4");
  await shot("w4-revisar");
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(200);
  const top = await panel.evaluate((element) => Math.round(element.getBoundingClientRect().top));
  check("paso 4: el resumen queda fijo al costado al bajar", top >= 80 && top <= 96, `top ${top}px`);
  await shot("w4-revisar-scroll");
  await page.evaluate(() => window.scrollTo(0, 0));

  // Cantos (P12, DECISIONES 45): una sola vista previa a la vez. Con el servidor lento (3 s de demora), tres cambios
  // seguidos dan la que estaba en curso mas una sola con los tres, sin cortar ninguna; mientras falta, no deja crear.
  // Los tres: Largo 1 sin canto, Ancho 1 con el canto de otro color (el de frentes, 2 mm) y Ancho 2 con otro espesor
  // del mismo color (2 mm). Largo 2 no se toca.
  const elegir = async (index, opcion) => {
    await lado(index).click();
    await page.getByRole("option", { name: opcion, exact: true }).click();
  };
  // Elegir lo que ya tiene (el de por defecto) no cambia nada ni recalcula.
  const enviadosSinCambio = previewSent.length;
  await elegir(0, `${etiqueta(cantoA045)} (por defecto)`);
  await page.waitForTimeout(1200);
  check("paso 4: elegir el canto que ya tiene no recalcula", previewSent.length === enviadosSinCambio && (await fila.getByText("Editada", { exact: true }).count()) === 0);
  const enviadosAntes = previewSent.length;
  const hechosAntes = previewDone.length;
  const cortadasAntes = previewFailed.length;
  // 8 s de demora: elegir en un menu con todos los cantos tarda mas de un segundo, y los tres cambios tienen que caer
  // mientras se calcula la primera.
  const demora = async (route) => {
    await sleep(8000);
    await route.continue().catch(() => undefined);
  };
  await page.route("**/pedidos-modulos/preview", demora);
  const inicio = Date.now();
  const tiempos = [];
  await elegir(0, "Sin canto");
  tiempos.push(Date.now() - inicio);
  check("paso 4: avisa que se va a recalcular", (await page.getByText("Cambiaste cantos: en un momento se recalcula el resumen.").count()) === 1);
  await elegir(2, etiqueta(cantoB2));
  tiempos.push(Date.now() - inicio);
  await elegir(3, etiqueta(cantoA2));
  tiempos.push(Date.now() - inicio);
  const postsDuranteCalculo = posts.length;
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.waitForTimeout(200);
  check(
    "paso 4: mientras falta recalcular no deja crear",
    posts.length === postsDuranteCalculo && (await page.getByText("Esperá a que termine el cálculo para crear la solicitud.").count()) === 1
  );
  for (let waited = 0; previewDone.length < hechosAntes + 2 && waited < 60000; waited += 100) await page.waitForTimeout(100);
  await page.waitForTimeout(1500);
  await page.unroute("**/pedidos-modulos/preview", demora);
  preview = previewBodies[previewBodies.length - 1];
  let sentBody = JSON.parse(previewSent[previewSent.length - 1].postData());
  const tresCambios = { [codigo]: { LARGO_1: null, ANCHO_1: cantoB2, ANCHO_2: cantoA2 } };
  check(
    "paso 4: cambios mientras se calcula, una sola vista previa mas con los tres y ninguna cortada",
    previewSent.length - enviadosAntes === 2 && previewDone.length - hechosAntes === 2 && previewFailed.length === cortadasAntes,
    `${previewSent.length - enviadosAntes} enviadas, ${previewDone.length - hechosAntes} completas, ${previewFailed.length - cortadasAntes} cortadas; cambios a los ${tiempos.join(", ")} ms`
  );
  check(
    "paso 4: manda solo los lados tocados, con el id del canto o null (sin canto), y nada en los otros modulos",
    canonico(sentBody.modulos[0].cantosOverride) === canonico(tresCambios) &&
      sentBody.modulos.slice(1).every((line) => line.cantosOverride === undefined) &&
      sentBody.modulos.every((line) => Object.keys(line).every((key) => permitidos.has(key))),
    JSON.stringify(sentBody.modulos[0].cantosOverride ?? null).replace(/[0-9a-f-]{36}/g, (id) => etiqueta(id))
  );
  check(
    "paso 4: al terminar queda lista y se borra el aviso de espera",
    (await page.getByText("Despiece y resumen calculados por el servidor.").count()) === 1 && (await page.getByText("Esperá a que termine el cálculo para crear la solicitud.").count()) === 0
  );
  let editada = preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo);
  let azules = (await contornos(fila)).map((color) => color === AZUL);
  let textosFila = [];
  for (let index = 0; index < 4; index += 1) textosFila.push(await mostrado(lado(index)));
  check(
    "paso 4: la pieza vuelve como EDITADO, con la marca Editada y en azul solo los lados cambiados",
    editada?.origen === "EDITADO" &&
      editada.cantoLargo1Id === null &&
      editada.cantoLargo2Id === defectoFila[1] &&
      editada.cantoAncho1Id === cantoB2 &&
      editada.cantoAncho2Id === cantoA2 &&
      (await fila.getByText("Editada", { exact: true }).count()) === 1 &&
      JSON.stringify(azules) === "[true,false,true,true]" &&
      JSON.stringify(await valoresFila(fila)) === JSON.stringify(["", defectoFila[1] ?? "", cantoB2, cantoA2]) &&
      sinCantoVisible(textosFila[0]) &&
      textosFila[2] === etiqueta(cantoB2) &&
      textosFila[3] === etiqueta(cantoA2) &&
      (await fila.getByText(AVISO_AMBAR, { exact: true }).count()) === 0,
    `${editada?.origen} ${JSON.stringify(azules)} ${textosFila.join(" / ")}`
  );
  // Las demas piezas del modulo siguen como estaban (CALCULADO).
  check(
    "paso 4: el cambio no toca las otras piezas",
    preview.detalles.filter((row) => row.posicionModulo === 1 && row.piezaCodigo !== codigo).every((row) => row.origen === "CALCULADO") &&
      (await despiece(1, "Bajo mesada 2 puertas").getByText("Editada", { exact: true }).count()) === 1
  );
  await panelOk(preview, "paso 4 despues del cambio");
  await shot("w4-cantos-cambiados");

  // Elegir otra vez el de por defecto saca ese cambio: Ancho 2 vuelve a "Sin canto (por defecto)" y deja de estar en azul.
  response = nextPreview();
  await elegir(3, `${defectoFila[3] ? etiqueta(defectoFila[3]) : "Sin canto"} (por defecto)`);
  preview = await (await response).json();
  sentBody = JSON.parse(previewSent[previewSent.length - 1].postData());
  editada = preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo);
  azules = (await contornos(fila)).map((color) => color === AZUL);
  check(
    "paso 4: elegir el de por defecto saca ese cambio (y la pieza sigue Editada por los otros)",
    canonico(sentBody.modulos[0].cantosOverride) === canonico({ [codigo]: { LARGO_1: null, ANCHO_1: cantoB2 } }) &&
      editada?.origen === "EDITADO" &&
      editada.cantoAncho2Id === defectoFila[3] &&
      JSON.stringify(azules) === "[true,false,true,false]" &&
      (await fila.getByText("Editada", { exact: true }).count()) === 1,
    JSON.stringify(azules)
  );

  // Un error de la vista previa (inventado con page.route: ya no hay cantos que falten): se ve una vez, la ultima vista
  // previa sigue a la vista y no deja crear (con el detalle junto al boton).
  const errorInventado = (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: "Prueba e2e: error inventado de la vista previa.", code: "PRUEBA_E2E", details: { errores: ["Detalle inventado para la prueba."] } })
    });
  await page.route("**/pedidos-modulos/preview", errorInventado);
  response = nextPreview();
  await elegir(1, etiqueta(cantoB045));
  const fallida = await response;
  await page.unroute("**/pedidos-modulos/preview", errorInventado);
  await page.getByText("Volver a calcular").waitFor();
  text = await firstError();
  const repeticiones = (text.match(/Detalle inventado para la prueba/g) ?? []).length;
  check(
    "paso 4: error de la vista previa, claro, sin repetir y con la tabla a la vista",
    fallida.status() === 400 && text.includes("Prueba e2e: error inventado de la vista previa.") && repeticiones === 1 && (await despiece(1, "Bajo mesada 2 puertas").count()) === 1,
    `${fallida.status()} ${text.slice(0, 140)}`
  );
  const postsAntes = posts.length;
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.waitForTimeout(300);
  const junto = norm(await page.locator(".MuiAlert-standardError").last().innerText());
  check(
    "paso 4: con error no crea y dice por que junto al boton",
    posts.length === postsAntes && junto.startsWith("Todavía no se puede crear: corregí lo que dice el aviso del despiece.") && junto.includes("Detalle inventado para la prueba."),
    junto.slice(0, 160)
  );
  await shot("w4-error-vista-previa");
  // El boton de la pieza vuelve los cuatro lados al de por defecto y recalcula.
  response = nextPreview();
  await page.getByRole("button", { name: `Volver a los cantos por defecto en ${nombrePieza}` }).click();
  preview = await (await response).json();
  sentBody = JSON.parse(previewSent[previewSent.length - 1].postData());
  azules = (await contornos(fila)).map((color) => color === AZUL);
  check(
    "paso 4: volver a los cantos por defecto quita la marca, el azul y el cambio",
    preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo)?.origen === "CALCULADO" &&
      sentBody.modulos[0].cantosOverride === undefined &&
      (await fila.getByText("Editada", { exact: true }).count()) === 0 &&
      !azules.includes(true) &&
      JSON.stringify(await valoresFila(fila)) === JSON.stringify(defectoFila.map((id) => id ?? "")),
    JSON.stringify(azules)
  );
  // Editada otra vez: Largo 1 con el canto de 2 mm del color de frentes (sigue en la solicitud que se crea).
  response = nextPreview();
  await elegir(0, etiqueta(cantoB2));
  preview = await (await response).json();
  editada = preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo);
  check("paso 4: pieza editada otra vez", editada?.origen === "EDITADO" && editada.cantoLargo1Id === cantoB2);

  // Volver al paso 3 conserva el cambio (y el borrador lo guarda con el id del canto); avanzar recalcula con el.
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByText("Colores por defecto").waitFor();
  check(
    "volver al paso 3 conserva el cambio de canto",
    (await c1.getByText("1 pieza con cantos cambiados", { exact: true }).count()) === 1 && (await c1.getByRole("button", { name: "Volver todas a los cantos por defecto" }).count()) === 1
  );
  let borradorCanto = null;
  for (let waited = 0; waited < 5000 && borradorCanto !== cantoB2; waited += 250) {
    borradorCanto = await page.evaluate(
      ({ key, pieza }) =>
        [localStorage.getItem(key), localStorage.getItem(`${key}~live`)]
          .map((raw) => {
            try {
              return JSON.parse(raw ?? "null")?.value?.units?.[0]?.cantosOverride?.[pieza]?.LARGO_1;
            } catch {
              return undefined;
            }
          })
          .find((value) => value !== undefined) ?? null,
      { key: draftKey, pieza: codigo }
    );
    if (borradorCanto !== cantoB2) await page.waitForTimeout(250);
  }
  check("borrador: guarda el canto elegido a mano (su id)", borradorCanto === cantoB2, String(borradorCanto && etiqueta(borradorCanto)));
  response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  preview = await (await response).json();
  sentBody = JSON.parse(previewSent[previewSent.length - 1].postData());
  check(
    "avanzar de nuevo recalcula con el cambio",
    preview.detalles.find((row) => row.posicionModulo === 1 && row.piezaCodigo === codigo)?.origen === "EDITADO" &&
      canonico(sentBody.modulos[0].cantosOverride) === canonico({ [codigo]: { LARGO_1: cantoB2 } })
  );
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
    text.includes("Volvé a revisar la vista previa antes de crear la solicitud.") && preview.modulos[2].version === Number(versionAlacena) + 1 && avisoVersion.includes("Se usa la versión nueva de Alacena 2 puertas"),
    `${text.slice(0, 100)} || ${avisoVersion.slice(0, 100)}`
  );

  // Respuesta perdida y busqueda caida: el servidor crea A, pero no llegan ni la respuesta ni la busqueda inmediata.
  // Doble click: un solo alta. Mientras se crea, la tabla no se toca.
  const postsPrevios = posts.length;
  let creadaA = null;
  // Solo el alta (POST): el GET sin parametros del listado /modulos tiene la misma URL.
  const perdida = async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
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
  check("mientras se crea, los cantos y volver quedan bloqueados", (await lado(0).getAttribute("aria-disabled")) === "true" && (await page.getByRole("button", { name: "Volver", exact: true }).isDisabled()));
  await page.getByText("no se pudo revisar si quedó cargada", { exact: false }).waitFor({ timeout: 60000 });
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
  await elegir(3, etiqueta(cantoB045));
  preview = await (await response).json();
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor();
  const postsAntesDeReintentar = posts.length;
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  const yaCargada = page.locator(".MuiAlert-standardError", { hasText: `La solicitud M-${creadaA.numero} ya había quedado cargada` });
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
  // Creada (F5.1): va derecho al detalle de la solicitud, con la notificacion del layout, sin pantalla de exito.
  const llegada = await llegarAlDetalle(order.id, order.numero);
  check(
    "despues del aviso, crear otra vez crea una nueva con lo que se ve y abre su detalle",
    llegada.ok && order.numero !== creadaA.numero && posts.length === postsAntesDeReintentar + 1,
    llegada.detalle
  );
  check("creada: no queda la pantalla de exito vieja", (await page.getByRole("button", { name: "Cargar otra solicitud" }).count()) === 0 && (await page.getByRole("button", { name: "Ver la solicitud" }).count()) === 0);
  const createBody = JSON.parse(posts[posts.length - 1].postData());
  check(
    "alta: manda la version de la ultima vista previa y los datos del cliente",
    createBody.modulos.every((line, index) => line.version === preview.modulos[index].version) &&
      createBody.emailContacto === "prueba@ejemplo.com" &&
      createBody.direccionEntrega === "Calle de prueba 123" &&
      createBody.observaciones === "Cocina de prueba" &&
      createBody.fechaEntrega === fechaElegida
  );
  const cambiosFinales = { [codigo]: { LARGO_1: cantoB2, ANCHO_2: cantoB045 } };
  check(
    "alta: sin color de cantos, con los campos permitidos y solo los lados cambiados (ids de canto)",
    createBody.modulos.every((line) => !("colorCantoId" in line) && Object.keys(line).every((key) => permitidos.has(key) || key === "version")) &&
      canonico(createBody.modulos[0].cantosOverride) === canonico(cambiosFinales) &&
      createBody.modulos.slice(1).every((line) => line.cantosOverride === undefined) &&
      JSON.stringify(createBody.modulos.map((line) => line.colorFrentesId)) === JSON.stringify([colorBId, colorSinDosId, colorBId]),
    JSON.stringify(createBody.modulos.map((line) => Object.keys(line)))
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
  const ladosGuardados = (posicion, pieza) =>
    psql(
      `select coalesce(d."cantoLargo1Id", '-') || '|' || coalesce(d."cantoLargo2Id", '-') || '|' || coalesce(d."cantoAncho1Id", '-') || '|' || coalesce(d."cantoAncho2Id", '-') from detalle_pedidos d join pedidos_modulo pm on pm.id = d."pedidoModuloId" where d."pedidoId" = '${order.id}' and pm.posicion = ${posicion} and d."piezaCodigo" = '${pieza}'`
    )
      .split("|")
      .map((id) => (id === "-" ? null : id));
  const guardadoPieza = ladosGuardados(1, codigo);
  const guardadoPuertas = ladosGuardados(2, frente2.piezaCodigo);
  check(
    "alta: guarda el canto elegido en cada lado y las puertas sin canto de su color van sin canto",
    JSON.stringify(guardadoPieza) === JSON.stringify([cantoB2, defectoFila[1], defectoFila[2], cantoB045]) && JSON.stringify(guardadoPuertas) === JSON.stringify([null, null, null, null]),
    `${guardadoPieza.map((id) => (id ? etiqueta(id) : "sin canto")).join(" / ")} || ${guardadoPuertas.map((id) => (id ? etiqueta(id) : "sin canto")).join(" / ")}`
  );
  check(
    "alta: la solicitud guardada no tiene color de cantos por modulo",
    Array.isArray(guardada.modulos) && guardada.modulos.length === 3 && guardada.modulos.every((modulo) => !("colorCanto" in modulo) && !("colorCantoId" in modulo))
  );
  const borrador = await page.evaluate((key) => [localStorage.getItem(key), localStorage.getItem(`${key}~live`)], draftKey);
  check("alta: borra el borrador", borrador[0] === null && borrador[1] === null);
  await shot("w6-detalle-creada", true);

  // Paridad entre pantallas: el Resumen del detalle muestra los numeros guardados (GET /api/pedidos-modulos/:id), que son
  // los de la ultima vista previa; el plano del detalle da las mismas placas e importe guardados.
  await panelOk(guardada, "detalle de la solicitud creada");
  check(
    "detalle de la solicitud creada: mismas placas e importe que la vista previa, y la pieza cambiada marcada Editada",
    guardada.placasEstimadas === preview.placasEstimadas &&
      guardada.presupuestoConHerrajes === preview.presupuestoConHerrajes &&
      (await despiece(1, "Bajo mesada 2 puertas").getByText("Editada", { exact: true }).count()) === 1 &&
      (await despiece(2, "Bajo mesada 2 puertas").getByText("Editada", { exact: true }).count()) === 0 &&
      (await despiece(3, "Alacena 2 puertas").getByText("Editada", { exact: true }).count()) === 0,
    `${guardada.placasEstimadas} placas guardadas, ${preview.placasEstimadas} en la vista previa`
  );
  check("detalle de la solicitud creada: sin Editar (llega en F5.2)", (await page.getByRole("button", { name: "Editar", exact: true }).count()) === 0);
  await page.getByRole("tab", { name: "Plano de cortes" }).click();
  const planoDetalle = page.getByText(/^Placas necesarias: \d+ - Costo estimado: /);
  await planoDetalle.waitFor({ timeout: 60000 });
  const detalleTexto = norm(await planoDetalle.innerText());
  check(
    "detalle de la solicitud creada: plano = placas e importe guardados",
    detalleTexto === `Placas necesarias: ${guardada.placasEstimadas} - Costo estimado: ${money(guardada.presupuestoEstimado)}`,
    detalleTexto
  );
  await shot("w6-detalle-plano");
  // Reemplaza al asistente en el historial: atras va al listado, no al asistente con la solicitud.
  await page.goBack();
  await page.waitForURL(`${APP}/modulos`, { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  check(
    "creada: atras no vuelve al asistente (el detalle lo reemplazo en el historial)",
    new URL(page.url()).pathname === "/modulos" && (await page.getByRole("heading", { name: "Nueva solicitud de módulos" }).count()) === 0 && (await page.getByLabel("Nombre o razón social").count()) === 0,
    new URL(page.url()).pathname
  );

  // Otra solicitud: el asistente arranca vacio, sin borrador.
  await page.getByRole("button", { name: "Nueva solicitud de módulos" }).click();
  await page.getByLabel("Nombre o razón social").waitFor();
  await page.waitForFunction(() => document.querySelector('input[type="date"]')?.value, null, { timeout: 15000 });
  check(
    "nueva despues de crear: arranca de cero con la fecha por defecto",
    (await page.getByLabel("Nombre o razón social").inputValue()) === "" && (await fecha.inputValue()) === addDays(hoy, dias) && (await page.getByText("Tenés una solicitud sin terminar").count()) === 0
  );

  // ---------------------------------------------------------------- C. salir mientras se crea
  const armar = async (cliente, modulos) => {
    await page.getByLabel("Nombre o razón social").fill(cliente);
    await page.getByLabel("Teléfono").fill("222222");
    await next();
    await search.waitFor();
    for (const nombre of modulos) await moduleButton(nombre).click();
    await next();
    await page.getByText("Colores por defecto").waitFor();
    await selectIn(barra, "Esqueleto", colorA);
    await selectIn(barra, "Frentes", colorB);
    await barra.getByRole("button", { name: "Aplicar a todos" }).click();
  };
  await armar(`${PREFIJO} salir`, ["Bajo mesada 2 puertas"]);
  response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  await response;
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor();
  const lenta = async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await sleep(3000);
    await route.continue().catch(() => undefined);
  };
  await page.route("**/pedidos-modulos", lenta);
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(`${APP}/`);
  await page.getByRole("link", { name: "Módulos a medida" }).click();
  await page.getByRole("button", { name: "Nueva solicitud de módulos" }).click();
  const esperando = await page
    .getByText("Se está terminando de crear la solicitud que mandaste antes de salir de la pantalla.")
    .waitFor({ state: "visible", timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  await page.waitForURL(/\/modulos\/[0-9a-f-]{36}$/, { timeout: 60000 }).catch(() => undefined);
  await page.unroute("**/pedidos-modulos", lenta);
  for (const id of psql(`select id from pedidos where cliente like '${PREFIJO}%'`).split("\n").filter(Boolean)) creados.add(id);
  const salirIds = psql(`select id from pedidos where cliente = '${PREFIJO} salir'`).split("\n").filter(Boolean);
  const salir = salirIds.length === 1 ? (await api("GET", `/pedidos-modulos/${salirIds[0]}`)).data : null;
  const llegadaSalir = salir ? await llegarAlDetalle(salir.id, salir.numero) : { ok: false, detalle: `${salirIds.length} solicitudes "salir"` };
  check(
    "salir mientras se crea: al volver espera ese alta y abre su detalle con la notificacion, sin ofrecer el borrador",
    esperando && salirIds.length === 1 && llegadaSalir.ok && (await page.getByText("Tenés una solicitud sin terminar").count()) === 0,
    `${esperando ? "espero" : "no espero"} | ${llegadaSalir.detalle}`
  );
  // La notificacion deja el historial sin estado: Volver lleva al listado, y desde ahi el asistente arranca vacio.
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.waitForURL(`${APP}/modulos`, { timeout: 15000 }).catch(() => undefined);
  check("salir mientras se crea: Volver del detalle lleva al listado", new URL(page.url()).pathname === "/modulos", new URL(page.url()).pathname);
  await page.getByRole("button", { name: "Nueva solicitud de módulos" }).click();
  await page.getByLabel("Nombre o razón social").waitFor();

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
    if (route.request().method() !== "POST") return route.fallback();
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
  await page.getByRole("link", { name: "Módulos a medida" }).click();
  await page.getByRole("button", { name: "Nueva solicitud de módulos" }).click();
  const bannerPerdida = page.locator(".MuiAlert-root", { hasText: "Tenés una solicitud sin terminar" });
  await bannerPerdida.waitFor({ timeout: 60000 });
  await page.unroute("**/pedidos-modulos", perdidaLenta);
  check(
    "salir y perder la respuesta: al volver, el borrador trae el aviso de que se estaba creando",
    norm(await bannerPerdida.innerText()).includes("Se estaba creando cuando se cerró la pantalla") && Boolean(creadaC?.numero)
  );
  await bannerPerdida.getByRole("button", { name: "Recuperar" }).click();
  await page.getByText("Colores por defecto").waitFor();
  response = nextPreview();
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  await response;
  await page.getByText("Despiece y resumen calculados por el servidor.").waitFor();
  const postsC = posts.length;
  await page.getByRole("button", { name: "Crear solicitud" }).click();
  const llegadaC = await llegarAlDetalle(creadaC.id, creadaC.numero);
  check(
    "al recuperarlo y crear, manda la misma clave, el servidor devuelve la que ya se habia creado y abre su detalle",
    posts.length === postsC + 1 &&
      JSON.parse(posts[posts.length - 1].postData()).claveAlta === psql(`select "claveAlta" from pedidos where cliente = '${PREFIJO} perdida'`) &&
      llegadaC.ok &&
      psql(`select count(*) from pedidos where cliente = '${PREFIJO} perdida'`) === "1",
    llegadaC.detalle
  );
  // El detalle de modulos (F5.1) lleva la barra de la seccion, y "Volver" lleva al listado. Desde ahi se vuelve al
  // asistente, que arranca vacio.
  let barraDetalle = "";
  for (let waited = 0; waited < 5000 && barraDetalle !== "Módulos a medida"; waited += 100) {
    barraDetalle = norm(await page.locator("header .MuiTypography-h6").innerText());
    await page.waitForTimeout(100);
  }
  check("creada: el detalle en /modulos/:id lleva la barra de la seccion", new URL(page.url()).pathname === `/modulos/${creadaC.id}` && barraDetalle === "Módulos a medida", barraDetalle);
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.waitForURL(`${APP}/modulos`, { timeout: 15000 }).catch(() => undefined);
  check("creada: Volver del detalle lleva al listado de modulos", new URL(page.url()).pathname === "/modulos");
  await page.getByRole("button", { name: "Nueva solicitud de módulos" }).click();
  await page.getByLabel("Nombre o razón social").waitFor();

  // ---------------------------------------------------------------- D. catalogo que cambia con el asistente abierto
  // Un modulo elegido mientras se cargan las definiciones tambien llega al paso 3.
  await page.getByLabel("Nombre o razón social").fill(`${PREFIJO} catalogo`);
  await page.getByLabel("Teléfono").fill("222222");
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
  await barra.getByRole("button", { name: "Aplicar a todos" }).click();
  psql(`update modulos set activo = false where id = '${ESPECIERO}'`);
  await page.getByRole("button", { name: "Revisar despiece" }).click();
  const avisoQuitado = page.locator(".MuiAlert-standardWarning", { hasText: "Se quitó Especiero" });
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
  await page.getByLabel("Nombre o razón social").fill("");
  await page.getByLabel("Teléfono").fill("");
  await page.goto(`${APP}/`);
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}~live`);
  }, draftKey);
  await page.waitForTimeout(2000);

  // ---------------------------------------------------------------- E. borrador
  await page.goto(`${APP}/modulos/nueva`);
  await page.getByLabel("Nombre o razón social").waitFor();
  await page.getByLabel("Nombre o razón social").fill(`${PREFIJO} borrador`);
  await page.getByLabel("Teléfono").fill("111111");
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
  // Y dejarlo como uno de antes de DECISIONES 45: color de cantos y cambios de canto con espesores por lado.
  await page.evaluate(
    ({ key, pieza, color }) => {
      const stored = JSON.parse(localStorage.getItem(key));
      stored.value.fechaEntrega = "2020-01-01";
      stored.value.units[0].colorCantoId = color;
      stored.value.units[0].cantosOverride = { [pieza]: { LARGO_1: 2, LARGO_2: null, ANCHO_1: null, ANCHO_2: null } };
      stored.value.defaults = { ...(stored.value.defaults ?? {}), colorCantoId: color };
      localStorage.setItem(key, JSON.stringify(stored));
    },
    { key: draftKey, pieza: codigo, color: colorAId }
  );
  // Chromium guarda localStorage en diferido: sin esta espera, la pagina nueva puede leer el valor anterior.
  await page.waitForTimeout(2000);
  await page.goto(`${APP}/modulos/nueva`);
  const banner = page.locator(".MuiAlert-root", { hasText: "Tenés una solicitud sin terminar" });
  await banner.waitFor();
  check("borrador: lo ofrece al volver", norm(await banner.innerText()).includes("Tenés una solicitud sin terminar (1 módulo, guardada"), norm(await banner.innerText()));
  await banner.getByRole("button", { name: "Recuperar" }).click();
  await page.getByText("Colores por defecto").waitFor();
  const avisos = norm(await page.locator(".MuiAlert-standardWarning").first().innerText().catch(() => ""));
  check("borrador: vuelve al paso 3 con lo cargado", (await c1.getByLabel("Ancho (mm)").inputValue()) === "700", await c1.getByLabel("Ancho (mm)").inputValue());
  check("borrador: avisa que la fecha ya paso", avisos.includes("La fecha de entrega del borrador ya pasó: se puso la de por defecto."), avisos);
  check("borrador de antes de DECISIONES 45: avisa que los cantos cambiados no se recuperaron", avisos.includes("Algunos cantos cambiados a mano no se pudieron recuperar: revisalos en el paso 4."), avisos);
  // Lo que no se pudo recuperar no queda como cambio: los lados null del formato viejo tampoco (si no, el paso 4 los
  // marca "Editada" y en azul, y el servidor guarda la pieza como CALCULADO).
  const chipViejo = norm(await c1.getByText(/con cantos cambiados$/).allInnerTexts());
  check("borrador de antes de DECISIONES 45: no queda ningún canto cambiado de ese formato", chipViejo === "", chipViejo);
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  check("borrador: datos del cliente y fecha por defecto", (await page.getByLabel("Nombre o razón social").inputValue()) === `${PREFIJO} borrador` && (await fecha.inputValue()) === addDays(hoy, dias));
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(`${APP}/`);
  await page.waitForTimeout(2000);
  await page.goto(`${APP}/modulos/nueva`);
  await banner.waitFor();
  await banner.getByRole("button", { name: "Descartar" }).click();
  await page.waitForTimeout(1200);
  guardado = await page.evaluate((key) => [localStorage.getItem(key), localStorage.getItem(`${key}~live`)], draftKey);
  check("borrador: descartar lo borra", (await banner.count()) === 0 && guardado[0] === null && guardado[1] === null && (await page.getByLabel("Nombre o razón social").inputValue()) === "");
  await page.waitForTimeout(1000);
  await page.reload();
  await page.getByLabel("Nombre o razón social").waitFor();
  await page.waitForTimeout(800);
  check("borrador: despues de descartar no vuelve a aparecer", (await banner.count()) === 0);

  // ---------------------------------------------------------------- F. otras pantallas
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
  await page.getByLabel("Código").waitFor({ timeout: 30000 });
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

// Errores esperados: el 409 y la respuesta cortada que se provocan a proposito, y el 400 inventado de la vista previa.
const esperados = [...expectedErrors, /^HTTP 400 POST \/pedidos-modulos\/preview$/, /status of 400/];
const inesperados = errors.filter((error) => !esperados.some((pattern) => pattern.test(error)));
check("sin errores en la consola ni respuestas fallidas inesperadas", inesperados.length === 0, inesperados.slice(0, 6).join(" || "));
console.log(failures ? `\n${failures} con problemas` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
