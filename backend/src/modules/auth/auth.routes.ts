import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { Rol } from "../../generated/prisma/client.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { authenticate } from "../../middlewares/auth.js";
import { AppError, asyncHandler } from "../../utils/http.js";

export const authRouter = Router();
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID || undefined);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const googleLoginSchema = z.object({
  credential: z.string().min(1)
});

const profileSchema = z.object({
  nombre: z.string().min(1),
  apellido: z.string().min(1),
  telefono: z.string().min(6)
});

function signToken(user: { id: string; email: string; rol: Rol }) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] }
  );
}

function publicUser(user: any) {
  return {
    id: user.id,
    nombre: user.nombre,
    apellido: user.apellido,
    email: user.email,
    telefono: user.telefono,
    rol: user.rol
  };
}

authRouter.post(
  "/login",
  asyncHandler(async (req: any, res: any) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.usuario.findUnique({ where: { email: data.email } });

    if (!user || !user.password || !(await bcrypt.compare(data.password, user.password))) {
      throw new AppError(401, "Credenciales invalidas");
    }

    const token = signToken(user);

    res.json({
      token,
      user: publicUser(user)
    });
  })
);

authRouter.post(
  "/google",
  asyncHandler(async (req: any, res: any) => {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new AppError(500, "GOOGLE_CLIENT_ID no configurado");
    }

    const data = googleLoginSchema.parse(req.body);
    const ticket = await googleClient.verifyIdToken({
      idToken: data.credential,
      audience: env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      throw new AppError(401, "Cuenta de Google invalida");
    }

    const [givenName = payload.name ?? "", ...familyNameParts] = (payload.name ?? "").split(" ");
    const familyName = familyNameParts.join(" ");

    const user = await prisma.usuario.upsert({
      where: { email: payload.email },
      update: {
        googleId: payload.sub,
        nombre: payload.given_name ?? givenName,
        apellido: payload.family_name ?? familyName
      },
      create: {
        email: payload.email,
        googleId: payload.sub,
        nombre: payload.given_name ?? givenName,
        apellido: payload.family_name ?? familyName,
        rol: Rol.CARPINTERO
      }
    });

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const user = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { id: true, nombre: true, apellido: true, email: true, telefono: true, rol: true, fechaCreacion: true }
    });
    res.json(user);
  })
);

authRouter.put(
  "/profile",
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const data = profileSchema.parse(req.body);
    const user = await prisma.usuario.update({
      where: { id: req.user.id },
      data,
      select: { id: true, nombre: true, apellido: true, email: true, telefono: true, rol: true, fechaCreacion: true }
    });
    res.json(user);
  })
);
