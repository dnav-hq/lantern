// Exports REAL data for the dive-in mockup — design/dive-in-2.html
//
// Every row, heading, marked run, place point, coastline and route leg in that
// page is the one the app would draw: cross-references from the shipped
// dataset, BSB text from helloao, headings from the settings bundle, places
// and journeys from the shipped map bundles, all run through src/utils.
//
// The coastline is clipped as POLYGONS (Sutherland-Hodgman against the frame),
// which is the fix for the straight "sea band" in design/dive-in.html: that
// page clipped coastlines as open polylines and then filled them, and a filled
// open path closes with a straight chord between its ends.
//
// Run:  npx tsx scripts/export-dive-in.mjs          (JSON to stdout)
//       npx tsx scripts/export-dive-in.mjs --write  (inject into the mockup)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sharedRun, connectionsForVerse, topScore, THRESHOLD } from '../src/utils/connections.ts'
import { settingLineIn } from '../src/utils/settingLine.ts'
import { usfmForBookNumber, bookNumberForUsfm } from '../src/bible/helloao.ts'
import { bookByNumber } from '../src/utils/bibleBooks.ts'
import { MAP_VIEW_BOX, chapterKey, verseKey, projectToView } from '../src/utils/mapData.ts'
import {
  buildViewModel,
  indexMarkersByPlaceId,
  buildJourneyRoute,
  findJourneyForChapter,
  displayPlaceName
} from '../src/utils/mapDataLoader.ts'
import { toViewBox, fitViewBox, frameViewBox, journeyViewBox } from '../src/utils/mapViewport.ts'
import { decodeGrayPng, cropRelief, seaMaskPng } from './lib/relief.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CACHE = resolve(ROOT, 'node_modules', '.cache', 'dive-in')
const MOCKUP = resolve(ROOT, 'design', 'dive-in-2.html')
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true })

const readGz = (rel) => JSON.parse(gunzipSync(readFileSync(resolve(ROOT, rel))).toString())
const places = readGz('public/map/places.json.gz')
const base = readGz('public/map/base.json.gz')
const journeys = JSON.parse(readFileSync(resolve(ROOT, 'public/bible/map/journeys.json')).toString())
const settings = readGz('public/bible/connections/settings.json.gz')
const relief = decodeGrayPng(readFileSync(resolve(ROOT, 'public/map/terrain.png')))
const RELIEF_SCALE = relief.width / MAP_VIEW_BOX[2]

async function getJson(url) {
  const file = resolve(CACHE, url.replace(/[^a-z0-9]+/gi, '_') + '.json')
  if (existsSync(file)) return JSON.parse(readFileSync(file).toString())
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const json = await res.json()
  writeFileSync(file, JSON.stringify(json))
  return json
}

const bsb = (book, chapter) =>
  getJson(`https://bible.helloao.org/api/BSB/${usfmForBookNumber(book)}/${chapter}.json`)
const xref = (book, chapter) =>
  getJson(`https://bible.helloao.org/api/d/open-cross-ref/${usfmForBookNumber(book)}/${chapter}.json`)

/** Verse text as one string, poem lines joined with spaces, notes dropped. */
function flatten(content) {
  return content
    .map((c) => (typeof c === 'string' ? c : (c.text ?? '')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function chapterVerses(book, chapter) {
  const j = await bsb(book, chapter)
  const out = new Map()
  for (const node of j.chapter.content) {
    if (node.type === 'verse') out.set(node.number, flatten(node.content))
  }
  return out
}

const refLabel = (book, chapter, verse, endVerse) =>
  `${bookByNumber(book).name} ${chapter}:${verse}${endVerse && endVerse !== verse ? `-${endVerse}` : ''}`

// ── places the chapter names (bounded proper nouns) ────────────────────────
const view = buildViewModel(places)
const byIndex = new Map(view.markers.map((m) => [m.index, m]))
const byId = indexMarkersByPlaceId(view.markers, places)
const bearingNames = ['Jerusalem', 'Damascus', 'Egypt', 'Babylon', 'Rome', 'Nineveh', 'Antioch 1']
const bearings = bearingNames.map((n) => view.markers.find((m) => m.name === n)).filter(Boolean)

function chapterPlaces(book, chapter) {
  return (places.ch[chapterKey(book, chapter)] ?? []).map((i) => byIndex.get(i)).filter(Boolean)
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Names of places (as the text writes them) that appear in both texts. */
function sharedPlaces(placeMarkers, source, target) {
  const names = [...new Set(placeMarkers.map((m) => displayPlaceName(m.name)))]
  return names.filter((n) => {
    const re = new RegExp(`\\b${escapeRe(n)}\\b`)
    return re.test(source) && re.test(target)
  })
}

// ── polygon clipping ───────────────────────────────────────────────────────
const parsePath = (d) =>
  d
    .slice(1)
    .split(/[ML]/)
    .map((p) => p.split(',').map(Number))
const round = (v, dp = 1) => Number(v.toFixed(dp))
const toPath = (pts, close) =>
  pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join('') + (close ? 'Z' : '')

function cross(a, b, axis, v) {
  const i = axis === 'x' ? 0 : 1
  const t = (v - a[i]) / (b[i] - a[i])
  return axis === 'x' ? [v, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), v]
}

/** Sutherland-Hodgman: a closed polygon clipped to a rectangle stays closed. */
function clipPolygon(points, r) {
  const edges = [
    { inside: (p) => p[0] >= r.x, at: (a, b) => cross(a, b, 'x', r.x) },
    { inside: (p) => p[0] <= r.x + r.w, at: (a, b) => cross(a, b, 'x', r.x + r.w) },
    { inside: (p) => p[1] >= r.y, at: (a, b) => cross(a, b, 'y', r.y) },
    { inside: (p) => p[1] <= r.y + r.h, at: (a, b) => cross(a, b, 'y', r.y + r.h) }
  ]
  let out = points
  for (const e of edges) {
    const input = out
    out = []
    if (input.length === 0) break
    let prev = input[input.length - 1]
    for (const cur of input) {
      if (e.inside(cur)) {
        if (!e.inside(prev)) out.push(e.at(prev, cur))
        out.push(cur)
      } else if (e.inside(prev)) out.push(e.at(prev, cur))
      prev = cur
    }
  }
  return out
}

function clipPolyline(points, r) {
  const inside = ([x, y]) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  const runs = []
  let run = []
  points.forEach((p, i) => {
    if (inside(p)) {
      if (run.length === 0 && i > 0) run.push(points[i - 1])
      run.push(p)
    } else if (run.length) {
      run.push(p)
      runs.push(run)
      run = []
    }
  })
  if (run.length > 1) runs.push(run)
  return runs
}

function artworkIn(vb) {
  const r = { x: vb.x - 2, y: vb.y - 2, w: vb.w + 4, h: vb.h + 4 }
  // The coast is drawn as STROKES only. Land vs sea comes from the flood-filled
  // sea mask, because the mainland coast in the bundle is an open line (only
  // islands are closed polygons), so no polygon fill can recover it.
  const coast = []
  for (const d of base.layers.coastline) {
    for (const run of clipPolyline(parsePath(d), r)) coast.push(toPath(run))
  }
  const lakes = []
  for (const d of base.layers.lakes) {
    const c = clipPolygon(parsePath(d), r)
    if (c.length > 2) lakes.push(toPath(c, true))
  }
  const rivers = []
  for (const d of base.layers.rivers) {
    for (const run of clipPolyline(parsePath(d), r)) rivers.push(toPath(run))
  }
  return { coast, lakes, rivers }
}

// ── one verse ──────────────────────────────────────────────────────────────
const VIEWPORT = { width: 354, height: 250 }
const EXTENT = toViewBox(MAP_VIEW_BOX)
const FIT = fitViewBox(EXTENT, VIEWPORT)

async function exportVerse(book, chapter, verse) {
  const verses = await chapterVerses(book, chapter)
  const source = verses.get(verse)
  const raw = await xref(book, chapter)
  const perVerse = {}
  for (const v of raw.chapter.content) {
    perVerse[v.verse] = v.references.map((r) => ({
      book: bookNumberForUsfm(r.book),
      chapter: r.chapter,
      verse: r.verse,
      endVerse: r.endVerse,
      score: r.score
    }))
  }
  const connections = connectionsForVerse(perVerse, verse)
  const myPlaces = chapterPlaces(book, chapter)
  const rows = []
  for (const c of connections) {
    const target = await chapterVerses(c.book, c.chapter)
    const end = c.endVerse ?? c.verse
    const text = Array.from({ length: end - c.verse + 1 }, (_, i) => target.get(c.verse + i) ?? '')
      .join(' ')
      .trim()
    const run = sharedRun(source, text)
    const heading = settingLineIn(settings, c.book, c.chapter, c.verse)
    rows.push({
      ref: refLabel(c.book, c.chapter, c.verse, c.endVerse),
      book: c.book,
      chapter: c.chapter,
      verse: c.verse,
      score: c.score,
      text,
      run,
      places: sharedPlaces(myPlaces, source, text),
      heading: heading?.text ?? null
    })
  }
  const top = topScore(connections)
  const parallel = rows.length > 0 && rows[0].places.length > 0
  const door = top !== null && (top >= THRESHOLD || parallel)

  // map
  const journey = findJourneyForChapter(journeys, book, chapter)
  const route = journey ? buildJourneyRoute(journey, journeys.gaps, (id) => byId.get(id)) : null
  const framePoints = route ? route.stops : myPlaces.map((m) => m.point)
  const vb = route
    ? journeyViewBox(framePoints, VIEWPORT, EXTENT, FIT, { padding: 0.28, minSpan: 60 })
    : frameViewBox(framePoints, VIEWPORT, EXTENT, FIT, { padding: 0.3, minSpan: 60 })
  const inFrame = (p) => p.x >= vb.x - vb.w * 0.6 && p.x <= vb.x + vb.w * 1.6 && p.y >= vb.y - vb.h * 0.6 && p.y <= vb.y + vb.h * 1.6
  const versePlaces = new Set(places.vs[verseKey(book, chapter, verse)] ?? [])
  const legText = []
  if (route) {
    for (const leg of route.legs) {
      if (!leg.ref) {
        legText.push(null)
        continue
      }
      const m = /^(.+?) (\d+):(\d+)(?:-(\d+))?$/.exec(leg.ref)
      // a ranged citation ends where the traveller arrives: show that verse
      const chap = await chapterVerses(book, Number(m[2]))
      legText.push(chap.get(Number(m[4] ?? m[3])) ?? null)
    }
  }
  const [gsx, gsy] = projectToView(31.6, 33.6)
  // the raster and artwork cover a margin around the frame, so the card can pan
  const pan = { x: vb.x - vb.w * 0.6, y: vb.y - vb.h * 0.6, w: vb.w * 2.2, h: vb.h * 2.2 }
  const crop = cropRelief(relief, RELIEF_SCALE, pan, 1400)
  const mask = seaMaskPng(crop.image)
  // the destination chapter around the first row, for the follow-and-return state
  const first = rows[0]
  let around = null
  if (first) {
    const chap = await chapterVerses(first.book, first.chapter)
    const end = (connections[0].endVerse ?? first.verse)
    around = [...chap.entries()].filter(([n]) => n >= first.verse - 4 && n <= end + 3).map(([n, t]) => [n, t])
  }
  return {
    ref: refLabel(book, chapter, verse),
    book,
    chapter,
    verse,
    text: source,
    door,
    top,
    parallel,
    threshold: THRESHOLD,
    rows,
    around,
    map: {
      relief: { href: 'data:image/png;base64,' + crop.png.toString('base64'), mask: 'data:image/png;base64,' + mask.toString('base64'), ...crop.box, bytes: crop.png.length, maskBytes: mask.length },
      pan: [round(pan.x, 2), round(pan.y, 2), round(pan.w, 2), round(pan.h, 2)],
      viewBox: [round(vb.x, 2), round(vb.y, 2), round(vb.w, 2), round(vb.h, 2)],
      artwork: artworkIn(pan),
      places: myPlaces
        .filter((m) => inFrame(m.point))
        .map((m) => ({
          name: displayPlaceName(m.name),
          x: round(m.point.x),
          y: round(m.point.y),
          inVerse: versePlaces.has(m.index),
          band: m.band,
          type: m.type
        })),
      bearings: bearings
        .filter((m) => inFrame(m.point) && !myPlaces.includes(m))
        .map((m) => ({ name: displayPlaceName(m.name), x: round(m.point.x), y: round(m.point.y) })),
      sea: inFrame({ x: gsx, y: gsy }) ? { x: round(gsx), y: round(gsy) } : null,
      route: route && {
        title: route.title,
        stops: route.stops.map((s) => ({
          order: s.order,
          name: s.name,
          type: byIndex.get(s.index)?.type ?? null,
          x: round(s.x),
          y: round(s.y)
        })),
        legs: route.legs.map((l, i) => ({
          from: l.from.order,
          to: l.to.order,
          ref: l.ref,
          note: l.note,
          silent: l.silent,
          text: legText[i]
        }))
      }
    }
  }
}

const data = {
  generated: new Date().toISOString(),
  verses: [await exportVerse(1, 15, 6), await exportVerse(48, 1, 17)]
}

if (process.argv.includes('--write')) {
  const html = readFileSync(MOCKUP).toString()
  const start = '/* data:start */'
  const end = '/* data:end */'
  const a = html.indexOf(start)
  const b = html.indexOf(end)
  if (a === -1 || b === -1) throw new Error('markers missing in ' + MOCKUP)
  writeFileSync(
    MOCKUP,
    html.slice(0, a + start.length) + '\n' + JSON.stringify(data) + '\n' + html.slice(b)
  )
  console.error('injected into design/dive-in-2.html')
} else {
  console.log(JSON.stringify(data, null, 1))
}
