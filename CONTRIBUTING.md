# Guía de Contribución / Contributing Guidelines

¡Gracias por tu interés en contribuir a OpenDeck!

## 📌 Principios del Proyecto

1. **100% Local**: No se aceptan PRs que introduzcan dependencias de servidores en la nube, cuentas de usuario externas o telemetría enviada por internet.
2. **Seguridad ante todo**: Toda acción que interactúe con el sistema operativo debe ser validada rigurosamente. No se permiten comandos shell arbitrarios enviados desde el cliente.
3. **Calidad de código**:
   - Backend en C# / .NET 8 siguiendo convenciones estándar y nullability habilitada.
   - Frontend en TypeScript / React con tipos estrictos.

## 🛠️ Entorno de Desarrollo

1. Clonar el repositorio.
2. Compilar el backend:
   ```powershell
   dotnet build server/src/OpenDeck.Server/OpenDeck.Server.csproj
   ```
3. Compilar el frontend web:
   ```powershell
   npm --prefix web install
   npm --prefix web run build
   ```
4. Ejecutar las pruebas automatizadas de verificación (`test-m3.ps1`, `test-m4.ps1`, `test-m5.ps1`, `test-m6.ps1`, `test-m7.ps1`, `test-m8.ps1`).
