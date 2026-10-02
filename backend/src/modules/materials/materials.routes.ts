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
  // Stock que tenia el formulario al abrirse. Si viene, se aplica solo la diferencia que cargo el usuario,
  // para no pisar las reservas de pedidos que se hicieron mientras el formulario estaba abierto.
  stockPlacasAnterior: z.coerce.number().int().nonnegative().optional(),
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

// Vinculos con el catalogo de modulos y con las solicitudes de modulos (spec §5.6): material de fondo de un
// modulo o de la configuracion, material fijo de una pieza y colores de un modulo pedido. Con estas claves
// foraneas el borrado definitivo fallaria en la base, asi que se cuentan antes. Son 6 consultas agrupadas en
// total, no una por material.
async function catalogLinkCounts(materialIds: string[]) {
  const counts = new Map<string, number>();
  if (!materialIds.length) return counts;
  const add = (id: string | null, amount: number) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + amount);
  };
  const inIds = { in: materialIds };
  const [fondos, fijos, esqueletos, frentes, cantos, configuraciones] = await Promise.all([
    prisma.modulo.groupBy({ by: ["materialFondoId"], where: { materialFondoId: inIds }, _count: { _all: true } }),
    prisma.moduloPieza.groupBy({ by: ["materialFijoId"], where: { materialFijoId: inIds }, _count: { _all: true } }),
    prisma.pedidoModulo.groupBy({ by: ["colorEsqueletoId"], where: { colorEsqueletoId: inIds }, _count: { _all: true } }),
    prisma.pedidoModulo.groupBy({ by: ["colorFrentesId"], where: { colorFrentesId: inIds }, _count: { _all: true } }),
    prisma.pedidoModulo.groupBy({ by: ["colorCantoId"], where: { colorCantoId: inIds }, _count: { _all: true } }),
    prisma.configuracionModulos.findMany({ where: { materialFondoId: inIds }, select: { materialFondoId: true } })
  ]);
  fondos.forEach((row) => add(row.materialFondoId, row._count._all));
  fijos.forEach((row) => add(row.materialFijoId, row._count._all));
  esqueletos.forEach((row) => add(row.colorEsqueletoId, row._count._all));
  frentes.forEach((row) => add(row.colorFrentesId, row._count._all));
  cantos.forEach((row) => add(row.colorCantoId, row._count._all));
  configuraciones.forEach((row) => add(row.materialFondoId, 1));
  return counts;
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
  const catalogLinks = await catalogLinkCounts(materials.map((material) => material.id));
  const materialsWithUsage = await Promise.all(
    materials.map(async (material) => {
      const [linkedOrdersCount, linkedCantosCount] = await Promise.all([countMaterialLinks(material.id), countLinkedCantos(material.id)]);
      const linkedModulesCount = catalogLinks.get(material.id) ?? 0;
      const nombre =
        material.tipo === TipoMaterial.CANTO && material.placaMaterial?.nombre
          ? buildCantoName(material.placaMaterial.nombre, material.espesorMm)
          : material.nombre;
      return {
        ...material,
        nombre,
        linkedOrdersCount,
        linkedCantosCount,
        linkedModulesCount,
        canDeletePermanently: linkedOrdersCount === 0 && linkedCantosCount === 0 && linkedModulesCount === 0
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
            const { stockPlacasAnterior: _ignorado, ...placa } = parsed;
            return { ...placa, colorCanto: null, placaMaterialId: null, stockPlacas: parsed.stockPlacas ?? 0 };
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
            const { stockPlacasAnterior, ...placa } = parsed;
            return {
              ...placa,
              colorCanto: null,
              placaMaterialId: null,
              // Con stockPlacasAnterior el stock se ajusta despues, por diferencia y dentro de la transaccion.
              ...(stockPlacasAnterior === undefined ? { stockPlacas: parsed.stockPlacas ?? 0 } : { stockPlacas: undefined }),
              activo: existing.activo
            };
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

      let result = updatedMaterial;
      if (parsed.tipo === TipoMaterial.PLACA && parsed.stockPlacasAnterior !== undefined) {
        const delta = (parsed.stockPlacas ?? 0) - parsed.stockPlacasAnterior;
        if (delta !== 0) {
          result = await tx.material.update({ where: { id: updatedMaterial.id }, data: { stockPlacas: { increment: delta } } });
          if ((result.stockPlacas ?? 0) < 0) {
            throw new AppError(409, "El stock no puede quedar negativo: cambio mientras editabas por las reservas de pedidos. Volve a abrir el material.");
          }
        }
      }

      if (updatedMaterial.tipo === TipoMaterial.PLACA) {
        await syncLinkedCantoNames(tx, updatedMaterial.id, updatedMaterial.nombre);
      }

      await tx.auditoria.create({
        data: { usuarioId: req.user.id, accion: "EDITAR_MATERIAL", entidad: "Material", entidadId: updatedMaterial.id }
      });

      return result;
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

    // Se permite desactivar un material que usa el catalogo de modulos, pero deja de aparecer en los
    // selectores: se avisa para que se revisen los modulos (spec §5.6).
    const linkedModules = (await catalogLinkCounts([material.id])).get(material.id) ?? 0;
    if (linkedModules > 0) {
      res.json({
        aviso: `El material se usa en el catalogo de modulos o en solicitudes de modulos (${linkedModules} vinculos). Deja de aparecer en los selectores: revisa los modulos que lo usan.`
      });
      return;
    }
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
    const linkedModules = (await catalogLinkCounts([req.params.id])).get(req.params.id) ?? 0;
    if (linkedModules > 0) {
      throw new AppError(
        409,
        `No se puede eliminar definitivamente: el material se usa en el catalogo de modulos o en solicitudes de modulos (${linkedModules} vinculos). Desactivalo en su lugar.`,
        { code: "MATERIAL_IN_USE_BY_MODULES" }
      );
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
