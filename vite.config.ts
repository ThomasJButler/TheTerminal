import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// BASE_PATH lets the same build serve from a domain root ('/') or a project sub-path
// ('/tjb-vt100/'). Every URL in the app goes through import.meta.env.BASE_URL.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist', manifest: true },
  server: { port: 3000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
