import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import { Button, Checkbox, IconButton, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip } from "@mui/material";
import { Material, OrderDetail } from "../types";

const emptyRow: OrderDetail = {
  codigoBarra: "",
  materialId: "",
  material: "",
  largo: "",
  ancho: "",
  cantidad: 1,
  cantoLargo1: false,
  cantoLargo2: false,
  cantoAncho1: false,
  cantoAncho2: false,
  permiteRotar: false,
  codigoBarraCentro: "",
  remark: "",
  numeroCliente: "",
  nombreCliente: "",
  nombreProducto: ""
};

export function createEmptyDetail(): OrderDetail {
  return { ...emptyRow };
}

export function OrderItemsTable({ rows, setRows, materials }: { rows: OrderDetail[]; setRows: (rows: OrderDetail[]) => void; materials: Material[] }) {
  function patchRow(index: number, field: keyof OrderDetail, value: any) {
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  function patchMaterial(index: number, materialId: string) {
    const material = materials.find((item) => item.id === materialId);
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, materialId, material: material?.nombre ?? "" } : row)));
  }

  function selectedMaterialId(row: OrderDetail) {
    return row.materialId || materials.find((material) => material.nombre === row.material)?.id || "";
  }

  const textFields: Array<keyof OrderDetail> = ["largo", "ancho", "cantidad", "codigoBarraCentro", "remark", "numeroCliente", "nombreCliente", "nombreProducto"];
  const cantoFields: Array<keyof OrderDetail> = ["cantoLargo1", "cantoLargo2", "cantoAncho1", "cantoAncho2", "permiteRotar"];

  return (
    <>
      <TableContainer component={Paper} sx={{ maxHeight: 520 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {["Codigo barra", "Material", "Largo", "Ancho", "Cantidad", "CL1", "CL2", "CA1", "CA2", "Rotar", "Codigo centro", "Remark", "Nro cliente", "Nombre cliente", "Producto", ""].map((header) => (
                <TableCell key={header} sx={{ whiteSpace: "nowrap", fontWeight: 700 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                <TableCell sx={{ minWidth: 130 }}>
                  <TextField value={row.codigoBarra ?? ""} onChange={(event) => patchRow(index, "codigoBarra", event.target.value)} size="small" fullWidth />
                </TableCell>
                <TableCell sx={{ minWidth: 220 }}>
                  <TextField select value={selectedMaterialId(row)} onChange={(event) => patchMaterial(index, event.target.value)} size="small" fullWidth required>
                    {materials.map((material) => (
                      <MenuItem key={material.id} value={material.id}>
                        {material.nombre}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                {textFields.slice(0, 3).map((field) => (
                  <TableCell key={field} sx={{ minWidth: 130 }}>
                    <TextField
                      value={row[field] ?? ""}
                      type={["largo", "ancho", "cantidad"].includes(field) ? "number" : "text"}
                      onChange={(event) => patchRow(index, field, event.target.value)}
                      size="small"
                      fullWidth
                      required={["largo", "ancho", "cantidad"].includes(field)}
                    />
                  </TableCell>
                ))}
                {cantoFields.map((field) => (
                  <TableCell key={field} align="center">
                    <Checkbox checked={Boolean(row[field])} onChange={(event) => patchRow(index, field, event.target.checked)} />
                  </TableCell>
                ))}
                {textFields.slice(3).map((field) => (
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
