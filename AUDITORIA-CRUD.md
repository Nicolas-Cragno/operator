# Auditoría de operaciones de Operator

## Documentos — correcciones críticas locales, 2026-11-03

Esta sección actualiza exclusivamente los tres puntos de la última auditoría: permisos de lectura, desbordamiento de stock y concurrencia documental. No se modificaron BESS, cantapp-web, cantapp-components ni reglas de Firestore. No se instalaron dependencias, desplegó, migró ni accedió a Firestore de producción.

### Permisos de API y compatibilidad

- Se agrega `functions/services/document-read.service.js`, que comprueba usuario activo, aplicación activa, acceso activo y módulo Documentos con los registros existentes del servidor. La cabecera de aplicación solo selecciona qué acceso comprobar; nunca concede acceso. Si se omite, los clientes legacy deben tener un permiso documental activo en alguna aplicación registrada. No se confía en Origin, Referer ni en el nombre del cliente.
- La consulta genérica de eventos rechaza con 403 el ID documental sin permiso y omite documentos de los listados. Conserva el cursor sobre los registros leídos: una página filtrada puede ser corta o vacía con cursor siguiente. Las seis consultas por área aplican el mismo filtro. El historial de artículos también oculta referencias y movimientos documentales sin permiso. Se reconocen variantes históricas de mayúsculas/minúsculas y espacios para no eludir el filtro.
- Se conservan rutas, formatos de respuesta y eventos no documentales. Los clientes legacy autorizados no necesitan enviar cabeceras nuevas. Un usuario que antes leía comprobantes solo por su rol general necesitará un permiso Documentos existente y activo; no se crearon permisos ni se modificaron datos. La compatibilidad con los permisos efectivos de cada usuario de BESS debe verificarse posteriormente en un entorno aislado.

### Stock

- `stock.service.js` rechaza cantidades y saldos no numéricos, NaN, Infinity y magnitudes superiores a `Number.MAX_SAFE_INTEGER`. UN exige enteros seguros. Se validan movimientos individuales, consolidación, saldo anterior y resultado final global y por depósito antes de reproducir escrituras.
- La unidad real del catálogo se comprueba también cuando el cliente declara otra unidad. Las transferencias consultan ese catálogo y validan ambos depósitos sin alterar el stock global. Un destino fuera de rango cancela también la baja del origen y el evento.
- Se mantiene el rechazo de stock final negativo. Los consumos válidos de Talleres y cantidades decimales válidas de otras unidades conservan sus efectos. Las existencias históricas inconsistentes quedan rechazadas; no se reparan ni migran automáticamente.

### Concurrencia e idempotencia

- Se conservó el control productivo de identidad en `operator-write.service.js`: lecturas y escrituras de versiones por tipo/proveedor/número propio y referencia contraria, reserva comercial, consulta histórica, desafío ligado a payload/usuario/solicitud/vinculados y recibo en la transacción. No fue necesario reemplazarlo: las nuevas pruebas detectan conflictos con callbacks realmente solapados dentro de la simulación.
- REMITO y FACTURA duplicados normalizados concurrentes confirman exactamente una operación. Los vinculados, incluso con referencia de un solo lado y artículos distintos, producen un guardado y una advertencia; el pendiente no confirma evento, stock ni contador de negocio hasta la justificación válida. Un desafío falso o motivo corto no permite guardar. El replay conserva un solo efecto y auditoría. Los independientes del mismo proveedor no comparten estos controles ni presentan conflictos en el caso aislado probado.
- El preparador de identidad sigue compartido con la API legacy para unicidad. La confirmación justificada corresponde al contrato Operator; otros escritores legacy/Admin SDK y sus movimientos externos no quedan certificados por estas pruebas. No hay locks de negocio que necesiten liberarse. Continúan el escaneo histórico y la contención propia de los contadores por área.

### Verificaciones y límites

- 54 pruebas locales aprobadas: 32 nuevas (6 de concurrencia simulada, 5 de lecturas, 21 de stock) y 22 existentes de regresión CRUD/Talleres/Asignaciones. Se precargó `test/helpers/solo-local.js`, que bloquea Firestore real y conexiones externas. Los mocks solo escriben mapas en memoria; los tests HTTP existentes usan 127.0.0.1.
- Comando desde `cantapp-back/functions`: `node --import ./test/helpers/solo-local.js --test --test-reporter=dot test/documentos-read.test.js test/documentos-stock.test.js test/documentos-concurrency.test.js test/operator-operations.test.js test/operator-crud-api.test.js`.
- La simulación MVCC permite callbacks solapados y comprueba versiones al confirmar. Intencionalmente no protege phantoms de consultas: la protección de altas nuevas depende de los controles productivos de identidad. Simula los efectos de negocio de la creación y prueba el guard, desafíos, auditoría y recibos productivos; no sustituye el flujo completo de eventos ni el aislamiento real de Firestore.
- Se preparó `test/documentos-emulator.test.js` con cuatro casos separados: duplicados de ambos tipos, vinculados recíprocos y vínculo de un solo lado. No se ejecutó: no hay `FIRESTORE_EMULATOR_HOST` configurado en esta sesión. Exige opt-in `RUN_DOCUMENTS_EMULATOR=1`, host loopback y crea una aplicación con proyecto exclusivo `demo-docs-*`; no usa el proyecto predeterminado. Comparte casos con la simulación y realiza transacciones reales únicamente contra el emulador, con efectos de negocio simulados. No precargar `solo-local.js` en ese comando porque bloquea también el emulador.
- Con emulador local ya iniciado y ambas variables configuradas explícitamente, el comando preparado es `node --test test/documentos-emulator.test.js`. No se instaló ni inició el emulador. Antes de publicar faltan también pruebas completas por los endpoints reales, volumen, permisos efectivos, otros escritores y el runtime Node 22 declarado; las pruebas locales se ejecutaron con Node 20.19.4.
- Los problemas de lint/tipos/cargadores de tests detectados en la auditoría anterior no pertenecen a estas tres correcciones y no se modificaron. Los registros de `.document-stage/` quedan como evidencia de la integración anterior, no como hashes del estado posterior a estas correcciones. Los temporales de esta intervención están en `.work/document-critical/`, ignorado por Git.

### Propuesta de reglas — pendiente de autorización, NO aplicada

**El problema de permisos NO está completamente resuelto.** Las reglas locales permiten lectura directa de `eventos`, `contadores` y el comodín recursivo a cualquier perfil con rol válido. Así todavía puede eludirse la API, incluso para recibos/confirmaciones y referencias inversas. No se verificaron reglas desplegadas ni se escribió en Firebase.

Propuesta concreta para una etapa autorizada:

1. Definir un predicado de lectura documental que exija usuario activo y concesión Documentos activa en aplicaciones aprobadas. Firestore Rules no puede enumerar arbitrariamente todas las aplicaciones como la API: acordar la lista explícita de aplicaciones y rutas de concesión existentes, o una autorización agregada mantenida por el servidor. No otorgar acceso por una cabecera o por el rol general.
2. Aplicarlo a REMITO/FACTURA en `eventos`, a sus referencias inversas y a los recibos, reservas y desafíos `operatorDocumento*`/`operatorSolicitud_*` de `contadores`. Estos recibos deben ser legibles solo por su titular o por una administración expresamente autorizada. Mantener las escrituras desde SDK cliente denegadas.
3. Reemplazar el `allow read: if validRole()` del comodín recursivo por permisos explícitos para colecciones/subcolecciones aprobadas. Añadir un `deny` documental aislado NO alcanza: las reglas coincidentes se combinan con OR y el comodín actual seguiría autorizando la lectura.
4. Preparar pruebas de reglas en emulador para usuarios activos/inactivos, permisos ausentes/revocados y acceso directo por ID/listado/subcolecciones/contadores. Las reglas no filtran resultados: revisar consultas mixtas legacy de BESS y demás clientes antes de aplicar reglas restrictivas, conservando sus eventos no documentales y las lecturas documentales expresamente autorizadas.

No modificar ni desplegar `firestore.rules` hasta autorizar esa propuesta y verificar compatibilidad. Documentos no se declara listo para producción: quedan pendientes el cierre de reglas y la validación de concurrencia con Firebase Emulator y los endpoints reales.

## Documentos — integración local recuperada, 2026-11-03

Se retomó la implementación parcial existente en Operator y los fragmentos de `.document-stage/`, sin reiniciar el módulo. Se inspeccionaron Git, el script y el manifiesto, se compararon los doce destinos con sus bases y se integraron ocho archivos de backend y cuatro de la librería compartida. El manifiesto conserva las bases originales, sus hashes y el contenido aplicado; `integration.json` registra las doce integraciones. Una corrección posterior del orden de validación del ID está registrada como aplicada en `corrections.json`. No quedan fragmentos preparados pendientes de copiar; la validación ejecutable sigue pendiente.

No se ejecutaron pruebas, lint, TypeScript, compilaciones, instalaciones, despliegues, migraciones ni escrituras en Firestore. No se modificaron BESS ni cantapp-web. Esto describe código integrado y revisado estáticamente, no funcionamiento comprobado en producción.

### Contrato y formulario

- REMITO y FACTURA se conservan en `eventos`. Los nuevos documentos llevan `documentoVersion: 1`, `movimientoStock`, `movimientos`, datos comerciales y auditoría Operator. No se agregó una colección raíz Documentos ni un servicio paralelo.
- Los tipos documentales se reconocen antes de los contratos de Talleres por área. La capacidad adicional es `access.crud.operations.documents`, con `version: 1`, `read` y `enabled`; se conserva la versión 2 de operaciones y la versión 1 del CRUD general. El rol user consulta si tiene módulo Documentos; las escrituras mantienen dev/superadmin/admin y requieren acceso activo a la aplicación y al módulo.
- Se reutilizan FormStandard, ArticleLines, selectores y Modal. Precios y totales son opciones exclusivas del formulario documental; sus valores predeterminados no alteran Talleres o Asignaciones.
- El movimiento se selecciona explícitamente por documento. ALTA/BAJA requieren depósito y uno o más artículos; SIN MOVIMIENTO permite depósito opcional y cero artículos. Si se informa una referencia se valida su existencia; los artículos usan las unidades reales del catálogo. Se conserva la política existente que rechaza stock negativo global o por depósito y las filas duplicadas del depósito en operaciones con efectos.
- Las cantidades de entrada son positivas; UN exige enteros positivos seguros y otras unidades permiten decimales finitos positivos. En BAJA el servidor guarda `ingresos[].cantidad` negativa para conservar el formato histórico, mientras Operator muestra su magnitud y la dirección por separado. El ledger, generado por el backend, es la autoridad sobre el impacto de los nuevos documentos.
- Proveedor sigue refiriendo a `proveedores`. Área y sucursal no se confunden con depósito. Remito/factura son referencias comerciales textuales, no IDs de eventos. No se persisten nombres enriquecidos.
- Fecha de emisión se recibe como YYYY-MM-DD o null y se guarda como Timestamp a las 12:00 UTC para conservar el día en la presentación de Buenos Aires. La fecha de registro y la numeración siguen siendo del servidor.

### Importes

- Una moneda por documento: ARS/USD, persistida como `pesos`/`dolares`; se admiten los alias ars/usd al validar. Todas las líneas toman la moneda de cabecera. No se mezclan monedas, no se convierte moneda y no se calcula IVA.
- La política `DECIMAL_HALF_UP_LINEA_2_V1` redondea precio unitario y descuento a dos decimales, cada subtotal de línea a centavos y el total con descuento a centavos. Se opera con fracciones decimales y BigInt, no con sumas monetarias de coma flotante. Precios y subtotal se limitan a 999.999.999.999,99 para preservar centavos en los campos numéricos compatibles.
- El backend recalcula los importes. Guarda subtotal/total numéricos compatibles y sus representaciones exactas en `importesDecimales`; el formulario muestra una vista previa con el mismo código de cálculo conservado en `.document-stage/money.js` e integrado en ambos entornos.

### Guardado, duplicados y documentos vinculados

- El documento, numeración, stock global, depósito, relaciones, auditoría, reservas de identidad y recibo se confirman en una misma transacción. No hay dos solicitudes separadas de stock/evento. SIN MOVIMIENTO guarda `movimientos: []` y no prepara escrituras de existencias.
- La identidad comercial es tipo + ID de proveedor recortado + número comercial normalizado mediante NFKC, mayúsculas y eliminación de espacios, puntos, barras y guiones. No se rellenan ceros ni se fusionan proveedores distintos.
- La protección de duplicados usa la colección existente `contadores` y una consulta transaccional de REMITO/FACTURA, que también permite reconocer números históricos sin normalizarlos ni migrarlos. El mismo preparador de identidad se reutiliza en las altas y ediciones documentales de la API legacy; omitir las cabeceras Operator no permite eludir la unicidad. Los roles y formatos legacy se conservan; los duplicados ahora se rechazan con conflicto.
- Para evitar que dos altas vinculadas simultáneas omitan la advertencia, cada operación lee y escribe controles de versión por proveedor/tipo/número propio y por la referencia comercial contraria. Se incluyen identidades anteriores al editar. Incluso un vínculo informado de un solo lado comparte al menos un control con su contraparte.
- Los controles no son marcas de ocupado, leases ni bloqueos de negocio basados en existencia. No requieren liberación ni vencimiento; solo fuerzan el reintento transaccional frente a cambios concurrentes. Comprobantes sin identidades o referencias comerciales coincidentes no comparten estos controles. Persisten la contención inherente del contador por área y el coste de consultar históricos; no se afirma haber medido concurrencia real.
- Una reserva de identidad antigua, dejada por una eliminación o renumeración legacy, no bloquea para siempre: solo puede reutilizarse después de que la consulta transaccional compruebe que ningún documento posee esa identidad.
- Si existe vínculo comercial explícito, mismo proveedor y efectos potencialmente duplicados, el backend responde una advertencia sin confirmar documento, numeración ni existencias. Solo registra un desafío en `contadores`, ligado a UID, solicitud, payload y revisiones de los documentos relacionados, con vigencia de 30 minutos. Los históricos sin movimiento declarado se tratan como potencialmente relevantes, no como efectos comprobados.
- La confirmación exige el desafío emitido por el servidor y una justificación de 10–1000 caracteres; una bandera no alcanza. Cambios en payload o vinculados invalidan la confirmación anterior. La justificación y los vinculados confirmados quedan en el documento y su auditoría.
- Se reutiliza la recuperación de solicitudes inciertas por usuario/aplicación/servidor en AsyncStorage. Payload y clave se conservan antes del envío. No se reenvía automáticamente ni se cambia la clave de una operación incierta. Un guardado confirmado solo se consulta.
- Cuando el servidor confirma que no hubo guardado y pide justificación, se puede descartar explícitamente esa solicitud. Un rechazo definitivo al primer intento justificado vuelve a esa confirmación sin perder el documento. Un resultado incierto conserva el bloqueo seguro hasta verificarse; no se ofrece descartarlo como si se conociera su resultado.

### Consulta, ficha y edición

- Documentos abre directamente su listado y mantiene la ruta hija existente. Usa CatalogTable con paginación exclusivamente del servidor; se eliminaron los `setPage(1)` repetidos y se deshabilitó el ordenamiento local de una página documental.
- `/eventos/consulta?documentos=1` valida la aplicación y el módulo. Aplica tipos, movimiento, búsqueda, normalización temporal y orden antes de paginar. Busca también nombres de proveedores y descripciones de artículos. Devuelve total global y `completeFilters: true`; Operator no toma una página como universo completo ni vuelve a paginarla.
- Los filtros temporales corresponden a fecha de registro. La consulta contempla Timestamp, mapas seconds/_seconds, fechas numéricas y strings; no modifica formatos históricos. Una fecha ilegible se muestra sin fecha y no puede satisfacer un intervalo temporal conocido.
- La ficha usa Modal y presenta datos comerciales, cantidades, precios, importes, auditoría y relaciones. Las etiquetas se resuelven al leer, con fallback a IDs; líneas históricas sin referencia no interrumpen toda la consulta. Monedas históricas desconocidas no se etiquetan silenciosamente como ARS.
- Históricos sin movimiento explícito muestran `Movimiento no declarado`; no se clasifican como SIN MOVIMIENTO ni se reconstruyen descuentos desde sus signos.
- Los nuevos documentos con efectos solo permiten detalle, emisión y sucursal. SIN MOVIMIENTO permite editar proveedor, referencias comerciales, depósito de referencia, emisión, sucursal, artículos, precios, moneda, descuento y detalle, revalidando contrato, unicidad e importes. Tipo, área y movimiento se conservan. No se convierten documentos sin movimiento en documentos con efectos.
- Los históricos y los nuevos con metadatos de movimiento inconsistentes quedan en consulta. La API rechaza modificar nuevos documentos fuera del contrato Operator y no permite su eliminación/anulación. No existen botones de reversión, anulación ni cambio de movimiento.
- El historial de stock agrega `movimientoDocumento` desde el ledger de nuevos ALTA/BAJA y referencias documentales separadas. No suma `ingresos` además del ledger ni atribuye efectos confirmados a históricos. Se reutilizan relaciones inversas para proveedor/artículos y se incorporan depósito/sucursal para documentos nuevos.

### Archivos y temporales

Operator: `src/screens/Module.jsx`, `src/config/catalog.js`, `src/config/operations.js`, `src/components/CatalogTable.jsx`, `src/components/RecordEditor.jsx`, `src/services/record.service.js`, `src/services/catalog.service.js`, `src/services/api.service.js` y este informe.

cantapp-components: `src/data/administrationFields.js`, `src/index.js`, `src/components/Form/articleLines.jsx`, `src/components/Form/formStandard.jsx`.

cantapp-back: `functions/services/operator-operations.contract.js`, `functions/services/operator-write.service.js`, `functions/services/eventos.service.js`, `functions/services/services.js`, `functions/services/stock.service.js`, `functions/services/relaciones.service.js`, `functions/controllers/eventos.controller.js`, `functions/controllers/consultas.controller.js`.

Se conserva `.document-stage/` íntegro. Sus cinco fragmentos JS ya están integrados; `prepare.py`, `refine.py`, manifiestos y registro quedan para revisión. El script de preparación impide regenerar transformaciones sobre una integración registrada. No se eliminó ningún temporal ni trabajo ajeno.

### Pendientes y validación futura

- No se implementan adjuntos persistentes, anulación, reversión, eliminación de nuevos documentos ni cambio de movimientos aplicados. Tampoco recuperación de solicitudes entre dispositivos o tras borrar el almacenamiento local.
- La consulta global y el control de duplicados leen los documentos REMITO/FACTURA existentes para respetar normalización y fechas históricas sin migración. Debe evaluarse su coste, duración y contención con volúmenes reales antes de publicar; no se truncan resultados silenciosamente para simular filtros completos.
- Lectores legacy mantienen campos, signos y valores históricos de moneda, pero algunos formateadores originales tienen problemas previos con USD y totales cero. No se cambiaron esas aplicaciones. Escrituras directas mediante Admin SDK o reglas desplegadas distintas que permitan saltar la API no participan en las reservas; revisar los escritores y reglas efectivos antes de publicar.
- Quedan pendientes pruebas de duplicados entre áreas, dos altas vinculadas simultáneas (vínculo de uno o ambos lados), documentos independientes del mismo proveedor, reintentos de transacciones, desafío vencido/modificado, rechazo y descarte de advertencia, pérdida de respuesta después del commit, stock insuficiente, filas duplicadas, unidades y redondeos.
- Verificar en emulador fechas/metadatos finales de relaciones, recibos únicos, edición SIN MOVIMIENTO y permisos de usuario/Talleres/Documentos. Revisar Android/iOS/web: formulario dinámico, importes, recuperaciones, cambio de usuario, fechas, búsqueda y paginación con más de 50 resultados y documentos históricos.
- Ejecutar posteriormente, con autorización, lint, TypeScript, pruebas y compilaciones. Nada de ello se ejecutó aquí. El código quedó integrado entre los tres repositorios mediante inspección estática; Documentos no se declara validado ni listo para producción.

## Estado actualizado — 2026-11-03

Esta sección reemplaza los pendientes funcionales del informe histórico de abajo. Se trabajó sobre los cambios locales existentes. En esta intervención solo se inspeccionaron fuentes/diferencias y se modificó código/documentación: no se ejecutaron tests, lint, TypeScript, compilaciones, instalaciones, despliegues, migraciones ni escrituras en Firestore.

### Altas operativas

- Talleres conserva SERVICE, CAMBIO, REPARACION y REVISION. Se incorporaron modalidades interna, externa y en ruta con los valores existentes `repTractor`, `repTractorExterna`, `repTractorEnRuta` y sus equivalentes `repFurgon*`. Se reutilizan FormStandard, ArticleLines, Select, MultiSelect, Checkbox y Modal.
- Interna permite responsables; externa, proveedores; en ruta, localidad del catálogo existente. Se incorpora chofer y se conservan sucursal, detalle y kilometraje de tractor. Los chequeos internos de tractor mantienen el mapa de booleanos utilizado por BESS. No se inventó una lista de chequeos de furgón ni de otras modalidades.
- El formulario permite varios tractores o varios furgones según el módulo. El contrato Operator también conserva la aceptación del identificador escalar de la versión anterior; no se convierten documentos históricos. Máximo 20 vehículos/responsables/proveedores por campo y 50 líneas de artículos por operación, comprobados por el servidor.
- Repuestos, kilometraje y chequeos corresponden al evento completo: no hay estructura existente para distribuirlos por vehículo. Cada repuesto se descuenta una sola vez por línea, independientemente del número de vehículos. No se crea una distribución ficticia.
- El backend mantiene su política de rechazo de existencias negativas globales y por depósito. No se aplica el viejo comentario del flujo opcional de BESS que omitía verificar negativos. Tampoco se normalizan unidades ni balances históricos inconsistentes.
- La regla de cantidades y las claves/etiquetas de chequeos se definen en `operator-operations.contract.js` y se publican mediante `access.crud.operations.rules`. El frontend aplica las reglas recibidas; el backend vuelve a validar usando la unidad real del catálogo dentro de la transacción. UN exige entero positivo seguro; las demás unidades permiten cantidades positivas finitas decimales, sin conversión.
- Las altas de Talleres y Asignaciones requieren `operations.version=2`. Las capacidades CRUD generales permanecen en versión 1. Esto evita habilitar los nuevos formularios contra un backend con el contrato anterior.
- Asignaciones conserva `persona + ingresos[{id,cantidad}]`, área y detalle. Reutiliza el servicio productivo sin modificar existencias. Se corrigieron columnas y búsquedas para reflejar ese contrato.

### Atomicidad, relaciones y presentación

- Se conserva la transacción existente de evento, numeración, stock global/depósito, relaciones, auditoría y recibo en `contadores`. Las escrituras derivadas se preparan después de incorporar la auditoría al principal y todas las lecturas concluyen antes de reproducir escrituras.
- `controlledTransaction` admite preparar relaciones después de validar/auditar el principal. `transaccionConRelaciones` reutiliza ese punto; las altas y ediciones genéricas de Operator también pasan por el mismo flujo. Las llamadas genéricas legacy mantienen su ruta anterior; los resúmenes de recursos conservan su cálculo existente.
- Las altas operativas usan un mismo Timestamp del servidor para fecha, creación, última modificación y auditoría. Las relaciones obtienen la fecha y última modificación del documento final.
- Se corrige el enriquecimiento de mecánicos, choferes y proveedores escalares o múltiples. Operator reutiliza un enriquecimiento de presentación para personas, vehículos, artículos, sucursales y depósitos, sin persistir las etiquetas. La ficha conserva la revisión del documento original.
- Después de una respuesta confirmada se consulta la ficha y se recarga el listado. Actualizar vuelve a consultar la ficha seleccionada; una lectura fallida no se presenta como otro guardado.

### Recuperación de solicitudes

- Se reutiliza AsyncStorage ya instalado, con un registro pendiente por usuario, aplicación y servidor. Conserva tipo/área/ruta, referencia y revisión original, clave, payload, valores ingresados y estado pendiente/confirmado/rechazado.
- El pendiente se persiste antes de enviar. Si falla el almacenamiento no se inicia la escritura. Una operación incierta conserva datos y clave al cerrar/reiniciar; la interfaz bloquea otras escrituras hasta revisarla en el módulo correspondiente.
- No hay reenvío automático. El usuario verifica manualmente la misma solicitud; el servidor puede devolver su recibo o completar la operación si no hubo commit. No se genera una clave nueva para resolver un resultado incierto. Una confirmación conservada solo realiza consultas.
- La lectura/escritura del pendiente y el envío comprueban el UID autenticado. Un usuario distinto no recibe ni reenvía el pendiente anterior. Una sesión cambiada interrumpe el flujo. Los errores de red, 5xx, 408, 429 y respuestas sin ID se conservan como inciertos.
- Una respuesta definitiva de rechazo al primer intento permite corregir conservando valores. Un rechazo posterior a un resultado incierto mantiene el bloqueo: no demuestra por sí solo que el primer intento no haya confirmado.
- AsyncStorage es almacenamiento local sin cifrado, ya utilizado en el proyecto; no contiene tokens ni credenciales. Borrar datos del dispositivo/navegador, desinstalar o perder ese almacenamiento elimina la posibilidad de recuperar la clave desde ese equipo. No existe recuperación entre dispositivos ni coordinación transaccional entre pestañas; no usar dos editores simultáneos para una misma operación pendiente. Las solicitudes irreconciliables requieren verificación manual, sin limpieza automática por antigüedad.

### Historial y compatibilidad

- `obtenerRelacionesArticulo` consulta `movimientos`, conserva el fallback de STOCK histórico por ingresos/egresos y evita sumar ambos formatos del mismo evento. Clasifica ingresos, egresos, transferencias, ajustes explícitos y consumo de Talleres. Transferencias incluyen origen/destino e impacto global cero.
- Nunca se infiere un descuento desde `repuestos` histórico; estos siguen disponibles como trabajos relacionados. No se reconstruyen cantidades ni se escriben movimientos retrospectivos. Un ajuste histórico sin marca diferenciadora no puede distinguirse con certeza de un ingreso/egreso normal: conserva la clasificación por signo.
- Las altas generales ENTRADA/SALIDA siguen bloqueadas en la política de interfaz y en el contrato Operator. Llaves conserva ENTREGA, RETIRA e INVENTARIO. No se modifican viajes legacy/V2 ni se impone el bloqueo a BESS.
- BESS no se modificó. Sus formularios conservan su contrato legacy; el consumo automático nuevo pertenece al contrato Operator. El selector de localidades compartido reutiliza los datos existentes de BESS y el servidor valida contra su catálogo ya existente. Los chequeos se recibieron del servidor, sin duplicar sus reglas en el cliente.

### Archivos de esta intervención

Operator: `src/components/RecordEditor.jsx`, `src/components/CatalogTable.jsx`, `src/services/record.service.js`, `src/services/api.service.js`, `src/services/catalog.service.js`, `src/config/catalog.js`, `src/config/operations.js` y este informe.

cantapp-components: `src/data/administrationFields.js`, `src/data/localidades.json` (datos compartidos derivados del catálogo existente), `src/components/Form/articleLines.jsx`, `src/components/Form/formStandard.jsx`.

cantapp-back: `functions/services/operator-operations.contract.js`, `operator-write.service.js`, `transaccion-relaciones.service.js`, `services.js`, `stock.service.js`, `eventos.service.js`.

### Validación pendiente antes de publicar

Revisar sintaxis/lint/TypeScript y compilaciones; adaptar y ejecutar las pruebas de contratos existentes a versión 2, unidades y modalidades; verificar en emulador la atomicidad y contención real, reintentos tras pérdida de respuesta, metadatos de relaciones y resúmenes. Comprobar en Android/iOS/web la conservación de valores, reinicio, cambio de usuario, recuperación, etiquetas y actualización de ficha/listado; revisar compatibilidad de los lectores de arrays de vehículos y categorías de historial de BESS. No se considera probado ni publicado este código.

Quedan bloqueadas las altas generales de Portería. No se incorporan edición de consumos, devoluciones, distribución por vehículo ni recuperación de pendientes entre dispositivos. Antes de publicar, confirmar que no quedan solicitudes anteriores incompatibles pendientes; conservar sus claves y verificarlas sin iniciar operaciones nuevas equivalentes. Publicación futura: backend primero y después Operator con la librería compartida actualizada.

## Informe histórico de 2026-11-02

Las ejecuciones y resultados que siguen corresponden únicamente a la intervención anterior, no a los cambios de 2026-11-03.

Fecha: 2026-11-02. Auditoría previa a implementación, sobre código real de operator, cantapp-components y cantapp-back/functions (fuente configurada en firebase.json).

| Módulo/listado | Contrato existente | Permisos POST/PUT | Decisión de implementación |
| --- | --- | --- | --- |
| Recursos / personas | GET, POST /personas; GET, PUT /personas/:id | dev, superadmin, admin | Alta y edición de datos personales/laborales; identidad fija |
| Recursos / tractores | GET, POST /tractores; GET, PUT /tractores/:id | mismos | Alta/edición; conservar transacción de resumen y relaciones |
| Recursos / furgones | GET, POST /furgones; GET, PUT /furgones/:id | mismos | Alta/edición; conservar resumen y relaciones |
| Recursos / vehículos | GET, POST /vehiculos; GET, PUT /vehiculos/:id | mismos | Alta/edición; conservar resumen y relaciones |
| Recursos / empresas | GET, POST /empresas; GET, PUT /empresas/:id | mismos | Corregir catálogo actualmente nombrado nombreEmpresas; alta/edición |
| Recursos / stock | GET, POST /stock; GET, PUT /stock/:id | mismos | Alta de artículo sin existencias; edición de descripción/proveedor/detalle, sin alterar cantidades/unidad/tipo del histórico |
| Recursos / depósitos | GET, POST /depositos; GET, PUT /depositos/:id | mismos | Alta de depósito vacío; edición de nombre/descripción, sin alterar stock |
| Portería / Llaves | POST /eventos; PUT /eventos/:id | mismos | Alta ENTREGA/RETIRA/INVENTARIO; edición solo de detalle para conservar trazabilidad histórica |
| Portería / eventos | POST /eventos; PUT /eventos/:id | mismos | Editar detalle; no editar tipo/persona/recursos/fechas de movimientos de viajes |
| Talleres / tractores y furgones | POST /eventos; PUT /eventos/:id | mismos | Editar detalle; nueva reparación requiere delimitar consumo de repuestos y efectos derivados |
| Asignaciones | GET/POST /asignaciones; PUT /asignaciones/:id | mismos | Editar detalle. Alta y cambio de ingresos/herramientas pendientes de definir si afectan existencias/custodia |
| Documentos | No existe contrato; pantalla informativa acordada | sin definir | Mantener decisión anterior |
| Posición | Pantalla pendiente de integración, sin catálogo | sin definir | Consulta operativa, sin CRUD habilitado |

Los roles user solo consultan. Además de los roles de rutas se comprobará acceso activo a la aplicación y módulos en el servidor para las operaciones de Operator. No se incorpora eliminación.

## Causas y precauciones

- CatalogTable solo consulta y abre Modal; api.service solo ofrece GET.
- Existen FormStandard y formularios especializados reutilizables, pero los valores de ejemplo de los especializados no son contratos productivos (estado string frente a boolean, campos demostrativos).
- Los servicios recursos-transaccion y transaccion-relaciones ya mantienen resúmenes y relaciones; no deben sustituirse con escrituras directas.
- Los servicios genéricos aceptan campos arbitrarios y algunos controladores transforman conflictos en HTTP 500. Falta control de concurrencia, idempotencia y auditoría del flujo nuevo.
- El POST de eventos ENTRADA/SALIDA usa viajes legacy/V2 y ejecuta recálculos posteriores al commit. Un formulario universal no puede representar con seguridad todas esas operaciones.
- El PUT de eventos no reconstruye viajes ni consumos de stock. Se limita el editor a detalle, comprobado nuevamente en backend.
- El esquema real de asignaciones es persona + ingresos[{id,cantidad}] + detalle/area; el formulario demostrativo articulo/cantidad no debe usarse para crear ese histórico.

## Contrato de integración

Se ampliarán los endpoints existentes, sin rutas alternativas ni colecciones nuevas. El bootstrap anunciará capacidades de edición. Operator mantendrá deshabilitadas las escrituras hasta recibir esa versión del backend.

El modo de escritura de Operator tendrá validación y autorización del servidor, revisión de documento para detectar cambios concurrentes, recibos de idempotencia en la colección existente contadores y auditoría dentro de la misma transacción del registro. Los consumidores legacy conservarán su contrato.

## Implementación realizada

- Botón Nuevo para los siete catálogos de recursos y para Llaves. Editar desde la ficha para recursos y para el detalle de eventos/asignaciones.
- Formularios productivos definidos en cantapp-components, usando FormStandard, sus campos, confirmación y control de cambios sin guardar. Se agregó onValuesChange como extensión opcional compatible para adaptar el campo persona en INVENTARIO.
- Precarga desde el registro original del servidor, sin persistir nombres enriquecidos, auditoría ni otros datos del listado. Los campos de identidad se conservan al editar.
- Búsqueda de relaciones con catálogos existentes. Las relaciones opcionales pueden quedar sin asignar.
- Validación del servidor de campos permitidos, obligatorios, tipos, referencias, DNI/CUIT, identidad de vehículo y dominio repetido dentro del catálogo.
- Stock nuevo comienza con cantidad cero; depósito nuevo comienza vacío. Las existencias no se pueden modificar desde este editor. En artículos existentes tampoco se cambia tipo/unidad para proteger el histórico.
- Registro de ENTREGA/RETIRA con formulario movLlaves e INVENTARIO con formulario inventario, usando el POST existente y su contador/transacción de eventos. No se genera fecha ni orden en el cliente.
- El editor de eventos y asignaciones solo envía detalle. El backend rechaza otros campos en el contrato de Operator.
- La revisión de concurrencia es un hash del registro leído. Las lecturas legacy conservan su respuesta: solo las lecturas solicitadas con el contrato de Operator incluyen _operatorRevision, que no se persiste ni se muestra en la ficha.
- La transacción existente conserva resúmenes y relaciones. El control adicional valida antes de confirmar escrituras, añade historialModificaciones con UID/cambios/fecha del servidor y crea el recibo de reintento en contadores/operatorSolicitud_<hash>. No se creó ninguna colección.
- El servidor verifica Firebase Auth, rol, usuario activo, aplicación activa, acceso y módulo. El bootstrap publica access.crud.version=1; los botones permanecen deshabilitados si el backend desplegado todavía no anuncia esa capacidad.
- Tras una respuesta confirmada se consulta la ficha y se recarga el listado. Un fallo de lectura posterior informa que el registro fue guardado; no se vuelve a escribir por ese fallo. Un reintento de escritura incierta conserva su clave dentro del formulario.
- Se corrigió el catálogo de Empresas: su navegación usa empresas y su endpoint real es /empresas, no /nombreEmpresas.
- Se corrigió la etiqueta de stock para que un código de proveedor sin una referencia vigente no interrumpa el listado.

## Archivos modificados

Operator:

- src/config/catalog.js
- src/config/operations.js (nuevo)
- src/components/CatalogTable.jsx
- src/components/RecordEditor.jsx (nuevo)
- src/services/api.service.js
- src/services/record.service.js (nuevo)
- scripts/crud.test.mjs y scripts/record-editor.test.cjs (nuevos)
- .gitignore y este informe

cantapp-components:

- src/data/administrationFields.js (nuevo)
- src/components/Form/formStandard.jsx
- src/index.js

cantapp-back/functions:

- middlewares/operator.middleware.js (nuevo)
- services/operator-write.service.js (nuevo)
- services/apps.service.js
- services/services.js
- services/transaccion-relaciones.service.js
- services/stock.service.js
- routes/personas.route.js, tractores.route.js, furgones.route.js, vehiculos.route.js, empresas.route.js, stock.route.js, depositos.route.js, eventos.route.js y asignaciones.route.js
- controllers/personas.controller.js, tractores.controller.js, furgones.controller.js, vehiculos.controlles.js (nombre real existente), empresas.controller.js, stock.controller.js, depositos.controller.js, eventos.controller.js, asignaciones.controller.js y consultas.controller.js
- test/operator-crud.test.js y test/operator-crud-api.test.js (nuevos)

Los controladores conservan los errores HTTP de validación/conflicto en vez de convertirlos en 500. La consulta existente /consulta admite obtener un registro por id; no se crearon endpoints alternativos.

## Validación realizada antes de la indicación de omitir más tests

- Operator: 7 pruebas aprobadas de contratos, fechas, listados e interacción real del editor (precarga, confirmación, conservación del dato tras error, reintento con la misma clave y lectura fallida posterior a un guardado confirmado).
- cantapp-components: sus 29 pruebas existentes aprobadas, incluyendo formularios/modales y ambos temas.
- Backend: 283 pruebas relevantes aprobadas, incluyendo sus rutas HTTP reales en localhost, autorización, concurrencia, idempotencia, auditoría, resúmenes, relaciones y compatibilidad de respuestas legacy. Todas con bloqueo explícito de Firestore y red externa.
- La ejecución amplia inicial del backend tuvo 964 pruebas: 927 aprobadas y 37 fallidas. Se corrigieron las dos regresiones de metadatos en respuestas legacy y se verificaron dentro de las 283 pruebas relevantes.
- Se reconstruyeron únicamente en memoria las versiones originales de services.js, transaccion-relaciones.service.js y apps.service.js, verificando exactamente sus hashes anteriores. Esa comparación reprodujo los otros 35 fallos (929/964 aprobadas). Los fallos están relacionados con política V2, contratos de viajes y fechas/FiBOT que no se cambiaron en esta tarea. No se restauró ni modificó la política V2.
- Lint de Operator: cero errores y ocho advertencias previas, usando la instalación funcional de ESLint de cantapp-components. expo lint local sigue fallando por la dependencia incompleta es-abstract/2024/GetMethod.
- TypeScript de Operator aprobado (allowJs, checkJs=false). Compilación web de Operator aprobada, sin publicación.
- Lint de cantapp-components aprobado. Su typecheck completo detectó un error de sintaxis previo en portal/src/components/AppShell.jsx:37 (falta una llave en accessibilityLabel), fuera de los archivos modificados.
- Tras la indicación del usuario de pasar por alto los tests no se ejecutaron nuevas pruebas. Las dos pequeñas mejoras finales de presentación (ocultar la revisión interna y permitir desasignar relaciones opcionales) se revisaron en código.

## Publicación y pendientes

- No hubo escrituras de producción ni despliegues.
- Requiere publicar primero el backend actualizado y después una versión de Operator que incluya la librería compartida actualizada. Hasta entonces el bootstrap anterior no habilita los botones. No se ejecutó esa publicación.
- No se requieren migraciones de datos ni colecciones nuevas. Las escrituras de registros, auditoría y recibos solo ocurrirán cuando un usuario autorizado guarde efectivamente desde la aplicación.
- Las altas generales de Portería requieren completar el contrato del formulario y la idempotencia de todos los efectos posteriores de viajes legacy/V2. No se habilitaron mediante el POST genérico de este editor.
- Altas de reparaciones y de asignaciones, y cambios de sus recursos/ingresos, requieren definir consumo, devolución y custodia de existencias. Tampoco se habilitaron ajustes/transferencias masivos.
- Documentos conserva la pantalla informativa acordada; Posición sigue sin contrato CRUD.
- No se probó visualmente en un dispositivo autenticado ni se guardaron registros reales. La ejecución amplia del backend no está completamente verde y el portal compartido conserva el error previo indicado.
