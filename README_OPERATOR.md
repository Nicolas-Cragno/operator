# CANTAPP Operator — Etapa 1 (base de navegación)

Derivado del cantapp-base recibido el 30/10/2026. El original no se modifica.

## Alcance de esta entrega
- `mode: "app"`, `appId: "operator"`.
- Bootstrap remoto con `apps/operator/usuarios/{uid}` (lógica heredada).
- Inicio con tarjetas; sidebar web y barra inferior móvil (lógica heredada).
- Módulos de Firestore `porteria`, `talleres`, `asignaciones`, `documentos`.
- Consultas de solo lectura de eventos, personas, tractores, furgones, vehículos, stock y asignaciones usando la tabla existente.
- Talleres se subdivide en tractores/furgones; un único permiso `talleres` habilita ambas secciones.

## Pendiente (NO IMPLEMENTADO)
- Formularios de entrada/salida, llaves, inventario, trabajos, stock y documentos.
- Validación de permisos por operación en backend, movimientos de stock y viajes V2.
- Offline persistente e idempotencia.
- Verificar contratos reales de documentos, llaves, permisos por sucursal y endpoints de detalle.
- Pruebas de ejecución Web y Android (no se realizaron en este entorno).

## Instalación
Copiar `src/` sobre una copia de `cantapp-base` **que ya funciona**, conservando `package.json`, `app.json`, `node_modules` y `.env` de ese proyecto. Configurar `EXPO_PUBLIC_API_URL` como en la base existente. Ejecutar `npx expo start --web --clear`.

No incorporar archivos `.env` ni claves al ZIP. No desplegar cambios al backend: esta entrega no lo modifica.
