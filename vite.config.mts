import { defineConfig } from 'vite'
import path from "path"
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    allowedHosts: true,
  },
  define: {
    // Define Node.js globals for the agents package
    global: 'globalThis',
  },
})