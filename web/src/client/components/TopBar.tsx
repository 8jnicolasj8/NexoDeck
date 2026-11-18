import React, { useRef } from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import { ActiveTab } from '../../shared/types';
import { Lock, Unlock, LayoutGrid, Wrench, Layers, Settings } from 'lucide-react';
import { PcChip } from './PcChip';

interface TopBarProps {
  isLandscape: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ isLandscape }) => {
  const {
    activeProfileId,
    pinned,
    getActiveProfile,
    connectionState,
    ping,
    activeTab,
    setActiveTab,
    hostOrder,
    activeHostId,
    nativeMode,
  } = useDeckStore();

  const profile = getActiveProfile();
  const touchStartX = useRef<number | null>(null);

  const cycleHost = (direction: 1 | -1) => {
    if (!nativeMode || hostOrder.length < 2) return;
    const index = hostOrder.indexOf(activeHostId);
    if (index < 0) return;
    const next = (index + direction + hostOrder.length) % hostOrder.length;
    deckSocket.switchHost(hostOrder[next]);
  };

  const handleTogglePin = () => {
    deckSocket.pinProfile(pinned ? null : activeProfileId);
  };

  const navItems: { tab: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { tab: 'deck', label: 'Deck', icon: <LayoutGrid size={15} /> },
    { tab: 'utils', label: 'Util', icon: <Wrench size={15} /> },
    { tab: 'profiles', label: 'Perf', icon: <Layers size={15} /> },
    { tab: 'settings', label: 'Aj', icon: <Settings size={15} /> },
  ];

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return '#00FF9C';
      case 'reconnecting': return '#FFB020';
      case 'offline': return '#FF3B4E';
    }
  };

  return (
    <header
      className="h-10 min-h-[40px] max-h-10 px-3 flex items-center justify-between border-b border-border bg-surface select-none z-20 text-xs"
      onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) return;
        const delta = (event.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(delta) < 60) return;
        cycleHost(delta < 0 ? 1 : -1);
      }}
    >
      {/* Left: PC Chip (native) + Profile Chip */}
      <div className="flex items-center gap-1.5 min-w-0">
        <PcChip />
        <button
          onClick={handleTogglePin}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border bg-surface-2 hover:border-accent transition-colors"
          title={pinned ? 'Perfil fijado manualmente (tap para soltar)' : 'Perfil automático (tap para fijar)'}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: profile?.accent || 'var(--accent)' }}
          />
          <span className="font-semibold text-text max-w-[120px] truncate">
            {profile?.name || 'Global'}
          </span>
          {pinned ? (
            <Lock size={11} className="text-accent" />
          ) : (
            <Unlock size={11} className="text-muted opacity-50" />
          )}
        </button>
      </div>

      {/* Center: Nav Tabs (horizontal only; vertical has bottom bar) */}
      {isLandscape && (
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => setActiveTab(item.tab)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                  isActive
                    ? 'text-accent font-semibold bg-surface-2'
                    : 'text-muted hover:text-text'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Right: Connection dot + ping */}
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
        <span
          className="w-2 h-2 rounded-full inline-block transition-colors duration-200"
          style={{ backgroundColor: getStatusColor() }}
        />
        <span>
          {connectionState === 'connected' ? `${ping} ms` : connectionState === 'reconnecting' ? 'Reconectando' : 'Offline'}
        </span>
      </div>
    </header>
  );
};
