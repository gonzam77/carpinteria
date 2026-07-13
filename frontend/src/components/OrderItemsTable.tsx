import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import RemoveIcon from "@mui/icons-material/Remove";
import StraightenIcon from "@mui/icons-material/Straighten";
import { Box, Button, Checkbox, IconButton, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
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
const maxEdgeTypeRows = 4;

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
  const [edgeTypeSelections, setEdgeTypeSelections] = useState<Record<string, string>>({});
  const [edgeTypeRowCounts, setEdgeTypeRowCounts] = useState<Record<string, number>>({});
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

  function patchEdges(index: number, patches: Partial<OrderDetail>) {
    patchRow(index, patches);
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
    const options = [...cantoOptions].sort((a, b) => {
      const aMatchesMaterial = a.placaMaterialId === materialId ? 0 : 1;
      const bMatchesMaterial = b.placaMaterialId === materialId ? 0 : 1;
      return aMatchesMaterial - bMatchesMaterial || formatCantoOption(a).localeCompare(formatCantoOption(b), "es");
    });
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

  function rowKey(row: OrderDetail, index: number) {
    return row.id ?? String(index);
  }

  function edgeTypeKey(row: OrderDetail, index: number, typeIndex: number) {
    return `${rowKey(row, index)}-${typeIndex}`;
  }

  function selectedCantoIdsForRow(row: OrderDetail) {
    const ids: string[] = [];
    edgeFields.forEach((config) => {
      const cantoId = row[config.idField];
      if (cantoId && !ids.includes(cantoId)) ids.push(cantoId);
    });
    return ids;
  }

  function defaultCantoIdForRow(row: OrderDetail) {
    const materialId = selectedMaterialId(row);
    return cantoOptions.find((option) => option.placaMaterialId === materialId)?.id ?? "";
  }

  function edgeTypeRowsForRow(row: OrderDetail, rowIndex: number) {
    const selectedCount = selectedCantoIdsForRow(row).length;
    const configuredCount = edgeTypeRowCounts[rowKey(row, rowIndex)] ?? 0;
    return Math.min(maxEdgeTypeRows, Math.max(1, selectedCount, configuredCount));
  }

  function edgeTypeValue(row: OrderDetail, rowIndex: number, typeIndex: number) {
    const key = edgeTypeKey(row, rowIndex, typeIndex);
    if (edgeTypeSelections[key] !== undefined) return edgeTypeSelections[key];
    return selectedCantoIdsForRow(row)[typeIndex] ?? (typeIndex === 0 ? defaultCantoIdForRow(row) : "");
  }

  function cantoByIdForRow(row: OrderDetail, cantoId: string) {
    return cantoOptionsForRow(row).find((option) => option.id === cantoId) ?? null;
  }

  function setEdgeTypeValue(row: OrderDetail, rowIndex: number, typeIndex: number, nextCantoId: string) {
    const previousCantoId = edgeTypeValue(row, rowIndex, typeIndex);
    setEdgeTypeSelections((current) => ({
      ...current,
      [edgeTypeKey(row, rowIndex, typeIndex)]: nextCantoId
    }));

    if (!previousCantoId || previousCantoId === nextCantoId) return;

    const nextCanto = cantoByIdForRow(row, nextCantoId);
    const patches = edgeFields.reduce((currentPatch, config) => {
      if (row[config.idField] !== previousCantoId) return currentPatch;
      return {
        ...currentPatch,
        [config.idField]: nextCanto?.id ?? null,
        [config.nameField]: nextCanto?.nombre ?? null,
        [config.flagField]: Boolean(nextCanto)
      };
    }, {} as Partial<OrderDetail>);

    if (Object.keys(patches).length) patchEdges(rowIndex, patches);
  }

  function addEdgeTypeRow(row: OrderDetail, rowIndex: number) {
    const currentCount = edgeTypeRowsForRow(row, rowIndex);
    setEdgeTypeRowCounts((current) => ({
      ...current,
      [rowKey(row, rowIndex)]: Math.min(maxEdgeTypeRows, currentCount + 1)
    }));
  }

  function removeLastEdgeTypeRow(row: OrderDetail, rowIndex: number) {
    const currentCount = edgeTypeRowsForRow(row, rowIndex);
    if (currentCount <= 1) return;

    const typeIndex = currentCount - 1;
    const removedCantoId = edgeTypeValue(row, rowIndex, typeIndex);
    const key = rowKey(row, rowIndex);

    setEdgeTypeRowCounts((current) => ({
      ...current,
      [key]: Math.max(1, currentCount - 1)
    }));
    setEdgeTypeSelections((current) => {
      const next = { ...current };
      delete next[edgeTypeKey(row, rowIndex, typeIndex)];
      return next;
    });

    if (!removedCantoId) return;

    const patches = edgeFields.reduce((currentPatch, config) => {
      if (row[config.idField] !== removedCantoId) return currentPatch;
      return {
        ...currentPatch,
        [config.idField]: null,
        [config.nameField]: null,
        [config.flagField]: false
      };
    }, {} as Partial<OrderDetail>);

    if (Object.keys(patches).length) patchEdges(rowIndex, patches);
  }

  function allEdgesMatch(row: OrderDetail, cantoId: string) {
    return Boolean(cantoId) && edgeFields.every((config) => Boolean(row[config.flagField]) && row[config.idField] === cantoId);
  }

  function someEdgesMatch(row: OrderDetail, cantoId: string) {
    return Boolean(cantoId) && edgeFields.some((config) => Boolean(row[config.flagField]) && row[config.idField] === cantoId);
  }

  function patchAllEdges(index: number, row: OrderDetail, canto: EdgeOption | null, checked: boolean) {
    const patches = edgeFields.reduce((currentPatch, config) => {
      if (checked) {
        return {
          ...currentPatch,
          [config.idField]: canto?.id ?? null,
          [config.nameField]: canto?.nombre ?? null,
          [config.flagField]: Boolean(canto)
        };
      }

      if (!canto || row[config.idField] !== canto.id) return currentPatch;
      return {
        ...currentPatch,
        [config.idField]: null,
        [config.nameField]: null,
        [config.flagField]: false
      };
    }, {} as Partial<OrderDetail>);

    if (Object.keys(patches).length) patchEdges(index, patches);
  }

  function edgeMatches(row: OrderDetail, config: EdgeFieldConfig, cantoId: string) {
    return Boolean(cantoId) && Boolean(row[config.flagField]) && row[config.idField] === cantoId;
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
                  <TableCell rowSpan={2} sx={{ minWidth: 280, verticalAlign: "middle" }}>
                    Tipo
                  </TableCell>
                  <TableCell rowSpan={2} align="center" sx={{ width: 88, verticalAlign: "middle" }}>
                    Todos
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
                        <TableCell colSpan={6} sx={{ color: "text.secondary" }}>
                          No hay cantos cargados.
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const edgeTypeRows = edgeTypeRowsForRow(row, index);

                  return Array.from({ length: edgeTypeRows }, (_item, typeIndex) => {
                    const selectedCantoId = edgeTypeValue(row, index, typeIndex);
                    const selectedCanto = options.find((option) => option.id === selectedCantoId) ?? null;
                    const canAddEdgeType = typeIndex === 0 && edgeTypeRows < maxEdgeTypeRows;
                    const canRemoveEdgeType = typeIndex === 0 && edgeTypeRows > 1;
                    const selectedIdsInOtherRows = Array.from({ length: edgeTypeRows }, (_otherItem, otherIndex) => (otherIndex === typeIndex ? "" : edgeTypeValue(row, index, otherIndex))).filter(Boolean);

                    return (
                      <TableRow key={`${index}-${typeIndex}`}>
                        {typeIndex === 0 && (
                          <TableCell rowSpan={edgeTypeRows} sx={{ bgcolor: "background.default", verticalAlign: "top" }}>
                            <PartSummary row={row} index={index} />
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                              {canAddEdgeType && (
                                <Button type="button" size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => addEdgeTypeRow(row, index)}>
                                  Agregar canto
                                </Button>
                              )}
                              {canRemoveEdgeType && (
                                <Button type="button" size="small" variant="outlined" color="warning" startIcon={<RemoveIcon />} onClick={() => removeLastEdgeTypeRow(row, index)}>
                                  Quitar canto
                                </Button>
                              )}
                            </Stack>
                          </TableCell>
                        )}
                        <TableCell sx={{ minWidth: 280 }}>
                          <TextField
                            select
                            size="small"
                            value={selectedCantoId}
                            onChange={(event) => setEdgeTypeValue(row, index, typeIndex, event.target.value)}
                            fullWidth
                          >
                            <MenuItem value="">Seleccionar canto</MenuItem>
                            {options.map((option) => (
                              <MenuItem key={option.id} value={option.id} disabled={selectedIdsInOtherRows.includes(option.id)}>
                                {formatCantoOption(option)}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title={selectedCanto ? "Marcar o quitar todos los lados" : "Seleccione un canto"}>
                            <span>
                              <Checkbox
                                checked={allEdgesMatch(row, selectedCantoId)}
                                indeterminate={!allEdgesMatch(row, selectedCantoId) && someEdgesMatch(row, selectedCantoId)}
                                disabled={!selectedCanto}
                                onChange={(event) => patchAllEdges(index, row, selectedCanto, event.target.checked)}
                                inputProps={{ "aria-label": `Todos ${selectedCanto ? formatCantoOption(selectedCanto) : "sin canto"}` }}
                              />
                            </span>
                          </Tooltip>
                        </TableCell>
                        {edgeFields.map((config) => (
                          <TableCell key={config.idField} align="center">
                            <Tooltip title={selectedCanto ? config.label : "Seleccione un canto"}>
                              <span>
                                <Checkbox
                                  checked={edgeMatches(row, config, selectedCantoId)}
                                  disabled={!selectedCanto}
                                  onChange={(event) => patchEdge(index, config, event.target.checked ? selectedCanto : null)}
                                  inputProps={{ "aria-label": `${config.label} ${selectedCanto ? formatCantoOption(selectedCanto) : "sin canto"}` }}
                                />
                              </span>
                            </Tooltip>
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  });
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
              minWidth: 1040,
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
                  <TableCell sx={{ width: 280, minWidth: 280 }}>
                    <TextField select value={selectedMaterialId(row)} onChange={(event) => patchMaterial(index, event.target.value)} fullWidth required>
                      <MenuItem value="">Seleccionar</MenuItem>
                      {placaMaterials.map((material) => (
                        <MenuItem key={material.id} value={material.id}>
                          {material.nombre} {material.espesorMm}mm
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ width: 170, minWidth: 170 }}>
                    <TextField label="mm" type="number" value={row.largo ?? ""} onChange={(event) => patchRow(index, { largo: event.target.value })} inputProps={{ min: 1, step: 1 }} fullWidth required sx={{ minWidth: 154 }} />
                  </TableCell>
                  <TableCell sx={{ width: 170, minWidth: 170 }}>
                    <TextField label="mm" type="number" value={row.ancho ?? ""} onChange={(event) => patchRow(index, { ancho: event.target.value })} inputProps={{ min: 1, step: 1 }} fullWidth required sx={{ minWidth: 154 }} />
                  </TableCell>
                  <TableCell sx={{ width: 120, minWidth: 120 }}>
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




