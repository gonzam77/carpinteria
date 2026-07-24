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
          borderRadius: 8,
          minHeight: 40,
          paddingLeft: 18,
          paddingRight: 18
        },
        contained: {
          background: "linear-gradient(135deg, #f28c28 0%, #cf6d14 58%, #2f2a25 100%)",
          boxShadow: "0 14px 32px rgba(198, 106, 18, 0.24)",
          "&:hover": {
            boxShadow: "0 16px 38px rgba(123, 66, 14, 0.3)"
          }
        },
        outlined: {
          borderColor: alpha(brandOrange, 0.28),
          color: brandOrangeDeep,
          backgroundColor: brandPaper,
          "&:hover": {
            borderColor: brandOrange,
            backgroundColor: alpha(brandOrange, 0.06)
          }
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
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: "#f7f1e8",
          color: "#7b6f63",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.4
        },
        body: {
          borderBottomColor: "#efe5d9"
        }
      }
    },
    MuiTablePagination: {
      defaultProps: {
        labelRowsPerPage: "Filas por pagina:"
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
          "& .MuiDataGrid-columnHeaders": {
            backgroundColor: "#f7f1e8",
            color: "#7b6f63",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            fontSize: 12
          },
          "& .MuiDataGrid-row:hover": {
            backgroundColor: alpha(brandOrange, 0.06)
          },
          "& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus-within": {
            outline: "none"
          }
        }
      }
    }
  }
});
