import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// L'app est publiée sur GitHub Pages, sous https://django184.github.io/panier-temoin/
const BASE = '/panier-temoin/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // Mise à jour proposée par un bandeau, jamais imposée en pleine saisie.
      registerType: 'prompt',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Panier Témoin',
        short_name: 'Panier Témoin',
        description: 'Suivre l’évolution des prix de supermarché à partir de vos tickets de caisse.',
        lang: 'fr-CH',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F8F6',
        theme_color: '#1F2A3A',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Le moteur OCR (plusieurs Mo) n'est pas pré-chargé : il est mis en
        // cache au premier ticket lu, puis disponible hors connexion.
        globIgnores: ['ocr/**'],
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [
          {
            // Une expression régulière, pas une fonction : Workbox recopie
            // ce motif tel quel dans le service worker, où les variables
            // de ce fichier n'existent pas.
            urlPattern: /\/panier-temoin\/ocr\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'moteur-ocr',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
