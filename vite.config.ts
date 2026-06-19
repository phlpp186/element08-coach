import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom domain (coach.element08.io) lives at the root, so base is '/'.
// If we ever switch to a project-page URL like phlpp186.github.io/element08-coach
// flip this to '/element08-coach/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
