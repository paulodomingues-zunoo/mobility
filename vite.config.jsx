import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite' // or '@tailwindcss/postcss'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
})


