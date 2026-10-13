import { alpha, createTheme } from "@mui/material/styles";
import { esES } from "@mui/x-data-grid/locales";
import type {} from "@mui/x-data-grid/themeAugmentation";

const brandOrange = "#f28c28";
const brandOrangeDeep = "#d87413";
const brandGraphite = "#23201d";
const brandCoal = "#111111";
const brandStone = "#6f6760";
const brandSand = "#f6f2eb";
const brandPaper = "#fffdfa";
const focusRing = { outline: `2px solid ${brandGraphite}`, outlineOffset: -2 };

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: brandOrange, light: "#fff1df", dark: brandOrangeDeep, contrastText: "#ffffff" },
    secondary: { main: "#4f4943", light: "#efebe6", dark: brandGraphite, contrastText: "#ffffff" },
    success: { main: "#c9771d", light: "#fff0dd", dark: "#9d5710" },
    warning: { main: "#e2a43a", light: "#fff5df", dark: "#a16807" },
    error: { main: "#cb5b4a", light: "#fde9e5", dark: "#96382b" },
    info: { main: "#7e7368", light: "#f1ece6", dark: "#564c44" },
    background: {
      default: brandSand,
      paper: brandPaper
    },
    text: {
      primary: "#181512",
      secondary: brandStone
    },
    divider: "#eadfd1",
    action: {
      hover: alpha(brandOrange, 0.08),
      selected: alpha(brandOrange, 0.14)
    }
  },
  shape: {
    borderRadius: 8
  },
  typography: {
    fontFamily: ['"Aptos"', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'].join(","),
    h4: { fontWeight: 900, letterSpacing: 0, color: "#181512" },
    h5: { fontWeight: 800, letterSpacing: 0 },
    h6: { fontWeight: 800, letterSpacing: 0 },
    button: { textTransform: "none", fontWeight: 800, letterSpacing: 0 }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at 14% 0%, rgba(242, 140, 40, 0.18), transparent 30%), radial-gradient(circle at 100% 10%, rgba(62, 57, 52, 0.12), transparent 28%), linear-gradient(135deg, #fbf8f4 0%, #f3ede4 48%, #fbf8f4 100%)"
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          borderRadius: 10,
          minHeight: 40,
          paddingLeft: 18,
          paddingRight: 18,
          // Todos los botones responden al mouse (2026-10-13): se levantan un poco y el icono se corre hacia afuera.
          transition: "transform 140ms ease, box-shadow 160ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease",
          "& .MuiButton-startIcon, & .MuiButton-endIcon": { transition: "transform 160ms ease" },
          "&:hover:not(.Mui-disabled)": { transform: "translateY(-1px)" },
          "&:hover .MuiButton-startIcon": { transform: "translateX(-2px)" },
          "&:hover .MuiButton-endIcon": { transform: "translateX(2px)" },
          "&:active:not(.Mui-disabled)": { transform: "translateY(0)" },
          "@media (prefers-reduced-motion: reduce)": {
            transition: "none",
            "&:hover:not(.Mui-disabled)": { transform: "none" },
            "&:hover .MuiButton-startIcon, &:hover .MuiButton-endIcon": { transform: "none" }
          }
        },
        text: {
          "&:hover": { backgroundColor: alpha(brandOrange, 0.1) }
        },
        contained: {
          background: "linear-gradient(135deg, #f28c28 0%, #cf6d14 58%, #2f2a25 100%)",
          boxShadow: "0 14px 32px rgba(198, 106, 18, 0.24)",
          "&:hover": {
            background: "linear-gradient(135deg, #f59a3c 0%, #d87413 52%, #3a332d 100%)",
            boxShadow: "0 18px 40px rgba(123, 66, 14, 0.34)"
          },
          // Deshabilitado se ve deshabilitado: sin el degradado ni la sombra, que lo hacian parecer activo (F7.2).
          "&.Mui-disabled": {
            background: "none",
            backgroundColor: "rgba(0, 0, 0, 0.12)",
            boxShadow: "none"
          }
        },
        outlined: {
          borderColor: alpha(brandOrange, 0.28),
          color: brandOrangeDeep,
          backgroundColor: brandPaper,
          "&:hover": {
            borderColor: brandOrange,
            backgroundColor: alpha(brandOrange, 0.08),
            boxShadow: `0 8px 20px ${alpha(brandOrange, 0.16)}`
          }
        },
        // Los de color (error, etc.) conservan su color en el borde y el texto.
        outlinedError: {
          borderColor: alpha("#cb5b4a", 0.4),
          color: "#96382b",
          "&:hover": { borderColor: "#cb5b4a", backgroundColor: alpha("#cb5b4a", 0.08), boxShadow: `0 8px 20px ${alpha("#cb5b4a", 0.16)}` }
        },
        outlinedInherit: {
          borderColor: alpha(brandGraphite, 0.22),
          color: brandGraphite,
          "&:hover": { borderColor: brandGraphite, backgroundColor: alpha(brandGraphite, 0.05), boxShadow: `0 8px 20px ${alpha(brandGraphite, 0.1)}` }
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "background-color 160ms ease, transform 140ms ease, color 160ms ease",
          "&:hover:not(.Mui-disabled)": { transform: "scale(1.08)" },
          "@media (prefers-reduced-motion: reduce)": { "&:hover:not(.Mui-disabled)": { transform: "none" } }
        }
      }
    },
    MuiInputAdornment: {
      styleOverrides: {
        // Los iconos de los campos (2026-10-13): en el gris de la marca, y naranja cuando el campo tiene el foco.
        root: {
          color: brandStone,
          "& .MuiSvgIcon-root": { fontSize: 19 },
          ".Mui-focused &": { color: brandOrangeDeep },
          ".Mui-error &": { color: "#cb5b4a" }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(228, 216, 202, 0.95)",
          boxShadow: "0 20px 50px rgba(45, 35, 24, 0.09)"
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: "rgba(255, 250, 244, 0.9)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(228, 216, 202, 0.85)",
          color: "#181512",
          boxShadow: "0 18px 40px rgba(45, 35, 24, 0.08)"
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: "linear-gradient(180deg, #3c342d 0%, #201c19 58%, #111111 100%)",
          borderRight: 0,
          color: "#ffffff",
          boxShadow: "18px 0 50px rgba(17, 17, 17, 0.24)"
        }
      }
    },
    MuiTextField: {
      defaultProps: {
        size: "small"
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: brandPaper,
          "& fieldset": {
            borderColor: alpha("#8e8174", 0.22)
          },
          "&:hover fieldset": {
            borderColor: alpha(brandOrange, 0.46)
          },
          "&.Mui-focused fieldset": {
            borderColor: brandOrange,
            boxShadow: `0 0 0 3px ${alpha(brandOrange, 0.14)}`
          }
        }
      }
    },
    // Grillas (2026-10-13): todo el texto centrado, encabezados claros y filas que se marcan al pasar el mouse.
    MuiTableCell: {
      styleOverrides: {
        root: {
          textAlign: "center"
        },
        head: {
          backgroundColor: "#f7f1e8",
          color: "#6b5f54",
          fontSize: 12.5,
          fontWeight: 800,
          letterSpacing: 0.2,
          borderBottom: `2px solid ${alpha(brandOrange, 0.22)}`,
          whiteSpace: "nowrap"
        },
        body: {
          borderBottomColor: "#efe5d9",
          fontVariantNumeric: "tabular-nums"
        }
      }
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: "background-color 120ms ease",
          "&.MuiTableRow-hover:hover, tbody &:hover": { backgroundColor: alpha(brandOrange, 0.045) }
        }
      }
    },
    MuiTablePagination: {
      defaultProps: {
        labelRowsPerPage: "Filas por página:"
      }
    },
    MuiDataGrid: {
      defaultProps: {
        localeText: {
          ...esES.components.MuiDataGrid.defaultProps.localeText,
          noRowsLabel: "Sin registros",
          noResultsOverlayLabel: "Sin resultados"
        }
      },
      styleOverrides: {
        root: {
          border: 0,
          color: "#2a241f",
          "--DataGrid-rowBorderColor": "#efe5d9",
          fontVariantNumeric: "tabular-nums",
          "& .MuiDataGrid-columnHeaders": {
            color: "#6b5f54",
            fontSize: 12.5,
            letterSpacing: 0.2
          },
          "& .MuiDataGrid-columnHeader": {
            backgroundColor: "#f7f1e8",
            borderBottom: `2px solid ${alpha(brandOrange, 0.22)}`
          },
          "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 800 },
          // Todo centrado (2026-10-13), aunque la columna diga otra cosa: encabezados y celdas.
          "& .MuiDataGrid-columnHeaderTitleContainer": { justifyContent: "center" },
          "& .MuiDataGrid-columnHeader--alignRight .MuiDataGrid-columnHeaderTitleContainer": { flexDirection: "row" },
          "& .MuiDataGrid-columnHeaderTitleContainerContent": { justifyContent: "center" },
          "& .MuiDataGrid-cell--textLeft, & .MuiDataGrid-cell--textRight": { textAlign: "center", justifyContent: "center" },
          "& .MuiDataGrid-row": { transition: "background-color 120ms ease" },
          "& .MuiDataGrid-row:hover": {
            backgroundColor: alpha(brandOrange, 0.07)
          },
          "& .MuiDataGrid-footerContainer": { borderTop: "1px solid #efe5d9", backgroundColor: alpha("#f7f1e8", 0.5) },
          "& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus-within": {
            outline: "none"
          },
          // El foco del teclado se ve en todas las grillas (F7.2, antes solo en la de modulos, DECISIONES 44): un contorno
          // grafito que contrasta con las celdas y los encabezados, solo con el teclado (:focus-visible), asi un click se ve
          // como siempre. En la columna de las casillas el foco pasa a la casilla de adentro. La fila se marca con una barra
          // al costado, no con el fondo, que es el de las filas marcadas. Reglas separadas: un navegador sin :has()
          // (Firefox ESR 115) descarta la regla entera, y asi pierde solo esas.
          "& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible": focusRing,
          "& .MuiDataGrid-cell:has(:focus-visible), & .MuiDataGrid-columnHeader:has(:focus-visible)": focusRing,
          "& .MuiDataGrid-row:has(:focus-visible)": { boxShadow: `inset 3px 0 0 ${brandGraphite}` }
        }
      }
    }
  }
});
