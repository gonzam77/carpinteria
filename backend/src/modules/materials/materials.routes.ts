import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { Rol, TipoMaterial } from "../../generated/prisma/client.js";
import { asyncHandler } from "../../utils/http.js";

export const materialsRouter = Router();

const placaSchema = z.object({
  tipo: z.literal(TipoMaterial.PLACA),
  nombre: z.string().min(1),
  valor: z.coerce.number().nonnegative(),
  espesorMm: z.coerce.number().positive(),
  anchoPlaca: z.coerce.number().int().positive(),
  altoPlaca: z.coerce.number().int().positive(),
  stockPlacas: z.coerce.number().int().nonnegative().optional(),
  activo: z.boolean().optional()
});

const cantoSchema = z.object({
  tipo: z.literal(TipoMaterial.CANTO),
  nombre: z.string().min(1),
  colorCanto: z.string().min(1),
  valor: z.coerce.number().nonnegative(),
  espesorMm: z.coerce.number().positive(),
  activo: z.boolean().optional()
});

const materialSchema = z.discriminatedUnion("tipo", [placaSchema, cantoSchema]);

const filtersSchema = z.object({
  incluirInactivos: z.enum(["true", "false"]).optional(),
  tipo: z.nativeEnum(TipoMaterial).optional()
});

materialsRouter.use(authenticate);

materialsRouter.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const filters = filtersSchema.parse(req.query);
    const includeInactive = req.user.rol === Rol.ADMIN && filters.incluirInactivos === "true";
    const materials = await prisma.material.findMany({
      where: {
        ...(includeInactive ? {} : { activo: true }),
        ...(filters.tipo ? { tipo: filters.tipo } : {})
      },
      orderBy: [{ tipo: "asc" }, { activo: "desc" }, { nombre: "asc" }]
    });
    res.json(materials);
  })
);

materialsRouter.post(
  "/",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const parsed = materialSchema.parse(req.body);
    const data =
      parsed.tipo === TipoMaterial.PLACA
        ? { ...parsed, colorCanto: null, stockPlacas: parsed.stockPlacas ?? 0 }
        : { ...parsed, anchoPlaca: null, altoPlaca: null, stockPlacas: null };
    const material = await prisma.material.create({ data });
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "CREAR_MATERIAL", entidad: "Material", entidadId: material.id }
    });
    res.status(201).json(material);
  })
);

materialsRouter.put(
  "/:id",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const parsed = materialSchema.parse(req.body);
    const data =
      parsed.tipo === TipoMaterial.PLACA
        ? { ...parsed, colorCanto: null, stockPlacas: parsed.stockPlacas ?? 0 }
        : { ...parsed, anchoPlaca: null, altoPlaca: null, stockPlacas: null };
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data
    });
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "EDITAR_MATERIAL", entidad: "Material", entidadId: material.id }
    });
    res.json(material);
  })
);

materialsRouter.delete(
  "/:id",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: { activo: false }
    });
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "DESACTIVAR_MATERIAL", entidad: "Material", entidadId: material.id }
    });
    res.status(204).send();
  })
);
