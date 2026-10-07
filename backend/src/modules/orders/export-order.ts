// Orden de las filas en el Excel de la maquina (spec §11.1). Las solicitudes de corte salen como siempre, en el orden
// en que se cargaron (indice). Las de modulos salen por modulo (posicion) y, dentro de cada uno, por el orden de la
// pieza; las piezas adicionales (sin modulo) van al final.

type ExportDetail = { indice: number; orden: number; pedidoModulo?: { posicion: number } | null };

/** Las filas de un pedido en el orden del Excel. Un pedido de corte las devuelve tal cual vienen (ya por indice). */
export function machineRows<D extends ExportDetail>(order: { tipo: string; detalles: D[] }): D[] {
  if (order.tipo !== "MODULOS") return order.detalles;
  const posicion = (detail: D) => detail.pedidoModulo?.posicion ?? Number.MAX_SAFE_INTEGER;
  return [...order.detalles].sort((a, b) => posicion(a) - posicion(b) || a.orden - b.orden || a.indice - b.indice);
}

/** Nombre del archivo: pedido-M{numero}.xlsx si se exporta una sola solicitud de modulos; si no, el de siempre. */
export function exportFileName(orders: Array<{ tipo: string; numero: number }>) {
  return orders.length === 1 && orders[0].tipo === "MODULOS" ? `pedido-M${orders[0].numero}.xlsx` : "pedidos-carpinteria.xlsx";
}
