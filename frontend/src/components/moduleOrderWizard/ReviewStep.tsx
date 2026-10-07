import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormHelperText,
  IconButton,
  MenuItem,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { useId, useMemo, useState } from "react";
import type { ModuleOrderApiError } from "../../api/moduleOrders";
import { changedSides, defaultEdgeId, edgeSummary, materialSummary, rowsByModule, type EdgeDefaultsContext, type WizardUnit } from "../../lib/moduleOrderWizard";
import type { LadoCanto, Material, MissingDefaultEdge, ModuleDefinition, ModuleOrderDetail, ModuleOrderPreview } from "../../types";
import { CutOptimizer } from "../CutOptimizer";
import { EDITED_BLUE } from "../PieceEdgesToggles";

export type PreviewStatus = "idle" | "loading" | "stale" | "error" | "ready";

const money = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const numberText = (value: number, decimals = 2) => value.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const mmText = (value: number) => value.toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });

const SIDES: Array<{ lado: LadoCanto; label: string; field: "cantoLargo1Id" | "cantoLargo2Id" | "cantoAncho1Id" | "cantoAncho2Id" }> = [
  { lado: "LARGO_1", label: "Largo 1", field: "cantoLargo1Id" },
  { lado: "LARGO_2", label: "Largo 2", field: "cantoLargo2Id" },
  { lado: "ANCHO_1", label: "Ancho 1", field: "cantoAncho1Id" },
  { lado: "ANCHO_2", label: "Ancho 2", field: "cantoAncho2Id" }
];
/** Un canto en el menu: la placa de su color (o su nombre) y el espesor. */
const edgeLabel = (canto: Material) => `${(canto.placaMaterial?.nombre ?? canto.nombre).trim()} · ${mmText(canto.espesorMm)} mm`;
/** Color que avisa un lado sin canto porque la placa no tiene uno de su color (contraste 4,5:1 sobre blanco). */
const MISSING_AMBER = "#8a5a00";

/**
 * Los cuatro lados de una pieza (DECISIONES 45): cada uno con el canto que lleva y un menu con todos los cantos
 * activos, o sin canto. El de por defecto (el de la placa de la pieza) se marca en el menu; un lado elegido a mano se
 * ve en azul, y uno sin canto porque la placa no tiene uno de su color, en ambar.
 */
function PieceEdgeSelects({
  row,
  unit,
  definition,
  codigo,
  context,
  missing,
  label,
  disabled,
  onChange
}: {
  row: ModuleOrderDetail;
  unit: WizardUnit;
  definition: ModuleDefinition;
  codigo: string;
  context: EdgeDefaultsContext;
  missing: Set<LadoCanto>;
  label: string;
  disabled: boolean;
  onChange: (lado: LadoCanto, cantoId: string | null) => void;
}) {
  const override = unit.cantosOverride[codigo] ?? {};
  const byId = new Map(context.cantos.map((canto) => [canto.id, canto]));
  return (
    <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(2, minmax(150px, 1fr))", minWidth: 320, pt: 0.75 }}>
      {SIDES.map(({ lado, label: ladoLabel, field }) => {
        const edited = override[lado] !== undefined;
        const value = edited ? (override[lado] ?? "") : (row[field] ?? "");
        const porDefecto = defaultEdgeId(unit, definition, codigo, lado, context);
        const sinCanto = !edited && missing.has(lado);
        const color = edited ? EDITED_BLUE : sinCanto ? MISSING_AMBER : undefined;
        return (
          <Box key={lado}>
            <TextField
              select
              size="small"
              fullWidth
              label={ladoLabel}
              value={value}
              disabled={disabled}
              onChange={(event) => onChange(lado, event.target.value || null)}
              slotProps={{
                htmlInput: { "aria-label": `${ladoLabel} de ${label}` },
                inputLabel: { shrink: true },
                // Cerrado se ve solo el canto (o "Sin canto"); "(por defecto)" va en el menu.
                select: {
                  displayEmpty: true,
                  renderValue: (selected) => {
                    const canto = byId.get(String(selected));
                    return canto ? edgeLabel(canto) : "Sin canto";
                  }
                }
              }}
              sx={color ? { "& .MuiOutlinedInput-notchedOutline": { borderColor: color, borderWidth: 2 }, "& .MuiInputLabel-root": { color } } : undefined}
            >
              <MenuItem value="">Sin canto{porDefecto === null ? " (por defecto)" : ""}</MenuItem>
              {context.cantos.map((canto) => (
                <MenuItem key={canto.id} value={canto.id}>
                  {edgeLabel(canto)}
                  {canto.id === porDefecto ? " (por defecto)" : ""}
                </MenuItem>
              ))}
            </TextField>
            {sinCanto && <FormHelperText sx={{ color: MISSING_AMBER, mx: 0.5 }}>La placa no tiene canto de su color</FormHelperText>}
          </Box>
        );
      })}
    </Box>
  );
}

function SummaryPanel({
  preview,
  status,
  units,
  materials,
  herrajesHabilitados
}: {
  preview: ModuleOrderPreview | null;
  status: PreviewStatus;
  units: number;
  materials: Material[];
  herrajesHabilitados: boolean;
}) {
  const busy = status === "loading" || status === "stale";
  const materiales = useMemo(() => (preview ? materialSummary(preview).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) : []), [preview]);
  // El espesor solo se muestra (no se calcula nada): "Blanco" de 5,5 mm y "Blanco mdf" de 18 mm no se confunden.
  const espesorDe = useMemo(() => new Map(materials.map((material) => [material.id, material.espesorMm])), [materials]);
  const conEspesor = (materialId: string, nombre: string) => {
    const espesor = espesorDe.get(materialId);
    return espesor === undefined ? nombre : `${nombre} · ${espesor.toLocaleString("es-AR", { maximumFractionDigits: 2 })} mm`;
  };
  const cantos = useMemo(() => (preview ? edgeSummary(preview).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) : []), [preview]);
  const piezas = preview ? preview.detalles.reduce((sum, row) => sum + Number(row.cantidad), 0) : 0;
  const titleId = useId();
  const line = (label: string, value: string, strong = false) => (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color={strong ? "text.primary" : "text.secondary"} fontWeight={strong ? 800 : 400}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={strong ? 800 : 600} sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
        {value}
      </Typography>
    </Stack>
  );

  return (
    <Paper
      component="section"
      aria-labelledby={titleId}
      // Fijo al costado en pantallas anchas (spec §9.2): acompana el scroll del despiece. Debajo de la barra superior (72 px).
      sx={{ p: 2, borderRadius: "10px", alignSelf: "start", position: { lg: "sticky" }, top: { lg: 88 }, maxHeight: { lg: "calc(100vh - 104px)" }, overflowY: { lg: "auto" } }}
      aria-busy={busy}
    >
      <Stack spacing={1.5}>
        <Typography id={titleId} component="h2" fontWeight={800} fontSize="1rem">
          Resumen
        </Typography>
        {busy && <LinearProgress aria-label="Calculando" />}
        {!preview ? (
          <Typography variant="body2" color="text.secondary">
            {status === "error" ? "No se pudo calcular: revisá el aviso del despiece. Cuando se corrige, el resumen se calcula de nuevo." : "Calculando placas y presupuesto..."}
          </Typography>
        ) : (
          <Box sx={{ opacity: busy ? 0.5 : 1, transition: "opacity 120ms" }}>
            <Stack spacing={1.25}>
              {line("Módulos", String(units))}
              {line("Piezas", String(piezas))}
              <Divider />
              <Typography variant="caption" fontWeight={800} color="text.secondary">
                PLACAS POR MATERIAL
              </Typography>
              {materiales.map((item) => (
                <Box key={item.materialId}>
                  {line(conEspesor(item.materialId, item.nombre), `${item.placas} ${item.placas === 1 ? "placa" : "placas"}`)}
                  {item.m2 !== null && (
                    <Typography variant="caption" color="text.secondary">
                      {numberText(item.m2)} m² de piezas
                    </Typography>
                  )}
                </Box>
              ))}
              {cantos.length > 0 && (
                <>
                  <Divider />
                  <Typography variant="caption" fontWeight={800} color="text.secondary">
                    METROS DE CANTO
                  </Typography>
                  {cantos.map((item) => (
                    <Box key={item.cantoId}>{line(item.nombre, `${numberText(item.metros)} m`)}</Box>
                  ))}
                </>
              )}
              <Divider />
              <Typography variant="caption" fontWeight={800} color="text.secondary">
                PRESUPUESTO ESTIMADO
              </Typography>
              {line("Placas", money(preview.costoPlacas))}
              {line("Mano de obra por cortes", money(preview.costoManoObraCortes))}
              {line("Cantos (material y pegado)", money(preview.costoCantos))}
              {herrajesHabilitados && line("Herrajes", money(preview.costoHerrajes))}
              {line("Total", money(preview.presupuestoConHerrajes), true)}
              {preview.faltanteStock && <Alert severity="warning">No alcanza el stock de alguna placa para esta solicitud.</Alert>}
              <Typography variant="caption" color="text.secondary">
                Las placas finales las define el optimizador al cortar.
              </Typography>
            </Stack>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

function ModuleDespieceCard({
  posicion,
  unit,
  definition,
  rows,
  edgeContext,
  sinCanto,
  locked,
  onEdgeChange,
  onResetPiece
}: {
  posicion: number;
  unit: WizardUnit;
  definition: ModuleDefinition;
  rows: ModuleOrderDetail[];
  edgeContext: EdgeDefaultsContext;
  /** Lados sin canto porque la placa de la pieza no tiene uno de su color (de la vista previa). */
  sinCanto: MissingDefaultEdge[];
  locked: boolean;
  onEdgeChange: (piezaCodigo: string, lado: LadoCanto, cantoId: string | null) => void;
  onResetPiece: (piezaCodigo: string) => void;
}) {
  const perfil = definition.perfiles.find((item) => item.orden === unit.perfilCantoOrden);
  const titleId = useId();
  return (
    <Paper component="section" aria-labelledby={titleId} sx={{ borderRadius: "10px", overflow: "hidden" }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1} sx={{ px: 2, py: 1.25, bgcolor: "primary.main", color: "primary.contrastText" }}>
        <Typography id={titleId} component="h3" fontWeight={900} fontSize="1rem">
          Módulo {posicion} · {definition.nombre}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {rows.length} {rows.length === 1 ? "pieza" : "piezas"}
          {perfil ? ` · Perfil ${perfil.nombre}` : ""}
        </Typography>
      </Stack>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" aria-labelledby={titleId} sx={{ minWidth: 640, "& td": { verticalAlign: "middle" } }}>
          <TableHead>
            <TableRow>
              <TableCell>Pieza</TableCell>
              <TableCell>Cantos</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const codigo = (row.piezaCodigo ?? "").toUpperCase();
              const edited = changedSides(unit, codigo).length > 0;
              const missing = new Set(sinCanto.filter((item) => item.piezaCodigo.toUpperCase() === codigo).map((item) => item.lado));
              const nombre = row.nombreProducto ?? codigo;
              return (
                <TableRow key={`${row.piezaCodigo}-${row.indice}`} sx={edited ? { boxShadow: `inset 4px 0 0 ${EDITED_BLUE}` } : undefined}>
                  <TableCell sx={{ minWidth: 180 }}>
                    <Typography variant="body2" fontWeight={700}>
                      {nombre}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {row.material}
                    </Typography>
                    <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {row.largo} × {row.ancho} mm · {row.cantidad} u.
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, Consolas, monospace", whiteSpace: "nowrap" }}>
                      {row.codigoBarra}
                    </Typography>
                  </TableCell>
                  {/* Todo el ancho que queda: los cuatro lados se leen sin cortar el nombre del canto. */}
                  <TableCell sx={{ width: "100%" }}>
                    <PieceEdgeSelects
                      row={row}
                      unit={unit}
                      definition={definition}
                      codigo={codigo}
                      context={edgeContext}
                      missing={missing}
                      label={`${nombre} del módulo ${posicion}`}
                      disabled={locked}
                      onChange={(lado, cantoId) => onEdgeChange(codigo, lado, cantoId)}
                    />
                  </TableCell>
                  <TableCell sx={{ width: 104 }}>
                    {edited && (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Chip size="small" label="Editada" variant="outlined" sx={{ borderColor: EDITED_BLUE, color: EDITED_BLUE }} />
                        <Tooltip title="Volver a los cantos por defecto">
                          <span>
                            <IconButton size="small" aria-label={`Volver a los cantos por defecto en ${nombre}`} disabled={locked} onClick={() => onResetPiece(codigo)}>
                              <RestartAltIcon fontSize="inherit" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

/**
 * Paso 4 (spec §9.2): el despiece y el resumen que devuelve la vista previa del servidor, sin calculos locales
 * (DECISIONES R3). El canto de cada lado se elige entre todos los cantos activos (DECISIONES 45); el cambio se recalcula
 * en un momento, no en cada click (P12).
 */
export function ReviewStep({
  preview,
  status,
  error,
  units,
  definitions,
  materials,
  edgeContext,
  planMaterials,
  herrajesHabilitados,
  locked,
  onEdgeChange,
  onResetPiece,
  onRecalculate
}: {
  preview: ModuleOrderPreview | null;
  status: PreviewStatus;
  error: ModuleOrderApiError | null;
  units: WizardUnit[];
  definitions: Map<string, ModuleDefinition>;
  materials: Material[];
  /** Cantos activos y fondo de la configuracion: las opciones de cada lado y el canto por defecto. */
  edgeContext: EdgeDefaultsContext;
  planMaterials: Material[];
  herrajesHabilitados: boolean;
  /** Mientras se crea la solicitud no se puede cambiar nada: el alta ya salio con lo que habia. */
  locked: boolean;
  onEdgeChange: (uid: string, piezaCodigo: string, lado: LadoCanto, cantoId: string | null) => void;
  onResetPiece: (uid: string, piezaCodigo: string) => void;
  onRecalculate: () => void;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const [planMounted, setPlanMounted] = useState(false);
  const groups = useMemo(() => (preview ? rowsByModule(preview) : new Map<number, ModuleOrderDetail[]>()), [preview]);
  // Para el plano, cada pieza lleva el numero de modulo en la etiqueta: solo se ve, no cambia el acomodo.
  const planRows = useMemo(
    () => (preview ? preview.detalles.map((row) => ({ ...row, nombreProducto: `M${row.posicionModulo} · ${row.nombreProducto ?? ""}` })) : []),
    [preview]
  );
  // Un renglon de estado de alto fijo: aparecer y desaparecer avisos arriba de las tablas las correria mientras se tocan cantos.
  const statusText =
    status === "loading"
      ? "Calculando placas y presupuesto con el optimizador. Con muchos módulos puede tardar unos segundos."
      : status === "stale"
        ? "Cambiaste cantos: en un momento se recalcula el resumen."
        : status === "ready"
          ? "Despiece y resumen calculados por el servidor."
          : "";

  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 340px" }, alignItems: "start" }}>
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        {status !== "error" && (
          <Box role="status" aria-live="polite" sx={{ minHeight: 24, display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" color={status === "ready" ? "text.secondary" : "text.primary"} fontWeight={status === "ready" ? 400 : 700}>
              {statusText}
            </Typography>
          </Box>
        )}
        {status === "error" && error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={onRecalculate} disabled={locked}>
                Volver a calcular
              </Button>
            }
            sx={{ "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }}
          >
            {error.message}
            {error.items.length > 0 && (
              <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                {error.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </Box>
            )}
          </Alert>
        )}
        {preview &&
          units.map((unit, index) => {
            const definition = definitions.get(unit.moduloId);
            const rows = groups.get(index + 1) ?? [];
            if (!definition) return null;
            return (
              <ModuleDespieceCard
                key={unit.uid}
                posicion={index + 1}
                unit={unit}
                definition={definition}
                rows={rows}
                edgeContext={edgeContext}
                sinCanto={preview.modulos[index]?.cantosSinElegir ?? []}
                locked={locked}
                onEdgeChange={(codigo, lado, espesor) => onEdgeChange(unit.uid, codigo, lado, espesor)}
                onResetPiece={(codigo) => onResetPiece(unit.uid, codigo)}
              />
            );
          })}
        {preview && (
          <Accordion
            expanded={planOpen}
            onChange={(_, expanded) => {
              setPlanOpen(expanded);
              if (expanded) setPlanMounted(true);
            }}
            disableGutters
            sx={{ borderRadius: "10px !important", "&:before": { display: "none" } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography component="h3" fontWeight={800} fontSize="1rem">
                  Plano de cortes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Cómo se acomodan las piezas en las placas. Los importes son los del resumen.
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {/* Se arma recien al abrirlo y queda armado: con muchos modulos el calculo tarda (DECISIONES 24). */}
              {planMounted && <CutOptimizer rows={planRows} materials={planMaterials} hideCosts />}
            </AccordionDetails>
          </Accordion>
        )}
      </Stack>
      <SummaryPanel preview={preview} status={status} units={units.length} materials={materials} herrajesHabilitados={herrajesHabilitados} />
    </Box>
  );
}
