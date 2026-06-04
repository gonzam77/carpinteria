import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import { Button, Checkbox, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip } from "@mui/material";
import { OrderDetail } from "../types";

const emptyRow: OrderDetail = {
  codigoBarra: "",
  material: "",
  largo: "",
  ancho: "",
  cantidad: 1,
  cantoLargo1: false,
  cantoLargo2: false,
  cantoAncho1: false,
  cantoAncho2: false,
  codigoBarraCentro: "",
  remark: "",
  numeroCliente: "",
  nombreCliente: "",
  nombreProducto: ""
};

export function createEmptyDetail(): OrderDetail {
  return { ...emptyRow };
}

export function OrderItemsTable({ rows, setRows }: { rows: OrderDetail[]; setRows: (rows: OrderDetail[]) => void }) {
  function patchRow(index: number, field: keyof OrderDetail, value: any) {
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  const textFields: Array<keyof OrderDetail> = ["codigoBarra", "material", "largo", "ancho", "cantidad", "codigoBarraCentro", "remark", "numeroCliente", "nombreCliente", "nombreProducto"];
  const cantoFields: Array<keyof OrderDetail> = ["cantoLargo1", "cantoLargo2", "cantoAncho1", "cantoAncho2"];

  return (
    <>
      <TableContainer component={Paper} sx={{ maxHeight: 520 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {["Codigo barra", "Material", "Largo", "Ancho", "Cantidad", "CL1", "CL2", "CA1", "CA2", "Codigo centro", "Remark", "Nro cliente", "Nombre cliente", "Producto", ""].map((header) => (
                <TableCell key={header} sx={{ whiteSpace: "nowrap", fontWeight: 700 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {textFields.slice(0, 5).map((field) => (
                  <TableCell key={field} sx={{ minWidth: field === "material" ? 190 : 130 }}>
                    <TextField
                      value={row[field] ?? ""}
                      type={["largo", "ancho", "cantidad"].includes(field) ? "number" : "text"}
                      onChange={(event) => patchRow(index, field, event.target.value)}
                      size="small"
                      fullWidth
                      required={["material", "largo", "ancho", "cantidad"].includes(field)}
                    />
                  </TableCell>
                ))}
                {cantoFields.map((field) => (
                  <TableCell key={field} align="center">
                    <Checkbox checked={Boolean(row[field])} onChange={(event) => patchRow(index, field, event.target.checked)} />
                  </TableCell>
                ))}
                {textFields.slice(5).map((field) => (
                  <TableCell key={field} sx={{ minWidth: 130 }}>
                    <TextField value={row[field] ?? ""} onChange={(event) => patchRow(index, field, event.target.value)} size="small" fullWidth />
                  </TableCell>
                ))}
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <Tooltip title="Duplicar fila">
                    <IconButton onClick={() => setRows([...rows.slice(0, index + 1), { ...row }, ...rows.slice(index + 1)])}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Eliminar fila">
                    <IconButton disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Button sx={{ mt: 2 }} variant="outlined" onClick={() => setRows([...rows, createEmptyDetail()])}>
        Agregar fila
      </Button>
    </>
  );
}
