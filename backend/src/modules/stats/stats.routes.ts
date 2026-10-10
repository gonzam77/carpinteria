import { Router } from "express";
import { EstadoPedido, Rol, TipoPedido } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { orderMaterialBoards } from "../orders/order-estimate.service.js";
import { DETALLES_ORDENADOS } from "../orders/order-queries.js";
import { asyncHandler } from "../../utils/http.js";
import { summarizeModuleOrders, summarizeOrders } from "./stats-summary.js";
import { getModulesConfig } from "../catalog/catalog.service.js";
import { toDateOnly, todayInBusinessZone } from "../../utils/dates.js";

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

    // Solicitudes de modulos (punto 8): en curso, entregas, cumplimiento, ticket, meses y los modulos mas pedidos.
    const [moduleOrders, entregas, topModulos, config] = await Promise.all([
      prisma.pedido.findMany({
        where: { tipo: TipoPedido.MODULOS },
        select: {
          id: true,
          numero: true,
          cliente: true,
          estado: true,
          fechaEntrega: true,
          fechaCreacion: true,
          presupuestoEstimado: true,
          costoHerrajes: true,
          placasEstimadas: true,
          _count: { select: { modulos: true } }
        }
      }),
      prisma.historialPedido.findMany({
        where: { accion: "CAMBIAR_ESTADO", valorNuevo: EstadoPedido.ENTREGADA, pedido: { tipo: TipoPedido.MODULOS } },
        select: { pedidoId: true, fechaCreacion: true },
        orderBy: { fechaCreacion: "asc" }
      }),
      prisma.pedidoModulo.groupBy({
        by: ["nombreModulo"],
        where: { pedido: { estado: { not: EstadoPedido.RECHAZADA } } },
        _count: { _all: true },
        orderBy: { _count: { nombreModulo: "desc" } },
        take: 5
      }),
      getModulesConfig(prisma)
    ]);
    // El dia en que cada una paso a Entregada (la ultima vez).
    const entregadaEl = new Map(entregas.map((item) => [item.pedidoId, todayInBusinessZone(item.fechaCreacion)]));
    const modulos = summarizeModuleOrders(
      moduleOrders.map((order) => ({
        id: order.id,
        numero: order.numero,
        cliente: order.cliente,
        estado: order.estado,
        fechaEntrega: toDateOnly(order.fechaEntrega),
        creada: todayInBusinessZone(order.fechaCreacion),
        presupuestoEstimado: order.presupuestoEstimado,
        costoHerrajes: order.costoHerrajes,
        placasEstimadas: order.placasEstimadas,
        modulos: order._count.modulos,
        entregada: entregadaEl.get(order.id) ?? null
      })),
      topModulos.map((item) => ({ nombre: item.nombreModulo, cantidad: item._count._all })),
      { today: todayInBusinessZone(), diasAviso: config.diasAvisoVencimiento }
    );

    res.json({
      totalOrders,
      modulos,
      totalUsers,
      totalPieces: totalPieces._sum.cantidad ?? 0,
      totalRows: totalPieces._count._all,
      // Los totales incluyen los dos tipos (el stock es uno solo); `modulos` y `byTipo` dicen cuantos son de modulos.
      ...summarizeOrders(byStatusAndType),
      stockAlerts
    });
  })
);
