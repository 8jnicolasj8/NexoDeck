/**
 * Development-only bridge mock: simulates three paired PCs with different
 * grids, profiles and telemetry so the multi-PC UI can be built without a
 * phone. Load /native.html from `npm run dev`.
 */
const HOSTS = [
  {
    id: 'pc-desktop',
    name: 'PC-Escritorio',
    color: '#00FF9C',
    status: 'connected',
    transport: 'lan',
    latencyMs: 12,
    profile: { id: 'global', name: 'Global', accent: '#00FF9C', cols: 4, rows: 3, buttons: 12 },
  },
  {
    id: 'pc-oficina',
    name: 'PC-OFICINA',
    color: '#4FC3F7',
    status: 'connected',
    transport: 'usb',
    latencyMs: 4,
    profile: { id: 'vscode', name: 'VS Code', accent: '#007ACC', cols: 3, rows: 3, buttons: 9 },
  },
  {
    id: 'pc-notebook',
    name: 'Notebook',
    color: '#FFB74D',
    status: 'offline',
    transport: 'lan',
    latencyMs: 0,
    profile: { id: 'global', name: 'Global', accent: '#FFB74D', cols: 4, rows: 3, buttons: 6 },
  },
];

const demoButtons = [
  { label: 'Silenciar', icon: 'volume-x', kind: 'mute.toggle', binding: 'demo.state' },
  { label: 'Play / pausa', icon: 'play', kind: 'media' },
  { label: 'Anterior', icon: 'skip-back', kind: 'media' },
  { label: 'Siguiente', icon: 'skip-forward', kind: 'media' },
  { label: 'Captura', icon: 'camera', kind: 'hotkey' },
  { label: 'Escritorio', icon: 'monitor', kind: 'hotkey' },
  { label: 'Tareas', icon: 'activity', kind: 'hotkey' },
  { label: 'Bloquear PC', icon: 'lock', kind: 'power' },
  { label: 'Música', icon: 'music', kind: 'launch' },
  { label: 'Audífonos', icon: 'headphones', kind: 'audio.device' },
  { label: 'Terminal', icon: 'terminal', kind: 'launch' },
  { label: 'Micrófono', icon: 'mic', kind: 'mute.toggle', binding: 'demo.state' },
];

function buildConfig(host: (typeof HOSTS)[number]) {
  const buttons = Array.from({ length: host.profile.buttons }, (_, index) => {
    const demo = demoButtons[index % demoButtons.length];
    return {
      id: `${host.id}-b${index}`,
      type: demo.binding ? 'toggle' : 'action',
      label: demo.label,
      icon: { kind: 'lucide', value: demo.icon },
      pos: { row: Math.floor(index / host.profile.cols), col: index % host.profile.cols },
      action: { kind: demo.kind, params: { keys: ['ctrl', 'a'] } },
      stateBinding: demo.binding,
    };
  });

  return {
    version: 3,
    server: { httpPort: 47801, httpsPort: 47800, telemetryIntervalMs: 1000 },
    host: { serverId: host.id, pcName: host.name, pcColor: host.color, pcIcon: 'monitor' },
    revision: 1,
    devices: [],
    defaultProfileId: host.profile.id,
    profiles: [
      {
        id: host.profile.id,
        name: host.profile.name,
        accent: host.profile.accent,
        grid: { cols: host.profile.cols, rows: host.profile.rows },
        gridPortrait: { cols: host.profile.cols, rows: host.profile.rows },
        pages: [{ id: 'p1', name: 'Principal', buttons }],
        match: { processes: [] },
      },
    ],
    telemetry: {
      slots: {
        left: [
          { id: 'L1', widget: 'dual', primary: 'cpu.load', secondary: 'cpu.temp' },
          { id: 'L2', widget: 'single', primary: 'ram.used' },
        ],
        right: [
          { id: 'R1', widget: 'single', primary: 'ping.app' },
          { id: 'R2', widget: 'dual', primary: 'net.down', secondary: 'net.up' },
        ],
      },
    },
    alerts: [],
    scripts: [],
  };
}

const send = (payload: unknown) => {
  window.__vexadeckReceive?.(JSON.stringify(payload));
};

let activeHostId = HOSTS[0].id;

const emitHosts = () => {
  send({ k: 'hosts', list: HOSTS, activeId: activeHostId });
};

// The web client posts here when it runs inside a real WebView.
window.ReactNativeWebView = {
  postMessage(raw: string) {
    let message: any;
    try { message = JSON.parse(raw); } catch { return; }

    if (message.k === 'ready' || message.k === 'hosts.request') {
      emitHosts();
      for (const host of HOSTS) {
        if (host.status !== 'connected') continue;
        send({
          k: 'rx',
          host: host.id,
          msg: {
            t: 'welcome',
            d: {
              config: buildConfig(host),
              activeProfileId: host.profile.id,
              pinned: false,
              states: { 'demo.state': true },
              serverVersion: '1.0.0-demo',
              serverId: host.id,
              pcName: host.name,
              pcColor: host.color,
              pcIcon: 'monitor',
              configRevision: 1,
            },
          },
        });
      }
      return;
    }

    if (message.k === 'switchHost') {
      activeHostId = message.host;
      const host = HOSTS.find((item) => item.id === activeHostId);
      send({ k: 'hostStatus', host: activeHostId, status: 'connected', transport: host?.transport ?? 'lan', latencyMs: host?.latencyMs ?? 6 });
      emitHosts();
      return;
    }

    if (message.k === 'wake') {
      // eslint-disable-next-line no-console
      console.info(`[mock] magic packet to ${message.host}`);
      return;
    }
  },
};

// Fake telemetry so the deck looks alive.
setInterval(() => {
  for (const host of HOSTS) {
    if (host.status !== 'connected') continue;
    send({
      k: 'rx',
      host: host.id,
      msg: {
        t: 'telemetry',
        d: {
          m: {
            'cpu.load': 20 + Math.round(Math.random() * 30),
            'cpu.temp': 45 + Math.round(Math.random() * 12),
            'gpu.temp': 55 + Math.round(Math.random() * 10),
            'ram.used': 40 + Math.round(Math.random() * 20),
            'net.down': Math.round(Math.random() * 900),
            'net.up': Math.round(Math.random() * 200),
            'ping.app': 8 + Math.round(Math.random() * 10),
          },
        },
      },
    });
  }
}, 1000);
