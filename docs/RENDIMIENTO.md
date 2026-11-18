# Rendimiento y consumo de memoria

Medición del **Working Set - Private** (contador `\Process V2(*)\Working Set - Private`) de
`NexoDeck.Server.exe` y de todos sus procesos hijo `msedgewebview2.exe`.

Herramienta: `tools/measure-ram.ps1`.

```powershell
# Publicar primero el binario self-contained que se quiere medir
dotnet publish server/src/NexoDeck.Server/NexoDeck.Server.csproj -c Release -r win-x64 --self-contained true

# A = ventana abierta · B = ventana cerrada (bandeja) · C = cerrada + celular conectado
.\tools\measure-ram.ps1 -Scenario All -Samples 5 -IntervalMs 2000
```

Escenarios:

| Escenario | Estado del panel | Celular |
|---|---|---|
| **A** | Ventana abierta | Desconectado |
| **B** | Ventana cerrada (bandeja) | Desconectado |
| **C** | Ventana cerrada (bandeja) | Conectado en la vista Deck |

---

## Antes — v0.1.0

Fecha: 2026-11-17 · Build: Release `win-x64`, self-contained · 3 muestras × 1500 ms.

| Escenario | nexodeck.server (MB) | msedgewebview2 (procesos) | msedgewebview2 (MB) | Total (MB) |
|---|---:|---:|---:|---:|
| A (ventana abierta) | 29,6 | 5 | 82,2 | 111,8 |
| B (ventana cerrada) | 30,7 | **7** | **113,2** | 143,9 |
| C (cerrada + celular) | 32,5 | **7** | **114,2** | 146,7 |

**Diagnóstico:** al cerrar la ventana hacia la bandeja, el control WebView2 y su
`CoreWebView2Environment` siguen vivos. Los procesos `msedgewebview2.exe` no se liberan
y **aumentan** (de 5 a 7) porque la ventana se oculta pero el motor sigue cargado.

El servidor .NET por sí mismo ya medía ~30 MB de working set privado en este equipo
(no ~200 MB), así que el margen de mejora del lado .NET es chico: el objetivo real es
eliminar por completo los procesos de WebView2 con la ventana cerrada.

---

## Después — v0.2.0

Fecha: 2026-11-17 · Build: Release `win-x64`, self-contained · 3 muestras × 1500 ms.

| Escenario | nexodeck.server (MB) | msedgewebview2 (procesos) | msedgewebview2 (MB) | Total (MB) |
|---|---:|---:|---:|---:|
| A (ventana abierta) | 29,7 | 5 | 92,5 | 122,2 |
| B (ventana cerrada) | **8,8** | **0** | **0** | **8,8** |
| C (cerrada + celular) | **16,4** | **0** | **0** | **16,4** |

### Comparación

| Escenario | Total antes (MB) | Total después (MB) | msedgewebview2 antes | msedgewebview2 después |
|---|---:|---:|---:|---:|
| A (ventana abierta) | 111,8 | 122,2 | 5 | 5 |
| B (ventana cerrada) | 143,9 | **8,8** | 7 | **0** |
| C (cerrada + celular) | 146,7 | **16,4** | 7 | **0** |

**Resultado:** con la ventana cerrada no queda ningún proceso `msedgewebview2.exe` de
NexoDeck y el servidor idle queda muy por debajo del objetivo de 100 MB (8,8 MB solo,
16,4 MB con un celular conectado). El escenario A no es el uso normal: con el panel
abierto el motor WebView2 se paga aparte y su cifra varía con la versión del runtime
instalado, no con este cambio.

Cambios medidos, aplicados por separado:

- **E1** (destruir WebView2 al cerrar): responsable de los 0 procesos y de la mayor parte del ahorro.
- **E2** (GC de estación de trabajo, sin GC concurrente, sin TieredPGO, `ConserveMemory=3`): el servidor idle bajó de ~30 MB a 8,8 MB.
- **E3** (sin clientes ni ventana no se sondea hardware; LHM abre solo CPU y GPU): el escenario C no dispara el ciclo de sensores cuando el celular está en pausa.
- **E4** (un cliente lento descarta telemetría atrasada): evita buffers retenidos por cliente.

La latencia de acciones no se vio afectada: las acciones se ejecutan en el endpoint del
action sin pasar por el ciclo de telemetría, y el servidor se mantiene en ~16 MB con
celular conectado.

## v0.3.0

- mDNS: un socket UDP y un hilo de recepción que solo responde consultas de `_nexodeck._tcp.local`; se cierra al pausar el servidor.
- ADB: no se ejecuta nada salvo que "Conexión USB" esté habilitada. Sin celulares aprobados no hay sondeos periódicos.
- Telemetría: sigue pausándose si nadie mira y `view:false` en v2 evita enviar frames a PCs que no son la activa.
- App: los sockets se cierran a los 60 s en segundo plano y se reabren al volver.
- Pendiente de medir en hardware real: latencia p50/p95 por transporte (LAN vs USB) y consumo de RAM del APK. No se publican cifras sin medirlas.
