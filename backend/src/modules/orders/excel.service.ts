import ExcelJS from "exceljs";

const columns = [
  { header: "codigo barra", key: "codigo barra" },
  { header: "Material", key: "Material" },
  { header: "largo", key: "largo" },
  { header: "ancho", key: "ancho" },
  { header: "cantidad", key: "cantidad" },
  { header: "", key: "blank1" },
  { header: "", key: "blank2" },
  { header: "", key: "blank3" },
  { header: "", key: "blank4" },
  { header: "canto largo 1", key: "canto largo 1" },
  { header: "canto largo 2", key: "canto largo 2" },
  { header: "canto ancho 1", key: "canto ancho 1" },
  { header: "canto ancho 2", key: "canto ancho 2" },
  { header: "permite rotar", key: "permite rotar" },
  { header: "codigo barra centro p", key: "codigo barra centro p" },
  { header: "Remark", key: "Remark" },
  { header: "numero cliente", key: "numero cliente" },
  { header: "nombre cliente", key: "nombre cliente" },
  { header: "nombre producto", key: "nombre producto" }
] as const;

function canto(value: boolean) {
  return value ? "Canto" : "";
}

export async function buildOrdersWorkbook(orders: any[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Carpinteria";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Pedidos");

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: Math.max(column.header.length + 4, 16)
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
