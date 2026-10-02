import { EstadoPedido, type DetallePedido, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";
// Mismo calculo que el presupuesto y el plano de cortes: se reserva lo que la constancia informa.
import { calculateOrderMaterialBoardsEstimate, orderMaterialBoards } from "./order-estimate.service.js";

/**
 * Stock que comprometio un pedido (Pedido.reservaStock). Se guarda lo que se desconto, por material, y al
 * devolver se devuelve exactamente eso, sin recalcular: si entre medio cambian los precios, la
 * configuracion o el optimizador, el stock vuelve igual a como estaba.
 * forzada = el pedido avanzo sin descontar stock (a pedido del administrador, o pedidos anteriores).
 */
export type ReservaStock = { version: 1; forzada: boolean; items: Array<{ materialId: string; placas: number }>; legado?: boolean };

type OrderForStock = { detalles: DetallePedido[]; estimacionDetalle?: unknown; reservaStock?: unknown; stockReservado: boolean };

// En proceso, terminado y entregado tienen el stock comprometido; pendiente y rechazado no. Cualquier
// transicion entre dos estados del mismo grupo no toca el stock, asi nunca se descuenta dos veces.
const ESTADOS_CON_STOCK = new Set<EstadoPedido>([EstadoPedido.EN_PROCESO, EstadoPedido.TERMINADA, EstadoPedido.ENTREGADA]);

export function stateHoldsStock(estado: EstadoPedido) {
  return ESTADOS_CON_STOCK.has(estado);
}

export function parseReservaStock(value: unknown): ReservaStock | null {
  if (!value || typeof value !== "object") return null;
  const reserva = value as Partial<ReservaStock>;
  if (reserva.version !== 1 || !Array.isArray(reserva.items)) return null;
  return reserva as ReservaStock;
}

/** El pedido tiene stock comprometido: una reserva guardada, o el booleano de los pedidos anteriores. */
export function hasStockCommitment(order: Pick<OrderForStock, "reservaStock" | "stockReservado">) {
  return parseReservaStock(order.reservaStock) !== null || order.stockReservado;
}

export async function getOptimizerSettings(tx: PrismaClient) {
  return tx.configuracionOptimizador.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" }
  });
}

/** Placas por material del pedido, recalculadas con el codigo actual. */
export async function calculateOrderMaterialBoards(tx: PrismaClient, detalles: DetallePedido[]) {
  if (!detalles.some((detail) => detail.materialId)) return [];
  return calculateOrderMaterialBoardsEstimate(tx, detalles);
}

function shortagesOf(items: Array<{ material: { id: string; nombre: string; stockPlacas: number | null }; boards: number }>) {
  return items
    .filter(({ material, boards }) => (material.stockPlacas ?? 0) < boards)
    .map(({ material, boards }) => ({
      materialId: material.id,
      materialNombre: material.nombre,
      disponible: material.stockPlacas ?? 0,
      requerido: boards,
      faltante: boards - (material.stockPlacas ?? 0)
    }));
}

function shortageError(stockShortages: ReturnType<typeof shortagesOf>) {
  return new AppError(409, "No hay stock suficiente para avanzar la solicitud.", {
    code: "STOCK_SHORTAGE_CONFIRMATION_REQUIRED",
    details: { stockShortages }
  });
}

/** Placas que le faltan al stock para este pedido, con las placas de su constancia. */
export async function calculateOrderStockShortages(tx: PrismaClient, order: OrderForStock) {
  const { items } = await orderMaterialBoards(tx, order);
  return shortagesOf(items);
}

/**
 * Descuenta del stock las placas de la constancia y devuelve la reserva a guardar en el pedido.
 * Con force, avanza sin descontar (reserva forzada). El descuento es condicional (stock >= placas), asi dos
 * operaciones simultaneas no dejan el stock negativo sin avisar.
 */
export async function takeOrderStock(tx: PrismaClient, order: OrderForStock, { force = false } = {}): Promise<ReservaStock> {
  const { items } = await orderMaterialBoards(tx, order);
  const stockShortages = shortagesOf(items);
  if (stockShortages.length) {
    if (!force) throw shortageError(stockShortages);
    return { version: 1, forzada: true, items: [] };
  }

  for (const { material, boards } of items) {
    if (boards <= 0) continue;
    const updated = await tx.material.updateMany({
      where: { id: material.id, stockPlacas: { gte: boards } },
      data: { stockPlacas: { decrement: boards } }
    });
    if (updated.count !== 1) {
      const current = await tx.material.findUnique({ where: { id: material.id } });
      throw shortageError(shortagesOf([{ material: current ?? material, boards }]));
    }
  }
  return { version: 1, forzada: false, items: items.filter(({ boards }) => boards > 0).map(({ material, boards }) => ({ materialId: material.id, placas: boards })) };
}

/** Devuelve al stock exactamente lo que el pedido descontó. Los pedidos anteriores sin reserva guardada se devuelven recalculando. */
export async function returnOrderStock(tx: PrismaClient, order: OrderForStock) {
  const reserva = parseReservaStock(order.reservaStock);
  const items = reserva
    ? reserva.items
    : order.stockReservado
      ? (await calculateOrderMaterialBoards(tx, order.detalles)).map(({ material, boards }) => ({ materialId: material.id, placas: boards }))
      : [];

  for (const { materialId, placas } of items) {
    if (placas <= 0) continue;
    await tx.material.update({
      where: { id: materialId },
      data: { stockPlacas: { increment: placas } }
    });
  }
}

/** Placas que el pedido tiene descontadas, por material: se suman al stock disponible al calcular sus faltantes. */
export async function heldBoardsByMaterial(tx: PrismaClient, order: OrderForStock) {
  const reserva = parseReservaStock(order.reservaStock);
  const items = reserva
    ? reserva.items
    : order.stockReservado
      ? (await calculateOrderMaterialBoards(tx, order.detalles)).map(({ material, boards }) => ({ materialId: material.id, placas: boards }))
      : [];
  return new Map(items.map(({ materialId, placas }) => [materialId, placas]));
}
