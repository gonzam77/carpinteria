import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import { Button, Chip, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Material } from "../types";

const emptyForm = {
  nombre: "",
  valor: "",
  espesorMm: "18",
  anchoPlaca: "",
  altoPlaca: ""
};

export function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

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
      nombre: material.nombre,
      valor: String(material.valor),
      espesorMm: String(material.espesorMm),
      anchoPlaca: String(material.anchoPlaca),
      altoPlaca: String(material.altoPlaca)
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      nombre: form.nombre,
      valor: Number(form.valor),
      espesorMm: Number(form.espesorMm),
      anchoPlaca: Number(form.anchoPlaca),
      altoPlaca: Number(form.altoPlaca),
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

  const columns = useMemo<GridColDef<Material>[]>(
    () => [
      { field: "nombre", headerName: "Material", flex: 1, minWidth: 180 },
      { field: "valor", headerName: "Valor", width: 130, valueFormatter: (value) => Number(value).toLocaleString() },
      { field: "espesorMm", headerName: "Espesor", width: 110, valueFormatter: (value) => `${value} mm` },
      { field: "anchoPlaca", headerName: "Ancho placa cm", width: 150 },
      { field: "altoPlaca", headerName: "Alto placa cm", width: 140 },
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

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Materiales</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack component="form" onSubmit={submit} direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField label="Material" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
          <TextField label="Valor" type="number" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required />
          <TextField label="Espesor mm" type="number" value={form.espesorMm} onChange={(event) => setForm({ ...form, espesorMm: event.target.value })} required />
          <TextField label="Ancho placa cm" type="number" value={form.anchoPlaca} onChange={(event) => setForm({ ...form, anchoPlaca: event.target.value })} required />
          <TextField label="Alto placa cm" type="number" value={form.altoPlaca} onChange={(event) => setForm({ ...form, altoPlaca: event.target.value })} required />
          <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
            {editingId ? "Guardar" : "Crear"}
          </Button>
          {editingId && (
            <Button type="button" variant="outlined" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </Stack>
      </Paper>
      <Paper sx={{ height: 520 }}>
        <DataGrid rows={materials} columns={columns} disableRowSelectionOnClick />
      </Paper>
    </Stack>
  );
}
