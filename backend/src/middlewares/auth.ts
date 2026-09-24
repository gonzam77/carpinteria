import jwt from "jsonwebtoken";
import { Rol } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/http.js";

type JwtPayload = {
  id: string;
  email: string;
  rol: Rol;
  /** Inicio de la sesion, arrastrado entre renovaciones. Falta en tokens viejos. */
  ses?: number;
};

export function authenticate(req: any, _res: any, next: any) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw new AppError(401, "Token requerido");
  }

  let payload: JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new AppError(401, "Token invalido");
  }

  // El tope tambien se aplica al usar y no solo al renovar. Si se controlara
  // solo en /refresh, la sesion real duraria el tope MAS lo que le quede de
  // vida al ultimo token emitido.
  if (typeof payload.ses === "number" && Date.now() - payload.ses > env.SESSION_MAX_HOURS * 60 * 60 * 1000) {
    throw new AppError(401, "La sesion alcanzo su duracion maxima");
  }

  req.user = payload;
  next();
}

export function authorize(...roles: Rol[]) {
  return (req: any, _res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      throw new AppError(403, "No autorizado");
    }
    next();
  };
}
