// Prueba en el navegador de la edición de una solicitud de módulos (F5.2, spec §10): Edge sin ventana, contra el backend
// local (puerto 4100, copia del backup) y Vite (puerto 5180, con VITE_API_URL=http://127.0.0.1:4100/api).
// - Desde el listado filtrado: detalle → Editar → /modulos/:id/editar con el mismo formulario que corte (Datos, Cortes,
//   Cantos, Resumen) y los datos cargados (cliente, teléfono, email, dirección, fecha de entrega y referencia).
// - Datos: una fecha pasada y un email mal escrito no pasan; la fecha guardada sí.
// - Cortes: un encabezado por módulo (con medidas y colores) y "Piezas adicionales (sin módulo)"; Agregar pieza a este
//   módulo (con el esqueleto del módulo, al final del módulo), Agregar pieza adicional, Duplicar, Eliminar y cambiar
//   la cantidad. Cantos: la misma agrupación, sin botones de agregar; un lado cambiado.
// - Borrador: recargar a mitad ofrece recuperarlo y vuelve al mismo paso con lo cargado.
// - Resumen: "Cambios detectados" (2 modificadas, 3 agregadas, 1 eliminada, teléfono y fecha). Guardar vuelve al detalle
//   con el aviso, el historial dice lo mismo, las piezas llevan Editada y Agregada, y Volver va al listado filtrado.
//   El presupuesto guardado es el de corte con las mismas filas (paridad).
// - Sin cambios: "No hay cambios para guardar." y el botón deshabilitado; Cancelar vuelve al detalle.
// - Otra persona la cambió mientras tanto: el 409 se muestra en el comprobante.
// - Una entregada no se puede editar; /modulos/:id/editar de una de corte va a /pedidos/:id/editar y al revés; el
//   formulario de corte sigue sin grupos (Agregar pieza abajo).
// - Tamaño tablet sin desbordes y la consola sin errores inesperados.
// Crea solicitudes "Prueba F5.2 navegador ..." por la API y las borra al final. No imprime datos de clientes.
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
const PREFIJO = "Prueba F5.2 navegador";
const ZONA = "America/Argentina/Buenos_Aires";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f52-capturas");
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
const hoy = ymd(new Date());

const restos = psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`);
if (restos !== "0") {
  console.log(`MAL hay ${restos} solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralas antes (DELETE /api/orders/:id).`);
  process.exit(1);
}
const [adminIdDb, adminNombre, adminApellido, adminEmail] = psql(`select id, nombre, apellido, email from usuarios where rol = 'ADMIN' order by "fechaCreacion" limit 1`).split("|");
const admin = { id: adminIdDb, nombre: adminNombre, apellido: adminApellido, email: adminEmail, rol: "ADMIN" };
const adminToken = jwt.sign({ id: admin.id, email: admin.email, rol: admin.rol }, SECRET, { expiresIn: "2h" });
const api = async (method, path, body) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
const contar = () => ({
  pedidos: psql("select count(*) from pedidos"),
  detalles: psql("select count(*) from detalle_pedidos"),
  historial: psql("select count(*) from historial_pedidos"),
  modulos: psql("select count(*) from pedidos_modulo"),
  stock: psql(`select md5(string_agg(id || coalesce("stockPlacas"::text, 'null'), ',' order by id)) from materiales`)
});
const antes = contar();

const [colorA, colorB] = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 0.45) < 1e-6)
  order by p.nombre limit 2`).split("\n");
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);
const ALACENA = psql(`select id from modulos where codigo = 'ALACENA_2_PUERTAS'`);
const corteId = psql(`select id from pedidos where tipo = 'CORTE' order by "fechaCreacion" desc limit 1`);
const materiales = (await api("GET", "/materiales")).data;
const placaTexto = (id) => {
  const material = materiales.find((item) => item.id === id);
  return material ? `${material.nombre} ${material.espesorMm}mm` : "?";
};
check("datos de prueba", Boolean(colorA && colorB && BAJO && ALACENA && corteId && materiales.length));

const FECHA = addDays(hoy, 20);
const NUEVA_FECHA = addDays(hoy, 25);
const creados = [];
async function crear(sufijo, extra = {}) {
  const response = await api("POST", "/pedidos-modulos", {
    cliente: `${PREFIJO} ${sufijo}`,
    numeroContacto: "2664000000",
    emailContacto: "prueba-f52@example.com",
    direccionEntrega: "Calle de prueba 52",
    fechaEntrega: FECHA,
    observaciones: "Referencia F5.2",
    modulos: [
      { moduloId: BAJO, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 },
      { moduloId: ALACENA, valores: {}, colorEsqueletoId: colorB, colorFrentesId: colorB, perfilCantoOrden: 1 }
    ],
    ...extra
  });
  if (response.status !== 201) throw new Error(`no se pudo crear ${sufijo}: ${response.status}`);
  creados.push(response.data.id);
  return response.data;
}

const browser = await chromium.launch({ channel: "msedge", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
const errors = [];
const esperados = [/HTTP 409 PUT \/pedidos-modulos\//, /status of 409/, /HTTP 404 GET \/pedidos-modulos\//, /status of 404/];
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-AR", timezoneId: ZONA });
const page = await context.newPage();
page.on("console", (message) => message.type() === "error" && !message.location().url.includes("favicon") && errors.push(`console: ${message.text()}`));
page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
page.on("response", (response) => response.status() >= 400 && !response.url().includes("favicon") && errors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url().replace(API, "")}`));
await page.addInitScript(
  ({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("authMethod", "admin");
  },
  { token: adminToken, user: admin }
);
const shot = (name, fullPage = false) => page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage });
const titulo = () => page.getByRole("heading", { level: 4 }).first();
const siguiente = () => page.getByRole("button", { name: "Siguiente" });
const errorAlert = () => page.locator("main .MuiAlert-standardError, main .MuiAlert-colorError").first();
const filasPieza = () => page.locator("tbody tr").filter({ has: page.locator('input[type="number"]') });
const filaNumero = (numero) => page.locator("tbody tr").filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^${numero}$`) }) });
const accionesDe = (fila) => fila.locator("td").last().locator("button");
const llenar = async (fila, largo, ancho, cantidad, nombre) => {
  const numeros = fila.locator('input[type="number"]');
  await numeros.nth(0).fill(String(largo));
  await numeros.nth(1).fill(String(ancho));
  await numeros.nth(2).fill(String(cantidad));
  await fila.getByPlaceholder("Piso, techo, estante...").fill(nombre);
};
const placaDe = (fila) => fila.getByPlaceholder("Buscar material").inputValue();
const encabezados = () => page.locator("tbody td[colspan] .MuiTypography-subtitle2").allInnerTexts();
/** Lleva al Resumen. Desde P14, Siguiente muestra el Resumen sin abrir el comprobante; si lo abriera, devuelve "comprobante". */
async function irAlResumen() {
  await siguiente().click();
  await page.getByText("Cambios detectados", { exact: true }).waitFor({ timeout: 30000 });
  const dialogo = page.getByRole("dialog");
  const revisar = page.getByRole("button", { name: "Revisar y guardar" });
  for (let i = 0; i < 240; i++) {
    if (await dialogo.isVisible().catch(() => false)) return "comprobante";
    if (await revisar.isEnabled().catch(() => false)) {
      await page.waitForTimeout(500);
      if (await dialogo.isVisible().catch(() => false)) return "comprobante";
      return "resumen";
    }
    if (await revisar.isDisabled().catch(() => false)) return "resumen";
    await page.waitForTimeout(250);
  }
  return "nada";
}
const cambiosListados = async () => (await page.locator('ul[aria-label="Cambios detectados"] li').allInnerTexts()).map(norm);
const desborde = () => page.evaluate(() => ({ ok: document.documentElement.scrollWidth <= window.innerWidth, ancho: document.documentElement.scrollWidth }));

try {
  const principal = await crear("principal");
  const n = principal.numero;
  const [m1, m2] = principal.modulos;
  const k1 = principal.detalles.filter((d) => d.pedidoModuloId === m1.id).length;
  const k2 = principal.detalles.filter((d) => d.pedidoModuloId === m2.id).length;
  const entregada = await crear("entregada");
  psql(`update pedidos set estado = 'ENTREGADA' where id = '${entregada.id}'`);

  // ---------------------------------------------------------------- A. del listado filtrado al formulario
  await page.goto(`${APP}/modulos?q=${encodeURIComponent(`${PREFIJO} principal`)}`);
  const filaListado = page.locator(`.MuiDataGrid-row[data-id="${principal.id}"] [data-field="cliente"]`);
  await filaListado.waitFor({ timeout: 30000 });
  await filaListado.click();
  await page.waitForURL(`**/modulos/${principal.id}`);
  const editar = page.locator("main").getByRole("button", { name: "Editar", exact: true });
  await editar.waitFor({ timeout: 30000 });
  await editar.click();
  await page.waitForURL(`**/modulos/${principal.id}/editar`);
  await page.getByRole("heading", { name: `Editar solicitud M-${n}` }).waitFor({ timeout: 30000 });
  const pasos = (await page.locator(".MuiStepLabel-label").allInnerTexts()).map(norm);
  check("Editar lleva a /modulos/:id/editar con el título y los pasos de corte", JSON.stringify(pasos) === '["Datos","Cortes","Cantos","Resumen"]', pasos.join(","));
  const valor = (label) => page.getByLabel(label).inputValue();
  const datos = {
    cliente: await valor("Cliente"),
    telefono: await valor("Teléfono de contacto"),
    email: await valor("Email"),
    direccion: await valor("Dirección de entrega"),
    fecha: await valor("Fecha de entrega"),
    referencia: await valor("Referencia del trabajo")
  };
  check(
    "Datos: cargados de la solicitud",
    JSON.stringify(datos) === JSON.stringify({ cliente: `${PREFIJO} principal`, telefono: "2664000000", email: "prueba-f52@example.com", direccion: "Calle de prueba 52", fecha: FECHA, referencia: "Referencia F5.2" }),
    JSON.stringify(datos)
  );
  await shot("a1-datos");

  // ---------------------------------------------------------------- B. validación de Datos
  await page.getByLabel("Fecha de entrega").fill(addDays(hoy, -1));
  await siguiente().click();
  check("una fecha nueva pasada no pasa", norm(await errorAlert().innerText()).includes("La fecha de entrega no puede ser anterior a hoy."), norm(await errorAlert().innerText()));
  await page.getByLabel("Fecha de entrega").fill(NUEVA_FECHA);
  await page.getByLabel("Email").fill("prueba@");
  await siguiente().click();
  check("un email mal escrito no pasa", norm(await errorAlert().innerText()).includes("El email no es válido."));
  await page.getByLabel("Email").fill("prueba-f52@example.com");
  await page.getByLabel("Teléfono de contacto").fill("2664111111");
  await siguiente().click();

  // ---------------------------------------------------------------- C. Cortes agrupados
  await page.getByText("Piezas adicionales (sin módulo)").waitFor({ timeout: 15000 });
  const grupos = (await encabezados()).map(norm);
  check(
    "Cortes: un encabezado por módulo con sus medidas y las adicionales al final",
    grupos.length === 3 && /^Módulo 1 · Bajo mesada 2 puertas · [\d.]+ × \d+ × \d+ mm$/.test(grupos[0]) && /^Módulo 2 · .+ · [\d.]+ × \d+ × \d+ mm$/.test(grupos[1]) && grupos[2] === "Piezas adicionales (sin módulo)",
    grupos.join(" | ")
  );
  check(
    "Cortes: los botones de cada grupo y sin Agregar pieza abajo",
    (await page.getByRole("button", { name: "Agregar pieza a este módulo" }).count()) === 2 &&
      (await page.getByRole("button", { name: "Agregar pieza adicional" }).count()) === 1 &&
      (await page.getByRole("button", { name: "Agregar pieza", exact: true }).count()) === 0
  );
  check("Cortes: todas las piezas, numeradas", (await filasPieza().count()) === k1 + k2 && (await filaNumero(k1 + k2).count()) === 1);
  check("Cortes: el grupo de adicionales vacío lo dice", (await page.getByText("No hay piezas adicionales.").count()) === 1);
  await shot("c1-cortes", true);

  // Cantidad de la pieza 2 + 1; duplicar la 3; borrar la última original del módulo 1; una nueva en el módulo 2 y una adicional.
  const cantidad2 = filaNumero(2).locator('input[type="number"]').nth(2);
  await cantidad2.fill(String(Number(await cantidad2.inputValue()) + 1));
  await accionesDe(filaNumero(3)).first().click();
  check("Duplicar: la copia queda debajo, en el mismo módulo", (await filasPieza().count()) === k1 + k2 + 1);
  await accionesDe(filaNumero(k1 + 1)).last().click();
  check("Eliminar: una pieza menos", (await filasPieza().count()) === k1 + k2);
  await page.getByRole("button", { name: "Agregar pieza a este módulo" }).nth(1).click();
  const nuevaM2 = filaNumero(k1 + k2 + 1);
  check("Agregar pieza a este módulo: al final del módulo 2, con su esqueleto", (await placaDe(nuevaM2)) === placaTexto(colorB), await placaDe(nuevaM2));
  await llenar(nuevaM2, 400, 300, 1, "Estante extra");
  await page.getByRole("button", { name: "Agregar pieza adicional" }).click();
  const adicional = filaNumero(k1 + k2 + 2);
  check("Agregar pieza adicional: en su grupo, con el esqueleto del primer módulo", (await placaDe(adicional)) === placaTexto(colorA) && (await page.getByText("No hay piezas adicionales.").count()) === 0, await placaDe(adicional));
  await llenar(adicional, 600, 550, 1, "Tapa extra");
  await shot("c2-cortes-editados", true);
  await siguiente().click();

  // ---------------------------------------------------------------- D. Cantos agrupados
  await page.getByText("Cantos por pieza").waitFor({ timeout: 15000 });
  const gruposCantos = (await encabezados()).map(norm);
  check("Cantos: la misma agrupación, sin botones de agregar", JSON.stringify(gruposCantos) === JSON.stringify(grupos) && (await page.getByRole("button", { name: /^Agregar pieza/ }).count()) === 0, gruposCantos.join(" | "));
  const largo1 = page.locator("tbody tr").filter({ hasText: "#1. " }).first().getByRole("checkbox", { name: /^Largo 1 / });
  const estabaMarcado = await largo1.isChecked();
  await largo1.click();
  check("Cantos: un lado cambiado", (await largo1.isChecked()) !== estabaMarcado);
  await shot("d1-cantos", true);

  // ---------------------------------------------------------------- E. borrador
  await page.waitForTimeout(1500);
  await page.reload();
  const recuperar = page.getByRole("button", { name: "Recuperar" });
  await recuperar.waitFor({ timeout: 30000 });
  check("Borrador: al recargar se ofrece", norm(await page.getByText(/Tenés una solicitud sin terminar/).innerText()).includes(`(${k1 + k2 + 2} piezas`));
  await recuperar.click();
  await page.getByText("Cantos por pieza").waitFor({ timeout: 15000 });
  const largo1Recuperado = page.locator("tbody tr").filter({ hasText: "#1. " }).first().getByRole("checkbox", { name: /^Largo 1 / });
  check("Borrador: vuelve al paso Cantos con lo cargado", (await largo1Recuperado.isChecked()) !== estabaMarcado && (await page.locator("tbody tr").filter({ hasText: "#18. " }).count()) + (await page.getByText(`#${k1 + k2 + 2}. Tapa extra`).count()) >= 1);

  // ---------------------------------------------------------------- F. Resumen y guardado
  const llegada = await irAlResumen();
  const cambios = await cambiosListados();
  check(
    "Resumen: se ve, sin abrir el comprobante solo (P14), con Cambios detectados",
    llegada === "resumen" && JSON.stringify(cambios) === JSON.stringify(["2 piezas modificadas", "3 piezas agregadas", "1 pieza eliminada", "Cambió el teléfono y la fecha de entrega"]),
    `${llegada}: ${cambios.join(" | ")}`
  );
  if (llegada !== "comprobante") await page.getByRole("button", { name: "Revisar y guardar" }).click();
  await page.getByRole("button", { name: "Confirmar cambios" }).waitFor({ timeout: 90000 });
  await shot("f1-comprobante");
  await page.getByRole("button", { name: "Confirmar cambios" }).click();
  await page.waitForURL(`**/modulos/${principal.id}`, { timeout: 60000 });
  const aviso = await page.getByText(`Solicitud M-${n} actualizada.`).waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("Guardar: vuelve al detalle con el aviso", aviso);
  const guardada = (await api("GET", `/pedidos-modulos/${principal.id}`)).data;
  const origenes = guardada.detalles.reduce((acc, d) => ({ ...acc, [d.origen]: (acc[d.origen] ?? 0) + 1 }), {});
  check("Guardar: 2 EDITADO y 3 MANUAL, con teléfono y fecha nuevos", origenes.EDITADO === 2 && origenes.MANUAL === 3 && guardada.numeroContacto === "2664111111" && guardada.fechaEntrega === NUEVA_FECHA, JSON.stringify(origenes));
  const preview = (await api("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: guardada.detalles })).data;
  const campos = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado"];
  check("Paridad: el presupuesto guardado es el de corte con las mismas filas", campos.every((campo) => preview[campo] === guardada[campo]), campos.filter((campo) => preview[campo] !== guardada[campo]).join(","));
  await page.getByRole("tab", { name: "Despiece" }).waitFor({ timeout: 30000 });
  const chips = (await page.locator("main .MuiChip-label").allInnerTexts()).map(norm);
  check("Despiece: 2 Editada y 3 Agregada", chips.filter((c) => c === "Editada").length === 2 && chips.filter((c) => c === "Agregada").length === 3, chips.join(","));
  await page.getByRole("tab", { name: "Historial" }).click();
  const historial = norm(await page.getByText(/^Editó la solicitud/).first().innerText());
  check("Historial: lo mismo que el resumen", historial === "Editó la solicitud: 2 piezas modificadas, 3 piezas agregadas y 1 pieza eliminada; cambió el teléfono y la fecha de entrega", historial);
  await shot("f2-historial");
  await page.getByRole("button", { name: "Volver" }).click();
  await page.waitForURL((url) => url.pathname === "/modulos", { timeout: 15000 }).catch(() => undefined);
  check("Volver: al listado filtrado de donde vino", new URL(page.url()).searchParams.get("q") === `${PREFIJO} principal`, page.url().replace(APP, ""));

  // ---------------------------------------------------------------- G. sin cambios y Cancelar
  await page.goto(`${APP}/modulos/${principal.id}/editar`);
  await page.getByRole("heading", { name: `Editar solicitud M-${n}` }).waitFor({ timeout: 30000 });
  check("sin cambios: no ofrece un borrador", (await page.getByRole("button", { name: "Recuperar" }).count()) === 0);
  await siguiente().click();
  await page.getByText("Piezas adicionales (sin módulo)").waitFor();
  await siguiente().click();
  await page.getByText("Cantos por pieza").waitFor();
  const llegadaSinCambios = await irAlResumen();
  check(
    "sin cambios: No hay cambios para guardar y el botón deshabilitado, sin comprobante",
    llegadaSinCambios === "resumen" && (await page.getByText("No hay cambios para guardar.").count()) === 1 && (await page.getByRole("button", { name: "Revisar y guardar" }).isDisabled()),
    llegadaSinCambios
  );
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.waitForURL(`**/modulos/${principal.id}`, { timeout: 15000 });
  check("Cancelar vuelve al detalle", new URL(page.url()).pathname === `/modulos/${principal.id}`);

  // ---------------------------------------------------------------- H. otra persona la cambió mientras tanto
  await page.goto(`${APP}/modulos/${principal.id}/editar`);
  await page.getByRole("heading", { name: `Editar solicitud M-${n}` }).waitFor({ timeout: 30000 });
  await page.getByLabel("Referencia del trabajo").fill("Referencia F5.2 cambiada");
  await api("PATCH", `/pedidos-modulos/${principal.id}/fecha-entrega`, { fechaEntrega: addDays(hoy, 30) });
  await siguiente().click();
  await page.getByText("Piezas adicionales (sin módulo)").waitFor();
  await siguiente().click();
  await page.getByText("Cantos por pieza").waitFor();
  if ((await irAlResumen()) !== "comprobante") await page.getByRole("button", { name: "Revisar y guardar" }).click();
  await page.getByRole("button", { name: "Confirmar cambios" }).click();
  const conflicto = page.getByRole("dialog").getByText("La solicitud cambió mientras la editabas. Recargá la página y volvé a hacer los cambios.");
  check("409: el aviso se ve en el comprobante y no se guarda", await conflicto.waitFor({ timeout: 60000 }).then(() => true, () => false));
  check("409: la referencia no cambió", (await api("GET", `/pedidos-modulos/${principal.id}`)).data.observaciones === "Referencia F5.2");
  await shot("h1-conflicto");
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();

  // ---------------------------------------------------------------- I. no editable y redirecciones
  await page.goto(`${APP}/modulos/${entregada.id}/editar`);
  const bloqueo = page.getByText(`La solicitud M-${entregada.numero} está entregada: ya no se puede editar.`);
  check("entregada: no muestra el formulario", await bloqueo.waitFor({ timeout: 30000 }).then(() => true, () => false) && (await siguiente().count()) === 0);
  await page.getByRole("button", { name: "Volver a la solicitud" }).click();
  await page.waitForURL(`**/modulos/${entregada.id}`);
  check("entregada: Volver a la solicitud lleva al detalle", true);
  await page.goto(`${APP}/modulos/${corteId}/editar`);
  await page.waitForURL(`**/pedidos/${corteId}/editar`, { timeout: 30000 }).catch(() => undefined);
  check("una de corte en /modulos/:id/editar va a /pedidos/:id/editar", new URL(page.url()).pathname === `/pedidos/${corteId}/editar`);
  await page.goto(`${APP}/pedidos/${principal.id}/editar`);
  await page.waitForURL(`**/modulos/${principal.id}/editar`, { timeout: 30000 }).catch(() => undefined);
  check("una de módulos en /pedidos/:id/editar va a /modulos/:id/editar", new URL(page.url()).pathname === `/modulos/${principal.id}/editar`);

  // ---------------------------------------------------------------- J. corte sigue igual
  await page.goto(`${APP}/pedidos/nuevo`);
  await page.getByRole("heading", { name: "Nueva solicitud de corte" }).waitFor({ timeout: 30000 });
  await page.getByLabel("Cliente").fill("Prueba F5.2 corte");
  await page.getByLabel("Teléfono de contacto").fill("2664000000");
  await siguiente().click();
  await page.getByRole("button", { name: "Agregar pieza", exact: true }).waitFor({ timeout: 15000 });
  check(
    "corte: sin grupos ni campos de módulos, Agregar pieza abajo",
    (await page.locator("tbody td[colspan]").count()) === 0 && (await filasPieza().count()) === 1 && (await page.getByText("Piezas adicionales").count()) === 0
  );
  await page.getByRole("button", { name: "Agregar pieza", exact: true }).click();
  check("corte: Agregar pieza suma una fila", (await filasPieza().count()) === 2);

  // ---------------------------------------------------------------- K. tablet
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(`${APP}/modulos/${principal.id}/editar`);
  await page.getByRole("heading", { name: `Editar solicitud M-${n}` }).waitFor({ timeout: 30000 });
  const datosTablet = await desborde();
  await siguiente().click();
  await page.getByText("Piezas adicionales (sin módulo)").waitFor();
  const cortesTablet = await desborde();
  await shot("k1-tablet-cortes", true);
  check("tablet: la página no se desborda (la tabla scrollea adentro)", datosTablet.ok && cortesTablet.ok, `${datosTablet.ancho} ${cortesTablet.ancho}`);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${APP}/modulos/${principal.id}`);
  const tituloDetalle = page.getByRole("heading", { level: 1 });
  await tituloDetalle.waitFor({ timeout: 30000 });
  const alto = await tituloDetalle.evaluate((element) => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight));
  check("detalle: el título Solicitud M-<número> en una línea con Editar al lado", alto < 1.5, alto.toFixed(2));
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.waitForTimeout(300);
  const detalle1024 = await desborde();
  const eliminar = await page.getByRole("button", { name: "Eliminar" }).boundingBox();
  check("detalle 1024: las acciones entran", detalle1024.ok && eliminar && eliminar.x + eliminar.width <= 1024, `${detalle1024.ancho}`);
  await shot("k2-detalle-1024");

  if (ymd(new Date()) !== hoy) check("la corrida cruzó la medianoche de Argentina: volvé a correrla", false);
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n")[0]}`, false);
  await shot("zz-error", true).catch(() => undefined);
} finally {
  for (const id of new Set([...creados, ...psql(`select id from pedidos where cliente like '${PREFIJO}%'`).split("\n").filter(Boolean)])) {
    psql(`update pedidos set estado = 'PENDIENTE' where id = '${id}'`);
    const removed = await api("DELETE", `/orders/${id}`);
    if (removed.status !== 204 && removed.status !== 200) check(`limpieza: borrar ${String(id).slice(0, 8)}`, false, String(removed.status));
  }
  const despues = contar();
  check("limpieza: la copia queda como estaba", JSON.stringify(despues) === JSON.stringify(antes), JSON.stringify(despues));
  await browser.close();
}

const inesperados = errors.filter((error) => !esperados.some((pattern) => pattern.test(error)));
check("sin errores en la consola ni respuestas fallidas (salvo las provocadas)", inesperados.length === 0, inesperados.slice(0, 6).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
