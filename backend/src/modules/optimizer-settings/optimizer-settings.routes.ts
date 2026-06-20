import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { Rol } from "../../generated/prisma/client.js";
import { asyncHandler } from "../../utils/http.js";

export const optimizerSettingsRouter = Router();

const settingsSchema = z.object({
  espesorSierraMm: z.coerce.number().positive()
});

optimizerSettingsRouter.use(authenticate);

optimizerSettingsRouter.get(
  "/",
  asyncHandler(async (_req: any, res: any) => {
    const settings = await prisma.configuracionOptimizador.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    });
    res.json(settings);
  })
);

optimizerSettingsRouter.put(
  "/",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const data = settingsSchema.parse(req.body);
    const settings = await prisma.configuracionOptimizador.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data }
    });
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "EDITAR_CONFIG_OPTIMIZADOR", entidad: "ConfiguracionOptimizador", entidadId: settings.id }
    });
    res.json(settings);
  })
);
