import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import { Button, Chip, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
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

export function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MaterialForm>(emptyForm);

  async function loadMaterials() {
    const response = await api.get<Material[]>("/materiales", { params: { incluirInactivos: true } });
    setMaterials(response.data);
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  function editMaterial(material: Material) {
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
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
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

    if (editingId) {
      await api.put(`/materiales/${editingId}`, payload);
    } else {
      await api.post("/materiales", payload);
    }

    resetForm();
    loadMaterials();
  }

  async function disableMaterial(id: string) {
    await api.delete(`/materiales/${id}`);
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
            <Tooltip title="Desactivar">
              <span>
                <IconButton disabled={!row.activo} onClick={() => disableMaterial(row.id)}>
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
            <Tooltip title="Desactivar">
              <span>
                <IconButton disabled={!row.activo} onClick={() => disableMaterial(row.id)}>
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

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Materiales</Typography>
        <Typography color="text.secondary">Administra placas y cantos con sus datos segun el tipo de material.</Typography>
      </Stack>
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
    </Stack>
  );
}
