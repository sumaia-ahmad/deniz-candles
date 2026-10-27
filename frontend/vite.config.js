import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // During development, forward API and image requests to the Flask server.
    proxy: {
      '/api': 'http://localhost:5000',
      '/static': 'http://localhost:5000',
    },
  },
})
