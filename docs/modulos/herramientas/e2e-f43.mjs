// Prueba de F4.3: alta, detalle y listado de solicitudes de modulos, contra el backend local (puerto 4100) y la copia
// del backup con el catalogo importado.
// - El alta guarda exactamente lo que mostro la vista previa: placas, cada componente del presupuesto, las filas
//   (solo cambia el codigo de barra, que pasa a tener el numero) y los modulos con su copia de la definicion.
// - Cantos por pieza (DECISIONES 45): cada lado lleva por defecto el canto del color de la placa de su pieza y del
//   espesor del perfil; si esa placa no tiene uno, va sin canto, se avisa (cantosSinElegir) y no es un error. Los
//   cambios a mano (cualquier canto activo, o ninguno) se guardan lado por lado y solo marcan EDITADO las piezas que
//   quedan distintas de lo de por defecto. Las filas cargadas como corte dan las mismas placas y el mismo presupuesto.
// - Los m² por material son la suma exacta de las piezas (R3).
// - El stock se reserva y se devuelve exacto al cambiar el estado, como en corte, y una carrera entre borrar y
//   cambiar el estado no pierde ni duplica placas.
// - Listado: cada busqueda y filtro trae lo que corresponde y excluye lo demas; orden por entrega, entregadas al final.
// - Errores: datos, cantos (el color unico viejo, el formato viejo, un canto que no es canto, una pieza que no existe),
//   version del modulo cambiada (409) y permisos.
//
// Cambia la copia por un rato y la deja como estaba: carga una placa de 3 mm como fondo si la configuracion no
// tiene, pone 500 placas de stock en los materiales que usa y borra las solicitudes que crea (todas con cliente
// "Prueba F4.3 ..."). Si encuentra restos de una corrida anterior que se corto, no toca nada y avisa.
// No imprime datos de clientes.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = fileURLToPath(new URL("../../../backend/", import.meta.url));
const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const BASE = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F4.3";
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
// jsonb reordena las claves: los objetos se comparan con las claves ordenadas.
const canonical = (value) =>
  Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Restos de una corrida anterior que se corto: no se toca nada.
const restos = psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`);
if (restos !== "0") {
  console.log(`MAL hay ${restos} solicitudes "${PREFIJO}..." de una corrida anterior que se corto. Borralas (DELETE /api/orders/:id, que devuelve el stock),`);
  console.log('    revisa el stock de los colores y que configuracion_modulos."materialFondoId" tenga lo de antes (en la copia original, null).');
  process.exit(1);
}

// Fechas en la zona del negocio (spec §9.1).
const ymd = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const hoy = ymd(new Date());
const enDias = (dias) => ymd(new Date(Date.now() + dias * 86400000));

// ---------------------------------------------------------------- datos de la copia
const colores = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 0.45) < 1e-6)
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 2) < 1e-6)
  order by p.nombre limit 2`).split("\n");
// Una placa de 18 mm sin canto de 2 mm de su color, para los frentes del modulo 5: sus puertas van sin canto, se avisa y
// no es un error (DECISIONES 45). La mas grande, para que las piezas entren.
const colorSinCanto2 = psql(`
  select p.id from materiales p
  where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null and p."altoPlaca" is not null
    and not exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo and abs(c."espesorMm" - 2) < 1e-6)
  order by p."anchoPlaca" * p."altoPlaca" desc, p.nombre, p.id limit 1`);
// Todos los cantos activos, en el orden del backend (nombre e id): si hubiera dos de la misma placa y espesor, el de
// por defecto es el primero.
const cantosActivos = psql(`select id, coalesce("placaMaterialId", ''), "espesorMm" from materiales where tipo = 'CANTO' and activo order by nombre, id`)
  .split("\n")
  .map((row) => row.split("|"))
  .map(([id, placa, espesor]) => ({ id, placa, espesorMm: Number(espesor) }));
const cantoPorDefecto = (placaId, espesorMm) => cantosActivos.find((canto) => canto.placa === placaId && Math.abs(canto.espesorMm - espesorMm) < 1e-6)?.id ?? null;
const nombrePlaca = new Map(psql(`select id, nombre from materiales where tipo = 'PLACA'`).split("\n").map((row) => row.split("|")).map(([id, ...nombre]) => [id, nombre.join("|").trim()]));
const fondo =psql(`select id from materiales where tipo = 'PLACA' and activo and "espesorMm" = 3 and "anchoPlaca" is not null limit 1`);
// Un fondo elegido en la solicitud, distinto del de la configuracion (DECISIONES 32).
const fondoElegido = psql(`select id from materiales where tipo = 'PLACA' and activo and "espesorMm" = 5.5 and "anchoPlaca" is not null order by nombre limit 1`);
const fondoAntes = psql(`select coalesce("materialFondoId", 'null') from configuracion_modulos where id = 'default'`);
const fondoConfig = fondoAntes === "null" ? fondo : fondoAntes;
const pedidosAntes = psql("select count(*) from pedidos");
const modulosPedidosAntes = psql("select count(*) from pedidos_modulo");
const usados = [...new Set([...colores, colorSinCanto2, fondoConfig, fondoElegido])];
const lista = (ids) => ids.map((id) => `'${id}'`).join(",");
const stockAntes = new Map(psql(`select id, coalesce("stockPlacas"::text, 'null') from materiales where id in (${lista(usados)})`).split("\n").map((row) => row.split("|")));
check(
  "datos de prueba",
  colores.length === 2 &&
    Boolean(colorSinCanto2) &&
    !colores.includes(colorSinCanto2) &&
    Boolean(fondoConfig) &&
    Boolean(fondoElegido) &&
    fondoElegido !== fondoConfig &&
    stockAntes.size === usados.length
);

const codigos = ["BAJO_MESADA_2_PUERTAS", "ALACENA_2_PUERTAS", "PLACARD_3_PUERTAS_DE_EMBUTIR"];
const modulos = new Map(psql(`select codigo, id from modulos where codigo in (${codigos.map((c) => `'${c}'`).join(",")})`).split("\n").map((row) => row.split("|")));
const [colorA, colorB] = colores;
const bajo = modulos.get("BAJO_MESADA_2_PUERTAS");
const placard = modulos.get("PLACARD_3_PUERTAS_DE_EMBUTIR");
const alacena = modulos.get("ALACENA_2_PUERTAS");
const definiciones = new Map();
for (const id of [bajo, alacena, placard]) definiciones.set(id, (await call("GET", `/modulos/${id}`)).data);
const LADOS = ["LARGO_1", "LARGO_2", "ANCHO_1", "ANCHO_2"];
const CAMPO = { LARGO_1: "cantoLargo1", LARGO_2: "cantoLargo2", ANCHO_1: "cantoAncho1", ANCHO_2: "cantoAncho2" };
const espesorDelPerfil = (pieza, perfil, lado) => (pieza?.cantos ?? []).find((canto) => canto.perfilOrden === perfil && canto.lado === lado)?.espesorMm ?? null;
// Del bajo mesada, con el perfil 1: una pieza de esqueleto con canto solo en Largo 1 y un frente con canto en los 4 lados.
const piezasBajo = definiciones.get(bajo).piezas;
const piso = piezasBajo.find((pieza) => pieza.rol === "ESQUELETO" && LADOS.map((lado) => espesorDelPerfil(pieza, 1, lado) !== null).join() === "true,false,false,false");
const puertas = piezasBajo.find((pieza) => pieza.rol === "FRENTE" && LADOS.every((lado) => espesorDelPerfil(pieza, 1, lado) !== null));
// Cambios a mano del modulo 4 (frentes colorB, esqueleto colorA):
// - en las puertas, Largo 1 con el canto de OTRO color (el de colorA) y Ancho 2 sin canto: la pieza queda EDITADO;
// - en el piso, Largo 1 con el mismo canto que lleva por defecto y Largo 2 sin canto, como ya estaba: sigue CALCULADO.
const cantoPuertas = cantoPorDefecto(colorB, espesorDelPerfil(puertas, 1, "LARGO_1"));
const cantoOtroColor = cantoPorDefecto(colorA, espesorDelPerfil(puertas, 1, "LARGO_1"));
const cantoPiso = cantoPorDefecto(colorA, espesorDelPerfil(piso, 1, "LARGO_1"));
const lines = [
  { moduloId: bajo, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1, observaciones: "Va contra la pared", materialFondoId: fondoElegido },
  { moduloId: alacena, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 2 },
  { moduloId: placard, valores: {}, colorEsqueletoId: colorB, colorFrentesId: colorA, perfilCantoOrden: 1 },
  {
    moduloId: bajo,
    valores: { ANCHO: 900 },
    colorEsqueletoId: colorA,
    colorFrentesId: colorB,
    perfilCantoOrden: 1,
    cantosOverride: { [puertas?.codigo]: { LARGO_1: cantoOtroColor, ANCHO_2: null }, [piso?.codigo]: { LARGO_1: cantoPiso, LARGO_2: null } }
  },
  // Frentes de una placa sin canto de 2 mm de su color: las puertas van sin canto y se avisa.
  { moduloId: alacena, valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorSinCanto2, perfilCantoOrden: 1 }
];
check(
  "piezas y cantos para los cambios a mano",
  Boolean(piso && puertas && cantoPuertas && cantoOtroColor && cantoPiso) && cantoOtroColor !== cantoPuertas && definiciones.get(alacena).piezas.some((pieza) => pieza.rol === "FRENTE")
);
// Sin esas piezas o esos cantos el resto no prueba lo que dice: se corta antes de tocar la copia.
if (failures) process.exit(1);
const placardLine = lines[2];

// Lo que tiene que llevar cada lado de una fila de la vista previa, calculado aca por separado (DECISIONES 45): el
// elegido a mano si se toco; si no, el canto de la placa de la pieza con el espesor del perfil, o ninguno (y se avisa).
const esperadoDe = (row) => {
  const line = lines[row.posicionModulo - 1];
  const pieza = definiciones.get(line.moduloId).piezas.find((item) => item.codigo === row.piezaCodigo);
  const override = line.cantosOverride?.[row.piezaCodigo] ?? {};
  let editado = false;
  const sinCanto = [];
  const cantos = Object.fromEntries(
    LADOS.map((lado) => {
      const espesor = espesorDelPerfil(pieza, line.perfilCantoOrden, lado);
      const porDefecto = espesor === null ? null : cantoPorDefecto(row.materialId, espesor);
      if (lado in override) {
        if (override[lado] !== porDefecto) editado = true;
        return [lado, override[lado]];
      }
      if (espesor !== null && !porDefecto) sinCanto.push({ piezaCodigo: pieza.codigo, pieza: pieza.nombre, lado, espesorMm: espesor, placa: nombrePlaca.get(row.materialId) });
      return [lado, porDefecto];
    })
  );
  return { cantos, origen: editado ? "EDITADO" : "CALCULADO", sinCanto };
};
const ladosDe = (row) => LADOS.map((lado) => row[`${CAMPO[lado]}Id`] ?? null);
const datos = (extra = {}) => ({
  cliente: `${PREFIJO} alfa`,
  numeroContacto: "000000",
  emailContacto: "prueba@ejemplo.com",
  direccionEntrega: "Calle de prueba 123",
  fechaEntrega: enDias(15),
  observaciones: "Cocina de prueba",
  ...extra
});

const COMPONENTS = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado", "faltanteStock", "costoHerrajes", "presupuestoConHerrajes"];
const ROW_FIELDS = [
  "materialId", "material", "largo", "ancho", "cantidad", "cantoLargo1Id", "cantoLargo1Nombre", "cantoLargo1", "cantoLargo2Id", "cantoLargo2Nombre", "cantoLargo2",
  "cantoAncho1Id", "cantoAncho1Nombre", "cantoAncho1", "cantoAncho2Id", "cantoAncho2Nombre", "cantoAncho2", "permiteRotar", "codigoBarraCentro", "remark",
  "numeroCliente", "nombreCliente", "nombreProducto", "indice", "piezaCodigo", "origen", "orden"
];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
const MODULE_FIELDS = ["posicion", "moduloId", "nombreModulo", "valores", "colorEsqueletoId", "colorFrentesId", "perfilCantoOrden", "materialFondoId", "observaciones"];

const creados = [];
const crear = async (body) => {
  const response = await call("POST", "/pedidos-modulos", body);
  if (response.status === 201) creados.push(response.data.id);
  return response;
};
const stockDe = (ids) => new Map(psql(`select id, "stockPlacas" from materiales where id in (${lista(ids)})`).split("\n").map((row) => row.split("|")).map(([id, stock]) => [id, Number(stock)]));

try {
  if (fondoAntes === "null") psql(`update configuracion_modulos set "materialFondoId" = '${fondo}' where id = 'default'`);
  psql(`update materiales set "stockPlacas" = 500 where id in (${lista(usados)})`);

  // ---------------------------------------------------------------- vista previa y alta
  const preview = await call("POST", "/pedidos-modulos/preview", { ...datos(), modulos: lines });
  check("vista previa", preview.status === 200, `${preview.status} ${preview.data?.message ?? ""}`);
  const versiones = preview.data.modulos.map((modulo) => modulo.version);
  const conVersion = lines.map((line, index) => ({ ...line, version: versiones[index] }));

  const created = await crear({ ...datos(), modulos: conVersion });
  check("alta", created.status === 201, `${created.status} ${created.data?.message ?? ""}`);
  const order = created.data;

  const diferencias = COMPONENTS.filter((key) => order[key] !== preview.data[key]);
  check("el alta guarda las mismas placas y cada componente que la vista previa", diferencias.length === 0, diferencias.join(", ") || `${order.placasEstimadas} placas, $${order.presupuestoEstimado}`);
  check("y el mismo detalle del calculo", same(order.estimacionDetalle, preview.data.estimacionDetalle));
  check(
    "las mismas filas, en el mismo orden",
    order.detalles.length === preview.data.detalles.length && order.detalles.every((row, index) => same(pick(row, ROW_FIELDS), pick(preview.data.detalles[index], ROW_FIELDS))),
    `${order.detalles.length} filas`
  );
  check(
    "codigo de barra con el numero del pedido",
    Number.isInteger(order.numero) && order.detalles.every((row, index) => row.codigoBarra === preview.data.detalles[index].codigoBarra.replace("M---", `M${order.numero}`)),
    order.detalles[0].codigoBarra
  );
  const moduloDe = new Map(order.modulos.map((modulo) => [modulo.id, modulo.posicion]));
  check("cada fila con el pedidoModuloId de su modulo", order.detalles.every((row, index) => moduloDe.get(row.pedidoModuloId) === preview.data.detalles[index].posicionModulo));

  // ---------------------------------------------------------------- cantos por pieza (DECISIONES 45)
  const esperados = preview.data.detalles.map(esperadoDe);
  const malCantos = preview.data.detalles
    .map((row, index) => ({ row, esperado: esperados[index], index }))
    .filter(
      ({ row, esperado }) =>
        !same(ladosDe(row), LADOS.map((lado) => esperado.cantos[lado])) ||
        LADOS.some((lado) => row[CAMPO[lado]] !== (esperado.cantos[lado] !== null)) ||
        row.origen !== esperado.origen
    );
  check(
    "vista previa: cada lado lleva el canto de la placa de su pieza y del espesor del perfil, o el elegido a mano",
    preview.data.detalles.length > 0 && malCantos.length === 0,
    malCantos.length ? malCantos.slice(0, 3).map(({ row, index }) => `fila ${index} módulo ${row.posicionModulo} ${row.piezaCodigo}`).join("; ") : `${preview.data.detalles.length} filas`
  );
  const sinCantoEsperado = lines.map((_, index) => esperados.filter((_e, fila) => preview.data.detalles[fila].posicionModulo === index + 1).flatMap((item) => item.sinCanto));
  check(
    "lados sin canto de su color: van sin canto, se avisan por módulo (cantosSinElegir) y no son un error",
    preview.data.modulos.every((modulo, index) => same(modulo.cantosSinElegir, sinCantoEsperado[index])) &&
      sinCantoEsperado.slice(0, 4).every((lista) => lista.length === 0) &&
      sinCantoEsperado[4].length > 0 &&
      sinCantoEsperado[4].every((item) => item.espesorMm === 2 && item.placa === nombrePlaca.get(colorSinCanto2)),
    preview.data.modulos.map((modulo) => modulo.cantosSinElegir?.length ?? "falta").join(" ")
  );
  const filaDe = (posicion, codigo) => order.detalles.find((row) => row.pedidoModuloId === order.modulos[posicion - 1]?.id && row.piezaCodigo === codigo);
  const puertasEditadas = filaDe(4, puertas.codigo);
  const pisoSinCambio = filaDe(4, piso.codigo);
  check(
    "guardado: las puertas del módulo 4 con el canto de otro color en Largo 1, sin canto en Ancho 2 y el resto por defecto",
    Boolean(puertasEditadas) &&
      same(ladosDe(puertasEditadas), [cantoOtroColor, cantoPuertas, cantoPuertas, null]) &&
      puertasEditadas.cantoLargo1 === true &&
      puertasEditadas.cantoAncho2 === false &&
      puertasEditadas.origen === "EDITADO"
  );
  check(
    "guardado: elegir a mano lo mismo que lleva por defecto no es un cambio (el piso sigue CALCULADO)",
    Boolean(pisoSinCambio) && same(ladosDe(pisoSinCambio), [cantoPiso, null, null, null]) && pisoSinCambio.origen === "CALCULADO"
  );
  const enLaBase = new Map(
    psql(
      `select id, coalesce("cantoLargo1Id", '-'), coalesce("cantoLargo2Id", '-'), coalesce("cantoAncho1Id", '-'), coalesce("cantoAncho2Id", '-'), origen from detalle_pedidos where "pedidoId" = '${order.id}'`
    )
      .split("\n")
      .map((row) => [row.slice(0, row.indexOf("|")), row.slice(row.indexOf("|") + 1)])
  );
  check(
    "en la base: cada fila con los cantos de la vista previa lado por lado y su origen",
    enLaBase.size === order.detalles.length &&
      order.detalles.every((row, index) => enLaBase.get(row.id) === [...ladosDe(preview.data.detalles[index]).map((id) => id ?? "-"), preview.data.detalles[index].origen].join("|"))
  );
  const editadas = order.detalles.filter((row) => row.origen === "EDITADO");
  check(
    "EDITADO solo en las piezas con algún lado distinto del de por defecto",
    editadas.length === 1 && editadas[0] === puertasEditadas && order.detalles.every((row) => row.origen === "EDITADO" || row.origen === "CALCULADO"),
    `${editadas.length} editadas`
  );
  const sinCantoGuardadas = order.detalles.filter((row) => row.pedidoModuloId === order.modulos[4]?.id && row.materialId === colorSinCanto2);
  check(
    "guardado: los frentes sin canto de su color quedan sin canto y CALCULADO",
    sinCantoGuardadas.length > 0 && sinCantoGuardadas.every((row) => same(ladosDe(row), [null, null, null, null]) && row.origen === "CALCULADO"),
    `${sinCantoGuardadas.length} filas`
  );

  // Paridad (CLAUDE.md regla 1): las filas de la vista previa cargadas tal cual como corte dan las mismas placas y
  // cada componente del presupuesto, con los cantos de otro color y los lados sin canto incluidos.
  const comoCorteCalc = await call("POST", "/orders/preview", {
    cliente: `${PREFIJO} paridad`,
    numeroContacto: "000000",
    detalles: preview.data.detalles.map((row) => ({
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
    }))
  });
  const PARIDAD = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado", "faltanteStock"];
  const ordenado = (detail) => ({
    ...detail,
    porMaterial: [...detail.porMaterial].sort((x, y) => x.materialId.localeCompare(y.materialId)),
    porCanto: [...detail.porCanto].sort((x, y) => x.cantoId.localeCompare(y.cantoId))
  });
  const difCorte = comoCorteCalc.status === 200 ? PARIDAD.filter((key) => comoCorteCalc.data[key] !== preview.data[key]) : [`corte ${comoCorteCalc.status}`];
  if (comoCorteCalc.status === 200 && !same(ordenado(comoCorteCalc.data.estimacionDetalle), ordenado(preview.data.estimacionDetalle))) difCorte.push("estimacionDetalle");
  check(
    "paridad: las mismas filas como solicitud de corte dan las mismas placas y cada componente del presupuesto",
    difCorte.length === 0 && preview.data.costoCantos > 0,
    difCorte.join(", ") || `${preview.data.placasEstimadas} placas, ${preview.data.metrosCanto} m de canto`
  );

  // Modulos guardados: cada uno igual al de la vista previa y al pedido, con la copia de SU definicion (spec D2).
  check(
    "cada modulo guardado igual al de la vista previa",
    order.modulos.length === lines.length && order.modulos.every((modulo, index) => same(pick(modulo, MODULE_FIELDS), pick(preview.data.modulos[index], MODULE_FIELDS))),
    order.modulos.map((modulo) => modulo.nombreModulo).join(", ")
  );
  check(
    "colores y perfil de cada modulo como se pidieron",
    order.modulos.every(
      (modulo, index) =>
        modulo.moduloId === lines[index].moduloId &&
        modulo.colorEsqueleto.id === lines[index].colorEsqueletoId &&
        modulo.colorFrentes.id === lines[index].colorFrentesId &&
        modulo.perfilCantoOrden === lines[index].perfilCantoOrden
    )
  );
  // Ya no hay un color de canto por modulo (DECISIONES 45): ni en la vista previa, ni en lo guardado, ni en la base.
  check(
    "los módulos no tienen color de canto",
    [...order.modulos, ...preview.data.modulos].every((modulo) => !("colorCantoId" in modulo) && !("colorCanto" in modulo)) &&
      psql(`select count(*) from information_schema.columns where table_name = 'pedidos_modulo' and column_name = 'colorCantoId'`) === "0"
  );
  // Fondo usado: el elegido (modulo 1), el de la configuracion (modulos 2, 4 y 5) y ninguno en el placard, que no tiene fondo.
  check(
    "cada modulo guarda el fondo que uso",
    order.modulos[0].materialFondoId === fondoElegido &&
      order.modulos[0].materialFondo?.id === fondoElegido &&
      order.modulos[1].materialFondoId === fondoConfig &&
      order.modulos[2].materialFondoId === null &&
      order.modulos[3].materialFondoId === fondoConfig &&
      order.modulos[4].materialFondoId === fondoConfig,
    order.modulos.map((modulo) => (modulo.materialFondoId === fondoElegido ? "elegido" : modulo.materialFondoId ? "config" : "-")).join(" ")
  );
  const fondoDelModulo1 = order.detalles.filter((row) => row.pedidoModuloId === order.modulos[0].id && row.piezaCodigo && row.materialId === fondoElegido);
  check("las piezas de fondo del modulo 1 van en el fondo elegido", fondoDelModulo1.length > 0, `${fondoDelModulo1.length} filas`);
  const materiales = (await call("GET", "/materiales?incluirInactivos=true")).data;
  const elegidoEnMateriales = materiales.find((material) => material.id === fondoElegido);
  check("Materiales cuenta el fondo elegido como vinculo (no se puede borrar)", elegidoEnMateriales?.linkedModulesCount >= 1 && elegidoEnMateriales.canDeletePermanently === false);

  const sinExtras = ({ imagen: _i, tienePedidos: _t, estadoFormulas: _e, errores: _r, ...rest }) => rest;
  check(
    "la copia de la definicion es la de su modulo, completa y sin imagen ni tienePedidos",
    order.modulos.every(
      (modulo, index) =>
        modulo.definicionSnapshot.id === lines[index].moduloId &&
        !("imagen" in modulo.definicionSnapshot) &&
        !("tienePedidos" in modulo.definicionSnapshot) &&
        same(modulo.definicionSnapshot, sinExtras(definiciones.get(lines[index].moduloId)))
    )
  );

  // m² por material (R3): la suma exacta de las piezas, en mm² enteros.
  const mm2 = new Map();
  for (const row of order.detalles) mm2.set(row.materialId, (mm2.get(row.materialId) ?? 0) + row.largo * row.ancho * row.cantidad);
  check(
    "m² por material: la suma exacta de las piezas",
    order.estimacionDetalle.porMaterial.every((item) => Number.isInteger(item.mm2) && item.mm2 === mm2.get(item.materialId)) && order.estimacionDetalle.porMaterial.length === mm2.size,
    order.estimacionDetalle.porMaterial.map((item) => `${(item.mm2 / 1e6).toFixed(2)} m²`).join(", ")
  );

  // Datos de la solicitud
  check("tipo, estado y numero", order.tipo === "MODULOS" && order.estado === "PENDIENTE" && order.numero > Number(psql(`select max(numero) from pedidos where id <> '${order.id}'`)));
  check("fecha de entrega como AAAA-MM-DD, sin correrse de dia", order.fechaEntrega === datos().fechaEntrega, order.fechaEntrega);
  check("datos del cliente", order.cliente === datos().cliente && order.emailContacto === datos().emailContacto && order.direccionEntrega === datos().direccionEntrega && order.observaciones === datos().observaciones);
  check("historial CREAR_PEDIDO_MODULOS", order.historial.length === 1 && order.historial[0].accion === "CREAR_PEDIDO_MODULOS");
  check(
    "en la base: modulos y filas guardados",
    psql(`select count(*) from pedidos_modulo where "pedidoId" = '${order.id}'`) === String(lines.length) &&
      psql(`select count(*) from detalle_pedidos where "pedidoId" = '${order.id}' and "pedidoModuloId" is not null and origen is not null`) === String(order.detalles.length)
  );
  const detalle = await call("GET", `/pedidos-modulos/${order.id}`);
  check("GET /pedidos-modulos/:id devuelve lo mismo que el alta", detalle.status === 200 && JSON.stringify(detalle.data) === JSON.stringify(order));

  // ---------------------------------------------------------------- listado: busquedas, filtros y orden
  // B: mas nueva y con la entrega mas lejana. C: la entrega mas cercana, pero entregada.
  const b = await crear({ ...datos({ cliente: `${PREFIJO} beta`, numeroContacto: "111111", observaciones: "Placard de prueba", fechaEntrega: enDias(30) }), modulos: [placardLine] });
  const c = await crear({ ...datos({ cliente: `${PREFIJO} gamma`, numeroContacto: "222222", observaciones: "Vestidor", fechaEntrega: enDias(5) }), modulos: [placardLine] });
  check("altas de las solicitudes B y C", b.status === 201 && c.status === 201, `${b.status} ${c.status}`);
  const entregada = await call("PATCH", `/orders/${c.data.id}/status`, { estado: "ENTREGADA" });
  check("C pasa a ENTREGADA", entregada.status === 200, `${entregada.status} ${entregada.data?.message ?? ""}`);
  const nuestras = new Map([
    [order.id, "A"],
    [b.data.id, "B"],
    [c.data.id, "C"]
  ]);
  const listar = async (query = "") => {
    const result = await call("GET", `/pedidos-modulos${query ? `?${query}` : ""}`);
    return { status: result.status, letras: (result.data ?? []).filter((item) => nuestras.has(item.id)).map((item) => nuestras.get(item.id)).join(""), data: result.data };
  };
  const todas = await listar();
  check("orden: por fecha de entrega y las entregadas al final (no por la mas nueva)", todas.letras === "ABC", todas.letras);
  const filaA = todas.data.find((item) => item.id === order.id);
  check(
    "listado: numero, cantidad de modulos, fecha y total",
    filaA && filaA.numero === order.numero && filaA.cantidadModulos === lines.length && filaA.fechaEntrega === datos().fechaEntrega && filaA.presupuestoConHerrajes === order.presupuestoConHerrajes
  );
  for (const [label, query, esperado] of [
    ["numero M-", `search=M-${order.numero}`, "A"],
    ["numero", `search=${b.data.numero}`, "B"],
    ["telefono", "search=111111", "B"],
    ["cliente", "search=GAMMA", "C"],
    ["referencia", "search=cocina%20de%20prueba", "A"],
    ["texto que no existe", "search=zz-no-existe-zz", ""],
    ["numero que no existe", "search=M-999999999", ""],
    ["estado ENTREGADA", "estado=ENTREGADA", "C"],
    ["estado PENDIENTE", "estado=PENDIENTE", "AB"],
    ["entrega exacta", `entregaDesde=${datos().fechaEntrega}&entregaHasta=${datos().fechaEntrega}`, "A"],
    ["entrega hasta", `entregaHasta=${enDias(14)}`, "C"],
    ["entrega desde", `entregaDesde=${enDias(16)}`, "B"]
  ]) {
    const result = await listar(query);
    check(`busqueda por ${label}`, result.status === 200 && result.letras === esperado, `${result.letras || "ninguna"}`);
  }
  check("filtro mal formado: 400", (await call("GET", "/pedidos-modulos?entregaDesde=ayer")).status === 400);
  const corte = (await call("GET", "/orders")).data;
  check("GET /orders no muestra las solicitudes de modulos", !corte.some((item) => nuestras.has(item.id)));
  check("GET /pedidos-modulos/:id de un pedido de corte: 404", (await call("GET", `/pedidos-modulos/${corte[0]?.id}`)).status === 404);

  // ---------------------------------------------------------------- stock, como en corte
  const porMaterial = order.estimacionDetalle.porMaterial;
  const ids = porMaterial.map((item) => item.materialId);
  const inicial = stockDe(ids);
  const enProceso = await call("PATCH", `/orders/${order.id}/status`, { estado: "EN_PROCESO" });
  const tomado = stockDe(ids);
  check(
    "pasar a EN_PROCESO descuenta exactamente las placas de la constancia",
    enProceso.status === 200 && porMaterial.every((item) => tomado.get(item.materialId) === inicial.get(item.materialId) - item.placas),
    porMaterial.map((item) => `${inicial.get(item.materialId)}->${tomado.get(item.materialId)}`).join(", ")
  );
  check("filtro por estado EN_PROCESO", (await listar("estado=EN_PROCESO")).letras === "A");
  const fila0 = order.detalles[0];
  const comoCorte = await call("PUT", `/orders/${order.id}`, { cliente: "x", numeroContacto: "000000", detalles: [{ materialId: fila0.materialId, largo: fila0.largo, ancho: fila0.ancho, cantidad: 1 }] });
  check("PUT de corte sobre una solicitud de modulos: 400 ORDER_IS_MODULES", comoCorte.status === 400 && comoCorte.data?.code === "ORDER_IS_MODULES", `${comoCorte.status} ${comoCorte.data?.code}`);
  const vuelta = await call("PATCH", `/orders/${order.id}/status`, { estado: "PENDIENTE" });
  check("volver a PENDIENTE devuelve exactamente lo descontado", vuelta.status === 200 && porMaterial.every((item) => stockDe(ids).get(item.materialId) === inicial.get(item.materialId)));

  // Carrera entre borrar y cambiar de estado: nunca se pierden ni se duplican placas.
  const antesCarrera = stockDe(usados);
  const resultados = [];
  for (let vez = 0; vez < 6; vez += 1) {
    const d = await crear({ ...datos({ cliente: `${PREFIJO} carrera` }), modulos: [placardLine] });
    if (d.status !== 201) continue;
    const [patch, del] = await Promise.all([call("PATCH", `/orders/${d.data.id}/status`, { estado: "EN_PROCESO" }), call("DELETE", `/orders/${d.data.id}`)]);
    resultados.push(`${patch.status}/${del.status}`);
    if (del.status !== 204) {
      const again = await call("DELETE", `/orders/${d.data.id}`);
      if (again.status !== 204) resultados.push(`borrado final ${again.status}`);
    }
  }
  const despuesCarrera = stockDe(usados);
  check(
    "carrera entre borrar y cambiar de estado: el stock queda exacto",
    resultados.length === 6 && usados.every((id) => despuesCarrera.get(id) === antesCarrera.get(id)) && resultados.every((item) => /^(200|404|409)\/(204|404|409)$/.test(item)),
    resultados.join(" ")
  );

  // La misma carrera, sin depender de la suerte: se lee el pedido, se cambia el estado por la API y recien ahi se
  // intenta borrar con la lectura vieja. Tiene que responder 409 sin tocar el stock, en las dos direcciones
  // (antes: si el cambio tomaba stock, se perdia; si lo devolvia, se devolvia dos veces).
  // Cada caso con un modulo distinto: asi una placa perdida en uno no se compensa con una devuelta de mas en el otro.
  const carrera = async (estadoInicial, estadoNuevo, linea) => {
    const e = await crear({ ...datos({ cliente: `${PREFIJO} carrera fija` }), modulos: [linea] });
    if (estadoInicial !== "PENDIENTE") await call("PATCH", `/orders/${e.data.id}/status`, { estado: estadoInicial });
    const dir = mkdtempSync(join(tmpdir(), "f43-"));
    const script = join(dir, "carrera.mts");
    const backend = (path) => new URL(`../../../backend/src/${path}`, import.meta.url).href;
    writeFileSync(
      script,
      `import { prisma } from ${JSON.stringify(backend("config/prisma.ts"))};
import { deleteOrderReturningStock } from ${JSON.stringify(backend("modules/orders/order-stock.service.ts"))};
const stock = async () => Object.fromEntries((await prisma.material.findMany({ where: { id: { in: ${JSON.stringify(usados)} } } })).map((m) => [m.id, m.stockPlacas]));
const vieja = await prisma.pedido.findUniqueOrThrow({ where: { id: ${JSON.stringify(e.data.id)} }, include: { detalles: true } });
const response = await fetch(${JSON.stringify(`${BASE}/orders/${e.data.id}/status`)}, { method: "PATCH", headers: { Authorization: "Bearer " + process.env.TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ estado: ${JSON.stringify(estadoNuevo)} }) });
const despuesDelCambio = await stock();
let code = "BORRADO";
try { await deleteOrderReturningStock(prisma, vieja); } catch (error) { code = error.code ?? error.message; }
console.log(JSON.stringify({ patch: response.status, code, existe: Boolean(await prisma.pedido.findUnique({ where: { id: vieja.id } })), despuesDelCambio, despuesDelBorrado: await stock() }));
await prisma.$disconnect();
`
    );
    const output = execFileSync(join(backendDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx"), [script], {
      cwd: backendDir,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...process.env, TOKEN: admin, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://carpinteria:analisis_local@127.0.0.1:55432/carpinteria", JWT_SECRET: SECRET }
    });
    const result = JSON.parse(output.trim().split("\n").pop());
    check(
      `borrar con una lectura vieja (${estadoInicial} -> ${estadoNuevo} en el medio): 409 y el stock no se toca`,
      result.patch === 200 && result.code === "ORDER_CHANGED" && result.existe && same(result.despuesDelBorrado, result.despuesDelCambio),
      `${result.patch} ${result.code}`
    );
  };
  await carrera("PENDIENTE", "EN_PROCESO", placardLine);
  await carrera("EN_PROCESO", "PENDIENTE", lines[1]);

  // ---------------------------------------------------------------- clave de alta (DECISIONES 40)
  // El mismo intento otra vez (respuesta perdida y reintento) da la misma solicitud; dos a la vez, tambien.
  const clave = randomUUID();
  const conClave = { ...datos({ cliente: `${PREFIJO} clave` }), claveAlta: clave, modulos: [placardLine] };
  const antesClave = Number(psql("select count(*) from pedidos"));
  const primero = await crear(conClave);
  const segundo = await call("POST", "/pedidos-modulos", conClave);
  check(
    "clave de alta: el mismo intento otra vez devuelve la misma solicitud (200) y no crea otra",
    primero.status === 201 && segundo.status === 200 && segundo.data.id === primero.data.id && Number(psql("select count(*) from pedidos")) === antesClave + 1,
    `${primero.status} ${segundo.status}`
  );
  check("clave de alta: se guarda en la solicitud", psql(`select "claveAlta" from pedidos where id = '${primero.data.id}'`) === clave);
  const buscada = await call("GET", `/pedidos-modulos?clave=${clave}`);
  check("clave de alta: el listado la encuentra por clave", buscada.status === 200 && buscada.data.length === 1 && buscada.data[0].id === primero.data.id);
  check("clave de alta: una clave que no entro no trae nada", (await call("GET", `/pedidos-modulos?clave=${randomUUID()}`)).data.length === 0);
  // Un reintento puede traer datos que hoy ya no pasan (la fecha de entrega vencio a la medianoche): igual devuelve la
  // que entro, porque la clave se busca antes de validar el resto.
  const vencida = await call("POST", "/pedidos-modulos", { ...conClave, fechaEntrega: enDias(-1) });
  check("clave de alta: un reintento con datos que hoy no pasan devuelve la que entro (no 400)", vencida.status === 200 && vencida.data.id === primero.data.id, String(vencida.status));
  const paralela = randomUUID();
  const antesParalela = Number(psql("select count(*) from pedidos"));
  const [p1, p2] = await Promise.all([call("POST", "/pedidos-modulos", { ...conClave, claveAlta: paralela }), call("POST", "/pedidos-modulos", { ...conClave, claveAlta: paralela })]);
  for (const result of [p1, p2]) if (result.status === 201) creados.push(result.data.id);
  check(
    "clave de alta: dos a la vez dan una sola solicitud",
    [p1.status, p2.status].sort().join(",") === "200,201" && p1.data.id === p2.data.id && Number(psql("select count(*) from pedidos")) === antesParalela + 1,
    `${p1.status} ${p2.status}`
  );

  // ---------------------------------------------------------------- errores
  const intento = async (label, body, status, test = () => true) => {
    const before = psql("select count(*) from pedidos");
    const response = await crear(body);
    const sinCambios = status >= 400 ? psql("select count(*) from pedidos") === before : true;
    check(label, response.status === status && test(response.data) && sinCambios, `${response.status} ${String(response.data?.message ?? "").slice(0, 120)}`);
  };
  const texto = (data) => JSON.stringify(data);
  await intento("fecha de entrega anterior a hoy: 400", { ...datos({ fechaEntrega: enDias(-1) }), modulos: lines }, 400, (data) => texto(data).includes("no puede ser anterior a hoy"));
  await intento("hoy si se puede", { ...datos({ fechaEntrega: hoy }), modulos: [placardLine] }, 201);
  await intento("email invalido: 400", { ...datos({ emailContacto: "no-es-un-email" }), modulos: lines }, 400, (data) => texto(data).includes("El email no es válido"));
  await intento("cliente demasiado corto: 400", { ...datos({ cliente: "A" }), modulos: lines }, 400, (data) => texto(data).includes("al menos 2"));
  await intento("un campo desconocido: 400", { ...datos(), fechaEntraga: enDias(3), modulos: lines }, 400, (data) => texto(data).includes("no se reconocen"));
  await intento(
    "el modulo cambio desde la vista previa: 409 y no se crea nada",
    { ...datos(), modulos: conVersion.map((line, index) => (index === 1 ? { ...line, version: line.version + 1000 } : line)) },
    409,
    (data) => data.code === "MODULE_CHANGED" && data.details.modulos[0].posicion === 2
  );
  await intento("sin modulos: 400", { ...datos(), modulos: [] }, 400);
  // Cantos (DECISIONES 45): el color unico por modulo y el formato viejo (espesores) ya no entran.
  const conCantos = (cantosOverride) => [{ ...lines[0], cantosOverride }];
  await intento("un módulo con colorCantoId (ya no existe): 400", { ...datos(), modulos: [{ ...lines[0], colorCantoId: colorA }] }, 400, (data) => texto(data).includes("no se reconocen"));
  await intento("cantos cambiados con el formato viejo (espesor en mm): 400", { ...datos(), modulos: conCantos({ [piso.codigo]: { LARGO_1: 2 } }) }, 400, (data) =>
    texto(data).includes("Cada lado lleva el canto elegido o null (sin canto)")
  );
  await intento("un lado que no existe: 400", { ...datos(), modulos: conCantos({ [piso.codigo]: { LARGO_3: null } }) }, 400, (data) =>
    texto(data).includes("Los lados de una pieza son LARGO_1, LARGO_2, ANCHO_1 y ANCHO_2")
  );
  await intento(
    "un canto elegido que no es un canto activo (una placa): 400 MODULE_MATERIAL_INVALID",
    { ...datos(), modulos: conCantos({ [piso.codigo]: { LARGO_1: colorA } }) },
    400,
    (data) =>
      data.code === "MODULE_MATERIAL_INVALID" &&
      data.message === `Módulo 1 (${definiciones.get(bajo).nombre}): el canto elegido para "${piso.nombre}" (Largo 1) no es un canto activo del sistema.`
  );
  await intento("cantos cambiados de una pieza que no existe: 400 MODULE_FORMULA_ERRORS", { ...datos(), modulos: conCantos({ NO_EXISTE: { LARGO_1: null } }) }, 400, (data) =>
    data.code === "MODULE_FORMULA_ERRORS" && texto(data).includes("No existe la pieza NO_EXISTE para cambiarle los cantos")
  );
  await intento("clave de alta mal formada: 400", { ...datos(), claveAlta: "no-es-uuid", modulos: [placardLine] }, 400, (data) => texto(data).includes("La clave de alta no es válida"));
  const prohibido = await call("POST", "/pedidos-modulos", { ...datos(), modulos: lines }, carpintero);
  check("un carpintero no accede (403)", prohibido.status === 403 && (await call("GET", "/pedidos-modulos", undefined, carpintero)).status === 403);
} catch (error) {
  check(`la prueba se corto: ${error.message}`, false);
} finally {
  // Cada paso por separado: si uno falla, los demas igual corren.
  const paso = (label, action) => {
    try {
      action();
    } catch (error) {
      check(`limpieza: ${label}`, false, error.message);
    }
  };
  for (const id of creados) {
    const removed = await call("DELETE", `/orders/${id}`).catch((error) => ({ status: error.message }));
    if (removed.status !== 204 && removed.status !== 404) check(`limpieza: borrar ${String(id).slice(0, 8)}`, false, String(removed.status));
  }
  paso("stock devuelto", () => {
    // Con todo borrado, el stock tiene que volver exacto a lo que se puso al empezar (500).
    const final = stockDe(usados);
    check("al borrar todo, el stock vuelve exacto", usados.every((id) => final.get(id) === 500), usados.map((id) => final.get(id)).join(", "));
  });
  paso("stock original", () => {
    for (const [id, stock] of stockAntes) psql(`update materiales set "stockPlacas" = ${stock} where id = '${id}'`);
  });
  paso("configuracion", () => psql(`update configuracion_modulos set "materialFondoId" = ${fondoAntes === "null" ? "null" : `'${fondoAntes}'`} where id = 'default'`));
  paso("verificacion final", () => {
    check("solicitudes de prueba borradas (con sus modulos y filas)", psql("select count(*) from pedidos") === pedidosAntes && psql("select count(*) from pedidos_modulo") === modulosPedidosAntes);
    check(
      "stock y configuracion como estaban",
      [...stockAntes].every(([id, stock]) => psql(`select coalesce("stockPlacas"::text, 'null') from materiales where id = '${id}'`) === stock) &&
        psql(`select coalesce("materialFondoId", 'null') from configuracion_modulos where id = 'default'`) === fondoAntes
    );
  });
}

console.log(failures ? `\n${failures} con problemas` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
