// Validacion de entrada de las solicitudes de modulos (spec §13.2). Las reglas que necesitan la base o el motor
// de formulas (modulo activo, colores, cantos, encaje) estan en module-order-plan.ts.
import { z } from "zod";

/** Un id obligatorio, con el mismo mensaje si falta, si no es texto o si no tiene formato de id. */
const requiredId = (message: string) => z.string({ required_error: message, invalid_type_error: message }).uuid(message);

const espesorCanto = z.union([z.literal(0.45), z.literal(1), z.literal(2)], {
  errorMap: () => ({ message: "Cada lado va sin canto (null) o con canto de 0,45, 1 o 2 mm" })
});

/** Cantos cambiados a mano en el paso 4 del asistente: el espesor de cada lado, o null si va sin canto. */
const cantosOverrideSchema = z.object({
  LARGO_1: espesorCanto.nullable(),
  LARGO_2: espesorCanto.nullable(),
  ANCHO_1: espesorCanto.nullable(),
  ANCHO_2: espesorCanto.nullable()
});

const medida = z
  .number({ required_error: "Falta el valor de una medida", invalid_type_error: "Las medidas tienen que ser numeros" })
  .finite("Las medidas tienen que ser numeros");

export const moduleLineSchema = z
  .object({
    moduloId: requiredId("Elegi un modulo del catalogo"),
    // Obligatorio, como en spec §13.2. Puede venir vacio: lo que falta toma el valor por defecto del modulo.
    valores: z.record(z.string(), medida, { required_error: "Faltan las medidas del modulo", invalid_type_error: "Faltan las medidas del modulo" }),
    colorEsqueletoId: requiredId("Elegi el color de esqueleto"),
    colorFrentesId: requiredId("Elegi el color de frentes"),
    colorCantoId: requiredId("Elegi el color de los cantos"),
    // Obligatorio, como en spec §13.2: el asistente manda el que eligio (por defecto, el predeterminado del modulo).
    perfilCantoOrden: z.union([z.literal(1), z.literal(2)], { errorMap: () => ({ message: "Elegi el perfil de cantos del modulo (1 o 2)" }) }),
    observaciones: z.string().trim().max(500, "Las observaciones del modulo tienen como maximo 500 caracteres").optional().nullable(),
    cantosOverride: z.record(z.string(), cantosOverrideSchema).optional().default({})
  })
  // Un campo con otro nombre (perfilOrden, valor...) no se ignora: se calcularia con los valores por defecto sin avisar.
  .strict("Hay datos de un modulo que no se reconocen: revisa los nombres de los campos");

export type ModuleOrderLine = z.infer<typeof moduleLineSchema>;

const modulosSchema = z
  .array(moduleLineSchema, { required_error: "Elegi al menos un modulo", invalid_type_error: "Elegi al menos un modulo" })
  .min(1, "Elegi al menos un modulo")
  .max(100, "Una solicitud tiene como maximo 100 modulos");

/** Vista previa (spec §8.5): alcanza con los modulos; los datos del cliente completan las filas si vienen. */
export const moduleOrderPreviewSchema = z.object({
  cliente: z.string().trim().optional().default(""),
  numeroContacto: z.string().trim().optional().default(""),
  modulos: modulosSchema
});

export type ModuleOrderPreviewInput = z.infer<typeof moduleOrderPreviewSchema>;
