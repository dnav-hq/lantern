// Builds public/bible/map/journeys.json from the hand-authored
// scripts/data/journeys.yml — see that file's header and
// docs/proposals/journeys-data.md for what this is and why it's
// hand-authored rather than inferred.
//
// Run directly with node (no TypeScript import needed, unlike
// build-map-data.mjs): `node scripts/build-journeys.mjs`.
//
// journeys.yml uses a small, fixed subset of YAML — a top-level `journeys:`
// list of `{ id, title, source, legs }`, each leg a flow mapping
// `{ from, to, ref }`, plus a top-level `gaps:` list of
// `{ journey, from, to, note }`. That shape is parsed here by hand rather
// than pulling in a YAML library: the project has no YAML dependency today
// (js-yaml is only an eslint transitive), and reading a handful of fixed,
// single-line record shapes doesn't need a general parser.
import { gunzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const YAML_PATH = resolve(ROOT, 'scripts', 'data', 'journeys.yml')
const PLACES_PATH = resolve(ROOT, 'public', 'map', 'places.json.gz')
const OUT_PATH = resolve(ROOT, 'public', 'bible', 'map', 'journeys.json')
const MAX_BYTES = 20 * 1024

const LEG_RE = /^-\s*\{\s*from:\s*(\S+?),\s*to:\s*(\S+?),\s*ref:\s*"([^"]*)"\s*\}$/
const GAP_RE =
  /^-\s*\{\s*journey:\s*(\S+?),\s*from:\s*(\S+?),\s*to:\s*(\S+?),\s*note:\s*"([^"]*)"\s*\}$/

function parseJourneysYaml(text) {
  const journeys = []
  const gaps = []
  let section = null // 'journeys' | 'gaps'
  let journey = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    if (line === 'journeys:') {
      section = 'journeys'
      continue
    }
    if (line === 'gaps:') {
      section = 'gaps'
      continue
    }

    if (section === 'journeys') {
      const idMatch = line.match(/^-\s*id:\s*(\S+)$/)
      if (idMatch) {
        journey = { id: idMatch[1], title: '', source: '', legs: [] }
        journeys.push(journey)
        continue
      }
      const titleMatch = line.match(/^title:\s*"(.*)"$/)
      if (titleMatch && journey) {
        journey.title = titleMatch[1]
        continue
      }
      const sourceMatch = line.match(/^source:\s*"(.*)"$/)
      if (sourceMatch && journey) {
        journey.source = sourceMatch[1]
        continue
      }
      if (line === 'legs:') continue
      const legMatch = line.match(LEG_RE)
      if (legMatch && journey) {
        journey.legs.push({ from: legMatch[1], to: legMatch[2], ref: legMatch[3] })
        continue
      }
      throw new Error(`build-journeys: could not parse line under 'journeys:': ${JSON.stringify(rawLine)}`)
    }

    if (section === 'gaps') {
      const gapMatch = line.match(GAP_RE)
      if (gapMatch) {
        gaps.push({ journey: gapMatch[1], from: gapMatch[2], to: gapMatch[3], note: gapMatch[4] })
        continue
      }
      throw new Error(`build-journeys: could not parse line under 'gaps:': ${JSON.stringify(rawLine)}`)
    }
  }

  return { journeys, gaps }
}

function loadValidPlaceIds() {
  const gz = readFileSync(PLACES_PATH)
  const bundle = JSON.parse(gunzipSync(gz).toString('utf8'))
  const ids = new Set()
  for (const place of bundle.p) {
    const slash = place.sl.indexOf('/')
    ids.add(slash === -1 ? place.sl : place.sl.slice(slash + 1))
  }
  return ids
}

function fail(errors) {
  console.error(`build-journeys: ${errors.length} problem(s) found:\n`)
  for (const e of errors) console.error(`  - ${e}`)
  console.error('')
  process.exit(1)
}

function main() {
  const yamlText = readFileSync(YAML_PATH, 'utf8')
  const { journeys, gaps } = parseJourneysYaml(yamlText)
  const validIds = loadValidPlaceIds()

  const errors = []
  const journeyIds = new Set()

  for (const journey of journeys) {
    if (journeyIds.has(journey.id)) errors.push(`duplicate journey id "${journey.id}"`)
    journeyIds.add(journey.id)

    if (!journey.title) errors.push(`journey "${journey.id}" has no title`)
    if (journey.legs.length === 0) errors.push(`journey "${journey.id}" has no legs`)

    journey.legs.forEach((leg, i) => {
      if (!validIds.has(leg.from)) {
        errors.push(
          `journey "${journey.id}" leg ${i + 1}: unknown place id "${leg.from}" (from) — not in public/map/places.json.gz`
        )
      }
      if (!validIds.has(leg.to)) {
        errors.push(
          `journey "${journey.id}" leg ${i + 1}: unknown place id "${leg.to}" (to) — not in public/map/places.json.gz`
        )
      }
      if (!leg.ref || !leg.ref.trim()) {
        errors.push(`journey "${journey.id}" leg ${i + 1} (${leg.from} -> ${leg.to}) has no verse reference`)
      }
    })
  }

  gaps.forEach((gap, i) => {
    if (!journeyIds.has(gap.journey)) {
      errors.push(`gap ${i + 1}: unknown journey id "${gap.journey}"`)
    }
    if (!validIds.has(gap.from)) errors.push(`gap ${i + 1}: unknown place id "${gap.from}" (from)`)
    if (!validIds.has(gap.to)) errors.push(`gap ${i + 1}: unknown place id "${gap.to}" (to)`)
    if (!gap.note || !gap.note.trim()) errors.push(`gap ${i + 1} (${gap.from} -> ${gap.to}) has no note`)
  })

  if (errors.length > 0) fail(errors)

  const output = {
    v: 1,
    generated: new Date().toISOString(),
    journeys,
    gaps
  }
  const json = JSON.stringify(output, null, 2)
  const bytes = Buffer.byteLength(json, 'utf8')

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, json)

  const legCount = journeys.reduce((n, j) => n + j.legs.length, 0)
  console.error(`build-journeys: wrote ${OUT_PATH}`)
  console.error(`  journeys   ${journeys.length}`)
  console.error(`  legs       ${legCount}`)
  console.error(`  gaps       ${gaps.length}`)
  console.error(`  size       ${(bytes / 1024).toFixed(2)} KB${bytes > MAX_BYTES ? '  (OVER 20 KB BUDGET)' : ''}`)
}

main()
