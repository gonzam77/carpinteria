// API del catalogo de modulos: /api/modulos (spec §13.1). Todo es solo para administradores.
// Orden de registro: /categorias, /configuracion y POST /evaluar van antes de /:id; si no, Express los toma
// como un id.
import express, { Router } from "express";
import { Rol, TipoMaterial } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { AppError, asyncHandler } from "../../utils/http.js";
import type { RoundingMode } from "../../shared/moduleFormula.js";
import { activeSchema, categoriaSchema, configuracionSchema, evaluarSchema, listFiltersSchema, moduloSchema } from "./catalog.schemas.js";
import {
  MODULE_INCLUDE,
  createModule,
  deleteModule,
  duplicateModule,
  evaluateDefinition,
  getModulesConfig,
  loadModule,
  setModuleActive,
  toDefinition,
  updateModule
} from "./catalog.service.js";
import { MAX_IMAGE_BYTES, moduleImagePath, removeModuleImage, storeModuleImage } from "./module-images.service.js";

export const catalogRouter = Router();
catalogRouter.use(authenticate, authorize(Rol.ADMIN));

// ---------------------------------------------------------------- categorias

catalogRouter.get(
  "/categorias",
  asyncHandler(async (_req: any, res: any) => {
    const categorias = await prisma.categoriaModulo.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }], include: { _count: { select: { modulos: true } } } });
    res.json(categorias.map(({ _count, ...categoria }) => ({ ...categoria, modulos: _count.modulos })));
  })
);

catalogRouter.post(
  "/categorias",
  asyncHandler(async (req: any, res: any) => {
    const data = categoriaSchema.parse(req.body);
    if (await prisma.categoriaModulo.findUnique({ where: { nombre: data.nombre } })) throw new AppError(409, "Ya existe una categoria con ese nombre.");
    const categoria = await prisma.categoriaModulo.create({ data });
    await prisma.auditoria.create({ data: { usuarioId: req.user.id, accion: "CREAR_CATEGORIA_MODULO", entidad: "CategoriaModulo", entidadId: categoria.id } });
    res.status(201).json(categoria);
  })
);

catalogRouter.put(
  "/categorias/:id",
  asyncHandler(async (req: any, res: any) => {
    const data = categoriaSchema.parse(req.body);
    const sameName = await prisma.categoriaModulo.findUnique({ where: { nombre: data.nombre } });
    if (sameName && sameName.id !== req.params.id) throw new AppError(409, "Ya existe una categoria con ese nombre.");
    const categoria = await prisma.categoriaModulo.update({ where: { id: req.params.id }, data });
    await prisma.auditoria.create({ data: { usuarioId: req.user.id, accion: "EDITAR_CATEGORIA_MODULO", entidad: "CategoriaModulo", entidadId: categoria.id } });
    res.json(categoria);
  })
);

// ---------------------------------------------------------------- configuracion

catalogRouter.get(
  "/configuracion",
  asyncHandler(async (_req: any, res: any) => {
    res.json(await getModulesConfig(prisma));
  })
);

catalogRouter.put(
  "/configuracion",
  asyncHandler(async (req: any, res: any) => {
    const data = configuracionSchema.parse(req.body);
    if (data.materialFondoId) {
      const material = await prisma.material.findUnique({ where: { id: data.materialFondoId } });
      if (!material || material.tipo !== TipoMaterial.PLACA) throw new AppError(400, "El material de fondo tiene que ser una placa.");
    }
    const config = await prisma.configuracionModulos.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
    await prisma.auditoria.create({ data: { usuarioId: req.user.id, accion: "EDITAR_CONFIG_MODULOS", entidad: "ConfiguracionModulos", entidadId: config.id } });
    res.json(config);
  })
);

// ---------------------------------------------------------------- evaluar sin guardar

catalogRouter.post(
  "/evaluar",
  asyncHandler(async (req: any, res: any) => {
    const { definicion, valores } = evaluarSchema.parse(req.body);
    const config = await getModulesConfig(prisma);
    res.json(evaluateDefinition(definicion, valores, config.redondeo as RoundingMode));
  })
);

// ---------------------------------------------------------------- modulos

catalogRouter.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const filters = listFiltersSchema.parse(req.query);
    const config = await getModulesConfig(prisma);
    const modules = await prisma.modulo.findMany({
      where: {
        ...(filters.incluirInactivos === "true" ? {} : { activo: true }),
        ...(filters.categoriaId ? { categoriaId: filters.categoriaId } : {}),
        ...(filters.search
          ? { OR: [{ nombre: { contains: filters.search, mode: "insensitive" } }, { codigo: { contains: filters.search, mode: "insensitive" } }] }
          : {})
      },
      include: MODULE_INCLUDE,
      orderBy: [{ categoria: { orden: "asc" } }, { nombre: "asc" }]
    });
    res.json(
      modules.map((module) => {
        const definition = toDefinition(module);
        const { errores } = evaluateDefinition(definition, {}, config.redondeo as RoundingMode);
        return {
          id: module.id,
          codigo: module.codigo,
          nombre: module.nombre,
          categoria: definition.categoria,
          activo: module.activo,
          version: module.version,
          fechaActualizacion: module.fechaActualizacion,
          tieneImagen: Boolean(module.imagen),
          imagenActualizada: module.imagen?.fechaActualizacion ?? null,
          piezas: module.piezas.length,
          parametros: module.parametros.length,
          tienePedidos: definition.tienePedidos,
          estadoFormulas: errores.length ? "CON_ERRORES" : "OK",
          observaciones: module.observaciones,
          cantidadObservaciones: module.observaciones ? module.observaciones.split("\n").filter((line) => line.trim()).length : 0
        };
      })
    );
  })
);

catalogRouter.post(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const input = moduloSchema.parse(req.body);
    res.status(201).json(toDefinition(await createModule(prisma, input, req.user.id)));
  })
);

catalogRouter.get(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const module = await loadModule(prisma, req.params.id);
    const config = await getModulesConfig(prisma);
    const definition = toDefinition(module);
    const evaluation = evaluateDefinition(definition, {}, config.redondeo as RoundingMode);
    res.json({ ...definition, estadoFormulas: evaluation.errores.length ? "CON_ERRORES" : "OK", errores: evaluation.errores });
  })
);

catalogRouter.put(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const input = moduloSchema.parse(req.body);
    res.json(toDefinition(await updateModule(prisma, req.params.id, input, req.user.id)));
  })
);

catalogRouter.patch(
  "/:id/active",
  asyncHandler(async (req: any, res: any) => {
    const { activo } = activeSchema.parse(req.body);
    res.json(toDefinition(await setModuleActive(prisma, req.params.id, activo, req.user.id)));
  })
);

catalogRouter.post(
  "/:id/duplicar",
  asyncHandler(async (req: any, res: any) => {
    res.status(201).json(toDefinition(await duplicateModule(prisma, req.params.id, req.user.id)));
  })
);

catalogRouter.delete(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    await deleteModule(prisma, req.params.id, req.user.id);
    res.status(204).send();
  })
);

// ---------------------------------------------------------------- imagen (archivo en el servidor, DECISIONES 12)

const rawImage = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_IMAGE_BYTES });

catalogRouter.put(
  "/:id/imagen",
  (req: any, res: any, next: any) =>
    rawImage(req, res, (error?: any) => {
      if (error?.type === "entity.too.large") return next(new AppError(413, "La imagen supera 1 MB. Achicala o comprimila antes de subirla.", { code: "IMAGE_TOO_LARGE" }));
      next(error);
    }),
  asyncHandler(async (req: any, res: any) => {
    await loadModule(prisma, req.params.id);
    if (!Buffer.isBuffer(req.body)) throw new AppError(415, "Solo se aceptan imagenes JPEG, PNG o WebP.", { code: "IMAGE_TYPE_NOT_ALLOWED" });
    const image = await storeModuleImage(prisma, req.params.id, req.body);
    await prisma.auditoria.create({ data: { usuarioId: req.user.id, accion: "CAMBIAR_IMAGEN_MODULO", entidad: "Modulo", entidadId: req.params.id } });
    res.json({ mime: image.mime, tamanoBytes: image.tamanoBytes, fechaActualizacion: image.fechaActualizacion });
  })
);

catalogRouter.get(
  "/:id/imagen",
  asyncHandler(async (req: any, res: any) => {
    const image = await prisma.moduloImagen.findUnique({ where: { moduloId: req.params.id } });
    if (!image) throw new AppError(404, "El modulo no tiene imagen.");
    // El nombre del archivo lleva el hash del contenido: sirve de ETag.
    const etag = `"${image.archivo}"`;
    res.set({ ETag: etag, "Cache-Control": "private, max-age=86400" });
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.type(image.mime);
    res.sendFile(moduleImagePath(image.archivo), (error: any) => {
      if (error && !res.headersSent) res.status(404).json({ message: "No se encontro el archivo de la imagen." });
    });
  })
);

catalogRouter.delete(
  "/:id/imagen",
  asyncHandler(async (req: any, res: any) => {
    await loadModule(prisma, req.params.id);
    if (await removeModuleImage(prisma, req.params.id)) {
      await prisma.auditoria.create({ data: { usuarioId: req.user.id, accion: "QUITAR_IMAGEN_MODULO", entidad: "Modulo", entidadId: req.params.id } });
    }
    res.status(204).send();
  })
);
