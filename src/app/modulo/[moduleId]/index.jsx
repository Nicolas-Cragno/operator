import { useLocalSearchParams } from "expo-router";
import ModuleScreen from "../../../screens/Module";
export default function ModuleIndex() { const { moduleId } = useLocalSearchParams(); return <ModuleScreen moduleId={moduleId} />; }

