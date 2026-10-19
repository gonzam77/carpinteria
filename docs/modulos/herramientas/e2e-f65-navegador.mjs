// Prueba de F6.5: los herrajes de punta a punta y la no regresión con los herrajes apagados (DECISIONES 57 y 71), por
// la API y en el navegador. Edge sin ventana, contra el backend local (puerto 4100, copia del backup) y Vite (puerto
// 5180, con VITE_API_URL=http://127.0.0.1:4100/api). Datos de ejemplo: una copia activa de BAJO_MESADA_2_PUERTAS y
// la Alacena 2 puertas del catálogo, que no tiene herrajes.
// - Catálogo: en el editor se agregan a la copia una bisagra (con su fórmula por defecto) y una corredera por medida.
// - Prendidos: el asistente con los dos módulos (herrajes solo en el que los tiene), el resumen, el alta, el detalle,
//   la hoja de taller, el listado, el dashboard y la paridad del presupuesto de placas con corte.
// - Apagados (con el interruptor de la pantalla): el asistente avisa y no los cobra; la misma solicitud da las mismas
//   placas, el mismo presupuesto de placas, el mismo Excel de la máquina y el mismo listado de materiales; el editor
//   del módulo avisa y los conserva; la solicitud que ya los tenía los muestra, los cobra y editarla los conserva.
// - Prendidos otra vez: ajustar los herrajes en la edición (comprobante y detalle), recalcular un módulo (el otro no
//   cambia) y los estados hasta Entregada, con la reserva de stock igual a la de placas.
// Crea tipos, herrajes, la copia del módulo y solicitudes "Prueba F6.5 ..."; borra todo al final, deja el stock y el
// interruptor como estaban. No toca otros datos.
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
const PREFIJO = "Prueba F6.5";
const ALACENA = "Alacena 2 puertas";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f65-capturas");
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
const money = (value) => norm(Number(value).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }));
const centavos = (value) => Math.round(Number(value) * 100);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

if (psql(`select count(*) from herrajes where nombre like '${PREFIJO}%'`) !== "0" || psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay herrajes o solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralos antes.`);
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
const contar = () =>
  psql(`select (select count(*) from herrajes) || '/' || (select count(*) from tipos_herraje) || '/' || (select count(*) from modulos) || '/' || (select count(*) from pedidos) || '/' || (select count(*) from pedidos_herraje) || '/' || (select md5(string_agg(id || coalesce("stockPlacas"::text, 'null'), ',' order by id)) from materiales)`);
const antes = contar();
const configAntes = psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`);
const enabled = () => psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`) === "t";
const setEnabled = (value) => psql(`update configuracion_modulos set "herrajesHabilitados" = ${value} where id = 'default'`);
const [colorA] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
  and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 1`).split("\n");
const nombreA = psql(`select trim(nombre) from materiales where id = '${colorA}'`);
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);
const ESTIMADO = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado"];
const mismoEstimado = (a, b) => ESTIMADO.every((campo) => a[campo] === b[campo]);
const sinCampos = (definition) => {
  const { id, categoria, version, fechaActualizacion, imagen, tienePedidos, estadoFormulas, errores, ...rest } = definition;
  return rest;
};
const resumen = (order) => order.herrajes.map((h) => [h.nombre.replace(`${PREFIJO} `, ""), h.cantidad, h.valorUnitario, h.origen, order.modulos.find((m) => m.id === h.pedidoModuloId)?.posicion]);
// Las filas de la máquina sin el código de barra ni el cliente (que cambian de una solicitud a otra).
const filasMaquina = async (id) => {
  const response = await fetch(`${API}/orders/export?ids=${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const filas = [];
  workbook.getWorksheet("Pedidos").eachRow((row) => filas.push(Array.from({ length: 19 }, (_, index) => String(row.getCell(index + 1).value ?? ""))));
  return filas.map((fila) => fila.filter((_, index) => ![0, 16, 17].includes(index)).join("|"));
};
const listadoMateriales = async (id) => {
  const response = await fetch(`${API}/pedidos-modulos/${id}/materiales.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const filas = [];
  workbook.worksheets.forEach((sheet) => sheet.eachRow((row) => filas.push(norm(row.values.slice(1).map((v) => (v && typeof v === "object" ? JSON.stringify(v) : v ?? "")).join("|")))));
  return filas.map((fila) => fila.replace(/M\d+/g, "M#"));
};
const presupuestoActivo = async () => centavos((await api("GET", "/stats")).data.modulos.presupuestoActivo);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
let copiaId = null;
const creadas = [];
const stockAntes = new Map();
try {
  // ---------------------------------------------------------------- datos de ejemplo (DECISIONES 71: los reales los carga ROMA)
  setEnabled(true);
  const bisagra = (await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Bisagra` })).data;
  const corredera = (await api("POST", "/herrajes/tipos", { nombre: `${PREFIJO} Corredera` })).data;
  const alta = async (data) => (await api("POST", "/herrajes", data)).data;
  const comun = await alta({ nombre: `${PREFIJO} Cazoleta común`, tipoId: bisagra.id, unidad: "unidad", valor: 850, formulaCantidadDefecto: "PUESTAS.cant * 2" });
  const t350 = await alta({ nombre: `${PREFIJO} Telescópica 350`, tipoId: corredera.id, unidad: "par", valor: 9100, linea: "Telescópica", medidaMm: 350, formulaCantidadDefecto: "1", formulaMedidaDefecto: "PROFUNDIDAD - 50" });
  const t450 = await alta({ nombre: `${PREFIJO} Telescópica 450`, tipoId: corredera.id, unidad: "par", valor: 10500, linea: "Telescópica", medidaMm: 450 });
  const copia = (await api("POST", `/modulos/${BAJO}/duplicar`)).data;
  copiaId = copia.id;
  const activada = await api("PUT", `/modulos/${copiaId}`, { ...sinCampos(copia), nombre: `${PREFIJO} Bajo mesada`, activo: true, herrajes: [] });
  check("datos de ejemplo: herrajes y la copia activa del módulo, sin herrajes todavía", activada.status === 200 && Boolean(comun?.id && t350?.id && t450?.id), `${activada.status} ${activada.data?.message ?? ""}`);
  const alacenaId = psql(`select id from modulos where nombre = '${ALACENA}' and activo`);
  check("la Alacena 2 puertas del catálogo no tiene herrajes", Boolean(alacenaId) && psql(`select count(*) from modulos_herraje where "moduloId" = '${alacenaId}'`) === "0");

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

  // ---------------------------------------------------------------- catálogo: los herrajes del módulo en el editor
  await page.goto(`${APP}/configuracion-modulos/${copiaId}`);
  const pestaña = page.getByRole("tab", { name: /^Herrajes/ });
  await pestaña.waitFor({ timeout: 30000 });
  await pestaña.click();
  await page.getByText("Este módulo no lleva herrajes.").waitFor({ timeout: 15000 });
  const agregar = async (opcion) => {
    await page.getByRole("combobox", { name: "Agregar herraje" }).click();
    await page.getByRole("option", { name: opcion }).click();
    await page.waitForTimeout(400);
  };
  await agregar(`${PREFIJO} Cazoleta común`);
  await agregar(new RegExp(`^${PREFIJO} Telescópica 350`));
  const resultados = [norm(await page.getByLabel("Resultado del herraje 1").innerText()), norm(await page.getByLabel("Resultado del herraje 2").innerText())];
  check(
    "editor: la bisagra (4) y la corredera por medida (530 mm: la de 450), con las fórmulas por defecto",
    resultados[0] === `4 × ${PREFIJO} Cazoleta común` && resultados[1] === `1 × ${PREFIJO} Telescópica 450`,
    resultados.join(" || ")
  );
  await page.getByRole("button", { name: "Guardar cambios" }).first().click();
  await page.getByText(/Cambios guardados/).waitFor({ timeout: 30000 });
  const guardado = (await api("GET", `/modulos/${copiaId}`)).data;
  check(
    "editor: guardado con las dos líneas",
    JSON.stringify(guardado.herrajes.map((h) => [h.herrajeId, h.formulaCantidad, h.formulaMedida])) === JSON.stringify([[comun.id, "PUESTAS.cant * 2", null], [t350.id, "1", "PROFUNDIDAD - 50"]]),
    JSON.stringify(guardado.herrajes)
  );

  // ---------------------------------------------------------------- asistente: dos módulos, uno con herrajes
  const asistente = async (cliente) => {
    await page.goto(`${APP}/modulos/nueva`);
    await page.getByLabel("Nombre o razón social").waitFor({ timeout: 30000 });
    await page.getByLabel("Nombre o razón social").fill(cliente);
    await page.getByLabel("Teléfono").fill("2664000000");
    await page.getByRole("button", { name: "Siguiente" }).click();
    const buscar = page.getByLabel("Buscar por nombre o código");
    await buscar.fill(PREFIJO);
    await page.getByRole("button", { name: `${PREFIJO} Bajo mesada`, exact: true }).click();
    await buscar.fill("alacena 2");
    await page.getByRole("button", { name: ALACENA, exact: true }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    for (const [n, modulo] of [[1, `${PREFIJO} Bajo mesada`], [2, ALACENA]]) {
      const tarjeta = page.getByRole("region", { name: `Módulo ${n} · ${modulo}`, exact: true });
      await tarjeta.waitFor({ timeout: 15000 });
      for (const label of ["Esqueleto", "Frentes"]) {
        await tarjeta.getByLabel(label).click();
        await page.getByRole("option", { name: new RegExp(`^${escape(nombreA)} ·`) }).first().click();
      }
    }
    await page.getByRole("button", { name: "Revisar despiece" }).click();
    await page.getByText("Despiece y resumen calculados por el servidor.").waitFor({ timeout: 90000 });
  };
  const panel = () => page.getByRole("region", { name: "Resumen", exact: true });
  const crear = async () => {
    await page.getByRole("button", { name: "Crear solicitud" }).click();
    await page.waitForURL(/\/modulos\/[0-9a-f-]{36}$/, { timeout: 90000 });
    const id = new URL(page.url()).pathname.split("/").pop();
    creadas.push(id);
    return (await api("GET", `/pedidos-modulos/${id}`)).data;
  };
  const indicadores = async () => {
    const region = page.locator('[aria-label="Indicadores de la solicitud"]').first();
    await region.waitFor({ timeout: 30000 });
    return norm(await region.innerText());
  };

  const activoAntes = await presupuestoActivo();
  await asistente(`${PREFIJO} prendidos`);
  const card1 = page.getByRole("region", { name: "Herrajes del módulo 1" });
  await card1.waitFor({ timeout: 30000 });
  const filas1 = (await card1.locator("tbody tr").allInnerTexts()).map(norm);
  check(
    "paso 4: los herrajes del bajo mesada y ninguno en la alacena",
    filas1.length === 2 && filas1[0].includes("Cazoleta común") && filas1[1].includes("Telescópica 450") && (await page.getByRole("region", { name: "Herrajes del módulo 2" }).count()) === 0,
    filas1.join(" || ")
  );
  const panelOn = norm(await panel().innerText());
  await page.screenshot({ path: join(shotsDir, "a1-paso4-prendidos.png"), fullPage: true });
  const P = await crear();
  check(
    "alta: los herrajes calculados, solo del módulo 1",
    JSON.stringify(resumen(P)) === JSON.stringify([["Cazoleta común", 4, 850, "CALCULADO", 1], ["Telescópica 450", 1, 10500, "CALCULADO", 1]]) && P.costoHerrajes === 4 * 850 + 10500,
    JSON.stringify(resumen(P))
  );
  check(
    "paso 4: el resumen dio los mismos herrajes y el mismo total que la solicitud creada",
    panelOn.includes(`Herrajes ${money(P.costoHerrajes)}`) && panelOn.includes(`Total ${money(P.presupuestoConHerrajes)}`) && centavos(P.presupuestoConHerrajes) === centavos(P.presupuestoEstimado) + centavos(P.costoHerrajes),
    panelOn.slice(-200)
  );
  const comoCorte = (await api("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: P.detalles })).data;
  check("paridad: el presupuesto de placas es el mismo que el de corte con las mismas filas", mismoEstimado(comoCorte, P), ESTIMADO.map((c) => `${c} ${comoCorte[c]}/${P[c]}`).join(", "));
  const ind1 = await indicadores();
  check("detalle: \"Total con herrajes\" con el total y lo que suman los herrajes", ind1.includes(`Total con herrajes ${money(P.presupuestoConHerrajes)}`) && ind1.includes(`Incluye ${money(P.costoHerrajes)} de herrajes`) && ind1.includes(`Placas ${P.placasEstimadas}`), ind1);
  const enDetalle = (await page.getByRole("region", { name: "Herrajes del módulo 1" }).locator("tbody tr").allInnerTexts()).map(norm);
  check("detalle: los herrajes del módulo 1 y ninguno en el 2", enDetalle.length === 2 && (await page.getByRole("region", { name: "Herrajes del módulo 2" }).count()) === 0, enDetalle.join(" || "));
  await page.screenshot({ path: join(shotsDir, "a2-detalle-prendidos.png"), fullPage: true });
  const fila = (await api("GET", `/pedidos-modulos?search=${encodeURIComponent(`${PREFIJO} prendidos`)}`)).data.find((o) => o.id === P.id);
  check("listado: el mismo total con herrajes y las mismas placas", fila && centavos(fila.presupuestoConHerrajes) === centavos(P.presupuestoConHerrajes) && fila.placasEstimadas === P.placasEstimadas, JSON.stringify(fila ?? {}).slice(0, 200));
  check("dashboard: el presupuesto en curso suma el total con herrajes", (await presupuestoActivo()) - activoAntes === centavos(P.presupuestoConHerrajes));
  await page.goto(`${APP}/modulos/${P.id}/taller`);
  await page.getByRole("table", { name: "Herrajes" }).waitFor({ timeout: 30000 });
  const taller = (await page.getByRole("table", { name: "Herrajes" }).locator("tbody tr").allInnerTexts()).map(norm);
  check(
    "hoja de taller: una sola tabla de herrajes, la del módulo 1",
    (await page.getByRole("table", { name: "Herrajes" }).count()) === 1 && taller.length === 2 && taller[0] === `${PREFIJO} Bisagra: ${PREFIJO} Cazoleta común 4` && taller[1] === `${PREFIJO} Corredera: ${PREFIJO} Telescópica 450 1 par`,
    taller.join(" || ")
  );

  // ---------------------------------------------------------------- apagados con el interruptor de la pantalla
  await page.goto(`${APP}/configuracion-herrajes`);
  const interruptor = page.getByLabel("Herrajes habilitados en las solicitudes de módulos");
  await interruptor.waitFor({ timeout: 30000 });
  await interruptor.click();
  await page.getByText(/Herrajes deshabilitados/).first().waitFor({ timeout: 15000 });
  check("interruptor: los herrajes quedan apagados", !enabled());

  await asistente(`${PREFIJO} apagados`);
  const aviso = await page.getByText(/Algunos módulos tienen herrajes, pero están apagados/).count();
  const panelOff = norm(await panel().innerText());
  check("apagados, paso 4: avisa y no hay herrajes en ningún módulo", aviso === 1 && (await page.getByRole("region", { name: /^Herrajes del módulo/ }).count()) === 0);
  await page.screenshot({ path: join(shotsDir, "a3-paso4-apagados.png"), fullPage: true });
  const Q = await crear();
  check("apagados, alta: sin herrajes y sin costo de herrajes", Q.herrajes.length === 0 && Q.costoHerrajes === 0 && centavos(Q.presupuestoConHerrajes) === centavos(Q.presupuestoEstimado));
  check("apagados, paso 4: el resumen no tiene la línea de herrajes y el total es el de placas", !/\bHerrajes \$/.test(panelOff) && panelOff.includes(`Total ${money(Q.presupuestoEstimado)}`), panelOff.slice(-200));
  check("no regresión: con o sin herrajes, las mismas placas y el mismo presupuesto de placas", mismoEstimado(P, Q), ESTIMADO.map((c) => `${c} ${P[c]}/${Q[c]}`).join(", "));
  const [excelP, excelQ] = [await filasMaquina(P.id), await filasMaquina(Q.id)];
  check("no regresión: el mismo Excel de la máquina (sin código de barra ni cliente)", excelP.length === P.detalles.length + 1 && JSON.stringify(excelP) === JSON.stringify(excelQ), `${excelP.length} y ${excelQ.length} filas`);
  const [materialesP, materialesQ] = [await listadoMateriales(P.id), await listadoMateriales(Q.id)];
  check("no regresión: el mismo listado de materiales", materialesP.length > 0 && JSON.stringify(materialesP) === JSON.stringify(materialesQ), `${materialesP.length} filas`);
  const ind2 = await (async () => {
    await page.goto(`${APP}/modulos/${Q.id}`);
    return indicadores();
  })();
  check("apagados, detalle de la nueva: \"Presupuesto\", sin herrajes", ind2.includes(`Presupuesto ${money(Q.presupuestoEstimado)}`) && !ind2.includes("herrajes"), ind2);
  check("dashboard: suma la nueva sin herrajes", (await presupuestoActivo()) - activoAntes === centavos(P.presupuestoConHerrajes) + centavos(Q.presupuestoEstimado));

  await page.goto(`${APP}/modulos/${P.id}`);
  const ind3 = await indicadores();
  check("apagados, la que ya los tenía: sigue mostrando y cobrando sus herrajes", ind3.includes(`Total con herrajes ${money(P.presupuestoConHerrajes)}`) && (await page.getByRole("region", { name: "Herrajes del módulo 1" }).locator("tbody tr").count()) === 2, ind3);
  await page.goto(`${APP}/modulos/${P.id}/taller`);
  check("apagados, la que ya los tenía: la hoja de taller los sigue mostrando", await page.getByRole("table", { name: "Herrajes" }).waitFor({ timeout: 30000 }).then(() => true, () => false));
  await page.goto(`${APP}/configuracion-modulos/${copiaId}`);
  await pestaña.waitFor({ timeout: 30000 });
  await pestaña.click();
  const avisoEditor = await page.getByText(/Los herrajes están apagados: se guardan con el módulo/).waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("apagados, editor del módulo: avisa y conserva las dos líneas", avisoEditor && (await page.getByLabel("Resultado del herraje 2").count()) === 1);

  // Editar la que ya los tenía con los herrajes apagados: cambiar el teléfono los conserva, también en el comprobante.
  await page.goto(`${APP}/modulos/${P.id}/editar`);
  await page.getByLabel("Teléfono").waitFor({ timeout: 30000 });
  await page.getByLabel("Teléfono").fill("2664999999");
  for (let paso = 0; paso < 3; paso++) {
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.waitForTimeout(400);
  }
  await page.getByRole("button", { name: "Revisar y guardar" }).click();
  let constancia = page.getByRole("dialog");
  await constancia.getByText("Constancia de solicitud").first().waitFor({ timeout: 60000 });
  await constancia.getByText(/^Herrajes:/).waitFor({ timeout: 30000 }).catch(() => undefined);
  let texto = norm(await constancia.innerText());
  check("apagados, comprobante de la edición: los herrajes guardados y el total con ellos", texto.includes(`Herrajes: ${money(P.costoHerrajes)}`) && texto.includes(money(P.presupuestoConHerrajes)), texto.slice(300, 700));
  await page.getByRole("button", { name: "Confirmar cambios" }).click();
  await page.waitForURL(`**/modulos/${P.id}`, { timeout: 60000 });
  let P2 = (await api("GET", `/pedidos-modulos/${P.id}`)).data;
  check("apagados, guardar la edición: el teléfono cambia y los herrajes quedan iguales", P2.numeroContacto === "2664999999" && JSON.stringify(resumen(P2)) === JSON.stringify(resumen(P)) && P2.costoHerrajes === P.costoHerrajes);

  // ---------------------------------------------------------------- prendidos otra vez: ajustar en la edición
  await page.goto(`${APP}/configuracion-herrajes`);
  await interruptor.waitFor({ timeout: 30000 });
  await interruptor.click();
  await page.getByText(/Herrajes habilitados en las solicitudes de módulos\./).first().waitFor({ timeout: 15000 });
  check("interruptor: los herrajes quedan prendidos otra vez", enabled());
  await page.goto(`${APP}/modulos/${P.id}/editar`);
  await page.getByLabel("Teléfono").waitFor({ timeout: 30000 });
  for (let paso = 0; paso < 3; paso++) {
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.waitForTimeout(400);
  }
  const editor = page.getByRole("region", { name: "Herrajes del módulo 1" });
  await editor.waitFor({ timeout: 30000 });
  await editor.getByLabel("Cantidad del herraje 1 del módulo 1").fill("6");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Revisar y guardar" }).click();
  constancia = page.getByRole("dialog");
  await constancia.getByText("Constancia de solicitud").first().waitFor({ timeout: 60000 });
  const costoAjustado = 6 * 850 + 10500;
  await constancia.getByText(`Herrajes: ${money(costoAjustado)}`).waitFor({ timeout: 30000 }).catch(() => undefined);
  texto = norm(await constancia.innerText());
  check("comprobante: los herrajes ajustados y el total con ellos", texto.includes(`Herrajes: ${money(costoAjustado)}`) && texto.includes(money((centavos(P.presupuestoEstimado) + centavos(costoAjustado)) / 100)), texto.slice(300, 700));
  await page.getByRole("button", { name: "Confirmar cambios" }).click();
  await page.waitForURL(`**/modulos/${P.id}`, { timeout: 60000 });
  P2 = (await api("GET", `/pedidos-modulos/${P.id}`)).data;
  const ind4 = await indicadores();
  check(
    "edición guardada: la bisagra en 6, el detalle con el total nuevo y las placas iguales",
    P2.costoHerrajes === costoAjustado && P2.herrajes[0].origen === "EDITADO" && mismoEstimado(P2, P) && ind4.includes(`Total con herrajes ${money(P2.presupuestoConHerrajes)}`),
    `${P2.costoHerrajes} | ${ind4}`
  );
  check("dashboard: el total ajustado", (await presupuestoActivo()) - activoAntes === centavos(P2.presupuestoConHerrajes) + centavos(Q.presupuestoEstimado));

  // ---------------------------------------------------------------- recalcular el módulo 1: el 2 no cambia
  const [m1, m2] = P2.modulos;
  const filasDe = (order, moduloId) => JSON.stringify(order.detalles.filter((d) => d.pedidoModuloId === moduloId).map(({ id, ...rest }) => rest));
  const recalculo = await api("POST", `/pedidos-modulos/${P.id}/modulos/${m1.id}/recalcular`, {
    moduloId: m1.moduloId,
    valores: { ...m1.valores, PROFUNDIDAD: 400 },
    colorEsqueletoId: m1.colorEsqueletoId,
    colorFrentesId: m1.colorFrentesId,
    perfilCantoOrden: m1.perfilCantoOrden,
    version: m1.definicionSnapshot.version,
    fechaActualizacion: P2.fechaActualizacion
  });
  const P3 = recalculo.data;
  check(
    "recalcular el módulo 1 (profundidad 400): sus herrajes vuelven al catálogo, con la corredera de 350",
    recalculo.status === 200 && JSON.stringify(resumen(P3)) === JSON.stringify([["Cazoleta común", 4, 850, "CALCULADO", 1], ["Telescópica 350", 1, 9100, "CALCULADO", 1]]) && P3.costoHerrajes === 4 * 850 + 9100,
    `${recalculo.status} ${JSON.stringify(P3?.herrajes ? resumen(P3) : P3).slice(0, 200)}`
  );
  check("recalcular el módulo 1: las piezas del módulo 2 no cambian", filasDe(P3, m2.id) === filasDe(P2, m2.id));
  const comoCorte3 = (await api("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: P3.detalles })).data;
  check("recalcular: el presupuesto de placas sigue igual al de corte", mismoEstimado(comoCorte3, P3));

  // ---------------------------------------------------------------- estados: la reserva de stock es la de las placas
  const porMaterial = P3.estimacionDetalle.porMaterial;
  for (const item of porMaterial) {
    stockAntes.set(item.materialId, psql(`select coalesce("stockPlacas"::text, 'null') from materiales where id = '${item.materialId}'`));
    psql(`update materiales set "stockPlacas" = 500 where id = '${item.materialId}'`);
  }
  const enProceso = await api("PATCH", `/orders/${P.id}/status`, { estado: "EN_PROCESO" });
  const stock = (id) => Number(psql(`select "stockPlacas" from materiales where id = '${id}'`));
  check(
    "En proceso: reserva exactamente las placas de cada material",
    enProceso.status === 200 && enProceso.data.stockReservado === true && porMaterial.every((item) => stock(item.materialId) === 500 - item.placas) && porMaterial.reduce((s, i) => s + i.placas, 0) === P3.placasEstimadas,
    porMaterial.map((item) => `${item.placas}: 500 -> ${stock(item.materialId)}`).join(", ")
  );
  const terminada = await api("PATCH", `/orders/${P.id}/status`, { estado: "TERMINADA" });
  const entregada = await api("PATCH", `/orders/${P.id}/status`, { estado: "ENTREGADA" });
  const final = (await api("GET", `/pedidos-modulos/${P.id}`)).data;
  check(
    "Terminada y Entregada: los herrajes y el total quedan iguales, y el historial tiene los tres cambios",
    terminada.status === 200 && entregada.status === 200 && final.costoHerrajes === P3.costoHerrajes && JSON.stringify(resumen(final)) === JSON.stringify(resumen(P3)) &&
      final.historial.filter((h) => h.accion === "CAMBIAR_ESTADO").length === 3,
    `${terminada.status} ${entregada.status}`
  );
  check("dashboard: la entregada ya no está en curso", (await presupuestoActivo()) - activoAntes === centavos(Q.presupuestoEstimado));
  await page.goto(`${APP}/modulos/${P.id}/taller`);
  const tallerFinal = await page.getByRole("table", { name: "Herrajes" }).waitFor({ timeout: 30000 }).then(async () => (await page.getByRole("table", { name: "Herrajes" }).locator("tbody tr").allInnerTexts()).map(norm), () => []);
  check("hoja de taller de la entregada: los herrajes recalculados", tallerFinal.length === 2 && tallerFinal[1] === `${PREFIJO} Corredera: ${PREFIJO} Telescópica 350 1 par`, tallerFinal.join(" || "));
  await page.screenshot({ path: join(shotsDir, "a4-taller-entregada.png"), fullPage: true });
  await context.close();
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n").slice(0, 4).join(" / ")}`, false);
} finally {
  for (const id of creadas) {
    psql(`update pedidos set estado = 'PENDIENTE', "stockReservado" = false, "reservaStock" = null where id = '${id}'`);
    await api("DELETE", `/orders/${id}`);
  }
  for (const [id, valor] of stockAntes) psql(`update materiales set "stockPlacas" = ${valor} where id = '${id}'`);
  if (copiaId) await api("DELETE", `/modulos/${copiaId}`);
  psql(`delete from modulos_herraje where "herrajeId" in (select id from herrajes where nombre like '${PREFIJO}%')`);
  psql(`delete from herrajes where nombre like '${PREFIJO}%'`);
  psql(`delete from tipos_herraje where nombre like '${PREFIJO}%'`);
  setEnabled(configAntes === "t");
  check("limpieza: la copia de la base queda como estaba (también el stock y el interruptor)", contar() === antes && psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`) === configAntes, contar());
  await browser.close();
}
const inesperados = errors.filter((error) => !/status of 40[09]/.test(error));
check("sin errores en la consola", inesperados.length === 0, inesperados.slice(0, 5).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exit(failures ? 1 : 0);
