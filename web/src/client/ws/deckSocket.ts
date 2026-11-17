import { useDeckStore } from '../store/useDeckStore';
import { AppConfig, MetricId } from '../../shared/types';

class DeckWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private reconnectDelay = 500;
  private maxReconnectDelay = 5000;
  private explicitClose = false;
  private lastAlertVibration = 0;

  public async connect(): Promise<void> {
    this.explicitClose = false;
    this.clearTimers();

    const store = useDeckStore.getState();
    store.setConnectionState('reconnecting');

    // 1. Check if token exists in localStorage or query params
    let token = localStorage.getItem('opendeck_token');
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const queryToken = params.get('token');

    if (queryToken) {
      token = queryToken;
      localStorage.setItem('opendeck_token', token);
      params.delete('token');
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }

    // If code exists, attempt pairing
    if (code && !token) {
      try {
        const deviceName = `${navigator.userAgent.includes('Android') ? 'Android' : 'Dispositivo'} (${navigator.platform})`;
        const res = await fetch('/api/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, deviceName }),
        });
        if (res.ok) {
          const pairData = await res.json();
          token = pairData.token;
          if (token) {
            localStorage.setItem('opendeck_token', token);
          }
          params.delete('code');
          window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
        }
      } catch {
        // Pairing failed; continue to attempt connect
      }
    }

    const host = localStorage.getItem('opendeck_host') || window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.reconnectDelay = 500;
        store.setConnectionState('connected');

        // Authenticate with hello
        this.send({
          v: 1,
          t: 'hello',
          d: {
            token: token || '',
            deviceName: navigator.userAgent.includes('Android') ? 'Celular Android' : 'Cliente Web',
            clientVersion: '0.1.0',
          },
        });

        this.startPingLoop();
      };

      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch { }
      };

      this.socket.onerror = () => {
        this.scheduleReconnect();
      };

      this.socket.onclose = () => {
        store.setConnectionState('offline');
        this.clearTimers();
        if (!this.explicitClose) {
          this.scheduleReconnect();
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private handleMessage(msg: { t: string; d: any }): void {
    const store = useDeckStore.getState();

    switch (msg.t) {
      case 'welcome': {
        const { config, activeProfileId, pinned, states, serverVersion, clipboard, nowPlaying } = msg.d;
        store.setWelcomeData(config as AppConfig, activeProfileId, pinned, states, serverVersion, clipboard, nowPlaying);
        break;
      }

      case 'pong': {
        if (msg.d?.ts) {
          const latency = Math.max(0, Date.now() - msg.d.ts);
          store.setPing(latency);
          store.setTelemetry({ 'ping.app': latency } as Partial<Record<MetricId, number>>);
        }
        break;
      }

      case 'telemetry': {
        if (msg.d?.m) {
          store.setTelemetry(msg.d.m);
          this.checkTemperatureAlerts(msg.d.m);
        }
        break;
      }

      case 'profile.changed': {
        if (msg.d?.profileId) {
          store.setActiveProfileId(msg.d.profileId);
          store.setPinned(!!msg.d.pinned);
        }
        break;
      }

      case 'page.open': {
        if (msg.d?.pageId) {
          store.openPage(msg.d.profileId || store.activeProfileId, msg.d.pageId);
        }
        break;
      }

      case 'page.cycle': {
        store.cyclePage(msg.d?.direction === 'prev' ? 'prev' : 'next');
        break;
      }

      case 'state.update': {
        if (msg.d?.key !== undefined && msg.d?.value !== undefined) {
          store.updateState(msg.d.key, msg.d.value);
        }
        break;
      }

      case 'clipboard.changed': {
        if (msg.d?.text !== undefined) {
          store.setClipboard(msg.d.text, msg.d.ts || Date.now());
        }
        break;
      }

      case 'clipboard.history': {
        if (Array.isArray(msg.d?.items)) {
          store.setClipboardHistory(msg.d.items);
        }
        break;
      }

      case 'media.nowplaying': {
        if (msg.d) {
          store.setNowPlaying(msg.d);
        }
        break;
      }

      case 'config.updated': {
        if (msg.d?.config) {
          store.setWelcomeData(
            msg.d.config,
            store.activeProfileId,
            store.pinned,
            store.states,
            store.serverVersion
          );
        }
        break;
      }

      case 'error': {
        if (msg.d?.code === 'unauthorized') {
          // Token invalid; remove it
          localStorage.removeItem('opendeck_token');
        }
        break;
      }
    }
  }

  public send(payload: Record<string, unknown>): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  public sendAction(buttonId: string, value?: unknown): void {
    useDeckStore.getState().triggerHaptic();
    this.send({
      v: 1,
      t: 'action',
      d: { buttonId, value },
    });
  }

  /** Switches profile without pinning it: the automatic switching takes over again later. */
  public selectProfile(profileId: string): void {
    const store = useDeckStore.getState();
    store.triggerHaptic();
    store.setActiveProfileId(profileId);
    this.send({
      v: 1,
      t: 'profile.select',
      d: { profileId },
    });
  }

  public pinProfile(profileId: string | null): void {
    useDeckStore.getState().triggerHaptic();
    this.send({
      v: 1,
      t: 'profile.pin',
      d: { profileId },
    });
  }

  public sendReorder(profileId: string, pageId: string, buttons: any[]): void {
    useDeckStore.getState().triggerHaptic();
    this.send({
      v: 1,
      t: 'layout.reorder',
      d: { profileId, pageId, buttons },
    });
  }

  private checkTemperatureAlerts(metrics: Record<string, number>): void {
    const vibrateEnabled = localStorage.getItem('opendeck_vibrate_alerts') !== 'false';
    if (!vibrateEnabled || !('vibrate' in navigator)) return;

    const cpuTemp = metrics['cpu.temp'];
    const gpuTemp = metrics['gpu.temp'];

    if ((cpuTemp !== undefined && cpuTemp > 85) || (gpuTemp !== undefined && gpuTemp > 85)) {
      const now = Date.now();
      if (now - this.lastAlertVibration > 30000) { // 30s cooldown
        this.lastAlertVibration = now;
        try {
          navigator.vibrate([100, 50, 100, 50, 200]);
        } catch { }
      }
    }
  }

  private startPingLoop(): void {
    this.pingTimer = window.setInterval(() => {
      this.send({
        v: 1,
        t: 'ping',
        d: { ts: Date.now() },
      });
    }, 2000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.explicitClose) return;

    useDeckStore.getState().setConnectionState('reconnecting');
    const jitter = Math.random() * 300;
    const delay = Math.min(this.reconnectDelay + jitter, this.maxReconnectDelay);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, delay);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  public disconnect(): void {
    this.explicitClose = true;
    this.clearTimers();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

export const deckSocket = new DeckWebSocketClient();

// Visibility change: pause/resume telemetry
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    deckSocket.send({ v: 1, t: 'telemetry.pause', d: {} });
  } else {
    deckSocket.send({ v: 1, t: 'telemetry.resume', d: {} });
  }
});
