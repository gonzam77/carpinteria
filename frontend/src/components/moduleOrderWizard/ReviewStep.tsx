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
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from "@mui/material";
import { useId, useMemo, useState } from "react";
import type { ModuleOrderApiError } from "../../api/moduleOrders";
import { changedSides, edgeSummary, materialSummary, rowsByModule, unitPieceEdges, type WizardUnit } from "../../lib/moduleOrderWizard";
import type { EspesorCanto, LadoCanto, Material, ModuleDefinition, ModuleOrderDetail, ModuleOrderPreview } from "../../types";
import { CutOptimizer } from "../CutOptimizer";
import { EDITED_BLUE, EdgeToggleButtons } from "../PieceEdgesToggles";

export type PreviewStatus = "idle" | "loading" | "stale" | "error" | "ready";

const money = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const numberText = (value: number, decimals = 2) => value.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

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
  available,
  locked,
  onEdgeChange,
  onResetPiece
}: {
  posicion: number;
  unit: WizardUnit;
  definition: ModuleDefinition;
  rows: ModuleOrderDetail[];
  available: readonly number[] | undefined;
  locked: boolean;
  onEdgeChange: (piezaCodigo: string, lado: LadoCanto, espesor: EspesorCanto | null) => void;
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
        <Table size="small" aria-labelledby={titleId} sx={{ minWidth: 720, "& td": { verticalAlign: "middle" } }}>
          <TableHead>
            <TableRow>
              <TableCell>Pieza</TableCell>
              <TableCell>Material</TableCell>
              <TableCell align="right">Largo</TableCell>
              <TableCell align="right">Ancho</TableCell>
              <TableCell align="right">Cant.</TableCell>
              <TableCell>Cantos</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const codigo = (row.piezaCodigo ?? "").toUpperCase();
              // Los cantos que se van a mandar: el cambio a mano o los del perfil, los mismos que usa el servidor. No se
              // deducen de la fila ni de la lista de materiales (un canto cargado despues de abrir se ve igual).
              const edges = unitPieceEdges(unit, definition, codigo);
              const sides = changedSides(unit, definition, codigo);
              const edited = sides.length > 0;
              const nombre = row.nombreProducto ?? codigo;
              return (
                <TableRow key={`${row.piezaCodigo}-${row.indice}`} sx={edited ? { boxShadow: `inset 4px 0 0 ${EDITED_BLUE}` } : undefined}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {nombre}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, Consolas, monospace", whiteSpace: "nowrap" }}>
                      {row.codigoBarra}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{row.material}</Typography>
                  </TableCell>
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
                    <EdgeToggleButtons
                      edges={edges}
                      context={`${nombre} del módulo ${posicion}`}
                      editedSides={sides}
                      available={available}
                      disabled={locked}
                      onChange={(lado, espesor) => onEdgeChange(codigo, lado, espesor)}
                    />
                  </TableCell>
                  <TableCell sx={{ width: 104 }}>
                    {edited && (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Chip size="small" label="Editada" variant="outlined" sx={{ borderColor: EDITED_BLUE, color: EDITED_BLUE }} />
                        <Tooltip title="Volver a los cantos del perfil">
                          <span>
                            <IconButton size="small" aria-label={`Volver a los cantos del perfil en ${nombre}`} disabled={locked} onClick={() => onResetPiece(codigo)}>
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
 * (DECISIONES R3). Los cantos se cambian por lado; el cambio se recalcula en un momento, no en cada click (P12).
 */
export function ReviewStep({
  preview,
  status,
  error,
  units,
  definitions,
  materials,
  edgeCoverage,
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
  /** Espesores de canto activos por color (edgeThicknessesByColor), para avisar en el menu los que faltan. */
  edgeCoverage: Map<string, number[]>;
  planMaterials: Material[];
  herrajesHabilitados: boolean;
  /** Mientras se crea la solicitud no se puede cambiar nada: el alta ya salio con lo que habia. */
  locked: boolean;
  onEdgeChange: (uid: string, piezaCodigo: string, lado: LadoCanto, espesor: EspesorCanto | null) => void;
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
                available={unit.colorCantoId ? (edgeCoverage.get(unit.colorCantoId) ?? []) : undefined}
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
