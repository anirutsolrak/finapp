import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // .claude/worktrees guarda cópias antigas do repo, com os próprios testes
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
})
