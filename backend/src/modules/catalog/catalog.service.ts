// Catalogo de modulos: lectura, validacion y guardado de definiciones (spec §5.6, §6 y §13.1).
// Las formulas se evaluan con el mismo motor que usa el navegador (shared/moduleFormula.ts).
import { readFile } from "node:fs/promises";
import { Prisma, RolPiezaModulo, TipoMaterial, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";
import { evaluateModuleDefinition, validateIdentifier, type ModuleError, type ParamDef, type RoundingMode } from "../../shared/moduleFormula.js";
import type { ModuloInput } from "./catalog.schemas.js";
import { moduleImagePath, removeModuleImage, storeModuleImage } from "./module-images.service.js";

type Tx = PrismaClient | Prisma.TransactionClient;

export const MODULE_INCLUDE = {
  categoria: true,
  imagen: { select: { mime: true, tamanoBytes: true, fechaActualizacion: true } },
  parametros: { orderBy: { orden: "asc" } },
  perfiles: { orderBy: { orden: "asc" } },
  piezas: { orderBy: { orden: "asc" }, include: { cantos: { include: { perfil: { select: { orden: true } } } } } },
  herrajes: { orderBy: { orden: "asc" } },
  _count: { select: { pedidos: true } }
} satisfies Prisma.ModuloInclude;

type ModuleWithRelations = Prisma.ModuloGetPayload<{ include: typeof MODULE_INCLUDE }>;

export async function getModulesConfig(tx: Tx) {
  return tx.configuracionModulos.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

/** Cantidad de herrajes: hacia arriba, con la misma tolerancia que el redondeo de medidas (DECISIONES R7). */
function hardwareQuantity(value: number) {
  return Math.max(0, Math.ceil(value - 1e-9));
}

type Definition = Pick<ModuloInput, "parametros" | "piezas" | "espesorDisenoMm"> & { herrajes?: Array<{ herrajeId: string; formulaCantidad: string }> };

/** Evalua una definicion con el motor compartido: piezas, errores y cantidad de cada herraje. */
export function evaluateDefinition(definition: Definition, valores: Record<string, number>, redondeo: RoundingMode) {
  const evaluation = evaluateModuleDefinition(
    { parametros: definition.parametros as ParamDef[], piezas: definition.piezas, espesorDisenoMm: definition.espesorDisenoMm },
    valores,
    redondeo
  );
  const errores: ModuleError[] = [...evaluation.errores];
  const herrajes = (definition.herrajes ?? []).map((herraje) => {
    try {
      return { herrajeId: herraje.herrajeId, cantidad: hardwareQuantity(evaluation.evaluarExpresion(herraje.formulaCantidad)) };
    } catch (error) {
      errores.push({ ref: `herraje ${herraje.herrajeId}`, mensaje: error instanceof Error ? error.message : String(error) });
      return { herrajeId: herraje.herrajeId, cantidad: null };
    }
  });
  return { piezas: evaluation.piezas, errores, herrajes };
}

/** La definicion como la devuelve la API (y como la recibe el editor). */
export function toDefinition(module: ModuleWithRelations) {
  return {
    id: module.id,
    codigo: module.codigo,
    nombre: module.nombre,
    categoriaId: module.categoriaId,
    categoria: { id: module.categoria.id, nombre: module.categoria.nombre },
    descripcion: module.descripcion,
    activo: module.activo,
    espesorDisenoMm: module.espesorDisenoMm,
    materialFondoId: module.materialFondoId,
    observaciones: module.observaciones,
    version: module.version,
    fechaActualizacion: module.fechaActualizacion,
    imagen: module.imagen,
    tienePedidos: module._count.pedidos > 0,
    parametros: module.parametros.map((param) => ({
      clave: param.clave,
      etiqueta: param.etiqueta,
      tipo: param.tipo,
      valorDefecto: param.valorDefecto,
      minimo: param.minimo,
      maximo: param.maximo,
      opciones: (param.opciones as Array<{ valor: number; etiqueta: string }> | null) ?? null,
      formula: param.formula,
      ayuda: param.ayuda,
      orden: param.orden
    })),
    perfiles: module.perfiles.map((perfil) => ({
      orden: perfil.orden as 1 | 2,
      nombre: perfil.nombre,
      descripcion: perfil.descripcion,
      predeterminado: perfil.predeterminado
    })),
    piezas: module.piezas.map((pieza) => ({
      codigo: pieza.codigo,
      nombre: pieza.nombre,
      rol: pieza.rol,
      materialFijoId: pieza.materialFijoId,
      formulaLargo: pieza.formulaLargo,
      formulaAncho: pieza.formulaAncho,
      formulaCantidad: pieza.formulaCantidad,
      permiteRotar: pieza.permiteRotar,
      orden: pieza.orden,
      observaciones: pieza.observaciones,
      cantos: pieza.cantos.map((canto) => ({ perfilOrden: canto.perfil.orden as 1 | 2, lado: canto.lado, espesorMm: canto.espesorMm as 0.45 | 1 | 2 }))
    })),
    herrajes: module.herrajes.map((herraje) => ({ herrajeId: herraje.herrajeId, formulaCantidad: herraje.formulaCantidad, orden: herraje.orden }))
  };
}

export async function loadModule(tx: Tx, id: string) {
  const module = await tx.modulo.findUnique({ where: { id }, include: MODULE_INCLUDE });
  if (!module) throw new AppError(404, "Módulo no encontrado.");
  return module;
}

/**
 * Reglas de spec §5.6 que no cubre el schema. Junta todos los problemas en un solo error, para que el editor
 * los muestre de una vez. Si el modulo queda activo, sus formulas tienen que evaluar sin errores con los
 * valores por defecto; un modulo inactivo se puede guardar con errores, como borrador.
 */
export async function validateModuleInput(tx: Tx, input: ModuloInput, moduleId?: string) {
  const problems: string[] = [];
  const config = await getModulesConfig(tx);

  const [categoria, fondo, sameCode] = await Promise.all([
    tx.categoriaModulo.findUnique({ where: { id: input.categoriaId } }),
    input.materialFondoId ? tx.material.findUnique({ where: { id: input.materialFondoId } }) : Promise.resolve(null),
    tx.modulo.findUnique({ where: { codigo: input.codigo } })
  ]);
  if (!categoria) problems.push("La categoría no existe.");
  if (input.materialFondoId && (!fondo || fondo.tipo !== TipoMaterial.PLACA)) problems.push("El material de fondo tiene que ser una placa.");
  if (sameCode && sameCode.id !== moduleId) problems.push(`Ya existe un módulo con el código ${input.codigo}.`);

  // Nombres: formato, palabras reservadas y sin repetir entre medidas y piezas.
  const names = [...input.parametros.map((param) => param.clave), ...input.piezas.map((pieza) => pieza.codigo)];
  names.forEach((name) => {
    const problem = validateIdentifier(name);
    if (problem) problems.push(problem);
  });
  const repeated = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  if (repeated.length) problems.push(`Hay medidas o piezas con el mismo nombre: ${repeated.join(", ")}.`);

  input.parametros.forEach((param) => {
    if (param.tipo === "OPCION" && !param.opciones?.length) problems.push(`La medida ${param.clave} es de opciones y no tiene opciones.`);
    if (param.tipo === "CALCULADO" && !param.formula?.trim()) problems.push(`La medida ${param.clave} es calculada y no tiene fórmula.`);
    if (param.minimo != null && param.maximo != null && param.minimo > param.maximo) problems.push(`En ${param.clave}, el mínimo supera al máximo.`);
  });

  // Perfiles: uno o dos, sin repetir el orden, con exactamente uno predeterminado.
  const perfilOrdenes = input.perfiles.map((perfil) => perfil.orden);
  if (new Set(perfilOrdenes).size !== perfilOrdenes.length) problems.push("Hay dos perfiles de canto con el mismo número.");
  if (input.perfiles.filter((perfil) => perfil.predeterminado).length !== 1) problems.push("Tiene que haber exactamente un perfil de canto predeterminado.");

  // Piezas: material fijo y cantos.
  const fijoIds = [...new Set(input.piezas.filter((pieza) => pieza.rol === RolPiezaModulo.FIJO && pieza.materialFijoId).map((pieza) => pieza.materialFijoId!))];
  const fijos = fijoIds.length ? await tx.material.findMany({ where: { id: { in: fijoIds } } }) : [];
  const fijoById = new Map(fijos.map((material) => [material.id, material]));
  input.piezas.forEach((pieza) => {
    if (pieza.rol === RolPiezaModulo.FIJO) {
      const material = pieza.materialFijoId ? fijoById.get(pieza.materialFijoId) : null;
      if (!material) problems.push(`La pieza ${pieza.codigo} va en material fijo y no tiene el material elegido.`);
      else if (material.tipo !== TipoMaterial.PLACA || !material.activo) problems.push(`El material fijo de ${pieza.codigo} tiene que ser una placa activa.`);
    }
    const sides = pieza.cantos.map((canto) => `${canto.perfilOrden}-${canto.lado}`);
    if (new Set(sides).size !== sides.length) problems.push(`La pieza ${pieza.codigo} tiene un lado con dos cantos en el mismo perfil.`);
    if (pieza.cantos.some((canto) => !perfilOrdenes.includes(canto.perfilOrden))) problems.push(`La pieza ${pieza.codigo} tiene cantos de un perfil que no existe.`);
  });

  // Herrajes.
  const herrajeIds = input.herrajes.map((herraje) => herraje.herrajeId);
  if (new Set(herrajeIds).size !== herrajeIds.length) problems.push("Hay un herraje repetido.");
  if (herrajeIds.length) {
    const found = await tx.herraje.count({ where: { id: { in: herrajeIds } } });
    if (found !== new Set(herrajeIds).size) problems.push("Hay herrajes que no existen.");
  }

  const evaluation = evaluateDefinition(input, {}, config.redondeo as RoundingMode);
  if (input.activo) {
    if (!input.piezas.length) problems.push("Un módulo activo necesita al menos una pieza.");
    evaluation.errores.forEach((error) => problems.push(`${error.ref}: ${error.mensaje}`));
  }

  if (problems.length) {
    throw new AppError(400, input.activo && evaluation.errores.length ? "El módulo tiene errores: corregilos o guardalo inactivo." : "Hay datos del módulo para corregir.", {
      code: "MODULE_INVALID",
      details: { errores: problems, formulas: evaluation.errores }
    });
  }
  return evaluation;
}

/** Escribe la definicion completa (parametros, perfiles, piezas, cantos y herrajes) de un modulo nuevo o existente. */
async function writeDefinition(tx: Prisma.TransactionClient, moduleId: string, input: ModuloInput) {
  await tx.moduloHerraje.deleteMany({ where: { moduloId: moduleId } });
  await tx.moduloPerfilCanto.deleteMany({ where: { moduloId: moduleId } });
  await tx.moduloPieza.deleteMany({ where: { moduloId: moduleId } });
  await tx.moduloParametro.deleteMany({ where: { moduloId: moduleId } });

  await tx.moduloParametro.createMany({
    data: input.parametros.map((param) => ({
      moduloId: moduleId,
      clave: param.clave,
      etiqueta: param.etiqueta,
      tipo: param.tipo,
      valorDefecto: param.valorDefecto,
      minimo: param.minimo,
      maximo: param.maximo,
      opciones: param.opciones ?? Prisma.DbNull,
      formula: param.formula,
      ayuda: param.ayuda ?? null,
      orden: param.orden
    }))
  });
  const perfilIdByOrden = new Map<number, string>();
  for (const perfil of input.perfiles) {
    const created = await tx.moduloPerfilCanto.create({ data: { moduloId: moduleId, ...perfil, descripcion: perfil.descripcion ?? null } });
    perfilIdByOrden.set(perfil.orden, created.id);
  }
  for (const pieza of input.piezas) {
    const created = await tx.moduloPieza.create({
      data: {
        moduloId: moduleId,
        codigo: pieza.codigo,
        nombre: pieza.nombre,
        rol: pieza.rol,
        materialFijoId: pieza.rol === RolPiezaModulo.FIJO ? pieza.materialFijoId : null,
        formulaLargo: pieza.formulaLargo,
        formulaAncho: pieza.formulaAncho,
        formulaCantidad: pieza.formulaCantidad,
        permiteRotar: pieza.permiteRotar,
        orden: pieza.orden,
        observaciones: pieza.observaciones ?? null
      }
    });
    if (pieza.cantos.length) {
      await tx.moduloPiezaCanto.createMany({
        data: pieza.cantos.map((canto) => ({ perfilId: perfilIdByOrden.get(canto.perfilOrden)!, piezaId: created.id, lado: canto.lado, espesorMm: canto.espesorMm }))
      });
    }
  }
  if (input.herrajes.length) {
    await tx.moduloHerraje.createMany({
      data: input.herrajes.map((herraje) => ({ moduloId: moduleId, herrajeId: herraje.herrajeId, formulaCantidad: herraje.formulaCantidad, orden: herraje.orden }))
    });
  }
}

const moduleFields = (input: ModuloInput) => ({
  nombre: input.nombre,
  categoriaId: input.categoriaId,
  descripcion: input.descripcion ?? null,
  activo: input.activo,
  espesorDisenoMm: input.espesorDisenoMm,
  materialFondoId: input.materialFondoId,
  observaciones: input.observaciones ?? null
});

export async function createModule(prisma: PrismaClient, input: ModuloInput, userId: string) {
  await validateModuleInput(prisma, input);
  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.modulo.create({ data: { codigo: input.codigo, ...moduleFields(input) } });
    await writeDefinition(tx, created.id, input);
    await tx.auditoria.create({ data: { usuarioId: userId, accion: "CREAR_MODULO", entidad: "Modulo", entidadId: created.id } });
    return created.id;
  });
  return loadModule(prisma, id);
}

/** Reemplaza la definicion completa e incrementa la version (spec §6.2, "Guardar"). */
export async function updateModule(prisma: PrismaClient, id: string, input: ModuloInput, userId: string) {
  const existing = await loadModule(prisma, id);
  if (input.codigo !== existing.codigo && existing._count.pedidos > 0) {
    throw new AppError(409, "No se puede cambiar el código de un módulo que ya se usó en solicitudes.", { code: "MODULE_CODE_LOCKED" });
  }
  await validateModuleInput(prisma, input, id);
  await prisma.$transaction(async (tx) => {
    await tx.modulo.update({ where: { id }, data: { codigo: input.codigo, ...moduleFields(input), version: { increment: 1 } } });
    await writeDefinition(tx, id, input);
    await tx.auditoria.create({
      data: { usuarioId: userId, accion: "EDITAR_MODULO", entidad: "Modulo", entidadId: id, metadata: { versionAnterior: existing.version } }
    });
  });
  return loadModule(prisma, id);
}

/** Activar exige que las formulas evaluen sin errores con los valores por defecto. */
export async function setModuleActive(prisma: PrismaClient, id: string, activo: boolean, userId: string) {
  const module = await loadModule(prisma, id);
  if (activo) {
    const definition = toDefinition(module);
    await validateModuleInput(prisma, { ...definition, activo: true, descripcion: definition.descripcion, observaciones: definition.observaciones }, id);
  }
  await prisma.$transaction(async (tx) => {
    await tx.modulo.update({ where: { id }, data: { activo } });
    await tx.auditoria.create({ data: { usuarioId: userId, accion: activo ? "ACTIVAR_MODULO" : "DESACTIVAR_MODULO", entidad: "Modulo", entidadId: id } });
  });
  return loadModule(prisma, id);
}

async function freeCopyCode(prisma: PrismaClient, codigo: string) {
  for (let attempt = 1; ; attempt += 1) {
    const candidate = attempt === 1 ? `${codigo}_COPIA` : `${codigo}_COPIA_${attempt}`;
    if (!(await prisma.modulo.findUnique({ where: { codigo: candidate } }))) return candidate;
  }
}

/** Copia completa (definicion e imagen), inactiva, con codigo X_COPIA. */
export async function duplicateModule(prisma: PrismaClient, id: string, userId: string) {
  const source = await loadModule(prisma, id);
  const definition = toDefinition(source);
  const codigo = await freeCopyCode(prisma, source.codigo);
  const input: ModuloInput = {
    ...definition,
    codigo,
    nombre: `${source.nombre} (copia)`,
    activo: false,
    descripcion: definition.descripcion,
    observaciones: definition.observaciones
  };
  const newId = await prisma.$transaction(async (tx) => {
    const created = await tx.modulo.create({ data: { codigo, ...moduleFields(input) } });
    await writeDefinition(tx, created.id, input);
    await tx.auditoria.create({
      data: { usuarioId: userId, accion: "DUPLICAR_MODULO", entidad: "Modulo", entidadId: created.id, metadata: { origen: source.id } }
    });
    return created.id;
  });
  const image = await prisma.moduloImagen.findUnique({ where: { moduloId: id } });
  if (image) await storeModuleImage(prisma, newId, await readFile(moduleImagePath(image.archivo)));
  return loadModule(prisma, newId);
}

/** Solo se borra un modulo que no se uso en solicitudes; si se uso, hay que desactivarlo (spec §5.6). */
export async function deleteModule(prisma: PrismaClient, id: string, userId: string) {
  const module = await loadModule(prisma, id);
  if (module._count.pedidos > 0) {
    throw new AppError(409, "El módulo ya se usó en solicitudes: no se puede borrar. Desactivalo para que no aparezca al cargar.", {
      code: "MODULE_IN_USE"
    });
  }
  await removeModuleImage(prisma, id);
  await prisma.$transaction(async (tx) => {
    await tx.modulo.delete({ where: { id } });
    await tx.auditoria.create({ data: { usuarioId: userId, accion: "ELIMINAR_MODULO", entidad: "Modulo", entidadId: id, metadata: { codigo: module.codigo } } });
  });
}
