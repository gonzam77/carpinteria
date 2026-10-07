// API de las solicitudes de modulos (/api/pedidos-modulos, spec §13.2). Solo para ADMIN.
// Estado, materiales, exportacion y borrado se hacen con las rutas de /api/orders, que sirven para los dos tipos
// (spec §13.3). La edicion (PUT) es de F5.2.
import { Router } from "express";
import { EstadoPedido, Rol, TipoPedido } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/http.js";
import { moduleOrderCreateSchema, moduleOrderDeliveryDateSchema, moduleOrderFiltersSchema, moduleOrderPreviewSchema } from "./module-orders.schemas.js";
import {
  buildModuleOrder,
  buildModuleOrderEstimate,
  changeModuleOrderDeliveryDate,
  createModuleOrder,
  findModuleOrderByAltaKey,
  getModuleOrder,
  listModuleOrders
} from "./module-orders.service.js";

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

/**
 * Crea la solicitud (spec §13.2). Responde la solicitud guardada, con su numero, como GET /:id: 201 si la creo, 200 si
 * ese intento (claveAlta) ya habia entrado (DECISIONES 40).
 */
moduleOrdersRouter.post(
  "/",
  asyncHandler(async (req: any, res: any) => {
    // Un intento que ya entro se devuelve antes de validar el resto: el reintento puede traer datos que hoy ya no pasan
    // (por ejemplo, una fecha de entrega que vencio a la medianoche), y un 400 haria creer que no se creo.
    const clave = moduleOrderCreateSchema.shape.claveAlta.safeParse(req.body?.claveAlta);
    if (clave.success && clave.data) {
      const previous = await findModuleOrderByAltaKey(prisma, clave.data, req.user.id);
      if (previous) return res.status(200).json(previous);
    }
    const data = moduleOrderCreateSchema.parse(req.body);
    const { order, created } = await createModuleOrder(prisma, data, req.user.id);
    res.status(created ? 201 : 200).json(order);
  })
);

moduleOrdersRouter.get(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    res.json(await getModuleOrder(prisma, req.params.id));
  })
);

/** Cambia la fecha de entrega (spec §9.3), con historial. Responde la solicitud como GET /:id. */
moduleOrdersRouter.patch(
  "/:id/fecha-entrega",
  asyncHandler(async (req: any, res: any) => {
    const { fechaEntrega } = moduleOrderDeliveryDateSchema.parse(req.body);
    res.json(await changeModuleOrderDeliveryDate(prisma, req.params.id, fechaEntrega, req.user.id));
  })
);
