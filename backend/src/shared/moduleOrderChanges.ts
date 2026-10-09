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
  /** Los herrajes que cambiaron (F6.4); sin herrajes en la edicion, no hay. */
  herrajes?: HardwareChanges;
};

export type HardwareChanges = { modificados: number; agregados: number; quitados: number };

/** Todos los cambios de la edicion, contra lo guardado. */
export function summarizeChanges<S extends ComparablePiece & { id: string }, H extends ComparableHardware & { id: string }>(
  saved: { data: EditableOrderData; rows: S[]; herrajes?: H[] },
  next: { data: EditableOrderData; rows: ComparablePiece[]; herrajes?: HardwareEditLine[] }
): ModuleOrderChanges {
  const { matches, removed } = matchRows(saved.rows, next.rows);
  return {
    modificadas: matches.filter((match) => match.kind === "kept" && match.changed).length,
    agregadas: matches.filter((match) => match.kind === "added").length,
    eliminadas: removed.length,
    datos: changedOrderData(saved.data, next.data),
    // Sin herrajes en la edicion (apagados), los guardados quedan como estan: no es un cambio.
    ...(next.herrajes ? { herrajes: summarizeHardwareChanges(saved.herrajes ?? [], next.herrajes) } : {})
  };
}

const hardwareCount = (changes: ModuleOrderChanges) => (changes.herrajes ? changes.herrajes.modificados + changes.herrajes.agregados + changes.herrajes.quitados : 0);

export const hasChanges = (changes: ModuleOrderChanges) =>
  changes.modificadas + changes.agregadas + changes.eliminadas + changes.datos.length + hardwareCount(changes) > 0;

/** "a", "a y b", "a, b y c". */
function joinList(items: string[]) {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const pieces = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? `pieza ${singular}` : `piezas ${plural}`}`;
const hardware = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? `herraje ${singular}` : `herrajes ${plural}`}`;

/** Los herrajes que cambiaron, como se leen: "1 herraje modificado", "2 herrajes agregados", "1 herraje quitado". */
export function describeHardwareChanges(changes: HardwareChanges | undefined) {
  if (!changes) return [];
  return [
    changes.modificados ? hardware(changes.modificados, "modificado", "modificados") : "",
    changes.agregados ? hardware(changes.agregados, "agregado", "agregados") : "",
    changes.quitados ? hardware(changes.quitados, "quitado", "quitados") : ""
  ].filter(Boolean);
}

/**
 * Los cambios en una linea, para el historial ("Editó la solicitud: ...", EDITAR_PEDIDO): "2 piezas modificadas y
 * 1 pieza agregada; cambió el teléfono y la fecha de entrega". Los herrajes van con las piezas ("1 pieza agregada y
 * 1 herraje modificado"). Sin cambios, "".
 */
export function describeChanges(changes: ModuleOrderChanges) {
  const parts = [
    changes.modificadas ? pieces(changes.modificadas, "modificada", "modificadas") : "",
    changes.agregadas ? pieces(changes.agregadas, "agregada", "agregadas") : "",
    changes.eliminadas ? pieces(changes.eliminadas, "eliminada", "eliminadas") : "",
    ...describeHardwareChanges(changes.herrajes)
  ].filter(Boolean);
  const piecesText = joinList(parts);
  const dataText = changes.datos.length ? `cambió ${joinList(changes.datos)}` : "";
  return [piecesText, dataText].filter(Boolean).join("; ");
}

// ---------------------------------------------------------------- herrajes de la edicion (F6.4, DECISIONES 57)

export type OrigenHerraje = "CALCULADO" | "EDITADO" | "MANUAL";

/** Lo que se compara de un herraje de la solicitud: el modelo y la cantidad. */
export type ComparableHardware = { id?: string | null; pedidoModuloId: string | null; herrajeId: string | null; cantidad: number };

/** Una linea de herraje de la edicion: una guardada (con su id) o una nueva (sin id). */
export type HardwareEditLine = ComparableHardware;

/** Un herraje guardado (PedidoHerraje): su copia del modelo y del precio del dia en que se cargo. */
export type SavedHardware = ComparableHardware & {
  id: string;
  nombre: string;
  unidad: string;
  tipo: string | null;
  linea: string | null;
  medidaMm: number | null;
  valorUnitario: number;
  origen: OrigenHerraje | null;
};

/** Lo que hace falta de un modelo de herraje para copiarlo en la solicitud. */
export type HardwareEditModel = {
  id: string;
  nombre: string;
  unidad: string;
  tipo: string | null;
  linea: string | null;
  medidaMm: number | null;
  valor: number;
  activo: boolean;
};

/** Un herraje como queda guardado despues de la edicion. */
export type ResolvedHardwareRow = {
  pedidoModuloId: string | null;
  herrajeId: string | null;
  nombre: string;
  unidad: string;
  tipo: string | null;
  linea: string | null;
  medidaMm: number | null;
  cantidad: number;
  valorUnitario: number;
  orden: number;
  origen: OrigenHerraje;
};

export type HardwareMatch<S> =
  /** Un herraje guardado que sigue; changed si cambio el modelo o la cantidad. */
  | { kind: "kept"; saved: S; changed: boolean }
  | { kind: "added" };

/**
 * Empareja los herrajes de la edicion con los guardados por id, como las piezas: la primera linea con un id guardado
 * (y del mismo modulo) es ese herraje; otra con el mismo id, o pasada a otro modulo, es nueva.
 */
export function matchHardware<S extends ComparableHardware & { id: string }>(saved: S[], lines: HardwareEditLine[]) {
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const used = new Set<string>();
  const matches: HardwareMatch<S>[] = lines.map((line) => {
    const previous = line.id ? savedById.get(line.id) : undefined;
    if (!previous || used.has(previous.id) || text(previous.pedidoModuloId) !== text(line.pedidoModuloId)) return { kind: "added" };
    used.add(previous.id);
    return { kind: "kept", saved: previous, changed: text(previous.herrajeId) !== text(line.herrajeId) || Number(previous.cantidad) !== Number(line.cantidad) };
  });
  return { matches, removed: saved.filter((item) => !used.has(item.id)) };
}

export function summarizeHardwareChanges<S extends ComparableHardware & { id: string }>(saved: S[], lines: HardwareEditLine[]): HardwareChanges {
  const { matches, removed } = matchHardware(saved, lines);
  return {
    modificados: matches.filter((match) => match.kind === "kept" && match.changed).length,
    agregados: matches.filter((match) => match.kind === "added").length,
    quitados: removed.length
  };
}

/**
 * Los herrajes como quedan al guardar la edicion (DECISIONES 57). Lo usan el PUT y el formulario (para el comprobante),
 * asi los dos suman lo mismo:
 * - uno guardado con el mismo modelo conserva su copia (nombre y precio del dia en que se cargo); si cambio la cantidad
 *   pasa a EDITADO (uno MANUAL sigue MANUAL);
 * - uno guardado con otro modelo, o uno nuevo, copia el modelo de hoy, que tiene que existir y estar activo. El que
 *   cambio de modelo pasa a EDITADO (o sigue MANUAL); uno nuevo es CALCULADO si es lo que da el catalogo para ese modulo
 *   (Recalcular herrajes) y MANUAL si no.
 * El orden es el de las lineas dentro de cada modulo. Los problemas van con el indice de la linea.
 */
export function resolveHardwareEdit<S extends SavedHardware>(
  saved: S[],
  lines: HardwareEditLine[],
  models: Map<string, HardwareEditModel>,
  catalog: ComparableHardware[] = []
): { rows: ResolvedHardwareRow[]; problems: Array<{ index: number; mensaje: string }> } {
  const { matches } = matchHardware(saved, lines);
  const pendingCatalog = catalog.map((item) => ({ ...item }));
  const ordenes = new Map<string, number>();
  const problems: Array<{ index: number; mensaje: string }> = [];
  const rows = lines.flatMap((line, index): ResolvedHardwareRow[] => {
    const key = text(line.pedidoModuloId);
    const orden = (ordenes.get(key) ?? 0) + 1;
    ordenes.set(key, orden);
    const match = matches[index];
    if (match.kind === "kept" && text(match.saved.herrajeId) === text(line.herrajeId)) {
      const { saved: previous, changed } = match;
      const origen: OrigenHerraje = previous.origen === "MANUAL" ? "MANUAL" : changed ? "EDITADO" : (previous.origen ?? "CALCULADO");
      return [
        {
          pedidoModuloId: line.pedidoModuloId,
          herrajeId: previous.herrajeId,
          nombre: previous.nombre,
          unidad: previous.unidad,
          tipo: previous.tipo,
          linea: previous.linea,
          medidaMm: previous.medidaMm,
          cantidad: line.cantidad,
          valorUnitario: previous.valorUnitario,
          orden,
          origen
        }
      ];
    }
    const model = line.herrajeId ? models.get(line.herrajeId) : undefined;
    if (!model) {
      problems.push({ index, mensaje: "ese herraje ya no existe. Elegí otro modelo." });
      return [];
    }
    if (!model.activo) {
      problems.push({ index, mensaje: `el herraje "${model.nombre}" está inactivo. Elegí otro modelo.` });
      return [];
    }
    let origen: OrigenHerraje;
    if (match.kind === "kept") origen = match.saved.origen === "MANUAL" ? "MANUAL" : "EDITADO";
    else {
      const fromCatalog = pendingCatalog.findIndex((item) => text(item.pedidoModuloId) === key && item.herrajeId === model.id && Number(item.cantidad) === Number(line.cantidad));
      if (fromCatalog >= 0) pendingCatalog.splice(fromCatalog, 1);
      origen = fromCatalog >= 0 ? "CALCULADO" : "MANUAL";
    }
    return [
      {
        pedidoModuloId: line.pedidoModuloId,
        herrajeId: model.id,
        nombre: model.nombre,
        unidad: model.unidad,
        tipo: model.tipo,
        linea: model.linea,
        medidaMm: model.medidaMm,
        cantidad: line.cantidad,
        valorUnitario: model.valor,
        orden,
        origen
      }
    ];
  });
  return { rows, problems };
}
