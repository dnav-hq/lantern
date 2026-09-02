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
        globIgnores: ['**/bible/**/*.json.gz'],
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
        // NO theme_color, deliberately — and `undefined` rather than omitted,
        // because vite-plugin-pwa Object.assigns over its own default and would
        // otherwise inject #42b883, a green belonging to no part of this app.
        //
        // A manifest's theme_color cannot be theme-aware (there is no media
        // query in a manifest), and on an INSTALLED Android PWA it — not our
        // <meta name="theme-color"> — paints the system bar. With it set to our
        // light cream, a reader in dark mode got a cream bar (2026-09-02).
        //
        // Setting it DARK instead only mirrors the bug. The evidence is that the
        // bar's ICONS flip with the system theme while theme_color stayed
        // constant cream — so the icons follow the SYSTEM, not us. A permanently
        // dark bar would therefore get dark icons on dark in light mode, which
        // is the same legibility failure pointing the other way.
        //
        // Declaring nothing lets the system choose the bar, and the system is
        // already choosing the icons correctly. theme_color is NOT part of
        // Chrome's installability criteria (name, icons 192+512, start_url,
        // display) — the plugin's warning to the contrary is overcautious. If
        // that ever proves wrong, this is a one-line revert.
        theme_color: undefined,
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
