import { describe, it, expect } from 'vitest'
import { shouldShowInstallNudge, SESSION_THRESHOLD, type InstallNudgeState } from './installNudge'

// The state of a reader who has fully earned the nudge: a return session, a
// saved note, an installable browser, never shown or dismissed. Every test
// below turns exactly one thing off, so each assertion names one "never".
const QUALIFIED: InstallNudgeState = {
  capability: 'prompt',
  sessionCount: SESSION_THRESHOLD,
  engaged: true,
  shown: false,
  dismissed: false
}

describe('shouldShowInstallNudge — the qualifying case', () => {
  it('shows for a returning reader who has saved a note', () => {
    expect(shouldShowInstallNudge(QUALIFIED)).toBe(true)
  })

  it('shows on iOS Safari too, where the offer is a hint rather than a prompt', () => {
    expect(shouldShowInstallNudge({ ...QUALIFIED, capability: 'ios-hint' })).toBe(true)
  })

  it('keeps showing for a long-time reader (any session above the threshold)', () => {
    expect(shouldShowInstallNudge({ ...QUALIFIED, sessionCount: 47 })).toBe(true)
  })
})

describe('shouldShowInstallNudge — never on a first visit', () => {
  it('does not show in the very first session, even having saved a note', () => {
    expect(shouldShowInstallNudge({ ...QUALIFIED, sessionCount: 1 })).toBe(false)
  })

  it('does not show before any session has been counted', () => {
    expect(shouldShowInstallNudge({ ...QUALIFIED, sessionCount: 0 })).toBe(false)
  })
})

describe('shouldShowInstallNudge — never before real engagement', () => {
  it('does not show to a returning reader who has never saved a note', () => {
    expect(shouldShowInstallNudge({ ...QUALIFIED, engaged: false })).toBe(false)
  })
})

describe('shouldShowInstallNudge — never twice', () => {
  it('does not show once dismissed — "not now" is final', () => {
    expect(shouldShowInstallNudge({ ...QUALIFIED, dismissed: true })).toBe(false)
  })

  it('does not show again once it has been shown, even if never answered', () => {
    expect(shouldShowInstallNudge({ ...QUALIFIED, shown: true })).toBe(false)
  })
})

describe('shouldShowInstallNudge — never where there is nothing to install', () => {
  it('does not show when the capability is none (already installed, or unsupported)', () => {
    expect(shouldShowInstallNudge({ ...QUALIFIED, capability: 'none' })).toBe(false)
  })

  it('stays closed for an installed user no matter how engaged they are', () => {
    expect(
      shouldShowInstallNudge({
        capability: 'none',
        sessionCount: 99,
        engaged: true,
        shown: false,
        dismissed: false
      })
    ).toBe(false)
  })
})
