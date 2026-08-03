import { describe, it, expect } from 'vitest'
import { resolveSettingsAdoption, type UserSettings } from './types'
import { createMemoryApi } from './memory'

// Covers the three cases the account-sync flow (src/App.tsx) drives at
// sign-in / on every preference change, against the memory stub — no live
// database needed (see supabase/migrations/0009_profile_settings.sql and
// docs/proposals/guest-preview-mode.md §2b).

describe('resolveSettingsAdoption', () => {
  const local: UserSettings = { darkMode: true, translation: 'KJV' }

  it('account-empty: seeds the account from local', () => {
    const result = resolveSettingsAdoption(local, {})
    expect(result).toEqual({ action: 'seed', settings: local })
  })

  it('account-present: hydrates local from the account instead', () => {
    const account: UserSettings = { darkMode: false, visualTheme: 'paper' }
    const result = resolveSettingsAdoption(local, account)
    expect(result).toEqual({ action: 'hydrate', settings: account })
  })
})

describe('memory stub getSettings/updateSettings', () => {
  it('starts empty, then a change patches the account (merge, not replace)', async () => {
    const api = createMemoryApi()
    expect(await api.getSettings()).toEqual({})

    await api.updateSettings({ darkMode: true })
    expect(await api.getSettings()).toEqual({ darkMode: true })

    await api.updateSettings({ translation: 'KJV' })
    expect(await api.getSettings()).toEqual({ darkMode: true, translation: 'KJV' })

    await api.updateSettings({ darkMode: false })
    expect(await api.getSettings()).toEqual({ darkMode: false, translation: 'KJV' })
  })
})
