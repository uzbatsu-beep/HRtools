import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // В режиме dev всегда отдаем с корня '/', чтобы Tauri devUrl (http://localhost:5173) сразу отвечал 200 OK.
  // При сборке: относительный путь './' для Tauri и локального запуска, либо '/HRtools/' для GitHub Pages.
  base: command === 'serve' 
    ? '/' 
    : (process.env.GITHUB_ACTIONS && !process.env.TAURI_ENV_PLATFORM ? '/HRtools/' : './'),
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
}));
