import { recordDetails, porteriaChecks } from '../config/recordDetails';
import { parseRecordDate, recordDay, formatRecordDate } from './formatRecord';
const present = value => value !== null && value !== undefined && value !== '';
const scalar = value => ['string', 'number', 'boolean'].includes(typeof value);
const readable = key => key.replace(/([a-záéíóú])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
export function detailDate(value) {
  const date = parseRecordDate(value);
  if (!date) return '';
  const day = recordDay(date);
  return `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}
function tags(value) {
  return (Array.isArray(value) ? value : String(value || '').split(/\s*[|,]\s*/)).filter(present).map(item => ({ label: scalar(item) ? String(item) : `${item.descripcion || item.nombre || 'Artículo'}${present(item.cantidad) ? ` (${item.cantidad}${item.unidad ? ` ${item.unidad}` : ''})` : ''}` }));
}
export function checkTags(value, record = {}) {
  const values = Array.isArray(value) ? Object.fromEntries(value.map((item, index) => typeof item === 'boolean' ? [porteriaChecks[index]?.[0], item] : typeof item === 'string' ? [item, true] : [item?.key ?? item?.id, item?.value ?? item?.valor ?? item?.checked ?? false])) : value || {};
  return porteriaChecks.map(([key, label]) => ({ key, label, active: values[key] === true || record[key] === true }));
}
export function statistics(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  const timestamp = value instanceof Date || typeof value.toDate === 'function' || Object.hasOwn(value, 'seconds') || Object.hasOwn(value, '_seconds');
  if (timestamp) return parseRecordDate(value) ? [{ key: prefix || 'fecha', label: prefix || 'Fecha', value: formatRecordDate(value) }] : [];
  return Object.entries(value).flatMap(([key, val]) => {
    if (['seconds', 'nanoseconds', '_seconds', '_nanoseconds'].includes(key)) return [];
    const name = prefix ? `${prefix} · ${readable(key)}` : readable(key);
    if (val && typeof val === 'object' && !Array.isArray(val)) return statistics(val, name);
    if (typeof val !== 'number' || !Number.isFinite(val)) return [];
    const unit = /kilometros|kilometraje|(^|_)km($|_)/i.test(key) ? ' km' : /litros/i.test(key) ? ' L' : /horas/i.test(key) ? ' h' : /minutos/i.test(key) ? ' min' : '';
    return [{ key: `${prefix}.${key}`, label: name, value: `${val.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unit}` }];
  });
}
export function projectDetail(entity, record) {
  const config = recordDetails[entity];
  if (!config) return { title: String(record.id || ''), sections: [] };
  const sections = config.sections.map(section => ({
    ...section, fields: section.fields.flatMap(field => {
      let value = [field.key, ...field.aliases].map(key => record[key]).find(present);
      if (field.format === 'checks') {
        if (record.tipo !== 'SALIDA') return [];
        value = checkTags(value, record);
      } else if (!present(value)) return [];
      let format = field.format;
      if (format === 'date') value = detailDate(value);
      else if (format === 'datetime') value = parseRecordDate(value) ? formatRecordDate(value) : '';
      else if (format === 'tools') { value = tags(value); format = 'tags'; }
      else if (format === 'periods') {
        value = (Array.isArray(value) ? value : []).filter(item => item && typeof item === 'object').map(item => ({ label: `${detailDate(item.inicio)}${item.fin ? ` - ${detailDate(item.fin)}` : ''}${item.empresaAbreviatura ? ` (${item.empresaAbreviatura})` : ''}` })).filter(item => item.label.trim());
        format = 'tags';
      } else if (format === 'statistics') value = statistics(value);
      else if (format === 'checks') format = 'tags';
      else if (format === 'tags') value = tags(value);
      else if (format === 'balances') { value = (Array.isArray(value) ? value : []).filter(item => present(item.cantidad)).map(item => ({ label: `${item.deposito}: ${Number(item.cantidad).toLocaleString('es-AR')} ${item.unidad || ''}` })); format = 'tags'; }
      else if (format === 'satellite') { value = [{ label: value === true ? 'Satelital activo' : 'Satelital inactivo', active: value === true }]; format = 'tags'; }
      else if (typeof value === 'number') value = value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
      else if (Array.isArray(value)) { value = tags(value); format = 'tags'; }
      else if (!scalar(value)) return []; // Internal maps never become raw text/JSON.
      else if (typeof value === 'boolean') value = value ? 'Sí' : 'No';
      if (!present(value) || (Array.isArray(value) && !value.length)) return [];
      return [{ ...field, format, value }];
    })
  })).filter(section => section.fields.length);
  const statusKey = Object.hasOwn(record, 'activo') ? 'activo' : config.status;
  const active = statusKey && (!config.optionalStatus || Object.hasOwn(record, statusKey)) ? record[statusKey] === true : undefined;
  return {
    title: config.identity.map(key => record[key]).filter(present).join(' - '),
    subtitle: config.complement?.map(key => record[key]).find(present), active, sections,
    updatedAt: parseRecordDate(record.ultimaModificacion || record.fechaModificacion || record.updatedAt) ? formatRecordDate(record.ultimaModificacion || record.fechaModificacion || record.updatedAt) : undefined,
    stock: config.stock,
  };
}
