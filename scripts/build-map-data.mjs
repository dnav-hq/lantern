// Builds the Bible map's data and base artwork: public/map/**
//
// Slice 1 of docs/proposals/bible-map-v1.md. This ships NO UI. It produces the
// three things a later map reads: where the places are (with how confident
// anyone is that they are there), which verses mention them, and the coastlines,
// lakes and rivers to draw them on.
//
// Outputs
//   public/map/places.json.gz  1,342 ancient places, every candidate location,
//                              confidence scores, chapter + verse indexes
//   public/map/base.json.gz    Natural Earth coastline/lakes/rivers, clipped,
//                              projected and simplified into SVG path data
//   public/map/terrain.png     OPT-IN shaded relief, lazily fetched only when
//                              switched on (brief section 9a, decision 2)
//
// Sources
//   OpenBible Bible-Geocoding-Data — CC BY 4.0, attribution required and shipped
//     in the bundle. PINNED to a commit, not `main`, so the output is
//     reproducible. v1 uses `lonlat` POINTS only: the `geometry/` files are
//     partly OpenStreetMap-derived and carry share-alike ODbL (brief 1.1).
//   Natural Earth 10m physical vectors + the 50m SR shaded-relief raster —
//     public domain, no attribution required. Via nvkelso/natural-earth-vector
//     (GeoJSON conversions) and naciscdn.org (raster), both pinned.
//
// Source data is NOT committed (14 MB of JSONL, 21 MB of GeoJSON, 58 MB of
// GeoTIFF); the derived bundles are.
//
// Regenerate:  npm run build:map-data
// Offline:     OB_DATA_DIR=/tmp/obgeo NE_DATA_DIR=/tmp/ne SR_TIF_PATH=/tmp/SR_50M.tif npm run build:map-data
// Vectors only (skip the raster):  npm run build:map-data -- --no-terrain
//
// Run through tsx (see package.json) so the projection and the simplifier can be
// imported from src/utils/mapData.ts rather than reimplemented. The artwork is
// projected HERE and the place points are projected in the CLIENT; if those two
// transforms ever differed, every place would sit off its own coastline and
// nothing would say so.
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { crc32, deflateSync, gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LCC_CONSTANTS,
  MAP_EXTENT,
  MAP_PROJECTION,
  MAP_VIEW_BOX,
  MAP_VIEW_TRANSFORM,
  projectToView,
  simplifyPath,
  toPathData,
  withinExtent
} from '../src/utils/mapData.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'public', 'map')

// Pinned upstream commits. Bump these deliberately, never automatically: the
// OpenBible data last changed in 2021-11-01 and the whole point of a pin is that
// a rebuild a year from now produces the same bytes.
const OB_COMMIT = '7eb18a5ee62f27b9b93bd6689ea272d76dd23b8f'
const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19'
const OB_BASE = `https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/${OB_COMMIT}/data/`
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/`
// The raster is served from Natural Earth's own CDN, which has no per-version
// URLs — this is the current 50m release (v5.1.x), recorded here because it is
// the one number in this script that a pin cannot hold.
const SR_URL = 'https://naciscdn.org/naturalearth/50m/raster/SR_50M.zip'

const OB_ATTRIBUTION = 'Place data: OpenBible.info Bible Geocoding Data by Stephen Smith, CC BY 4.0'
const NE_ATTRIBUTION = 'Base map: Natural Earth (public domain)'

// Douglas-Peucker tolerance, in VIEW-BOX units (the box is 1000 wide). The
// coastline is the silhouette people recognise, so it gets the finer pass; lakes
// and rivers are context and can afford the coarser one. Brief section 4.2 measured
// the same trade in projected units (0.00015 / 0.0004).
const EPS_COASTLINE = 0.18
const EPS_INLAND = 0.48

// 2 degrees of margin, so a coastline does not stop dead at the frame edge.
const CLIP_MARGIN = 2

// Candidates per place. The most contested place in the dataset has fewer than
// this; the cap is there so one pathological record cannot bloat the bundle.
const MAX_CANDIDATES = 6

// If the shaded relief comes out bigger than this, ship vectors only and say so
// (brief section 9a, decision 2 — "if the clipped raster proves unreasonably large,
// say so with the number and ship vectors only").
const TERRAIN_MAX_BYTES = 1_500_000
// Output width in pixels. Measured 2026-09-03 across the extent, LCC-warped:
// 1200 -> 384 KB, 1600 -> 656 KB, 2000 -> 922 KB, 2400 -> 1,169 KB.
const TERRAIN_WIDTH = 1600

const wantTerrain = !process.argv.includes('--no-terrain')

// ---------------------------------------------------------------- input files

async function download(url, into) {
  console.error(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText} — ${url}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (into) writeFileSync(into, bytes)
  return bytes
}

const CACHE_DIR = resolve(__dirname, '..', 'node_modules', '.cache', 'map-data')

/** A source file: an explicitly provided local copy, or a cached download. */
async function sourceFile(name, url, envDir) {
  const local = envDir ? resolve(envDir, name) : null
  if (local && existsSync(local)) return local
  mkdirSync(CACHE_DIR, { recursive: true })
  const cached = resolve(CACHE_DIR, name)
  if (existsSync(cached)) return cached
  await download(url, cached)
  return cached
}

/** Stream a JSON Lines file — ancient.jsonl is 11 MB and readFileSync of it is wasteful. */
async function readJsonl(path) {
  const rows = []
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  for await (const line of lines) {
    if (line.trim()) rows.push(JSON.parse(line))
  }
  return rows
}

// ------------------------------------------------------------- the place data

const round4 = (v) => Number(v.toFixed(4))

/** OpenBible writes coordinates as the string "lon,lat". */
function parseLonLat(value) {
  if (typeof value !== 'string') return null
  const [lon, lat] = value.split(',').map(Number)
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null
}

function buildPlaces(ancient, modernById) {
  const places = []
  const chapters = new Map()
  const verses = new Map()
  const stats = {
    withVerses: 0,
    pairs: 0,
    droppedVerses: 0,
    candidates: 0,
    identifications: 0,
    votesObjects: 0,
    votesWithSources: 0,
    unlocated: [],
    contested: 0,
    genuinelyContested: 0,
    bands: { settled: 0, high: 0, moderate: 0, low: 0, unknown: 0 },
    inExtent: 0
  }

  for (const place of ancient) {
    const index = places.length
    const byCoord = new Map()
    let top = null

    for (const ident of place.identifications ?? []) {
      stats.identifications++
      const score = ident.score ?? {}
      const total = score.time_total ?? 0
      if (ident.votes) {
        stats.votesObjects++
        // Brief section 3.4: the readme documents `votes.sources` but no record carries
        // one. Re-verified here on every build, because the day upstream fills
        // it in is the day the bundle can start citing books.
        if (Array.isArray(ident.votes.sources) && ident.votes.sources.length) {
          stats.votesWithSources++
        }
      }
      if (!top || total > top.total) top = { total, score, votes: ident.votes }

      for (const res of ident.resolutions ?? []) {
        const ll = parseLonLat(res.lonlat)
        if (!ll) continue
        stats.candidates++
        if (withinExtent(ll[0], ll[1])) stats.inExtent++
        const modern = modernById.get(res.modern_basis_id)
        const key = `${round4(ll[0])},${round4(ll[1])}`
        const existing = byCoord.get(key)
        if (existing && existing.s >= total) continue
        const candidate = { ll: [round4(ll[0]), round4(ll[1])], s: total }
        if (modern?.friendly_id) candidate.m = modern.friendly_id
        if (typeof modern?.precision?.meters === 'number') candidate.p = modern.precision.meters
        if (typeof score.time_slope === 'number' && score.time_slope !== 0) {
          candidate.tr = Number(score.time_slope.toFixed(2))
        }
        // The coordinate's own citation. Not the identification's sources — that
        // mapping is not in the bulk data (section 3.4) — but a real, checkable
        // statement about where this POINT came from.
        const cs = modern?.coordinates_source
        if (cs?.type && cs?.id) candidate.cs = [cs.type, String(cs.id)]
        byCoord.set(key, candidate)
      }
    }

    const candidates = [...byCoord.values()].sort((a, b) => b.s - a.s).slice(0, MAX_CANDIDATES)
    const record = {
      n: place.friendly_id,
      t: (place.types ?? ['unknown'])[0],
      sl: `${place.id}/${place.url_slug}`,
      c: candidates
    }
    if (top?.score?.vote_count) record.vc = top.score.vote_count
    // The tally IS the citation (section 3.4): "42 votes, of which 5 confidence_yes,
    // 10 confidence_likely…" is verifiable; "Aharoni places Ai at Et Tell" is not
    // derivable from this data and must not be implied.
    if (top?.votes?.tags && Object.keys(top.votes.tags).length) record.tg = top.votes.tags
    places.push(record)

    if (!candidates.length) stats.unlocated.push(place.friendly_id)
    if (byCoord.size > 1) stats.contested++
    if ([...byCoord.values()].filter((c) => c.s >= 250).length >= 2) stats.genuinelyContested++
    const best = candidates[0]
    stats.bands[
      !best ? 'unknown' : best.s >= 1000 ? 'settled' : best.s >= 750 ? 'high' : best.s >= 500 ? 'moderate' : 'low'
    ]++

    const placeVerses = place.verses ?? []
    if (placeVerses.length) stats.withVerses++
    for (const verse of placeVerses) {
      const sort = verse.sort
      if (typeof sort !== 'string' || sort.length !== 8) continue
      // Lantern's canon is USFM 1-66. Anything outside it has nowhere to be read.
      const book = Number(sort.slice(0, 2))
      if (!(book >= 1 && book <= 66)) {
        stats.droppedVerses++
        continue
      }
      stats.pairs++
      push(chapters, sort.slice(0, 5), index)
      push(verses, sort, index)
    }
  }

  return { places, chapters, verses, stats }
}

function push(map, key, value) {
  const list = map.get(key)
  if (list) {
    if (list[list.length - 1] !== value) list.push(value)
  } else {
    map.set(key, [value])
  }
}

const fromMap = (map) => Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))

// ----------------------------------------------------------- the base artwork

/** Every coordinate run in a GeoJSON geometry, whatever its type. */
function* coordinateRuns(geometry) {
  if (!geometry) return
  const { type, coordinates } = geometry
  if (type === 'LineString') yield coordinates
  else if (type === 'MultiLineString' || type === 'Polygon') yield* coordinates
  else if (type === 'MultiPolygon') for (const poly of coordinates) yield* poly
  else if (type === 'GeometryCollection') for (const g of geometry.geometries) yield* coordinateRuns(g)
}

/**
 * Clip a run to the extent, keeping it as one or more runs. Points outside the
 * margin are dropped and the run is broken there, so a coastline that leaves the
 * frame and comes back does not get a straight line drawn across the map.
 */
function clipRun(run) {
  const kept = []
  let current = []
  for (const [lon, lat] of run) {
    if (withinExtent(lon, lat, CLIP_MARGIN)) {
      current.push(projectToView(lon, lat))
    } else if (current.length) {
      kept.push(current)
      current = []
    }
  }
  if (current.length) kept.push(current)
  return kept.filter((r) => r.length >= 2)
}

function buildLayer(geojson, epsilon) {
  const paths = []
  let verticesIn = 0
  let verticesOut = 0
  for (const feature of geojson.features) {
    for (const run of coordinateRuns(feature.geometry)) {
      verticesIn += run.length
      for (const clipped of clipRun(run)) {
        const simplified = simplifyPath(clipped, epsilon)
        const d = toPathData(simplified)
        if (!d) continue
        verticesOut += simplified.length
        paths.push(d)
      }
    }
  }
  return { paths, verticesIn, verticesOut }
}

// --------------------------------------------------------- the terrain raster
//
// Measured FIRST, per brief section 9a decision 2, because section 4.2 recorded the size
// as `unverified` and an unmeasured assumption is exactly what this project has
// been bitten by. Measured 2026-09-03, clipped to the extent and LCC-warped:
//
//   SR_50M    grayscale shaded relief   1600x916 -> 656 KB   <- shipped
//   NE1_50M   full-colour relief        1600x916 -> 2,551 KB <- rejected, 4x
//
// Grayscale is not only 4x smaller, it is the right layer: colour belongs to the
// app's themes, and a grey hillshade sits under hand-drawn ink without fighting
// it. Both numbers are recorded in the brief.

/** Read one member out of a zip. Uses fflate, already a dependency for zip export. */
async function unzipMember(zipBytes, endsWith) {
  const { unzipSync } = await import('fflate')
  const files = unzipSync(new Uint8Array(zipBytes))
  const name = Object.keys(files).find((f) => f.endsWith(endsWith))
  if (!name) throw new Error(`no ${endsWith} in archive`)
  return Buffer.from(files[name])
}

/** Minimal reader for the uncompressed, single-band GeoTIFF Natural Earth ships. */
function readGrayTiff(buf) {
  const little = buf.toString('ascii', 0, 2) === 'II'
  const u16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
  const u32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  let offset = u32(4)
  const count = u16(offset)
  const tags = new Map()
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12
    const tag = u16(entry)
    const type = u16(entry + 2)
    const n = u32(entry + 4)
    const size = (type === 3 ? 2 : type === 4 ? 4 : 1) * n
    const at = size <= 4 ? entry + 8 : u32(entry + 8)
    const values = []
    for (let k = 0; k < n; k++) {
      values.push(type === 3 ? u16(at + k * 2) : type === 4 ? u32(at + k * 4) : buf[at + k])
    }
    tags.set(tag, values)
  }
  const width = tags.get(256)[0]
  const height = tags.get(257)[0]
  if (tags.get(259)?.[0] !== 1) throw new Error('terrain TIFF is compressed; expected raw strips')
  if (tags.get(277)?.[0] !== 1) throw new Error('terrain TIFF is not single-band')
  return { width, height, rowsPerStrip: tags.get(278)[0], strips: tags.get(273), buf }
}

/** Encode 8-bit grayscale rows as a PNG. No dependency: zlib plus a header. */
function encodeGrayPng(width, height, pixels) {
  const raw = Buffer.alloc(height * (width + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0 // filter type 0 — the relief is smooth; filtering wins little
    pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width)
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'ascii')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, data.length + 8)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // colour type: grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * Warp the equirectangular relief into the map's LCC frame. Nearest-neighbour,
 * driven from the OUTPUT: for each pixel, invert the projection to lon/lat and
 * sample. The inverse lives here and not in src/utils/mapData.ts on purpose —
 * the client never needs it (every interaction is "where does this lon/lat go on
 * screen", never the reverse), so shipping it would be dead weight.
 */
function warpToLcc(tiff, width) {
  const DEG = Math.PI / 180
  const { n, F, rho0 } = LCC_CONSTANTS
  const { scale, minX, maxY } = MAP_VIEW_TRANSFORM

  const px = 360 / tiff.width // the 50m raster is a whole-globe equirectangular grid
  const ulx = -180 + px / 2
  const uly = 90 - px / 2
  const height = Math.round((width * MAP_VIEW_BOX[3]) / MAP_VIEW_BOX[2])
  const out = Buffer.alloc(width * height)

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      // View-box coordinates map linearly onto the projected frame, so invert
      // the view transform first, then the projection.
      const x = (MAP_VIEW_BOX[2] * (i + 0.5)) / width / scale + minX
      const y = maxY - (MAP_VIEW_BOX[3] * (j + 0.5)) / height / scale
      const dy = rho0 - y
      const rho = Math.sign(n) * Math.hypot(x, dy)
      const lon = (MAP_PROJECTION.lon0 * DEG + Math.atan2(x, dy) / n) / DEG
      const lat = (2 * Math.atan((F / rho) ** (1 / n)) - Math.PI / 2) / DEG
      const sc = Math.round((lon - ulx) / px)
      const sr = Math.round((uly - lat) / px)
      if (sc < 0 || sc >= tiff.width || sr < 0 || sr >= tiff.height) continue
      const strip = Math.floor(sr / tiff.rowsPerStrip)
      out[j * width + i] =
        tiff.buf[tiff.strips[strip] + (sr - strip * tiff.rowsPerStrip) * tiff.width + sc]
    }
  }
  return { width, height, pixels: out }
}

// ------------------------------------------------------------------- the build

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
const generated = new Date().toISOString().slice(0, 10)

mkdirSync(OUT_DIR, { recursive: true })

const obDir = process.env.OB_DATA_DIR ?? null
const [ancientPath, modernPath] = await Promise.all([
  sourceFile('ancient.jsonl', `${OB_BASE}ancient.jsonl`, obDir),
  sourceFile('modern.jsonl', `${OB_BASE}modern.jsonl`, obDir)
])
const [ancient, modern] = await Promise.all([readJsonl(ancientPath), readJsonl(modernPath)])
const modernById = new Map(modern.map((m) => [m.id, m]))

const { places, chapters, verses, stats } = buildPlaces(ancient, modernById)
const placeBundle = {
  v: 1,
  attribution: OB_ATTRIBUTION,
  source_commit: OB_COMMIT,
  generated,
  p: places,
  ch: fromMap(chapters),
  vs: fromMap(verses)
}
const placeJson = JSON.stringify(placeBundle)
const placeGz = gzipSync(Buffer.from(placeJson), { level: 9 })
writeFileSync(resolve(OUT_DIR, 'places.json.gz'), placeGz)

console.error('')
console.error('PLACES')
console.error(`  places indexed        ${places.length}`)
console.error(`  with verse refs       ${stats.withVerses}`)
console.error(`  (place, verse) pairs  ${stats.pairs}   dropped outside canon: ${stats.droppedVerses}`)
console.error(`  chapters indexed      ${Object.keys(placeBundle.ch).length}`)
console.error(`  verses indexed        ${Object.keys(placeBundle.vs).length}`)
console.error(`  identifications       ${stats.identifications}`)
console.error(`  candidate locations   ${stats.candidates}`)
console.error(`  confidence  settled(1000) ${stats.bands.settled}  high(750+) ${stats.bands.high}  moderate(500+) ${stats.bands.moderate}  low(<500) ${stats.bands.low}  unknown ${stats.bands.unknown}`)
console.error(`  competing candidates  ${stats.contested} places (${((100 * stats.contested) / places.length).toFixed(1)}%), of which ${stats.genuinelyContested} have >=2 candidates scoring >=250`)
console.error(`  unlocated places      ${stats.unlocated.length}: ${stats.unlocated.join(', ')}`)
console.error(`  votes objects         ${stats.votesObjects}, with a non-empty votes.sources: ${stats.votesWithSources}`)
if (stats.votesWithSources > 0) {
  console.error('  ! votes.sources is NO LONGER empty upstream — the bundle can start citing books (brief 3.4)')
}
console.error(`  extent coverage       ${stats.inExtent}/${stats.candidates} coordinates (${((100 * stats.inExtent) / stats.candidates).toFixed(1)}%) inside ${MAP_EXTENT.minLon}-${MAP_EXTENT.maxLon} lon, ${MAP_EXTENT.minLat}-${MAP_EXTENT.maxLat} lat`)
console.error(`  places.json.gz        ${kb(placeGz.length)} gzipped (${kb(placeJson.length)} raw)`)

const neDir = process.env.NE_DATA_DIR ?? null
const layerSpecs = [
  ['coastline', 'ne_10m_coastline.geojson', EPS_COASTLINE],
  ['lakes', 'ne_10m_lakes.geojson', EPS_INLAND],
  ['rivers', 'ne_10m_rivers_lake_centerlines.geojson', EPS_INLAND]
]
const layers = {}
console.error('')
console.error('BASE ARTWORK')
for (const [name, file, epsilon] of layerSpecs) {
  const path = await sourceFile(file, `${NE_BASE}${file}`, neDir)
  const { paths, verticesIn, verticesOut } = buildLayer(JSON.parse(readFileSync(path, 'utf8')), epsilon)
  layers[name] = paths
  const gz = gzipSync(Buffer.from(JSON.stringify(paths)), { level: 9 })
  console.error(`  ${name.padEnd(10)} ${String(paths.length).padStart(4)} paths  ${verticesIn} -> ${verticesOut} vertices  ${kb(gz.length)} gzipped`)
}

let terrain = null
if (wantTerrain) {
  console.error('')
  console.error('TERRAIN (opt-in layer — measured before it is built in)')
  const localTif = process.env.SR_TIF_PATH
  let tifBytes
  if (localTif && existsSync(localTif)) {
    tifBytes = readFileSync(localTif)
  } else {
    mkdirSync(CACHE_DIR, { recursive: true })
    const cachedTif = resolve(CACHE_DIR, 'SR_50M.tif')
    if (existsSync(cachedTif)) {
      tifBytes = readFileSync(cachedTif)
    } else {
      const zip = await download(SR_URL, null)
      tifBytes = await unzipMember(zip, '.tif')
      writeFileSync(cachedTif, tifBytes)
    }
  }
  const tiff = readGrayTiff(tifBytes)
  const warped = warpToLcc(tiff, TERRAIN_WIDTH)
  const png = encodeGrayPng(warped.width, warped.height, warped.pixels)
  console.error(`  source              SR_50M shaded relief, ${tiff.width}x${tiff.height} equirectangular`)
  console.error(`  clipped + warped    ${warped.width}x${warped.height} Lambert Conformal Conic`)
  console.error(`  MEASURED PNG SIZE   ${png.length} bytes (${kb(png.length)})`)
  if (png.length > TERRAIN_MAX_BYTES) {
    console.error(`  ! over the ${kb(TERRAIN_MAX_BYTES)} budget — shipping vectors only, as the brief allows`)
  } else {
    writeFileSync(resolve(OUT_DIR, 'terrain.png'), png)
    terrain = {
      url: '/map/terrain.png',
      width: warped.width,
      height: warped.height,
      bytes: png.length,
      attribution: NE_ATTRIBUTION
    }
    console.error('  written             public/map/terrain.png (opt-in; never in the default payload)')
  }
} else {
  console.error('')
  console.error('TERRAIN skipped (--no-terrain)')
}

const baseBundle = {
  v: 1,
  attribution: NE_ATTRIBUTION,
  source_commit: NE_COMMIT,
  generated,
  extent: MAP_EXTENT,
  viewBox: MAP_VIEW_BOX.map((v) => Number(v.toFixed(2))),
  layers,
  terrain
}
const baseJson = JSON.stringify(baseBundle)
const baseGz = gzipSync(Buffer.from(baseJson), { level: 9 })
writeFileSync(resolve(OUT_DIR, 'base.json.gz'), baseGz)

const totalPaths = Object.values(layers).reduce((n, p) => n + p.length, 0)
console.error('')
console.error('TOTALS')
console.error(`  base.json.gz          ${kb(baseGz.length)} gzipped (${kb(baseJson.length)} raw), ${totalPaths} paths`)
console.error(`  default payload       ${kb(placeGz.length + baseGz.length)} gzipped (places + artwork, lazily fetched)`)
console.error(`  opt-in terrain        ${terrain ? kb(terrain.bytes) : 'not shipped'}`)
