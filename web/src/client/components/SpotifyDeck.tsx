import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { DeckButton } from './DeckButton';
import { Music } from 'lucide-react';

interface SpotifyDeckProps {
  isLandscape: boolean;
}

/**
 * Fixed layout of the built-in Spotify profile: the current song on top (album
 * art as background when Windows exposes it) and a small deck at the bottom.
 */
export const SpotifyDeck: React.FC<SpotifyDeckProps> = ({ isLandscape }) => {
  const { getActiveProfile, activePageId, nowPlaying, connectionState } = useDeckStore();
  const profile = getActiveProfile();
  const pages = profile?.pages || [];
  const page = pages.find((item) => item.id === activePageId) || pages[0];
  const buttons = [...(page?.buttons || [])].sort((a, b) => a.pos.col - b.pos.col);

  const art = nowPlaying?.artUrl || null;
  const title = nowPlaying?.title?.trim() || '';
  const artist = nowPlaying?.artist?.trim() || '';
  const playing = Boolean(nowPlaying?.playing);
  const hasSong = Boolean(title || artist);
  const buttonSize = isLandscape ? 54 : 58;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-bg/60 via-bg/80 to-bg/95" />

      <div className="relative w-full h-full flex flex-col px-4 pt-4 pb-3">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-accent font-semibold">
            {playing ? 'Reproduciendo' : 'Spotify'}
          </span>
          {hasSong ? (
            <>
              <h2 className="text-xl font-bold text-text leading-tight line-clamp-2 max-w-[22rem]">
                {title || 'Sin título'}
              </h2>
              <p className="text-sm text-muted truncate max-w-[20rem]">{artist || 'Artista desconocido'}</p>
            </>
          ) : (
            <>
              <Music size={28} className="text-muted" />
              <p className="text-sm text-muted">Abrí Spotify y poné una canción.</p>
            </>
          )}
        </div>

        <div className="shrink-0 w-full flex items-center justify-center gap-2.5 pb-1">
          {buttons.map((button) => (
            <DeckButton
              key={button.id}
              button={button}
              size={buttonSize}
              disabled={connectionState === 'offline'}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
