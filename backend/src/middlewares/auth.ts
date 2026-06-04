import jwt from "jsonwebtoken";
import { Rol } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/http.js";

type JwtPayload = {
  id: string;
  email: string;
  rol: Rol;
};

export function authenticate(req: any, _res: any, next: any) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw new AppError(401, "Token requerido");
  }

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    next();
  } catch {
    throw new AppError(401, "Token invalido");
  }
}

export function authorize(...roles: Rol[]) {
  return (req: any, _res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      throw new AppError(403, "No autorizado");
    }
    next();
  };
}
