import { Router } from "express";
import { EstadoPedido, Rol, TipoMaterial, type Material } from "../../generated/prisma/client.js";
import dayjs from "dayjs";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { calculateOrderStockShortages, releaseOrderStock, reserveOrderStock, shouldReleaseStock, shouldReserveStock } from "./order-stock.service.js";
import { AppError, asyncHandler } from "../../utils/http.js";
import { buildOrdersWorkbook } from "./excel.service.js";
import { orderFiltersSchema, orderSchema, orderStatusSchema } from "./order.schemas.js";
import { sendNewOrderWhatsappNotification } from "./whatsapp.service.js";
import { sendNewOrderPushNotification, sendOrderStockShortagePushNotification } from "../push-notifications/push-notifications.service.js";
import { buildOrderEstimateSnapshot } from "./order-estimate.service.js";

export const ordersRouter = Router();

function canEditOrder(estado: EstadoPedido) {
  return estado !== EstadoPedido.EN_PROCESO && estado !== EstadoPedido.TERMINADA && estado !== EstadoPedido.ENTREGADA;
}

ordersRouter.use(authenticate);

function orderAccessWhere(user: any) {
  return user.rol === Rol.ADMIN ? {} : { usuarioId: user.id };
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
  const cantos: Material[] = cantoIds.length
    ? await prisma.material.findMany({
        where: { id: { in: cantoIds }, activo: true, tipo: TipoMaterial.CANTO }
      })
    : [];
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));

  if (materials.length !== materialIds.length) {
    throw new AppError(400, "Seleccione un material valido para cada pieza.");
  }
  if (cantos.length !== cantoIds.length) {
    throw new AppError(400, "Seleccione un canto valido en cada borde.");
  }

  return detalles.map((detail) => {
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
      cantoLargo1Nombre: cantoLargo1?.nombre ?? null,
      cantoLargo1: Boolean(cantoLargo1),
      cantoLargo2Id: cantoLargo2?.id ?? null,
      cantoLargo2Nombre: cantoLargo2?.nombre ?? null,
      cantoLargo2: Boolean(cantoLargo2),
      cantoAncho1Id: cantoAncho1?.id ?? null,
      cantoAncho1Nombre: cantoAncho1?.nombre ?? null,
      cantoAncho1: Boolean(cantoAncho1),
      cantoAncho2Id: cantoAncho2?.id ?? null,
      cantoAncho2Nombre: cantoAncho2?.nombre ?? null,
      cantoAncho2: Boolean(cantoAncho2),
      permiteRotar: detail.permiteRotar,
      codigoBarraCentro: detail.codigoBarraCentro,
      remark: detail.remark,
      numeroCliente: detail.numeroCliente || numeroContacto,
      nombreCliente: detail.nombreCliente || cliente,
      nombreProducto: detail.nombreProducto
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
        detalles: true
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
    const order = await prisma.$transaction(async (tx) => {
      const estimateSnapshot = await buildOrderEstimateSnapshot(tx as any, detalles as any);
      const created = await tx.pedido.create({
        data: {
          cliente: data.cliente,
          numeroContacto: data.numeroContacto,
          observaciones: data.observaciones,
          usuarioId: req.user.id,
          ...estimateSnapshot,
          detalles: { create: detalles }
        },
        include: { detalles: true }
      });
      await tx.historialPedido.create({
        data: { pedidoId: created.id, usuarioId: req.user.id, accion: "CREAR_PEDIDO" }
      });
      return created;
    });

    const stockShortages = await calculateOrderStockShortages(prisma as any, order.detalles as any);

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
    const orders = await prisma.pedido.findMany({ where, include: { detalles: true } });
    const workbook = await buildOrdersWorkbook(orders);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="pedidos-carpinteria.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  })
);

ordersRouter.get(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const order = await prisma.pedido.findFirst({
      where: { id: req.params.id, ...orderAccessWhere(req.user) },
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true, email: true, telefono: true } },
        detalles: true,
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
      include: { detalles: true }
    });
    if (!existing) throw new AppError(404, "Pedido no encontrado");
    if (!canEditOrder(existing.estado)) {
      throw new AppError(403, "No se pueden editar pedidos en proceso, terminados o entregados.");
    }
    if (req.user.rol !== Rol.ADMIN && existing.estado !== EstadoPedido.PENDIENTE) {
      throw new AppError(403, "Solo se pueden editar pedidos pendientes");
    }

    const order = await prisma.$transaction(async (tx) => {
      if (existing.estado === EstadoPedido.EN_PROCESO && existing.stockReservado) {
        await releaseOrderStock(tx as any, existing.detalles as any);
      }
      const estimateSnapshot = await buildOrderEstimateSnapshot(tx as any, detalles as any);
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
        include: { detalles: true }
      });
      if (existing.estado === EstadoPedido.EN_PROCESO && existing.stockReservado) {
        await reserveOrderStock(tx as any, updated.detalles as any);
      }
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
    const previous = await prisma.pedido.findUnique({ where: { id: req.params.id }, include: { detalles: true } });
    if (!previous) throw new AppError(404, "Pedido no encontrado");
    const order = await prisma.$transaction(async (tx) => {
      let stockReservado = previous.stockReservado;

      if (shouldReleaseStock(previous.estado, schema.estado) && previous.stockReservado) {
        await releaseOrderStock(tx as any, previous.detalles as any);
        stockReservado = false;
      }
      if (shouldReserveStock(previous.estado, schema.estado)) {
        if (schema.forceWithoutStock) {
          stockReservado = false;
        } else {
          await reserveOrderStock(tx as any, previous.detalles as any);
          stockReservado = true;
        }
      }
      const updated = await tx.pedido.update({
        where: { id: req.params.id },
        data: { estado: schema.estado, stockReservado }
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
      include: { detalles: true }
    });
    if (!existing) throw new AppError(404, "Pedido no encontrado");
    await prisma.$transaction(async (tx) => {
      if (existing.estado === EstadoPedido.EN_PROCESO && existing.stockReservado) {
        await releaseOrderStock(tx as any, existing.detalles as any);
      }
      await tx.pedido.delete({ where: { id: existing.id } });
    });
    res.status(204).send();
  })
);




