import { CssBaseline, ThemeProvider } from "@mui/material";
import { GoogleOAuthProvider } from "@react-oauth/google";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { NewVersionNotice } from "./components/NewVersionNotice";
import { SessionExpiredDialog } from "./components/SessionExpiredDialog";
import { AuthProvider } from "./context/AuthContext";
import { CompanySettingsProvider } from "./context/CompanySettingsContext";
import { theme } from "./theme/theme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}>
        <BrowserRouter>
          <AuthProvider>
            <CompanySettingsProvider>
              <App />
              <SessionExpiredDialog />
            </CompanySettingsProvider>
          </AuthProvider>
        </BrowserRouter>
      </GoogleOAuthProvider>
      <NewVersionNotice />
    </ThemeProvider>
  </React.StrictMode>
);
