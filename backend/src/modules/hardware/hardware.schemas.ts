// Validacion de Configuracion › Herrajes (spec §12 y §13.4, DECISIONES 57).
import { z } from "zod";

const UNIDADES = ["unidad", "par", "juego", "metro"] as const;

const nombre = (que: string) =>
  z
    .string({ required_error: `Escribí el nombre del ${que}`, invalid_type_error: `Escribí el nombre del ${que}` })
    .trim()
    .min(2, `El nombre del ${que} tiene que tener al menos 2 caracteres`)
    .max(120, `El nombre del ${que} tiene como máximo 120 caracteres`);

/** Texto opcional: vacio o con solo espacios queda null. */
const optionalText = (max: number, message: string) =>
  z.preprocess((value) => (typeof value === "string" && !value.trim() ? null : value), z.string().trim().max(max, message).nullable().optional());

export const hardwareTypeSchema = z
  .object({
    nombre: nombre("tipo"),
    orden: z.number({ invalid_type_error: "El orden tiene que ser un número" }).int("El orden tiene que ser un número entero").min(0).optional(),
    activo: z.boolean().optional()
  })
  .strict("Hay datos del tipo que no se reconocen");

export const hardwareSchema = z
  .object({
    nombre: nombre("herraje"),
    tipoId: z.string({ required_error: "Elegí el tipo de herraje", invalid_type_error: "Elegí el tipo de herraje" }).uuid("Elegí el tipo de herraje"),
    unidad: z.enum(UNIDADES, { errorMap: () => ({ message: "La unidad es unidad, par, juego o metro" }) }),
    valor: z.number({ required_error: "Cargá el precio", invalid_type_error: "El precio tiene que ser un número" }).finite().min(0, "El precio no puede ser negativo"),
    // Solo los que van por medida (correderas): la linea agrupa las medidas de un mismo modelo (DECISIONES 57).
    linea: optionalText(80, "La línea tiene como máximo 80 caracteres"),
    medidaMm: z.number({ invalid_type_error: "La medida tiene que ser un número" }).finite().positive("La medida tiene que ser mayor a 0").nullable().optional(),
    activo: z.boolean().optional()
  })
  .strict("Hay datos del herraje que no se reconocen")
  .refine((data) => !data.medidaMm || data.linea, { message: "Un herraje con medida tiene que tener su línea (por ejemplo, Telescópica)", path: ["linea"] });

export const hardwareFiltersSchema = z.object({ incluirInactivos: z.enum(["true", "false"]).optional() });

export const hardwareActiveSchema = z.object({ activo: z.boolean({ required_error: "Falta si queda activo", invalid_type_error: "Falta si queda activo" }) }).strict();

export const hardwareAdjustSchema = z
  .object({
    herrajeIds: z.array(z.string().uuid("Un herraje no es válido"), { required_error: "Elegí los herrajes" }).min(1, "Elegí al menos un herraje"),
    percentage: z
      .number({ required_error: "Escribí el porcentaje", invalid_type_error: "El porcentaje tiene que ser un número" })
      .finite()
      .refine((value) => value > -100, "El porcentaje tiene que ser mayor a -100")
  })
  .strict();

export type HardwareInput = z.infer<typeof hardwareSchema>;
