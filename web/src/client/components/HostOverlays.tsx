import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import { AlertTriangle } from 'lucide-react';

/** 800 ms confirmation with the PC colour after switching hosts. */
export const SwitchToast: React.FC = () => {
  const { switchToast } = useDeckStore();
  if (!switchToast) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <div
        className="px-5 py-3 rounded-2xl border bg-surface/95 shadow-xl animate-[zoomFade_.25s_ease-out]"
        style={{ borderColor: switchToast.color, boxShadow: `0 0 40px ${switchToast.color}33` }}
      >
        <p className="text-[10px] uppercase tracking-widest text-muted">Controlando</p>
        <p className="text-lg font-semibold" style={{ color: switchToast.color }}>{switchToast.name}</p>
      </div>
    </div>
  );
};

/** Alerts from a PC that is not the active one never steal the screen. */
export const HostAlertBanner: React.FC = () => {
  const { hosts, hostOrder, activeHostId } = useDeckStore();
  const host = hostOrder
    .filter((id) => id !== activeHostId)
    .map((id) => hosts[id])
    .find((item) => item && item.alerts.length > 0);
  if (!host) return null;

  return (
    <button
      onClick={() => deckSocket.switchHost(host.serverId)}
      className="fixed top-12 left-2 right-2 z-40 flex items-center gap-2 px-3 py-2 rounded-xl bg-danger/90 text-white text-[11px] shadow-lg"
    >
      <AlertTriangle size={14} className="flex-none" />
      <span className="flex-1 text-left truncate">{host.alerts[0]}</span>
      <span className="font-semibold">Ver</span>
    </button>
  );
};
