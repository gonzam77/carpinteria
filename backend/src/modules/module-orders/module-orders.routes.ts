// API de las solicitudes de modulos (/api/pedidos-modulos, spec §13.2). Solo para ADMIN.
// Estado, materiales, exportacion y borrado se hacen con las rutas de /api/orders, que sirven para los dos tipos
// (spec §13.3). La edicion (PUT) es de F5.2 y la fecha de entrega (PATCH) de F5.1.
import { Router } from "express";
import { EstadoPedido, Rol, TipoPedido } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/http.js";
import { moduleOrderCreateSchema, moduleOrderFiltersSchema, moduleOrderPreviewSchema } from "./module-orders.schemas.js";
import { buildModuleOrder, buildModuleOrderEstimate, createModuleOrder, getModuleOrder, listModuleOrders } from "./module-orders.service.js";

export const moduleOrdersRouter = Router();
moduleOrdersRouter.use(authenticate, authorize(Rol.ADMIN));

moduleOrdersRouter.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    res.json(await listModuleOrders(prisma, moduleOrderFiltersSchema.parse(req.query)));
  })
);

/**
 * Calcula la solicitud completa sin guardarla (spec §8.5): modulos, filas, placas y presupuesto. El paso 4 del
 * asistente muestra solo esto (DECISIONES R3). Las filas llevan posicionModulo para agruparlas por modulo.
 */
moduleOrdersRouter.post(
  "/preview",
  asyncHandler(async (req: any, res: any) => {
    const data = moduleOrderPreviewSchema.parse(req.body);
    const order = await buildModuleOrder(prisma, data.modulos, { cliente: data.cliente, numeroContacto: data.numeroContacto });
    const estimate = await buildModuleOrderEstimate(prisma, order.detalles);
    const now = new Date().toISOString();

    res.json({
      id: "preview",
      tipo: TipoPedido.MODULOS,
      numero: null,
      estado: EstadoPedido.PENDIENTE,
      cliente: data.cliente,
      numeroContacto: data.numeroContacto,
      usuarioId: req.user.id,
      fechaCreacion: now,
      fechaActualizacion: now,
      modulos: order.lineas.map(({ definicionSnapshot: _snapshot, piezas: _piezas, detalles, ...linea }) => ({ ...linea, piezas: detalles.length })),
      detalles: order.lineas.flatMap((linea) => linea.detalles.map((detalle) => ({ ...detalle, posicionModulo: linea.posicion }))),
      herrajes: [],
      ...estimate
    });
  })
);

/** Crea la solicitud (spec §13.2). Responde la solicitud guardada, con su numero, como GET /:id. */
moduleOrdersRouter.post(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const data = moduleOrderCreateSchema.parse(req.body);
    res.status(201).json(await createModuleOrder(prisma, data, req.user.id));
  })
);

moduleOrdersRouter.get(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    res.json(await getModuleOrder(prisma, req.params.id));
  })
);
