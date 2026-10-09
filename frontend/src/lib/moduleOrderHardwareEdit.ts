// Herrajes en la edicion de una solicitud de modulos (F6.4, DECISIONES 57): las lineas del formulario, como quedan al
// guardar (con resolveHardwareEdit, el mismo calculo que el PUT), su costo y lo que se manda.
import { resolveHardwareEdit, type ComparableHardware, type HardwareEditLine, type HardwareEditModel, type ResolvedHardwareRow, type SavedHardware } from "./moduleOrderChanges.ts";
import { hardwareCost } from "./orderEstimate.ts";
import type { Hardware, OrderHardware } from "../types/index.ts";

/** Una linea de herraje del formulario: la del PUT mas una clave para la lista. */
export type EditHardwareLine = HardwareEditLine & { key: string };

let nextKey = 0;
/** Clave de una linea nueva (las guardadas usan su id). */
export const newHardwareKey = () => `nuevo-${++nextKey}`;

/** Las lineas de la solicitud guardada, en su orden. */
export const hardwareLinesFromOrder = (herrajes: OrderHardware[]): EditHardwareLine[] =>
  herrajes.map((herraje) => ({ key: herraje.id, id: herraje.id, pedidoModuloId: herraje.pedidoModuloId, herrajeId: herraje.herrajeId, cantidad: herraje.cantidad }));

/** Los herrajes guardados como los compara el calculo compartido. */
export const savedHardware = (herrajes: OrderHardware[]): SavedHardware[] =>
  herrajes.map((herraje) => ({ ...herraje, origen: herraje.origen ?? null }));

/** Los modelos de Configuracion › Herrajes como los copia la solicitud. */
export const hardwareEditModels = (models: Hardware[]) =>
  new Map<string, HardwareEditModel>(
    models.map((model) => [
      model.id,
      { id: model.id, nombre: model.nombre, unidad: model.unidad, tipo: model.tipo?.nombre ?? null, linea: model.linea, medidaMm: model.medidaMm, valor: model.valor, activo: model.activo }
    ])
  );

/** Cada linea como queda al guardar, o el problema que tiene; y el costo de las que se pueden guardar. */
export function resolveEditLines(saved: OrderHardware[], lines: EditHardwareLine[], models: Hardware[], catalog: ComparableHardware[] = []) {
  const { rows, problems } = resolveHardwareEdit(savedHardware(saved), lines, hardwareEditModels(models), catalog);
  const problemOf = new Map(problems.map((problem) => [problem.index, problem.mensaje]));
  let next = 0;
  const byLine = lines.map((_, index): { row: ResolvedHardwareRow | null; problem: string | null } =>
    problemOf.has(index) ? { row: null, problem: problemOf.get(index)! } : { row: rows[next++] ?? null, problem: null }
  );
  return { byLine, rows, problems, costo: hardwareCost(rows) };
}

/** Lo que va en el PUT (sin la clave de la lista). */
export const hardwareLinesPayload = (lines: EditHardwareLine[]) =>
  lines.map((line) => ({ id: line.id ?? null, pedidoModuloId: line.pedidoModuloId, herrajeId: line.herrajeId, cantidad: Number(line.cantidad) }));

/**
 * El primer problema de las lineas, para avisar antes de pedir el comprobante: la cantidad (entera, de 1 a 9999), el
 * modelo, y lo que diga el calculo (un modelo inactivo o que ya no existe). "Herraje 2 del módulo 1: ...".
 */
export function hardwareLinesError(lines: EditHardwareLine[], posicionDe: Map<string, number>, problems: Array<{ index: number; mensaje: string }>) {
  const where = (index: number) => {
    const line = lines[index];
    const numero = lines.slice(0, index + 1).filter((item) => item.pedidoModuloId === line.pedidoModuloId).length;
    return `Herraje ${numero} del módulo ${line.pedidoModuloId ? (posicionDe.get(line.pedidoModuloId) ?? "?") : "?"}`;
  };
  for (const [index, line] of lines.entries()) {
    const cantidad = Number(line.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) return `${where(index)}: la cantidad tiene que ser un número entero desde 1 (para sacarlo, quitalo).`;
    if (cantidad > 9999) return `${where(index)}: la cantidad tiene como máximo 9999.`;
  }
  const problem = problems[0];
  return problem ? `${where(problem.index)}: ${problem.mensaje}` : "";
}
