import { Box, ButtonBase, Paper, Stack, Typography, type SxProps, type Theme } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";

export type MetricTone = "primary" | "success" | "warning" | "error" | "neutral";

/**
 * Un indicador compacto (punto 10, 2026-10-09): icono en un cuadro de color, el valor y su etiqueta, y una aclaracion
 * opcional. Del tamaño justo para leer varios de un vistazo. Si tiene onClick, lleva al listado que explica el numero.
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
  const theme = useTheme();
  // En el tema, success es naranja (la marca): para "esta bien" se usa el verde de los plazos en fecha (DeliveryChip).
  const color = tone === "neutral" ? theme.palette.text.secondary : tone === "success" ? "#24663f" : theme.palette[tone].main;
  const content = (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, width: "100%" }}>
      <Box
        aria-hidden
        sx={{ width: { xs: 34, sm: 40 }, height: { xs: 34, sm: 40 }, borderRadius: "11px", flexShrink: 0, display: "grid", placeItems: "center", bgcolor: alpha(color, 0.12), color, "& svg": { fontSize: 21 } }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, textAlign: "left" }}>
        <Typography variant="caption" color="text.secondary" fontWeight={700} component="p" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: "0.68rem", lineHeight: 1.3 }}>
          {label}
        </Typography>
        <Typography className="metric-value" component="div" fontWeight={800} lineHeight={1.2} sx={{ fontSize: { xs: "1.1rem", sm: "1.3rem" }, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: tone === "error" || tone === "warning" || tone === "success" ? color : "text.primary" }}>
          {value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ lineHeight: 1.3 }}>
            {hint}
          </Typography>
        )}
      </Box>
    </Stack>
  );
  return (
    <Paper variant="outlined" sx={[{ borderRadius: "14px", overflow: "hidden", transition: "box-shadow 120ms", ...(tone === "error" || tone === "warning" ? { bgcolor: alpha(color, 0.06), borderColor: alpha(color, 0.4) } : {}), "&:hover": onClick ? { boxShadow: `0 10px 22px ${alpha(color, 0.14)}` } : undefined }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {onClick ? (
        <ButtonBase onClick={onClick} sx={{ width: "100%", height: "100%", p: { xs: 1.25, sm: 1.75 }, justifyContent: "flex-start" }}>
          {content}
        </ButtonBase>
      ) : (
        <Box sx={{ p: { xs: 1.25, sm: 1.75 } }}>{content}</Box>
      )}
    </Paper>
  );
}
