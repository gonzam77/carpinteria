// Armado de las filas de un pedido (DetallePedido) a partir de lo que llega del formulario de corte o, desde la
// Fase 4, de los modulos. Es el unico lugar donde se resuelven materiales y cantos (DECISIONES R8): la vista
// previa, el alta, la edicion y el recalculo pasan por aca, asi las mismas piezas dan las mismas filas.
import { Prisma, TipoMaterial, type Material, type OrigenDetalle, type PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/http.js";
import type { DetailInput as CorteDetailInput } from "./order.schemas.js";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Una fila de entrada. Los campos de modulos (pedidoModuloId, piezaCodigo, origen, orden) e `indice` se pasan
 * tal cual si vienen; una solicitud de corte no los trae y su fila queda exactamente como antes.
 */
export type DetailInput = CorteDetailInput & {
  pedidoModuloId?: string | null;
  piezaCodigo?: string | null;
  origen?: OrigenDetalle | null;
  orden?: number;
  indice?: number;
};

type CantoWithPlate = Material & {
  placaMaterial?: Pick<Material, "nombre"> | null;
};

function formatThickness(value: number) {
  return Number(value.toFixed(2)).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function buildCantoName(placaNombre: string, espesorMm: number) {
  return `Canto ${placaNombre} ${formatThickness(espesorMm)}mm`;
}

function resolveCantoName(canto?: CantoWithPlate | null) {
  if (!canto) return null;
  return canto.placaMaterial?.nombre ? buildCantoName(canto.placaMaterial.nombre, canto.espesorMm) : canto.nombre;
}

const isPositiveInteger = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0;

/**
 * Valida y completa las filas: material y cantos activos, nombres de canto, cliente por defecto e indice.
 * La maquina, el optimizador y la base trabajan con mm enteros: una medida o cantidad que no sea un entero
 * positivo es un error, nunca se redondea aca (las formulas de los modulos ya redondean, DECISIONES R6).
 */
export async function normalizeDetails(detalles: DetailInput[], cliente: string, numeroContacto: string, tx: Tx = prisma) {
  const notInteger = detalles.findIndex((detail) => !isPositiveInteger(detail.largo) || !isPositiveInteger(detail.ancho) || !isPositiveInteger(detail.cantidad));
  if (notInteger >= 0) {
    const detail = detalles[notInteger];
    const nombre = detail.nombreProducto || detail.material || `pieza ${notInteger + 1}`;
    throw new AppError(400, `"${nombre}" tiene que tener largo, ancho y cantidad en numeros enteros mayores a 0 (vino ${detail.largo} × ${detail.ancho} × ${detail.cantidad}).`, {
      code: "DETAIL_NOT_INTEGER",
      details: { posicion: notInteger + 1 }
    });
  }

  const materialIds = [...new Set(detalles.map((detail) => detail.materialId))];
  const cantoIds = [
    ...new Set(
      detalles
        .flatMap((detail) => [detail.cantoLargo1Id, detail.cantoLargo2Id, detail.cantoAncho1Id, detail.cantoAncho2Id])
        .filter(Boolean)
    )
  ] as string[];

  const materials: Material[] = await tx.material.findMany({
    where: { id: { in: materialIds }, activo: true, tipo: TipoMaterial.PLACA }
  });
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const cantos: CantoWithPlate[] = cantoIds.length
    ? await tx.material.findMany({
        where: { id: { in: cantoIds }, activo: true, tipo: TipoMaterial.CANTO },
        include: { placaMaterial: { select: { nombre: true } } }
      })
    : [];
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));

  if (materials.length !== materialIds.length) {
    throw new AppError(400, "Seleccione un material valido para cada pieza.");
  }
  if (cantos.length !== cantoIds.length) {
    throw new AppError(400, "Seleccione un canto valido en cada borde.");
  }

  return detalles.map((detail, position) => {
    const material = materialById.get(detail.materialId)!;
    const cantoLargo1 = detail.cantoLargo1Id ? cantoById.get(detail.cantoLargo1Id) : null;
    const cantoLargo2 = detail.cantoLargo2Id ? cantoById.get(detail.cantoLargo2Id) : null;
    const cantoAncho1 = detail.cantoAncho1Id ? cantoById.get(detail.cantoAncho1Id) : null;
    const cantoAncho2 = detail.cantoAncho2Id ? cantoById.get(detail.cantoAncho2Id) : null;

    return {
      materialId: material.id,
      codigoBarra: detail.codigoBarra ?? "",
      material: material.nombre,
      largo: detail.largo,
      ancho: detail.ancho,
      cantidad: detail.cantidad,
      cantoLargo1Id: cantoLargo1?.id ?? null,
      cantoLargo1Nombre: resolveCantoName(cantoLargo1),
      cantoLargo1: Boolean(cantoLargo1),
      cantoLargo2Id: cantoLargo2?.id ?? null,
      cantoLargo2Nombre: resolveCantoName(cantoLargo2),
      cantoLargo2: Boolean(cantoLargo2),
      cantoAncho1Id: cantoAncho1?.id ?? null,
      cantoAncho1Nombre: resolveCantoName(cantoAncho1),
      cantoAncho1: Boolean(cantoAncho1),
      cantoAncho2Id: cantoAncho2?.id ?? null,
      cantoAncho2Nombre: resolveCantoName(cantoAncho2),
      cantoAncho2: Boolean(cantoAncho2),
      permiteRotar: detail.permiteRotar,
      codigoBarraCentro: detail.codigoBarraCentro,
      remark: detail.remark,
      numeroCliente: detail.numeroCliente || numeroContacto,
      nombreCliente: detail.nombreCliente || cliente,
      nombreProducto: detail.nombreProducto,
      indice: detail.indice ?? position,
      ...(detail.pedidoModuloId !== undefined ? { pedidoModuloId: detail.pedidoModuloId } : {}),
      ...(detail.piezaCodigo !== undefined ? { piezaCodigo: detail.piezaCodigo } : {}),
      ...(detail.origen !== undefined ? { origen: detail.origen } : {}),
      ...(detail.orden !== undefined ? { orden: detail.orden } : {})
    };
  });
}

export type NormalizedDetail = Awaited<ReturnType<typeof normalizeDetails>>[number];
