async function consultarDocumentos(req, res, limit, cursor) {
  if (req.get('X-Cantapp-Operator') !== '1') return res.status(400).json({ error: 'Contrato Operator requerido' });
  const appId = req.get('X-Cantapp-App-Id');
  if (!appId || appId.includes('/') || appId.length > 120) bad('Aplicación inválida');
  const access = await obtenerBootstrap(appId, req.user.uid);
  if (access.status !== 200) return res.status(access.status).json({ error: access.message });
  if (!access.data.access.modulos.includes('documentos')) return res.status(403).json({ error: 'Sin acceso a Documentos' });
  const format = doc => {
    const data = doc.data();
    return { ...data, id: doc.id, _operatorRevision: recordRevision(data), relaciones: extraerRelaciones('eventos', data) };
  };
  if (req.query.id !== undefined) {
    const id = req.query.id;
    if (typeof id !== 'string' || !id || id.includes('/') || id.length > 250) bad('ID inválido');
    const doc = await db.collection('eventos').doc(id).get();
    if (!doc.exists || !isDocument(doc.data())) return res.status(404).json({ error: 'Documento no encontrado' });
    return res.json(format(doc));
  }
  const page = Number(req.query.pagina || 1);
  if (!Number.isSafeInteger(page) || page < 1) bad('Página inválida');
  const parseOptions = (key, allowed) => {
    if (!req.query[key]) return [];
    if (typeof req.query[key] !== 'string') bad('Filtro inválido');
    const values = req.query[key].split(',');
    if (values.some(value => !allowed.includes(value))) bad('Filtro documental inválido');
    return values;
  };
  const types = parseOptions('tipos', ['REMITO', 'FACTURA']);
  const movements = parseOptions('movimientos', ['ALTA', 'BAJA', 'SIN MOVIMIENTO', 'Movimiento no declarado']);
  const fields = parseOptions('campos', ['id', 'remito', 'factura', 'proveedor', 'ingresos', 'detalle']);
  const query = req.query.q || '';
  if (typeof query !== 'string' || query.length > 200) bad('Búsqueda inválida');
  const term = query.trim().toLowerCase();
  for (const key of ['desde', 'hasta']) if (req.query[key]) documentDay(req.query[key]);
  const snap = await db.collection('eventos').where('tipo', 'in', types.length ? types : ['REMITO', 'FACTURA']).get();
  // Normalize all historical date representations before filtering/pagination.
  const milliseconds = value => {
    if (value?.toDate) return value.toDate().getTime();
    if (typeof value === 'object' && value) return Number(value.seconds ?? value._seconds) * 1000;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) { const [d,m,y] = value.split('/'); return new Date(`${y}-${m}-${d}T12:00:00Z`).getTime(); }
    return typeof value === 'string' ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).getTime() : NaN;
  };
  const day = value => {
    const ms = milliseconds(value);
    if (!Number.isFinite(ms)) return null;
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Argentina/Buenos_Aires', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(ms));
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const labels = {};
  if (term) for (const [field, collection] of [['proveedor', 'proveedores'], ['ingresos', 'stock']]) if (fields.includes(field)) {
    const list = await db.collection(collection).get();
    labels[field] = new Map(list.docs.map(doc => [doc.id, JSON.stringify(doc.data()).toLowerCase()]));
  }
  const rows = snap.docs.filter(doc => {
    const data = doc.data();
    if (movements.length && !movements.includes(data.movimientoStock || 'Movimiento no declarado')) return false;
    if (req.query.desde || req.query.hasta) {
      const date = day(data.fecha);
      if (!date || (req.query.desde && date < req.query.desde) || (req.query.hasta && date > req.query.hasta)) return false;
    }
    if (!term) return true;
    return fields.some(field => {
      const value = field === 'id' ? doc.id : data[field];
      let text = JSON.stringify(value ?? '').toLowerCase();
      if (field === 'proveedor') text += labels.proveedor?.get(String(value)) || '';
      if (field === 'ingresos' && Array.isArray(value)) text += value.map(line => labels.ingresos?.get(String(line?.id)) || '').join(' ');
      return text.includes(term);
    });
  }).sort((a,b) => (milliseconds(b.data().fecha) || 0) - (milliseconds(a.data().fecha) || 0) || a.id.localeCompare(b.id));
  const start = (page - 1) * limit;
  return res.json({ data: rows.slice(start, start + limit).map(format), total: rows.length, pagina: page, limit, completeFilters: true });
}
