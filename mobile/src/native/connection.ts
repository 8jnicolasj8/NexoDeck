import { fetchIdent, findHostByMdns } from './discovery';
import { authProof, deriveDeviceKey, deriveSessionKey, PairLink, pairProof, randomNonce, SignedChannel } from './protocol';
import {
  deleteDeviceKey,
  getPreferUsb,
  loadDeviceId,
  loadDeviceKey,
  loadHosts,
  saveDeviceKey,
  saveHosts,
  setPreferUsb,
} from './storage';
import { HostStatus, HostStatusUpdate, SavedHost, TransportKind } from './types';
import { wakeOnLan } from './wake';

const MAX_SESSIONS = 5;
const SOCKET_OPEN = 1;

interface Link {
  hostId: string;
  socket: WebSocket | null;
  outbound: SignedChannel | null;
  status: HostStatus;
  transport: TransportKind;
  latencyMs: number;
  reconnectDelay: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  connecting: boolean;
}

interface Session {
  socket: WebSocket;
  inbound: SignedChannel;
  outbound: SignedChannel;
  welcome: any;
}

type MessageListener = (hostId: string, message: any) => void;
type StatusListener = (update: HostStatusUpdate) => void;
type HostsListener = (hosts: SavedHost[]) => void;

const deviceLabel = (): string => 'App Android';

/**
 * Keeps one signed v2 connection per paired PC (up to five at once). UDP
 * broadcasts for wake-on-LAN and the transport for USB live in the Kotlin
 * module; this class only decides which address to use and keeps the session
 * alive.
 */
export class ConnectionManager {
  private readonly hosts = new Map<string, SavedHost>();
  private readonly keys = new Map<string, Uint8Array>();
  private readonly links = new Map<string, Link>();
  private activeId: string | null = null;
  private preferUsb = true;
  private deviceId = '';

  private readonly messageListeners: MessageListener[] = [];
  private readonly statusListeners: StatusListener[] = [];
  private readonly hostsListeners: HostsListener[] = [];

  async init(): Promise<void> {
    this.deviceId = await loadDeviceId();
    this.preferUsb = await getPreferUsb();
    const saved = await loadHosts();
    for (const host of saved) {
      this.hosts.set(host.id, host);
      const key = await loadDeviceKey(host.id);
      if (key) this.keys.set(host.id, key);
    }
    this.activeId = saved[0]?.id ?? null;
    this.emitHosts();
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.push(listener);
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index >= 0) this.messageListeners.splice(index, 1);
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.push(listener);
    return () => {
      const index = this.statusListeners.indexOf(listener);
      if (index >= 0) this.statusListeners.splice(index, 1);
    };
  }

  onHosts(listener: HostsListener): () => void {
    this.hostsListeners.push(listener);
    return () => {
      const index = this.hostsListeners.indexOf(listener);
      if (index >= 0) this.hostsListeners.splice(index, 1);
    };
  }

  getHosts(): SavedHost[] { return [...this.hosts.values()]; }
  getActiveId(): string | null { return this.activeId; }
  getStatus(hostId: string): HostStatus { return this.links.get(hostId)?.status ?? 'offline'; }
  isPreferredUsb(): boolean { return this.preferUsb; }

  async setPreferUsb(value: boolean): Promise<void> {
    this.preferUsb = value;
    await setPreferUsb(value);
  }

  /** Connects up to five paired PCs; the rest stay offline until selected. */
  connectAll(): void {
    const hosts = this.getHosts().slice(0, MAX_SESSIONS);
    for (const host of hosts) {
      if (this.keys.has(host.id)) void this.connect(host.id);
    }
  }

  async connect(hostId: string): Promise<void> {
    const host = this.hosts.get(hostId);
    if (!host) return;
    await this.ensureDeviceId();
    const link = this.ensureLink(hostId);
    if (link.connecting) return;
    if (link.socket && link.status === 'connected') return;

    link.connecting = true;
    link.status = 'reconnecting';
    this.emitStatus(link);

    try {
      const endpoint = await this.chooseEndpoint(host);
      if (!endpoint) throw new Error('no endpoint');
      const session = await this.openSession(host, endpoint.address, endpoint.transport);
      // The host may have been forgotten while the handshake was running.
      if (this.links.get(hostId) !== link || !this.hosts.has(hostId)) {
        try { session.socket.close(); } catch { }
        return;
      }
      host.lastAddress = endpoint.address;
      await saveHosts(this.getHosts());
      this.attach(host, session, endpoint.transport);
      this.send(hostId, { v: 2, t: 'view', d: { active: hostId === this.activeId } });
      if (hostId === this.activeId) this.send(hostId, { v: 2, t: 'resync', d: {} });
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      link.status = reason === 'unverified' ? 'unverified' : 'offline';
      this.emitStatus(link);
      this.scheduleReconnect(hostId);
    } finally {
      link.connecting = false;
    }
  }

  /** Pairs with the secret that came in the QR (or through the USB cable). */
  async pair(link: PairLink): Promise<SavedHost> {
    await this.ensureDeviceId();
    if (link.expiresAt && link.expiresAt * 1000 < Date.now() - 60_000) {
      throw new Error('El código QR venció. Generá uno nuevo en la PC.');
    }

    const host: SavedHost = {
      id: link.serverId,
      name: link.name || 'PC',
      color: link.color || '#00FF9C',
      icon: 'monitor',
      mac: link.mac ?? null,
      addresses: [...new Set(link.addresses)],
      port: link.port || 47801,
    };
    this.hosts.set(host.id, host);

    let session: Session | null = null;
    let usedAddress = '';
    let usedTransport: TransportKind = 'lan';

    for (const address of host.addresses) {
      const transport: TransportKind = address === '127.0.0.1' ? 'usb' : 'lan';
      try {
        session = await this.openSession(host, address, transport, link.secret);
        usedAddress = address;
        usedTransport = transport;
        break;
      } catch {
        // Try the next address.
      }
    }

    if (!session) {
      this.hosts.delete(host.id);
      throw new Error('No se pudo emparejar. Verificá que la PC y el celular estén en la misma red.');
    }

    host.lastAddress = usedAddress;
    await saveHosts(this.getHosts());
    this.activeId = host.id;
    this.attach(host, session, usedTransport);
    this.send(host.id, { v: 2, t: 'view', d: { active: true } });
    this.emitHosts();
    return host;
  }

  setActive(hostId: string): void {
    if (!this.hosts.has(hostId)) return;
    if (this.activeId && this.activeId !== hostId) {
      this.send(this.activeId, { v: 2, t: 'view', d: { active: false } });
    }
    this.activeId = hostId;
    this.send(hostId, { v: 2, t: 'view', d: { active: true } });
    this.send(hostId, { v: 2, t: 'resync', d: {} });
    const link = this.links.get(hostId);
    if (link) this.emitStatus(link);
    this.emitHosts();
  }

  async forget(hostId: string): Promise<void> {
    this.closeLink(hostId);
    this.hosts.delete(hostId);
    this.keys.delete(hostId);
    await deleteDeviceKey(hostId);
    await saveHosts(this.getHosts());
    if (this.activeId === hostId) this.activeId = this.getHosts()[0]?.id ?? null;
    this.emitHosts();
  }

  send(hostId: string, message: Record<string, unknown>): void {
    const link = this.links.get(hostId);
    if (!link?.socket || link.socket.readyState !== SOCKET_OPEN) return;
    try {
      const payload = JSON.stringify(message);
      link.socket.send(link.outbound ? link.outbound.wrap(payload) : payload);
    } catch {
      // A failed send is handled by the socket close event.
    }
  }

  async wake(hostId: string): Promise<boolean> {
    const host = this.hosts.get(hostId);
    return wakeOnLan(host?.mac ?? null, 9);
  }

  /** Called when connectivity changes: reconnect everything immediately. */
  handleNetworkChange(): void {
    for (const link of this.links.values()) {
      if (link.connecting || (link.socket && link.status === 'connected')) continue;
      if (link.reconnectTimer) clearTimeout(link.reconnectTimer);
      link.reconnectTimer = null;
      link.reconnectDelay = 500;
      void this.connect(link.hostId);
    }
  }

  /** Background for more than 60 s: drop sockets to save battery. */
  shutdown(): void {
    for (const link of this.links.values()) {
      if (link.reconnectTimer) clearTimeout(link.reconnectTimer);
      if (link.pingTimer) clearInterval(link.pingTimer);
      link.reconnectTimer = null;
      link.pingTimer = null;
      // Detach first so the close event does not schedule a reconnect.
      const socket = link.socket;
      link.socket = null;
      link.outbound = null;
      link.status = 'offline';
      try { socket?.close(); } catch { }
    }
  }

  // --- internals ---

  private ensureLink(hostId: string): Link {
    const existing = this.links.get(hostId);
    if (existing) return existing;
    const link: Link = {
      hostId,
      socket: null,
      outbound: null,
      status: 'offline',
      transport: 'lan',
      latencyMs: 0,
      reconnectDelay: 500,
      reconnectTimer: null,
      pingTimer: null,
      connecting: false,
    };
    this.links.set(hostId, link);
    return link;
  }

  private attach(host: SavedHost, session: Session, transport: TransportKind): void {
    const link = this.ensureLink(host.id);
    const previous = link.socket;
    if (link.pingTimer) clearInterval(link.pingTimer);
    if (link.reconnectTimer) clearTimeout(link.reconnectTimer);
    link.reconnectTimer = null;
    link.socket = session.socket;
    link.outbound = session.outbound;
    link.transport = transport;
    link.status = 'connected';
    link.reconnectDelay = 500;

    session.socket.onmessage = (event: any) => {
      if (link.socket !== session.socket) return;
      let envelope: unknown;
      try { envelope = JSON.parse(String(event.data)); } catch { return; }
      const payload = session.inbound.unwrap(envelope);
      if (payload === null) {
        // Any bad MAC, repeated or skipped counter closes the connection.
        link.status = 'unverified';
        this.emitStatus(link);
        try { session.socket.close(); } catch { }
        return;
      }
      let message: any;
      try { message = JSON.parse(payload); } catch { return; }
      if (message?.t === 'pong' && typeof message.d?.ts === 'number') {
        link.latencyMs = Math.max(0, Date.now() - message.d.ts);
        this.emitStatus(link);
      }
      for (const listener of this.messageListeners) listener(host.id, message);
    };

    session.socket.onclose = () => {
      // A replaced socket must not mark the current link offline.
      if (link.socket !== session.socket) return;
      if (link.pingTimer) {
        clearInterval(link.pingTimer);
        link.pingTimer = null;
      }
      link.socket = null;
      link.outbound = null;
      link.status = 'offline';
      this.emitStatus(link);
      this.scheduleReconnect(host.id);
    };

    link.pingTimer = setInterval(() => {
      this.send(host.id, { v: 2, t: 'ping', d: { ts: Date.now() } });
    }, 2000);

    if (previous && previous !== session.socket) {
      try { previous.close(); } catch { }
    }

    // The welcome consumed during the handshake must reach the WebView too.
    for (const listener of this.messageListeners) listener(host.id, { t: 'welcome', d: session.welcome });
    this.emitStatus(link);
  }

  private async ensureDeviceId(): Promise<void> {
    if (!this.deviceId) this.deviceId = await loadDeviceId();
  }

  private scheduleReconnect(hostId: string): void {
    const link = this.links.get(hostId);
    if (!link || link.reconnectTimer) return;
    const delay = Math.min(link.reconnectDelay, 5000) + Math.random() * 250;
    link.reconnectDelay = Math.min(link.reconnectDelay * 2, 5000);
    link.reconnectTimer = setTimeout(() => {
      link.reconnectTimer = null;
      void this.connect(hostId);
    }, delay);
  }

  private closeLink(hostId: string): void {
    const link = this.links.get(hostId);
    if (!link) return;
    if (link.reconnectTimer) clearTimeout(link.reconnectTimer);
    if (link.pingTimer) clearInterval(link.pingTimer);
    const socket = link.socket;
    link.socket = null;
    link.outbound = null;
    link.status = 'offline';
    this.links.delete(hostId);
    try { socket?.close(); } catch { }
  }

  private async chooseEndpoint(host: SavedHost): Promise<{ address: string; transport: TransportKind } | null> {
    const candidates: { address: string; transport: TransportKind }[] = [];
    const seen = new Set<string>();
    const push = (address: string | undefined, transport: TransportKind) => {
      if (!address || seen.has(address)) return;
      if (address === '127.0.0.1' && !this.preferUsb) return;
      seen.add(address);
      candidates.push({ address, transport });
    };

    if (this.preferUsb) push('127.0.0.1', 'usb');
    push(host.lastAddress, host.lastAddress === '127.0.0.1' ? 'usb' : 'lan');
    for (const address of host.addresses) push(address, address === '127.0.0.1' ? 'usb' : 'lan');

    const probes = await Promise.all(
      candidates.map((candidate) =>
        fetchIdent(candidate.address, host.port)
          .then((ident) => (ident && ident.serverId === host.id ? candidate : null))
          .catch(() => null)
      )
    );

    const found = probes.find((candidate) => candidate !== null);
    if (found) return found;

    // Last resort: ask mDNS where this serverId lives now.
    const address = await findHostByMdns(host.id);
    return address ? { address, transport: 'lan' } : null;
  }

  private openSession(host: SavedHost, address: string, transport: TransportKind, secret?: string): Promise<Session> {
    return new Promise<Session>((resolve, reject) => {
      const socket = new WebSocket(`ws://${address}:${host.port}/ws2`);
      let nonceC = randomNonce();
      let nonceS = '';
      let deviceKey: Uint8Array | null = null;
      let inbound: SignedChannel | null = null;
      let outbound: SignedChannel | null = null;
      let stage: 'pair' | 'hello' | 'welcome' = secret ? 'pair' : 'hello';
      let settled = false;

      const finish = (error?: Error, session?: Session) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          try { socket.close(); } catch { }
          reject(error);
          return;
        }
        resolve(session as Session);
      };

      const timer = setTimeout(() => finish(new Error('timeout')), 10_000);
      socket.onerror = () => finish(new Error('socket error'));
      socket.onclose = () => finish(new Error('closed'));
      socket.onopen = () => {
        if (secret) {
          socket.send(JSON.stringify({
            v: 2,
            t: 'pair2',
            d: {
              deviceId: this.deviceId,
              deviceName: deviceLabel(),
              nonceC,
              proof: pairProof(secret, host.id, this.deviceId, nonceC),
            },
          }));
        } else {
          socket.send(JSON.stringify({ v: 2, t: 'hello2', d: { deviceId: this.deviceId, nonceC } }));
        }
      };

      socket.onmessage = async (event: any) => {
        let message: any;
        try { message = JSON.parse(String(event.data)); } catch { return; }

        if (stage === 'pair') {
          if (message.t === 'pair2err') return finish(new Error(message.d?.code || 'pair failed'));
          if (message.t !== 'pair2ok' || !message.d?.nonceS) return finish(new Error('bad pair'));
          deviceKey = deriveDeviceKey(secret!, this.deviceId, host.id, nonceC, message.d.nonceS);
          await saveDeviceKey(host.id, deviceKey);
          this.keys.set(host.id, deviceKey);
          stage = 'hello';
          nonceC = randomNonce();
          socket.send(JSON.stringify({ v: 2, t: 'hello2', d: { deviceId: this.deviceId, nonceC } }));
          return;
        }

        if (stage === 'hello') {
          if (message.t === 'error') return finish(new Error(message.d?.code || 'unauthorized'));
          if (message.t !== 'challenge' || !message.d?.nonceS) return finish(new Error('bad challenge'));
          if (message.d.serverId !== host.id) return finish(new Error('server mismatch'));
          deviceKey = deviceKey ?? (await loadDeviceKey(host.id));
          if (!deviceKey) return finish(new Error('missing key'));
          nonceS = message.d.nonceS;
          const sessionKey = deriveSessionKey(deviceKey, host.id, nonceS, nonceC);
          // The server signs s2c and expects c2s: one channel per direction.
          inbound = new SignedChannel(sessionKey, 's2c');
          outbound = new SignedChannel(sessionKey, 'c2s');
          socket.send(JSON.stringify({
            v: 2,
            t: 'auth',
            d: { proof: authProof(deviceKey, host.id, nonceS, nonceC) },
          }));
          stage = 'welcome';
          return;
        }

        if (stage === 'welcome') {
          const payload = inbound?.unwrap(message) ?? null;
          if (!payload) return finish(new Error('unverified'));
          let welcome: any;
          try { welcome = JSON.parse(payload); } catch { return finish(new Error('bad welcome')); }
          if (welcome.t !== 'welcome') return finish(new Error('bad welcome'));
          finish(undefined, { socket, inbound: inbound!, outbound: outbound!, welcome: welcome.d });
        }
      };
    });
  }

  private emitStatus(link: Link): void {
    const update: HostStatusUpdate = {
      host: link.hostId,
      status: link.status,
      transport: link.transport,
      latencyMs: link.latencyMs,
    };
    for (const listener of this.statusListeners) listener(update);
  }

  private emitHosts(): void {
    const hosts = this.getHosts();
    for (const listener of this.hostsListeners) listener(hosts);
  }
}

export const connections = new ConnectionManager();
