import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset paths so the site works from a GitHub Pages sub-path
  // (https://<user>.github.io/Mono-Music/). Routing is hash-based, so no
  // server rewrites are needed.
  base: './',
  plugins: [react(), tailwindcss()],
})
