import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { Rol, TipoMaterial } from "../../generated/prisma/client.js";
import { AppError, asyncHandler } from "../../utils/http.js";

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

const adjustValuesSchema = z.object({
  materialIds: z.array(z.string().min(1)).min(1),
  percentage: z.coerce.number().refine((value) => Number.isFinite(value) && value > -100, { message: "El porcentaje debe ser mayor a -100" })
});

const filtersSchema = z.object({
  incluirInactivos: z.enum(["true", "false"]).optional(),
  tipo: z.nativeEnum(TipoMaterial).optional()
});

async function ensureMaterialNameAvailable(nombre: string, currentId?: string) {
  const existingMaterial = await prisma.material.findFirst({
    where: {
      nombre,
      ...(currentId ? { id: { not: currentId } } : {})
    },
    select: { id: true }
  });

  if (existingMaterial) {
    throw new AppError(400, "Ya existe un material con ese nombre.");
  }
}

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
    await ensureMaterialNameAvailable(parsed.nombre);
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

materialsRouter.post(
  "/adjust-values",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const { materialIds, percentage } = adjustValuesSchema.parse(req.body);
    const uniqueIds = [...new Set(materialIds)];
    const factor = 1 + percentage / 100;

    const updatedMaterials = await prisma.$transaction(async (tx) => {
      const existingMaterials = await tx.material.findMany({
        where: { id: { in: uniqueIds } }
      });
      const materialById = new Map(existingMaterials.map((material) => [material.id, material]));

      const updates = uniqueIds
        .map((id) => materialById.get(id))
        .filter(Boolean)
        .map((material) =>
          tx.material.update({
            where: { id: material!.id },
            data: { valor: Math.round(material!.valor * factor * 100) / 100 }
          })
        );

      const results = await Promise.all(updates);

      await tx.auditoria.create({
        data: {
          usuarioId: req.user.id,
          accion: "AJUSTAR_VALOR_MATERIALES",
          entidad: "Material",
          metadata: { materialIds: uniqueIds, percentage, total: results.length }
        }
      });

      return results;
    });

    res.json({ updatedCount: updatedMaterials.length, materials: updatedMaterials });
  })
);

materialsRouter.put(
  "/:id",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const parsed = materialSchema.parse(req.body);
    await ensureMaterialNameAvailable(parsed.nombre, req.params.id);
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
    await prisma.$transaction(async (tx) => {
      const deletedMaterial = await tx.material.delete({
        where: { id: req.params.id }
      });

      await tx.auditoria.create({
        data: { usuarioId: req.user.id, accion: "ELIMINAR_MATERIAL", entidad: "Material", entidadId: deletedMaterial.id }
      });
    });

    res.status(204).send();
  })
);
