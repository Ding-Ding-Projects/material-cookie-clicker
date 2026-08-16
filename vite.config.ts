import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This scaffold intentionally omits the packaged-release-manifest plugin the
// template ships, because it is coupled to a generated changelog module that
// belongs to a different lane's app features. Add it back here once that
// module exists, rather than shipping a build that imports a file nobody owns
// yet.
export default defineConfig({
  root: '.',
  plugins: [react()],
  base: './',
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false,
  },
});
