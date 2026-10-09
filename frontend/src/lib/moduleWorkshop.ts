// Hoja de taller de una solicitud de modulos (spec §11.2): que va en cada hoja, en que orden y como se leen los cantos.
// No depende de React. Las piezas van en el mismo orden que el Excel de la maquina (orden de la pieza, DECISIONES 50),
// asi la hoja y el Excel coinciden pieza por pieza.
import type { ModuleOrder, ModuleOrderDetail, OrderHardware, OrigenDetalle } from "../types/index.ts";

type Modulo = ModuleOrder["modulos"][number];

export type WorkshopSheet = {
  key: string;
  /** "Módulo 2 de 5" o "Piezas adicionales". */
  titulo: string;
  /** null en la hoja de piezas adicionales. */
  modulo: Modulo | null;
  rows: ModuleOrderDetail[];
  /** Los herrajes guardados del modulo, en su orden (spec §11.2); vacio en la hoja de piezas adicionales. */
  herrajes: OrderHardware[];
};

/** Las piezas en el orden del Excel: por orden de la pieza y, si empataran, por el de carga. */
export const workshopRows = (rows: ModuleOrderDetail[]) => [...rows].sort((a, b) => a.orden - b.orden || a.indice - b.indice);

/** Una hoja por modulo (por posicion) y, si hay piezas sin modulo, una mas al final. */
export function workshopSheets(order: Pick<ModuleOrder, "modulos" | "detalles"> & { herrajes?: OrderHardware[] }): WorkshopSheet[] {
  const modulos = [...order.modulos].sort((a, b) => a.posicion - b.posicion);
  const ids = new Set(modulos.map((modulo) => modulo.id));
  const sheets: WorkshopSheet[] = modulos.map((modulo) => ({
    key: modulo.id,
    titulo: `Módulo ${modulo.posicion} de ${modulos.length}`,
    modulo,
    rows: workshopRows(order.detalles.filter((row) => row.pedidoModuloId === modulo.id)),
    herrajes: (order.herrajes ?? []).filter((herraje) => herraje.pedidoModuloId === modulo.id).sort((a, b) => a.orden - b.orden)
  }));
  const adicionales = order.detalles.filter((row) => !row.pedidoModuloId || !ids.has(row.pedidoModuloId));
  if (adicionales.length) sheets.push({ key: "adicionales", titulo: "Piezas adicionales", modulo: null, rows: workshopRows(adicionales), herrajes: [] });
  return sheets;
}

/** La marca de una pieza que no salio tal cual del catalogo. */
export function pieceMark(origen: OrigenDetalle | null | undefined) {
  if (origen === "EDITADO") return "Editada";
  if (origen === "MANUAL") return "Agregada";
  return "";
}

export type WorkshopEdge = { espesorMm: number; placaMaterialId: string | null; color: string };

const SIDES = [
  ["L1", "cantoLargo1Id", "cantoLargo1Nombre"],
  ["L2", "cantoLargo2Id", "cantoLargo2Nombre"],
  ["A1", "cantoAncho1Id", "cantoAncho1Nombre"],
  ["A2", "cantoAncho2Id", "cantoAncho2Nombre"]
] as const;

const mm = (value: number) => `${Number(value.toFixed(2)).toLocaleString("es-AR")} mm`;

/**
 * Los cantos de una pieza como se leen en el taller: los lados de cada canto y su espesor, "L1 L2 A1 A2 (2 mm)" o
 * "L1 (0,45 mm) · A1 A2 (2 mm)". Si el canto no es del color de la placa de la pieza, lleva el color:
 * "L1 (2 mm, Negro)". Un canto que ya no esta en la lista de materiales se muestra con el nombre guardado.
 * Sin cantos, "Sin canto".
 */
export function edgeSummary(row: ModuleOrderDetail, edges: Map<string, WorkshopEdge>) {
  const groups: Array<{ id: string; sides: string[] }> = [];
  for (const [side, idField] of SIDES) {
    const id = row[idField];
    if (!id) continue;
    const group = groups.find((item) => item.id === id);
    if (group) group.sides.push(side);
    else groups.push({ id, sides: [side] });
  }
  if (!groups.length) return "Sin canto";
  return groups
    .map(({ id, sides }) => {
      const edge = edges.get(id);
      const nombreGuardado = SIDES.map(([, idField, nameField]) => (row[idField] === id ? row[nameField] : null)).find(Boolean);
      if (!edge) return `${sides.join(" ")} (${nombreGuardado ?? "canto"})`;
      const otroColor = edge.placaMaterialId !== (row.materialId ?? null);
      return `${sides.join(" ")} (${mm(edge.espesorMm)}${otroColor ? `, ${edge.color}` : ""})`;
    })
    .join(" · ");
}

/**
 * Las medidas pedidas con su nombre, para que en el taller no haya dudas de cual es cual:
 * "Ancho 1.200 · Alto 780 · Profundidad 580 mm". Solo las medidas (no los enteros ni las calculadas), en su orden.
 */
export function labeledMeasures(modulo: Pick<Modulo, "valores" | "definicionSnapshot">) {
  const medidas = [...(modulo.definicionSnapshot?.parametros ?? [])]
    .filter((param) => param.tipo === "MEDIDA")
    .sort((a, b) => a.orden - b.orden)
    .map((param) => ({ etiqueta: param.etiqueta, valor: modulo.valores[param.clave.toUpperCase()] ?? modulo.valores[param.clave] }))
    .filter((item): item is { etiqueta: string; valor: number } => typeof item.valor === "number" && Number.isFinite(item.valor));
  return medidas.length ? `${medidas.map((item) => `${item.etiqueta} ${item.valor.toLocaleString("es-AR")}`).join(" · ")} mm` : "";
}

/** Mas de 18 piezas: la tabla va mas apretada para que el modulo entre en una hoja (spec §11.2). */
export const compactTable = (rows: number) => rows > 18;
