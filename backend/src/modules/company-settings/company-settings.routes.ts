import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { Rol } from "../../generated/prisma/client.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/http.js";

export const companySettingsRouter = Router();

const companySettingsSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  telefono: z.string().trim().max(40).default(""),
  email: z.union([z.literal(""), z.string().trim().email("Ingrese un email valido")])
});

companySettingsRouter.use(authenticate);

companySettingsRouter.get(
  "/",
  asyncHandler(async (_req: any, res: any) => {
    const settings = await prisma.configuracionEmpresa.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    });
    res.json(settings);
  })
);

companySettingsRouter.put(
  "/",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const data = companySettingsSchema.parse(req.body);
    const settings = await prisma.configuracionEmpresa.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data }
    });
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "EDITAR_CONFIG_EMPRESA", entidad: "ConfiguracionEmpresa", entidadId: settings.id }
    });
    res.json(settings);
  })
);
