export type Lang = 'es' | 'en';

export interface Copy {
  htmlLang: string;
  title: string;
  description: string;
  nav: { how: string; features: string; downloads: string; faq: string; repo: string; otherLang: string; otherLangHref: string };
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    primary: string;
    secondary: string;
    iphone: string;
    terminal: string;
    soon: string;
  };
  steps: { title: string; lead: string; items: { n: string; title: string; body: string }[] };
  features: { title: string; lead: string; soon: string; items: { title: string; body: string; flag?: 'android' | 'multiPc' | 'usb' }[] };
  gallery: { title: string; lead: string; pending: string };
  privacy: { title: string; lead: string; points: { title: string; body: string }[]; note: string };
  downloads: {
    title: string;
    lead: string;
    version: string;
    date: string;
    size: string;
    sha: string;
    copy: string;
    copied: string;
    notes: string;
    soon: string;
    cards: { key: 'installer' | 'portable' | 'apk' | 'pwa'; title: string; body: string; cta: string }[];
    noRelease: string;
  };
  requirements: { title: string; items: string[] };
  faq: { title: string; items: { q: string; a: string }[] };
  openSource: { title: string; body: string; cta: string; contribute: string; license: string };
  footer: { trademark: string; license: string; security: string; made: string; guides: string; iphoneGuide: string; smartScreen: string };
  guides: {
    iphone: { title: string; lead: string; steps: string[]; unverified: string; back: string };
    smartscreen: { title: string; lead: string; steps: string[]; hashTitle: string; hashBody: string; back: string };
  };
  thanks: { title: string; lead: string; steps: string[]; back: string };
  notFound: { title: string; lead: string; back: string };
}

export const copy: Record<Lang, Copy> = {
  es: {
    htmlLang: 'es-AR',
    title: 'NexoDeck — Usá tu celular como botonera para la PC',
    description:
      'Convertí tu Android o iPhone en una botonera táctil para Windows: perfiles automáticos, telemetría en vivo, volumen, portapapeles y más. Gratis, open source y 100 % local.',
    nav: { how: 'Cómo funciona', features: 'Funciones', downloads: 'Descargas', faq: 'Preguntas', repo: 'GitHub', otherLang: 'English', otherLangHref: '/en/' },
    hero: {
      eyebrow: 'Windows + Android + iPhone',
      title: 'Tu celular, ahora es una botonera para tu PC.',
      lead:
        'Atajos, volumen, telemetría y textos rápidos en una grilla táctil que cambia sola según la app que tenés en primer plano. Todo por tu red local: sin nube, sin cuentas y sin telemetría.',
      primary: 'Descargar para Windows',
      secondary: 'Android (APK)',
      iphone: '¿Tenés iPhone? Mirá la guía',
      terminal: '100% local · open source · sin cuentas',
      soon: 'Próximamente',
    },
    steps: {
      title: 'Cómo funciona',
      lead: 'Tres pasos, sin crear ninguna cuenta.',
      items: [
        { n: '01', title: 'Instalá en tu PC', body: 'El instalador deja el servidor andando y abre el panel de configuración en tu computadora.' },
        { n: '02', title: 'Escaneá el QR', body: 'Con el celular, abrí la dirección que muestra la PC y escaneá el código de emparejamiento de un solo uso.' },
        { n: '03', title: 'Controlá tu PC', body: 'La botonera queda en tu celular. Cambiá de perfil, tocá botones y mirá la telemetría en vivo.' },
      ],
    },
    features: {
      title: 'Lo que podés hacer',
      lead: 'Funciones que ya están en la versión publicada. Lo que falta se muestra como próximamente, sin promesas de más.',
      soon: 'Próximamente',
      items: [
        { title: 'Perfiles que cambian solos', body: 'Detecta la app en primer plano y cambia la botonera: VS Code, Spotify, el navegador o un juego.' },
        { title: 'Telemetría en vivo', body: 'CPU, GPU, memoria, red y temperatura con alertas cuando algo se calienta de más.' },
        { title: 'Botones con estado real', body: 'Mute, toggles y ajustes que reflejan lo que pasa en Windows, no un ícono decorativo.' },
        { title: 'Sliders de volumen', body: 'Volumen maestro y por aplicación, más cambio de salida de audio.' },
        { title: 'Portapapeles y textos rápidos', body: 'Mandá y recibí texto entre el celular y la PC, con historial de los últimos envíos.' },
        { title: 'Páginas y carpetas', body: 'Organizá los botones en varias páginas y encontrá todo sin salir del deck.' },
        { title: 'Modo OLED', body: 'Negro puro y atenuación por inactividad para gastar menos batería de noche.' },
        { title: 'Panel con arrastrar y soltar', body: 'Armá la grilla desde la PC, con íconos reales de tus aplicaciones y vista previa.' },
        { title: 'App Android nativa', body: 'El APK empaqueta el cliente y conecta por WebSocket firmado, sin instalar certificados.', flag: 'android' },
        { title: 'Varias PCs', body: 'Cambiá entre computadoras guardadas con un toque, sin volver a emparejar.', flag: 'multiPc' },
        { title: 'Conexión por USB', body: 'Si el WiFi falla, la app sigue funcionando por cable con ADB.', flag: 'usb' },
      ],
    },
    gallery: {
      title: 'Mirá cómo se ve',
      lead: 'Capturas de la botonera y del panel, con datos de demostración.',
      pending: 'Las capturas se actualizan con cada versión publicada.',
    },
    privacy: {
      title: 'Privacidad y seguridad',
      lead: 'Sin nube. Sin cuentas. Sin telemetría. Todo queda en tu red.',
      points: [
        { title: 'Emparejamiento por QR de un solo uso', body: 'El código vence y solo sirve una vez. Cada celular recibe su propia clave, y podés revocar dispositivos desde el panel.' },
        { title: 'El panel solo se abre en tu PC', body: 'La configuración escucha únicamente en la dirección local de la computadora, no en la red.' },
        { title: 'Tráfico dentro de tu LAN', body: 'El servidor acepta conexiones de tu red privada o de la propia máquina. No hay servidores intermedios.' },
      ],
      note:
        'Con honestidad: la PWA por navegador usa HTTPS con un certificado local, y la app Android usa WebSocket firmado sobre tu WiFi. Los datos viajan por tu red local, no por internet.',
    },
    downloads: {
      title: 'Descargas',
      lead: 'Los binarios viven en GitHub Releases. Los nombres son estables: el enlace siempre apunta al último release.',
      version: 'Versión',
      date: 'Publicado',
      size: 'Tamaño',
      sha: 'SHA-256',
      copy: 'Copiar hash',
      copied: 'Copiado',
      notes: 'Notas de la versión',
      soon: 'Próximamente',
      cards: [
        { key: 'installer', title: 'Windows · instalador', body: 'Instala, configura el firewall y arranca con Windows.', cta: 'Descargar .exe' },
        { key: 'portable', title: 'Windows · portable', body: 'Descomprimí y ejecutá. Los datos quedan en la carpeta data/.', cta: 'Descargar .zip' },
        { key: 'apk', title: 'Android · APK', body: 'App nativa con Wake-on-LAN y conexión por USB.', cta: 'Descargar .apk' },
        { key: 'pwa', title: 'iPhone · navegador', body: 'Se usa desde Safari, sin app nativa. Requiere instalar el certificado local.', cta: 'Ver la guía' },
      ],
      noRelease: 'Todavía no hay un release publicado en GitHub.',
    },
    requirements: {
      title: 'Requisitos',
      items: [
        'Windows 10 u 11 de 64 bits.',
        'La PC y el celular en la misma red WiFi (o cable USB con Android).',
        'Celular con Android o iPhone, usando el navegador.',
      ],
    },
    faq: {
      title: 'Preguntas frecuentes',
      items: [
        { q: '¿Es gratis?', a: 'Sí. Es gratuito y open source. No hay versión paga, cuentas ni funciones bloqueadas.' },
        { q: '¿Necesita internet?', a: 'No. La PC y el celular hablan por tu red local. Internet solo hace falta para descargar la aplicación o ver el repositorio.' },
        { q: '¿Por qué Windows me muestra una advertencia (SmartScreen)?', a: 'El instalador no tiene firma de código comercial, así que Windows muestra el aviso de "aplicación desconocida". Podés verificar el SHA-256 y continuar con "Más información → Ejecutar de todas formas".' },
        { q: '¿Es seguro? ¿Qué datos recopila?', a: 'No recopila datos: no hay analíticas ni telemetría a internet. El tráfico queda en tu red local y el código es abierto para revisarlo.' },
        { q: '¿Funciona con iPhone?', a: 'Sí, desde Safari como PWA. No hay app nativa ni conexión por USB en iPhone.' },
        { q: '¿Cómo lo desinstalo?', a: 'Desde "Agregar o quitar programas" en Windows. El instalador también elimina la tarea de inicio y las reglas de firewall.' },
        { q: '¿Puedo usarlo fuera de casa con una VPN tipo Tailscale?', a: 'No es un escenario probado. El servidor acepta conexiones de la red local; una VPN puede funcionar, pero no está soportado ni verificado.' },
        { q: '¿Cómo reporto un problema o contribuyo?', a: 'Abrí un issue en GitHub con los pasos para reproducirlo. Las contribuciones son bienvenidas: mirá los issues marcados para empezar.' },
      ],
    },
    openSource: {
      title: 'Open source',
      body: 'El código del servidor y del cliente está en GitHub. Podés leerlo, modificarlo y proponer cambios.',
      cta: 'Ver el repositorio',
      contribute: 'Cómo contribuir',
      license: 'Licencia',
    },
    footer: {
      trademark: 'Stream Deck es una marca registrada de Elgato. NexoDeck no está afiliado ni respaldado por Elgato.',
      license: 'Licencia',
      security: 'Seguridad',
      made: 'Hecho para Windows, Android y iPhone.',
      guides: 'Guías',
      iphoneGuide: 'Guía para iPhone',
      smartScreen: 'SmartScreen y antivirus',
    },
    guides: {
      iphone: {
        title: 'Usar NexoDeck en iPhone',
        lead: 'En iPhone no hay app nativa: la botonera se usa desde Safari como PWA.',
        steps: [
          'Conectá el iPhone a la misma red WiFi que la PC.',
          'Abrí en Safari la dirección HTTPS que muestra la PC (por ejemplo, https://192.168.0.10:47800).',
          'Aceptá el certificado local cuando Safari lo pida.',
          'Si el certificado no queda activo: Ajustes → General → Información → Ajustes de confianza de certificados, y habilitalo.',
          'Tocá Compartir → Añadir a pantalla de inicio para abrirla como una app.',
        ],
        unverified: 'Estos pasos no fueron verificados en un iPhone real. Si algo no coincide, abrí un issue con el modelo y la versión de iOS.',
        back: 'Volver',
      },
      smartscreen: {
        title: 'SmartScreen y antivirus',
        lead: 'El instalador no está firmado con un certificado comercial, así que Windows puede mostrar una advertencia.',
        steps: [
          'En el aviso de SmartScreen, tocá "Más información".',
          'Elegí "Ejecutar de todas formas" si descargaste el archivo desde el release oficial.',
          'Si un antivirus marca la aplicación, revisá que sea la lectura de sensores de hardware (LibreHardwareMonitor), una biblioteca conocida de monitoreo.',
          'Podés compilar el proyecto desde el código fuente si preferís no usar el binario.',
        ],
        hashTitle: 'Verificá el SHA-256',
        hashBody: 'Compará el hash del archivo descargado con el publicado en el release:',
        back: 'Volver',
      },
    },
    thanks: {
      title: 'Listo, ya lo tenés',
      lead: 'Siguiente paso: instalar, abrir el panel y emparejar el celular.',
      steps: [
        'Ejecutá el instalador y abrí el panel cuando termine.',
        'En el panel, elegí "iPhone / navegador" o "Android" y mostrá el QR.',
        'Escaneá el código con el celular y aceptá el certificado local.',
      ],
      back: 'Volver al inicio',
    },
    notFound: { title: 'No encontramos esa página', lead: 'Puede que el enlace haya cambiado.', back: 'Volver al inicio' },
  },
  en: {
    htmlLang: 'en',
    title: 'NexoDeck — Turn your phone into a PC macro deck',
    description:
      'Turn an Android phone or iPhone into a touch macro deck for Windows: automatic profiles, live telemetry, volume, clipboard and more. Free, open source and 100% local.',
    nav: { how: 'How it works', features: 'Features', downloads: 'Downloads', faq: 'FAQ', repo: 'GitHub', otherLang: 'Español', otherLangHref: '/' },
    hero: {
      eyebrow: 'Windows + Android + iPhone',
      title: 'Your phone is now a macro deck for your PC.',
      lead:
        'Shortcuts, volume, telemetry and quick text on a touch grid that switches itself to match the app in focus. Everything over your local network: no cloud, no accounts, no telemetry.',
      primary: 'Download for Windows',
      secondary: 'Android (APK)',
      iphone: 'On iPhone? Read the guide',
      terminal: '100% local · open source · no accounts',
      soon: 'Coming soon',
    },
    steps: {
      title: 'How it works',
      lead: 'Three steps, no account needed.',
      items: [
        { n: '01', title: 'Install on your PC', body: 'The installer keeps the server running and opens the configuration panel on your computer.' },
        { n: '02', title: 'Scan the QR', body: 'On your phone, open the address shown by the PC and scan the one-time pairing code.' },
        { n: '03', title: 'Control your PC', body: 'The deck stays on your phone. Switch profiles, tap buttons and watch live telemetry.' },
      ],
    },
    features: {
      title: 'What you can do',
      lead: 'Features that are already in the published version. Anything missing is shown as coming soon, no overpromising.',
      soon: 'Coming soon',
      items: [
        { title: 'Profiles that switch themselves', body: 'Detects the app in focus and swaps the deck: VS Code, Spotify, the browser or a game.' },
        { title: 'Live telemetry', body: 'CPU, GPU, memory, network and temperature with alerts when something runs hot.' },
        { title: 'Buttons with real state', body: 'Mute, toggles and settings that mirror Windows instead of a decorative icon.' },
        { title: 'Volume sliders', body: 'Master and per-app volume, plus audio output switching.' },
        { title: 'Clipboard and quick text', body: 'Send and receive text between phone and PC, with a short history.' },
        { title: 'Pages and folders', body: 'Organise buttons across pages and find everything without leaving the deck.' },
        { title: 'OLED mode', body: 'True black and idle dimming to save battery at night.' },
        { title: 'Drag-and-drop panel', body: 'Build the grid on the PC with real app icons and a live phone preview.' },
        { title: 'Native Android app', body: 'The APK bundles the client and connects over a signed WebSocket, no certificates to install.', flag: 'android' },
        { title: 'Multiple PCs', body: 'Switch between saved computers with one tap, no re-pairing.', flag: 'multiPc' },
        { title: 'USB connection', body: 'If WiFi fails, the app keeps working over the cable with ADB.', flag: 'usb' },
      ],
    },
    gallery: {
      title: 'See how it looks',
      lead: 'Deck and panel screenshots with demo data.',
      pending: 'Screenshots are refreshed with every published version.',
    },
    privacy: {
      title: 'Privacy and security',
      lead: 'No cloud. No accounts. No telemetry. Everything stays on your network.',
      points: [
        { title: 'One-time QR pairing', body: 'The code expires and works once. Each phone gets its own key, and you can revoke devices from the panel.' },
        { title: 'The panel only opens on your PC', body: 'Configuration listens on the local address only, never on the network.' },
        { title: 'Traffic inside your LAN', body: 'The server accepts connections from your private network or the machine itself. No middle servers.' },
      ],
      note:
        'To be honest: the browser PWA uses HTTPS with a local certificate, and the Android app uses a signed WebSocket over your WiFi. Data travels over your local network, not the internet.',
    },
    downloads: {
      title: 'Downloads',
      lead: 'Binaries live on GitHub Releases. File names are stable, so links always point at the latest release.',
      version: 'Version',
      date: 'Published',
      size: 'Size',
      sha: 'SHA-256',
      copy: 'Copy hash',
      copied: 'Copied',
      notes: 'Release notes',
      soon: 'Coming soon',
      cards: [
        { key: 'installer', title: 'Windows · installer', body: 'Installs, sets firewall rules and starts with Windows.', cta: 'Download .exe' },
        { key: 'portable', title: 'Windows · portable', body: 'Unzip and run. Data stays in the data/ folder.', cta: 'Download .zip' },
        { key: 'apk', title: 'Android · APK', body: 'Native app with Wake-on-LAN and USB connectivity.', cta: 'Download .apk' },
        { key: 'pwa', title: 'iPhone · browser', body: 'Runs in Safari, no native app. Requires the local certificate.', cta: 'Read the guide' },
      ],
      noRelease: 'No release has been published on GitHub yet.',
    },
    requirements: {
      title: 'Requirements',
      items: [
        'Windows 10 or 11, 64-bit.',
        'PC and phone on the same WiFi network (or a USB cable with Android).',
        'An Android phone or iPhone with a browser.',
      ],
    },
    faq: {
      title: 'Frequently asked questions',
      items: [
        { q: 'Is it free?', a: 'Yes. It is free and open source. No paid tier, no accounts, no locked features.' },
        { q: 'Does it need internet?', a: 'No. The PC and phone talk over your local network. Internet is only needed to download the app or browse the repository.' },
        { q: 'Why does Windows warn me (SmartScreen)?', a: 'The installer has no commercial code signature, so Windows shows the unknown app warning. You can verify the SHA-256 and continue with "More info → Run anyway".' },
        { q: 'Is it safe? What data does it collect?', a: 'It collects nothing: no analytics or telemetry to the internet. Traffic stays on your local network and the code is open for review.' },
        { q: 'Does it work on iPhone?', a: 'Yes, from Safari as a PWA. There is no native app or USB connection on iPhone.' },
        { q: 'How do I uninstall it?', a: 'From "Add or remove programs" in Windows. The installer also removes the startup task and firewall rules.' },
        { q: 'Can I use it outside my home with a VPN such as Tailscale?', a: 'That is not a tested scenario. The server accepts local network connections; a VPN may work but is not supported or verified.' },
        { q: 'How do I report a bug or contribute?', a: 'Open an issue on GitHub with reproduction steps. Contributions are welcome: look for issues labelled as a good starting point.' },
      ],
    },
    openSource: {
      title: 'Open source',
      body: 'Server and client code live on GitHub. You can read it, change it and propose improvements.',
      cta: 'View the repository',
      contribute: 'How to contribute',
      license: 'License',
    },
    footer: {
      trademark: 'Stream Deck is a registered trademark of Elgato. NexoDeck is not affiliated with or endorsed by Elgato.',
      license: 'License',
      security: 'Security',
      made: 'Made for Windows, Android and iPhone.',
      guides: 'Guides',
      iphoneGuide: 'iPhone guide',
      smartScreen: 'SmartScreen and antivirus',
    },
    guides: {
      iphone: {
        title: 'Using NexoDeck on iPhone',
        lead: 'There is no native app on iPhone: the deck runs in Safari as a PWA.',
        steps: [
          'Connect the iPhone to the same WiFi network as the PC.',
          'Open the HTTPS address shown by the PC in Safari (for example, https://192.168.0.10:47800).',
          'Accept the local certificate when Safari asks.',
          'If the certificate stays inactive: Settings → General → About → Certificate Trust Settings, and enable it.',
          'Tap Share → Add to Home Screen to open it like an app.',
        ],
        unverified: 'These steps were not verified on a real iPhone. If something differs, open an issue with your model and iOS version.',
        back: 'Back',
      },
      smartscreen: {
        title: 'SmartScreen and antivirus',
        lead: 'The installer is not signed with a commercial certificate, so Windows may warn you.',
        steps: [
          'On the SmartScreen prompt, select "More info".',
          'Choose "Run anyway" if you downloaded the file from the official release.',
          'If an antivirus flags the app, check whether it is the hardware sensor reader (LibreHardwareMonitor), a well-known monitoring library.',
          'You can build the project from source if you prefer not to use the binary.',
        ],
        hashTitle: 'Verify the SHA-256',
        hashBody: 'Compare the downloaded file hash with the one published in the release:',
        back: 'Back',
      },
    },
    thanks: {
      title: 'You are all set',
      lead: 'Next: install, open the panel and pair your phone.',
      steps: [
        'Run the installer and open the panel when it finishes.',
        'In the panel, choose "iPhone / browser" or "Android" and show the QR.',
        'Scan the code with your phone and accept the local certificate.',
      ],
      back: 'Back to home',
    },
    notFound: { title: 'We could not find that page', lead: 'The link may have changed.', back: 'Back to home' },
  },
};
