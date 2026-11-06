import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PageHeader, useCantappTheme } from "cantapp-components";
import { useApp } from "../contexts/AppContext";
import { useAuth } from "../contexts/AuthContext";
import { findChild } from "../config/modules";
import { findCatalog } from "../config/catalog";
import CatalogTable from "../components/CatalogTable";

export default function ModuleScreen({ moduleId, childId }) {
  const theme = useCantappTheme();
  const { modules } = useApp();
  const { markActivity } = useAuth();
  const router = useRouter();

  const module = modules.find((item) => item.id === moduleId);

  if (!module) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: theme.text }}>Módulo no habilitado.</Text>
      </View>
    );
  }

  const child = childId ? findChild(module, childId) : null;

  if (childId && !child) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: theme.text }}>Sección no disponible.</Text>
      </View>
    );
  }

  const entry = child ? findCatalog(moduleId, childId) : ["documentos", "asignaciones"].includes(moduleId) ? findCatalog(moduleId, "listado") : null;

  return (
    <View style={{ flex: 1, minHeight: 0, padding: 16, gap: 12, overflow: "hidden" }}>
      {!entry && <PageHeader title={child?.label || module.label} />}

      {entry ? (
        <CatalogTable
          key={`${moduleId}-${entry.id}`}
          entry={entry}
          group={moduleId}
        />
      ) : child ? (
        <View
          style={{
            padding: 20,
            borderWidth: 1,
            borderColor: theme.colorE,
            borderRadius: 4,
            backgroundColor: theme.colorD,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>
            {child.label}
          </Text>
          <Text style={{ color: theme.muted, marginTop: 8 }}>
            Esta sección requiere integrar su endpoint y formulario.
          </Text>
        </View>
      ) : (
        module.children?.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              markActivity();
              router.push(item.route);
            }}
            style={{
              padding: 18,
              borderWidth: 1,
              borderColor: theme.colorE,
              borderRadius: 4,
              backgroundColor: theme.colorD,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {item.label}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}
