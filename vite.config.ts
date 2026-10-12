import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Served from a GitHub Pages project site (https://<user>.github.io/cash4stuff/)
// in production, but from the root locally.
const base = process.env.GITHUB_PAGES ? '/cash4stuff/' : '/'

// The receipt reader's engine and English data, served from the app itself
// (rather than a third-party CDN) under ocr/. Only fetched when a receipt is
// read, then kept for offline use - too big to precache with the app.
const OCR_FILES: [string, string][] = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
]

function copyOcrFiles(): Plugin {
  let outDir = 'dist'
  return {
    name: 'copy-ocr-files',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    writeBundle() {
      mkdirSync(join(outDir, 'ocr'), { recursive: true })
      for (const [from, to] of OCR_FILES) copyFileSync(from, join(outDir, 'ocr', to))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    copyOcrFiles(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Wardrobe to Wallet',
        short_name: 'Wardrobe2Wallet',
        description: 'Track pickups, stock, sales and running costs for a resale clothing business.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#c93766',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app shell is bundled at build time and data lives on the
        // device (localStorage + IndexedDB for photos), so precache it all to
        // keep the app working offline after the first load.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        globIgnores: ['ocr/**'],
        // Opens the app when a Diary trip notification is tapped.
        importScripts: ['sw-notify.js'],
        // The logo font, so the wordmark still looks right offline.
        runtimeCaching: [
          {
            urlPattern: /\/ocr\//,
            handler: 'CacheFirst',
            options: { cacheName: 'receipt-reader', expiration: { maxEntries: 10 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
})
