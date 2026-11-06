# Integración conservada de Documentos

Estado: código preparado integrado en los 12 destinos. Validación ejecutable y publicación pendientes.

- `document-contract.js`: integrado en `cantapp-back/functions/services/operator-operations.contract.js`.
- `money.js`: integrado como el mismo cálculo decimal en el contrato backend y `cantapp-components/src/data/administrationFields.js`.
- `document-guard.js`: integrado en `cantapp-back/functions/services/operator-write.service.js`; incluye identidad compartida, controles por proveedor/número/referencia y confirmación justificada.
- `document-query.js`: integrado en `cantapp-back/functions/controllers/consultas.controller.js`.
- `document-fields.js`: integrado en `cantapp-components/src/data/administrationFields.js`.
- `prepare.py`: transformaciones revisadas para ocho fuentes backend y cuatro compartidas. Conserva las bases y restringe la aplicación a doce rutas exactas. No regenera el manifiesto cuando existe un registro de integración.
- `changes.json`: bases originales y hashes; contenido final aplicado. No equivale a una migración de datos.
- `integration.json`: huella del manifiesto y hashes aplicados por archivo. Permite identificar una aplicación parcial o cambios posteriores sin sobrescribirlos.
- `refine.py` y `corrections.json`: corrección posterior, ya aplicada, que mueve la validación del ID antes de las salidas anticipadas documentales. El manifiesto y el registro incorporan esta corrección.

No quedan fragmentos pendientes de aplicación. Estos temporales se conservan por indicación del usuario. No ejecutar preparación, integración, validaciones ni despliegues automáticamente; inspeccionar primero el estado real y los hashes. Las restricciones y verificaciones pendientes están en `../AUDITORIA-CRUD.md`.
