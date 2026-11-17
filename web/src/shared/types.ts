export type MetricId =
  | 'cpu.load'
  | 'cpu.temp'
  | 'gpu.load'
  | 'gpu.temp'
  | 'gpu.vram'
  | 'ram.used'
  | 'ram.used_gb'
  | 'ram.total_gb'
  | 'disk.usage'
  | 'net.down'
  | 'net.up'
  | 'ping.app'
  | 'ping.internet';

export interface TelemetrySlotConfig {
  id: string; // 'L1' | 'L2' | 'R1' | 'R2'
  widget: 'single' | 'dual';
  primary: MetricId;
  secondary?: MetricId;
}

export interface TelemetryConfig {
  slots: {
    left: TelemetrySlotConfig[];
    right: TelemetrySlotConfig[];
  };
}

export interface IconConfig {
  kind: 'lucide' | 'exe' | 'image';
  value: string;
}

export interface PositionConfig {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
}

export interface ActionConfig {
  kind: string;
  params?: Record<string, unknown>;
}

export interface ButtonConfig {
  id: string;
  type: 'action' | 'toggle' | 'slider' | 'folder' | 'widget';
  label: string;
  icon: IconConfig;
  pos: PositionConfig;
  action?: ActionConfig;
  stateBinding?: string;
  folderPageId?: string;
}

export interface PageConfig {
  id: string;
  name: string;
  buttons: ButtonConfig[];
}

export interface GridConfig {
  cols: number;
  rows: number;
}

export interface ProfileConfig {
  id: string;
  name: string;
  accent: string;
  grid: GridConfig;
  gridPortrait?: GridConfig;
  pages: PageConfig[];
  match?: {
    processes: string[];
  };
}

export interface ServerConfig {
  httpPort: number;
  httpsPort: number;
  telemetryIntervalMs: number;
}

export interface DeviceConfig {
  id: string;
  name: string;
  createdAt: string;
  lastSeen?: string;
}

export interface AlertConfig {
  id: string;
  metric: MetricId;
  op: '>' | '<';
  value: number;
  vibrate?: boolean;
  cooldownSec?: number;
}

export interface AppConfig {
  version: number;
  server: ServerConfig;
  devices: DeviceConfig[];
  defaultProfileId: string;
  profiles: ProfileConfig[];
  telemetry: TelemetryConfig;
  alerts: AlertConfig[];
  scripts: { id: string; name: string; file: string }[];
}

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';

export type ActiveTab = 'deck' | 'utils' | 'profiles' | 'settings';

export interface NowPlayingInfo {
  title: string;
  artist: string;
  playing: boolean;
  artUrl?: string | null;
  app: string;
}

export interface ClipboardEntry {
  text: string;
  ts: number;
}
