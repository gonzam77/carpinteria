import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { Alert, Box, Button, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { createEmptyDetail, OrderItemsTable } from "../components/OrderItemsTable";
import { useAuth } from "../context/AuthContext";
import { Order, OrderDetail } from "../types";

function validateRows(rows: OrderDetail[]) {
  for (const row of rows) {
    if (!row.material || !row.largo || !row.ancho || !row.cantidad) return "Complete material, largo, ancho y cantidad de cada pieza.";
    if (Number.isNaN(Number(row.largo)) || Number.isNaN(Number(row.ancho))) return "Largo y ancho deben ser numericos.";
    if (Number(row.cantidad) <= 0) return "La cantidad debe ser mayor a cero.";
  }
  return "";
}

export function OrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [cliente, setCliente] = useState("");
  const [nombre, setNombre] = useState(user?.nombre ?? "");
  const [apellido, setApellido] = useState(user?.apellido ?? "");
  const [telefono, setTelefono] = useState(user?.telefono ?? "");
  const [observaciones, setObservaciones] = useState("");
  const [rows, setRows] = useState<OrderDetail[]>([createEmptyDetail()]);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    setNombre(user?.nombre ?? "");
    setApellido(user?.apellido ?? "");
    setTelefono(user?.telefono ?? "");
  }, [user]);

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
      if (!nombre || !apellido || !telefono || !cliente) {
        setError("Complete sus datos personales, telefono de contacto y cliente.");
        return;
      }
      await updateProfile({ nombre, apellido, telefono });
    }
    if (step === 1) {
      const rowError = validateRows(rows);
      if (rowError) {
        setError(rowError);
        return;
      }
    }
    setStep((current) => current + 1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const rowError = validateRows(rows);
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
        codigoBarra: row.codigoBarra ?? "",
        largo: Number(row.largo),
        ancho: Number(row.ancho),
        cantidad: Number(row.cantidad)
      }))
    };

    const response = id ? await api.put(`/orders/${id}`, payload) : await api.post("/orders", payload);
    navigate(user?.rol === "ADMIN" ? `/pedidos/${response.data.id}` : "/mis-solicitudes");
  }

  return (
    <Stack spacing={3} component="form" onSubmit={handleSubmit}>
      <Typography variant="h4">{id ? "Editar solicitud" : "Nueva solicitud de corte"}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Stepper activeStep={step} sx={{ maxWidth: 760 }}>
        {["Datos", "Cortes", "Resumen"].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {step === 0 && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Nombre" value={nombre} onChange={(event) => setNombre(event.target.value)} required fullWidth />
              <TextField label="Apellido" value={apellido} onChange={(event) => setApellido(event.target.value)} required fullWidth />
              <TextField label="Telefono de contacto" value={telefono} onChange={(event) => setTelefono(event.target.value)} required fullWidth />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Cliente / obra" value={cliente} onChange={(event) => setCliente(event.target.value)} required fullWidth />
              <TextField label="Observaciones" value={observaciones} onChange={(event) => setObservaciones(event.target.value)} fullWidth />
            </Stack>
          </Stack>
        </Paper>
      )}
      {step === 1 && <OrderItemsTable rows={rows} setRows={setRows} />}
      {step === 2 && (
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">Datos de contacto</Typography>
              <Typography>{nombre} {apellido} - {telefono}</Typography>
              <Typography color="text.secondary">{cliente}</Typography>
            </Box>
            <Box>
              <Typography variant="h6">Cortes solicitados</Typography>
              <Typography>{rows.length} filas, {rows.reduce((total, row) => total + Number(row.cantidad || 0), 0)} piezas en total</Typography>
            </Box>
            {observaciones && <Typography color="text.secondary">{observaciones}</Typography>}
          </Stack>
        </Paper>
      )}
      <Stack direction="row" spacing={1}>
        {step > 0 && (
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep((current) => current - 1)}>
            Volver
          </Button>
        )}
        {step < 2 ? (
          <Button type="button" variant="contained" endIcon={<ArrowForwardIcon />} onClick={nextStep}>
            Continuar
          </Button>
        ) : (
          <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
            Enviar solicitud
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
