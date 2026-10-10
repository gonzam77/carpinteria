// El Excel de la maquina de corte (spec §11.1): las columnas, la fila de cada pieza y los ajustes a mano de una solicitud
// de modulos (punto 5, 2026-10-09). Lo usan la exportacion (excel.service.ts) y la pestaña "Excel de corte" del detalle,
// asi lo que se ve en pantalla es exactamente lo que sale en el archivo. Sin base de datos: se prueba solo.

/** Las columnas de siempre, en el orden de la maquina. No cambian (las solicitudes de corte salen igual que antes). */
export const MACHINE_COLUMNS = [
  { header: "codigo barra", key: "codigo barra" },
  { header: "Material", key: "Material" },
  { header: "largo", key: "largo" },
  { header: "ancho", key: "ancho" },
  { header: "cantidad", key: "cantidad" },
  { header: "", key: "blank1" },
  { header: "", key: "blank2" },
  { header: "", key: "blank3" },
  { header: "", key: "blank4" },
  { header: "canto largo 1", key: "canto largo 1" },
  { header: "canto largo 2", key: "canto largo 2" },
  { header: "canto ancho 1", key: "canto ancho 1" },
  { header: "canto ancho 2", key: "canto ancho 2" },
  { header: "permite rotar", key: "permite rotar" },
  { header: "codigo barra centro p", key: "codigo barra centro p" },
  { header: "Remark", key: "Remark" },
  { header: "numero cliente", key: "numero cliente" },
  { header: "nombre cliente", key: "nombre cliente" },
  { header: "nombre producto", key: "nombre producto" }
] as const;

export type MachineKey = (typeof MACHINE_COLUMNS)[number]["key"];
export type MachineValue = string | number;
export type MachineRow = Record<string, MachineValue>;

const MACHINE_KEYS = new Set<string>(MACHINE_COLUMNS.map((column) => column.key));
/** Las que van como numero en el Excel. */
const NUMERIC_KEYS = new Set<string>(["largo", "ancho", "cantidad"]);
/**
 * Las que cambian lo que se corta: si se tocan, el Excel ya no coincide con el presupuesto, el plano ni la reserva de
 * stock (se avisa, punto 5).
 */
export const CRITICAL_KEYS = new Set<string>(["Material", "largo", "ancho", "cantidad", "canto largo 1", "canto largo 2", "canto ancho 1", "canto ancho 2", "permite rotar"]);

type MachineDetail = {
  codigoBarra: string;
  material: string;
  largo: number;
  ancho: number;
  cantidad: number;
  cantoLargo1: boolean;
  cantoLargo2: boolean;
  cantoAncho1: boolean;
  cantoAncho2: boolean;
  cantoLargo1Nombre?: string | null;
  cantoLargo2Nombre?: string | null;
  cantoAncho1Nombre?: string | null;
  cantoAncho2Nombre?: string | null;
  permiteRotar: boolean;
  codigoBarraCentro?: string | null;
  remark?: string | null;
  numeroCliente?: string | null;
  nombreCliente?: string | null;
  nombreProducto?: string | null;
};

const canto = (value: boolean, nombre?: string | null) => (value ? nombre || "Canto" : "");

/** La fila de una pieza, como va al Excel (las columnas vacias de la maquina no se completan). */
export function machineRow(detail: MachineDetail): MachineRow {
  return {
    "codigo barra": detail.codigoBarra,
    Material: detail.material,
    largo: detail.largo,
    ancho: detail.ancho,
    cantidad: detail.cantidad,
    "canto largo 1": canto(detail.cantoLargo1, detail.cantoLargo1Nombre),
    "canto largo 2": canto(detail.cantoLargo2, detail.cantoLargo2Nombre),
    "canto ancho 1": canto(detail.cantoAncho1, detail.cantoAncho1Nombre),
    "canto ancho 2": canto(detail.cantoAncho2, detail.cantoAncho2Nombre),
    "permite rotar": detail.permiteRotar ? "true" : "false",
    "codigo barra centro p": detail.codigoBarraCentro ?? "",
    Remark: detail.remark ?? "",
    "numero cliente": detail.numeroCliente ?? "",
    "nombre cliente": detail.nombreCliente ?? "",
    "nombre producto": detail.nombreProducto ?? ""
  };
}

// ---------------------------------------------------------------- ajustes a mano (solicitudes de modulos)

/** Una columna agregada a mano: su contenido va tal cual al Excel. */
export type ExtraColumn = { id: string; titulo: string };
/**
 * Lo que se ajusto a mano del Excel de una solicitud (Pedido.excelCorte): las columnas agregadas y, por codigo de barra
 * de la fila, el valor de cada celda cambiada o de cada columna agregada. Las filas se reconocen por su codigo de barra,
 * que no cambia al editar la solicitud.
 */
export type ExcelAdjustments = { version: 1; columnas: ExtraColumn[]; celdas: Record<string, Record<string, string>> };

export const emptyAdjustments = (): ExcelAdjustments => ({ version: 1, columnas: [], celdas: {} });

/** Lo guardado en la base, o vacio si no hay (o si no tiene la forma esperada). */
export function readAdjustments(value: unknown): ExcelAdjustments {
  if (!value || typeof value !== "object") return emptyAdjustments();
  const raw = value as Partial<ExcelAdjustments>;
  return {
    version: 1,
    columnas: Array.isArray(raw.columnas) ? raw.columnas.filter((column) => column && typeof column.id === "string" && typeof column.titulo === "string") : [],
    celdas: raw.celdas && typeof raw.celdas === "object" ? raw.celdas : {}
  };
}

/** El valor de una celda como va al Excel: largo, ancho y cantidad como numero si se puede leer como numero. */
function cellValue(key: string, text: string): MachineValue {
  if (NUMERIC_KEYS.has(key)) {
    const number = Number(text.trim().replace(",", "."));
    if (text.trim() !== "" && Number.isFinite(number)) return number;
  }
  return text;
}

const sameValue = (a: MachineValue, b: MachineValue) => String(a) === String(b);

/** Las filas con los ajustes aplicados: las celdas cambiadas y las columnas agregadas (vacias si no tienen valor). */
export function applyAdjustments(rows: MachineRow[], adjustments: ExcelAdjustments): MachineRow[] {
  return rows.map((row) => {
    const own = adjustments.celdas[String(row["codigo barra"])] ?? {};
    const next: MachineRow = { ...row };
    for (const [key, text] of Object.entries(own)) {
      if (MACHINE_KEYS.has(key)) next[key] = cellValue(key, text);
    }
    for (const column of adjustments.columnas) next[column.id] = own[column.id] ?? "";
    return next;
  });
}

/**
 * Lo que se guarda: solo las filas que siguen en la solicitud, las celdas que quedaron distintas del valor de la pieza,
 * y los valores de las columnas agregadas que existen y no estan vacios.
 */
export function normalizeAdjustments(input: { columnas: ExtraColumn[]; celdas: Record<string, Record<string, string>> }, baseRows: MachineRow[]): ExcelAdjustments {
  const base = new Map(baseRows.map((row) => [String(row["codigo barra"]), row]));
  const extraIds = new Set(input.columnas.map((column) => column.id));
  const celdas: ExcelAdjustments["celdas"] = {};
  for (const [clave, cells] of Object.entries(input.celdas)) {
    const row = base.get(clave);
    if (!row) continue;
    const kept: Record<string, string> = {};
    for (const [key, text] of Object.entries(cells)) {
      if (MACHINE_KEYS.has(key) && !sameValue(cellValue(key, text), row[key])) kept[key] = text;
      else if (extraIds.has(key) && text.trim() !== "") kept[key] = text;
    }
    if (Object.keys(kept).length) celdas[clave] = kept;
  }
  return { version: 1, columnas: input.columnas.map((column) => ({ id: column.id, titulo: column.titulo.trim() })), celdas };
}

/** Las celdas de la maquina cambiadas (sin contar las columnas agregadas) y si alguna cambia lo que se corta. */
export function adjustedCells(adjustments: ExcelAdjustments) {
  let total = 0;
  let critical = 0;
  for (const cells of Object.values(adjustments.celdas)) {
    for (const key of Object.keys(cells)) {
      if (!MACHINE_KEYS.has(key)) continue;
      total += 1;
      if (CRITICAL_KEYS.has(key)) critical += 1;
    }
  }
  return { total, critical };
}

const plural = (count: number, singular: string, pluralText: string) => `${count} ${count === 1 ? singular : pluralText}`;

/** Que cambio entre dos versiones de los ajustes, para el historial ("3 celdas modificadas; columna agregada: Caja"). */
export function describeAdjustments(previous: ExcelAdjustments, next: ExcelAdjustments) {
  const parts: string[] = [];
  const before = adjustedCells(previous).total;
  const after = adjustedCells(next).total;
  if (after !== before || JSON.stringify(previous.celdas) !== JSON.stringify(next.celdas)) {
    parts.push(after ? `${plural(after, "celda modificada", "celdas modificadas")} en total` : "se restauraron todas las celdas");
  }
  const prevTitles = new Map(previous.columnas.map((column) => [column.id, column.titulo]));
  const added = next.columnas.filter((column) => !prevTitles.has(column.id)).map((column) => column.titulo);
  const removed = previous.columnas.filter((column) => !next.columnas.some((item) => item.id === column.id)).map((column) => column.titulo);
  const renamed = next.columnas.filter((column) => prevTitles.has(column.id) && prevTitles.get(column.id) !== column.titulo).map((column) => column.titulo);
  if (added.length) parts.push(`${added.length === 1 ? "columna agregada" : "columnas agregadas"}: ${added.join(", ")}`);
  if (removed.length) parts.push(`${removed.length === 1 ? "columna quitada" : "columnas quitadas"}: ${removed.join(", ")}`);
  if (renamed.length) parts.push(`${renamed.length === 1 ? "columna renombrada" : "columnas renombradas"}: ${renamed.join(", ")}`);
  return parts.join("; ");
}
