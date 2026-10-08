// Recalcular un modulo de una solicitud (spec §10.6 y DECISIONES R4): las partes que no tocan la base, para probarlas
// con datos armados a mano. El servicio (module-recalc.service.ts) trae los datos y escribe.

type Row = { pedidoModuloId: string | null; orden: number; indice: number };

/**
 * Las filas de la solicitud con las del modulo recalculado en lugar de las viejas: agrupadas por modulo (posicion) y
 * con las adicionales al final. Las de los otros modulos quedan en el orden en que estaban; las nuevas, en el orden de
 * sus piezas. Devuelve las filas con el indice nuevo (0..n-1).
 */
export function composeRows<R extends Row>(saved: R[], pedidoModuloId: string, recalculated: R[], posicionDe: Map<string, number>) {
  const grupo = (row: R) => (row.pedidoModuloId && posicionDe.has(row.pedidoModuloId) ? posicionDe.get(row.pedidoModuloId)! : Number.MAX_SAFE_INTEGER);
  const others = saved.filter((row) => row.pedidoModuloId !== pedidoModuloId);
  const fresh = [...recalculated].sort((a, b) => a.orden - b.orden);
  return [...others, ...fresh]
    .map((row, position) => ({ row, position }))
    .sort((a, b) => grupo(a.row) - grupo(b.row) || (a.row.pedidoModuloId === pedidoModuloId ? a.row.orden - b.row.orden : a.row.indice - b.row.indice) || a.position - b.position)
    .map(({ row }, indice) => ({ ...row, indice }));
}

type Snapshot = { parametros?: Array<{ clave: string; tipo: string; orden: number }> } | null | undefined;

/** "Módulo 2 · Bajo mesada 2 puertas · 900 × 780 × 580 mm": para el historial (RECALCULAR_MODULO). */
export function moduleLabel(posicion: number, nombre: string, snapshot: Snapshot, valores: Record<string, unknown>) {
  const medidas = [...(snapshot?.parametros ?? [])]
    .filter((param) => param.tipo === "MEDIDA")
    .sort((a, b) => a.orden - b.orden)
    .map((param) => valores[param.clave.toUpperCase()] ?? valores[param.clave])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => value.toLocaleString("es-AR"));
  return [`Módulo ${posicion}`, nombre, medidas.length ? `${medidas.join(" × ")} mm` : ""].filter(Boolean).join(" · ");
}

/** El armado de un solo modulo numera "módulo 1": en los mensajes va la posicion que tiene en la solicitud. */
export const renumberProblem = (text: string, posicion: number) => text.replace(/([Mm])ódulo 1(?=\D|$)/g, (_match, m: string) => `${m}ódulo ${posicion}`);
