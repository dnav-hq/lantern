// Derives public/map/sea.png from the shipped relief, and records it in
// public/map/base.json.gz — docs/proposals/dive-in-2.md, "Bounded by the data".
//
// The Bible map's coastline layer is LINES: only islands are closed polygons,
// the mainland coast is an open path, so no polygon fill can recover land from
// it. Land and sea come instead from the relief raster, where the sea is one
// flat value (206) flood-filled inward from the frame edge so flat land at
// that value (desert, the Jordan valley floor) is never swallowed. The result
// is a 1-bit PNG the same size as terrain.png, used as an SVG mask: white is
// sea. scripts/build-map-data.mjs runs the same step when it rebuilds the
// raster; this script exists so the mask can be (re)built from the PNG we
// already ship without downloading the Natural Earth source again.
//
// Run:  node scripts/build-sea-mask.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seaMaskFromPng } from './lib/relief.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'public', 'map')

const terrain = readFileSync(resolve(OUT_DIR, 'terrain.png'))
const mask = seaMaskFromPng(terrain)
writeFileSync(resolve(OUT_DIR, 'sea.png'), mask.png)

const basePath = resolve(OUT_DIR, 'base.json.gz')
const base = JSON.parse(gunzipSync(readFileSync(basePath)).toString())
base.sea = { url: '/map/sea.png', width: mask.width, height: mask.height, bytes: mask.png.length }
const json = JSON.stringify(base)
writeFileSync(basePath, gzipSync(Buffer.from(json), { level: 9 }))

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
console.error(`sea.png       ${mask.width}x${mask.height}, 1-bit, ${kb(mask.png.length)}`)
console.error(`base.json.gz  rewritten with the sea entry (${kb(readFileSync(basePath).length)} gzipped)`)
