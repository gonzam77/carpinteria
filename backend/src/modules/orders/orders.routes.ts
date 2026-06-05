import { Router } from "express";
import { EstadoPedido, Rol, type Material } from "../../generated/prisma/client.js";
import dayjs from "dayjs";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { AppError, asyncHandler } from "../../utils/http.js";
import { buildOrdersWorkbook } from "./excel.service.js";
import { orderFiltersSchema, orderSchema } from "./order.schemas.js";

export const ordersRouter = Router();

ordersRouter.use(authenticate);

function orderAccessWhere(user: any) {
  return user.rol === Rol.ADMIN ? {} : { usuarioId: user.id };
}

async function normalizeDetails(detalles: any[], cliente: string, numeroContacto: string) {
  const materialIds = [...new Set(detalles.map((detail) => detail.materialId))];
  const materials: Material[] = await prisma.material.findMany({
    where: { id: { in: materialIds }, activo: true }
  });
  const materialById = new Map(materials.map((material) => [material.id, material]));

  if (materials.length !== materialIds.length) {
    throw new AppError(400, "Seleccione un material valido para cada pieza.");
  }

  return detalles.map((detail) => {
    const material = materialById.get(detail.materialId)!;
    return {
      materialId: material.id,
      codigoBarra: detail.codigoBarra ?? "",
      material: material.nombre,
      largo: detail.largo,
      ancho: detail.ancho,
      cantidad: detail.cantidad,
      cantoLargo1: detail.cantoLargo1,
      cantoLargo2: detail.cantoLargo2,
      cantoAncho1: detail.cantoAncho1,
      cantoAncho2: detail.cantoAncho2,
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
  "/",
  asyncHandler(async (req: any, res: any) => {
    const data = orderSchema.parse(req.body);
    const detalles = await normalizeDetails(data.detalles, data.cliente, data.numeroContacto);
    const order = await prisma.pedido.create({
      data: {
        cliente: data.cliente,
        numeroContacto: data.numeroContacto,
        observaciones: data.observaciones,
        usuarioId: req.user.id,
        detalles: { create: detalles }
      },
      include: { detalles: true }
    });
    await prisma.historialPedido.create({
      data: { pedidoId: order.id, usuarioId: req.user.id, accion: "CREAR_PEDIDO" }
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
    const existing = await prisma.pedido.findFirst({ where: { id: req.params.id, ...orderAccessWhere(req.user) } });
    if (!existing) throw new AppError(404, "Pedido no encontrado");
    if (req.user.rol !== Rol.ADMIN && existing.estado !== EstadoPedido.PENDIENTE) {
      throw new AppError(403, "Solo se pueden editar pedidos pendientes");
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.detallePedido.deleteMany({ where: { pedidoId: existing.id } });
      const updated = await tx.pedido.update({
        where: { id: existing.id },
        data: {
          cliente: data.cliente,
          numeroContacto: data.numeroContacto,
          observaciones: data.observaciones,
          detalles: { create: detalles }
        },
        include: { detalles: true }
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
    const schema = { estado: req.body.estado as EstadoPedido };
    if (!Object.values(EstadoPedido).includes(schema.estado)) throw new AppError(400, "Estado invalido");
    const previous = await prisma.pedido.findUnique({ where: { id: req.params.id } });
    if (!previous) throw new AppError(404, "Pedido no encontrado");
    const order = await prisma.pedido.update({ where: { id: req.params.id }, data: { estado: schema.estado } });
    await prisma.historialPedido.create({
      data: {
        pedidoId: order.id,
        usuarioId: req.user.id,
        accion: "CAMBIAR_ESTADO",
        valorAnterior: previous.estado,
        valorNuevo: order.estado
      }
    });
    res.json(order);
  })
);

ordersRouter.delete(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const existing = await prisma.pedido.findFirst({ where: { id: req.params.id, ...orderAccessWhere(req.user) } });
    if (!existing) throw new AppError(404, "Pedido no encontrado");
    if (req.user.rol !== Rol.ADMIN && existing.estado !== EstadoPedido.PENDIENTE) {
      throw new AppError(403, "Solo se pueden eliminar pedidos pendientes");
    }
    await prisma.pedido.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);
