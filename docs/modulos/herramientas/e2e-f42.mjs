// Prueba de F4.2: paridad de placas y presupuesto entre solicitudes de modulos y de corte (regla 1).
//
// Contra el backend local (puerto 4100) conectado a la copia del backup, con el catalogo importado:
// - cada modulo activo, con sus valores por defecto y los dos perfiles de canto, por POST /api/pedidos-modulos/preview;
// - las mismas filas cargadas como corte por POST /api/orders/preview: tal cual, agregadas, en otro orden y partidas;
// - una solicitud de varios modulos con colores, medidas y cantos cambiados a mano (de otro color y sin canto);
// - una solicitud con frentes de un color que no tiene canto de 2 mm (esos lados van sin canto y se avisan);
// tienen que dar === en placas y en cada componente del presupuesto. Ademas prueba los cantos de cada lado
// (DECISIONES 45: por defecto, el de la placa de la pieza y del espesor del perfil, o ninguno y avisado en
// modulos[].cantosSinElegir; a mano, cualquier canto activo o null) y los errores de spec §8.2 y §8.3.
//
// Necesita un material de fondo: si la configuracion del catalogo no tiene, usa una placa de 3 mm y al final deja
// la configuracion como estaba. Crea un modulo de prueba (PRUEBA_E2E_F42, con material fijo y fondo propio) y un
// canto inactivo (PRUEBA_E2E_F42 canto inactivo), y los borra al terminar. No guarda pedidos. No imprime datos de
// clientes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

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
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
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
const line = (moduloId, extra = {}) => ({ moduloId, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1, ...extra });

// Cantos activos en el orden en que el backend elige el de por defecto (nombre y despues id), y nombres de placas.
const cantosActivos = psql(`select id, coalesce("placaMaterialId", ''), "espesorMm" from materiales where tipo = 'CANTO' and activo order by nombre, id`)
  .split("\n")
  .filter(Boolean)
  .map((row) => {
    const [id, placa, espesorMm] = row.split("|");
    return { id, placa, espesorMm: Number(espesorMm) };
  });
const placaDeCanto = new Map(cantosActivos.map((canto) => [canto.id, canto.placa]));
/** El canto de por defecto de un lado: el primero activo de esa placa y de ese espesor, o null si no hay. */
const cantoDe = (placaId, espesorMm) => cantosActivos.find((canto) => canto.placa === placaId && Math.abs(canto.espesorMm - espesorMm) < 1e-6)?.id ?? null;
const nombrePlaca = new Map(
  psql(`select id, nombre from materiales where tipo = 'PLACA'`)
    .split("\n")
    .map((row) => [row.slice(0, row.indexOf("|")), row.slice(row.indexOf("|") + 1).trim()])
);
const LADOS = ["LARGO_1", "LARGO_2", "ANCHO_1", "ANCHO_2"];
const CAMPO = { LARGO_1: "cantoLargo1Id", LARGO_2: "cantoLargo2Id", ANCHO_1: "cantoAncho1Id", ANCHO_2: "cantoAncho2Id" };
const definiciones = new Map();
const definicion = async (moduloId) => {
  if (!definiciones.has(moduloId)) definiciones.set(moduloId, (await call("GET", `/modulos/${moduloId}`)).data);
  return definiciones.get(moduloId);
};

/**
 * Los cantos de cada fila contra lo que pide DECISIONES 45: cada lado elegido a mano lleva lo elegido (un canto o
 * null); si no, el canto de la placa de la pieza con el espesor del perfil, o null y avisado en cantosSinElegir.
 * La fila es EDITADO solo si algun lado elegido a mano difiere del de por defecto.
 */
async function edgeProblems(result, pedidos) {
  const problems = [];
  for (const [index, pedido] of pedidos.entries()) {
    const def = await definicion(pedido.moduloId);
    const overrides = pedido.cantosOverride ?? {};
    const sinCanto = [];
    for (const row of result.detalles.filter((item) => item.posicionModulo === index + 1)) {
      const pieza = def.piezas.find((item) => item.codigo === row.piezaCodigo);
      if (!pieza) {
        problems.push(`M${index + 1} ${row.piezaCodigo}: pieza desconocida`);
        continue;
      }
      const override = overrides[row.piezaCodigo] ?? {};
      let editado = false;
      for (const lado of LADOS) {
        const espesor = pieza.cantos.find((canto) => canto.perfilOrden === pedido.perfilCantoOrden && canto.lado === lado)?.espesorMm ?? null;
        const porDefecto = espesor === null ? null : cantoDe(row.materialId, espesor);
        let esperado = porDefecto;
        if (lado in override) {
          esperado = override[lado];
          if (esperado !== porDefecto) editado = true;
        } else if (espesor !== null && !porDefecto) {
          sinCanto.push([row.piezaCodigo, pieza.nombre, lado, espesor, nombrePlaca.get(row.materialId)]);
        }
        if (row[CAMPO[lado]] !== esperado) problems.push(`M${index + 1} ${row.piezaCodigo} ${lado}`);
      }
      if (row.origen !== (editado ? "EDITADO" : "CALCULADO")) problems.push(`M${index + 1} ${row.piezaCodigo} origen ${row.origen}`);
    }
    const avisados = result.modulos[index]?.cantosSinElegir?.map((item) => [item.piezaCodigo, item.pieza, item.lado, item.espesorMm, item.placa?.trim()]);
    if (JSON.stringify(avisados) !== JSON.stringify(sinCanto)) problems.push(`M${index + 1} cantosSinElegir (${avisados?.length ?? "falta"} != ${sinCanto.length})`);
  }
  return problems;
}
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
  const malCantosCatalogo = [];
  let ladosConCanto = 0;
  let ladosAvisados = 0;
  for (const module of modules) {
    for (const perfilCantoOrden of [1, 2]) {
      const before = failures;
      const pedidos = [line(module.id, { perfilCantoOrden })];
      const result = await parity(`${module.codigo}, perfil ${perfilCantoOrden}`, pedidos, { allowNoFit: true });
      if (result?.noEntra) {
        noEntran.add(module.codigo);
        continue;
      }
      total++;
      if (failures === before) iguales++;
      if (result) {
        malCantosCatalogo.push(...(await edgeProblems(result, pedidos)).map((problem) => `${module.codigo} p${perfilCantoOrden} ${problem}`));
        ladosConCanto += result.detalles.flatMap((row) => LADOS.map((lado) => row[CAMPO[lado]])).filter(Boolean).length;
        ladosAvisados += result.modulos[0]?.cantosSinElegir?.length ?? 0;
      }
    }
  }
  check(`paridad en los ${modules.length - noEntran.size} modulos que se pueden pedir con sus valores por defecto, con los dos perfiles`, iguales === total && total > 0, `${iguales}/${total}`);
  check(
    "cada lado de cada pieza del catalogo con el canto de su placa y del espesor del perfil, o sin canto y avisado (DECISIONES 45)",
    malCantosCatalogo.length === 0 && ladosConCanto > 0,
    malCantosCatalogo.slice(0, 4).join(", ") || `${ladosConCanto} lados con canto, ${ladosAvisados} sin canto de su color`
  );
  // Piezas que no entran con los valores por defecto: es la validacion de spec §8.3 funcionando. Son datos del
  // catalogo que ROMA tiene que revisar (punto 7 de la planilla de revision).
  console.log(`    no entran con los valores por defecto (para revisar con ROMA): ${[...noEntran].join(", ") || "ninguno"}`);

  // ---------------------------------------------------------------- una solicitud de varios modulos
  const byCode = new Map(modules.map((module) => [module.codigo, module]));
  const pick = (code) => byCode.get(code) ?? modules[0];
  const bajo = pick("BAJO_MESADA_2_PUERTAS");
  const full = (await call("GET", `/modulos/${bajo.id}`)).data;
  const piso = full.piezas[0];
  // Otra pieza de esqueleto con canto en el perfil 1, para elegirle a mano el mismo canto que el de por defecto.
  const otraEsqueleto = full.piezas.find((pieza) => pieza !== piso && pieza.rol === "ESQUELETO" && pieza.cantos.some((canto) => canto.perfilOrden === 1));
  const frente = full.piezas.find((pieza) => pieza.rol === "FRENTE" && pieza.cantos.some((canto) => canto.perfilOrden === 1 && canto.lado === "ANCHO_2"));
  const espesorDe = (pieza, lado, perfil = 1) => pieza?.cantos.find((canto) => canto.perfilOrden === perfil && canto.lado === lado)?.espesorMm ?? null;
  // Cambios a mano (DECISIONES 45): en el piso, un canto de otro color y de otro espesor en Largo 1, uno en un lado que
  // el perfil deja sin canto (Largo 2) y null donde ya no habia canto (Ancho 1, no es un cambio); en otra pieza de
  // esqueleto, el mismo canto que el de por defecto (no es un cambio); en el frente, sin canto en Ancho 2.
  const cambios = {
    [piso.codigo]: { LARGO_1: cantoDe(colorC, 2), LARGO_2: cantoDe(colorB, 0.45), ANCHO_1: null },
    ...(otraEsqueleto ? { [otraEsqueleto.codigo]: { LARGO_1: cantoDe(colorA, espesorDe(otraEsqueleto, "LARGO_1")) } } : {}),
    ...(frente ? { [frente.codigo]: { ANCHO_2: null } } : {})
  };
  const varios = [
    line(bajo.id),
    line(bajo.id, { valores: { ANCHO: 900 }, colorFrentesId: colorC, perfilCantoOrden: 2 }),
    line(bajo.id, { valores: { ancho: 600 }, cantosOverride: cambios }),
    // El primero de estos, con el fondo elegido en la solicitud (DECISIONES 32).
    ...modules.filter((module) => conFondo.has(module.id)).slice(0, 3).map((module, index) => line(module.id, { colorEsqueletoId: colorB, ...(index === 0 ? { materialFondoId: placaFina } : {}) })),
    ...modules.filter((module) => !conFondo.has(module.id)).slice(0, 2).map((module) => line(module.id, { colorEsqueletoId: colorC }))
  ];
  const result = await parity(`solicitud de ${varios.length} modulos con colores, medidas, cantos de otro color o sin canto y un fondo cambiados`, varios);

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
    const esperadasEditadas = [piso.codigo, ...(frente ? [frente.codigo] : [])].sort();
    const otra = otraEsqueleto && filas.find((row) => row.posicionModulo === 3 && row.piezaCodigo === otraEsqueleto.codigo);
    check(
      "cantos cambiados a mano: origen EDITADO solo en las piezas con un lado distinto del de por defecto",
      editadas.every((row) => row.posicionModulo === 3) &&
        JSON.stringify(editadas.map((row) => row.piezaCodigo).sort()) === JSON.stringify(esperadasEditadas) &&
        (!otraEsqueleto || otra?.origen === "CALCULADO"),
      editadas.map((row) => `M${row.posicionModulo} ${row.piezaCodigo}`).join(", ")
    );
    const editada = filas.find((row) => row.posicionModulo === 3 && row.piezaCodigo === piso.codigo);
    check(
      "los cantos elegidos a mano son los pedidos: de otro color, en un lado que el perfil deja sin canto, y null",
      editada?.cantoLargo1Id === cambios[piso.codigo].LARGO_1 &&
        placaDeCanto.get(editada.cantoLargo1Id) === colorC &&
        editada.materialId !== colorC &&
        editada.cantoLargo2Id === cambios[piso.codigo].LARGO_2 &&
        editada.cantoAncho1Id === null &&
        editada.cantoLargo1 === true &&
        editada.cantoAncho1 === false &&
        (!frente || filas.find((row) => row.posicionModulo === 3 && row.piezaCodigo === frente.codigo)?.cantoAncho2Id === null),
      `${editada?.cantoLargo1Nombre} / ${editada?.cantoLargo2Nombre}`
    );
    check("valores guardados: lo cargado y los defectos", result.modulos[1].valores.ANCHO === 900 && result.modulos[2].valores.ANCHO === 600 && Object.keys(result.modulos[0].valores).length >= 3);
    check(
      "los modulos no traen color de cantos (DECISIONES 45)",
      result.modulos.every((modulo) => !("colorCantoId" in modulo) && !("colorCanto" in modulo) && Array.isArray(modulo.cantosSinElegir))
    );
    // Cada fila en el material que le toca segun el rol de su pieza en el catalogo, y cada lado con el canto que le toca.
    const malMaterial = [];
    for (const row of filas) {
      const pedido = varios[row.posicionModulo - 1];
      const def = await definicion(pedido.moduloId);
      const pieza = def.piezas.find((item) => item.codigo === row.piezaCodigo);
      const esperado = { ESQUELETO: pedido.colorEsqueletoId, FRENTE: pedido.colorFrentesId, FONDO: pedido.materialFondoId ?? def.materialFondoId ?? fondoConfig, FIJO: pieza.materialFijoId }[pieza.rol];
      if (row.materialId !== esperado) malMaterial.push(`M${row.posicionModulo} ${row.piezaCodigo} (${pieza.rol})`);
    }
    const malCanto = await edgeProblems(result, varios);
    check("cada fila en el material de su rol (esqueleto, frentes, fondo, incluido el fondo elegido)", malMaterial.length === 0, malMaterial.slice(0, 4).join(", ") || `${filas.length} filas`);
    const fondoEsperado = (pedido) => {
      const def = definiciones.get(pedido.moduloId);
      const tieneFondo = filas.some((row) => varios[row.posicionModulo - 1] === pedido && def.piezas.find((item) => item.codigo === row.piezaCodigo)?.rol === "FONDO");
      return tieneFondo ? pedido.materialFondoId ?? def.materialFondoId ?? fondoConfig : null;
    };
    check(
      "cada modulo informa el fondo que usa (el elegido, el de la configuracion o ninguno)",
      result.modulos.every((modulo, index) => modulo.materialFondoId === fondoEsperado(varios[index])) && result.modulos.some((modulo) => modulo.materialFondoId === placaFina),
      result.modulos.map((modulo) => (modulo.materialFondoId === placaFina ? "elegido" : modulo.materialFondoId ? "config" : "-")).join(" ")
    );
    check(
      "cada lado con el canto elegido a mano o con el de la placa de su pieza y del espesor del perfil; los que no tienen, sin canto y en cantosSinElegir",
      malCanto.length === 0,
      malCanto.slice(0, 4).join(", ")
    );
    const idsDeCanto = filas.flatMap((row) => LADOS.map((lado) => row[CAMPO[lado]])).filter(Boolean);
    check(
      "la prueba distingue esqueleto de frentes, usa cantos de varios colores y uno de otro color que su placa",
      varios.filter((item) => item.colorEsqueletoId !== item.colorFrentesId).length >= 3 &&
        new Set(idsDeCanto.map((id) => placaDeCanto.get(id))).size >= 3 &&
        filas.some((row) => LADOS.some((lado) => row[CAMPO[lado]] && placaDeCanto.get(row[CAMPO[lado]]) !== row.materialId))
    );
  }

  // ---------------------------------------------------------------- un color sin canto de 2 mm (DECISIONES 45)
  // Antes era el error MISSING_EDGE_MATERIAL; ahora esos lados van sin canto, se avisan y la solicitud se puede calcular.
  // En el segundo modulo se elige a mano un canto (de otro color) para Largo 1 y null para Ancho 1 del frente: esos
  // lados ya no se avisan.
  const frente2 = full.piezas.find((pieza) => pieza.rol === "FRENTE" && LADOS.every((lado) => espesorDe(pieza, lado) === 2));
  const sinCantoLineas = [
    line(bajo.id, { colorFrentesId: sinCanto2[0] }),
    line(bajo.id, { colorFrentesId: sinCanto2[0], cantosOverride: frente2 ? { [frente2.codigo]: { LARGO_1: cantoDe(colorA, 2), ANCHO_1: null } } : {} }),
    ...(sinCanto2[1] ? [line(bajo.id, { colorFrentesId: sinCanto2[1] })] : [])
  ];
  const sinCantoResult = await parity("color sin canto de 2 mm: 200 y paridad con esos lados sin canto", sinCantoLineas);
  if (sinCantoResult) {
    check("color sin canto de 2 mm: cada lado como corresponde y avisado", (await edgeProblems(sinCantoResult, sinCantoLineas)).length === 0);
    const avisos = (posicion) => sinCantoResult.modulos[posicion - 1].cantosSinElegir.filter((item) => item.piezaCodigo === frente2?.codigo);
    const frenteDe = (posicion) => sinCantoResult.detalles.find((row) => row.posicionModulo === posicion && row.piezaCodigo === frente2?.codigo);
    check(
      "los cuatro lados del frente sin canto, avisados con 2 mm y la placa; los elegidos a mano no se avisan",
      Boolean(frente2) &&
        LADOS.every((lado) => frenteDe(1)?.[CAMPO[lado]] === null) &&
        JSON.stringify(avisos(1).map((item) => item.lado)) === JSON.stringify(LADOS) &&
        avisos(1).every((item) => item.espesorMm === 2 && item.placa?.trim() === nombrePlaca.get(sinCanto2[0]) && item.pieza === frente2.nombre) &&
        frenteDe(2)?.cantoLargo1Id === cantoDe(colorA, 2) &&
        frenteDe(2)?.origen === "EDITADO" &&
        JSON.stringify(avisos(2).map((item) => item.lado)) === JSON.stringify(["LARGO_2", "ANCHO_2"]) &&
        (!sinCanto2[1] || avisos(3).every((item) => item.placa?.trim() === nombrePlaca.get(sinCanto2[1]))),
      `avisos por modulo: ${sinCantoResult.modulos.map((modulo) => modulo.cantosSinElegir.length).join(" ")}`
    );
    check(
      "los lados sin canto de su color son solo los del frente (el esqueleto tiene canto de su color)",
      sinCantoResult.modulos.every((modulo) => modulo.cantosSinElegir.every((item) => item.piezaCodigo === frente2?.codigo))
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
  await code(
    "cambio de canto de una pieza que no existe",
    [line(bajo.id, { cantosOverride: { NO_EXISTE: { LARGO_1: null } } })],
    "MODULE_FORMULA_ERRORS",
    (data) => (data.details?.errores ?? []).some((error) => /No existe la pieza NO_EXISTE para cambiarle los cantos/.test(error))
  );
  await code("esqueleto de otro espesor (spec §8.6)", [line(bajo.id, { colorEsqueletoId: placaFina })], "MODULE_MATERIAL_INVALID", (data) => /pensado para placas de 18 mm/.test(data.message));
  // Un canto elegido a mano que no es un canto activo: una placa, un id que no existe y un canto inactivo.
  const noEsCanto = (rotulo) => `Módulo 1 (${full.nombre}): el canto elegido para "${piso.nombre}" (${rotulo}) no es un canto activo del sistema.`;
  await code("canto elegido a mano que es una placa", [line(bajo.id, { cantosOverride: { [piso.codigo]: { LARGO_1: colorA } } })], "MODULE_MATERIAL_INVALID", (data) =>
    data.details.errores.includes(noEsCanto("Largo 1"))
  );
  await code("canto elegido a mano que no existe", [line(bajo.id, { cantosOverride: { [piso.codigo]: { ANCHO_2: randomUUID() } } })], "MODULE_MATERIAL_INVALID", (data) =>
    data.details.errores.includes(noEsCanto("Ancho 2"))
  );
  const cantoInactivo = randomUUID();
  psql(`delete from materiales where nombre = 'PRUEBA_E2E_F42 canto inactivo'`);
  psql(
    `insert into materiales (id, nombre, tipo, valor, "espesorMm", activo, "placaMaterialId", "fechaActualizacion") values ('${cantoInactivo}', 'PRUEBA_E2E_F42 canto inactivo', 'CANTO', 0, 0.45, false, '${colorA}', now())`
  );
  await code("canto elegido a mano que esta inactivo", [line(bajo.id, { cantosOverride: { [piso.codigo]: { LARGO_1: cantoInactivo } } })], "MODULE_MATERIAL_INVALID", (data) =>
    data.details.errores.includes(noEsCanto("Largo 1"))
  );
  psql(`delete from materiales where id = '${cantoInactivo}'`);
  const viejo = await preview([line(bajo.id, { cantosOverride: { [piso.codigo]: { LARGO_1: 2, LARGO_2: null, ANCHO_1: null, ANCHO_2: null } } })]);
  check(
    "cambio de cantos con el formato viejo (espesor en mm): 400",
    viejo.status === 400 && (viejo.data?.errors ?? []).some((issue) => issue.message === "Cada lado lleva el canto elegido o null (sin canto)"),
    `${viejo.status}`
  );
  const ladoMal = await preview([line(bajo.id, { cantosOverride: { [piso.codigo]: { LARGO1: null } } })]);
  check(
    "lado de canto mal escrito: 400",
    ladoMal.status === 400 && JSON.stringify(ladoMal.data).includes("Los lados de una pieza son LARGO_1, LARGO_2, ANCHO_1 y ANCHO_2"),
    `${ladoMal.status}`
  );
  const conColorCanto = await preview([line(bajo.id, { colorCantoId: colorA })]);
  check("el color de cantos por modulo ya no existe: 400 (DECISIONES 45)", conColorCanto.status === 400 && JSON.stringify(conColorCanto.data).includes("no se reconocen"), `${conColorCanto.status}`);
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
      const conFijoLineas = [line(temporal.data.id)];
      const conFijo = await parity("paridad con material fijo y fondo propio", conFijoLineas);
      const material = (codigo) => conFijo?.detalles.find((row) => row.piezaCodigo === codigo)?.materialId;
      check("material fijo y fondo propio del modulo, antes que el de la configuracion", material("ZOCALO") === colorC && material("FONDO") === placaFina && material("LATERAL") === colorA);
      check(
        "con material fijo y fondo propio, cada lado con el canto de la placa de su pieza",
        Boolean(conFijo) && (await edgeProblems(conFijo, conFijoLineas)).length === 0 && conFijo.detalles.find((row) => row.piezaCodigo === "LATERAL")?.cantoLargo1Id === cantoDe(colorA, 0.45)
      );
    } finally {
      check("modulo de prueba borrado", (await call("DELETE", `/modulos/${temporal.data.id}`)).status === 204);
    }
  }

  const sinPerfil = await preview([{ moduloId: bajo.id, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB }]);
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
  psql(`delete from materiales where nombre = 'PRUEBA_E2E_F42 canto inactivo'`);
  check("canto inactivo de prueba borrado", psql(`select count(*) from materiales where nombre = 'PRUEBA_E2E_F42 canto inactivo'`) === "0");
  psql(`update configuracion_modulos set "materialFondoId" = ${fondoAntes === "null" ? "null" : `'${fondoAntes}'`} where id = 'default'`);
  check("configuracion del catalogo como estaba", psql(`select coalesce("materialFondoId", 'null') from configuracion_modulos where id = 'default'`) === fondoAntes);
}

console.log(failures ? `\n${failures} con problemas` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
