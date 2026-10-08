// Prueba en el navegador de la hoja de taller (F5.4, spec §11.2): Edge sin ventana, contra el backend local (puerto 4100,
// copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// - Del listado filtrado al detalle y a "Hoja de taller" (/modulos/:id/taller); Volver regresa al detalle, que sigue
//   volviendo al listado filtrado.
// - Una hoja por módulo y una de piezas adicionales: encabezado (M-N · Módulo X de Y, cliente y entrega), bloque del
//   módulo (imagen si el catálogo la tiene, medidas con su nombre, colores, fondo, perfil y observaciones), despiece en
//   el mismo orden que el Excel de la máquina, marcas EDITADA y AGREGADA, cantos por lado y espesor, pie con
//   observaciones y firmas.
// - Al imprimir (PDF A4): una página por hoja aunque un módulo tenga 26 piezas, sin la barra de la pantalla y con la
//   tabla en 10 pt o más.
// - Una de corte en /modulos/:id/taller va a su detalle; un carpintero no entra; la consola sin errores.
// Crea solicitudes "Prueba F5.4 ..." por la API y las borra al final. No imprime datos de clientes.
//
// No es dependencia del proyecto: necesita Microsoft Edge y playwright-core en una carpeta aparte
// (`npm i playwright-core` en una carpeta temporal y PLAYWRIGHT_DIR=<esa carpeta>). Las capturas van a SHOTS_DIR.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), "noop.js"))("playwright-core");
const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");

const APP = process.env.APP ?? "http://127.0.0.1:5180";
const API = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F5.4";
const ZONA = "America/Argentina/Buenos_Aires";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f54-capturas");
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

if (psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralas antes (DELETE /api/orders/:id).`);
  process.exit(1);
}
const userRow = (rol) => {
  const [id, nombre, apellido, email] = psql(`select id, nombre, apellido, email from usuarios where rol = '${rol}' order by "fechaCreacion" limit 1`).split("|");
  return { id, nombre, apellido, email, rol };
};
const admin = userRow("ADMIN");
const carpintero = userRow("CARPINTERO");
const tokenFor = (user) => jwt.sign({ id: user.id, email: user.email, rol: user.rol }, SECRET, { expiresIn: "2h" });
const api = async (method, path, body) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${tokenFor(admin)}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
const contar = () => psql(`select (select count(*) from pedidos) || '/' || (select count(*) from detalle_pedidos) || '/' || (select count(*) from historial_pedidos) || '/' || (select count(*) from pedidos_modulo)`);
const antes = contar();

const [colorA, colorB] = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 2) < 1e-6)
  order by p.nombre limit 2`).split("\n");
const cantoNegro = psql(`select id from materiales where tipo = 'CANTO' and activo and "placaMaterialId" = '${colorB}' and abs("espesorMm" - 2) < 1e-6 order by nombre, id limit 1`);
const nombreB = psql(`select trim(nombre) from materiales where id = '${colorB}'`);
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);
const PLACARD = psql(`select id from modulos where codigo = 'PLACARD_3_PUERTAS_DE_EMBUTIR'`);
const corteId = psql(`select id from pedidos where tipo = 'CORTE' order by "fechaCreacion" desc limit 1`);
const catalogo = (await api("GET", "/modulos?incluirInactivos=true")).data;
const conImagen = new Map(catalogo.map((module) => [module.id, Boolean(module.tieneImagen)]));
check("datos de prueba", Boolean(colorA && colorB && cantoNegro && BAJO && PLACARD && corteId));

const FECHA = addDays(ymd(new Date()), 15);
const creados = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
async function newPage(user) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR", timezoneId: ZONA, acceptDownloads: true });
  const page = await context.newPage();
  page.on("console", (message) => message.type() === "error" && !message.location().url.includes("favicon") && errors.push(`console: ${message.text()} @ ${message.location().url}`));
  page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
  page.on("response", (response) => response.status() >= 400 && !response.url().includes("favicon") && errors.push(`HTTP ${response.status()} ${response.url().replace(API, "")}`));
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("authMethod", user.rol === "ADMIN" ? "admin" : "google");
    },
    { token: tokenFor(user), user }
  );
  return { context, page };
}

try {
  // ---------------------------------------------------------------- A. solicitud de prueba
  const alta = await api("POST", "/pedidos-modulos", {
    cliente: `${PREFIJO} hoja`,
    numeroContacto: "2664000000",
    fechaEntrega: FECHA,
    modulos: [
      { moduloId: BAJO, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1, observaciones: "Va contra la pared" },
      { moduloId: PLACARD, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorA, perfilCantoOrden: 1 }
    ]
  });
  if (alta.status !== 201) throw new Error(`no se pudo crear la solicitud (${alta.status})`);
  creados.push(alta.data.id);
  const o = alta.data;
  const [m1, m2] = o.modulos;
  // Edición: la primera pieza del módulo 1 con un canto negro en Largo 1 (EDITADA), 16 piezas nuevas en el módulo 1
  // (26 en total: tabla apretada) y una adicional, cargadas arriba de todo (en la hoja van al final de su grupo).
  const extra = Array.from({ length: 16 }, (_, i) => ({ materialId: colorA, largo: 300 + i, ancho: 200, cantidad: 1, permiteRotar: false, nombreProducto: `Extra ${i + 1}`, pedidoModuloId: m1.id }));
  const adicional = { materialId: colorA, largo: 600, ancho: 550, cantidad: 1, permiteRotar: false, nombreProducto: "Tapa extra", pedidoModuloId: null };
  const primera = o.detalles.find((d) => d.pedidoModuloId === m1.id);
  const editada = await api("PUT", `/pedidos-modulos/${o.id}`, {
    cliente: o.cliente,
    numeroContacto: o.numeroContacto,
    fechaEntrega: o.fechaEntrega,
    fechaActualizacion: o.fechaActualizacion,
    detalles: [adicional, ...extra, ...o.detalles.map((d) => (d.id === primera.id ? { ...d, cantoLargo1Id: cantoNegro, cantoLargo1: true } : d))]
  });
  check("edición previa: 200", editada.status === 200, String(editada.status));
  const pedido = editada.data;
  const n = pedido.numero;
  const filasM1 = pedido.detalles.filter((d) => d.pedidoModuloId === m1.id).length;

  // El Excel de la máquina, para comparar el orden.
  const excel = await fetch(`${API}/orders/export?ids=${o.id}`, { headers: { Authorization: `Bearer ${tokenFor(admin)}` } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()));
  const filasExcel = [];
  workbook.getWorksheet("Pedidos").eachRow((row, numero) => numero > 1 && filasExcel.push([row.getCell(19).value, row.getCell(3).value, row.getCell(4).value, row.getCell(5).value].join("|")));

  // ---------------------------------------------------------------- B. del listado al detalle y a la hoja
  const { context, page } = await newPage(admin);
  await page.goto(`${APP}/modulos?q=${encodeURIComponent(`${PREFIJO} hoja`)}`);
  const fila = page.locator(`.MuiDataGrid-row[data-id="${o.id}"] [data-field="cliente"]`);
  await fila.waitFor({ timeout: 30000 });
  await fila.click();
  await page.waitForURL(`**/modulos/${o.id}`);
  const boton = page.getByRole("button", { name: "Hoja de taller" });
  await boton.waitFor({ timeout: 30000 });
  await boton.click();
  await page.waitForURL(`**/modulos/${o.id}/taller`);
  const hojas = page.locator("section.taller-hoja");
  await hojas.first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  check("título y barra: Hojas de taller · M-N, Volver e Imprimir, sin el menú", norm(await page.getByRole("heading", { level: 1 }).innerText()) === `Hojas de taller · M-${n}` && (await page.getByRole("button", { name: "Imprimir" }).isEnabled()) && (await page.getByText("Módulos a medida").count()) === 0);
  check("tres hojas: dos módulos y las adicionales", (await hojas.count()) === 3, String(await hojas.count()));
  const titulos = (await hojas.locator("h2").allInnerTexts()).map(norm);
  check("encabezados", JSON.stringify(titulos) === JSON.stringify([`M-${n} · Módulo 1 de 2`, `M-${n} · Módulo 2 de 2`, `M-${n} · Piezas adicionales`]), titulos.join(" | "));
  const hoja1 = norm(await hojas.nth(0).innerText());
  check("encabezado: cliente y entrega", hoja1.includes(`Cliente: ${PREFIJO} hoja`) && hoja1.includes(`Entrega: ${dmy(FECHA)}`));
  check(
    "bloque del módulo: nombre, medidas con su nombre, colores, fondo, perfil y observaciones",
    hoja1.includes("Bajo mesada 2 puertas") &&
      hoja1.includes("Medidas: Ancho 1.200 · Alto 780 · Profundidad 580 mm") &&
      hoja1.includes(`Esqueleto: ${m1.colorEsqueleto.nombre.trim()}`) &&
      hoja1.includes(`Frentes: ${nombreB}`) &&
      (!m1.materialFondo || hoja1.includes(`Fondo: ${m1.materialFondo.nombre.trim()}`)) &&
      /Cantos: perfil \S+/.test(hoja1) &&
      hoja1.includes("Observaciones: Va contra la pared")
  );
  const imagenes = await Promise.all([0, 1].map((i) => hojas.nth(i).locator("img").count()));
  check("imagen del catálogo si la tiene (además del logo)", imagenes[0] === 1 + Number(conImagen.get(BAJO)) && imagenes[1] === 1 + Number(conImagen.get(PLACARD)), imagenes.join(","));
  const filasHoja = [];
  for (let i = 0; i < 3; i++) {
    for (const row of await hojas.nth(i).locator("tbody tr").all()) {
      const celdas = (await row.locator("td").allInnerTexts()).map(norm);
      filasHoja.push(celdas);
    }
  }
  const claveHoja = filasHoja.map((c) => [c[1].replace(/ (EDITADA|AGREGADA)$/, ""), c[3], c[4], c[5]].join("|"));
  check("el mismo orden que el Excel de la máquina", JSON.stringify(claveHoja) === JSON.stringify(filasExcel), `${claveHoja.length} filas, ${filasExcel.length} en el Excel`);
  check("módulo 1: sus piezas y las nuevas al final", (await hojas.nth(0).locator("tbody tr").count()) === filasM1 && norm(await hojas.nth(0).locator("tbody tr").last().locator("td").nth(1).innerText()) === "Extra 16 AGREGADA");
  check("marcas: 1 EDITADA y 17 AGREGADA", filasHoja.filter((c) => c[1].endsWith("EDITADA")).length === 1 && filasHoja.filter((c) => c[1].endsWith("AGREGADA")).length === 17);
  const cantosPrimera = filasHoja[0][6];
  check("cantos: el canto de otro color lleva su color", cantosPrimera.includes(`L1 (2 mm, ${nombreB})`), cantosPrimera);
  check("cantos: las puertas con los cuatro lados", filasHoja.some((c) => c[1].startsWith("Puertas") && /^L1 L2 A1 A2 \(2 mm\)$/.test(c[6])), filasHoja.find((c) => c[1].startsWith("Puertas"))?.[6]);
  const ultima = filasHoja[filasHoja.length - 1];
  check("adicionales: Tapa extra, AGREGADA y Sin canto", JSON.stringify([ultima[1], ...ultima.slice(3)]) === JSON.stringify(["Tapa extra AGREGADA", "600", "550", "1", "Sin canto"]), ultima.join(" | "));
  check("pie: observaciones del taller y firmas en cada hoja", (await hojas.filter({ hasText: "Observaciones del taller" }).count()) === 3 && (await hojas.filter({ hasText: /Armó.*Controló.*Fecha/s }).count()) === 3);
  await page.screenshot({ path: join(shotsDir, "b1-pantalla.png"), fullPage: true });

  // ---------------------------------------------------------------- C. impresión
  await page.emulateMedia({ media: "print" });
  check("al imprimir no se ve la barra", !(await page.getByRole("button", { name: "Imprimir" }).isVisible()));
  const tamanos = await hojas.locator("tbody td").evaluateAll((cells) => cells.map((cell) => parseFloat(getComputedStyle(cell).fontSize)));
  check("tabla en 10 pt o más (13,33 px), también la apretada", Math.min(...tamanos) >= 13.3, `${Math.min(...tamanos)} px`);
  // El PDF con los estilos de impresión: la emulación sigue en "print" (con "screen", page.pdf usaría los de pantalla).
  const pdf = join(shotsDir, "hojas.pdf");
  await page.pdf({ path: pdf, format: "A4", preferCSSPageSize: true, printBackground: true });
  const paginas = (readFileSync(pdf, "latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  await page.emulateMedia({ media: "screen" });
  check("PDF A4: una página por hoja, aunque el módulo 1 tenga 26 piezas", paginas === 3 && filasM1 === 26, `${paginas} páginas, ${filasM1} piezas`);

  // ---------------------------------------------------------------- D. Volver
  await page.getByRole("button", { name: "Volver" }).click();
  await page.waitForURL(`**/modulos/${o.id}`);
  await page.getByRole("button", { name: "Hoja de taller" }).waitFor({ timeout: 30000 });
  await page.locator("main").getByRole("button", { name: "Volver", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/modulos", { timeout: 15000 }).catch(() => undefined);
  check("Volver: al detalle, y de ahí al listado filtrado", new URL(page.url()).searchParams.get("q") === `${PREFIJO} hoja`, page.url().replace(APP, ""));

  // ---------------------------------------------------------------- E. corte y permisos
  await page.goto(`${APP}/modulos/${corteId}/taller`);
  await page.waitForURL(`**/pedidos/${corteId}`, { timeout: 30000 }).catch(() => undefined);
  check("una de corte va a su detalle", new URL(page.url()).pathname === `/pedidos/${corteId}`);
  await context.close();
  const otra = await newPage(carpintero);
  await otra.page.goto(`${APP}/modulos/${o.id}/taller`);
  await otra.page.waitForTimeout(2500);
  check("un carpintero no entra", !new URL(otra.page.url()).pathname.endsWith("/taller") && (await otra.page.locator("section.taller-hoja").count()) === 0, otra.page.url().replace(APP, ""));
  await otra.context.close();
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n")[0]}`, false);
} finally {
  for (const id of creados) {
    const removed = await api("DELETE", `/orders/${id}`);
    if (removed.status !== 204 && removed.status !== 200) check("limpieza: borrar la solicitud de prueba", false, String(removed.status));
  }
  check("limpieza: la copia queda como estaba", contar() === antes, contar());
  await browser.close();
}
// La solicitud de corte abierta en /modulos/:id/taller pasa por un 404 de la API a propósito.
const inesperados = errors.filter((error) => !/HTTP 404 .*\/pedidos-modulos\//.test(error) && !/status of 404/.test(error));
check("sin errores en la consola ni respuestas fallidas (salvo el 404 de la de corte)", inesperados.length === 0, inesperados.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
