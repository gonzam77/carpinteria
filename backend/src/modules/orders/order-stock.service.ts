import { EstadoPedido, TipoMaterial, type DetallePedido, type Material, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";
// Mismo calculo que el presupuesto y el plano de cortes: se reserva lo que la constancia informa.
import { calculateBoardsForMaterial } from "./order-estimate.service.js";

export async function getOptimizerSettings(tx: PrismaClient) {
  return tx.configuracionOptimizador.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" }
  });
}

export async function calculateOrderMaterialBoards(tx: PrismaClient, detalles: DetallePedido[]) {
  const materialIds = [...new Set(detalles.map((detail) => detail.materialId).filter(Boolean))] as string[];
  if (!materialIds.length) return [];

  const settings = await getOptimizerSettings(tx);
  const materials = await tx.material.findMany({
    where: { id: { in: materialIds }, tipo: TipoMaterial.PLACA }
  });
  const materialsById = new Map(materials.map((material) => [material.id, material]));

  return materialIds.map((materialId) => {
    const material = materialsById.get(materialId);
    if (!material) throw new AppError(400, "Material no encontrado para calcular stock.");
    const materialDetails = detalles.filter((detail) => detail.materialId === materialId);
    const boards = calculateBoardsForMaterial(materialDetails, material, settings);
    if (!Number.isFinite(boards)) {
      throw new AppError(400, `Hay piezas que no entran en la placa ${material.nombre}.`);
    }
    return { material, boards };
  });
}

export async function calculateOrderStockShortages(tx: PrismaClient, detalles: DetallePedido[]) {
  const materialBoards = await calculateOrderMaterialBoards(tx, detalles);

  return materialBoards
    .filter(({ material, boards }) => (material.stockPlacas ?? 0) < boards)
    .map(({ material, boards }) => ({
      materialId: material.id,
      materialNombre: material.nombre,
      disponible: material.stockPlacas ?? 0,
      requerido: boards,
      faltante: boards - (material.stockPlacas ?? 0)
    }));
}

export async function reserveOrderStock(tx: PrismaClient, detalles: DetallePedido[]) {
  const materialBoards = await calculateOrderMaterialBoards(tx, detalles);
  const stockShortages = materialBoards
    .filter(({ material, boards }) => (material.stockPlacas ?? 0) < boards)
    .map(({ material, boards }) => ({
      materialId: material.id,
      materialNombre: material.nombre,
      disponible: material.stockPlacas ?? 0,
      requerido: boards,
      faltante: boards - (material.stockPlacas ?? 0)
    }));

  if (stockShortages.length) {
    throw new AppError(409, "No hay stock suficiente para pasar la solicitud a en proceso.", {
      code: "STOCK_SHORTAGE_CONFIRMATION_REQUIRED",
      details: { stockShortages }
    });
  }

  for (const { material, boards } of materialBoards) {
    await tx.material.update({
      where: { id: material.id },
      data: { stockPlacas: { decrement: boards } }
    });
  }
}

export async function releaseOrderStock(tx: PrismaClient, detalles: DetallePedido[]) {
  const materialBoards = await calculateOrderMaterialBoards(tx, detalles);

  for (const { material, boards } of materialBoards) {
    await tx.material.update({
      where: { id: material.id },
      data: { stockPlacas: { increment: boards } }
    });
  }
}

export function shouldReserveStock(previous: EstadoPedido, next: EstadoPedido) {
  return previous !== EstadoPedido.EN_PROCESO && next === EstadoPedido.EN_PROCESO;
}

export function shouldReleaseStock(previous: EstadoPedido, next: EstadoPedido) {
  return previous === EstadoPedido.EN_PROCESO && (next === EstadoPedido.PENDIENTE || next === EstadoPedido.RECHAZADA);
}
