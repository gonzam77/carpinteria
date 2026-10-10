import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import { Box, Button, CircularProgress, GlobalStyles, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";

/** Clase del contenido que se imprime de la pestaña abierta (solo hay una montada a la vez). */
export const PRINT_TARGET = "impresion-objetivo";
const PRINTING = "imprimiendo-seccion";

/**
 * Imprimir una pestaña del detalle (tambien para "Guardar como PDF"): en papel sale solo lo que esta dentro de
 * PRINT_TARGET, sin la barra, el menu ni los botones. Lo que lleva "solo-impresion" se ve solo en papel.
 */
export const detailPrintStyles = (
  <GlobalStyles
    styles={{
      ".solo-impresion": { display: "none" },
      "@media print": {
        [`body.${PRINTING} *`]: { visibility: "hidden" },
        [`body.${PRINTING} .${PRINT_TARGET}, body.${PRINTING} .${PRINT_TARGET} *`]: { visibility: "visible" },
        [`body.${PRINTING} .${PRINT_TARGET}`]: { position: "absolute", left: 0, top: 0, width: "100%", boxShadow: "none !important" },
        ".no-imprimir": { display: "none !important" },
        ".solo-impresion": { display: "block !important" },
        "html, body": { background: "#fff !important" }
      }
    }}
  />
);

/** Abre la impresion con solo el contenido de la pestaña. Al cerrar el dialogo, la pagina queda como estaba. */
export function printSection() {
  document.body.classList.add(PRINTING);
  const done = () => {
    document.body.classList.remove(PRINTING);
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

/**
 * Encabezado de una pestaña del detalle con sus acciones: descargar (si hay archivo), PDF e imprimir. En celular los
 * botones pasan abajo del titulo y ocupan el ancho.
 */
export function SectionActions({
  title,
  description,
  download,
  extra
}: {
  title: string;
  description?: ReactNode;
  download?: { label: string; busy: boolean; disabled?: boolean; disabledReason?: string; onClick: () => void };
  /** Otras acciones de la pestaña, antes de descargar. */
  extra?: ReactNode;
}) {
  const downloadButton = download && (
    <Button
      variant="contained"
      startIcon={download.busy ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
      onClick={download.onClick}
      disabled={download.busy || download.disabled}
    >
      {download.busy ? "Descargando..." : download.label}
    </Button>
  );
  return (
    <Stack className="no-imprimir" direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }} justifyContent="space-between">
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h2" variant="h6" fontWeight={800}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ "& > *": { flexGrow: { xs: 1, md: 0 } } }}>
        {extra}
        {download?.disabled && download.disabledReason ? (
          <Tooltip title={download.disabledReason}>
            <span style={{ display: "inline-flex" }}>{downloadButton}</span>
          </Tooltip>
        ) : (
          downloadButton
        )}
        <Tooltip title="Abre la impresión: elegí «Guardar como PDF» como impresora.">
          <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={printSection}>
            PDF
          </Button>
        </Tooltip>
        <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={printSection}>
          Imprimir
        </Button>
      </Stack>
    </Stack>
  );
}
