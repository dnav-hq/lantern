/**
 * Hand-written release notes for Profile → What's new. Ordered newest first.
 * Written by hand on purpose (see docs/BACKLOG.md's Done section and the git
 * log for what actually shipped) — never generated from commits at build or
 * run time. `version` is this list's own counter, unrelated to the app's
 * package.json version (which reads 2.0.0-dev for every deploy and can't
 * tell releases apart — see the commit sha next to it on this same page).
 * Keep each entry to one to four short, plain-English lines a reader would
 * recognise, never scripture text or images.
 */
export interface ChangelogEntry {
  version: string
  date: string // ISO date, e.g. '2026-09-18'
  lines: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v3',
    date: '2026-09-18',
    lines: [
      'Search now looks inside the Bible text itself, not just verse references.',
      'Guests can now reach Profile and Settings from the desktop menu, same as everyone else.'
    ]
  },
  {
    version: 'v2',
    date: '2026-09-17',
    lines: [
      'A new way to go deeper on a verse: open its cross-references and a map of the places it names, right where you are reading.'
    ]
  },
  {
    version: 'v1',
    date: '2026-08-23',
    lines: ['Tamil is now available as a second scripture language, alongside English.']
  }
]
