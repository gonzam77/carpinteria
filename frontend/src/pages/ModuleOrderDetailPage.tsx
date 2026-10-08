import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import InventoryIcon from "@mui/icons-material/Inventory2";
import PrintIcon from "@mui/icons-material/Print";
import TuneIcon from "@mui/icons-material/Tune";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  type AlertColor,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import axios from "axios";
import { saveAs } from "file-saver";
import { useEffect, useId, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { getModulesConfig } from "../api/catalog";
import { changeModuleOrderDeliveryDate, getModuleOrder, moduleOrderError } from "../api/moduleOrders";
import { CutOptimizer } from "../components/CutOptimizer";
import { DeleteOrderDialog } from "../components/DeleteOrderDialog";
import { DeliveryChip } from "../components/DeliveryChip";
import { SummaryPanel } from "../components/moduleOrderWizard/ReviewStep";
import { OrderMaterialsDialog } from "../components/OrderMaterialsDialog";
import { RecalcModuleDialog } from "../components/RecalcModuleDialog";
import { OrderHardwareList } from "../components/moduleOrderWizard/ModuleHardware";
import { ActionSnackbar, OrderCompletedDialog, StockShortageDialog, type StockShortage } from "../components/OrderStatusDialogs";
import { getStatusStyle, StatusChip } from "../components/StatusChip";
import { EDITED_BLUE } from "../components/PieceEdgesToggles";
import { useTodayInArgentina } from "../hooks/useTodayInArgentina";
import { activeStep, canChangeDeliveryDate, canEditModuleOrder, deliveryDateProblem, historyText, STATUS_STEPS } from "../lib/moduleOrderDetail";
import { deliveryStatus, exportErrorMessage, formatCreatedDay, formatDay, STATUS_ORDER } from "../lib/moduleOrdersList";
import { buildWhatsappLink } from "../lib/whatsapp";
import type { EstadoSolicitud, Material, ModuleOrder, ModuleOrderDetail, ModulesConfig } from "../types";

type ApiErrorBody = { message?: string; code?: string; details?: { stockShortages?: StockShortage[] } };

const SIDES = [
  { label: "L1", id: "cantoLargo1Id", name: "cantoLargo1Nombre" },
  { label: "L2", id: "cantoLargo2Id", name: "cantoLargo2Nombre" },
  { label: "A1", id: "cantoAncho1Id", name: "cantoAncho1Nombre" },
  { label: "A2", id: "cantoAncho2Id", name: "cantoAncho2Nombre" }
] as const;

/** A donde vuelve: la pantalla que lo abrio (el listado con sus filtros) o el listado de modulos. */
function backTarget(state: unknown) {
  const returnTo = (state as { returnTo?: unknown } | null)?.returnTo;
  return typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/modulos";
}

/** Un dato de la tarjeta: rotulo arriba y valor abajo. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>
        {label}
      </Typography>
      <Box sx={{ overflowWrap: "anywhere" }}>{children}</Box>
    </Box>
  );
}

/** Los cantos de una fila: el nombre de cada lado que lleva canto. */
function EdgesCell({ row }: { row: ModuleOrderDetail }) {
  const lados = SIDES.filter((side) => row[side.id]);
  if (!lados.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Sin cantos
      </Typography>
    );
  }
  return (
    <Stack spacing={0.25}>
      {lados.map((side) => (
        <Typography key={side.label} variant="body2" sx={{ whiteSpace: "nowrap" }}>
          <Box component="span" sx={{ fontWeight: 800, mr: 0.75 }}>
            {side.label}
          </Box>
          {(row[side.name] ?? "Canto").trim()}
        </Typography>
      ))}
    </Stack>
  );
}

/** Una tabla de piezas: la de un modulo o la de las piezas adicionales. */
function PiecesTable({ titleId, rows }: { titleId: string; rows: ModuleOrderDetail[] }) {
  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-labelledby={titleId} sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell>Pieza</TableCell>
            <TableCell>Material</TableCell>
            <TableCell align="right">Largo</TableCell>
            <TableCell align="right">Ancho</TableCell>
            <TableCell align="right">Cant.</TableCell>
            <TableCell>Cantos</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const editada = row.origen === "EDITADO";
            const agregada = row.origen === "MANUAL";
            return (
              <TableRow key={row.id ?? `${row.codigoBarra}-${row.indice}`} sx={editada || agregada ? { boxShadow: `inset 4px 0 0 ${EDITED_BLUE}` } : undefined}>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="body2" fontWeight={700}>
                      {row.nombreProducto ?? row.piezaCodigo}
                    </Typography>
                    {(editada || agregada) && (
                      <Chip size="small" variant="outlined" label={editada ? "Editada" : "Agregada"} sx={{ borderColor: EDITED_BLUE, color: EDITED_BLUE }} />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, Consolas, monospace", whiteSpace: "nowrap" }}>
                    {row.codigoBarra}
                  </Typography>
                </TableCell>
                <TableCell>{row.material}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.largo}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.ancho}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.cantidad}
                </TableCell>
                <TableCell>
                  <EdgesCell row={row} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ModuleBlock({
  modulo,
  rows,
  herrajes,
  onRecalc
}: {
  modulo: ModuleOrder["modulos"][number];
  rows: ModuleOrderDetail[];
  herrajes: ModuleOrder["herrajes"];
  onRecalc?: () => void;
}) {
  const titleId = useId();
  const perfil = modulo.definicionSnapshot?.perfiles?.find((item) => item.orden === modulo.perfilCantoOrden);
  const colores = [
    `Esqueleto ${modulo.colorEsqueleto.nombre.trim()}`,
    `Frentes ${modulo.colorFrentes.nombre.trim()}`,
    ...(modulo.materialFondo ? [`Fondo ${modulo.materialFondo.nombre.trim()}`] : []),
    ...(perfil ? [`Perfil ${perfil.nombre}`] : [])
  ];
  return (
    <Paper component="section" aria-labelledby={titleId} sx={{ borderRadius: "10px", overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: "primary.main", color: "primary.contrastText" }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
          <Typography id={titleId} component="h3" fontWeight={900} fontSize="1rem">
            Módulo {modulo.posicion} · {modulo.nombreModulo}
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {rows.length} {rows.length === 1 ? "pieza" : "piezas"}
            </Typography>
            {onRecalc && (
              <Button size="small" variant="outlined" color="inherit" startIcon={<TuneIcon />} onClick={onRecalc} sx={{ whiteSpace: "nowrap" }}>
                Cambiar medidas o colores
              </Button>
            )}
          </Stack>
        </Stack>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {colores.join(" · ")}
        </Typography>
      </Box>
      {modulo.observaciones && (
        <Typography variant="body2" sx={{ px: 2, pt: 1.25 }}>
          <Box component="span" fontWeight={700}>
            Observaciones:{" "}
          </Box>
          {modulo.observaciones}
        </Typography>
      )}
      <PiecesTable titleId={titleId} rows={rows} />
      <OrderHardwareList titulo={`Herrajes del módulo ${modulo.posicion}`} herrajes={herrajes} />
    </Paper>
  );
}

/** Detalle de una solicitud de modulos (spec §9.3), en /modulos/:id. Solo ADMIN. */
export function ModuleOrderDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const today = useTodayInArgentina();
  const [order, setOrder] = useState<ModuleOrder | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [config, setConfig] = useState<ModulesConfig | null>(null);
  const [tab, setTab] = useState<"despiece" | "plano" | "historial">("despiece");
  const [notification, setNotification] = useState("");
  const [severity, setSeverity] = useState<AlertColor>("success");
  const [changingStatus, setChangingStatus] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EstadoSolicitud | null>(null);
  const [stockShortages, setStockShortages] = useState<StockShortage[]>([]);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [recalcModulo, setRecalcModulo] = useState<ModuleOrder["modulos"][number] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const [dateError, setDateError] = useState("");
  const backTo = backTarget(location.state);

  const notify = (message: string, level: AlertColor = "success") => {
    setSeverity(level);
    setNotification(message);
  };

  useEffect(() => {
    let current = true;
    setLoadError("");
    getModuleOrder(id)
      .then((data) => {
        if (current) setOrder(data);
      })
      .catch((error) => {
        if (!current) return;
        // Una solicitud de corte abierta con la URL de modulos: se ve en su detalle, sin sumar un paso al historial.
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          navigate(`/pedidos/${id}`, { replace: true, state: location.state });
          return;
        }
        setLoadError(moduleOrderError(error, "No se pudo cargar la solicitud.").message);
      });
    return () => {
      current = false;
    };
    // Solo con otra solicitud o al reintentar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reload]);

  useEffect(() => {
    api
      .get<Material[]>("/materiales", { params: { incluirInactivos: true } })
      .then((response) => setMaterials(response.data))
      .catch(() => undefined);
    getModulesConfig()
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  const rowsByModule = useMemo(() => {
    const groups = new Map<string, ModuleOrderDetail[]>();
    for (const row of order?.detalles ?? []) {
      const key = row.pedidoModuloId ?? "";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return groups;
  }, [order]);

  async function refresh() {
    setOrder(await getModuleOrder(id));
  }

  async function submitStatusChange(estado: EstadoSolicitud, forceWithoutStock = false) {
    if (!order) return;
    setChangingStatus(true);
    try {
      const promptCompletion = estado === "TERMINADA" && order.estado !== "TERMINADA";
      await api.patch(`/orders/${order.id}/status`, { estado, forceWithoutStock });
      await refresh();
      notify(
        forceWithoutStock ? `Estado actualizado a ${getStatusStyle(estado).label} sin descontar stock por faltante.` : `Estado actualizado a ${getStatusStyle(estado).label}.`,
        forceWithoutStock ? "warning" : "success"
      );
      setStockDialogOpen(false);
      setPendingStatus(null);
      setStockShortages([]);
      if (promptCompletion) setCompletionOpen(true);
    } catch (error) {
      if (!forceWithoutStock && axios.isAxiosError<ApiErrorBody>(error) && error.response?.data?.code === "STOCK_SHORTAGE_CONFIRMATION_REQUIRED") {
        setPendingStatus(estado);
        setStockShortages(error.response.data.details?.stockShortages ?? []);
        setStockDialogOpen(true);
        return;
      }
      notify(moduleOrderError(error, "No se pudo actualizar el estado.", true).message, "error");
      // Si la solicitud cambio mientras tanto (409), se ve como quedo.
      if (axios.isAxiosError(error) && error.response?.status === 409) await refresh().catch(() => undefined);
    } finally {
      setChangingStatus(false);
    }
  }

  async function exportExcel() {
    if (!order) return;
    setExporting(true);
    try {
      const response = await api.get<Blob>("/orders/export", { params: { ids: order.id }, responseType: "blob" });
      saveAs(response.data, `pedido-M${order.numero}.xlsx`);
    } catch (error) {
      notify(await exportErrorMessage(error), "error");
    } finally {
      setExporting(false);
    }
  }

  async function deleteOrder() {
    if (!order) return;
    setDeleting(true);
    try {
      await api.delete(`/orders/${order.id}`);
      navigate(backTo, { state: { notification: `Solicitud M-${order.numero} eliminada.` } });
    } catch (error) {
      setDeleteOpen(false);
      notify(moduleOrderError(error, "No se pudo eliminar la solicitud.", true).message, "error");
      if (axios.isAxiosError(error) && error.response?.status === 409) await refresh().catch(() => undefined);
    } finally {
      setDeleting(false);
    }
  }

  function startDateEdit() {
    if (!order) return;
    setDateDraft(order.fechaEntrega ?? "");
    setDateError("");
    setEditingDate(true);
  }

  async function saveDate() {
    if (!order) return;
    const problem = deliveryDateProblem(dateDraft, today);
    if (problem) {
      setDateError(problem);
      return;
    }
    if (dateDraft === order.fechaEntrega) {
      setEditingDate(false);
      return;
    }
    setSavingDate(true);
    try {
      setOrder(await changeModuleOrderDeliveryDate(order.id, dateDraft));
      setEditingDate(false);
      notify(`Fecha de entrega cambiada al ${formatDay(dateDraft)}.`);
    } catch (error) {
      const failure = moduleOrderError(error, "No se pudo cambiar la fecha de entrega.", true);
      setDateError([failure.message, ...failure.items].join(" "));
      if (axios.isAxiosError(error) && error.response?.status === 409) await refresh().catch(() => undefined);
    } finally {
      setSavingDate(false);
    }
  }

  if (loadError) {
    return (
      <Stack spacing={2}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => setReload((value) => value + 1)}>
              Reintentar
            </Button>
          }
        >
          {loadError}
        </Alert>
        <Box>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)}>
            Volver
          </Button>
        </Box>
      </Stack>
    );
  }
  if (!order || order.id !== id) {
    return (
      <Stack spacing={2} aria-busy="true" aria-label="Cargando la solicitud">
        <Skeleton variant="text" width={280} height={48} />
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }

  const diasAviso = config?.diasAvisoVencimiento ?? 3;
  const plazo = deliveryStatus(order, today, diasAviso);
  const step = activeStep(order.estado);
  const whatsappLink = buildWhatsappLink(order.numeroContacto, order.cliente, `M-${order.numero}`);
  const adicionales = rowsByModule.get("") ?? [];

  return (
    <Stack spacing={2.5}>
      {/* Con las seis acciones al lado, desde 1200 px; mas angosto, van en una fila abajo del titulo. */}
      <Stack direction={{ xs: "column", lg: "row" }} alignItems={{ lg: "flex-end" }} justifyContent="space-between" gap={2}>
        <Box sx={{ minWidth: 0, flexShrink: { lg: 0 } }}>
          <Stack direction="row" spacing={1.25} alignItems="center" useFlexGap flexWrap="wrap">
            {/* En una linea: con todas las acciones al lado, se cortaba en "M-" y el numero abajo. */}
            <Typography variant="h4" component="h1" sx={{ whiteSpace: "nowrap" }}>
              Solicitud M-{order.numero}
            </Typography>
            <StatusChip size="small" status={order.estado} />
            <DeliveryChip size="small" status={plazo} />
          </Stack>
          <Typography color="text.secondary">
            {order.cliente}
            {order.observaciones ? ` · ${order.observaciones}` : ""}
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap", flexShrink: { lg: 1 }, justifyContent: { lg: "flex-end" }, width: { xs: "100%", sm: "auto" } }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Volver
          </Button>
          <TextField
            select
            size="small"
            label="Estado"
            value={order.estado}
            disabled={changingStatus}
            onChange={(event) => {
              const estado = event.target.value as EstadoSolicitud;
              if (estado !== order.estado) void submitStatusChange(estado);
            }}
            sx={{ minWidth: { sm: 160 }, width: { xs: "100%", sm: "auto" } }}
          >
            {STATUS_ORDER.map((estado) => (
              <MenuItem key={estado} value={estado}>
                {getStatusStyle(estado).label}
              </MenuItem>
            ))}
          </TextField>
          {/* Como en corte (spec §10.1): no en proceso, terminada ni entregada. El formulario vuelve aca. */}
          {canEditModuleOrder(order.estado) && (
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => navigate(`/modulos/${order.id}/editar`, { state: { returnTo: backTo } })} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Editar
            </Button>
          )}
          <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => navigate(`/modulos/${order.id}/taller`, { state: { returnTo: backTo } })} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Hoja de taller
          </Button>
          <Button variant="outlined" startIcon={<InventoryIcon />} onClick={() => setMaterialsOpen(true)} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Materiales
          </Button>
          <Button
            variant="outlined"
            startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
            onClick={() => void exportExcel()}
            disabled={exporting}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            {exporting ? "Exportando..." : "Exportar Excel"}
          </Button>
          <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Eliminar
          </Button>
        </Stack>
      </Stack>

      <Paper component="section" aria-label="Datos de la solicitud" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "10px" }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" } }}>
          <Field label="Cliente">
            <Typography fontWeight={700}>{order.cliente}</Typography>
          </Field>
          <Field label="Teléfono">
            <Typography>{order.numeroContacto || "Sin teléfono"}</Typography>
          </Field>
          <Field label="Email">
            <Typography>{order.emailContacto || "Sin email"}</Typography>
          </Field>
          <Field label="Dirección de entrega">
            <Typography>{order.direccionEntrega || "Sin dirección"}</Typography>
          </Field>
          <Field label="Referencia del trabajo">
            <Typography>{order.observaciones || "Sin referencia"}</Typography>
          </Field>
          <Field label="Fecha de entrega">
            {editingDate ? (
              <Stack spacing={1} sx={{ mt: 0.5 }}>
                <TextField
                  type="date"
                  size="small"
                  label="Nueva fecha"
                  value={dateDraft}
                  onChange={(event) => {
                    setDateDraft(event.target.value);
                    setDateError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveDate();
                    if (event.key === "Escape") setEditingDate(false);
                  }}
                  error={Boolean(dateError)}
                  helperText={dateError || " "}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
                  disabled={savingDate}
                  autoFocus
                />
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" onClick={() => void saveDate()} disabled={savingDate}>
                    {savingDate ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button size="small" onClick={() => setEditingDate(false)} disabled={savingDate}>
                    Cancelar
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography fontWeight={700}>{formatDay(order.fechaEntrega) || "Sin fecha"}</Typography>
                {canChangeDeliveryDate(order.estado) && (
                  <Button size="small" startIcon={<EditCalendarIcon />} onClick={startDateEdit}>
                    Cambiar
                  </Button>
                )}
              </Stack>
            )}
          </Field>
          <Field label="Creada">
            <Typography>
              {formatCreatedDay(order.fechaCreacion)}
              {order.usuario ? ` por ${order.usuario.nombre} ${order.usuario.apellido}` : ""}
            </Typography>
          </Field>
          <Field label="Módulos">
            <Typography>{order.modulos.length}</Typography>
          </Field>
        </Box>
        <Box sx={{ mt: 2.5 }}>
          {step === null ? (
            <Alert severity="error" variant="outlined">
              La solicitud está rechazada.
            </Alert>
          ) : (
            <Stepper activeStep={step} alternativeLabel aria-label="Estado de la solicitud">
              {STATUS_STEPS.map((estado, index) => (
                <Step key={estado} completed={index < step || order.estado === "ENTREGADA"}>
                  <StepLabel>{getStatusStyle(estado).label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}
        </Box>
      </Paper>

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" allowScrollButtonsMobile aria-label="Secciones de la solicitud">
          <Tab value="despiece" label="Despiece" id="tab-despiece" aria-controls="panel-despiece" />
          <Tab value="plano" label="Plano de cortes" id="tab-plano" aria-controls="panel-plano" />
          <Tab value="historial" label="Historial" id="tab-historial" aria-controls="panel-historial" />
        </Tabs>
      </Box>

      {tab === "despiece" && (
        <Box role="tabpanel" id="panel-despiece" aria-labelledby="tab-despiece" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 340px" }, alignItems: "start" }}>
          <Stack spacing={2} sx={{ minWidth: 0 }}>
            {order.modulos.map((modulo) => (
              <ModuleBlock
                key={modulo.id}
                modulo={modulo}
                rows={rowsByModule.get(modulo.id) ?? []}
                herrajes={(order.herrajes ?? []).filter((herraje) => herraje.pedidoModuloId === modulo.id)}
                // Recalcular desde el catalogo (spec §10.6): en los estados editables y si el modulo sigue en el catalogo.
                onRecalc={canEditModuleOrder(order.estado) && modulo.moduloId ? () => setRecalcModulo(modulo) : undefined}
              />
            ))}
            {adicionales.length > 0 && (
              <Paper component="section" aria-labelledby="piezas-adicionales" sx={{ borderRadius: "10px", overflow: "hidden" }}>
                <Box sx={{ px: 2, py: 1.25, bgcolor: "secondary.main", color: "secondary.contrastText" }}>
                  <Typography id="piezas-adicionales" component="h3" fontWeight={900} fontSize="1rem">
                    Piezas adicionales
                  </Typography>
                </Box>
                <PiecesTable titleId="piezas-adicionales" rows={adicionales} />
              </Paper>
            )}
          </Stack>
          <SummaryPanel preview={order} status="ready" units={order.modulos.length} materials={materials} herrajesHabilitados={Boolean(config?.herrajesHabilitados) || order.costoHerrajes > 0} />
        </Box>
      )}
      {tab === "plano" && (
        <Paper role="tabpanel" id="panel-plano" aria-labelledby="tab-plano" sx={{ p: 2, borderRadius: "10px" }}>
          <CutOptimizer rows={order.detalles} materials={materials} autoCalculate />
        </Paper>
      )}
      {tab === "historial" && (
        <Paper role="tabpanel" id="panel-historial" aria-labelledby="tab-historial" sx={{ p: 2.5, borderRadius: "10px" }}>
          <Stack component="ol" spacing={1.25} sx={{ m: 0, p: 0, listStyle: "none" }}>
            {(order.historial ?? []).map((item) => (
              <Box component="li" key={item.id}>
                <Typography variant="body2" fontWeight={700}>
                  {historyText(item)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(item.fechaCreacion).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })} ·{" "}
                  {item.usuario.nombre} {item.usuario.apellido}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <StockShortageDialog
        open={stockDialogOpen}
        estadoLabel={pendingStatus ? getStatusStyle(pendingStatus).label : "ese estado"}
        shortages={stockShortages}
        busy={changingStatus}
        onCancel={() => setStockDialogOpen(false)}
        onConfirm={() => pendingStatus && void submitStatusChange(pendingStatus, true)}
      />
      <OrderCompletedDialog open={completionOpen} whatsappLink={whatsappLink} onClose={() => setCompletionOpen(false)} />
      <OrderMaterialsDialog order={materialsOpen ? order : null} open={materialsOpen} onClose={() => setMaterialsOpen(false)} />
      <RecalcModuleDialog
        order={order}
        modulo={recalcModulo}
        materials={materials}
        config={config}
        onClose={() => setRecalcModulo(null)}
        onDone={(updated) => {
          const posicion = recalcModulo?.posicion;
          setRecalcModulo(null);
          setOrder(updated);
          notify(`Módulo ${posicion} recalculado.`);
        }}
      />
      <DeleteOrderDialog order={order} open={deleteOpen} loading={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={() => void deleteOrder()} />
      <ActionSnackbar message={notification} severity={severity} onClose={() => setNotification("")} />
    </Stack>
  );
}
