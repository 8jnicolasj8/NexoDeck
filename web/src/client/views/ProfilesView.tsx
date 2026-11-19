import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import { Lock, Unlock, Check } from 'lucide-react';

export const ProfilesView: React.FC = () => {
  const { config, activeProfileId, pinned, setActiveProfileId } = useDeckStore();
  const profiles = config?.profiles || [];

  const handleSelectProfile = (id: string) => {
    setActiveProfileId(id);
    deckSocket.pinProfile(id);
  };

  const handleReturnToAuto = () => {
    deckSocket.pinProfile(null);
  };

  return (
    <div className="w-full h-full overflow-y-auto p-4 flex flex-col gap-4 max-w-xl mx-auto select-none">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">Perfiles</h2>
        {pinned && (
          <button
            onClick={handleReturnToAuto}
            className="px-2.5 py-1 rounded-lg border border-border bg-surface-2 hover:border-accent text-xs font-medium text-accent flex items-center gap-1.5 transition-colors"
          >
            <Unlock size={13} />
            Volver a automático
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {profiles.map((p) => {
          const isActive = p.id === activeProfileId;
          return (
            <button
              key={p.id}
              onClick={() => handleSelectProfile(p.id)}
              className={`p-3 rounded-xl border flex items-center justify-between transition-all text-left ${
                isActive
                  ? 'border-accent bg-surface-2 shadow-sm'
                  : 'border-border bg-surface hover:border-border/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: p.accent }}
                />
                <div>
                  <h4 className="text-sm font-semibold text-text flex items-center gap-1.5">
                    {p.name}
                    {p.locked && <Lock size={12} className="text-muted" />}
                  </h4>
                  <p className="text-[11px] text-muted font-mono">
                    {p.locked
                      ? 'Perfil fijo · se activa al usar Spotify'
                      : p.match?.processes?.length
                      ? p.match.processes.join(', ')
                      : 'Perfil general'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isActive && (
                  <span className="text-xs font-semibold text-accent flex items-center gap-1">
                    <Check size={14} />
                    {pinned ? 'Fijado' : 'Activo'}
                  </span>
                )}
                {pinned && isActive && <Lock size={14} className="text-accent" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
