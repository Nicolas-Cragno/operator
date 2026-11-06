# Integración con cantapp-components (29/10/2026)

Se reemplazó el renderizado propio de tablas, fichas y filtros de fecha de `CatalogTable` por los componentes públicos `Tabla`, `Modal`, `DateRangeFilter`, `Input` y `Button` de `cantapp-components`.

La ficha usa `Modal` de la librería y muestra `DetailField`/`DataValue` para datos anidados y timestamps. El modal se superpone al contenido. La búsqueda y el rango se aplican localmente a la respuesta disponible. La paginación actual también es local: no se afirma que consulte todas las páginas de Firestore.

Instalación: colocar `cantapp-base` y la versión actualizada de `cantapp-components` como carpetas hermanas, ejecutar `npm install` en la base y `npx expo start --web --clear`.

No se modificó el backend ni Firestore. `RecordDetailModal.jsx` permanece en el proyecto por compatibilidad pero no se usa en `CatalogTable`.

Pendiente: comprobar la interacción visual en Web y Mobile, y migrar filtros/paginación al backend.
