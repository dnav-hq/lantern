import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The deploy's commit, for telemetry. It is the single highest-value field in
// the payload: it is what lets HQ correlate an error spike with the deploy that
// caused it, which ties telemetry to Ship.
//
// Cloudflare Pages sets CF_PAGES_COMMIT_SHA in the build environment. The local
// fallbacks keep `npm run build` working anywhere; empty in dev, where the
// field is simply omitted rather than sent as a lie.
const commitSha =
  process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? ''

export default defineConfig({
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha.slice(0, 40))
  },
  build: {
    // 'hidden', NOT true. Both emit .map files; only 'hidden' omits the
    // `//# sourceMappingURL=` comment from the JS. That matters because the
    // maps are uploaded to private storage and then DELETED from dist/ by
    // scripts/upload-sourcemaps.mjs before deploy — with plain `true`, every
    // deployed bundle would carry a pointer to a file that either 404s (after
    // deletion) or, far worse, resolves (if deletion ever regressed) and
    // publishes the app's source. 'hidden' means nothing ever points at them.
    sourcemap: 'hidden'
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // App-shell precache; scripture/notes caching is handled by our own
      // IndexedDB layers (src/bible/cache.ts, src/offline/mirror.ts), not the
      // service worker's runtime cache.
      workbox: {
        // Workbox generates its OWN maps for sw.js/workbox-*.js and writes
        // sourceMappingURL comments into them, independently of the top-level
        // build.sourcemap setting. Caught by the guard in
        // scripts/upload-sourcemaps.mjs, which refused to ship a bundle
        // pointing at a map it had just stripped. Turned off rather than
        // stripped: a service-worker map has no telemetry value (app errors
        // don't happen in the SW), so generating one just to delete it is
        // pointless work with a publish-the-source failure mode.
        sourcemap: false,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Keep the self-hosted BSB fallback bundle (~1.2 MB gzip) OUT of the
        // service-worker precache. The glob above is extension-scoped and
        // already wouldn't match a `.gz`, but this is explicit belt-and-braces:
        // if that bundle ever landed in the precache manifest, every user would
        // download the entire Bible on first load, which defeats the whole point
        // of fetching it lazily (only when helloao is down). See
        // src/bible/self-hosted.ts.
        globIgnores: ['**/bible/bsb.json.gz'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Never cache Supabase API traffic — reads/writes must always hit
            // the network or fail explicitly so the offline mirror/toast logic
            // (src/offline/) can do its job instead of the SW masking staleness.
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
            handler: 'NetworkOnly'
          }
        ]
      },
      manifest: {
        name: 'Lantern',
        short_name: 'Lantern',
        description:
          'A quiet place to study Scripture: read a passage, capture what you see in it, and read your notes back later anchored to the verses.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Matches index.html's <meta name="theme-color"> light-mode default —
        // the OS splash is static (can't read the boot script's theme choice
        // or animate), so this just has to agree with our own light default
        // rather than flash a different near-white.
        theme_color: '#f4f0e8',
        background_color: '#f4f0e8',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
})
