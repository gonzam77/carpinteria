import { Router } from "express";
import { EstadoPedido, Prisma, Rol, TipoMaterial, type Material } from "../../generated/prisma/client.js";
import dayjs from "dayjs";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { calculateOrderStockShortages, hasStockCommitment, returnOrderStock, stateHoldsStock, takeOrderStock } from "./order-stock.service.js";
import { AppError, asyncHandler } from "../../utils/http.js";
import { buildOrdersWorkbook } from "./excel.service.js";
import { orderFiltersSchema, orderSchema, orderStatusSchema } from "./order.schemas.js";
import { sendNewOrderWhatsappNotification } from "./whatsapp.service.js";
import { sendNewOrderPushNotification, sendOrderStockShortagePushNotification } from "../push-notifications/push-notifications.service.js";
import { buildOrderEstimateSnapshot, buildOrderMaterialsSummary } from "./order-estimate.service.js";
import { DETALLES_ORDENADOS } from "./order-queries.js";

export const ordersRouter = Router();

function canEditOrder(estado: EstadoPedido) {
  return estado !== EstadoPedido.EN_PROCESO && estado !== EstadoPedido.TERMINADA && estado !== EstadoPedido.ENTREGADA;
}

ordersRouter.use(authenticate);

function orderAccessWhere(user: any) {
  return user.rol === Rol.ADMIN ? {} : { usuarioId: user.id };
}

type CantoWithPlate = Material & {
  placaMaterial?: Pick<Material, "nombre"> | null;
};

function formatThickness(value: number) {
  return Number(value.toFixed(2)).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function buildCantoName(placaNombre: string, espesorMm: number) {
  return `Canto ${placaNombre} ${formatThickness(espesorMm)}mm`;
}

function resolveCantoName(canto?: CantoWithPlate | null) {
  if (!canto) return null;
  return canto.placaMaterial?.nombre ? buildCantoName(canto.placaMaterial.nombre, canto.espesorMm) : canto.nombre;
}

async function normalizeDetails(detalles: any[], cliente: string, numeroContacto: string) {
  const materialIds = [...new Set(detalles.map((detail) => detail.materialId))];
  const cantoIds = [
    ...new Set(
      detalles
        .flatMap((detail) => [detail.cantoLargo1Id, detail.cantoLargo2Id, detail.cantoAncho1Id, detail.cantoAncho2Id])
        .filter(Boolean)
    )
  ];

  const materials: Material[] = await prisma.material.findMany({
    where: { id: { in: materialIds }, activo: true, tipo: TipoMaterial.PLACA }
  });
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const cantos: CantoWithPlate[] = cantoIds.length
    ? await prisma.material.findMany({
        where: { id: { in: cantoIds }, activo: true, tipo: TipoMaterial.CANTO },
        include: { placaMaterial: { select: { nombre: true } } }
      })
    : [];
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));

  if (materials.length !== materialIds.length) {
    throw new AppError(400, "Seleccione un material valido para cada pieza.");
  }
  if (cantos.length !== cantoIds.length) {
    throw new AppError(400, "Seleccione un canto valido en cada borde.");
  }

  return detalles.map((detail, indice) => {
    const material = materialById.get(detail.materialId)!;
    const cantoLargo1 = detail.cantoLargo1Id ? cantoById.get(detail.cantoLargo1Id) : null;
    const cantoLargo2 = detail.cantoLargo2Id ? cantoById.get(detail.cantoLargo2Id) : null;
    const cantoAncho1 = detail.cantoAncho1Id ? cantoById.get(detail.cantoAncho1Id) : null;
    const cantoAncho2 = detail.cantoAncho2Id ? cantoById.get(detail.cantoAncho2Id) : null;

    return {
      materialId: material.id,
      codigoBarra: detail.codigoBarra ?? "",
      material: material.nombre,
      largo: detail.largo,
      ancho: detail.ancho,
      cantidad: detail.cantidad,
      cantoLargo1Id: cantoLargo1?.id ?? null,
      cantoLargo1Nombre: resolveCantoName(cantoLargo1),
      cantoLargo1: Boolean(cantoLargo1),
      cantoLargo2Id: cantoLargo2?.id ?? null,
      cantoLargo2Nombre: resolveCantoName(cantoLargo2),
      cantoLargo2: Boolean(cantoLargo2),
      cantoAncho1Id: cantoAncho1?.id ?? null,
      cantoAncho1Nombre: resolveCantoName(cantoAncho1),
      cantoAncho1: Boolean(cantoAncho1),
      cantoAncho2Id: cantoAncho2?.id ?? null,
      cantoAncho2Nombre: resolveCantoName(cantoAncho2),
      cantoAncho2: Boolean(cantoAncho2),
      permiteRotar: detail.permiteRotar,
      codigoBarraCentro: detail.codigoBarraCentro,
      remark: detail.remark,
      numeroCliente: detail.numeroCliente || numeroContacto,
      nombreCliente: detail.nombreCliente || cliente,
      nombreProducto: detail.nombreProducto,
      indice
    };
  });
}

ordersRouter.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const filters = orderFiltersSchema.parse(req.query);
    const where: any = { ...orderAccessWhere(req.user) };

    if (filters.estado) where.estado = filters.estado;
    if (filters.cliente) where.cliente = { contains: filters.cliente, mode: "insensitive" };
    if (filters.search) {
      where.OR = [
        { cliente: { contains: filters.search, mode: "insensitive" } },
        { observaciones: { contains: filters.search, mode: "insensitive" } },
        { detalles: { some: { material: { contains: filters.search, mode: "insensitive" } } } }
      ];
    }
    if (filters.desde || filters.hasta) {
      where.fechaCreacion = {
        ...(filters.desde ? { gte: dayjs(filters.desde).startOf("day").toDate() } : {}),
        ...(filters.hasta ? { lte: dayjs(filters.hasta).endOf("day").toDate() } : {})
      };
    }

    const orders = await prisma.pedido.findMany({
      where,
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, email: true, telefono: true } },
        detalles: DETALLES_ORDENADOS
      },
      orderBy: { fechaCreacion: "desc" }
    });
    res.json(orders);
  })
);

ordersRouter.post(
  "/preview",
  asyncHandler(async (req: any, res: any) => {
    const data = orderSchema.parse(req.body);
    const detalles = await normalizeDetails(data.detalles, data.cliente, data.numeroContacto);
    const estimateSnapshot = await buildOrderEstimateSnapshot(prisma as any, detalles as any);
    const now = new Date();

    res.json({
      id: "preview",
      cliente: data.cliente,
      numeroContacto: data.numeroContacto,
      observaciones: data.observaciones,
      estado: EstadoPedido.PENDIENTE,
      usuarioId: req.user.id,
      fechaCreacion: now.toISOString(),
      fechaActualizacion: now.toISOString(),
      detalles,
      ...estimateSnapshot
    });
  })
);
ordersRouter.post(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const data = orderSchema.parse(req.body);
    const detalles = await normalizeDetails(data.detalles, data.cliente, data.numeroContacto);
    const estimateSnapshot = await buildOrderEstimateSnapshot(prisma as any, detalles as any);
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.pedido.create({
        data: {
          cliente: data.cliente,
          numeroContacto: data.numeroContacto,
          observaciones: data.observaciones,
          usuarioId: req.user.id,
          ...estimateSnapshot,
          detalles: { create: detalles }
        },
        include: { detalles: DETALLES_ORDENADOS }
      });
      await tx.historialPedido.create({
        data: { pedidoId: created.id, usuarioId: req.user.id, accion: "CREAR_PEDIDO" }
      });
      return created;
    });

    const stockShortages = await calculateOrderStockShortages(prisma as any, order as any);

    // sendNewOrderWhatsappNotification(order).catch((error) => {
    //   console.error("WhatsApp notification error", error);
    // });
    sendNewOrderPushNotification(order).catch((error) => {
      console.error("Push notification error", error);
    });
    sendOrderStockShortagePushNotification(order, stockShortages).catch((error) => {
      console.error("Push stock shortage notification error", error);
    });
    res.status(201).json(order);
  })
);

ordersRouter.get(
  "/export",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const ids = String(req.query.ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const where: any = { ...orderAccessWhere(req.user), ...(ids.length ? { id: { in: ids } } : {}) };
    const orders = await prisma.pedido.findMany({ where, include: { detalles: DETALLES_ORDENADOS } });
    const workbook = await buildOrdersWorkbook(orders);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="pedidos-carpinteria.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  })
);

ordersRouter.get(
  "/:id/materiales",
  asyncHandler(async (req: any, res: any) => {
    const order = await prisma.pedido.findFirst({
      where: { id: req.params.id, ...orderAccessWhere(req.user) },
      include: { detalles: DETALLES_ORDENADOS }
    });
    if (!order) throw new AppError(404, "Pedido no encontrado");

    const summary = await buildOrderMaterialsSummary(prisma, order);
    res.json(summary);
  })
);

ordersRouter.get(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const order = await prisma.pedido.findFirst({
      where: { id: req.params.id, ...orderAccessWhere(req.user) },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, email: true, telefono: true } },
        detalles: DETALLES_ORDENADOS,
        historial: { include: { usuario: { select: { nombre: true, apellido: true } } }, orderBy: { fechaCreacion: "desc" } }
      }
    });
    if (!order) throw new AppError(404, "Pedido no encontrado");
    res.json(order);
  })
);

ordersRouter.put(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const data = orderSchema.parse(req.body);
    const detalles = await normalizeDetails(data.detalles, data.cliente, data.numeroContacto);
    const existing = await prisma.pedido.findFirst({
      where: { id: req.params.id, ...orderAccessWhere(req.user) },
      include: { detalles: DETALLES_ORDENADOS }
    });
    if (!existing) throw new AppError(404, "Pedido no encontrado");
    if (!canEditOrder(existing.estado)) {
      throw new AppError(403, "No se pueden editar pedidos en proceso, terminados o entregados.");
    }
    if (req.user.rol !== Rol.ADMIN && existing.estado !== EstadoPedido.PENDIENTE) {
      throw new AppError(403, "Solo se pueden editar pedidos pendientes");
    }
    
    const estimateSnapshot = await buildOrderEstimateSnapshot(prisma as any, detalles as any);

    if (hasStockCommitment(existing)) {
      throw new AppError(409, "La solicitud tiene stock descontado. Pasala a pendiente antes de editarla.");
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.detallePedido.deleteMany({ where: { pedidoId: existing.id } });
      const updated = await tx.pedido.update({
        where: { id: existing.id },
        data: {
          cliente: data.cliente,
          numeroContacto: data.numeroContacto,
          observaciones: data.observaciones,
          ...estimateSnapshot,
          detalles: { create: detalles }
        },
        include: { detalles: DETALLES_ORDENADOS }
      });
      await tx.historialPedido.create({
        data: { pedidoId: existing.id, usuarioId: req.user.id, accion: "EDITAR_PEDIDO" }
      });
      return updated;
    });
    res.json(order);
  })
);

ordersRouter.patch(
  "/:id/status",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const schema = orderStatusSchema.parse(req.body);
    const previous = await prisma.pedido.findUnique({ where: { id: req.params.id }, include: { detalles: DETALLES_ORDENADOS } });
    if (!previous) throw new AppError(404, "Pedido no encontrado");
    const order = await prisma.$transaction(async (tx) => {
      // Se toma el cambio de estado solo si el pedido sigue como se leyo. Si otra pestania u otro usuario lo
      // cambio entre medio, este pedido responde 409 y no toca el stock: asi no se descuenta dos veces.
      const claimed = await tx.pedido.updateMany({
        where: { id: previous.id, estado: previous.estado, fechaActualizacion: previous.fechaActualizacion },
        data: { estado: schema.estado }
      });
      if (claimed.count !== 1) {
        throw new AppError(409, "La solicitud cambio mientras tanto. Recarga la pagina y volve a intentar.", { code: "ORDER_CHANGED" });
      }

      // El stock depende solo de si el estado nuevo lo compromete (en proceso, terminado, entregado) y de si
      // el pedido ya lo tiene comprometido: se descuenta una vez y se devuelve exactamente lo descontado.
      const holdsNow = hasStockCommitment(previous);
      const needsStock = stateHoldsStock(schema.estado);
      let stockData = {};
      if (holdsNow && !needsStock) {
        await returnOrderStock(tx as any, previous as any);
        stockData = { stockReservado: false, reservaStock: Prisma.DbNull };
      } else if (!holdsNow && needsStock) {
        const reserva = await takeOrderStock(tx as any, previous as any, { force: schema.forceWithoutStock });
        stockData = { stockReservado: !reserva.forzada, reservaStock: reserva };
      }

      const updated = await tx.pedido.update({
        where: { id: req.params.id },
        data: stockData
      });
      await tx.historialPedido.create({
        data: {
          pedidoId: updated.id,
          usuarioId: req.user.id,
          accion: "CAMBIAR_ESTADO",
          valorAnterior: previous.estado,
          valorNuevo: updated.estado
        }
      });
      return updated;
    });
    res.json(order);
  })
);

ordersRouter.delete(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    if (req.user.rol !== Rol.ADMIN) {
      throw new AppError(403, "Solo un administrador puede eliminar solicitudes.");
    }
    const existing = await prisma.pedido.findFirst({
      where: { id: req.params.id, ...orderAccessWhere(req.user) },
      include: { detalles: DETALLES_ORDENADOS }
    });
    if (!existing) throw new AppError(404, "Pedido no encontrado");
    await prisma.$transaction(async (tx) => {
      if (hasStockCommitment(existing)) {
        await returnOrderStock(tx as any, existing as any);
      }
      await tx.pedido.delete({ where: { id: existing.id } });
    });
    res.status(204).send();
  })
);




