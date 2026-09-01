import { describe, it, expect, vi, afterEach } from 'vitest'
import { classifyFootnote, footnoteShips } from './footnotes'
import { flattenVerseContent, HelloaoBibleProvider } from '../bible/helloao'

// Every note text and every verse `content` array in this file is VERBATIM from
// a live fetch of https://bible.helloao.org/api/BSB/complete.json (2026-09-01) —
// no toy strings. That matters most for the offsets: the anchoring code fails
// silently and beautifully (docs/proposals/footnotes-door.md §9), so the tests
// assert the exact anchored SUBSTRING, never a bare offset, because an offset
// assertion is one you can make pass by copying the current wrong answer.

afterEach(() => {
  vi.restoreAllMocks()
})

describe('classifyFootnote — what a reader may see', () => {
  it('ships the plain alternate renderings', () => {
    expect(classifyFootnote('Or futile')).toBe('rendering')
    expect(classifyFootnote('Literally the temple')).toBe('rendering')
    expect(classifyFootnote('Hebrew El-Shaddai')).toBe('rendering')
    expect(classifyFootnote('Or offspring')).toBe('rendering')
    expect(
      classifyFootnote(
        'Forms of the Hebrew cherem refer to the giving over of things or persons, either by destroying them or by giving them as an offering.'
      )
    ).toBe('rendering')
    expect(classifyFootnote('The Greek word for you is plural; also in verse 12.')).toBe('rendering')
  })

  it('holds anything that mentions manuscripts, however it leads', () => {
    expect(classifyFootnote('Some manuscripts omit this question.')).toBe('variant')
    expect(classifyFootnote('Some early manuscripts end the Gospel of Mark after verse 8')).toBe(
      'variant'
    )
    // The order of the tests IS the safety property: an "Or …" lead does not
    // rescue a note that also talks about manuscripts.
    expect(
      classifyFootnote(
        'Or A unique disaster, as in most Hebrew manuscripts; some Hebrew manuscripts and Syriac Disaster after disaster'
      )
    ).toBe('variant')
  })

  it('reads "Hebrew " and "Hebrew;" as the opposite things they are', () => {
    // 324 of the first, 84 of the second, and the punctuation is the only
    // discriminator (brief §3.2).
    expect(classifyFootnote('Hebrew Shephelah')).toBe('rendering')
    expect(classifyFootnote('Hebrew; LXX and 1 Chronicles 1:17 Meshech')).toBe('variant')
  })

  it('holds a siglum that introduces a clause, and ships one cited in support', () => {
    expect(classifyFootnote('MT; Syriac and over all the beasts of the earth')).toBe('variant')
    expect(classifyFootnote('BYZ and TR include and whatever is right')).toBe('variant')
    // 49 of the 1,336 "Or …" notes cite a witness FOR the printed reading.
    expect(classifyFootnote('Or not a nation; see also LXX.')).toBe('rendering')
    expect(classifyFootnote('Or the base of his throne; see also LXX.')).toBe('rendering')
  })

  it('does not mistake the divine name for a manuscript witness', () => {
    // LORD (97), YAH (16), YHWH (7) and GOD (3) are the BSB's other all-caps
    // tokens; an "any all-caps token" heuristic would hold these.
    expect(classifyFootnote('Or the LORD saved David; also in verse 13')).toBe('rendering')
    expect(
      classifyFootnote(
        'Or The LORD our God is One LORD or The LORD is our God, the LORD is One or The LORD is our God, the LORD alone; cited in Mark 12:29'
      )
    ).toBe('rendering')
  })

  it('holds the supplied-word notes the first audit caught escaping', () => {
    // Two of these were classified `rendering` by v1 and would have SHIPPED —
    // the whole reason the class exists (brief §3.4).
    expect(classifyFootnote('Hebrew does not include of Egypt.')).toBe('supplied')
    expect(classifyFootnote('Or always fears the LORD; Hebrew does not include the LORD.')).toBe(
      'supplied'
    )
    expect(classifyFootnote('Hebrew does not include of doom.')).toBe('supplied')
  })

  it('sorts the notes that are neither, so none of them ships', () => {
    expect(classifyFootnote('Cited in 2 Corinthians 4:6')).toBe('citation')
    expect(classifyFootnote('Psalms 118:26')).toBe('citation')
    expect(classifyFootnote('See Galatians 3:8')).toBe('citation')
    expect(classifyFootnote('15 cubits is approximately 22.5 feet or 6.9 meters.')).toBe('measure')
    expect(classifyFootnote('That is, Babylonia')).toBe('gloss')
    expect(classifyFootnote('Maskil is probably a musical or liturgical term')).toBe('gloss')
    expect(classifyFootnote("Pinions are the outer parts of a bird's wings.")).toBe('other')
  })

  it('ships the rendering class and nothing else', () => {
    expect(footnoteShips('Or futile')).toBe(true)
    expect(footnoteShips('Some manuscripts omit this question.')).toBe(false)
    expect(footnoteShips('Cited in 2 Corinthians 4:6')).toBe(false)
    expect(footnoteShips('That is, Babylonia')).toBe(false)
    expect(footnoteShips('Hebrew does not include of Egypt.')).toBe(false)
  })
})

// The verse `content` arrays below are copied exactly out of the live API.
const GEN_1_5 = [
  'God called the light “day,” and the darkness He called “night.”',
  { lineBreak: true as const },
  'And there was evening, and there was morning—the first day.',
  { noteId: 1 }
]
const GEN_1_26 = [
  'Then God said, “Let Us make man in Our image, after Our likeness, to rule over the fish of the sea and the birds of the air, over the livestock, and over all the earth itself',
  { noteId: 3 },
  'and every creature that crawls upon it.”'
]
const GEN_16_13 = [
  'So Hagar gave this name to the LORD who had spoken to her: “You are the God who sees me,',
  { noteId: 76 },
  '” for she said, “Here I have seen the One who sees me!”'
]
const GEN_3_16 = [
  'To the woman He said:',
  { lineBreak: true as const },
  { text: '“I will sharply increase your pain in childbirth;', poem: 1 },
  { text: 'in pain you will bring forth children.', poem: 2 },
  { text: 'Your desire will be for your husband,', poem: 1 },
  { noteId: 15 },
  { text: 'and he will rule over you.”', poem: 2 }
]
const ECC_1_2 = [
  { text: '“Futility', poem: 1 },
  { noteId: 1 },
  { text: 'of futilities,”', poem: 1 },
  { text: 'says the Teacher,', poem: 2 },
  { text: '“futility of futilities!', poem: 1 },
  { text: 'Everything is futile!”', poem: 2 }
]
const PSA_119_70 = [
  { text: 'Their hearts are callous and insensitive,', poem: 1 },
  { noteId: 261 },
  { text: 'but I delight in Your law.', poem: 2 }
]
const DAN_11_6 = [
  'After some years they will form an alliance, and the daughter of the king of the South will go to the king of the North to seal the agreement. But his daughter will not retain her position of power, nor will his strength',
  { noteId: 47 },
  'endure. At that time she will be given up, along with her royal escort and her father',
  { noteId: 48 },
  'and the one who supported her.'
]

// The one thing a bug here actually produces: an underline under the wrong
// word. So each case names the phrase the offset must land at the END of.
describe('footnote anchoring — the character offset', () => {
  const anchorOf = (content: Parameters<typeof flattenVerseContent>[0], markerIndex: number) => {
    const text = flattenVerseContent(content)
    const anchored = flattenVerseContent(content.slice(0, markerIndex))
    // The invariant the provider relies on: the prefix must flatten to a
    // genuine prefix of the verse.
    expect(text.startsWith(anchored)).toBe(true)
    return { text, offset: anchored.length }
  }

  it('anchors a marker between two poetry runs (Ecclesiastes 1:2)', () => {
    const { text, offset } = anchorOf(ECC_1_2, 1)
    expect(text).toBe(
      '“Futility of futilities,” says the Teacher, “futility of futilities! Everything is futile!”'
    )
    expect(text.slice(0, offset)).toBe('“Futility')
    expect(text[offset]).toBe(' ')
  })

  it('survives the space the flattener eats before closing punctuation (Genesis 16:13)', () => {
    // A naive "sum the lengths of the parts before the marker" drifts by one
    // here: the join adds a space and the punctuation rule then removes it.
    const { text, offset } = anchorOf(GEN_16_13, 1)
    expect(text.slice(0, offset)).toBe(
      'So Hagar gave this name to the LORD who had spoken to her: “You are the God who sees me,'
    )
    expect(text[offset]).toBe('”')
  })

  it('survives a lineBreak inside the anchored prefix (Genesis 3:16)', () => {
    const { text, offset } = anchorOf(GEN_3_16, 5)
    expect(text.slice(0, offset).endsWith('Your desire will be for your husband,')).toBe(true)
    expect(text.slice(offset)).toBe(' and he will rule over you.”')
  })

  it('anchors a verse-final marker at the very end of the verse (Genesis 1:5)', () => {
    const { text, offset } = anchorOf(GEN_1_5, 3)
    expect(offset).toBe(text.length)
    expect(text.endsWith('the first day.')).toBe(true)
  })

  it('anchors both markers in a verse that carries two (Daniel 11:6)', () => {
    const first = anchorOf(DAN_11_6, 1)
    const second = anchorOf(DAN_11_6, 3)
    expect(first.text.slice(0, first.offset).endsWith('nor will his strength')).toBe(true)
    expect(second.text.slice(0, second.offset).endsWith('and her father')).toBe(true)
    expect(first.offset).toBeLessThan(second.offset)
  })

  it('anchors a marker mid-verse in a psalm (Psalm 119:70)', () => {
    const { text, offset } = anchorOf(PSA_119_70, 1)
    expect(text.slice(0, offset)).toBe('Their hearts are callous and insensitive,')
    expect(text.slice(offset)).toBe(' but I delight in Your law.')
  })
})

// A slice of the real Genesis 1 response: five real footnotes, of which two are
// citations, one is a textual variant and two are alternate renderings.
const GENESIS_1 = {
  chapter: {
    number: 1,
    content: [
      { type: 'verse', number: 5, content: GEN_1_5 },
      { type: 'verse', number: 13, content: ['And there was evening, and there was morning—the third day.'] },
      { type: 'verse', number: 26, content: GEN_1_26 }
    ],
    footnotes: [
      { noteId: 0, caller: '+', text: 'Cited in 2 Corinthians 4:6', reference: { chapter: 1, verse: 3 } },
      { noteId: 1, caller: '+', text: 'Literally day one', reference: { chapter: 1, verse: 5 } },
      {
        noteId: 3,
        caller: '+',
        text: 'MT; Syriac and over all the beasts of the earth',
        reference: { chapter: 1, verse: 26 }
      }
    ]
  }
}

function stubChapter(payload: unknown) {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => payload }) as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('HelloaoBibleProvider — carrying the notes through the seam', () => {
  it('attaches a rendering note to its verse, anchored to the phrase', async () => {
    stubChapter(GENESIS_1)
    const [verse5] = await new HelloaoBibleProvider('BSB').getChapter(1, 1)
    expect(verse5.notes).toHaveLength(1)
    const note = verse5.notes![0]
    expect(note.text).toBe('Literally day one')
    expect(verse5.text.slice(0, note.offset).endsWith('the first day.')).toBe(true)
  })

  it('withholds a textual variant completely — no note, no marker, no count', async () => {
    stubChapter(GENESIS_1)
    const verses = await new HelloaoBibleProvider('BSB').getChapter(1, 1)
    const verse26 = verses.find(v => v.verse === 26)!
    // 'MT; Syriac …' is a variant. §6: silence must be genuinely silent, so the
    // key is ABSENT rather than an empty array something could count.
    expect(verse26.notes).toBeUndefined()
    expect('notes' in verse26).toBe(false)
    expect(verse26.text).toContain('every creature that crawls upon it')
  })

  it('leaves a verse with no footnote at all untouched', async () => {
    stubChapter(GENESIS_1)
    const verses = await new HelloaoBibleProvider('BSB').getChapter(1, 1)
    expect(verses.find(v => v.verse === 13)).toEqual({
      verse: 13,
      text: 'And there was evening, and there was morning—the third day.'
    })
  })

  it('never reads footnotes for a translation whose notes are not ours', async () => {
    // helloao's eng_net leaks 39 NET translator notes the licence excludes.
    // The rule is structural: the array is not read at all (brief §8).
    stubChapter({
      chapter: {
        number: 1,
        content: [{ type: 'verse', number: 5, content: GEN_1_5 }],
        footnotes: [
          { noteId: 1, caller: '+', text: 'Or day one', reference: { chapter: 1, verse: 5 } }
        ]
      }
    })
    const [verse] = await new HelloaoBibleProvider('eng_net').getChapter(1, 1)
    expect(verse.notes).toBeUndefined()
  })

  it('drops a marker whose note is missing rather than failing the chapter', async () => {
    stubChapter({
      chapter: {
        number: 1,
        content: [{ type: 'verse', number: 5, content: GEN_1_5 }],
        footnotes: []
      }
    })
    const [verse] = await new HelloaoBibleProvider('BSB').getChapter(1, 1)
    expect(verse.notes).toBeUndefined()
    expect(verse.text).toContain('God called the light')
  })

  it('drops a note that belongs to a psalm superscription, which has no row to hang on', async () => {
    stubChapter({
      chapter: {
        number: 6,
        content: [{ type: 'verse', number: 1, content: ['O LORD, do not rebuke me in Your anger', { noteId: 9 }] }],
        footnotes: [
          {
            noteId: 9,
            caller: '+',
            text: 'Sheminith is probably a musical term',
            reference: { chapter: 6, verse: 0 }
          }
        ]
      }
    })
    const [verse] = await new HelloaoBibleProvider('BSB').getChapter(19, 6)
    expect(verse.notes).toBeUndefined()
  })
})
