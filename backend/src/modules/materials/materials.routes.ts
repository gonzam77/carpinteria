import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { Rol, TipoMaterial } from "../../generated/prisma/client.js";
import { AppError, asyncHandler } from "../../utils/http.js";

export const materialsRouter = Router();

const ALLOWED_CANTO_THICKNESSES = [0.45, 1, 2] as const;
const allowedCantoThicknessSet = new Set<number>(ALLOWED_CANTO_THICKNESSES);

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
  placaMaterialId: z.string().uuid(),
  valor: z.coerce.number().nonnegative(),
  espesorMm: z.coerce.number().refine((value) => allowedCantoThicknessSet.has(value), {
    message: "La medida del canto debe ser 0.45mm, 1mm o 2mm."
  }),
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

const activeStatusSchema = z.object({
  activo: z.boolean()
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

function formatThickness(value: number) {
  return Number(value.toFixed(2)).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function buildCantoName(placaNombre: string, espesorMm: number) {
  return `Canto ${placaNombre} ${formatThickness(espesorMm)}mm`;
}

type CantoNameSync = {
  id: string;
  nombre: string;
  espesorMm: number;
};

async function syncLinkedCantoNames(tx: any, placaMaterialId: string, placaNombre: string) {
  const linkedCantos: CantoNameSync[] = await tx.material.findMany({
    where: { tipo: TipoMaterial.CANTO, placaMaterialId },
    select: { id: true, nombre: true, espesorMm: true }
  });
  const currentNamesById = new Map(linkedCantos.map((canto) => [canto.id, canto.nombre]));
  const pendingUpdates = linkedCantos
    .map((canto) => ({
      id: canto.id,
      nombre: buildCantoName(placaNombre, canto.espesorMm)
    }))
    .filter((canto) => currentNamesById.get(canto.id) !== canto.nombre);

  if (!pendingUpdates.length) return;

  const conflictingMaterial = await tx.material.findFirst({
    where: {
      nombre: { in: pendingUpdates.map((canto) => canto.nombre) },
      id: { notIn: pendingUpdates.map((canto) => canto.id) }
    },
    select: { nombre: true }
  });

  if (conflictingMaterial) {
    throw new AppError(400, `Ya existe un material con el nombre "${conflictingMaterial.nombre}".`);
  }

  await Promise.all(
    pendingUpdates.map((canto) =>
      tx.material.update({
        where: { id: canto.id },
        data: { nombre: canto.nombre }
      })
    )
  );
}

async function findCantoPlate(placaMaterialId: string) {
  const placa = await prisma.material.findFirst({
    where: { id: placaMaterialId, tipo: TipoMaterial.PLACA },
    select: { id: true, nombre: true }
  });

  if (!placa) {
    throw new AppError(400, "Seleccione una placa valida para crear el canto.");
  }

  return placa;
}

async function ensureCantoCombinationAvailable(placaMaterialId: string, espesorMm: number, currentId?: string) {
  const existingCanto = await prisma.material.findFirst({
    where: {
      tipo: TipoMaterial.CANTO,
      placaMaterialId,
      espesorMm,
      ...(currentId ? { id: { not: currentId } } : {})
    },
    select: { id: true }
  });

  if (existingCanto) {
    throw new AppError(400, "Ya existe un canto para esa placa y ese espesor.");
  }
}

async function countMaterialLinks(materialId: string) {
  return prisma.detallePedido.count({
    where: {
      OR: [{ materialId }, { cantoLargo1Id: materialId }, { cantoLargo2Id: materialId }, { cantoAncho1Id: materialId }, { cantoAncho2Id: materialId }]
    }
  });
}

async function countLinkedCantos(materialId: string) {
  return prisma.material.count({
    where: {
      tipo: TipoMaterial.CANTO,
      placaMaterialId: materialId
    }
  });
}

async function serializeMaterials(materials: Array<any>) {
  const materialsWithUsage = await Promise.all(
    materials.map(async (material) => {
      const [linkedOrdersCount, linkedCantosCount] = await Promise.all([countMaterialLinks(material.id), countLinkedCantos(material.id)]);
      const nombre =
        material.tipo === TipoMaterial.CANTO && material.placaMaterial?.nombre
          ? buildCantoName(material.placaMaterial.nombre, material.espesorMm)
          : material.nombre;
      return {
        ...material,
        nombre,
        linkedOrdersCount,
        linkedCantosCount,
        canDeletePermanently: linkedOrdersCount === 0 && linkedCantosCount === 0
      };
    })
  );

  return materialsWithUsage;
}

materialsRouter.use(authenticate);

materialsRouter.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    const filters = filtersSchema.parse(req.query);
    const includeInactive = req.user.rol === Rol.ADMIN && filters.incluirInactivos === "true";
    const materials = await prisma.material.findMany({
      where: {
        ...(includeInactive ? {} : { activo: true }),
        ...(filters.tipo ? { tipo: filters.tipo } : {})
      },
      include: {
        placaMaterial: { select: { id: true, nombre: true, activo: true } }
      },
      orderBy: [{ tipo: "asc" }, { activo: "desc" }, { nombre: "asc" }]
    });

    res.json(await serializeMaterials(materials));
  })
);

materialsRouter.post(
  "/",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const parsed = materialSchema.parse(req.body);
    const data =
      parsed.tipo === TipoMaterial.PLACA
        ? await (async () => {
            await ensureMaterialNameAvailable(parsed.nombre);
            return { ...parsed, colorCanto: null, placaMaterialId: null, stockPlacas: parsed.stockPlacas ?? 0 };
          })()
        : await (async () => {
            const placa = await findCantoPlate(parsed.placaMaterialId);
            await ensureCantoCombinationAvailable(parsed.placaMaterialId, parsed.espesorMm);
            const nombre = buildCantoName(placa.nombre, parsed.espesorMm);
            await ensureMaterialNameAvailable(nombre);
            return {
              tipo: parsed.tipo,
              nombre,
              valor: parsed.valor,
              espesorMm: parsed.espesorMm,
              colorCanto: null,
              placaMaterialId: parsed.placaMaterialId,
              anchoPlaca: null,
              altoPlaca: null,
              stockPlacas: null,
              activo: parsed.activo ?? true
            };
          })();
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
    const existing = await prisma.material.findUnique({ where: { id: req.params.id }, select: { activo: true } });
    if (!existing) throw new AppError(404, "Material no encontrado.");

    const data =
      parsed.tipo === TipoMaterial.PLACA
        ? await (async () => {
            await ensureMaterialNameAvailable(parsed.nombre, req.params.id);
            return { ...parsed, colorCanto: null, placaMaterialId: null, stockPlacas: parsed.stockPlacas ?? 0, activo: existing.activo };
          })()
        : await (async () => {
            const placa = await findCantoPlate(parsed.placaMaterialId);
            await ensureCantoCombinationAvailable(parsed.placaMaterialId, parsed.espesorMm, req.params.id);
            const nombre = buildCantoName(placa.nombre, parsed.espesorMm);
            await ensureMaterialNameAvailable(nombre, req.params.id);
            return {
              tipo: parsed.tipo,
              nombre,
              valor: parsed.valor,
              espesorMm: parsed.espesorMm,
              colorCanto: null,
              placaMaterialId: parsed.placaMaterialId,
              anchoPlaca: null,
              altoPlaca: null,
              stockPlacas: null,
              activo: existing.activo
            };
          })();
    const material = await prisma.$transaction(async (tx) => {
      const updatedMaterial = await tx.material.update({
        where: { id: req.params.id },
        data
      });

      if (updatedMaterial.tipo === TipoMaterial.PLACA) {
        await syncLinkedCantoNames(tx, updatedMaterial.id, updatedMaterial.nombre);
      }

      await tx.auditoria.create({
        data: { usuarioId: req.user.id, accion: "EDITAR_MATERIAL", entidad: "Material", entidadId: updatedMaterial.id }
      });

      return updatedMaterial;
    });
    res.json(material);
  })
);

materialsRouter.patch(
  "/:id/active",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const { activo } = activeStatusSchema.parse(req.body);
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: { activo }
    });

    await prisma.auditoria.create({
      data: {
        usuarioId: req.user.id,
        accion: activo ? "REACTIVAR_MATERIAL" : "DESACTIVAR_MATERIAL",
        entidad: "Material",
        entidadId: material.id
      }
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

materialsRouter.delete(
  "/:id/permanent",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const linkedOrdersCount = await countMaterialLinks(req.params.id);
    if (linkedOrdersCount > 0) {
      throw new AppError(400, "No se puede eliminar definitivamente un material vinculado a solicitudes.");
    }

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
