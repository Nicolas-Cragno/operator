import React from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { AppProvider } from "../contexts/AppContext";
import AppShell from "../components/AppShell";
import Login from "../screens/Login";
import Status from "../screens/Status";
function RootContent() {
  const { phase, error } = useAuth();
  if (phase === "loading")
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  if (phase === "login") return <Login />;
  if (phase !== "ready")
    return (
      <Status
        title={
          phase === "maintenance"
            ? "En mantenimiento"
            : phase === "denied"
              ? "Acceso denegado"
              : "Error de conexiÃ³n"
        }
        message={error?.message || "No se pudo iniciar la aplicaciÃ³n"}
        retry={phase === "error"}
      />
    );
  return (
    <AppShell>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </AppShell>
  );
}
export default function RootLayout() {
  return (
    <AuthProvider>
      <AppProvider>
        <RootContent />
      </AppProvider>
    </AuthProvider>
  );
}
