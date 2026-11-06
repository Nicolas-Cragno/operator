# CANTAPP BASE — Entrega de integración de lectura

Se integra el catálogo RECURSOS/SUCESOS con los GET existentes del backend adjunto. El proyecto sigue en `mode: template` y no se convierte en Operator.

## Requisitos
- Mantener `.env` local con `EXPO_PUBLIC_API_URL=https://us-central1-bess-b914c.cloudfunctions.net/api` y Firebase Web.
- Tener `../cantapp-components` instalado mediante `file:../cantapp-components`.
- `npm install`, `npx expo start --web --clear`.
- No publicar credenciales privadas ni serviceAccountKey.

## Alcance
- Navegación a recursos y sucesos, lectura autenticada con Firebase ID Token, selección de endpoints existentes, búsqueda local, tabla adaptable y detalle JSON por registro.
- Filtros de fecha en sucesos **solo locales** sobre los resultados devueltos, no equivalen a consultas históricas exhaustivas.
- No se incorporan escrituras ni se alteran depósitos, ubicaciones o viajes productivos.
- Los endpoints nuevos de la especificación todavía requieren backend: personas activas/inactivas, tractores/furgones bitrenes/simples, stock por cantidad, GET asignaciones, cargas YPF/BASE y consultas históricas por fecha/recurso.
- La aplicación muestra errores de HTTP, 401/403 y 404 en la propia pantalla.

## Nota sobre la API
Los endpoints actuales mezclan arrays y objetos con `data`/`items`; `extractRows` maneja formatos comunes. Verificar en entorno real cualquier formato especial.

## Seguridad
El modo plantilla muestra módulos para desarrollar y no representa permisos de aplicaciones productivas. El backend continúa aplicando su middleware de autenticación y roles. No habilitar este modo como aplicación productiva.

## Fichas en modal
- Al pulsar una fila, la ficha aparece en un `Modal` nativo superpuesto a toda la interfaz, incluyendo Sidebar y LowBar.
- El fondo se oscurece, el contenido tiene scroll independiente y puede cerrarse con ✕, pulsando fuera o con Escape/retroceso mediante `onRequestClose`.
- La tabla permanece montada y conserva búsqueda, filtros y paginación al cerrar.
- Componente reutilizable: `src/components/RecordDetailModal.jsx`.
