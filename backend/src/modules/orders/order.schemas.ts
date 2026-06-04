import { EstadoPedido } from "../../generated/prisma/client.js";
import { z } from "zod";

export const detailSchema = z.object({
  materialId: z.string().uuid(),
  codigoBarra: z.string().optional().default(""),
  material: z.string().optional(),
  largo: z.coerce.number().int().positive(),
  ancho: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().int().positive(),
  cantoLargo1: z.boolean().default(false),
  cantoLargo2: z.boolean().default(false),
  cantoAncho1: z.boolean().default(false),
  cantoAncho2: z.boolean().default(false),
  permiteRotar: z.boolean().default(false),
  codigoBarraCentro: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  numeroCliente: z.string().optional().nullable(),
  nombreCliente: z.string().optional().nullable(),
  nombreProducto: z.string().optional().nullable()
});

export const orderSchema = z.object({
  cliente: z.string().min(1),
  numeroContacto: z.string().min(6),
  observaciones: z.string().optional().nullable(),
  detalles: z.array(detailSchema).min(1)
});

export const orderFiltersSchema = z.object({
  search: z.string().optional(),
  cliente: z.string().optional(),
  estado: z.nativeEnum(EstadoPedido).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional()
});
