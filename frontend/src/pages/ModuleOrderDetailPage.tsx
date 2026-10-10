import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import EditIcon from "@mui/icons-material/Edit";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import HistoryIcon from "@mui/icons-material/History";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import ViewModuleOutlinedIcon from "@mui/icons-material/ViewModuleOutlined";
import WidgetsOutlinedIcon from "@mui/icons-material/WidgetsOutlined";
import {
  Alert,
  type AlertColor,
  Box,
  Button,
  Chip,
  Divider,
  Link,
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
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { getModulesConfig } from "../api/catalog";
import { changeModuleOrderDeliveryDate, getModuleOrder, moduleOrderError } from "../api/moduleOrders";
import { DeliveryChip } from "../components/DeliveryChip";
import { SummaryPanel } from "../components/moduleOrderWizard/ReviewStep";
import { RecalcModuleDialog } from "../components/RecalcModuleDialog";
import { OrderHardwareList } from "../components/moduleOrderWizard/ModuleHardware";
import { MachineExcelTab } from "../components/moduleOrderDetail/MachineExcelTab";
import { MaterialsTab } from "../components/moduleOrderDetail/MaterialsTab";
import { detailPrintStyles, PRINT_TARGET, SectionActions } from "../components/moduleOrderDetail/SectionActions";
import { ActionSnackbar, OrderCompletedDialog, StockShortageDialog, type StockShortage } from "../components/OrderStatusDialogs";
import { getStatusStyle, StatusChip } from "../components/StatusChip";
import { EDITED_BLUE } from "../components/PieceEdgesToggles";
import { useTodayInArgentina } from "../hooks/useTodayInArgentina";
import { activeStep, canChangeDeliveryDate, canEditModuleOrder, deliveryDateProblem, historyText, STATUS_STEPS } from "../lib/moduleOrderDetail";
import { deliveryStatus, formatCreatedDay, formatDay, STATUS_ORDER } from "../lib/moduleOrdersList";
import { buildWhatsappLink } from "../lib/whatsapp";
import type { EstadoSolicitud, Material, ModuleOrder, ModuleOrderDetail, ModulesConfig } from "../types";
import { WorkshopSheetsView } from "./ModuleOrderWorkshopPage";

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
/** Un dato de la solicitud con su icono (punto 6). */
function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ minWidth: 0 }}>
      <Box sx={{ color: "primary.main", pt: 0.25, display: "flex", "& svg": { fontSize: 20 } }} aria-hidden>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: "0.68rem" }}>
          {label}
        </Typography>
        <Box sx={{ overflowWrap: "anywhere" }}>{children}</Box>
      </Box>
    </Stack>
  );
}

/** Un indicador del encabezado: compacto, para leer de un vistazo (punto 10). */
function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ p: 1.25, borderRadius: "12px", bgcolor: "background.default", border: 1, borderColor: "divider", minWidth: 0 }}>
      <Box sx={{ width: 36, height: 36, borderRadius: "10px", display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText", flexShrink: 0, "& svg": { fontSize: 20 } }} aria-hidden>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography fontWeight={800} fontSize="1.05rem" lineHeight={1.2} sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="p">
          {label}
        </Typography>
      </Box>
    </Stack>
  );
}

const money = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

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
    <Paper component="section" aria-labelledby={titleId} variant="outlined" sx={{ borderRadius: "14px", overflow: "hidden" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ px: 2, py: 1.5, bgcolor: "background.default", borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, flex: 1 }}>
          <Box
            aria-hidden
            sx={{ width: 38, height: 38, borderRadius: "11px", flexShrink: 0, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 900 }}
          >
            {modulo.posicion}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography id={titleId} component="h3" fontWeight={800} fontSize="1rem">
              Módulo {modulo.posicion} · {modulo.nombreModulo}
            </Typography>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
              {colores.map((color) => (
                <Chip key={color} size="small" variant="outlined" label={color} sx={{ bgcolor: "background.paper" }} />
              ))}
            </Stack>
          </Box>
        </Stack>
        <Stack direction={{ xs: "row", sm: "column" }} spacing={1} alignItems={{ xs: "center", sm: "flex-end" }} justifyContent="space-between">
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
            {rows.length} {rows.length === 1 ? "pieza" : "piezas"}
          </Typography>
          {onRecalc && (
            <Button size="small" variant="outlined" startIcon={<TuneIcon />} onClick={onRecalc} sx={{ whiteSpace: "nowrap" }}>
              Cambiar medidas o colores
            </Button>
          )}
        </Stack>
      </Stack>
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
  const [tab, setTab] = useState<"despiece" | "taller" | "materiales" | "excel" | "historial">("despiece");
  const [notification, setNotification] = useState("");
  const [severity, setSeverity] = useState<AlertColor>("success");
  const [changingStatus, setChangingStatus] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EstadoSolicitud | null>(null);
  const [stockShortages, setStockShortages] = useState<StockShortage[]>([]);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [recalcModulo, setRecalcModulo] = useState<ModuleOrder["modulos"][number] | null>(null);
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
  const piezas = order.detalles.reduce((sum, row) => sum + Number(row.cantidad), 0);
  const tabs = [
    { value: "despiece", label: "Despiece", icon: <ViewModuleOutlinedIcon fontSize="small" /> },
    { value: "taller", label: "Hoja de taller", icon: <AssignmentOutlinedIcon fontSize="small" /> },
    { value: "materiales", label: "Materiales", icon: <Inventory2OutlinedIcon fontSize="small" /> },
    { value: "excel", label: "Excel de corte", icon: <TableChartOutlinedIcon fontSize="small" /> },
    { value: "historial", label: "Historial", icon: <HistoryIcon fontSize="small" /> }
  ] as const;

  return (
    <Stack spacing={2.5}>
      {detailPrintStyles}
      {/* Barra superior (punto 5): Volver a la izquierda; Estado y Editar a la derecha. Eliminar esta en Editar. */}
      <Stack className="no-imprimir" direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)} sx={{ ml: -1 }}>
          Volver
        </Button>
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" justifyContent="flex-end" sx={{ flex: { xs: "1 1 100%", sm: "0 1 auto" } }}>
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
            sx={{ minWidth: 170, flex: { xs: 1, sm: "none" } }}
          >
            {STATUS_ORDER.map((estado) => (
              <MenuItem key={estado} value={estado}>
                {getStatusStyle(estado).label}
              </MenuItem>
            ))}
          </TextField>
          {/* Como en corte (spec §10.1): no en proceso, terminada ni entregada. El formulario vuelve aca. */}
          {canEditModuleOrder(order.estado) && (
            <Button variant="contained" startIcon={<EditIcon />} onClick={() => navigate(`/modulos/${order.id}/editar`, { state: { returnTo: backTo } })} sx={{ flex: { xs: 1, sm: "none" } }}>
              Editar
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Encabezado (punto 6): quien, cuando y cuanto, de un vistazo. */}
      <Paper component="section" aria-label="Datos de la solicitud" className="no-imprimir" sx={{ p: { xs: 2, sm: 3 }, borderRadius: "16px" }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={{ xs: 2, lg: 3 }} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1, lineHeight: 1.6 }}>
              Solicitud de módulos a medida
            </Typography>
            <Stack direction="row" spacing={1.25} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography variant="h4" component="h1" sx={{ whiteSpace: "nowrap" }}>
                Solicitud M-{order.numero}
              </Typography>
              <StatusChip size="small" status={order.estado} />
              <DeliveryChip size="small" status={plazo} />
            </Stack>
            <Typography fontWeight={700} fontSize="1.1rem" sx={{ mt: 0.5 }}>
              {order.cliente}
            </Typography>
            {order.observaciones && <Typography color="text.secondary">{order.observaciones}</Typography>}
          </Box>
          <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, alignSelf: { lg: "center" }, minWidth: { lg: 560 } }}>
            <Kpi icon={<WidgetsOutlinedIcon />} label={order.modulos.length === 1 ? "módulo" : "módulos"} value={String(order.modulos.length)} />
            <Kpi icon={<ViewModuleOutlinedIcon />} label={piezas === 1 ? "pieza" : "piezas"} value={String(piezas)} />
            <Kpi icon={<LayersOutlinedIcon />} label={order.placasEstimadas === 1 ? "placa" : "placas"} value={String(order.placasEstimadas)} />
            <Kpi icon={<PaymentsOutlinedIcon />} label={order.costoHerrajes > 0 ? "total con herrajes" : "presupuesto"} value={money(order.presupuestoConHerrajes)} />
          </Box>
        </Stack>
        <Divider sx={{ my: 2.5 }} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
          <Field label="Teléfono" icon={<PhoneOutlinedIcon />}>
            {order.numeroContacto ? (
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Link href={`tel:${order.numeroContacto}`} underline="hover" color="inherit" fontWeight={600}>
                  {order.numeroContacto}
                </Link>
                {whatsappLink && (
                  <Link href={whatsappLink} target="_blank" rel="noreferrer" underline="hover" variant="body2">
                    WhatsApp
                  </Link>
                )}
              </Stack>
            ) : (
              <Typography color="text.secondary">Sin teléfono</Typography>
            )}
          </Field>
          <Field label="Email" icon={<MailOutlineIcon />}>
            {order.emailContacto ? (
              <Link href={`mailto:${order.emailContacto}`} underline="hover" color="inherit">
                {order.emailContacto}
              </Link>
            ) : (
              <Typography color="text.secondary">Sin email</Typography>
            )}
          </Field>
          <Field label="Dirección de entrega" icon={<PlaceOutlinedIcon />}>
            <Typography color={order.direccionEntrega ? "text.primary" : "text.secondary"}>{order.direccionEntrega || "Sin dirección"}</Typography>
          </Field>
          <Field label="Fecha de entrega" icon={<EventOutlinedIcon />}>
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
                  <Button size="small" startIcon={<EditCalendarIcon />} onClick={startDateEdit} sx={{ py: 0 }}>
                    Cambiar
                  </Button>
                )}
              </Stack>
            )}
          </Field>
          <Field label="Creada" icon={<PersonOutlineIcon />}>
            <Typography>
              {formatCreatedDay(order.fechaCreacion)}
              {order.usuario ? ` por ${order.usuario.nombre} ${order.usuario.apellido}` : ""}
            </Typography>
          </Field>
          <Field label="Referencia del trabajo" icon={<NotesOutlinedIcon />}>
            <Typography color={order.observaciones ? "text.primary" : "text.secondary"}>{order.observaciones || "Sin referencia"}</Typography>
          </Field>
        </Box>
        <Box sx={{ mt: 3 }}>
          {step === null ? (
            <Alert severity="error" variant="outlined">
              La solicitud está rechazada.
            </Alert>
          ) : (
            <Stepper activeStep={step} alternativeLabel aria-label="Estado de la solicitud" sx={{ "& .MuiStepLabel-label": { fontSize: { xs: 11, sm: 13 } } }}>
              {STATUS_STEPS.map((estado, index) => (
                <Step key={estado} completed={index < step || order.estado === "ENTREGADA"}>
                  <StepLabel>{getStatusStyle(estado).label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}
        </Box>
      </Paper>

      <Paper className="no-imprimir" sx={{ borderRadius: "14px", px: 1 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" allowScrollButtonsMobile aria-label="Secciones de la solicitud">
          {tabs.map((item) => (
            <Tab key={item.value} value={item.value} label={item.label} icon={item.icon} iconPosition="start" id={`tab-${item.value}`} aria-controls={`panel-${item.value}`} sx={{ minHeight: 52 }} />
          ))}
        </Tabs>
      </Paper>

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
              <Paper component="section" aria-labelledby="piezas-adicionales" variant="outlined" sx={{ borderRadius: "14px", overflow: "hidden" }}>
                <Box sx={{ px: 2, py: 1.5, bgcolor: "background.default", borderBottom: 1, borderColor: "divider" }}>
                  <Typography id="piezas-adicionales" component="h3" fontWeight={800} fontSize="1rem">
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
      {tab === "taller" && (
        <Stack role="tabpanel" id="panel-taller" aria-labelledby="tab-taller" spacing={2}>
          <SectionActions
            title="Hoja de taller"
            description="Una hoja A4 por módulo, con el despiece, los cantos y los herrajes, para armar y controlar."
            extra={
              <Button variant="outlined" startIcon={<OpenInFullIcon />} onClick={() => navigate(`/modulos/${order.id}/taller`, { state: { returnTo: backTo } })}>
                Pantalla completa
              </Button>
            }
          />
          <Box className={`${PRINT_TARGET} taller-fondo`} sx={{ overflowX: "auto", bgcolor: "#e9e4dc", borderRadius: "14px", p: { xs: 1, sm: 2 } }}>
            <WorkshopSheetsView order={order} />
          </Box>
        </Stack>
      )}
      {tab === "materiales" && (
        <Box role="tabpanel" id="panel-materiales" aria-labelledby="tab-materiales">
          <MaterialsTab order={order} onError={(message) => notify(message, "error")} />
        </Box>
      )}
      {tab === "excel" && (
        <Box role="tabpanel" id="panel-excel" aria-labelledby="tab-excel">
          <MachineExcelTab
            order={order}
            materials={materials}
            onSaved={(message) => {
              notify(message);
              void refresh().catch(() => undefined);
            }}
            onError={(message) => notify(message, "error")}
          />
        </Box>
      )}
      {tab === "historial" && (
        <Paper role="tabpanel" id="panel-historial" aria-labelledby="tab-historial" sx={{ p: { xs: 2, sm: 3 }, borderRadius: "14px" }}>
          <Stack component="ol" sx={{ m: 0, p: 0, listStyle: "none" }}>
            {(order.historial ?? []).map((item, index, items) => (
              <Stack component="li" key={item.id} direction="row" spacing={1.75}>
                <Stack alignItems="center" aria-hidden>
                  <Box sx={{ width: 12, height: 12, borderRadius: "50%", mt: 0.6, bgcolor: index === 0 ? "primary.main" : "divider", border: 2, borderColor: "primary.main" }} />
                  {index < items.length - 1 && <Box sx={{ width: 2, flex: 1, bgcolor: "divider", my: 0.5 }} />}
                </Stack>
                <Box sx={{ pb: 2, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={700}>
                    {historyText(item)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(item.fechaCreacion).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {item.usuario.nombre} {item.usuario.apellido}
                  </Typography>
                </Box>
              </Stack>
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
      <ActionSnackbar message={notification} severity={severity} onClose={() => setNotification("")} />
    </Stack>
  );
}
