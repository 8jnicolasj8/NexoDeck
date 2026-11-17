import React, { useState } from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { deckSocket } from '../ws/deckSocket';
import { Wifi, Vibrate, Sun, Maximize, Trash2, Check } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    connectionState,
    ping,
    isOled,
    setOled,
    hapticLevel,
    setHapticLevel,
    triggerHaptic,
  } = useDeckStore();

  const [customHost, setCustomHost] = useState(
    localStorage.getItem('opendeck_host') || window.location.host
  );
  const [hostSaved, setHostSaved] = useState(false);
  const [dimTimeout, setDimTimeout] = useState(
    localStorage.getItem('opendeck_dim_timeout') || '3'
  );
  const [bootAnimEnabled, setBootAnimEnabled] = useState(
    localStorage.getItem('opendeck_boot_anim') !== 'false'
  );
  const [vibrateAlerts, setVibrateAlerts] = useState(
    localStorage.getItem('opendeck_vibrate_alerts') !== 'false'
  );

  const handleSetDimTimeout = (val: string) => {
    localStorage.setItem('opendeck_dim_timeout', val);
    setDimTimeout(val);
    triggerHaptic();
  };

  const handleToggleBootAnim = () => {
    const next = !bootAnimEnabled;
    localStorage.setItem('opendeck_boot_anim', String(next));
    setBootAnimEnabled(next);
    triggerHaptic();
  };

  const handleToggleVibrateAlerts = () => {
    const next = !vibrateAlerts;
    localStorage.setItem('opendeck_vibrate_alerts', String(next));
    setVibrateAlerts(next);
    triggerHaptic();
  };

  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSentinel, setWakeLockSentinel] = useState<any>(null);

  const handleSaveHost = () => {
    localStorage.setItem('opendeck_host', customHost.trim());
    setHostSaved(true);
    setTimeout(() => setHostSaved(false), 2000);
    deckSocket.connect();
  };

  const handleUnpair = () => {
    if (window.confirm('¿Desvincular este celular de la PC? Vas a tener que volver a escanear el QR.')) {
      localStorage.removeItem('opendeck_token');
      localStorage.removeItem('opendeck_host');
      window.location.reload();
    }
  };

  const toggleWakeLock = async () => {
    triggerHaptic();
    if (!('wakeLock' in navigator)) {
      alert('Tu navegador no soporta Screen Wake Lock (requiere HTTPS).');
      return;
    }

    try {
      if (wakeLockActive && wakeLockSentinel) {
        await wakeLockSentinel.release();
        setWakeLockSentinel(null);
        setWakeLockActive(false);
      } else {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
          setWakeLockActive(false);
          setWakeLockSentinel(null);
        });
        setWakeLockSentinel(sentinel);
        setWakeLockActive(true);
      }
    } catch {
      setWakeLockActive(false);
    }
  };

  const toggleFullscreen = () => {
    triggerHaptic();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto p-4 flex flex-col gap-5 max-w-xl mx-auto select-none">
      <h2 className="text-lg font-bold text-text">Ajustes</h2>

      {/* 1. Conexión */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Wifi size={16} className="text-accent" />
          Conexión
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Host / IP del servidor</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customHost}
              onChange={(e) => setCustomHost(e.target.value)}
              placeholder="192.168.1.100:47800"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleSaveHost}
              className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border hover:border-accent text-xs font-semibold text-text flex items-center gap-1 transition-colors"
            >
              {hostSaved ? <Check size={14} className="text-accent" /> : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
          <span className="text-muted">Estado actual</span>
          <span className="font-semibold text-text flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  connectionState === 'connected'
                    ? '#00FF9C'
                    : connectionState === 'reconnecting'
                    ? '#FFB020'
                    : '#FF3B4E',
              }}
            />
            {connectionState === 'connected' ? `Conectado (${ping} ms)` : connectionState === 'reconnecting' ? 'Reconectando' : 'Sin conexión'}
          </span>
        </div>

        <button
          onClick={handleUnpair}
          className="mt-2 text-xs text-danger/80 hover:text-danger flex items-center gap-1.5 self-start transition-colors"
        >
          <Trash2 size={13} />
          Desvincular este dispositivo
        </button>
      </section>

      {/* 2. Háptico */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Vibrate size={16} className="text-accent" />
          Respuesta háptica
        </h3>
        <p className="text-xs text-muted">
          Vibración táctil al presionar botones y controles.
        </p>

        <div className="grid grid-cols-4 gap-2">
          {(['off', 'low', 'med', 'high'] as const).map((level) => {
            const labels = { off: 'Apagado', low: 'Bajo', med: 'Medio', high: 'Alto' };
            const isSelected = hapticLevel === level;
            return (
              <button
                key={level}
                onClick={() => {
                  setHapticLevel(level);
                  triggerHaptic();
                }}
                className={`py-2 px-1 rounded-lg border text-xs font-semibold transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-surface-2 text-muted hover:text-text'
                }`}
              >
                {labels[level]}
              </button>
            );
          })}
        </div>

        {/* Vibrate on temperature alerts */}
        <div className="flex items-center justify-between py-1 border-t border-border mt-1">
          <div>
            <h4 className="text-xs font-semibold text-text">Vibrar en alertas de temperatura</h4>
            <p className="text-[11px] text-muted">Patrón fuerte si la CPU o GPU supera los 85 °C.</p>
          </div>
          <button
            onClick={handleToggleVibrateAlerts}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
              vibrateAlerts ? 'bg-accent' : 'bg-surface-2 border border-border'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                vibrateAlerts ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>

      {/* 3. Pantalla */}
      <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Sun size={16} className="text-accent" />
          Pantalla
        </h3>

        {/* OLED Mode */}
        <div className="flex items-center justify-between py-1">
          <div>
            <h4 className="text-xs font-semibold text-text">Modo OLED</h4>
            <p className="text-[11px] text-muted">Fondo negro puro (#000), ahorra batería.</p>
          </div>
          <button
            onClick={() => setOled(!isOled)}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
              isOled ? 'bg-accent' : 'bg-surface-2 border border-border'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                isOled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Wake Lock */}
        <div className="flex items-center justify-between py-1 border-t border-border">
          <div>
            <h4 className="text-xs font-semibold text-text">Mantener pantalla encendida</h4>
            <p className="text-[11px] text-muted">Evita que el celular se apague o bloquee.</p>
          </div>
          <button
            onClick={toggleWakeLock}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
              wakeLockActive ? 'bg-accent' : 'bg-surface-2 border border-border'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                wakeLockActive ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Inactivity Dimming */}
        <div className="flex flex-col gap-2 py-1 border-t border-border">
          <div>
            <h4 className="text-xs font-semibold text-text">Atenuar tras inactividad</h4>
            <p className="text-[11px] text-muted">Atenúa la pantalla al 15% para ahorrar energía.</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'never', label: 'Nunca' },
              { id: '1', label: '1 min' },
              { id: '3', label: '3 min' },
              { id: '5', label: '5 min' },
            ].map((opt) => {
              const isSelected = dimTimeout === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleSetDimTimeout(opt.id)}
                  className={`py-1.5 px-1 rounded-lg border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Boot animation toggle */}
        <div className="flex items-center justify-between py-1 border-t border-border">
          <div>
            <h4 className="text-xs font-semibold text-text">Animación de arranque</h4>
            <p className="text-[11px] text-muted">Secuencia tipo terminal al iniciar sesión.</p>
          </div>
          <button
            onClick={handleToggleBootAnim}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
              bootAnimEnabled ? 'bg-accent' : 'bg-surface-2 border border-border'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                bootAnimEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="mt-1 p-2.5 rounded-lg border border-border bg-surface-2 hover:border-accent text-xs font-semibold text-text flex items-center justify-center gap-2 transition-colors"
        >
          <Maximize size={14} />
          Pantalla completa
        </button>
      </section>
    </div>
  );
};
