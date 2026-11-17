import React from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';

interface StepButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const StepButton: React.FC<StepButtonProps> = ({ label, disabled = false, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`w-8 h-8 shrink-0 rounded-lg border flex items-center justify-center transition-colors ${
      disabled
        ? 'border-border/40 bg-surface/40 text-muted/30'
        : 'border-border bg-surface-2 text-muted hover:text-text hover:border-accent active:scale-95'
    }`}
  >
    {children}
  </button>
);

/**
 * Deck footer: steps through the pages of the active profile and through the
 * profiles themselves. Switching profile here is temporary (it never pins), so
 * the automatic profile switching keeps working.
 */
export const DeckNav: React.FC = () => {
  const { config, getActiveProfile, activePageId, setActivePageId, activeProfileId, pinned, triggerHaptic } =
    useDeckStore();

  const profile = getActiveProfile();
  const pages = profile?.pages || [];
  const profiles = config?.profiles || [];

  const pageIndex = Math.max(0, pages.findIndex((p) => p.id === activePageId));
  const page = pages[pageIndex];

  const stepPage = (delta: number) => {
    if (pages.length < 2) return;
    triggerHaptic();
    const next = (((pageIndex + delta) % pages.length) + pages.length) % pages.length;
    setActivePageId(pages[next].id);
  };

  const stepProfile = (delta: number) => {
    if (profiles.length < 2) return;
    const index = Math.max(0, profiles.findIndex((p) => p.id === activeProfileId));
    const next = (((index + delta) % profiles.length) + profiles.length) % profiles.length;
    deckSocket.selectProfile(profiles[next].id);
  };

  return (
    <nav
      className="flex items-center justify-between gap-2 px-1 pb-1 shrink-0 select-none"
      aria-label="Navegación de la botonera"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <StepButton label="Página anterior" disabled={pages.length < 2} onClick={() => stepPage(-1)}>
          <ChevronLeft size={16} />
        </StepButton>
        <span className="text-[11px] text-muted truncate max-w-[120px]">
          {page?.name || 'Página'}
          {pages.length > 1 && (
            <span className="font-mono text-muted/70"> {pageIndex + 1}/{pages.length}</span>
          )}
        </span>
        <StepButton label="Página siguiente" disabled={pages.length < 2} onClick={() => stepPage(1)}>
          <ChevronRight size={16} />
        </StepButton>
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <StepButton label="Perfil anterior" disabled={profiles.length < 2} onClick={() => stepProfile(-1)}>
          <ChevronLeft size={16} />
        </StepButton>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-text min-w-0 max-w-[130px]">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: profile?.accent || '#00FF9C' }}
          />
          <span className="truncate">{profile?.name || 'Global'}</span>
          {pinned && <Lock size={10} className="text-accent shrink-0" />}
        </span>
        <StepButton label="Perfil siguiente" disabled={profiles.length < 2} onClick={() => stepProfile(1)}>
          <ChevronRight size={16} />
        </StepButton>
      </div>
    </nav>
  );
};
