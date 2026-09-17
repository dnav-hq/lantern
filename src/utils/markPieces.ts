// Cutting a text into marked and unmarked pieces — the pure half of
// components/Marked.tsx, kept apart so that file exports only a component.
//
// Nothing here may import a Node API — this file lives under src/ and obeys
// the pure-web rule in CLAUDE.md.

interface Piece {
  text: string
  mark: boolean
}

/** Cut `text` into marked and unmarked pieces. */
export function markPieces(
  text: string,
  run: [number, number] | null | undefined,
  names: readonly string[] = [],
  from = 0
): Piece[] {
  const spans: [number, number][] = []
  if (run) {
    const s = Math.max(0, run[0] - from)
    const e = Math.min(text.length, run[1] - from)
    if (e > s) spans.push([s, e])
  }
  for (const name of names) {
    if (!name) continue
    const re = new RegExp(`(^|[^\\p{L}])(${escapeRegExp(name)})(?![\\p{L}])`, 'gu')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const s = m.index + m[1].length
      const e = s + m[2].length
      if (!spans.some(([a, b]) => s < b && a < e)) spans.push([s, e])
    }
  }
  spans.sort((a, b) => a[0] - b[0])
  const out: Piece[] = []
  let at = 0
  for (const [s, e] of spans) {
    if (s > at) out.push({ text: text.slice(at, s), mark: false })
    out.push({ text: text.slice(s, e), mark: true })
    at = e
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false })
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
