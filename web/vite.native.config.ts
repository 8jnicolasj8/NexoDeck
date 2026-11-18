import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build for the Android WebView: relative URLs, no service worker, no manifest.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-native'),
    emptyOutDir: true,
    assetsDir: 'assets',
  },
});
