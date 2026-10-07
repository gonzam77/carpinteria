// Validacion de entrada de la API del catalogo de modulos (spec §13.1). Las reglas que necesitan la base o el
// motor de formulas (nombres repetidos, perfiles, material fijo, formulas que evaluan) estan en catalog.service.ts.
import { z } from "zod";
import { LadoCanto, RolPiezaModulo, TipoParametroModulo } from "../../generated/prisma/client.js";
import { MAX_FORMULA_LENGTH } from "../../shared/moduleFormula.js";

const clave = z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/, "Usá mayúsculas, números y _, empezando con una letra (ej. ANCHO, LUZ_ABAJO)");
const formula = z.string().max(MAX_FORMULA_LENGTH, `La fórmula supera los ${MAX_FORMULA_LENGTH} caracteres`);
const espesorCanto = z.union([z.literal(0.45), z.literal(1), z.literal(2)]);
const optionalText = z.string().trim().optional().nullable();

export const parametroSchema = z.object({
  clave,
  etiqueta: z.string().trim().min(1, "Completá la etiqueta"),
  tipo: z.nativeEnum(TipoParametroModulo),
  valorDefecto: z.number().nullable().optional().default(null),
  minimo: z.number().nullable().optional().default(null),
  maximo: z.number().nullable().optional().default(null),
  opciones: z.array(z.object({ valor: z.number(), etiqueta: z.string().trim().min(1) })).nullable().optional().default(null),
  formula: formula.nullable().optional().default(null),
  ayuda: optionalText,
  orden: z.number().int()
});

export const perfilSchema = z.object({
  orden: z.union([z.literal(1), z.literal(2)]),
  nombre: z.string().trim().min(1, "Completá el nombre del perfil"),
  descripcion: optionalText,
  predeterminado: z.boolean()
});

export const piezaSchema = z.object({
  codigo: clave,
  nombre: z.string().trim().min(1, "Completá el nombre de la pieza"),
  rol: z.nativeEnum(RolPiezaModulo),
  materialFijoId: z.string().uuid().nullable().optional().default(null),
  formulaLargo: formula,
  formulaAncho: formula,
  formulaCantidad: formula.default("1"),
  permiteRotar: z.boolean(),
  orden: z.number().int(),
  observaciones: optionalText,
  cantos: z
    .array(z.object({ perfilOrden: z.union([z.literal(1), z.literal(2)]), lado: z.nativeEnum(LadoCanto), espesorMm: espesorCanto }))
    .default([])
});

export const moduloSchema = z.object({
  codigo: clave,
  nombre: z.string().trim().min(2, "El nombre necesita al menos 2 caracteres"),
  categoriaId: z.string().uuid("Elegí una categoría"),
  descripcion: optionalText,
  activo: z.boolean(),
  espesorDisenoMm: z.coerce.number().positive(),
  materialFondoId: z.string().uuid().nullable().optional().default(null),
  observaciones: optionalText,
  parametros: z.array(parametroSchema).min(1, "El módulo necesita al menos una medida"),
  perfiles: z.array(perfilSchema).min(1, "El módulo necesita al menos un perfil de canto").max(2, "Un módulo tiene como máximo dos perfiles de canto"),
  piezas: z.array(piezaSchema),
  herrajes: z.array(z.object({ herrajeId: z.string().uuid(), formulaCantidad: formula, orden: z.number().int() })).optional().default([])
});

export type ModuloInput = z.infer<typeof moduloSchema>;

export const listFiltersSchema = z.object({
  categoriaId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  incluirInactivos: z.enum(["true", "false"]).optional()
});

export const activeSchema = z.object({ activo: z.boolean() });

export const evaluarSchema = z.object({
  definicion: moduloSchema.pick({ parametros: true, piezas: true, espesorDisenoMm: true }).extend({
    herrajes: z.array(z.object({ herrajeId: z.string(), formulaCantidad: formula })).optional().default([])
  }),
  valores: z.record(z.string(), z.number()).optional().default({})
});

export const categoriaSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre necesita al menos 2 caracteres"),
  orden: z.number().int().optional().default(0),
  activo: z.boolean().optional().default(true)
});

export const configuracionSchema = z.object({
  materialFondoId: z.string().uuid().nullable(),
  redondeo: z.enum(["REDONDEAR", "TRUNCAR"]),
  diasEntregaDefecto: z.number().int().min(0).max(365),
  diasAvisoVencimiento: z.number().int().min(0).max(60),
  herrajesHabilitados: z.boolean()
});
