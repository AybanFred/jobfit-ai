import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Run `npm run generate-pwa-assets` to rebuild the PNG icons from public/icon.svg.
// The icon is a full square, so the maskable and Apple icons are filled with the brand colour
// instead of white (no white border around the logo on the iPhone home screen).
const brand = '#6366F1'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: brand } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: brand } },
  },
  images: ['public/icon.svg'],
})
