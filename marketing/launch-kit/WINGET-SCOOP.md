# winget y Scoop

Manifiestos preparados. **Los PR los envía el usuario.** Reemplazar `X.Y.Z` y el SHA-256 cuando exista el release.

## winget (repositorio `microsoft/winget-pkgs`)

Ruta: `manifests/n/NexoDeck/NexoDeck/X.Y.Z/`

### `NexoDeck.NexoDeck.yaml`

```yaml
PackageIdentifier: NexoDeck.NexoDeck
PackageVersion: X.Y.Z
PackageName: NexoDeck
Publisher: NexoDeck
License: MIT
ShortDescription: Botonera táctil para Windows desde el celular.
Description: Convierte un celular en una botonera para Windows con perfiles automáticos, telemetría y portapapeles. Todo por red local.
Moniker: nexodeck
Tags:
  - stream-deck
  - macro
  - remote-control
  - privacy
Homepage: https://nexodeck-app.netlify.app
Repository: https://github.com/8jnicolasj8/NexoDeck
Installers:
  - Architecture: x64
    InstallerType: inno
    InstallerUrl: https://github.com/8jnicolasj8/NexoDeck/releases/download/vX.Y.Z/NexoDeck-Setup.exe
    InstallerSha256: <SHA256_DEL_EXE>
    Scope: machine
ManifestType: singleton
ManifestVersion: 1.6.0
```

## Scoop

Bucket propio (`scoop-nexodeck`) o PR a `extras`.

### `nexodeck.json`

```json
{
  "version": "X.Y.Z",
  "description": "Botonera táctil para Windows desde el celular.",
  "homepage": "https://nexodeck-app.netlify.app",
  "license": "MIT",
  "url": "https://github.com/8jnicolasj8/NexoDeck/releases/download/vX.Y.Z/NexoDeck-Portable.zip",
  "hash": "<SHA256_DEL_ZIP>",
  "bin": "NexoDeck.Server.exe",
  "shortcuts": [["NexoDeck.Server.exe", "NexoDeck"]],
  "checkver": { "github": "https://github.com/8jnicolasj8/NexoDeck" },
  "autoupdate": {
    "url": "https://github.com/8jnicolasj8/NexoDeck/releases/download/v$version/NexoDeck-Portable.zip"
  }
}
```

## Cómo obtener el hash

```powershell
Get-FileHash .\NexoDeck-Setup.exe -Algorithm SHA256
```

o desde el release: `SHA256SUMS.txt`.
