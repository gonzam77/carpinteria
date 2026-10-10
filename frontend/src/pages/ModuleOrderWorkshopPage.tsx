import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PrintIcon from "@mui/icons-material/Print";
import { Alert, Box, Button, CircularProgress, GlobalStyles, Stack, Typography } from "@mui/material";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { listModules } from "../api/catalog";
import { getModuleOrder, moduleOrderError } from "../api/moduleOrders";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { useModuleImage } from "../hooks/useModuleImage";
import { formatDay } from "../lib/moduleOrdersList";
import { compactTable, edgeSummary, labeledMeasures, pieceMark, workshopSheets, type WorkshopEdge, type WorkshopSheet } from "../lib/moduleWorkshop";
import { hardwareQuantityText } from "../components/moduleOrderWizard/ModuleHardware";
import type { Material, ModuleOrder } from "../types";

const logoUrl = new URL("../../assets/roma_logo.png", import.meta.url).href;

// En papel: A4 con 12 mm de margen, una hoja por modulo, sin la barra de la pantalla (spec §11.2). Todo en negro sobre
// blanco y con 10 pt como minimo en la tabla, para que se lea en una impresora en blanco y negro.
const printStyles = (
  <GlobalStyles
    styles={{
      "@page": { size: "A4", margin: "12mm" },
      "@media print": {
        "html, body": { background: "#fff !important" },
        ".taller-pantalla": { display: "none !important" },
        ".taller-fondo": { padding: "0 !important", background: "#fff !important" },
        ".taller-hoja": {
          width: "auto !important",
          minHeight: "0 !important",
          margin: "0 !important",
          padding: "0 !important",
          boxShadow: "none !important",
          border: "0 !important",
          breakAfter: "page",
          pageBreakAfter: "always"
        },
        ".taller-hoja:last-of-type": { breakAfter: "auto", pageBreakAfter: "auto" },
        ".taller-hoja tr": { breakInside: "avoid" }
      }
    }}
  />
);

/** A donde vuelve el detalle: el listado con sus filtros que traia, si es una ruta propia. */
function listReturn(state: unknown) {
  const returnTo = (state as { returnTo?: unknown } | null)?.returnTo;
  return typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : undefined;
}

const cell = { border: "1px solid #000", padding: "3px 5px", fontSize: "10pt", textAlign: "left" as const, verticalAlign: "top" as const };

function ModulePicture({ moduloId, version }: { moduloId: string | null; version: string | null }) {
  const { url } = useModuleImage(moduloId ?? "", moduloId ? version : null);
  return (
    <Box sx={{ width: "42mm", height: "34mm", flexShrink: 0, border: "1px solid #000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url ? <Box component="img" src={url} alt="" sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : null}
    </Box>
  );
}

function Sheet({
  order,
  sheet,
  edges,
  imageVersions,
  companyName
}: {
  order: ModuleOrder;
  sheet: WorkshopSheet;
  edges: Map<string, WorkshopEdge>;
  imageVersions: Map<string, string | null>;
  companyName: string;
}) {
  const { modulo, rows, herrajes } = sheet;
  // Los herrajes cuentan para achicar la tabla: la hoja tiene que entrar en una pagina.
  const compact = compactTable(rows.length + herrajes.length);
  const perfil = modulo?.definicionSnapshot?.perfiles?.find((item) => item.orden === modulo.perfilCantoOrden);
  const rowCell = { ...cell, padding: compact ? "1px 4px" : cell.padding, lineHeight: compact ? 1.15 : 1.35 };
  return (
    <Box
      component="section"
      className="taller-hoja"
      aria-label={`Hoja de taller: ${sheet.titulo}`}
      sx={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", mx: "auto", mb: 3, p: "12mm", bgcolor: "#fff", color: "#000", boxShadow: "0 6px 24px rgba(0,0,0,0.18)", fontSize: "10.5pt" }}
    >
      {/* Encabezado */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ borderBottom: "2px solid #000", pb: "3mm", mb: "4mm" }}>
        <Box component="img" src={logoUrl} alt={companyName} sx={{ height: "16mm", width: "auto" }} />
        <Box sx={{ textAlign: "right" }}>
          <Typography component="h2" sx={{ fontSize: "16pt", fontWeight: 900, lineHeight: 1.2 }}>
            M-{order.numero} · {sheet.titulo}
          </Typography>
          <Typography sx={{ fontSize: "10.5pt" }}>Cliente: {order.cliente}</Typography>
          <Typography sx={{ fontSize: "10.5pt" }}>Entrega: {formatDay(order.fechaEntrega) || "sin fecha"}</Typography>
        </Box>
      </Stack>

      {/* Bloque del modulo */}
      {modulo ? (
        <Stack direction="row" spacing={2} sx={{ mb: "4mm" }}>
          <ModulePicture moduloId={modulo.moduloId} version={modulo.moduloId ? (imageVersions.get(modulo.moduloId) ?? null) : null} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "13pt", fontWeight: 900 }}>{modulo.nombreModulo}</Typography>
            <Typography sx={{ fontSize: "10.5pt" }}>Medidas: {labeledMeasures(modulo) || "-"}</Typography>
            <Typography sx={{ fontSize: "10.5pt" }}>Esqueleto: {modulo.colorEsqueleto.nombre.trim()}</Typography>
            <Typography sx={{ fontSize: "10.5pt" }}>Frentes: {modulo.colorFrentes.nombre.trim()}</Typography>
            {modulo.materialFondo && <Typography sx={{ fontSize: "10.5pt" }}>Fondo: {modulo.materialFondo.nombre.trim()}</Typography>}
            <Typography sx={{ fontSize: "10.5pt" }}>Cantos: {perfil ? `perfil ${perfil.nombre}` : `perfil ${modulo.perfilCantoOrden}`}, el detalle por pieza en la tabla</Typography>
            {modulo.observaciones && <Typography sx={{ fontSize: "10.5pt", fontWeight: 700 }}>Observaciones: {modulo.observaciones}</Typography>}
          </Box>
        </Stack>
      ) : (
        <Typography sx={{ fontSize: "10.5pt", mb: "4mm" }}>Piezas de la solicitud que no son de ningún módulo.</Typography>
      )}

      {/* Despiece */}
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", mb: "4mm" }}>
        <thead>
          <tr>
            {["✓", "Pieza", "Material", "Largo", "Ancho", "Cant.", "Cantos"].map((label) => (
              <Box component="th" key={label} sx={{ ...cell, fontWeight: 900, bgcolor: "#eee", textAlign: label === "Largo" || label === "Ancho" || label === "Cant." ? "right" : "left" }}>
                {label}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const mark = pieceMark(row.origen);
            return (
              <tr key={row.id ?? index}>
                <Box component="td" sx={{ ...rowCell, width: "7mm" }}>
                  <Box sx={{ width: "3.5mm", height: "3.5mm", border: "1px solid #000" }} />
                </Box>
                <Box component="td" sx={rowCell}>
                  {row.nombreProducto || "Pieza"}
                  {mark && " "}
                  {mark && (
                    <Box component="span" sx={{ ml: 0.75, px: 0.5, border: "1px solid #000", fontSize: "8.5pt", fontWeight: 700, textTransform: "uppercase" }}>
                      {mark}
                    </Box>
                  )}
                </Box>
                <Box component="td" sx={rowCell}>
                  {row.material.trim()}
                </Box>
                <Box component="td" sx={{ ...rowCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {row.largo}
                </Box>
                <Box component="td" sx={{ ...rowCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {row.ancho}
                </Box>
                <Box component="td" sx={{ ...rowCell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {row.cantidad}
                </Box>
                <Box component="td" sx={rowCell}>
                  {edgeSummary(row, edges)}
                </Box>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <Box component="td" colSpan={7} sx={cell}>
                Este módulo no tiene piezas.
              </Box>
            </tr>
          )}
        </tbody>
      </Box>

      {/* Herrajes (spec §11.2): casilla, herraje y cantidad */}
      {herrajes.length > 0 && (
        <Box component="table" aria-label="Herrajes" sx={{ width: "100%", borderCollapse: "collapse", mb: "4mm" }}>
          <thead>
            <tr>
              {["✓", "Herraje", "Cant."].map((label) => (
                <Box component="th" key={label} sx={{ ...cell, fontWeight: 900, bgcolor: "#eee", textAlign: label === "Cant." ? "right" : "left" }}>
                  {label}
                </Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {herrajes.map((herraje) => {
              const mark = herraje.origen === "EDITADO" ? "Modificado" : herraje.origen === "MANUAL" ? "Agregado" : "";
              return (
                <tr key={herraje.id}>
                  <Box component="td" sx={{ ...rowCell, width: "7mm" }}>
                    <Box sx={{ width: "3.5mm", height: "3.5mm", border: "1px solid #000" }} />
                  </Box>
                  <Box component="td" sx={rowCell}>
                    {herraje.tipo ? `${herraje.tipo}: ` : ""}
                    {herraje.nombre}
                    {mark && " "}
                    {mark && (
                      <Box component="span" sx={{ ml: 0.75, px: 0.5, border: "1px solid #000", fontSize: "8.5pt", fontWeight: 700, textTransform: "uppercase" }}>
                        {mark}
                      </Box>
                    )}
                  </Box>
                  <Box component="td" sx={{ ...rowCell, width: "28mm", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {hardwareQuantityText(herraje.cantidad, herraje.unidad)}
                  </Box>
                </tr>
              );
            })}
          </tbody>
        </Box>
      )}

      {/* Pie */}
      <Box sx={{ border: "1px solid #000", minHeight: "22mm", p: "2mm", mb: "5mm" }}>
        <Typography sx={{ fontSize: "10pt", fontWeight: 700 }}>Observaciones del taller</Typography>
      </Box>
      <Stack direction="row" spacing={3}>
        {["Armó", "Controló", "Fecha"].map((label) => (
          <Box key={label} sx={{ flex: 1, borderTop: "1px solid #000", pt: "1mm", mt: "8mm" }}>
            <Typography sx={{ fontSize: "10pt" }}>{label}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

/**
 * Las hojas de taller de una solicitud (spec §11.2): una A4 por modulo, con los estilos de impresion. Las usan esta
 * pagina y la pestaña "Hoja de taller" del detalle. Trae los cantos (para leerlos por color) y las imagenes del catalogo.
 */
export function WorkshopSheetsView({ order }: { order: ModuleOrder }) {
  const { settings } = useCompanySettings();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [imageVersions, setImageVersions] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    let current = true;
    api
      .get<Material[]>("/materiales", { params: { incluirInactivos: true } })
      .then((response) => current && setMaterials(response.data))
      .catch(() => undefined);
    // La imagen es la del catalogo de hoy (la solicitud guarda la definicion, no la imagen).
    listModules({ incluirInactivos: true })
      .then((modules) => current && setImageVersions(new Map(modules.map((module) => [module.id, module.imagenActualizada]))))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  const edges = useMemo(() => {
    const plates = new Map(materials.filter((material) => material.tipo === "PLACA").map((material) => [material.id, material.nombre.trim()]));
    return new Map<string, WorkshopEdge>(
      materials
        .filter((material) => material.tipo === "CANTO")
        .map((material) => [
          material.id,
          {
            espesorMm: material.espesorMm,
            placaMaterialId: material.placaMaterialId,
            color: (material.placaMaterialId && plates.get(material.placaMaterialId)) || material.colorCanto || material.nombre.trim()
          }
        ])
    );
  }, [materials]);

  const sheets = useMemo(() => workshopSheets(order), [order]);
  return (
    <>
      {printStyles}
      {sheets.map((sheet) => (
        <Sheet key={sheet.key} order={order} sheet={sheet} edges={edges} imageVersions={imageVersions} companyName={settings.nombre} />
      ))}
    </>
  );
}

/** Hojas de taller de una solicitud de modulos (spec §11.2), en /modulos/:id/taller: una hoja A4 por modulo. Solo ADMIN. */
export function ModuleOrderWorkshopPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState<ModuleOrder | null>(null);
  const [error, setError] = useState("");
  const [returnTo] = useState(() => listReturn(location.state));

  useEffect(() => {
    let current = true;
    getModuleOrder(id)
      .then((data) => current && setOrder(data))
      .catch((loadError) => {
        if (!current) return;
        // Una solicitud de corte no tiene hoja de taller: se ve su detalle.
        if (axios.isAxiosError(loadError) && loadError.response?.status === 404) {
          navigate(`/pedidos/${id}`, { replace: true });
          return;
        }
        setError(moduleOrderError(loadError, "No se pudo cargar la solicitud.").message);
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sheets = useMemo(() => (order ? workshopSheets(order) : []), [order]);
  const back = () => navigate(`/modulos/${id}`, { state: { returnTo } });

  return (
    <Box className="taller-fondo" sx={{ minHeight: "100vh", bgcolor: "#e9e4dc", pb: 4 }}>
      <Box className="taller-pantalla" sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ maxWidth: "210mm", mx: "auto", px: 2, py: 1.5 }}>
          <Box>
            <Typography component="h1" variant="h5" fontWeight={900}>
              Hojas de taller{order ? ` · M-${order.numero}` : ""}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {sheets.length ? `${sheets.length} ${sheets.length === 1 ? "hoja" : "hojas"} A4: una por módulo${sheets.some((sheet) => !sheet.modulo) ? " y una de piezas adicionales" : ""}.` : " "}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={back}>
              Volver
            </Button>
            <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!order}>
              Imprimir
            </Button>
          </Stack>
        </Stack>
      </Box>
      {error && (
        <Alert className="taller-pantalla" severity="error" sx={{ maxWidth: "210mm", mx: "auto", mb: 2 }}>
          {error}
        </Alert>
      )}
      {!order && !error && (
        <Stack className="taller-pantalla" alignItems="center" sx={{ py: 6 }}>
          <CircularProgress aria-label="Cargando la solicitud" />
        </Stack>
      )}
      {order && <WorkshopSheetsView order={order} />}
    </Box>
  );
}
