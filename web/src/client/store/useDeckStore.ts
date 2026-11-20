import { create } from 'zustand';
import { AppConfig, ConnectionState, MetricId, ProfileConfig, ActiveTab, NowPlayingInfo, ClipboardEntry } from '../../shared/types';
import { HostConnectionStatus, NativeHostInfo } from '../../shared/transport/types';

/**
 * Everything that belongs to one PC. The UI always reads the active host,
 * which is why the top-level fields are kept in sync when switching.
 */
export interface HostSnapshot {
  serverId: string;
  pcName: string;
  pcColor: string;
  pcIcon: string;
  status: HostConnectionStatus;
  transport: 'lan' | 'usb';
  latencyMs: number;
  config: AppConfig | null;
  configRevision: number;
  activeProfileId: string;
  activePageId: string;
  pinned: boolean;
  states: Record<string, boolean | number | string>;
  telemetry: Partial<Record<MetricId, number>>;
  nowPlaying: NowPlayingInfo | null;
  clipboardLast: string;
  clipboardHistory: ClipboardEntry[];
  alerts: string[];
  mac?: string | null;
  serverVersion: string;
}

export const createEmptyHost = (id: string, name = 'PC', color = '#00FF9C'): HostSnapshot => ({
  serverId: id,
  pcName: name,
  pcColor: color,
  pcIcon: 'monitor',
  status: 'offline',
  transport: 'lan',
  latencyMs: 0,
  config: null,
  configRevision: 0,
  activeProfileId: 'global',
  activePageId: 'p1',
  pinned: false,
  states: {},
  telemetry: {},
  nowPlaying: null,
  clipboardLast: '',
  clipboardHistory: [],
  alerts: [],
  mac: null,
  serverVersion: '',
});

function normalizeConfig(rawConfig: any): AppConfig | null {
  if (!rawConfig) return null;
  const rawProfiles = rawConfig.profiles || rawConfig.Profiles || [];
  const profiles = rawProfiles.map((p: any) => ({
    ...p,
    id: p.id || p.Id,
    name: p.name || p.Name,
    accent: p.accent || p.Accent || '#00FF9C',
    grid: p.grid || p.Grid || { cols: 4, rows: 3 },
    gridPortrait: p.gridPortrait || p.GridPortrait || { cols: 3, rows: 4 },
    match: p.match || p.Match,
    pages: (p.pages || p.Pages || []).map((pg: any) => ({
      ...pg,
      id: pg.id || pg.Id,
      name: pg.name || pg.Name,
      buttons: (pg.buttons || pg.Buttons || []).map((b: any) => ({
        ...b,
        id: b.id || b.Id,
        type: b.type || b.Type,
        label: b.label || b.Label,
        icon: b.icon || b.Icon,
        pos: b.pos || b.Pos || { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
        action: b.action || b.Action,
        stateBinding: b.stateBinding !== undefined ? b.stateBinding : b.StateBinding,
        folderPageId: b.folderPageId !== undefined ? b.folderPageId : b.FolderPageId,
      })),
    })),
  }));

  return {
    ...rawConfig,
    profiles,
    defaultProfileId: rawConfig.defaultProfileId || rawConfig.DefaultProfileId || 'global',
    telemetry: rawConfig.telemetry || rawConfig.Telemetry,
    alerts: rawConfig.alerts || rawConfig.Alerts || [],
    scripts: rawConfig.scripts || rawConfig.Scripts || [],
  };
}

interface DeckState {
  connectionState: ConnectionState;
  serverVersion: string;
  config: AppConfig | null;
  activeProfileId: string;
  activePageId: string;
  pinned: boolean;
  telemetry: Partial<Record<MetricId, number>>;
  states: Record<string, boolean | number | string>;
  activeTab: ActiveTab;
  ping: number;
  isOled: boolean;
  hapticLevel: 'off' | 'low' | 'med' | 'high';
  clipboardLast: string;
  clipboardHistory: ClipboardEntry[];
  nowPlaying: NowPlayingInfo | null;

  hosts: Record<string, HostSnapshot>;
  hostOrder: string[];
  activeHostId: string;
  nativeMode: boolean;
  hostsSheetOpen: boolean;
  inputLockedUntil: number;
  switchToast: { name: string; color: string } | null;

  setActiveTab: (tab: ActiveTab) => void;
  setOled: (oled: boolean) => void;
  setHapticLevel: (level: 'off' | 'low' | 'med' | 'high') => void;
  triggerHaptic: () => void;
  getActiveProfile: () => ProfileConfig | undefined;
  getActiveHost: () => HostSnapshot | undefined;

  setNativeMode: (native: boolean) => void;
  setHostsSheetOpen: (open: boolean) => void;
  showSwitchToast: (name: string, color: string) => void;
  clearSwitchToast: () => void;
  canAcceptInput: () => boolean;

  upsertHosts: (list: NativeHostInfo[], activeId: string | null) => void;
  setHostConnection: (hostId: string, status: HostConnectionStatus, meta?: { transport?: 'lan' | 'usb'; latencyMs?: number }) => void;
  switchHost: (hostId: string) => void;
  applyWelcome: (hostId: string, payload: any) => void;
  applyConfigUpdate: (hostId: string, config: any, revision?: number) => void;
  setHostTelemetry: (hostId: string, metrics: Partial<Record<MetricId, number>>) => void;
  setHostPing: (hostId: string, ms: number) => void;
  setHostState: (hostId: string, key: string, value: boolean | number | string) => void;
  setHostNowPlaying: (hostId: string, value: NowPlayingInfo | null) => void;
  setHostClipboard: (hostId: string, text: string, ts: number) => void;
  setHostClipboardHistory: (hostId: string, items: ClipboardEntry[]) => void;
  pushHostAlert: (hostId: string, text: string) => void;
  clearHostAlerts: (hostId: string) => void;

  setActiveProfileId: (id: string) => void;
  setActivePageId: (id: string) => void;
  setPinned: (pinned: boolean) => void;
  openPage: (profileId: string, pageId: string) => void;
  cyclePage: (direction: 'next' | 'prev') => void;
}

const syncHost = (state: DeckState, hostId: string, patch: Partial<HostSnapshot>) => {
  const existing = state.hosts[hostId] || createEmptyHost(hostId);
  const updated = { ...existing, ...patch };
  const hosts = { ...state.hosts, [hostId]: updated };
  const hostOrder = state.hostOrder.includes(hostId) ? state.hostOrder : [...state.hostOrder, hostId];
  return { hosts, hostOrder, updated };
};

export const useDeckStore = create<DeckState>((set, get) => ({
  connectionState: 'offline',
  serverVersion: '',
  config: null,
  activeProfileId: 'global',
  activePageId: 'p1',
  pinned: false,
  telemetry: {},
  states: {},
  activeTab: 'deck',
  ping: 0,
  isOled: localStorage.getItem('vexadeck_oled') === 'true',
  hapticLevel: (localStorage.getItem('vexadeck_haptic') as 'off' | 'low' | 'med' | 'high') || 'med',
  clipboardLast: '',
  clipboardHistory: [],
  nowPlaying: null,

  hosts: {},
  hostOrder: [],
  activeHostId: 'local',
  nativeMode: false,
  hostsSheetOpen: false,
  inputLockedUntil: 0,
  switchToast: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  setOled: (isOled) => {
    localStorage.setItem('vexadeck_oled', String(isOled));
    document.body.classList.toggle('oled', isOled);
    set({ isOled });
  },
  setHapticLevel: (hapticLevel) => {
    localStorage.setItem('vexadeck_haptic', hapticLevel);
    set({ hapticLevel });
  },
  triggerHaptic: () => {
    const { hapticLevel } = get();
    if (!('vibrate' in navigator) || hapticLevel === 'off') return;
    const duration = hapticLevel === 'low' ? 8 : hapticLevel === 'med' ? 15 : 30;
    try { navigator.vibrate(duration); } catch { }
  },
  getActiveProfile: () => {
    const { config, activeProfileId } = get();
    return config?.profiles.find((p) => p.id === activeProfileId) || config?.profiles[0];
  },
  getActiveHost: () => {
    const { hosts, activeHostId } = get();
    return hosts[activeHostId];
  },

  setNativeMode: (nativeMode) => set({ nativeMode }),
  setHostsSheetOpen: (hostsSheetOpen) => set({ hostsSheetOpen }),
  showSwitchToast: (name, color) => {
    set({ switchToast: { name, color } });
    window.setTimeout(() => {
      if (get().switchToast?.name === name) set({ switchToast: null });
    }, 800);
  },
  clearSwitchToast: () => set({ switchToast: null }),
  canAcceptInput: () => Date.now() >= get().inputLockedUntil,

  upsertHosts: (list, activeId) => {
    const state = get();
    const hosts = { ...state.hosts };
    for (const item of list) {
      const existing = hosts[item.id] || createEmptyHost(item.id, item.name, item.color);
      hosts[item.id] = {
        ...existing,
        pcName: item.name || existing.pcName,
        pcColor: item.color || existing.pcColor,
        pcIcon: item.icon || existing.pcIcon,
        status: item.status || existing.status,
        transport: item.transport || existing.transport,
        latencyMs: item.latencyMs ?? existing.latencyMs,
        mac: item.mac ?? existing.mac,
      };
    }
    const hostOrder = list.map((item) => item.id);
    const nextActive = activeId && hosts[activeId] ? activeId : state.activeHostId;
    set({ hosts, hostOrder });
    if (nextActive !== state.activeHostId) get().switchHost(nextActive);
  },

  setHostConnection: (hostId, status, meta) => {
    const state = get();
    const { hosts, hostOrder, updated } = syncHost(state, hostId, {
      status,
      transport: meta?.transport || state.hosts[hostId]?.transport || 'lan',
      latencyMs: meta?.latencyMs ?? state.hosts[hostId]?.latencyMs ?? 0,
    });
    const isActive = hostId === state.activeHostId;
    set({
      hosts,
      hostOrder,
      ...(isActive
        ? {
            connectionState: (status === 'unverified' ? 'offline' : status) as ConnectionState,
            ping: meta?.latencyMs ?? updated.latencyMs,
          }
        : {}),
    });
  },

  switchHost: (hostId) => {
    const state = get();
    const base = state.hosts[hostId];
    if (!base) return;

    const config = base.config;
    const profile = config?.profiles.find((p) => p.id === base.activeProfileId) || config?.profiles[0];
    set({
      activeHostId: hostId,
      inputLockedUntil: Date.now() + 250,
      hostsSheetOpen: false,
      config,
      activeProfileId: profile?.id || 'global',
      activePageId: base.activePageId || profile?.pages[0]?.id || 'p1',
      pinned: base.pinned,
      states: base.states,
      telemetry: base.telemetry,
      nowPlaying: base.nowPlaying,
      clipboardLast: base.clipboardLast,
      clipboardHistory: base.clipboardHistory,
      serverVersion: base.serverVersion,
      connectionState: (base.status === 'unverified' ? 'offline' : base.status) as ConnectionState,
      ping: base.latencyMs,
    });
    get().showSwitchToast(base.pcName, base.pcColor);
    get().triggerHaptic();
  },

  applyWelcome: (hostId, payload) => {
    const state = get();
    const config = normalizeConfig(payload?.config);
    if (!config) return;
    const profileId = payload.activeProfileId || config.profiles?.[0]?.id || 'global';
    const profile = config.profiles.find((p) => p.id === profileId) || config.profiles[0];
    const snapshot: Partial<HostSnapshot> = {
      config,
      configRevision: payload.configRevision ?? state.hosts[hostId]?.configRevision ?? 0,
      pcName: payload.pcName || state.hosts[hostId]?.pcName || config.host?.pcName || 'PC',
      pcColor: payload.pcColor || state.hosts[hostId]?.pcColor || '#00FF9C',
      pcIcon: payload.pcIcon || state.hosts[hostId]?.pcIcon || 'monitor',
      activeProfileId: profile?.id || 'global',
      activePageId: profile?.pages?.[0]?.id || 'p1',
      pinned: !!payload.pinned,
      states: payload.states || {},
      nowPlaying: payload.nowPlaying || null,
      clipboardLast: payload.clipboard || '',
      serverVersion: payload.serverVersion || state.hosts[hostId]?.serverVersion || '',
      status: 'connected',
    };
    const { hosts, hostOrder } = syncHost(state, hostId, snapshot);
    const isActive = hostId === state.activeHostId;
    set({
      hosts,
      hostOrder,
      ...(isActive
        ? {
            config,
            activeProfileId: snapshot.activeProfileId!,
            activePageId: snapshot.activePageId!,
            pinned: snapshot.pinned!,
            states: snapshot.states!,
            nowPlaying: snapshot.nowPlaying!,
            clipboardLast: snapshot.clipboardLast!,
            serverVersion: snapshot.serverVersion!,
            connectionState: 'connected' as ConnectionState,
          }
        : {}),
    });
  },

  applyConfigUpdate: (hostId, rawConfig, revision) => {
    const state = get();
    const config = normalizeConfig(rawConfig);
    if (!config) return;
    const { hosts, hostOrder, updated } = syncHost(state, hostId, {
      config,
      configRevision: revision ?? updated_revision(state, hostId),
    });
    if (hostId === state.activeHostId) {
      set({ hosts, hostOrder, config, activeProfileId: updated.activeProfileId || state.activeProfileId });
    } else {
      set({ hosts, hostOrder });
    }
  },

  setHostTelemetry: (hostId, metrics) => {
    const state = get();
    const current = state.hosts[hostId]?.telemetry || {};
    const telemetry = { ...current, ...metrics };
    const { hosts, hostOrder } = syncHost(state, hostId, { telemetry });
    set(hostId === state.activeHostId ? { hosts, hostOrder, telemetry } : { hosts, hostOrder });
  },

  setHostPing: (hostId, ms) => {
    const state = get();
    const { hosts, hostOrder } = syncHost(state, hostId, { latencyMs: ms, telemetry: { ...(state.hosts[hostId]?.telemetry || {}), 'ping.app': ms } });
    set(hostId === state.activeHostId ? { hosts, hostOrder, ping: ms, telemetry: hosts[hostId].telemetry } : { hosts, hostOrder });
  },

  setHostState: (hostId, key, value) => {
    const state = get();
    const states = { ...(state.hosts[hostId]?.states || {}), [key]: value };
    const { hosts, hostOrder } = syncHost(state, hostId, { states });
    set(hostId === state.activeHostId ? { hosts, hostOrder, states } : { hosts, hostOrder });
  },

  setHostNowPlaying: (hostId, value) => {
    const state = get();
    const { hosts, hostOrder } = syncHost(state, hostId, { nowPlaying: value });
    set(hostId === state.activeHostId ? { hosts, hostOrder, nowPlaying: value } : { hosts, hostOrder });
  },

  setHostClipboard: (hostId, text, ts) => {
    const state = get();
    const current = state.hosts[hostId]?.clipboardHistory || [];
    const clipboardHistory = [{ text, ts }, ...current.filter((item) => item.text !== text)].slice(0, 10);
    const { hosts, hostOrder } = syncHost(state, hostId, { clipboardLast: text, clipboardHistory });
    set(hostId === state.activeHostId ? { hosts, hostOrder, clipboardLast: text, clipboardHistory } : { hosts, hostOrder });
  },

  setHostClipboardHistory: (hostId, items) => {
    const state = get();
    const { hosts, hostOrder } = syncHost(state, hostId, { clipboardHistory: items, clipboardLast: items[0]?.text || '' });
    set(hostId === state.activeHostId ? { hosts, hostOrder, clipboardHistory: items } : { hosts, hostOrder });
  },

  pushHostAlert: (hostId, text) => {
    const state = get();
    const existing = state.hosts[hostId]?.alerts || [];
    const alerts = [text, ...existing.filter((item) => item !== text)].slice(0, 3);
    const { hosts, hostOrder } = syncHost(state, hostId, { alerts });
    set({ hosts, hostOrder });
  },

  clearHostAlerts: (hostId) => {
    const state = get();
    const { hosts, hostOrder } = syncHost(state, hostId, { alerts: [] });
    set({ hosts, hostOrder });
  },

  setActiveProfileId: (activeProfileId) => {
    const { config, hosts, activeHostId } = get();
    const prof = config?.profiles.find((p) => p.id === activeProfileId);
    const initialPage = prof?.pages[0]?.id || 'p1';
    const host = hosts[activeHostId];
    set({
      activeProfileId,
      activePageId: initialPage,
      hosts: host ? { ...hosts, [activeHostId]: { ...host, activeProfileId, activePageId: initialPage } } : hosts,
    });
  },

  setActivePageId: (activePageId) => {
    const { hosts, activeHostId } = get();
    const host = hosts[activeHostId];
    set({
      activePageId,
      hosts: host ? { ...hosts, [activeHostId]: { ...host, activePageId } } : hosts,
    });
  },

  setPinned: (pinned) => {
    const { hosts, activeHostId } = get();
    const host = hosts[activeHostId];
    set({ pinned, hosts: host ? { ...hosts, [activeHostId]: { ...host, pinned } } : hosts });
  },

  openPage: (profileId, pageId) => {
    const { config } = get();
    const profile = config?.profiles.find((p) => p.id === profileId);
    if (!profile || !profile.pages.some((page) => page.id === pageId)) return;
    set({ activeProfileId: profileId, activePageId: pageId });
  },

  cyclePage: (direction) => {
    const { getActiveProfile, activePageId } = get();
    const pages = getActiveProfile()?.pages || [];
    if (pages.length < 2) return;
    const index = Math.max(0, pages.findIndex((page) => page.id === activePageId));
    const offset = direction === 'next' ? 1 : -1;
    const next = (((index + offset) % pages.length) + pages.length) % pages.length;
    set({ activePageId: pages[next].id });
  },
}));

function updated_revision(state: DeckState, hostId: string): number {
  return (state.hosts[hostId]?.configRevision || 0) + 1;
}

/** Ignored taps for 250 ms after changing PC to avoid acting on the wrong machine. */
export function isInputLocked(): boolean {
  return Date.now() < useDeckStore.getState().inputLockedUntil;
}
