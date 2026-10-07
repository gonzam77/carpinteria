// Validacion de entrada de las solicitudes de modulos (spec §13.2). Las reglas que necesitan la base o el motor
// de formulas (modulo activo, colores, cantos, encaje) estan en module-order-plan.ts.
import { z } from "zod";
import { EstadoPedido } from "../../generated/prisma/enums.js";
import { todayInBusinessZone } from "../../utils/dates.js";

/** Un id obligatorio, con el mismo mensaje si falta, si no es texto o si no tiene formato de id. */
const requiredId = (message: string) => z.string({ required_error: message, invalid_type_error: message }).uuid(message);

const cantoElegido = z
  .string({ invalid_type_error: "Cada lado lleva el canto elegido o null (sin canto)" })
  .uuid("Cada lado lleva el canto elegido o null (sin canto)")
  .nullable()
  .optional();

/**
 * Cantos cambiados a mano en el paso 4 del asistente (DECISIONES 45): solo los lados que se tocaron, cada uno con el
 * canto elegido (cualquier canto activo) o null si va sin canto. Los otros lados siguen al perfil y al color de la placa.
 */
const cantosOverrideSchema = z
  .object({ LARGO_1: cantoElegido, LARGO_2: cantoElegido, ANCHO_1: cantoElegido, ANCHO_2: cantoElegido })
  .strict("Los lados de una pieza son LARGO_1, LARGO_2, ANCHO_1 y ANCHO_2");

const medida = z
  .number({ required_error: "Falta el valor de una medida", invalid_type_error: "Las medidas tienen que ser números" })
  .finite("Las medidas tienen que ser números");

export const moduleLineSchema = z
  .object({
    moduloId: requiredId("Elegí un módulo del catálogo"),
    // Obligatorio, como en spec §13.2. Puede venir vacio: lo que falta toma el valor por defecto del modulo.
    valores: z.record(z.string(), medida, { required_error: "Faltan las medidas del módulo", invalid_type_error: "Faltan las medidas del módulo" }),
    colorEsqueletoId: requiredId("Elegí el color de esqueleto"),
    colorFrentesId: requiredId("Elegí el color de frentes"),
    // Obligatorio, como en spec §13.2: el asistente manda el que eligio (por defecto, el predeterminado del modulo).
    perfilCantoOrden: z.union([z.literal(1), z.literal(2)], { errorMap: () => ({ message: "Elegí el perfil de cantos del módulo (1 o 2)" }) }),
    // Opcional (DECISIONES 32): sin elegir, las piezas de fondo van en el material de fondo del modulo o de la configuracion.
    materialFondoId: z
      .string({ invalid_type_error: "Elegí el material de fondo" })
      .uuid("Elegí el material de fondo")
      .nullable()
      .optional(),
    observaciones: z.string().trim().max(500, "Las observaciones del módulo tienen como máximo 500 caracteres").optional().nullable(),
    cantosOverride: z.record(z.string(), cantosOverrideSchema).optional().default({}),
    // La version del modulo que mostro la vista previa. Si viene y el catalogo cambio, el alta responde 409.
    version: z.number({ invalid_type_error: "La versión del módulo tiene que ser un número" }).int().positive().optional()
  })
  // Un campo con otro nombre (perfilOrden, valor...) no se ignora: se calcularia con los valores por defecto sin avisar.
  .strict("Hay datos de un módulo que no se reconocen: revisá los nombres de los campos");

export type ModuleOrderLine = z.infer<typeof moduleLineSchema>;

const modulosSchema = z
  .array(moduleLineSchema, { required_error: "Elegí al menos un módulo", invalid_type_error: "Elegí al menos un módulo" })
  .min(1, "Elegí al menos un módulo")
  .max(100, "Una solicitud tiene como máximo 100 módulos");

/** Vista previa (spec §8.5): alcanza con los modulos; los datos del cliente completan las filas si vienen. */
export const moduleOrderPreviewSchema = z.object({
  cliente: z.string().trim().optional().default(""),
  numeroContacto: z.string().trim().optional().default(""),
  modulos: modulosSchema
});

export type ModuleOrderPreviewInput = z.infer<typeof moduleOrderPreviewSchema>;

/** Texto opcional: vacio o con solo espacios queda null. */
const optionalText = (max: number, message: string) =>
  z.preprocess((value) => (typeof value === "string" && !value.trim() ? null : value), z.string().trim().max(max, message).nullable().optional());
const requiredText = (min: number, message: string) => z.string({ required_error: message, invalid_type_error: message }).trim().min(min, message);
const dateOnly = (message: string) => z.string({ required_error: message, invalid_type_error: message }).date(message);

/**
 * Alta de una solicitud de modulos (spec §13.2 y §9.2 paso 1). Es estricta: un campo con otro nombre da 400.
 * La fecha de entrega es un dia (AAAA-MM-DD), desde hoy en la zona del negocio.
 */
export const moduleOrderCreateSchema = z
  .object({
    cliente: requiredText(2, "Completá el cliente (al menos 2 caracteres)"),
    numeroContacto: requiredText(6, "Completá el teléfono (al menos 6 caracteres)"),
    emailContacto: z.preprocess(
      (value) => (typeof value === "string" && !value.trim() ? null : value),
      z.string({ invalid_type_error: "El email no es válido" }).trim().email("El email no es válido").nullable().optional()
    ),
    direccionEntrega: optionalText(300, "La dirección de entrega tiene como máximo 300 caracteres"),
    fechaEntrega: dateOnly("Elegí la fecha de entrega (AAAA-MM-DD)").refine((value) => value >= todayInBusinessZone(), "La fecha de entrega no puede ser anterior a hoy"),
    observaciones: optionalText(1000, "La referencia del trabajo tiene como máximo 1000 caracteres"),
    // Clave de alta (DECISIONES 40): la genera el navegador por cada intento. Si el mismo intento llega dos veces, se
    // devuelve la solicitud ya creada en vez de crear otra.
    claveAlta: z.string({ invalid_type_error: "La clave de alta no es válida" }).uuid("La clave de alta no es válida").optional(),
    modulos: modulosSchema
  })
  .strict("Hay datos de la solicitud que no se reconocen: revisá los nombres de los campos");

export type ModuleOrderCreateInput = z.infer<typeof moduleOrderCreateSchema>;

/** Filtros del listado (spec §13.2 y §9.1). */
export const moduleOrderFiltersSchema = z.object({
  estado: z.nativeEnum(EstadoPedido, { errorMap: () => ({ message: "Estado desconocido" }) }).optional(),
  search: z.string().trim().optional(),
  entregaDesde: dateOnly("La fecha desde tiene que ser AAAA-MM-DD").optional(),
  entregaHasta: dateOnly("La fecha hasta tiene que ser AAAA-MM-DD").optional(),
  /** La solicitud de un intento de alta (DECISIONES 40): para saber si un alta sin respuesta entro. */
  clave: z.string().uuid("La clave de alta no es válida").optional()
});

export type ModuleOrderFilters = z.infer<typeof moduleOrderFiltersSchema>;
