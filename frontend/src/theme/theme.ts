import { alpha, createTheme } from "@mui/material/styles";
import type {} from "@mui/x-data-grid/themeAugmentation";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#4f7cff", light: "#eaf0ff", dark: "#2f55d8", contrastText: "#ffffff" },
    secondary: { main: "#23d6c8", light: "#dffbf8", dark: "#11a99e", contrastText: "#063d55" },
    success: { main: "#21c383", light: "#dcfff2", dark: "#0e8058" },
    warning: { main: "#ffb020", light: "#fff3d8", dark: "#b36b00" },
    error: { main: "#ff5a7a", light: "#ffe6ec", dark: "#c72c50" },
    info: { main: "#6c63ff", light: "#ecebff", dark: "#4338ca" },
    background: {
      default: "#f4f7ff",
      paper: "#ffffff"
    },
    text: {
      primary: "#17203a",
      secondary: "#7d8aa7"
    },
    divider: "#e7ecf8",
    action: {
      hover: alpha("#4f7cff", 0.08),
      selected: alpha("#4f7cff", 0.14)
    }
  },
  shape: {
    borderRadius: 8
  },
  typography: {
    fontFamily: ["Inter", "Roboto", "Arial", "sans-serif"].join(","),
    h4: { fontWeight: 900, letterSpacing: 0, color: "#17203a" },
    h5: { fontWeight: 800, letterSpacing: 0 },
    h6: { fontWeight: 800, letterSpacing: 0 },
    button: { textTransform: "none", fontWeight: 800, letterSpacing: 0 }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at 18% 0%, rgba(35, 214, 200, 0.18), transparent 30%), radial-gradient(circle at 90% 10%, rgba(108, 99, 255, 0.13), transparent 30%), linear-gradient(135deg, #f8fbff 0%, #eef4ff 48%, #f8fbff 100%)"
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
          background: "linear-gradient(135deg, #4f7cff 0%, #23d6c8 100%)",
          boxShadow: "0 14px 32px rgba(79, 124, 255, 0.28)",
          "&:hover": {
            boxShadow: "0 16px 38px rgba(79, 124, 255, 0.34)"
          }
        },
        outlined: {
          borderColor: alpha("#4f7cff", 0.25),
          color: "#3e63df",
          backgroundColor: "#ffffff",
          "&:hover": {
            borderColor: "#4f7cff",
            backgroundColor: alpha("#4f7cff", 0.06)
          }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(222, 229, 248, 0.95)",
          boxShadow: "0 20px 50px rgba(44, 69, 135, 0.12)"
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(222, 229, 248, 0.85)",
          color: "#17203a",
          boxShadow: "0 18px 40px rgba(44, 69, 135, 0.08)"
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: "linear-gradient(180deg, #1fd5c7 0%, #4f7cff 55%, #3568e6 100%)",
          borderRight: 0,
          color: "#ffffff",
          boxShadow: "18px 0 50px rgba(48, 94, 224, 0.22)"
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
          backgroundColor: "#ffffff",
          "& fieldset": {
            borderColor: alpha("#99a8d8", 0.28)
          },
          "&:hover fieldset": {
            borderColor: alpha("#4f7cff", 0.5)
          },
          "&.Mui-focused fieldset": {
            borderColor: "#4f7cff",
            boxShadow: `0 0 0 3px ${alpha("#4f7cff", 0.13)}`
          }
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: "#f6f8ff",
          color: "#7481a4",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.4
        },
        body: {
          borderBottomColor: "#edf1fb"
        }
      }
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 0,
          color: "#24304f",
          "--DataGrid-rowBorderColor": "#edf1fb",
          "& .MuiDataGrid-columnHeaders": {
            backgroundColor: "#f6f8ff",
            color: "#7481a4",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            fontSize: 12
          },
          "& .MuiDataGrid-row:hover": {
            backgroundColor: alpha("#4f7cff", 0.06)
          },
          "& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus-within": {
            outline: "none"
          }
        }
      }
    }
  }
});
