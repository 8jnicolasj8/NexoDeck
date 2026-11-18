import React, { useState, useRef } from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import { ButtonConfig } from '../../shared/types';
import { IconRenderer } from './IconRenderer';

interface DeckButtonProps {
  button: ButtonConfig;
  size: number;
  disabled?: boolean;
  isReordering?: boolean;
  isSelectedForSwap?: boolean;
  onLongPress?: () => void;
  onClickInReorder?: () => void;
}

export const DeckButton: React.FC<DeckButtonProps> = ({
  button,
  size,
  disabled = false,
  isReordering = false,
  isSelectedForSwap = false,
  onLongPress,
  onClickInReorder,
}) => {
  const { states, getActiveProfile, triggerHaptic } = useDeckStore();
  const profile = getActiveProfile();
  const accent = profile?.accent || '#00FF9C';

  const [isPressed, setIsPressed] = useState(false);
  const [glowPos, setGlowPos] = useState<{ x: number; y: number } | null>(null);

  const longPressTimer = useRef<number | null>(null);
  const isLongPressActive = useRef(false);

  // Check state binding for toggles
  const isToggle = button.type === 'toggle';
  const isActive = isToggle && button.stateBinding ? Boolean(states[button.stateBinding]) : false;

  const showLabel = size >= 56;

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    // Ignore taps right after changing PC so nothing runs on the wrong machine.
    if (!useDeckStore.getState().canAcceptInput()) return;

    if (isReordering) {
      onClickInReorder?.();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setGlowPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsPressed(true);

    isLongPressActive.current = false;
    longPressTimer.current = window.setTimeout(() => {
      isLongPressActive.current = true;
      setIsPressed(false);
      triggerHaptic();
      onLongPress?.();
    }, 600);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (isLongPressActive.current) {
      isLongPressActive.current = false;
      return;
    }

    if (isPressed) {
      setIsPressed(false);
      deckSocket.sendAction(button.id);
    }
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsPressed(false);
    setGlowPos(null);
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      disabled={disabled}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderColor: isSelectedForSwap ? accent : isActive ? accent : undefined,
        backgroundColor: isActive ? `${accent}1F` : undefined,
      }}
      className={`relative group rounded-btn border transition-all duration-150 flex flex-col items-center justify-center p-1.5 overflow-hidden select-none outline-none ${
        disabled
          ? 'opacity-40 pointer-events-none border-border bg-surface-2'
          : isReordering
          ? `animate-wobble cursor-grab ${isSelectedForSwap ? 'ring-2 ring-accent scale-105 border-accent' : 'border-border bg-surface-2 hover:border-accent'}`
          : isPressed
          ? 'scale-[0.94] bg-surface border-accent'
          : isActive
          ? 'border-accent'
          : 'bg-surface-2 border-border hover:border-border/80 active:scale-[0.94]'
      }`}
    >
      {/* Light pulse / glow effect from exact touch point */}
      {isPressed && glowPos && (
        <span
          className="absolute rounded-full pointer-events-none animate-ping"
          style={{
            left: `${glowPos.x - 25}px`,
            top: `${glowPos.y - 25}px`,
            width: '50px',
            height: '50px',
            backgroundColor: accent,
            opacity: 0.35,
          }}
        />
      )}

      {/* Button Icon */}
      <div
        className="transition-colors duration-200"
        style={{ color: isActive ? accent : 'inherit' }}
      >
        <IconRenderer
          icon={button.icon}
          size={showLabel ? Math.max(18, Math.min(28, size * 0.36)) : Math.max(20, Math.min(32, size * 0.48))}
          className={isActive ? 'text-accent' : 'text-text'}
        />
      </div>

      {/* Button Label (hidden if size < 56px) */}
      {showLabel && (
        <span
          className="mt-1 text-[11px] font-medium tracking-tight text-center truncate max-w-full leading-tight"
          style={{ color: isActive ? accent : undefined }}
        >
          {button.label}
        </span>
      )}
    </button>
  );
};
