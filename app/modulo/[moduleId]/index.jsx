import React from "react";
import { useLocalSearchParams } from "expo-router";
import ModuleScreen from "../../../src/screens/Module";
export default function Page() { const { moduleId } = useLocalSearchParams(); return <ModuleScreen moduleId={moduleId}/>; }
