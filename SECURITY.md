# Política de Seguridad / Security Policy

NexoDeck interactúa directamente con el sistema operativo Windows para enviar pulsaciones de teclas, ejecutar scripts y monitorear hardware. Por esta razón, la seguridad y la protección de la máquina local son prioridades absolutas.

## 🛡️ Principios de diseño de seguridad

1. **Aislamiento de red**:
   - El panel de administración (`/admin`, `/api/admin/*`) escucha únicamente en `127.0.0.1:47802`. Las solicitudes que no provengan de la interfaz de loopback local reciben un error `403 Forbidden`.
   - Las conexiones LAN (puertos 47800 y 47801) están restringidas a rangos de IP privadas (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`). Conexiones fuera de estos rangos son rechazadas de inmediato.
2. **Autenticación obligatoria**:
   - Toda conexión WebSocket requiere un token criptográfico generado durante el emparejamiento.
   - Los tokens se almacenan en `config.json` **únicamente como hashes SHA-256**.
3. **Ejecución segura de scripts**:
   - Solo se permite la ejecución de scripts `.vbs` ubicados en la carpeta `<DataDir>\scripts\`.
   - La ruta de destino se normaliza y verifica contra ataques de path-traversal (`Path.GetFullPath`).
4. **Acciones críticas del sistema**:
   - Las acciones de energía (apagar, reiniciar) exigen confirmación en el cliente (`confirmed: true`) y cuentan con un retardo de cancelación mediante `shutdown /a`.

## 🚨 Reportar una vulnerabilidad

Si descubrís una vulnerabilidad de seguridad en NexoDeck:

1. **No abras un issue público** en GitHub.
2. Enviá un reporte detallado con los pasos de reproducción y el impacto a través de un aviso de seguridad privado en GitHub (Security Advisory) o por correo electrónico a los mantenedores del repositorio.
3. El reporte será revisado y abordado con máxima prioridad.
