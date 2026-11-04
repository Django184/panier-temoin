import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

// L'app est publiée à la racine de https://panier-temoin.pages.dev (Cloudflare Pages, D-004, D-013).
// Jusqu'en 0.6.0 : GitHub Pages, sous https://django184.github.io/panier-temoin/ (voir passeur/).
const BASE = '/';

// Version de l'app : une seule source, package.json (affichée dans Réglages).
const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

// Politique de sécurité du contenu (ECOSYSTEME.md §8.3, D-009), au build seulement (le serveur
// de développement de Vite injecte des scripts en ligne). Une seule source pour deux usages :
// la balise <meta> (vérifiée en CI par « vite preview ») et l'en-tête HTTP du fichier _headers
// servi par Cloudflare, qui ajoute frame-ancestors (sans effet en <meta>).
const SUPABASE = 'tpovnthrvlajmyjrfltn.supabase.co';
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' https://${SUPABASE} wss://${SUPABASE}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const EN_TETES = `# En-têtes HTTP servis par Cloudflare Pages (généré par vite.config.ts)
/*
  Content-Security-Policy: ${CSP}; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()

/sw.js
  Cache-Control: no-cache
`;

// Version servie, lue par la CI pour savoir quand la publication est en ligne.
const COMMIT = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);

function politiqueDeSecurite(): Plugin {
  return {
    name: 'politique-de-securite',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head' },
    ],
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: EN_TETES });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION, commit: COMMIT }) + '\n' });
    },
  };
}

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [
    react(),
    politiqueDeSecurite(),
    VitePWA({
      // Mise à jour proposée par un bandeau, jamais imposée en pleine saisie.
      registerType: 'prompt',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Panier Témoin',
        short_name: 'Panier Témoin',
        description: 'Suivre l’évolution des prix de supermarché à partir de vos tickets de caisse.',
        lang: 'fr-CH',
        id: BASE,
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
