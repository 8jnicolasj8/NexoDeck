# Pruebas manuales - v1.0.0

Estas pruebas requieren hardware real (una PC Windows y al menos un Android).
Marcar cada una al validar un release.

## Emparejamiento y seguridad

- [ ] Emparejar un celular nuevo con el QR de **Android (app)** y ver el deck con telemetría.
- [ ] Revocar el dispositivo desde **Emparejar → Dispositivos** y comprobar que la app se desconecta y no puede volver sin re-emparejar.
- [ ] Intentar reutilizar un QR ya usado: el servidor responde `pair2err` y `4401`.
- [ ] Esperar 5 minutos y escanear un QR vencido: debe fallar con "El código venció".
- [ ] Copiar el enlace `vexadeck://pair?...` y abrirlo desde otra app: la app debe **pedir confirmación** antes de conectar.
- [ ] Con la app conectada, matar el proceso del servidor y volver a abrirlo: la app reconecta sola y sigue controlando.

## Varias PCs

- [ ] Emparejar dos PCs (o una PC y una VM) y verlas en el chip de PC.
- [ ] Cambiar entre ellas: el chip, el nombre, el color y el perfil de la PC activa cambian.
- [ ] Tocar botones justo después de cambiar de PC: no se ejecuta ninguna acción (bloqueo de 250 ms).
- [ ] Apagar una PC que **no** es la activa: la UI no se interrumpe y al encenderla vuelve sola.
- [ ] Provocar una alerta de temperatura en la PC inactiva: aparece el aviso "⚠ … en PC-X · Ver" y al tocarlo cambia de PC.
- [ ] En la PWA (navegador), confirmar que **no** aparece ninguna interfaz de varias PCs.

## USB

- [ ] Activar "Depuración USB" en el celular y aceptar la huella de la PC.
- [ ] Habilitar **Configuración → Conexión USB (ADB)** y permitir el celular.
- [ ] Desenchufar el WiFi y comprobar que el control sigue por USB (el chip muestra USB).
- [ ] Desenchufar el cable con WiFi encendido: conmuta a LAN sin diálogos.
- [ ] "Instalar app en el celular" instala el APK con `adb install -r`.
- [ ] "Emparejar" abre el diálogo de confirmación en la app, sin escanear nada.
- [ ] Cerrar VexaDeck: si el servidor ADB lo levantó VexaDeck, se detiene.

## Descubrimiento y red

- [ ] Cambiar la IP de la PC (o reiniciar el router) y comprobar que la app la encuentra sola (mDNS / barrido).
- [ ] Dos PCs con el mismo nombre: la app agrega un sufijo local y no las confunde.
- [ ] Con el WiFi apagado y sin cable, la app muestra "Sin conexión" sin cerrarse.

## Wake-on-LAN

- [ ] Con la PC apagada (S5) y WoL activo, tocar **Encender** en la app: la PC arranca.
- [ ] Sin WoL activo en la BIOS, la app avisa que no se pudo encender y explica qué revisar.
- [ ] El panel (**Sistema → Encendido por red**) muestra la MAC correcta y "Probar paquete" no falla.

## PWA y compatibilidad

- [ ] Un iPhone sigue emparejando y funcionando con protocolo v1.
- [ ] El panel sigue accesible **solo** en `127.0.0.1:47802`.
- [ ] `/api/ident` responde en LAN pero no expone perfiles, dispositivos ni tokens.
- [ ] `VexaDeck.Server.exe --verify-v2 docs/protocol-v2-vectors.json` devuelve 0.
- [ ] `npm test` en `mobile/` pasa con el mismo archivo de vectores.
