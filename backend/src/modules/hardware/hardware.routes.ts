// Configuracion › Herrajes (/api/herrajes, spec §12 y §13.4, DECISIONES 57). Solo ADMIN. Mismas convenciones que
// Materiales: activar o desactivar (/:id/active), ajustar precios por porcentaje (/adjust-values) y borrar solo lo que
// no se uso.
import { Router } from "express";
import { Prisma, Rol } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { AppError, asyncHandler } from "../../utils/http.js";
import { hardwareActiveSchema, hardwareAdjustSchema, hardwareFiltersSchema, hardwareSchema, hardwareTypeSchema } from "./hardware.schemas.js";

export const hardwareRouter = Router();
hardwareRouter.use(authenticate, authorize(Rol.ADMIN));

const HARDWARE_INCLUDE = { tipo: { select: { id: true, nombre: true, activo: true } }, _count: { select: { modulos: true, pedidos: true } } } satisfies Prisma.HerrajeInclude;

/** Un nombre repetido (indice unico) responde 409 con un mensaje que se entiende. */
async function uniqueName<T>(work: () => Promise<T>, message: string) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError(409, message, { code: "DUPLICATE_NAME" });
    throw error;
  }
}

const serialize = ({ _count, ...herraje }: Prisma.HerrajeGetPayload<{ include: typeof HARDWARE_INCLUDE }>) => ({
  ...herraje,
  usoModulos: _count.modulos,
  usoSolicitudes: _count.pedidos,
  // Se puede borrar del todo solo si nunca se uso: si no, se desactiva (como Materiales).
  canDeletePermanently: _count.modulos === 0 && _count.pedidos === 0
});

// ---------------------------------------------------------------- tipos

hardwareRouter.get(
  "/tipos",
  asyncHandler(async (_req: any, res: any) => {
    const tipos = await prisma.tipoHerraje.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }], include: { _count: { select: { herrajes: true } } } });
    res.json(tipos.map(({ _count, ...tipo }) => ({ ...tipo, herrajes: _count.herrajes })));
  })
);

hardwareRouter.post(
  "/tipos",
  asyncHandler(async (req: any, res: any) => {
    const data = hardwareTypeSchema.parse(req.body);
    res.status(201).json(await uniqueName(() => prisma.tipoHerraje.create({ data }), `Ya hay un tipo de herraje "${data.nombre}".`));
  })
);

hardwareRouter.put(
  "/tipos/:id",
  asyncHandler(async (req: any, res: any) => {
    const data = hardwareTypeSchema.parse(req.body);
    const existing = await prisma.tipoHerraje.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, "Tipo de herraje no encontrado.");
    res.json(await uniqueName(() => prisma.tipoHerraje.update({ where: { id: existing.id }, data }), `Ya hay un tipo de herraje "${data.nombre}".`));
  })
);

// ---------------------------------------------------------------- herrajes

hardwareRouter.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const { incluirInactivos } = hardwareFiltersSchema.parse(req.query);
    const herrajes = await prisma.herraje.findMany({
      where: incluirInactivos === "true" ? {} : { activo: true },
      include: HARDWARE_INCLUDE,
      orderBy: [{ tipo: { orden: "asc" } }, { tipo: { nombre: "asc" } }, { linea: "asc" }, { medidaMm: "asc" }, { nombre: "asc" }]
    });
    res.json(herrajes.map(serialize));
  })
);

async function assertType(tipoId: string) {
  const tipo = await prisma.tipoHerraje.findUnique({ where: { id: tipoId } });
  if (!tipo) throw new AppError(400, "Elegí un tipo de herraje que exista.", { code: "HARDWARE_TYPE_INVALID" });
}

hardwareRouter.post(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const data = hardwareSchema.parse(req.body);
    await assertType(data.tipoId);
    const created = await uniqueName(() => prisma.herraje.create({ data, include: HARDWARE_INCLUDE }), `Ya hay un herraje "${data.nombre}".`);
    res.status(201).json(serialize(created));
  })
);

hardwareRouter.put(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const data = hardwareSchema.parse(req.body);
    const existing = await prisma.herraje.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, "Herraje no encontrado.");
    await assertType(data.tipoId);
    const updated = await uniqueName(
      () => prisma.herraje.update({ where: { id: existing.id }, data: {
          ...data,
          linea: data.linea ?? null,
          medidaMm: data.medidaMm ?? null,
          formulaCantidadDefecto: data.formulaCantidadDefecto ?? null,
          formulaMedidaDefecto: data.formulaMedidaDefecto ?? null
        }, include: HARDWARE_INCLUDE }),
      `Ya hay un herraje "${data.nombre}".`
    );
    res.json(serialize(updated));
  })
);

hardwareRouter.patch(
  "/:id/active",
  asyncHandler(async (req: any, res: any) => {
    const { activo } = hardwareActiveSchema.parse(req.body);
    const existing = await prisma.herraje.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, "Herraje no encontrado.");
    res.json(serialize(await prisma.herraje.update({ where: { id: existing.id }, data: { activo }, include: HARDWARE_INCLUDE })));
  })
);

/** Ajuste de precios por porcentaje (como Materiales). Redondea a centavos y deja la auditoria. */
hardwareRouter.post(
  "/adjust-values",
  asyncHandler(async (req: any, res: any) => {
    const { herrajeIds, percentage } = hardwareAdjustSchema.parse(req.body);
    const ids = [...new Set(herrajeIds)];
    const factor = 1 + percentage / 100;
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.herraje.findMany({ where: { id: { in: ids } } });
      const results = await Promise.all(existing.map((herraje) => tx.herraje.update({ where: { id: herraje.id }, data: { valor: Math.round(herraje.valor * factor * 100) / 100 } })));
      await tx.auditoria.create({ data: { usuarioId: req.user.id, accion: "AJUSTAR_VALOR_HERRAJES", entidad: "Herraje", metadata: { herrajeIds: ids, percentage, total: results.length } } });
      return results;
    });
    res.json({ updatedCount: updated.length });
  })
);

/** Borra un herraje que nunca se uso (ni en el catalogo ni en solicitudes). Si se uso, 409: se desactiva. */
hardwareRouter.delete(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const existing = await prisma.herraje.findUnique({ where: { id: req.params.id }, include: HARDWARE_INCLUDE });
    if (!existing) throw new AppError(404, "Herraje no encontrado.");
    if (existing._count.modulos || existing._count.pedidos) {
      throw new AppError(409, `"${existing.nombre}" se usa en ${existing._count.modulos} módulos y ${existing._count.pedidos} herrajes de solicitudes: desactivalo en lugar de borrarlo.`, {
        code: "HARDWARE_IN_USE"
      });
    }
    await prisma.herraje.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
