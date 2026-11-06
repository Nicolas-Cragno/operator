const WRITE_ROLES = ["dev", "superadmin", "admin"];

// Capabilities are issued by bootstrap. Missing capabilities never grant writes.
export function operationUnavailableReason(user, capabilities) {
  if (!WRITE_ROLES.includes(user?.rol)) return "";
  if (!capabilities) return "El servidor no informó los permisos de alta y edición (access.crud). Actualizá los permisos de la sesión para volver a consultarlos.";
  if (capabilities.version !== 1) return "La versión de permisos del servidor no es compatible con los formularios de Operator.";
  return "";
}

export function operationPolicy(group, entry, user, capabilities) {
  if (group === "documentos" && capabilities?.version === 1 && capabilities.operations?.documents?.version === 1 && capabilities.operations.documents.read) {
    const write = WRITE_ROLES.includes(user?.rol) && capabilities.operations.documents.enabled === true;
    return { create: write, edit: write, type: "documento", path: "/eventos", rules: capabilities.operations.rules,
      detailPath: () => "/eventos/consulta", detailParams: id => ({ id, documentos: "1" }) };
  }
  if (!WRITE_ROLES.includes(user?.rol) || capabilities?.version !== 1) return null;
  if (group === "recursos" && capabilities.resources?.includes(entry.id)) {
    return { create: true, edit: true, type: entry.id, path: entry.path, detailPath: id => `${entry.path}/${encodeURIComponent(id)}` };
  }
  const area = group === "porteria" ? "porteria" : group === "talleres" ? entry.id : null;
  if (area && capabilities.eventAreas?.includes(area)) {
    const operational = capabilities.operations?.version === 2;
    const workshop = group === "talleres";
    return { create: workshop ? operational && capabilities.operations.workshops === true : entry.id === "llaves" || operational && capabilities.operations.porteria === true, edit: true,
      createBlockedReason: !workshop && entry.id !== "llaves" && capabilities.operations?.porteria !== true ? capabilities.operations?.porteriaBlockedReason || "El servidor todavía no habilitó las altas de Portería." : undefined,
      type: workshop ? (area === "tractores" ? "tallerTractor" : "tallerFurgon") : entry.id === "llaves" ? "llaves" : "porteria", rules: capabilities.operations?.rules, editType: "detalle", path: "/eventos", area, detailPath: () => "/eventos/consulta", detailParams: id => ({ id }) };
  }
  if (group === "asignaciones" && capabilities.assignments) {
    return { create: capabilities.operations?.version === 2 && capabilities.operations.assignments === true, edit: true, type: "asignacion", rules: capabilities.operations?.rules, editType: "detalle", path: "/asignaciones", detailPath: () => "/asignaciones/consulta", detailParams: id => ({ id }) };
  }
  return null;
}

export function canEditRecord(policy, record) {
  if (["REMITO", "FACTURA"].includes(record?.tipo)) return policy?.type === "documento" && policy.edit && record.documentoVersion === 1 && ["ALTA", "BAJA", "SIN MOVIMIENTO"].includes(record.movimientoStock) && Array.isArray(record.movimientos) && (record.movimientoStock !== "SIN MOVIMIENTO" || record.movimientos.length === 0) && !!record.id;
  return !!policy?.edit && !!record?.id && (!policy.area || record.area === policy.area);
}
