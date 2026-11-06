
import navigationConfig from "./navigation.config";

const validModules = [
    "porteria",
    "talleres",
    "asignaciones",
    "documentos",
    "posicion",
];

export function hasModule(ids = [], moduleId) {
    if (moduleId === "recursos") {
        return ids.includes("porteria") || ids.includes("talleres");
    }

    return validModules.includes(moduleId) && ids.includes(moduleId);
}

export function visibleModules(ids = []) {
    return navigationConfig.filter(module => hasModule(ids, module.id));
}

export function findModule(id, ids = []) {
    return visibleModules(ids).find(module => module.id === id);
}

export function findChild(module, childId) {
    return module?.children?.find(child => child.id === childId);
}
