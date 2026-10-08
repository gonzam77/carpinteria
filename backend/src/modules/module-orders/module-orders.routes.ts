// API de las solicitudes de modulos (/api/pedidos-modulos, spec §13.2). Solo para ADMIN.
// Estado, materiales, exportacion y borrado se hacen con las rutas de /api/orders, que sirven para los dos tipos
// (spec §13.3). La edicion es PUT /:id (spec §10.3).
import { Router } from "express";
import { EstadoPedido, Rol, TipoPedido } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/http.js";
import { moduleOrderCreateSchema, moduleOrderDeliveryDateSchema, moduleOrderFiltersSchema, moduleOrderPreviewSchema, moduleOrderUpdateSchema, moduleRecalcPreviewSchema, moduleRecalcSchema, moduleOrderClientsSchema } from "./module-orders.schemas.js";
import {
  buildModuleOrder,
  buildModuleOrderEstimate,
  changeModuleOrderDeliveryDate,
  createModuleOrder,
  findModuleOrderByAltaKey,
  getModuleOrder,
  listModuleOrders,
  recalculateModule,
  searchModuleOrderClients,
  updateModuleOrder
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
    const estimate = await buildModuleOrderEstimate(prisma, order.detalles, order.costoHerrajes);
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
      herrajes: order.lineas.flatMap((linea) => linea.herrajes.map((herraje) => ({ ...herraje, posicionModulo: linea.posicion }))),
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

/** Clientes de solicitudes anteriores para autocompletar el paso 1 (por nombre o telefono). Va antes de /:id. */
moduleOrdersRouter.get(
  "/clientes",
  asyncHandler(async (req: any, res: any) => {
    const { q } = moduleOrderClientsSchema.parse(req.query);
    res.json(await searchModuleOrderClients(prisma, q));
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

/**
 * Edita la solicitud (spec §10.3): datos del cliente y de la entrega y todas las filas. Responde la solicitud como
 * GET /:id. 403 si ya no se puede editar, 409 si tiene stock descontado o si cambio mientras se editaba.
 */
moduleOrdersRouter.put(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const data = moduleOrderUpdateSchema.parse(req.body);
    res.json(await updateModuleOrder(prisma, req.params.id, data, req.user.id));
  })
);

/**
 * Recalcular un modulo desde el catalogo (spec §10.6): la vista previa (sin guardar) muestra las piezas nuevas, cuantas
 * se reemplazan y cuantas tenian cambios a mano, y el presupuesto del pedido entero antes y despues.
 */
moduleOrdersRouter.post(
  "/:id/modulos/:moduloPedidoId/recalcular/vista-previa",
  asyncHandler(async (req: any, res: any) => {
    const data = moduleRecalcPreviewSchema.parse(req.body);
    res.json(await recalculateModule(prisma, req.params.id, req.params.moduloPedidoId, data, { apply: false, userId: req.user.id }));
  })
);

/** Aplica el recalculo (spec §10.6, DECISIONES R4): responde la solicitud como GET /:id. */
moduleOrdersRouter.post(
  "/:id/modulos/:moduloPedidoId/recalcular",
  asyncHandler(async (req: any, res: any) => {
    const data = moduleRecalcSchema.parse(req.body);
    res.json(await recalculateModule(prisma, req.params.id, req.params.moduloPedidoId, data, { apply: true, userId: req.user.id }));
  })
);
