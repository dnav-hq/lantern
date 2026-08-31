import { describe, it, expect } from 'vitest'
import {
  TRANSLATIONS,
  toGuestTranslation,
  translationForLanguage,
  translationsForLanguage
} from './useTranslation'
import { BIBLE_LANGUAGES, HAS_MULTIPLE_LANGUAGES } from './useBibleLanguage'

// The switcher is SCOPED to one language at a time — the whole point of the
// language preference. These lock in the two halves of that: what the switcher
// offers, and where a reader lands when they change language.

describe('translationsForLanguage', () => {
  it('offers English readers exactly BSB, KJV, ESV and NET — unchanged by Tamil existing', () => {
    expect(translationsForLanguage('eng').map(t => t.id)).toEqual(['BSB', 'KJV', 'ESV', 'NET'])
  })

  it('offers Tamil readers exactly IRV and TCV, IRV first (the primary)', () => {
    expect(translationsForLanguage('tam').map(t => t.id)).toEqual(['IRV', 'TCV'])
  })

  it('never mixes languages: no language sees another language’s translation', () => {
    for (const language of BIBLE_LANGUAGES) {
      const offered = translationsForLanguage(language.id)
      expect(offered.length).toBeGreaterThan(0)
      expect(offered.every(t => t.language === language.id)).toBe(true)
    }
  })

  it('accounts for every translation — none is unreachable from some language', () => {
    const reachable = BIBLE_LANGUAGES.flatMap(l => translationsForLanguage(l.id).map(t => t.id))
    expect(new Set(reachable)).toEqual(new Set(TRANSLATIONS.map(t => t.id)))
  })

  it('shows the language control, since more than one language exists', () => {
    expect(HAS_MULTIPLE_LANGUAGES).toBe(true)
  })
})

describe('translationForLanguage (the fallback on a language switch)', () => {
  it('keeps the current translation when it already belongs to the language', () => {
    expect(translationForLanguage('KJV', 'eng')).toBe('KJV')
    expect(translationForLanguage('TCV', 'tam')).toBe('TCV')
  })

  it('falls back to the language’s primary when it does not', () => {
    expect(translationForLanguage('BSB', 'tam')).toBe('IRV')
    expect(translationForLanguage('ESV', 'tam')).toBe('IRV')
    expect(translationForLanguage('IRV', 'eng')).toBe('BSB')
  })

  it('always lands on a translation the switcher actually offers', () => {
    for (const language of BIBLE_LANGUAGES) {
      for (const t of TRANSLATIONS) {
        const landed = translationForLanguage(t.id, language.id)
        expect(translationsForLanguage(language.id).map(o => o.id)).toContain(landed)
      }
    }
  })
})

describe('guest reading', () => {
  it('never hands a guest a Tamil translation — the guest picker has no language control', () => {
    expect(toGuestTranslation('IRV')).toBe('BSB')
    expect(toGuestTranslation('TCV')).toBe('BSB')
  })
})
