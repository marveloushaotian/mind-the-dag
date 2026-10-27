import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://marveloushaotian.github.io/mind-the-dag/
export default defineConfig({
  base: '/mind-the-dag/',
  plugins: [react()],
  test: { environment: 'node' },
} as never);
