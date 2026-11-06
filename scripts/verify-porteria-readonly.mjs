// Read-only integration verification. Requires Application Default Credentials.
import { db } from '../../../cantapp-back/functions/firebase/firebaseAdmin.js';
import { chronologicalRecords } from '../../../cantapp-back/functions/services/record-details.service.js';
import { dateMillis } from '../../../cantapp-back/functions/services/chronological-dates.js';
let eventsRead = 0, maximumBatch = 0;
function instrument(source) {
  return new Proxy(source, { get(target, key) {
    if (key === 'get') return async () => {
      const snapshot = await target.get();
      eventsRead += snapshot.docs.length;
      maximumBatch = Math.max(maximumBatch, snapshot.docs.length);
      return snapshot;
    };
    const value = target[key];
    if (typeof value !== 'function') return value;
    return (...args) => {
      const result = value.apply(target, args);
      return ['where', 'select', 'orderBy', 'limit', 'startAfter'].includes(key) ? instrument(result) : result;
    };
  } });
}
const measured = { collection: entity => entity === 'eventos' ? instrument(db.collection(entity)) : db.collection(entity) };
async function check(label, query) {
  eventsRead = 0; maximumBatch = 0;
  try {
    const result = await chronologicalRecords(measured, 'eventos', ['porteria'], { area: 'porteria', limit: 50, ...query });
    if (eventsRead > 501 || result.data.length > 50 || result.data.some((row, i) => i && row.orden > result.data[i - 1].orden)) throw new Error('Pagination invariant failed');
    console.log(JSON.stringify({ label, rows: result.data.length, eventsRead, maximumBatch, hasNext: result.pagination.hasNext }));
    return result;
  } catch (error) {
    console.log(JSON.stringify({ label, error: error.code || error.status || error.message, missingIndex: error.code === 9, eventsRead }));
    process.exitCode = 1;
  }
}
try {
  if (process.argv.includes('--filters-only')) {
    await check('type', { tipo: 'SALIDA' });
    await check('subtype', { subtipo: 'tractor' });
    await check('type-subtype', { tipo: 'SALIDA', subtipo: 'tractor' });
  } else {
  const first = await check('first', {});
  if (first?.pagination.nextCursor) {
    const second = await check('second', { pagina: 2, cursor: first.pagination.nextCursor });
    if (second && new Set([...first.data, ...second.data].map(row => row.id)).size !== first.data.length + second.data.length) throw new Error('Duplicate pages');
  }
  if (first?.data.length) {
    const row = first.data[0];
    const day = new Date(dateMillis(row.fecha) - 3 * 3600000).toISOString().slice(0, 10);
    await check('dates', { desde: day, hasta: day });
    await check('type', { tipo: row.tipo });
    await check('type-subtype', { tipo: row.tipo, subtipo: row.subtipo || 'tractor' });
  }
  }
} finally { await db.terminate(); }
