import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { Rol } from "../../generated/prisma/client.js";
import { asyncHandler } from "../../utils/http.js";

export const budgetSettingsRouter = Router();

const settingsSchema = z.object({
  manoObraCanto045Mm: z.coerce.number().nonnegative(),
  manoObraCanto1Mm: z.coerce.number().nonnegative(),
  manoObraCanto2Mm: z.coerce.number().nonnegative(),
  manoObraPlacaPorPlaca: z.coerce.number().nonnegative()
});

function upsertBudgetSettings(data?: z.infer<typeof settingsSchema>) {
  return prisma.configuracionPresupuesto.upsert({
    where: { id: "default" },
    update: data ?? {},
    create: {
      id: "default",
      manoObraCanto045Mm: 0,
      manoObraCanto1Mm: 0,
      manoObraCanto2Mm: 0,
      manoObraPlacaPorPlaca: 0,
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

