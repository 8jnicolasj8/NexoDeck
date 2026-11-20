import { HostConnectionStatus, NativeHostInfo, OutgoingMessage, Transport, TransportCapabilities } from './types';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
    webkit?: { messageHandlers?: { vexadeck?: { postMessage: (data: unknown) => void } } };
    __vexadeckReceive?: (json: string) => void;
  }
}

/**
 * Native transport: the Kotlin shell owns sockets, pairing, USB and discovery.
 * This class only serializes messages to the bridge and distributes what the
 * shell sends back. It never opens a WebSocket.
 */
export class NativeTransport implements Transport {
  capabilities: TransportCapabilities = {
    native: true,
    haptics: true,
    wake: true,
    usb: true,
    discovery: true,
  };

  private readonly messageHandlers: ((hostId: string, msg: any) => void)[] = [];
  private readonly statusHandlers: ((hostId: string, status: HostConnectionStatus, meta?: { transport?: 'lan' | 'usb'; latencyMs?: number }) => void)[] = [];
  private readonly hostListHandlers: ((list: NativeHostInfo[], activeId: string | null) => void)[] = [];

  constructor() {
    document.addEventListener('vexadeck:native', (event) => this.handle((event as CustomEvent).detail));
    window.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && typeof data === 'object' && 'k' in data) this.handle(data);
      } catch {
        // Not a bridge message.
      }
    });
    window.__vexadeckReceive = (json: string) => {
      try { this.handle(JSON.parse(json)); } catch { }
    };
  }

  connect(): void {
    this.post({ k: 'ready' });
    this.post({ k: 'hosts.request' });
  }

  disconnect(): void {
    // The native shell keeps connections alive while the app is open.
  }

  send(hostId: string, msg: OutgoingMessage): void {
    this.post({ k: 'tx', host: hostId, msg });
  }

  switchHost(hostId: string): void {
    this.post({ k: 'switchHost', host: hostId });
  }

  onMessage(cb: (hostId: string, msg: any) => void): void {
    this.messageHandlers.push(cb);
  }

  onHostStatus(cb: (hostId: string, status: HostConnectionStatus, meta?: { transport?: 'lan' | 'usb'; latencyMs?: number }) => void): void {
    this.statusHandlers.push(cb);
  }

  onHostList(cb: (list: NativeHostInfo[], activeId: string | null) => void): void {
    this.hostListHandlers.push(cb);
  }

  wake(hostId: string): void {
    this.post({ k: 'wake', host: hostId });
  }

  openAddHost(): void {
    this.post({ k: 'openAddHost' });
  }

  private post(message: Record<string, unknown>): void {
    const json = JSON.stringify(message);
    try {
      window.ReactNativeWebView?.postMessage(json);
      window.webkit?.messageHandlers?.vexadeck?.postMessage(message);
    } catch {
      // Bridge unavailable: the mock keeps the UI usable during development.
    }
  }

  private handle(data: any): void {
    if (!data || typeof data !== 'object') return;
    switch (data.k) {
      case 'rx':
        for (const handler of this.messageHandlers) handler(data.host, data.msg);
        break;
      case 'hostStatus':
        for (const handler of this.statusHandlers) handler(data.host, data.status, { transport: data.transport, latencyMs: data.latencyMs });
        break;
      case 'hosts':
        for (const handler of this.hostListHandlers) handler(data.list || [], data.activeId ?? null);
        break;
      case 'native':
        this.capabilities = { ...this.capabilities, ...(data.caps || {}) };
        break;
      case 'clipboard.value':
        // The clipboard view reads it back through a request/response store field.
        window.dispatchEvent(new CustomEvent('vexadeck:clipboard', { detail: data.text }));
        break;
    }
  }
}
