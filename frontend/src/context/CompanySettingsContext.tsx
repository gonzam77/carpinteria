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

  useEffect(() => {
    refresh().catch(() => {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
    });
  }, [token]);

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
