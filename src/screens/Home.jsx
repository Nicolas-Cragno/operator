import React from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { PageHeader, useCantappTheme } from "cantapp-components";
import { useApp } from "../contexts/AppContext";
import { useAuth } from "../contexts/AuthContext";
import ModuleIcon from "../components/ModuleIcon";
export default function Home() {
  const t = useCantappTheme();
  const { modules, user, app } = useApp();
  const { data } = useAuth();
  const { markActivity } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  return (
    <ScrollView contentContainerStyle={{ padding: 22, gap: 22 }}>
      <PageHeader
        title={`Bienvenido${user?.nombres ? `, ${user.nombres}` : ""}`}
        description={`Seleccioná un módulo de ${app?.nombre || "CANTAPP"}`}
      />
      {data?.demo && (
        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: t.colorE,
            borderRadius: 4,
          }}
        >
          <Text style={{ color: t.muted }}>
            MODO PLANTILLA · Navegación y módulos de demostración. No representa
            permisos reales ni habilita operaciones sobre datos.
          </Text>
        </View>
      )}
      {modules.filter((m) => m.showIn?.includes("home")).length === 0 ? (
        <Text style={{ color: t.muted }}>No tenés módulos habilitados.</Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {modules
            .filter((m) => m.showIn?.includes("home"))
            .map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  markActivity();
                  router.push(m.route);
                }}
                style={({ pressed }) => ({
                  width: desktop ? 235 : "100%",
                  minHeight: desktop ? 150 : 78,
                  flexDirection: desktop ? "column" : "row",
                  alignItems: "center",
                  justifyContent: desktop ? "center" : "flex-start",
                  gap: 14,
                  borderWidth: 1,
                  borderColor: t.colorE,
                  borderRadius: 4,
                  backgroundColor: t.colorD,
                  padding: 18,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <ModuleIcon
                  name={m.icon}
                  color={t.colorA}
                  size={desktop ? 32 : 26}
                />
                <View style={{ gap: 4, flex: desktop ? undefined : 1 }}>
                  <Text
                    style={{ color: t.text, fontWeight: "700", fontSize: 17 }}
                  >
                    {m.label}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    {m.children?.map((c) => c.label).join(" · ") ||
                      "Abrir módulo"}
                  </Text>
                </View>
                {!desktop && (
                  <ModuleIcon name="chevron-right" color={t.text} size={18} />
                )}
              </Pressable>
            ))}
        </View>
      )}
    </ScrollView>
  );
}
