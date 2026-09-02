import { describe, it, expect } from 'vitest'
import { alternativeWordCount, footnoteSpan, footnoteSpans } from './footnoteSpan'

// Every verse text, note and marker position in this file is VERBATIM from a
// live fetch of https://bible.helloao.org/api/BSB/complete.json (2026-09-01),
// taken the way the app takes it — the marker offset is the length of the
// flattened text BEFORE the marker, which is exactly what helloao.ts computes.
//
// And every assertion is on the underlined SUBSTRING, never on a bare offset,
// for the reason footnotes.test.ts gives: an offset assertion is one you can
// make pass by pasting in today's wrong answer. A reader does not see an
// offset. A reader sees which words have a line under them.

/** The phrase a reader would see underlined, given the text before the marker. */
function underlined(text: string, before: string, note: string): string | null {
  expect(text.startsWith(before)).toBe(true)
  const span = footnoteSpan(text, before.length, note)
  return span === null ? null : text.slice(span.start, span.end)
}

function strategyOf(text: string, before: string, note: string): 'A' | 'B' | null {
  return footnoteSpan(text, before.length, note)?.strategy ?? null
}

const JOHN_1_5 = 'The Light shines in the darkness, and the darkness has not overcome it.'
const JOHN_1_14 =
  'The Word became flesh and made His dwelling among us. We have seen His glory, the glory of the one and only Son from the Father, full of grace and truth.'
const JOHN_1_18 =
  'No one has ever seen God, but the one and only Son, who is Himself God and is at the Father’s side, has made Him known.'

describe('strategy B — underline what the note offers to replace', () => {
  it('takes one word for a one-word alternative', () => {
    // The brief's own example: the marker sits after "overcome".
    expect(
      underlined(
        JOHN_1_5,
        'The Light shines in the darkness, and the darkness has not overcome',
        'Or comprehended'
      )
    ).toBe('overcome')
  })

  it('reaches back over a phrase when the note offers a phrase', () => {
    expect(
      underlined(
        JOHN_1_14,
        'The Word became flesh and made His dwelling among us.',
        'Or and tabernacled among us'
      )
    ).toBe('His dwelling among us')
    expect(
      underlined(
        JOHN_1_18,
        'No one has ever seen God, but the one and only Son, who is Himself God and is at the Father’s side,',
        'Greek in the Father’s bosom'
      )
    ).toBe('at the Father’s side')
  })

  it('drops the trailing punctuation the marker sat after', () => {
    // The marker is after "us." and after "inside;" — an underline running
    // under the stop reads as a typo.
    const ezekiel = 'Then he measured the portico of the gateway inside;'
    expect(
      underlined(ezekiel, ezekiel, 'Literally the portico of the gateway inside, one rod')
    ).toBe('the portico of the gateway inside')
  })

  it('handles the verse-final marker, where offset === text.length', () => {
    const genesis =
      'God called the light “day,” and the darkness He called “night.” And there was evening, and there was morning—the first day.'
    expect(underlined(genesis, genesis, 'Literally day one')).toBe('first day')
  })

  it('handles a marker in the first word, quotation mark and all', () => {
    const ecclesiastes =
      '“Futility of futilities,” says the Teacher, “futility of futilities! Everything is futile!”'
    expect(
      underlined(
        ecclesiastes,
        '“Futility',
        'Literally vapor or breath; the Hebrew words translated in Ecclesiastes as forms of futile or fleeting can also be translated as vanity or meaningless.'
      )
    ).toBe('Futility')
  })

  it('measures only the FIRST alternative when a note offers several', () => {
    const isaiah =
      'He cuts down cedars or retrieves a cypress or oak. He lets it grow strong among the trees of the forest. He plants a laurel, and the rain makes it grow.'
    expect(
      underlined(isaiah, 'He cuts down cedars or retrieves a cypress', 'Or pine or juniper or fir')
    ).toBe('cypress')
  })

  it('stops at the translators’ aside rather than counting it as text', () => {
    // "Greek *Amōs*, a variant spelling of Amon" offers ONE word and then
    // explains it; counting the explanation would underline five words of
    // genealogy the note has no opinion about.
    const matthew =
      'Hezekiah was the father of Manasseh, Manasseh the father of Amon, Amon the father of Josiah,'
    expect(
      underlined(
        matthew,
        'Hezekiah was the father of Manasseh, Manasseh the father of Amon,',
        'Greek Amōs, a variant spelling of Amon; twice in this verse; see 1 Chronicles 3:14.'
      )
    ).toBe('Amon')
  })

  it('never opens the underline on a dangling "and"', () => {
    // Three words offered would give "*and* only Son", which reads as a bug.
    // One word wider is honest and is English.
    expect(
      underlined(
        JOHN_1_14,
        'The Word became flesh and made His dwelling among us. We have seen His glory, the glory of the one and only Son',
        'Or the Only Begotten or the Unique One'
      )
    ).toBe('one and only Son')
  })

  it('does not widen across punctuation to swallow a connective', () => {
    const text = 'He named the altar Witness, and they said so.'
    expect(underlined(text, 'He named the altar Witness, and they said', 'Or and they spoke')).toBe(
      'and they said'
    )
  })
})

describe('strategy A — the last word, when the note is not a substitution', () => {
  it('falls back for a gloss that replaces nothing', () => {
    const jeremiah =
      'But let him who boasts boast in this, that he understands and knows Me, that I am the LORD, who exercises loving devotion, justice and righteousness on the earth— for I delight in these things,” declares the LORD.'
    const before =
      'But let him who boasts boast in this, that he understands and knows Me, that I am the LORD, who exercises loving devotion,'
    expect(
      underlined(
        jeremiah,
        before,
        'Forms of the Hebrew chesed are translated here and in most cases throughout the Scriptures as loving devotion; the range of meaning includes love, goodness, kindness, faithfulness, and mercy, as well as loyalty to a covenant.'
      )
    ).toBe('devotion')
    expect(
      strategyOf(
        jeremiah,
        before,
        'Forms of the Hebrew chesed are translated here and in most cases throughout the Scriptures as loving devotion; the range of meaning includes love, goodness, kindness, faithfulness, and mercy, as well as loyalty to a covenant.'
      )
    ).toBe('A')
  })

  it('falls back when the note re-punctuates a whole sentence', () => {
    // A note offering nine words is not substituting a phrase, and the last
    // nine words of the verse would be an arbitrary place to draw a line.
    const john =
      'In My Father’s house are many rooms. If it were not so, would I have told you that I am going there to prepare a place for you?'
    expect(
      underlined(
        john,
        john,
        'Or If it were not so, I would have told you. I am going there to prepare a place for you.'
      )
    ).toBe('you')
    expect(
      strategyOf(
        john,
        john,
        'Or If it were not so, I would have told you. I am going there to prepare a place for you.'
      )
    ).toBe('A')
  })

  it('reports which strategy produced each span, so the split can be measured', () => {
    expect(
      strategyOf(
        JOHN_1_5,
        'The Light shines in the darkness, and the darkness has not overcome',
        'Or comprehended'
      )
    ).toBe('B')
  })
})

describe('alternativeWordCount', () => {
  it('counts the phrase a substitution offers', () => {
    expect(alternativeWordCount('Or comprehended')).toBe(1)
    expect(alternativeWordCount('Or and tabernacled among us')).toBe(4)
    expect(alternativeWordCount('Greek in the Father’s bosom')).toBe(4)
    expect(alternativeWordCount('Literally day one')).toBe(2)
  })

  it('is null when there is nothing being substituted', () => {
    expect(
      alternativeWordCount('Forms of the Hebrew chesed are translated as loving devotion')
    ).toBeNull()
    expect(alternativeWordCount('The Greek word for you is plural; also in verse 12.')).toBeNull()
    expect(alternativeWordCount('Or')).toBeNull()
  })

  it('is null when the alternative is a sentence rather than a phrase', () => {
    expect(
      alternativeWordCount('Or If it were not so, I would have told you. I am going there.')
    ).toBeNull()
  })
})

describe('footnoteSpans — every door in one verse', () => {
  it('returns them in reading order and never overlapping', () => {
    const spans = footnoteSpans(JOHN_1_14, [
      // Deliberately handed over out of order.
      {
        offset:
          'The Word became flesh and made His dwelling among us. We have seen His glory, the glory of the one and only Son'
            .length,
        text: 'Or the Only Begotten or the Unique One'
      },
      {
        offset: 'The Word became flesh and made His dwelling among us.'.length,
        text: 'Or and tabernacled among us'
      }
    ])
    expect(spans.map(s => JOHN_1_14.slice(s.start, s.end))).toEqual([
      'His dwelling among us',
      'one and only Son'
    ])
    expect(spans[1].start).toBeGreaterThanOrEqual(spans[0].end)
  })

  it('holds a long alternative back at the previous door rather than swallowing it', () => {
    const text = 'the LORD God said to Moses and Aaron in the land of Egypt'
    const spans = footnoteSpans(text, [
      { offset: 'the LORD'.length, text: 'Or Yahweh' },
      {
        offset: 'the LORD God said to Moses and Aaron'.length,
        text: 'Or to Moses and to Aaron the priest'
      }
    ])
    expect(spans.map(s => text.slice(s.start, s.end))).toEqual([
      'LORD',
      'God said to Moses and Aaron'
    ])
    expect(spans[1].start).toBeGreaterThanOrEqual(spans[0].end)
  })

  it('carries each note through with its span, so the popover has its text', () => {
    const spans = footnoteSpans(JOHN_1_5, [
      {
        offset: 'The Light shines in the darkness, and the darkness has not overcome'.length,
        text: 'Or comprehended'
      }
    ])
    expect(spans[0].note.text).toBe('Or comprehended')
  })

  it('is empty for a verse with no notes — the self-hosted fallback case', () => {
    expect(footnoteSpans(JOHN_1_5, [])).toEqual([])
  })
})

describe('no door rather than a door in the wrong place', () => {
  it('returns null when nothing precedes the marker', () => {
    expect(footnoteSpan(JOHN_1_5, 0, 'Or comprehended')).toBeNull()
  })

  it('returns null when only punctuation precedes it', () => {
    expect(footnoteSpan('“Futility of futilities,”', 1, 'Or vapor')).toBeNull()
  })

  it('clamps an offset past the end of the verse instead of throwing', () => {
    expect(underlined(JOHN_1_5, JOHN_1_5, 'Or comprehended')).toBe('it')
    const span = footnoteSpan(JOHN_1_5, JOHN_1_5.length + 50, 'Or comprehended')
    expect(span && JOHN_1_5.slice(span.start, span.end)).toBe('it')
  })
})
