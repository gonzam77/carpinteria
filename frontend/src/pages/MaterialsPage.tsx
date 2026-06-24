import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Material, MaterialType } from "../types";

type MaterialForm = {
  tipo: MaterialType;
  nombre: string;
  valor: string;
  espesorMm: string;
  anchoPlaca: string;
  altoPlaca: string;
  colorCanto: string;
  stockPlacas: string;
};

type BulkValueForm = {
  percentage: string;
  selectedIds: string[];
};

const emptyForm: MaterialForm = {
  tipo: "PLACA",
  nombre: "",
  valor: "",
  espesorMm: "18",
  anchoPlaca: "",
  altoPlaca: "",
  colorCanto: "",
  stockPlacas: "0"
};

const emptyBulkForm: BulkValueForm = {
  percentage: "",
  selectedIds: []
};

export function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MaterialForm>(emptyForm);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkValueForm>(emptyBulkForm);
  const [feedback, setFeedback] = useState("");
  const [feedbackSeverity, setFeedbackSeverity] = useState<"success" | "error">("success");

  async function loadMaterials() {
    const response = await api.get<Material[]>("/materiales", { params: { incluirInactivos: true } });
    setMaterials(response.data);
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  function editMaterial(material: Material) {
    setFeedback("");
    setEditingId(material.id);
    setForm({
      tipo: material.tipo,
      nombre: material.nombre,
      valor: String(material.valor),
      espesorMm: String(material.espesorMm),
      anchoPlaca: material.anchoPlaca ? String(material.anchoPlaca) : "",
      altoPlaca: material.altoPlaca ? String(material.altoPlaca) : "",
      colorCanto: material.colorCanto ?? "",
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
      selectedIds: current.selectedIds.length === materials.length ? [] : materials.map((material) => material.id)
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
            nombre: form.nombre,
            colorCanto: form.colorCanto,
            valor: Number(form.valor),
            espesorMm: Number(form.espesorMm),
            activo: true
          };

    try {
      if (editingId) {
        await api.put(`/materiales/${editingId}`, payload);
        setFeedbackSeverity("success");
        setFeedback("Material actualizado correctamente.");
      } else {
        await api.post("/materiales", payload);
        setFeedbackSeverity("success");
        setFeedback("Material creado correctamente.");
      }

      resetForm();
      loadMaterials();
    } catch (error) {
      setFeedbackSeverity("error");
      if (axios.isAxiosError<{ message?: string }>(error)) {
        setFeedback(error.response?.data?.message ?? "No se pudo guardar el material.");
        return;
      }

      setFeedback("No se pudo guardar el material.");
    }
  }

  async function submitBulkValueUpdate() {
    await api.post("/materiales/adjust-values", {
      materialIds: bulkForm.selectedIds,
      percentage: Number(bulkForm.percentage)
    });
    closeBulkDialog();
    setFeedbackSeverity("success");
    setFeedback("Valores actualizados correctamente.");
    loadMaterials();
  }

  async function deleteMaterial(id: string) {
    const confirmed = window.confirm("Seguro que queres eliminar este material de forma definitiva?");
    if (!confirmed) return;

    await api.delete(`/materiales/${id}`);
    setFeedbackSeverity("success");
    setFeedback("Material eliminado correctamente.");
    loadMaterials();
  }

  const placaColumns = useMemo<GridColDef<Material>[]>(
    () => [
      { field: "nombre", headerName: "Material", flex: 1, minWidth: 180 },
      { field: "valor", headerName: "Valor", width: 130, valueFormatter: (value) => Number(value).toLocaleString() },
      { field: "espesorMm", headerName: "Espesor", width: 110, valueFormatter: (value) => `${value} mm` },
      { field: "altoPlaca", headerName: "Largo placa mm", width: 150 },
      { field: "anchoPlaca", headerName: "Ancho placa mm", width: 150 },
      { field: "stockPlacas", headerName: "Stock placas", width: 130, valueGetter: (_value, row) => row.stockPlacas ?? 0 },
      { field: "activo", headerName: "Estado", width: 120, renderCell: ({ value }) => <Chip size="small" label={value ? "Activo" : "Inactivo"} color={value ? "success" : "default"} /> },
      {
        field: "acciones",
        headerName: "",
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <>
            <Tooltip title="Editar">
              <IconButton onClick={() => editMaterial(row)}>
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Eliminar definitivamente">
              <span>
                <IconButton onClick={() => deleteMaterial(row.id)}>
                  <DeleteIcon />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )
      }
    ],
    []
  );

  const cantoColumns = useMemo<GridColDef<Material>[]>(
    () => [
      { field: "nombre", headerName: "Canto", flex: 1, minWidth: 180 },
      { field: "colorCanto", headerName: "Color", flex: 1, minWidth: 160, valueGetter: (_value, row) => row.colorCanto ?? "-" },
      { field: "espesorMm", headerName: "Espesor", width: 110, valueFormatter: (value) => `${value} mm` },
      { field: "valor", headerName: "Valor por metro", width: 150, valueFormatter: (value) => Number(value).toLocaleString() },
      { field: "activo", headerName: "Estado", width: 120, renderCell: ({ value }) => <Chip size="small" label={value ? "Activo" : "Inactivo"} color={value ? "success" : "default"} /> },
      {
        field: "acciones",
        headerName: "",
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <>
            <Tooltip title="Editar">
              <IconButton onClick={() => editMaterial(row)}>
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Eliminar definitivamente">
              <span>
                <IconButton onClick={() => deleteMaterial(row.id)}>
                  <DeleteIcon />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )
      }
    ],
    []
  );

  const placas = materials.filter((material) => material.tipo === "PLACA");
  const cantos = materials.filter((material) => material.tipo === "CANTO");
  const allSelected = materials.length > 0 && bulkForm.selectedIds.length === materials.length;
  const canSubmitBulkUpdate = bulkForm.selectedIds.length > 0 && bulkForm.percentage !== "" && !Number.isNaN(Number(bulkForm.percentage)) && Number(bulkForm.percentage) > -100;

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Materiales</Typography>
        <Typography color="text.secondary">Administra placas y cantos con sus datos segun el tipo de material.</Typography>
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
          <TextField select fullWidth label="Tipo" value={form.tipo} onChange={(event) => setForm({ ...emptyForm, tipo: event.target.value as MaterialType })} sx={{ maxWidth: { lg: 180 } }}>
            <MenuItem value="PLACA">Placa</MenuItem>
            <MenuItem value="CANTO">Canto</MenuItem>
          </TextField>
          <TextField
            fullWidth
            label={form.tipo === "PLACA" ? "Nombre del material" : "Nombre del canto"}
            value={form.nombre}
            onChange={(event) => setForm({ ...form, nombre: event.target.value })}
            required
            sx={{ flex: { lg: "2 1 220px" } }}
          />
          <TextField fullWidth label="Valor" type="number" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required />
          <TextField
            fullWidth
            label="Espesor mm"
            type="number"
            value={form.espesorMm}
            onChange={(event) => setForm({ ...form, espesorMm: event.target.value })}
            inputProps={{ step: "0.01", min: 0 }}
            required
          />
          {form.tipo === "PLACA" ? (
            <>
              <TextField fullWidth label="Largo placa mm" type="number" value={form.altoPlaca} onChange={(event) => setForm({ ...form, altoPlaca: event.target.value })} required />
              <TextField fullWidth label="Ancho placa mm" type="number" value={form.anchoPlaca} onChange={(event) => setForm({ ...form, anchoPlaca: event.target.value })} required />
              <TextField fullWidth label="Stock placas" type="number" value={form.stockPlacas} onChange={(event) => setForm({ ...form, stockPlacas: event.target.value })} inputProps={{ min: 0, step: 1 }} required />
            </>
          ) : (
            <TextField fullWidth label="Color" value={form.colorCanto} onChange={(event) => setForm({ ...form, colorCanto: event.target.value })} required />
          )}
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
      <Stack spacing={2}>
        <Paper sx={{ p: 2, borderRadius: "8px", overflow: "hidden" }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Placas
          </Typography>
          <Paper sx={{ height: 360, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
            <DataGrid rows={placas} columns={placaColumns} disableRowSelectionOnClick sx={{ minWidth: { xs: 900, md: "100%" } }} />
          </Paper>
        </Paper>
        <Paper sx={{ p: 2, borderRadius: "8px", overflow: "hidden" }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Cantos
          </Typography>
          <Paper sx={{ height: 360, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
            <DataGrid rows={cantos} columns={cantoColumns} disableRowSelectionOnClick sx={{ minWidth: { xs: 760, md: "100%" } }} />
          </Paper>
        </Paper>
      </Stack>

      <Dialog open={bulkDialogOpen} onClose={closeBulkDialog} fullWidth maxWidth="sm">
        <DialogTitle>Actualizar valor de materiales</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Typography color="text.secondary">
              Selecciona los materiales a afectar e indica el porcentaje que quieres aumentar o disminuir sobre el valor actual.
            </Typography>
            <FormControlLabel
              control={<Checkbox checked={allSelected} indeterminate={bulkForm.selectedIds.length > 0 && !allSelected} onChange={toggleSelectAllBulkMaterials} />}
              label="Seleccionar todos"
            />
            <Paper variant="outlined" sx={{ maxHeight: 320, overflowY: "auto", borderRadius: "10px" }}>
              <List disablePadding>
                {materials.map((material, index) => (
                  <ListItemButton key={material.id} divider={index < materials.length - 1} onClick={() => toggleBulkMaterial(material.id)}>
                    <Checkbox edge="start" checked={bulkForm.selectedIds.includes(material.id)} tabIndex={-1} disableRipple />
                    <ListItemText
                      primary={material.nombre}
                      secondary={`${material.tipo === "PLACA" ? "Placa" : "Canto"} - Valor actual: ${Number(material.valor).toLocaleString("es-AR")}${material.tipo === "CANTO" ? " por metro" : ""}${material.activo ? "" : " - Inactivo"}`}
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
    </Stack>
  );
}

