import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { DesignSystemProvider } from "cantapp-components";
import { useAuth } from "./AuthContext";
import { visibleModules } from "../config/modules";
const Context = createContext(null);
export function AppProvider({ children }) {
  const { data } = useAuth();
  const system = useColorScheme();
  const [override, setOverride] = useState(null);
  const mode = override || "claro";
  const palette = data?.app?.paletaColores?.[mode];
  const modules = useMemo(
    () => visibleModules(data?.access?.modulos || []),
    [data?.access?.modulos],
  );
  const value = useMemo(
    () => ({
      mode,
      setMode: setOverride,
      modules,
      app: data?.app,
      user: data?.user,
    }),
    [mode, modules, data],
  );
  return (
    <Context.Provider value={value}>
      <DesignSystemProvider mode={mode} palette={palette}>
        {children}
      </DesignSystemProvider>
    </Context.Provider>
  );
}
export function useApp() {
  return useContext(Context);
}
