// Logica del asistente "Nueva solicitud de modulos" (spec §9.2) que no depende de React: fechas, tarjetas por
// unidad, validacion en vivo con el armador compartido (buildModulePieces), el pedido que se manda a la API,
// colores y cantos disponibles, y los cambios de canto del paso 4. Los numeros de placas y presupuesto NO se
// calculan aca: el paso 4 muestra solo lo que devuelve la vista previa del servidor (DECISIONES R3).
import { buildModulePieces, EDGE_SIDES, type CatalogModuleDef, type PieceEdges, type RoundingMode } from "./moduleFormula.ts";
import type { LadoCanto, Material, ModuleDefinition, ModuleOrderDetail, ModuleOrderLineInput, ModuleOrderPreview, PieceEdgeChoice } from "../types/index.ts";

/** Un modulo de la solicitud en el asistente: una tarjeta por unidad (spec §9.2 paso 3). */
export type WizardUnit = {
  uid: string;
  moduloId: string;
  /** Como se escriben en los campos, por clave en mayusculas. Vacio = sin cargar. */
  valores: Record<string, string>;
  colorEsqueletoId: string;
  colorFrentesId: string;
  perfilCantoOrden: 1 | 2;
  /** null = el fondo del catalogo (el del modulo o el de la configuracion, DECISIONES 32). */
  materialFondoId: string | null;
  observaciones: string;
  /**
   * Cantos elegidos a mano en el paso 4, por codigo de pieza (DECISIONES 45): solo los lados que se tocaron, con el
   * canto elegido o null (sin canto). Los demas lados llevan el de por defecto: el de la placa de la pieza.
   */
  cantosOverride: Record<string, PieceEdgeChoice>;
};

export type DefaultColors = { colorEsqueletoId: string; colorFrentesId: string };

let nextUid = 0;
export const newUnitUid = () => `modulo-${Date.now().toString(36)}-${++nextUid}`;

// ---------------------------------------------------------------- fechas (zona del negocio, DECISIONES 26)

const BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";
const ymdFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Hoy como AAAA-MM-DD en Argentina. */
export const todayInArgentina = (now = new Date()) => ymdFormatter.format(now);

/** Suma dias a una fecha AAAA-MM-DD, sin pasar por la hora local. */
export function addDays(ymd: string, days: number) {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Fecha de entrega por defecto: hoy + diasEntregaDefecto (spec §9.2 paso 1). */
export const defaultDeliveryDate = (diasEntregaDefecto: number, now = new Date()) => addDays(todayInArgentina(now), Math.max(0, diasEntregaDefecto));

// ---------------------------------------------------------------- materiales

const sameThickness = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const byName = (a: Material, b: Material) => a.nombre.trim().localeCompare(b.nombre.trim(), "es") || a.id.localeCompare(b.id);

/** Colores de esqueleto y frentes: placas activas del espesor de diseno del modulo (spec §8.6). */
export const designPlates = (materials: Material[], espesorDisenoMm: number) =>
  materials.filter((material) => material.tipo === "PLACA" && material.activo && sameThickness(material.espesorMm, espesorDisenoMm)).sort(byName);

/** Placas activas de cualquier espesor: para el fondo elegido. */
export const activePlates = (materials: Material[]) => materials.filter((material) => material.tipo === "PLACA" && material.activo).sort(byName);

/** Cantos activos, en el orden en que el servidor elige el de por defecto si hubiera dos iguales (por nombre e id). */
export const activeEdges = (materials: Material[]) =>
  materials
    .filter((material) => material.tipo === "CANTO" && material.activo)
    .sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** El modulo tiene piezas de fondo: muestra el selector de fondo (DECISIONES 32). */
export const hasBackPieces = (definition: Pick<ModuleDefinition, "piezas">) => definition.piezas.some((pieza) => pieza.rol === "FONDO");

// ---------------------------------------------------------------- tarjetas por unidad

const pedibles = (definition: Pick<ModuleDefinition, "parametros">) => definition.parametros.filter((param) => param.tipo !== "CALCULADO");
/**
 * Un valor del catalogo como se escribe en el campo: con coma decimal, para que "1.125" no parezca punto de miles. Las
 * opciones van como en el selector (String(valor)): no se escriben a mano.
 */
const defaultText = (param: Pick<ModuleDefinition["parametros"][number], "tipo" | "valorDefecto">) =>
  param.valorDefecto === null ? "" : param.tipo === "OPCION" ? String(param.valorDefecto) : String(param.valorDefecto).replace(".", ",");
const defaultProfile = (definition: Pick<ModuleDefinition, "perfiles">) =>
  (definition.perfiles.find((perfil) => perfil.predeterminado)?.orden ?? definition.perfiles[0]?.orden ?? 1) as 1 | 2;

/**
 * Una tarjeta nueva: medidas por defecto, perfil predeterminado y los colores por defecto que sirvan para el
 * modulo (el esqueleto y los frentes tienen que ser del espesor de diseno; si no, quedan sin elegir).
 */
export function newUnit(definition: ModuleDefinition, defaults: DefaultColors, materials: Material[]): WizardUnit {
  const design = new Set(designPlates(materials, definition.espesorDisenoMm).map((material) => material.id));
  return {
    uid: newUnitUid(),
    moduloId: definition.id,
    valores: Object.fromEntries(pedibles(definition).map((param) => [param.clave.toUpperCase(), defaultText(param)])),
    colorEsqueletoId: design.has(defaults.colorEsqueletoId) ? defaults.colorEsqueletoId : "",
    colorFrentesId: design.has(defaults.colorFrentesId) ? defaults.colorFrentesId : "",
    perfilCantoOrden: defaultProfile(definition),
    materialFondoId: null,
    observaciones: "",
    cantosOverride: {}
  };
}

/**
 * Las tarjetas para las cantidades elegidas (paso 2 -> 3): conserva las que ya estaban (con lo que se cargo), agrega
 * las que faltan y saca las de mas desde el final. Quedan agrupadas por modulo, en el orden en que se eligieron.
 */
export function syncUnits(
  units: WizardUnit[],
  quantities: Array<{ moduloId: string; cantidad: number }>,
  definitions: Map<string, ModuleDefinition>,
  defaults: DefaultColors,
  materials: Material[]
) {
  return quantities.flatMap(({ moduloId, cantidad }) => {
    const existing = units.filter((unit) => unit.moduloId === moduloId).slice(0, Math.max(0, cantidad));
    const definition = definitions.get(moduloId);
    const added = definition ? Array.from({ length: Math.max(0, cantidad - existing.length) }, () => newUnit(definition, defaults, materials)) : [];
    return [...existing, ...added];
  });
}

/**
 * Una tarjeta contra la definicion de hoy (borrador recuperado o catalogo que cambio con el asistente abierto):
 * descarta medidas y cambios de canto de piezas que el modulo ya no tiene (si no, la API responde 400,
 * DECISIONES 18), agrega las medidas nuevas con su valor por defecto, vuelve al perfil predeterminado si el elegido
 * ya no existe y saca el fondo elegido si el modulo ya no tiene piezas de fondo.
 */
export function sanitizeUnit(unit: WizardUnit, definition: ModuleDefinition): WizardUnit {
  const valores = Object.fromEntries(
    pedibles(definition).map((param) => {
      const clave = param.clave.toUpperCase();
      return [clave, clave in unit.valores ? unit.valores[clave] : defaultText(param)];
    })
  );
  const perfilCantoOrden = definition.perfiles.some((perfil) => perfil.orden === unit.perfilCantoOrden) ? unit.perfilCantoOrden : defaultProfile(definition);
  const materialFondoId = hasBackPieces(definition) ? unit.materialFondoId : null;
  return normalizeOverrides({ ...unit, valores, perfilCantoOrden, materialFondoId, cantosOverride: unit.cantosOverride ?? {} }, definition);
}

/**
 * Las tarjetas contra las definiciones recien traidas del catalogo: el servidor arma siempre con la definicion actual
 * (DECISIONES 25).
 * Saca las de modulos que ya no estan o no estan activos y limpia las demas con sanitizeUnit. Devuelve los nombres de
 * los modulos que cambiaron, para avisar.
 */
export function reconcileUnits(units: WizardUnit[], fresh: Map<string, ModuleDefinition | null>, previous: Map<string, ModuleDefinition>) {
  const quitados = new Set<string>();
  const cambiados = new Set<string>();
  const result: WizardUnit[] = [];
  for (const unit of units) {
    const definition = fresh.get(unit.moduloId);
    // Un modulo que no se volvio a traer queda como esta (no se sabe nada nuevo de el).
    if (definition === undefined) {
      result.push(unit);
      continue;
    }
    const nombre = definition?.nombre ?? previous.get(unit.moduloId)?.nombre ?? "un módulo";
    if (!definition || !definition.activo) {
      quitados.add(nombre);
      continue;
    }
    const clean = reconcileUnit(unit, definition, previous.get(unit.moduloId));
    if (JSON.stringify(clean) !== JSON.stringify(unit)) cambiados.add(nombre);
    result.push(clean);
  }
  return { units: result, quitados: [...quitados], cambiados: [...cambiados] };
}

/**
 * Una tarjeta contra la definicion nueva de su modulo. Los cambios de canto guardan solo los lados que se tocaron
 * (DECISIONES 45): los demas siguen al perfil y a la placa nuevos sin tener que pasarlos.
 */
export function reconcileUnit(unit: WizardUnit, definition: ModuleDefinition, _previous?: ModuleDefinition) {
  return sanitizeUnit(unit, definition);
}

/**
 * Limpia los colores que ya no sirven: esqueleto y frentes tienen que ser placas activas del espesor de diseno; el fondo
 * elegido, una placa activa; los cantos elegidos a mano, cantos activos. Lo que no sirve queda sin elegir (el fondo
 * vuelve al del catalogo y el canto, al de por defecto).
 */
export function withAvailableColors(unit: WizardUnit, definition: Pick<ModuleDefinition, "espesorDisenoMm">, materials: Material[]) {
  const design = new Set(designPlates(materials, definition.espesorDisenoMm).map((material) => material.id));
  const plates = new Set(activePlates(materials).map((material) => material.id));
  const edges = new Set(activeEdges(materials).map((material) => material.id));
  const colores = {
    colorEsqueletoId: design.has(unit.colorEsqueletoId) ? unit.colorEsqueletoId : "",
    colorFrentesId: design.has(unit.colorFrentesId) ? unit.colorFrentesId : "",
    materialFondoId: unit.materialFondoId && plates.has(unit.materialFondoId) ? unit.materialFondoId : null
  };
  let cantosChanged = false;
  const cantosOverride: Record<string, PieceEdgeChoice> = {};
  for (const [codigo, lados] of Object.entries(unit.cantosOverride)) {
    const kept = Object.fromEntries(Object.entries(lados).filter(([, cantoId]) => cantoId === null || edges.has(cantoId as string)));
    if (Object.keys(kept).length !== Object.keys(lados).length) cantosChanged = true;
    if (Object.keys(kept).length) cantosOverride[codigo] = kept;
  }
  const changed =
    colores.colorEsqueletoId !== unit.colorEsqueletoId ||
    colores.colorFrentesId !== unit.colorFrentesId ||
    colores.materialFondoId !== unit.materialFondoId ||
    cantosChanged;
  return { unit: changed ? { ...unit, ...colores, cantosOverride: cantosChanged ? cantosOverride : unit.cantosOverride } : unit, changed };
}

/** "Copiar medidas a los N iguales" (spec §9.2 paso 3): copia solo las medidas a las demas tarjetas del mismo modulo. */
export function copyMeasuresToSameModel(units: WizardUnit[], uid: string) {
  const source = units.find((unit) => unit.uid === uid);
  if (!source) return units;
  return units.map((unit) => (unit.uid !== uid && unit.moduloId === source.moduloId ? { ...unit, valores: { ...source.valores } } : unit));
}

/** "Aplicar a todos": pone los colores por defecto en cada tarjeta donde sirven (el esqueleto y los frentes, del espesor de diseno). */
export function applyColorsToAll(units: WizardUnit[], defaults: DefaultColors, definitions: Map<string, ModuleDefinition>, materials: Material[]) {
  return units.map((unit) => {
    const definition = definitions.get(unit.moduloId);
    if (!definition) return unit;
    const design = new Set(designPlates(materials, definition.espesorDisenoMm).map((material) => material.id));
    return {
      ...unit,
      colorEsqueletoId: design.has(defaults.colorEsqueletoId) ? defaults.colorEsqueletoId : unit.colorEsqueletoId,
      colorFrentesId: design.has(defaults.colorFrentesId) ? defaults.colorFrentesId : unit.colorFrentesId
    };
  });
}

// ---------------------------------------------------------------- validacion en vivo (paso 3)

/** Un numero bien escrito: digitos, con signo y decimales opcionales (coma o punto). El minimo y el maximo deciden el resto. */
const MEASURE_TEXT = /^-?\d+(?:[.,]\d+)?$/;
/** "1.200" o "12.000": en Argentina el punto separa los miles; se pide escribirlo sin punto para no leer 1,2 mm. */
const THOUSANDS_TEXT = /^-?[1-9]\d{0,2}(?:\.\d{3})+$/;

/** Que tiene de malo el texto de una medida, o null si esta bien o vacio (el vacio lo informa el motor: "Falta el valor"). */
export function measureTextError(text: string) {
  const value = text.trim();
  if (!value) return null;
  if (THOUSANDS_TEXT.test(value)) return `Escribí la medida sin punto de miles (por ejemplo ${value.replace(/\./g, "")})`;
  if (!MEASURE_TEXT.test(value)) return "Escribí solo el número, en mm";
  return null;
}

/**
 * Medidas como numeros. Un campo vacio o mal escrito (measureTextError) queda como NaN. Con la definicion, las opciones
 * (que vienen del catalogo, no se escriben) se leen tal cual.
 */
export function numericValues(unit: Pick<WizardUnit, "valores">, definition?: Pick<ModuleDefinition, "parametros">) {
  const opciones = new Set((definition?.parametros ?? []).filter((param) => param.tipo === "OPCION").map((param) => param.clave.toUpperCase()));
  return Object.fromEntries(
    Object.entries(unit.valores).map(([clave, text]) => {
      const value = text.trim();
      if (opciones.has(clave)) return [clave, value === "" ? Number.NaN : Number(value)];
      return [clave, value === "" || measureTextError(value) ? Number.NaN : Number(value.replace(",", "."))];
    })
  );
}

export type UnitValidation = {
  /** Errores por clave de medida, para mostrar debajo de cada campo. */
  porMedida: Record<string, string[]>;
  /** Errores de piezas o del modulo (formulas, perfil). */
  generales: string[];
  /** Colores sin elegir. */
  faltantes: string[];
  /** Que le falta al fondo (para marcar su selector), o null si esta bien. */
  fondo: string | null;
  ok: boolean;
};

/** Datos para revisar una tarjeta como el servidor (module-order-plan.ts): fondo y materiales fijos. */
export type UnitCheckContext = {
  /** Placas activas (activePlates): el fondo del catalogo y los materiales fijos tienen que estar entre ellas. */
  activePlateIds?: Set<string>;
  /** Fondo de la configuracion del catalogo (DECISIONES 31). */
  configFondoId?: string | null;
};

/**
 * Valida una tarjeta con el armador compartido y el redondeo de la configuracion, igual que el servidor
 * (DECISIONES R6). Con el contexto revisa tambien lo que el servidor revisa de los materiales: que haya un fondo y
 * materiales fijos activos. Los cantos no se validan: un lado sin canto de su color va sin canto (DECISIONES 45).
 * No calcula placas ni presupuesto: eso lo da la vista previa.
 */
export function validateUnit(unit: WizardUnit, definition: ModuleDefinition, redondeo: RoundingMode, context: UnitCheckContext = {}): UnitValidation {
  const result = buildModulePieces(definition as unknown as CatalogModuleDef, numericValues(unit, definition), {
    redondeo,
    perfilOrden: unit.perfilCantoOrden
  });
  const claves = new Set(pedibles(definition).map((param) => param.clave.toUpperCase()));
  const porMedida: Record<string, string[]> = {};
  const generales: string[] = [];
  for (const error of result.errores) {
    const ref = error.ref.toUpperCase();
    if (claves.has(ref)) porMedida[ref] = [...(porMedida[ref] ?? []), error.mensaje];
    else generales.push(`${error.ref}: ${error.mensaje}`);
  }
  // Un texto mal escrito no es "Falta el valor": se dice que tiene de malo. Las opciones vienen del catalogo: no se escriben.
  for (const param of pedibles(definition)) {
    if (param.tipo === "OPCION") continue;
    const clave = param.clave.toUpperCase();
    const textError = measureTextError(unit.valores[clave] ?? "");
    if (textError) porMedida[clave] = [textError];
  }
  // Si una medida esta mal, las piezas que la usan repiten el problema: alcanza con mostrarlo en la medida.
  const consequence = /^[A-Z0-9_]+: (Falta el valor de |Depende de )/;
  const visibles = Object.keys(porMedida).length ? generales.filter((message) => !consequence.test(message)) : generales;
  generales.splice(0, generales.length, ...visibles);
  const faltantes = [
    ...(unit.colorEsqueletoId ? [] : ["el color de esqueleto"]),
    ...(unit.colorFrentesId ? [] : ["el color de frentes"])
  ];
  const { activePlateIds, configFondoId = null } = context;
  // Fondo y materiales fijos, como el servidor: si no hay uno activo, la vista previa responde MODULE_MATERIAL_INVALID.
  const materiales: string[] = [];
  let fondo: string | null = null;
  if (activePlateIds) {
    if (unit.materialFondoId && !activePlateIds.has(unit.materialFondoId)) fondo = "el elegido ya no está activo";
    else if (!unit.materialFondoId && result.piezas.some((pieza) => pieza.rol === "FONDO")) {
      const catalogo = definition.materialFondoId ?? configFondoId;
      if (!catalogo) fondo = "el catálogo no tiene uno configurado";
      else if (!activePlateIds.has(catalogo)) fondo = "el del catálogo está inactivo";
    }
    if (fondo) faltantes.push(`el material de fondo (${fondo})`);
    for (const pieza of result.piezas.filter((item) => item.rol === "FIJO")) {
      if (!pieza.materialFijoId || !activePlateIds.has(pieza.materialFijoId)) materiales.push(`${pieza.codigo}: su material fijo no está activo. Revisalo en el catálogo de módulos.`);
    }
  }
  generales.push(...materiales);
  return {
    porMedida,
    generales,
    faltantes,
    fondo,
    ok: !result.errores.length && !Object.keys(porMedida).length && !faltantes.length && !materiales.length
  };
}

// ---------------------------------------------------------------- pedido para la API

/**
 * Un modulo como lo recibe la API, con los campos de spec §13.2 y nada mas (la API rechaza los desconocidos,
 * DECISIONES 17). Las medidas van como numeros y solo las que el modulo pide; el fondo y los cambios de canto, solo
 * si se eligieron; la version, solo al crear (la que mostro la vista previa).
 */
export function linePayload(unit: WizardUnit, definition: ModuleDefinition, version?: number): ModuleOrderLineInput {
  const numbers = numericValues(unit, definition);
  const valores = Object.fromEntries(
    pedibles(definition)
      .map((param) => param.clave.toUpperCase())
      .filter((clave) => Number.isFinite(numbers[clave]))
      .map((clave) => [clave, numbers[clave]])
  );
  const cantosOverride = normalizeOverrides(unit, definition).cantosOverride;
  const observaciones = unit.observaciones.trim();
  return {
    moduloId: unit.moduloId,
    valores,
    colorEsqueletoId: unit.colorEsqueletoId,
    colorFrentesId: unit.colorFrentesId,
    perfilCantoOrden: unit.perfilCantoOrden,
    ...(unit.materialFondoId ? { materialFondoId: unit.materialFondoId } : {}),
    ...(observaciones ? { observaciones } : {}),
    ...(Object.keys(cantosOverride).length ? { cantosOverride } : {}),
    ...(version !== undefined ? { version } : {})
  };
}

// ---------------------------------------------------------------- paso 4: despiece de la vista previa

/** Filas de la vista previa agrupadas por modulo (posicion 1..n). */
export function rowsByModule(preview: Pick<ModuleOrderPreview, "detalles">) {
  const groups = new Map<number, ModuleOrderDetail[]>();
  for (const row of preview.detalles) {
    const posicion = row.posicionModulo ?? 0;
    groups.set(posicion, [...(groups.get(posicion) ?? []), row]);
  }
  return groups;
}

const SIDE_FIELD: Record<LadoCanto, "cantoLargo1Id" | "cantoLargo2Id" | "cantoAncho1Id" | "cantoAncho2Id"> = {
  LARGO_1: "cantoLargo1Id",
  LARGO_2: "cantoLargo2Id",
  ANCHO_1: "cantoAncho1Id",
  ANCHO_2: "cantoAncho2Id"
};

/** Espesor de cada lado de una pieza en un perfil del catalogo: los mismos que usa el armador del servidor. */
export function profileEdges(definition: Pick<ModuleDefinition, "piezas">, perfilOrden: number, piezaCodigo: string): PieceEdges {
  const codigo = piezaCodigo.toUpperCase();
  const pieza = definition.piezas.find((item) => item.codigo.toUpperCase() === codigo);
  return Object.fromEntries(
    (EDGE_SIDES as readonly LadoCanto[]).map((lado) => [lado, pieza?.cantos.find((canto) => canto.perfilOrden === perfilOrden && canto.lado === lado)?.espesorMm ?? null])
  ) as PieceEdges;
}

/** Lo que hace falta para saber el canto por defecto de un lado, como el servidor (module-order-plan.ts). */
export type EdgeDefaultsContext = {
  /** Cantos activos (activeEdges). */
  cantos: Material[];
  /** Fondo de la configuracion del catalogo (DECISIONES 31). */
  configFondoId: string | null;
};

/** La placa de una pieza: esqueleto, frentes, fondo (el elegido, el del modulo o el de la configuracion) o su material fijo. */
export function pieceBoardId(unit: WizardUnit, definition: Pick<ModuleDefinition, "piezas" | "materialFondoId">, piezaCodigo: string, configFondoId: string | null) {
  const codigo = piezaCodigo.toUpperCase();
  const pieza = definition.piezas.find((item) => item.codigo.toUpperCase() === codigo);
  if (!pieza) return null;
  if (pieza.rol === "ESQUELETO") return unit.colorEsqueletoId || null;
  if (pieza.rol === "FRENTE") return unit.colorFrentesId || null;
  if (pieza.rol === "FONDO") return unit.materialFondoId ?? definition.materialFondoId ?? configFondoId ?? null;
  return pieza.materialFijoId ?? null;
}

/**
 * Canto por defecto de un lado (DECISIONES 45): el de la placa de la pieza con el espesor del perfil, o null si el
 * perfil no pide canto ahi o la placa no tiene uno de su color (entonces va sin canto).
 */
export function defaultEdgeId(
  unit: WizardUnit,
  definition: Pick<ModuleDefinition, "piezas" | "materialFondoId">,
  piezaCodigo: string,
  lado: LadoCanto,
  context: EdgeDefaultsContext
) {
  const espesor = profileEdges(definition, unit.perfilCantoOrden, piezaCodigo)[lado];
  const placaId = pieceBoardId(unit, definition, piezaCodigo, context.configFondoId);
  if (espesor === null || !placaId) return null;
  return context.cantos.find((canto) => canto.placaMaterialId === placaId && sameThickness(canto.espesorMm, espesor))?.id ?? null;
}

/** Lados elegidos a mano en una pieza. Una pieza con alguno queda "Editada" (origen EDITADO). */
export function changedSides(unit: WizardUnit, piezaCodigo: string): LadoCanto[] {
  const override = unit.cantosOverride[piezaCodigo.toUpperCase()];
  return override ? (EDGE_SIDES as readonly LadoCanto[]).filter((lado) => override[lado] !== undefined) : [];
}

/** Un valor guardado para un lado sirve si es el id de un canto (texto) o null (sin canto). */
const validChoice = (value: unknown) => value === null || (typeof value === "string" && value !== "");

/**
 * Limpia los cambios de canto: saca las piezas que el modulo ya no tiene, las de un borrador de antes de DECISIONES 45
 * (guardaba espesores) y los lados mal guardados. Con el contexto, saca tambien los lados que quedaron
 * iguales al de por defecto: el servidor los guardaria como CALCULADO y la pantalla los marcaria como cambiados.
 */
export function normalizeOverrides(unit: WizardUnit, definition: Pick<ModuleDefinition, "piezas" | "materialFondoId">, context?: EdgeDefaultsContext): WizardUnit {
  const codes = new Set(definition.piezas.map((pieza) => pieza.codigo.toUpperCase()));
  const entries = Object.entries(unit.cantosOverride ?? {});
  const result: Record<string, PieceEdgeChoice> = {};
  let changed = false;
  for (const [code, lados] of entries) {
    const codigo = code.toUpperCase();
    // Una pieza de un borrador de antes de DECISIONES 45 guardaba espesores por lado: se descarta entera (sus null eran
    // "sin canto" del perfil de entonces, no una eleccion de hoy).
    const viejo = Boolean(lados) && typeof lados === "object" && Object.values(lados).some((value) => typeof value === "number");
    if (!codes.has(codigo) || !lados || typeof lados !== "object" || viejo) {
      changed = true;
      continue;
    }
    const kept: PieceEdgeChoice = {};
    for (const [lado, value] of Object.entries(lados)) {
      const valid = (EDGE_SIDES as readonly string[]).includes(lado) && validChoice(value);
      const sameAsDefault = valid && context !== undefined && value === defaultEdgeId(unit, definition, codigo, lado as LadoCanto, context);
      if (valid && !sameAsDefault) kept[lado as LadoCanto] = value as string | null;
    }
    if (Object.keys(kept).length !== Object.keys(lados).length || codigo !== code) changed = true;
    if (Object.keys(kept).length) result[codigo] = kept;
  }
  return changed ? { ...unit, cantosOverride: result } : unit;
}

/**
 * Elige el canto de un lado de una pieza (paso 4): un canto, o null para dejarlo sin canto. Elegir el de por defecto
 * saca el cambio. Si el lado ya tenia ese canto devuelve la misma tarjeta (no hace falta recalcular).
 */
export function withEdgeChoice(
  unit: WizardUnit,
  definition: Pick<ModuleDefinition, "piezas" | "materialFondoId">,
  piezaCodigo: string,
  lado: LadoCanto,
  cantoId: string | null,
  context: EdgeDefaultsContext
): WizardUnit {
  const codigo = piezaCodigo.toUpperCase();
  const current = unit.cantosOverride[codigo] ?? {};
  const porDefecto = defaultEdgeId(unit, definition, codigo, lado, context);
  const actual = current[lado] !== undefined ? current[lado] : porDefecto;
  if (actual === cantoId) return unit;
  const { [lado]: _previo, ...rest } = current;
  const next: PieceEdgeChoice = cantoId === porDefecto ? rest : { ...rest, [lado]: cantoId };
  const { [codigo]: _pieza, ...others } = unit.cantosOverride;
  return { ...unit, cantosOverride: Object.keys(next).length ? { ...others, [codigo]: next } : others };
}

/** Vuelve una pieza a los cantos por defecto. */
export function withoutEdgeOverride(unit: WizardUnit, piezaCodigo: string): WizardUnit {
  const codigo = piezaCodigo.toUpperCase();
  if (!(codigo in unit.cantosOverride)) return unit;
  const { [codigo]: _removed, ...rest } = unit.cantosOverride;
  return { ...unit, cantosOverride: rest };
}

/** Resumen por material para el panel (solo datos de la vista previa): placas, piezas y m² (mm2 / 1.000.000). */
export function materialSummary(preview: Pick<ModuleOrderPreview, "estimacionDetalle">) {
  return preview.estimacionDetalle.porMaterial.map((item) => ({
    materialId: item.materialId,
    nombre: item.nombre.trim(),
    placas: item.placas,
    piezas: item.piezas,
    m2: item.mm2 === undefined ? null : item.mm2 / 1_000_000
  }));
}

/** Metros de canto por canto, con el nombre que trae la primera fila que lo usa. */
export function edgeSummary(preview: Pick<ModuleOrderPreview, "estimacionDetalle" | "detalles">) {
  const names = new Map<string, string>();
  for (const row of preview.detalles) {
    for (const lado of EDGE_SIDES as readonly LadoCanto[]) {
      const id = row[SIDE_FIELD[lado]];
      const nameField = SIDE_FIELD[lado].replace("Id", "Nombre") as "cantoLargo1Nombre";
      if (id && !names.has(id)) names.set(id, (row[nameField] ?? "").trim());
    }
  }
  return preview.estimacionDetalle.porCanto.map((item) => ({ cantoId: item.cantoId, nombre: names.get(item.cantoId) || "Canto", espesorMm: item.espesorMm, metros: item.mm / 1000 }));
}

export type { PieceEdges };

// ---------------------------------------------------------------- borrador (useFormDraft, spec §9.2)

/**
 * Lo que se guarda en el borrador: solo lo que cargo la persona. Nunca la vista previa, el catalogo ni las
 * versiones de los modulos (DECISIONES 25): al recuperar, se vuelve a calcular contra el catalogo de hoy.
 */
export type WizardDraft = {
  cliente: string;
  numeroContacto: string;
  emailContacto: string;
  direccionEntrega: string;
  fechaEntrega: string;
  observaciones: string;
  selecciones: Array<{ moduloId: string; cantidad: number }>;
  units: WizardUnit[];
  defaults: DefaultColors;
  step: number;
  /**
   * Un alta mandada sin saber todavia si entro (se corto la conexion o se cerro la pantalla mientras creaba). Con esto,
   * el proximo "Crear solicitud" revisa primero si ya existe, para no crearla dos veces.
   */
  enviado: SentMark | null;
};

/**
 * Un alta mandada sin saber todavia si entro: su clave (DECISIONES 40) y una huella de todo lo mandado
 * (orderSignature), para saber si despues se cambio algo. Con la misma huella se reintenta con la misma clave, y el
 * servidor devuelve la que ya entro.
 */
export type SentMark = { clave: string; firma: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const asSentMark = (value: unknown): SentMark | null => {
  const mark = value as Partial<SentMark> | null;
  if (!mark || typeof mark !== "object" || typeof mark.clave !== "string" || !UUID.test(mark.clave) || typeof mark.firma !== "string" || !mark.firma) return null;
  return { clave: mark.clave, firma: mark.firma };
};

/** Una clave de alta nueva (UUID v4). crypto.randomUUID solo existe en contextos seguros: si no esta, se arma a mano. */
export function newAltaKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Una huella corta (FNV-1a) de lo que se manda en el alta, sin versiones: si cambia, se cambio algo. */
export function orderSignature(payload: unknown) {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Un borrador vale la pena si se cargo algo: la fecha y los colores por defecto no cuentan. */
export function hasWizardContent(
  draft: Pick<WizardDraft, "cliente" | "numeroContacto" | "emailContacto" | "direccionEntrega" | "observaciones" | "selecciones"> | null | undefined
) {
  if (!draft) return false;
  const texts = [draft.cliente, draft.numeroContacto, draft.emailContacto, draft.direccionEntrega, draft.observaciones];
  return texts.some((value) => typeof value === "string" && value.trim() !== "") || (Array.isArray(draft.selecciones) && draft.selecciones.some((item) => item?.cantidad > 0));
}

/** Antiguedad del borrador, con el mismo texto que el formulario de corte. */
export function describeAge(savedAt: number, now = Date.now()) {
  const minutes = Math.floor((now - savedAt) / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} días`;
}

const asText = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Un borrador recuperado contra el catalogo y los materiales de hoy (puede tener hasta 7 dias):
 * - saca los modulos que ya no estan activos;
 * - limpia cada tarjeta (sanitizeUnit) y los colores o el fondo que ya no sirven;
 * - si la fecha de entrega quedo en el pasado, pone la de por defecto;
 * - nunca vuelve directo al paso 4: no hay vista previa en memoria (vuelve al paso 3).
 * Devuelve tambien los avisos para mostrar.
 */
export function restoreWizardDraft(
  raw: Partial<WizardDraft>,
  context: { definitions: Map<string, ModuleDefinition>; materials: Material[]; today: string; defaultFecha: string }
): { draft: WizardDraft; avisos: string[] } {
  const avisos: string[] = [];
  const { definitions, materials } = context;
  const plates = new Set(activePlates(materials).map((material) => material.id));
  let cantosViejos = false;
  const selecciones = (Array.isArray(raw.selecciones) ? raw.selecciones : []).filter(
    (item) => item && typeof item.moduloId === "string" && Number.isInteger(item.cantidad) && item.cantidad > 0
  );
  const disponibles = selecciones.filter((item) => definitions.get(item.moduloId)?.activo);
  if (disponibles.length < selecciones.length) avisos.push("Se quitaron módulos que ya no están en el catálogo o están inactivos.");

  let coloresLimpios = false;
  const units = (Array.isArray(raw.units) ? raw.units : [])
    .filter((unit) => unit && disponibles.some((item) => item.moduloId === unit.moduloId))
    .map((unit) => {
      const definition = definitions.get(unit.moduloId)!;
      const base: WizardUnit = {
        uid: asText(unit.uid) || newUnitUid(),
        moduloId: unit.moduloId,
        valores: unit.valores && typeof unit.valores === "object" ? unit.valores : {},
        colorEsqueletoId: asText(unit.colorEsqueletoId),
        colorFrentesId: asText(unit.colorFrentesId),
        perfilCantoOrden: unit.perfilCantoOrden === 2 ? 2 : 1,
        materialFondoId: typeof unit.materialFondoId === "string" ? unit.materialFondoId : null,
        observaciones: asText(unit.observaciones),
        cantosOverride: unit.cantosOverride && typeof unit.cantosOverride === "object" ? unit.cantosOverride : {}
      };
      // Un borrador de antes de DECISIONES 45 guardaba espesores por lado: esos cambios no se pueden recuperar.
      const sanitized = sanitizeUnit(base, definition);
      if (JSON.stringify(sanitized.cantosOverride) !== JSON.stringify(Object.fromEntries(Object.entries(base.cantosOverride).map(([codigo, lados]) => [codigo.toUpperCase(), lados])))) {
        cantosViejos = true;
      }
      const { unit: clean, changed } = withAvailableColors(sanitized, definition, materials);
      if (changed) coloresLimpios = true;
      return clean;
    });
  if (coloresLimpios) avisos.push("Algunos colores, fondos o cantos ya no están disponibles: elegilos de nuevo.");
  if (cantosViejos) avisos.push("Algunos cantos cambiados a mano no se pudieron recuperar: revisalos en el paso 4.");

  let fechaEntrega = asText(raw.fechaEntrega);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega) || fechaEntrega < context.today) {
    if (fechaEntrega) avisos.push("La fecha de entrega del borrador ya pasó: se puso la de por defecto.");
    fechaEntrega = context.defaultFecha;
  }
  const defaults = raw.defaults ?? { colorEsqueletoId: "", colorFrentesId: "" };
  const color = (value: unknown) => (plates.has(asText(value)) ? asText(value) : "");
  return {
    draft: {
      cliente: asText(raw.cliente),
      numeroContacto: asText(raw.numeroContacto),
      emailContacto: asText(raw.emailContacto),
      direccionEntrega: asText(raw.direccionEntrega),
      fechaEntrega,
      observaciones: asText(raw.observaciones),
      selecciones: disponibles,
      units,
      defaults: { colorEsqueletoId: color(defaults.colorEsqueletoId), colorFrentesId: color(defaults.colorFrentesId) },
      step: Math.max(0, Math.min(typeof raw.step === "number" ? raw.step : 0, disponibles.length ? 2 : 1)),
      enviado: asSentMark(raw.enviado)
    },
    avisos
  };
}

/** Largos maximos del alta (backend module-orders.schemas.ts). */
export const MAX_DIRECCION = 300;
export const MAX_REFERENCIA = 1000;
/** La misma expresion que usa zod 3 para .email() en el alta: lo que pasa aca, pasa alla. */
const ZOD_EMAIL = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;

/** Un dia que existe (AAAA-MM-DD), como z.string().date(). */
export function isValidDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Validacion del paso 1, con las mismas reglas que el alta de la API: no deja llegar al paso 4 con algo que el alta rechaza. */
export function validateClient(
  data: Pick<WizardDraft, "cliente" | "numeroContacto" | "emailContacto" | "fechaEntrega"> & Partial<Pick<WizardDraft, "direccionEntrega" | "observaciones">>,
  today: string
) {
  const problems: string[] = [];
  if (data.cliente.trim().length < 2) problems.push("Completá el cliente (al menos 2 caracteres).");
  if (data.numeroContacto.trim().length < 6) problems.push("Completá el teléfono (al menos 6 caracteres).");
  if (data.emailContacto.trim() && !ZOD_EMAIL.test(data.emailContacto.trim())) problems.push("El email no es válido.");
  if ((data.direccionEntrega ?? "").trim().length > MAX_DIRECCION) problems.push(`La dirección de entrega tiene como máximo ${MAX_DIRECCION} caracteres.`);
  if ((data.observaciones ?? "").trim().length > MAX_REFERENCIA) problems.push(`La referencia del trabajo tiene como máximo ${MAX_REFERENCIA} caracteres.`);
  if (!isValidDay(data.fechaEntrega)) problems.push("Elegí la fecha de entrega.");
  else if (data.fechaEntrega < today) problems.push("La fecha de entrega no puede ser anterior a hoy.");
  return problems;
}
