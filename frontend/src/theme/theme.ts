import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#315c72" },
    secondary: { main: "#7a6a38" },
    success: { main: "#2e7d57" },
    background: {
      default: "#f4f6f3",
      paper: "#ffffff"
    }
  },
  shape: {
    borderRadius: 6
  },
  typography: {
    fontFamily: ["Inter", "Roboto", "Arial", "sans-serif"].join(","),
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 700 }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { boxShadow: "none" }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" }
      }
    }
  }
});
