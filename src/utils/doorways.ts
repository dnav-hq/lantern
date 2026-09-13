// The doorways row — which doors a verse has, and what each one says.
//
// docs/proposals/deep-dive-doorways.md, "What changes in code" item 2. The row
// is the ONE place the deep dive shows itself on the reading page: it names
// only the doors the verse actually has, each as a fact in the reader's words,
// and it is absent when a verse has nothing behind it. This file is the pure
// half — given what each layer reported, produce the ordered row — so the
// wording and the ordering are under test rather than tangled into JSX.
//
// Ordering is PRESENCE ORDER, word → connections → map: a stated ordering, not
// a ranking. The salience model of deep-dive-study.md §8.2 is still unbuilt,
// and faking one here would be the ranked list the word door brief forbids.
//
// Nothing here imports React, fetches, or touches the DOM.
import type { ParsingEntry, VerseWord } from './wordIndex'
import { salientWords, type SalientWord } from './wordIndexLoader'

export type DoorKind = 'word' | 'connections' | 'map'

export interface Doorway {
  kind: DoorKind
  /** The fact the door names, e.g. "bāraḵ · 3× here". Tokens, no icons. */
  label: string
}

/** What the word index holds for this verse, reduced to the one lead word. */
export interface WordPresence {
  /** The lead word as the verse prints it (see `leadWord`). */
  lead: SalientWord
  /** How many times the lead word's lemma stands in this verse. */
  count: number
}

/** What the connections index holds. `null` from the loader means no door. */
export interface ConnectionsPresence {
  count: number
  quotes: number
  echoes: number
  top: number
}

/** How many geocoded places the CHAPTER carries (chapter-scoped by decision). */
export interface MapPresence {
  places: number
}

export interface PresenceReport {
  word?: WordPresence | null
  connections?: ConnectionsPresence | null
  map?: MapPresence | null
}

/**
 * The verse's lead word: the salient word whose lemma the verse says most
 * often, ties going to verse order. That is a fact about the sentence — one
 * Hebrew word wearing three English coats in Genesis 12:3 — not a judgement
 * about which word matters, which is all a presence-only row may claim.
 * `null` when the verse has no salient word (nothing tagged, or only grammar).
 */
export function leadWord(words: VerseWord[], parsing: ParsingEntry[]): WordPresence | null {
  const salient = salientWords(words, parsing)
  if (salient.length === 0) return null
  const counts = new Map<string, number>()
  for (const [, strongs] of words) {
    if (strongs) counts.set(strongs, (counts.get(strongs) ?? 0) + 1)
  }
  let lead = salient[0]
  let count = counts.get(lead.strongs) ?? 1
  for (const w of salient.slice(1)) {
    const c = counts.get(w.strongs) ?? 1
    if (c > count) {
      lead = w
      count = c
    }
  }
  return { lead, count }
}

/**
 * The transliteration as the doorway prints it. The tables mark syllables with
 * a middle dot ("hă·ḇêl"); the row already uses that dot as its separator, so
 * the syllable dots come out here and only here — the door's own chips keep
 * them. The lemma's dictionary form lives in the lemma shard, which is the
 * door's full data and must not load before the tap, so the row shows the
 * verse's own form of the word.
 */
export function doorwayTranslit(translit: string): string {
  return translit.replace(/·/g, '')
}

export function wordDoorwayLabel(presence: WordPresence): string {
  const name = doorwayTranslit(presence.lead.translit)
  return presence.count > 1 ? `${name} · ${presence.count}× here` : `${name} · once here`
}

/** "2 quotes · 4 echoes", "1 quote", "4 echoes" — never a zero, never a meter. */
export function connectionsDoorwayLabel(presence: ConnectionsPresence): string {
  const parts: string[] = []
  if (presence.quotes > 0) parts.push(`${presence.quotes} ${plural(presence.quotes, 'quote')}`)
  if (presence.echoes > 0) parts.push(`${presence.echoes} ${plural(presence.echoes, 'echo')}`)
  if (parts.length === 0 && presence.count > 0) {
    parts.push(`${presence.count} ${plural(presence.count, 'connection')}`)
  }
  return parts.join(' · ')
}

export function mapDoorwayLabel(presence: MapPresence): string {
  return `${presence.places} ${plural(presence.places, 'place')} in this chapter`
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}${word.endsWith('o') ? 'es' : 's'}`
}

/**
 * The row. Each door appears only where its layer reported something, in the
 * stated order. An `undefined` report (still loading) and a `null` one (no
 * door) both leave the door out — the component adds doors as reports land,
 * and a door that has landed never leaves.
 */
export function buildDoorways(report: PresenceReport): Doorway[] {
  const out: Doorway[] = []
  if (report.word) out.push({ kind: 'word', label: wordDoorwayLabel(report.word) })
  if (report.connections && report.connections.count > 0) {
    out.push({ kind: 'connections', label: connectionsDoorwayLabel(report.connections) })
  }
  if (report.map && report.map.places > 0) {
    out.push({ kind: 'map', label: mapDoorwayLabel(report.map) })
  }
  return out
}
