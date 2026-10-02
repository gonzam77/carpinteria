// Genera la planilla con la que ROMA revisa el catalogo importado (PLAN F2.5; spec §16 y §19, puntos 1, 2,
// 4 y 6). Lee el catalogo de la base, tal como lo va a usar el sistema, y arma un Excel con:
//   - Resumen: un renglon por modelo, con sus medidas por defecto, observaciones y piezas que no entran en la placa.
//   - Piezas: un renglon por pieza, con material (rol), medidas, formulas, rotacion y cantos de los dos perfiles.
//   - Como revisar: que mirar y como devolver las correcciones.
//
//   DATABASE_URL=postgresql://... npx tsx src/scripts/planilla-revision-catalogo.ts [archivo.xlsx]
//
// Solo lee la base.
import ExcelJS from "exceljs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, TipoMaterial } from "../generated/prisma/client.js";
import { findPiecesThatDoNotFit } from "../shared/cutOptimizer.js";
import { evaluateModule, type ParamDef } from "../shared/moduleFormula.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}
const output = resolve(process.argv[2] ?? "planilla-revision-catalogo.xlsx");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const ROL = { ESQUELETO: "Esqueleto", FRENTE: "Frentes", FONDO: "Fondo", FIJO: "Material fijo" } as const;
const LADO = { LARGO_1: "L1", LARGO_2: "L2", ANCHO_1: "A1", ANCHO_2: "A2" } as const;
const mm = (value: number) => value.toLocaleString("es-AR", { maximumFractionDigits: 2 });

function edgeLabel(lados: Array<{ lado: keyof typeof LADO; espesorMm: number }>) {
  if (!lados.length) return "Sin canto";
  const byThickness = new Map<number, string[]>();
  for (const { lado, espesorMm } of lados) byThickness.set(espesorMm, [...(byThickness.get(espesorMm) ?? []), LADO[lado]]);
  return [...byThickness.entries()].map(([espesor, sides]) => `${sides.join(" ")} (${mm(espesor)} mm)`).join(" + ");
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F1E8" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

try {
  // Placa de referencia: la medida mas comun entre las placas activas de 18 mm, con el perfilado configurado.
  const [plates, settings] = await Promise.all([
    prisma.material.findMany({ where: { tipo: TipoMaterial.PLACA, activo: true, espesorMm: 18 } }),
    prisma.configuracionOptimizador.findUnique({ where: { id: "default" } })
  ]);
  const sizes = new Map<string, number>();
  plates.forEach((plate) => {
    if (plate.anchoPlaca && plate.altoPlaca) sizes.set(`${plate.anchoPlaca}x${plate.altoPlaca}`, (sizes.get(`${plate.anchoPlaca}x${plate.altoPlaca}`) ?? 0) + 1);
  });
  const [plateSize] = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0].split(" ") ?? ["1830x2600"];
  const [plateWidth, plateHeight] = plateSize.split("x").map(Number);
  const perfilado = settings?.perfiladoBordeMm ?? 10;
  const usableWidth = plateWidth - perfilado * 2;
  const usableHeight = plateHeight - perfilado * 2;

  const modules = await prisma.modulo.findMany({
    include: {
      categoria: true,
      imagen: { select: { moduloId: true } },
      parametros: { orderBy: { orden: "asc" } },
      piezas: { orderBy: { orden: "asc" }, include: { cantos: { include: { perfil: true } } } }
    },
    orderBy: [{ categoria: { orden: "asc" } }, { nombre: "asc" }]
  });

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Resumen");
  summary.columns = [
    { header: "Codigo", key: "codigo", width: 34 },
    { header: "Modelo", key: "modelo", width: 34 },
    { header: "Categoria", key: "categoria", width: 20 },
    { header: "Activo", key: "activo", width: 9 },
    { header: "Medidas por defecto (mm)", key: "medidas", width: 52 },
    { header: "Piezas", key: "piezas", width: 9 },
    { header: "Imagen", key: "imagen", width: 9 },
    { header: `No entran en placa ${plateWidth} x ${plateHeight}`, key: "noEntran", width: 46 },
    { header: "Observaciones de la importacion", key: "observaciones", width: 70 },
    { header: "Revisado por ROMA (S/N)", key: "revisado", width: 16 },
    { header: "Comentarios de ROMA", key: "comentarios", width: 50 }
  ];
  const pieces = workbook.addWorksheet("Piezas");
  pieces.columns = [
    { header: "Modelo", key: "modelo", width: 30 },
    { header: "Codigo pieza", key: "codigo", width: 16 },
    { header: "Pieza", key: "pieza", width: 24 },
    { header: "Material (va en)", key: "rol", width: 16 },
    { header: "Largo", key: "largo", width: 9 },
    { header: "Ancho", key: "ancho", width: 9 },
    { header: "Cantidad", key: "cantidad", width: 10 },
    { header: "Rota (sin veta)", key: "rota", width: 14 },
    { header: "Canto perfil Estandar", key: "estandar", width: 26 },
    { header: "Canto perfil Economico", key: "economico", width: 26 },
    { header: "Formula largo", key: "formulaLargo", width: 32 },
    { header: "Formula ancho", key: "formulaAncho", width: 32 },
    { header: "Formula cantidad", key: "formulaCantidad", width: 28 },
    { header: "Entra en la placa", key: "entra", width: 16 },
    { header: "Correcto (S/N)", key: "correcto", width: 14 },
    { header: "Correccion", key: "correccion", width: 50 }
  ];

  let piecesWithoutFit = 0;
  for (const module of modules) {
    const parametros: ParamDef[] = module.parametros.map((param) => ({
      clave: param.clave,
      tipo: param.tipo,
      valorDefecto: param.valorDefecto,
      formula: param.formula,
      minimo: param.minimo,
      maximo: param.maximo,
      opciones: (param.opciones as ParamDef["opciones"]) ?? null
    }));
    const evaluation = evaluateModule(
      { parametros, piezas: module.piezas },
      {},
      { constantes: { ESP: module.espesorDisenoMm } }
    );
    const computed = new Map(evaluation.piezas.map((piece) => [piece.codigo, piece]));
    const fitRows = module.piezas.map((piece) => {
      const value = computed.get(piece.codigo);
      return { largo: value?.largo ?? 0, ancho: value?.ancho ?? 0, cantidad: 1, permiteRotar: piece.permiteRotar };
    });
    const notFitting = new Set(findPiecesThatDoNotFit(fitRows, usableWidth, usableHeight).filter((index) => computed.has(module.piezas[index].codigo)));
    piecesWithoutFit += notFitting.size;

    summary.addRow({
      codigo: module.codigo,
      modelo: module.nombre,
      categoria: module.categoria.nombre,
      activo: module.activo ? "Si" : "No",
      medidas: module.parametros
        .filter((param) => param.tipo !== "CALCULADO")
        .map((param) => `${param.etiqueta} ${param.valorDefecto ?? "-"}`)
        .join(" | "),
      piezas: module.piezas.length,
      imagen: module.imagen ? "Si" : "No",
      noEntran: [...notFitting].map((index) => {
        const piece = module.piezas[index];
        const value = computed.get(piece.codigo)!;
        return `${piece.nombre} ${value.largo} x ${value.ancho}${piece.permiteRotar ? "" : " (sin rotar)"}`;
      }).join("; "),
      observaciones: [...(module.observaciones ? [module.observaciones] : []), ...evaluation.errores.map((error) => `${error.ref}: ${error.mensaje}`)].join("\n")
    });

    module.piezas.forEach((piece, index) => {
      const value = computed.get(piece.codigo);
      const lados = (orden: number) =>
        edgeLabel(piece.cantos.filter((canto) => canto.perfil.orden === orden).map((canto) => ({ lado: canto.lado, espesorMm: canto.espesorMm })));
      pieces.addRow({
        modelo: module.nombre,
        codigo: piece.codigo,
        pieza: piece.nombre,
        rol: ROL[piece.rol],
        largo: value?.largo ?? "-",
        ancho: value?.ancho ?? "-",
        cantidad: value?.cantidad ?? 0,
        rota: piece.permiteRotar ? "Si" : "No",
        estandar: lados(1),
        economico: lados(2),
        formulaLargo: piece.formulaLargo,
        formulaAncho: piece.formulaAncho,
        formulaCantidad: piece.formulaCantidad,
        entra: !value ? "No se usa (cantidad 0)" : notFitting.has(index) ? "NO" : "Si"
      });
    });
  }
  [summary, pieces].forEach(styleHeader);
  summary.getColumn("observaciones").alignment = { wrapText: true, vertical: "top" };

  const guide = workbook.addWorksheet("Como revisar");
  guide.getColumn(1).width = 120;
  [
    "Planilla de revision del catalogo de modulos a medida",
    "",
    "Estos 33 modelos salen de muebles.xlsx. Las medidas y formulas son las del Excel. Lo que hay que revisar, porque se propuso por heuristica:",
    "1. Material (va en): que piezas van del color de esqueleto, cuales del color de frentes y cuales son fondo.",
    "2. Cantos: que lados de cada pieza llevan canto y de que espesor, en los perfiles Estandar y Economico. L1 y L2 son los largos; A1 y A2, los anchos.",
    "3. Rota (sin veta): 'No' significa que la pieza respeta la veta y no se puede girar en la placa.",
    "4. Largo y ancho: el largo es la medida en el sentido de la veta. Revisar las puertas de Bajo mesada 4 puertas, Armario 2 puertas y Esquinero placa fija 2 puertas.",
    "5. Zocalo y gola: hoy van del color de esqueleto. Decir si llevan un color propio.",
    "6. Fondos: de que material son (fibrofacil 3 mm, 5,5 mm, melamina 18 mm).",
    `7. Piezas que no entran en la placa (${plateWidth} x ${plateHeight}, con perfilado de ${perfilado} mm): decir si se parten o como se resuelven.`,
    "",
    "Como devolverla: en cada pieza, completar 'Correcto (S/N)' y, si no, escribir la correccion. En el resumen, marcar cada modelo revisado y dejar comentarios."
  ].forEach((line, index) => {
    const row = guide.addRow([line]);
    if (index === 0) row.font = { bold: true, size: 14 };
  });

  await workbook.xlsx.writeFile(output);
  console.log(`Planilla generada: ${output}`);
  console.log(`${modules.length} modelos, ${modules.reduce((total, module) => total + module.piezas.length, 0)} piezas, ${piecesWithoutFit} piezas que no entran en la placa ${plateWidth} x ${plateHeight}.`);
} finally {
  await prisma.$disconnect();
}
