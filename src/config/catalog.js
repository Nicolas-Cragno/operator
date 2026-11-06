
const item = (id, label, path, options = {}) => ({
    id,
    label,
    path,
    variants: options.variants || [{ id: "todos", label: "Todos" }],
    searchFields: options.searchFields || ["id"],
    dateFilter: options.dateFilter || false,
    chronological: options.chronological || false,
    serverEntity: options.dateFilter ? path.split('/')[1] : undefined,
    serverParams: options.serverParams,
    columns: options.columns || [],
    listFields: options.listFields || options.columns || [],
    detailFields: options.detailFields,
    formFields: options.formFields,
    filters: options.filters || [],
    params: options.params,
    paginated: options.paginated || false,
    selectRows: options.selectRows,
    createActions: options.createActions || [{ label: "Agregar nuevo" }],
});

const estado = [
    { id: "activos", label: "Activos", field: "estado", value: true },
    { id: "inactivos", label: "Inactivos", field: "estado", value: false },
];

export const catalog = {
    recursos: [
        item("personas", "Personas", "/personas", {
            searchFields: ["id", "apellido", "nombre", "nombres", "dni"],
            columns: ["id", "legajo", "nombreCompleto", "nombreEmpresa", "puestoCompleto", "estado"],
            filters: estado,
        }),
        item("tractores", "Tractores", "/tractores", {
            searchFields: ["id", "interno", "dominio", "patente"],
            columns: ["id", "dominio", "nombreEmpresa", "marca", "modelo", "nombrePersona", "nombreSatelital", "detalle", "estado"],
            filters: estado,
        }),
        item("furgones", "Furgones", "/furgones", {
            searchFields: ["id", "interno", "dominio", "patente"],
            columns: ["id", "dominio", "nombreEmpresa", "marca", "modelo", "estado"],
            filters: estado,
        }),
        item("vehiculos", "Vehículos", "/vehiculos", {
            searchFields: ["id", "interno", "dominio", "patente"],
            columns: ["id", "interno", "dominio", "estado"],
            filters: estado,
        }),
        item("empresas", "Empresas", "/empresas", {
            searchFields: ["id", "nombre", "razonSocial", "cuit"],
            columns: ["id", "nombre", "razonSocial", "cuit"],
            variants: [
                { id: "todos", label: "Todas", path: "/empresas" },
                { id: "proveedores", label: "Proveedores", path: "/empresas/proveedores" },
                { id: "clientes", label: "Clientes", path: "/empresas/clientes" },
            ],
        }),
        item("stock", "Stock", "/stock", {
            searchFields: ["id", "descripcion", "unidad", "proveedor"],
            columns: ["id", "descripcion", "unidad", "cantidad"],
        }),
        item("depositos", "Depósitos", "/depositos", {
            searchFields: ["id", "nombre", "descripcion"],
            columns: ["id", "nombre", "descripcion"],
        }),
    ],
    porteria: [
        item("llaves", "Llaves", "/eventos/consulta", {
            serverParams: { area: "porteria", seccion: "llaves" },
            params: { area: "porteria" },
            paginated: true,
            selectRows: rows => rows.filter(row => row.formulario === "movLlaves" || row.formulario === "inventario" || (!row.formulario && ["ENTREGA", "RETIRA", "INVENTARIO"].includes(row.tipo))),
            searchFields: ["id", "tipo", "persona", "nombrePersona", "tractor", "tractorFull", "operador", "nombreOperador", "detalle"],
            columns: ["id", "fecha", "tipo", "nombrePersona", "tractorFull", "nombreOperador", "detalle"],
            dateFilter: true,
            chronological: true,
            filters: ["ENTREGA", "RETIRA", "INVENTARIO"].map(value => ({ id: value, label: value, field: "tipo", value })),
        }),
        item("eventos", "Eventos de portería", "/eventos/porteria", {
            createActions: [
                { label: "Tractores", initialValues: { formulario: "movPorteria" } },
                { label: "Particulares", initialValues: { formulario: "movPorteriaParticular" } },
                { label: "Proveedores", initialValues: { formulario: "movPorteriaProveedor" } },
            ],
            serverParams: { area: "porteria" },
            searchFields: ["id", "persona", "tractor", "furgon", "tipo", "subtipo"],
            columns: ["id", "fecha", "tipo", "subtipo", "persona", "tractor"],
            dateFilter: true,
            chronological: true,
        }),
    ],
    talleres: [
        item("tractores", "Eventos de tractores", "/eventos/tractores", {
            serverParams: { area: "tractores" },
            createActions: [{ label: "Nuevo trabajo" }],
            searchFields: ["id", "tractor", "tipo", "formulario", "mecanico", "chofer", "nombreMecanico", "nombreChofer", "repuestos"],
            columns: ["id", "fecha", "tipo", "tractor", "nombreMecanico", "repuestos"],
            dateFilter: true,
            chronological: true,
        }),
        item("furgones", "Eventos de furgones", "/eventos/furgones", {
            serverParams: { area: "furgones" },
            createActions: [{ label: "Nuevo trabajo" }],
            searchFields: ["id", "furgon", "tipo", "formulario", "mecanico", "chofer", "nombreMecanico", "nombreChofer", "repuestos"],
            columns: ["id", "fecha", "tipo", "furgon", "nombreMecanico", "repuestos"],
            dateFilter: true,
            chronological: true,
        }),
    ],
    asignaciones: [
        item("listado", "Asignaciones", "/asignaciones", {
            searchFields: ["id", "persona", "ingresos", "ingresosFull", "nombrePersona", "area", "detalle"],
            columns: ["id", "fecha", "persona", "ingresos", "area", "detalle"],
            dateFilter: true,
            chronological: true,
        }),
    ],
    documentos: [item("listado", "Documentos", "/eventos/consulta", {
        createActions: [
            { label: "Nuevo remito", initialValues: { tipo: "REMITO" } },
            { label: "Nueva factura", initialValues: { tipo: "FACTURA" } },
        ],
        params: { documentos: "1" },
        searchFields: ["id", "remito", "factura", "proveedor", "ingresos", "detalle"],
        columns: ["id", "fecha", "tipo", "numeroDocumento", "proveedor", "movimientoEtiqueta", "deposito", "total", "monedaEtiqueta"],
        dateFilter: true,
        filters: [
            ...["REMITO", "FACTURA"].map(value => ({ id: value, label: value, field: "tipo", value })),
            ...["ALTA", "BAJA", "SIN MOVIMIENTO", "Movimiento no declarado"].map(value => ({ id: `mov_${value}`, label: value, field: "movimientoEtiqueta", value })),
        ],
    })],
    posicion: [],
};

export const findCatalog = (group, id) =>
    catalog[group]?.find(entry => entry.id === id);
