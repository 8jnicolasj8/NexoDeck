import React, { useState, useEffect, useRef } from 'react';
import { useDeckStore } from '../store/useDeckStore';

export const InactivityDimmer: React.FC = () => {
  const [isDimmed, setIsDimmed] = useState(false);
  const timerRef = useRef<number | null>(null);
  const { triggerHaptic } = useDeckStore();

  const resetTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const setting = localStorage.getItem('nexodeck_dim_timeout') || '3';
    if (setting === 'never') return;

    const minutes = parseInt(setting, 10) || 3;
    const ms = minutes * 60 * 1000;

    timerRef.current = window.setTimeout(() => {
      setIsDimmed(true);
    }, ms);
  };

  useEffect(() => {
    resetTimer();

    const handleUserActivity = () => {
      if (!isDimmed) {
        resetTimer();
      }
    };

    window.addEventListener('pointerdown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('pointerdown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
    };
  }, [isDimmed]);

  const handleWakeUp = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    triggerHaptic();
    setIsDimmed(false);
    resetTimer();
  };

  if (!isDimmed) return null;

  return (
    <div
      onClick={handleWakeUp}
      onTouchStart={handleWakeUp}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-[2px] flex items-center justify-center select-none cursor-pointer transition-opacity duration-300"
    >
      <div className="text-center p-4">
        <span className="text-xs text-muted/70 font-mono tracking-widest uppercase">
          NexoDeck · Pantalla atenuada
        </span>
        <p className="text-[11px] text-muted/50 mt-1">
          Tocá en cualquier lugar para despertar
        </p>
      </div>
    </div>
  );
};
