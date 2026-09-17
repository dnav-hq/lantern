// The shipped shaded relief (public/map/terrain.png), decoded, cropped and
// re-encoded for mockups. Lifted from scripts/export-map-frame.mjs so a second
// exporter (scripts/export-dive-in.mjs) can crop the same raster the same way.
import { crc32, deflateSync, inflateSync } from 'node:zlib'

/** The 8-bit grayscale PNG the build ships: no filter rows, one IDAT stream. */
export function decodeGrayPng(buf) {
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
export function encodeGrayPng(width, height, rows, depth = 8) {
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

/**
 * Crop a view-box frame out of the relief and box-filter it down to `outWidth`
 * pixels. `scale` is relief pixels per view-box unit. Returns the crop's own
 * view-box rectangle too, because clamping to the raster can shrink it.
 */
export function cropRelief(relief, scale, frame, outWidth, seaValue = 206) {
  const x0 = Math.max(0, Math.floor(frame.x * scale))
  const y0 = Math.max(0, Math.floor(frame.y * scale))
  const x1 = Math.min(relief.width, Math.ceil((frame.x + frame.w) * scale))
  const y1 = Math.min(relief.height, Math.ceil((frame.y + frame.h) * scale))
  const rect = { x0, y0, w: x1 - x0, h: y1 - y0 }
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
          sum += relief.pixels[(rect.y0 + y) * relief.width + (rect.x0 + x)]
          count++
        }
      }
      out[j * outWidth + i] = count ? Math.round(sum / count) : seaValue
    }
  }
  return {
    png: encodeGrayPng(outWidth, outHeight, out),
    image: { width: outWidth, height: outHeight, pixels: out },
    width: outWidth,
    height: outHeight,
    box: { x: x0 / scale, y: y0 / scale, w: rect.w / scale, h: rect.h / scale }
  }
}

/**
 * Sea as a 1-bit mask, flood-filled inward from the frame edge so that flat
 * LAND at the sea's exact value (desert, the Jordan valley floor) is never
 * swallowed. White = sea, which is what an SVG <mask> wants. Same rule as
 * scripts/export-map-frame.mjs; the shipped hillshade paints every sea 206.
 */
export function seaMaskPng(image, seaValue = 206) {
  const { width, height, pixels } = image
  const sea = new Uint8Array(width * height)
  const stack = []
  const push = (x, y) => {
    const i = y * width + x
    if (sea[i] || pixels[i] !== seaValue) return
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
  return encodeGrayPng(width, height, rows, 1)
}

/** The sea mask of a whole shipped relief PNG: same pixels, 1 bit each. */
export function seaMaskFromPng(pngBytes, seaValue = 206) {
  const image = decodeGrayPng(pngBytes)
  return { png: seaMaskPng(image, seaValue), width: image.width, height: image.height }
}
