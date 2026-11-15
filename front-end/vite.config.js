import { fileURLToPath, URL } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))
const shared = fileURLToPath(new URL('../shared', import.meta.url))
const model3d = fileURLToPath(new URL('../Model3D', import.meta.url))

// Los datos del manual (protocols.json, keywords.json, crew.json) se leen
// directamente de ../shared, y el personaje Moon-C de ../Model3D, para que
// exista una sola fuente de verdad.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': shared,
      '@model3d': model3d,
      // Model3D/moonc/maniobras.js importa 'three/addons/...' pero vive fuera de front-end/ (sin node_modules propio).
      'three/addons': fileURLToPath(new URL('./node_modules/three/examples/jsm', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Solo front-end/, ../shared y ../Model3D. Nunca el resto del repo (por ejemplo
    // Backend/storage, que guarda las mediciones de la tripulación).
    fs: { allow: [searchForWorkspaceRoot(root), shared, model3d] },
  },
})
