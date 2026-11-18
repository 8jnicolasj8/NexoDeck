import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { Monitor, Usb, Wifi, ChevronDown } from 'lucide-react';

const statusColor = (status: string) => {
  switch (status) {
    case 'connected': return '#00FF9C';
    case 'reconnecting': return '#FFB020';
    case 'unverified': return '#FF3B4E';
    default: return '#5B6773';
  }
};

export const PcChip: React.FC = () => {
  const { nativeMode, hosts, hostOrder, activeHostId, setHostsSheetOpen } = useDeckStore();
  if (!nativeMode || hostOrder.length === 0) return null;

  const host = hosts[activeHostId];
  if (!host) return null;
  const multiple = hostOrder.length > 1;

  return (
    <button
      onClick={() => multiple && setHostsSheetOpen(true)}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border bg-surface-2 hover:border-accent transition-colors max-w-[150px]"
      title={multiple ? 'Cambiar de PC' : host.pcName}
    >
      <span className="relative flex items-center justify-center" style={{ color: host.pcColor }}>
        {host.transport === 'usb' ? <Usb size={12} /> : host.status === 'connected' ? <Monitor size={12} /> : <Wifi size={12} />}
        <span
          className="absolute -bottom-1 -right-1 w-1.5 h-1.5 rounded-full ring-1 ring-surface-2"
          style={{ backgroundColor: statusColor(host.status) }}
        />
      </span>
      <span className="font-semibold text-text truncate">{host.pcName}</span>
      {multiple && <ChevronDown size={11} className="text-muted flex-none" />}
    </button>
  );
};
