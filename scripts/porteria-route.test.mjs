import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { paginationDb } from './firestore-pagination.fixture.mjs';
import express from '../../../cantapp-back/functions/node_modules/express/index.js';
const encode = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
test('exact Operator Portería endpoint lists real scoped DB rows with filters and refresh', async () => {
  const reads = [];
  const rows = [{ id: 'P1', area: 'porteria', tipo: 'SALIDA', subtipo: 'tractor', fecha: '2026-11-04', detalle: 'Portería' }, { id: 'P2', area: 'porteria', tipo: 'ENTRADA', subtipo: 'tractor', fecha: '2026-11-03' }, { id: 'T1', area: 'tractores', tipo: 'SALIDA', fecha: '2026-11-04' }];
  globalThis.porteriaDb = paginationDb(rows, reads);
  const serviceUrl = new URL('../../../cantapp-back/functions/services/record-details.service.js', import.meta.url).href;
  let controller = await fs.readFile(new URL('../../../cantapp-back/functions/controllers/record-details.controller.js', import.meta.url), 'utf8');
  controller = controller.replace("import { db } from '../firebase/firebaseAdmin.js';", 'const db = globalThis.porteriaDb;').replace("import { obtenerBootstrap } from '../services/apps.service.js';", "const obtenerBootstrap=async()=>({status:200,data:{access:{modulos:['porteria']}}});").replace("'../services/record-details.service.js'", JSON.stringify(serviceUrl));
  const controllerUrl = encode(controller);
  let route = await fs.readFile(new URL('../../../cantapp-back/functions/routes/apps.route.js', import.meta.url), 'utf8');
  route = route.replace("'../controllers/record-details.controller.js'", JSON.stringify(controllerUrl))
    .replace("import { requireRole } from '../middlewares/role.middleware.js';", 'const requireRole=()=> (_req,_res,next)=>next();')
    .replace('import { Router } from "express";', 'const Router = globalThis.porteriaRouter;')
    .replace('import { firebaseAuth } from "../middlewares/auth.middleware.js";', "const firebaseAuth=(req,_res,next)=>{req.user={uid:'local-test',rol:'dev'};next();};")
    .replace('import { bootstrapApp } from "../controllers/apps.controller.js";', 'const bootstrapApp=(_req,res)=>res.json({});');
  globalThis.porteriaRouter = express.Router;
  const { default: router } = await import(encode(route));
  const index = await fs.readFile(new URL('../../../cantapp-back/functions/index.js', import.meta.url), 'utf8');
  assert.match(index, /app.use\("\/api\/v1\/apps", appsRoutes\)/);
  const app = express();
  app.use('/api/v1/apps', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/v1/apps/zpal4Q223X5ZtqyhCJLt/records/eventos?area=porteria&tipo=SALIDA&subtipo=tractor&desde=2026-11-04&hasta=2026-11-04&pagina=1&limit=50`;
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.total, null);
      assert.equal(body.pagination.hasNext, false);
      assert.deepEqual(body.data.map(row => row.id), ['P1']);
    }
    assert.equal(reads.length, 2);
  } finally { await new Promise(resolve => server.close(resolve)); delete globalThis.porteriaDb; delete globalThis.porteriaRouter; }
});
