# CANTAPP Base V2 — limpieza conservadora (30/10/2026)

Se reconstruyó este paquete a partir del ZIP original proporcionado, **sin reemplazar el código funcional** de `app/` ni `src/`.

## Eliminado del paquete
- `node_modules/`, `.git/`, `.expo/` y `.claude/` (entornos locales y cachés).
- `.env` (credenciales/configuración local; restaurar tu archivo original de forma privada).
- `scripts/app/` y `scripts/src/` (copias completas accidentales, no utilizadas por Expo Router).
- `src/package.json`, `src/app.json`, `src/babel.config.js`, `src/metro.config.js` y otros archivos de configuración anidados duplicados.
- `App.js` e `index.js` de plantilla antigua (la entrada oficial es `expo-router/entry`).
- ZIP histórico incluido dentro del proyecto.

## Conservado
- Rutas de `app/`, pantallas y servicios de `src/`, recursos gráficos, scripts de verificación, documentación, configuración Expo y `package-lock.json`.
- Autenticación, Firebase, API y navegación sin cambios funcionales.
- Componentes existentes, incluso los posiblemente obsoletos: no se eliminan sin pruebas de uso.

## Instalación
Mantener `cantapp-base` y `cantapp-components` como carpetas hermanas (la dependencia de `package.json` usa `file:../cantapp-components`).

```powershell
cd cantapp-components
npm install
cd ../cantapp-base
npm install
npm run check
npm run web
```

Si tu aplicación necesita variables de entorno, recuperá tu `.env` local anterior; no se incluyó en este ZIP por seguridad.

## Límites de la revisión
La limpieza es estructural. No implica que se hayan solucionado los pendientes de UI, paginación del servidor, navegación Mobile, Dark Mode o pruebas en dispositivos. No se ejecutaron `npm install` ni exportaciones Expo en esta entrega.

**Recomendación:** probar en una carpeta nueva antes de reemplazar el proyecto actual.
