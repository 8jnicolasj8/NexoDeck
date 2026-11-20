import React, { useState, useEffect } from 'react';

interface BootAnimationProps {
  onComplete: () => void;
}

export const BootAnimation: React.FC<BootAnimationProps> = ({ onComplete }) => {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const sequence = [
      '> VEXADECK INITIALIZING...',
      '> LOCAL NETWORK CHANNELS: OK',
      '> ZERO CLOUD DEPENDENCIES: VERIFIED',
      '> LINK ESTABLISHED.'
    ];

    const timeouts: number[] = [];

    sequence.forEach((line, index) => {
      const id = window.setTimeout(() => {
        setLines((prev) => [...prev, line]);
        if (index === sequence.length - 1) {
          const endId = window.setTimeout(() => {
            onComplete();
          }, 350);
          timeouts.push(endId);
        }
      }, (index + 1) * 260);
      timeouts.push(id);
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [onComplete]);

  return (
    <div
      onClick={onComplete}
      className="fixed inset-0 z-50 bg-[#000] flex flex-col justify-center items-start p-8 font-mono select-none cursor-pointer"
    >
      <div className="max-w-md w-full flex flex-col gap-2">
        <div className="text-xs text-muted mb-2 tracking-widest uppercase">
          VexaDeck · Secuencia de arranque
        </div>
        {lines.map((l, i) => (
          <div key={i} className="text-accent text-sm md:text-base font-bold tracking-tight">
            {l}
          </div>
        ))}
        <div className="flex items-center gap-1 text-accent text-sm">
          <span>&gt;</span>
          <span className="w-2.5 h-4 bg-accent animate-pulse" />
        </div>
        <div className="mt-8 text-[11px] text-muted/60">
          Tocá la pantalla para saltar
        </div>
      </div>
    </div>
  );
};
