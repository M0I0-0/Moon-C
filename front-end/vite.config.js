import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Los datos del manual (protocols.json, keywords.json, crew.json) se leen
// directamente de ../shared, y el personaje Moon-C de ../Model3D, para que
// exista una sola fuente de verdad.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      '@model3d': fileURLToPath(new URL('../Model3D', import.meta.url)),
      // Model3D/moonc/maniobras.js importa 'three/addons/...' pero vive fuera de front-end/ (sin node_modules propio).
      'three/addons': fileURLToPath(new URL('./node_modules/three/examples/jsm', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
  },
})
