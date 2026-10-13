// Totales del dashboard por estado y por tipo (spec §15): los dos tipos cuentan en los totales, porque el stock de placas
// es uno solo, y aparte se dice cuantos son de modulos a medida.

type Group = { estado: string; tipo: string; _count: { _all: number } };

/** Por estado (en el orden en que aparecen) con cuantos de ese estado son de modulos, y el total por tipo. */
export function summarizeOrders(groups: Group[]) {
  const byStatus = new Map<string, { estado: string; total: number; modulos: number }>();
  const byTipo = new Map<string, number>([
    ["CORTE", 0],
    ["MODULOS", 0]
  ]);
  for (const group of groups) {
    const count = group._count._all;
    const status = byStatus.get(group.estado) ?? { estado: group.estado, total: 0, modulos: 0 };
    status.total += count;
    if (group.tipo === "MODULOS") status.modulos += count;
    byStatus.set(group.estado, status);
    byTipo.set(group.tipo, (byTipo.get(group.tipo) ?? 0) + count);
  }
  return { byStatus: [...byStatus.values()], byTipo: [...byTipo].map(([tipo, total]) => ({ tipo, total })) };
}

// ---------------------------------------------------------------- solicitudes de modulos (punto 8, 2026-10-09)

const ACTIVE = new Set(["PENDIENTE", "EN_PROCESO", "TERMINADA"]);
const DAY = 86400000;
/** Dias entre dos fechas AAAA-MM-DD (b - a). */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const centavos = (value: number) => Math.round(Number(value || 0) * 100);

export type ModuleOrderForStats = {
  id: string;
  numero: number;
  cliente: string;
  estado: string;
  /** AAAA-MM-DD, o null. */
  fechaEntrega: string | null;
  /** AAAA-MM-DD en la zona del negocio. */
  creada: string;
  presupuestoEstimado: number;
  costoHerrajes: number;
  placasEstimadas: number;
  modulos: number;
  /** El dia (AAAA-MM-DD) en que paso a ENTREGADA, si paso. */
  entregada: string | null;
};

/**
 * Las metricas de las solicitudes de modulos del dashboard (punto 8): lo que esta en curso (por estado, modulos,
 * placas y presupuesto con herrajes), las entregas vencidas y por vencer (con los dias de aviso de la configuracion),
 * las proximas entregas, el cumplimiento de los ultimos 90 dias, el ticket promedio, los ultimos 6 meses y los modulos
 * mas pedidos. Los importes se suman en centavos.
 */
export function summarizeModuleOrders(
  orders: ModuleOrderForStats[],
  topModulos: Array<{ nombre: string; cantidad: number }>,
  options: { today: string; diasAviso: number }
) {
  const { today, diasAviso } = options;
  const activas = orders.filter((order) => ACTIVE.has(order.estado));
  const plazo = (order: ModuleOrderForStats) => (order.fechaEntrega ? daysBetween(today, order.fechaEntrega) : null);
  const vencidas = activas.filter((order) => (plazo(order) ?? 0) < 0).length;
  const porVencer = activas.filter((order) => {
    const dias = plazo(order);
    return dias !== null && dias >= 0 && dias <= diasAviso;
  }).length;
  const proximas = activas
    .filter((order) => order.fechaEntrega)
    .sort((a, b) => a.fechaEntrega!.localeCompare(b.fechaEntrega!) || a.numero - b.numero)
    .slice(0, 6)
    .map((order) => ({ id: order.id, numero: order.numero, cliente: order.cliente, estado: order.estado, fechaEntrega: order.fechaEntrega, dias: plazo(order) }));

  // Cumplimiento: de las entregadas en los ultimos 90 dias, cuantas salieron hasta su fecha de entrega.
  const desde90 = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * DAY).toISOString().slice(0, 10);
  const entregadas = orders.filter((order) => order.estado === "ENTREGADA" && order.entregada && order.entregada >= desde90);
  const aTiempo = entregadas.filter((order) => !order.fechaEntrega || order.entregada! <= order.fechaEntrega).length;

  // Ticket promedio: las creadas en los ultimos 90 dias, sin las rechazadas.
  const recientes = orders.filter((order) => order.estado !== "RECHAZADA" && order.creada >= desde90);
  const total = (list: ModuleOrderForStats[]) => list.reduce((sum, order) => sum + centavos(order.presupuestoEstimado) + centavos(order.costoHerrajes), 0);

  // Los ultimos 6 meses (este incluido), sin las rechazadas en el monto.
  const [year, month] = today.split("-").map(Number);
  const meses = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    return date.toISOString().slice(0, 7);
  }).map((mes) => {
    const delMes = orders.filter((order) => order.creada.startsWith(mes));
    return { mes, solicitudes: delMes.length, presupuesto: total(delMes.filter((order) => order.estado !== "RECHAZADA")) / 100 };
  });

  return {
    activas: activas.length,
    porEstado: ["PENDIENTE", "EN_PROCESO", "TERMINADA"].map((estado) => ({ estado, total: activas.filter((order) => order.estado === estado).length })),
    modulosActivos: activas.reduce((sum, order) => sum + order.modulos, 0),
    placasActivas: activas.reduce((sum, order) => sum + order.placasEstimadas, 0),
    presupuestoActivo: total(activas) / 100,
    vencidas,
    porVencer,
    diasAviso,
    proximas,
    cumplimiento: { entregadas: entregadas.length, aTiempo },
    ticketPromedio: recientes.length ? Math.round(total(recientes) / recientes.length) / 100 : 0,
    meses,
    topModulos
  };
}

// ---------------------------------------------------------------- solicitudes de corte (2026-10-13)

export type CutOrderForStats = {
  id: string;
  numero: number;
  cliente: string;
  estado: string;
  /** AAAA-MM-DD en la zona del negocio. */
  creada: string;
  presupuestoEstimado: number;
  /** Las mismas placas que la constancia (guardadas en el pedido). */
  placasEstimadas: number;
  piezas: number;
  faltanteStock: boolean;
  /** Quien la cargo (nombre y apellido del usuario). */
  carpintero: string;
};

const daysAgo = (today: string, days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);

/**
 * El tablero de las solicitudes de corte: lo que esta en curso (por estado, piezas, placas y presupuesto), las pendientes
 * sin stock, el ticket promedio, la tendencia de 30 dias, los ultimos 6 meses, quienes mas cargan y las pendientes mas
 * viejas. Los materiales mas cortados llegan sumados de la base. Los importes se suman en centavos.
 */
export function summarizeCutOrders(orders: CutOrderForStats[], topMateriales: Array<{ nombre: string; piezas: number }>, options: { today: string }) {
  const { today } = options;
  const activas = orders.filter((order) => ACTIVE.has(order.estado));
  const total = (list: CutOrderForStats[]) => list.reduce((sum, order) => sum + centavos(order.presupuestoEstimado), 0);
  const desde90 = daysAgo(today, 90);
  const recientes = orders.filter((order) => order.estado !== "RECHAZADA" && order.creada >= desde90);

  const desde30 = daysAgo(today, 29);
  const desde60 = daysAgo(today, 59);
  const ultimos30 = {
    solicitudes: orders.filter((order) => order.creada >= desde30 && order.creada <= today).length,
    anteriores: orders.filter((order) => order.creada >= desde60 && order.creada < desde30).length
  };

  const [year, month] = today.split("-").map(Number);
  const meses = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year, month - 1 - (5 - index), 1)).toISOString().slice(0, 7)).map((mes) => {
    const delMes = orders.filter((order) => order.creada.startsWith(mes));
    const validas = delMes.filter((order) => order.estado !== "RECHAZADA");
    return { mes, solicitudes: delMes.length, piezas: validas.reduce((sum, order) => sum + order.piezas, 0), presupuesto: total(validas) / 100 };
  });

  const porCarpintero = new Map<string, number>();
  for (const order of recientes) porCarpintero.set(order.carpintero, (porCarpintero.get(order.carpintero) ?? 0) + 1);
  const topCarpinteros = [...porCarpintero]
    .map(([nombre, solicitudes]) => ({ nombre, solicitudes }))
    .sort((a, b) => b.solicitudes - a.solicitudes || a.nombre.localeCompare(b.nombre))
    .slice(0, 5);

  const masAntiguas = orders
    .filter((order) => order.estado === "PENDIENTE")
    .sort((a, b) => a.creada.localeCompare(b.creada) || a.numero - b.numero)
    .slice(0, 6)
    .map((order) => ({ id: order.id, numero: order.numero, cliente: order.cliente, estado: order.estado, creada: order.creada, dias: daysBetween(order.creada, today) }));

  return {
    activas: activas.length,
    porEstado: ["PENDIENTE", "EN_PROCESO", "TERMINADA"].map((estado) => ({ estado, total: activas.filter((order) => order.estado === estado).length })),
    piezasActivas: activas.reduce((sum, order) => sum + order.piezas, 0),
    placasActivas: activas.reduce((sum, order) => sum + order.placasEstimadas, 0),
    presupuestoActivo: total(activas) / 100,
    sinStock: orders.filter((order) => order.estado === "PENDIENTE" && order.faltanteStock).length,
    ticketPromedio: recientes.length ? Math.round(total(recientes) / recientes.length) / 100 : 0,
    ultimos30,
    meses,
    topMateriales,
    topCarpinteros,
    masAntiguas
  };
}

/** Las categorias del catalogo mas pedidas, a partir de la categoria de cada modulo pedido (los borrados del catalogo, aparte). */
export function topCategories(categorias: Array<string | null>, limit = 5) {
  const counts = new Map<string, number>();
  for (const categoria of categorias) {
    const nombre = categoria ?? "Sin categoría";
    counts.set(nombre, (counts.get(nombre) ?? 0) + 1);
  }
  return [...counts]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre))
    .slice(0, limit);
}
