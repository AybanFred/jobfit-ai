/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    legacy(),
    // Makes the app installable on the iPhone ("Add to Home Screen") and gives it a service worker.
    // Only the app shell (pages, scripts, icons) is cached, so it opens fast.
    // Resume and job data is NOT cached: it always comes live from the API and Supabase.
    VitePWA({
      registerType: 'autoUpdate', // a new deploy replaces the old version on the next visit
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'VantixFit AI',
        short_name: 'VantixFit',
        description: 'Paste a job description and get a tailored, ATS-friendly resume and cover letter from your real experience.',
        theme_color: '#6366F1',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
})
