import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import FunctionsIcon from "@mui/icons-material/Functions";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import RuleIcon from "@mui/icons-material/Rule";
import SearchIcon from "@mui/icons-material/Search";
import StraightenIcon from "@mui/icons-material/Straighten";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { formulaHelp, insertAt, type FormulaKind } from "../lib/formulaHelp";
import type { FormulaSuggestion } from "../lib/moduleEditor";
import { collectRefs, parseFormula } from "../lib/moduleFormula";

const mono = "ui-monospace, SFMono-Regular, Consolas, monospace";

/** Un nombre que se puede usar en la formula: al tocarlo se escribe donde esta el cursor. */
function Token({ insert, label, detail, onInsert }: { insert: string; label?: string; detail?: string; onInsert: (text: string) => void }) {
  return (
    <Tooltip title={detail ? `${detail} · tocá para agregarlo` : "Tocá para agregarlo"} placement="top">
      <ButtonBase
        onClick={() => onInsert(insert)}
        sx={{
          px: 1,
          py: 0.4,
          borderRadius: "8px",
          border: 1,
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
          fontFamily: mono,
          fontSize: 12.5,
          fontWeight: 700,
          color: "primary.dark",
          transition: "background-color 140ms, border-color 140ms",
          "&:hover": { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.16), borderColor: "primary.main" }
        }}
      >
        {label ?? insert}
      </ButtonBase>
    </Tooltip>
  );
}

function Block({ icon, title, children, count }: { icon: ReactNode; title: string; children: ReactNode; count?: number }) {
  return (
    <Box component="section" aria-label={title}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Box aria-hidden sx={{ color: "primary.main", display: "flex", "& svg": { fontSize: 19 } }}>
          {icon}
        </Box>
        <Typography component="h3" fontWeight={800} fontSize="0.95rem">
          {title}
        </Typography>
        {count !== undefined && (
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            {count}
          </Typography>
        )}
      </Stack>
      {children}
    </Box>
  );
}

/**
 * La ayuda de un campo de formula (2026-10-13): que calcula, ejemplos, las medidas y piezas que existen en ESE campo,
 * ESP, las funciones con su ejemplo, los operadores y las reglas. Se escribe ahi mismo: tocar un nombre lo agrega donde
 * esta el cursor y la formula se va guardando en el campo de atras.
 */
export function FormulaHelpDialog({
  open,
  onClose,
  kind,
  label,
  value,
  onChange,
  suggestions,
  error,
  helperText,
  scope = "module"
}: {
  open: boolean;
  onClose: () => void;
  kind: FormulaKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: FormulaSuggestion[];
  error?: string | null;
  helperText?: string;
  scope?: "module" | "catalog";
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState("");
  const help = useMemo(() => formulaHelp(kind, suggestions), [kind, suggestions]);
  const available = useMemo(() => new Set(suggestions.map((item) => item.insert.split(".")[0])), [suggestions]);

  function insert(text: string) {
    const input = inputRef.current;
    const result = insertAt(value, text, input?.selectionStart ?? null, input?.selectionEnd ?? null);
    onChange(result.value);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(result.caret, result.caret);
    });
  }

  /** Los nombres de un ejemplo que este modulo no tiene (los ejemplos usan nombres frecuentes del catalogo). */
  function missing(formula: string) {
    try {
      return [...new Set(collectRefs(parseFormula(formula)).map((ref) => ref.id))].filter((id) => !available.has(id));
    } catch {
      return [];
    }
  }

  const q = filter.trim().toUpperCase();
  const medidas = help.medidas.filter((item) => !q || item.insert.includes(q) || item.detail.toUpperCase().includes(q));
  const piezas = help.piezas.filter((item) => !q || item.codigo.includes(q) || item.nombre.toUpperCase().includes(q));
  const funciones = help.funciones.filter((item) => !q || item.nombre.includes(q) || item.descripcion.toUpperCase().includes(q));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen} aria-labelledby="formula-help-title" scroll="paper">
      <DialogTitle id="formula-help-title" sx={{ pr: 6 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box aria-hidden sx={{ width: 38, height: 38, borderRadius: "11px", display: "grid", placeItems: "center", bgcolor: alpha(theme.palette.primary.main, 0.12), color: "primary.dark" }}>
            <CalculateOutlinedIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="span" display="block" fontWeight={900} fontSize="1.15rem" lineHeight={1.2}>
              Fórmulas para «{label}»
            </Typography>
            <Typography component="span" display="block" variant="body2" color="text.secondary">
              {help.titulo}
            </Typography>
          </Box>
        </Stack>
        <IconButton aria-label="Cerrar la ayuda" onClick={onClose} sx={{ position: "absolute", right: 12, top: 14 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: alpha("#f7f1e8", 0.35) }}>
        <Stack spacing={2.5}>
          <Box sx={{ p: 2, borderRadius: "14px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {help.queCalcula}
            </Typography>
            <TextField
              inputRef={inputRef}
              autoFocus
              fullWidth
              label={label}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              error={Boolean(error)}
              helperText={error || helperText || "Escribí acá o tocá los nombres de abajo para agregarlos donde está el cursor."}
              slotProps={{
                htmlInput: { spellCheck: false, autoComplete: "off", style: { fontFamily: mono, fontSize: 14 } },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <FunctionsIcon />
                    </InputAdornment>
                  )
                }
              }}
            />
          </Box>

          {scope === "catalog" && (
            <Alert severity="info" sx={{ borderRadius: "12px" }}>
              Esta fórmula se copia a cada módulo al que le agregues el herraje. Abajo están las medidas y piezas que existen en el catálogo, con en cuántos módulos está cada una: usá las que tienen todos los módulos donde va el herraje.
            </Alert>
          )}

          <Block icon={<LightbulbOutlinedIcon />} title="Ejemplos para este campo">
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
              {help.ejemplos.map((example) => {
                const faltan = missing(example.formula);
                return (
                  <Box key={example.formula} sx={{ p: 1.5, borderRadius: "12px", bgcolor: "background.paper", border: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 0.75 }}>
                    <Typography sx={{ fontFamily: mono, fontSize: 13, fontWeight: 800, color: "primary.dark", overflowWrap: "anywhere" }}>{example.formula}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      {example.explicacion}
                    </Typography>
                    {faltan.length > 0 && (
                      <Typography variant="caption" color="warning.dark">
                        {scope === "catalog" ? "El catálogo" : "Este módulo"} no tiene {faltan.join(", ")}: cambialo por uno de la lista.
                      </Typography>
                    )}
                    <Button size="small" variant="outlined" startIcon={<CheckIcon />} onClick={() => onChange(example.formula)} sx={{ alignSelf: "flex-start", minHeight: 30 }}>
                      Usar este ejemplo
                    </Button>
                  </Box>
                );
              })}
            </Box>
          </Block>

          <TextField
            size="small"
            placeholder="Buscar una medida, pieza o función"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              },
              htmlInput: { "aria-label": "Buscar en la ayuda" }
            }}
          />

          <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1.3fr" }, alignItems: "start" }}>
            <Stack spacing={2.5}>
              <Block icon={<StraightenIcon />} title={scope === "catalog" ? "Medidas del catálogo" : "Medidas del módulo"} count={medidas.length}>
                {medidas.length ? (
                  <Stack spacing={0.75}>
                    {medidas.map((item) => (
                      <Stack key={item.insert} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Token insert={item.insert} detail={item.detail} onInsert={insert} />
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }} title={item.detail}>
                          {item.detail}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {q ? "Ninguna medida coincide con la búsqueda." : "Todavía no hay medidas: cargalas en la pestaña Medidas."}
                  </Typography>
                )}
              </Block>
              {help.constantes.length > 0 && !q && (
                <Block icon={<RuleIcon />} title="Constantes">
                  {help.constantes.map((item) => (
                    <Stack key={item.insert} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Token insert={item.insert} detail={item.detail} onInsert={insert} />
                      <Typography variant="body2" color="text.secondary" textAlign="right">
                        {item.detail}
                      </Typography>
                    </Stack>
                  ))}
                </Block>
              )}
              {!q && (
                <Block icon={<CalculateOutlinedIcon />} title="Operadores">
                  <Stack spacing={0.5}>
                    {help.operadores.map((item) => (
                      <Stack key={item.simbolo} direction="row" spacing={1.5} alignItems="baseline">
                        <Typography sx={{ fontFamily: mono, fontWeight: 800, fontSize: 13, minWidth: 92, color: "primary.dark", whiteSpace: "pre" }}>{item.simbolo}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.descripcion}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Block>
              )}
            </Stack>

            <Stack spacing={2.5}>
              <Block icon={<ViewInArOutlinedIcon />} title={scope === "catalog" ? "Piezas del catálogo" : "Piezas"} count={piezas.length}>
                {piezas.length ? (
                  <Stack spacing={0.75}>
                    {piezas.map((pieza) => (
                      <Box key={pieza.codigo} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 1, alignItems: "center", py: 0.5, borderBottom: 1, borderColor: "divider" }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontFamily: mono, fontWeight: 800, fontSize: 13 }} noWrap>
                            {pieza.codigo}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap component="p" title={pieza.nombre}>
                            {pieza.nombre}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          {pieza.accesos.map((acceso) => (
                            <Token key={acceso.insert} insert={acceso.insert} label={acceso.label} detail={`${acceso.detail} de ${pieza.codigo}`} onInsert={insert} />
                          ))}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {q ? "Ninguna pieza coincide con la búsqueda." : "No hay otras piezas para usar en este campo."}
                  </Typography>
                )}
              </Block>
              <Block icon={<FunctionsIcon />} title="Funciones" count={funciones.length}>
                <Stack spacing={1}>
                  {funciones.map((fn) => (
                    <Box key={fn.nombre} sx={{ p: 1.25, borderRadius: "12px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Token insert={fn.insert} label={fn.sintaxis} detail={fn.descripcion} onInsert={insert} />
                      </Stack>
                      <Typography variant="body2">{fn.descripcion}</Typography>
                      {fn.ejemplo && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                          <Box component="span" sx={{ fontFamily: mono, fontSize: 12.5, color: "text.primary", fontWeight: 700 }}>
                            {fn.ejemplo}
                          </Box>{" "}
                          {fn.explicacion}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Block>
            </Stack>
          </Box>

          {!q && (
            <Alert severity="info" icon={<RuleIcon />} sx={{ borderRadius: "12px" }}>
              <Typography fontWeight={800} variant="body2" sx={{ mb: 0.5 }}>
                Para que la fórmula funcione
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                {help.reglas.map((regla) => (
                  <li key={regla}>
                    <Typography variant="body2">{regla}</Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button variant="contained" startIcon={<CheckIcon />} onClick={onClose}>
          Listo
        </Button>
      </DialogActions>
    </Dialog>
  );
}
