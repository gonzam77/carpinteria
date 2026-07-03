import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { Rol } from "../../generated/prisma/client.js";
import { asyncHandler } from "../../utils/http.js";

export const budgetSettingsRouter = Router();

const settingsSchema = z.object({
  manoObraCantoPorMetro: z.coerce.number().nonnegative(),
  manoObraCortePorPieza: z.coerce.number().nonnegative()
});

function upsertBudgetSettings(data?: z.infer<typeof settingsSchema>) {
  return prisma.configuracionPresupuesto.upsert({
    where: { id: "default" },
    update: data ?? {},
    create: {
      id: "default",
      manoObraCantoPorMetro: 0,
      manoObraCortePorPieza: 0,
      ...data
    }
  });
}

budgetSettingsRouter.use(authenticate);

budgetSettingsRouter.get(
  "/",
  asyncHandler(async (_req: any, res: any) => {
    const settings = await upsertBudgetSettings();
    res.json(settings);
  })
);

budgetSettingsRouter.put(
  "/",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const data = settingsSchema.parse(req.body);
    const settings = await upsertBudgetSettings(data);
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "EDITAR_CONFIG_PRESUPUESTO", entidad: "ConfiguracionPresupuesto", entidadId: settings.id }
    });
    res.json(settings);
  })
);
