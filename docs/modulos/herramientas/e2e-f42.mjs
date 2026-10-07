// Prueba de F4.2: paridad de placas y presupuesto entre solicitudes de modulos y de corte (regla 1).
//
// Contra el backend local (puerto 4100) conectado a la copia del backup, con el catalogo importado:
// - cada modulo activo, con sus valores por defecto y los dos perfiles de canto, por POST /api/pedidos-modulos/preview;
// - las mismas filas cargadas como corte por POST /api/orders/preview: tal cual, agregadas, en otro orden y partidas;
// - una solicitud de varios modulos con colores, medidas y cantos cambiados a mano;
// tienen que dar === en placas y en cada componente del presupuesto. Ademas prueba los errores de spec §8.2 y §8.3.
//
// Necesita un material de fondo: si la configuracion del catalogo no tiene, usa una placa de 3 mm y al final deja
// la configuracion como estaba. Crea un modulo de prueba (PRUEBA_E2E_F42, con material fijo y fondo propio) y lo
// borra al terminar. No guarda pedidos. No imprime datos de clientes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const BASE = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const admin = jwt.sign({ id: psql("select id from usuarios where rol='ADMIN' limit 1"), email: "prueba@local", rol: "ADMIN" }, SECRET, { expiresIn: "2h" });
const carpintero = jwt.sign({ id: psql("select id from usuarios where rol='CARPINTERO' limit 1"), email: "carp@local", rol: "CARPINTERO" }, SECRET, { expiresIn: "2h" });

const call = async (method, path, body, token = admin) => {
  const response = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures++;
};

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// ---------------------------------------------------------------- datos de la copia
// Colores de 18 mm con canto de 0,45 y de 2 mm (los dos espesores que usa el catalogo), y uno sin canto de 2 mm.
const colores = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 0.45) < 1e-6)
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 2) < 1e-6)
  order by p.nombre limit 3`).split("\n");
const sinCanto2 = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 0.45) < 1e-6)
    and not exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 2) < 1e-6)
  order by p.nombre limit 2`).split("\n").filter(Boolean);
const placaFina = psql(`select id from materiales where tipo = 'PLACA' and activo and "espesorMm" <> 18 and "anchoPlaca" is not null and "altoPlaca" is not null order by "espesorMm" desc, nombre, id limit 1`);
const fondo = psql(`select id from materiales where tipo = 'PLACA' and activo and "espesorMm" = 3 limit 1`);
const fondoAntes = psql(`select coalesce("materialFondoId", 'null') from configuracion_modulos where id = 'default'`);
const pedidosAntes = psql("select count(*) from pedidos");
check("datos de prueba", colores.length === 3 && sinCanto2.length >= 1 && Boolean(fondo), `colores ${colores.length}, sin canto de 2 mm ${sinCanto2.length}`);
// El fondo que va a usar la configuracion durante la prueba: el que ya tenia o, si no tenia, la placa de 3 mm.
const fondoConfig = fondoAntes === "null" ? fondo : fondoAntes;
if (fondoAntes === "null") psql(`update configuracion_modulos set "materialFondoId" = '${fondo}' where id = 'default'`);

const [colorA, colorB, colorC] = colores;
const line = (moduloId, extra = {}) => ({ moduloId, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, colorCantoId: colorA, perfilCantoOrden: 1, ...extra });
const preview = (modulos) => call("POST", "/pedidos-modulos/preview", { cliente: "Prueba F4.2", numeroContacto: "000000", modulos });
const cortePreview = (detalles) => call("POST", "/orders/preview", { cliente: "Prueba F4.2", numeroContacto: "000000", detalles });

// Las filas de la vista previa de modulos como las cargaria alguien a mano en una solicitud de corte.
const asCorte = (detalles) =>
  detalles.map((row) => ({
    materialId: row.materialId,
    largo: row.largo,
    ancho: row.ancho,
    cantidad: row.cantidad,
    permiteRotar: row.permiteRotar,
    cantoLargo1Id: row.cantoLargo1Id,
    cantoLargo2Id: row.cantoLargo2Id,
    cantoAncho1Id: row.cantoAncho1Id,
    cantoAncho2Id: row.cantoAncho2Id,
    nombreProducto: "a mano"
  }));
const keyOf = (row) => [row.materialId, row.largo, row.ancho, row.permiteRotar, row.cantoLargo1Id, row.cantoLargo2Id, row.cantoAncho1Id, row.cantoAncho2Id].join("|");
const aggregated = (rows) => {
  const byKey = new Map();
  for (const row of rows) {
    const current = byKey.get(keyOf(row));
    if (current) current.cantidad += row.cantidad;
    else byKey.set(keyOf(row), { ...row });
  }
  return [...byKey.values()];
};
const split = (rows) => rows.flatMap((row) => (row.cantidad > 1 ? [{ ...row, cantidad: 1 }, { ...row, cantidad: row.cantidad - 1 }] : [row]));
const COMPONENTS = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado", "faltanteStock"];
// El detalle se compara con sus listas ordenadas por id: los valores no dependen del orden de las filas, pero la
// lista por material sigue el orden en que aparece cada material (es el orden que ve el usuario en el plano).
const canonical = (detail) =>
  JSON.stringify({
    ...detail,
    porMaterial: [...detail.porMaterial].sort((x, y) => x.materialId.localeCompare(y.materialId)),
    porCanto: [...detail.porCanto].sort((x, y) => x.cantoId.localeCompare(y.cantoId))
  });
const differences = (a, b) => [
  ...COMPONENTS.filter((key) => a[key] !== b[key]).map((key) => `${key} ${a[key]} != ${b[key]}`),
  ...(canonical(a.estimacionDetalle) === canonical(b.estimacionDetalle) ? [] : ["estimacionDetalle"])
];

/** La vista previa de modulos contra las cargas de corte equivalentes: tal cual, agregada, invertida y partida. */
async function parity(label, modules, { allowNoFit = false } = {}) {
  const moduleResult = await preview(modules);
  if (allowNoFit && moduleResult.status === 400 && moduleResult.data?.code === "MODULE_PIECES_DO_NOT_FIT") return { noEntra: moduleResult.data.message };
  if (moduleResult.status !== 200) {
    check(label, false, `vista previa de modulos ${moduleResult.status}: ${moduleResult.data?.message}`);
    return null;
  }
  const rows = asCorte(moduleResult.data.detalles);
  const variants = { "tal cual": rows, agregada: aggregated(rows), invertida: [...rows].reverse(), partida: split(rows) };
  const problems = [];
  for (const [name, detalles] of Object.entries(variants)) {
    const corte = await cortePreview(detalles);
    if (corte.status !== 200) problems.push(`${name}: corte ${corte.status} ${corte.data?.message}`);
    else problems.push(...differences(moduleResult.data, corte.data).map((diff) => `${name}: ${diff}`));
  }
  if (moduleResult.data.costoHerrajes !== 0 || moduleResult.data.presupuestoConHerrajes !== moduleResult.data.presupuestoEstimado) problems.push("herrajes");
  check(label, problems.length === 0, problems.length ? problems.slice(0, 3).join("; ") : `${moduleResult.data.placasEstimadas} placas, $${moduleResult.data.presupuestoEstimado}`);
  return moduleResult.data;
}

try {
  // ---------------------------------------------------------------- paridad modulo por modulo
  const modules = (await call("GET", "/modulos")).data;
  const conFondo = new Set(psql(`select distinct "moduloId" from modulos_pieza where rol = 'FONDO'`).split("\n"));
  let total = 0;
  let iguales = 0;
  const noEntran = new Set();
  for (const module of modules) {
    for (const perfilCantoOrden of [1, 2]) {
      const before = failures;
      const result = await parity(`${module.codigo}, perfil ${perfilCantoOrden}`, [line(module.id, { perfilCantoOrden })], { allowNoFit: true });
      if (result?.noEntra) {
        noEntran.add(module.codigo);
        continue;
      }
      total++;
      if (failures === before) iguales++;
    }
  }
  check(`paridad en los ${modules.length - noEntran.size} modulos que se pueden pedir con sus valores por defecto, con los dos perfiles`, iguales === total && total > 0, `${iguales}/${total}`);
  // Piezas que no entran con los valores por defecto: es la validacion de spec §8.3 funcionando. Son datos del
  // catalogo que ROMA tiene que revisar (punto 7 de la planilla de revision).
  console.log(`    no entran con los valores por defecto (para revisar con ROMA): ${[...noEntran].join(", ") || "ninguno"}`);

  // ---------------------------------------------------------------- una solicitud de varios modulos
  const byCode = new Map(modules.map((module) => [module.codigo, module]));
  const pick = (code) => byCode.get(code) ?? modules[0];
  const bajo = pick("BAJO_MESADA_2_PUERTAS");
  const full = (await call("GET", `/modulos/${bajo.id}`)).data;
  const piso = full.piezas[0].codigo;
  const varios = [
    line(bajo.id),
    line(bajo.id, { valores: { ANCHO: 900 }, colorFrentesId: colorC, colorCantoId: colorB, perfilCantoOrden: 2 }),
    line(bajo.id, { valores: { ancho: 600 }, cantosOverride: { [piso]: { LARGO_1: 2, LARGO_2: 2, ANCHO_1: 0.45, ANCHO_2: null } } }),
    // El primero de estos, con el fondo elegido en la solicitud (DECISIONES 32).
    ...modules.filter((module) => conFondo.has(module.id)).slice(0, 3).map((module, index) => line(module.id, { colorEsqueletoId: colorB, ...(index === 0 ? { materialFondoId: placaFina } : {}) })),
    ...modules.filter((module) => !conFondo.has(module.id)).slice(0, 2).map((module) => line(module.id, { colorCantoId: colorC }))
  ];
  const result = await parity(`solicitud de ${varios.length} modulos con colores, medidas, cantos y un fondo cambiados`, varios);

  if (result) {
    // Filas: codigo de barra, remark, nombre, pieza de origen, orden, indice y agrupacion por modulo (spec §8.2)
    const filas = result.detalles;
    check("indice 0..n-1 en el orden de los modulos", filas.every((row, index) => row.indice === index));
    const porModulo = new Map();
    filas.forEach((row) => porModulo.set(row.posicionModulo, [...(porModulo.get(row.posicionModulo) ?? []), row]));
    check("cada modulo con sus filas, en orden", porModulo.size === varios.length && [...porModulo.keys()].every((posicion, index) => posicion === index + 1));
    check(
      "orden 1..n y codigo de barra M----PP-OO por modulo",
      [...porModulo.entries()].every(([posicion, rows]) =>
        rows.every((row, index) => row.orden === index + 1 && row.codigoBarra === `M----${String(posicion).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`)
      ),
      filas[0].codigoBarra
    );
    check("sin remark (DECISIONES 20) y con nombre de producto", filas.every((row) => (row.remark ?? "") === "" && row.nombreProducto));
    check("pieza de origen y cliente", filas.every((row) => row.piezaCodigo && row.nombreCliente === "Prueba F4.2" && row.numeroCliente === "000000"));
    const editadas = filas.filter((row) => row.origen === "EDITADO");
    check(
      "cantos cambiados a mano: origen EDITADO solo en esa pieza",
      editadas.length === 1 && editadas[0].posicionModulo === 3 && editadas[0].piezaCodigo === piso && filas.filter((row) => row.origen === "CALCULADO").length === filas.length - 1
    );
    const editada = editadas[0];
    check(
      "los cantos cambiados son los pedidos, del color elegido",
      Boolean(editada.cantoLargo1Id && editada.cantoLargo2Id && editada.cantoAncho1Id) && !editada.cantoAncho2Id && editada.cantoLargo1Nombre?.includes("2mm") && editada.cantoAncho1Nombre?.includes("0,45mm"),
      `${editada.cantoLargo1Nombre} / ${editada.cantoAncho1Nombre}`
    );
    check("valores guardados: lo cargado y los defectos", result.modulos[1].valores.ANCHO === 900 && result.modulos[2].valores.ANCHO === 600 && Object.keys(result.modulos[0].valores).length >= 3);
    // Cada fila en el material que le toca segun el rol de su pieza en el catalogo, y cada canto del color elegido.
    const definiciones = new Map();
    for (const item of varios) if (!definiciones.has(item.moduloId)) definiciones.set(item.moduloId, (await call("GET", `/modulos/${item.moduloId}`)).data);
    const colorDeCanto = new Map(psql(`select id, "placaMaterialId" from materiales where tipo = 'CANTO'`).split("\n").map((row) => row.split("|")));
    const malMaterial = [];
    const malCanto = [];
    for (const row of filas) {
      const pedido = varios[row.posicionModulo - 1];
      const definicion = definiciones.get(pedido.moduloId);
      const pieza = definicion.piezas.find((item) => item.codigo === row.piezaCodigo);
      const esperado = { ESQUELETO: pedido.colorEsqueletoId, FRENTE: pedido.colorFrentesId, FONDO: pedido.materialFondoId ?? definicion.materialFondoId ?? fondoConfig, FIJO: pieza.materialFijoId }[pieza.rol];
      if (row.materialId !== esperado) malMaterial.push(`M${row.posicionModulo} ${row.piezaCodigo} (${pieza.rol})`);
      for (const id of [row.cantoLargo1Id, row.cantoLargo2Id, row.cantoAncho1Id, row.cantoAncho2Id].filter(Boolean)) {
        if (colorDeCanto.get(id) !== pedido.colorCantoId) malCanto.push(`M${row.posicionModulo} ${row.piezaCodigo}`);
      }
    }
    check("cada fila en el material de su rol (esqueleto, frentes, fondo, incluido el fondo elegido)", malMaterial.length === 0, malMaterial.slice(0, 4).join(", ") || `${filas.length} filas`);
    const fondoEsperado = (pedido) => {
      const definicion = definiciones.get(pedido.moduloId);
      const tieneFondo = filas.some((row) => varios[row.posicionModulo - 1] === pedido && definicion.piezas.find((item) => item.codigo === row.piezaCodigo)?.rol === "FONDO");
      return tieneFondo ? pedido.materialFondoId ?? definicion.materialFondoId ?? fondoConfig : null;
    };
    check(
      "cada modulo informa el fondo que usa (el elegido, el de la configuracion o ninguno)",
      result.modulos.every((modulo, index) => modulo.materialFondoId === fondoEsperado(varios[index])) && result.modulos.some((modulo) => modulo.materialFondoId === placaFina),
      result.modulos.map((modulo) => (modulo.materialFondoId === placaFina ? "elegido" : modulo.materialFondoId ? "config" : "-")).join(" ")
    );
    check("cada canto del color de cantos de su modulo", malCanto.length === 0, malCanto.slice(0, 4).join(", "));
    check(
      "la prueba distingue esqueleto de frentes y usa varios colores de canto",
      varios.filter((item) => item.colorEsqueletoId !== item.colorFrentesId).length >= 3 && new Set(varios.map((item) => item.colorCantoId)).size >= 3
    );
  }

  // ---------------------------------------------------------------- errores de spec §8.2 y §8.3
  const inactivo = psql("select id from modulos where not activo limit 1");
  const code = async (label, modulos, expected, test = () => true) => {
    const response = await preview(modulos);
    check(label, response.status === 400 && response.data?.code === expected && test(response.data), `${response.status} ${response.data?.code}: ${String(response.data?.message).slice(0, 140)}`);
    return response.data;
  };
  if (inactivo) await code("modulo inactivo", [line(inactivo)], "MODULE_NOT_AVAILABLE");
  await code("medida que el modulo no tiene", [line(bajo.id, { valores: { ANCHOO: 900 } })], "MODULE_FORMULA_ERRORS", (data) => data.details.posicion === 1);
  await code("medida que rompe una formula", [line(bajo.id, { valores: { ANCHO: 20 } })], "MODULE_FORMULA_ERRORS");
  await code("cambio de canto de una pieza que no existe", [line(bajo.id, { cantosOverride: { NO_EXISTE: { LARGO_1: 2, LARGO_2: null, ANCHO_1: null, ANCHO_2: null } } })], "MODULE_FORMULA_ERRORS");
  await code("esqueleto de otro espesor (spec §8.6)", [line(bajo.id, { colorEsqueletoId: placaFina })], "MODULE_MATERIAL_INVALID", (data) => /pensado para placas de 18 mm/.test(data.message));
  const faltan = await code(
    "faltan cantos: todos juntos, sin repetir",
    [line(bajo.id, { colorCantoId: sinCanto2[0] }), line(bajo.id, { colorCantoId: sinCanto2[0] }), ...(sinCanto2[1] ? [line(bajo.id, { colorCantoId: sinCanto2[1] })] : [])],
    "MISSING_EDGE_MATERIAL",
    (data) => data.details.faltantes.length === sinCanto2.length && data.details.faltantes.every((item) => item.espesorMm === 2) && /Cargalo en Materiales\.$/.test(data.message)
  );
  if (faltan) console.log(`    ${faltan.message}`);
  await code("pieza que no entra en la placa (spec §8.3)", [line(bajo.id, { valores: { ANCHO: 5000 } })], "MODULE_PIECES_DO_NOT_FIT", (data) => /del Módulo 1 \(5000 × \d+ mm\) no entra en la placa .+ \(\d+ × \d+ mm útiles\)/.test(data.message));

  psql(`update configuracion_modulos set "materialFondoId" = null where id = 'default'`);
  const modConFondo = modules.find((module) => conFondo.has(module.id));
  await code("sin material de fondo", [line(modConFondo.id)], "MODULE_MATERIAL_INVALID", (data) => /Catálogo de módulos > Configuración/.test(data.message));
  psql(`update configuracion_modulos set "materialFondoId" = '${fondo}' where id = 'default'`);

  // Un modulo de prueba con una pieza de material fijo y fondo propio: ningun modulo del catalogo los tiene.
  const categoria = (await call("GET", "/modulos/categorias")).data.find((item) => item.activo);
  const temporal = await call("POST", "/modulos", {
    codigo: "PRUEBA_E2E_F42",
    nombre: "Prueba e2e F4.2",
    categoriaId: categoria.id,
    descripcion: null,
    activo: true,
    espesorDisenoMm: 18,
    materialFondoId: placaFina,
    observaciones: null,
    parametros: [{ clave: "ANCHO", etiqueta: "Ancho", tipo: "MEDIDA", valorDefecto: 600, minimo: null, maximo: null, opciones: null, formula: null, ayuda: null, orden: 1 }],
    perfiles: [{ orden: 1, nombre: "Estandar", descripcion: null, predeterminado: true }],
    piezas: [
      { codigo: "LATERAL", nombre: "Lateral", rol: "ESQUELETO", materialFijoId: null, formulaLargo: "700", formulaAncho: "500", formulaCantidad: "2", permiteRotar: false, orden: 1, observaciones: null, cantos: [{ perfilOrden: 1, lado: "LARGO_1", espesorMm: 0.45 }] },
      { codigo: "ZOCALO", nombre: "Zocalo", rol: "FIJO", materialFijoId: colorC, formulaLargo: "ANCHO", formulaAncho: "100", formulaCantidad: "1", permiteRotar: false, orden: 2, observaciones: null, cantos: [] },
      { codigo: "FONDO", nombre: "Fondo", rol: "FONDO", materialFijoId: null, formulaLargo: "ANCHO", formulaAncho: "ANCHO", formulaCantidad: "1", permiteRotar: false, orden: 3, observaciones: null, cantos: [] }
    ],
    herrajes: []
  });
  check("modulo de prueba con material fijo y fondo propio", temporal.status === 201, `${temporal.status} ${temporal.data?.message ?? ""}`);
  if (temporal.status === 201) {
    try {
      const conFijo = await parity("paridad con material fijo y fondo propio", [line(temporal.data.id)]);
      const material = (codigo) => conFijo?.detalles.find((row) => row.piezaCodigo === codigo)?.materialId;
      check("material fijo y fondo propio del modulo, antes que el de la configuracion", material("ZOCALO") === colorC && material("FONDO") === placaFina && material("LATERAL") === colorA);
    } finally {
      check("modulo de prueba borrado", (await call("DELETE", `/modulos/${temporal.data.id}`)).status === 204);
    }
  }

  const sinPerfil = await preview([{ moduloId: bajo.id, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, colorCantoId: colorA }]);
  check("sin perfil de cantos: 400 (spec §13.2)", sinPerfil.status === 400 && JSON.stringify(sinPerfil.data).includes("Elegí el perfil de cantos"), `${sinPerfil.status}`);
  const malEscrito = await preview([{ ...line(bajo.id), perfilOrden: 2 }]);
  check("un campo mal escrito no se ignora: 400", malEscrito.status === 400 && JSON.stringify(malEscrito.data).includes("no se reconocen"), `${malEscrito.status}`);

  const validacion = await preview([{ moduloId: "no-es-un-id" }]);
  const mensajes = (validacion.data?.errors ?? []).map((issue) => issue.message);
  check(
    "datos invalidos: 400 con mensajes en espanol",
    validacion.status === 400 && ["Elegí un módulo del catálogo", "Faltan las medidas del módulo", "Elegí el color de esqueleto", "Elegí el perfil de cantos del módulo (1 o 2)"].every((m) => mensajes.includes(m)),
    mensajes.join(" / ")
  );
  const prohibido = await call("POST", "/pedidos-modulos/preview", { modulos: [line(bajo.id)] }, carpintero);
  check("un carpintero no accede (403)", prohibido.status === 403);
  check("la vista previa no guarda nada", psql("select count(*) from pedidos") === pedidosAntes);
} finally {
  psql(`update configuracion_modulos set "materialFondoId" = ${fondoAntes === "null" ? "null" : `'${fondoAntes}'`} where id = 'default'`);
  check("configuracion del catalogo como estaba", psql(`select coalesce("materialFondoId", 'null') from configuracion_modulos where id = 'default'`) === fondoAntes);
}

console.log(failures ? `\n${failures} con problemas` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
