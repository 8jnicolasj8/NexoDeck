# winget y Scoop

Manifiestos preparados. **Los PR los envía el usuario.** Reemplazar `X.Y.Z` y el SHA-256 cuando exista el release.

## winget (repositorio `microsoft/winget-pkgs`)

Ruta: `manifests/n/VexaDeck/VexaDeck/X.Y.Z/`

### `VexaDeck.VexaDeck.yaml`

```yaml
PackageIdentifier: VexaDeck.VexaDeck
PackageVersion: X.Y.Z
PackageName: VexaDeck
Publisher: VexaDeck
License: MIT
ShortDescription: Botonera táctil para Windows desde el celular.
Description: Convierte un celular en una botonera para Windows con perfiles automáticos, telemetría y portapapeles. Todo por red local.
Moniker: vexadeck
Tags:
  - stream-deck
  - macro
  - remote-control
  - privacy
Homepage: https://vexadeck-app.netlify.app
Repository: https://github.com/8jnicolasj8/VexaDeck
Installers:
  - Architecture: x64
    InstallerType: inno
    InstallerUrl: https://github.com/8jnicolasj8/VexaDeck/releases/download/vX.Y.Z/VexaDeck-Setup.exe
    InstallerSha256: <SHA256_DEL_EXE>
    Scope: machine
ManifestType: singleton
ManifestVersion: 1.6.0
```

## Scoop

Bucket propio (`scoop-vexadeck`) o PR a `extras`.

### `vexadeck.json`

```json
{
  "version": "X.Y.Z",
  "description": "Botonera táctil para Windows desde el celular.",
  "homepage": "https://vexadeck-app.netlify.app",
  "license": "MIT",
  "url": "https://github.com/8jnicolasj8/VexaDeck/releases/download/vX.Y.Z/VexaDeck-Portable.zip",
  "hash": "<SHA256_DEL_ZIP>",
  "bin": "VexaDeck.Server.exe",
  "shortcuts": [["VexaDeck.Server.exe", "VexaDeck"]],
  "checkver": { "github": "https://github.com/8jnicolasj8/VexaDeck" },
  "autoupdate": {
    "url": "https://github.com/8jnicolasj8/VexaDeck/releases/download/v$version/VexaDeck-Portable.zip"
  }
}
```

## Cómo obtener el hash

```powershell
Get-FileHash .\VexaDeck-Setup.exe -Algorithm SHA256
```

o desde el release: `SHA256SUMS.txt`.
