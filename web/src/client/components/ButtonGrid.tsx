import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import { DeckButton } from './DeckButton';

interface ButtonGridProps {
  isLandscape: boolean;
  disabled?: boolean;
}

export const ButtonGrid: React.FC<ButtonGridProps> = ({ isLandscape, disabled = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const { getActiveProfile, activePageId, setActivePageId, activeProfileId, config, triggerHaptic } = useDeckStore();
  const profile = getActiveProfile();

  const [isReordering, setIsReordering] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  // Grid columns and rows based on profile and orientation
  const cols = isLandscape
    ? profile?.grid.cols || 4
    : profile?.gridPortrait?.cols || 3;
  const rows = isLandscape
    ? profile?.grid.rows || 3
    : profile?.gridPortrait?.rows || 4;

  const pages = profile?.pages || [];
  const currentPage = pages.find((p) => p.id === activePageId) || pages[0];
  const buttons = currentPage?.buttons || [];

  // Update container dimensions on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const gap = 10;
  const availW = Math.max(0, dimensions.width - gap * (cols + 1));
  const availH = Math.max(0, dimensions.height - gap * (rows + 1));

  // Square button calculation from blueprint Section 8.2:
  const buttonSize = dimensions.width && dimensions.height
    ? Math.max(36, Math.floor(Math.min(availW / cols, availH / rows)))
    : 72;

  // Render a full cols x rows matrix
  const gridCells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const btn = buttons.find((b) => b.pos.row === r && b.pos.col === c);
      gridCells.push({ row: r, col: c, button: btn });
    }
  }

  const handleCellClickInReorder = (row: number, col: number) => {
    triggerHaptic();
    if (!selectedCell) {
      setSelectedCell({ row, col });
      return;
    }

    // If same cell clicked again, deselect
    if (selectedCell.row === row && selectedCell.col === col) {
      setSelectedCell(null);
      return;
    }

    // Swap buttons between selectedCell and (row, col)
    const btnA = buttons.find((b) => b.pos.row === selectedCell.row && b.pos.col === selectedCell.col);
    const btnB = buttons.find((b) => b.pos.row === row && b.pos.col === col);

    if (!btnA && !btnB) {
      setSelectedCell(null);
      return;
    }

    const updatedButtons = buttons.map((b) => {
      if (btnA && b.id === btnA.id) {
        return { ...b, pos: { ...b.pos, row, col } };
      }
      if (btnB && b.id === btnB.id) {
        return { ...b, pos: { ...b.pos, row: selectedCell.row, col: selectedCell.col } };
      }
      return b;
    });

    if (config && profile && currentPage) {
      currentPage.buttons = updatedButtons;
    }

    setSelectedCell(null);
  };

  const handleFinishReorder = () => {
    triggerHaptic();
    setIsReordering(false);
    setSelectedCell(null);

    if (profile && currentPage) {
      deckSocket.sendReorder(profile.id, currentPage.id, currentPage.buttons);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center p-2 relative overflow-hidden"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeProfileId}-${currentPage?.id || 'p1'}`}
          initial={{ opacity: 0, scale: 0.94, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 1.06 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${buttonSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${buttonSize}px)`,
            gap: `${gap}px`,
          }}
          className="justify-center items-center"
        >
          {gridCells.map((cell) => {
            const isSelected = selectedCell?.row === cell.row && selectedCell?.col === cell.col;
            return cell.button ? (
              <DeckButton
                key={cell.button.id}
                button={cell.button}
                size={buttonSize}
                disabled={disabled}
                isReordering={isReordering}
                isSelectedForSwap={isSelected}
                onLongPress={() => {
                  setIsReordering(true);
                  setSelectedCell({ row: cell.row, col: cell.col });
                }}
                onClickInReorder={() => handleCellClickInReorder(cell.row, cell.col)}
              />
            ) : (
              <div
                key={`empty-${cell.row}-${cell.col}`}
                onClick={() => isReordering && handleCellClickInReorder(cell.row, cell.col)}
                style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }}
                className={`rounded-btn border transition-all ${
                  isReordering
                    ? `cursor-pointer border-dashed border-border hover:border-accent ${
                        isSelected ? 'ring-2 ring-accent border-accent bg-accent/10' : 'bg-surface/30'
                      }`
                    : 'border-border/30 bg-surface/20'
                }`}
              />
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Floating Done Banner when in Reorder Mode */}
      {isReordering && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface/95 backdrop-blur border border-accent rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl z-30 animate-bounce">
          <span className="text-xs text-text font-medium">MODO REORDENAR · Tocá 2 casillas para intercambiarlas</span>
          <button
            onClick={handleFinishReorder}
            className="bg-accent text-bg font-bold text-xs px-3 py-1 rounded-full shadow hover:brightness-110 active:scale-95 transition-all"
          >
            Listo
          </button>
        </div>
      )}

      {/* Page indicator dots if multiple pages (hidden when reordering) */}
      {!isReordering && pages.length > 1 && (
        <div className="absolute bottom-1 left-0 right-0 flex justify-center items-center gap-1.5 py-1 z-10">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePageId(p.id)}
              className={`w-2 h-2 rounded-full transition-all ${
                p.id === currentPage?.id
                  ? 'w-5 bg-accent'
                  : 'bg-muted/40 hover:bg-muted'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
