import { useLocalSearchParams } from "expo-router";
import ModuleScreen from "../../../screens/Module";
export default function ModuleChild() { const { moduleId, childId } = useLocalSearchParams(); return <ModuleScreen moduleId={moduleId} childId={childId} />; }

