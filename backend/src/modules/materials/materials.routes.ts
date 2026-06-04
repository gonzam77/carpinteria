import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { Rol } from "../../generated/prisma/client.js";
import { asyncHandler } from "../../utils/http.js";

export const materialsRouter = Router();

const materialSchema = z.object({
  nombre: z.string().min(1),
  valor: z.coerce.number().nonnegative(),
  espesorMm: z.coerce.number().int().positive(),
  anchoPlaca: z.coerce.number().int().positive(),
  altoPlaca: z.coerce.number().int().positive(),
  activo: z.boolean().optional()
});

materialsRouter.use(authenticate);

materialsRouter.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const includeInactive = req.user.rol === Rol.ADMIN && req.query.incluirInactivos === "true";
    const materials = await prisma.material.findMany({
      where: includeInactive ? {} : { activo: true },
      orderBy: [{ activo: "desc" }, { nombre: "asc" }]
    });
    res.json(materials);
  })
);

materialsRouter.post(
  "/",
  authorize(Rol.ADMIN),
  asyncHandler(async (req: any, res: any) => {
    const data = materialSchema.parse(req.body);
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
    const data = materialSchema.parse(req.body);
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
