import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/') ||
              id.includes('/use-sync-external-store/')
            ) {
              return 'vendor-react';
            }

            if (
              id.includes('/recharts/') ||
              id.includes('/victory-vendor/') ||
              id.includes('/d3-') ||
              id.includes('/internmap/')
            ) {
              return 'vendor-charts';
            }

            if (
              id.includes('/motion/') ||
              id.includes('/framer-motion/') ||
              id.includes('/motion-dom/') ||
              id.includes('/motion-utils/')
            ) {
              return 'vendor-motion';
            }

            if (id.includes('/@tanstack/')) {
              return 'vendor-query';
            }

            if (id.includes('/lucide-react/')) {
              return 'vendor-icons';
            }

            return 'vendor-misc';
          },
        },
      },
    },
  };
});
