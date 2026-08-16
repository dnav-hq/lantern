import { describe, it, expect } from 'vitest'
import { computeInstallCapability, computeIsIosSafari, computeStandalone } from './install'

// Real user-agent strings, because the whole point of computeIsIosSafari is
// telling these five apart.
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
}

describe('computeStandalone — the already-installed gate', () => {
  it('is false in an ordinary browser tab', () => {
    expect(computeStandalone({ displayModeStandalone: false, navigatorStandalone: false })).toBe(
      false
    )
  })

  it('is true on display-mode: standalone (Chromium/Android installed app)', () => {
    expect(computeStandalone({ displayModeStandalone: true, navigatorStandalone: false })).toBe(
      true
    )
  })

  it('is true on navigator.standalone alone (iOS home-screen app)', () => {
    expect(computeStandalone({ displayModeStandalone: false, navigatorStandalone: true })).toBe(
      true
    )
  })
})

describe('computeIsIosSafari', () => {
  it('recognises iPhone Safari', () => {
    expect(computeIsIosSafari({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe(true)
  })

  it('recognises iPadOS 13+ reporting a Macintosh UA with touch', () => {
    expect(computeIsIosSafari({ userAgent: UA.ipadOs, maxTouchPoints: 5 })).toBe(true)
  })

  it('rejects a real Mac (same UA, no touch points)', () => {
    expect(computeIsIosSafari({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe(false)
  })

  it('rejects Chrome on iOS — it cannot add to the home screen either', () => {
    expect(computeIsIosSafari({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe(false)
  })

  it('rejects Firefox on iOS', () => {
    expect(computeIsIosSafari({ userAgent: UA.iphoneFirefox, maxTouchPoints: 5 })).toBe(false)
  })

  it('rejects Android Chrome, which has the real prompt instead', () => {
    expect(computeIsIosSafari({ userAgent: UA.androidChrome, maxTouchPoints: 5 })).toBe(false)
  })
})

describe('computeInstallCapability', () => {
  it('offers nothing to an already-installed user, even with a stashed prompt', () => {
    expect(
      computeInstallCapability({ standalone: true, hasDeferredPrompt: true, iosSafari: false })
    ).toBe('none')
  })

  it('offers nothing to an installed iOS user', () => {
    expect(
      computeInstallCapability({ standalone: true, hasDeferredPrompt: false, iosSafari: true })
    ).toBe('none')
  })

  it('offers the real prompt when Chromium has handed us one', () => {
    expect(
      computeInstallCapability({ standalone: false, hasDeferredPrompt: true, iosSafari: false })
    ).toBe('prompt')
  })

  it('offers the Share hint on iOS Safari, which has no prompt API', () => {
    expect(
      computeInstallCapability({ standalone: false, hasDeferredPrompt: false, iosSafari: true })
    ).toBe('ios-hint')
  })

  it('offers nothing where there is no install path at all (e.g. desktop Firefox)', () => {
    expect(
      computeInstallCapability({ standalone: false, hasDeferredPrompt: false, iosSafari: false })
    ).toBe('none')
  })
})
