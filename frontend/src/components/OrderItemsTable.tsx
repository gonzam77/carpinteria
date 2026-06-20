import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import StraightenIcon from "@mui/icons-material/Straighten";
import { Box, Button, IconButton, MenuItem, Paper, Stack, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { Material, OrderDetail } from "../types";

const emptyRow: OrderDetail = {
  codigoBarra: "",
  materialId: "",
  material: "",
  largo: "",
  ancho: "",
  cantidad: 1,
  cantoLargo1Id: null,
  cantoLargo1Nombre: null,
  cantoLargo1: false,
  cantoLargo2Id: null,
  cantoLargo2Nombre: null,
  cantoLargo2: false,
  cantoAncho1Id: null,
  cantoAncho1Nombre: null,
  cantoAncho1: false,
  cantoAncho2Id: null,
  cantoAncho2Nombre: null,
  cantoAncho2: false,
  permiteRotar: false,
  codigoBarraCentro: "",
  remark: "",
  numeroCliente: "",
  nombreCliente: "",
  nombreProducto: ""
};

type EdgeFieldConfig = {
  idField: "cantoLargo1Id" | "cantoLargo2Id" | "cantoAncho1Id" | "cantoAncho2Id";
  nameField: "cantoLargo1Nombre" | "cantoLargo2Nombre" | "cantoAncho1Nombre" | "cantoAncho2Nombre";
  flagField: "cantoLargo1" | "cantoLargo2" | "cantoAncho1" | "cantoAncho2";
  label: string;
};

const edgeFields: EdgeFieldConfig[] = [
  { idField: "cantoLargo1Id", nameField: "cantoLargo1Nombre", flagField: "cantoLargo1", label: "Canto largo 1" },
  { idField: "cantoLargo2Id", nameField: "cantoLargo2Nombre", flagField: "cantoLargo2", label: "Canto largo 2" },
  { idField: "cantoAncho1Id", nameField: "cantoAncho1Nombre", flagField: "cantoAncho1", label: "Canto ancho 1" },
  { idField: "cantoAncho2Id", nameField: "cantoAncho2Nombre", flagField: "cantoAncho2", label: "Canto ancho 2" }
];

export function createEmptyDetail(defaults: Partial<Pick<OrderDetail, "numeroCliente" | "nombreCliente">> = {}): OrderDetail {
  return { ...emptyRow, ...defaults };
}

export function OrderItemsTable({
  rows,
  setRows,
  materials,
  clientName,
  clientPhone,
  onClientPhoneChange,
  defaultDetailValues = {}
}: {
  rows: OrderDetail[];
  setRows: (rows: OrderDetail[]) => void;
  materials: Material[];
  clientName: string;
  clientPhone: string;
  onClientPhoneChange: (value: string) => void;
  defaultDetailValues?: Partial<Pick<OrderDetail, "numeroCliente" | "nombreCliente">>;
}) {
  const placaMaterials = materials.filter((material) => material.tipo === "PLACA");
  const cantoMaterials = materials.filter((material) => material.tipo === "CANTO");

  function patchRow(index: number, patch: Partial<OrderDetail>) {
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function patchMaterial(index: number, materialId: string) {
    const material = placaMaterials.find((item) => item.id === materialId);
    patchRow(index, { materialId, material: material?.nombre ?? "" });
  }

  function patchEdge(index: number, config: EdgeFieldConfig, cantoId: string) {
    const canto = cantoMaterials.find((item) => item.id === cantoId);
    patchRow(index, {
      [config.idField]: canto?.id ?? null,
      [config.nameField]: canto?.nombre ?? null,
      [config.flagField]: Boolean(canto)
    } as Partial<OrderDetail>);
  }

  function selectedMaterialId(row: OrderDetail) {
    return row.materialId || placaMaterials.find((material) => material.nombre === row.material)?.id || "";
  }

  return (
    <Stack spacing={2.25}>
      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: "10px", bgcolor: "background.default" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between">
          <Box>
            <Typography variant="caption" color="text.secondary">
              Cliente
            </Typography>
            <Typography fontWeight={700}>{clientName || "Sin cliente"}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Telefono
            </Typography>
            <TextField
              size="small"
              value={clientPhone}
              onChange={(event) => onClientPhoneChange(event.target.value)}
              placeholder="Telefono de contacto"
              sx={{ minWidth: { md: 240 } }}
            />
          </Box>
        </Stack>
      </Paper>

      {rows.map((row, index) => (
        <Paper key={index} sx={{ p: { xs: 2, md: 2.5 }, borderRadius: "10px" }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}>
              <Box>
                <Typography variant="h6">Pieza {index + 1}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Defini el material, las medidas y los cantos de cada lado.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Tooltip title="Duplicar pieza">
                  <IconButton onClick={() => setRows([...rows.slice(0, index + 1), { ...row }, ...rows.slice(index + 1)])}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Eliminar pieza">
                  <span>
                    <IconButton disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                  xl: "repeat(3, minmax(0, 1fr))"
                }
              }}
            >
              <TextField label="Codigo de barra" value={row.codigoBarra ?? ""} onChange={(event) => patchRow(index, { codigoBarra: event.target.value })} fullWidth />
              <TextField select label="Placa" value={selectedMaterialId(row)} onChange={(event) => patchMaterial(index, event.target.value)} fullWidth required>
                {placaMaterials.map((material) => (
                  <MenuItem key={material.id} value={material.id}>
                    {material.nombre} {material.espesorMm}mm
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Cantidad" type="number" value={row.cantidad ?? ""} onChange={(event) => patchRow(index, { cantidad: event.target.value })} inputProps={{ min: 1, step: 1 }} fullWidth required />
              <TextField label="Largo mm" type="number" value={row.largo ?? ""} onChange={(event) => patchRow(index, { largo: event.target.value })} inputProps={{ min: 1, step: 1 }} fullWidth required />
              <TextField label="Ancho mm" type="number" value={row.ancho ?? ""} onChange={(event) => patchRow(index, { ancho: event.target.value })} inputProps={{ min: 1, step: 1 }} fullWidth required />
              <TextField label="Codigo centro" value={row.codigoBarraCentro ?? ""} onChange={(event) => patchRow(index, { codigoBarraCentro: event.target.value })} fullWidth />
              <TextField label="Producto" value={row.nombreProducto ?? ""} onChange={(event) => patchRow(index, { nombreProducto: event.target.value })} fullWidth />
              <TextField label="Remark" value={row.remark ?? ""} onChange={(event) => patchRow(index, { remark: event.target.value })} fullWidth />
            </Box>

            <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: "10px" }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <StraightenIcon fontSize="small" />
                  <Typography variant="subtitle1" fontWeight={700}>
                    Cantos por borde
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                      xs: "1fr",
                      md: "repeat(2, minmax(0, 1fr))",
                      xl: "repeat(4, minmax(0, 1fr))"
                    }
                  }}
                >
                  {edgeFields.map((config) => (
                    <TextField
                      key={config.idField}
                      select
                      label={config.label}
                      value={row[config.idField] ?? ""}
                      onChange={(event) => patchEdge(index, config, event.target.value)}
                      fullWidth
                    >
                      <MenuItem value="">Sin canto</MenuItem>
                      {cantoMaterials.map((canto) => (
                        <MenuItem key={canto.id} value={canto.id}>
                          {canto.nombre}
                          {canto.colorCanto ? ` - ${canto.colorCanto}` : ""}
                          {` - ${canto.espesorMm}mm`}
                        </MenuItem>
                      ))}
                    </TextField>
                  ))}
                </Box>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: "10px" }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Corte
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Habilita la rotacion para que el optimizador pueda girar la pieza si conviene.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2">Rotar</Typography>
                  <Switch checked={Boolean(row.permiteRotar)} onChange={(event) => patchRow(index, { permiteRotar: event.target.checked })} />
                </Stack>
              </Stack>
            </Paper>
          </Stack>
        </Paper>
      ))}

      <Button sx={{ width: { xs: "100%", sm: "auto" } }} variant="outlined" onClick={() => setRows([...rows, createEmptyDetail(defaultDetailValues)])}>
        Agregar pieza
      </Button>
    </Stack>
  );
}
