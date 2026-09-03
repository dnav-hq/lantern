/**
 * The word door — the original-language word behind an English one, shown as
 * its neighbourhood rather than as its definition.
 *
 * docs/proposals/word-door-guardrails.md is the whole argument and
 * design/word-door.html is the approved visual reference. The rules this file
 * exists to keep, in the order they bite:
 *
 *   - READING ORDER IS THE ARGUMENT (§9a.2). The verse, then how the BSB
 *     renders it, then where else the word stands, and the lexicon gloss LAST
 *     with its provenance attached. That is deliberately upside-down from every
 *     lexicon tool, because whatever sits at the top is read as the answer.
 *   - NEVER A RANKED SENSE LIST (R2, R3). No "really means", no definitional
 *     heading, no single-word answer up top. The rendering counts are labelled
 *     "How the BSB renders it" and never "meanings": counting how one
 *     translation team put a word into English is a fact about the BSB, not a
 *     claim about Hebrew.
 *   - OCCURRENCES IN THEIR SENTENCES (R1), flat and canonical, twenty at a
 *     time, with the verse you came from pinned. NOT grouped by rendering —
 *     grouping quietly rebuilds the ranked sense list R2 forbids.
 *   - NOTHING MARKS THE WORD IN THE READING PAGE (§9a.3). The footnotes door
 *     already owns the dotted underline and leads somewhere else; a second door
 *     in the same costume is worse than none. The only entrance is the
 *     deliberate one below, which appears under a verse the reader has already
 *     chosen and is gone the moment they let it go.
 *   - PROVENANCE IS ON THE DOOR (R7), for CC BY 4.0 and for the epistemics.
 *
 * Nothing is fetched until the reader opens this. See wordIndexLoader.ts.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApi } from '../api/context'
import { bookByNumber } from '../utils/bibleBooks'
import {
  decodeOccurrence,
  hasGloss,
  packRef,
  type Occurrence,
  type ParsingEntry,
  type RawLemmaEntry,
  type RenderingCount
} from '../utils/wordIndex'
import { salientWords, wordIndexLoader, type SalientWord } from '../utils/wordIndexLoader'

/** §9a.4: occurrences page flat and canonical, twenty at a time. */
const PAGE = 20

// R7. Named on the entry, not in a settings page — required by CC BY 4.0 for
// the STEPBible material, and the honest signal that a gloss came from an
// abridged lexicon rather than from Lantern.
const PROVENANCE =
  'Alignment and morphology: BSB Translation Tables (bereanbible.com), public domain. ' +
  'Lexicon: STEPBible / Tyndale House, CC BY 4.0.'

interface VerseAddress {
  book: number
  chapter: number
  verse: number
  /** "Ecclesiastes 1:2" — the label this verse already carries on the page. */
  reference: string
  verseText: string
}

const refLabel = (book: number, chapter: number, verse: number): string =>
  `${bookByNumber(book)?.name ?? `Book ${book}`} ${chapter}:${verse}`

/** Case-fold and drop the translators' supplied brackets: "[is] but a vapor". */
const bare = (form: string): string => form.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim()

/**
 * The verse with this instance's English rendering marked.
 *
 * Presentation only, and it fails silently: where the rendering cannot be found
 * in the verse (supplied words, a phrase the flattened text spells differently)
 * the verse renders untouched rather than showing an approximation.
 */
function Marked({ text, form }: { text: string; form: string }): React.ReactElement {
  const needle = bare(form)
  const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <em className="word-here">{text.slice(at, at + needle.length)}</em>
      {text.slice(at + needle.length)}
    </>
  )
}

/** One occurrence row: a reference and the whole sentence it stands in. */
function OccurrenceRow({
  occurrence,
  times,
  pinned,
  text
}: {
  occurrence: Occurrence
  times: number
  pinned?: boolean
  text: string | null
}): React.ReactElement {
  const { book, chapter, verse } = occurrence
  return (
    <div className={`word-occ${pinned ? ' pinned' : ''}`}>
      <span className="word-occ-ref">
        {refLabel(book, chapter, verse)}
        {pinned && ' · where you are'}
        {times > 1 && ` · ${times} times here`}
      </span>
      {text === null ? (
        <span className="word-occ-pending">…</span>
      ) : (
        <Marked text={text} form={occurrence.english} />
      )}
    </div>
  )
}

/** A rendering chip: the form and how many of the lemma's uses wear it. */
function Chips({ list, here }: { list: RenderingCount[]; here: string }): React.ReactElement {
  const mine = bare(here).toLowerCase()
  return (
    <div className="word-renderings">
      {list.map(([form, count]) => (
        <span key={form} className={bare(form).toLowerCase() === mine ? 'is-here' : undefined}>
          {form} <span className="word-count">{count}</span>
        </span>
      ))}
    </div>
  )
}

interface DoorProps extends VerseAddress {
  word: SalientWord
  parsing: ParsingEntry[]
}

/**
 * The door's body for one chosen word: everything below the word chooser.
 *
 * Every branch here renders a door. A lemma no lexicon covers (542 of them,
 * brief §5.4) simply has no gloss row — it is not an error state and it is
 * never labelled as lacking one, which is the same rule that keeps the
 * Hebrew/Greek sense asymmetry invisible (§9a.6).
 */
function DoorBody({
  word,
  parsing,
  book,
  chapter,
  verse,
  verseText
}: DoorProps): React.ReactElement {
  const api = useApi()
  const [entry, setEntry] = useState<RawLemmaEntry | null>(null)
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [texts, setTexts] = useState<Record<number, string>>({})

  useEffect(() => {
    let live = true
    setEntry(null)
    setFailed(false)
    setShown(PAGE)
    wordIndexLoader
      .lemma(word.strongs)
      .then(found => live && setEntry(found))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [word.strongs])

  // One row per VERSE, in canonical order, carrying how many times the word
  // stands in it — a verse that says hebel four times is one sentence to read,
  // not four rows. The verse the reader came from is pinned out of the flow.
  const { pinned, rest } = useMemo(() => {
    if (!entry) return { pinned: null as Occurrence | null, rest: [] as [Occurrence, number][] }
    const rows = new Map<number, [Occurrence, number]>()
    for (const raw of entry.o) {
      const existing = rows.get(raw[0])
      if (existing) existing[1] += 1
      else rows.set(raw[0], [decodeOccurrence(entry, raw, parsing), 1])
    }
    const here = rows.get(packRef(book, chapter, verse))
    const list = [...rows.values()].filter(row => row !== here)
    return { pinned: here?.[0] ?? null, rest: list }
  }, [entry, parsing, book, chapter, verse])

  // The sentences the occurrences stand in, fetched a page at a time through
  // the api seam (which caches a chapter forever once read). Only the page on
  // screen is fetched: a lemma with 700 occurrences costs 20 chapters, not 700.
  useEffect(() => {
    let live = true
    const page = rest.slice(0, shown)
    const wanted = page.filter(([o]) => texts[o.ref] === undefined)
    if (wanted.length === 0) return
    void (async () => {
      for (let i = 0; i < wanted.length && live; i += 4) {
        const batch = await Promise.all(
          wanted.slice(i, i + 4).map(async ([o]) => {
            const passage = await api
              .getBibleVerse(refLabel(o.book, o.chapter, o.verse))
              .catch(() => null)
            const line = passage?.verses.find(v => v.verse === o.verse) ?? passage?.verses[0]
            return [o.ref, line?.text ?? ''] as const
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
  }, [rest, shown])

  if (failed) {
    return <p className="word-door-state">The word index could not be loaded just now.</p>
  }
  if (!entry) return <p className="word-door-state">Loading…</p>

  const testament = word.strongs.startsWith('G') ? 'New Testament' : 'Old Testament'
  const grammar = parsing[word.parsing]?.[0] ?? ''
  const terse = parsing[word.parsing]?.[1] ?? ''
  const remaining = rest.length - Math.min(shown, rest.length)

  return (
    <>
      {/* 1. The verse. The reader's own sentence is the top of the screen, and
          the door's heading — never a definition (R3). */}
      <p className="word-door-verse">
        <Marked text={verseText} form={word.english} />
      </p>

      <div className="word-row">
        <div className="word-key">The word</div>
        <div className="word-value">
          <span className="word-lemma" lang={word.strongs.startsWith('G') ? 'grc' : 'he'}>
            {entry.l}
          </span>{' '}
          <span className="word-translit">{entry.t || word.translit}</span>
          <span className="word-count">
            {word.strongs} · {entry.n} {entry.n === 1 ? 'time' : 'times'} in the {testament}
          </span>
        </div>
      </div>

      {/* §9a.5: the EXPANDED parsing, in plain English. The terse code the
          tables also ship rides along with the provenance, for anyone who
          reads it. */}
      {grammar && (
        <div className="word-row">
          <div className="word-key">Its grammar here</div>
          <div className="word-value">
            {grammar}
            {terse && <span className="word-count">{terse}</span>}
          </div>
        </div>
      )}

      {/* 2. How the BSB renders it. NEVER "meanings" (§9a.1). The distinct-forms
          headline leads and the chips support it: the headline makes the
          anti-single-meaning argument without ranking anything. */}
      <div className="word-row">
        <div className="word-key">
          How the BSB
          <br />
          renders it
        </div>
        <div className="word-value">
          <p className="word-headline">
            Put into English {entry.r.length} different {entry.r.length === 1 ? 'way' : 'ways'}{' '}
            across {entry.n} {entry.n === 1 ? 'occurrence' : 'occurrences'}.
          </p>
          <Chips list={entry.rg} here={word.english} />
          <p className="word-prov">
            Counted from the BSB Translation Tables. The chips collapse those {entry.r.length} forms
            to {entry.rg.length} by head word — an editorial grouping of ours, not a fact about the
            word.
          </p>
        </div>
      </div>

      {/* 3. Where else it stands — the occurrences, which are the point (R1). */}
      <h3 className="word-section">Where else it stands</h3>
      <div className="word-occs">
        {pinned && (
          <OccurrenceRow
            occurrence={pinned}
            times={entry.o.filter(o => o[0] === pinned.ref).length}
            pinned
            text={verseText}
          />
        )}
        {rest.slice(0, shown).map(([occurrence, times]) => (
          <OccurrenceRow
            key={occurrence.ref}
            occurrence={occurrence}
            times={times}
            text={texts[occurrence.ref] ?? null}
          />
        ))}
      </div>
      {remaining > 0 && (
        <button type="button" className="word-more" onClick={() => setShown(s => s + PAGE)}>
          Show more — {remaining} of {rest.length} remaining
        </button>
      )}

      {/* 4. The lexicon, LAST, with its provenance attached (§9a.2). Greek
          entries carry sense text and Hebrew ones do not (§4.2); neither door
          says so. */}
      {hasGloss(entry) && (
        <div className="word-row">
          <div className="word-key">A lexicon gloss</div>
          <div className="word-value word-muted">
            {entry.g.join('; ')}
            <p className="word-prov">
              Brief entry, STEPBible/Tyndale House. One editor’s summary — not a definition, and not
              necessarily what the BSB chose in any verse above.
            </p>
          </div>
        </div>
      )}
      {entry.s.length > 0 && (
        <div className="word-row">
          <div className="word-key">In the lexicon’s words</div>
          <div className="word-value word-muted">
            {entry.s.map((line, i) => (
              <p key={i} className="word-sense">
                {line}
              </p>
            ))}
            <p className="word-prov">
              STEPBible, from Abbott-Smith and Middle Liddell — nineteenth- and twentieth-century
              lexicons, quoted as they stand.
            </p>
          </div>
        </div>
      )}

      {/* §7. Permanent, descriptive, never a warning and never dismissible. */}
      <p className="word-limits">
        <strong>What this can and cannot tell you.</strong> You are looking at where a word is used
        and how it has been put into English. That is evidence about the word’s range, not a
        definition of it, and a word does not carry all of its uses into any one verse. What it
        means here is settled by this sentence, not by this list.
      </p>
      <p className="word-prov">{PROVENANCE}</p>
    </>
  )
}

/**
 * The door itself: the verse, its words, and whichever one the reader chose.
 *
 * The chooser is a flat row of the verse's own words in the verse's own order —
 * emphatically not a league table. §8.2 wants one salient word to LEAD and the
 * rest reachable inside; ranking them would need a salience model this slice
 * does not have, and inventing one would be exactly the ranked list the brief
 * forbids everywhere else.
 */
function Door({
  address,
  onClose
}: {
  address: VerseAddress
  onClose: () => void
}): React.ReactElement {
  const [words, setWords] = useState<SalientWord[] | null>(null)
  const [parsing, setParsing] = useState<ParsingEntry[] | null>(null)
  const [chosen, setChosen] = useState<number>(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([
      wordIndexLoader.verseWords(address.book, address.chapter, address.verse),
      wordIndexLoader.parsing()
    ])
      .then(([verseWords, table]) => {
        if (!live) return
        setParsing(table)
        setWords(salientWords(verseWords, table))
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [address.book, address.chapter, address.verse])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const word = words && words.length > 0 ? (words[chosen] ?? words[0]) : null

  return createPortal(
    <>
      <div className="word-scrim" onClick={onClose} />
      <div
        className="word-sheet"
        role="dialog"
        aria-label={`The words behind ${address.reference}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="word-sheet-head">
          <span className="word-door-ref">{address.reference}</span>
          <button type="button" className="word-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="word-sheet-body">
          {failed && (
            <p className="word-door-state">The word index could not be loaded just now.</p>
          )}
          {!failed && words === null && <p className="word-door-state">Loading…</p>}
          {words !== null && words.length === 0 && (
            <p className="word-door-state">
              This verse has no tagged words in the BSB Translation Tables.
            </p>
          )}
          {words !== null && words.length > 0 && (
            <div className="word-picker" role="tablist" aria-label="Words in this verse">
              {words.map((w, i) => (
                <button
                  key={w.strongs}
                  type="button"
                  role="tab"
                  aria-selected={i === chosen}
                  className={i === chosen ? 'is-chosen' : undefined}
                  onClick={() => setChosen(i)}
                >
                  {w.english}
                  <span className="word-translit">{w.translit}</span>
                </button>
              ))}
            </div>
          )}
          {word && parsing && <DoorBody {...address} word={word} parsing={parsing} />}
        </div>
      </div>
    </>,
    document.body
  )
}

/**
 * The only entrance: one quiet line under a verse the reader has already chosen.
 *
 * It cannot be a mark on the word (§9a.3), and it must not fight verse
 * selection — which on mobile is what a tap already means. So it does neither:
 * it is a separate control that appears BELOW the chosen verse, downstream of
 * the selection rather than competing with it, and it disappears with the
 * selection. Reaching it therefore takes a deliberate second act, and a reader
 * who never performs it downloads not one byte of the word index.
 */
export default function WordDoorEntrance(props: VerseAddress): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div className="word-door-entrance" onClick={e => e.stopPropagation()}>
      <button type="button" className="word-door-open" onClick={() => setOpen(true)}>
        The words behind this verse
      </button>
      {open && <Door address={props} onClose={() => setOpen(false)} />}
    </div>
  )
}
