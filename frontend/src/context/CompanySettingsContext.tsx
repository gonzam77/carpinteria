import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { CompanySettings } from "../types";
import { useAuth } from "./AuthContext";

type CompanySettingsContextValue = {
  settings: CompanySettings;
  loading: boolean;
  refresh: () => Promise<void>;
  updateSettings: (payload: Pick<CompanySettings, "nombre" | "telefono" | "email">) => Promise<CompanySettings>;
};

const DEFAULT_SETTINGS: CompanySettings = {
  id: "default",
  nombre: "ROMA",
  telefono: "",
  email: ""
};

const CompanySettingsContext = createContext<CompanySettingsContextValue | undefined>(undefined);

export function CompanySettingsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!token) {
      setSettings(DEFAULT_SETTINGS);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get<CompanySettings>("/company-settings");
      setSettings(response.data);
    } finally {
      setLoading(false);
    }
  }

  // Depende de si HAY sesion, no del valor del token: este ahora se renueva
  // sola cada tanto, y no hace falta volver a pedir los datos de la empresa
  // cada vez que eso pasa.
  const authenticated = !!token;

  useEffect(() => {
    refresh().catch(() => {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const value = useMemo<CompanySettingsContextValue>(
    () => ({
      settings,
      loading,
      refresh,
      updateSettings: async (payload) => {
        const response = await api.put<CompanySettings>("/company-settings", payload);
        setSettings(response.data);
        return response.data;
      }
    }),
    [loading, settings]
  );

  return <CompanySettingsContext.Provider value={value}>{children}</CompanySettingsContext.Provider>;
}

export function useCompanySettings() {
  const context = useContext(CompanySettingsContext);
  if (!context) throw new Error("useCompanySettings debe usarse dentro de CompanySettingsProvider");
  return context;
}
