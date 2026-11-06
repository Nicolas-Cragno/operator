import React from "react";
import { Text } from "react-native";
const icons = { house: "⌂", "door-open": "⇥", wrench: "⚒", "clipboard-list": "☷", "file-text": "▤", truck: "▰", package: "▣", "chart-no-axes-combined": "▥", "key-round": "⚿", menu: "☰", "chevron-right": "›" };
export default function ModuleIcon({ name, color, size = 22 }) { return <Text accessibilityLabel={name} style={{ color, fontSize: size, fontWeight: "700", textAlign: "center" }}>{icons[name] || "▦"}</Text>; }
