import { Box, Stack, Typography, type SxProps, type Theme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { ReactNode } from "react";

/**
 * El titulo de una seccion (2026-10-13): un icono en un cuadro naranja suave, el titulo y una aclaracion opcional.
 * `action` va a la derecha (baja abajo en el celular).
 */
export function SectionHeading({
  icon,
  title,
  subtitle,
  action,
  variant = "h6",
  component = "h2",
  id,
  sx
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  variant?: "h5" | "h6" | "subtitle1";
  component?: "h2" | "h3" | "h4" | "div";
  /** Para que la seccion se nombre con su titulo (aria-labelledby). */
  id?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      justifyContent="space-between"
      alignItems={{ xs: "stretch", sm: "center" }}
      sx={[{ minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Stack direction="row" spacing={1.5} alignItems={subtitle ? "flex-start" : "center"} sx={{ minWidth: 0 }}>
        <Box
          aria-hidden
          sx={{
            width: 36,
            height: 36,
            borderRadius: "10px",
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: "primary.dark",
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
            "& svg": { fontSize: 20 }
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography id={id} variant={variant} component={component} sx={{ lineHeight: 1.25 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" component="div">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Stack>
  );
}
