import React, { useState } from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import {
  Copy,
  Send,
  Power,
  RotateCcw,
  Moon,
  Lock,
  Headphones,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  FileCode,
  Check,
} from 'lucide-react';

export const UtilsView: React.FC = () => {
  const {
    triggerHaptic,
    clipboardLast,
    clipboardHistory,
    nowPlaying,
    config,
  } = useDeckStore();

  const [inputText, setInputText] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const copyToMobile = (text: string) => {
    triggerHaptic();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 1500);
      });
    } else {
      // Non-HTTPS fallback from Blueprint Section 8.4
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 1500);
      } catch { }
      document.body.removeChild(textarea);
    }
  };

  const handleSendToPC = (paste = false) => {
    if (!inputText.trim()) return;
    triggerHaptic();
    deckSocket.send({
      v: 1,
      t: 'clipboard.send',
      d: { text: inputText, paste },
    });
    setInputText('');
  };

  const handleSystemAction = (cmd: string) => {
    triggerHaptic();
    deckSocket.send({
      v: 1,
      t: 'action',
      d: {
        buttonId: `quick_power_${cmd}`,
        value: { cmd, confirmed: true },
      },
    });
  };

  const handleMediaCmd = (cmd: string) => {
    triggerHaptic();
    deckSocket.send({
      v: 1,
      t: 'action',
      d: {
        type: 'media',
        target: cmd,
      },
    });
  };

  const handleRunScript = (scriptId: string) => {
    triggerHaptic();
    deckSocket.send({
      v: 1,
      t: 'action',
      d: {
        type: 'script.run',
        params: { id: scriptId },
      },
    });
  };

  return (
    <div className="w-full h-full overflow-y-auto p-4 flex flex-col gap-5 max-w-2xl mx-auto select-none">
      <h2 className="text-lg font-bold text-text">Utilidades</h2>

      {/* 1. Portapapeles Bidireccional */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Copy size={16} className="text-accent" />
            Portapapeles bidireccional
          </span>
          {copiedSuccess && (
            <span className="text-xs text-accent flex items-center gap-1 font-normal">
              <Check size={13} /> ¡Copiado al celu!
            </span>
          )}
        </h3>

        {/* PC -> Celular: Último texto copiado en la PC */}
        {clipboardLast ? (
          <div className="p-3 rounded-lg border border-border bg-surface-2 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>Copiado en la PC:</span>
              <button
                onClick={() => copyToMobile(clipboardLast)}
                className="px-2 py-0.5 rounded bg-accent/20 hover:bg-accent/30 text-accent font-semibold transition-colors flex items-center gap-1"
              >
                <Copy size={11} /> Copiar al celular
              </button>
            </div>
            <p className="text-xs text-text font-mono break-all line-clamp-3">
              {clipboardLast}
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-border/40 bg-surface-2/40 text-xs text-muted italic">
            Copiá algo en la PC para verlo acá inmediatamente.
          </div>
        )}

        {/* Historial de últimos 10 */}
        {clipboardHistory.length > 1 && (
          <div className="flex flex-col gap-1.5 mt-1">
            <span className="text-[11px] text-muted font-medium">Historial reciente:</span>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {clipboardHistory.slice(1, 10).map((item, idx) => (
                <div
                  key={`${item.ts}-${idx}`}
                  onClick={() => setInputText(item.text)}
                  className="p-1.5 rounded border border-border/60 bg-surface-2/60 hover:border-accent text-left text-[11px] text-text font-mono truncate cursor-pointer transition-colors"
                  title="Click para usar en el cuadro de envío"
                >
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Celular -> PC: Envío de texto */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Escribí o pegá texto acá para enviarlo a la PC…"
            rows={2}
            className="w-full bg-surface-2 border border-border rounded-lg p-2.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent resize-none font-mono"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => handleSendToPC(false)}
              disabled={!inputText.trim()}
              className="px-3 py-1.5 rounded-lg border border-border bg-surface-2 hover:border-accent text-xs font-semibold text-text disabled:opacity-40 flex items-center gap-1.5 transition-colors"
            >
              <Send size={13} />
              Enviar a PC
            </button>
            <button
              onClick={() => handleSendToPC(true)}
              disabled={!inputText.trim()}
              className="px-3 py-1.5 rounded-lg bg-accent text-bg font-semibold text-xs hover:brightness-110 disabled:opacity-40 flex items-center gap-1.5 transition-all"
            >
              <Send size={13} />
              Enviar y pegar (Ctrl+V)
            </button>
          </div>
        </div>
      </section>

      {/* 2. Multimedia / Now Playing */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Music size={16} className="text-accent" />
          Reproducción actual
        </h3>

        {nowPlaying && (nowPlaying.title || nowPlaying.artist) ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-2">
            {nowPlaying.artUrl ? (
              <img
                src={nowPlaying.artUrl}
                alt="Portada"
                className="w-12 h-12 rounded object-cover border border-border"
              />
            ) : (
              <div className="w-12 h-12 rounded bg-surface border border-border flex items-center justify-center text-muted">
                <Music size={20} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-text truncate">
                {nowPlaying.title || 'Desconocido'}
              </h4>
              <p className="text-[11px] text-muted truncate">
                {nowPlaying.artist || 'Artista'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleMediaCmd('prev')}
                className="p-2 rounded-lg hover:bg-surface text-muted hover:text-text transition-colors"
              >
                <SkipBack size={16} />
              </button>
              <button
                onClick={() => handleMediaCmd('playpause')}
                className="p-2 rounded-lg bg-accent text-bg hover:brightness-110 transition-all"
              >
                {nowPlaying.playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                onClick={() => handleMediaCmd('next')}
                className="p-2 rounded-lg hover:bg-surface text-muted hover:text-text transition-colors"
              >
                <SkipForward size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-border/40 bg-surface-2/40 text-xs text-muted flex items-center justify-between">
            <span>Sin reproducción activa en Windows.</span>
            <button
              onClick={() => handleMediaCmd('playpause')}
              className="px-2.5 py-1 rounded bg-surface border border-border hover:border-accent text-xs text-text transition-colors flex items-center gap-1"
            >
              <Play size={12} /> Reanudar
            </button>
          </div>
        )}
      </section>

      {/* 3. Acciones Rápidas del Sistema */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text">Acciones del sistema</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <button
            onClick={() => handleSystemAction('lock')}
            className="p-3 rounded-lg border border-border bg-surface-2 hover:border-accent text-left flex items-center gap-2.5 text-xs text-text transition-colors"
          >
            <Lock size={16} className="text-accent" />
            <span>Bloquear PC</span>
          </button>

          <button
            onClick={() => handleSystemAction('sleep')}
            className="p-3 rounded-lg border border-border bg-surface-2 hover:border-accent text-left flex items-center gap-2.5 text-xs text-text transition-colors"
          >
            <Moon size={16} className="text-accent-alt" />
            <span>Suspender</span>
          </button>

          <button
            onClick={() => deckSocket.sendAction('quick_audio_cycle')}
            className="p-3 rounded-lg border border-border bg-surface-2 hover:border-accent text-left flex items-center gap-2.5 text-xs text-text transition-colors"
          >
            <Headphones size={16} className="text-warn" />
            <span>Cambiar audio</span>
          </button>

          <button
            onClick={() => deckSocket.sendAction('quick_mute_all')}
            className="p-3 rounded-lg border border-border bg-surface-2 hover:border-accent text-left flex items-center gap-2.5 text-xs text-text transition-colors"
          >
            <VolumeX size={16} className="text-danger" />
            <span>Mutear todo</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm('¿Reiniciar la PC? (Se inicia cuenta regresiva de 5 s)')) {
                handleSystemAction('restart');
              }
            }}
            className="p-3 rounded-lg border border-border bg-surface-2 hover:border-danger text-left flex items-center gap-2.5 text-xs text-text transition-colors"
          >
            <RotateCcw size={16} className="text-warn" />
            <span>Reiniciar PC</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm('¿Apagar la PC? (Se inicia cuenta regresiva de 5 s)')) {
                handleSystemAction('shutdown');
              }
            }}
            className="p-3 rounded-lg border border-border bg-surface-2 hover:border-danger text-left flex items-center gap-2.5 text-xs text-text transition-colors"
          >
            <Power size={16} className="text-danger" />
            <span>Apagar PC</span>
          </button>
        </div>
      </section>

      {/* 4. Scripts Whitelist */}
      {config?.scripts && config.scripts.length > 0 && (
        <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text flex items-center gap-2">
            <FileCode size={16} className="text-accent" />
            Scripts (.vbs autorizados)
          </h3>
          <div className="flex flex-col gap-2">
            {config.scripts.map((script) => (
              <div
                key={script.id}
                className="p-2.5 rounded-lg border border-border bg-surface-2 flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-semibold text-text">{script.name}</h4>
                  <p className="text-[11px] text-muted font-mono">{script.file}</p>
                </div>
                <button
                  onClick={() => handleRunScript(script.id)}
                  className="px-3 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent font-semibold text-xs transition-colors"
                >
                  Ejecutar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
