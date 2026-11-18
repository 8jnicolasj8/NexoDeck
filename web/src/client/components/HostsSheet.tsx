import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import { Power, Plus, X, Usb, Wifi, Settings2 } from 'lucide-react';

const dot = (status: string) => {
  switch (status) {
    case 'connected': return '#00FF9C';
    case 'reconnecting': return '#FFB020';
    case 'unverified': return '#FF3B4E';
    default: return '#5B6773';
  }
};

export const HostsSheet: React.FC = () => {
  const { hostsSheetOpen, setHostsSheetOpen, hostOrder, hosts, activeHostId } = useDeckStore();
  if (!hostsSheetOpen) return null;

  const close = () => setHostsSheetOpen(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="Mis PCs">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-lg mx-auto bg-surface border-t border-border rounded-t-2xl safe-bottom animate-[slideUp_.2s_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">Mis PCs</h2>
            <p className="text-[10px] text-muted">Tocá una PC para controlarla</p>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg bg-surface-2 text-muted" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[45vh] overflow-y-auto px-3 py-2 space-y-1.5">
          {hostOrder.length === 0 && (
            <p className="text-xs text-muted px-2 py-4 text-center">Todavía no agregaste ninguna PC.</p>
          )}
          {hostOrder.map((id) => {
            const host = hosts[id];
            const isActive = id === activeHostId;
            return (
              <button
                key={id}
                onClick={() => {
                  if (!isActive && host.status !== 'offline') deckSocket.switchHost(id);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  isActive ? 'border-accent bg-surface-2' : 'border-border bg-surface-2/40'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: dot(host.status) }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold truncate" style={{ color: host.pcColor }}>
                    {host.pcName}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted">
                    {host.transport === 'usb' ? <Usb size={9} /> : <Wifi size={9} />}
                    {host.status === 'connected'
                      ? `${host.latencyMs} ms`
                      : host.status === 'unverified'
                      ? 'No verificada'
                      : host.status === 'reconnecting'
                      ? 'Reconectando…'
                      : 'Sin conexión'}
                    {host.alerts.length > 0 && <span className="text-danger"> · {host.alerts[0]}</span>}
                  </span>
                </span>
                {isActive ? (
                  <span className="text-[9px] font-semibold text-accent tracking-wide">ACTIVA</span>
                ) : host.status === 'offline' ? (
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      deckSocket.wakeHost(id);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-border text-[10px] text-muted hover:text-accent"
                  >
                    <Power size={11} /> Encender
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 px-3 pb-3 pt-1">
          <button
            onClick={() => { close(); deckSocket.openAddHost(); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent/10 border border-accent/40 text-accent text-xs font-semibold"
          >
            <Plus size={14} /> Agregar PC
          </button>
          <button
            onClick={() => { close(); deckSocket.openAddHost(); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-xs text-muted"
          >
            <Settings2 size={14} /> Administrar
          </button>
        </div>
      </div>
    </div>
  );
};
