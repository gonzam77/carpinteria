// Orden del listado de solicitudes de modulos (spec §9.1, DECISIONES 41), sin base de datos para poder probarlo.

export type ListOrderKey = { estado: string; fechaEntrega: Date | null; numero: number };

/** Primero lo que sigue en curso; despues las rechazadas, que no tienen plazo; al final las entregadas. */
const closedRank = (estado: string) => (estado === "ENTREGADA" ? 2 : estado === "RECHAZADA" ? 1 : 0);

/**
 * Las que siguen en curso, por fecha de entrega (las que no tienen, al final) y por numero; despues las rechazadas y
 * al final las entregadas, cada grupo con el mismo criterio. Es el orden de la columna Plazo del listado
 * (deliverySortKey): una rechazada no queda arriba de las atrasadas por tener una fecha vieja.
 */
export function compareForList(a: ListOrderKey, b: ListOrderKey) {
  return (
    closedRank(a.estado) - closedRank(b.estado) ||
    (a.fechaEntrega?.getTime() ?? Number.POSITIVE_INFINITY) - (b.fechaEntrega?.getTime() ?? Number.POSITIVE_INFINITY) ||
    a.numero - b.numero
  );
}
