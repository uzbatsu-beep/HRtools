export const palettes = {
  emerald: 'Изумруд',
  ocean: 'Океан',
  lavender: 'Лаванда',
  graphite: 'Графит',
} as const;

export type ThemeMode = 'light' | 'dark';
export type Palette = keyof typeof palettes;
export type Appearance = { mode: ThemeMode; palette: Palette };

const storageKey = 'hrtools.appearance';
const defaultAppearance: Appearance = { mode: 'dark', palette: 'emerald' };

export function readAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    return {
      mode: saved?.mode === 'light' ? 'light' : defaultAppearance.mode,
      palette: typeof saved?.palette === 'string' && Object.prototype.hasOwnProperty.call(palettes, saved.palette)
        ? saved.palette as Palette
        : defaultAppearance.palette,
    };
  } catch {
    return defaultAppearance;
  }
}

export function applyAppearance({ mode, palette }: Appearance) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.dataset.palette = palette;
}

export function saveAppearance(appearance: Appearance) {
  applyAppearance(appearance);
  try {
    localStorage.setItem(storageKey, JSON.stringify(appearance));
  } catch {
    // The selected appearance still applies in this session if storage is unavailable.
  }
}
