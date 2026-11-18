export type HostStatus = 'connected' | 'reconnecting' | 'offline' | 'unverified';
export type TransportKind = 'lan' | 'usb';

export interface SavedHost {
  id: string;
  name: string;
  color: string;
  icon: string;
  mac?: string | null;
  addresses: string[];
  port: number;
  lastAddress?: string;
}

export interface HostStatusUpdate {
  host: string;
  status: HostStatus;
  transport: TransportKind;
  latencyMs: number;
}

export interface WelcomePayload {
  config: unknown;
  activeProfileId?: string;
  pinned?: boolean;
  states?: Record<string, boolean | number | string>;
  serverVersion?: string;
  serverId?: string;
  pcName?: string;
  pcColor?: string;
  pcIcon?: string;
  configRevision?: number;
  clipboard?: string;
  nowPlaying?: unknown;
}

export interface NativeMessage {
  k: string;
  [key: string]: unknown;
}

export interface RuntimeHost {
  id: string;
  name: string;
  color: string;
  icon?: string;
  status: HostStatus;
  transport: TransportKind;
  latencyMs?: number;
  mac?: string | null;
  addresses?: string[];
}
