import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import { Alert, Box, Button, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import axios from "axios";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ensureSession } from "../api/session";
import { createEmptyDetail, OrderItemsTable } from "../components/OrderItemsTable";
import { OrderReceiptDialog } from "../components/OrderReceiptDialog";
import { useAuth } from "../context/AuthContext";
import { draftScope, useFormDraft } from "../hooks/useFormDraft";
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

type OrderDraft = {
  cliente: string;
  telefono: string;
  observaciones: string;
  rows: OrderDetail[];
  step: number;
};

/** Evita ofrecer la recuperacion de un formulario que estaba practicamente vacio. */
function hasContent(draft: OrderDraft) {
  return (
    !!draft.observaciones.trim() ||
    draft.rows.some((row) => row.materialId || row.material || row.largo || row.ancho)
  );
}

function describeAge(savedAt: number) {
  const minutes = Math.floor((Date.now() - savedAt) / 60000);
  if (minutes < 1) return "recien";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} dias`;
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
  const { user, updateProfile } = useAuth();
  const [cliente, setCliente] = useState(`${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim());
  const [telefono, setTelefono] = useState(user?.telefono ?? "");
  const [observaciones, setObservaciones] = useState("");
  const [rows, setRows] = useState<OrderDetail[]>([createEmptyDetail()]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef<AbortController | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? (id ? `/pedidos/${id}` : user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes");

  // En edicion hay que esperar a que llegue el pedido: si no, guardariamos como
  // borrador el formulario vacio de los primeros renders.
  const [formReady, setFormReady] = useState(!id);

  const snapshot = useMemo<OrderDraft>(
    () => ({ cliente, telefono, observaciones, rows, step }),
    [cliente, observaciones, rows, step, telefono]
  );

  // El paso del asistente queda afuera: moverse entre pasos no es una edicion.
  const contentKey = useMemo(
    () => JSON.stringify({ cliente, telefono, observaciones, rows }),
    [cliente, observaciones, rows, telefono]
  );

  // En edicion, lo que vino del servidor. Sin cambios encima no hay nada que
  // guardar, y asi no ofrecemos recuperar un borrador identico al pedido.
  const [baseline, setBaseline] = useState<string | null>(null);

  // La clave lleva el id del usuario: en una PC compartida el borrador de uno
  // no puede aparecerle al siguiente que entra.
  const scope = draftScope(user?.id);

  const { pendingDraft, draftSavedAt, restoreDraft, dismissDraft, clearDraft } = useFormDraft<OrderDraft>(
    scope ? `${scope}order:${id ?? "new"}` : null,
    snapshot,
    { ready: formReady, worthSaving: hasContent(snapshot) && contentKey !== baseline }
  );

  const recoverableDraft = pendingDraft && hasContent(pendingDraft) ? pendingDraft : null;

  function applyDraft() {
    const draft = restoreDraft();
    if (!draft) return;
    setCliente(draft.cliente);
    setTelefono(draft.telefono);
    setObservaciones(draft.observaciones);
    setRows(draft.rows);
    setStep(draft.step);
  }

  useEffect(() => {
    // Precarga, no sincronizacion: solo rellena lo que este vacio. Antes pisaba
    // el telefono sin condicion, asi que cualquier cambio del usuario en sesion
    // (una renovacion, un cambio de rol) borraba el numero ya tipeado — y en
    // edicion, el numero de contacto del cliente del pedido.
    setCliente((current) => current || `${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim());
    setTelefono((current) => current || user?.telefono || "");
  }, [user]);

  useEffect(() => {
    api.get<Material[]>("/materiales").then((response) => setMaterials(response.data));
  }, []);

  useEffect(() => () => previewRequest.current?.abort(), []);

  useEffect(() => {
    if (!id) return;
    api
      .get<Order>(`/orders/${id}`)
      .then((response) => {
        const loaded = {
          cliente: response.data.cliente,
          telefono: response.data.numeroContacto ?? user?.telefono ?? "",
          observaciones: response.data.observaciones ?? "",
          rows: response.data.detalles
        };
        setCliente(loaded.cliente);
        setTelefono(loaded.telefono);
        setObservaciones(loaded.observaciones);
        setRows(loaded.rows);
        setBaseline(JSON.stringify(loaded));
      })
      .finally(() => setFormReady(true));
    // Solo al cambiar de pedido. Si dependiera de `user`, cualquier refresco de
    // sesion volveria a traer el pedido del servidor y descartaria los cambios
    // sin guardar que la persona tenga en pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Un borrador sin contenido util no se ofrece y ademas bloquearia el
  // autoguardado, asi que se descarta apenas lo detectamos.
  useEffect(() => {
    if (pendingDraft && !recoverableDraft) dismissDraft();
  }, [dismissDraft, pendingDraft, recoverableDraft]);

  async function nextStep() {
    setError("");
    if (step === 0) {
      if (!cliente || !telefono) {
        setError("Complete cliente y telefono de contacto.");
        return;
      }
      if (telefono.trim().length < 6) {
        setError("El telefono de contacto debe tener al menos 6 digitos.");
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

  function buildPayload() {
    return {
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
  }

  function resolveApiError(submitError: unknown, fallback: string, writes = false) {
    if (axios.isAxiosError<{ message?: string; errors?: Array<{ message?: string }> }>(submitError)) {
      if (!submitError.response) {
        // Sin respuesta no sabemos si el servidor llego a guardar. Solo avisamos
        // de revisar el listado cuando el request escribia: el comprobante no
        // crea nada, y mandar a buscar un pedido que no existe confunde.
        return writes
          ? "Se corto la conexion antes de recibir la respuesta. Revisa en el listado si la solicitud quedo cargada antes de volver a enviarla."
          : "Se corto la conexion. Revisa la conexion e intenta de nuevo.";
      }

      const apiMessage = submitError.response.data?.message;
      const firstValidationError = submitError.response.data?.errors?.[0]?.message;
      return apiMessage || firstValidationError || fallback;
    }

    return fallback;
  }

  async function openPreview(event: FormEvent) {
    event.preventDefault();
    setError("");
    const rowError = validateRows(rows, materials);
    if (rowError) {
      setError(rowError);
      return;
    }

    // Validamos la sesion antes de mandar: renueva en silencio y, si ya no
    // alcanza, pide reingreso sin haber perdido nada de lo cargado.
    if (!(await ensureSession())) {
      setError("Tu sesion expiro. Volve a ingresar para continuar.");
      return;
    }

    const controller = new AbortController();
    previewRequest.current = controller;
    setPreviewLoading(true);

    try {
      const response = await api.post<Order>("/orders/preview", buildPayload(), { signal: controller.signal });
      setPreviewOrder(response.data);
    } catch (previewError) {
      // Si lo cancelamos nosotros (el usuario se fue del paso) no es un error
      // que haya que mostrar, y el comprobante no se tiene que abrir.
      if (controller.signal.aborted) return;
      setError(resolveApiError(previewError, "No se pudo generar el comprobante de la solicitud."));
    } finally {
      if (previewRequest.current === controller) {
        previewRequest.current = null;
        setPreviewLoading(false);
      }
    }
  }

  /** Corta la generacion en curso: se usa al volver, cancelar o desmontar. */
  function cancelPreview() {
    previewRequest.current?.abort();
    previewRequest.current = null;
    setPreviewLoading(false);
  }

  async function handleConfirmSubmit() {
    if (submitLoading) return;
    setError("");

    // Se bloquea el boton ANTES de esperar la sesion: renovar puede tardar
    // segundos sobre una red lenta, y sin esto un segundo click en esa ventana
    // dispara un segundo POST y crea el pedido dos veces.
    setSubmitLoading(true);

    // Misma validacion previa que en el preview, pero aca es critica: es el
    // request que no queremos que se pierda.
    if (!(await ensureSession())) {
      setError("Tu sesion expiro. Volve a ingresar: tu solicitud sigue cargada.");
      setSubmitLoading(false);
      return;
    }

    try {
      const payload = buildPayload();
      const response = id ? await api.put(`/orders/${id}`, payload) : await api.post("/orders", payload);

      // El pedido ya quedo creado. Guardar el telefono en el perfil es una
      // comodidad, no parte de la solicitud: si falla no puede arrastrar al
      // flujo a un estado de error que invite a reenviar y duplicar el pedido.
      if (user && user.rol !== "ADMIN" && telefono !== (user.telefono ?? "")) {
        try {
          await updateProfile({ nombre: user.nombre, apellido: user.apellido, telefono });
        } catch {
          // Queda para la proxima vez que edite su perfil.
        }
      }

      // Guardado en el servidor: el borrador local ya no tiene sentido.
      clearDraft();
      setPreviewOrder(null);
      navigate(user?.rol === "ADMIN" ? `/pedidos/${response.data.id}` : "/mis-solicitudes", {
        state: { notification: id ? "Solicitud de corte actualizada correctamente." : "Solicitud de corte enviada correctamente." }
      });
    } catch (submitError) {
      setError(resolveApiError(submitError, "No se pudo enviar la solicitud.", true));
      // El comprobante queda abierto a proposito: si el error fue transitorio
      // el usuario reintenta sin tener que rehacer el preview.
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <>
      <Stack spacing={3} component="form" onSubmit={openPreview}>
        <Stack spacing={0.5}>
          <Typography variant="h4">{id ? "Editar solicitud" : "Nueva solicitud de corte"}</Typography>
          <Typography color="text.secondary">Carga los datos del cliente, define las piezas y revisa el resumen antes de enviar.</Typography>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {recoverableDraft && (
          <Alert
            severity="info"
            action={
              <Stack direction="row" spacing={1}>
                <Button color="inherit" size="small" onClick={applyDraft}>
                  Recuperar
                </Button>
                <Button color="inherit" size="small" onClick={dismissDraft}>
                  Descartar
                </Button>
              </Stack>
            }
          >
            Tenes una solicitud sin terminar ({recoverableDraft.rows.length} piezas, guardada {describeAge(draftSavedAt ?? Date.now())}).
          </Alert>
        )}
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
          {["Datos", "Cortes", "Cantos", "Resumen"].map((label) => (
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
            <OrderItemsTable
              rows={rows}
              setRows={updateRows}
              materials={materials}
              clientName={cliente}
              clientPhone={telefono}
              onClientPhoneChange={setTelefono}
              defaultDetailValues={{ numeroCliente: telefono, nombreCliente: cliente }}
            />
          </Stack>
        )}
        {step === 2 && (
          <Stack spacing={2}>
            <OrderItemsTable
              rows={rows}
              setRows={updateRows}
              materials={materials}
              clientName={cliente}
              clientPhone={telefono}
              onClientPhoneChange={setTelefono}
              defaultDetailValues={{ numeroCliente: telefono, nombreCliente: cliente }}
              mode="edges"
            />
            <Paper sx={{ p: 2, borderRadius: "8px" }}>
              <CutOptimizer rows={rows} materials={materials} />
            </Paper>
          </Stack>
        )}
        {step === 3 && (
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
                <CutOptimizer rows={rows} materials={materials} />
              </Paper>
              {observaciones && <Typography color="text.secondary">{observaciones}</Typography>}
            </Stack>
          </Paper>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {id && (
            <Button
              variant="outlined"
              startIcon={<CloseIcon />}
              onClick={() => {
                cancelPreview();
                navigate(returnTo);
              }}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              Cancelar
            </Button>
          )}
          {step > 0 && (
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={() => {
                cancelPreview();
                setStep((current) => current - 1);
              }}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              Volver
            </Button>
          )}
          {step < 3 ? (
            <Button type="button" variant="contained" endIcon={<ArrowForwardIcon />} onClick={nextStep} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Siguiente
            </Button>
          ) : (
            <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={previewLoading} sx={{ width: { xs: "100%", sm: "auto" } }}>
              {previewLoading ? "Generando comprobante..." : id ? "Revisar y guardar" : "Revisar y enviar"}
            </Button>
          )}
        </Stack>
      </Stack>

      <OrderReceiptDialog
        order={previewOrder}
        open={Boolean(previewOrder)}
        onClose={() => !submitLoading && setPreviewOrder(null)}
        onConfirm={handleConfirmSubmit}
        confirmLabel={id ? "Confirmar cambios" : "Confirmar solicitud"}
        confirmLoading={submitLoading}
        errorMessage={error}
      />
    </>
  );
}
