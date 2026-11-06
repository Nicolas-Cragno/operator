// This file is the allowlist, order, sections and visual format of every detail.
const field = (key, label, format = 'text', aliases = []) => ({ key, label, format, aliases });
const section = (key, title, fields) => ({ key, title, fields });
const tools = field('herramientas', 'Herramientas', 'tools');
const stats = field('estadisticasViajes', 'Estadísticas de viajes', 'statistics');
const detail = field('detalles', 'Detalles', 'text', ['detalle']);
const vehicleFields = [field('modelo', 'Modelo'), field('marca', 'Marca'), field('motor', 'Motor'), field('chasis', 'Chasis'), field('nombreEmpresa', 'Empresa'), field('nombreSatelital', 'Empresa satelital'), field('estadoSatelital', 'Estado satelital', 'satellite'), field('nombrePersona', 'Responsable', 'text', ['nombreResponsable']), detail, tools, stats];
const eventFields = [field('fecha', 'Fecha', 'datetime'), field('tipo', 'Operación'), field('area', 'Área'), field('nombrePersona', 'Persona', 'text', ['persona']), field('tractorFull', 'Tractores', 'tags', ['tractor']), field('furgonFull', 'Furgones', 'tags', ['furgon']), field('nombreOperador', 'Operador', 'text', ['operador']), field('nombreMecanico', 'Mecánicos', 'tags', ['mecanico']), field('nombreChofer', 'Chofer', 'text', ['chofer']), field('nombreProveedor', 'Proveedor', 'text', ['proveedor']), field('depositoFull', 'Depósito', 'text', ['deposito']), field('ingresosFull', 'Artículos', 'tags', ['ingresos']), field('repuestosFull', 'Repuestos', 'tags', ['repuestos']), tools, field('chequeos', 'Chequeos de salida', 'checks'), field('numeroDocumento', 'Número', 'text', ['remito', 'factura']), field('movimientoStock', 'Movimiento de stock'), field('monedaEtiqueta', 'Moneda', 'text', ['moneda']), field('total', 'Total', 'number'), detail];
export const recordDetails = {
  personas: { identity: ['id', 'nombreCompleto'], complement: ['nombreEmpresa'], status: 'estado', sections: [
    section('principal', 'Información principal', [field('cuit', 'CUIT'), field('edad', 'Edad', 'number'), field('nacimiento', 'Nacimiento', 'date'), field('ubicacion', 'Ubicación')]),
    section('laboral', 'Información laboral', [field('nombreEmpresa', 'Empresa'), field('legajo', 'Legajo'), field('ingreso', 'Ingreso', 'date'), field('puesto', 'Puesto'), field('especialidad', 'Especialidad', 'text', ['especializacion']), field('nombreSucursal', 'Sucursal'), field('periodos', 'Períodos', 'periods'), field('alerta', 'Alerta'), tools, stats]),
  ] },
  tractores: { identity: ['id', 'dominio'], complement: ['nombreEmpresa'], status: 'estado', sections: [section('principal', 'Información principal', vehicleFields)] },
  furgones: { identity: ['id', 'dominio'], complement: ['nombreEmpresa'], status: 'estado', sections: [section('principal', 'Información principal', vehicleFields)] },
  vehiculos: { identity: ['id', 'marca'], complement: ['nombreEmpresa', 'nombrePersona'], status: 'estado', optionalStatus: true, sections: [section('principal', 'Información principal', vehicleFields)] },
  empresas: { identity: ['nombre'], complement: ['tipo'], sections: [section('principal', 'Empresa', [field('cuit', 'CUIT', 'text', ['id']), field('nombre', 'Nombre'), field('tipo', 'Tipo'), field('abreviatura', 'Abreviatura')])] },
  stock: { identity: ['id', 'descripcion'], sections: [section('principal', 'Artículo', [field('codigo', 'Código', 'text', ['id']), field('descripcion', 'Descripción'), field('unidades', 'Unidad', 'text', ['unidad']), field('marca', 'Marca'), field('nombreProveedor', 'Proveedor'), field('codigoProveedor', 'Código del proveedor'), field('stock', 'Stock global', 'number'), field('cantidad', 'Cantidad global', 'number'), field('existencias', 'Stock por depósitos', 'balances')])] },
  depositos: { identity: ['nombre'], stock: true, sections: [section('principal', 'Depósito', [field('nombre', 'Nombre')])] },
  eventos: { identity: ['id', 'tipo'], complement: ['area'], sections: [section('principal', 'Evento', eventFields)] },
  asignaciones: { identity: ['id'], sections: [section('principal', 'Asignación', eventFields)] },
  viajes: { identity: ['id'], status: 'activo', sections: [section('principal', 'Viaje', [field('fechaInicio', 'Inicio', 'datetime'), field('fechaFin', 'Fin', 'datetime'), ...eventFields, stats])] },
  movimientos: { identity: ['id', 'tipo'], sections: [section('principal', 'Movimiento', eventFields)] },
  cargas: { identity: ['id'], sections: [section('principal', 'Carga', [field('fecha', 'Fecha', 'datetime'), field('litros', 'Litros', 'number'), field('cantidad', 'Cantidad', 'number'), detail])] },
};

// Source: latest cantapp-web ZIP, src/functions/data/chequeosPorteria.json.
export const porteriaChecks = [
  ['ckPanico', 'Pánico'], ['ckCorte', 'Corte'], ['ckReporte', 'Reporte'], ['ckDesenganche', 'Desenganche'],
  ['ckPuertaCabina', 'Puerta de cabina'], ['ckAntivandalico', 'Antivandálico'], ['ckPuertaFurgon', 'Puerta de furgón'],
];
export const relationLabels = { personas: 'personas', tractores: 'tractores', furgones: 'furgones', vehiculos: 'vehículos', empresas: 'empresas', stock: 'artículos', depositos: 'depósitos', eventos: 'eventos', viajes: 'viajes', asignaciones: 'asignaciones', movimientos: 'movimientos', cargas: 'cargas' };
export const relationColumns = {
  personas: ['id', 'nombreCompleto', 'nombreEmpresa'],
  tractores: ['id', 'dominio', 'marca', 'modelo'],
  furgones: ['id', 'dominio', 'marca', 'modelo'],
  vehiculos: ['id', 'dominio', 'marca', 'modelo'],
  empresas: ['id', 'nombre', 'tipo'],
  depositos: ['id', 'nombre'],
  cargas: ['id', 'fecha', 'litros', 'cantidad'],
  viajes: ['id', 'fechaInicio', 'fechaFin', 'persona', 'tractor', 'furgon'],
  eventos: ['id', 'fecha', 'tipo', 'area', 'persona', 'detalle'],
  asignaciones: ['id', 'fecha', 'persona', 'detalle'],
  movimientos: ['id', 'fecha', 'tipo', 'persona', 'tractor'],
  stock: ['id', 'descripcion', 'cantidad', 'unidad'],
};
