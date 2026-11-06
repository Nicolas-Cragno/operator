# Auditoría Documentos y Llaves — 2026-11-02

## Hallazgos y estructuras verificadas

- Ambos accesos existían en navigation.config.js, pero no tenían integración en catalog.js.
- Documentos: no existe colección documentos ni endpoint /documentos. Por aclaración del usuario, será una colección nueva y, por decisión posterior, queda una pantalla informativa hasta definir su contrato. No se conectó a comprobantes ni se crearon colecciones.
- Llaves: colección eventos, área porteria. Lectura real: 3.766 RETIRA y 4.338 ENTREGA con formulario movLlaves; otros 3 movLlaves sin tipo; 64 RETIRA y 103 ENTREGA históricos sin formulario; 1 INVENTARIO con formulario inventario. Total seleccionado: 8.275. No se alteraron los registros incompletos.
- INVENTARIO contiene tractor como array de identificadores numéricos. Los identificadores de persona/operador también pueden ser numéricos. Los recursos actuales se resuelven conservando el identificador si falta su referencia.
- Backend revisado: functions/index.js, routes/eventos.route.js, controllers/eventos.controller.js, services/eventos.service.js, controllers/consultas.controller.js, middlewares/auth.middleware.js y role.middleware.js. También se revisaron rutas, controlador y servicio de comprobantes: son combustible y solo del propietario; no equivalen al futuro módulo Documentos.
- Navegación: Llaves hereda porteria; Documentos requiere documentos en access.modulos del bootstrap. Los endpoints consultados exigen Firebase Auth y rol dev, superadmin, admin o user. Las rutas de escritura de eventos tienen permisos diferentes y no se añadieron acciones de escritura.

## Implementación

- catalog.js: catálogo Llaves, campos de búsqueda, columnas, fechas y filtros ENTREGA/RETIRA/INVENTARIO; selección de históricos y del inventario real.
- services/catalog.service.js (nuevo): lectura paginada mediante /eventos/consulta?area=porteria, /personas/consulta y /tractores/consulta, resolución de persona/operador/tractores, cancelación lógica al desmontar y detección de cursor repetido.
- components/CatalogTable.jsx: usa el cargador, combina alternativas de un mismo campo con OR y campos distintos con AND; fechas de tabla/ficha y filtros usan la utilidad existente.
- utils/formatRecord.js: centraliza campos de fecha, formateo explícito, día calendario argentino y lectura de Timestamp serializado o ISO. El formateo recursivo también usa la misma función.
- screens/Module.jsx: pantalla informativa de Documentos usando EmptyState de cantapp-components, tanto en la raíz como en listado.
- Interfaz reutiliza DataTable, Modal, SearchInput, DateRangeFilter, Tabs, Button, EmptyState y el tema vigente de cantapp-components. No se cambiaron los temas ni se duplicaron componentes.
- scripts/modules.test.mjs (nuevo): pruebas de fechas, paginación antes de selección, referencias y selección histórica/inventario.
- tsconfig.json (nuevo): configura análisis de las fuentes JavaScript sin activar checkJs. No equivale a una conversión de la aplicación a TypeScript.
- package.json, package-lock.json, eslint.config.js: Expo lint añadió su configuración y herramientas de desarrollo; se excluyó dist-audit. Expo también añadió @types/react durante la validación.

## Validaciones y límites

- Consultas a Firestore bess-b914c exclusivamente de lectura: colecciones, muestras y distribución de eventos. No se modificaron datos.
- node --test scripts/modules.test.mjs: 2 pruebas aprobadas.
- TypeScript: node ../cantapp-components/node_modules/typescript/bin/tsc --noEmit, aprobado. npx --no-install tsc no estaba disponible en operator; se reutilizó el compilador existente, sin instalar el paquete homónimo tsc.
- Lint: node ../cantapp-components/node_modules/eslint/bin/eslint.js --config ../cantapp-components/eslint.config.js src, cero errores y ocho advertencias preexistentes. npx expo lint se intentó, instaló sus herramientas y falló por dependencia local incompleta es-abstract/2024/GetMethod; el lint se completó con la instalación compartida.
- Expo export web: compilación aprobada en dist-audit, incluyendo la pantalla informativa. No se publicó.
- No se dispone de sesión interactiva autenticada: falta validar visualmente en dispositivo/navegador, temas y autorización con distintos usuarios. No se afirma una prueba integral en producción.
- Para no ocultar históricos, Llaves lee todas las páginas de Portería y luego filtra. En la consulta auditada había 25.636 eventos de Portería. La primera carga puede ser lenta; una consulta filtrada del backend sería una optimización futura, no se añadieron endpoints ni índices.
- Las acciones implementadas son consultar, buscar, filtrar, actualizar y abrir ficha. No se añadieron altas, ediciones ni eliminaciones de eventos.
- Adjuntos de Documentos y su CRUD quedan pendientes junto con campos, tipos, almacenamiento y permisos, conforme a la decisión del usuario.

## Publicación

Solo requiere publicar una versión de operator cuando se decida. No hay cambios de Cloud Functions, reglas, índices ni migraciones. No se ejecutaron despliegues.
