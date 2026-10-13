import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, ButtonBase, Paper, Stack, Typography, type SxProps, type Theme } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";

export type MetricTone = "primary" | "success" | "warning" | "error" | "neutral" | "info";

/** El color de cada tono. En el tema, success es naranja (la marca): para "esta bien" se usa el verde de los plazos en fecha (DeliveryChip). */
export function useMetricColor(tone: MetricTone) {
  const theme = useTheme();
  if (tone === "neutral") return "#5d544c";
  if (tone === "success") return "#24663f";
  if (tone === "info") return "#2f6f8f";
  return theme.palette[tone].main;
}

/**
 * Un indicador (punto 10, 2026-10-09; rediseñado el 2026-10-13): icono en un cuadro de color, el valor grande y su
 * etiqueta, y una aclaracion opcional. Si tiene onClick, lleva al listado que explica el numero y lo dice con una flecha.
 */
export function MetricTile({
  icon,
  label,
  value,
  hint,
  tone = "primary",
  onClick,
  sx
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricTone;
  onClick?: () => void;
  /** Para ubicarlo en la grilla (por ejemplo, que ocupe dos columnas en el celular). */
  sx?: SxProps<Theme>;
}) {
  const color = useMetricColor(tone);
  const alert = tone === "error" || tone === "warning";
  const content = (
    <Stack direction="row" spacing={{ xs: 1.1, sm: 1.5 }} alignItems="center" sx={{ minWidth: 0, width: "100%" }}>
      <Box
        aria-hidden
        sx={{
          width: { xs: 34, sm: 44 },
          height: { xs: 34, sm: 44 },
          borderRadius: "12px",
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color,
          background: `linear-gradient(145deg, ${alpha(color, 0.18)} 0%, ${alpha(color, 0.07)} 100%)`,
          boxShadow: `inset 0 0 0 1px ${alpha(color, 0.16)}`,
          "& svg": { fontSize: { xs: 20, sm: 23 } }
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, textAlign: "left", flex: 1 }}>
        <Typography component="p" sx={{ color: "text.secondary", fontWeight: 700, fontSize: "0.78rem", lineHeight: 1.25, overflowWrap: "anywhere" }} title={label}>
          {label}
        </Typography>
        <Typography
          className="metric-value"
          component="div"
          sx={{
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            fontSize: { xs: "1.2rem", sm: "1.45rem" },
            fontVariantNumeric: "tabular-nums",
            whiteSpace: { xs: "normal", sm: "nowrap" },
            overflowWrap: "anywhere",
            color: alert || tone === "success" ? color : "text.primary"
          }}
        >
          {value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ lineHeight: 1.3, mt: 0.25 }}>
            {hint}
          </Typography>
        )}
      </Box>
      {onClick && <ChevronRightIcon className="metric-go" aria-hidden sx={{ display: { xs: "none", sm: "block" }, color: alpha(color, 0.55), flexShrink: 0, transition: "transform 160ms ease" }} />}
    </Stack>
  );
  return (
    <Paper
      variant="outlined"
      sx={[
        {
          position: "relative",
          borderRadius: "16px",
          overflow: "hidden",
          minWidth: 0,
          boxShadow: "0 6px 18px rgba(45, 35, 24, 0.05)",
          transition: "box-shadow 160ms ease, transform 140ms ease, border-color 160ms ease",
          // Un filo del color del indicador arriba: separa los tonos sin pintar toda la tarjeta.
          "&::before": { content: '""', position: "absolute", left: 0, right: 0, top: 0, height: 3, background: `linear-gradient(90deg, ${color} 0%, ${alpha(color, 0.25)} 100%)` },
          ...(alert ? { bgcolor: alpha(color, 0.05), borderColor: alpha(color, 0.38) } : {}),
          ...(onClick
            ? {
                "&:hover": { boxShadow: `0 14px 30px ${alpha(color, 0.18)}`, borderColor: alpha(color, 0.45), transform: "translateY(-1px)" },
                "&:hover .metric-go": { transform: "translateX(3px)" },
                "@media (prefers-reduced-motion: reduce)": { "&:hover": { transform: "none" } }
              }
            : {})
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {onClick ? (
        <ButtonBase onClick={onClick} aria-label={`${label}: ver el detalle`} sx={{ width: "100%", height: "100%", p: { xs: 1.5, sm: 1.75 }, justifyContent: "flex-start" }}>
          {content}
        </ButtonBase>
      ) : (
        <Box sx={{ p: { xs: 1.5, sm: 1.75 }, height: "100%", display: "flex", alignItems: "center" }}>{content}</Box>
      )}
    </Paper>
  );
}

/**
 * Una fila de indicadores que usa todo el ancho (2026-10-13): las columnas se reparten el espacio, sin huecos a la
 * derecha, y bajan de renglon cuando no entran.
 */
export function MetricGrid({ children, min = 190, sx }: { children: ReactNode; /** Ancho minimo de cada indicador, en px. Con 260 o mas (importes), en el celular va uno por renglon. */ min?: number; sx?: SxProps<Theme> }) {
  return (
    <Box
      sx={[
        { display: "grid", gap: { xs: 1.25, sm: 1.5 }, gridTemplateColumns: { xs: min >= 260 ? "1fr" : "repeat(auto-fit, minmax(150px, 1fr))", sm: `repeat(auto-fit, minmax(${min}px, 1fr))` } },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {children}
    </Box>
  );
}
