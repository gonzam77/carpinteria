import { Router } from "express";
import bcrypt from "bcryptjs";
import { Rol } from "../../generated/prisma/client.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/http.js";

export const usersRouter = Router();

const userSchema = z.object({
  nombre: z.string().min(1),
  apellido: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  telefono: z.string().optional(),
  rol: z.nativeEnum(Rol)
});

usersRouter.use(authenticate, authorize(Rol.ADMIN));

usersRouter.get(
  "/",
  asyncHandler(async (_req: any, res: any) => {
    const users = await prisma.usuario.findMany({
      orderBy: { fechaCreacion: "desc" },
      select: { id: true, nombre: true, apellido: true, email: true, telefono: true, rol: true, fechaCreacion: true }
    });
    res.json(users);
  })
);

usersRouter.post(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const data = userSchema.required({ password: true }).parse(req.body);
    const user = await prisma.usuario.create({
      data: { ...data, password: await bcrypt.hash(data.password, 10) },
      select: { id: true, nombre: true, apellido: true, email: true, telefono: true, rol: true, fechaCreacion: true }
    });
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "CREAR_USUARIO", entidad: "Usuario", entidadId: user.id }
    });
    res.status(201).json(user);
  })
);

usersRouter.put(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    const data = userSchema.parse(req.body);
    const user = await prisma.usuario.update({
      where: { id: req.params.id },
      data: {
        nombre: data.nombre,
        apellido: data.apellido,
        email: data.email,
        telefono: data.telefono,
        rol: data.rol,
        ...(data.password ? { password: await bcrypt.hash(data.password, 10) } : {})
      },
      select: { id: true, nombre: true, apellido: true, email: true, rol: true, fechaCreacion: true }
    });
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "EDITAR_USUARIO", entidad: "Usuario", entidadId: user.id }
    });
    res.json(user);
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req: any, res: any) => {
    await prisma.usuario.delete({ where: { id: req.params.id } });
    await prisma.auditoria.create({
      data: { usuarioId: req.user.id, accion: "ELIMINAR_USUARIO", entidad: "Usuario", entidadId: req.params.id }
    });
    res.status(204).send();
  })
);
