export interface BibleBook {
  id: string
  // USFM book number, 1 (Genesis) – 66 (Revelation). Canonical id used in the DB
  // (passages.book_number) and by the scripture provider.
  number: number
  name: string
  abbreviation: string
  aliases: string[]
  testament: 'OT' | 'NT'
  chapters: number
}

// Source rows omit `number`; it is assigned from canonical order (index + 1) below.
const BIBLE_BOOKS_SOURCE: Omit<BibleBook, 'number'>[] = [
  {
    id: 'gen',
    name: 'Genesis',
    abbreviation: 'Gen',
    aliases: ['genesis', 'gen', 'ge'],
    testament: 'OT',
    chapters: 50
  },
  {
    id: 'exo',
    name: 'Exodus',
    abbreviation: 'Exo',
    aliases: ['exodus', 'exo', 'ex', 'exod'],
    testament: 'OT',
    chapters: 40
  },
  {
    id: 'lev',
    name: 'Leviticus',
    abbreviation: 'Lev',
    aliases: ['leviticus', 'lev', 'le'],
    testament: 'OT',
    chapters: 27
  },
  {
    id: 'num',
    name: 'Numbers',
    abbreviation: 'Num',
    aliases: ['numbers', 'num', 'nu', 'nb'],
    testament: 'OT',
    chapters: 36
  },
  {
    id: 'deu',
    name: 'Deuteronomy',
    abbreviation: 'Deu',
    aliases: ['deuteronomy', 'deu', 'dt', 'deut'],
    testament: 'OT',
    chapters: 34
  },
  {
    id: 'jos',
    name: 'Joshua',
    abbreviation: 'Jos',
    aliases: ['joshua', 'jos', 'josh'],
    testament: 'OT',
    chapters: 24
  },
  {
    id: 'jdg',
    name: 'Judges',
    abbreviation: 'Jdg',
    aliases: ['judges', 'jdg', 'jud', 'judg'],
    testament: 'OT',
    chapters: 21
  },
  {
    id: 'rut',
    name: 'Ruth',
    abbreviation: 'Rut',
    aliases: ['ruth', 'rut', 'ru'],
    testament: 'OT',
    chapters: 4
  },
  {
    id: '1sa',
    name: '1 Samuel',
    abbreviation: '1Sa',
    aliases: ['1 samuel', '1sa', '1sam', '1s'],
    testament: 'OT',
    chapters: 31
  },
  {
    id: '2sa',
    name: '2 Samuel',
    abbreviation: '2Sa',
    aliases: ['2 samuel', '2sa', '2sam', '2s'],
    testament: 'OT',
    chapters: 24
  },
  {
    id: '1ki',
    name: '1 Kings',
    abbreviation: '1Ki',
    aliases: ['1 kings', '1ki', '1kgs', '1k'],
    testament: 'OT',
    chapters: 22
  },
  {
    id: '2ki',
    name: '2 Kings',
    abbreviation: '2Ki',
    aliases: ['2 kings', '2ki', '2kgs', '2k'],
    testament: 'OT',
    chapters: 25
  },
  {
    id: '1ch',
    name: '1 Chronicles',
    abbreviation: '1Ch',
    aliases: ['1 chronicles', '1ch', '1chr', '1chron'],
    testament: 'OT',
    chapters: 29
  },
  {
    id: '2ch',
    name: '2 Chronicles',
    abbreviation: '2Ch',
    aliases: ['2 chronicles', '2ch', '2chr', '2chron'],
    testament: 'OT',
    chapters: 36
  },
  {
    id: 'ezr',
    name: 'Ezra',
    abbreviation: 'Ezr',
    aliases: ['ezra', 'ezr'],
    testament: 'OT',
    chapters: 10
  },
  {
    id: 'neh',
    name: 'Nehemiah',
    abbreviation: 'Neh',
    aliases: ['nehemiah', 'neh', 'ne'],
    testament: 'OT',
    chapters: 13
  },
  {
    id: 'est',
    name: 'Esther',
    abbreviation: 'Est',
    aliases: ['esther', 'est', 'esth'],
    testament: 'OT',
    chapters: 10
  },
  {
    id: 'job',
    name: 'Job',
    abbreviation: 'Job',
    aliases: ['job', 'jb'],
    testament: 'OT',
    chapters: 42
  },
  {
    id: 'psa',
    name: 'Psalms',
    abbreviation: 'Psa',
    aliases: ['psalms', 'psalm', 'psa', 'ps'],
    testament: 'OT',
    chapters: 150
  },
  {
    id: 'pro',
    name: 'Proverbs',
    abbreviation: 'Pro',
    aliases: ['proverbs', 'pro', 'prov', 'pr'],
    testament: 'OT',
    chapters: 31
  },
  {
    id: 'ecc',
    name: 'Ecclesiastes',
    abbreviation: 'Ecc',
    aliases: ['ecclesiastes', 'ecc', 'eccl', 'qoh'],
    testament: 'OT',
    chapters: 12
  },
  {
    id: 'sng',
    name: 'Song of Solomon',
    abbreviation: 'Sng',
    aliases: ['song of solomon', 'song', 'songs', 'sos', 'ss', 'cant', 'sng'],
    testament: 'OT',
    chapters: 8
  },
  {
    id: 'isa',
    name: 'Isaiah',
    abbreviation: 'Isa',
    aliases: ['isaiah', 'isa', 'is'],
    testament: 'OT',
    chapters: 66
  },
  {
    id: 'jer',
    name: 'Jeremiah',
    abbreviation: 'Jer',
    aliases: ['jeremiah', 'jer', 'je'],
    testament: 'OT',
    chapters: 52
  },
  {
    id: 'lam',
    name: 'Lamentations',
    abbreviation: 'Lam',
    aliases: ['lamentations', 'lam', 'la'],
    testament: 'OT',
    chapters: 5
  },
  {
    id: 'eze',
    name: 'Ezekiel',
    abbreviation: 'Eze',
    aliases: ['ezekiel', 'eze', 'ezek', 'ek'],
    testament: 'OT',
    chapters: 48
  },
  {
    id: 'dan',
    name: 'Daniel',
    abbreviation: 'Dan',
    aliases: ['daniel', 'dan', 'da'],
    testament: 'OT',
    chapters: 12
  },
  {
    id: 'hos',
    name: 'Hosea',
    abbreviation: 'Hos',
    aliases: ['hosea', 'hos', 'ho'],
    testament: 'OT',
    chapters: 14
  },
  {
    id: 'joe',
    name: 'Joel',
    abbreviation: 'Joe',
    aliases: ['joel', 'joe', 'jl'],
    testament: 'OT',
    chapters: 3
  },
  {
    id: 'amo',
    name: 'Amos',
    abbreviation: 'Amo',
    aliases: ['amos', 'amo', 'am'],
    testament: 'OT',
    chapters: 9
  },
  {
    id: 'oba',
    name: 'Obadiah',
    abbreviation: 'Oba',
    aliases: ['obadiah', 'oba', 'ob', 'obad'],
    testament: 'OT',
    chapters: 1
  },
  {
    id: 'jon',
    name: 'Jonah',
    abbreviation: 'Jon',
    aliases: ['jonah', 'jon', 'jnh'],
    testament: 'OT',
    chapters: 4
  },
  {
    id: 'mic',
    name: 'Micah',
    abbreviation: 'Mic',
    aliases: ['micah', 'mic', 'mi'],
    testament: 'OT',
    chapters: 7
  },
  {
    id: 'nah',
    name: 'Nahum',
    abbreviation: 'Nah',
    aliases: ['nahum', 'nah', 'na'],
    testament: 'OT',
    chapters: 3
  },
  {
    id: 'hab',
    name: 'Habakkuk',
    abbreviation: 'Hab',
    aliases: ['habakkuk', 'hab', 'hb'],
    testament: 'OT',
    chapters: 3
  },
  {
    id: 'zep',
    name: 'Zephaniah',
    abbreviation: 'Zep',
    aliases: ['zephaniah', 'zep', 'zeph', 'zp'],
    testament: 'OT',
    chapters: 3
  },
  {
    id: 'hag',
    name: 'Haggai',
    abbreviation: 'Hag',
    aliases: ['haggai', 'hag', 'hg'],
    testament: 'OT',
    chapters: 2
  },
  {
    id: 'zec',
    name: 'Zechariah',
    abbreviation: 'Zec',
    aliases: ['zechariah', 'zec', 'zech', 'zk'],
    testament: 'OT',
    chapters: 14
  },
  {
    id: 'mal',
    name: 'Malachi',
    abbreviation: 'Mal',
    aliases: ['malachi', 'mal', 'ml'],
    testament: 'OT',
    chapters: 4
  },
  // NT
  {
    id: 'mat',
    name: 'Matthew',
    abbreviation: 'Mat',
    aliases: ['matthew', 'mat', 'matt', 'mt'],
    testament: 'NT',
    chapters: 28
  },
  {
    id: 'mrk',
    name: 'Mark',
    abbreviation: 'Mrk',
    aliases: ['mark', 'mrk', 'mk', 'mar'],
    testament: 'NT',
    chapters: 16
  },
  {
    id: 'luk',
    name: 'Luke',
    abbreviation: 'Luk',
    aliases: ['luke', 'luk', 'lk'],
    testament: 'NT',
    chapters: 24
  },
  {
    id: 'jhn',
    name: 'John',
    abbreviation: 'Jhn',
    aliases: ['john', 'jhn', 'jn', 'jo'],
    testament: 'NT',
    chapters: 21
  },
  {
    id: 'act',
    name: 'Acts',
    abbreviation: 'Act',
    aliases: ['acts', 'act', 'ac'],
    testament: 'NT',
    chapters: 28
  },
  {
    id: 'rom',
    name: 'Romans',
    abbreviation: 'Rom',
    aliases: ['romans', 'rom', 'ro', 'rm'],
    testament: 'NT',
    chapters: 16
  },
  {
    id: '1co',
    name: '1 Corinthians',
    abbreviation: '1Co',
    aliases: ['1 corinthians', '1co', '1cor', '1 cor'],
    testament: 'NT',
    chapters: 16
  },
  {
    id: '2co',
    name: '2 Corinthians',
    abbreviation: '2Co',
    aliases: ['2 corinthians', '2co', '2cor', '2 cor'],
    testament: 'NT',
    chapters: 13
  },
  {
    id: 'gal',
    name: 'Galatians',
    abbreviation: 'Gal',
    aliases: ['galatians', 'gal', 'ga'],
    testament: 'NT',
    chapters: 6
  },
  {
    id: 'eph',
    name: 'Ephesians',
    abbreviation: 'Eph',
    aliases: ['ephesians', 'eph', 'ep'],
    testament: 'NT',
    chapters: 6
  },
  {
    id: 'php',
    name: 'Philippians',
    abbreviation: 'Php',
    aliases: ['philippians', 'php', 'phil', 'phi'],
    testament: 'NT',
    chapters: 4
  },
  {
    id: 'col',
    name: 'Colossians',
    abbreviation: 'Col',
    aliases: ['colossians', 'col', 'co'],
    testament: 'NT',
    chapters: 4
  },
  {
    id: '1th',
    name: '1 Thessalonians',
    abbreviation: '1Th',
    aliases: ['1 thessalonians', '1th', '1thes', '1thess', '1 thess'],
    testament: 'NT',
    chapters: 5
  },
  {
    id: '2th',
    name: '2 Thessalonians',
    abbreviation: '2Th',
    aliases: ['2 thessalonians', '2th', '2thes', '2thess', '2 thess'],
    testament: 'NT',
    chapters: 3
  },
  {
    id: '1ti',
    name: '1 Timothy',
    abbreviation: '1Ti',
    aliases: ['1 timothy', '1ti', '1tim', '1 tim'],
    testament: 'NT',
    chapters: 6
  },
  {
    id: '2ti',
    name: '2 Timothy',
    abbreviation: '2Ti',
    aliases: ['2 timothy', '2ti', '2tim', '2 tim'],
    testament: 'NT',
    chapters: 4
  },
  {
    id: 'tit',
    name: 'Titus',
    abbreviation: 'Tit',
    aliases: ['titus', 'tit', 'ti'],
    testament: 'NT',
    chapters: 3
  },
  {
    id: 'phm',
    name: 'Philemon',
    abbreviation: 'Phm',
    aliases: ['philemon', 'phm', 'phlm', 'phile'],
    testament: 'NT',
    chapters: 1
  },
  {
    id: 'heb',
    name: 'Hebrews',
    abbreviation: 'Heb',
    aliases: ['hebrews', 'heb', 'he'],
    testament: 'NT',
    chapters: 13
  },
  {
    id: 'jas',
    name: 'James',
    abbreviation: 'Jas',
    aliases: ['james', 'jas', 'ja', 'jm'],
    testament: 'NT',
    chapters: 5
  },
  {
    id: '1pe',
    name: '1 Peter',
    abbreviation: '1Pe',
    aliases: ['1 peter', '1pe', '1pet', '1pt', '1 pet'],
    testament: 'NT',
    chapters: 5
  },
  {
    id: '2pe',
    name: '2 Peter',
    abbreviation: '2Pe',
    aliases: ['2 peter', '2pe', '2pet', '2pt', '2 pet'],
    testament: 'NT',
    chapters: 3
  },
  {
    id: '1jn',
    name: '1 John',
    abbreviation: '1Jn',
    aliases: ['1 john', '1jn', '1jo', '1jno'],
    testament: 'NT',
    chapters: 5
  },
  {
    id: '2jn',
    name: '2 John',
    abbreviation: '2Jn',
    aliases: ['2 john', '2jn', '2jo', '2jno'],
    testament: 'NT',
    chapters: 1
  },
  {
    id: '3jn',
    name: '3 John',
    abbreviation: '3Jn',
    aliases: ['3 john', '3jn', '3jo', '3jno'],
    testament: 'NT',
    chapters: 1
  },
  {
    id: 'jud',
    name: 'Jude',
    abbreviation: 'Jud',
    aliases: ['jude', 'jud'],
    testament: 'NT',
    chapters: 1
  },
  {
    id: 'rev',
    name: 'Revelation',
    abbreviation: 'Rev',
    aliases: ['revelation', 'rev', 're', 'apoc'],
    testament: 'NT',
    chapters: 22
  }
]

export const BIBLE_BOOKS: BibleBook[] = BIBLE_BOOKS_SOURCE.map((b, i) => ({ ...b, number: i + 1 }))

const byNumber = new Map<number, BibleBook>()
for (const book of BIBLE_BOOKS) byNumber.set(book.number, book)

export function bookByNumber(n: number): BibleBook | undefined {
  return byNumber.get(n)
}

// Readable short forms for the ONE-BAR reading-mode reference, where a long name
// would crowd the centered "Book Chapter" between the two chapter arrows on a
// narrow phone (an ellipsized "1 Thessaloni…" is worse than a real "1 Thess.").
// Only the long names need one; anything absent keeps its full name, and this is
// used nowhere else — every other surface shows the full book name. Keyed by
// USFM book number.
const READING_SHORT_NAMES: Record<number, string> = {
  5: 'Deut.', // Deuteronomy
  13: '1 Chron.', // 1 Chronicles
  14: '2 Chron.', // 2 Chronicles
  21: 'Eccles.', // Ecclesiastes
  22: 'Song of Sol.', // Song of Solomon
  25: 'Lam.', // Lamentations
  46: '1 Cor.', // 1 Corinthians
  47: '2 Cor.', // 2 Corinthians
  50: 'Phil.', // Philippians
  51: 'Col.', // Colossians
  52: '1 Thess.', // 1 Thessalonians
  53: '2 Thess.', // 2 Thessalonians
  66: 'Rev.' // Revelation
}

/** The book's display name for the compact reading-mode reference: a readable
 * abbreviation for the long-named books, the full name for everyone else. */
export function readingShortBookName(bookNumber: number, fullName: string): string {
  return READING_SHORT_NAMES[bookNumber] ?? fullName
}

// Alias lookup map
const aliasMap = new Map<string, BibleBook>()
for (const book of BIBLE_BOOKS) {
  for (const alias of book.aliases) aliasMap.set(alias.toLowerCase(), book)
  aliasMap.set(book.name.toLowerCase(), book)
  aliasMap.set(book.abbreviation.toLowerCase(), book)
}

export function findBookByAlias(alias: string): BibleBook | undefined {
  return aliasMap.get(alias.toLowerCase().trim())
}

export function buildCrossRefRegex(): RegExp {
  const allAliases = [...aliasMap.keys()]
    .map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
  return new RegExp(`\\b(${allAliases.join('|')})\\s+(\\d+):(\\d+)(?:-(\\d+))?\\b`, 'gi')
}

export function normalizeReference(ref: string): string {
  return ref.trim().replace(/\s+/g, ' ')
}
