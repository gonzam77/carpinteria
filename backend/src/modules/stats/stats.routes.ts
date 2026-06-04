import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/http.js";

export const statsRouter = Router();

statsRouter.get(
  "/",
  authenticate,
  authorize(Rol.ADMIN),
  asyncHandler(async (_req: any, res: any) => {
    const [byStatus, totalOrders, totalUsers, totalPieces] = await Promise.all([
      prisma.pedido.groupBy({ by: ["estado"], _count: { _all: true } }),
      prisma.pedido.count(),
      prisma.usuario.count(),
      prisma.detallePedido.aggregate({ _sum: { cantidad: true }, _count: { _all: true } })
    ]);

    res.json({
      totalOrders,
      totalUsers,
      totalPieces: totalPieces._sum.cantidad ?? 0,
      totalRows: totalPieces._count._all,
      byStatus: byStatus.map((item) => ({ estado: item.estado, total: item._count._all }))
    });
  })
);
