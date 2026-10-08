import { Router } from "express";
import { EstadoPedido, Rol } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { orderMaterialBoards } from "../orders/order-estimate.service.js";
import { DETALLES_ORDENADOS } from "../orders/order-queries.js";
import { asyncHandler } from "../../utils/http.js";
import { summarizeOrders } from "./stats-summary.js";

export const statsRouter = Router();

statsRouter.get(
  "/",
  authenticate,
  authorize(Rol.ADMIN),
  asyncHandler(async (_req: any, res: any) => {
    const [byStatusAndType, totalOrders, totalUsers, totalPieces, pendingOrders] = await Promise.all([
      prisma.pedido.groupBy({ by: ["estado", "tipo"], _count: { _all: true } }),
      prisma.pedido.count(),
      prisma.usuario.count(),
      prisma.detallePedido.aggregate({ _sum: { cantidad: true }, _count: { _all: true } }),
      prisma.pedido.findMany({
        where: { estado: EstadoPedido.PENDIENTE },
        include: { detalles: DETALLES_ORDENADOS },
        orderBy: { fechaCreacion: "asc" }
      })
    ]);

    const stockDemandByMaterial = new Map<
      string,
      { materialId: string; materialNombre: string; stockDisponible: number; placasPendientes: number; pedidosPendientes: number }
    >();

    for (const order of pendingOrders) {
      try {
        // Las mismas placas que informa la constancia de cada pedido.
        const { items } = await orderMaterialBoards(prisma as any, order as any);
        for (const { material, boards } of items) {
          const current = stockDemandByMaterial.get(material.id);
          if (current) {
            current.placasPendientes += boards;
            current.pedidosPendientes += 1;
          } else {
            stockDemandByMaterial.set(material.id, {
              materialId: material.id,
              materialNombre: material.nombre,
              stockDisponible: material.stockPlacas ?? 0,
              placasPendientes: boards,
              pedidosPendientes: 1
            });
          }
        }
      } catch {
        // Ignore malformed orders in dashboard summaries so the page still renders.
      }
    }

    const stockAlerts = [...stockDemandByMaterial.values()]
      .filter((item) => item.placasPendientes > item.stockDisponible)
      .sort((a, b) => b.placasPendientes - b.stockDisponible - (a.placasPendientes - a.stockDisponible))
      .map((item) => ({
        ...item,
        faltantePlacas: item.placasPendientes - item.stockDisponible
      }));

    res.json({
      totalOrders,
      totalUsers,
      totalPieces: totalPieces._sum.cantidad ?? 0,
      totalRows: totalPieces._count._all,
      // Los totales incluyen los dos tipos (el stock es uno solo); `modulos` y `byTipo` dicen cuantos son de modulos.
      ...summarizeOrders(byStatusAndType),
      stockAlerts
    });
  })
);
