const themeColor = name => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries([
        'canvas', 'panel', 'subtle', 'raised', 'line', 'line-strong',
        'ink', 'ink-soft', 'muted', 'faint', 'on-accent', 'accent', 'accent-strong',
        'accent-fill', 'accent-hover', 'accent-tint', 'accent-end',
        'danger', 'danger-fill', 'danger-tint', 'warning', 'warning-fill', 'success'
      ].map(name => [name, themeColor(name)])),
      boxShadow: { surface: 'var(--surface-shadow)' },
    },
  },
  plugins: [],
};
