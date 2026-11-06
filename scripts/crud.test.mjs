import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { operationPolicy, canEditRecord } = await load(await fs.readFile(new URL('../src/config/operations.js', import.meta.url), 'utf8'));
const fieldSource = await fs.readFile(new URL('../../cantapp-components/src/data/administrationFields.js', import.meta.url), 'utf8');
const { administrationFields } = await load(fieldSource);
let source = await fs.readFile(new URL('../src/services/record.service.js', import.meta.url), 'utf8');
source = source.replace('import appConfig from "../config/app.config";', 'const appConfig = {appId:"app"};').replace('import { apiGet, apiMutate, extractRows } from "./api.service";', 'const apiGet=()=>{}, apiMutate=()=>{}, extractRows=()=>{};');
const { initialFormData, recordPayload } = await load(source);

test('write buttons require backend capabilities, authorized role and matching module', () => {
  const entry = { id: 'personas', path: '/personas' };
  const caps = { version: 1, resources: ['personas'], eventAreas: ['porteria'] };
  assert.equal(operationPolicy('recursos', entry, { rol: 'user' }, caps), null);
  assert.equal(operationPolicy('recursos', entry, { rol: 'admin' }), null);
  assert.equal(operationPolicy('recursos', entry, { rol: 'admin' }, { ...caps, version: 2 }), null);
  assert.ok(operationPolicy('recursos', entry, { rol: 'admin' }, caps).create);
  const policy = operationPolicy('porteria', { id: 'eventos' }, { rol: 'admin' }, caps);
  assert.equal(policy.create, false);
  assert.equal(policy.editType, 'detalle');
  assert.equal(canEditRecord(policy, { id: 'x', area: 'tractores' }), false);
  assert.equal(canEditRecord(policy, { id: 'x', area: 'porteria' }), true);
});

test('edit preloads real data and submits changed whitelisted fields only', () => {
  const fields = administrationFields('tractores', { editing: true });
  const raw = { id: '7', dominio: 'ABC123', modelo: 2020, persona: 123, estado: false, nombrePersona: 'Enriched', historialModificaciones: [{ uid: 'x' }] };
  const initial = initialFormData(fields, raw);
  assert.equal(initial.persona, '123');
  assert.equal(initial.estado, false);
  assert.deepEqual(recordPayload(fields, { ...initial, detalle: 'Revisado', id: 'changed', nombrePersona: 'Attack' }, initial, false, { type: 'tractores' }), { detalle: 'Revisado' });
  assert.deepEqual(recordPayload(fields, initial, initial, false, { type: 'tractores' }), {});
});

test('inventory changes required fields and preserves existing event shape', () => {
  const fields = administrationFields('llaves', { inventory: true });
  assert.equal(fields.find(field => field.key === 'persona').required, false);
  assert.equal(administrationFields('llaves').find(field => field.key === 'persona').required, true);
  const payload = recordPayload(fields, { tipo: 'INVENTARIO', operador: '123', tractor: ['7'] }, {}, true, { type: 'llaves' });
  assert.equal(payload.area, 'porteria');
  assert.equal(payload.formulario, 'inventario');
  assert.equal(payload.persona, null);
  assert.equal(payload.parteTr, false);
  assert.deepEqual(administrationFields('detalle').map(field => field.key), ['detalle']);
  assert.equal(administrationFields('stock', { editing: true }).find(field => field.key === 'unidad').disabled, true);
});

test('mutation uses authenticated JSON and marks network failure as uncertain without automatic retry', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; assert.equal(options.method, 'PUT'); assert.equal(options.headers.Authorization, 'Bearer test-token'); assert.equal(options.body, '{"detalle":"nuevo"}'); throw new Error('offline'); };
  try {
    const apiSource = (await fs.readFile(new URL('../src/services/api.service.js', import.meta.url), 'utf8')).replace('import { auth } from "../firebase/client";', 'const auth={currentUser:{getIdToken:async()=>"test-token"}};').replace('(process.env.EXPO_PUBLIC_API_URL || "")', '"https://local.invalid/api"');
    const { apiMutate } = await load(apiSource);
    await assert.rejects(apiMutate('/eventos/7', 'PUT', { detalle: 'nuevo' }, {}), { uncertain: true });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
