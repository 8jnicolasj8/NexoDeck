/**
 * Migración única de las claves de almacenamiento de NexoDeck a VexaDeck.
 * Se ejecuta antes de que el store lea localStorage.
 */
const PREFIX = 'vexadeck_';
const LEGACY_PREFIX = 'nexodeck_';

function migrate(storage: Storage): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(LEGACY_PREFIX)) keys.push(key);
  }

  for (const key of keys) {
    const next = PREFIX + key.slice(LEGACY_PREFIX.length);
    if (storage.getItem(next) === null) {
      const value = storage.getItem(key);
      if (value !== null) storage.setItem(next, value);
    }
    storage.removeItem(key);
  }
}

try {
  migrate(localStorage);
  migrate(sessionStorage);
} catch {
  // El almacenamiento puede estar bloqueado (modo privado); la app usa los valores por defecto.
}
