import { MenuItem, MenuList, Paper, Popper, TextField, Typography, type SxProps, type Theme } from "@mui/material";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { matchSuggestions, wordAtCaret, type FormulaSuggestion } from "../lib/moduleEditor";

type FormulaInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: FormulaSuggestion[];
  /** Error de la formula (sintaxis o calculo). Se muestra en rojo debajo, con aria-describedby. */
  error?: string | null;
  helperText?: string;
  disabled?: boolean;
  sx?: SxProps<Theme>;
};

/**
 * Campo de formula del editor de modulos (spec §6.2): al tipear sugiere medidas, CODIGO.largo/ancho/cant de las
 * piezas, ESP y funciones. Flechas para elegir, Enter o Tab para completar, Escape para cerrar.
 */
export function FormulaInput({ id, label, value, onChange, suggestions, error, helperText, disabled, sx }: FormulaInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [word, setWord] = useState<{ start: number; word: string; caret: number } | null>(null);
  const [active, setActive] = useState(0);

  const items = useMemo(() => (word ? matchSuggestions(suggestions, word.word) : []), [suggestions, word]);
  const open = items.length > 0;

  function refreshWord(text: string, caret: number | null) {
    const found = caret === null ? null : wordAtCaret(text, caret);
    setWord(found && caret !== null ? { ...found, caret } : null);
    setActive(0);
  }

  function apply(item: FormulaSuggestion) {
    if (!word) return;
    const next = value.slice(0, word.start) + item.insert + value.slice(word.caret);
    const caret = word.start + item.insert.length;
    onChange(next);
    setWord(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      apply(items[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setWord(null);
    }
  }

  const listId = `${id}-sugerencias`;
  return (
    <>
      <TextField
        id={id}
        inputRef={inputRef}
        size="small"
        label={label}
        value={value}
        disabled={disabled}
        error={Boolean(error)}
        helperText={error || helperText || " "}
        onChange={(event) => {
          onChange(event.target.value);
          refreshWord(event.target.value, event.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setWord(null)}
        sx={sx}
        slotProps={{
          htmlInput: {
            spellCheck: false,
            autoComplete: "off",
            role: "combobox",
            "aria-expanded": open,
            "aria-controls": open ? listId : undefined,
            "aria-autocomplete": "list",
            "aria-activedescendant": open ? `${listId}-${active}` : undefined,
            style: { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 13 }
          },
          formHelperText: { sx: { mx: 0.5, lineHeight: 1.3 } }
        }}
      />
      <Popper open={open} anchorEl={inputRef.current?.parentElement ?? null} placement="bottom-start" sx={{ zIndex: 1400 }}>
        <Paper elevation={6} sx={{ mt: 0.5, minWidth: 220, maxWidth: 360 }}>
          <MenuList id={listId} role="listbox" dense>
            {items.map((item, index) => (
              <MenuItem
                key={item.insert}
                id={`${listId}-${index}`}
                role="option"
                selected={index === active}
                aria-selected={index === active}
                // mousedown en vez de click: si no, el blur del campo cierra la lista antes de elegir.
                onMouseDown={(event) => {
                  event.preventDefault();
                  apply(item);
                }}
                sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
              >
                <Typography variant="body2" sx={{ fontFamily: "ui-monospace, Consolas, monospace" }}>
                  {item.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {item.detail}
                </Typography>
              </MenuItem>
            ))}
          </MenuList>
        </Paper>
      </Popper>
    </>
  );
}
