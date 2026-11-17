import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { TelemetrySlot } from '../components/TelemetrySlot';
import { ButtonGrid } from '../components/ButtonGrid';
import { DeckNav } from '../components/DeckNav';

interface DeckViewProps {
  isLandscape: boolean;
}

export const DeckView: React.FC<DeckViewProps> = ({ isLandscape }) => {
  const { config, connectionState } = useDeckStore();
  const isOffline = connectionState === 'offline';

  // Default slots fallback if not configured
  const leftSlots = config?.telemetry?.slots?.left || [
    { id: 'L1', widget: 'dual', primary: 'cpu.load', secondary: 'cpu.temp' },
    { id: 'L2', widget: 'single', primary: 'ram.used' },
  ];

  const rightSlots = config?.telemetry?.slots?.right || [
    { id: 'R1', widget: 'single', primary: 'ping.app' },
    { id: 'R2', widget: 'dual', primary: 'net.down', secondary: 'net.up' },
  ];

  if (isLandscape) {
    return (
      <div
        className="w-full h-full p-2 grid gap-2.5 overflow-hidden"
        style={{
          gridTemplateColumns: 'minmax(130px, 18%) 1fr minmax(130px, 18%)',
        }}
      >
        {/* Left Telemetry Column (L1, L2) */}
        <div className="flex flex-col gap-2.5 h-full overflow-hidden">
          {leftSlots.map((slot) => (
            <TelemetrySlot key={slot.id} slot={slot} className="flex-1" />
          ))}
        </div>

        {/* Center Button Grid + deck navigation */}
        <div className="w-full h-full overflow-hidden flex flex-col gap-1.5 items-center justify-center">
          <div className="flex-1 w-full overflow-hidden flex items-center justify-center">
            <ButtonGrid isLandscape={true} disabled={isOffline} />
          </div>
          <DeckNav />
        </div>

        {/* Right Telemetry Column (R1, R2) */}
        <div className="flex flex-col gap-2.5 h-full overflow-hidden">
          {rightSlots.map((slot) => (
            <TelemetrySlot key={slot.id} slot={slot} className="flex-1" />
          ))}
        </div>
      </div>
    );
  }

  // Vertical layout (Portrait)
  const allSlots = [...leftSlots, ...rightSlots];

  return (
    <div className="w-full h-full p-2 flex flex-col gap-2 overflow-hidden">
      {/* 2x2 compact telemetry grid at top */}
      <div className="grid grid-cols-2 gap-2 h-36 min-h-[144px]">
        {allSlots.slice(0, 4).map((slot) => (
          <TelemetrySlot key={slot.id} slot={slot} />
        ))}
      </div>

      {/* Button Grid in center */}
      <div className="flex-1 w-full overflow-hidden flex items-center justify-center">
        <ButtonGrid isLandscape={false} disabled={isOffline} />
      </div>

      {/* Page + profile stepping */}
      <DeckNav />
    </div>
  );
};
