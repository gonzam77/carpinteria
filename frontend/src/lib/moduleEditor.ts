// Logica del editor del catalogo de modulos (spec §6.2) que no depende de React: el borrador, los cantos por
// perfil, las referencias entre formulas, el autocompletado y la advertencia de encaje en la placa.
// Las medidas de las piezas NO se calculan aca: salen de evaluateModuleDefinition (moduleFormula.ts), y el
// encaje usa findPiecesThatDoNotFit del optimizador (DECISIONES R2 y R6), igual que el resto del sistema.
import { findPiecesThatDoNotFit } from "./cutOptimizer.ts";
import { collectRefs, FORMULA_CONSTANTS, FORMULA_FUNCTIONS, parseFormula, validateIdentifier, type ParamOption } from "./moduleFormula.ts";
import { usableBoardSize, type EstimateOptimizerSettings } from "./orderEstimate.ts";
import type { EspesorCanto, LadoCanto, ModuleDefinition, ModuleInput, ModuleParameter, ModulePiece } from "../types/index.ts";

export type DraftParameter = ModuleParameter & { uid: string };
export type DraftPiece = ModulePiece & { uid: string };
export type ModuleDraft = Omit<ModuleInput, "parametros" | "piezas"> & { parametros: DraftParameter[]; piezas: DraftPiece[] };

let nextUid = 0;
/** Identificador local de una fila del editor (React necesita una clave estable aunque cambie el codigo). */
export const newUid = () => `fila-${++nextUid}`;

export const LADOS: LadoCanto[] = ["LARGO_1", "LARGO_2", "ANCHO_1", "ANCHO_2"];
export const LADO_CORTO: Record<LadoCanto, string> = { LARGO_1: "L1", LARGO_2: "L2", ANCHO_1: "A1", ANCHO_2: "A2" };
export const LADO_NOMBRE: Record<LadoCanto, string> = { LARGO_1: "Largo 1", LARGO_2: "Largo 2", ANCHO_1: "Ancho 1", ANCHO_2: "Ancho 2" };
export const ESPESORES_CANTO: EspesorCanto[] = [0.45, 1, 2];

export function draftFromDefinition(definition: ModuleDefinition): ModuleDraft {
  return {
    codigo: definition.codigo,
    nombre: definition.nombre,
    categoriaId: definition.categoriaId,
    descripcion: definition.descripcion,
    activo: definition.activo,
    espesorDisenoMm: definition.espesorDisenoMm,
    materialFondoId: definition.materialFondoId,
    observaciones: definition.observaciones,
    parametros: definition.parametros.map((param) => ({ ...param, uid: newUid() })),
    perfiles: definition.perfiles.map((perfil) => ({ ...perfil })),
    piezas: definition.piezas.map((pieza) => ({ ...pieza, cantos: pieza.cantos.map((canto) => ({ ...canto })), uid: newUid() })),
    herrajes: definition.herrajes.map((herraje) => ({ ...herraje }))
  };
}

/** Modulo nuevo: inactivo (se puede guardar como borrador), con las tres medidas de siempre y un perfil. */
export function newModuleDraft(categoriaId: string): ModuleDraft {
  const medida = (clave: string, etiqueta: string, orden: number): DraftParameter => ({
    uid: newUid(),
    clave,
    etiqueta,
    tipo: "MEDIDA",
    valorDefecto: null,
    minimo: null,
    maximo: null,
    opciones: null,
    formula: null,
    ayuda: null,
    orden
  });
  return {
    codigo: "",
    nombre: "",
    categoriaId,
    descripcion: null,
    activo: false,
    espesorDisenoMm: 18,
    materialFondoId: null,
    observaciones: null,
    parametros: [medida("ANCHO", "Ancho", 1), medida("ALTO", "Alto", 2), medida("PROFUNDIDAD", "Profundidad", 3)],
    perfiles: [{ orden: 1, nombre: "Estandar", descripcion: null, predeterminado: true }],
    piezas: [],
    herrajes: []
  };
}

export function newPiece(existing: DraftPiece[]): DraftPiece {
  const codes = new Set(existing.map((pieza) => pieza.codigo));
  let index = existing.length + 1;
  while (codes.has(`PIEZA_${index}`)) index++;
  return {
    uid: newUid(),
    codigo: `PIEZA_${index}`,
    nombre: `Pieza ${index}`,
    rol: "ESQUELETO",
    materialFijoId: null,
    formulaLargo: "",
    formulaAncho: "",
    formulaCantidad: "1",
    permiteRotar: false,
    orden: index,
    observaciones: null,
    cantos: []
  };
}

export function newParameter(existing: DraftParameter[]): DraftParameter {
  const claves = new Set(existing.map((param) => param.clave));
  let index = existing.length + 1;
  while (claves.has(`MEDIDA_${index}`)) index++;
  return {
    uid: newUid(),
    clave: `MEDIDA_${index}`,
    etiqueta: `Medida ${index}`,
    tipo: "MEDIDA",
    valorDefecto: null,
    minimo: null,
    maximo: null,
    opciones: null,
    formula: null,
    ayuda: null,
    orden: index
  };
}

const text = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
};

/** El borrador como lo recibe la API: sin claves locales, con el orden de la pantalla y solo los datos que usa cada tipo. */
export function draftToInput(draft: ModuleDraft): ModuleInput {
  const perfiles = [...draft.perfiles].sort((a, b) => a.orden - b.orden);
  const perfilOrdenes = new Set(perfiles.map((perfil) => perfil.orden));
  return {
    codigo: draft.codigo.trim().toUpperCase(),
    nombre: draft.nombre.trim(),
    categoriaId: draft.categoriaId,
    descripcion: text(draft.descripcion),
    activo: draft.activo,
    espesorDisenoMm: Number(draft.espesorDisenoMm),
    materialFondoId: draft.materialFondoId || null,
    observaciones: text(draft.observaciones),
    parametros: draft.parametros.map(({ uid: _uid, ...param }, index) => {
      const calculado = param.tipo === "CALCULADO";
      return {
        ...param,
        clave: param.clave.trim().toUpperCase(),
        etiqueta: param.etiqueta.trim(),
        valorDefecto: calculado ? null : param.valorDefecto,
        minimo: calculado ? null : param.minimo,
        maximo: calculado ? null : param.maximo,
        opciones: param.tipo === "OPCION" ? (param.opciones ?? []) : null,
        formula: calculado ? (param.formula ?? "").trim() : null,
        ayuda: text(param.ayuda),
        orden: index + 1
      };
    }),
    perfiles: perfiles.map((perfil) => ({ ...perfil, nombre: perfil.nombre.trim(), descripcion: text(perfil.descripcion) })),
    piezas: draft.piezas.map(({ uid: _uid, ...pieza }, index) => ({
      ...pieza,
      codigo: pieza.codigo.trim().toUpperCase(),
      nombre: pieza.nombre.trim(),
      materialFijoId: pieza.rol === "FIJO" ? pieza.materialFijoId || null : null,
      formulaLargo: pieza.formulaLargo.trim(),
      formulaAncho: pieza.formulaAncho.trim(),
      formulaCantidad: pieza.formulaCantidad.trim(),
      orden: index + 1,
      observaciones: text(pieza.observaciones),
      cantos: pieza.cantos
        .filter((canto) => perfilOrdenes.has(canto.perfilOrden))
        .sort((a, b) => a.perfilOrden - b.perfilOrden || LADOS.indexOf(a.lado) - LADOS.indexOf(b.lado))
    })),
    herrajes: draft.herrajes.map((herraje, index) => ({ ...herraje, orden: index + 1 }))
  };
}

// ---------------------------------------------------------------- cantos por perfil

export function edgeOf(pieza: ModulePiece, perfilOrden: 1 | 2, lado: LadoCanto): EspesorCanto | null {
  return pieza.cantos.find((canto) => canto.perfilOrden === perfilOrden && canto.lado === lado)?.espesorMm ?? null;
}

export function withEdge<T extends ModulePiece>(pieza: T, perfilOrden: 1 | 2, lado: LadoCanto, espesorMm: EspesorCanto | null): T {
  const cantos = pieza.cantos.filter((canto) => !(canto.perfilOrden === perfilOrden && canto.lado === lado));
  return { ...pieza, cantos: espesorMm === null ? cantos : [...cantos, { perfilOrden, lado, espesorMm }] };
}

/** "Copiar Perfil A a B": el perfil de destino queda igual al de origen en todas las piezas. */
export function copyProfileEdges<T extends ModulePiece>(piezas: T[], from: 1 | 2, to: 1 | 2): T[] {
  return piezas.map((pieza) => ({
    ...pieza,
    cantos: [
      ...pieza.cantos.filter((canto) => canto.perfilOrden !== to),
      ...pieza.cantos.filter((canto) => canto.perfilOrden === from).map((canto) => ({ ...canto, perfilOrden: to }))
    ]
  }));
}

export function removeProfileEdges<T extends ModulePiece>(piezas: T[], perfilOrden: 1 | 2): T[] {
  return piezas.map((pieza) => ({ ...pieza, cantos: pieza.cantos.filter((canto) => canto.perfilOrden !== perfilOrden) }));
}

// ---------------------------------------------------------------- formulas y referencias

/** Error de sintaxis de una formula, o null si se puede leer. Los errores de calculo los da la evaluacion. */
export function formulaSyntaxError(src: string): string | null {
  try {
    parseFormula(src);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function refsOf(src: string | null | undefined) {
  try {
    return src?.trim() ? collectRefs(parseFormula(src)) : [];
  } catch {
    return [];
  }
}

/**
 * Medidas y piezas cuyas formulas usan `name` (una clave de medida o un codigo de pieza). Sirve para avisar
 * que se rompe al borrar algo y para actualizar las formulas al renombrar.
 */
export function dependentsOf(draft: Pick<ModuleDraft, "parametros" | "piezas">, name: string): string[] {
  const target = name.trim().toUpperCase();
  if (!target) return [];
  const uses = (...formulas: Array<string | null>) => formulas.some((formula) => refsOf(formula).some((ref) => ref.id === target));
  return [
    ...draft.parametros.filter((param) => param.tipo === "CALCULADO" && param.clave !== target && uses(param.formula)).map((param) => param.clave),
    ...draft.piezas.filter((pieza) => pieza.codigo !== target && uses(pieza.formulaLargo, pieza.formulaAncho, pieza.formulaCantidad)).map((pieza) => pieza.codigo)
  ];
}

const IDENTIFIER_IN_FORMULA = /(?<![A-Za-z0-9_.])[A-Za-z_][A-Za-z0-9_]*/g;

/** Cambia las referencias a `from` por `to` en una formula. No toca funciones (SI, MIN...) ni accesores (.largo). */
export function renameInFormula(src: string, from: string, to: string) {
  const source = from.trim().toUpperCase();
  return src.replace(IDENTIFIER_IN_FORMULA, (match, offset: number) => {
    if (match.toUpperCase() !== source) return match;
    const rest = src.slice(offset + match.length).trimStart();
    return rest.startsWith("(") ? match : to;
  });
}

/** Renombra una medida o una pieza y actualiza las formulas que la usan. Devuelve el borrador y cuantas formulas cambiaron. */
export function renameEverywhere(draft: ModuleDraft, from: string, to: string): { draft: ModuleDraft; cambiadas: number } {
  let cambiadas = 0;
  const update = (src: string) => {
    const next = renameInFormula(src, from, to);
    if (next !== src) cambiadas++;
    return next;
  };
  return {
    draft: {
      ...draft,
      parametros: draft.parametros.map((param) => (param.tipo === "CALCULADO" && param.formula ? { ...param, formula: update(param.formula) } : param)),
      piezas: draft.piezas.map((pieza) => ({
        ...pieza,
        formulaLargo: update(pieza.formulaLargo),
        formulaAncho: update(pieza.formulaAncho),
        formulaCantidad: update(pieza.formulaCantidad)
      }))
    },
    cambiadas
  };
}

/** Problema con la clave de una medida o el codigo de una pieza (formato, reservada o repetida), o null. */
export function identifierProblem(name: string, allNames: string[]) {
  const normalized = name.trim().toUpperCase();
  if (!normalized) return "Completalo";
  const problem = validateIdentifier(normalized);
  if (problem) return problem;
  return allNames.filter((other) => other.trim().toUpperCase() === normalized).length > 1 ? "Ya hay una medida o pieza con este nombre" : null;
}

// ---------------------------------------------------------------- autocompletado

export type FormulaSuggestion = { insert: string; label: string; detail: string };

export function formulaSuggestions(draft: Pick<ModuleDraft, "parametros" | "piezas">): FormulaSuggestion[] {
  return [
    ...draft.parametros.filter((param) => param.clave).map((param) => ({ insert: param.clave, label: param.clave, detail: param.etiqueta || "Medida" })),
    ...draft.piezas
      .filter((pieza) => pieza.codigo)
      .flatMap((pieza) =>
        (["largo", "ancho", "cant"] as const).map((acc) => ({ insert: `${pieza.codigo}.${acc}`, label: `${pieza.codigo}.${acc}`, detail: pieza.nombre || "Pieza" }))
      ),
    ...FORMULA_CONSTANTS.map((constante) => ({ insert: constante, label: constante, detail: "Espesor de diseño" })),
    ...FORMULA_FUNCTIONS.map((fn) => ({ insert: `${fn}(`, label: `${fn}(...)`, detail: "Función" }))
  ];
}

/** La palabra que se esta escribiendo justo antes del cursor (puede incluir ".largo"), o null. */
export function wordAtCaret(src: string, caret: number): { start: number; word: string } | null {
  const match = /[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z]*)?$/.exec(src.slice(0, caret));
  if (!match) return null;
  const before = src[match.index - 1];
  if (before && /[0-9.]/.test(before)) return null; // parte de un numero o de un accesor
  return { start: match.index, word: match[0] };
}

export function matchSuggestions(all: FormulaSuggestion[], word: string, limit = 8) {
  const prefix = word.toUpperCase();
  return all.filter((item) => item.insert.toUpperCase().startsWith(prefix) && item.insert.toUpperCase() !== prefix).slice(0, limit);
}

// ---------------------------------------------------------------- opciones de una medida

export function formatOptionsText(opciones: ParamOption[] | null) {
  return (opciones ?? []).map((option) => `${option.valor} = ${option.etiqueta}`).join("\n");
}

/** Una opcion por linea: "1 = Puerta larga abajo". */
export function parseOptionsText(src: string): { opciones: ParamOption[]; error: string | null } {
  const opciones: ParamOption[] = [];
  for (const [index, line] of src.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*[=:]\s*(.+?)\s*$/.exec(line);
    if (!match) return { opciones, error: `Línea ${index + 1}: escribila como "1 = Descripción"` };
    const valor = Number(match[1]);
    if (opciones.some((option) => option.valor === valor)) return { opciones, error: `El valor ${valor} está repetido` };
    opciones.push({ valor, etiqueta: match[2] });
  }
  return { opciones, error: opciones.length ? null : "Agregá al menos una opción" };
}

/** Medida en mm para mostrar: sin separador de miles (1200, no 1.200) y con coma decimal. */
export const formatMm = (value: number) => value.toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });

function plateNames(nombres: string[]) {
  const clean = nombres.map((nombre) => nombre.trim());
  return clean.length <= 4 ? clean.join(", ") : `${clean.slice(0, 3).join(", ")} y ${clean.length - 3} placas más`;
}

// ---------------------------------------------------------------- encaje en la placa

export type FitPlate = { id: string; nombre: string; anchoPlaca: number | null; altoPlaca: number | null };
export type FitPiece = { codigo: string; nombre: string; largo: number; ancho: number; permiteRotar: boolean; placas: FitPlate[] };
export type FitWarning = { codigo: string; mensaje: string };

/**
 * Piezas que no entran en alguna de las placas en las que se pueden cortar, con la misma funcion de encaje que
 * usa el optimizador (perfilado de borde y rotacion incluidos). Las placas se agrupan por tamano util. Pieza y placa
 * se muestran igual, largo × ancho: el largo de la pieza va contra el alto de la placa (DECISIONES 0.7).
 */
export function fitWarnings(pieces: FitPiece[], settings: EstimateOptimizerSettings): FitWarning[] {
  return pieces.flatMap((piece) => {
    const groups = new Map<string, { width: number; height: number; nombres: string[] }>();
    for (const plate of piece.placas) {
      if (!plate.anchoPlaca || !plate.altoPlaca) continue;
      const usable = usableBoardSize(plate, settings);
      const key = `${usable.width}x${usable.height}`;
      const group = groups.get(key) ?? { ...usable, nombres: [] };
      group.nombres.push(plate.nombre);
      groups.set(key, group);
    }
    const row = { largo: piece.largo, ancho: piece.ancho, cantidad: 1, permiteRotar: piece.permiteRotar };
    const fits = (candidate: typeof row, group: { width: number; height: number }) => findPiecesThatDoNotFit([candidate], group.width, group.height).length === 0;
    return [...groups.values()]
      .filter((group) => !fits(row, group))
      .map((group) => ({
        codigo: piece.codigo,
        mensaje: `"${piece.nombre}" (${piece.largo} × ${piece.ancho} mm) no entra en ${plateNames(group.nombres)} (${group.height} × ${group.width} mm útiles)${
          !piece.permiteRotar && fits({ ...row, permiteRotar: true }, group) ? ". Girada entraría: si la veta lo permite, marcala para rotar" : ""
        }.`
      }));
  });
}

/** Codigo sugerido a partir del nombre: "Bajo mesada 2 puertas" -> "BAJO_MESADA_2_PUERTAS". */
export function codeFromName(nombre: string) {
  const code = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[A-Z]/.test(code) ? code : code ? `M_${code}` : "";
}
