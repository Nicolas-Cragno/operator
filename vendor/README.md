El archivo cantapp-components-1.6.0-mobile.tgz es un paquete generado directamente
desde la librería compartida cantapp-components, sin cambios en sus componentes.
Se incluye en Operator para que npm ci y EAS no necesiten carpetas externas.

Para incorporar cambios de la librería, desde operator/:

```powershell
npm pack ../cantapp-components --pack-destination ./vendor --ignore-scripts
Move-Item -Force ./vendor/cantapp-components-1.6.0.tgz ./vendor/cantapp-components-1.6.0-mobile.tgz
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

Si cambia la versión de la librería, actualizar también el nombre del archivo
en package.json. Versionar el paquete generado y package-lock.json junto con
esa actualización. No editar los archivos del paquete manualmente.

Compilación Android:

```powershell
npx eas-cli build --platform android --profile preview
```
