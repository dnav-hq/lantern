/**
 * The connections door — where Scripture picks this verse up.
 *
 * `docs/proposals/connections-door.md` is the argument and the measurements;
 * `design/deep-dive-doorways.html` artboard 3 is the visual reference; the
 * glance-then-deeper rule it obeys is `docs/proposals/deep-dive-doorways.md`.
 * The rules this file exists to keep:
 *
 *   - ONE QUESTION, ONE SCREEN. The strongest connection in full, the next two
 *     as one line each, and everything else behind ONE fold. A door that hands
 *     over a verse's twenty-two references at once is a database browser.
 *   - NO SCORE, NO METER, NO BAR (§6.1). Relevance is order and prominence.
 *     The score exists — it decides whether this door is here at all — and it
 *     is never shown: §2.2 measured that it is unbounded, occasionally
 *     negative, and not comparable between verses.
 *   - THE REASON IS THE CONTENT. "quotes" / "echoes" is why a reader taps, and
 *     it is COMPUTED from the two verses' own words in the translation on
 *     screen (§4) — never looked up, because the dataset that carries it
 *     carries no licence (§3.2). A quote lights the shared phrase; an echo
 *     lights nothing, which is the honest answer.
 *   - NOTHING WHERE THERE IS NOTHING (§5). Below a top score of 30 this door
 *     does not exist and nothing hints that it might.
 *   - ATTRIBUTION ON THE DOOR, for CC BY 4.0 and for the epistemics — the same
 *     register as the word door's provenance line.
 *
 * Nothing is fetched until a reader chooses a verse; the previews behind the
 * fold are not fetched until the fold opens. See connectionsLoader.ts.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { getBibleVerse } from '../bible/service'
import type { TranslationId, VerseConnection } from '../bible/provider'
import { bookByNumber } from '../utils/bibleBooks'
import { classifyConnection, hasConnectionsDoor, type ConnectionMatch } from '../utils/connections'
import { connectionsLoader } from '../utils/connectionsLoader'
import { DeepDiveFold, DeepDiveSheet } from './DeepDiveSheet'

/** §6.2: one full row, then two one-line rows. Everything else is the fold. */
const GLANCE_ROWS = 3

// §3.1. The dataset is CC BY 4.0 and must be credited; the SECOND sentence is
// the one that matters epistemically — the reason on each row is ours, computed
// from the verses themselves, and the reader is told so rather than left to
// assume a source stands behind it.
const PROVENANCE =
  'Cross-references: OpenBible.info (CC BY 4.0), built on the Treasury of Scripture ' +
  'Knowledge. Whether a passage quotes or echoes is not theirs and not in the data — ' +
  'it is worked out here, from the words the two verses actually share in the ' +
  'translation you are reading.'

interface ConnectionsAddress {
  book: number
  chapter: number
  verse: number
  /** "Genesis 15:6" — the label this verse already carries on the page. */
  reference: string
  verseText: string
  translation: TranslationId
}

const bookName = (book: number): string => bookByNumber(book)?.name ?? `Book ${book}`

/** What the reader sees: an en dash in a range, as a reference is printed. */
const label = (c: VerseConnection): string =>
  `${bookName(c.book)} ${c.chapter}:${c.verse}${c.endVerse ? `–${c.endVerse}` : ''}`

/** What `getBibleVerse` parses: a plain hyphen. */
const lookupRef = (c: VerseConnection): string =>
  `${bookName(c.book)} ${c.chapter}:${c.verse}${c.endVerse ? `-${c.endVerse}` : ''}`

const connectionKey = (c: VerseConnection): string =>
  `${c.book}/${c.chapter}/${c.verse}/${c.endVerse ?? ''}`

/**
 * The target's own words, with the shared phrase lit on a quote.
 *
 * The span is computed, not searched for, so it cannot light the wrong words:
 * §4's classifier returns the character range in THIS text that the shared run
 * covers. An echo passes `span: null` and renders untouched.
 */
function Preview({
  text,
  span
}: {
  text: string
  span: [number, number] | null
}): React.ReactElement {
  if (!span) return <>{text}</>
  return (
    <>
      {text.slice(0, span[0])}
      <em className="conn-shared">{text.slice(span[0], span[1])}</em>
      {text.slice(span[1])}
    </>
  )
}

interface LoadedRow {
  connection: VerseConnection
  /** null while the preview is still arriving. */
  text: string | null
  match: ConnectionMatch | null
}

/** One connection. `lead` is the full row; the rest are one line each. */
function ConnectionRow({
  row,
  lead,
  onOpen
}: {
  row: LoadedRow
  lead: boolean
  onOpen: () => void
}): React.ReactElement {
  return (
    <button type="button" className={`conn${lead ? ' lead' : ''}`} onClick={onOpen}>
      <span className="conn-head">
        <span className="conn-ref">{label(row.connection)}</span>
        {/* The reason waits for the text rather than guessing: it is a claim
            about words, so it cannot be made before the words are here. */}
        {row.match && (
          <span className="conn-why">{row.match.kind === 'quote' ? 'quotes' : 'echoes'}</span>
        )}
      </span>
      <span className={`conn-text${lead ? '' : ' one-line'}`}>
        {row.text === null ? '…' : <Preview text={row.text} span={row.match?.span ?? null} />}
      </span>
    </button>
  )
}

/**
 * The layer stacked OVER the held verse: the passage the reader followed, in
 * its own immediate context, with the breadcrumb that says why they are here.
 *
 * CAPPED AT DEPTH 1 in this slice, deliberately — this layer offers no onward
 * connections door. The recursion §6.3 describes is real and wanted, but it
 * belongs with the shared deep-dive stack (which does not exist yet), not
 * half-built inside one door. The origin verse is always one tap away.
 */
function StackedPassage({
  row,
  origin,
  sourceText,
  translation,
  onBack
}: {
  row: LoadedRow
  origin: string
  /** The held verse's own text — the other half of every quote claim. */
  sourceText: string
  translation: TranslationId
  onBack: () => void
}): React.ReactElement {
  const { connection } = row
  const [verses, setVerses] = useState<{ verse: number; text: string }[] | null>(null)

  const last = connection.endVerse ?? connection.verse
  useEffect(() => {
    let live = true
    setVerses(null)
    const from = Math.max(1, connection.verse - 1)
    void getBibleVerse(
      `${bookName(connection.book)} ${connection.chapter}:${from}-${last + 1}`,
      translation
    )
      .then(
        passage =>
          live && setVerses(passage?.verses.map(v => ({ verse: v.verse, text: v.text })) ?? [])
      )
      .catch(() => live && setVerses([]))
    return () => {
      live = false
    }
  }, [connection.book, connection.chapter, connection.verse, last, translation])

  const why = row.match?.kind === 'quote' ? 'quotes' : 'echoes'

  return (
    <div className="conn-stack">
      {/* The breadcrumb IS the way back — one tappable line that says where
          this came from and why, so the origin is never more than a tap away
          (§6.3). */}
      <button type="button" className="conn-crumb" onClick={onBack}>
        <span className="conn-crumb-back" aria-hidden="true">
          ←
        </span>
        <span>
          {label(connection)} <em>{why}</em> {origin}
        </span>
      </button>
      <h3 className="conn-stack-ref">{label(connection)}</h3>
      {verses === null ? (
        <p className="word-door-state">Loading…</p>
      ) : verses.length === 0 ? (
        <p className="word-door-state">That passage could not be loaded just now.</p>
      ) : (
        <div className="conn-stack-verses">
          {verses.map(v => (
            <p
              key={v.verse}
              className={v.verse >= connection.verse && v.verse <= last ? 'conn-v here' : 'conn-v'}
            >
              <span className="verse-number">{v.verse}</span>
              {/* RE-CLASSIFIED against THIS verse, never reused from the row.
                  The row's span is an offset into the row's preview, and for a
                  range ("Romans 4:3–6") that preview is four verses joined —
                  reusing it here would light characters at that offset in a
                  DIFFERENT string, which is precisely the fabricated-highlight
                  failure the whole classifier is built to avoid. Recomputing is
                  also more honest: only the verse that genuinely carries the
                  shared phrase lights up. */}
              <Preview text={v.text} span={classifyConnection(sourceText, v.text).span} />
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** The door: the held verse, its connections, and the one fold. */
function Door({
  address,
  connections,
  onClose
}: {
  address: ConnectionsAddress
  connections: VerseConnection[]
  onClose: () => void
}): React.ReactElement {
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [stacked, setStacked] = useState<string | null>(null)

  // §6.1: ranked exactly in the order the source data already gives them. No
  // client-side re-ranking, and no re-sorting by our own quote/echo typing —
  // that would quietly turn a computed label into a ranking claim.
  const shown = open ? connections : connections.slice(0, GLANCE_ROWS)

  // Only the previews ON SCREEN are fetched. A verse below the salience
  // threshold costs one chapter fetch and no preview at all (§8); opening the
  // fold is what buys the rest.
  useEffect(() => {
    let live = true
    const wanted = shown.filter(c => texts[connectionKey(c)] === undefined)
    if (wanted.length === 0) return
    void (async () => {
      for (let i = 0; i < wanted.length && live; i += 4) {
        const batch = await Promise.all(
          wanted.slice(i, i + 4).map(async c => {
            const passage = await getBibleVerse(lookupRef(c), address.translation).catch(() => null)
            return [connectionKey(c), passage?.text ?? ''] as const
          })
        )
        if (!live) return
        setTexts(prev => ({ ...prev, ...Object.fromEntries(batch) }))
      }
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connections, address.translation])

  const rows = useMemo<LoadedRow[]>(
    () =>
      (open ? connections : connections.slice(0, GLANCE_ROWS)).map(connection => {
        // undefined = still arriving; '' = the preview could not be fetched, in
        // which case the row keeps its reference and makes no claim about words
        // it never got to read.
        const text = texts[connectionKey(connection)]
        return {
          connection,
          text: text === undefined ? null : text,
          match: text ? classifyConnection(address.verseText, text) : null
        }
      }),
    [open, connections, texts, address.verseText]
  )

  const stackedRow = rows.find(r => connectionKey(r.connection) === stacked) ?? null
  const remaining = connections.length - Math.min(GLANCE_ROWS, connections.length)

  return (
    <DeepDiveSheet
      reference={address.reference}
      ariaLabel={`Where Scripture echoes ${address.reference}`}
      onClose={onClose}
    >
      {stackedRow ? (
        <StackedPassage
          row={stackedRow}
          origin={address.reference}
          sourceText={address.verseText}
          translation={address.translation}
          onBack={() => setStacked(null)}
        />
      ) : (
        <>
          {/* The reader's own sentence is the top of the screen, exactly as on
              the word door — the door's heading is the verse, never a claim. */}
          <p className="word-door-verse">{address.verseText}</p>

          <div className="conn-list">
            {rows.map((row, i) => (
              <ConnectionRow
                key={connectionKey(row.connection)}
                row={row}
                lead={i === 0}
                onOpen={() => setStacked(connectionKey(row.connection))}
              />
            ))}
          </div>

          {remaining > 0 && (
            <DeepDiveFold open={open} onToggle={() => setOpen(o => !o)}>
              {open ? 'Fewer connections' : `${remaining} more`}
            </DeepDiveFold>
          )}

          <p className="word-prov">{PROVENANCE}</p>
        </>
      )}
    </DeepDiveSheet>
  )
}

/**
 * The entrance: one quiet line under a verse the reader has already chosen,
 * beside the word door's own line.
 *
 * TEMPORARY BY DESIGN. `docs/proposals/deep-dive-doorways.md` replaces both
 * lines with a single doorways row that asks each layer whether it has anything
 * for this verse; that is the next task, and this line is deliberately shaped
 * to be deleted — it owns no state the row would not own, and the door below it
 * takes only a verse address.
 *
 * It renders NOTHING at all until the chapter's connections are in hand and
 * this verse clears the salience bar (§5), so a verse with nothing to say never
 * flashes an entrance it then withdraws.
 */
export default function ConnectionsDoorEntrance(
  props: ConnectionsAddress
): React.ReactElement | null {
  const { book, chapter, verse } = props
  const [connections, setConnections] = useState<VerseConnection[] | null>(null)
  const [open, setOpen] = useState(false)

  // The ONLY fetch trigger in the feature: a verse the reader deliberately
  // chose. Nothing happens on chapter render, and a chapter already in the
  // IndexedDB cache costs no request at all.
  useEffect(() => {
    let live = true
    setConnections(null)
    void connectionsLoader
      .verse(book, chapter, verse)
      .then(found => live && setConnections(found))
      .catch(() => live && setConnections([]))
    return () => {
      live = false
    }
  }, [book, chapter, verse])

  if (!hasConnectionsDoor(connections ?? undefined)) return null

  return (
    <div className="word-door-entrance conn-door-entrance" onClick={e => e.stopPropagation()}>
      <button type="button" className="word-door-open" onClick={() => setOpen(true)}>
        Where Scripture echoes this
      </button>
      {open && connections && (
        <Door address={props} connections={connections} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
