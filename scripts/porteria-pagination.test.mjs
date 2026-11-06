import test from 'node:test';
import assert from 'node:assert/strict';
import { chronologicalRecords } from '../../../cantapp-back/functions/services/record-details.service.js';
import { paginationDb } from './firestore-pagination.fixture.mjs';

const rows = Array.from({ length: 25702 }, (_, i) => ({ id: `P${String(i).padStart(6, '0')}`, orden: i + 1, area: 'porteria', tipo: i % 2 ? 'SALIDA' : 'ENTRADA', subtipo: 'tractor', fecha: i % 2 ? { _seconds: 1793847600, _nanoseconds: 0 } : { seconds: 1793847600, nanoseconds: 0 } }));
test('first/next/back/refresh read only bounded pages of 25702 historical events', async () => {
  const reads = [], db = paginationDb(rows, reads), query = { area: 'porteria', limit: 50 };
  const first = await chronologicalRecords(db, 'eventos', ['porteria'], query);
  assert.equal(first.data.length, 50);
  assert.equal(first.total, null);
  assert.equal(reads.reduce((n, read) => n + read.count, 0), 51);
  const second = await chronologicalRecords(db, 'eventos', ['porteria'], { ...query, pagina: 2, cursor: first.pagination.nextCursor });
  assert.equal(second.data.length, 50);
  assert.ok(second.data[0].orden < first.data.at(-1).orden);
  const back = await chronologicalRecords(db, 'eventos', ['porteria'], query);
  assert.deepEqual(back.data, first.data);
  assert.equal(new Set([...first.data, ...second.data].map(row => row.id)).size, 100);
  assert.ok(reads.every(read => read.limit <= 50 && read.orders[0][0] === 'orden'));
  await assert.rejects(chronologicalRecords(db, 'eventos', ['porteria'], { ...query, tipo: 'SALIDA', cursor: first.pagination.nextCursor }), { status: 400 });
  await assert.rejects(chronologicalRecords(db, 'eventos', ['talleres'], query), { status: 403 });
});
test('type/subtype pushed down; legacy date and reference filters retained', async () => {
  const reads = [], db = paginationDb([{ id: 'a', orden: 1, area: 'porteria', tipo: 'SALIDA', subtipo: 'tractor', fecha: { seconds: 1793847600 }, persona: 123, tractor: ['7'], furgon: { id: '8' } }], reads);
  const query = { area: 'porteria', tipo: 'SALIDA', subtipo: 'tractor', persona: '123', tractor: '7', furgon: '8', desde: '2026-11-05', hasta: '2026-11-05' };
  const result = await chronologicalRecords(db, 'eventos', ['porteria'], query);
  assert.deepEqual(result.data.map(row => row.id), ['a']);
  assert.ok(reads[0].filters.some(([field, op]) => field === 'tipo' && op === 'in'));
  assert.ok(reads[0].filters.some(([field]) => field === 'subtipo'));
  assert.equal(result.pagination.hasNext, false);
  const outside = await chronologicalRecords(db, 'eventos', ['porteria'], { ...query, hasta: '2026-11-04', desde: '2026-11-04' });
  assert.deepEqual(outside.data, []);
});
test('selective search/date filters stop at 500 and continue without omissions', async () => {
  const reads = [], db = paginationDb(rows, reads);
  const result = await chronologicalRecords(db, 'eventos', ['porteria'], { area: 'porteria', desde: '2030-01-01', limit: 50 });
  assert.deepEqual(result.data, []);
  assert.equal(result.pagination.hasNext, true);
  assert.equal(reads.reduce((sum, read) => sum + read.count, 0), 501);
  const tail = await chronologicalRecords(paginationDb(rows.slice(0, 50)), 'eventos', ['porteria'], { area: 'porteria', limit: 50 });
  assert.equal(tail.pagination.hasNext, false);
});
