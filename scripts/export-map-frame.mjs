// Exports REAL map geometry for the atlas mockup — design/bible-map-atlas.html
//
// The mockup argues about how the map should LOOK, so every shape in it has to
// be the shape the app would actually draw. Nothing here is hand-drawn: the
// coastlines, lakes and rivers come out of public/map/base.json.gz, the place
// points out of public/map/places.json.gz (projected with the app's own
// transform), and the terrain texture out of public/map/terrain.png. A mockup
// drawn freehand would flatter a treatment that the real geometry can't carry.
//
// It also MEASURES, because the treatments differ mostly in what they cost:
// the relief crop at phone size, a 1-bit sea mask, and the derived hachures are
// each encoded for real and their bytes reported. Those numbers are the note's
// evidence (docs/proposals/bible-map-atlas.md), not estimates.
//
// Run:      npx tsx scripts/export-map-frame.mjs          (report + JSON to stdout)
//           npx tsx scripts/export-map-frame.mjs --write   (inject into the mockup)
//
// Through tsx, like scripts/build-map-data.mjs, so the projection is imported
// from src/utils/mapData.ts rather than reimplemented — the same rule that keeps
// the build script's artwork and the client's place points on top of each other.
import { readFileSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync, gunzipSync, gzipSync, inflateSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LCC_CONSTANTS,
  MAP_PROJECTION,
  MAP_VIEW_BOX,
  MAP_VIEW_TRANSFORM,
  chapterKey,
  projectToView
} from '../src/utils/mapData.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MOCKUP = resolve(ROOT, 'design', 'bible-map-atlas.html')
const DEG = Math.PI / 180

// The sea is a single flat value in Natural Earth's SR_50M hillshade — verified
// by sampling the Mediterranean, Black, Red and Persian seas in the SHIPPED
// raster, all exactly 206. That constant is what makes a vector-only treatment
// possible at all: the land/sea line can be recovered from the relief we already
// have, so a flat atlas style needs no new source data. (Land is flat in places
// too, which is why the mask is flood-filled from the frame edge rather than
// thresholded — an inland salt flat at 206 is not sea.)
const SEA_VALUE = 206

// ── the frames ──────────────────────────────────────────────────────────────
//
// `route` legs are editorial, exactly as docs/proposals/journeys-data.md requires:
// each names the verse that puts both places in one travel notice. Genesis 12's
// legs are the shipped `abram-ur-to-canaan` journey's own legs for this chapter;
// Galatians 1 has no entry in the journeys table yet, so its legs are authored
// here from Galatians 1:17-21 and would move into scripts/data/journeys.yml if
// this treatment is built.
//
// Regions get a LABEL and no marker. OpenBible ships a point per region (a
// centroid, often literally the capital's coordinate — `Syria 2` sits exactly on
// Damascus), and the polygon files that would give a region its true extent are
// ODbL and deliberately not shipped (bible-map-v1 §1.1). So a region label is
// placed editorially, from its point plus an offset, and the mockup says so.
const FRAMES = [
  {
    id: 'galatians-1',
    title: 'Galatians 1',
    caption: 'Damascus, Arabia, Jerusalem, Syria and Cilicia',
    book: 48,
    chapter: 1,
    aspect: 342 / 320,
    pad: 0.3,
    reliefWidth: 684,
    inlineRelief: true,
    marks: [
      { place: 'Damascus', stop: 1, dx: 7, dy: -3, anchor: 'start' },
      { place: 'Jerusalem', stop: 3, dx: -7, dy: 3, anchor: 'end' },
      { place: 'Arabia 2', stop: 2, as: 'Arabia', dx: 7, dy: 4, anchor: 'start' },
      { place: 'Cilicia', stop: 4, as: 'Syria & Cilicia', dx: 4, dy: -11, anchor: 'middle' }
    ],
    regions: [
      { place: 'Galatia', label: 'Galatia', dx: 0, dy: -4 },
      { place: 'Syria 2', label: 'Syria', dx: 16, dy: -14 },
      { place: 'Judea 1', label: 'Judea', dx: -26, dy: 20 },
      { place: 'Arabia 2', label: 'Arabia', dx: 10, dy: 22 }
    ],
    seas: [
      { label: 'The Great Sea', lon: 30.6, lat: 33.9, rotate: -7 },
      { label: 'Cyprus', lon: 33.05, lat: 34.72, size: 'small' }
    ],
    legs: [
      { from: 'Damascus', to: 'Arabia 2', ref: 'Galatians 1:17', bow: 0.16 },
      { from: 'Arabia 2', to: 'Damascus', ref: 'Galatians 1:17', bow: 0.16, dashed: true },
      { from: 'Damascus', to: 'Jerusalem', ref: 'Galatians 1:18' },
      { from: 'Jerusalem', to: 'Cilicia', ref: 'Galatians 1:21', bow: -0.1, dashed: true }
    ]
  },
  {
    id: 'genesis-12',
    title: 'Genesis 12',
    caption: 'Haran to Shechem, Bethel, the Negeb and Egypt',
    book: 1,
    chapter: 12,
    aspect: 1120 / 520,
    pad: 0.22,
    reliefWidth: 1360,
    inlineRelief: false,
    marks: [
      { place: 'Haran', stop: 1, dx: 8, dy: -4, anchor: 'start' },
      { place: 'Shechem', stop: 2, dx: 8, dy: -4, anchor: 'start' },
      { place: 'Bethel 1', stop: 3, as: 'Bethel', dx: -10, dy: 3, anchor: 'end' },
      { place: 'Negeb', stop: 4, as: 'The Negeb', dx: -8, dy: 6, anchor: 'end' },
      { place: 'Egypt', stop: 5, dx: 8, dy: 8, anchor: 'start' }
    ],
    regions: [
      { place: 'Canaan', label: 'Canaan', dx: 30, dy: -26 },
      { place: 'Egypt', label: 'Egypt', dx: -18, dy: 26 }
    ],
    seas: [
      { label: 'The Great Sea', lon: 31.5, lat: 33.4, rotate: -6 },
      { label: 'Sea of Galilee', lon: 36.4, lat: 32.55, size: 'small' }
    ],
    legs: [
      { from: 'Haran', to: 'Shechem', ref: 'Genesis 12:4-6', bow: 0.12 },
      { from: 'Shechem', to: 'Bethel 1', ref: 'Genesis 12:6-8' },
      { from: 'Bethel 1', to: 'Negeb', ref: 'Genesis 12:8-9', dashed: true },
      { from: 'Negeb', to: 'Egypt', ref: 'Genesis 12:9-10' }
    ]
  }
]

// ── bundles ─────────────────────────────────────────────────────────────────

const readGz = (rel) => JSON.parse(gunzipSync(readFileSync(resolve(ROOT, rel))).toString())
const base = readGz('public/map/base.json.gz')
const places = readGz('public/map/places.json.gz')
const relief = decodeGrayPng(readFileSync(resolve(ROOT, 'public/map/terrain.png')))
/** Relief pixels per view-box unit. The raster covers the whole frame exactly. */
const RELIEF_SCALE = relief.width / MAP_VIEW_BOX[2]

const placeByName = new Map(places.p.map((p) => [p.n, p]))
function pointOf(name) {
  const place = placeByName.get(name)
  if (!place) throw new Error(`no place named "${name}" in the bundle`)
  const best = place.c[0]
  if (!best) throw new Error(`"${name}" has no candidate location`)
  const [x, y] = projectToView(best.ll[0], best.ll[1])
  return { name, x, y, lon: best.ll[0], lat: best.ll[1], type: place.t, score: best.s }
}

// ── png ─────────────────────────────────────────────────────────────────────

/** Read the 8-bit grayscale, filter-0 PNG scripts/build-map-data.mjs writes. */
function decodeGrayPng(buf) {
  let offset = 8
  const idat = []
  let width = 0
  let height = 0
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 0) throw new Error('relief is not 8-bit grayscale')
    }
    if (type === 'IDAT') idat.push(data)
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++) {
    if (raw[y * (width + 1)] !== 0) throw new Error('relief uses a PNG filter; expected none')
    raw.copy(pixels, y * width, y * (width + 1) + 1, (y + 1) * (width + 1))
  }
  return { width, height, pixels }
}

function pngChunk(type, data) {
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, data.length + 8)
  return out
}

/** Encode rows already packed for the given bit depth. Colour type 0, no filter. */
function encodeGrayPng(width, height, rows, depth = 8) {
  const stride = depth === 1 ? Math.ceil(width / 8) : width
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rows.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = depth
  ihdr[9] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// ── geometry ────────────────────────────────────────────────────────────────

const parsePath = (d) =>
  d
    .slice(1)
    .split(/[ML]/)
    .map((pair) => pair.split(',').map(Number))

/**
 * Clip a polyline to the frame, keeping the pieces that cross it. Culling alone
 * would be enough to draw the frame (the viewBox hides the rest), but the mockup
 * inlines its geometry, and a coastline that runs to Spain is 40x the bytes of
 * the piece you can see.
 */
function clipToFrame(points, frame) {
  const inside = ([x, y]) =>
    x >= frame.x && x <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h
  const runs = []
  let run = []
  for (let i = 0; i < points.length; i++) {
    const here = inside(points[i])
    const prevIn = i > 0 && inside(points[i - 1])
    if (here) {
      if (!prevIn && i > 0) run.push(points[i - 1]) // one point beyond, so the line leaves the frame
      run.push(points[i])
    } else if (prevIn) {
      run.push(points[i])
      runs.push(run)
      run = []
    }
  }
  if (run.length > 1) runs.push(run)
  return runs
}

const toPath = (points) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x, 1)},${round(y, 1)}`).join('')

const round = (v, dp) => Number(v.toFixed(dp))

/** The LCC inverse — view-box units back to lon/lat. Same maths as the terrain warp. */
function invertView(x, y) {
  const { n, F, rho0 } = LCC_CONSTANTS
  const { scale, minX, maxY } = MAP_VIEW_TRANSFORM
  const px = x / scale + minX
  const py = maxY - y / scale
  const dy = rho0 - py
  const rho = Math.sign(n) * Math.hypot(px, dy)
  return [
    (MAP_PROJECTION.lon0 * DEG + Math.atan2(px, dy) / n) / DEG,
    (2 * Math.atan((F / rho) ** (1 / n)) - Math.PI / 2) / DEG
  ]
}

function haversineKm(a, b) {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const dLat = (lat2 - lat1) * DEG
  const dLon = (lon2 - lon1) * DEG
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** A leg, bowed into an arc so an out-and-back journey doesn't draw over itself. */
function legPath(from, to, bow = 0) {
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  if (!bow) return `M${round(from.x, 1)},${round(from.y, 1)}L${round(to.x, 1)},${round(to.y, 1)}`
  const dx = to.x - from.x
  const dy = to.y - from.y
  const cx = mx - dy * bow
  const cy = my + dx * bow
  return `M${round(from.x, 1)},${round(from.y, 1)}Q${round(cx, 1)},${round(cy, 1)} ${round(to.x, 1)},${round(to.y, 1)}`
}

// ── the relief, cropped, masked and hatched ─────────────────────────────────

/** The frame's rectangle in relief pixels, clamped to the raster. */
function reliefRect(frame) {
  const x0 = Math.max(0, Math.floor(frame.x * RELIEF_SCALE))
  const y0 = Math.max(0, Math.floor(frame.y * RELIEF_SCALE))
  const x1 = Math.min(relief.width, Math.ceil((frame.x + frame.w) * RELIEF_SCALE))
  const y1 = Math.min(relief.height, Math.ceil((frame.y + frame.h) * RELIEF_SCALE))
  return { x0, y0, w: x1 - x0, h: y1 - y0 }
}

const cropSample = (rect, x, y) => relief.pixels[(rect.y0 + y) * relief.width + (rect.x0 + x)]

/** Box-filter the crop down to what a phone actually shows. */
function downsample(rect, outWidth) {
  const outHeight = Math.max(1, Math.round((rect.h * outWidth) / rect.w))
  const out = Buffer.alloc(outWidth * outHeight)
  const sx = rect.w / outWidth
  const sy = rect.h / outHeight
  for (let j = 0; j < outHeight; j++) {
    for (let i = 0; i < outWidth; i++) {
      let sum = 0
      let count = 0
      for (let y = Math.floor(j * sy); y < Math.min(rect.h, Math.ceil((j + 1) * sy)); y++) {
        for (let x = Math.floor(i * sx); x < Math.min(rect.w, Math.ceil((i + 1) * sx)); x++) {
          sum += cropSample(rect, x, y)
          count++
        }
      }
      out[j * outWidth + i] = count ? Math.round(sum / count) : SEA_VALUE
    }
  }
  return { width: outWidth, height: outHeight, pixels: out }
}

/**
 * Sea as a 1-bit mask, flood-filled inward from the frame edge so that flat LAND
 * at the sea's exact value (desert, the Jordan valley floor) is never swallowed.
 * White = sea, which is what an SVG <mask> wants.
 */
function seaMask(image) {
  const { width, height, pixels } = image
  const sea = new Uint8Array(width * height)
  const stack = []
  const push = (x, y) => {
    const i = y * width + x
    if (sea[i] || pixels[i] !== SEA_VALUE) return
    sea[i] = 1
    stack.push(i)
  }
  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }
  while (stack.length) {
    const i = stack.pop()
    const x = i % width
    const y = (i - x) / width
    if (x > 0) push(x - 1, y)
    if (x < width - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < height - 1) push(x, y + 1)
  }
  const stride = Math.ceil(width / 8)
  const rows = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (sea[y * width + x]) rows[y * stride + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return { rows, stride, sea }
}

/**
 * Hachures: short contour-following strokes wherever the hillshade has relief,
 * the terrain texture an engraved atlas draws instead of a photograph of the
 * ground. Derived from the raster at BUILD time and shipped as path data, which
 * is the whole argument for treatment C — the texture survives, the 685 KB
 * raster doesn't, and unlike a raster it takes the theme's ink colour.
 */
function hachures(image, rect, frame, limit) {
  const { width, height, pixels } = image
  const { sea } = seaMask(image)
  const step = 4
  const strokes = []
  const at = (x, y) => pixels[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]
  // The sea is FLAT, so the shoreline is the steepest gradient in the raster by
  // a mile. Sampling it would ring every coast in hachures and leave the
  // mountains bare — the exact opposite of what an engraved map does. Anything
  // within two pixels of water is skipped; the coastline has its own hairline.
  const nearSea = (x, y) => {
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const yy = Math.min(height - 1, Math.max(0, y + j))
        const xx = Math.min(width - 1, Math.max(0, x + i))
        if (sea[yy * width + xx]) return true
      }
    }
    return false
  }
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      if (nearSea(x, y)) continue
      const gx = at(x + 1, y) - at(x - 1, y)
      const gy = at(x, y + 1) - at(x, y - 1)
      const mag = Math.hypot(gx, gy)
      if (mag < 8) continue
      strokes.push({ x, y, gx, gy, mag })
    }
  }
  strokes.sort((a, b) => b.mag - a.mag)
  const kept = strokes.slice(0, limit)
  // Back to view-box units, so the strokes sit on the same coordinates as the
  // coastline and scale with the frame rather than with the raster.
  const unit = frame.w / width
  const paths = kept.map(({ x, y, gx, gy, mag }) => {
    const len = (0.8 + Math.min(1.4, mag / 30)) * unit * 1.5
    const nx = -gy / mag
    const ny = gx / mag
    const cx = frame.x + (x + 0.5) * unit
    const cy = frame.y + (y + 0.5) * (frame.h / height)
    return `M${round(cx - nx * len, 1)},${round(cy - ny * len, 1)}L${round(cx + nx * len, 1)},${round(cy + ny * len, 1)}`
  })
  return paths
}

// ── build one frame ─────────────────────────────────────────────────────────

function buildFrame(spec) {
  const index = places.ch[chapterKey(spec.book, spec.chapter)] ?? []
  if (!index.length) throw new Error(`${spec.title} has no places in the bundle`)
  const chapterPlaces = index.map((i) => pointOf(places.p[i].n))

  // The frame: the chapter's own places, padded, then widened to the artboard's
  // aspect — mapViewport.frameViewBox does exactly this in the app.
  const xs = chapterPlaces.map((p) => p.x)
  const ys = chapterPlaces.map((p) => p.y)
  const bounds = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys)
  }
  const padX = Math.max(bounds.w, bounds.h) * spec.pad
  let frame = {
    x: bounds.x - padX,
    y: bounds.y - padX,
    w: bounds.w + padX * 2,
    h: bounds.h + padX * 2
  }
  if (frame.w / frame.h < spec.aspect) {
    const w = frame.h * spec.aspect
    frame = { ...frame, x: frame.x - (w - frame.w) / 2, w }
  } else {
    const h = frame.w / spec.aspect
    frame = { ...frame, y: frame.y - (h - frame.h) / 2, h }
  }
  frame = { x: round(frame.x, 2), y: round(frame.y, 2), w: round(frame.w, 2), h: round(frame.h, 2) }

  // Artwork, clipped to the frame.
  const layers = {}
  let artworkChars = 0
  for (const [name, paths] of Object.entries(base.layers)) {
    const out = []
    for (const d of paths) {
      for (const run of clipToFrame(parsePath(d), frame)) {
        const path = toPath(run)
        if (path) out.push(path)
      }
    }
    layers[name] = out
    artworkChars += out.join('').length
  }

  // Relief, cropped and shrunk to the size a phone draws it at.
  const rect = reliefRect(frame)
  const small = downsample(rect, spec.reliefWidth)
  const reliefPng = encodeGrayPng(small.width, small.height, small.pixels)
  const mask = seaMask(small)
  const maskPng = encodeGrayPng(small.width, small.height, mask.rows, 1)
  const hatch = hachures(small, rect, frame, spec.id === 'genesis-12' ? 3600 : 2300)
  const hatchData = hatch.join(' ')

  // Scale bar and north mark, both derived rather than drawn: a conic projection
  // turns north away from the page as you move off the central meridian, and the
  // scale is only honest for the latitude it is measured at.
  const centre = invertView(frame.x + frame.w / 2, frame.y + frame.h / 2)
  const east = invertView(frame.x + frame.w / 2 + 10, frame.y + frame.h / 2)
  const kmPerUnit = haversineKm(centre, east) / 10
  const northOf = projectToView(centre[0], centre[1] + 0.5)
  const northDeg =
    (Math.atan2(
      northOf[0] - (frame.x + frame.w / 2),
      frame.y + frame.h / 2 - northOf[1]
    ) *
      180) /
    Math.PI
  const barKm = [50, 100, 200, 250, 500].find((km) => km / kmPerUnit > frame.w * 0.18) ?? 500

  const resolve_ = (name) => {
    const p = pointOf(name)
    return { x: round(p.x, 1), y: round(p.y, 1) }
  }

  return {
    frame: {
      id: spec.id,
      title: spec.title,
      caption: spec.caption,
      viewBox: [frame.x, frame.y, frame.w, frame.h],
      layers,
      hachures: hatchData,
      relief: {
        // The desktop artboard draws the recommended VECTOR treatment, so it
        // needs the sea mask but not a quarter-megabyte of relief inlined into a
        // design file. The crop is still encoded above — its bytes are the
        // measurement the note cites.
        href: spec.inlineRelief ? `data:image/png;base64,${reliefPng.toString('base64')}` : null,
        mask: `data:image/png;base64,${maskPng.toString('base64')}`,
        x: round(rect.x0 / RELIEF_SCALE, 2),
        y: round(rect.y0 / RELIEF_SCALE, 2),
        w: round(rect.w / RELIEF_SCALE, 2),
        h: round(rect.h / RELIEF_SCALE, 2)
      },
      marks: spec.marks.map((m) => ({ ...resolve_(m.place), ...m, label: m.as ?? m.place })),
      regions: spec.regions.map((r) => ({ ...resolve_(r.place), ...r })),
      seas: spec.seas.map((s) => {
        const [x, y] = projectToView(s.lon, s.lat)
        return { ...s, x: round(x, 1), y: round(y, 1) }
      }),
      legs: spec.legs.map((l) => ({
        d: legPath(pointOf(l.from), pointOf(l.to), l.bow ?? 0),
        ref: l.ref,
        dashed: Boolean(l.dashed)
      })),
      scale: {
        km: barKm,
        units: round(barKm / kmPerUnit, 1),
        kmPerUnit: round(kmPerUnit, 3),
        atLat: Math.round(centre[1])
      },
      north: round(northDeg, 1)
    },
    measured: {
      id: spec.id,
      places: chapterPlaces.length,
      artworkChars,
      artworkGz: gzipSync(Buffer.from(Object.values(layers).flat().join(''))).length,
      reliefPx: `${small.width}x${small.height}`,
      reliefBytes: reliefPng.length,
      maskBytes: maskPng.length,
      hachureCount: hatch.length,
      hachureChars: hatchData.length,
      hachureGz: gzipSync(Buffer.from(hatchData)).length
    }
  }
}

// ── run ─────────────────────────────────────────────────────────────────────

const built = FRAMES.map(buildFrame)
const payload = {
  generated: new Date().toISOString().slice(0, 10),
  source: {
    base: 'public/map/base.json.gz',
    places: 'public/map/places.json.gz',
    relief: 'public/map/terrain.png',
    attribution: [base.attribution, places.attribution]
  },
  shipped: {
    baseGz: readFileSync(resolve(ROOT, 'public/map/base.json.gz')).length,
    placesGz: readFileSync(resolve(ROOT, 'public/map/places.json.gz')).length,
    reliefPng: readFileSync(resolve(ROOT, 'public/map/terrain.png')).length,
    reliefPx: `${relief.width}x${relief.height}`
  },
  frames: built.map((b) => b.frame),
  // The byte table in the mockup prints these rather than quoting hand-copied
  // numbers: a measurement that can drift from the thing it measures is worse
  // than no measurement.
  measured: built.map((b) => b.measured)
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
console.error('SHIPPED TODAY')
console.error(`  base.json.gz          ${kb(payload.shipped.baseGz)}  (coastline, lakes, rivers)`)
console.error(`  places.json.gz        ${kb(payload.shipped.placesGz)}`)
console.error(`  terrain.png           ${kb(payload.shipped.reliefPng)}  ${payload.shipped.reliefPx}, opt-in`)
for (const { measured } of built) {
  console.error('')
  console.error(`FRAME ${measured.id}  (${measured.places} places in the chapter)`)
  console.error(`  artwork in frame      ${kb(measured.artworkGz)} gzipped  (${measured.artworkChars} chars of path data)`)
  console.error(`  relief crop           ${kb(measured.reliefBytes)}  ${measured.reliefPx} grayscale PNG`)
  console.error(`  sea mask              ${kb(measured.maskBytes)}  1-bit PNG, same pixels`)
  console.error(`  hachures              ${kb(measured.hachureGz)} gzipped  (${measured.hachureCount} strokes, ${measured.hachureChars} chars)`)
}

if (process.argv.includes('--write')) {
  const html = readFileSync(MOCKUP, 'utf8')
  const start = '/* frames:start */'
  const end = '/* frames:end */'
  const a = html.indexOf(start)
  const b = html.indexOf(end)
  if (a < 0 || b < 0) throw new Error(`no ${start} … ${end} markers in ${MOCKUP}`)
  const next =
    html.slice(0, a + start.length) +
    `\n      const FRAMES = ${JSON.stringify(payload)}\n      ` +
    html.slice(b)
  writeFileSync(MOCKUP, next)
  console.error('')
  console.error(`written  design/bible-map-atlas.html  (${kb(Buffer.byteLength(next))} on disk)`)
} else {
  process.stdout.write(JSON.stringify(payload))
}
