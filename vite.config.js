import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';

const sentrySourceMapsEnabled =
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT &&
  process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  plugins: [
    sentrySourceMapsEnabled &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        sourcemaps: {
          assets: './dist/**',
          filesToDeleteAfterUpload: './dist/**/*.map',
        },
      }),
  ].filter(Boolean),
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
        ws: true,
      },
    },
  },
});
