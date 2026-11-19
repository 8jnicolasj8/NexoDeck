import { HostConnectionStatus, NativeHostInfo, OutgoingMessage, Transport, TransportCapabilities } from './types';

/**
 * PWA transport: one host (the PC that served this page), protocol v1 over
 * wss. Pairing happens once with the code in the QR and the token is kept in
 * localStorage.
 */
export class BrowserTransport implements Transport {
  capabilities: TransportCapabilities = {
    native: false,
    haptics: true,
    wake: false,
    usb: false,
    discovery: false,
  };

  readonly hostId = 'local';

  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelay = 500;
  private readonly maxReconnectDelay = 5000;
  private explicitClose = false;
  private readonly messageHandlers: ((hostId: string, msg: any) => void)[] = [];
  private readonly statusHandlers: ((hostId: string, status: HostConnectionStatus, meta?: { transport?: 'lan' | 'usb'; latencyMs?: number }) => void)[] = [];
  private readonly hostListHandlers: ((list: NativeHostInfo[], activeId: string | null) => void)[] = [];

  connect(): void {
    this.explicitClose = false;
    this.clearReconnect();

    this.emitStatus('reconnecting');
    void this.open();
  }

  private async open(): Promise<void> {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;

    let token = localStorage.getItem('nexodeck_token');
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const queryToken = params.get('token');

    if (queryToken) {
      token = queryToken;
      localStorage.setItem('nexodeck_token', token);
      params.delete('token');
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }

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
          if (token) localStorage.setItem('nexodeck_token', token);
          params.delete('code');
          window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
        }
      } catch {
        // Pairing failed; the socket will still report the real state.
      }
    }

    const host = localStorage.getItem('nexodeck_host') || window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    try {
      this.socket = new WebSocket(`${protocol}//${host}/ws`);
      this.socket.onopen = () => {
        this.reconnectDelay = 500;
        this.emitStatus('connected');
        this.send(this.hostId, {
          v: 1,
          t: 'hello',
          d: {
            token: token || '',
            deviceName: navigator.userAgent.includes('Android') ? 'Celular Android' : 'Cliente Web',
            clientVersion: '1.0.1',
          },
        });
      };
      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          for (const handler of this.messageHandlers) handler(this.hostId, msg);
        } catch {
          // Ignore malformed frames.
        }
      };
      this.socket.onerror = () => this.scheduleReconnect();
      this.socket.onclose = () => {
        this.emitStatus('offline');
        this.clearReconnect();
        if (!this.explicitClose) this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  send(hostId: string, msg: OutgoingMessage): void {
    if (hostId !== this.hostId) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  switchHost(): void {
    // The PWA controls exactly one PC; each PC is its own origin.
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

  wake(): void {
    // Not possible from a browser: UDP broadcast needs native code.
  }

  openAddHost(): void {
    // Single-host mode.
  }

  disconnect(): void {
    this.explicitClose = true;
    this.clearReconnect();
    this.socket?.close();
    this.socket = null;
  }

  private emitStatus(status: HostConnectionStatus, meta?: { transport?: 'lan' | 'usb'; latencyMs?: number }): void {
    for (const handler of this.statusHandlers) handler(this.hostId, status, meta);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.explicitClose) return;
    this.emitStatus('reconnecting');
    const delay = Math.min(this.reconnectDelay + Math.random() * 300, this.maxReconnectDelay);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      void this.open();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
