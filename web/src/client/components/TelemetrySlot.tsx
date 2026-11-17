import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { TelemetrySlotConfig } from '../../shared/types';
import { formatMetricValue, getMetricColor, getMetricLabel } from '../../shared/theme';

interface TelemetrySlotProps {
  slot: TelemetrySlotConfig;
  className?: string;
}

export const TelemetrySlot: React.FC<TelemetrySlotProps> = ({ slot, className = '' }) => {
  const { telemetry, getActiveProfile, config } = useDeckStore();
  const profile = getActiveProfile();
  const accent = profile?.accent || '#00FF9C';

  const primaryRaw = telemetry[slot.primary];
  const secondaryRaw = slot.secondary ? telemetry[slot.secondary] : undefined;

  const primaryFormatted = formatMetricValue(slot.primary, primaryRaw);
  const secondaryFormatted = slot.secondary ? formatMetricValue(slot.secondary, secondaryRaw) : null;

  const primaryColor = primaryRaw !== undefined ? getMetricColor(slot.primary, primaryRaw, accent) : accent;

  // Check if slot has active alert
  const hasAlert = config?.alerts?.some((alert) => {
    if (alert.metric === slot.primary && primaryRaw !== undefined) {
      if (alert.op === '>' && primaryRaw > alert.value) return true;
      if (alert.op === '<' && primaryRaw < alert.value) return true;
    }
    if (slot.secondary && alert.metric === slot.secondary && secondaryRaw !== undefined) {
      if (alert.op === '>' && secondaryRaw > alert.value) return true;
      if (alert.op === '<' && secondaryRaw < alert.value) return true;
    }
    return false;
  });

  // Calculate percentage for bar (if load/used/usage/temp)
  let barPercent = 0;
  if (primaryRaw !== undefined) {
    if (slot.primary.endsWith('.temp')) {
      barPercent = Math.min(100, Math.max(0, (primaryRaw / 100) * 100));
    } else if (slot.primary.endsWith('.load') || slot.primary.endsWith('.used') || slot.primary.endsWith('.usage') || slot.primary === 'gpu.vram') {
      barPercent = Math.min(100, Math.max(0, primaryRaw));
    } else if (slot.primary === 'ping.app') {
      barPercent = Math.min(100, Math.max(0, (primaryRaw / 150) * 100));
    } else if (slot.primary === 'net.down' || slot.primary === 'net.up') {
      // 0 - 50 MB/s range
      barPercent = Math.min(100, Math.max(0, (primaryRaw / (50 * 1024 * 1024)) * 100));
    }
  }

  return (
    <div
      className={`relative p-2.5 rounded-xl bg-surface border border-border flex flex-col justify-between overflow-hidden transition-all duration-200 select-none ${
        hasAlert ? 'border-danger animate-pulse shadow-[0_0_12px_rgba(255,59,78,0.35)]' : ''
      } ${className}`}
    >
      {/* Header: Metric Label and optional secondary */}
      <div className="flex items-center justify-between text-[11px] font-semibold text-muted tracking-wider">
        <span>{getMetricLabel(slot.primary)}</span>
        {secondaryFormatted && (
          <span className="font-mono text-text/80 text-[11px]">
            {secondaryFormatted.display}
            <span className="text-[9px] text-muted ml-0.5">{secondaryFormatted.unit}</span>
          </span>
        )}
      </div>

      {/* Main value display */}
      <div className="my-auto py-1 flex items-baseline gap-1 font-mono">
        <span
          className="text-2xl font-bold tracking-tight transition-colors duration-200"
          style={{ color: primaryColor }}
        >
          {primaryFormatted.display}
        </span>
        <span className="text-xs text-muted font-medium">{primaryFormatted.unit}</span>
      </div>

      {/* Subtle bottom progress bar */}
      <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden mt-1">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${barPercent}%`,
            backgroundColor: primaryColor,
          }}
        />
      </div>
    </div>
  );
};
