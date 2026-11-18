export type OutgoingMessage = Record<string, unknown>;

export type HostConnectionStatus = 'connected' | 'reconnecting' | 'offline' | 'unverified';

export type TransportKind = 'lan' | 'usb';

export interface TransportCapabilities {
  native: boolean;
  haptics: boolean;
  wake: boolean;
  usb: boolean;
  discovery: boolean;
}

export interface NativeHostInfo {
  id: string;
  name: string;
  color: string;
  icon?: string;
  status: HostConnectionStatus;
  transport: TransportKind;
  latencyMs?: number;
  mac?: string | null;
  addresses?: string[];
}

/**
 * Everything network-related goes through this interface. The browser
 * implementation owns the single WebSocket of the PWA; the native one only
 * forwards JSON to the Android shell.
 */
export interface Transport {
  capabilities: TransportCapabilities;
  connect(): void;
  disconnect(): void;
  send(hostId: string, msg: OutgoingMessage): void;
  switchHost(hostId: string): void;
  onMessage(cb: (hostId: string, msg: any) => void): void;
  onHostStatus(cb: (hostId: string, status: HostConnectionStatus, meta?: { transport?: TransportKind; latencyMs?: number }) => void): void;
  onHostList(cb: (list: NativeHostInfo[], activeId: string | null) => void): void;
  wake(hostId: string): void;
  openAddHost(): void;
}
