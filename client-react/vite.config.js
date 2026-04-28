
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false, // allow fallback to next available port
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    chunkSizeWarningLimit: 500, // 500kb
    assetsInlineLimit: 0,
  },
});