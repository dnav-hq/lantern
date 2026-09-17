/**
 * Scripture with the shared words marked — docs/proposals/dive-in-2.md.
 *
 * The marks are the whole relation vocabulary of the dive-in: a lit run says
 * "quotes" and a lit place name says "names Damascus too" without a word of
 * either, and without any claim about direction. `run` is character offsets
 * into `text` (from `sharedRun`); `names` are whole-word matches (from
 * `sharedPlaces`), applied outside the run so the two never nest. `from`
 * lets a row start part-way through a passage (the row window) with the
 * offsets still meaning what they meant in the whole.
 */
import React from 'react'
import { markPieces } from '../utils/markPieces'

interface Props {
  text: string
  run?: [number, number] | null
  names?: readonly string[]
  /** Offset of `text[0]` in the passage `run` was measured on. */
  from?: number
  /** An ellipsis is printed before a windowed text. */
  ellipsis?: boolean
}

export default function Marked({
  text,
  run,
  names = [],
  from = 0,
  ellipsis = false
}: Props): React.ReactElement {
  const pieces = markPieces(text, run, names, from)
  return (
    <>
      {ellipsis && '…'}
      {pieces.map((p, i) =>
        p.mark ? (
          <mark key={i} className="dive-mark">
            {p.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        )
      )}
    </>
  )
}
