import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import StraightenIcon from "@mui/icons-material/Straighten";
import { Box, Button, Checkbox, IconButton, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import { Material, OrderDetail } from "../types";

const emptyRow: OrderDetail = {
  codigoBarra: "",
  materialId: "",
  material: "",
  largo: "",
  ancho: "",
  cantidad: "",
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

type EdgeIdField = "cantoLargo1Id" | "cantoLargo2Id" | "cantoAncho1Id" | "cantoAncho2Id";
type EdgeNameField = "cantoLargo1Nombre" | "cantoLargo2Nombre" | "cantoAncho1Nombre" | "cantoAncho2Nombre";
type EdgeFlagField = "cantoLargo1" | "cantoLargo2" | "cantoAncho1" | "cantoAncho2";
type OrderItemsMode = "cuts" | "edges";

type EdgeFieldConfig = {
  idField: EdgeIdField;
  nameField: EdgeNameField;
  flagField: EdgeFlagField;
  label: string;
  side: "1" | "2";
};

type EdgeOption = Pick<Material, "id" | "nombre" | "colorCanto" | "espesorMm" | "placaMaterialId"> & {
  activo?: boolean;
  placaMaterialNombre?: string | null;
};

const edgeFields: EdgeFieldConfig[] = [
  { idField: "cantoLargo1Id", nameField: "cantoLargo1Nombre", flagField: "cantoLargo1", label: "Largo 1", side: "1" },
  { idField: "cantoLargo2Id", nameField: "cantoLargo2Nombre", flagField: "cantoLargo2", label: "Largo 2", side: "2" },
  { idField: "cantoAncho1Id", nameField: "cantoAncho1Nombre", flagField: "cantoAncho1", label: "Ancho 1", side: "1" },
  { idField: "cantoAncho2Id", nameField: "cantoAncho2Nombre", flagField: "cantoAncho2", label: "Ancho 2", side: "2" }
];

const largoEdgeFlags: EdgeFlagField[] = ["cantoLargo1", "cantoLargo2"];
const anchoEdgeFlags: EdgeFlagField[] = ["cantoAncho1", "cantoAncho2"];

export function createEmptyDetail(defaults: Partial<Pick<OrderDetail, "numeroCliente" | "nombreCliente">> = {}): OrderDetail {
  return { ...emptyRow, ...defaults };
}

function activeEdgeCount(row: OrderDetail, fields: EdgeFlagField[]) {
  return fields.reduce((total, field) => total + Number(Boolean(row[field])), 0);
}

function formatCantoOption(canto: EdgeOption) {
  const parts = [canto.placaMaterialNombre || canto.nombre];
  if (!canto.placaMaterialNombre && canto.colorCanto) parts.push(canto.colorCanto);
  if (canto.espesorMm) parts.push(`${canto.espesorMm}mm`);
  if (canto.activo === false) parts.push("inactivo");
  return parts.join(" - ");
}

function DimensionPreview({ label, value, count }: { label: string; value: number | string; count: number }) {
  return (
    <Box sx={{ minWidth: 74 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={800} lineHeight={1.2}>
        {value || "-"}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.35, mt: 0.35, minHeight: 7 }}>
        {Array.from({ length: count }).map((_, index) => (
          <Box key={index} sx={{ width: 28, height: 3, borderRadius: "999px", bgcolor: "#17203a" }} />
        ))}
      </Box>
    </Box>
  );
}

function PartSummary({ row, index }: { row: OrderDetail; index: number }) {
  return (
    <Stack spacing={0.75} sx={{ minWidth: 260 }}>
      <Box>
        <Typography variant="subtitle2" fontWeight={900}>
          #{index + 1}. {row.nombreProducto || "Pieza sin nombre"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {row.material || "Sin placa"}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1.25} alignItems="flex-start" flexWrap="wrap" useFlexGap>
        <DimensionPreview label="Largo" value={row.largo} count={activeEdgeCount(row, largoEdgeFlags)} />
        <Typography sx={{ pt: 2.2, color: "text.secondary", fontWeight: 800 }}>x</Typography>
        <DimensionPreview label="Ancho" value={row.ancho} count={activeEdgeCount(row, anchoEdgeFlags)} />
        <Typography sx={{ pt: 2.2, color: "text.secondary", fontWeight: 800 }}>- {row.cantidad || 0}</Typography>
      </Stack>
    </Stack>
  );
}

export function OrderItemsTable({
  rows,
  setRows,
  materials,
  clientName,
  clientPhone,
  onClientPhoneChange,
  defaultDetailValues = {},
  mode = "cuts"
}: {
  rows: OrderDetail[];
  setRows: (rows: OrderDetail[]) => void;
  materials: Material[];
  clientName: string;
  clientPhone: string;
  onClientPhoneChange: (value: string) => void;
  defaultDetailValues?: Partial<Pick<OrderDetail, "numeroCliente" | "nombreCliente">>;
  mode?: OrderItemsMode;
}) {
  const placaMaterials = materials.filter((material) => material.tipo === "PLACA");
  const cantoMaterials = materials.filter((material) => material.tipo === "CANTO");
  const cantoOptions: EdgeOption[] = cantoMaterials.map((material) => ({
    id: material.id,
    nombre: material.nombre,
    colorCanto: material.colorCanto,
    espesorMm: material.espesorMm,
    placaMaterialId: material.placaMaterialId,
    placaMaterialNombre: material.placaMaterial?.nombre ?? null,
    activo: material.activo
  }));

  function patchRow(index: number, patch: Partial<OrderDetail>) {
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function patchMaterial(index: number, materialId: string) {
    const material = placaMaterials.find((item) => item.id === materialId);
    patchRow(index, { materialId, material: material?.nombre ?? "" });
  }

  function patchEdge(index: number, config: EdgeFieldConfig, canto: EdgeOption | null) {
    patchRow(index, {
      [config.idField]: canto?.id ?? null,
      [config.nameField]: canto?.nombre ?? null,
      [config.flagField]: Boolean(canto)
    } as Partial<OrderDetail>);
  }

  function selectedMaterialId(row: OrderDetail) {
    return row.materialId || placaMaterials.find((material) => material.nombre === row.material)?.id || "";
  }

  function setAllRotation(checked: boolean) {
    setRows(rows.map((row) => ({ ...row, permiteRotar: checked })));
  }

  function createNextDetail() {
    const nextDetail = createEmptyDetail(defaultDetailValues);
    const previousRow = rows[rows.length - 1];
    if (!previousRow) return nextDetail;

    const materialId = selectedMaterialId(previousRow);
    if (!materialId) return nextDetail;

    const material = placaMaterials.find((item) => item.id === materialId);
    return {
      ...nextDetail,
      materialId,
      material: material?.nombre ?? previousRow.material ?? ""
    };
  }

  function cantoOptionsForRow(row: OrderDetail) {
    const materialId = selectedMaterialId(row);
    const options = cantoOptions.filter((option) => option.placaMaterialId === materialId);
    const seen = new Set(options.map((option) => option.id));

    edgeFields.forEach((config) => {
      const currentId = row[config.idField];
      if (!currentId || seen.has(currentId)) return;
      options.push({
        id: currentId,
        nombre: row[config.nameField] || "Canto guardado",
        colorCanto: null,
        espesorMm: 0,
        placaMaterialId: materialId || null,
        placaMaterialNombre: null,
        activo: false
      });
      seen.add(currentId);
    });

    return options;
  }

  function edgeMatches(row: OrderDetail, config: EdgeFieldConfig, cantoId: string) {
    return Boolean(row[config.flagField]) && row[config.idField] === cantoId;
  }

  if (mode === "edges") {
    return (
      <Stack spacing={2}>
        <Paper sx={{ borderRadius: "8px", overflow: "hidden" }}>
          <Box
            sx={{
              px: { xs: 1.5, sm: 2 },
              py: 1.25,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
              bgcolor: "primary.main",
              color: "primary.contrastText"
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <StraightenIcon fontSize="small" />
              <Typography variant="subtitle1" fontWeight={900}>
                Cantos por pieza
              </Typography>
            </Stack>
            <Typography variant="body2" fontWeight={700}>
              {rows.length} partes
            </Typography>
          </Box>
          <Box sx={{ overflowX: "auto" }}>
            <Table
              size="small"
              sx={{
                minWidth: 900,
                "& .MuiTableCell-root": {
                  borderRight: "1px solid",
                  borderColor: "divider"
                },
                "& .MuiTableCell-root:last-of-type": {
                  borderRight: 0
                }
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell rowSpan={2} sx={{ width: 330, verticalAlign: "middle" }}>
                    Partes
                  </TableCell>
                  <TableCell rowSpan={2} sx={{ minWidth: 260, verticalAlign: "middle" }}>
                    Tipo
                  </TableCell>
                  <TableCell align="center" colSpan={2}>
                    Largo
                  </TableCell>
                  <TableCell align="center" colSpan={2}>
                    Ancho
                  </TableCell>
                </TableRow>
                <TableRow>
                  {edgeFields.map((config) => (
                    <TableCell key={config.idField} align="center" sx={{ width: 72 }}>
                      {config.side}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => {
                  const options = cantoOptionsForRow(row);

                  if (!options.length) {
                    return (
                      <TableRow key={index}>
                        <TableCell sx={{ bgcolor: "background.default" }}>
                          <PartSummary row={row} index={index} />
                        </TableCell>
                        <TableCell colSpan={5} sx={{ color: "text.secondary" }}>
                          No hay cantos cargados.
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return options.map((option, optionIndex) => (
                    <TableRow key={`${index}-${option.id}`}>
                      {optionIndex === 0 && (
                        <TableCell rowSpan={options.length} sx={{ bgcolor: "background.default", verticalAlign: "top" }}>
                          <PartSummary row={row} index={index} />
                        </TableCell>
                      )}
                      <TableCell sx={{ fontWeight: 700 }}>{formatCantoOption(option)}</TableCell>
                      {edgeFields.map((config) => (
                        <TableCell key={config.idField} align="center">
                          <Tooltip title={config.label}>
                            <Checkbox
                              checked={edgeMatches(row, config, option.id)}
                              onChange={(event) => patchEdge(index, config, event.target.checked ? option : null)}
                              inputProps={{ "aria-label": `${config.label} ${formatCantoOption(option)}` }}
                            />
                          </Tooltip>
                        </TableCell>
                      ))}
                    </TableRow>
                  ));
                })}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      </Stack>
    );
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

      <Paper sx={{ borderRadius: "8px", overflow: "hidden" }}>
        <Box
          sx={{
            px: { xs: 1.5, sm: 2 },
            py: 1.25,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            bgcolor: "primary.main",
            color: "primary.contrastText"
          }}
        >
          <Typography variant="subtitle1" fontWeight={900}>
            Partes
          </Typography>
          <Typography variant="body2" fontWeight={700}>
            {rows.length} partes, {rows.reduce((total, row) => total + Number(row.cantidad || 0), 0)} unidades
          </Typography>
        </Box>
        <Box sx={{ overflowX: "auto" }}>
          <Table
            size="small"
            sx={{
              minWidth: 880,
              "& .MuiTableCell-root": {
                borderRight: "1px solid",
                borderColor: "divider",
                verticalAlign: "middle"
              },
              "& .MuiTableCell-root:last-of-type": {
                borderRight: 0
              }
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>#</TableCell>
                <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>Placa</TableCell>
                <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>Largo</TableCell>
                <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>Ancho</TableCell>
                <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>Cantidad</TableCell>
                <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>Nombre</TableCell>
                <TableCell align="center" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                    <Checkbox
                      size="small"
                      checked={rows.length > 0 && rows.every((row) => Boolean(row.permiteRotar))}
                      indeterminate={rows.some((row) => Boolean(row.permiteRotar)) && !rows.every((row) => Boolean(row.permiteRotar))}
                      onChange={(event) => setAllRotation(event.target.checked)}
                      inputProps={{ "aria-label": "Rotar todas las piezas" }}
                      sx={{ p: 0.25 }}
                    />
                    <Typography variant="caption" fontWeight={800}>
                      Rotar
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell sx={{ width: 48, fontWeight: 900 }}>{index + 1}</TableCell>
                  <TableCell sx={{ minWidth: 210 }}>
                    <TextField select value={selectedMaterialId(row)} onChange={(event) => patchMaterial(index, event.target.value)} fullWidth required>
                      <MenuItem value="">Seleccionar</MenuItem>
                      {placaMaterials.map((material) => (
                        <MenuItem key={material.id} value={material.id}>
                          {material.nombre} {material.espesorMm}mm
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ width: 132 }}>
                    <TextField label="mm" type="number" value={row.largo ?? ""} onChange={(event) => patchRow(index, { largo: event.target.value })} inputProps={{ min: 1, step: 1 }} fullWidth required />
                  </TableCell>
                  <TableCell sx={{ width: 132 }}>
                    <TextField label="mm" type="number" value={row.ancho ?? ""} onChange={(event) => patchRow(index, { ancho: event.target.value })} inputProps={{ min: 1, step: 1 }} fullWidth required />
                  </TableCell>
                  <TableCell sx={{ width: 112 }}>
                    <TextField type="number" value={row.cantidad ?? ""} onChange={(event) => patchRow(index, { cantidad: event.target.value })} inputProps={{ min: 1, step: 1 }} fullWidth required />
                  </TableCell>
                  <TableCell sx={{ minWidth: 210 }}>
                    <TextField value={row.nombreProducto ?? ""} onChange={(event) => patchRow(index, { nombreProducto: event.target.value })} placeholder="Piso, techo, estante..." fullWidth />
                  </TableCell>
                  <TableCell align="center" sx={{ width: 86 }}>
                    <Switch checked={Boolean(row.permiteRotar)} onChange={(event) => patchRow(index, { permiteRotar: event.target.checked })} inputProps={{ "aria-label": `Rotar pieza ${index + 1}` }} />
                  </TableCell>
                  <TableCell align="right" sx={{ width: 104 }}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Button startIcon={<AddIcon />} sx={{ width: { xs: "100%", sm: "auto" } }} variant="outlined" onClick={() => setRows([...rows, createNextDetail()])}>
        Agregar pieza
      </Button>
    </Stack>
  );
}
