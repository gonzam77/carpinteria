import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import RestoreFromTrashIcon from "@mui/icons-material/RestoreFromTrash";
import SaveIcon from "@mui/icons-material/Save";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ViewListIcon from "@mui/icons-material/ViewList";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  TextField,
  Typography
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import axios from "axios";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Material, MaterialType } from "../types";

type MaterialForm = {
  tipo: MaterialType;
  nombre: string;
  placaMaterialId: string;
  valor: string;
  espesorMm: string;
  anchoPlaca: string;
  altoPlaca: string;
  stockPlacas: string;
};

type BulkValueForm = {
  percentage: string;
  selectedIds: string[];
};

type MaterialDeleteMode = "deactivate" | "permanent";

type MaterialDeleteDialogState = {
  material: Material;
  mode: MaterialDeleteMode;
} | null;

const emptyForm: MaterialForm = {
  tipo: "PLACA",
  nombre: "",
  placaMaterialId: "",
  valor: "",
  espesorMm: "18",
  anchoPlaca: "",
  altoPlaca: "",
  stockPlacas: "0"
};

const emptyBulkForm: BulkValueForm = {
  percentage: "",
  selectedIds: []
};

function resolveErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? fallback;
  }

  return fallback;
}

export function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MaterialForm>(emptyForm);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkValueForm>(emptyBulkForm);
  const [feedback, setFeedback] = useState("");
  const [feedbackSeverity, setFeedbackSeverity] = useState<"success" | "error">("success");
  const [view, setView] = useState<"activos" | "historial">("activos");
  const [deleteDialog, setDeleteDialog] = useState<MaterialDeleteDialogState>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadMaterials = useCallback(async () => {
    const response = await api.get<Material[]>("/materiales", { params: { incluirInactivos: true } });
    setMaterials(response.data);
  }, []);

  useEffect(() => {
    void loadMaterials();

    const refreshMaterials = () => {
      if (document.visibilityState === "visible") void loadMaterials();
    };

    window.addEventListener("focus", refreshMaterials);
    document.addEventListener("visibilitychange", refreshMaterials);

    return () => {
      window.removeEventListener("focus", refreshMaterials);
      document.removeEventListener("visibilitychange", refreshMaterials);
    };
  }, [loadMaterials]);

  function editMaterial(material: Material) {
    setFeedback("");
    setEditingId(material.id);
    setForm({
      tipo: material.tipo,
      nombre: material.nombre,
      placaMaterialId: material.placaMaterialId ?? "",
      valor: String(material.valor),
      espesorMm: String(material.espesorMm),
      anchoPlaca: material.anchoPlaca ? String(material.anchoPlaca) : "",
      altoPlaca: material.altoPlaca ? String(material.altoPlaca) : "",
      stockPlacas: material.stockPlacas != null ? String(material.stockPlacas) : "0"
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFeedback("");
  }

  function closeBulkDialog() {
    setBulkDialogOpen(false);
    setBulkForm(emptyBulkForm);
  }

  function toggleBulkMaterial(id: string) {
    setBulkForm((current) => ({
      ...current,
      selectedIds: current.selectedIds.includes(id) ? current.selectedIds.filter((item) => item !== id) : [...current.selectedIds, id]
    }));
  }

  function toggleSelectAllBulkMaterials() {
    setBulkForm((current) => ({
      ...current,
      selectedIds: current.selectedIds.length === activeMaterials.length ? [] : activeMaterials.map((material) => material.id)
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const payload =
      form.tipo === "PLACA"
        ? {
            tipo: form.tipo,
            nombre: form.nombre,
            valor: Number(form.valor),
            espesorMm: Number(form.espesorMm),
            anchoPlaca: Number(form.anchoPlaca),
            altoPlaca: Number(form.altoPlaca),
            stockPlacas: Number(form.stockPlacas),
            activo: true
          }
        : {
            tipo: form.tipo,
            placaMaterialId: form.placaMaterialId,
            valor: Number(form.valor),
            espesorMm: Number(form.espesorMm),
            activo: true
          };

    try {
      const successMessage = editingId ? "Material actualizado correctamente." : "Material creado correctamente.";
      if (editingId) {
        await api.put(`/materiales/${editingId}`, payload);
      } else {
        await api.post("/materiales", payload);
      }

      resetForm();
      setFeedbackSeverity("success");
      setFeedback(successMessage);
      await loadMaterials();
    } catch (error) {
      setFeedbackSeverity("error");
      setFeedback(resolveErrorMessage(error, "No se pudo guardar el material."));
    }
  }

  async function submitBulkValueUpdate() {
    try {
      await api.post("/materiales/adjust-values", {
        materialIds: bulkForm.selectedIds,
        percentage: Number(bulkForm.percentage)
      });
      closeBulkDialog();
      setFeedbackSeverity("success");
      setFeedback("Valores actualizados correctamente.");
      await loadMaterials();
    } catch (error) {
      setFeedbackSeverity("error");
      setFeedback(resolveErrorMessage(error, "No se pudieron actualizar los valores."));
    }
  }

  async function deactivateMaterial(material: Material) {
    try {
      await api.delete(`/materiales/${material.id}`);
      if (editingId === material.id) resetForm();
      setFeedbackSeverity("success");
      setFeedback("Material movido al historial correctamente.");
      await loadMaterials();
    } catch (error) {
      setFeedbackSeverity("error");
      setFeedback(resolveErrorMessage(error, "No se pudo desactivar el material."));
    }
  }

  async function reactivateMaterial(material: Material) {
    try {
      await api.patch(`/materiales/${material.id}/active`, { activo: true });
      setFeedbackSeverity("success");
      setFeedback("Material reactivado correctamente.");
      await loadMaterials();
    } catch (error) {
      setFeedbackSeverity("error");
      setFeedback(resolveErrorMessage(error, "No se pudo reactivar el material."));
    }
  }

  async function deleteMaterialPermanently(material: Material) {
    try {
      await api.delete(`/materiales/${material.id}/permanent`);
      if (editingId === material.id) resetForm();
      setFeedbackSeverity("success");
      setFeedback("Material eliminado definitivamente.");
      await loadMaterials();
    } catch (error) {
      setFeedbackSeverity("error");
      setFeedback(resolveErrorMessage(error, "No se pudo eliminar definitivamente el material."));
    }
  }

  async function confirmDeleteMaterial() {
    if (!deleteDialog) return;

    setDeleteLoading(true);
    try {
      if (deleteDialog.mode === "deactivate") {
        await deactivateMaterial(deleteDialog.material);
      } else {
        await deleteMaterialPermanently(deleteDialog.material);
      }
      setDeleteDialog(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  function buildActionColumn(isHistoryView: boolean): GridColDef<Material> {
    return {
      field: "acciones",
      headerName: "",
      width: isHistoryView ? 180 : 220,
      sortable: false,
      renderCell: ({ row }) => (
        <>
          {!isHistoryView ? (
            <Tooltip title="Editar">
              <IconButton onClick={() => editMaterial(row)}>
                <EditIcon />
              </IconButton>
            </Tooltip>
          ) : null}
          {isHistoryView ? (
            <Tooltip title="Reactivar">
              <IconButton color="primary" onClick={() => reactivateMaterial(row)}>
                <RestoreFromTrashIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Quitar del listado">
              <IconButton color="warning" onClick={() => setDeleteDialog({ material: row, mode: "deactivate" })}>
                <HistoryIcon />
              </IconButton>
            </Tooltip>
          )}
          {row.canDeletePermanently ? (
            <Tooltip title="Eliminar definitivamente">
              <IconButton color="error" onClick={() => setDeleteDialog({ material: row, mode: "permanent" })}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="No se puede eliminar definitivamente porque esta vinculado a solicitudes o cantos">
              <span>
                <IconButton color="error" disabled>
                  <DeleteIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </>
      )
    };
  }

  const activePlacaColumns = useMemo<GridColDef<Material>[]>(
    () => [
      { field: "nombre", headerName: "Material", flex: 1, minWidth: 180 },
      { field: "valor", headerName: "Valor", width: 130, valueFormatter: (value) => Number(value).toLocaleString() },
      { field: "espesorMm", headerName: "Espesor", width: 110, valueFormatter: (value) => `${value} mm` },
      { field: "altoPlaca", headerName: "Largo placa mm", width: 150 },
      { field: "anchoPlaca", headerName: "Ancho placa mm", width: 150 },
      { field: "stockPlacas", headerName: "Stock placas", width: 130, valueGetter: (_value, row) => row.stockPlacas ?? 0 },
      { field: "linkedOrdersCount", headerName: "Solicitudes", width: 120, valueGetter: (_value, row) => row.linkedOrdersCount ?? 0 },
      buildActionColumn(false)
    ],
    []
  );

  const activeCantoColumns = useMemo<GridColDef<Material>[]>(
    () => [
      { field: "placaMaterial", headerName: "Material", flex: 1, minWidth: 190, valueGetter: (_value, row) => row.placaMaterial?.nombre ?? row.nombre },
      { field: "espesorMm", headerName: "Espesor", width: 110, valueFormatter: (value) => `${value} mm` },
      { field: "valor", headerName: "Valor por metro", width: 150, valueFormatter: (value) => Number(value).toLocaleString() },
      { field: "linkedOrdersCount", headerName: "Solicitudes", width: 120, valueGetter: (_value, row) => row.linkedOrdersCount ?? 0 },
      buildActionColumn(false)
    ],
    []
  );

  const historyPlacaColumns = useMemo<GridColDef<Material>[]>(
    () => [
      { field: "nombre", headerName: "Material", flex: 1, minWidth: 180 },
      { field: "valor", headerName: "Valor", width: 130, valueFormatter: (value) => Number(value).toLocaleString() },
      { field: "espesorMm", headerName: "Espesor", width: 110, valueFormatter: (value) => `${value} mm` },
      { field: "linkedOrdersCount", headerName: "Solicitudes", width: 120, valueGetter: (_value, row) => row.linkedOrdersCount ?? 0 },
      { field: "fechaActualizacion", headerName: "Ult. cambio", width: 130, valueGetter: (_value, row) => (row.fechaActualizacion ? new Date(row.fechaActualizacion).toLocaleDateString() : "-") },
      buildActionColumn(true)
    ],
    []
  );

  const historyCantoColumns = useMemo<GridColDef<Material>[]>(
    () => [
      { field: "placaMaterial", headerName: "Material", flex: 1, minWidth: 190, valueGetter: (_value, row) => row.placaMaterial?.nombre ?? row.nombre },
      { field: "espesorMm", headerName: "Espesor", width: 110, valueFormatter: (value) => `${value} mm` },
      { field: "valor", headerName: "Valor por metro", width: 150, valueFormatter: (value) => Number(value).toLocaleString() },
      { field: "linkedOrdersCount", headerName: "Solicitudes", width: 120, valueGetter: (_value, row) => row.linkedOrdersCount ?? 0 },
      { field: "fechaActualizacion", headerName: "Ult. cambio", width: 130, valueGetter: (_value, row) => (row.fechaActualizacion ? new Date(row.fechaActualizacion).toLocaleDateString() : "-") },
      buildActionColumn(true)
    ],
    []
  );

  const activeMaterials = materials.filter((material) => material.activo);
  const inactiveMaterials = materials.filter((material) => !material.activo);
  const placas = activeMaterials.filter((material) => material.tipo === "PLACA");
  const cantos = activeMaterials.filter((material) => material.tipo === "CANTO");
  const historialPlacas = inactiveMaterials.filter((material) => material.tipo === "PLACA");
  const historialCantos = inactiveMaterials.filter((material) => material.tipo === "CANTO");
  const allSelected = activeMaterials.length > 0 && bulkForm.selectedIds.length === activeMaterials.length;
  const canSubmitBulkUpdate = bulkForm.selectedIds.length > 0 && bulkForm.percentage !== "" && !Number.isNaN(Number(bulkForm.percentage)) && Number(bulkForm.percentage) > -100;

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Materiales</Typography>
        <Typography color="text.secondary">Administra placas y cantos activos. La mano de obra de cantos y de corte ahora se define desde Configuracion de presupuesto.</Typography>
      </Stack>
      {feedback && (
        <Alert severity={feedbackSeverity} onClose={() => setFeedback("")}>
          {feedback}
        </Alert>
      )}
      <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "8px", overflow: "hidden" }}>
        <Stack
          component="form"
          onSubmit={submit}
          direction={{ xs: "column", lg: "row" }}
          spacing={2}
          useFlexGap
          sx={{
            alignItems: { lg: "center" },
            flexWrap: "wrap",
            "& .MuiTextField-root": { flex: { lg: "1 1 150px" }, minWidth: { lg: 150 } }
          }}
        >
          <TextField
            select
            fullWidth
            label="Tipo"
            value={form.tipo}
            onChange={(event) => {
              const nextType = event.target.value as MaterialType;
              setForm({ ...emptyForm, tipo: nextType, espesorMm: nextType === "PLACA" ? "18" : "" });
            }}
            sx={{ maxWidth: { lg: 180 } }}
          >
            <MenuItem value="PLACA">Placa</MenuItem>
            <MenuItem value="CANTO">Canto</MenuItem>
          </TextField>
          {form.tipo === "PLACA" ? (
            <TextField fullWidth label="Nombre del material" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required sx={{ flex: { lg: "2 1 220px" } }} />
          ) : (
            <TextField select fullWidth label="Material de placa" value={form.placaMaterialId} onChange={(event) => setForm({ ...form, placaMaterialId: event.target.value })} required sx={{ flex: { lg: "2 1 220px" } }}>
              {placas.map((material) => (
                <MenuItem key={material.id} value={material.id}>
                  {material.nombre} {material.espesorMm}mm
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            fullWidth
            label="Espesor mm"
            type="number"
            value={form.espesorMm}
            onChange={(event) => setForm({ ...form, espesorMm: event.target.value })}
            inputProps={{ step: "0.01", min: 0 }}
            required
          />
          <TextField fullWidth label={form.tipo === "PLACA" ? "Valor placa" : "Valor material por metro"} type="number" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required />
          {form.tipo === "PLACA" ? (
            <>
              <TextField fullWidth label="Largo placa mm" type="number" value={form.altoPlaca} onChange={(event) => setForm({ ...form, altoPlaca: event.target.value })} required />
              <TextField fullWidth label="Ancho placa mm" type="number" value={form.anchoPlaca} onChange={(event) => setForm({ ...form, anchoPlaca: event.target.value })} required />
              <TextField fullWidth label="Stock placas" type="number" value={form.stockPlacas} onChange={(event) => setForm({ ...form, stockPlacas: event.target.value })} inputProps={{ min: 0, step: 1 }} required />
            </>
          ) : null}
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
            {editingId ? "Guardar" : "Crear"}
          </Button>
          <Button type="button" variant="outlined" startIcon={<TrendingUpIcon />} onClick={() => setBulkDialogOpen(true)} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
            Actualizar Valor
          </Button>
          {editingId && (
            <Button type="button" variant="outlined" onClick={resetForm} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
              Cancelar
            </Button>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ borderRadius: "8px", overflow: "hidden" }}>
        <Tabs value={view} onChange={(_event, nextValue) => setView(nextValue)} sx={{ px: 2, pt: 1 }}>
          <Tab value="activos" icon={<ViewListIcon />} iconPosition="start" label={`Materiales activos (${activeMaterials.length})`} />
          <Tab value="historial" icon={<HistoryIcon />} iconPosition="start" label={`Historial de materiales (${inactiveMaterials.length})`} />
        </Tabs>
      </Paper>

      {view === "activos" ? (
        <Stack spacing={2}>
          <Paper sx={{ p: 2, borderRadius: "8px", overflow: "hidden" }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Placas activas
            </Typography>
            <Paper sx={{ height: 360, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
              <DataGrid rows={placas} columns={activePlacaColumns} disableRowSelectionOnClick sx={{ minWidth: { xs: 1020, md: "100%" } }} />
            </Paper>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: "8px", overflow: "hidden" }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Cantos activos
            </Typography>
            <Paper sx={{ height: 360, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
              <DataGrid rows={cantos} columns={activeCantoColumns} disableRowSelectionOnClick sx={{ minWidth: { xs: 960, md: "100%" } }} />
            </Paper>
          </Paper>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Paper sx={{ p: 2, borderRadius: "8px", overflow: "hidden" }}>
            <Typography variant="h6" sx={{ mb: 0.75 }}>
              Historial de placas
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>
              Estos materiales ya no aparecen al cargar nuevas solicitudes, pero siguen preservados para mantener consistencia historica.
            </Typography>
            <Paper sx={{ height: 360, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
              <DataGrid rows={historialPlacas} columns={historyPlacaColumns} disableRowSelectionOnClick sx={{ minWidth: { xs: 920, md: "100%" } }} />
            </Paper>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: "8px", overflow: "hidden" }}>
            <Typography variant="h6" sx={{ mb: 0.75 }}>
              Historial de cantos
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>
              Puedes reactivar un material cuando vuelva a usarse o eliminarlo definitivamente solo si nunca quedo vinculado a solicitudes.
            </Typography>
            <Paper sx={{ height: 360, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
              <DataGrid rows={historialCantos} columns={historyCantoColumns} disableRowSelectionOnClick sx={{ minWidth: { xs: 960, md: "100%" } }} />
            </Paper>
          </Paper>
        </Stack>
      )}

      <Dialog open={bulkDialogOpen} onClose={closeBulkDialog} fullWidth maxWidth="sm">
        <DialogTitle>Actualizar valor de materiales</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Typography color="text.secondary">
              Selecciona los materiales activos a afectar e indica el porcentaje que quieres aumentar o disminuir sobre el valor actual.
            </Typography>
            <FormControlLabel
              control={<Checkbox checked={allSelected} indeterminate={bulkForm.selectedIds.length > 0 && !allSelected} onChange={toggleSelectAllBulkMaterials} />}
              label="Seleccionar todos"
            />
            <Paper variant="outlined" sx={{ maxHeight: 320, overflowY: "auto", borderRadius: "10px" }}>
              <List disablePadding>
                {activeMaterials.map((material, index) => (
                  <ListItemButton key={material.id} divider={index < activeMaterials.length - 1} onClick={() => toggleBulkMaterial(material.id)}>
                    <Checkbox edge="start" checked={bulkForm.selectedIds.includes(material.id)} tabIndex={-1} disableRipple />
                    <ListItemText
                      primary={material.nombre}
                      secondary={`${material.tipo === "PLACA" ? "Placa" : "Canto"} - Valor actual: ${Number(material.valor).toLocaleString("es-AR")} - Solicitudes vinculadas: ${material.linkedOrdersCount ?? 0}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
            <TextField
              fullWidth
              label="Porcentaje"
              type="number"
              value={bulkForm.percentage}
              onChange={(event) => setBulkForm((current) => ({ ...current, percentage: event.target.value }))}
              inputProps={{ step: "0.01" }}
              helperText="Usa valores positivos para aumentar y negativos para disminuir. Ejemplo: 10 o -5."
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBulkDialog}>Cancelar</Button>
          <Button variant="contained" onClick={submitBulkValueUpdate} disabled={!canSubmitBulkUpdate}>
            Aplicar ajuste
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(deleteDialog)} onClose={deleteLoading ? undefined : () => setDeleteDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>{deleteDialog?.mode === "permanent" ? "Eliminar material definitivamente" : "Quitar material del listado"}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <DialogContentText>
              {deleteDialog?.mode === "permanent"
                ? `Vas a eliminar definitivamente "${deleteDialog.material.nombre}".`
                : `Vas a quitar "${deleteDialog?.material.nombre}" del listado de materiales activos.`}
            </DialogContentText>
            {deleteDialog?.mode === "permanent" ? (
              <Alert severity="warning" variant="outlined">
                Esta accion no se puede deshacer. Solo elimina el material si estas seguro de que ya no debe existir en el sistema.
              </Alert>
            ) : (
              <Alert severity="info" variant="outlined">
                El material pasara al historial y podras reactivarlo mas adelante si vuelve a usarse.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)} disabled={deleteLoading}>
            Cancelar
          </Button>
          <Button variant="contained" color={deleteDialog?.mode === "permanent" ? "error" : "warning"} onClick={confirmDeleteMaterial} disabled={deleteLoading}>
            {deleteLoading ? "Procesando..." : deleteDialog?.mode === "permanent" ? "Si, eliminar" : "Si, quitar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
