
const navigationConfig = [
  {
    id: "recursos",
    label: "Recursos",
    icon: "database",
    route: "/modulo/recursos",
    showIn: ["home", "sidebar", "lowbar"],
    children: [
      { id: "personas", label: "Personas", route: "/modulo/recursos/personas" },
      { id: "tractores", label: "Tractores", route: "/modulo/recursos/tractores" },
      { id: "furgones", label: "Furgones", route: "/modulo/recursos/furgones" },
      { id: "vehiculos", label: "Vehículos", route: "/modulo/recursos/vehiculos" },
      { id: "empresas", label: "Empresas", route: "/modulo/recursos/empresas" },
      { id: "stock", label: "Stock", route: "/modulo/recursos/stock" },
      { id: "depositos", label: "Depósitos", route: "/modulo/recursos/depositos" },
    ],
  },
  {
    id: "porteria",
    label: "Portería",
    icon: "shield-check",
    route: "/modulo/porteria",
    showIn: ["home", "sidebar", "lowbar"],
    children: [
      { id: "eventos", label: "Eventos de portería", route: "/modulo/porteria/eventos" },
      { id: "llaves", label: "Llaves", route: "/modulo/porteria/llaves" },
    ],
  },
  {
    id: "talleres",
    label: "Talleres",
    icon: "wrench",
    route: "/modulo/talleres",
    showIn: ["home", "sidebar", "lowbar"],
    children: [
      { id: "tractores", label: "Taller tractores", route: "/modulo/talleres/tractores" },
      { id: "furgones", label: "Taller furgones", route: "/modulo/talleres/furgones" },
    ],
  },
  {
    id: "asignaciones",
    label: "Asignaciones",
    icon: "clipboard-list",
    route: "/modulo/asignaciones",
    showIn: ["home", "sidebar", "lowbar"],
    children: [
      { id: "listado", label: "Consultar asignaciones", route: "/modulo/asignaciones/listado" },
    ],
  },
  {
    id: "documentos",
    label: "Documentos",
    icon: "files",
    route: "/modulo/documentos",
    showIn: ["home", "sidebar", "lowbar"],
    children: [
      { id: "listado", label: "Consultar documentos", route: "/modulo/documentos/listado" },
    ],
  },
  {
    id: "posicion",
    label: "Posición",
    icon: "map-pin",
    route: "/modulo/posicion",
    showIn: ["home", "sidebar", "lowbar"],
    children: [
      { id: "consulta", label: "Consultar posición", route: "/modulo/posicion/consulta" },
    ],
  },
];

export default navigationConfig;
