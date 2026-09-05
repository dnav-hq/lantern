import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { version as appVersion } from './package.json'

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
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha.slice(0, 40)),
    // The app version (package.json), surfaced quietly in Profile so a user can
    // see which build they are on.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)
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
      // 'prompt', not 'autoUpdate': a new worker installs and waits rather than
      // activating + force-reloading mid-session (that was the jarring white
      // flash). The waiting worker is surfaced as a quiet refresh prompt (see
      // src/offline/pwaUpdate.ts, src/components/PwaUpdatePrompt.tsx) and applies
      // on tap or on the next full launch.
      registerType: 'prompt',
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
        // Keep the self-hosted fallback bundles (~1.2-1.3 MB gzip EACH, for
        // BSB, KJV and NET) OUT of the service-worker precache. The glob above
        // is extension-scoped and already wouldn't match a `.gz`, but this is
        // explicit belt-and-braces: if those bundles ever landed in the
        // precache manifest, every user would download several complete Bibles
        // on first load, which defeats the whole point of fetching them lazily
        // (only when helloao is down). Wildcarded rather than listed one by
        // one, so adding a fourth translation cannot silently opt into
        // precaching. See src/bible/self-hosted.ts.
        //
        // `**/bible/**` rather than `**/bible/*`: the word index
        // (public/bible/words/, built by scripts/build-word-index.mjs) lives one
        // level deeper, and the single-star form would have walked straight past
        // it — several MB of lexicon data precached for every reader to answer a
        // question about one word. Same rule, same reason.
        //
        // `**/map/**` covers the Bible map's bundles (public/map/, built by
        // scripts/build-map-data.mjs) with NO extension filter, deliberately:
        // the opt-in terrain layer is a .png, which globPatterns above DOES
        // match. Without this line every reader would precache a 656 KB relief
        // raster for a layer most of them never switch on — the exact failure
        // the .gz rule was written to prevent, arriving through a different
        // extension. The places/artwork bundles are lazily fetched on first map
        // open (src/utils/mapData.ts).
        globIgnores: ['**/bible/**/*.json.gz', '**/map/**'],
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
        // A dark theme_color, on purpose. On an INSTALLED Android PWA the
        // MANIFEST's theme_color paints the system status bar, and it cannot be
        // theme-aware (a manifest has no media query). Two earlier attempts were
        // wrong: light cream gave a cream bar in dark mode (2026-09-02), and
        // `undefined` made Android fall back to a WHITE bar (Dennis, 2026-09-04),
        // which looks worse than either. A dark value is what a good installed
        // PWA does (Dennis's own HQ app is black bar + white icons): Android
        // derives the icon colour from this luminance, so a dark bar always gets
        // white icons, in both light and dark. The one accepted cost is that the
        // bar is dark even when the app is in light mode — Dennis chose this
        // deliberately over the white bar. Matches our dark canvas (#17140f) so
        // it reads as on-brand near-black rather than pure black. The <meta
        // name="theme-color"> pair in index.html still governs browser TABS,
        // where theme-awareness works.
        theme_color: '#17140f',
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
