// Importa los 33 modelos de muebles.xlsx al catalogo de modulos (spec §16, PLAN F2.4).
//
//   npm run prisma:seed:modulos              desarrollo (tsx)
//   npm run prisma:seed:modulos:prod         produccion (compilado en dist)
//   ... -- --force                           pisa tambien los modulos que alguien ya edito en el sistema
//   MODULOS_FONDO="<placa>" ...                material de fondo por defecto, si la configuracion no tiene
//                                            (si no se indica, la placa de 3 mm "Fibroplus blanco")
//
// Lee prisma/data/modulos-muebles.json y prisma/data/imagenes/*.jpg (se puede cambiar con MODULOS_DATA_DIR).
// Es idempotente: actualiza por codigo, y no pisa un modulo con version > 1 (editado en el sistema) salvo con
// --force. Los roles, los cantos y la rotacion son una propuesta por heuristica que ROMA tiene que revisar.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/config/prisma.js";
import { LadoCanto, RolPiezaModulo, TipoParametroModulo } from "../src/generated/prisma/enums.js";
import { evaluateModule, validateIdentifier } from "../src/shared/moduleFormula.js";
import { storeModuleImage } from "../src/modules/catalog/module-images.service.js";

type JsonParam = {
  clave: string;
  etiqueta: string;
  tipo: keyof typeof TipoParametroModulo;
  valorDefecto: number | null;
  formula: string | null;
  orden: number;
  minimo?: number | null;
  maximo?: number | null;
  opciones?: Array<{ valor: number; etiqueta: string }> | null;
  ayuda?: string | null;
};
type JsonPiece = {
  codigo: string;
  nombre: string;
  rol: keyof typeof RolPiezaModulo;
  formulaLargo: string;
  formulaAncho: string;
  formulaCantidad: string;
  permiteRotar: boolean;
  orden: number;
  cantosProvisorios: Record<"LARGO_1" | "LARGO_2" | "ANCHO_1" | "ANCHO_2", number>;
};
type JsonModule = {
  codigo: string;
  nombre: string;
  categoria: string;
  activo: boolean;
  espesorDisenoMm: number;
  imagen: string | null;
  parametros: JsonParam[];
  piezas: JsonPiece[];
  observacionesImportacion: string[];
};

const CATEGORIAS = ["Bajo mesada", "Alacenas", "Placares y torres", "Dormitorio y otros"];
const LADOS = [LadoCanto.LARGO_1, LadoCanto.LARGO_2, LadoCanto.ANCHO_1, LadoCanto.ANCHO_2];
const force = process.argv.includes("--force");
const dataDir = process.env.MODULOS_DATA_DIR ?? resolve(process.cwd(), "prisma/data");
const fondoPorDefecto = process.env.MODULOS_FONDO ?? "Fibroplus blanco";

// Escobero: el Excel trae dos variantes de fondo (entero, o partido en dos). Se modelan como un parametro
// OPCION y cantidades condicionales (spec §19, nota del escobero; DECISIONES 6). El JSON queda intacto porque
// es el fixture del test de paridad.
function applyImportFixes(module: JsonModule): JsonModule {
  if (module.codigo !== "ESCOBERO") return module;
  const cantidad: Record<string, string> = {
    FONDO: "SI(VARIANTE_FONDO = 1; 1; 0)",
    OPCION2: "SI(VARIANTE_FONDO = 2; 1; 0)",
    OPCION22: "SI(VARIANTE_FONDO = 2; 1; 0)"
  };
  return {
    ...module,
    parametros: [
      ...module.parametros,
      {
        clave: "VARIANTE_FONDO",
        etiqueta: "Variante de fondo",
        tipo: "OPCION",
        valorDefecto: 1,
        formula: null,
        orden: Math.max(...module.parametros.map((param) => param.orden)) + 1,
        opciones: [
          { valor: 1, etiqueta: "Fondo entero" },
          { valor: 2, etiqueta: "Fondo en dos partes" }
        ],
        ayuda: "Fondo entero, o partido en dos piezas (abajo y arriba)."
      }
    ],
    piezas: module.piezas.map((piece) => (cantidad[piece.codigo] ? { ...piece, formulaCantidad: cantidad[piece.codigo] } : piece))
  };
}

// Perfil Estandar: frentes con los 4 lados a 2 mm y esqueleto con los lados propuestos a 0,45 mm.
// Perfil Economico: los mismos lados, todo a 0,45 mm. Los fondos no llevan canto (spec §16).
function edgesFor(piece: JsonPiece, perfilOrden: 1 | 2) {
  if (piece.rol === "FONDO") return [];
  if (piece.rol === "FRENTE") return LADOS.map((lado) => ({ lado, espesorMm: perfilOrden === 1 ? 2 : 0.45 }));
  return LADOS.filter((lado) => piece.cantosProvisorios?.[lado] === 1).map((lado) => ({ lado, espesorMm: 0.45 }));
}

// Lo que el catalogo exige para guardar un modulo activo (spec §5.6): nombres validos, sin repetidos, y
// formulas que evaluan sin errores con los valores por defecto.
function validationErrors(module: JsonModule) {
  const errors: string[] = [];
  const names = [...module.parametros.map((param) => param.clave), ...module.piezas.map((piece) => piece.codigo)];
  names.forEach((name) => {
    const problem = validateIdentifier(name);
    if (problem) errors.push(problem);
  });
  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  if (repeated.length) errors.push(`Nombres repetidos: ${[...new Set(repeated)].join(", ")}`);
  if (!module.piezas.length) errors.push("No tiene piezas cargadas");
  const result = evaluateModule({ parametros: module.parametros, piezas: module.piezas }, {}, { constantes: { ESP: module.espesorDisenoMm } });
  result.errores.forEach((error) => errors.push(`${error.ref}: ${error.mensaje}`));
  return errors;
}

/**
 * Material de fondo por defecto (PLAN P9, Gonzalo 2026-10-05): la placa de 3 mm "Fibroplus blanco", o la que diga
 * MODULOS_FONDO. Solo se pone si la configuracion no tiene uno: si el administrador ya eligio otro en Catalogo de
 * modulos > Configuracion, se respeta. Cada modulo puede tener ademas su propio fondo. Devuelve el texto del resumen.
 */
async function setDefaultBackMaterial(current: string | null) {
  if (current) {
    const material = await prisma.material.findUnique({ where: { id: current } });
    return `ya configurado, se respeta (${material?.nombre.trim() ?? current})`;
  }
  const plates = await prisma.material.findMany({ where: { tipo: "PLACA", activo: true }, orderBy: [{ nombre: "asc" }, { id: "asc" }] });
  const material = plates.find((plate) => plate.nombre.trim().toLowerCase() === fondoPorDefecto.trim().toLowerCase());
  if (!material) return `no hay una placa activa "${fondoPorDefecto}". Configuralo en Catalogo de modulos > Configuracion`;
  await prisma.configuracionModulos.update({ where: { id: "default" }, data: { materialFondoId: material.id } });
  return `${material.nombre.trim()} (${material.espesorMm} mm), puesto por defecto`;
}

async function main() {
  const data = JSON.parse(readFileSync(resolve(dataDir, "modulos-muebles.json"), "utf8")) as { modulos: JsonModule[] };

  const config = await prisma.configuracionModulos.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const fondo = await setDefaultBackMaterial(config.materialFondoId);

  const categoryId = new Map<string, string>();
  for (const [index, nombre] of [...new Set([...CATEGORIAS, ...data.modulos.map((module) => module.categoria)])].entries()) {
    const categoria = await prisma.categoriaModulo.upsert({
      where: { nombre },
      update: {},
      create: { nombre, orden: index + 1 }
    });
    categoryId.set(nombre, categoria.id);
  }

  const summary = { creados: 0, actualizados: 0, omitidos: [] as string[], inactivosPorErrores: [] as string[] };

  for (const raw of data.modulos) {
    const module = applyImportFixes(raw);
    const existing = await prisma.modulo.findUnique({ where: { codigo: module.codigo } });
    if (existing && existing.version > 1 && !force) {
      summary.omitidos.push(`${module.codigo} (editado en el sistema, version ${existing.version})`);
      continue;
    }

    const errors = validationErrors(module);
    const activo = module.activo && errors.length === 0;
    if (module.activo && !activo) summary.inactivosPorErrores.push(`${module.codigo}: ${errors.join("; ")}`);
    const observaciones = [
      ...module.observacionesImportacion,
      ...(module.activo && !activo ? [`No se activo al importar: ${errors.join("; ")}`] : [])
    ].join("\n");

    const savedId = await prisma.$transaction(async (tx) => {
      const fields = {
        nombre: module.nombre,
        categoriaId: categoryId.get(module.categoria)!,
        activo,
        espesorDisenoMm: module.espesorDisenoMm,
        observaciones: observaciones || null
      };
      const saved = existing
        ? await tx.modulo.update({ where: { id: existing.id }, data: fields })
        : await tx.modulo.create({ data: { codigo: module.codigo, ...fields } });

      if (existing) {
        // Se reemplaza la definicion completa; las solicitudes ya creadas guardan su propia copia.
        await tx.moduloPerfilCanto.deleteMany({ where: { moduloId: saved.id } });
        await tx.moduloPieza.deleteMany({ where: { moduloId: saved.id } });
        await tx.moduloParametro.deleteMany({ where: { moduloId: saved.id } });
      }

      await tx.moduloParametro.createMany({
        data: module.parametros.map((param) => ({
          moduloId: saved.id,
          clave: param.clave,
          etiqueta: param.etiqueta,
          tipo: TipoParametroModulo[param.tipo],
          valorDefecto: param.valorDefecto,
          minimo: param.minimo ?? null,
          maximo: param.maximo ?? null,
          opciones: param.opciones ?? undefined,
          formula: param.formula,
          ayuda: param.ayuda ?? null,
          orden: param.orden
        }))
      });

      const perfiles = await Promise.all(
        ([
          { orden: 1, nombre: "Estandar", descripcion: "Frentes con canto de 2 mm en los 4 lados; esqueleto con 0,45 mm en los lados visibles.", predeterminado: true },
          { orden: 2, nombre: "Economico", descripcion: "Los mismos lados, todo con canto de 0,45 mm.", predeterminado: false }
        ] as const).map((perfil) => tx.moduloPerfilCanto.create({ data: { moduloId: saved.id, ...perfil } }))
      );

      for (const piece of module.piezas) {
        const pieza = await tx.moduloPieza.create({
          data: {
            moduloId: saved.id,
            codigo: piece.codigo,
            nombre: piece.nombre,
            rol: RolPiezaModulo[piece.rol],
            formulaLargo: piece.formulaLargo,
            formulaAncho: piece.formulaAncho,
            formulaCantidad: piece.formulaCantidad,
            permiteRotar: piece.permiteRotar,
            orden: piece.orden
          }
        });
        const lados = perfiles.flatMap((perfil) =>
          edgesFor(piece, perfil.orden as 1 | 2).map((edge) => ({ perfilId: perfil.id, piezaId: pieza.id, lado: edge.lado, espesorMm: edge.espesorMm }))
        );
        if (lados.length) await tx.moduloPiezaCanto.createMany({ data: lados });
      }

      return saved.id;
    });

    // La imagen va como archivo a UPLOADS_DIR (DECISIONES 12), con las mismas validaciones que la subida
    // desde la pantalla: hasta 1 MB y solo JPEG, PNG o WebP.
    const imagePath = module.imagen ? resolve(dataDir, module.imagen) : null;
    if (imagePath && existsSync(imagePath)) {
      await storeModuleImage(prisma, savedId, readFileSync(imagePath));
    }

    if (existing) summary.actualizados += 1;
    else summary.creados += 1;
  }

  console.log(`Modulos: ${summary.creados} creados, ${summary.actualizados} actualizados, ${summary.omitidos.length} omitidos.`);
  console.log(`Material de fondo: ${fondo}.`);
  summary.omitidos.forEach((line) => console.log(`  omitido: ${line}`));
  summary.inactivosPorErrores.forEach((line) => console.log(`  inactivo por errores: ${line}`));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
