import ExcelJS from "exceljs";
import { applyAdjustments, MACHINE_COLUMNS, machineRow, readAdjustments, type ExtraColumn } from "./machine-excel.js";

/**
 * El Excel de la maquina. Cada fila sale de machineRow (machine-excel.ts), lo mismo que muestra la pestaña "Excel de
 * corte". Una solicitud de modulos con ajustes a mano (excelCorte) sale con sus celdas cambiadas y sus columnas
 * agregadas al final; sin ajustes, el archivo es el de siempre.
 */
export async function buildOrdersWorkbook(orders: any[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Carpinteria";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Pedidos");

  // Las columnas agregadas a mano, por titulo (si se exportan varias solicitudes, una sola columna por titulo).
  const extraTitles: string[] = [];
  const adjustments = orders.map((order) => readAdjustments(order.excelCorte));
  for (const item of adjustments) {
    for (const column of item.columnas) if (!extraTitles.includes(column.titulo)) extraTitles.push(column.titulo);
  }
  const extraKey = (titulo: string) => `extra:${titulo}`;

  sheet.columns = [
    ...MACHINE_COLUMNS.map((column) => ({ header: column.header, key: column.key, width: Math.max(column.header.length + 4, 16) })),
    ...extraTitles.map((titulo) => ({ header: titulo, key: extraKey(titulo), width: Math.max(titulo.length + 4, 16) }))
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  orders.forEach((order, index) => {
    const own = adjustments[index];
    const byId = new Map<string, ExtraColumn>(own.columnas.map((column) => [column.id, column]));
    const rows = applyAdjustments(order.detalles.map(machineRow), own);
    for (const row of rows) {
      const values: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(row)) {
        const extra = byId.get(key);
        values[extra ? extraKey(extra.titulo) : key] = value;
      }
      sheet.addRow(values);
    }
  });

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
      };
    });
  });

  return workbook;
}

type MaterialsSummary = {
  placas: Array<{ nombre: string; anchoPlaca: number | null; altoPlaca: number | null; espesorMm: number; piezas: number; placas: number }>;
  cantos: Array<{ nombre: string; espesorMm: number; metros: number }>;
  totalPlacas: number;
  totalMetrosCanto: number;
};

/** El listado de materiales de una solicitud en Excel (pestaña Materiales): placas y cantos, con los totales. */
export function buildMaterialsWorkbook(numero: number, summary: MaterialsSummary) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Carpinteria";
  workbook.created = new Date();
  const header = (sheet: ExcelJS.Worksheet) => {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  };
  const placas = workbook.addWorksheet("Placas");
  placas.columns = [
    { header: "Material", key: "nombre", width: 36 },
    { header: "Medida de la placa (mm)", key: "medida", width: 24 },
    { header: "Espesor (mm)", key: "espesor", width: 14 },
    { header: "Piezas", key: "piezas", width: 10 },
    { header: "Placas", key: "placas", width: 10 }
  ];
  header(placas);
  for (const placa of summary.placas) {
    placas.addRow({
      nombre: placa.nombre.trim(),
      medida: placa.anchoPlaca && placa.altoPlaca ? `${placa.anchoPlaca} × ${placa.altoPlaca}` : "",
      espesor: placa.espesorMm,
      piezas: placa.piezas,
      placas: placa.placas
    });
  }
  placas.addRow({ nombre: "Total", placas: summary.totalPlacas }).font = { bold: true };
  const cantos = workbook.addWorksheet("Cantos");
  cantos.columns = [
    { header: "Canto", key: "nombre", width: 40 },
    { header: "Espesor (mm)", key: "espesor", width: 14 },
    { header: "Metros", key: "metros", width: 12 }
  ];
  header(cantos);
  for (const item of summary.cantos) cantos.addRow({ nombre: item.nombre.trim(), espesor: item.espesorMm, metros: Math.round(item.metros * 100) / 100 });
  cantos.addRow({ nombre: "Total", metros: Math.round(summary.totalMetrosCanto * 100) / 100 }).font = { bold: true };
  workbook.title = `Materiales M-${numero}`;
  return workbook;
}
