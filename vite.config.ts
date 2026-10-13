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
        // Appui long sur l'icône (Android) : accès direct à la caisse.
        shortcuts: [
          {
            name: 'Carte Cumulus',
            short_name: 'Cumulus',
            url: `${BASE}#/cumulus`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Liste de courses',
            short_name: 'Courses',
            url: `${BASE}#/courses`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
      },
    }),
  ],
});
