import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { palettes, readAppearance, saveAppearance, type Appearance, type Palette } from '../theme';

export function AppearanceSettings() {
  const [appearance, setAppearance] = useState(readAppearance);

  function update(patch: Partial<Appearance>) {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    saveAppearance(next);
  }

  return (
    <section aria-labelledby="appearance-title" className="mt-6 space-y-3 rounded-xl border border-line bg-panel p-3 shadow-surface">
      <h2 id="appearance-title" className="text-xs font-semibold text-ink">Оформление</h2>
      <div role="group" aria-label="Тема" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas p-1">
        {([
          ['light', 'Светлая', Sun],
          ['dark', 'Тёмная', Moon],
        ] as const).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={appearance.mode === mode}
            onClick={() => update({ mode })}
            className={`flex items-center justify-center gap-1.5 rounded-md px-1 py-1.5 text-xs font-medium ${
              appearance.mode === mode ? 'bg-accent-fill/15 text-accent-strong' : 'text-muted hover:bg-subtle'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[11px] text-muted">Цветовая схема</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(palettes) as Palette[]).map(palette => (
            <label key={palette} className="cursor-pointer">
              <input
                type="radio"
                name="appearance-palette"
                value={palette}
                checked={appearance.palette === palette}
                onChange={() => update({ palette })}
                className="peer sr-only"
              />
              <span className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-[11px] text-muted hover:bg-subtle peer-checked:border-accent peer-checked:bg-accent-fill/10 peer-checked:font-semibold peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                <span aria-hidden="true" className="palette-swatch h-2.5 w-2.5 shrink-0 rounded-full" data-palette={palette} />
                {palettes[palette]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
