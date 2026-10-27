import { Order } from "../types";

export function formatMoney(value: number) {
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

// Los pedidos anteriores a la migracion 20260812120000_costo_mano_obra_cortes no guardan el
// importe desglosado, pero SI lo tenian sumado en el total: se reconstruye restando para no
// mostrar $0 en una constancia vieja. El Math.abs evita que el ruido de los float saque un "-$0".
// Vive aca y no en cada pantalla porque la constancia y el panel de presupuesto tienen que mostrar
// el mismo numero: dos copias del criterio terminan divergiendo.
export function cuttingLaborCost(order: Order) {
  const cost = order.costoManoObraCortes ?? (order.presupuestoEstimado - order.costoPlacas - order.costoCantos);
  return Math.abs(cost) < 0.01 ? 0 : cost;
}
