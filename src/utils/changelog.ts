import { CHANGELOG, type ChangelogEntry } from '../content/changelog'

// `berean.`-prefixed per convention (onboarding uses the same dotted form).
// Holds the version the reader last OPENED the What's New list at — not the
// app build version, so an unread dot means "something changed since you
// looked", never "you haven't looked".
export const CHANGELOG_SEEN_KEY = 'berean.changelogSeenVersion'

/**
 * Pure decision behind the unread dot. No stored value (never opened) and an
 * unrecognised stored value (a version not in this build's list — e.g. an
 * older build's entry that has since been pruned) both read as "nothing to
 * flag" rather than crashing or false-flagging.
 */
export function hasUnreadChangelog(
  seenVersion: string | null,
  entries: ChangelogEntry[] = CHANGELOG
): boolean {
  if (!seenVersion || entries.length === 0) return false
  if (seenVersion === entries[0].version) return false
  return entries.some(entry => entry.version === seenVersion)
}

export function getSeenChangelogVersion(): string | null {
  return localStorage.getItem(CHANGELOG_SEEN_KEY)
}

export function markChangelogSeen(version: string = CHANGELOG[0]?.version): void {
  if (!version) return
  localStorage.setItem(CHANGELOG_SEEN_KEY, version)
}
