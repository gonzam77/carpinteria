import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import StraightenIcon from "@mui/icons-material/Straighten";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import ViewModuleOutlinedIcon from "@mui/icons-material/ViewModuleOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, Button, ButtonBase, Chip, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useState, type ReactNode } from "react";
import { STATUS_ORDER } from "../lib/moduleOrdersList";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { DeliveryChip } from "../components/DeliveryChip";
import { MetricTile } from "../components/MetricTile";
import { getStatusStyle, StatusChip } from "../components/StatusChip";
import { useAuth } from "../context/AuthContext";
import { useTodayInArgentina } from "../hooks/useTodayInArgentina";
import { deliveryStatus } from "../lib/moduleOrdersList";
import { DashboardStats, EstadoSolicitud } from "../types";

const money = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const count = (value: number) => value.toLocaleString("es-AR");
/** "2026-10" -> "oct" (el año solo si no es el de hoy). */
const monthLabel = (mes: string, year: string) => {
  const [y, m] = mes.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return String(y) === year ? name : `${name} ${String(y).slice(2)}`;
};

/** Una seccion del dashboard: titulo, aclaracion y su contenido. */
function Section({ title, description, icon, children, action }: { title: string; description?: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper component="section" aria-label={title} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "16px" }}>
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          {icon && (
            <Box sx={{ color: "primary.main", display: "flex" }} aria-hidden>
              {icon}
            </Box>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" fontWeight={800} fontSize="1.05rem">
              {title}
            </Typography>
            {description && (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            )}
          </Box>
        </Stack>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

/** Barras horizontales simples (sin librerias): una por fila, con su valor a la derecha. */
function Bars({ items, ariaLabel, labelWidth = "30%" }: { items: Array<{ key: string; label: string; value: number; text: string }>; ariaLabel: string; labelWidth?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <Stack component="ul" spacing={1} aria-label={ariaLabel} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {items.map((item) => (
        <Box component="li" key={item.key} sx={{ display: "grid", gridTemplateColumns: `minmax(64px, ${labelWidth}) 1fr auto`, gap: 1, alignItems: "center" }}>
          <Typography variant="body2" noWrap title={item.label} sx={{ minWidth: 0 }}>
            {item.label}
          </Typography>
          <Box sx={{ height: 10, borderRadius: 5, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12), overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${Math.max(item.value ? 4 : 0, (item.value / max) * 100)}%`, bgcolor: "primary.main", borderRadius: 5 }} />
          </Box>
          <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {item.text}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

/** Dashboard (puntos 8 y 10, 2026-10-09): lo general, las solicitudes por estado, los modulos a medida y el stock. */
export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useTodayInArgentina();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [allAlerts, setAllAlerts] = useState(false);

  useEffect(() => {
    if (user?.rol === "ADMIN") api.get<DashboardStats>("/stats").then((response) => setStats(response.data));
  }, [user]);

  if (user?.rol !== "ADMIN") {
    return (
      <Stack spacing={1}>
        <Typography variant="h4">Mis solicitudes</Typography>
        <Typography color="text.secondary">Solicitá cortes, revisá tus solicitudes y consultá el estado de cada trabajo.</Typography>
      </Stack>
    );
  }

  const modulosTotal = stats?.byTipo?.find((item) => item.tipo === "MODULOS")?.total ?? 0;
  const corteTotal = stats?.byTipo?.find((item) => item.tipo === "CORTE")?.total ?? Math.max(0, (stats?.totalOrders ?? 0) - modulosTotal);
  const m = stats?.modulos;
  const cumplimiento = m && m.cumplimiento.entregadas ? Math.round((m.cumplimiento.aTiempo / m.cumplimiento.entregadas) * 100) : null;
  const year = today.slice(0, 4);

  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Dashboard</Typography>
        <Typography color="text.secondary">El estado de las solicitudes de corte y de módulos, las entregas y el stock, de un vistazo.</Typography>
      </Stack>

      {!stats ? (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} variant="rounded" height={76} />
          ))}
        </Box>
      ) : (
        <>
          {/* General */}
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0, 1fr))" } }}>
            <MetricTile icon={<ContentCutIcon />} label="Solicitudes de corte" value={count(corteTotal)} onClick={() => navigate("/pedidos")} />
            <MetricTile icon={<ViewModuleOutlinedIcon />} label="Solicitudes de módulos" value={count(modulosTotal)} onClick={() => navigate("/modulos")} />
            <MetricTile icon={<StraightenIcon />} label="Piezas cargadas" value={count(stats.totalPieces)} tone="neutral" />
            <MetricTile icon={<PeopleOutlineIcon />} label="Usuarios" value={count(stats.totalUsers)} tone="neutral" />
          </Box>

          {/* Por estado, separadas por tipo */}
          <Section title="Solicitudes por estado" description="Tocá un estado para ver el listado." icon={<AssignmentOutlinedIcon />}>
            <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(5, minmax(0, 1fr))" } }}>
              {[...stats.byStatus].sort((a, b) => STATUS_ORDER.indexOf(a.estado) - STATUS_ORDER.indexOf(b.estado)).map((item) => {
                const style = getStatusStyle(item.estado as EstadoSolicitud);
                const modulos = item.modulos ?? 0;
                const corte = item.total - modulos;
                return (
                  <Paper key={item.estado} variant="outlined" sx={{ p: 1.5, borderRadius: "12px", borderColor: style.border, background: style.gradient }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <StatusChip size="small" status={item.estado as EstadoSolicitud} />
                      <Typography fontWeight={800} fontSize="1.2rem" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {count(item.total)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <ButtonBase onClick={() => navigate(`/pedidos?estado=${encodeURIComponent(item.estado)}`)} sx={{ borderRadius: "8px", px: 1, py: 0.5, flex: 1, justifyContent: "space-between", bgcolor: alpha("#fff", 0.6) }}>
                        <Typography variant="caption" color="text.secondary">
                          Corte
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {count(corte)}
                        </Typography>
                      </ButtonBase>
                      <ButtonBase onClick={() => navigate(`/modulos?estado=${encodeURIComponent(item.estado)}`)} sx={{ borderRadius: "8px", px: 1, py: 0.5, flex: 1, justifyContent: "space-between", bgcolor: alpha("#fff", 0.6) }}>
                        <Typography variant="caption" color="text.secondary">
                          Módulos
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {count(modulos)}
                        </Typography>
                      </ButtonBase>
                    </Stack>
                  </Paper>
                );
              })}
            </Box>
          </Section>

          {/* Modulos a medida (punto 8) */}
          {m && (
            <Section title="Solicitudes de módulos" description="Lo que está en curso, las entregas y la plata." icon={<ViewModuleOutlinedIcon />}>
              <Stack spacing={2}>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" } }}>
                  <MetricTile
                    icon={<HourglassBottomOutlinedIcon />}
                    label="En curso"
                    value={count(m.activas)}
                    hint={m.porEstado.map((item) => `${item.total} ${getStatusStyle(item.estado).label.toLowerCase()}`).join(" · ")}
                    onClick={() => navigate("/modulos")}
                  />
                  <MetricTile
                    icon={<EventBusyOutlinedIcon />}
                    label="Entregas vencidas"
                    value={count(m.vencidas)}
                    tone={m.vencidas ? "error" : "success"}
                    hint={m.vencidas ? "Pasó la fecha y no se entregaron" : "Ninguna atrasada"}
                    onClick={() => navigate("/modulos")}
                  />
                  <MetricTile
                    icon={<WarningAmberIcon />}
                    label="Por vencer"
                    value={count(m.porVencer)}
                    tone={m.porVencer ? "warning" : "neutral"}
                    hint={`En ${m.diasAviso} ${m.diasAviso === 1 ? "día" : "días"} o menos`}
                    onClick={() => navigate("/modulos")}
                  />
                  <MetricTile
                    icon={<TaskAltOutlinedIcon />}
                    label="Entregadas a tiempo"
                    value={cumplimiento === null ? "—" : `${cumplimiento}%`}
                    tone={cumplimiento === null ? "neutral" : cumplimiento >= 90 ? "success" : cumplimiento >= 70 ? "warning" : "error"}
                    hint={m.cumplimiento.entregadas ? `${m.cumplimiento.aTiempo} de ${m.cumplimiento.entregadas} en 90 días` : "Sin entregas en 90 días"}
                  />
                  <MetricTile sx={{ gridColumn: { xs: "span 2", md: "auto" } }} icon={<PaymentsOutlinedIcon />} label="Presupuesto en curso" value={money(m.presupuestoActivo)} hint={`${count(m.modulosActivos)} módulos · ${count(m.placasActivas)} placas`} />
                  <MetricTile sx={{ gridColumn: { xs: "span 2", md: "auto" } }} icon={<ReceiptLongOutlinedIcon />} label="Ticket promedio" value={money(m.ticketPromedio)} hint="Últimos 90 días" tone="neutral" />
                </Box>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1.3fr 1fr 1fr" } }}>
                  <Paper variant="outlined" component="section" aria-label="Próximas entregas" sx={{ p: 1.75, borderRadius: "14px" }}>
                    <Typography component="h3" fontWeight={800} fontSize="0.95rem" sx={{ mb: 1 }}>
                      Próximas entregas
                    </Typography>
                    {m.proximas.length ? (
                      <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
                        {m.proximas.map((item) => (
                          <Box component="li" key={item.id}>
                            <ButtonBase
                              onClick={() => navigate(`/modulos/${item.id}`, { state: { returnTo: "/" } })}
                              sx={{ width: "100%", justifyContent: "space-between", gap: 1, px: 1, py: 0.75, borderRadius: "10px", "&:hover": { bgcolor: "action.hover" } }}
                            >
                              <Box sx={{ minWidth: 0, textAlign: "left" }}>
                                <Typography variant="body2" fontWeight={800} noWrap>
                                  M-{item.numero} · {item.cliente}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {getStatusStyle(item.estado).label}
                                </Typography>
                              </Box>
                              <DeliveryChip size="small" status={deliveryStatus({ estado: item.estado, fechaEntrega: item.fechaEntrega }, today, m.diasAviso)} />
                            </ButtonBase>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No hay entregas pendientes.
                      </Typography>
                    )}
                  </Paper>
                  <Paper variant="outlined" component="section" aria-label="Últimos 6 meses" sx={{ p: 1.75, borderRadius: "14px" }}>
                    <Typography component="h3" fontWeight={800} fontSize="0.95rem" sx={{ mb: 1.25 }}>
                      Últimos 6 meses
                    </Typography>
                    <Bars
                      ariaLabel="Solicitudes de módulos por mes"
                      items={m.meses.map((item) => ({ key: item.mes, label: monthLabel(item.mes, year), value: item.presupuesto, text: `${item.solicitudes} · ${money(item.presupuesto)}` }))}
                    />
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                      Solicitudes y presupuesto con herrajes, sin las rechazadas.
                    </Typography>
                  </Paper>
                  <Paper variant="outlined" component="section" aria-label="Módulos más pedidos" sx={{ p: 1.75, borderRadius: "14px" }}>
                    <Typography component="h3" fontWeight={800} fontSize="0.95rem" sx={{ mb: 1.25 }}>
                      Módulos más pedidos
                    </Typography>
                    {m.topModulos.length ? (
                      <Bars ariaLabel="Módulos más pedidos" labelWidth="55%" items={m.topModulos.map((item) => ({ key: item.nombre, label: item.nombre, value: item.cantidad, text: count(item.cantidad) }))} />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Todavía no hay módulos pedidos.
                      </Typography>
                    )}
                  </Paper>
                </Box>
              </Stack>
            </Section>
          )}

          {/* Stock */}
          <Section
            title="Alertas de stock"
            description="Placas que no alcanzan para las solicitudes pendientes."
            icon={<LayersOutlinedIcon />}
            action={stats.stockAlerts.length ? <Chip size="small" color="warning" label={stats.stockAlerts.length} sx={{ fontWeight: 800 }} /> : undefined}
          >
            {stats.stockAlerts.length ? (
              <Stack spacing={1.5}>
                <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
                  {(allAlerts ? stats.stockAlerts : stats.stockAlerts.slice(0, 6)).map((alert) => (
                    <ButtonBase
                      key={alert.materialId}
                      onClick={() => navigate("/pedidos?estado=PENDIENTE")}
                      sx={{ display: "block", textAlign: "left", p: 1.25, borderRadius: "12px", border: 1, borderColor: (theme) => alpha(theme.palette.warning.main, 0.35), bgcolor: (theme) => alpha(theme.palette.warning.main, 0.06) }}
                    >
                      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="baseline">
                        <Typography variant="body2" fontWeight={800} noWrap title={alert.materialNombre} sx={{ minWidth: 0 }}>
                          {alert.materialNombre}
                        </Typography>
                        <Typography variant="body2" fontWeight={800} color="warning.dark" sx={{ whiteSpace: "nowrap" }}>
                          Faltan {alert.faltantePlacas}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Hay {alert.stockDisponible} · {alert.pedidosPendientes === 1 ? "1 solicitud necesita" : `${alert.pedidosPendientes} solicitudes necesitan`} {alert.placasPendientes}
                      </Typography>
                    </ButtonBase>
                  ))}
                </Box>
                {stats.stockAlerts.length > 6 && (
                  <Box>
                    <Button size="small" onClick={() => setAllAlerts((value) => !value)}>
                      {allAlerts ? "Ver menos" : `Ver las ${stats.stockAlerts.length}`}
                    </Button>
                  </Box>
                )}
              </Stack>
            ) : (
              <Typography color="text.secondary">No hay faltantes de stock para cubrir las solicitudes pendientes.</Typography>
            )}
          </Section>
        </>
      )}
    </Stack>
  );
}
