# Firma de código y SmartScreen

**No se contrató nada ni se asumió elegibilidad.** Este es un resumen para decidir.

## Por qué aparece el aviso

SmartScreen marca ejecutables sin reputación ni firma. Un certificado de firma de código ayuda, pero no elimina el aviso de inmediato: la reputación se construye con descargas.

## Opciones para un proyecto open source

| Opción | Costo | Requisitos | Notas |
|---|---|---|---|
| **SignPath Foundation** | Gratuita para proyectos open source aprobados | Repositorio público, licencia OSI, proceso de build reproducible, revisión del proyecto | Verificar requisitos vigentes en https://signpath.org/ |
| **Certificado OV** (Sectigo, DigiCert, SSL.com) | Pago, anual | Validación de identidad/organización | El token físico/USB agrega costo y logística |
| **Certificado EV** | Pago, más caro | Validación extendida | Reputación inicial mejor, no instantánea |
| **Azure Trusted Signing** | Plan mensual | Identidad verificada, cuenta Azure | Alternativa moderna para proyectos chicos |

## Pasos sugeridos

1. Decidir si se firma ahora o después del primer release público.
2. Si se va por SignPath: abrir la solicitud con el repo, la licencia y el workflow de build.
3. Integrar la firma en CI (Azure Key Vault o el runner de SignPath), nunca subir el certificado al repo.
4. Documentar en el README que el instalador está firmado y cómo verificarlo.

## Mientras tanto

- Publicar siempre el `SHA256SUMS.txt` en el release.
- Enlazar la guía de SmartScreen desde la landing.
- No prometer que "no aparece ningún aviso".
