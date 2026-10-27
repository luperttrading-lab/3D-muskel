import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative Pfade, damit der Build auf jedem statischen HTTPS-Host (Netlify, GitHub Pages, Unterordner) läuft.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: ['es2022', 'safari16'],
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
