import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
