import { create } from 'zustand';
import { AppConfig, ConnectionState, MetricId, ProfileConfig, ActiveTab, NowPlayingInfo, ClipboardEntry } from '../../shared/types';

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

  setConnectionState: (state: ConnectionState) => void;
  setWelcomeData: (
    config: AppConfig,
    activeProfileId: string,
    pinned: boolean,
    states: Record<string, boolean | number | string>,
    serverVersion: string,
    clipboard?: string,
    nowPlaying?: NowPlayingInfo | null
  ) => void;
  setActiveProfileId: (id: string) => void;
  setActivePageId: (id: string) => void;
  setPinned: (pinned: boolean) => void;
  openPage: (profileId: string, pageId: string) => void;
  cyclePage: (direction: 'next' | 'prev') => void;
  setTelemetry: (metrics: Partial<Record<MetricId, number>>) => void;
  updateState: (key: string, value: boolean | number | string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setPing: (ms: number) => void;
  setOled: (oled: boolean) => void;
  setHapticLevel: (level: 'off' | 'low' | 'med' | 'high') => void;
  setClipboard: (text: string, ts: number) => void;
  setClipboardHistory: (items: ClipboardEntry[]) => void;
  setNowPlaying: (nowPlaying: NowPlayingInfo | null) => void;
  triggerHaptic: () => void;
  getActiveProfile: () => ProfileConfig | undefined;
}

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
  isOled: localStorage.getItem('opendeck_oled') === 'true',
  hapticLevel: (localStorage.getItem('opendeck_haptic') as 'off' | 'low' | 'med' | 'high') || 'med',
  clipboardLast: '',
  clipboardHistory: [],
  nowPlaying: null,

  setConnectionState: (connectionState) => set({ connectionState }),

  setWelcomeData: (rawConfig: any, activeProfileId, pinned, states, serverVersion, clipboard, nowPlaying) => {
    if (!rawConfig) return;
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

    const config: AppConfig = {
      ...rawConfig,
      profiles,
      defaultProfileId: rawConfig.defaultProfileId || rawConfig.DefaultProfileId || 'global',
      telemetry: rawConfig.telemetry || rawConfig.Telemetry,
      alerts: rawConfig.alerts || rawConfig.Alerts || [],
      scripts: rawConfig.scripts || rawConfig.Scripts || [],
    };

    const prof = config.profiles.find((p) => p.id === activeProfileId) || config.profiles[0];
    const initialPage = prof?.pages[0]?.id || 'p1';
    set({
      config,
      activeProfileId: prof?.id || 'global',
      activePageId: initialPage,
      pinned,
      states,
      serverVersion,
      clipboardLast: clipboard || '',
      nowPlaying: nowPlaying || null,
    });
  },

  setActiveProfileId: (activeProfileId) => {
    const { config } = get();
    const prof = config?.profiles.find((p) => p.id === activeProfileId);
    const initialPage = prof?.pages[0]?.id || 'p1';
    set({ activeProfileId, activePageId: initialPage });
  },

  setActivePageId: (activePageId) => set({ activePageId }),
  setPinned: (pinned) => set({ pinned }),
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
  setTelemetry: (newMetrics) =>
    set((state) => ({
      telemetry: { ...state.telemetry, ...newMetrics },
    })),
  updateState: (key, value) =>
    set((state) => ({
      states: { ...state.states, [key]: value },
    })),
  setActiveTab: (activeTab) => set({ activeTab }),
  setPing: (ping) => set({ ping }),
  setOled: (isOled) => {
    localStorage.setItem('opendeck_oled', String(isOled));
    if (isOled) {
      document.body.classList.add('oled');
    } else {
      document.body.classList.remove('oled');
    }
    set({ isOled });
  },
  setHapticLevel: (hapticLevel) => {
    localStorage.setItem('opendeck_haptic', hapticLevel);
    set({ hapticLevel });
  },
  setClipboard: (text, ts) =>
    set((state) => ({
      clipboardLast: text,
      clipboardHistory: [{ text, ts }, ...state.clipboardHistory.filter((i) => i.text !== text)].slice(0, 10),
    })),
  setClipboardHistory: (clipboardHistory) => set({ clipboardHistory }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  triggerHaptic: () => {
    const { hapticLevel } = get();
    if (!('vibrate' in navigator) || hapticLevel === 'off') return;
    const duration = hapticLevel === 'low' ? 8 : hapticLevel === 'med' ? 15 : 30;
    try {
      navigator.vibrate(duration);
    } catch { }
  },
  getActiveProfile: () => {
    const { config, activeProfileId } = get();
    return config?.profiles.find((p) => p.id === activeProfileId) || config?.profiles[0];
  },
}));
