  if (type === 'documento') {
    if (editing && administrativeOnly) return [
      { key: 'fechaEmision', label: 'Fecha de emisión', type: 'date' }, relation('sucursal', 'Sucursal', 'ubicaciones'), detail,
    ];
    const moves = movement === 'ALTA' || movement === 'BAJA';
    return [
      { key: 'tipo', label: 'Tipo de documento', type: 'select', required: true, disabled: editing, defaultValue: 'REMITO', options: types(['REMITO', 'FACTURA']) },
      { key: 'movimientoStock', label: 'Movimiento de stock', type: 'select', required: true, disabled: editing, options: types(['ALTA', 'BAJA', 'SIN MOVIMIENTO']) },
      { ...relation('area', 'Área', 'sectores', true), valueField: 'nombre', lowercaseValue: true, disabled: editing },
      relation('proveedor', 'Proveedor', 'proveedores', true),
      { key: 'fechaEmision', label: 'Fecha de emisión', type: 'date' },
      text('remito', documentType === 'REMITO' ? 'Número de Remito' : 'Remito relacionado (número comercial)', documentType === 'REMITO'),
      text('factura', documentType === 'FACTURA' ? 'Número de Factura' : 'Factura relacionada (número comercial)', documentType === 'FACTURA'),
      relation('sucursal', 'Sucursal', 'ubicaciones'), relation('deposito', moves ? 'Depósito de movimiento' : 'Depósito de referencia (opcional)', 'depositos', moves),
      { key: 'moneda', label: 'Moneda del documento', type: 'select', required: true, defaultValue: 'pesos', options: [{ value: 'pesos', label: 'ARS' }, { value: 'dolares', label: 'USD' }] },
      { key: 'ingresos', label: 'Artículos del documento', type: 'articleLines', relation: 'stock', includeUnit: true, includeMoney: true, required: moves, quantityRules: rules, defaultValue: [] },
      { key: 'descuento', label: 'Descuento (%)', type: 'number', defaultValue: 0, validate: value => Number(value) < 0 || Number(value) > 100 ? 'Indicá un porcentaje entre 0 y 100' : '' },
      { key: '_totales', label: 'Importes', type: 'documentTotals', transient: true }, detail,
    ];
  }
