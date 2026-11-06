import React from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useCantappTheme } from "cantapp-components";

import { formatRecordValue } from "../utils/formatRecord";

/** Native Modal is hosted above the app's navigation shell (Sidebar/LowBar). */
export default function RecordDetailModal({ record, title = "Ficha", onClose }) {
  const theme = useCantappTheme();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 640;
  return (
    <Modal
      visible={record != null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: isCompact ? 12 : 24, backgroundColor: "rgba(0,0,0,0.65)" }}>
        <Pressable accessibilityLabel="Cerrar ficha" onPress={onClose} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
        <View style={{ width: "100%", maxWidth: 840, maxHeight: height * 0.9, backgroundColor: theme.colorD || "#fff", borderColor: theme.colorE || "#aaa", borderWidth: 1, borderRadius: 4, overflow: "hidden" }}>
          <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: theme.colorE || "#aaa" }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: "bold", fontSize: 20, flexShrink: 1 }}>{title}{record?.id != null ? ` · ${record.id}` : ""}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar ficha" onPress={onClose} style={{ padding: 10, marginLeft: 10, borderWidth: 1, borderColor: theme.colorE || "#aaa", borderRadius: 4 }}>
              <Text style={{ color: theme.text, fontWeight: "bold" }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
            {Object.entries(record || {}).map(([key, value]) => (
              <View key={key} style={{ gap: 4, borderBottomWidth: 1, borderColor: theme.colorE || "#aaa", paddingBottom: 10 }}>
                <Text style={{ color: theme.muted || theme.text, fontSize: 12, fontWeight: "bold" }}>{key}</Text>
                <Text selectable style={{ color: theme.text, fontSize: 14 }}>{formatRecordValue(value)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
