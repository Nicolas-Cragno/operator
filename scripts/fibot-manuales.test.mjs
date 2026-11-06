import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarCargasFibot, normalizarCargaFibot, listarCombustibleFibot, cargasFibotViaje, guardarAsociacionesFibot, corregirCargaFibot } from '../../../cantapp-back/functions/services/fibot-cargas.service.js';

const sample = { id: 1, fecha_hora_iso: '2026-11-04T12:00:00-03:00', dni_chofer: '12345678', chofer: 'Chofer', interno: '7', litros: 100, kilometraje: 1000, completa: true, foto_url: 'https://example.invalid/receipt.jpg', dudas: ['Revisar comprobante'] };
function memory(initial = {}) {
  const data = new Map(Object.entries(initial)), writes = [];
  const snapshot = ref => ({ id: ref.id, exists: data.has(ref.path), data: () => structuredClone(data.get(ref.path)) });
  const collection = (name, filters = []) => ({
    doc: id => ({ path: `${name}/${id}`, id, get: async function () { return snapshot(this); } }),
    where: (field, op, value) => collection(name, [...filters, { field, op, value }]),
    get: async () => ({ docs: [...data].filter(([key, row]) => key.startsWith(`${name}/`) && !key.slice(name.length + 1).includes('/') && filters.every(({ field, op, value }) => op === '==' ? row[field] === value : op === '>=' ? new Date(row[field]) >= value : op === '<=' ? new Date(row[field]) <= value : new Date(row[field]) < value)).map(([key]) => snapshot({ path: key, id: key.split('/').at(-1) })) }),
  });
  let queue = Promise.resolve();
  const db = { collection, getAll: async (...refs) => refs.map(snapshot), runTransaction(callback) {
    const run = queue.then(async () => {
      const changes = [];
      const result = await callback({ get: async ref => snapshot(ref), set: (ref, value) => changes.push({ ref, value }), update: (ref, patch) => changes.push({ ref, value: { ...data.get(ref.path), ...patch } }) });
      for (const change of changes) { writes.push(change.ref.path); data.set(change.ref.path, change.value); }
      return result;
    });
    queue = run.catch(() => {});
    return run;
  } };
  return { db, data, writes };
}
const trip = { fechaInicio: '2026-11-04T03:00:00Z', fechaFin: '2026-11-05T02:59:59Z', tractor: ['7'], persona: '12345678', estado: false, combustible: { cargas: { litros: 300 } } };
const options = (db, rows = [sample]) => ({ dbImpl: db, apiKey: 'test-only-key', fetchImpl: async () => ({ ok: true, json: async () => ({ data: rows }) }) });

test('FiBOT uses secure backend header, optional params, stable IDs, and enforces a maximum of 31 days', async () => {
  const calls = [];
  const result = await consultarCargasFibot({ desde: '2026-11-01', hasta: '2026-11-30', interno: '7', dni: '12345678', desde_id: '1' }, { apiKey: 'test-key', fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => [sample] }; } });
  assert.equal(calls[0].url.pathname, '/api/v1/cargas-combustible');
  assert.equal(calls[0].init.headers['X-API-Key'], 'test-key');
  assert.equal(calls[0].url.searchParams.get('dni'), '12345678');
  assert.equal(result[0].id, 'FIBOT:1');
  await assert.rejects(consultarCargasFibot({ desde: '2026-10-01', hasta: '2026-11-04' }, {}), { status: 400 });
});

test('TODAS merges sources, keeps incomplete records and receipts, deduplicates dynamic liters, and pages stably', async () => {
  const { db, writes } = memory({ 'cargas/Excel1': { fecha: '2026-11-04T15:00:00Z', origen: 'YPF', interno: '7', persona: '12345678', litros: 100 }, 'cargas/Base1': { fecha: '2026-11-04T14:00:00Z', origen: 'BASE', litros: 50 } });
  const config = options(db, [sample, { ...sample, id: 2, fecha_hora_iso: '2026-11-04T16:00:00Z', completa: false, litros: null }]);
  const first = await listarCombustibleFibot({ origen: 'TODAS', limit: 2 }, config);
  assert.equal(first.summary.registros, 4);
  assert.equal(first.summary.litros, 150);
  assert.ok(first.data.some(row => row.estado === 'INCOMPLETA'));
  const second = await listarCombustibleFibot({ origen: 'TODAS', limit: 2, cursor: first.pagination.nextCursor }, config);
  assert.equal(new Set([...first.data, ...second.data].map(row => row.id)).size, 4);
  const manual = await listarCombustibleFibot({ origen: 'MANUALES' }, config);
  assert.equal(manual.data.length, 2);
  assert.equal(manual.data.find(row => row.id === 'FIBOT:1').duplicadaDe, 'Excel1');
  assert.equal(manual.data.find(row => row.id === 'FIBOT:1').foto_url, sample.foto_url);
  assert.deepEqual(writes, []);
});

test('association stores only refs and corrections, preserves historical totals and explicitly unlinks', async () => {
  const { db, data, writes } = memory({ 'viajes/V1': trip });
  const config = options(db);
  await guardarAsociacionesFibot('V1', { cargaIds: ['FIBOT:1'], asociacionesEsperadas: { 'FIBOT:1': null } }, config);
  assert.deepEqual(data.get('viajes/V1').combustible, trip.combustible);
  assert.deepEqual(data.get('viajes/V1').cargasFibotIds, ['FIBOT:1']);
  assert.equal(data.get('contadores/fibotCarga_1').viajeId, 'V1');
  assert.ok(writes.every(path => !path.startsWith('cargas/')));
  assert.equal(data.get('contadores/fibotCarga_1').litros, undefined);
  const candidates = await cargasFibotViaje('V1', config);
  assert.equal(candidates.litrosManuales, 100);
  await guardarAsociacionesFibot('V1', { cargaIds: [], asociacionesEsperadas: { 'FIBOT:1': 'V1' } }, config);
  assert.equal(data.get('contadores/fibotCarga_1').viajeId, null);
  assert.deepEqual(data.get('viajes/V1').combustible, trip.combustible);
});

test('concurrent trips cannot own the same FiBOT ID; stale corrections are rejected', async () => {
  const { db, data } = memory({ 'viajes/V1': trip, 'viajes/V2': trip });
  const config = options(db);
  const results = await Promise.allSettled(['V1', 'V2'].map(id => guardarAsociacionesFibot(id, { cargaIds: ['FIBOT:1'], asociacionesEsperadas: { 'FIBOT:1': null } }, config)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const owner = data.get('contadores/fibotCarga_1').viajeId;
  await corregirCargaFibot(owner, 'FIBOT:1', { revision: 1, correcciones: { litros: 125 } }, config);
  await assert.rejects(corregirCargaFibot(owner, 'FIBOT:1', { revision: 1, correcciones: { litros: 140 } }, config), { status: 409 });
  const updated = await cargasFibotViaje(owner, config);
  assert.equal(updated.litrosManuales, 125);
  assert.equal(sample.litros, 100);
  assert.equal(updated.data[0].foto_url, sample.foto_url);
});

test('Excel duplicates cannot be associated; matching DNI, interno and period suggests without auto-association', async () => {
  const { db } = memory({ 'viajes/V1': trip });
  const candidates = await cargasFibotViaje('V1', options(db));
  assert.equal(candidates.data[0].sugerida, true);
  assert.equal(candidates.data[0].viajeId, null);
  const duplicate = memory({ 'viajes/V1': trip, 'cargas/E1': { fecha: '2026-11-04T15:00:00Z', origen: 'YPF', interno: '7', persona: '12345678', litros: 100 } });
  await assert.rejects(guardarAsociacionesFibot('V1', { cargaIds: ['FIBOT:1'], asociacionesEsperadas: { 'FIBOT:1': null } }, options(duplicate.db)), { status: 409 });
  assert.equal(normalizarCargaFibot({ ...sample, foto_url: 'javascript:alert(1)' }).foto_url, null);
});
