// Cambios de una edicion de una solicitud de modulos (spec §10.2 y §10.3): que piezas se modificaron, cuales se
// agregaron y cuales se eliminaron, y que datos del cliente cambiaron. Lo usan el resumen "Cambios detectados" del
// formulario y el PUT del backend (que marca el origen de cada fila y escribe el historial), asi los dos cuentan lo
// mismo. Se copia al backend con `npm run sync:optimizer`: no importa nada.

/** Lo que se compara de una pieza. Los datos del cliente de la fila no cuentan: siguen a los de la solicitud. */
export type ComparablePiece = {
  id?: string | null;
  pedidoModuloId?: string | null;
  materialId?: string | null;
  largo: number | string;
  ancho: number | string;
  cantidad: number | string;
  cantoLargo1Id?: string | null;
  cantoLargo2Id?: string | null;
  cantoAncho1Id?: string | null;
  cantoAncho2Id?: string | null;
  permiteRotar?: boolean | null;
  nombreProducto?: string | null;
};

const EDGE_IDS = ["cantoLargo1Id", "cantoLargo2Id", "cantoAncho1Id", "cantoAncho2Id"] as const;
const text = (value: string | null | undefined) => (value ?? "").trim();

/** Misma pieza: misma placa, medidas, cantidad, canto de cada lado, rotacion y nombre. */
export function samePiece(a: ComparablePiece, b: ComparablePiece) {
  return (
    text(a.materialId) === text(b.materialId) &&
    Number(a.largo) === Number(b.largo) &&
    Number(a.ancho) === Number(b.ancho) &&
    Number(a.cantidad) === Number(b.cantidad) &&
    EDGE_IDS.every((field) => text(a[field]) === text(b[field])) &&
    Boolean(a.permiteRotar) === Boolean(b.permiteRotar) &&
    text(a.nombreProducto) === text(b.nombreProducto)
  );
}

export type RowMatch<S> =
  /** Una fila guardada que sigue: conserva su codigo de pieza, su orden y su codigo de barra. */
  | { kind: "kept"; saved: S; changed: boolean }
  /** Una fila nueva: sin id, con un id que ya no esta guardado, duplicada o pasada a otro modulo. */
  | { kind: "added" };

/**
 * Empareja las filas editadas con las guardadas por id. La primera fila con un id guardado (y del mismo modulo) es
 * esa pieza; otra con el mismo id es una copia (Duplicar copia la fila entera) y cuenta como agregada.
 */
export function matchRows<S extends ComparablePiece & { id: string }>(saved: S[], rows: ComparablePiece[]) {
  const savedById = new Map(saved.map((row) => [row.id, row]));
  const used = new Set<string>();
  const matches: RowMatch<S>[] = rows.map((row) => {
    const previous = row.id ? savedById.get(row.id) : undefined;
    if (!previous || used.has(previous.id) || text(previous.pedidoModuloId) !== text(row.pedidoModuloId)) return { kind: "added" };
    used.add(previous.id);
    return { kind: "kept", saved: previous, changed: !samePiece(previous, row) };
  });
  const removed = saved.filter((row) => !used.has(row.id));
  return { matches, removed };
}

/** Los datos de la solicitud que se pueden editar (paso Datos). */
export type EditableOrderData = {
  cliente: string;
  numeroContacto: string;
  emailContacto?: string | null;
  direccionEntrega?: string | null;
  fechaEntrega?: string | null;
  observaciones?: string | null;
};

const DATA_LABELS: Array<[keyof EditableOrderData, string]> = [
  ["cliente", "el cliente"],
  ["numeroContacto", "el teléfono"],
  ["emailContacto", "el email"],
  ["direccionEntrega", "la dirección"],
  ["fechaEntrega", "la fecha de entrega"],
  ["observaciones", "la referencia"]
];

/** Que datos cambiaron, como se leen ("el teléfono", "la fecha de entrega"). Vacio y sin cargar son lo mismo. */
export function changedOrderData(saved: EditableOrderData, next: EditableOrderData) {
  return DATA_LABELS.filter(([field]) => text(saved[field]) !== text(next[field])).map(([, label]) => label);
}

export type ModuleOrderChanges = {
  modificadas: number;
  agregadas: number;
  eliminadas: number;
  /** Los datos que cambiaron, como se leen. */
  datos: string[];
};

/** Todos los cambios de la edicion, contra lo guardado. */
export function summarizeChanges<S extends ComparablePiece & { id: string }>(
  saved: { data: EditableOrderData; rows: S[] },
  next: { data: EditableOrderData; rows: ComparablePiece[] }
): ModuleOrderChanges {
  const { matches, removed } = matchRows(saved.rows, next.rows);
  return {
    modificadas: matches.filter((match) => match.kind === "kept" && match.changed).length,
    agregadas: matches.filter((match) => match.kind === "added").length,
    eliminadas: removed.length,
    datos: changedOrderData(saved.data, next.data)
  };
}

export const hasChanges = (changes: ModuleOrderChanges) => changes.modificadas + changes.agregadas + changes.eliminadas + changes.datos.length > 0;

/** "a", "a y b", "a, b y c". */
function joinList(items: string[]) {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const pieces = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? `pieza ${singular}` : `piezas ${plural}`}`;

/**
 * Los cambios en una linea, para el historial ("Editó la solicitud: ...", EDITAR_PEDIDO): "2 piezas modificadas y
 * 1 pieza agregada; cambió el teléfono y la fecha de entrega". Sin cambios, "".
 */
export function describeChanges(changes: ModuleOrderChanges) {
  const parts = [
    changes.modificadas ? pieces(changes.modificadas, "modificada", "modificadas") : "",
    changes.agregadas ? pieces(changes.agregadas, "agregada", "agregadas") : "",
    changes.eliminadas ? pieces(changes.eliminadas, "eliminada", "eliminadas") : ""
  ].filter(Boolean);
  const piecesText = joinList(parts);
  const dataText = changes.datos.length ? `cambió ${joinList(changes.datos)}` : "";
  return [piecesText, dataText].filter(Boolean).join("; ");
}
