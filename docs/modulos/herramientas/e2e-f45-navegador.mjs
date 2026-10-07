// Prueba en el navegador del listado de solicitudes de modulos (F4.5): Edge sin ventana, con barras de desplazamiento
// reales, contra el backend local (puerto 4100, copia del backup) y Vite (puerto 5180, con
// VITE_API_URL=http://127.0.0.1:4100/api).
// - Permisos: sin sesion lleva a /admin; un carpintero no ve el menu ni entra, y su detalle vuelve a Mis solicitudes.
// - Vacio: sin solicitudes de modulos, "Todavia no hay solicitudes de modulos" con el boton para cargar la primera.
// - Con siete solicitudes de prueba que cubren todo el semaforo (atrasada, vence hoy, proxima, en plazo, entregada y
//   rechazada): indicadores, orden (las rechazadas despues de las en curso), columnas celda por celda, copiar una celda,
//   semaforo, orden por encabezado, filtros en la URL (estado, busqueda con pausa, telefono, numero, fechas escritas con
//   el teclado sin aplicar las intermedias, rango invertido), la grilla que no se desarma (orden, anchos), aviso para
//   lectores de pantalla, foco, seleccion con filtros y con errores, exportar (ids pedidos y contenido del Excel),
//   detalle en /modulos/:id con su menu y su barra, volver con los mismos filtros, redirecciones sin cargar dos veces,
//   errores (busqueda, listado y exportacion), menu desde un listado filtrado, borrar desde el detalle, zona horaria del
//   navegador, cambio de dia a la medianoche, dias de aviso de la configuracion, y tamanos de notebook, tablet y celular.
// Crea solicitudes "Prueba F4.5 ..." por la API, les pone estado y fechas por SQL (sin reserva de stock) y las borra al
// final. Deja la copia como estaba (pedidos, filas, historial, modulos de solicitudes y stock). No imprime datos de
// clientes: en los detalles solo van cantidades y datos de las solicitudes de prueba.
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
const ExcelJS = require("exceljs");

const APP = process.env.APP ?? "http://127.0.0.1:5180";
const API = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F4.5";
const ZONA = "America/Argentina/Buenos_Aires";
const AMARILLO = "rgb(161, 104, 7)";
const VERDE = "rgb(47, 125, 79)";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f45-capturas");
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
const ymd = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const addDays = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const dmy = (value) => value.split("-").reverse().join("/");
const sameSet = (a, b) => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
};

// Las fechas de las solicitudes de prueba son relativas a hoy en Argentina: una corrida que cruza la medianoche daria
// falsos MAL. Cerca de las 00:00 no arranca; si igual la cruza, lo dice al final.
const segundosHastaMedianoche = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return 86_400 - (get("hour") * 3600 + get("minute") * 60 + get("second"));
};
if (segundosHastaMedianoche() < 300) {
  console.log("MAL Faltan menos de 5 minutos para la medianoche de Argentina: corre la prueba despues de las 00:00.");
  process.exit(1);
}
const hoy = ymd(new Date());

// ---------------------------------------------------------------- datos de la copia
const restos = psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`);
if (restos !== "0") {
  console.log(`MAL hay ${restos} solicitudes "${PREFIJO}..." de una corrida anterior que se corto: borralas antes (DELETE /api/orders/:id).`);
  process.exit(1);
}
const modulosAntes = psql("select count(*) from pedidos where tipo = 'MODULOS'");
const userRow = (where) => {
  const [id, nombre, apellido, email, rol] = psql(`select id, nombre, apellido, email, rol from usuarios u where ${where} order by "fechaCreacion" limit 1`).split("|");
  return { id, nombre, apellido, email, rol };
};
const admin = userRow("rol = 'ADMIN'");
// Un carpintero con alguna solicitud de corte, para ver que su detalle vuelva a Mis solicitudes.
const carpintero = userRow(`rol = 'CARPINTERO' and exists (select 1 from pedidos p where p."usuarioId" = u.id and p.tipo = 'CORTE')`);
const corteCarpintero = psql(`select id from pedidos where "usuarioId" = '${carpintero.id}' and tipo = 'CORTE' order by "fechaCreacion" desc limit 1`);
const corteId = psql(`select id from pedidos where tipo = 'CORTE' order by "fechaCreacion" desc limit 1`);
const tokenFor = (user, expiresIn = "2h") => jwt.sign({ id: user.id, email: user.email, rol: user.rol }, SECRET, { expiresIn });
const adminToken = tokenFor(admin);
const api = async (method, path, body) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
const contar = () => ({
  pedidos: psql("select count(*) from pedidos"),
  modulos: psql("select count(*) from pedidos_modulo"),
  detalles: psql("select count(*) from detalle_pedidos"),
  historial: psql("select count(*) from historial_pedidos"),
  stock: psql(`select coalesce(sum("stockPlacas"), 0) from materiales`)
});
const antes = contar();
const aviso = Number(psql(`select "diasAvisoVencimiento" from configuracion_modulos where id = 'default'`));
const colores = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 0.45) < 1e-6)
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 2) < 1e-6)
  order by p.nombre limit 2`).split("\n");
const BAJO = psql("select id from modulos where codigo='BAJO_MESADA_2_PUERTAS'");
const linea = { moduloId: BAJO, valores: {}, colorEsqueletoId: colores[0], colorFrentesId: colores[1], colorCantoId: colores[0], perfilCantoOrden: 1 };
check(
  "datos de prueba",
  colores.length === 2 && Boolean(BAJO) && aviso === 3 && modulosAntes === "0" && Boolean(carpintero.id) && Boolean(corteCarpintero) && Boolean(corteId),
  `aviso ${aviso}, solicitudes de modulos ${modulosAntes}`
);

// Siete solicitudes que cubren el semaforo (con aviso de 3 dias). El estado y la fecha se ponen por SQL despues del
// alta: la API no deja cargar una fecha pasada, y asi tampoco hay reserva de stock que devolver al borrar. A delta se le
// pone la creacion a las 22:30 de ayer en Argentina (01:30 UTC de hoy): la columna Creada tiene que decir ayer en
// cualquier zona del navegador.
const FIXTURES = [
  { key: "alfa", estado: "PENDIENTE", estadoTexto: "Pendiente", dias: -3, modulos: 2, telefono: "1111111", plazo: "Atrasada 3 d", color: "rgb(150, 56, 43)" },
  { key: "beta", estado: "EN_PROCESO", estadoTexto: "En proceso", dias: 0, modulos: 1, telefono: "2222222", plazo: "Vence hoy", color: AMARILLO },
  { key: "gamma", estado: "TERMINADA", estadoTexto: "Terminada", dias: 2, modulos: 3, telefono: "3333333", plazo: "Faltan 2 d", color: AMARILLO },
  { key: "delta", estado: "PENDIENTE", estadoTexto: "Pendiente", dias: 10, modulos: 1, telefono: "4444444", plazo: "Faltan 10 d", color: VERDE, creada: addDays(hoy, -1) },
  { key: "epsilon", estado: "ENTREGADA", estadoTexto: "Entregada", dias: -20, modulos: 1, telefono: "5555555", plazo: "Entregada", color: "rgb(111, 103, 96)" },
  { key: "zeta", estado: "RECHAZADA", estadoTexto: "Rechazada", dias: -5, modulos: 1, telefono: "6666666", plazo: "Sin plazo", color: "rgb(111, 103, 96)" },
  { key: "eta", estado: "PENDIENTE", estadoTexto: "Pendiente", dias: 7, modulos: 2, telefono: "7777777", plazo: "Faltan 7 d", color: VERDE }
];
// Orden del servidor (DECISIONES 41): las que siguen en curso por fecha de entrega, despues la rechazada y al final la
// entregada. Es el mismo que el de la columna Plazo.
const ORDEN = ["alfa", "beta", "gamma", "eta", "delta", "zeta", "epsilon"];
const COLUMNAS = ["__check__", "ver", "numero", "cliente", "fechaEntrega", "plazo", "estado", "observaciones", "cantidadModulos", "fechaCreacion"];
const TITULOS = ["N°", "Cliente", "Entrega", "Plazo", "Estado", "Referencia", "Módulos", "Creada"];

// Con barras de desplazamiento reales, como en Windows: ocupan lugar y cambian lo que entra en pantalla.
const browser = await chromium.launch({ channel: "msedge", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
const errors = [];
// Errores provocados a proposito (se ignoran en el chequeo final).
const esperados = [];
async function newPage(user, { viewport = { width: 1366, height: 900 }, timezoneId = ZONA, tokenExpiresIn = "2h" } = {}) {
  const context = await browser.newContext({ viewport, locale: "es-AR", timezoneId, acceptDownloads: true });
  const page = await context.newPage();
  if (user) {
    page.on("console", (message) => message.type() === "error" && !message.location().url.includes("favicon") && errors.push(`console: ${message.text()} @ ${message.location().url.replace(API, "")}`));
    page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
    page.on("response", (response) => response.status() >= 400 && !response.url().includes("favicon") && errors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url().replace(API, "")}`));
    await page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("authMethod", user.rol === "ADMIN" ? "admin" : "google");
      },
      { token: tokenFor(user, tokenExpiresIn), user }
    );
  }
  return { context, page };
}
// Helpers de una pagina con el listado.
function listadoDe(page) {
  const listado = page.locator('[aria-label="Solicitudes de módulos"]');
  // Solo las filas de datos: mientras carga, el esqueleto tambien dibuja filas (sin data-id).
  const filas = () => listado.locator(".MuiDataGrid-row[data-id]");
  const clientes = async () => (await filas().locator('[data-field="cliente"] .MuiTypography-body2').allInnerTexts()).map((text) => text.replace(`${PREFIJO} `, ""));
  const fila = (key) => filas().filter({ hasText: `${PREFIJO} ${key}` });
  // Espera exactamente esa lista (un resultado viejo con la misma cantidad de filas no la cumple).
  const esperarClientes = async (esperado, timeout = 15000) => {
    for (let waited = 0; waited < timeout; waited += 100) {
      if (JSON.stringify(await clientes()) === JSON.stringify(esperado)) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };
  const celda = async (key, field) => {
    const cell = fila(key).locator(`[data-field="${field}"]`);
    return (await cell.count()) ? norm(await cell.innerText()) : "(sin celda)";
  };
  const barra = async () => norm(await page.locator("header .MuiTypography-h6").innerText());
  // Despues de un cambio de URL, React dibuja la pantalla nueva un instante despues (React Router usa una transicion).
  const esperarBarra = async (esperado) => {
    for (let waited = 0; waited < 5000; waited += 100) {
      if ((await barra()) === esperado) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };
  const valoresIndicadores = async () => (await page.locator('[aria-label="Indicadores"] .MuiTypography-h5').allTextContents()).map(norm);
  return { listado, filas, clientes, fila, esperarClientes, celda, barra, esperarBarra, valoresIndicadores };
}

const creados = [];
const fila = new Map();
try {
  // ---------------------------------------------------------------- A. permisos y carpinteros
  {
    const { context, page } = await newPage(null);
    await page.goto(`${APP}/modulos`);
    await page.waitForURL("**/admin", { timeout: 15000 }).catch(() => undefined);
    check("sin sesion, /modulos lleva al ingreso de administracion", new URL(page.url()).pathname === "/admin", new URL(page.url()).pathname);
    await page.goto(`${APP}/modulos/${corteId}`);
    await page.waitForURL("**/admin", { timeout: 15000 }).catch(() => undefined);
    check("sin sesion, /modulos/:id tambien", new URL(page.url()).pathname === "/admin", new URL(page.url()).pathname);
    await context.close();
  }
  {
    const { context, page } = await newPage(carpintero);
    const { barra } = listadoDe(page);
    await page.goto(`${APP}/`);
    await page.getByRole("link", { name: "Solicitar cortes" }).waitFor();
    check("carpintero: no ve Modulos a medida y la barra sigue igual", (await page.getByRole("link", { name: "Módulos a medida" }).count()) === 0 && (await barra()) === "Panel de solicitudes");
    await page.goto(`${APP}/modulos`);
    await page.waitForTimeout(1500);
    check("carpintero: /modulos vuelve al inicio", new URL(page.url()).pathname === "/", new URL(page.url()).pathname);
    await page.goto(`${APP}/modulos/${corteCarpintero}`);
    await page.waitForTimeout(1500);
    check("carpintero: /modulos/:id tambien vuelve al inicio", new URL(page.url()).pathname === "/", new URL(page.url()).pathname);
    await page.goto(`${APP}/pedidos/${corteCarpintero}`);
    await page.getByRole("button", { name: "Volver" }).waitFor({ timeout: 30000 });
    check("carpintero: su detalle sigue en /pedidos/:id con la barra de siempre", new URL(page.url()).pathname === `/pedidos/${corteCarpintero}` && (await barra()) === "Panel de solicitudes");
    await page.getByRole("button", { name: "Volver" }).click();
    await page.waitForURL("**/mis-solicitudes", { timeout: 15000 }).catch(() => undefined);
    check("carpintero: Volver de su detalle va a Mis solicitudes", new URL(page.url()).pathname === "/mis-solicitudes", new URL(page.url()).pathname);
    await context.close();
  }

  const { context, page } = await newPage(admin);
  // Lo que la grilla copia con Ctrl+C (sin pedir permiso al portapapeles del sistema).
  await page.addInitScript(() => {
    const copiar = async (text) => {
      window.__copiado = text;
    };
    try {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copiar } });
    } catch {
      // Sin portapapeles falso, el chequeo de copiar da MAL.
    }
  });
  // Para reproducir sin depender del reloj una pausa (300 o 600 ms) que termina justo despues de una navegacion: mientras
  // window.__capturar esta prendido, esas pausas no se programan y quedan en window.__pausas para dispararlas a mano.
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    window.__pausas = [];
    window.__capturar = false;
    window.setTimeout = (fn, delay, ...args) => {
      if (window.__capturar && (delay === 300 || delay === 600) && typeof fn === "function") {
        window.__pausas.push(() => fn(...args));
        return 0;
      }
      return original(fn, delay, ...args);
    };
  });
  const shot = (name, fullPage = false) => page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage });
  // Los pedidos al servidor: los del listado (pausa de la busqueda, fechas intermedias, rango invertido), los ids de cada
  // exportacion y los del detalle (para ver que una redireccion no lo cargue dos veces).
  const pedidos = [];
  const exportaciones = [];
  const detalles = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() !== "GET") return;
    if (url.pathname.endsWith("/pedidos-modulos")) pedidos.push(Object.fromEntries(url.searchParams));
    if (url.pathname.endsWith("/orders/export")) exportaciones.push(url.searchParams.get("ids"));
    if (/\/api\/orders\/[0-9a-f-]{36}$/.test(url.pathname)) detalles.push(url.pathname);
  });
  const { listado, filas, clientes, fila: filaDe, esperarClientes, celda, barra, esperarBarra, valoresIndicadores } = listadoDe(page);
  const buscar = page.getByLabel("Buscar");
  const desdeInput = page.getByLabel("Entrega desde");
  const hastaInput = page.getByLabel("Entrega hasta");
  const exportar = page.getByRole("button", { name: /^Exportar selección/ });
  // Sin resultados, el aviso va dentro de la grilla (que queda montada).
  const panelSinResultados = listado.locator(".MuiDataGrid-overlay").filter({ hasText: "No hay solicitudes que coincidan con los filtros" });
  const anuncio = async () => norm(await page.locator('main [role="status"]').first().textContent());
  const esperarAnuncio = async (esperado) => {
    for (let waited = 0; waited < 5000; waited += 100) {
      if ((await anuncio()) === esperado) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };
  const enfocadoEsBuscar = () => page.evaluate(() => document.activeElement?.closest(".MuiTextField-root")?.querySelector("label")?.textContent?.trim() === "Buscar");
  const enfocadoEsFiltros = () => page.evaluate(() => document.activeElement?.getAttribute("role") === "search" && document.activeElement?.getAttribute("aria-label") === "Filtros");
  const elegirEstado = async (texto) => {
    await page.getByRole("combobox", { name: /^Estado/ }).click();
    await page.getByRole("option", { name: texto, exact: true }).click();
  };
  // El de la barra esta siempre (deshabilitado sin filtros).
  const botonLimpiar = page.getByRole("button", { name: "Limpiar filtros" }).first();
  const limpiar = async () => {
    if (await botonLimpiar.isEnabled()) await botonLimpiar.click();
  };
  const urlTiene = (param, valor, timeout) =>
    page.waitForFunction(([p, v]) => new URL(location.href).searchParams.get(p) === v, [param, valor], { timeout }).then(
      () => true,
      () => false
    );
  const casilla = (key) => filaDe(key).locator('[data-field="__check__"] input');
  const encabezado = (field) => listado.locator(`.MuiDataGrid-columnHeader[data-field="${field}"]`);
  const ordenarPor = async (field) => {
    await encabezado(field).locator(".MuiDataGrid-columnHeaderTitle").click();
    await page.waitForTimeout(250);
  };
  const ordenDe = (field) => encabezado(field).getAttribute("aria-sort");
  const titulosCortados = () => listado.locator(".MuiDataGrid-columnHeaderTitle").evaluateAll((items) => items.filter((item) => item.scrollWidth > item.clientWidth).map((item) => item.textContent));
  // Fechas escritas con el teclado, como una persona (no con fill): desde el dia, segmento por segmento.
  const escribirFecha = async (input, digitos, espera = 400) => {
    const box = await input.boundingBox();
    await page.mouse.click(box.x + 18, box.y + box.height / 2);
    await page.keyboard.type(digitos, { delay: 80 });
    if (espera) await page.waitForTimeout(espera);
  };
  const ancho = async (field) => (await encabezado(field).boundingBox()).width;
  const arrastrar = async (field, dx) => {
    const separador = await encabezado(field).locator(".MuiDataGrid-columnSeparator").boundingBox();
    await page.mouse.move(separador.x + separador.width / 2, separador.y + separador.height / 2);
    await page.mouse.down();
    await page.mouse.move(separador.x + separador.width / 2 + dx, separador.y + separador.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  const contadorPie = async () => ((await page.locator(".MuiDataGrid-selectedRowCount").count()) ? norm(await page.locator(".MuiDataGrid-selectedRowCount").innerText()) : "");
  async function revisarExcel(archivo, keys) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(archivo);
    const sheet = workbook.worksheets[0];
    const prefijos = [];
    const nombres = [];
    let cantidad = 0;
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      cantidad += 1;
      prefijos.push(String(row.getCell(1).value ?? "").split("-")[0]);
      nombres.push(String(row.getCell(18).value ?? ""));
    });
    const ids = keys.map((key) => fila.get(key).id);
    const esperadas = Number(psql(`select count(*) from detalle_pedidos where "pedidoId" in (${ids.map((id) => `'${id}'`).join(",")})`));
    const ok =
      esperadas > 0 &&
      cantidad === esperadas &&
      sameSet(prefijos, keys.map((key) => `M${fila.get(key).numero}`)) &&
      sameSet(nombres, keys.map((key) => `${PREFIJO} ${key}`));
    // Solo cantidades: si fallara, las filas podrian ser de clientes reales de la copia.
    return { ok, detalle: `${cantidad} filas (esperadas ${esperadas}), ${new Set(prefijos).size} numeros, ${new Set(nombres).size} clientes` };
  }
  async function descargar() {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), exportar.click()]);
    const archivo = join(shotsDir, download.suggestedFilename());
    await download.saveAs(archivo);
    return { nombre: download.suggestedFilename(), archivo };
  }

  // ---------------------------------------------------------------- B. vacio (la copia no tiene solicitudes de modulos)
  await page.goto(`${APP}/`);
  await page.getByRole("link", { name: "Módulos a medida" }).click();
  await page.waitForURL(`${APP}/modulos`);
  await page.getByText("Todavía no hay solicitudes de módulos").waitFor();
  check("vacio: lo dice y ofrece cargar la primera", (await page.getByRole("button", { name: "Cargar la primera solicitud" }).count()) === 1);
  check("vacio: los cuatro indicadores en cero", JSON.stringify(await valoresIndicadores()) === '["0","0","0","0"]', (await valoresIndicadores()).join(", "));
  check("indicadores: los numeros no son encabezados", (await page.locator('[aria-label="Indicadores"]').getByRole("heading").count()) === 0);
  await shot("l0-vacio");
  // Un filtro vuelve a montar la grilla (sin resultados) y limpiar vuelve al aviso, sin pantalla en blanco y sin errores
  // en la consola: cada grilla montada tiene su propia referencia.
  const erroresAntesDelVacio = errors.length;
  await elegirEstado("Pendiente");
  const tablaSinCoincidencias = await panelSinResultados.waitFor({ timeout: 15000 }).then(
    () => true,
    () => false
  );
  await limpiar();
  // El texto del aviso tambien lo dice el anuncio para lectores de pantalla: se espera su boton.
  const vuelveElAviso = await page.getByRole("button", { name: "Cargar la primera solicitud" }).waitFor({ timeout: 15000 }).then(
    () => true,
    () => false
  );
  const titulosDelVacio = await page.getByRole("heading", { level: 1, name: "Módulos a medida" }).count();
  check(
    "vacio: un filtro muestra la tabla sin resultados y limpiar vuelve al aviso (y lo anuncia), sin errores en la consola",
    tablaSinCoincidencias &&
      vuelveElAviso &&
      (await esperarAnuncio("Todavía no hay solicitudes de módulos")) &&
      new URL(page.url()).search === "" &&
      titulosDelVacio === 1 &&
      errors.length === erroresAntesDelVacio,
    `tabla ${tablaSinCoincidencias}, aviso ${vuelveElAviso}, anuncio "${await anuncio()}", url "${new URL(page.url()).search}", h1 ${titulosDelVacio} | ${errors.slice(erroresAntesDelVacio).join(" | ").slice(0, 300)}`
  );

  // ---------------------------------------------------------------- C. siete solicitudes de prueba
  for (const item of FIXTURES) {
    const response = await api("POST", "/pedidos-modulos", {
      cliente: `${PREFIJO} ${item.key}`,
      numeroContacto: item.telefono,
      fechaEntrega: addDays(hoy, 30),
      observaciones: `Referencia ${item.key}`,
      modulos: Array.from({ length: item.modulos }, () => linea)
    });
    if (response.status !== 201) throw new Error(`alta ${item.key}: ${response.status} ${JSON.stringify(response.data).slice(0, 200)}`);
    creados.push(response.data.id);
    fila.set(item.key, response.data);
    psql(`update pedidos set estado = '${item.estado}', "fechaEntrega" = '${addDays(hoy, item.dias)}' where id = '${response.data.id}'`);
    if (item.creada) psql(`update pedidos set "fechaCreacion" = '${hoy}T01:30:00Z' where id = '${response.data.id}'`);
  }
  await page.reload();
  check("orden: las que siguen en curso por fecha, despues la rechazada y al final la entregada", await esperarClientes(ORDEN, 30000), (await clientes()).join(", "));
  check("menu: Modulos a medida queda marcado", await page.getByRole("link", { name: "Módulos a medida" }).evaluate((link) => link.classList.contains("Mui-selected")));
  check("titulo de la barra: Modulos a medida (y el de la pantalla, un solo encabezado)", (await barra()) === "Módulos a medida" && (await page.getByRole("heading", { name: "Módulos a medida" }).count()) === 1);
  check("la tabla tiene nombre para los lectores de pantalla", (await page.getByRole("grid", { name: "Solicitudes de módulos" }).count()) === 1);
  const indicadores = norm(await page.locator('[aria-label="Indicadores"]').innerText());
  check("indicadores: 5 en curso, 6 modulos a fabricar, 3 vencen esta semana y 1 atrasada", JSON.stringify(await valoresIndicadores()) === '["5","6","3","1"]', indicadores);
  const atrasadasColor = await page.locator('[aria-label="Indicadores"] .MuiPaper-root').nth(3).evaluate((element) => getComputedStyle(element).backgroundColor);
  check("indicadores: Atrasadas resaltada", atrasadasColor === "rgb(253, 241, 238)", atrasadasColor);
  const encabezados = await listado.locator('[role="columnheader"]').evaluateAll((items) => items.map((item) => item.getAttribute("data-field")));
  const titulos = (await listado.locator(".MuiDataGrid-columnHeaderTitle").allTextContents()).map(norm).filter(Boolean);
  check("columnas: lo urgente primero (N°, Cliente, Entrega, Plazo, Estado) y despues Referencia, Modulos y Creada", JSON.stringify(encabezados) === JSON.stringify(COLUMNAS) && JSON.stringify(titulos) === JSON.stringify(TITULOS), `${encabezados.join(",")} | ${titulos.join(",")}`);
  check("los titulos de las columnas entran enteros", (await titulosCortados()).length === 0, (await titulosCortados()).join(", "));

  // Celda por celda
  const malas = [];
  for (const key of ORDEN) {
    const item = FIXTURES.find((fixture) => fixture.key === key);
    const order = fila.get(key);
    const esperado = {
      numero: `M-${order.numero}`,
      cliente: `${PREFIJO} ${key} ${item.telefono}`,
      fechaEntrega: dmy(addDays(hoy, item.dias)),
      plazo: item.plazo,
      estado: item.estadoTexto,
      observaciones: `Referencia ${key}`,
      cantidadModulos: String(item.modulos),
      fechaCreacion: dmy(item.creada ?? hoy)
    };
    for (const [field, value] of Object.entries(esperado)) {
      const actual = await celda(key, field);
      if (actual !== value) malas.push(`${key}.${field}: "${actual}"`);
    }
    const chip = filaDe(key).locator('[data-field="plazo"] .MuiChip-root');
    const color = await chip.evaluate((element) => getComputedStyle(element).color);
    if (color !== item.color || !(await chip.getAttribute("title"))) malas.push(`${key}.semaforo: ${color}`);
  }
  check("celdas: numero, cliente con telefono, entrega, plazo, estado, referencia, modulos y creada; semaforo con color y explicacion", malas.length === 0, malas.join(" || "));
  check("el ojo de cada fila no es una parada de Tab (la grilla se recorre con las flechas)", (await listado.locator('[data-field="ver"] button').evaluateAll((buttons) => buttons.every((button) => button.tabIndex === -1))) === true);
  const reglasFoco = await page.evaluate(() => {
    const reglas = [];
    for (const hoja of document.styleSheets) {
      let lista = [];
      try {
        lista = hoja.cssRules;
      } catch {
        continue;
      }
      for (const regla of lista) if (regla.selectorText?.includes("MuiDataGrid-cell:focus-visible")) reglas.push(regla.selectorText);
    }
    return reglas;
  });
  check(
    "el contorno del foco de las celdas va en una regla sin :has() (un navegador sin :has() la descartaria entera)",
    reglasFoco.length > 0 && reglasFoco.every((selector) => !selector.includes(":has(")),
    `${reglasFoco.length} reglas`
  );
  check("Exportar deshabilitado se ve deshabilitado (sin el degradado del boton principal)", (await exportar.isDisabled()) && (await exportar.evaluate((button) => getComputedStyle(button).backgroundImage)) === "none");

  // Copiar una celda (Ctrl+C) da el texto que se ve, no el valor interno
  await filaDe("alfa").locator('[data-field="plazo"]').focus();
  await page.keyboard.press("Control+C");
  const copiadoPlazo = await page.evaluate(() => window.__copiado);
  await filaDe("beta").locator('[data-field="estado"]').focus();
  await page.keyboard.press("Control+C");
  const copiadoEstado = await page.evaluate(() => window.__copiado);
  check("copiar una celda: el texto que se ve en Plazo y en Estado", copiadoPlazo === "Atrasada 3 d" && copiadoEstado === "En proceso", `${copiadoPlazo} | ${copiadoEstado}`);
  await shot("l1-listado");

  // Menu de columna: sin "Filtro" (los filtros son los de arriba, en la URL)
  const encabezadoCliente = encabezado("cliente");
  await encabezadoCliente.hover();
  await encabezadoCliente.locator(".MuiDataGrid-menuIconButton").click();
  await page.getByRole("menu").waitFor();
  const opcionesMenu = (await page.getByRole("menuitem").allInnerTexts()).map(norm);
  await page.keyboard.press("Escape");
  check("menu de columna sin Filtro", opcionesMenu.length > 0 && !opcionesMenu.some((text) => /filtr/i.test(text)), opcionesMenu.join(", "));

  // Ordenar por encabezado
  await ordenarPor("plazo");
  const plazoAsc = await clientes();
  await ordenarPor("plazo");
  const plazoDesc = await clientes();
  await ordenarPor("plazo");
  check("ordenar por Plazo: de lo mas urgente a lo entregado, y al reves", JSON.stringify(plazoAsc) === JSON.stringify(ORDEN) && JSON.stringify(plazoDesc) === JSON.stringify([...ORDEN].reverse()), `${plazoAsc.join(",")} | ${plazoDesc.join(",")}`);
  await ordenarPor("estado");
  const estadoAsc = await clientes();
  await ordenarPor("estado");
  await ordenarPor("estado");
  check("ordenar por Estado: en el orden del trabajo", JSON.stringify(estadoAsc) === '["alfa","eta","delta","beta","gamma","epsilon","zeta"]', estadoAsc.join(","));
  await ordenarPor("cantidadModulos");
  // Con el mouse afuera: encima, MUI muestra el boton del menu y achica el titulo (eso le pasa a todas).
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  const modulosCortado = await titulosCortados();
  await ordenarPor("cantidadModulos");
  await ordenarPor("cantidadModulos");
  check("ordenada por Modulos, su titulo sigue entero", modulosCortado.length === 0, modulosCortado.join(", "));
  check("sin orden de columna vuelve el del servidor", await esperarClientes(ORDEN), (await clientes()).join(", "));

  // ---------------------------------------------------------------- D. filtros en la URL
  // Con la lista completa ya cargada, filtrar pide solo lo filtrado: los indicadores no la vuelven a pedir.
  pedidos.length = 0;
  await elegirEstado("En proceso");
  check(
    "filtro estado: solo la en proceso, en la URL, y los indicadores no cambian (sin volver a pedir la lista completa)",
    (await esperarClientes(["beta"])) &&
      page.url().includes("estado=EN_PROCESO") &&
      norm(await page.locator('[aria-label="Indicadores"]').innerText()) === indicadores &&
      JSON.stringify(pedidos) === '[{"estado":"EN_PROCESO"}]',
    JSON.stringify(pedidos)
  );
  check("aviso para lectores de pantalla: cuantas coinciden", await esperarAnuncio("1 solicitud coincide con los filtros"), await anuncio());
  await limpiar();
  check("limpiar filtros con el mouse: vuelven todas, la URL queda limpia y el foco pasa a la zona de filtros (no a Buscar: en un celular abriria el teclado)", (await esperarClientes(ORDEN)) && new URL(page.url()).search === "" && (await enfocadoEsFiltros()));
  check("aviso al limpiar", await esperarAnuncio("Sin filtros: 7 solicitudes"), await anuncio());
  await elegirEstado("En proceso");
  await esperarClientes(["beta"]);
  await page.getByRole("button", { name: "Limpiar filtros" }).first().press("Enter");
  check("limpiar filtros con el teclado: el foco pasa a Buscar", (await esperarClientes(ORDEN)) && (await enfocadoEsBuscar()));

  pedidos.length = 0;
  await buscar.pressSequentially("gamma", { delay: 60 });
  check("busqueda por cliente", (await esperarClientes(["gamma"])) && page.url().includes("q=gamma"), (await clientes()).join(", "));
  await page.waitForTimeout(500);
  check("busqueda: pide una sola vez, despues de la pausa (no por cada tecla)", JSON.stringify(pedidos) === '[{"search":"gamma"}]', JSON.stringify(pedidos));
  await buscar.fill("4444444");
  check("busqueda por telefono", (await esperarClientes(["delta"])) && page.url().includes("q=4444444"), (await clientes()).join(", "));
  await buscar.fill(`M-${fila.get("eta").numero}`);
  check("busqueda por numero M-", (await esperarClientes(["eta"])) && page.url().includes(`q=M-${fila.get("eta").numero}`), (await clientes()).join(", "));
  await buscar.fill("no existe ningun cliente asi");
  await panelSinResultados.waitFor();
  check("sin resultados: lo dice dentro de la tabla, lo anuncia y ofrece limpiar", (await panelSinResultados.getByRole("button", { name: "Limpiar filtros" }).count()) === 1 && (await esperarAnuncio("No hay solicitudes que coincidan con los filtros")));
  await panelSinResultados.getByRole("button", { name: "Limpiar filtros" }).press("Enter");
  check("el Limpiar de la tabla, con el teclado: vuelven todas, vacia Buscar y el foco queda en Buscar", (await esperarClientes(ORDEN)) && (await buscar.inputValue()) === "" && (await enfocadoEsBuscar()));

  // Limpiar con busqueda y estado, y enseguida (antes de la pausa de la busqueda) elegir una fecha: no vuelven los
  // filtros viejos ni se pierde la fecha (React Router aplica la URL en una transicion, DECISIONES 42).
  await elegirEstado("Pendiente");
  await buscar.fill(PREFIJO);
  await page.waitForURL(/q=/);
  await esperarClientes(["alfa", "eta", "delta"]);
  await limpiar();
  await desdeInput.fill(hoy);
  await page.waitForTimeout(1500);
  check(
    "limpiar y elegir una fecha enseguida: queda solo la fecha",
    (await esperarClientes(["beta", "gamma", "eta", "delta"])) && new URL(page.url()).search === `?desde=${hoy}` && (await buscar.inputValue()) === "",
    `${new URL(page.url()).search} | ${(await clientes()).join(", ")}`
  );
  await limpiar();
  await esperarClientes(ORDEN);

  // Fechas escritas con el teclado, como una persona (no con fill): el dia, el mes y el año, segmento por segmento.
  await escribirFecha(desdeInput, dmy(hoy).replaceAll("/", ""));
  check(
    "entrega desde escrita con el teclado: se aplica completa",
    (await esperarClientes(["beta", "gamma", "eta", "delta"])) && (await desdeInput.inputValue()) === hoy && new URL(page.url()).searchParams.get("desde") === hoy,
    `${await desdeInput.inputValue()} | ${new URL(page.url()).search}`
  );
  await escribirFecha(hastaInput, dmy(addDays(hoy, 7)).replaceAll("/", ""));
  check(
    "entrega hasta escrita con el teclado",
    (await esperarClientes(["beta", "gamma", "eta"])) && (await hastaInput.inputValue()) === addDays(hoy, 7) && new URL(page.url()).searchParams.get("hasta") === addDays(hoy, 7),
    `${await hastaInput.inputValue()} | ${new URL(page.url()).search}`
  );
  // Enter y la salida del campo con el teclado aplican enseguida, sin esperar la pausa de 600 ms. Salir con el mouse no:
  // la pausa la aplica despues, para que el click que saco el foco llegue a donde apunto.
  const diaNuevo = hoy.slice(8) === "15" ? "16" : "15";
  const desdeEditada = `${hoy.slice(0, 8)}${diaNuevo}`;
  await escribirFecha(desdeInput, diaNuevo, 0);
  await page.keyboard.press("Enter");
  check("cambiar solo el dia de una fecha puesta y Enter: se aplica enseguida, con el dia escrito", (await urlTiene("desde", desdeEditada, 300)) && (await desdeInput.inputValue()) === desdeEditada, `${await desdeInput.inputValue()} | ${new URL(page.url()).search}`);
  await escribirFecha(hastaInput, dmy(addDays(hoy, 8)).replaceAll("/", ""), 0);
  // En Edge, Tab desde el año todavia queda en el campo (pasa por el boton del calendario): se sigue hasta salir.
  let fueraDelCampo = false;
  for (let vez = 0; vez < 4 && !fueraDelCampo; vez += 1) {
    await page.keyboard.press("Tab");
    fueraDelCampo = await page.evaluate(() => document.activeElement?.closest(".MuiTextField-root")?.querySelector("label")?.textContent?.trim() !== "Entrega hasta");
  }
  check("salir del campo de fecha con Tab: se aplica enseguida", fueraDelCampo && (await urlTiene("hasta", addDays(hoy, 8), 300)), new URL(page.url()).search);
  await escribirFecha(hastaInput, dmy(addDays(hoy, 9)).replaceAll("/", ""), 0);
  await buscar.click();
  const conElMouseEnseguida = await urlTiene("hasta", addDays(hoy, 9), 150);
  const conElMouseDespues = await urlTiene("hasta", addDays(hoy, 9), 3000);
  check("salir del campo de fecha con el mouse: no se aplica en el momento, y la pausa la aplica despues", !conElMouseEnseguida && conElMouseDespues, new URL(page.url()).search);
  // Una fecha a medio escribir no saca ni cambia el filtro: ni un año incompleto (el navegador manda 0002-10-15) ni un
  // segmento borrado (manda "" con badInput). Al salir, el campo vuelve a mostrar la fecha que filtra.
  const desdeAntes = new URL(page.url()).searchParams.get("desde");
  const filasAntes = await clientes();
  await escribirFecha(desdeInput, `${dmy(hoy).slice(0, 2)}${dmy(hoy).slice(3, 5)}2`, 0);
  await page.waitForTimeout(1200);
  const quietaConAnio = new URL(page.url()).searchParams.get("desde") === desdeAntes && JSON.stringify(await clientes()) === JSON.stringify(filasAntes);
  await buscar.click();
  await page.waitForTimeout(400);
  check(
    "un año a medio escribir no se aplica, ni con la pausa ni al salir, y el campo vuelve a la fecha que filtra",
    quietaConAnio && new URL(page.url()).searchParams.get("desde") === desdeAntes && (await desdeInput.inputValue()) === desdeAntes,
    `${await desdeInput.inputValue()} | ${new URL(page.url()).search}`
  );
  const cajaDesde = await desdeInput.boundingBox();
  await page.mouse.click(cajaDesde.x + 18, cajaDesde.y + cajaDesde.height / 2);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(1200);
  const quietaConHueco =
    new URL(page.url()).searchParams.get("desde") === desdeAntes && JSON.stringify(await clientes()) === JSON.stringify(filasAntes) && (await desdeInput.evaluate((input) => input.validity.badInput));
  await buscar.click();
  await page.waitForTimeout(400);
  check(
    "borrar un segmento de una fecha puesta no saca el filtro, y al salir el campo vuelve a mostrarla",
    quietaConHueco && new URL(page.url()).searchParams.get("desde") === desdeAntes && (await desdeInput.inputValue()) === desdeAntes,
    `${await desdeInput.inputValue()} | ${new URL(page.url()).search}`
  );
  const cajaHasta = await hastaInput.boundingBox();
  await page.mouse.click(cajaHasta.x + 18, cajaHasta.y + cajaHasta.height / 2);
  await page.keyboard.press("Backspace");
  await limpiar();
  const vacias = (await esperarClientes(ORDEN)) && (await page.evaluate(() => [...document.querySelectorAll('input[type="date"]')].every((input) => input.value === "" && !input.validity.badInput)));
  check("limpiar tambien vacia las fechas, aunque una este a medio escribir", vacias && (await desdeInput.inputValue()) === "" && (await hastaInput.inputValue()) === "");
  // Elegir una fecha y limpiar antes de que termine su pausa: la fecha no vuelve cuando la pausa termina.
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  await desdeInput.fill(addDays(hoy, 3));
  await limpiar();
  await page.waitForTimeout(1200);
  check(
    "elegir una fecha y limpiar enseguida: la fecha no vuelve cuando termina su pausa",
    new URL(page.url()).search === "" && (await desdeInput.inputValue()) === "" && (await esperarClientes(ORDEN)),
    new URL(page.url()).search
  );

  // Borrar un segmento y salir con el teclado: el filtro queda, sin sacarse ni por un momento (ningun pedido sin la fecha).
  const salirConTab = async (label) => {
    for (let vez = 0; vez < 6; vez += 1) {
      await page.keyboard.press("Tab");
      const afuera = await page.evaluate((nombre) => document.activeElement?.closest(".MuiTextField-root")?.querySelector("label")?.textContent?.trim() !== nombre, label);
      if (afuera) return true;
    }
    return false;
  };
  const clickEnElDia = async (input) => {
    const caja = await input.boundingBox();
    await page.mouse.click(caja.x + 18, caja.y + caja.height / 2);
  };
  await desdeInput.fill(hoy);
  await urlTiene("desde", hoy, 5000);
  await esperarClientes(["beta", "gamma", "eta", "delta"]);
  await clickEnElDia(desdeInput);
  await page.keyboard.press("Backspace");
  pedidos.length = 0;
  const salioConTab = await salirConTab("Entrega desde");
  await page.waitForTimeout(150);
  const fechaEnseguida = new URL(page.url()).searchParams.get("desde");
  await page.waitForTimeout(1000);
  check(
    "borrar un segmento y salir con Tab: el filtro de fecha queda, sin sacarse ni por un momento",
    salioConTab && fechaEnseguida === hoy && new URL(page.url()).searchParams.get("desde") === hoy && pedidos.length === 0 && (await desdeInput.inputValue()) === hoy,
    JSON.stringify(pedidos)
  );
  // Borrar la fecha segmento por segmento: el navegador avisa solo el primero. Saliendo con el mouse, la pausa saca el
  // filtro, y otro filtro despues no lo trae de vuelta.
  // De segmento en segmento con la flecha derecha (en Edge, Tab sale del campo despues del mes).
  const borrarFecha = async (input) => {
    await clickEnElDia(input);
    await page.keyboard.press("Backspace");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Backspace");
  };
  // Las pausas de las teclas se capturan y se descartan: asi se ve que salir con el mouse saca el filtro por si solo.
  await page.evaluate(() => {
    window.__pausas = [];
    window.__capturar = true;
  });
  await borrarFecha(desdeInput);
  const pausasDeLasTeclas = await page.evaluate(() => {
    window.__capturar = false;
    const cantidad = window.__pausas.length;
    window.__pausas = [];
    return cantidad;
  });
  const vaciaDelTodo = await desdeInput.evaluate((input) => input.value === "" && !input.validity.badInput);
  await page.getByRole("heading", { name: "Módulos a medida" }).click();
  const sacadaConElMouse =
    (await page.waitForFunction(() => !new URL(location.href).searchParams.has("desde"), null, { timeout: 3000 }).then(
      () => true,
      () => false
    )) && (await esperarClientes(ORDEN, 5000));
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  check(
    "borrar la fecha segmento por segmento y salir con el mouse: la salida saca el filtro (sin las pausas de las teclas), y otro filtro no lo trae",
    pausasDeLasTeclas > 0 && vaciaDelTodo && sacadaConElMouse && new URL(page.url()).search === "?estado=PENDIENTE",
    `${pausasDeLasTeclas} pausas | ${new URL(page.url()).search}`
  );
  await limpiar();
  await esperarClientes(ORDEN);
  // Lo mismo sin salir del campo: la pausa tambien lo saca.
  await desdeInput.fill(hoy);
  await urlTiene("desde", hoy, 5000);
  await esperarClientes(["beta", "gamma", "eta", "delta"]);
  await borrarFecha(desdeInput);
  check("borrar la fecha segmento por segmento sin salir del campo: la pausa saca el filtro", (await esperarClientes(ORDEN, 5000)) && !new URL(page.url()).searchParams.has("desde"), new URL(page.url()).search);
  await limpiar();
  await esperarClientes(ORDEN);
  // Recorrer el calendario con las flechas no aplica los dias que se recorren: solo el que se elige (con Enter).
  await desdeInput.focus();
  pedidos.length = 0;
  await page.keyboard.press("F4");
  await page.waitForTimeout(400);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(1000);
  const recorriendo = pedidos.length;
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1300);
  check(
    "recorrer el calendario con las flechas no filtra por los dias recorridos: un solo pedido, con el dia elegido",
    recorriendo === 0 && pedidos.length === 1 && pedidos[0].entregaDesde === addDays(hoy, 14) && new URL(page.url()).searchParams.get("desde") === addDays(hoy, 14),
    `${recorriendo} mientras recorre | ${JSON.stringify(pedidos)}`
  );
  await limpiar();
  await esperarClientes(ORDEN);
  // Escribir una fecha completa y enseguida recorrer el calendario: cuando termina la pausa de la escrita (capturada y
  // disparada a mano, sin depender del reloj), el campo muestra otro dia. La pausa aplica la escrita, que es la elegida,
  // y no la recorrida; con Enter se aplica la nueva.
  await page.evaluate(() => {
    window.__pausas = [];
    window.__capturar = true;
  });
  pedidos.length = 0;
  await escribirFecha(desdeInput, dmy(addDays(hoy, 2)).replaceAll("/", ""), 0);
  await page.evaluate(() => {
    window.__capturar = false;
  });
  await page.keyboard.press("F4");
  await page.waitForTimeout(400);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  const pausasDeLaEscrita = await page.evaluate(() => {
    for (const pausa of window.__pausas) pausa();
    return window.__pausas.length;
  });
  await page.waitForTimeout(800);
  const pedidosRecorriendo = pedidos.map((item) => item.entregaDesde);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1300);
  check(
    "escribir una fecha y enseguida recorrer el calendario: la pausa aplica la escrita (no la recorrida) y Enter la elegida",
    pausasDeLaEscrita > 0 &&
      JSON.stringify(pedidosRecorriendo) === JSON.stringify([addDays(hoy, 2)]) &&
      JSON.stringify(pedidos.map((item) => item.entregaDesde)) === JSON.stringify([addDays(hoy, 2), addDays(hoy, 9)]) &&
      new URL(page.url()).searchParams.get("desde") === addDays(hoy, 9),
    `${pausasDeLaEscrita} pausas | ${JSON.stringify(pedidosRecorriendo)} mientras recorre | ${JSON.stringify(pedidos.map((item) => item.entregaDesde))}`
  );
  await limpiar();
  await esperarClientes(ORDEN);
  // Lo mismo, pero cerrando el calendario con Escape: el primero vuelve el campo a la escrita (que ya quedo aplicada) y
  // el segundo cierra el calendario.
  await page.evaluate(() => {
    window.__pausas = [];
    window.__capturar = true;
  });
  pedidos.length = 0;
  await escribirFecha(desdeInput, dmy(addDays(hoy, 2)).replaceAll("/", ""), 0);
  await page.evaluate(() => {
    window.__capturar = false;
  });
  await page.keyboard.press("F4");
  await page.waitForTimeout(400);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    for (const pausa of window.__pausas) pausa();
  });
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const trasEscape = `${await desdeInput.inputValue()} | ${new URL(page.url()).search}`;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1300);
  check(
    "escribir una fecha, recorrer enseguida el calendario y volver con Escape: el campo y el filtro quedan con la escrita, con un solo pedido",
    trasEscape === `${addDays(hoy, 2)} | ?desde=${addDays(hoy, 2)}` &&
      (await desdeInput.inputValue()) === addDays(hoy, 2) &&
      new URL(page.url()).search === `?desde=${addDays(hoy, 2)}` &&
      JSON.stringify(pedidos.map((item) => item.entregaDesde)) === JSON.stringify([addDays(hoy, 2)]),
    `${trasEscape} | ${JSON.stringify(pedidos.map((item) => item.entregaDesde))}`
  );
  await limpiar();
  await esperarClientes(ORDEN);
  // Y elegir desde y pasar enseguida al calendario de hasta: desde queda aplicada aunque se recorra el otro calendario, y
  // hasta no se aplica mientras no se elija.
  await page.evaluate(() => {
    window.__pausas = [];
    window.__capturar = true;
  });
  pedidos.length = 0;
  await escribirFecha(desdeInput, dmy(addDays(hoy, 3)).replaceAll("/", ""), 0);
  await clickEnElDia(hastaInput);
  await page.evaluate(() => {
    window.__capturar = false;
  });
  await page.keyboard.press("F4");
  await page.waitForTimeout(400);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    for (const pausa of window.__pausas) pausa();
  });
  await page.waitForTimeout(800);
  const conDesde = new URL(page.url()).search;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1300);
  check(
    "elegir desde y recorrer enseguida el calendario de hasta: desde queda aplicada, y hasta no mientras no se elija",
    conDesde === `?desde=${addDays(hoy, 3)}` &&
      new URL(page.url()).search === `?desde=${addDays(hoy, 3)}` &&
      (await hastaInput.inputValue()) === "" &&
      JSON.stringify(pedidos) === JSON.stringify([{ entregaDesde: addDays(hoy, 3) }]),
    `${conDesde} | ${new URL(page.url()).search} | ${JSON.stringify(pedidos)}`
  );
  await limpiar();
  await esperarClientes(ORDEN);

  // Escribir una fecha no aplica las intermedias (el "1" de "15" ya es una fecha valida): con el listado ordenado y dos
  // filas marcadas, un solo pedido al servidor, con la fecha final, y quedan el orden y la seleccion.
  await desdeInput.fill(addDays(hoy, -5));
  await hastaInput.fill(addDays(hoy, 10));
  // Con solo "desde" ya salen las mismas filas: se espera a que "hasta" tambien este aplicada antes de contar pedidos.
  await urlTiene("hasta", addDays(hoy, 10), 5000);
  await esperarClientes(["alfa", "beta", "gamma", "eta", "delta", "zeta"]);
  await ordenarPor("cliente");
  await esperarClientes(["alfa", "beta", "delta", "eta", "gamma", "zeta"]);
  await casilla("eta").check();
  await casilla("gamma").check();
  pedidos.length = 0;
  await escribirFecha(hastaInput, dmy(addDays(hoy, 9)).replaceAll("/", ""));
  const sinIntermedias = await esperarClientes(["alfa", "beta", "eta", "gamma", "zeta"]);
  await page.waitForTimeout(400);
  check(
    "escribir una fecha: un solo pedido con la fecha final, y quedan el orden y las filas marcadas",
    sinIntermedias && pedidos.length === 1 && pedidos[0].entregaHasta === addDays(hoy, 9) && (await casilla("eta").isChecked()) && (await casilla("gamma").isChecked()) && (await ordenDe("cliente")) === "ascending",
    `${JSON.stringify(pedidos.map((item) => item.entregaHasta))} | ${(await clientes()).join(",")}`
  );
  // Sin resultados la grilla no se desarma: vuelve con el mismo orden.
  await buscar.fill("no existe ningun cliente asi");
  await panelSinResultados.waitFor();
  await limpiar();
  check(
    "despues de una busqueda sin resultados la tabla sigue ordenada como estaba",
    (await esperarClientes(["alfa", "beta", "delta", "epsilon", "eta", "gamma", "zeta"])) && (await ordenDe("cliente")) === "ascending",
    `${await ordenDe("cliente")} | ${(await clientes()).join(",")}`
  );
  await casilla("eta").uncheck();
  await casilla("gamma").uncheck();
  await ordenarPor("cliente");
  await ordenarPor("cliente");
  await esperarClientes(ORDEN);

  // Un ancho acomodado a mano queda al soltar y al cambiar los filtros: en una columna de ancho fijo (Entrega) y en una
  // que reparte el espacio (Cliente, que pierde su reparto al acomodarla).
  const entregaAntes = await ancho("fechaEntrega");
  const clienteAntes = await ancho("cliente");
  await arrastrar("fechaEntrega", 80);
  await arrastrar("cliente", 120);
  const entregaMovida = await ancho("fechaEntrega");
  const clienteMovido = await ancho("cliente");
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  const entregaDespues = await ancho("fechaEntrega");
  const clienteDespues = await ancho("cliente");
  check(
    "un ancho acomodado a mano queda al soltar y al cambiar los filtros (Entrega y Cliente)",
    entregaMovida > entregaAntes + 50 && clienteMovido > clienteAntes + 80 && Math.abs(entregaDespues - entregaMovida) <= 2 && Math.abs(clienteDespues - clienteMovido) <= 2,
    `Entrega ${Math.round(entregaAntes)} -> ${Math.round(entregaMovida)} -> ${Math.round(entregaDespues)}; Cliente ${Math.round(clienteAntes)} -> ${Math.round(clienteMovido)} -> ${Math.round(clienteDespues)}`
  );
  await limpiar();
  await esperarClientes(ORDEN);

  // Rango invertido: avisa, no lo pide y no desmarca nada (mientras dura no hay nada que exportar).
  await desdeInput.fill(hoy);
  await hastaInput.fill(addDays(hoy, 7));
  check("rango de entrega: de hoy a 7 dias", await esperarClientes(["beta", "gamma", "eta"]), (await clientes()).join(", "));
  await casilla("gamma").check();
  pedidos.length = 0;
  await hastaInput.fill(addDays(hoy, -1));
  await page.getByText("La fecha de entrega desde no puede ser posterior a la fecha hasta.").waitFor();
  await page.waitForTimeout(500);
  check(
    "rango invertido: avisa, no lo pide, no queda nada para exportar y el pie de la tabla no cuenta filas ocultas",
    (await filas().count()) === 0 && pedidos.length === 0 && (await anuncio()) === "" && (await exportar.isDisabled()) && norm(await exportar.innerText()) === "Exportar selección" && (await contadorPie()) === "",
    `${JSON.stringify(pedidos)} | pie "${await contadorPie()}"`
  );
  await hastaInput.fill(addDays(hoy, 7));
  check(
    "al corregir el rango, la fila marcada vuelve marcada",
    (await esperarClientes(["beta", "gamma", "eta"])) && (await casilla("gamma").isChecked()) && norm(await exportar.innerText()) === "Exportar selección (1)" && (await contadorPie()) === "1 fila seleccionada",
    `pie "${await contadorPie()}"`
  );
  await casilla("gamma").uncheck();

  // ---------------------------------------------------------------- E. detalle en /modulos/:id y vuelta con los filtros
  // Primero el ojo, en la misma pantalla en que cambiaron los filtros (el boton se armo antes, con otra URL): su
  // "Volver" tiene que traer los filtros de ahora.
  const conFiltros = new URL(page.url()).search;
  await page.getByRole("button", { name: `Ver la solicitud M-${fila.get("eta").numero}` }).click();
  await page.waitForURL(`**/modulos/${fila.get("eta").id}`);
  const vueltaDelOjo = await page.evaluate(() => window.history.state?.usr?.returnTo ?? null);
  await page.getByRole("button", { name: "Volver" }).click();
  await page.waitForURL(`**/modulos${conFiltros}`, { timeout: 15000 }).catch(() => undefined);
  check(
    "el ojo de la fila: abre el detalle y Volver trae los filtros de ese momento",
    vueltaDelOjo === `/modulos${conFiltros}` && new URL(page.url()).search === conFiltros && (await esperarClientes(["beta", "gamma", "eta"])),
    String(vueltaDelOjo).replace(conFiltros, "?<filtros>")
  );
  await filaDe("gamma").locator('[data-field="cliente"]').click();
  await page.waitForURL(`**/modulos/${fila.get("gamma").id}`);
  await page.getByRole("button", { name: "Volver" }).waitFor();
  check(
    "click en la fila: abre el detalle en /modulos/:id, con el menu y la barra de la seccion",
    (await page.getByText(`${PREFIJO} gamma`).count()) >= 1 &&
      (await esperarBarra("Módulos a medida")) &&
      (await page.getByRole("link", { name: "Módulos a medida" }).evaluate((link) => link.classList.contains("Mui-selected"))) &&
      !(await page.getByRole("link", { name: "Solicitudes", exact: true }).evaluate((link) => link.classList.contains("Mui-selected")))
  );
  await page.getByRole("button", { name: "Volver" }).click();
  await page.waitForURL(`**/modulos${conFiltros}`);
  check(
    "volver: al listado con los mismos filtros y sus filas",
    (await esperarClientes(["beta", "gamma", "eta"])) && new URL(page.url()).search === conFiltros && (await desdeInput.inputValue()) === hoy && (await hastaInput.inputValue()) === addDays(hoy, 7)
  );
  await filaDe("eta").locator('[data-field="cliente"]').click();
  await page.waitForURL(`**/modulos/${fila.get("eta").id}`);
  await page.getByRole("button", { name: "Volver" }).waitFor();
  await page.goBack();
  await page.waitForURL(`**/modulos${conFiltros}`);
  check("atras del navegador desde el detalle: vuelta con los filtros y sus filas", (await esperarClientes(["beta", "gamma", "eta"])) && new URL(page.url()).search === conFiltros);
  await limpiar();
  await esperarClientes(ORDEN);

  // Teclado: el foco se ve (contorno oscuro y una barra en la fila, sin el fondo de las filas marcadas), y Enter abre
  // la fila que lo tiene
  await filaDe("delta").locator('[data-field="cliente"]').focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  const foco = await page.evaluate(() => {
    const element = document.activeElement;
    const filaConFoco = element?.closest(".MuiDataGrid-row");
    const otraFila = [...document.querySelectorAll(".MuiDataGrid-row[data-id]")].find((row) => row !== filaConFoco);
    return {
      id: filaConFoco?.getAttribute("data-id"),
      outline: element ? getComputedStyle(element).outlineStyle : "",
      color: element ? getComputedStyle(element).outlineColor : "",
      fondo: filaConFoco ? getComputedStyle(filaConFoco).backgroundColor : "",
      fondoOtra: otraFila ? getComputedStyle(otraFila).backgroundColor : "",
      barra: filaConFoco ? getComputedStyle(filaConFoco).boxShadow : ""
    };
  });
  check(
    "teclado: con las flechas, el foco se ve con un contorno oscuro y una barra en la fila, sin el fondo de las marcadas",
    foco.id === fila.get("zeta").id && foco.outline === "solid" && foco.color === "rgb(35, 32, 29)" && foco.fondo === foco.fondoOtra && foco.barra.includes("inset"),
    JSON.stringify({ ...foco, id: foco.id === fila.get("zeta").id })
  );
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/modulos/${fila.get("zeta").id}`, { timeout: 10000 }).catch(() => undefined);
  check("teclado: Enter abre la fila que tiene el foco", new URL(page.url()).pathname === `/modulos/${fila.get("zeta").id}`);
  await page.getByRole("button", { name: "Volver" }).click();
  await page.waitForURL(`${APP}/modulos`);
  await esperarClientes(ORDEN);

  // El foco tambien se ve en los encabezados, y en la columna de las casillas (ahi el foco pasa a la casilla de adentro).
  const focoEn = (selector) =>
    page.evaluate((sel) => {
      const element = document.activeElement;
      const caja = element?.closest(sel);
      const filaConFoco = element?.closest(".MuiDataGrid-row");
      return {
        campo: caja?.getAttribute("data-field") ?? null,
        casilla: element?.getAttribute("type") === "checkbox",
        outline: caja ? getComputedStyle(caja).outlineStyle : "",
        color: caja ? getComputedStyle(caja).outlineColor : "",
        barra: filaConFoco ? getComputedStyle(filaConFoco).boxShadow : ""
      };
    }, selector);
  await filas().first().locator('[data-field="cliente"]').focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(200);
  const focoEncabezado = await focoEn(".MuiDataGrid-columnHeader");
  check("teclado: en los encabezados el foco tambien se ve", focoEncabezado.campo === "cliente" && focoEncabezado.outline === "solid" && focoEncabezado.color === "rgb(35, 32, 29)", JSON.stringify(focoEncabezado));
  await page.keyboard.press("ArrowDown");
  // Con la pantalla recien abierta (la grilla recuerda la ultima celda con foco como su parada de Tab).
  await page.reload();
  await esperarClientes(ORDEN);
  await hastaInput.focus();
  let enLaGrilla = false;
  for (let vez = 0; vez < 8 && !enLaGrilla; vez += 1) {
    await page.keyboard.press("Tab");
    enLaGrilla = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="grid"]')));
  }
  const focoCasillaTodas = await focoEn(".MuiDataGrid-columnHeader");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  const focoCasillaFila = await focoEn(".MuiDataGrid-cell");
  check(
    "teclado: la primera parada en la grilla (seleccionar todas) y la casilla de cada fila tambien muestran el foco",
    enLaGrilla &&
      focoCasillaTodas.casilla &&
      focoCasillaTodas.campo === "__check__" &&
      focoCasillaTodas.outline === "solid" &&
      focoCasillaTodas.color === "rgb(35, 32, 29)" &&
      focoCasillaFila.casilla &&
      focoCasillaFila.campo === "__check__" &&
      focoCasillaFila.outline === "solid" &&
      focoCasillaFila.barra.includes("inset"),
    `${JSON.stringify(focoCasillaTodas)} | ${JSON.stringify(focoCasillaFila)}`
  );

  // Seleccionar texto (por ejemplo, para copiar el telefono) no abre la solicitud
  const telefono = filaDe("alfa").locator('[data-field="cliente"] .MuiTypography-caption');
  const caja = await telefono.boundingBox();
  await page.mouse.move(caja.x + 1, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width - 1, caja.y + caja.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const seleccionado = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  check("seleccionar el telefono con el mouse no abre la solicitud", new URL(page.url()).pathname === "/modulos" && seleccionado.length > 0, `${new URL(page.url()).pathname}, ${seleccionado.length} caracteres`);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());

  // Un link viejo a /pedidos/:id de una solicitud de modulos pasa a /modulos/:id (sin cargar el detalle dos veces); uno
  // de corte, al reves
  detalles.length = 0;
  await page.goto(`${APP}/modulos/${fila.get("delta").id}`);
  await page.getByRole("button", { name: "Volver" }).waitFor();
  await page.waitForTimeout(800);
  const cargasDirectas = detalles.length;
  detalles.length = 0;
  await page.goto(`${APP}/pedidos/${fila.get("delta").id}`);
  await page.waitForURL(`**/modulos/${fila.get("delta").id}`, { timeout: 15000 }).catch(() => undefined);
  await page.getByRole("button", { name: "Volver" }).waitFor();
  await page.waitForTimeout(800);
  const cargasConRedireccion = detalles.length;
  check(
    "/pedidos/:id de una solicitud de modulos pasa a /modulos/:id, sin cargarla de nuevo",
    new URL(page.url()).pathname === `/modulos/${fila.get("delta").id}` && (await esperarBarra("Módulos a medida")) && cargasConRedireccion === cargasDirectas,
    `cargas: directa ${cargasDirectas}, con redireccion ${cargasConRedireccion}`
  );
  await page.getByRole("button", { name: "Volver" }).click();
  await page.waitForURL(`${APP}/modulos`);
  check("sin origen, Volver va al listado de modulos", new URL(page.url()).pathname === "/modulos");
  await page.goto(`${APP}/modulos/${corteId}`);
  await page.waitForURL(`**/pedidos/${corteId}`, { timeout: 15000 }).catch(() => undefined);
  await page.getByRole("button", { name: "Volver" }).waitFor();
  check("/modulos/:id de una solicitud de corte pasa a /pedidos/:id, con la barra de siempre", new URL(page.url()).pathname === `/pedidos/${corteId}` && (await esperarBarra("Panel de solicitudes")), await barra());
  await page.getByRole("button", { name: "Volver" }).click();
  await page.waitForURL(`${APP}/pedidos`, { timeout: 15000 }).catch(() => undefined);
  check("corte: Volver del detalle sigue yendo a /pedidos", new URL(page.url()).pathname === "/pedidos");

  // Saltar con el historial (de a dos pasos) entre el detalle de una solicitud de modulos y el de una de corte: cada una
  // en su ruta, cargada una vez y con la URL quieta. Antes, la pantalla vieja redirigia a la otra y entraban en un ciclo.
  await page.goto(`${APP}/modulos`);
  await esperarClientes(ORDEN);
  await filaDe("eta").locator('[data-field="cliente"]').click();
  await page.waitForURL(`**/modulos/${fila.get("eta").id}`);
  await page.getByRole("button", { name: "Volver" }).waitFor();
  await page.getByRole("link", { name: "Solicitudes", exact: true }).click();
  await page.waitForURL(`${APP}/pedidos`);
  await page.getByRole("button", { name: "Ver", exact: true }).first().click();
  await page.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/);
  const detalleCorte = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Volver" }).waitFor();
  const cambiosDeUrl = [];
  const anotarUrl = (frame) => {
    if (frame === page.mainFrame()) cambiosDeUrl.push(new URL(frame.url()).pathname);
  };
  page.on("framenavigated", anotarUrl);
  // El detalle de corte calcula su plano en el navegador: hasta que termina, la pantalla atiende el salto mas tarde. Se
  // espera a que cada detalle se vea, y despues un rato mas para ver que la URL quede quieta.
  const esperarQue = async (condicion, timeout = 30000) => {
    for (let waited = 0; waited < timeout; waited += 200) {
      if (await condicion()) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };
  detalles.length = 0;
  await page.evaluate(() => window.history.go(-2));
  const llegoAtras = await esperarQue(async () => (await page.getByText(`${PREFIJO} eta`).count()) >= 1 && (await barra()) === "Módulos a medida");
  await page.waitForTimeout(1500);
  const saltoAtras = {
    llego: llegoAtras,
    ruta: new URL(page.url()).pathname === `/modulos/${fila.get("eta").id}`,
    cargas: detalles.length,
    cambios: cambiosDeUrl.length
  };
  cambiosDeUrl.length = 0;
  detalles.length = 0;
  await page.evaluate(() => window.history.go(2));
  const llegoAdelante = await esperarQue(async () => (await page.getByText(`${PREFIJO} eta`).count()) === 0 && (await barra()) === "Panel de solicitudes" && (await page.getByRole("button", { name: "Volver" }).count()) === 1);
  await page.waitForTimeout(1500);
  const saltoAdelante = {
    llego: llegoAdelante,
    ruta: new URL(page.url()).pathname === detalleCorte,
    cargas: detalles.length,
    cambios: cambiosDeUrl.length
  };
  page.off("framenavigated", anotarUrl);
  check(
    "saltar con el historial entre un detalle de modulos y uno de corte: cada uno en su ruta, una carga y la URL quieta",
    saltoAtras.llego && saltoAtras.ruta && saltoAtras.cargas <= 2 && saltoAtras.cambios <= 1 && saltoAdelante.llego && saltoAdelante.ruta && saltoAdelante.cargas <= 2 && saltoAdelante.cambios <= 1,
    `${JSON.stringify(saltoAtras)} | ${JSON.stringify(saltoAdelante)}`
  );
  // Al pasar a otra solicitud se monta un detalle nuevo: mientras carga no queda a la vista el titulo de la anterior, y
  // una respuesta tardia de la anterior no reemplaza a la que se esta viendo. Se compara solo con la solicitud de prueba
  // (la de corte es de la copia: no se imprime nada de ella).
  const tituloEsEta = async () => (await page.locator("main h4").count()) === 1 && norm(await page.locator("main h4").innerText()) === `${PREFIJO} eta`;
  const detalleDeEta = (url) => url.pathname.endsWith(`/api/orders/${fila.get("eta").id}`);
  const demorarEta = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue().catch(() => undefined);
  };
  await page.route(detalleDeEta, demorarEta);
  await page.evaluate(() => window.history.go(-2));
  await esperarQue(async () => (await barra()) === "Módulos a medida");
  const titulosMientrasCarga = await page.locator("main h4").count();
  const llegoEta = await esperarQue(tituloEsEta);
  await page.unroute(detalleDeEta, demorarEta);
  check("al saltar a otra solicitud, mientras carga no queda a la vista el titulo de la anterior", titulosMientrasCarga === 0 && llegoEta, `${titulosMientrasCarga} titulos mientras carga`);
  let soltarCorte = () => undefined;
  const corteRetenido = new Promise((resolve) => {
    soltarCorte = resolve;
  });
  const detalleDeCorte = (url) => url.pathname.endsWith(`/api/orders/${detalleCorte.split("/").pop()}`);
  const retenerCorte = async (route) => {
    await corteRetenido;
    await route.continue().catch(() => undefined);
  };
  await page.route(detalleDeCorte, retenerCorte);
  await page.evaluate(() => window.history.go(2));
  await esperarQue(async () => new URL(page.url()).pathname === detalleCorte, 10000);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.history.go(-2));
  const volvioAEta = await esperarQue(tituloEsEta);
  soltarCorte();
  await page.waitForTimeout(1500);
  const sigueEta = (await tituloEsEta()) && new URL(page.url()).pathname === `/modulos/${fila.get("eta").id}` && (await barra()) === "Módulos a medida";
  await page.unroute(detalleDeCorte, retenerCorte);
  check("si la solicitud anterior responde tarde, no reemplaza a la que se esta viendo", volvioAEta && sigueEta);
  await page.goto(`${APP}/modulos`);
  await esperarClientes(ORDEN);

  // ---------------------------------------------------------------- F. seleccion y exportar
  await casilla("alfa").check();
  await casilla("eta").check();
  check("exportar: el boton cuenta la seleccion", norm(await exportar.innerText()) === "Exportar selección (2)");
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  check(
    "un filtro que deja las filas marcadas no las desmarca",
    norm(await exportar.innerText()) === "Exportar selección (2)" && (await casilla("alfa").isChecked()) && (await casilla("eta").isChecked()) && !(await casilla("delta").isChecked())
  );
  exportaciones.length = 0;
  let descarga = await descargar();
  let excel = await revisarExcel(descarga.archivo, ["alfa", "eta"]);
  check(
    "exportar varias: pide exactamente esas, con el nombre de siempre (spec 11.1), y el Excel trae solo sus filas",
    descarga.nombre === "pedidos-carpinteria.xlsx" && exportaciones.length === 1 && sameSet(String(exportaciones[0]).split(","), [fila.get("alfa").id, fila.get("eta").id]) && excel.ok,
    `${descarga.nombre} | ${excel.detalle}`
  );
  await buscar.fill("no existe ningun cliente asi");
  await panelSinResultados.waitFor();
  check("sin resultados: no queda nada para exportar", (await exportar.isDisabled()) && norm(await exportar.innerText()) === "Exportar selección");
  await limpiar();
  await esperarClientes(ORDEN);
  check("las que salieron del resultado quedan desmarcadas", !(await casilla("alfa").isChecked()) && !(await casilla("eta").isChecked()) && (await exportar.isDisabled()));
  await casilla("alfa").check();
  exportaciones.length = 0;
  descarga = await descargar();
  excel = await revisarExcel(descarga.archivo, ["alfa"]);
  check(
    "exportar una: pedido-M{numero}.xlsx, pide solo esa y el Excel trae solo sus filas",
    descarga.nombre === `pedido-M${fila.get("alfa").numero}.xlsx` && exportaciones.length === 1 && exportaciones[0] === fila.get("alfa").id && excel.ok,
    `${descarga.nombre} | ${excel.detalle}`
  );
  await shot("l2-seleccion");

  // ---------------------------------------------------------------- G. errores
  // La exportacion responde 500 con un mensaje: se muestra ese mensaje.
  esperados.push(/^HTTP 500 GET \/orders\/export/, /^console: Failed to load resource: .*500.* @ \/orders\/export/);
  const exportacionCaida = (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Error de prueba al exportar." }) });
  await page.route("**/orders/export*", exportacionCaida);
  await exportar.click();
  await page.getByText("Error de prueba al exportar.").waitFor({ timeout: 15000 }).catch(() => undefined);
  check("exportar con error del servidor: muestra su mensaje", (await page.getByText("Error de prueba al exportar.").count()) === 1);
  await page.unroute("**/orders/export*", exportacionCaida);
  await page.locator(".MuiAlert-root", { hasText: "Error de prueba al exportar." }).getByRole("button").click();

  // Una busqueda que falla no desmarca nada: mientras dura el error no hay que exportar, y con Reintentar vuelven marcadas.
  await casilla("beta").check();
  esperados.push(/^HTTP 500 GET \/pedidos-modulos\?search=/, /^console: Failed to load resource: .*500.* @ \/pedidos-modulos\?search=/);
  const busquedaPrueba = (url) => url.pathname.endsWith("/pedidos-modulos") && url.searchParams.get("search") === "Prueba";
  const responderError = (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Fallo de prueba en la busqueda." }) });
  await page.route(busquedaPrueba, responderError);
  await buscar.fill("Prueba");
  await page.getByText("Fallo de prueba en la busqueda.").waitFor({ timeout: 15000 }).catch(() => undefined);
  check(
    "busqueda con error: lo muestra con Reintentar, sin filas, sin nada para exportar y sin contar filas ocultas en el pie",
    (await page.locator(".MuiAlert-root", { hasText: "Fallo de prueba en la busqueda." }).getByRole("button", { name: "Reintentar" }).count()) === 1 &&
      (await filas().count()) === 0 &&
      (await exportar.isDisabled()) &&
      (await contadorPie()) === "",
    `pie "${await contadorPie()}"`
  );
  await page.unroute(busquedaPrueba, responderError);
  pedidos.length = 0;
  await page.locator(".MuiAlert-root", { hasText: "Fallo de prueba en la busqueda." }).getByRole("button", { name: "Reintentar" }).click();
  // Reintentar pide de nuevo la busqueda; la lista completa de los indicadores ya estaba y no se vuelve a bajar.
  check(
    "Reintentar: vuelve el resultado con las filas que estaban marcadas, el pie cuenta lo mismo que Exportar y no se vuelve a pedir la lista completa",
    (await esperarClientes(ORDEN)) &&
      (await casilla("alfa").isChecked()) &&
      (await casilla("beta").isChecked()) &&
      norm(await exportar.innerText()) === "Exportar selección (2)" &&
      (await contadorPie()) === "2 filas seleccionadas" &&
      JSON.stringify(pedidos) === '[{"search":"Prueba"}]',
    `pie "${await contadorPie()}" | ${JSON.stringify(pedidos)}`
  );
  await casilla("alfa").uncheck();
  await casilla("beta").uncheck();
  // Una busqueda que falla y despues otra que anda: el error se va solo, sin Reintentar.
  const busquedaGamma = (url) => url.pathname.endsWith("/pedidos-modulos") && url.searchParams.get("search") === "gamma";
  await page.route(busquedaGamma, responderError);
  await buscar.fill("gamma");
  await page.getByText("Fallo de prueba en la busqueda.").waitFor({ timeout: 15000 }).catch(() => undefined);
  await page.unroute(busquedaGamma, responderError);
  await buscar.fill("4444444");
  check("la busqueda siguiente anda y el error se va solo", (await esperarClientes(["delta"])) && (await page.getByText("Fallo de prueba en la busqueda.").count()) === 0);
  await buscar.fill("no existe ningun cliente asi");
  check("y una sin resultados muestra su aviso", await panelSinResultados.waitFor({ timeout: 15000 }).then(() => true, () => false));
  await limpiar();
  await esperarClientes(ORDEN);

  // Una busqueda lenta: mientras llega, las filas anteriores siguen a la vista con una barra de carga con nombre.
  const busquedaLenta = (url) => url.pathname.endsWith("/pedidos-modulos") && url.searchParams.get("search") === "7777777";
  const demorar = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue().catch(() => undefined);
  };
  await page.route(busquedaLenta, demorar);
  await buscar.fill("7777777");
  await page.waitForTimeout(1200);
  check(
    "busqueda lenta sin filtros antes: barra de carga con nombre, la tabla ocupada y todas las filas a la vista",
    (await listado.getByRole("progressbar", { name: "Buscando solicitudes" }).count()) === 1 && (await listado.getAttribute("aria-busy")) === "true" && (await filas().count()) === 7
  );
  check("y despues, el resultado nuevo", (await esperarClientes(["eta"])) && (await listado.getAttribute("aria-busy")) === "false", (await clientes()).join(", "));
  await limpiar();
  await esperarClientes(ORDEN);
  // Desde un listado filtrado: quedan las filas de ese filtro (no las de un resultado viejo) y el aviso calla.
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  await esperarAnuncio("3 solicitudes coinciden con los filtros");
  await buscar.fill("7777777");
  await page.waitForURL(/q=7777777/);
  await page.waitForTimeout(700);
  check(
    "busqueda lenta desde un filtro: barra de carga, las filas del filtro anterior y sin aviso mientras carga",
    (await listado.locator(".MuiLinearProgress-root").count()) === 1 && JSON.stringify(await clientes()) === '["alfa","eta","delta"]' && (await anuncio()) === "",
    `${await listado.locator(".MuiLinearProgress-root").count()} barras | ${(await clientes()).join(", ")} | "${await anuncio()}"`
  );
  check("y despues, solo eta con su aviso", (await esperarClientes(["eta"])) && (await esperarAnuncio("1 solicitud coincide con los filtros")));
  await page.unroute(busquedaLenta, demorar);
  await limpiar();
  await esperarClientes(ORDEN);

  // Entrar con filtros en la URL: mientras llega el resultado (retenido hasta revisar), el esqueleto y la tabla ocupada,
  // no todas las solicitudes. Antes de mirar se espera a los indicadores: el listado completo ya llego.
  const rechazadas = (url) => url.pathname.endsWith("/pedidos-modulos") && url.searchParams.get("estado") === "RECHAZADA";
  let soltarRechazadas = () => undefined;
  const rechazadasRetenidas = new Promise((resolve) => {
    soltarRechazadas = resolve;
  });
  const retener = async (route) => {
    await rechazadasRetenidas;
    await route.continue().catch(() => undefined);
  };
  await page.route(rechazadas, retener);
  await page.goto(`${APP}/modulos?estado=RECHAZADA`);
  let indicadoresListos = false;
  for (let waited = 0; waited < 15000 && !indicadoresListos; waited += 100) {
    indicadoresListos = JSON.stringify(await valoresIndicadores()) === '["5","6","3","1"]';
    if (!indicadoresListos) await page.waitForTimeout(100);
  }
  const filasMientras = await filas().count();
  const esqueleto = await listado.locator(".MuiDataGrid-skeletonLoadingOverlay").count();
  check(
    "entrar con filtros en la URL: mientras llega el resultado, el esqueleto y la tabla ocupada, no las demas solicitudes",
    indicadoresListos && filasMientras === 0 && esqueleto === 1 && (await listado.getAttribute("aria-busy")) === "true" && (await panelSinResultados.count()) === 0,
    `${filasMientras} filas, esqueleto ${esqueleto}`
  );
  soltarRechazadas();
  check("y despues, el resultado del filtro", (await esperarClientes(["zeta"])) && (await listado.getAttribute("aria-busy")) === "false", (await clientes()).join(", "));
  await page.unroute(rechazadas, retener);
  await limpiar();
  await esperarClientes(ORDEN);

  // El listado completo falla al entrar: aviso con Reintentar, indicadores sin datos (no cargando para siempre) y la
  // tabla con su aviso; Reintentar lo trae.
  esperados.push(/^HTTP 500 GET \/pedidos-modulos$/, /^console: Failed to load resource: .*500.* @ \/pedidos-modulos$/);
  const listadoCompleto = (url) => url.pathname.endsWith("/pedidos-modulos") && !url.search;
  const listadoCaido = (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Fallo de prueba en el listado." }) });
  await page.route(listadoCompleto, listadoCaido);
  await page.reload();
  await page.getByText("Fallo de prueba en el listado.").waitFor({ timeout: 15000 }).catch(() => undefined);
  const sinDatos = await valoresIndicadores();
  check(
    "listado con error: aviso con Reintentar, indicadores sin datos y la tabla con su aviso",
    (await page.locator(".MuiAlert-root", { hasText: "Fallo de prueba en el listado." }).getByRole("button", { name: "Reintentar" }).count()) === 1 &&
      sinDatos.length === 4 &&
      sinDatos.every((text) => text.startsWith("—")) &&
      (await page.locator('[aria-label="Indicadores"] .MuiSkeleton-root').count()) === 0 &&
      (await listado.getByText("No se pudo cargar el listado").count()) === 1 &&
      (await filas().count()) === 0,
    sinDatos.join(", ")
  );
  await page.unroute(listadoCompleto, listadoCaido);
  await page.locator(".MuiAlert-root", { hasText: "Fallo de prueba en el listado." }).getByRole("button", { name: "Reintentar" }).click();
  check("Reintentar trae el listado y los indicadores, y saca el aviso", (await esperarClientes(ORDEN)) && (await page.getByText("Fallo de prueba en el listado.").count()) === 0 && JSON.stringify(await valoresIndicadores()) === '["5","6","3","1"]');
  // Si la lista sin filtros falla al entrar y despues se filtra (sin Reintentar), los indicadores se piden aparte: no
  // quedan cargando para siempre.
  const esperarIndicadores = async (esperado) => {
    for (let waited = 0; waited < 15000; waited += 200) {
      if (JSON.stringify(await valoresIndicadores()) === esperado) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };
  let fallarSinFiltros = true;
  const sinFiltrosQueFalla = (route) =>
    fallarSinFiltros ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Fallo de prueba en el listado." }) }) : route.continue();
  await page.route(listadoCompleto, sinFiltrosQueFalla);
  await page.reload();
  await page.getByText("Fallo de prueba en el listado.").waitFor({ timeout: 15000 }).catch(() => undefined);
  fallarSinFiltros = false;
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  check(
    "la lista sin filtros falla y despues se filtra: los indicadores se cargan igual (no quedan cargando)",
    (await esperarIndicadores('["5","6","3","1"]')) && (await page.locator('[aria-label="Indicadores"] .MuiSkeleton-root').count()) === 0,
    (await valoresIndicadores()).join(", ")
  );
  await page.unroute(listadoCompleto, sinFiltrosQueFalla);
  // Al entrar con filtros, los indicadores se piden aparte. Si se limpian los filtros antes de que ese pedido termine, la
  // lista sin filtros trae los indicadores y ese pedido se cancela: su error tardio no aparece.
  let soltarIndicadores = () => undefined;
  const indicadoresRetenidos = new Promise((resolve) => {
    soltarIndicadores = resolve;
  });
  const retenerYFallar = async (route) => {
    await indicadoresRetenidos;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Fallo tardio de prueba en los indicadores." }) }).catch(() => undefined);
  };
  await page.route(listadoCompleto, retenerYFallar);
  await page.goto(`${APP}/modulos?estado=PENDIENTE`);
  await esperarClientes(["alfa", "eta", "delta"]);
  await page.unroute(listadoCompleto, retenerYFallar);
  await limpiar();
  await esperarClientes(ORDEN);
  const conIndicadores = await esperarIndicadores('["5","6","3","1"]');
  soltarIndicadores();
  await page.waitForTimeout(1500);
  check(
    "un error tardio del pedido aparte de los indicadores no aparece cuando ya llego la lista",
    conIndicadores && (await page.getByText("Fallo tardio de prueba en los indicadores.").count()) === 0 && JSON.stringify(await valoresIndicadores()) === '["5","6","3","1"]'
  );
  // Con filtros, el pedido aparte de los indicadores falla: "—" (no esqueletos), el listado filtrado y un solo aviso, el
  // de los indicadores, con su Reintentar, que vuelve a pedir la lista completa.
  let fallarIndicadores = true;
  const indicadoresCaidos = (route) =>
    (fallarIndicadores
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Fallo de prueba en los indicadores." }) })
      : route.continue()
    ).catch(() => undefined);
  await page.route(listadoCompleto, indicadoresCaidos);
  await page.goto(`${APP}/modulos?estado=PENDIENTE`);
  const avisoIndicadores = page.locator(".MuiAlert-root", { hasText: "Fallo de prueba en los indicadores." });
  await avisoIndicadores.waitFor({ timeout: 15000 }).catch(() => undefined);
  const indicadoresCaidosValores = await valoresIndicadores();
  check(
    "con filtros, si fallan los indicadores: — sin esqueletos, el listado filtrado y un solo aviso, con Reintentar",
    (await esperarClientes(["alfa", "eta", "delta"])) &&
      indicadoresCaidosValores.length === 4 &&
      indicadoresCaidosValores.every((text) => text.startsWith("—")) &&
      (await page.locator('[aria-label="Indicadores"] .MuiSkeleton-root').count()) === 0 &&
      (await page.locator(".MuiAlert-root").count()) === 1 &&
      (await avisoIndicadores.getByRole("button", { name: "Reintentar" }).count()) === 1,
    indicadoresCaidosValores.join(", ")
  );
  fallarIndicadores = false;
  pedidos.length = 0;
  await avisoIndicadores.getByRole("button", { name: "Reintentar" }).click();
  check(
    "y su Reintentar vuelve a pedir la lista completa: los indicadores, sin el aviso",
    (await esperarIndicadores('["5","6","3","1"]')) &&
      (await avisoIndicadores.count()) === 0 &&
      pedidos.filter((item) => Object.keys(item).length === 0).length === 1 &&
      (await esperarClientes(["alfa", "eta", "delta"])),
    JSON.stringify(pedidos)
  );
  await page.unroute(listadoCompleto, indicadoresCaidos);
  await limpiar();
  await esperarClientes(ORDEN);

  // ---------------------------------------------------------------- H. menu desde un listado filtrado (con fechas)
  await elegirEstado("Pendiente");
  await buscar.fill(PREFIJO);
  await page.waitForURL(/q=/);
  await desdeInput.fill(addDays(hoy, -5));
  await hastaInput.fill(addDays(hoy, 7));
  await esperarClientes(["alfa", "eta"]);
  const filtrada = new URL(page.url()).search;
  pedidos.length = 0;
  await page.getByRole("link", { name: "Módulos a medida" }).click();
  await page.waitForURL(`${APP}/modulos`);
  await page.waitForTimeout(1000);
  check(
    "el menu desde un listado filtrado: limpia la URL, la busqueda, las fechas y las filas, y no vuelve un filtro viejo",
    new URL(page.url()).search === "" &&
      (await esperarClientes(ORDEN)) &&
      (await buscar.inputValue()) === "" &&
      (await desdeInput.inputValue()) === "" &&
      (await hastaInput.inputValue()) === "" &&
      (await botonLimpiar.isDisabled()) &&
      pedidos.every((item) => Object.keys(item).length === 0),
    `${new URL(page.url()).search} | ${JSON.stringify(pedidos)}`
  );
  await page.goBack();
  await page.waitForURL(`**/modulos${filtrada}`);
  let restaurado = false;
  for (let waited = 0; waited < 5000 && !restaurado; waited += 100) {
    restaurado = (await buscar.inputValue()) === PREFIJO && (await desdeInput.inputValue()) === addDays(hoy, -5) && (await hastaInput.inputValue()) === addDays(hoy, 7);
    if (!restaurado) await page.waitForTimeout(100);
  }
  check("y atras vuelve a los filtros, con lo escrito en Buscar y las fechas", (await esperarClientes(["alfa", "eta"])) && restaurado);
  await limpiar();
  await esperarClientes(ORDEN);
  // El menu enseguida despues de escribir (antes de la pausa), con la URL ya sin filtros: tambien manda sobre lo escrito.
  await desdeInput.fill(addDays(hoy, 5));
  await page.getByRole("link", { name: "Módulos a medida" }).click();
  await page.waitForTimeout(1200);
  check("el menu enseguida despues de elegir una fecha: no queda la fecha ni su filtro", new URL(page.url()).search === "" && (await desdeInput.inputValue()) === "" && (await esperarClientes(ORDEN)), new URL(page.url()).search);
  await buscar.fill("gamma");
  await page.getByRole("link", { name: "Módulos a medida" }).click();
  await page.waitForTimeout(1200);
  check("el menu enseguida despues de escribir en Buscar: no queda la busqueda", new URL(page.url()).search === "" && (await buscar.inputValue()) === "" && (await esperarClientes(ORDEN)), new URL(page.url()).search);

  // Al limpiar los filtros llega la lista de nuevo: un cambio hecho mientras tanto (por ejemplo, desde otra pestaña) se
  // ve, y lo marcado sigue marcado.
  await casilla("alfa").check();
  await buscar.fill(PREFIJO);
  await page.waitForURL(/q=/);
  await esperarClientes(ORDEN);
  psql(`update pedidos set estado = 'EN_PROCESO' where id = '${fila.get("eta").id}'`);
  await limpiar();
  let listaFresca = false;
  for (let waited = 0; waited < 10000 && !listaFresca; waited += 200) {
    listaFresca = (await celda("eta", "estado")) === "En proceso";
    if (!listaFresca) await page.waitForTimeout(200);
  }
  check("al limpiar los filtros llega la lista de nuevo (con lo que cambio mientras tanto) y lo marcado sigue marcado", listaFresca && (await casilla("alfa").isChecked()), await celda("eta", "estado"));
  psql(`update pedidos set estado = 'PENDIENTE' where id = '${fila.get("eta").id}'`);
  await casilla("alfa").uncheck();
  await page.reload();
  await esperarClientes(ORDEN);

  // Una pausa que termina justo despues de una navegacion ajena no la deshace: la pausa de la busqueda se captura y se
  // dispara a mano enseguida de tocar el menu (o una fila), en el mismo momento.
  await page.evaluate(() => {
    window.__pausas = [];
    window.__capturar = true;
  });
  await buscar.fill("gam");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__capturar = false;
    document.querySelector('a[href="/modulos"]').click();
    for (const pausa of window.__pausas) pausa();
  });
  await page.waitForTimeout(1200);
  check("una pausa que termina despues de tocar el menu no deshace la navegacion", new URL(page.url()).search === "" && (await buscar.inputValue()) === "" && (await esperarClientes(ORDEN)), new URL(page.url()).search);
  // Otra vez, pero la pausa termina despues de que la pantalla ya tomo la URL del menu (Buscar vacio). Entre ese momento y
  // el dibujo siguiente, la pausa leeria lo escrito antes: un cambio armado antes de una navegacion ajena no se aplica.
  await page.goto(`${APP}/modulos`);
  await esperarClientes(ORDEN);
  await page.evaluate(() => {
    window.__pausas = [];
    window.__capturar = true;
  });
  await buscar.fill("gam");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__capturar = false;
  });
  await page.getByRole("link", { name: "Módulos a medida" }).click();
  let tomoElMenu = false;
  for (let waited = 0; waited < 5000 && !tomoElMenu; waited += 100) {
    tomoElMenu = (await buscar.inputValue()) === "";
    if (!tomoElMenu) await page.waitForTimeout(100);
  }
  const pausasViejas = await page.evaluate(() => {
    for (const pausa of window.__pausas) pausa();
    return window.__pausas.length;
  });
  await page.waitForTimeout(1200);
  check(
    "una pausa que termina despues de que la pantalla tomo el menu tampoco lo deshace",
    tomoElMenu && pausasViejas > 0 && new URL(page.url()).search === "" && (await buscar.inputValue()) === "" && (await esperarClientes(ORDEN)),
    `${pausasViejas} pausas | ${new URL(page.url()).search}`
  );
  // Y una pausa que termina enseguida de abrir una fila. Arranca del listado completo, sin depender de lo anterior.
  await page.goto(`${APP}/modulos`);
  await esperarClientes(ORDEN);
  await page.evaluate(() => {
    window.__pausas = [];
    window.__capturar = true;
  });
  await buscar.fill("Prueba");
  await page.waitForTimeout(200);
  await page.evaluate((id) => {
    window.__capturar = false;
    document.querySelector(`[aria-label="Solicitudes de módulos"] .MuiDataGrid-row[data-id="${id}"] [data-field="cliente"]`).click();
    for (const pausa of window.__pausas) pausa();
  }, fila.get("alfa").id);
  await page.waitForURL(`**/modulos/${fila.get("alfa").id}`, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  check("una pausa que termina despues de abrir una fila no la cancela", new URL(page.url()).pathname === `/modulos/${fila.get("alfa").id}`, new URL(page.url()).pathname.replace(fila.get("alfa").id, "<alfa>"));
  await page.goto(`${APP}/modulos`);
  await esperarClientes(ORDEN);

  // Atras con una fecha a medio escribir, sin salir del campo: el campo queda como la URL (vacio, sin segmentos sueltos).
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  await page.getByRole("link", { name: "Módulos a medida" }).click();
  await page.waitForURL(`${APP}/modulos`);
  await esperarClientes(ORDEN);
  await escribirFecha(desdeInput, dmy(hoy).slice(0, 5).replace("/", ""), 0);
  const aMedias = await desdeInput.evaluate((input) => input.validity.badInput);
  await page.goBack();
  await page.waitForURL(/\?estado=PENDIENTE$/);
  check(
    "atras con una fecha a medio escribir, sin salir del campo: el campo queda como la URL (vacio)",
    aMedias && (await esperarClientes(["alfa", "eta", "delta"])) && (await desdeInput.evaluate((input) => input.value === "" && !input.validity.badInput)) && !new URL(page.url()).searchParams.has("desde")
  );
  await limpiar();
  await esperarClientes(ORDEN);

  // ---------------------------------------------------------------- I. otras pantallas
  await page.getByRole("button", { name: "Nueva solicitud de módulos" }).click();
  await page.waitForURL("**/modulos/nueva");
  await page.getByRole("heading", { name: "Nueva solicitud de módulos" }).waitFor({ timeout: 30000 });
  check("boton Nueva solicitud: abre el asistente, con la barra de la seccion", await esperarBarra("Módulos a medida"), await barra());
  await page.goto(`${APP}/configuracion-modulos`);
  check("titulo de la barra en el catalogo", await esperarBarra("Catálogo de módulos"), await barra());
  await page.goto(`${APP}/pedidos`);
  check("titulo de la barra en las solicitudes de corte: el de siempre", await esperarBarra("Panel de solicitudes"), await barra());

  // ---------------------------------------------------------------- J. tamanos (con barras de desplazamiento reales)
  // Lo que se sale de la pantalla: la pagina entera (un elemento con position absolute escapa del recorte de <main>) y
  // el contenido de <main>, que lo recorta (overflow-x clip).
  const desborde = () =>
    page.evaluate(() => {
      const doc = document.documentElement;
      const main = document.querySelector("main");
      return { pagina: `${doc.scrollWidth}/${doc.clientWidth}`, main: `${main.scrollWidth}/${main.clientWidth}`, ok: doc.scrollWidth <= doc.clientWidth && main.scrollWidth <= main.clientWidth };
    });
  for (const [ancho, alto] of [[1366, 768], [1280, 800], [1024, 768]]) {
    await page.setViewportSize({ width: ancho, height: alto });
    await page.goto(`${APP}/modulos`);
    await esperarClientes(ORDEN);
    const grilla = await listado.boundingBox();
    const borde = async (field) => {
      const box = await encabezado(field).boundingBox();
      return box ? box.x + box.width : Infinity;
    };
    const medida = await desborde();
    const primera = await filas().first().boundingBox();
    check(
      `${ancho}x${alto}: Plazo y Estado a la vista sin desplazar la tabla, una solicitud entera sin bajar, y nada se sale de la pantalla`,
      (await borde("plazo")) <= grilla.x + grilla.width && (await borde("estado")) <= grilla.x + grilla.width && medida.ok && Boolean(primera) && primera.y + primera.height <= alto,
      `estado termina en ${Math.round(await borde("estado"))}, la tabla en ${Math.round(grilla.x + grilla.width)}; primera fila hasta ${primera ? Math.round(primera.y + primera.height) : "-"}; pagina ${medida.pagina}, main ${medida.main}`
    );
    await shot(`l3-notebook-${ancho}`);
  }
  // La barra de filtros no cambia de alto al marcar una fila ni cuando aparece el primer filtro (si cambiara, la grilla
  // se moveria debajo del puntero entre un click y el siguiente). En 1320 px el texto de Exportar con su cuenta la partia.
  await page.setViewportSize({ width: 1320, height: 900 });
  await page.goto(`${APP}/modulos`);
  await esperarClientes(ORDEN);
  const altoBarra = async () => Math.round((await page.locator('[role="search"][aria-label="Filtros"]').boundingBox()).height);
  const altoSinNada = await altoBarra();
  await casilla("alfa").check();
  const altoConUna = await altoBarra();
  await casilla("alfa").uncheck();
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  const altoConFiltro = await altoBarra();
  await limpiar();
  await esperarClientes(ORDEN);
  check("la barra de filtros no cambia de alto al marcar una fila ni al aparecer un filtro", altoSinNada === altoConUna && altoConUna === altoConFiltro, `${altoSinNada} / ${altoConUna} / ${altoConFiltro}`);
  // Sin resultados, el aviso y su boton se ven sin bajar en una notebook.
  for (const [anchoPantalla, altoPantalla] of [[1024, 768], [1366, 657]]) {
    await page.setViewportSize({ width: anchoPantalla, height: altoPantalla });
    await page.goto(`${APP}/modulos?q=no-existe-ningun-cliente`);
    await panelSinResultados.waitFor();
    const mensaje = await panelSinResultados.getByText("No hay solicitudes que coincidan con los filtros").boundingBox();
    const botonDelAviso = await panelSinResultados.getByRole("button", { name: "Limpiar filtros" }).boundingBox();
    check(
      `${anchoPantalla}x${altoPantalla}: sin resultados, el aviso y su boton se ven sin bajar`,
      Boolean(mensaje && botonDelAviso) && mensaje.y + mensaje.height <= altoPantalla && botonDelAviso.y + botonDelAviso.height <= altoPantalla,
      `aviso hasta ${mensaje ? Math.round(mensaje.y + mensaje.height) : "-"}, boton hasta ${botonDelAviso ? Math.round(botonDelAviso.y + botonDelAviso.height) : "-"}`
    );
  }
  // La pista de Buscar (cliente, telefono, referencia o numero) entra entera en el campo.
  const pistaEntra = () =>
    page.evaluate(() => {
      const input = document.querySelector("input[placeholder]");
      const style = getComputedStyle(input);
      const context = document.createElement("canvas").getContext("2d");
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const texto = Math.ceil(context.measureText(input.placeholder).width);
      const lugar = Math.floor(input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      return { texto, lugar };
    });
  const pistas = [];
  for (const [anchoPantalla, altoPantalla] of [[948, 900], [1366, 900], [390, 844]]) {
    await page.setViewportSize({ width: anchoPantalla, height: altoPantalla });
    await page.goto(`${APP}/modulos`);
    await esperarClientes(ORDEN);
    pistas.push({ ancho: anchoPantalla, ...(await pistaEntra()) });
  }
  check("la pista de Buscar entra entera en el campo (948, 1366 y 390 px)", pistas.every((pista) => pista.texto <= pista.lugar), JSON.stringify(pistas));
  for (const [nombre, ancho, alto] of [["tablet", 768, 1024], ["celular", 390, 844]]) {
    await page.setViewportSize({ width: ancho, height: alto });
    await page.goto(`${APP}/modulos`);
    await esperarClientes(ORDEN);
    const medida = await desborde();
    await listado.locator(".MuiDataGrid-virtualScroller").evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await page.waitForTimeout(500);
    await shot(`l4-${nombre}-desplazada`);
    const ultima = await encabezado("fechaCreacion").boundingBox({ timeout: 5000 }).catch(() => null);
    const paginacion = await page.locator(".MuiTablePagination-actions").boundingBox({ timeout: 5000 }).catch(() => null);
    check(
      `${nombre}: nada se sale de la pantalla; la tabla se desplaza adentro hasta la ultima columna y la paginacion se ve`,
      medida.ok && Boolean(ultima) && ultima.x >= 0 && ultima.x + ultima.width <= ancho && Boolean(paginacion) && paginacion.x + paginacion.width <= ancho,
      `pagina ${medida.pagina}, main ${medida.main}, creada ${ultima ? Math.round(ultima.x + ultima.width) : "sin caja"}, paginacion ${paginacion ? Math.round(paginacion.x + paginacion.width) : "sin caja"}`
    );
    await shot(`l4-${nombre}`);
  }
  await page.setViewportSize({ width: 1366, height: 900 });

  // ---------------------------------------------------------------- K. el navegador en otra zona horaria
  {
    // A las 21 de Argentina, en Tokio (y en UTC) ya es el dia siguiente: un "hoy" tomado del reloj local del navegador
    // daria otro semaforo. El reloj se fija para que eso pase a cualquier hora de la corrida.
    const otra = await newPage(admin, { timezoneId: "Asia/Tokyo", tokenExpiresIn: "48h" });
    await otra.page.clock.install({ time: new Date(`${hoy}T21:00:00-03:00`) });
    const enTokio = listadoDe(otra.page);
    await otra.page.goto(`${APP}/modulos`);
    const okFilas = await enTokio.esperarClientes(ORDEN, 30000);
    const distintas = [];
    for (const item of FIXTURES) {
      if ((await enTokio.celda(item.key, "fechaCreacion")) !== dmy(item.creada ?? hoy)) distintas.push(`${item.key}.creada`);
      if ((await enTokio.celda(item.key, "fechaEntrega")) !== dmy(addDays(hoy, item.dias))) distintas.push(`${item.key}.entrega`);
      if ((await enTokio.celda(item.key, "plazo")) !== item.plazo) distintas.push(`${item.key}.plazo`);
    }
    const indicadoresTokio = await enTokio.valoresIndicadores();
    check(
      "navegador en Tokio, ya en el dia siguiente: las mismas fechas, el mismo semaforo y los mismos indicadores que en Argentina",
      okFilas && distintas.length === 0 && JSON.stringify(indicadoresTokio) === '["5","6","3","1"]',
      `${distintas.join(", ")} | ${indicadoresTokio.join(",")}`
    );
    await otra.context.close();
  }

  // ---------------------------------------------------------------- L. la medianoche con la pantalla abierta
  {
    // El reloj del navegador arranca 30 s antes de la medianoche de hoy en Argentina y despues se adelanta un minuto,
    // sin tocar la pantalla. El token dura mas, para que la sesion no venza con el reloj adelantado.
    const otra = await newPage(admin, { tokenExpiresIn: "48h" });
    await otra.page.clock.install({ time: new Date(`${hoy}T23:59:30-03:00`) });
    const reloj = listadoDe(otra.page);
    await otra.page.goto(`${APP}/modulos`);
    await reloj.esperarClientes(ORDEN, 30000);
    const antesDeMedianoche = await reloj.celda("beta", "plazo");
    const indicadoresAntes = await reloj.valoresIndicadores();
    // A la medianoche las columnas se rearman (cambia el dia): los anchos acomodados a mano tienen que quedar.
    const encabezadoDe = (field) => reloj.listado.locator(`.MuiDataGrid-columnHeader[data-field="${field}"]`);
    const anchoDe = async (field) => (await encabezadoDe(field).boundingBox()).width;
    const arrastrarEn = async (field, dx) => {
      const separador = await encabezadoDe(field).locator(".MuiDataGrid-columnSeparator").boundingBox();
      await otra.page.mouse.move(separador.x + separador.width / 2, separador.y + separador.height / 2);
      await otra.page.mouse.down();
      await otra.page.mouse.move(separador.x + separador.width / 2 + dx, separador.y + separador.height / 2, { steps: 8 });
      await otra.page.mouse.up();
      await otra.page.waitForTimeout(200);
    };
    const anchosAntes = { entrega: await anchoDe("fechaEntrega"), cliente: await anchoDe("cliente") };
    await arrastrarEn("fechaEntrega", 80);
    await arrastrarEn("cliente", 120);
    const anchosMovidos = { entrega: await anchoDe("fechaEntrega"), cliente: await anchoDe("cliente") };
    await otra.page.clock.fastForward("01:00");
    await otra.page.waitForTimeout(500);
    const despues = await reloj.celda("beta", "plazo");
    const indicadoresDespues = await reloj.valoresIndicadores();
    const anchosDespues = { entrega: await anchoDe("fechaEntrega"), cliente: await anchoDe("cliente") };
    check(
      "medianoche: sin tocar nada, la que vencia hoy pasa a atrasada y los indicadores se actualizan",
      antesDeMedianoche === "Vence hoy" && despues === "Atrasada 1 d" && indicadoresAntes[3] === "1" && indicadoresDespues[3] === "2",
      `${antesDeMedianoche} -> ${despues}, atrasadas ${indicadoresAntes[3]} -> ${indicadoresDespues[3]}`
    );
    check(
      "medianoche: los anchos acomodados a mano quedan cuando las columnas se rearman",
      anchosMovidos.entrega > anchosAntes.entrega + 50 &&
        anchosMovidos.cliente > anchosAntes.cliente + 80 &&
        Math.abs(anchosDespues.entrega - anchosMovidos.entrega) <= 2 &&
        Math.abs(anchosDespues.cliente - anchosMovidos.cliente) <= 2,
      `Entrega ${Math.round(anchosAntes.entrega)} -> ${Math.round(anchosMovidos.entrega)} -> ${Math.round(anchosDespues.entrega)}; Cliente ${Math.round(anchosAntes.cliente)} -> ${Math.round(anchosMovidos.cliente)} -> ${Math.round(anchosDespues.cliente)}`
    );
    await otra.context.close();
  }

  // ---------------------------------------------------------------- L2. los dias de aviso salen de la configuracion
  // Se cambian solo en la respuesta, en el navegador: con 7 dias, eta (faltan 7) pasa a amarillo; con 1, gamma (faltan 2)
  // pasa a verde. Con el valor de respaldo (3) quedarian al reves.
  for (const [dias, key, color] of [[7, "eta", AMARILLO], [1, "gamma", VERDE]]) {
    const otra = await newPage(admin);
    await otra.page.route("**/api/modulos/configuracion", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, diasAvisoVencimiento: dias } });
    });
    const vista = listadoDe(otra.page);
    await otra.page.goto(`${APP}/modulos`);
    await vista.esperarClientes(ORDEN, 30000);
    const colorChip = await vista.fila(key).locator('[data-field="plazo"] .MuiChip-root').evaluate((element) => getComputedStyle(element).color);
    check(`dias de aviso de la configuracion (${dias}): ${key} cambia de color`, colorChip === color, colorChip);
    await otra.context.close();
  }

  // ---------------------------------------------------------------- L3. si la configuracion no llega
  // El listado se ve igual, sin aviso de error, y el semaforo usa 3 dias de aviso (eta, a 7 dias, en verde; gamma, a 2, en
  // amarillo). Es el unico chequeo que fija ese valor de respaldo: el de la copia tambien es 3.
  esperados.push(/^HTTP 500 GET \/modulos\/configuracion$/, /^console: Failed to load resource: .*500.* @ \/modulos\/configuracion$/);
  {
    const otra = await newPage(admin);
    await otra.page.route("**/api/modulos/configuracion", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Fallo de prueba en la configuracion." }) })
    );
    const vista = listadoDe(otra.page);
    await otra.page.goto(`${APP}/modulos`);
    const okFilas = await vista.esperarClientes(ORDEN, 30000);
    const colorDe = (key) => vista.fila(key).locator('[data-field="plazo"] .MuiChip-root').evaluate((element) => getComputedStyle(element).color);
    const coloresChip = { eta: await colorDe("eta"), gamma: await colorDe("gamma") };
    check(
      "configuracion caida: el listado completo, sin aviso de error, con los indicadores y el semaforo con 3 dias",
      okFilas && (await otra.page.locator(".MuiAlert-root").count()) === 0 && JSON.stringify(await vista.valoresIndicadores()) === '["5","6","3","1"]' && coloresChip.eta === VERDE && coloresChip.gamma === AMARILLO,
      JSON.stringify(coloresChip)
    );
    await otra.context.close();
  }

  // ---------------------------------------------------------------- L4. un resultado nuevo arranca en la primera pagina
  // Con 120 solicitudes inventadas (respondidas en el navegador, sin tocar la copia): desde la pagina 2, o con la tabla
  // bajada, un filtro muestra su resultado desde el principio (las mas urgentes), no en la pagina o la altura de antes.
  {
    const otra = await newPage(admin);
    const creadaInventada = new Date().toISOString();
    const inventadas = Array.from({ length: 120 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      numero: 90000 + index,
      cliente: `Inventada ${String(index).padStart(3, "0")}`,
      numeroContacto: "0000000",
      emailContacto: null,
      observaciones: null,
      estado: index % 2 ? "PENDIENTE" : "EN_PROCESO",
      fechaCreacion: creadaInventada,
      fechaActualizacion: creadaInventada,
      fechaEntrega: addDays(hoy, index),
      placasEstimadas: 1,
      presupuestoEstimado: 1,
      costoHerrajes: 0,
      faltanteStock: false,
      stockReservado: false,
      usuarioId: admin.id,
      cantidadModulos: 1,
      presupuestoConHerrajes: 1
    }));
    // Las de Pendiente se pueden retener (una promesa que se suelta a mano) y la lista completa puede fallar. Si la pantalla
    // ya corto el pedido, contestarlo falla: se ignora.
    let retenerPendientes = null;
    let fallarCompleta = false;
    await otra.page.route(
      (url) => url.pathname.endsWith("/pedidos-modulos"),
      async (route) => {
        const estado = new URL(route.request().url()).searchParams.get("estado");
        if (estado === "PENDIENTE" && retenerPendientes) await retenerPendientes;
        if (!estado && fallarCompleta) {
          return route
            .fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Fallo de prueba en los indicadores." }) })
            .catch(() => undefined);
        }
        return route.fulfill({ json: estado ? inventadas.filter((orden) => orden.estado === estado) : inventadas }).catch(() => undefined);
      }
    );
    const vista = listadoDe(otra.page);
    const primeraFila = async () => norm(await vista.filas().first().locator('[data-field="cliente"] .MuiTypography-body2').innerText());
    const rango = async () => norm(await otra.page.locator(".MuiTablePagination-displayedRows").innerText());
    await otra.page.goto(`${APP}/modulos`);
    await vista.filas().first().waitFor({ timeout: 30000 });
    await otra.page.getByRole("button", { name: /p.gina siguiente/ }).click();
    await otra.page.waitForTimeout(400);
    const enPagina2 = await rango();
    await otra.page.getByRole("combobox", { name: /^Estado/ }).click();
    await otra.page.getByRole("option", { name: "Pendiente", exact: true }).click();
    let primeraPagina = false;
    for (let waited = 0; waited < 10000 && !primeraPagina; waited += 200) {
      primeraPagina = (await rango()).startsWith("1–50") && (await primeraFila()) === "Inventada 001";
      if (!primeraPagina) await otra.page.waitForTimeout(200);
    }
    check("desde la pagina 2, un filtro muestra su resultado desde la primera pagina", enPagina2.startsWith("51–100") && primeraPagina, `${enPagina2} -> ${await rango()}`);
    await vista.listado.locator(".MuiDataGrid-virtualScroller").evaluate((element) => {
      element.scrollTop = 1500;
    });
    await otra.page.waitForTimeout(300);
    await otra.page.getByRole("combobox", { name: /^Estado/ }).click();
    await otra.page.getByRole("option", { name: "En proceso", exact: true }).click();
    let arriba = false;
    for (let waited = 0; waited < 10000 && !arriba; waited += 200) {
      arriba = (await primeraFila()) === "Inventada 000" && (await vista.listado.locator(".MuiDataGrid-virtualScroller").evaluate((element) => element.scrollTop)) === 0;
      if (!arriba) await otra.page.waitForTimeout(200);
    }
    check("con la tabla bajada, un filtro muestra su resultado desde arriba", arriba);
    // Un resultado de los mismos filtros queda en la pagina y a la altura en que estaba. Desde la pagina 2 con la tabla
    // bajada: elegir Pendiente (con su respuesta retenida) y volver a Todos antes de que llegue.
    const scroller = vista.listado.locator(".MuiDataGrid-virtualScroller");
    const alturaTabla = () => scroller.evaluate((element) => element.scrollTop);
    const elegirEnOtra = async (texto) => {
      await otra.page.getByRole("combobox", { name: /^Estado/ }).click();
      await otra.page.getByRole("option", { name: texto, exact: true }).click();
    };
    const esperarRango = async (inicio) => {
      for (let waited = 0; waited < 10000; waited += 200) {
        if ((await rango()).startsWith(inicio)) return true;
        await otra.page.waitForTimeout(200);
      }
      return false;
    };
    const esperarLibre = async () => {
      for (let waited = 0; waited < 10000; waited += 100) {
        if ((await vista.listado.getAttribute("aria-busy")) === "false") return true;
        await otra.page.waitForTimeout(100);
      }
      return false;
    };
    await elegirEnOtra("Todos");
    await esperarRango("1–50 de 120");
    await otra.page.getByRole("button", { name: /p.gina siguiente/ }).click();
    const enLaPagina2 = await esperarRango("51–100 de 120");
    await scroller.evaluate((element) => {
      element.scrollTop = 900;
    });
    await otra.page.waitForTimeout(300);
    const alturaAntes = await alturaTabla();
    let soltarPendientes = () => undefined;
    retenerPendientes = new Promise((resolve) => {
      soltarPendientes = resolve;
    });
    await elegirEnOtra("Pendiente");
    await otra.page.waitForTimeout(300);
    const llegaSinFiltros = otra.page
      .waitForResponse((response) => response.url().includes("/pedidos-modulos") && !new URL(response.url()).search, { timeout: 10000 })
      .then(
        () => true,
        () => false
      );
    await elegirEnOtra("Todos");
    const llegoSinFiltros = (await llegaSinFiltros) && (await esperarLibre());
    await otra.page.waitForTimeout(300);
    const quedoAlVolver = `${await rango()} | ${await alturaTabla()}`;
    soltarPendientes();
    retenerPendientes = null;
    await otra.page.waitForTimeout(600);
    const quedoDespues = `${await rango()} | ${await alturaTabla()}`;
    check(
      "un resultado de los mismos filtros (volver a Todos antes de que llegue otro) queda en la pagina y a la altura en que estaba",
      enLaPagina2 && alturaAntes > 0 && llegoSinFiltros && quedoAlVolver === `51–100 de 120 | ${alturaAntes}` && quedoDespues === quedoAlVolver,
      `${alturaAntes} -> ${quedoAlVolver} -> ${quedoDespues}`
    );
    // Y Reintentar en el aviso de los indicadores (con filtros, su pedido aparte fallo): el listado filtrado se vuelve a
    // pedir y queda en la pagina y a la altura en que estaba.
    fallarCompleta = true;
    await otra.page.goto(`${APP}/modulos?estado=PENDIENTE`);
    const avisoInventadas = otra.page.locator(".MuiAlert-root", { hasText: "Fallo de prueba en los indicadores." });
    await avisoInventadas.waitFor({ timeout: 15000 }).catch(() => undefined);
    await vista.filas().first().waitFor({ timeout: 30000 });
    await otra.page.getByRole("button", { name: /p.gina siguiente/ }).click();
    const enLaPagina2Filtrada = await esperarRango("51–60 de 60");
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await otra.page.waitForTimeout(300);
    const alturaFiltrada = await alturaTabla();
    fallarCompleta = false;
    const llegaElFiltro = otra.page
      .waitForResponse((response) => new URL(response.url()).searchParams.get("estado") === "PENDIENTE", { timeout: 10000 })
      .then(
        () => true,
        () => false
      );
    await avisoInventadas.getByRole("button", { name: "Reintentar" }).click();
    const llegoElFiltro = (await llegaElFiltro) && (await esperarLibre());
    let sinAviso = false;
    for (let waited = 0; waited < 10000 && !sinAviso; waited += 200) {
      sinAviso = (await avisoInventadas.count()) === 0;
      if (!sinAviso) await otra.page.waitForTimeout(200);
    }
    await otra.page.waitForTimeout(300);
    const quedoTrasReintentar = `${await rango()} | ${await alturaTabla()}`;
    check(
      "Reintentar en el aviso de los indicadores, con filtros: el listado queda en la pagina y a la altura en que estaba",
      enLaPagina2Filtrada && alturaFiltrada > 0 && llegoElFiltro && sinAviso && quedoTrasReintentar === `51–60 de 60 | ${alturaFiltrada}`,
      `${alturaFiltrada} -> ${quedoTrasReintentar}`
    );
    await otra.context.close();
  }

  // ---------------------------------------------------------------- M. borrar desde el detalle, abierto desde un listado filtrado
  await page.goto(`${APP}/modulos`);
  await esperarClientes(ORDEN);
  await elegirEstado("Pendiente");
  await esperarClientes(["alfa", "eta", "delta"]);
  const conEstado = new URL(page.url()).search;
  await filaDe("delta").locator('[data-field="cliente"]').click();
  await page.waitForURL(`**/modulos/${fila.get("delta").id}`);
  await page.getByRole("button", { name: "Eliminar" }).click();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await page.waitForURL(`**/modulos${conEstado}`, { timeout: 15000 }).catch(() => undefined);
  const avisoBorrado = await page
    .getByText("Solicitud eliminada correctamente.")
    .waitFor({ timeout: 10000 })
    .then(() => true, () => false);
  const quedan = await esperarClientes(["alfa", "eta"]);
  check(
    "borrar desde el detalle: vuelve al listado con los mismos filtros, avisa y ya no esta",
    new URL(page.url()).search === conEstado && avisoBorrado && quedan,
    `${new URL(page.url()).search} | aviso ${avisoBorrado} | ${(await clientes()).join(", ")}`
  );

  if (ymd(new Date()) !== hoy) check("la corrida cruzo la medianoche de Argentina: volve a correrla", false);
  await context.close();
} catch (error) {
  check(`la prueba se corto: ${error.message.split("\n")[0]}`, false);
} finally {
  for (const id of new Set([...creados, ...psql(`select id from pedidos where cliente like '${PREFIJO}%'`).split("\n").filter(Boolean)])) {
    const removed = await api("DELETE", `/orders/${id}`).catch((error) => ({ status: error.message }));
    if (removed.status !== 204 && removed.status !== 404) check(`limpieza: borrar ${String(id).slice(0, 8)}`, false, String(removed.status));
  }
  const despues = contar();
  check("limpieza: la copia queda como estaba (pedidos, modulos, filas, historial y stock)", JSON.stringify(despues) === JSON.stringify(antes), JSON.stringify(despues));
  await browser.close();
}

const inesperados = errors.filter((error) => !esperados.some((pattern) => pattern.test(error)));
check("sin errores en la consola ni respuestas fallidas (salvo las provocadas)", inesperados.length === 0, inesperados.slice(0, 6).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exitCode = failures ? 1 : 0;
