import { useDeckStore } from '../store/useDeckStore';
import { AlertConfig, MetricId } from '../../shared/types';
import { createTransport, HostConnectionStatus, Transport } from '../../shared/transport';

const DEFAULT_ALERTS: AlertConfig[] = [
  { id: 'default-cpu', metric: 'cpu.temp', op: '>', value: 85 },
  { id: 'default-gpu', metric: 'gpu.temp', op: '>', value: 85 },
];

const METRIC_LABELS: Partial<Record<MetricId, string>> = {
  'cpu.temp': 'CPU',
  'gpu.temp': 'GPU',
  'ram.used': 'RAM',
};

/**
 * Single entry point for the UI. All networking happens in the active
 * transport: the browser keeps one WebSocket to this PC, the Android shell
 * keeps up to five connections and routes messages through the bridge.
 */
class DeckClient {
  private readonly transport: Transport = createTransport();
  private localHostId = 'local';
  private currentHostId = 'local';
  private pingTimer: number | null = null;
  private lastAlertVibration = 0;

  constructor() {
    this.transport.onMessage((hostId, msg) => this.handleMessage(hostId, msg));
    this.transport.onHostStatus((hostId, status, meta) => this.handleStatus(hostId, status, meta));
    this.transport.onHostList((list, activeId) => {
      useDeckStore.getState().upsertHosts(list, activeId);
    });
  }

  public connect(): void {
    const store = useDeckStore.getState();
    store.setNativeMode(this.transport.capabilities.native);
    this.transport.connect();
    this.startPingLoop();
  }

  public disconnect(): void {
    this.stopPingLoop();
    this.transport.disconnect();
  }

  private resolveHost(transportHostId: string): string {
    return transportHostId === 'local' ? this.localHostId : transportHostId;
  }

  private handleStatus(hostId: string, status: HostConnectionStatus, meta?: { transport?: 'lan' | 'usb'; latencyMs?: number }): void {
    useDeckStore.getState().setHostConnection(this.resolveHost(hostId), status, meta);
  }

  private handleMessage(transportHostId: string, msg: { t: string; d?: any }): void {
    const store = useDeckStore.getState();
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'welcome') {
      const payload = msg.d || {};
      if (payload.serverId) this.localHostId = payload.serverId;
      const hostId = payload.serverId || this.resolveHost(transportHostId);
      if (store.activeHostId === 'local' && !store.hosts[hostId]) {
        // First host of the PWA: adopt its serverId before applying the snapshot.
        useDeckStore.setState({ activeHostId: hostId });
      }
      this.currentHostId = hostId;
      store.applyWelcome(hostId, payload);
      return;
    }

    const hostId = this.resolveHost(transportHostId);

    switch (msg.t) {
      case 'pong': {
        if (msg.d?.ts) {
          const latency = Math.max(0, Date.now() - msg.d.ts);
          store.setHostPing(hostId, latency);
        }
        break;
      }

      case 'telemetry': {
        if (msg.d?.m) {
          store.setHostTelemetry(hostId, msg.d.m);
          this.checkAlerts(hostId, msg.d.m);
        }
        break;
      }

      case 'profile.changed': {
        if (hostId === store.activeHostId && msg.d?.profileId) {
          store.setActiveProfileId(msg.d.profileId);
          store.setPinned(!!msg.d.pinned);
        }
        break;
      }

      case 'page.open': {
        if (hostId === store.activeHostId && msg.d?.pageId) {
          store.openPage(msg.d.profileId || store.activeProfileId, msg.d.pageId);
        }
        break;
      }

      case 'page.cycle': {
        if (hostId === store.activeHostId) store.cyclePage(msg.d?.direction === 'prev' ? 'prev' : 'next');
        break;
      }

      case 'state.update': {
        if (msg.d?.key !== undefined && msg.d?.value !== undefined) {
          store.setHostState(hostId, msg.d.key, msg.d.value);
        }
        break;
      }

      case 'clipboard.changed': {
        if (msg.d?.text !== undefined) {
          store.setHostClipboard(hostId, msg.d.text, msg.d.ts || Date.now());
        }
        break;
      }

      case 'clipboard.history': {
        if (Array.isArray(msg.d?.items)) store.setHostClipboardHistory(hostId, msg.d.items);
        break;
      }

      case 'media.nowplaying': {
        if (msg.d) store.setHostNowPlaying(hostId, msg.d);
        break;
      }

      case 'config.updated': {
        if (msg.d?.config) {
          store.applyConfigUpdate(hostId, msg.d.config, msg.d.configRevision);
        }
        break;
      }

      case 'error': {
        if (msg.d?.code === 'unauthorized') {
          localStorage.removeItem('vexadeck_token');
          store.setHostConnection(hostId, 'unverified');
        }
        if (msg.d?.code === 'action_failed' && msg.d?.message) {
          // Power and device actions fail silently otherwise.
          window.alert(msg.d.message);
        }
        break;
      }
    }
  }

  public send(payload: Record<string, unknown>): void {
    // Always talk to the PC the user is looking at. With several hosts the
    // last welcome could leave currentHostId pointing at another machine.
    // The PWA transport only answers to its own id ('local'); after the
    // welcome the store's activeHostId is the PC's serverId, so sending there
    // made the browser drop every outgoing message (the deck was dead).
    if (!this.transport.capabilities.native) {
      this.transport.send('local', payload);
      return;
    }
    const activeHostId = useDeckStore.getState().activeHostId;
    this.transport.send(activeHostId === 'local' ? this.currentHostId : activeHostId, payload);
  }

  public sendAction(buttonId: string, value?: unknown): void {
    const store = useDeckStore.getState();
    if (!store.canAcceptInput()) return;
    store.triggerHaptic();
    this.send({ v: 1, t: 'action', d: { buttonId, value } });
  }

  public selectProfile(profileId: string): void {
    const store = useDeckStore.getState();
    store.triggerHaptic();
    store.setActiveProfileId(profileId);
    this.send({ v: 1, t: 'profile.select', d: { profileId } });
  }

  /** Adds or removes an optional built-in profile (Spotify, Gamer). */
  public setBuiltInProfile(profileId: string, enabled: boolean): void {
    useDeckStore.getState().triggerHaptic();
    this.send({ v: 1, t: 'profile.builtIn', d: { profileId, enabled } });
  }

  public pinProfile(profileId: string | null): void {
    useDeckStore.getState().triggerHaptic();
    this.send({ v: 1, t: 'profile.pin', d: { profileId } });
  }

  public sendReorder(profileId: string, pageId: string, buttons: unknown[]): void {
    useDeckStore.getState().triggerHaptic();
    this.send({ v: 1, t: 'layout.reorder', d: { profileId, pageId, buttons } });
  }

  public switchHost(hostId: string): void {
    const store = useDeckStore.getState();
    if (hostId === store.activeHostId) return;
    if (store.hosts[store.activeHostId]) {
      this.transport.send(store.activeHostId, { v: 2, t: 'view', d: { active: false } });
    }
    this.currentHostId = hostId;
    this.transport.switchHost(hostId);
    store.switchHost(hostId);
    this.transport.send(hostId, { v: 2, t: 'view', d: { active: true } });
    this.transport.send(hostId, { v: 2, t: 'resync', d: {} });
  }

  public wakeHost(hostId: string): void {
    this.transport.wake(hostId);
  }

  public openAddHost(): void {
    this.transport.openAddHost();
  }

  public getCapabilities() {
    return this.transport.capabilities;
  }

  private checkAlerts(hostId: string, metrics: Record<string, number>): void {
    const store = useDeckStore.getState();
    const host = store.hosts[hostId];
    const alerts = host?.config?.alerts?.length ? host.config.alerts : DEFAULT_ALERTS;

    for (const alert of alerts) {
      const value = metrics[alert.metric];
      if (value === undefined) continue;
      const hit = alert.op === '>' ? value > alert.value : value < alert.value;
      if (!hit) continue;
      const label = METRIC_LABELS[alert.metric] || alert.metric;
      store.pushHostAlert(hostId, `⚠ ${label} ${Math.round(value)} °C en ${host?.pcName || 'la PC'}`);
      if (alert.vibrate === false) continue;
      const now = Date.now();
      if (now - this.lastAlertVibration > 30000) {
        this.lastAlertVibration = now;
        try { navigator.vibrate([200, 100, 200]); } catch { }
      }
    }
  }

  private startPingLoop(): void {
    if (this.pingTimer !== null) return;
    this.pingTimer = window.setInterval(() => {
      this.send({ v: 1, t: 'ping', d: { ts: Date.now() } });
    }, 2000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

export const deckSocket = new DeckClient();

document.addEventListener('visibilitychange', () => {
  const store = useDeckStore.getState();
  const hostId = store.activeHostId;
  if (document.hidden) {
    deckSocket.send(store.nativeMode ? { v: 2, t: 'view', d: { active: false } } : { v: 1, t: 'telemetry.pause', d: {} });
  } else {
    deckSocket.send(store.nativeMode ? { v: 2, t: 'view', d: { active: true } } : { v: 1, t: 'telemetry.resume', d: {} });
    if (store.nativeMode) deckSocket.send({ v: 2, t: 'resync', d: {} });
  }
  void hostId;
});
