// Armado de una solicitud de modulos sin base de datos (spec §8.2 y §8.3). module-orders.service.ts lee de la base
// lo que hace falta y llama a planModuleOrder; asi esta logica se prueba con datos armados a mano (spec §17.1,
// module-order-plan.test.ts) y la paridad con el corte no depende de nada mas que de estas filas.
import { findPiecesThatDoNotFit } from "../../shared/cutOptimizer.js";
import {
  buildModulePieces,
  EDGE_SIDES,
  resolveModuleHardware,
  type CatalogModuleDef,
  type EdgeSide,
  type HardwareModel,
  type HardwarePick,
  type ModuleError,
  type ModuleHardwareLine,
  type OrderedModulePiece,
  type RoundingMode
} from "../../shared/moduleFormula.js";
import { usableBoardSize } from "../../shared/orderEstimate.js";
import type { DetailInput } from "../orders/order-details.service.js";
import type { ModuleOrderLine } from "./module-orders.schemas.js";

/** Un modulo del catalogo como lo devuelve toDefinition. */
export type PlanModule = CatalogModuleDef & {
  id: string;
  nombre: string;
  activo: boolean;
  version: number;
  materialFondoId: string | null;
  /** Los herrajes del modulo (DECISIONES 57): modelo por defecto, formula de cantidad y, si va por medida, de la medida. */
  herrajes?: ModuleHardwareLine[];
};
/** Un modelo de herraje de la base, con lo que se guarda en la solicitud. */
export type PlanHardware = HardwareModel & { nombre: string; unidad: string; valor: number; tipo: string | null };
/** Un herraje de un modulo de la solicitud, listo para guardar (PedidoHerraje). */
export type PlannedHardware = {
  /** El modelo que va. */
  herrajeId: string;
  /** El modelo por defecto de la linea del modulo: la clave para elegir otro a mano. */
  herrajeDefectoId: string;
  nombre: string;
  unidad: string;
  tipo: string | null;
  linea: string | null;
  medidaMm: number | null;
  cantidad: number;
  valorUnitario: number;
  medidaNecesaria: number | null;
  /** Como se eligio: POR_DEFECTO, POR_MEDIDA, MAS_CHICO o ELEGIDO (a mano en la solicitud). */
  eleccion: HardwarePick | "ELEGIDO";
  origen: "CALCULADO" | "EDITADO";
  orden: number;
};
export type PlanMaterial = {
  id: string;
  nombre: string;
  tipo: "PLACA" | "CANTO";
  activo: boolean;
  espesorMm: number;
  anchoPlaca: number | null;
  altoPlaca: number | null;
};
/** Un CANTO activo. Por defecto cada lado lleva el de la placa de la pieza (placaMaterialId) y el espesor del perfil. */
export type PlanCanto = { id: string; nombre: string; placaMaterialId: string | null; espesorMm: number };

/** Un lado que el perfil pide con canto, pero la placa de la pieza no tiene canto de su color y espesor: va sin canto. */
export type MissingDefaultEdge = { piezaCodigo: string; pieza: string; lado: EdgeSide; espesorMm: number; placa: string };

export type PlanInput = {
  lines: ModuleOrderLine[];
  modules: Map<string, PlanModule>;
  /** Placas que puede usar la solicitud: colores, fondos y materiales fijos (puede traer de mas). */
  materials: Map<string, PlanMaterial>;
  /** Todos los CANTO activos. Si hubiera dos de la misma placa y espesor, el de por defecto es el primero. */
  cantos: PlanCanto[];
  config: { redondeo: RoundingMode; materialFondoId: string | null };
  optimizer: { espesorSierraMm: number; perfiladoBordeMm: number };
  /** Herrajes (Fase 6): si estan habilitados y todos los modelos de la base (tambien los inactivos). Sin esto, no hay herrajes. */
  hardware?: { enabled: boolean; models: Map<string, PlanHardware> };
};

export type PlanError = { code: string; message: string; problems: string[]; details: Record<string, unknown> };

export type PlannedLine = {
  posicion: number;
  line: ModuleOrderLine;
  module: PlanModule;
  piezas: OrderedModulePiece[];
  /** Medidas con las que se calculo (lo cargado o el valor por defecto). */
  valores: Record<string, number>;
  /** Placa que usan las piezas de fondo (la elegida, la del modulo o la de la configuracion); null si no tiene fondo. */
  materialFondoId: string | null;
  /** Una fila por pieza, en el mismo orden que `piezas`, lista para normalizeDetails. */
  rows: DetailInput[];
  /** Lados que van sin canto porque la placa de la pieza no tiene uno de su color: se avisan, no son un error. */
  sinCanto: MissingDefaultEdge[];
  /** Herrajes del modulo (vacio si estan apagados). Las lineas con cantidad 0 no van. */
  herrajes: PlannedHardware[];
};

export type Plan = { ok: true; lines: PlannedLine[] } | { ok: false; error: PlanError };

const SIDE_FIELD: Record<EdgeSide, "cantoLargo1Id" | "cantoLargo2Id" | "cantoAncho1Id" | "cantoAncho2Id"> = {
  LARGO_1: "cantoLargo1Id",
  LARGO_2: "cantoLargo2Id",
  ANCHO_1: "cantoAncho1Id",
  ANCHO_2: "cantoAncho2Id"
};
const SIDE_LABEL: Record<EdgeSide, string> = { LARGO_1: "Largo 1", LARGO_2: "Largo 2", ANCHO_1: "Ancho 1", ANCHO_2: "Ancho 2" };

export const sameThickness = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const mm = (value: number) => value.toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });
const pad2 = (value: number) => String(value).padStart(2, "0");

/** Codigo de barra de una pieza de modulo (spec §8.2): M1044-01-03. En la vista previa, sin numero: M----01-03. */
export function moduleBarcode(numero: number | null, posicion: number, orden: number) {
  return `M${numero ?? "---"}-${pad2(posicion)}-${pad2(orden)}`;
}

/**
 * Material de las piezas de fondo de un modulo de la solicitud (DECISIONES 32): el elegido en la solicitud, si no el
 * del modulo y si no el de la configuracion del catalogo.
 */
export const fondoIdFor = (line: Pick<ModuleOrderLine, "materialFondoId">, module: Pick<PlanModule, "materialFondoId">, config: PlanInput["config"]) =>
  line.materialFondoId ?? module.materialFondoId ?? config.materialFondoId ?? null;

const failure = (code: string, problems: string[], details: Record<string, unknown> = {}, message?: string): Plan => ({
  ok: false,
  error: { code, problems, details, message: message ?? problems.join(" ") }
});

/**
 * Arma las filas de corte de los modulos de una solicitud. Junta todos los problemas de cada tipo antes de
 * responder, para que el asistente los muestre de una vez, en este orden:
 * 1. modulos que no existen o estan inactivos (MODULE_NOT_AVAILABLE);
 * 2. errores de formulas o de medidas (MODULE_FORMULA_ERRORS);
 * 3. colores, fondo, material fijo o cantos elegidos que no sirven (MODULE_MATERIAL_INVALID);
 * 4. piezas que no entran en su placa, con la funcion de encaje del optimizador (MODULE_PIECES_DO_NOT_FIT, R2);
 * 5. herrajes que no se pueden usar: un modelo inactivo o que no existe, o uno elegido de otro tipo (MODULE_HARDWARE_INVALID).
 * Con los herrajes habilitados, sus formulas con error van con las de las piezas (2).
 * Cada lado lleva por defecto el canto del color de la placa de su pieza y del espesor del perfil; si esa placa no
 * tiene uno, va sin canto y se avisa (sinCanto), sin error. Un cambio a mano elige cualquier canto activo, o ninguno
 * (DECISIONES 45).
 * Las filas no tienen numero de pedido ni pedidoModuloId: el alta los completa dentro de su transaccion.
 */
export function planModuleOrder(input: PlanInput): Plan {
  const { lines, modules, materials, cantos, config } = input;

  // 1. Modulos
  const unavailable = lines.flatMap((line, index) => {
    const module = modules.get(line.moduloId);
    if (!module) return [`El módulo ${index + 1} no existe en el catálogo.`];
    if (!module.activo) return [`El módulo ${index + 1} (${module.nombre}) está inactivo: no se puede pedir.`];
    return [];
  });
  if (unavailable.length) return failure("MODULE_NOT_AVAILABLE", unavailable);

  // 2. Piezas, con el armador compartido (R6)
  const built = lines.map((line, index) => {
    const module = modules.get(line.moduloId)!;
    const result = buildModulePieces(module, line.valores, { redondeo: config.redondeo, perfilOrden: line.perfilCantoOrden });
    // Un cambio para una pieza que existe pero no se genera con estas medidas (cantidad 0) no molesta: puede venir de un
    // paso anterior del asistente. Uno para una pieza que no existe es un error.
    const codes = new Set(module.piezas.map((pieza) => pieza.codigo.toUpperCase()));
    for (const codigo of Object.keys(line.cantosOverride ?? {}).map((code) => code.toUpperCase())) {
      if (!codes.has(codigo)) result.errores.push({ ref: codigo, mensaje: `No existe la pieza ${codigo} para cambiarle los cantos` });
    }
    // Herrajes (DECISIONES 57): cantidad y modelo con el calculo compartido, el mismo que muestra el editor del catalogo.
    const hardwareLines = input.hardware?.enabled ? (module.herrajes ?? []) : [];
    const resolved = resolveModuleHardware(hardwareLines, result.evaluarExpresion, input.hardware?.models ?? new Map());
    resolved.forEach((item, position) => item.error && result.errores.push({ ref: `herraje ${position + 1}`, mensaje: item.error }));
    if (input.hardware?.enabled) {
      const defaults = new Set(hardwareLines.map((item) => item.herrajeId));
      for (const defaultId of Object.keys(line.herrajesOverride ?? {})) {
        if (!defaults.has(defaultId)) result.errores.push({ ref: "herraje", mensaje: "Un herraje elegido no es de este módulo" });
      }
    }
    return { posicion: index + 1, line, module, ...result, resolved };
  });
  const withErrors = built.filter((item) => item.errores.length);
  if (withErrors.length) {
    const [first] = withErrors;
    return failure(
      "MODULE_FORMULA_ERRORS",
      withErrors.flatMap((item) => item.errores.map((error: ModuleError) => `Módulo ${item.posicion} (${item.module.nombre}), ${error.ref}: ${error.mensaje}.`)),
      { posicion: first.posicion, modulos: withErrors.map((item) => ({ posicion: item.posicion, nombre: item.module.nombre, errores: item.errores })) },
      withErrors.length === 1 ? `El módulo ${first.posicion} (${first.module.nombre}) tiene errores.` : `Hay ${withErrors.length} módulos con errores.`
    );
  }

  // 3. Materiales: colores de la solicitud, fondo y materiales fijos
  const materialProblems: string[] = [];
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));
  const checkPlate = (id: string | null, where: string, rotulo: string, espesorDisenoMm?: number) => {
    const plate = id ? materials.get(id) : undefined;
    if (!plate || plate.tipo !== "PLACA") materialProblems.push(`${where}: ${rotulo} no es una placa del sistema.`);
    else if (!plate.activo) materialProblems.push(`${where}: ${rotulo} "${plate.nombre.trim()}" está inactivo.`);
    else if (espesorDisenoMm !== undefined && !sameThickness(plate.espesorMm, espesorDisenoMm)) {
      // Las formulas suponen el espesor de diseno (spec §8.6): con otra placa el mueble sale mal.
      materialProblems.push(`${where}: ${rotulo} "${plate.nombre.trim()}" es de ${mm(plate.espesorMm)} mm y el módulo está pensado para placas de ${mm(espesorDisenoMm)} mm.`);
    }
  };
  for (const { posicion, line, module, piezas } of built) {
    const where = `Módulo ${posicion} (${module.nombre})`;
    checkPlate(line.colorEsqueletoId, where, "el color de esqueleto", module.espesorDisenoMm);
    checkPlate(line.colorFrentesId, where, "el color de frentes", module.espesorDisenoMm);
    // El fondo elegido en la solicitud se revisa siempre, como los colores, aunque el modulo no tenga piezas de fondo.
    if (line.materialFondoId) checkPlate(line.materialFondoId, where, "el material de fondo elegido");
    else if (piezas.some((pieza) => pieza.rol === "FONDO")) {
      const fondoId = fondoIdFor(line, module, config);
      if (!fondoId) materialProblems.push(`${where}: tiene piezas de fondo y no hay material de fondo. Configuralo en Catálogo de módulos > Configuración.`);
      else checkPlate(fondoId, where, "el material de fondo");
    }
    for (const pieza of piezas.filter((item) => item.rol === "FIJO")) checkPlate(pieza.materialFijoId, where, `el material fijo de "${pieza.nombre}"`);
    // Los cantos elegidos a mano: cualquier canto activo (DECISIONES 45).
    for (const [codigo, lados] of Object.entries(line.cantosOverride ?? {})) {
      const nombre = module.piezas.find((pieza) => pieza.codigo.toUpperCase() === codigo.toUpperCase())?.nombre ?? codigo;
      for (const lado of EDGE_SIDES) {
        const cantoId = lados[lado];
        if (cantoId && !cantoById.has(cantoId)) materialProblems.push(`${where}: el canto elegido para "${nombre}" (${SIDE_LABEL[lado]}) no es un canto activo del sistema.`);
      }
    }
  }
  if (materialProblems.length) return failure("MODULE_MATERIAL_INVALID", [...new Set(materialProblems)]);

  // Filas: cada lado con el canto elegido a mano o, si no se toco, el de la placa de la pieza (spec §8.2, DECISIONES 45)
  const defaultCanto = (placaId: string, espesorMm: number) =>
    cantos.find((canto) => canto.placaMaterialId === placaId && sameThickness(canto.espesorMm, espesorMm)) ?? null;
  const planned: PlannedLine[] = built.map(({ posicion, line, module, piezas, valores, resolved }) => {
    const sinCanto: MissingDefaultEdge[] = [];
    const overrides = new Map(Object.entries(line.cantosOverride ?? {}).map(([codigo, lados]) => [codigo.toUpperCase(), lados]));
    const rows = piezas.map((pieza): DetailInput => {
      const materialId =
        pieza.rol === "ESQUELETO" ? line.colorEsqueletoId : pieza.rol === "FRENTE" ? line.colorFrentesId : pieza.rol === "FONDO" ? fondoIdFor(line, module, config)! : pieza.materialFijoId!;
      const override = overrides.get(pieza.codigo.toUpperCase()) ?? {};
      let editado = false;
      const edgeIds = Object.fromEntries(
        EDGE_SIDES.map((lado) => {
          const espesor = pieza.cantos[lado];
          const porDefecto = espesor === null ? null : (defaultCanto(materialId, espesor)?.id ?? null);
          const elegido = override[lado];
          if (elegido !== undefined) {
            // Elegido a mano: la pieza queda EDITADO solo si es distinto del que llevaria por defecto.
            if (elegido !== porDefecto) editado = true;
            return [SIDE_FIELD[lado], elegido];
          }
          if (espesor !== null && !porDefecto) {
            sinCanto.push({ piezaCodigo: pieza.codigo, pieza: pieza.nombre, lado, espesorMm: espesor, placa: materials.get(materialId)!.nombre.trim() });
          }
          return [SIDE_FIELD[lado], porDefecto];
        })
      ) as Pick<DetailInput, "cantoLargo1Id" | "cantoLargo2Id" | "cantoAncho1Id" | "cantoAncho2Id">;
      return {
        materialId,
        codigoBarra: moduleBarcode(null, posicion, pieza.orden),
        largo: pieza.largo,
        ancho: pieza.ancho,
        cantidad: pieza.cantidad,
        ...edgeIds,
        cantoLargo1: Boolean(edgeIds.cantoLargo1Id),
        cantoLargo2: Boolean(edgeIds.cantoLargo2Id),
        cantoAncho1: Boolean(edgeIds.cantoAncho1Id),
        cantoAncho2: Boolean(edgeIds.cantoAncho2Id),
        permiteRotar: pieza.permiteRotar,
        codigoBarraCentro: null,
        // Sin Remark por ahora: el Excel de solicitudes no lo usa (DECISIONES 20).
        remark: null,
        numeroCliente: null,
        nombreCliente: null,
        nombreProducto: pieza.nombre,
        piezaCodigo: pieza.codigo,
        origen: editado ? "EDITADO" : "CALCULADO",
        orden: pieza.orden
      };
    });
    return {
      posicion,
      line,
      module,
      piezas,
      valores,
      materialFondoId: piezas.some((pieza) => pieza.rol === "FONDO") ? fondoIdFor(line, module, config) : null,
      rows,
      sinCanto,
      herrajes: plannedHardware(resolved, line.herrajesOverride ?? {}, input.hardware?.models ?? new Map())
    };
  });

  // 4. Encaje en la placa (spec §8.3), con la misma funcion que usa el optimizador (DECISIONES R2)
  const fitProblems: string[] = [];
  for (const { posicion, piezas, rows } of planned) {
    rows.forEach((row, index) => {
      const plate = materials.get(row.materialId)!;
      if (!plate.anchoPlaca || !plate.altoPlaca) {
        fitProblems.push(`La placa "${plate.nombre.trim()}" no tiene medidas cargadas. Completalas en Materiales.`);
        return;
      }
      const usable = usableBoardSize(plate, input.optimizer);
      if (!findPiecesThatDoNotFit([row], usable.width, usable.height).length) return;
      const girada = !row.permiteRotar && !findPiecesThatDoNotFit([{ ...row, permiteRotar: true }], usable.width, usable.height).length;
      // Pieza y placa en el mismo orden, largo × ancho: el largo de la pieza va contra el alto de la placa (DECISIONES 0.7).
      fitProblems.push(
        `"${piezas[index].nombre}" del Módulo ${posicion} (${row.largo} × ${row.ancho} mm) no entra en la placa ${plate.nombre.trim()} (${usable.height} × ${usable.width} mm útiles)${
          girada ? ". Girada entraría: si la veta lo permite, marcala para rotar en el catálogo" : ""
        }.`
      );
    });
  }
  if (fitProblems.length) return failure("MODULE_PIECES_DO_NOT_FIT", [...new Set(fitProblems)]);

  // 5. Herrajes: el modelo que va tiene que existir y estar activo; uno elegido a mano, ademas, del mismo tipo.
  const hardwareProblems: string[] = [];
  const models = input.hardware?.models ?? new Map<string, PlanHardware>();
  for (const { posicion, module, line, herrajes } of planned) {
    const where = `Módulo ${posicion} (${module.nombre})`;
    for (const item of herrajes) {
      const elegido = models.get(item.herrajeId);
      const defecto = models.get(item.herrajeDefectoId);
      if (!elegido) hardwareProblems.push(`${where}: un herraje ya no existe. Elegí otro modelo.`);
      else if (!elegido.activo) hardwareProblems.push(`${where}: el herraje "${elegido.nombre}" está inactivo. Elegí otro modelo.`);
      else if (line.herrajesOverride?.[item.herrajeDefectoId] && defecto && elegido.tipoId !== defecto.tipoId) {
        hardwareProblems.push(`${where}: "${elegido.nombre}" no es del mismo tipo que "${defecto.nombre}".`);
      }
    }
  }
  if (hardwareProblems.length) return failure("MODULE_HARDWARE_INVALID", [...new Set(hardwareProblems)]);

  return { ok: true, lines: planned };
}

/**
 * Los herrajes de un modulo de la solicitud: por cada linea con cantidad, el modelo elegido a mano (si hay) o el que
 * corresponde, con su precio de hoy. Origen EDITADO si se eligio a mano un modelo distinto del que correspondia.
 */
function plannedHardware(resolved: ReturnType<typeof resolveModuleHardware>, overrides: Record<string, string>, models: Map<string, PlanHardware>): PlannedHardware[] {
  return resolved.flatMap((item, index): PlannedHardware[] => {
    if (!item.cantidad) return [];
    const manual = overrides[item.herrajeId];
    const herrajeId = manual ?? item.elegidoId ?? item.herrajeId;
    const model = models.get(herrajeId);
    return [
      {
        herrajeId,
        herrajeDefectoId: item.herrajeId,
        nombre: model?.nombre ?? "",
        unidad: model?.unidad ?? "unidad",
        tipo: model?.tipo ?? null,
        linea: model?.linea ?? null,
        medidaMm: model?.medidaMm ?? null,
        cantidad: item.cantidad,
        valorUnitario: model?.valor ?? 0,
        medidaNecesaria: item.medidaNecesaria,
        eleccion: manual ? "ELEGIDO" : item.eleccion,
        origen: manual && manual !== item.elegidoId ? "EDITADO" : "CALCULADO",
        orden: index + 1
      }
    ];
  });
}

/**
 * Los herrajes que da el catalogo para un modulo ya pedido (F6.4, "Recalcular herrajes"): con la copia de la definicion
 * guardada en la solicitud, sus medidas y su perfil, y los modelos y precios de hoy, sin nada elegido a mano. Es el
 * mismo calculo que el alta. Si una formula no se puede evaluar, la devuelve en errores (y no hay herrajes).
 */
export function catalogModuleHardware(
  definition: PlanModule,
  valores: Record<string, number>,
  opts: { redondeo: RoundingMode; perfilOrden: number },
  models: Map<string, PlanHardware>
): { herrajes: PlannedHardware[]; errores: ModuleError[] } {
  const result = buildModulePieces(definition, valores, { redondeo: opts.redondeo, perfilOrden: opts.perfilOrden });
  const resolved = resolveModuleHardware(definition.herrajes ?? [], result.evaluarExpresion, models);
  const errores = [...result.errores, ...resolved.flatMap((item, position) => (item.error ? [{ ref: `herraje ${position + 1}`, mensaje: item.error }] : []))];
  if (errores.length) return { herrajes: [], errores };
  return { herrajes: plannedHardware(resolved, {}, models), errores };
}
