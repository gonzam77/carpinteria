// Las filas de un pedido se leen siempre en el orden en que se cargaron (columna indice). Sin ORDER BY,
// PostgreSQL puede devolverlas en otro orden despues de ediciones y limpiezas de la tabla.
export const DETALLES_ORDENADOS = {
  orderBy: [{ indice: "asc" as const }, { id: "asc" as const }]
};
