import { EstadoPedido, TipoMaterial, type ConfiguracionOptimizador, type DetallePedido, type Material, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";

type Piece = {
  width: number;
  height: number;
  canRotate: boolean;
};

type FreeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BoardPlan = {
  freeRects: FreeRect[];
};

function materialBoardWidthMm(material: Material) {
  return material.anchoPlaca ?? 0;
}

function materialBoardHeightMm(material: Material) {
  return material.altoPlaca ?? 0;
}

function usableBoardWidthMm(material: Material, settings: ConfiguracionOptimizador) {
  return Math.max(0, materialBoardWidthMm(material) - settings.perfiladoBordeMm * 2);
}

function usableBoardHeightMm(material: Material, settings: ConfiguracionOptimizador) {
  return Math.max(0, materialBoardHeightMm(material) - settings.perfiladoBordeMm * 2);
}

function createBoard(material: Material, settings: ConfiguracionOptimizador): BoardPlan {
  return {
    freeRects: [{ x: 0, y: 0, width: usableBoardWidthMm(material, settings), height: usableBoardHeightMm(material, settings) }]
  };
}

function intersects(a: FreeRect, b: FreeRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function splitFreeRect(rect: FreeRect, used: FreeRect) {
  if (!intersects(rect, used)) return [rect];

  const nextRects: FreeRect[] = [];
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const usedRight = used.x + used.width;
  const usedBottom = used.y + used.height;

  if (used.y > rect.y) nextRects.push({ x: rect.x, y: rect.y, width: rect.width, height: used.y - rect.y });
  if (usedBottom < rectBottom) nextRects.push({ x: rect.x, y: usedBottom, width: rect.width, height: rectBottom - usedBottom });
  if (used.x > rect.x) nextRects.push({ x: rect.x, y: rect.y, width: used.x - rect.x, height: rect.height });
  if (usedRight < rectRight) nextRects.push({ x: usedRight, y: rect.y, width: rectRight - usedRight, height: rect.height });

  return nextRects.filter((nextRect) => nextRect.width > 0 && nextRect.height > 0);
}

function containsRect(outer: FreeRect, inner: FreeRect) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

function pruneFreeRects(rects: FreeRect[]) {
  return rects.filter((rect, index) => !rects.some((other, otherIndex) => index !== otherIndex && containsRect(other, rect))).sort((a, b) => a.y - b.y || a.x - b.x);
}

function sortPlacements<T extends { waste: number; shortSideWaste: number; rect: FreeRect; width: number; height: number }>(placements: T[]) {
  return [...placements].sort((a, b) => a.waste - b.waste || a.shortSideWaste - b.shortSideWaste);
}

function tryPlaceInBoard(board: BoardPlan, piece: Piece, settings: ConfiguracionOptimizador) {
  const orientations = [
    { width: piece.width, height: piece.height },
    ...(piece.canRotate ? [{ width: piece.height, height: piece.width }] : [])
  ];

  const placements = board.freeRects.flatMap((rect) =>
    orientations
      .filter((orientation) => orientation.width <= rect.width && orientation.height <= rect.height)
      .map((orientation) => ({
        rect,
        ...orientation,
        waste: rect.width * rect.height - orientation.width * orientation.height,
        shortSideWaste: Math.min(rect.width - orientation.width, rect.height - orientation.height)
      }))
  );
  const placement = sortPlacements(placements)[0];

  if (!placement) return false;

  const usedRect = {
    x: placement.rect.x,
    y: placement.rect.y,
    width: placement.width + (placement.rect.width > placement.width ? settings.espesorSierraMm : 0),
    height: placement.height + (placement.rect.height > placement.height ? settings.espesorSierraMm : 0)
  };
  board.freeRects = pruneFreeRects(board.freeRects.flatMap((rect) => splitFreeRect(rect, usedRect)));
  return true;
}

function sortPieces<T extends { width: number; height: number }>(pieces: T[]) {
  return [...pieces].sort((a, b) => b.width * b.height - a.width * a.height);
}

function calculateBoardsForMaterial(details: DetallePedido[], material: Material, settings: ConfiguracionOptimizador) {
  const pieces = sortPieces(
    details.flatMap((detail) =>
      Array.from({ length: detail.cantidad }, () => ({
        width: detail.ancho,
        height: detail.largo,
        canRotate: detail.permiteRotar
      }))
    )
  );

  if (!pieces.length) return 0;
  if (!usableBoardWidthMm(material, settings) || !usableBoardHeightMm(material, settings)) return Number.POSITIVE_INFINITY;

  const boards: BoardPlan[] = [];

  for (const piece of pieces) {
    const placed = boards.some((board) => tryPlaceInBoard(board, piece, settings));
    if (placed) continue;

    const board = createBoard(material, settings);
    if (tryPlaceInBoard(board, piece, settings)) {
      boards.push(board);
    } else {
      return Number.POSITIVE_INFINITY;
    }
  }

  return boards.length;
}

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
