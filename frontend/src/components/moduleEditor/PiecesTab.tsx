import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { useState } from "react";
import {
  formatMm as mm,
  formulaSyntaxError,
  identifierProblem,
  newPiece,
  newUid,
  withEdge,
  type DraftPiece,
  type FitWarning,
  type FormulaSuggestion,
  type ModuleDraft
} from "../../lib/moduleEditor";
import type { ModuleEvaluation } from "../../lib/moduleFormula";
import type { Material, RolPiezaModulo } from "../../types";
import { FormulaInput } from "../FormulaInput";
import { PieceEdgesToggles } from "../PieceEdgesToggles";
import { plateLabel, plateOptions } from "./GeneralTab";

const ROLES: Array<{ value: RolPiezaModulo; label: string }> = [
  { value: "ESQUELETO", label: "Esqueleto" },
  { value: "FRENTE", label: "Frente" },
  { value: "FONDO", label: "Fondo" },
  { value: "FIJO", label: "Material fijo" }
];


/** Panel "Probar con medidas" (spec §6.2): los valores con los que se ven los resultados en vivo. */
function TestValuesPanel({
  draft,
  values,
  onChange,
  onReset,
  evaluation
}: {
  draft: ModuleDraft;
  values: Record<string, number>;
  onChange: (clave: string, value: number | null) => void;
  onReset: () => void;
  evaluation: ModuleEvaluation;
}) {
  const errors = new Map(evaluation.errores.map((error) => [error.ref.toUpperCase(), error.mensaje]));
  const pedibles = draft.parametros.filter((param) => param.tipo !== "CALCULADO" && param.clave);
  const calculadas = draft.parametros.filter((param) => param.tipo === "CALCULADO" && param.clave);
  const unidades = evaluation.piezas.reduce((total, pieza) => total + pieza.cantidad, 0);

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "10px" }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography fontWeight={800}>Probar con medidas</Typography>
          <Typography variant="body2" color="text.secondary">
            Cambiá las medidas para ver cómo quedan las piezas. No se guardan: el módulo guarda los valores por defecto de la pestaña Medidas.
          </Typography>
        </Box>
        <Button size="small" startIcon={<RestartAltIcon />} onClick={onReset} sx={{ flexShrink: 0 }}>
          Valores por defecto
        </Button>
      </Stack>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {pedibles.map((param) => {
          const clave = param.clave.toUpperCase();
          const error = errors.get(clave);
          // Lo que no se cambio usa el valor por defecto; NaN es un campo vaciado a proposito ("Falta el valor").
          const raw = clave in values ? values[clave] : param.valorDefecto;
          const value = raw === null || raw === undefined || Number.isNaN(raw) ? "" : raw;
          return param.tipo === "OPCION" ? (
            <TextField
              key={param.uid}
              select
              size="small"
              label={param.etiqueta || param.clave}
              value={value}
              onChange={(event) => onChange(clave, event.target.value === "" ? null : Number(event.target.value))}
              error={Boolean(error)}
              helperText={error}
            >
              {(param.opciones ?? []).map((option) => (
                <MenuItem key={option.valor} value={option.valor}>
                  {option.valor}. {option.etiqueta}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              key={param.uid}
              size="small"
              type="number"
              label={`${param.etiqueta || param.clave}${param.tipo === "MEDIDA" ? " (mm)" : ""}`}
              value={value}
              onChange={(event) => onChange(clave, event.target.value === "" ? null : Number(event.target.value))}
              error={Boolean(error)}
              helperText={error}
              slotProps={{ htmlInput: { style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } } }}
            />
          );
        })}
      </Box>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
        {calculadas.map((param) => {
          let label: string;
          try {
            label = `${param.clave} = ${mm(evaluation.evaluarExpresion(param.clave))}`;
          } catch {
            label = `${param.clave}: con error`;
          }
          return <Chip key={param.uid} size="small" variant="outlined" label={label} title={param.etiqueta} />;
        })}
        <Chip size="small" color="primary" variant="outlined" label={`${evaluation.piezas.length} piezas distintas · ${unidades} unidades`} />
      </Stack>
    </Paper>
  );
}

function PieceCard({
  pieza,
  index,
  total,
  draft,
  allNames,
  suggestions,
  evaluation,
  placas,
  warnings,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onRename
}: {
  pieza: DraftPiece;
  index: number;
  total: number;
  draft: ModuleDraft;
  allNames: string[];
  suggestions: FormulaSuggestion[];
  evaluation: ModuleEvaluation;
  placas: Material[];
  warnings: FitWarning[];
  onPatch: (changes: Partial<DraftPiece> | ((pieza: DraftPiece) => DraftPiece)) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRename: (from: string, to: string) => void;
}) {
  const [focusedName, setFocusedName] = useState<string | null>(null);
  const codigo = pieza.codigo.toUpperCase();
  const nameProblem = identifierProblem(pieza.codigo, allNames);
  const result = evaluation.piezas.find((item) => item.codigo.toUpperCase() === codigo);
  const evalError = evaluation.errores.find((error) => error.ref.toUpperCase() === codigo)?.mensaje;
  const syntax = {
    largo: formulaSyntaxError(pieza.formulaLargo),
    ancho: formulaSyntaxError(pieza.formulaAncho),
    cantidad: formulaSyntaxError(pieza.formulaCantidad)
  };
  const hasSyntaxError = Boolean(syntax.largo || syntax.ancho || syntax.cantidad);
  const formulaSuggestionsForPiece = suggestions;
  const perfilA = draft.perfiles.find((perfil) => perfil.orden === 1);
  const perfilB = draft.perfiles.find((perfil) => perfil.orden === 2);
  const status = evalError ? "error" : result ? "ok" : "off";

  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: "10px", borderColor: status === "error" ? "error.light" : "divider", borderLeftWidth: 4, borderLeftColor: status === "error" ? "error.main" : status === "ok" ? "success.main" : "divider" }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="flex-start">
          <Typography fontWeight={800} color="text.secondary" sx={{ pt: 1, minWidth: 24, fontVariantNumeric: "tabular-nums" }}>
            {index + 1}
          </Typography>
          <TextField
            size="small"
            label="Nombre"
            value={pieza.nombre}
            onChange={(event) => onPatch({ nombre: event.target.value })}
            error={!pieza.nombre.trim()}
            helperText="Sale en el Excel y en la hoja de taller"
            sx={{ width: { xs: "100%", sm: 210 } }}
          />
          <TextField
            size="small"
            label="Código"
            value={pieza.codigo}
            onFocus={() => setFocusedName(pieza.codigo)}
            onChange={(event) => onPatch({ codigo: event.target.value.toUpperCase().replace(/\s+/g, "_") })}
            onBlur={() => {
              if (focusedName && focusedName !== pieza.codigo && !nameProblem) onRename(focusedName, pieza.codigo);
              setFocusedName(null);
            }}
            error={Boolean(nameProblem)}
            helperText={nameProblem ?? "Para usarla en otras fórmulas"}
            slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 } } }}
            sx={{ width: { xs: "100%", sm: 170 } }}
          />
          <TextField
            select
            size="small"
            label="Va en"
            value={pieza.rol}
            onChange={(event) => onPatch({ rol: event.target.value as RolPiezaModulo })}
            helperText={pieza.rol === "ESQUELETO" ? "Color de esqueleto" : pieza.rol === "FRENTE" ? "Color de frentes" : pieza.rol === "FONDO" ? "Material de fondo" : "Siempre la misma placa"}
            sx={{ width: { xs: "100%", sm: 150 } }}
          >
            {ROLES.map((rol) => (
              <MenuItem key={rol.value} value={rol.value}>
                {rol.label}
              </MenuItem>
            ))}
          </TextField>
          {pieza.rol === "FIJO" && (
            <TextField
              select
              size="small"
              label="Material fijo"
              value={pieza.materialFijoId ?? ""}
              onChange={(event) => onPatch({ materialFijoId: event.target.value || null })}
              error={!pieza.materialFijoId}
              helperText={pieza.materialFijoId ? " " : "Elegí la placa"}
              sx={{ width: { xs: "100%", sm: 240 } }}
            >
              {plateOptions(placas, pieza.materialFijoId).map((material) => (
                <MenuItem key={material.id} value={material.id}>
                  {plateLabel(material)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Tooltip title="Si la veta lo permite, el optimizador puede girarla para aprovechar mejor la placa.">
            <FormControlLabel
              control={<Checkbox size="small" checked={pieza.permiteRotar} onChange={(event) => onPatch({ permiteRotar: event.target.checked })} />}
              label="Rotar"
              sx={{ mr: 0, pt: 0.25 }}
            />
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Chip
              color={status === "error" ? "error" : status === "ok" ? "success" : "default"}
              variant={status === "off" ? "outlined" : "filled"}
              label={result ? `${mm(result.largo)} × ${mm(result.ancho)} × ${result.cantidad}` : evalError ? "Con error" : "No se genera"}
              title={result ? "Largo × ancho × cantidad, en mm enteros" : evalError ? evalError : "Con estas medidas la cantidad da 0"}
              sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
            />
            <IconButton size="small" aria-label="Subir" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUpwardIcon fontSize="inherit" />
            </IconButton>
            <IconButton size="small" aria-label="Bajar" disabled={index === total - 1} onClick={() => onMove(1)}>
              <ArrowDownwardIcon fontSize="inherit" />
            </IconButton>
            <IconButton size="small" aria-label={`Duplicar ${pieza.nombre}`} onClick={onDuplicate}>
              <ContentCopyIcon fontSize="inherit" />
            </IconButton>
            <IconButton size="small" color="error" aria-label={`Quitar ${pieza.nombre}`} onClick={onRemove}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "2fr 2fr 1.2fr" } }}>
          <FormulaInput
            id={`pieza-${pieza.uid}-largo`}
            label="Largo"
            value={pieza.formulaLargo}
            onChange={(formulaLargo) => onPatch({ formulaLargo })}
            suggestions={formulaSuggestionsForPiece}
            error={syntax.largo}
            helperText={result ? `${mm(result.largoExacto)} mm exactos` : undefined}
          />
          <FormulaInput
            id={`pieza-${pieza.uid}-ancho`}
            label="Ancho"
            value={pieza.formulaAncho}
            onChange={(formulaAncho) => onPatch({ formulaAncho })}
            suggestions={formulaSuggestionsForPiece}
            error={syntax.ancho}
            helperText={result ? `${mm(result.anchoExacto)} mm exactos` : undefined}
          />
          <FormulaInput
            id={`pieza-${pieza.uid}-cantidad`}
            label="Cantidad"
            value={pieza.formulaCantidad}
            onChange={(formulaCantidad) => onPatch({ formulaCantidad })}
            suggestions={formulaSuggestionsForPiece}
            error={syntax.cantidad}
            helperText="0 = no se genera"
          />
        </Box>

        {evalError && !hasSyntaxError && (
          <Alert severity="error" sx={{ py: 0 }}>
            {evalError}
          </Alert>
        )}
        {warnings.map((warning, i) => (
          <Alert key={i} severity="warning" sx={{ py: 0 }}>
            {warning.mensaje}
          </Alert>
        ))}

        <Stack direction={{ xs: "column", lg: "row" }} spacing={{ xs: 1, lg: 3 }} alignItems={{ lg: "center" }}>
          {perfilA && (
            <PieceEdgesToggles pieza={pieza} perfilOrden={1} perfilNombre={perfilA.nombre} onChange={(lado, espesor) => onPatch((current) => withEdge(current, 1, lado, espesor))} />
          )}
          {perfilB && (
            <PieceEdgesToggles pieza={pieza} perfilOrden={2} perfilNombre={perfilB.nombre} onChange={(lado, espesor) => onPatch((current) => withEdge(current, 2, lado, espesor))} />
          )}
          <TextField
            size="small"
            label="Observaciones"
            value={pieza.observaciones ?? ""}
            onChange={(event) => onPatch({ observaciones: event.target.value })}
            sx={{ flex: 1, minWidth: 200 }}
          />
        </Stack>
      </Stack>
    </Paper>
  );
}

export function PiecesTab({
  draft,
  setPiezas,
  suggestions,
  evaluation,
  testValues,
  setTestValue,
  resetTestValues,
  placas,
  warnings,
  generalWarnings,
  onRename,
  onRemove
}: {
  draft: ModuleDraft;
  setPiezas: (update: (piezas: DraftPiece[]) => DraftPiece[]) => void;
  suggestions: FormulaSuggestion[];
  evaluation: ModuleEvaluation;
  testValues: Record<string, number>;
  setTestValue: (clave: string, value: number | null) => void;
  resetTestValues: () => void;
  placas: Material[];
  warnings: FitWarning[];
  generalWarnings: string[];
  onRename: (from: string, to: string) => void;
  onRemove: (index: number) => void;
}) {
  const allNames = [...draft.parametros.map((param) => param.clave), ...draft.piezas.map((pieza) => pieza.codigo)];

  const patch = (index: number, changes: Partial<DraftPiece> | ((pieza: DraftPiece) => DraftPiece)) =>
    setPiezas((piezas) => piezas.map((pieza, i) => (i === index ? (typeof changes === "function" ? changes(pieza) : { ...pieza, ...changes }) : pieza)));
  const move = (index: number, delta: number) =>
    setPiezas((piezas) => {
      const next = [...piezas];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  const duplicate = (index: number) =>
    setPiezas((piezas) => {
      const source = piezas[index];
      const codes = new Set(piezas.map((pieza) => pieza.codigo));
      let codigo = `${source.codigo}_COPIA`;
      for (let n = 2; codes.has(codigo); n++) codigo = `${source.codigo}_COPIA_${n}`;
      const copy: DraftPiece = { ...source, uid: newUid(), codigo, nombre: `${source.nombre} (copia)`, cantos: source.cantos.map((canto) => ({ ...canto })) };
      return [...piezas.slice(0, index + 1), copy, ...piezas.slice(index + 1)];
    });

  return (
    <Stack spacing={2}>
      <TestValuesPanel draft={draft} values={testValues} onChange={setTestValue} onReset={resetTestValues} evaluation={evaluation} />
      {generalWarnings.map((warning, index) => (
        <Alert key={index} severity="warning">
          {warning}
        </Alert>
      ))}
      <Typography variant="body2" color="text.secondary">
        Las fórmulas usan las claves de las medidas, ESP (espesor de diseño) y otras piezas con CODIGO.largo, CODIGO.ancho y CODIGO.cant. Las referencias
        entre piezas usan los valores exactos; solo el resultado final se redondea al mm. Los cantos de cada lado se eligen por perfil: L1 y L2 son los
        lados largos; A1 y A2, los anchos.
      </Typography>
      {draft.piezas.map((pieza, index) => (
        <PieceCard
          key={pieza.uid}
          pieza={pieza}
          index={index}
          total={draft.piezas.length}
          draft={draft}
          allNames={allNames}
          suggestions={suggestions}
          evaluation={evaluation}
          placas={placas}
          warnings={warnings.filter((warning) => warning.codigo.toUpperCase() === pieza.codigo.toUpperCase())}
          onPatch={(changes) => patch(index, changes)}
          onMove={(delta) => move(index, delta)}
          onDuplicate={() => duplicate(index)}
          onRemove={() => onRemove(index)}
          onRename={onRename}
        />
      ))}
      {!draft.piezas.length && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: "10px" }}>
          <Typography color="text.secondary">Todavía no hay piezas. Agregá la primera para armar el despiece.</Typography>
        </Paper>
      )}
      <Stack direction="row">
        <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setPiezas((piezas) => [...piezas, newPiece(piezas)])}>
          Agregar pieza
        </Button>
      </Stack>
    </Stack>
  );
}
