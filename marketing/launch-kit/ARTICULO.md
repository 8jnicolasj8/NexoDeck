# Borrador · Cómo hice mi propia botonera para PC con .NET y React

> Artículo técnico para Dev.to/Hashnode. No es un anuncio: cuenta decisiones y problemas reales.

## El problema

Quería una botonera física para atajos, pero no quería comprar hardware ni depender de un servicio en la nube. El requisito era simple: que el celular haga de panel y que todo funcione en la red local, incluso si se cae internet.

## Arquitectura en dos piezas

- **Servidor en Windows** (.NET 8, WinForms + WebView2): expone la API, ejecuta acciones, lee sensores y sirve el cliente web.
- **Cliente React + Vite**: la misma interfaz corre en el navegador del celular y dentro de una WebView en Android.

El servidor abre tres puertos: el cliente en `47800`, el WebSocket en `47801` y el panel de administración, que **solo escucha en `127.0.0.1:47802`**.

## Perfiles por proceso en primer plano

`SetWinEventHook` con `EVENT_SYSTEM_FOREGROUND` avisa cada vez que cambia la ventana activa. El servidor compara el proceso y el título contra los matchers del perfil y manda el cambio por el socket. El cliente aplica zoom + fundido de ~300 ms.

Detalle importante: el perfil elegido a mano no se fija; el auto-switching retoma cuando cambiás de aplicación. Es lo que espera la gente que usa una botonera todo el día.

## Protocolo firmado sobre WebSocket

El handshake usa un secreto de emparejamiento de un solo uso, HKDF para derivar la clave del dispositivo y HMAC-SHA256 para cada sobre. Un contador estrictamente creciente evita replay; si llega un número repetido o salteado, la sesión se cierra.

La versión para navegador usa HTTPS con una CA local y WebSocket seguro. En Android se usa `ws://` firmado a propósito: instalar una CA en el teléfono es fricción y un riesgo que no quería pedirle al usuario.

## Telemetría

LibreHardwareMonitor da CPU, GPU, RAM y temperaturas. La telemetría se muestrea y se envía a un ritmo fijo; el cliente no consulta, solo recibe. Las alertas de temperatura se disparan en el servidor para que no dependan de la pestaña abierta.

## Audio

WASAPI para volumen maestro, por aplicación y cambio de salida. Los sliders se sincronizan con el estado real de Windows para que el número en pantalla no mienta.

## Empaquetar una PWA en un APK

El APK carga el bundle web desde los assets locales y expone un puente nativo mínimo (hápticos, portapapeles, Wake-on-LAN). La conexión la maneja el lado nativo, no la WebView, para sobrevivir al bloqueo de pantalla y cambiar de red.

## Lo que aprendí

- Un contador de mensajes estrictamente ordenado obliga a serializar los envíos: dos broadcasts concurrentes pueden romper el orden aunque el contador esté bien.
- El panel de administración es la superficie más sensible: loopback obligatorio y sin acceso desde la red.
- El modo OLED no es estético: en un celular viejo usado como panel fijo, el negro puro y la atenuación cambian la experiencia.

Repo y código: <https://github.com/8jnicolasj8/NexoDeck>
