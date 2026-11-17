import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { WifiOff, RefreshCw } from 'lucide-react';
import { deckSocket } from '../ws/deckSocket';

export const OfflineBanner: React.FC = () => {
  const { connectionState } = useDeckStore();

  if (connectionState === 'connected') return null;

  return (
    <div className="absolute top-10 left-0 right-0 z-30 bg-danger/90 backdrop-blur text-white text-xs px-3 py-1.5 flex items-center justify-between select-none shadow-md">
      <div className="flex items-center gap-2 font-medium">
        {connectionState === 'reconnecting' ? (
          <RefreshCw size={14} className="animate-spin" />
        ) : (
          <WifiOff size={14} />
        )}
        <span>
          {connectionState === 'reconnecting'
            ? 'Reconectando con la PC…'
            : 'Sin conexión — verificá que la PC esté encendida en la misma red WiFi.'}
        </span>
      </div>
      <button
        onClick={() => deckSocket.connect()}
        className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[11px] font-semibold transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
};
