// Prueba del Excel de corte editable (pedido de Gonzalo del 2026-10-09, punto 5): la pestaña "Excel de corte" del detalle
// de una solicitud de módulos, por la API y en el navegador. Edge sin ventana, contra el backend local (puerto 4100,
// copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// - API: las filas son las del Excel; guardar solo lo que cambió y las columnas agregadas; el historial; el archivo
//   sale con las celdas cambiadas y las columnas al final; títulos repetidos o de una columna de la máquina dan 400;
//   editar la solicitud conserva los ajustes de las filas que siguen; restaurar todo.
// - Navegador: cambiar una celda (doble clic), el aviso si cambia lo que se corta, agregar una columna, guardar,
//   descargar, y el historial.
// Crea solicitudes "Prueba Excel ..." y las borra al final. No toca otros datos.
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
const PREFIJO = "Prueba Excel";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-excel-corte-capturas");
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
  console.log(`MAL hay solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralas antes.`);
  process.exit(1);
}
const [adminId, nombre, apellido, email] = psql(`select id, nombre, apellido, email from usuarios where rol = 'ADMIN' order by "fechaCreacion" limit 1`).split("|");
const admin = { id: adminId, nombre, apellido, email, rol: "ADMIN" };
const token = jwt.sign({ id: admin.id, email: admin.email, rol: admin.rol }, SECRET, { expiresIn: "2h" });
const api = async (method, path, body, raw = false) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()) };
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
const antes = psql(`select count(*) from pedidos`);
const [colorA, colorB] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
  and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 2`).split("\n");
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);
const fecha = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const linea = { moduloId: BAJO, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 };
const leerExcel = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const filas = [];
  sheet.eachRow((row) => filas.push(row.values.slice(1).map((value) => (value === undefined || value === null ? "" : value))));
  return filas;
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const creadas = [];
try {
  // ---------------------------------------------------------------- API
  const alta = await api("POST", "/pedidos-modulos", { cliente: `${PREFIJO} api`, numeroContacto: "2664000000", fechaEntrega: fecha, modulos: [linea] });
  creadas.push(alta.data.id);
  const o = alta.data;
  let r = await api("GET", `/pedidos-modulos/${o.id}/excel-corte`);
  check(
    "las filas y columnas del Excel, sin ajustes",
    r.status === 200 && r.data.filas.length === o.detalles.length && r.data.columnas.length === 19 && r.data.ajustes.total === 0 && r.data.filas[0].posicionModulo === 1,
    `${r.data?.filas?.length} filas, ${r.data?.columnas?.length} columnas`
  );
  const [f1, f2] = r.data.filas;
  r = await api("PUT", `/pedidos-modulos/${o.id}/excel-corte`, {
    columnas: [{ id: "col-caja", titulo: "Caja" }],
    celdas: { [f1.clave]: { largo: String(f1.base.largo - 3), Remark: String(f1.base.Remark), "col-caja": "7" }, [f2.clave]: { "nombre producto": "Lateral izquierdo" }, "M999-99-99": { largo: "1" } }
  });
  check(
    "guardar: solo lo que cambió (el remark igual no cuenta) y la columna agregada",
    r.status === 200 && r.data.ajustes.total === 2 && r.data.ajustes.critical === 1 && r.data.filas[0].valores.largo === f1.base.largo - 3 && r.data.filas[0].valores["col-caja"] === "7" && r.data.filas[2].valores["col-caja"] === "",
    JSON.stringify(r.data?.ajustes)
  );
  const historial = (await api("GET", `/pedidos-modulos/${o.id}`)).data.historial;
  check("el historial lo cuenta", historial[0].accion === "AJUSTAR_EXCEL" && historial[0].valorNuevo === "2 celdas modificadas en total; columna agregada: Caja", historial[0].valorNuevo);
  let archivo = await leerExcel((await api("GET", `/orders/export?ids=${o.id}`, null, true)).buffer);
  check(
    "el archivo sale con las celdas cambiadas y la columna al final",
    archivo[0][19] === "Caja" && archivo[1][2] === f1.base.largo - 3 && archivo[1][19] === "7" && archivo[2][18] === "Lateral izquierdo",
    JSON.stringify([archivo[0][19], archivo[1][2], archivo[1][19], archivo[2][18]])
  );
  r = await api("PUT", `/pedidos-modulos/${o.id}/excel-corte`, { columnas: [{ id: "col-x", titulo: "largo" }], celdas: {} });
  check("una columna con el título de una de la máquina: 400", r.status === 400 && JSON.stringify(r.data).includes("ya es una columna del Excel"));
  r = await api("PUT", `/pedidos-modulos/${o.id}/excel-corte`, { columnas: [{ id: "col-a", titulo: "Caja" }, { id: "col-b", titulo: "caja" }], celdas: {} });
  check("dos columnas con el mismo título: 400", r.status === 400 && JSON.stringify(r.data).includes("Hay dos columnas"));
  // Editar la solicitud (otra cantidad en la tercera pieza): los ajustes de las filas que siguen quedan.
  const actual = (await api("GET", `/pedidos-modulos/${o.id}`)).data;
  const editada = await api("PUT", `/pedidos-modulos/${o.id}`, {
    cliente: actual.cliente,
    numeroContacto: actual.numeroContacto,
    fechaEntrega: actual.fechaEntrega,
    fechaActualizacion: actual.fechaActualizacion,
    detalles: actual.detalles.map((d, i) => (i === 2 ? { ...d, cantidad: d.cantidad + 1 } : d))
  });
  r = await api("GET", `/pedidos-modulos/${o.id}/excel-corte`);
  check("editar la solicitud conserva los ajustes de las filas que siguen", editada.status === 200 && r.data.ajustes.total === 2 && r.data.filas[0].valores["col-caja"] === "7", `${editada.status} ${JSON.stringify(r.data.ajustes)}`);
  r = await api("PUT", `/pedidos-modulos/${o.id}/excel-corte`, { columnas: [], celdas: {} });
  check(
    "restaurar todo: sin ajustes, y el archivo vuelve a ser el de siempre",
    r.status === 200 && r.data.ajustes.total === 0 && psql(`select "excelCorte" is null from pedidos where id = '${o.id}'`) === "t",
    psql(`select coalesce("excelCorte"::text, 'null') from pedidos where id = '${o.id}'`)
  );
  archivo = await leerExcel((await api("GET", `/orders/export?ids=${o.id}`, null, true)).buffer);
  check("sin columnas agregadas, el archivo tiene las 19 de siempre", archivo[0].length <= 19, String(archivo[0].length));

  // ---------------------------------------------------------------- navegador
  const b = (await api("POST", "/pedidos-modulos", { cliente: `${PREFIJO} navegador`, numeroContacto: "2664000000", fechaEntrega: fecha, modulos: [linea] })).data;
  creadas.push(b.id);
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR", acceptDownloads: true });
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
  await page.goto(`${APP}/modulos/${b.id}`);
  await page.getByRole("tab", { name: "Excel de corte" }).click({ timeout: 30000 });
  const grilla = page.getByRole("region", { name: "Excel de corte" }).getByRole("grid");
  await grilla.waitFor({ timeout: 30000 });
  const celda = (fila, campo) => grilla.locator(`.MuiDataGrid-row[data-rowindex="${fila}"] [data-field="${campo}"]`);
  const escribir = async (fila, campo, valor) => {
    await celda(fila, campo).dblclick();
    const input = celda(fila, campo).locator("input");
    await input.fill(valor);
    await input.press("Enter");
    await page.waitForTimeout(200);
  };
  await escribir(0, "Remark", "Con veta");
  check("cambiar una celda: cuenta 1 celda cambiada y se puede guardar", (await page.getByText("1 celda cambiada").count()) === 1 && (await page.getByRole("button", { name: "Guardar cambios" }).isEnabled()));
  check("con cambios sin guardar no se descarga", await page.getByRole("button", { name: "Descargar Excel" }).isDisabled());
  check("el remark no cambia lo que se corta: sin aviso", (await page.getByText(/el Excel ya no coincide con el presupuesto/).count()) === 0);
  await escribir(0, "largo", "1000");
  check("cambiar el largo: avisa que ya no coincide con el presupuesto", (await page.getByText(/el Excel ya no coincide con el presupuesto/).count()) === 1);
  await page.getByRole("button", { name: "Agregar columna" }).click();
  await page.getByLabel("Título de la columna").fill("Pallet");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  const campoPallet = await grilla.locator('[role="columnheader"]', { hasText: "Pallet" }).getAttribute("data-field");
  check("la columna agregada aparece en la grilla", Boolean(campoPallet && campoPallet.startsWith("col-")), String(campoPallet));
  await escribir(1, campoPallet ?? "", "P-01");
  await page.screenshot({ path: join(shotsDir, "a1-excel-editado.png"), fullPage: true });
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByText("Excel de corte guardado.").waitFor({ timeout: 30000 });
  const guardado = (await api("GET", `/pedidos-modulos/${b.id}/excel-corte`)).data;
  const pallet = guardado.columnasExtra[0];
  check(
    "guardar desde la pantalla: las dos celdas y la columna con su valor",
    guardado.ajustes.total === 2 && guardado.ajustes.critical === 1 && pallet?.titulo === "Pallet" && guardado.filas[1].valores[pallet.id] === "P-01" && guardado.filas[0].valores.Remark === "Con veta",
    JSON.stringify(guardado.ajustes)
  );
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: "Descargar Excel" }).click()]);
  const ruta = join(shotsDir, download.suggestedFilename());
  await download.saveAs(ruta);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(ruta);
  const hoja = workbook.worksheets[0];
  check(
    "descargar: pedido-M<n>.xlsx con el largo cambiado y la columna Pallet",
    download.suggestedFilename() === `pedido-M${b.numero}.xlsx` && hoja.getRow(1).getCell(20).value === "Pallet" && hoja.getRow(2).getCell(3).value === 1000 && hoja.getRow(3).getCell(20).value === "P-01",
    `${download.suggestedFilename()} ${hoja.getRow(1).getCell(20).value} ${hoja.getRow(2).getCell(3).value}`
  );
  await page.getByRole("tab", { name: "Historial" }).click();
  const primera = norm(await page.locator("#panel-historial li").first().innerText());
  check("el historial muestra el ajuste", primera.startsWith("Ajustó el Excel de corte: 2 celdas modificadas en total; columna agregada: Pallet"), primera);
  await context.close();
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n").slice(0, 3).join(" / ")}`, false);
} finally {
  for (const id of creadas) await api("DELETE", `/orders/${id}`);
  check("limpieza: la copia de la base queda como estaba", psql(`select count(*) from pedidos`) === antes);
  await browser.close();
}
check("sin errores en la consola", errors.length === 0, errors.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
