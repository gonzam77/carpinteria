import ExcelJS from "exceljs";

const columns = [
  "codigo barra",
  "Material",
  "largo",
  "ancho",
  "cantidad",
  "canto largo 1",
  "canto largo 2",
  "canto ancho 1",
  "canto ancho 2",
  "permite rotar",
  "codigo barra centro p",
  "Remark",
  "numero cliente",
  "nombre cliente",
  "nombre producto"
] as const;

function canto(value: boolean) {
  return value ? "Canto" : "";
}

export async function buildOrdersWorkbook(orders: any[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Carpinteria";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Pedidos");

  sheet.columns = columns.map((header) => ({
    header,
    key: header,
    width: Math.max(header.length + 4, 16)
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  for (const order of orders) {
    for (const detail of order.detalles) {
      sheet.addRow({
        "codigo barra": detail.codigoBarra,
        Material: detail.material,
        largo: detail.largo,
        ancho: detail.ancho,
        cantidad: detail.cantidad,
        "canto largo 1": canto(detail.cantoLargo1),
        "canto largo 2": canto(detail.cantoLargo2),
        "canto ancho 1": canto(detail.cantoAncho1),
        "canto ancho 2": canto(detail.cantoAncho2),
        "permite rotar": detail.permiteRotar ? "Si" : "No",
        "codigo barra centro p": detail.codigoBarraCentro ?? "",
        Remark: detail.remark ?? "",
        "numero cliente": detail.numeroCliente ?? "",
        "nombre cliente": detail.nombreCliente ?? "",
        "nombre producto": detail.nombreProducto ?? ""
      });
    }
  }

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
