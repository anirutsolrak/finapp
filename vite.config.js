import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'FinançasFamília',
        short_name: 'Finanças',
        description: 'Controle financeiro familiar',
        theme_color: '#10b981',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/pwa-64x64.png',            sizes: '64x64',   type: 'image/png' },
          { src: '/pwa-192x192.png',           sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png',           sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', networkTimeoutSeconds: 10 },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react'
          if (id.includes('supabase')) return 'vendor-supabase'
          if (id.includes('recharts') || id.includes('d3')) return 'vendor-charts'
          if (id.includes('date-fns')) return 'vendor-date'
        }
      }
    }
  }
})
