export interface Settings {
  phosphor: 'green' | 'amber' | 'white';
  cols: 80 | 132;
  rain: boolean;
  scanlines: boolean;
  /** Everything audible. Off until someone asks for it. */
  sound: boolean;
  /** The VT100 had a keyclick setting in SET-UP B. So does this. */
  keyclick: boolean;
  /** Whether the operator reads its answers out. */
  voice: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  phosphor: 'green',
  cols: 80,
  rain: true,
  scanlines: true,
  sound: false,
  keyclick: true,
  voice: false,
};

const KEY = 'tjb100.settings';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode, or storage disabled: it just does not persist. */
  }
}

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(KEY, {}) });
export const saveSettings = (settings: Settings) => save(KEY, settings);
