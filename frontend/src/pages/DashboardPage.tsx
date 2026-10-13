import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import BlockIcon from "@mui/icons-material/Block";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import KitchenOutlinedIcon from "@mui/icons-material/KitchenOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ViewModuleOutlinedIcon from "@mui/icons-material/ViewModuleOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, ButtonBase, Paper, Skeleton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { DeliveryChip } from "../components/DeliveryChip";
import { MetricGrid, MetricTile } from "../components/MetricTile";
import { getStatusStyle } from "../components/StatusChip";
import { useAuth } from "../context/AuthContext";
import { useTodayInArgentina } from "../hooks/useTodayInArgentina";
import { deliveryStatus, STATUS_ORDER } from "../lib/moduleOrdersList";
import type { CutOrdersStats, DashboardStats, EstadoSolicitud, ModuleOrdersStats } from "../types";

const money = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
/** $ 36,1 M: para las etiquetas chicas de los graficos. */
const shortMoney = (value: number) =>
  value >= 1_000_000
    ? `$ ${(value / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`
    : value >= 1000
      ? `$ ${Math.round(value / 1000).toLocaleString("es-AR")} mil`
      : money(value);
const count = (value: number) => value.toLocaleString("es-AR");
/** "2026-10" -> "oct" (el año solo si no es el de hoy). */
const monthLabel = (mes: string, year: string) => {
  const [y, m] = mes.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return String(y) === year ? name : `${name} ${String(y).slice(2)}`;
};
const shortDate = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
};

/** Un icono por estado, el mismo en todo el dashboard (2026-10-13). */
const STATUS_ICON: Record<EstadoSolicitud, ReactNode> = {
  PENDIENTE: <HourglassEmptyOutlinedIcon />,
  EN_PROCESO: <ConstructionOutlinedIcon />,
  TERMINADA: <TaskAltOutlinedIcon />,
  ENTREGADA: <LocalShippingOutlinedIcon />,
  RECHAZADA: <BlockIcon />
};

type View = "corte" | "modulos" | "stock";
const VIEWS: View[] = ["corte", "modulos", "stock"];

/** Un panel del tablero: titulo con su icono, una aclaracion opcional y el contenido. Todos del mismo alto en su fila. */
function Panel({ title, icon, hint, children, action }: { title: string; icon: ReactNode; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper component="section" aria-label={title} variant="outlined" sx={{ p: { xs: 1.75, sm: 2 }, borderRadius: "16px", display: "flex", flexDirection: "column", minWidth: 0, boxShadow: "0 6px 18px rgba(45, 35, 24, 0.05)" }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
        <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: "10px", display: "grid", placeItems: "center", flexShrink: 0, color: "primary.dark", bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12), "& svg": { fontSize: 19 } }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h3" fontWeight={800} fontSize="0.98rem" lineHeight={1.2} noWrap>
            {title}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary" component="p" noWrap title={hint}>
              {hint}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0 }}>{children}</Box>
    </Paper>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ height: "100%", minHeight: 90, display: "grid", placeItems: "center", textAlign: "center", color: "text.secondary", px: 2 }}>
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}

/** Ranking en barras horizontales (sin librerias): el nombre, la barra y el valor. El primero, mas marcado. */
function RankBars({ items, ariaLabel }: { items: Array<{ key: string; label: string; value: number; text: string }>; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <Stack component="ol" spacing={1.1} aria-label={ariaLabel} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {items.map((item, index) => (
        <Box component="li" key={item.key} sx={{ minWidth: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.4 }}>
            <Typography variant="body2" noWrap title={item.label} sx={{ minWidth: 0, fontWeight: index === 0 ? 800 : 600 }}>
              {item.label}
            </Typography>
            <Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: index === 0 ? "primary.dark" : "text.primary" }}>
              {item.text}
            </Typography>
          </Stack>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1), overflow: "hidden" }}>
            <Box
              sx={{
                height: "100%",
                width: `${Math.max(item.value ? 3 : 0, (item.value / max) * 100)}%`,
                borderRadius: 4,
                background: (theme) => (index === 0 ? `linear-gradient(90deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})` : alpha(theme.palette.primary.main, 0.55))
              }}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

/** Columnas por mes: la cantidad arriba de cada columna y el importe abajo del mes. El mes actual, en color pleno. */
function MonthColumns({ items, ariaLabel }: { items: Array<{ key: string; label: string; value: number; top: string; bottom?: string; title: string }>; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <Box component="ol" aria-label={ariaLabel} sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 0.75, height: "100%", minHeight: 130, alignItems: "end" }}>
      {items.map((item, index) => {
        const current = index === items.length - 1;
        return (
          <Tooltip key={item.key} title={item.title} placement="top">
            <Box component="li" sx={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", minWidth: 0 }}>
              <Typography variant="caption" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums", color: current ? "primary.dark" : "text.primary" }}>
                {item.top}
              </Typography>
              <Box sx={{ width: "100%", maxWidth: 38, flex: 1, display: "flex", alignItems: "flex-end", mt: 0.5 }}>
                <Box
                  sx={{
                    width: "100%",
                    height: `${Math.max(item.value ? 4 : 1.5, (item.value / max) * 100)}%`,
                    borderRadius: "8px 8px 3px 3px",
                    background: (theme) => (current ? `linear-gradient(180deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})` : alpha(theme.palette.primary.main, item.value ? 0.38 : 0.15))
                  }}
                />
              </Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mt: 0.5, textTransform: "capitalize" }}>
                {item.label}
              </Typography>
              {item.bottom && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.66rem", fontVariantNumeric: "tabular-nums", maxWidth: "100%" }}>
                  {item.bottom}
                </Typography>
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

/**
 * Las solicitudes por estado (2026-10-13): una barra con la proporcion de cada estado y una tarjeta por estado con su
 * icono. Las tarjetas se reparten todo el ancho, haya uno o cinco estados. Tocar un estado abre el listado filtrado.
 */
function StatusOverview({ items, onOpen }: { items: Array<{ estado: EstadoSolicitud; total: number }>; onOpen: (estado: EstadoSolicitud) => void }) {
  const visible = items.filter((item) => item.total > 0).sort((a, b) => STATUS_ORDER.indexOf(a.estado) - STATUS_ORDER.indexOf(b.estado));
  const total = visible.reduce((sum, item) => sum + item.total, 0);
  if (!total) return <Empty>Todavía no hay solicitudes.</Empty>;
  return (
    <Stack spacing={1.25}>
      <Box aria-hidden sx={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: "2px" }}>
        {visible.map((item) => (
          <Box key={item.estado} sx={{ flex: item.total, bgcolor: getStatusStyle(item.estado).border }} />
        ))}
      </Box>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(150px, 1fr))" } }}>
        {visible.map((item) => {
          const style = getStatusStyle(item.estado);
          const share = Math.round((item.total / total) * 100);
          return (
            <ButtonBase
              key={item.estado}
              onClick={() => onOpen(item.estado)}
              aria-label={`${style.label}: ${item.total} solicitudes, ver el listado`}
              sx={{
                justifyContent: "flex-start",
                gap: 1.25,
                px: 1.25,
                py: 1,
                borderRadius: "12px",
                border: `1px solid ${style.border}`,
                background: style.gradient,
                textAlign: "left",
                transition: "box-shadow 160ms ease, transform 140ms ease",
                "&:hover": { boxShadow: `0 10px 22px ${alpha(style.fg, 0.16)}`, transform: "translateY(-1px)" },
                "@media (prefers-reduced-motion: reduce)": { "&:hover": { transform: "none" } }
              }}
            >
              <Box aria-hidden sx={{ width: 34, height: 34, borderRadius: "10px", display: "grid", placeItems: "center", flexShrink: 0, color: style.fg, bgcolor: alpha("#ffffff", 0.7), "& svg": { fontSize: 19 } }}>
                {STATUS_ICON[item.estado]}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={800} sx={{ color: style.fg }} noWrap>
                  {style.label}
                </Typography>
                <Typography variant="caption" sx={{ color: alpha(style.fg, 0.85) }}>
                  {share}% del total
                </Typography>
              </Box>
              <Typography fontWeight={900} fontSize="1.35rem" sx={{ color: style.fg, fontVariantNumeric: "tabular-nums" }}>
                {count(item.total)}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Stack>
  );
}

/** Una fila de una lista del tablero (entregas, pendientes): clickeable, con lo principal a la izquierda y un chip a la derecha. */
function ListRow({ onClick, title, subtitle, end }: { onClick: () => void; title: string; subtitle: string; end: ReactNode }) {
  return (
    <ButtonBase onClick={onClick} sx={{ width: "100%", justifyContent: "space-between", gap: 1, px: 1, py: 0.5, borderRadius: "10px", textAlign: "left", "&:hover": { bgcolor: "action.hover" } }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={800} noWrap>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="p">
          {subtitle}
        </Typography>
      </Box>
      {end}
    </ButtonBase>
  );
}

function AgeChip({ dias }: { dias: number }) {
  const tone = dias > 30 ? { fg: "#96382b", bg: "#fde9e5", border: "#efb1a6" } : dias > 14 ? { fg: "#8a5806", bg: "#fff5df", border: "#f2d08a" } : { fg: "#45403b", bg: "#efeeec", border: "#d4d0cb" };
  return (
    <Box component="span" title={`Esperando hace ${dias} ${dias === 1 ? "día" : "días"}`} sx={{ flexShrink: 0, px: 1, py: 0.25, borderRadius: "999px", fontSize: "0.75rem", fontWeight: 800, color: tone.fg, bgcolor: tone.bg, border: `1px solid ${tone.border}`, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {dias === 0 ? "Hoy" : dias === 1 ? "1 día" : `${dias} días`}
    </Box>
  );
}

function CutDashboard({ stats, corte, year }: { stats: DashboardStats; corte: CutOrdersStats; year: string }) {
  const navigate = useNavigate();
  const pendientes = corte.porEstado.find((item) => item.estado === "PENDIENTE")?.total ?? 0;
  const { solicitudes, anteriores } = corte.ultimos30;
  const change = anteriores ? Math.round(((solicitudes - anteriores) / anteriores) * 100) : null;
  const byStatus = stats.byStatus.map((item) => ({ estado: item.estado, total: item.total - (item.modulos ?? 0) }));
  return (
    <Stack spacing={1.5}>
      <MetricGrid min={200}>
        <MetricTile
          icon={<HourglassBottomOutlinedIcon />}
          label="En curso"
          value={count(corte.activas)}
          hint={`${count(pendientes)} pendientes de empezar`}
          onClick={() => navigate("/pedidos")}
        />
        <MetricTile
          icon={<ReportProblemOutlinedIcon />}
          label="Pendientes sin stock"
          value={count(corte.sinStock)}
          tone={corte.sinStock ? "warning" : "success"}
          hint={corte.sinStock ? `De ${pendientes} pendientes` : "Todas se pueden cortar"}
          onClick={() => navigate("/?vista=stock")}
        />
        <MetricTile icon={<LayersOutlinedIcon />} label="Placas en curso" value={count(corte.placasActivas)} hint={`${count(corte.piezasActivas)} piezas por cortar`} tone="neutral" />
        <MetricTile
          icon={change === null ? <TrendingFlatIcon /> : change >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
          label="Últimos 30 días"
          value={count(solicitudes)}
          tone={change === null || change === 0 ? "neutral" : change > 0 ? "success" : "warning"}
          hint={change === null ? "Solicitudes nuevas" : `${change > 0 ? "+" : ""}${change}% contra los 30 días anteriores`}
        />
      </MetricGrid>
      <MetricGrid min={280}>
        <MetricTile icon={<PaymentsOutlinedIcon />} label="Presupuesto en curso" value={money(corte.presupuestoActivo)} hint="Pendientes, en proceso y terminadas" />
        <MetricTile icon={<ReceiptLongOutlinedIcon />} label="Ticket promedio" value={money(corte.ticketPromedio)} hint="Solicitudes de los últimos 90 días" tone="neutral" />
      </MetricGrid>
      <Panel title="Solicitudes por estado" icon={<AssignmentOutlinedIcon />} hint="Tocá un estado para ver el listado">
        <StatusOverview items={byStatus} onOpen={(estado) => navigate(`/pedidos?estado=${encodeURIComponent(estado)}`)} />
      </Panel>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "1fr 1.2fr 1fr 1fr" } }}>
        <Panel title="Últimos 6 meses" icon={<CalendarMonthOutlinedIcon />} hint="Solicitudes por mes y su presupuesto">
          <MonthColumns
            ariaLabel="Solicitudes de corte por mes"
            items={corte.meses.map((item) => ({
              key: item.mes,
              label: monthLabel(item.mes, year),
              value: item.solicitudes,
              top: count(item.solicitudes),
              bottom: item.presupuesto ? shortMoney(item.presupuesto) : "—",
              title: `${item.solicitudes} solicitudes, ${count(item.piezas)} piezas, ${money(item.presupuesto)}`
            }))}
          />
        </Panel>
        <Panel title="Pendientes más antiguas" icon={<AccessTimeIcon />} hint="Para atenderlas primero">
          {corte.masAntiguas.length ? (
            <Stack component="ul" spacing={0.25} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {corte.masAntiguas.slice(0, 5).map((item) => (
                <Box component="li" key={item.id}>
                  <ListRow onClick={() => navigate(`/pedidos/${item.id}`)} title={`N.º ${item.numero} · ${item.cliente}`} subtitle={`Cargada el ${shortDate(item.creada)}`} end={<AgeChip dias={item.dias} />} />
                </Box>
              ))}
            </Stack>
          ) : (
            <Empty>No hay solicitudes pendientes.</Empty>
          )}
        </Panel>
        <Panel title="Materiales más cortados" icon={<LayersOutlinedIcon />} hint="Piezas de los últimos 90 días">
          {corte.topMateriales.length ? (
            <RankBars ariaLabel="Materiales más cortados" items={corte.topMateriales.slice(0, 5).map((item) => ({ key: item.nombre, label: item.nombre, value: item.piezas, text: count(item.piezas) }))} />
          ) : (
            <Empty>Sin cortes en los últimos 90 días.</Empty>
          )}
        </Panel>
        <Panel title="Quiénes más cargan" icon={<GroupsOutlinedIcon />} hint="Solicitudes de los últimos 90 días">
          {corte.topCarpinteros.length ? (
            <RankBars ariaLabel="Quiénes más cargan" items={corte.topCarpinteros.map((item) => ({ key: item.nombre, label: item.nombre, value: item.solicitudes, text: count(item.solicitudes) }))} />
          ) : (
            <Empty>Sin solicitudes en los últimos 90 días.</Empty>
          )}
        </Panel>
      </Box>
    </Stack>
  );
}

function ModulesDashboard({ stats, m, year, today }: { stats: DashboardStats; m: ModuleOrdersStats; year: string; today: string }) {
  const navigate = useNavigate();
  const cumplimiento = m.cumplimiento.entregadas ? Math.round((m.cumplimiento.aTiempo / m.cumplimiento.entregadas) * 100) : null;
  const byStatus = stats.byStatus.map((item) => ({ estado: item.estado, total: item.modulos ?? 0 }));
  const categorias = m.topCategorias ?? [];
  return (
    <Stack spacing={1.5}>
      <MetricGrid min={200}>
        <MetricTile
          icon={<HourglassBottomOutlinedIcon />}
          label="En curso"
          value={count(m.activas)}
          hint={`${count(m.modulosActivos)} módulos · ${count(m.placasActivas)} placas`}
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
      </MetricGrid>
      {/* La plata en su propio renglon (2026-10-13): con importes grandes no entraba al lado de los contadores. */}
      <MetricGrid min={280}>
        <MetricTile icon={<PaymentsOutlinedIcon />} label="Presupuesto en curso" value={money(m.presupuestoActivo)} hint="Con herrajes, de las que están en curso" />
        <MetricTile icon={<ReceiptLongOutlinedIcon />} label="Ticket promedio" value={money(m.ticketPromedio)} hint="Solicitudes de los últimos 90 días" tone="neutral" />
      </MetricGrid>
      <Panel title="Solicitudes por estado" icon={<AssignmentOutlinedIcon />} hint="Tocá un estado para ver el listado">
        <StatusOverview items={byStatus} onOpen={(estado) => navigate(`/modulos?estado=${encodeURIComponent(estado)}`)} />
      </Panel>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "1fr 1.2fr 1fr 1fr" } }}>
        <Panel title="Próximas entregas" icon={<EventOutlinedIcon />} hint="Las que vencen primero">
          {m.proximas.length ? (
            <Stack component="ul" spacing={0.25} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {m.proximas.slice(0, 5).map((item) => (
                <Box component="li" key={item.id}>
                  <ListRow
                    onClick={() => navigate(`/modulos/${item.id}`, { state: { returnTo: "/?vista=modulos" } })}
                    title={`M-${item.numero} · ${item.cliente}`}
                    subtitle={`${getStatusStyle(item.estado).label}${item.fechaEntrega ? ` · entrega el ${shortDate(item.fechaEntrega)}` : ""}`}
                    end={<DeliveryChip size="small" status={deliveryStatus({ estado: item.estado, fechaEntrega: item.fechaEntrega }, today, m.diasAviso)} />}
                  />
                </Box>
              ))}
            </Stack>
          ) : (
            <Empty>No hay entregas pendientes.</Empty>
          )}
        </Panel>
        <Panel title="Últimos 6 meses" icon={<CalendarMonthOutlinedIcon />} hint="Con herrajes, sin las rechazadas">
          <MonthColumns
            ariaLabel="Solicitudes de módulos por mes"
            items={m.meses.map((item) => ({
              key: item.mes,
              label: monthLabel(item.mes, year),
              value: item.solicitudes,
              top: count(item.solicitudes),
              bottom: item.presupuesto ? shortMoney(item.presupuesto) : "—",
              title: `${item.solicitudes} solicitudes, ${money(item.presupuesto)}`
            }))}
          />
        </Panel>
        <Panel title="Módulos más pedidos" icon={<KitchenOutlinedIcon />} hint="Cantidad de módulos, sin las rechazadas">
          {m.topModulos.length ? (
            <RankBars ariaLabel="Módulos más pedidos" items={m.topModulos.map((item) => ({ key: item.nombre, label: item.nombre, value: item.cantidad, text: count(item.cantidad) }))} />
          ) : (
            <Empty>Todavía no hay módulos pedidos.</Empty>
          )}
        </Panel>
        <Panel title="Tipos más pedidos" icon={<CategoryOutlinedIcon />} hint="Por categoría del catálogo">
          {categorias.length ? (
            <RankBars ariaLabel="Tipos más pedidos" items={categorias.map((item) => ({ key: item.nombre, label: item.nombre, value: item.cantidad, text: count(item.cantidad) }))} />
          ) : (
            <Empty>Todavía no hay módulos pedidos.</Empty>
          )}
        </Panel>
      </Box>
    </Stack>
  );
}

function StockDashboard({ stats }: { stats: DashboardStats }) {
  const navigate = useNavigate();
  const alerts = stats.stockAlerts;
  const faltan = alerts.reduce((sum, alert) => sum + alert.faltantePlacas, 0);
  const necesitan = alerts.reduce((sum, alert) => sum + alert.placasPendientes, 0);
  return (
    <Stack spacing={1.5}>
      <MetricGrid min={220}>
        <MetricTile icon={<Inventory2OutlinedIcon />} label="Materiales con faltante" value={count(alerts.length)} tone={alerts.length ? "warning" : "success"} hint={alerts.length ? "No alcanzan para las pendientes" : "El stock alcanza"} onClick={() => navigate("/materiales")} />
        <MetricTile icon={<ReportProblemOutlinedIcon />} label="Placas que faltan" value={count(faltan)} tone={faltan ? "error" : "success"} hint="Para cubrir todas las pendientes" />
        <MetricTile icon={<LayersOutlinedIcon />} label="Placas que piden las pendientes" value={count(necesitan)} tone="neutral" hint="De los materiales con faltante" onClick={() => navigate("/pedidos?estado=PENDIENTE")} />
      </MetricGrid>
      <Panel title="Alertas de stock" icon={<LayersOutlinedIcon />} hint="Placas que no alcanzan para las solicitudes pendientes, de mayor a menor faltante">
        {alerts.length ? (
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {alerts.map((alert) => {
              const cubierto = alert.placasPendientes ? Math.min(100, Math.round((alert.stockDisponible / alert.placasPendientes) * 100)) : 100;
              return (
                <ButtonBase
                  key={alert.materialId}
                  onClick={() => navigate("/pedidos?estado=PENDIENTE")}
                  sx={{ display: "block", textAlign: "left", p: 1.5, borderRadius: "12px", border: 1, borderColor: (theme) => alpha(theme.palette.warning.main, 0.4), bgcolor: (theme) => alpha(theme.palette.warning.main, 0.05), "&:hover": { bgcolor: (theme) => alpha(theme.palette.warning.main, 0.1) } }}
                >
                  <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="baseline">
                    <Typography variant="body2" fontWeight={800} noWrap title={alert.materialNombre} sx={{ minWidth: 0 }}>
                      {alert.materialNombre}
                    </Typography>
                    <Typography variant="body2" fontWeight={900} color="error.dark" sx={{ whiteSpace: "nowrap" }}>
                      Faltan {alert.faltantePlacas}
                    </Typography>
                  </Stack>
                  <Box aria-hidden sx={{ my: 0.75, height: 6, borderRadius: 3, bgcolor: (theme) => alpha(theme.palette.error.main, 0.18), overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${cubierto}%`, bgcolor: "warning.main", borderRadius: 3 }} />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Hay {alert.stockDisponible} de {alert.placasPendientes} · {alert.pedidosPendientes === 1 ? "1 solicitud" : `${alert.pedidosPendientes} solicitudes`}
                  </Typography>
                </ButtonBase>
              );
            })}
          </Box>
        ) : (
          <Empty>No hay faltantes de stock para cubrir las solicitudes pendientes.</Empty>
        )}
      </Panel>
    </Stack>
  );
}

/**
 * Dashboard (2026-10-13): una pestaña por parte del sistema (solicitudes de corte, de módulos y stock), cada una con su
 * tablero, para analizar todo desde una pantalla sin bajar. La pestaña queda en la URL (?vista=).
 */
export function DashboardPage() {
  const { user } = useAuth();
  const today = useTodayInArgentina();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const requested = searchParams.get("vista") as View | null;
  const view: View = requested && VIEWS.includes(requested) ? requested : "corte";

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

  const year = today.slice(0, 4);
  const alertCount = stats?.stockAlerts.length ?? 0;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 1.5, md: 3 }} alignItems={{ xs: "stretch", md: "flex-end" }} justifyContent="space-between">
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4">Dashboard</Typography>
          <Typography color="text.secondary">Cada pestaña analiza una parte del sistema.</Typography>
        </Box>
        <Tabs
          value={view}
          onChange={(_event, next: View) => setSearchParams(next === "corte" ? {} : { vista: next }, { replace: true })}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Partes del dashboard"
          sx={{
            minHeight: 44,
            p: 0.5,
            borderRadius: "14px",
            bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.07),
            "& .MuiTabs-indicator": { height: "100%", borderRadius: "10px", bgcolor: "background.paper", boxShadow: "0 4px 14px rgba(45,35,24,0.12)", zIndex: 0 },
            "& .MuiTab-root": { zIndex: 1, minHeight: 40, borderRadius: "10px", fontWeight: 800, textTransform: "none", px: 2, color: "text.secondary", transition: "color 140ms" },
            "& .MuiTab-root:hover": { color: "text.primary" },
            "& .Mui-selected": { color: "primary.dark !important" }
          }}
        >
          <Tab value="corte" icon={<ContentCutIcon fontSize="small" />} iconPosition="start" label="Solicitudes de corte" />
          <Tab value="modulos" icon={<ViewModuleOutlinedIcon fontSize="small" />} iconPosition="start" label="Solicitudes de módulos" />
          <Tab
            value="stock"
            icon={<Inventory2OutlinedIcon fontSize="small" />}
            iconPosition="start"
            label={
              <Stack direction="row" spacing={0.75} alignItems="center" component="span">
                <span>Stock</span>
                {alertCount > 0 && (
                  <Box component="span" aria-label={`${alertCount} alertas`} sx={{ minWidth: 20, height: 20, px: 0.6, borderRadius: "10px", display: "inline-grid", placeItems: "center", fontSize: 11, fontWeight: 900, color: "#fff", bgcolor: "warning.main" }}>
                    {alertCount > 99 ? "99+" : alertCount}
                  </Box>
                )}
              </Stack>
            }
          />
        </Tabs>
      </Stack>

      {!stats ? (
        <Stack spacing={2}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="rounded" height={84} sx={{ borderRadius: "16px" }} />
            ))}
          </Box>
          <Skeleton variant="rounded" height={120} sx={{ borderRadius: "16px" }} />
          <Skeleton variant="rounded" height={260} sx={{ borderRadius: "16px" }} />
        </Stack>
      ) : view === "corte" ? (
        stats.corte ? <CutDashboard stats={stats} corte={stats.corte} year={year} /> : <Empty>No se pudieron cargar los datos de corte.</Empty>
      ) : view === "modulos" ? (
        stats.modulos ? <ModulesDashboard stats={stats} m={stats.modulos} year={year} today={today} /> : <Empty>No se pudieron cargar los datos de módulos.</Empty>
      ) : (
        <StockDashboard stats={stats} />
      )}
    </Stack>
  );
}
