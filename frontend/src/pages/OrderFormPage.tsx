import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import { Alert, Box, Button, Divider, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { createEmptyDetail, OrderItemsTable } from "../components/OrderItemsTable";
import { useAuth } from "../context/AuthContext";
import { Material, Order, OrderDetail } from "../types";
import { CutOptimizer } from "../components/CutOptimizer";

function resolveMaterialId(row: OrderDetail, materials: Material[]) {
  return row.materialId || materials.find((material) => material.tipo === "PLACA" && material.nombre === row.material)?.id || "";
}

function validateRows(rows: OrderDetail[], materials: Material[]) {
  for (const row of rows) {
    if (!resolveMaterialId(row, materials) || !row.largo || !row.ancho || !row.cantidad) return "Complete material, largo, ancho y cantidad de cada pieza.";
    if (Number.isNaN(Number(row.largo)) || Number.isNaN(Number(row.ancho))) return "Largo y ancho deben ser numericos.";
    if (Number(row.cantidad) <= 0) return "La cantidad debe ser mayor a cero.";
  }
  return "";
}

function fillClientFields(rows: OrderDetail[], numeroCliente: string, nombreCliente: string) {
  return rows.map((row) => ({
    ...row,
    numeroCliente: row.numeroCliente || numeroCliente,
    nombreCliente: row.nombreCliente || nombreCliente
  }));
}

export function OrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [cliente, setCliente] = useState(`${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim());
  const [telefono, setTelefono] = useState(user?.telefono ?? "");
  const [observaciones, setObservaciones] = useState("");
  const [rows, setRows] = useState<OrderDetail[]>([createEmptyDetail()]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? (id ? `/pedidos/${id}` : user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes");

  useEffect(() => {
    setCliente((currentCliente) => currentCliente || `${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim());
    setTelefono(user?.telefono ?? "");
  }, [user]);

  useEffect(() => {
    api.get<Material[]>("/materiales").then((response) => setMaterials(response.data));
  }, []);

  useEffect(() => {
    if (!id) return;
    api.get<Order>(`/orders/${id}`).then((response) => {
      setCliente(response.data.cliente);
      setTelefono(response.data.numeroContacto ?? user?.telefono ?? "");
      setObservaciones(response.data.observaciones ?? "");
      setRows(response.data.detalles);
    });
  }, [id, user]);

  async function nextStep() {
    setError("");
    if (step === 0) {
      if (!cliente || !telefono) {
        setError("Complete cliente y telefono de contacto.");
        return;
      }
      setRows((currentRows) => fillClientFields(currentRows, telefono, cliente));
    }
    if (step === 1) {
      const rowError = validateRows(rows, materials);
      if (rowError) {
        setError(rowError);
        return;
      }
    }
    setStep((current) => current + 1);
  }



  function updateRows(nextRows: OrderDetail[]) {
    setRows(nextRows);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const rowError = validateRows(rows, materials);
    if (rowError) {
      setError(rowError);
      return;
    }

    const payload = {
      cliente,
      numeroContacto: telefono,
      observaciones,
      detalles: rows.map((row) => ({
        ...row,
        materialId: resolveMaterialId(row, materials),
        codigoBarra: row.codigoBarra ?? "",
        largo: Number(row.largo),
        ancho: Number(row.ancho),
        cantidad: Number(row.cantidad)
      }))
    };

    const response = id ? await api.put(`/orders/${id}`, payload) : await api.post("/orders", payload);
    navigate(user?.rol === "ADMIN" ? `/pedidos/${response.data.id}` : "/mis-solicitudes", {
      state: { notification: id ? "Solicitud de corte actualizada correctamente." : "Solicitud de corte enviada correctamente." }
    });
  }

  return (
    <Stack spacing={3} component="form" onSubmit={handleSubmit}>
      <Stack spacing={0.5}>
        <Typography variant="h4">{id ? "Editar solicitud" : "Nueva solicitud de corte"}</Typography>
        <Typography color="text.secondary">Carga los datos del cliente, define las piezas y revisa el resumen antes de enviar.</Typography>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stepper
        activeStep={step}
        sx={{
          maxWidth: 760,
          overflowX: "auto",
          pb: 0.5,
          width: "100%",
          "& .MuiStepLabel-label": { fontSize: { xs: 12, sm: 14 } }
        }}
      >
        {["Datos", "Cortes", "Resumen"].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {step === 0 && (
        <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "8px" }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Cliente" value={cliente} onChange={(event) => setCliente(event.target.value)} required fullWidth />
              <TextField label="Telefono de contacto" value={telefono} onChange={(event) => setTelefono(event.target.value)} required fullWidth />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Observaciones" value={observaciones} onChange={(event) => setObservaciones(event.target.value)} fullWidth />
            </Stack>
          </Stack>
        </Paper>
      )}
      {step === 1 && (
        <Stack spacing={2}>
          <OrderItemsTable rows={rows} setRows={updateRows} materials={materials} defaultDetailValues={{ numeroCliente: telefono, nombreCliente: cliente }} />
          <Paper sx={{ p: 2, borderRadius: "8px" }}>
            <CutOptimizer
              rows={rows}
              materials={materials}
            />
          </Paper>
        </Stack>
      )}
      {step === 2 && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: "8px", overflow: "hidden" }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">Datos de contacto</Typography>
              <Typography>{cliente} - {telefono}</Typography>
            </Box>
            <Box>
              <Typography variant="h6">Cortes solicitados</Typography>
              <Typography>
                {rows.length} piezas cargadas, {rows.reduce((total, row) => total + Number(row.cantidad || 0), 0)} unidades en total
              </Typography>
            </Box>
            <Paper sx={{ p: 2, borderRadius: "8px" }}>
              <CutOptimizer
                rows={rows}
                materials={materials}
              />
            </Paper>
            {observaciones && <Typography color="text.secondary">{observaciones}</Typography>}
          </Stack>
        </Paper>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        {id && (
          <Button variant="outlined" startIcon={<CloseIcon />} onClick={() => navigate(returnTo)} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Cancelar
          </Button>
        )}
        {step > 0 && (
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep((current) => current - 1)} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Volver
          </Button>
        )}
        {step < 2 ? (
          <Button type="button" variant="contained" endIcon={<ArrowForwardIcon />} onClick={nextStep} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Enviar
          </Button>
        ) : (
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Enviando...
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
