import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useEffect, useState } from "react";
import {
  formatMm,
  formatOptionsText,
  formulaSyntaxError,
  identifierProblem,
  newParameter,
  parseOptionsText,
  type DraftParameter,
  type FormulaSuggestion,
  type ModuleDraft
} from "../../lib/moduleEditor";
import type { ModuleEvaluation } from "../../lib/moduleFormula";
import type { TipoParametroModulo } from "../../types";
import { FormulaInput } from "../FormulaInput";

const TIPOS: Array<{ value: TipoParametroModulo; label: string; ayuda: string }> = [
  { value: "MEDIDA", label: "Medida (mm)", ayuda: "Se pide al cargar, en mm" },
  { value: "ENTERO", label: "Cantidad", ayuda: "Se pide al cargar, número entero" },
  { value: "OPCION", label: "Opciones", ayuda: "Se elige de una lista" },
  { value: "CALCULADO", label: "Calculada", ayuda: "No se pide: sale de una fórmula" }
];

const numberOrNull = (value: string) => (value.trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value));

/** Opciones de una medida, una por linea. Se valida al salir del campo para no molestar mientras se escribe. */
function OptionsField({ value, onChange }: { value: DraftParameter["opciones"]; onChange: (opciones: DraftParameter["opciones"]) => void }) {
  const [text, setText] = useState(() => formatOptionsText(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Si las opciones cambian desde afuera (por ejemplo, al descartar los cambios), se muestra lo nuevo.
    if (JSON.stringify(parseOptionsText(text).opciones) !== JSON.stringify(value ?? [])) setText(formatOptionsText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextField
      size="small"
      multiline
      minRows={2}
      value={text}
      placeholder={"1 = Puertas arriba\n2 = Puertas abajo"}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = parseOptionsText(event.target.value);
        setError(parsed.error);
        if (!parsed.error) onChange(parsed.opciones);
      }}
      onBlur={() => {
        const parsed = parseOptionsText(text);
        setError(parsed.error);
        onChange(parsed.opciones);
      }}
      error={Boolean(error)}
      helperText={error ?? "Una por línea: valor = descripción"}
      sx={{ minWidth: 230 }}
    />
  );
}

export function ParametersTab({
  draft,
  setParametros,
  suggestions,
  defaults,
  onRename,
  onRemove
}: {
  draft: ModuleDraft;
  setParametros: (update: (parametros: DraftParameter[]) => DraftParameter[]) => void;
  suggestions: FormulaSuggestion[];
  /** Evaluacion con los valores por defecto: la que tiene que dar sin errores para guardar el modulo activo. */
  defaults: ModuleEvaluation;
  onRename: (from: string, to: string) => void;
  onRemove: (index: number) => void;
}) {
  const [focusedName, setFocusedName] = useState<string | null>(null);
  const allNames = [...draft.parametros.map((param) => param.clave), ...draft.piezas.map((pieza) => pieza.codigo)];
  const errorsByRef = new Map<string, string[]>();
  defaults.errores.forEach((error) => errorsByRef.set(error.ref.toUpperCase(), [...(errorsByRef.get(error.ref.toUpperCase()) ?? []), error.mensaje]));

  const patch = (index: number, changes: Partial<DraftParameter>) =>
    setParametros((parametros) => parametros.map((param, i) => (i === index ? { ...param, ...changes } : param)));
  const move = (index: number, delta: number) =>
    setParametros((parametros) => {
      const next = [...parametros];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  function calculatedValue(param: DraftParameter): { value?: number; error?: string } | null {
    if (param.tipo !== "CALCULADO" || !param.clave) return null;
    const syntax = formulaSyntaxError(param.formula ?? "");
    if (syntax) return { error: syntax };
    try {
      return { value: defaults.evaluarExpresion(param.clave) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary" variant="body2">
        Las medidas que se piden al cargar el módulo (ancho, alto, luces, cantidad de estantes, variantes) y las que se calculan solas. Las piezas las usan
        en sus fórmulas por la clave. Si cambiás una clave, las fórmulas que la usan se actualizan solas.
      </Typography>
      <Paper sx={{ borderRadius: "10px", overflow: "hidden" }}>
        <TableContainer>
          <Table size="small" sx={{ "& td": { verticalAlign: "top", py: 1 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 64 }}>Orden</TableCell>
                <TableCell>Clave</TableCell>
                <TableCell>Etiqueta</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Por defecto</TableCell>
                <TableCell align="right">Mínimo</TableCell>
                <TableCell align="right">Máximo</TableCell>
                <TableCell>Opciones o fórmula</TableCell>
                <TableCell>Ayuda</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {draft.parametros.map((param, index) => {
                const nameProblem = identifierProblem(param.clave, allNames);
                const errors = errorsByRef.get(param.clave.toUpperCase()) ?? [];
                const calculated = calculatedValue(param);
                const pedible = param.tipo !== "CALCULADO";
                const numberField = (field: "valorDefecto" | "minimo" | "maximo", label: string) => (
                  <TextField
                    size="small"
                    type="number"
                    value={param[field] ?? ""}
                    disabled={!pedible}
                    onChange={(event) => patch(index, { [field]: numberOrNull(event.target.value) })}
                    slotProps={{ htmlInput: { "aria-label": `${label} de ${param.clave}`, style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } } }}
                    sx={{ width: 104 }}
                    error={field === "valorDefecto" && errors.length > 0}
                    helperText={field === "valorDefecto" && errors.length ? errors.join(". ") : undefined}
                  />
                );
                return (
                  <TableRow key={param.uid}>
                    <TableCell>
                      <Stack direction="row">
                        <IconButton size="small" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
                          <ArrowUpwardIcon fontSize="inherit" />
                        </IconButton>
                        <IconButton size="small" aria-label="Bajar" disabled={index === draft.parametros.length - 1} onClick={() => move(index, 1)}>
                          <ArrowDownwardIcon fontSize="inherit" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={param.clave}
                        onFocus={() => setFocusedName(param.clave)}
                        onChange={(event) => patch(index, { clave: event.target.value.toUpperCase().replace(/\s+/g, "_") })}
                        onBlur={() => {
                          if (focusedName && focusedName !== param.clave && !nameProblem) onRename(focusedName, param.clave);
                          setFocusedName(null);
                        }}
                        error={Boolean(nameProblem)}
                        helperText={nameProblem ?? undefined}
                        slotProps={{ htmlInput: { "aria-label": "Clave", style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 } } }}
                        sx={{ width: 170 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={param.etiqueta}
                        onChange={(event) => patch(index, { etiqueta: event.target.value })}
                        error={!param.etiqueta.trim()}
                        slotProps={{ htmlInput: { "aria-label": "Etiqueta" } }}
                        sx={{ width: 160 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        value={param.tipo}
                        onChange={(event) => patch(index, { tipo: event.target.value as TipoParametroModulo })}
                        slotProps={{ htmlInput: { "aria-label": "Tipo" } }}
                        sx={{ width: 150 }}
                      >
                        {TIPOS.map((tipo) => (
                          <MenuItem key={tipo.value} value={tipo.value} title={tipo.ayuda}>
                            {tipo.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell align="right">{numberField("valorDefecto", "Valor por defecto")}</TableCell>
                    <TableCell align="right">{numberField("minimo", "Mínimo")}</TableCell>
                    <TableCell align="right">{numberField("maximo", "Máximo")}</TableCell>
                    <TableCell sx={{ minWidth: 260 }}>
                      {param.tipo === "OPCION" && <OptionsField value={param.opciones} onChange={(opciones) => patch(index, { opciones })} />}
                      {param.tipo === "CALCULADO" && (
                        <FormulaInput
                          id={`param-${param.uid}-formula`}
                          label="Fórmula"
                          value={param.formula ?? ""}
                          onChange={(formula) => patch(index, { formula })}
                          suggestions={suggestions.filter((item) => item.insert !== param.clave)}
                          error={calculated?.error ?? null}
                          helperText={calculated?.value !== undefined ? `Con los valores por defecto: ${formatMm(calculated.value)}` : undefined}
                          sx={{ width: "100%" }}
                        />
                      )}
                      {pedible && param.tipo !== "OPCION" && (
                        <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={param.ayuda ?? ""}
                        onChange={(event) => patch(index, { ayuda: event.target.value })}
                        multiline
                        maxRows={3}
                        slotProps={{ htmlInput: { "aria-label": "Ayuda" } }}
                        sx={{ width: 200 }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" color="error" aria-label={`Quitar ${param.clave}`} onClick={() => onRemove(index)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Stack direction="row">
        <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setParametros((parametros) => [...parametros, newParameter(parametros)])}>
          Agregar medida
        </Button>
      </Stack>
    </Stack>
  );
}

