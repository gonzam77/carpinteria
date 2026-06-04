import { AppError } from "../utils/http.js";

export function errorMiddleware(error: any, _req: any, res: any, _next: any) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error?.name === "ZodError") {
    return res.status(400).json({ message: "Datos invalidos", errors: error.errors });
  }

  console.error(error);
  return res.status(500).json({ message: "Error interno del servidor" });
}
