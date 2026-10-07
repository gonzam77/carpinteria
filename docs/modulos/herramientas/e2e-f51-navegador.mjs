// Prueba en el navegador del detalle de una solicitud de módulos (F5.1, spec §9.3): Edge sin ventana, con barras de
// desplazamiento reales, contra el backend local (puerto 4100, copia del backup) y Vite (puerto 5180, con
// VITE_API_URL=http://127.0.0.1:4100/api).
// - Permisos: sin sesión lleva a /admin; un carpintero vuelve al inicio.
// - Encabezado (título, estado, plazo, cliente y referencia), tarjeta de datos (Sin email, Sin dirección, Creada, Módulos)
//   y el stepper; sin Editar todavía (F5.2).
// - Volver: sin origen, con un origen válido y con uno que no es una ruta propia; también desde el listado filtrado.
// - Fecha de entrega: una fecha pasada no llega al servidor, un 409 inventado se muestra, una válida se guarda (aviso,
//   historial); una entregada no la deja cambiar. Además, la API: 400, 404, 403, 409 ORDER_DELIVERED y la misma fecha.
// - Estado desde el selector: los cambios que tocarían el stock (En proceso, Terminada, Entregada) se responden con
//   page.route, así el stock de la copia no se toca: "Stock insuficiente" con el 409 STOCK_SHORTAGE_CONFIRMATION_REQUIRED,
//   "Continuar sin descontar stock" con forceWithoutStock, "Pedido terminado" con el WhatsApp de M-<número>. Los que no
//   tocan el stock (Pendiente y Rechazada) van de verdad, con el aviso y el historial.
// - Exportar Excel (nombre y filas del archivo, y un error inventado), Materiales, Eliminar (un 409 inventado y uno de
//   verdad que vuelve al listado filtrado con el aviso), pestañas Despiece (un módulo por región, la pieza Editada, los
//   cantos y el Resumen con los números guardados), Plano de cortes (las placas guardadas) e Historial.
// - Esqueleto mientras carga, un error de carga con Reintentar, las redirecciones entre /pedidos/:id y /modulos/:id, los
//   tamaños de notebook, tablet y celular, y la consola sin errores inesperados.
// Crea solicitudes "Prueba F5.1 ..." por la API (una la pasa a Entregada por SQL, sin reserva de stock) y las borra al
// final. Deja la copia como estaba (pedidos, filas, historial, módulos de solicitudes y stock). No imprime datos de
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
const PREFIJO = "Prueba F5.1";
const ZONA = "America/Argentina/Buenos_Aires";
const VERDE = "rgb(47, 125, 79)";
const shotsDir = process.env.SHOTS_DIR ?? join(tmpdir(), "e2e-f51-capturas");
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
const decimals = (value) => Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const addDays = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const dmy = (value) => value.split("-").reverse().join("/");
const ESTADOS = { PENDIENTE: "Pendiente", EN_PROCESO: "En proceso", TERMINADA: "Terminada", ENTREGADA: "Entregada", RECHAZADA: "Rechazada" };
const PASOS = ["PENDIENTE", "EN_PROCESO", "TERMINADA", "ENTREGADA"];
/** El stepper esperado para un estado: los pasos anteriores hechos, el actual marcado (Entregada, todos hechos). */
const pasosDe = (estado) => {
  const actual = PASOS.indexOf(estado);
  return PASOS.map((paso, index) => `${ESTADOS[paso]}:${index < actual || estado === "ENTREGADA" ? "hecho" : index === actual ? "actual" : "-"}`);
};
/** Una entrada del historial como la tiene que mostrar el detalle (spec §9.4). */
const textoHistorial = (item) => {
  if (item.accion === "CREAR_PEDIDO_MODULOS" || item.accion === "CREAR_PEDIDO") return "Creó la solicitud";
  if (item.accion === "CAMBIAR_ESTADO") return `Cambió el estado de ${ESTADOS[item.valorAnterior]} a ${ESTADOS[item.valorNuevo]}`;
  if (item.accion === "CAMBIAR_FECHA_ENTREGA") return `Cambió la fecha de entrega del ${dmy(item.valorAnterior)} al ${dmy(item.valorNuevo)}`;
  return item.accion;
};
const LADOS = [
  ["L1", "cantoLargo1Id", "cantoLargo1Nombre"],
  ["L2", "cantoLargo2Id", "cantoLargo2Nombre"],
  ["A1", "cantoAncho1Id", "cantoAncho1Nombre"],
  ["A2", "cantoAncho2Id", "cantoAncho2Nombre"]
];
/** La celda Cantos esperada de una fila: "L1 <canto>" por cada lado con canto, o "Sin cantos". */
const cantosDe = (row) => {
  const lineas = LADOS.filter(([, id]) => row[id]).map(([label, , nombre]) => `${label} ${(row[nombre] ?? "Canto").trim()}`);
  return lineas.length ? norm(lineas.join(" ")) : "Sin cantos";
};

// Las fechas de las solicitudes de prueba son relativas a hoy en Argentina: una corrida que cruza la medianoche daría
// falsos MAL. Cerca de las 00:00 no arranca; si igual la cruza, lo dice al final.
const segundosHastaMedianoche = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return 86_400 - (get("hour") * 3600 + get("minute") * 60 + get("second"));
};
if (segundosHastaMedianoche() < 300) {
  console.log("MAL Faltan menos de 5 minutos para la medianoche de Argentina: corré la prueba después de las 00:00.");
  process.exit(1);
}
const hoy = ymd(new Date());

// ---------------------------------------------------------------- datos de la copia
const restos = psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`);
if (restos !== "0") {
  console.log(`MAL hay ${restos} solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralas antes (DELETE /api/orders/:id).`);
  process.exit(1);
}
const userRow = (where) => {
  const [id, nombre, apellido, email, rol] = psql(`select id, nombre, apellido, email, rol from usuarios u where ${where} order by "fechaCreacion" limit 1`).split("|");
  return { id, nombre, apellido, email, rol };
};
const admin = userRow("rol = 'ADMIN'");
const carpintero = userRow("rol = 'CARPINTERO'");
const corteId = psql(`select id from pedidos where tipo = 'CORTE' order by "fechaCreacion" desc limit 1`);
const tokenFor = (user, expiresIn = "2h") => jwt.sign({ id: user.id, email: user.email, rol: user.rol }, SECRET, { expiresIn });
const adminToken = tokenFor(admin);
const api = async (method, path, body, token = adminToken) => {
  const response = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
};
const contar = () => ({
  pedidos: psql("select count(*) from pedidos"),
  modulos: psql("select count(*) from pedidos_modulo"),
  detalles: psql("select count(*) from detalle_pedidos"),
  historial: psql("select count(*) from historial_pedidos"),
  stock: psql(`select coalesce(sum("stockPlacas"), 0) from materiales`)
});
const antes = contar();
const colores = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 0.45) < 1e-6)
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 2) < 1e-6)
  order by p.nombre limit 2`).split("\n");
// Un canto del color de los frentes, para ponérselo a mano a una pieza de esqueleto (queda EDITADO, DECISIONES 45).
const cantoOtroColor = colores[1]
  ? psql(`select id from materiales where tipo = 'CANTO' and activo and "placaMaterialId" = '${colores[1]}' order by "espesorMm" desc, id limit 1`)
  : "";
const BAJO = psql("select id from modulos where codigo='BAJO_MESADA_2_PUERTAS'");
const herrajesHabilitados = psql(`select "herrajesHabilitados" from configuracion_modulos where id = 'default'`) === "t";
const espesores = new Map(
  psql(`select id || '|' || "espesorMm" from materiales`)
    .split("\n")
    .map((row) => row.split("|"))
    .map(([id, mm]) => [id, Number(mm).toLocaleString("es-AR", { maximumFractionDigits: 2 })])
);
const definicion = BAJO ? await api("GET", `/modulos/${BAJO}`) : { status: 0, data: null };
const piezaEditada = definicion.data?.piezas?.find((pieza) => pieza.rol === "ESQUELETO");
check(
  "datos de prueba",
  colores.length === 2 && Boolean(cantoOtroColor && BAJO && piezaEditada && admin.id && carpintero.id && corteId),
  `colores ${colores.length}, módulo ${Boolean(BAJO)}, pieza ${Boolean(piezaEditada)}, carpintero ${Boolean(carpintero.id)}, corte ${Boolean(corteId)}`
);
const linea = (extra = {}) => ({ moduloId: BAJO, valores: {}, colorEsqueletoId: colores[0], colorFrentesId: colores[1], perfilCantoOrden: 1, ...extra });
const FECHA = addDays(hoy, 30);
const NUEVA_FECHA = addDays(hoy, 45);

const browser = await chromium.launch({ channel: "msedge", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
const errors = [];
// Errores provocados a propósito (se ignoran en el chequeo final).
const esperados = [];
async function newPage(user, { viewport = { width: 1366, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport, locale: "es-AR", timezoneId: ZONA, acceptDownloads: true });
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
      { token: tokenFor(user), user }
    );
  }
  return { context, page };
}

const creados = [];
const pedidos = {};
try {
  // ---------------------------------------------------------------- A. solicitudes de prueba
  // principal: dos módulos; en el segundo, una pieza de esqueleto con un canto del color de los frentes en Largo 1
  // (EDITADO) y observaciones. entregada: un módulo, con email y dirección, pasada a Entregada por SQL (sin reserva de
  // stock). borrar: un módulo, para borrarla de verdad desde el detalle.
  const ALTAS = {
    principal: {
      numeroContacto: "2664000001",
      observaciones: "Referencia F5.1",
      modulos: [linea(), linea({ observaciones: "Va contra la pared", cantosOverride: { [piezaEditada?.codigo ?? "x"]: { LARGO_1: cantoOtroColor } } })]
    },
    entregada: { numeroContacto: "2664000002", emailContacto: "prueba-f51@example.com", direccionEntrega: "Calle de prueba 123", modulos: [linea()] },
    borrar: { numeroContacto: "2664000003", modulos: [linea()] }
  };
  for (const [key, alta] of Object.entries(ALTAS)) {
    const response = await api("POST", "/pedidos-modulos", { cliente: `${PREFIJO} ${key}`, fechaEntrega: FECHA, ...alta });
    if (response.status !== 201) throw new Error(`alta ${key}: ${response.status} ${JSON.stringify(response.data).slice(0, 200)}`);
    creados.push(response.data.id);
    pedidos[key] = response.data;
  }
  psql(`update pedidos set estado = 'ENTREGADA' where id = '${pedidos.entregada.id}'`);
  const principalId = pedidos.principal.id;
  const numero = pedidos.principal.numero;
  const leer = async (id = principalId) => (await api("GET", `/pedidos-modulos/${id}`)).data;
  let guardada = await leer();
  const modulo2 = guardada.modulos.find((modulo) => modulo.posicion === 2);
  const editadas = guardada.detalles.filter((row) => row.origen === "EDITADO");
  check(
    "alta: dos módulos y una sola pieza EDITADO, la del segundo módulo con el canto elegido",
    guardada.modulos.length === 2 &&
      editadas.length === 1 &&
      editadas[0].pedidoModuloId === modulo2?.id &&
      editadas[0].piezaCodigo === piezaEditada.codigo &&
      editadas[0].cantoLargo1Id === cantoOtroColor,
    `${guardada.modulos.length} módulos, ${editadas.length} editadas`
  );

  // ---------------------------------------------------------------- B. la API del cambio de fecha de entrega
  {
    const historialAntes = psql(`select count(*) from historial_pedidos where "pedidoId" = '${principalId}'`);
    const misma = await api("PATCH", `/pedidos-modulos/${principalId}/fecha-entrega`, { fechaEntrega: FECHA });
    check(
      "API: la misma fecha responde la solicitud (200) sin sumar historial",
      misma.status === 200 && misma.data?.id === principalId && misma.data?.fechaEntrega === FECHA && Array.isArray(misma.data?.detalles) &&
        psql(`select count(*) from historial_pedidos where "pedidoId" = '${principalId}'`) === historialAntes,
      String(misma.status)
    );
    const pasada = await api("PATCH", `/pedidos-modulos/${principalId}/fecha-entrega`, { fechaEntrega: addDays(hoy, -1) });
    check(
      "API: una fecha anterior a hoy da 400 con el motivo",
      pasada.status === 400 && JSON.stringify(pasada.data).includes("La fecha de entrega no puede ser anterior a hoy"),
      String(pasada.status)
    );
    const otroFormato = await api("PATCH", `/pedidos-modulos/${principalId}/fecha-entrega`, { fechaEntrega: dmy(NUEVA_FECHA) });
    const otroCampo = await api("PATCH", `/pedidos-modulos/${principalId}/fecha-entrega`, { fechaEntrega: NUEVA_FECHA, estado: "ENTREGADA" });
    const sinFecha = await api("PATCH", `/pedidos-modulos/${principalId}/fecha-entrega`, {});
    check(
      "API: dd/mm/aaaa, otro campo además de la fecha y sin fecha dan 400",
      otroFormato.status === 400 && otroCampo.status === 400 && sinFecha.status === 400,
      `${otroFormato.status} ${otroCampo.status} ${sinFecha.status}`
    );
    const fechaCorteAntes = psql(`select "fechaEntrega" from pedidos where id = '${corteId}'`);
    const deCorte = await api("PATCH", `/pedidos-modulos/${corteId}/fecha-entrega`, { fechaEntrega: NUEVA_FECHA });
    const inexistente = await api("PATCH", "/pedidos-modulos/00000000-0000-4000-8000-000000000000/fecha-entrega", { fechaEntrega: NUEVA_FECHA });
    check(
      "API: una solicitud de corte o inexistente da 404, y la de corte queda igual",
      deCorte.status === 404 && inexistente.status === 404 && psql(`select "fechaEntrega" from pedidos where id = '${corteId}'`) === fechaCorteAntes,
      `${deCorte.status} ${inexistente.status}`
    );
    const entregada = await api("PATCH", `/pedidos-modulos/${pedidos.entregada.id}/fecha-entrega`, { fechaEntrega: NUEVA_FECHA });
    check(
      "API: una entregada da 409 ORDER_DELIVERED y no cambia",
      entregada.status === 409 && entregada.data?.code === "ORDER_DELIVERED" && (await leer(pedidos.entregada.id)).fechaEntrega === FECHA,
      `${entregada.status} ${entregada.data?.code}`
    );
    const carpinteroPatch = await api("PATCH", `/pedidos-modulos/${principalId}/fecha-entrega`, { fechaEntrega: NUEVA_FECHA }, tokenFor(carpintero));
    check("API: un carpintero recibe 403", carpinteroPatch.status === 403, String(carpinteroPatch.status));
    check("API: nada de lo anterior cambió la fecha", (await leer()).fechaEntrega === FECHA);
  }

  // ---------------------------------------------------------------- C. permisos
  {
    const { context, page } = await newPage(null);
    await page.goto(`${APP}/modulos/${principalId}`);
    await page.waitForURL("**/admin", { timeout: 15000 }).catch(() => undefined);
    check("sin sesión, /modulos/:id lleva al ingreso de administración", new URL(page.url()).pathname === "/admin", new URL(page.url()).pathname);
    await context.close();
  }
  {
    const { context, page } = await newPage(carpintero);
    await page.goto(`${APP}/modulos/${principalId}`);
    await page.waitForTimeout(1500);
    check(
      "carpintero: /modulos/:id vuelve al inicio, sin pedir la solicitud",
      new URL(page.url()).pathname === "/" && (await page.getByRole("heading", { name: `Solicitud M-${numero}` }).count()) === 0,
      new URL(page.url()).pathname
    );
    await context.close();
  }

  const { context, page } = await newPage(admin);
  // window.open no abre nada: guarda la dirección del WhatsApp para revisarla.
  await page.addInitScript(() => {
    window.__abierto = [];
    window.open = (url) => {
      window.__abierto.push(String(url));
      return null;
    };
  });
  const shot = (name, fullPage = false) => page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage });
  // Los pedidos al servidor: cambios de fecha y de estado, y las cargas del detalle (redirecciones).
  const fechaPatches = [];
  const cargasModulos = [];
  const cargasComun = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname.endsWith("/fecha-entrega")) fechaPatches.push(request.postData());
    if (request.method() === "GET" && /\/api\/pedidos-modulos\/[0-9a-f-]{36}$/.test(url.pathname)) cargasModulos.push(url.pathname);
    if (request.method() === "GET" && /\/api\/orders\/[0-9a-f-]{36}$/.test(url.pathname)) cargasComun.push(url.pathname);
  });
  const titulo = page.getByRole("heading", { level: 1 });
  const abrir = async (id = principalId) => {
    await page.goto(`${APP}/modulos/${id}`);
    await page.getByRole("heading", { level: 1, name: /^Solicitud M-\d+$/ }).waitFor({ timeout: 30000 });
  };
  const barra = async () => norm(await page.locator("header .MuiTypography-h6").innerText());
  const chips = async () => (await titulo.locator("xpath=..").locator(".MuiChip-root").allInnerTexts()).map(norm);
  const subtitulo = async () => norm(await titulo.locator("xpath=../following-sibling::p[1]").innerText());
  const tarjeta = page.getByRole("region", { name: "Datos de la solicitud", exact: true });
  const datos = () =>
    tarjeta.evaluate((region) =>
      Object.fromEntries([...region.querySelectorAll(".MuiTypography-caption")].map((caption) => [caption.textContent.trim(), (caption.nextElementSibling?.innerText ?? "").replace(/\s+/g, " ").trim()]))
    );
  const stepper = page.locator('[aria-label="Estado de la solicitud"]');
  const pasos = async () =>
    (await stepper.count())
      ? stepper
          .locator(".MuiStepLabel-label")
          .evaluateAll((labels) => labels.map((label) => `${label.textContent.trim()}:${label.classList.contains("Mui-completed") ? "hecho" : label.classList.contains("Mui-active") ? "actual" : "-"}`))
      : [];
  const esperarPasos = async (estado) => {
    for (let waited = 0; waited < 10000; waited += 100) {
      if (JSON.stringify(await pasos()) === JSON.stringify(pasosDe(estado))) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };
  const selectorEstado = page.getByRole("combobox", { name: /^Estado/ });
  const elegirEstado = async (texto) => {
    await selectorEstado.click();
    await page.getByRole("option", { name: texto, exact: true }).click();
  };
  const esperarAviso = (texto, timeout = 10000) =>
    page
      .locator(".MuiSnackbar-root .MuiAlert-message")
      .filter({ hasText: texto })
      .first()
      .waitFor({ timeout })
      .then(
        () => true,
        () => false
      );
  const cerrarAvisos = async () => {
    for (const boton of await page.locator(".MuiSnackbar-root").getByRole("button", { name: /^(Close|Cerrar)$/ }).all()) await boton.click().catch(() => undefined);
    await page.locator(".MuiSnackbar-root").first().waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
  };
  const botonCambiar = tarjeta.getByRole("button", { name: "Cambiar", exact: true });
  // Las celdas de una tabla de piezas. En Cantos, cada línea es "L1 <canto>": el rótulo va en su propio elemento, separado
  // solo por un margen (sin espacio en el texto), así que se arma nodo por nodo.
  const leerFilas = (rows) =>
    rows.map((row) =>
      [...row.querySelectorAll("td")].map((cell, index, cells) =>
        index === cells.length - 1
          ? [...cell.querySelectorAll("p")].map((line) => [...line.childNodes].map((node) => node.textContent.trim()).filter(Boolean).join(" ")).join(" ").replace(/\s+/g, " ")
          : cell.innerText.replace(/\s+/g, " ").trim()
      )
    );
  const desborde = () =>
    page.evaluate(() => {
      const doc = document.documentElement;
      const main = document.querySelector("main");
      return { pagina: `${doc.scrollWidth}/${doc.clientWidth}`, main: `${main.scrollWidth}/${main.clientWidth}`, ok: doc.scrollWidth <= doc.clientWidth && main.scrollWidth <= main.clientWidth };
    });

  // ---------------------------------------------------------------- D. carga: esqueleto, encabezado y tarjeta
  {
    let soltar;
    const compuerta = new Promise((resolve) => {
      soltar = resolve;
    });
    const demorar = async (route) => {
      await compuerta;
      await route.fallback();
    };
    await page.route(`**/api/pedidos-modulos/${principalId}`, demorar);
    await page.goto(`${APP}/modulos/${principalId}`);
    const esqueleto = await page
      .locator('[aria-label="Cargando la solicitud"][aria-busy="true"]')
      .waitFor({ timeout: 15000 })
      .then(
        () => true,
        () => false
      );
    const sinTitulo = (await titulo.count()) === 0;
    soltar();
    await page.getByRole("heading", { level: 1, name: `Solicitud M-${numero}` }).waitFor({ timeout: 30000 });
    await page.unroute(`**/api/pedidos-modulos/${principalId}`, demorar);
    check("mientras carga: el esqueleto, sin título", esqueleto && sinTitulo);
  }
  check("barra y menú: Módulos a medida", (await barra()) === "Módulos a medida" && (await page.getByRole("link", { name: "Módulos a medida" }).evaluate((link) => link.classList.contains("Mui-selected"))), await barra());
  check("un solo título: Solicitud M-<número>", (await titulo.count()) === 1 && norm(await titulo.innerText()) === `Solicitud M-${numero}`);
  const chipsCabecera = await chips();
  const colorPlazo = await titulo.locator("xpath=..").locator(".MuiChip-root").nth(1).evaluate((element) => getComputedStyle(element).color);
  const explicacionPlazo = await titulo.locator("xpath=..").locator(".MuiChip-root").nth(1).getAttribute("title");
  check(
    "encabezado: estado Pendiente y plazo Faltan 30 d en verde, con la explicación",
    JSON.stringify(chipsCabecera) === JSON.stringify(["Pendiente", "Faltan 30 d"]) && colorPlazo === VERDE && explicacionPlazo === `Faltan 30 días: se entrega el ${dmy(FECHA)}`,
    `${chipsCabecera.join(", ")} | ${colorPlazo} | ${explicacionPlazo}`
  );
  check("encabezado: cliente · referencia", (await subtitulo()) === `${PREFIJO} principal · Referencia F5.1`, await subtitulo());
  const botones = (await page.locator("main").getByRole("button").allInnerTexts()).map(norm);
  check(
    "acciones: Volver, Materiales, Exportar Excel y Eliminar, sin Editar (F5.2)",
    ["Volver", "Materiales", "Exportar Excel", "Eliminar"].every((texto) => botones.includes(texto)) && !botones.includes("Editar") && (await selectorEstado.count()) === 1,
    botones.join(", ")
  );
  check("el selector de estado muestra Pendiente", norm(await selectorEstado.innerText()) === "Pendiente", norm(await selectorEstado.innerText()));
  const valores = await datos();
  const esperadoDatos = {
    Cliente: `${PREFIJO} principal`,
    Teléfono: "2664000001",
    Email: "Sin email",
    "Dirección de entrega": "Sin dirección",
    "Referencia del trabajo": "Referencia F5.1",
    "Fecha de entrega": `${dmy(FECHA)} Cambiar`,
    Creada: norm(`${dmy(hoy)} por ${admin.nombre} ${admin.apellido}`),
    Módulos: "2"
  };
  const datosMal = Object.entries(esperadoDatos)
    .filter(([campo, valor]) => valores[campo] !== valor)
    .map(([campo]) => `${campo}: "${campo === "Creada" ? "(no coincide)" : valores[campo]}"`);
  check("tarjeta: cliente, teléfono, Sin email, Sin dirección, referencia, fecha con Cambiar, creada por y módulos", datosMal.length === 0, datosMal.join(" || "));
  check("stepper: Pendiente actual y el resto por hacer", await esperarPasos("PENDIENTE"), (await pasos()).join(", "));
  await shot("d1-detalle");

  // ---------------------------------------------------------------- E. Volver
  await page.getByRole("button", { name: "Volver" }).click();
  await page.waitForURL(`${APP}/modulos`, { timeout: 15000 }).catch(() => undefined);
  check("Volver sin origen: al listado de módulos", new URL(page.url()).pathname === "/modulos" && new URL(page.url()).search === "", page.url().replace(APP, ""));
  for (const [origen, destino, label] of [
    ["/modulos?estado=PENDIENTE", "/modulos?estado=PENDIENTE", "con un origen válido, vuelve ahí"],
    ["//ejemplo.com/afuera", "/modulos", "con un origen que no es una ruta propia, al listado"]
  ]) {
    await abrir();
    await page.evaluate((returnTo) => window.history.replaceState({ ...window.history.state, usr: { returnTo } }, ""), origen);
    await page.reload();
    await titulo.waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Volver" }).click();
    await page.waitForURL((url) => url.pathname === "/modulos", { timeout: 15000 }).catch(() => undefined);
    const llego = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
    check(`Volver ${label}`, llego === destino && new URL(page.url()).origin === new URL(APP).origin, llego);
  }

  // ---------------------------------------------------------------- F. fecha de entrega
  await abrir();
  await botonCambiar.click();
  const nuevaFecha = page.getByLabel("Nueva fecha");
  check("Cambiar: el campo Nueva fecha arranca con la fecha actual", (await nuevaFecha.inputValue()) === FECHA, await nuevaFecha.inputValue());
  await page.getByRole("button", { name: "Cancelar" }).click();
  check("Cancelar: vuelve a mostrar la fecha", (await nuevaFecha.count()) === 0 && (await datos())["Fecha de entrega"] === `${dmy(FECHA)} Cambiar`);
  await botonCambiar.click();
  await nuevaFecha.press("Escape");
  check("Escape: también cancela", (await nuevaFecha.count()) === 0);
  await botonCambiar.click();
  await nuevaFecha.fill(addDays(hoy, -1));
  await page.getByRole("button", { name: "Guardar" }).click();
  const avisoPasada = await tarjeta
    .getByText("La fecha de entrega no puede ser anterior a hoy.", { exact: true })
    .waitFor({ timeout: 5000 })
    .then(
      () => true,
      () => false
    );
  await page.waitForTimeout(500);
  check("una fecha pasada: lo avisa y no llama al servidor", avisoPasada && fechaPatches.length === 0, `${fechaPatches.length} pedidos`);
  // Un 409 inventado (otra persona la cambió mientras tanto): se muestra el mensaje del servidor y la edición sigue abierta.
  const fechaCambiada = (route) =>
    route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "La solicitud cambió mientras tanto. Recargá la página y volvé a intentar.", code: "ORDER_CHANGED" }) });
  await page.route(`**/api/pedidos-modulos/${principalId}/fecha-entrega`, fechaCambiada);
  esperados.push(/^HTTP 409 PATCH \/pedidos-modulos\/[0-9a-f-]{36}\/fecha-entrega$/, /^console: Failed to load resource: .*409.* @ \/pedidos-modulos\/[0-9a-f-]{36}\/fecha-entrega$/);
  await nuevaFecha.fill(NUEVA_FECHA);
  await page.getByRole("button", { name: "Guardar" }).click();
  const aviso409 = await tarjeta
    .getByText("La solicitud cambió mientras tanto. Recargá la página y volvé a intentar.")
    .waitFor({ timeout: 10000 })
    .then(
      () => true,
      () => false
    );
  check("un 409 al guardar la fecha: muestra el mensaje y deja la edición abierta", aviso409 && (await nuevaFecha.count()) === 1 && fechaPatches.length === 1, `${fechaPatches.length} pedidos`);
  await page.unroute(`**/api/pedidos-modulos/${principalId}/fecha-entrega`, fechaCambiada);
  await page.getByRole("button", { name: "Guardar" }).click();
  const avisoFecha = await esperarAviso(`Fecha de entrega cambiada al ${dmy(NUEVA_FECHA)}.`);
  guardada = await leer();
  check(
    "una fecha válida: se guarda, avisa y se ve con el plazo nuevo",
    avisoFecha &&
      guardada.fechaEntrega === NUEVA_FECHA &&
      JSON.parse(fechaPatches.at(-1) ?? "{}").fechaEntrega === NUEVA_FECHA &&
      (await datos())["Fecha de entrega"] === `${dmy(NUEVA_FECHA)} Cambiar` &&
      (await chips())[1] === "Faltan 45 d",
    `${guardada.fechaEntrega === NUEVA_FECHA} | ${(await datos())["Fecha de entrega"]} | ${(await chips()).join(", ")}`
  );
  const entradaFecha = guardada.historial.find((item) => item.accion === "CAMBIAR_FECHA_ENTREGA");
  check(
    "historial guardado: CAMBIAR_FECHA_ENTREGA con la fecha anterior y la nueva",
    guardada.historial.filter((item) => item.accion === "CAMBIAR_FECHA_ENTREGA").length === 1 && entradaFecha?.valorAnterior === FECHA && entradaFecha?.valorNuevo === NUEVA_FECHA
  );
  await cerrarAvisos();

  // ---------------------------------------------------------------- G. estado: lo que tocaría el stock, con page.route
  // El servidor no se entera: el PATCH se responde en el navegador y la solicitud que se vuelve a leer trae el estado
  // inventado. El stock, el estado y el historial de la copia no cambian.
  {
    let estadoFalso = null;
    const cuerpos = [];
    const estadoInventado = async (route) => {
      const body = route.request().postDataJSON();
      cuerpos.push(body);
      if (body.estado === "EN_PROCESO" && !body.forceWithoutStock) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            message: "No hay stock suficiente para pasar la solicitud a En proceso.",
            code: "STOCK_SHORTAGE_CONFIRMATION_REQUIRED",
            details: { stockShortages: [{ materialId: "00000000-0000-4000-8000-000000000001", materialNombre: "Placa inventada", disponible: 1, requerido: 3, faltante: 2 }] }
          })
        });
      }
      estadoFalso = body.estado;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: principalId, estado: body.estado }) });
    };
    const leerConEstado = async (route) => {
      if (route.request().method() !== "GET" || !estadoFalso) return route.fallback();
      const response = await route.fetch();
      const json = await response.json();
      return route.fulfill({ response, json: { ...json, estado: estadoFalso } });
    };
    await page.route(`**/api/orders/${principalId}/status`, estadoInventado);
    await page.route(`**/api/pedidos-modulos/${principalId}`, leerConEstado);
    esperados.push(/^HTTP 409 PATCH \/orders\/[0-9a-f-]{36}\/status$/, /^console: Failed to load resource: .*409.* @ \/orders\/[0-9a-f-]{36}\/status$/);
    const historialAntes = psql(`select count(*) from historial_pedidos where "pedidoId" = '${principalId}'`);
    const stockAntes = contar().stock;

    const dialogoStock = page.getByRole("dialog", { name: "Stock insuficiente" });
    await elegirEstado("En proceso");
    await dialogoStock.waitFor({ timeout: 10000 });
    const textoStock = norm(await dialogoStock.innerText());
    check(
      "En proceso sin stock (409 inventado): el diálogo Stock insuficiente con el faltante",
      textoStock.includes("No hay stock suficiente para pasar esta solicitud a En proceso.") && textoStock.includes("Placa inventada") && textoStock.includes("Disponible: 1 placas. Requerido: 3. Faltante: 2."),
      textoStock.slice(0, 200)
    );
    await dialogoStock.getByRole("button", { name: "Cancelar" }).click();
    await dialogoStock.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    check("Cancelar: el diálogo se cierra y sigue Pendiente", (await dialogoStock.count()) === 0 && norm(await selectorEstado.innerText()) === "Pendiente" && (await esperarPasos("PENDIENTE")));
    await elegirEstado("En proceso");
    await dialogoStock.waitFor({ timeout: 10000 });
    await dialogoStock.getByRole("button", { name: "Continuar sin descontar stock" }).click();
    const avisoSinStock = await esperarAviso("Estado actualizado a En proceso sin descontar stock por faltante.");
    await dialogoStock.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    check(
      "Continuar sin descontar stock: manda forceWithoutStock true, avisa y queda En proceso",
      avisoSinStock &&
        JSON.stringify(cuerpos) ===
          JSON.stringify([
            { estado: "EN_PROCESO", forceWithoutStock: false },
            { estado: "EN_PROCESO", forceWithoutStock: false },
            { estado: "EN_PROCESO", forceWithoutStock: true }
          ]) &&
        (await dialogoStock.count()) === 0 &&
        (await chips())[0] === "En proceso",
      JSON.stringify(cuerpos)
    );
    check("stepper: Pendiente hecho y En proceso actual", await esperarPasos("EN_PROCESO"), (await pasos()).join(", "));
    await cerrarAvisos();

    await elegirEstado("Terminada");
    const dialogoTerminado = page.getByRole("dialog", { name: "Pedido terminado" });
    const terminado = await dialogoTerminado.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false
    );
    check("Terminada: avisa y abre Pedido terminado", terminado && (await esperarAviso("Estado actualizado a Terminada.")) && (await esperarPasos("TERMINADA")), (await pasos()).join(", "));
    await dialogoTerminado.getByRole("button", { name: "Avisar por WhatsApp" }).click();
    const abiertos = await page.evaluate(() => window.__abierto);
    const link = abiertos[0] ?? "";
    const texto = new URL(link || "https://x").searchParams.get("text") ?? "";
    check(
      "Avisar por WhatsApp: abre el link al teléfono de la solicitud con M-<número> en el mensaje",
      abiertos.length === 1 &&
        link.startsWith("https://api.whatsapp.com/send/?phone=5492664000001&") &&
        texto.includes(`tu pedido M-${numero} ya está listo para retirar`) &&
        texto.includes(`${PREFIJO} principal`),
      `${abiertos.length} abiertos, número ${texto.includes(`M-${numero}`)}`
    );
    await dialogoTerminado.getByRole("button", { name: "Cerrar" }).click();
    await dialogoTerminado.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    await cerrarAvisos();

    await elegirEstado("Entregada");
    const avisoEntregada = await esperarAviso("Estado actualizado a Entregada.");
    check(
      "Entregada: avisa, el stepper completo, el plazo dice Entregada y no se puede cambiar la fecha",
      avisoEntregada && (await esperarPasos("ENTREGADA")) && (await chips()).join(",") === "Entregada,Entregada" && (await botonCambiar.count()) === 0 && (await datos())["Fecha de entrega"] === dmy(NUEVA_FECHA),
      `${(await chips()).join(", ")} | ${(await datos())["Fecha de entrega"]}`
    );
    await shot("d2-entregada-inventada");
    await cerrarAvisos();
    await page.unroute(`**/api/orders/${principalId}/status`, estadoInventado);
    await page.unroute(`**/api/pedidos-modulos/${principalId}`, leerConEstado);
    check(
      "lo inventado no llegó a la copia: sigue Pendiente, sin historial nuevo y con el mismo stock",
      psql(`select estado from pedidos where id = '${principalId}'`) === "PENDIENTE" &&
        psql(`select count(*) from historial_pedidos where "pedidoId" = '${principalId}'`) === historialAntes &&
        contar().stock === stockAntes
    );
  }

  // ---------------------------------------------------------------- H. estado de verdad: Rechazada y vuelta a Pendiente
  // Pendiente y Rechazada no comprometen stock: el cambio llega a la copia sin tocarlo.
  {
    const stockAntes = contar().stock;
    await abrir();
    await elegirEstado("Rechazada");
    const avisoRechazada = await esperarAviso("Estado actualizado a Rechazada.");
    const alertaRechazada = await page
      .getByText("La solicitud está rechazada.", { exact: true })
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      );
    check(
      "Rechazada: avisa, muestra el aviso en vez del stepper y el plazo dice Sin plazo",
      avisoRechazada && alertaRechazada && (await stepper.count()) === 0 && (await chips()).join(",") === "Rechazada,Sin plazo" && psql(`select estado from pedidos where id = '${principalId}'`) === "RECHAZADA",
      (await chips()).join(", ")
    );
    await shot("d3-rechazada");
    await cerrarAvisos();
    await elegirEstado("Pendiente");
    const avisoPendiente = await esperarAviso("Estado actualizado a Pendiente.");
    check(
      "de vuelta a Pendiente: avisa, vuelve el stepper y el stock no cambió",
      avisoPendiente && (await esperarPasos("PENDIENTE")) && (await page.getByText("La solicitud está rechazada.").count()) === 0 && psql(`select estado from pedidos where id = '${principalId}'`) === "PENDIENTE" && contar().stock === stockAntes
    );
    await cerrarAvisos();
  }

  // ---------------------------------------------------------------- I. una entregada de verdad
  await abrir(pedidos.entregada.id);
  const datosEntregada = await datos();
  check(
    "entregada: sin Cambiar, el stepper completo, y el email y la dirección cargados",
    (await botonCambiar.count()) === 0 &&
      (await esperarPasos("ENTREGADA")) &&
      datosEntregada["Fecha de entrega"] === dmy(FECHA) &&
      datosEntregada.Email === "prueba-f51@example.com" &&
      datosEntregada["Dirección de entrega"] === "Calle de prueba 123" &&
      datosEntregada["Referencia del trabajo"] === "Sin referencia" &&
      (await subtitulo()) === `${PREFIJO} entregada`,
    `${datosEntregada["Fecha de entrega"]} | ${datosEntregada.Email} | ${datosEntregada["Dirección de entrega"]} | ${await subtitulo()}`
  );

  // ---------------------------------------------------------------- J. pestañas
  await abrir();
  guardada = await leer();
  const pestañas = (await page.getByRole("tablist", { name: "Secciones de la solicitud" }).getByRole("tab").allInnerTexts()).map(norm);
  check("pestañas: Despiece, Plano de cortes e Historial, con Despiece elegida", JSON.stringify(pestañas) === '["Despiece","Plano de cortes","Historial"]' && (await page.getByRole("tab", { name: "Despiece" }).getAttribute("aria-selected")) === "true", pestañas.join(", "));
  // Despiece: una región por módulo, con su subtítulo, sus filas, la pieza editada y los cantos de cada fila.
  const regiones = page.getByRole("region", { name: /^Módulo \d+ · / });
  check("despiece: una región por módulo y ninguna de piezas adicionales", (await regiones.count()) === 2 && (await page.getByRole("region", { name: "Piezas adicionales" }).count()) === 0, `${await regiones.count()} regiones`);
  const despieceMal = [];
  for (const modulo of guardada.modulos) {
    const region = page.getByRole("region", { name: `Módulo ${modulo.posicion} · ${modulo.nombreModulo}`, exact: true });
    if (!(await region.count())) {
      despieceMal.push(`M${modulo.posicion}: sin región`);
      continue;
    }
    const texto = norm(await region.innerText());
    if (!texto.includes(`Esqueleto ${modulo.colorEsqueleto.nombre.trim()}`) || !texto.includes(`Frentes ${modulo.colorFrentes.nombre.trim()}`)) despieceMal.push(`M${modulo.posicion}: subtítulo`);
    const conObservaciones = texto.includes("Observaciones: Va contra la pared");
    if (conObservaciones !== (modulo.posicion === 2)) despieceMal.push(`M${modulo.posicion}: observaciones ${conObservaciones}`);
    const filas = guardada.detalles.filter((row) => row.pedidoModuloId === modulo.id);
    const celdas = await region.locator("tbody tr").evaluateAll(leerFilas);
    if (celdas.length !== filas.length) despieceMal.push(`M${modulo.posicion}: ${celdas.length} filas, esperadas ${filas.length}`);
    filas.forEach((row, index) => {
      const [pieza, material, largo, ancho, cantidad, cantos] = celdas[index] ?? [];
      const nombre = row.nombreProducto ?? row.piezaCodigo;
      const editada = row.origen === "EDITADO";
      const piezaEsperada = norm(`${nombre} ${editada ? "Editada " : ""}${row.codigoBarra}`);
      if (pieza !== piezaEsperada) despieceMal.push(`M${modulo.posicion} fila ${index + 1}: pieza`);
      if (material !== norm(row.material) || largo !== String(row.largo) || ancho !== String(row.ancho) || cantidad !== String(row.cantidad)) despieceMal.push(`M${modulo.posicion} fila ${index + 1}: medidas`);
      if (cantos !== cantosDe(row)) despieceMal.push(`M${modulo.posicion} fila ${index + 1}: cantos`);
    });
    const chipsEditada = await region.getByText("Editada", { exact: true }).count();
    if (chipsEditada !== filas.filter((row) => row.origen === "EDITADO").length) despieceMal.push(`M${modulo.posicion}: ${chipsEditada} Editada`);
  }
  check("despiece: subtítulo, observaciones, y cada fila con pieza, material, medidas, cantidad y cantos como se guardaron", despieceMal.length === 0, despieceMal.join(" || "));
  const regionModulo2 = page.getByRole("region", { name: `Módulo 2 · ${modulo2.nombreModulo}`, exact: true });
  const filaEditada = regionModulo2.locator("tbody tr").filter({ hasText: editadas[0].codigoBarra });
  const cantosEditada = (await filaEditada.evaluateAll(leerFilas))[0]?.[5] ?? "";
  check(
    "despiece: el chip Editada solo en la pieza cambiada a mano (y ninguna Agregada), con L1 del canto elegido",
    (await page.getByText("Editada", { exact: true }).count()) === 1 &&
      (await filaEditada.getByText("Editada", { exact: true }).count()) === 1 &&
      (await page.getByText("Agregada", { exact: true }).count()) === 0 &&
      cantosEditada.startsWith(norm(`L1 ${editadas[0].cantoLargo1Nombre}`))
  );
  // Resumen: los números guardados de la solicitud (GET /api/pedidos-modulos/:id), no un cálculo nuevo.
  {
    const panel = page.getByRole("region", { name: "Resumen", exact: true });
    const piezas = guardada.detalles.reduce((sum, row) => sum + Number(row.cantidad), 0);
    let ok = false;
    let placas = null;
    for (let waited = 0; !ok && waited <= 15000; waited += 250) {
      if (waited) await page.waitForTimeout(250);
      const panelText = norm(await panel.innerText().catch(() => ""));
      placas = [...panelText.matchAll(/(\d+) placas?\b/g)].reduce((sum, match) => sum + Number(match[1]), 0);
      const porMaterial = guardada.estimacionDetalle.porMaterial.every((item) =>
        panelText.includes(`${item.nombre.trim()} · ${espesores.get(item.materialId)} mm ${item.placas} ${item.placas === 1 ? "placa" : "placas"}`)
      );
      const metros = guardada.estimacionDetalle.porCanto.every((item) => panelText.includes(`${decimals(item.mm / 1000)} m`));
      const importes = [
        `Placas ${money(guardada.costoPlacas)}`,
        `Mano de obra por cortes ${money(guardada.costoManoObraCortes)}`,
        `Cantos (material y pegado) ${money(guardada.costoCantos)}`,
        `Total ${money(guardada.presupuestoConHerrajes)}`
      ].every((part) => panelText.includes(part));
      ok =
        placas === guardada.placasEstimadas &&
        panelText.includes(`Módulos 2 Piezas ${piezas}`) &&
        porMaterial &&
        metros &&
        importes &&
        panelText.includes("Herrajes") === herrajesHabilitados;
    }
    check("Resumen: placas por material, metros de canto y presupuesto guardados (total igual a GET /api/pedidos-modulos/:id)", ok, `${placas} placas en pantalla, ${guardada.placasEstimadas} guardadas`);
  }
  await shot("d4-despiece", true);
  // Plano de cortes: las placas guardadas y el mismo importe.
  await page.getByRole("tab", { name: "Plano de cortes" }).click();
  const plano = page.getByText(/^Placas necesarias: \d+ - Costo estimado: /);
  await plano.waitFor({ timeout: 60000 });
  const planoTexto = norm(await plano.innerText());
  const tableros = await page.getByText(/^Placa \d+ de \d+ - Aprovechamiento/).count();
  check(
    "Plano de cortes: dibuja tantas placas como las guardadas, con el mismo importe",
    planoTexto === `Placas necesarias: ${guardada.placasEstimadas} - Costo estimado: ${money(guardada.presupuestoEstimado)}` && tableros === guardada.placasEstimadas,
    `${planoTexto} | ${tableros} placas dibujadas`
  );
  await shot("d5-plano");
  // Historial: lo de esta corrida, lo más nuevo primero.
  await page.getByRole("tab", { name: "Historial" }).click();
  const historial = page.locator("#panel-historial li");
  await historial.first().waitFor({ timeout: 10000 });
  const entradas = await historial.evaluateAll((items) =>
    items.map((item) => [...item.querySelectorAll(".MuiTypography-root")].map((node) => node.textContent.replace(/\s+/g, " ").trim()))
  );
  const esperadas = [
    "Cambió el estado de Rechazada a Pendiente",
    "Cambió el estado de Pendiente a Rechazada",
    `Cambió la fecha de entrega del ${dmy(FECHA)} al ${dmy(NUEVA_FECHA)}`,
    "Creó la solicitud"
  ];
  check(
    "Historial: creó, cambió la fecha y cambió el estado (lo más nuevo primero), igual que lo guardado",
    JSON.stringify(entradas.map(([texto]) => texto)) === JSON.stringify(esperadas) && JSON.stringify(guardada.historial.map(textoHistorial)) === JSON.stringify(esperadas),
    entradas.map(([texto]) => texto).join(" / ")
  );
  check(
    "Historial: cada entrada con fecha y usuario",
    entradas.every(([, abajo]) => /^\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}/.test(abajo ?? "") && norm(abajo).endsWith(norm(`${admin.nombre} ${admin.apellido}`))),
    entradas.map(([, abajo]) => (abajo ?? "").split("·")[0].trim()).join(" / ")
  );

  // ---------------------------------------------------------------- K. Exportar Excel y Materiales
  {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: "Exportar Excel" }).click()]);
    const archivo = join(shotsDir, download.suggestedFilename());
    await download.saveAs(archivo);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(archivo);
    const prefijos = [];
    workbook.worksheets[0].eachRow((row, fila) => {
      if (fila > 1) prefijos.push(String(row.getCell(1).value ?? "").split("-")[0]);
    });
    const filasGuardadas = Number(psql(`select count(*) from detalle_pedidos where "pedidoId" = '${principalId}'`));
    check(
      "Exportar Excel: descarga pedido-M<número>.xlsx con las filas de la solicitud",
      download.suggestedFilename() === `pedido-M${numero}.xlsx` && prefijos.length === filasGuardadas && prefijos.every((prefijo) => prefijo === `M${numero}`),
      `${download.suggestedFilename() === `pedido-M${numero}.xlsx`} | ${prefijos.length} filas, esperadas ${filasGuardadas}`
    );
    const exportarFalla = (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Falla inventada al exportar." }) });
    const esExportar = (url) => url.pathname.endsWith("/api/orders/export");
    await page.route(esExportar, exportarFalla);
    esperados.push(/^HTTP 500 GET \/orders\/export/, /^console: Failed to load resource: .*500.* @ \/orders\/export/);
    await page.getByRole("button", { name: "Exportar Excel" }).click();
    const avisoExportar = await esperarAviso("Falla inventada al exportar.");
    check("Exportar Excel con un error del servidor: lo muestra y el botón queda disponible", avisoExportar && (await page.getByRole("button", { name: "Exportar Excel" }).isEnabled()));
    await page.unroute(esExportar, exportarFalla);
    await cerrarAvisos();

    await page.getByRole("button", { name: "Materiales" }).click();
    const dialogoMateriales = page.getByRole("dialog", { name: /^Listado de materiales/ });
    await dialogoMateriales.waitFor({ timeout: 10000 });
    const imprimir = dialogoMateriales.getByRole("button", { name: "Imprimir / Guardar PDF" });
    let calculado = false;
    for (let waited = 0; !calculado && waited < 30000; waited += 250) {
      calculado = await imprimir.isEnabled();
      if (!calculado) await page.waitForTimeout(250);
    }
    check("Materiales: abre el listado de materiales de la solicitud, calculado y sin error", calculado && (await dialogoMateriales.locator(".MuiAlert-standardError").count()) === 0);
    await dialogoMateriales.getByRole("button", { name: "Cerrar" }).click();
    await dialogoMateriales.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  }

  // ---------------------------------------------------------------- L. error de carga y Reintentar
  {
    let fallar = true;
    const cargaFalla = (route) =>
      fallar && route.request().method() === "GET"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Falla inventada al cargar." }) })
        : route.fallback();
    await page.route(`**/api/pedidos-modulos/${principalId}`, cargaFalla);
    esperados.push(/^HTTP 500 GET \/pedidos-modulos\/[0-9a-f-]{36}$/, /^console: Failed to load resource: .*500.* @ \/pedidos-modulos\/[0-9a-f-]{36}$/);
    await page.goto(`${APP}/modulos/${principalId}`);
    const reintentar = page.getByRole("button", { name: "Reintentar" });
    const conError = await reintentar.waitFor({ timeout: 15000 }).then(
      () => true,
      () => false
    );
    check(
      "error de carga: el mensaje, Reintentar y Volver, sin título",
      conError && (await page.getByText("Falla inventada al cargar.").count()) === 1 && (await page.getByRole("button", { name: "Volver" }).count()) === 1 && (await titulo.count()) === 0
    );
    fallar = false;
    await reintentar.click();
    const recupero = await page
      .getByRole("heading", { level: 1, name: `Solicitud M-${numero}` })
      .waitFor({ timeout: 15000 })
      .then(
        () => true,
        () => false
      );
    check("Reintentar: carga la solicitud", recupero && (await reintentar.count()) === 0);
    await page.unroute(`**/api/pedidos-modulos/${principalId}`, cargaFalla);
  }

  // ---------------------------------------------------------------- M. redirecciones
  {
    cargasModulos.length = 0;
    cargasComun.length = 0;
    await abrir();
    await page.waitForTimeout(800);
    const directas = cargasModulos.length;
    cargasModulos.length = 0;
    await page.goto(`${APP}/pedidos/${principalId}`);
    await page.waitForURL(`**/modulos/${principalId}`, { timeout: 15000 }).catch(() => undefined);
    await page.getByRole("heading", { level: 1, name: `Solicitud M-${numero}` }).waitFor({ timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    check(
      "/pedidos/:id de una solicitud de módulos pasa a /modulos/:id, con la barra de la sección, y la carga sin repetir de más (dentro de la app, menos veces que entrando directo)",
      new URL(page.url()).pathname === `/modulos/${principalId}` && cargasModulos.length > 0 && cargasModulos.length <= directas && cargasComun.length > 0 && (await barra()) === "Módulos a medida",
      `cargas: directa ${directas}, con redirección ${cargasModulos.length}, del detalle común ${cargasComun.length}`
    );
    esperados.push(new RegExp(`^HTTP 404 GET /pedidos-modulos/${corteId}$`), new RegExp(`^console: Failed to load resource: .*404.* @ /pedidos-modulos/${corteId}$`));
    await page.goto(`${APP}/modulos/${corteId}`);
    await page.waitForURL(`**/pedidos/${corteId}`, { timeout: 15000 }).catch(() => undefined);
    await page.getByRole("button", { name: "Volver" }).waitFor({ timeout: 30000 }).catch(() => undefined);
    check(
      "/modulos/:id de una solicitud de corte pasa a /pedidos/:id, con la barra de siempre",
      new URL(page.url()).pathname === `/pedidos/${corteId}` && (await barra()) === "Panel de solicitudes" && (await page.getByRole("heading", { level: 1, name: /^Solicitud M-/ }).count()) === 0,
      await barra()
    );
  }

  // ---------------------------------------------------------------- N. Eliminar
  {
    // Un 409 inventado: el diálogo se cierra, se muestra el mensaje y la solicitud sigue.
    const borrarCambiada = (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "La solicitud cambió mientras tanto. Recargá la página y volvé a intentar.", code: "ORDER_CHANGED" }) })
        : route.fallback();
    await page.route(`**/api/orders/${principalId}`, borrarCambiada);
    esperados.push(/^HTTP 409 DELETE \/orders\/[0-9a-f-]{36}$/, /^console: Failed to load resource: .*409.* @ \/orders\/[0-9a-f-]{36}$/);
    await abrir();
    await page.getByRole("button", { name: "Eliminar" }).click();
    const dialogoBorrar = page.getByRole("dialog", { name: "Eliminar solicitud" });
    await dialogoBorrar.waitFor({ timeout: 10000 });
    await dialogoBorrar.getByRole("button", { name: "Sí, eliminar" }).click();
    const avisoBorrar409 = await esperarAviso("La solicitud cambió mientras tanto. Recargá la página y volvé a intentar.");
    await dialogoBorrar.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    check(
      "Eliminar con un 409 inventado: cierra el diálogo, muestra el mensaje y la solicitud sigue",
      avisoBorrar409 &&
        (await dialogoBorrar.count()) === 0 &&
        new URL(page.url()).pathname === `/modulos/${principalId}` &&
        (await titulo.count()) === 1 &&
        psql(`select count(*) from pedidos where id = '${principalId}'`) === "1"
    );
    await page.unroute(`**/api/orders/${principalId}`, borrarCambiada);
    await cerrarAvisos();

    // Uno de verdad, abierto desde el listado filtrado: vuelve ahí con el aviso.
    const borrar = pedidos.borrar;
    await page.goto(`${APP}/modulos?q=${encodeURIComponent(`${PREFIJO} borrar`)}`);
    const filaBorrar = page.locator(`.MuiDataGrid-row[data-id="${borrar.id}"] [data-field="cliente"]`);
    await filaBorrar.waitFor({ timeout: 30000 });
    const buscado = (path) => (path ? new URL(path, APP).searchParams.get("q") : null);
    await filaBorrar.click();
    await page.waitForURL(`**/modulos/${borrar.id}`, { timeout: 15000 });
    const origen = await page.evaluate(() => window.history.state?.usr?.returnTo ?? null);
    await page.getByRole("button", { name: "Volver" }).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Eliminar" }).click();
    await dialogoBorrar.getByRole("button", { name: "Sí, eliminar" }).click();
    await page.waitForURL((url) => url.pathname === "/modulos", { timeout: 15000 }).catch(() => undefined);
    const avisoBorrado = await esperarAviso(`Solicitud M-${borrar.numero} eliminada.`);
    const llego = new URL(page.url());
    const yaNoEsta = await page
      .locator(`.MuiDataGrid-row[data-id="${borrar.id}"]`)
      .waitFor({ state: "detached", timeout: 15000 })
      .then(
        () => true,
        () => false
      );
    check(
      "Eliminar de verdad desde el listado filtrado: vuelve al listado con el filtro, avisa Solicitud M-<número> eliminada. y ya no está",
      new URL(origen ?? "/x", APP).pathname === "/modulos" &&
        buscado(origen) === `${PREFIJO} borrar` &&
        llego.pathname === "/modulos" &&
        llego.searchParams.get("q") === `${PREFIJO} borrar` &&
        avisoBorrado &&
        yaNoEsta &&
        (await api("GET", `/pedidos-modulos/${borrar.id}`)).status === 404,
      `origen ${buscado(origen) === `${PREFIJO} borrar`}, llegó a ${llego.pathname} ${llego.searchParams.get("q") === `${PREFIJO} borrar` ? "con el filtro" : "sin el filtro"}, aviso ${avisoBorrado}, fila ${yaNoEsta}`
    );
  }

  // ---------------------------------------------------------------- O. tamaños (con barras de desplazamiento reales)
  for (const [nombre, ancho, alto] of [["notebook", 1366, 768], ["tablet", 768, 1024], ["celular", 390, 844]]) {
    await page.setViewportSize({ width: ancho, height: alto });
    await abrir();
    const medidas = [];
    let entra = true;
    for (const pestaña of ["Despiece", "Plano de cortes", "Historial"]) {
      // La captura de pagina completa deja la pagina desplazada: se vuelve arriba y se confirma que la pestaña quedo elegida.
      await page.evaluate(() => window.scrollTo(0, 0));
      const solapa = page.getByRole("tab", { name: pestaña });
      await solapa.click();
      if ((await solapa.getAttribute("aria-selected")) !== "true") await solapa.press("Enter");
      if (pestaña === "Plano de cortes") await page.getByText(/^Placas necesarias: \d+ - Costo estimado: /).waitFor({ timeout: 60000 });
      await page.waitForTimeout(300);
      const medida = await desborde();
      medidas.push(`${pestaña} ${medida.pagina}`);
      entra &&= medida.ok;
      await shot(`d6-${nombre}-${pestaña.replace(/ /g, "-").toLowerCase()}`, true);
    }
    const eliminar = await page.getByRole("button", { name: "Eliminar" }).boundingBox();
    check(
      `${nombre} ${ancho}x${alto}: nada se sale de la pantalla en las tres pestañas y las acciones se ven enteras`,
      entra && Boolean(eliminar) && eliminar.x >= 0 && eliminar.x + eliminar.width <= ancho,
      `${medidas.join(", ")}; Eliminar hasta ${eliminar ? Math.round(eliminar.x + eliminar.width) : "-"}`
    );
  }
  await page.setViewportSize({ width: 1366, height: 900 });

  if (ymd(new Date()) !== hoy) check("la corrida cruzó la medianoche de Argentina: volvé a correrla", false);
  await context.close();
} catch (error) {
  check(`la prueba se cortó: ${error.message.split("\n")[0]}`, false);
} finally {
  for (const id of new Set([...creados, ...psql(`select id from pedidos where cliente like '${PREFIJO}%'`).split("\n").filter(Boolean)])) {
    const removed = await api("DELETE", `/orders/${id}`).catch((error) => ({ status: error.message }));
    if (removed.status !== 204 && removed.status !== 404) check(`limpieza: borrar ${String(id).slice(0, 8)}`, false, String(removed.status));
  }
  const despues = contar();
  check("limpieza: la copia queda como estaba (pedidos, módulos, filas, historial y stock)", JSON.stringify(despues) === JSON.stringify(antes), JSON.stringify(despues));
  await browser.close();
}

const inesperados = errors.filter((error) => !esperados.some((pattern) => pattern.test(error)));
check("sin errores en la consola ni respuestas fallidas (salvo las provocadas)", inesperados.length === 0, inesperados.slice(0, 6).join(" || "));
console.log(failures ? `\n${failures} de ${total} con problemas` : `\nTodo ok (${total} de ${total})`);
process.exitCode = failures ? 1 : 0;
