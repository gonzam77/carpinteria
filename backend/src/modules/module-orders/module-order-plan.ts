// Armado de una solicitud de modulos sin base de datos (spec §8.2 y §8.3). module-orders.service.ts lee de la base
// lo que hace falta y llama a planModuleOrder; asi esta logica se prueba con datos armados a mano (spec §17.1,
// module-order-plan.test.ts) y la paridad con el corte no depende de nada mas que de estas filas.
import { findPiecesThatDoNotFit } from "../../shared/cutOptimizer.js";
import { buildModulePieces, EDGE_SIDES, type CatalogModuleDef, type EdgeSide, type ModuleError, type OrderedModulePiece, type RoundingMode } from "../../shared/moduleFormula.js";
import { usableBoardSize } from "../../shared/orderEstimate.js";
import type { DetailInput } from "../orders/order-details.service.js";
import type { ModuleOrderLine } from "./module-orders.schemas.js";

/** Un modulo del catalogo como lo devuelve toDefinition. */
export type PlanModule = CatalogModuleDef & { id: string; nombre: string; activo: boolean; version: number; materialFondoId: string | null };
export type PlanMaterial = {
  id: string;
  nombre: string;
  tipo: "PLACA" | "CANTO";
  activo: boolean;
  espesorMm: number;
  anchoPlaca: number | null;
  altoPlaca: number | null;
};
/** Un CANTO activo: se elige por el color (placaMaterialId) y el espesor de cada lado. */
export type PlanCanto = { id: string; nombre: string; placaMaterialId: string | null; espesorMm: number };

export type PlanInput = {
  lines: ModuleOrderLine[];
  modules: Map<string, PlanModule>;
  /** Placas que puede usar la solicitud: colores, fondos y materiales fijos (puede traer de mas). */
  materials: Map<string, PlanMaterial>;
  /** CANTO activos de los colores de canto elegidos. Si hubiera dos del mismo color y espesor, gana el primero. */
  cantos: PlanCanto[];
  config: { redondeo: RoundingMode; materialFondoId: string | null };
  optimizer: { espesorSierraMm: number; perfiladoBordeMm: number };
};

export type PlanError = { code: string; message: string; problems: string[]; details: Record<string, unknown> };

export type PlannedLine = {
  posicion: number;
  line: ModuleOrderLine;
  module: PlanModule;
  piezas: OrderedModulePiece[];
  /** Medidas con las que se calculo (lo cargado o el valor por defecto). */
  valores: Record<string, number>;
  /** Una fila por pieza, en el mismo orden que `piezas`, lista para normalizeDetails. */
  rows: DetailInput[];
};

export type Plan = { ok: true; lines: PlannedLine[] } | { ok: false; error: PlanError };

const SIDE_FIELD: Record<EdgeSide, "cantoLargo1Id" | "cantoLargo2Id" | "cantoAncho1Id" | "cantoAncho2Id"> = {
  LARGO_1: "cantoLargo1Id",
  LARGO_2: "cantoLargo2Id",
  ANCHO_1: "cantoAncho1Id",
  ANCHO_2: "cantoAncho2Id"
};

export const sameThickness = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const mm = (value: number) => value.toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });
const pad2 = (value: number) => String(value).padStart(2, "0");

/** Codigo de barra de una pieza de modulo (spec §8.2): M1044-01-03. En la vista previa, sin numero: M----01-03. */
export function moduleBarcode(numero: number | null, posicion: number, orden: number) {
  return `M${numero ?? "---"}-${pad2(posicion)}-${pad2(orden)}`;
}

/** Remark de las filas de un modulo: lo lee el operario en la maquina. */
export const moduleRemark = (posicion: number, nombreModulo: string) => `Modulo ${posicion} · ${nombreModulo}`;

/** Material de fondo de un modulo: el propio o, si no tiene, el de la configuracion del catalogo. */
export const fondoIdOf = (module: Pick<PlanModule, "materialFondoId">, config: PlanInput["config"]) => module.materialFondoId ?? config.materialFondoId ?? null;

const failure = (code: string, problems: string[], details: Record<string, unknown> = {}, message?: string): Plan => ({
  ok: false,
  error: { code, problems, details, message: message ?? problems.join(" ") }
});

/**
 * Arma las filas de corte de los modulos de una solicitud. Junta todos los problemas de cada tipo antes de
 * responder, para que el asistente los muestre de una vez, en este orden:
 * 1. modulos que no existen o estan inactivos (MODULE_NOT_AVAILABLE);
 * 2. errores de formulas o de medidas (MODULE_FORMULA_ERRORS);
 * 3. colores, fondo o material fijo que no sirven (MODULE_MATERIAL_INVALID);
 * 4. cantos que faltan para un color y un espesor, todos juntos (MISSING_EDGE_MATERIAL);
 * 5. piezas que no entran en su placa, con la funcion de encaje del optimizador (MODULE_PIECES_DO_NOT_FIT, R2).
 * Las filas no tienen numero de pedido ni pedidoModuloId: el alta los completa dentro de su transaccion.
 */
export function planModuleOrder(input: PlanInput): Plan {
  const { lines, modules, materials, cantos, config } = input;

  // 1. Modulos
  const unavailable = lines.flatMap((line, index) => {
    const module = modules.get(line.moduloId);
    if (!module) return [`El modulo ${index + 1} no existe en el catalogo.`];
    if (!module.activo) return [`El modulo ${index + 1} (${module.nombre}) esta inactivo: no se puede pedir.`];
    return [];
  });
  if (unavailable.length) return failure("MODULE_NOT_AVAILABLE", unavailable);

  // 2. Piezas, con el armador compartido (R6)
  const built = lines.map((line, index) => {
    const module = modules.get(line.moduloId)!;
    const result = buildModulePieces(module, line.valores, { redondeo: config.redondeo, perfilOrden: line.perfilCantoOrden, cantosOverride: line.cantosOverride });
    return { posicion: index + 1, line, module, ...result };
  });
  const withErrors = built.filter((item) => item.errores.length);
  if (withErrors.length) {
    const [first] = withErrors;
    return failure(
      "MODULE_FORMULA_ERRORS",
      withErrors.flatMap((item) => item.errores.map((error: ModuleError) => `Modulo ${item.posicion} (${item.module.nombre}), ${error.ref}: ${error.mensaje}.`)),
      { posicion: first.posicion, modulos: withErrors.map((item) => ({ posicion: item.posicion, nombre: item.module.nombre, errores: item.errores })) },
      withErrors.length === 1 ? `El modulo ${first.posicion} (${first.module.nombre}) tiene errores.` : `Hay ${withErrors.length} modulos con errores.`
    );
  }

  // 3. Materiales: colores de la solicitud, fondo y materiales fijos
  const materialProblems: string[] = [];
  const checkPlate = (id: string | null, where: string, rotulo: string, espesorDisenoMm?: number) => {
    const plate = id ? materials.get(id) : undefined;
    if (!plate || plate.tipo !== "PLACA") materialProblems.push(`${where}: ${rotulo} no es una placa del sistema.`);
    else if (!plate.activo) materialProblems.push(`${where}: ${rotulo} "${plate.nombre.trim()}" esta inactivo.`);
    else if (espesorDisenoMm !== undefined && !sameThickness(plate.espesorMm, espesorDisenoMm)) {
      // Las formulas suponen el espesor de diseno (spec §8.6): con otra placa el mueble sale mal.
      materialProblems.push(`${where}: ${rotulo} "${plate.nombre.trim()}" es de ${mm(plate.espesorMm)} mm y el modulo esta pensado para placas de ${mm(espesorDisenoMm)} mm.`);
    }
  };
  for (const { posicion, line, module, piezas } of built) {
    const where = `Modulo ${posicion} (${module.nombre})`;
    checkPlate(line.colorEsqueletoId, where, "el color de esqueleto", module.espesorDisenoMm);
    checkPlate(line.colorFrentesId, where, "el color de frentes", module.espesorDisenoMm);
    checkPlate(line.colorCantoId, where, "el color de los cantos");
    if (piezas.some((pieza) => pieza.rol === "FONDO")) {
      const fondoId = fondoIdOf(module, config);
      if (!fondoId) materialProblems.push(`${where}: tiene piezas de fondo y no hay material de fondo. Configuralo en Catalogo de modulos > Configuracion.`);
      else checkPlate(fondoId, where, "el material de fondo");
    }
    for (const pieza of piezas.filter((item) => item.rol === "FIJO")) checkPlate(pieza.materialFijoId, where, `el material fijo de "${pieza.nombre}"`);
  }
  if (materialProblems.length) return failure("MODULE_MATERIAL_INVALID", [...new Set(materialProblems)]);

  // 4. Filas, con el canto del color elegido y del espesor de cada lado (spec §8.2)
  const cantoFor = (colorId: string, espesorMm: number) => cantos.find((canto) => canto.placaMaterialId === colorId && sameThickness(canto.espesorMm, espesorMm)) ?? null;
  const missing = new Map<string, { colorId: string; colorNombre: string; espesorMm: number }>();
  const planned: PlannedLine[] = built.map(({ posicion, line, module, piezas, valores }) => ({
    posicion,
    line,
    module,
    piezas,
    valores,
    rows: piezas.map((pieza): DetailInput => {
      const materialId =
        pieza.rol === "ESQUELETO" ? line.colorEsqueletoId : pieza.rol === "FRENTE" ? line.colorFrentesId : pieza.rol === "FONDO" ? fondoIdOf(module, config)! : pieza.materialFijoId!;
      const edgeIds = Object.fromEntries(
        EDGE_SIDES.map((lado) => {
          const espesor = pieza.cantos[lado];
          if (espesor === null) return [SIDE_FIELD[lado], null];
          const canto = cantoFor(line.colorCantoId, espesor);
          if (!canto) {
            const color = materials.get(line.colorCantoId)!;
            missing.set(`${color.id}:${espesor}`, { colorId: color.id, colorNombre: color.nombre.trim(), espesorMm: espesor });
          }
          return [SIDE_FIELD[lado], canto?.id ?? null];
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
        remark: moduleRemark(posicion, module.nombre),
        numeroCliente: null,
        nombreCliente: null,
        nombreProducto: pieza.nombre,
        piezaCodigo: pieza.codigo,
        origen: pieza.editado ? "EDITADO" : "CALCULADO",
        orden: pieza.orden
      };
    })
  }));
  if (missing.size) {
    const faltantes = [...missing.values()].sort((a, b) => a.colorNombre.localeCompare(b.colorNombre, "es") || a.espesorMm - b.espesorMm);
    const problems = faltantes.map((item) => `Falta el canto de ${mm(item.espesorMm)} mm para "${item.colorNombre}".`);
    return failure("MISSING_EDGE_MATERIAL", problems, { faltantes }, `${problems.join(" ")} Cargalo en Materiales.`);
  }

  // 5. Encaje en la placa (spec §8.3), con la misma funcion que usa el optimizador (DECISIONES R2)
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
        `"${piezas[index].nombre}" del Modulo ${posicion} (${row.largo} × ${row.ancho} mm) no entra en la placa ${plate.nombre.trim()} (${usable.height} × ${usable.width} mm utiles)${
          girada ? ". Girada entraria: si la veta lo permite, marcala para rotar en el catalogo" : ""
        }.`
      );
    });
  }
  if (fitProblems.length) return failure("MODULE_PIECES_DO_NOT_FIT", [...new Set(fitProblems)]);

  return { ok: true, lines: planned };
}
