import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import { Lock, Unlock, Check, Plus, X } from 'lucide-react';

/** Built-in profiles that ship with the app but can be removed. */
const OPTIONAL_PROFILES = [
  { id: 'gamer', name: 'Gamer', accent: '#FF4655' },
  { id: 'spotify', name: 'Spotify', accent: '#1DB954' },
];

export const ProfilesView: React.FC = () => {
  const { config, activeProfileId, pinned, setActiveProfileId } = useDeckStore();
  const profiles = config?.profiles || [];
  const missing = OPTIONAL_PROFILES.filter((option) => !profiles.some((p) => p.id === option.id));

  const handleSelectProfile = (id: string) => {
    setActiveProfileId(id);
    deckSocket.pinProfile(id);
  };

  const handleReturnToAuto = () => {
    deckSocket.pinProfile(null);
  };

  const handleRemove = (id: string, name: string) => {
    if (!window.confirm(`¿Quitar el perfil ${name}? Podés volver a agregarlo cuando quieras.`)) return;
    deckSocket.setBuiltInProfile(id, false);
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
          const isOptional = OPTIONAL_PROFILES.some((option) => option.id === p.id);
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
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full flex-none"
                  style={{ backgroundColor: p.accent }}
                />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-text flex items-center gap-1.5">
                    {p.name}
                    {p.locked && <Lock size={12} className="text-muted" />}
                  </h4>
                  <p className="text-[11px] text-muted font-mono truncate">
                    {p.locked
                      ? 'Perfil fijo · se activa al usar Spotify'
                      : p.match?.processes?.length
                      ? p.match.processes.join(', ')
                      : p.id === 'gamer'
                      ? 'Juegos · detección automática'
                      : 'Perfil general'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-none">
                {isActive && (
                  <span className="text-xs font-semibold text-accent flex items-center gap-1">
                    <Check size={14} />
                    {pinned ? 'Fijado' : 'Activo'}
                  </span>
                )}
                {pinned && isActive && <Lock size={14} className="text-accent" />}
                {isOptional && (
                  <span
                    role="button"
                    tabIndex={0}
                    title={`Quitar ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(p.id, p.name);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemove(p.id, p.name);
                    }}
                    className="p-1 rounded-md text-muted hover:text-danger hover:bg-surface-2 transition-colors"
                  >
                    <X size={14} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {missing.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Perfiles opcionales</h3>
          <div className="flex flex-wrap gap-2">
            {missing.map((option) => (
              <button
                key={option.id}
                onClick={() => deckSocket.setBuiltInProfile(option.id, true)}
                className="px-3 py-2 rounded-lg border border-border bg-surface hover:border-accent text-xs font-medium text-text flex items-center gap-2 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: option.accent }}
                />
                <Plus size={13} />
                Agregar {option.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
