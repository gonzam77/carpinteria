import { AppError } from "../utils/http.js";

/**
 * Los errores de Prisma se reconocen por la forma del objeto y no con
 * `instanceof PrismaClientKnownRequestError`. Esa clase la exporta el cliente
 * generado (src/generated/prisma, que ademas esta gitignoreado y se regenera
 * en cada build): atar el middleware a el lo dejaria ciego si el cliente se
 * regenera con otra version o si terminan cargadas dos copias del runtime,
 * porque `instanceof` compara identidad de clase y no forma.
 */
function esErrorDePrisma(error: any) {
  return typeof error?.code === "string" && /^P\d{4}$/.test(error.code);
}

/**
 * Mensajes de duplicado por campo. Es una lista blanca a proposito: cualquier
 * otro nombre de columna que llegue desde la base cae en el mensaje generico,
 * asi no le mostramos al usuario partes del modelo de datos que no le sirven.
 */
const MENSAJES_DE_DUPLICADO: Record<string, string> = {
  email: "Ya existe un registro con ese email.",
  googleId: "Esa cuenta de Google ya está asociada a otro usuario.",
  nombre: "Ya existe un registro con ese nombre.",
  endpoint: "Ese dispositivo ya estaba suscripto a las notificaciones."
};

/**
 * A veces lo que llega no es el nombre de la columna sino el del indice
 * ("usuarios_email_key"). Le sacamos el sufijo y el prefijo de tabla. Alcanza
 * porque ninguna columna del schema tiene guion bajo en el nombre.
 */
function nombreDeCampo(objetivo: string) {
  return objetivo.replace(/_key$/, "").split("_").pop() || objetivo;
}

/**
 * El campo en conflicto no llega siempre por el mismo lado. El cliente clasico
 * lo pone en `meta.target` (string o array), pero este proyecto usa el driver
 * adapter de Postgres (ver config/prisma.ts) y ahi `meta.target` no existe: el
 * adapter saca las columnas del detail de Postgres y quedan en
 * `meta.driverAdapterError.cause.constraint.fields`. Miramos los dos lugares
 * para no depender de por donde entro el error.
 */
function camposEnConflicto(error: any) {
  const candidatos = [error?.meta?.target, error?.meta?.driverAdapterError?.cause?.constraint?.fields];
  const campos: string[] = [];

  for (const candidato of candidatos) {
    for (const valor of Array.isArray(candidato) ? candidato : [candidato]) {
      if (typeof valor === "string" && valor.length > 0) campos.push(nombreDeCampo(valor));
    }
  }

  return campos;
}

function mensajeDeDuplicado(error: any) {
  for (const campo of camposEnConflicto(error)) {
    if (MENSAJES_DE_DUPLICADO[campo]) return MENSAJES_DE_DUPLICADO[campo];
  }

  return "Ya existe un registro con esos datos.";
}

/**
 * Devuelve null para los codigos P que no conocemos: esos siguen cayendo en el
 * 500 generico, que es el unico lugar donde el error se loguea entero.
 */
function traducirErrorDePrisma(error: any): { status: number; message: string } | null {
  switch (error.code) {
    case "P2000":
      return { status: 400, message: "Alguno de los valores enviados supera el largo máximo permitido." };
    case "P2002":
      return { status: 409, message: mensajeDeDuplicado(error) };
    case "P2003":
      // Pedido.usuarioId e HistorialPedido.usuarioId son relaciones requeridas
      // sin onDelete, o sea Restrict (ver la migration del init: ON DELETE
      // RESTRICT): borrar un usuario que alguna vez creo un pedido o cambio un
      // estado explota aca. El mensaje no nombra la tabla ni la constraint
      // porque no le dicen nada al usuario.
      return { status: 409, message: "No se puede completar la operación porque el registro tiene datos asociados." };
    case "P2025":
      return { status: 404, message: "El registro no existe o ya fue eliminado." };
    default:
      return null;
  }
}

export function errorMiddleware(error: any, _req: any, res: any, _next: any) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.details !== undefined ? { details: error.details } : {})
    });
  }

  if (error?.name === "ZodError") {
    return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
  }

  if (esErrorDePrisma(error)) {
    const traducido = traducirErrorDePrisma(error);

    // Devolvemos el codigo P junto al mensaje, igual que AppError, para que el
    // front pueda distinguir casos si algun dia lo necesita. Lo que no sale
    // nunca es `error.meta` ni el `error.message` de Prisma: traen nombres de
    // tabla, de constraint y a veces fragmentos de SQL.
    if (traducido) {
      return res.status(traducido.status).json({ message: traducido.message, code: error.code });
    }
  }

  // Los codigos P que no traducimos caen aca a proposito: lo unico util para
  // diagnosticarlos despues es tener el error entero en el log del servidor.
  console.error(error);
  return res.status(500).json({ message: "Error interno del servidor" });
}
