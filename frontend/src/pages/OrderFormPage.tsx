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
import { getModuleOrder, moduleOrderError } from "../api/moduleOrders";
import { createEmptyDetail, OrderItemsGroup, OrderItemsTable } from "../components/OrderItemsTable";
import { OrderReceiptDialog } from "../components/OrderReceiptDialog";
import { useAuth } from "../context/AuthContext";
import { draftScope, useFormDraft } from "../hooks/useFormDraft";
import { useTodayInArgentina } from "../hooks/useTodayInArgentina";
import { canEditModuleOrder, moduleMeasuresText, sortRowsByModule, validateEditClient } from "../lib/moduleOrderDetail";
import { describeChanges, hasChanges, summarizeChanges } from "../lib/moduleOrderChanges";
import { MAX_DIRECCION, MAX_REFERENCIA } from "../lib/moduleOrderWizard";
import { Material, ModuleOrder, Order, OrderDetail } from "../types";
import { CutOptimizer } from "../components/CutOptimizer";
import { getStatusStyle } from "../components/StatusChip";

function resolveMaterialId(row: OrderDetail, materials: Material[]) {
  return row.materialId || materials.find((material) => material.tipo === "PLACA" && material.nombre === row.material)?.id || "";
}

function validateRows(rows: OrderDetail[], materials: Material[]) {
  for (const row of rows) {
    if (!resolveMaterialId(row, materials) || !row.largo || !row.ancho || !row.cantidad) return "Completá material, largo, ancho y cantidad de cada pieza.";
    if (Number.isNaN(Number(row.largo)) || Number.isNaN(Number(row.ancho))) return "Largo y ancho deben ser numéricos.";
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
  /** Solo al editar una solicitud de modulos. */
  email?: string;
  direccion?: string;
  fechaEntrega?: string;
};

/** CORTE: alta y edicion de una solicitud de corte. MODULOS: edicion de una solicitud de modulos (spec §10). */
export type OrderFormKind = "CORTE" | "MODULOS";

/** A donde vuelve el detalle de modulos despues de editar: la ruta que traia (el listado con sus filtros), si es propia. */
function moduleListReturn(state: unknown) {
  const returnTo = (state as { returnTo?: unknown } | null)?.returnTo;
  return typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : undefined;
}

/** Evita ofrecer la recuperacion de un formulario que estaba practicamente vacio. */
function hasContent(draft: OrderDraft) {
  return (
    !!draft.observaciones.trim() ||
    draft.rows.some((row) => row.materialId || row.material || row.largo || row.ancho)
  );
}

function describeAge(savedAt: number) {
  const minutes = Math.floor((Date.now() - savedAt) / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} días`;
}

function fillClientFields(rows: OrderDetail[], numeroCliente: string, nombreCliente: string) {
  return rows.map((row) => ({
    ...row,
    numeroCliente: row.numeroCliente || numeroCliente,
    nombreCliente: row.nombreCliente || nombreCliente
  }));
}

export function OrderFormPage({ kind = "CORTE" }: { kind?: OrderFormKind }) {
  const modules = kind === "MODULOS";
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
  // Solo modulos: los datos que corte no tiene, la solicitud guardada (los grupos y los cambios se comparan contra
  // ella) y el listado al que vuelve su detalle.
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [savedModuleOrder, setSavedModuleOrder] = useState<ModuleOrder | null>(null);
  const [loadError, setLoadError] = useState("");
  const today = useTodayInArgentina();
  const [moduleListReturnTo] = useState(() => moduleListReturn(location.state));
  const moduleDetailPath = `/modulos/${id}`;

  // En edicion hay que esperar a que llegue el pedido: si no, guardariamos como
  // borrador el formulario vacio de los primeros renders.
  const [formReady, setFormReady] = useState(!id);

  // En corte, sin los datos de modulos: el borrador y la comparacion quedan como siempre.
  const moduleData = useMemo(() => (modules ? { email, direccion, fechaEntrega } : {}), [direccion, email, fechaEntrega, modules]);

  const snapshot = useMemo<OrderDraft>(
    () => ({ cliente, telefono, observaciones, rows, step, ...moduleData }),
    [cliente, moduleData, observaciones, rows, step, telefono]
  );

  // El paso del asistente queda afuera: moverse entre pasos no es una edicion.
  const contentKey = useMemo(
    () => JSON.stringify({ cliente, telefono, observaciones, rows, ...moduleData }),
    [cliente, moduleData, observaciones, rows, telefono]
  );

  // En edicion, lo que vino del servidor. Sin cambios encima no hay nada que
  // guardar, y asi no ofrecemos recuperar un borrador identico al pedido.
  const [baseline, setBaseline] = useState<string | null>(null);

  // Modulos: un grupo por modulo de la solicitud y otro para las piezas adicionales (spec §10.2).
  const groups = useMemo<OrderItemsGroup[] | undefined>(() => {
    if (!modules || !savedModuleOrder) return undefined;
    return [
      ...savedModuleOrder.modulos.map((modulo) => ({
        id: modulo.id,
        title: [`Módulo ${modulo.posicion}`, modulo.nombreModulo, moduleMeasuresText(modulo)].filter(Boolean).join(" · "),
        subtitle: [`Esqueleto ${modulo.colorEsqueleto.nombre.trim()}`, `Frentes ${modulo.colorFrentes.nombre.trim()}`].join(" · "),
        defaultMaterialId: modulo.colorEsqueletoId,
        addLabel: "Agregar pieza a este módulo",
        emptyLabel: "Este módulo no tiene piezas."
      })),
      { id: null, title: "Piezas adicionales (sin módulo)", addLabel: "Agregar pieza adicional", emptyLabel: "No hay piezas adicionales." }
    ];
  }, [modules, savedModuleOrder]);

  // Modulos: lo que cambia contra lo guardado, con la misma cuenta que el historial del servidor (spec §10.2).
  const changes = useMemo(() => {
    if (!modules || !savedModuleOrder) return null;
    return summarizeChanges(
      {
        data: {
          cliente: savedModuleOrder.cliente,
          numeroContacto: savedModuleOrder.numeroContacto ?? "",
          emailContacto: savedModuleOrder.emailContacto,
          direccionEntrega: savedModuleOrder.direccionEntrega,
          fechaEntrega: savedModuleOrder.fechaEntrega,
          observaciones: savedModuleOrder.observaciones
        },
        rows: savedModuleOrder.detalles.flatMap((detalle) => (detalle.id ? [{ ...detalle, id: detalle.id }] : []))
      },
      { data: { cliente, numeroContacto: telefono, emailContacto: email, direccionEntrega: direccion, fechaEntrega, observaciones }, rows }
    );
  }, [cliente, direccion, email, fechaEntrega, modules, observaciones, rows, savedModuleOrder, telefono]);

  // Modulos: una solicitud que ya no se puede editar (o que no cargo) no muestra el formulario.
  const blockedMessage =
    loadError ||
    (savedModuleOrder && !canEditModuleOrder(savedModuleOrder.estado)
      ? `La solicitud M-${savedModuleOrder.numero} está ${getStatusStyle(savedModuleOrder.estado).label.toLowerCase()}: ya no se puede editar.`
      : "");

  // La clave lleva el id del usuario: en una PC compartida el borrador de uno
  // no puede aparecerle al siguiente que entra.
  const scope = draftScope(user?.id);

  const { pendingDraft, draftSavedAt, restoreDraft, dismissDraft, clearDraft } = useFormDraft<OrderDraft>(
    scope ? (modules ? `${scope}modules:${id}` : `${scope}order:${id ?? "new"}`) : null,
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
    if (modules) {
      setEmail(draft.email ?? "");
      setDireccion(draft.direccion ?? "");
      setFechaEntrega(draft.fechaEntrega ?? "");
    }
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
    if (!id || !modules) return;
    getModuleOrder(id)
      .then((order) => {
        const loaded = {
          cliente: order.cliente,
          telefono: order.numeroContacto ?? "",
          observaciones: order.observaciones ?? "",
          rows: sortRowsByModule(order.detalles, order.modulos),
          email: order.emailContacto ?? "",
          direccion: order.direccionEntrega ?? "",
          fechaEntrega: order.fechaEntrega ?? ""
        };
        setCliente(loaded.cliente);
        setTelefono(loaded.telefono);
        setObservaciones(loaded.observaciones);
        setRows(loaded.rows);
        setEmail(loaded.email);
        setDireccion(loaded.direccion);
        setFechaEntrega(loaded.fechaEntrega);
        setSavedModuleOrder(order);
        setBaseline(JSON.stringify(loaded));
        setFormReady(true);
      })
      .catch((loadFailure) => {
        // Una solicitud de corte abierta con la URL de modulos: se edita en su formulario.
        if (axios.isAxiosError(loadFailure) && loadFailure.response?.status === 404) {
          navigate(`/pedidos/${id}/editar`, { replace: true, state: location.state });
          return;
        }
        setLoadError(moduleOrderError(loadFailure, "No se pudo cargar la solicitud.").message);
      });
    // Solo al cambiar de solicitud, como en corte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || modules) return;
    api
      .get<Order>(`/orders/${id}`)
      .then((response) => {
        // Una solicitud de modulos se edita en su formulario (spec §10).
        if (response.data.tipo === "MODULOS") {
          navigate(`/modulos/${id}/editar`, { replace: true, state: location.state });
          return;
        }
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
    if (step === 0 && modules) {
      const problems = validateEditClient(
        { cliente, numeroContacto: telefono, emailContacto: email, direccionEntrega: direccion, observaciones, fechaEntrega },
        today,
        savedModuleOrder?.fechaEntrega ?? null
      );
      if (problems.length) {
        setError(problems.join(" "));
        return;
      }
    } else if (step === 0) {
      if (!cliente || !telefono) {
        setError("Completá cliente y teléfono de contacto.");
        return;
      }
      if (telefono.trim().length < 6) {
        setError("El teléfono de contacto debe tener al menos 6 dígitos.");
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

  /** El PUT de modulos (spec §10.3): las filas con su id y su modulo, y la version que se edito. */
  function buildModulePayload() {
    const { detalles, ...rest } = buildPayload();
    return {
      ...rest,
      emailContacto: email,
      direccionEntrega: direccion,
      fechaEntrega,
      fechaActualizacion: savedModuleOrder?.fechaActualizacion,
      detalles: detalles.map((detalle) => ({ ...detalle, id: detalle.id ?? null, pedidoModuloId: detalle.pedidoModuloId ?? null }))
    };
  }

  function resolveApiError(submitError: unknown, fallback: string, writes = false) {
    if (axios.isAxiosError<{ message?: string; errors?: Array<{ message?: string }> }>(submitError)) {
      if (!submitError.response) {
        // Sin respuesta no sabemos si el servidor llego a guardar. Solo avisamos
        // de revisar el listado cuando el request escribia: el comprobante no
        // crea nada, y mandar a buscar un pedido que no existe confunde.
        return writes
          ? "Se cortó la conexión antes de recibir la respuesta. Revisá en el listado si la solicitud quedó cargada antes de volver a enviarla."
          : "Se cortó la conexión. Revisá la conexión e intentá de nuevo.";
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
      setError("Tu sesión expiró. Volvé a ingresar para continuar.");
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
      setError("Tu sesión expiró. Volvé a ingresar: tu solicitud sigue cargada.");
      setSubmitLoading(false);
      return;
    }

    try {
      if (modules) {
        const saved = await api.put<ModuleOrder>(`/pedidos-modulos/${id}`, buildModulePayload());
        clearDraft();
        setPreviewOrder(null);
        navigate(moduleDetailPath, { state: { notification: `Solicitud M-${saved.data.numero} actualizada.`, returnTo: moduleListReturnTo } });
        return;
      }
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
      if (modules) {
        const apiError = moduleOrderError(submitError, "No se pudieron guardar los cambios.", true);
        setError([apiError.message, ...apiError.items].join(" "));
        return;
      }
      setError(resolveApiError(submitError, "No se pudo enviar la solicitud.", true));
      // El comprobante queda abierto a proposito: si el error fue transitorio
      // el usuario reintenta sin tener que rehacer el preview.
    } finally {
      setSubmitLoading(false);
    }
  }

  const header = (
    <Stack spacing={0.5}>
      <Typography variant="h4">
        {modules ? (savedModuleOrder ? `Editar solicitud M-${savedModuleOrder.numero}` : "Editar solicitud de módulos") : id ? "Editar solicitud" : "Nueva solicitud de corte"}
      </Typography>
      <Typography color="text.secondary">Cargá los datos del cliente, definí las piezas y revisá el resumen antes de enviar.</Typography>
    </Stack>
  );

  // Modulos: mientras carga, o si no se puede editar, no hay formulario (no se escribe sobre datos que no llegaron).
  if (modules && (blockedMessage || !formReady)) {
    return (
      <Stack spacing={3}>
        {header}
        {blockedMessage ? <Alert severity="error">{blockedMessage}</Alert> : <Alert severity="info">Cargando la solicitud...</Alert>}
        <Box>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(moduleDetailPath, { state: { returnTo: moduleListReturnTo } })}>
            Volver a la solicitud
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <>
      <Stack spacing={3} component="form" onSubmit={openPreview}>
        {header}
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
            Tenés una solicitud sin terminar ({recoverableDraft.rows.length} piezas, guardada {describeAge(draftSavedAt ?? Date.now())}).
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
                <TextField label="Teléfono de contacto" value={telefono} onChange={(event) => setTelefono(event.target.value)} required fullWidth />
              </Stack>
              {modules && (
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth />
                  <TextField label="Dirección de entrega" value={direccion} onChange={(event) => setDireccion(event.target.value)} inputProps={{ maxLength: MAX_DIRECCION }} fullWidth />
                  <TextField
                    label="Fecha de entrega"
                    type="date"
                    value={fechaEntrega}
                    onChange={(event) => setFechaEntrega(event.target.value)}
                    required
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: fechaEntrega && fechaEntrega === savedModuleOrder?.fechaEntrega && fechaEntrega < today ? fechaEntrega : today }}
                    sx={{ minWidth: { md: 200 } }}
                  />
                </Stack>
              )}
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label={modules ? "Referencia del trabajo" : "Observaciones"}
                  value={observaciones}
                  onChange={(event) => setObservaciones(event.target.value)}
                  inputProps={modules ? { maxLength: MAX_REFERENCIA } : undefined}
                  fullWidth
                />
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
              groups={groups}
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
              groups={groups}
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
                {modules && (
                  <Typography color="text.secondary">
                    {[email.trim(), direccion.trim(), fechaEntrega ? `Entrega ${fechaEntrega.split("-").reverse().join("/")}` : ""].filter(Boolean).join(" · ")}
                  </Typography>
                )}
              </Box>
              {changes && (
                <Box>
                  <Typography variant="h6">Cambios detectados</Typography>
                  {hasChanges(changes) ? (
                    <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2.5 }} aria-label="Cambios detectados">
                      {changes.modificadas > 0 && <li>{changes.modificadas === 1 ? "1 pieza modificada" : `${changes.modificadas} piezas modificadas`}</li>}
                      {changes.agregadas > 0 && <li>{changes.agregadas === 1 ? "1 pieza agregada" : `${changes.agregadas} piezas agregadas`}</li>}
                      {changes.eliminadas > 0 && <li>{changes.eliminadas === 1 ? "1 pieza eliminada" : `${changes.eliminadas} piezas eliminadas`}</li>}
                      {changes.datos.length > 0 && <li>{describeChanges({ modificadas: 0, agregadas: 0, eliminadas: 0, datos: changes.datos }).replace(/^c/, "C")}</li>}
                    </Stack>
                  ) : (
                    <Typography color="text.secondary">No hay cambios para guardar.</Typography>
                  )}
                </Box>
              )}
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
                if (modules) navigate(moduleDetailPath, { state: { returnTo: moduleListReturnTo } });
                else navigate(returnTo);
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
            <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={previewLoading || Boolean(changes && !hasChanges(changes))} sx={{ width: { xs: "100%", sm: "auto" } }}>
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
