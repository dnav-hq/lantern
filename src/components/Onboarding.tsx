import React, { useState } from 'react'
import Wordmark from './Wordmark'
import { markOnboardingDone } from '../api/auth'
import type { TranslationId } from '../bible/provider'
import { translationsForLanguage, useTranslation } from '../utils/useTranslation'

interface OnboardingProps {
  // Called when the flow finishes; Root re-reads the profile and enters the app.
  onDone: () => void
}

// First-run flow after the first sign-in: one screen, one question — which
// Bible you read. The name question that used to live here is gone (the
// display name is optional and null is handled everywhere); the language
// choice stays in Settings. The choice is written through the same store the
// app reads (useTranslation), so App picks it up on mount and its account-sync
// adoption seeds the account with it. Copy is plain and quiet — no reasoning
// paragraphs, no marketing.
export default function Onboarding({ onDone }: OnboardingProps): React.ReactElement {
  const [, setTranslation] = useTranslation()
  const [choice, setChoice] = useState<TranslationId>('BSB')
  const [saving, setSaving] = useState(false)
  const options = translationsForLanguage('eng')

  const finish = async (): Promise<void> => {
    setSaving(true)
    setTranslation(choice)
    try {
      await markOnboardingDone()
    } catch {
      // Even if marking fails, let the user in — the gate falls back to
      // localStorage so they will not be stuck on this screen.
      localStorage.setItem('berean.onboarded', '1')
    } finally {
      setSaving(false)
      onDone()
    }
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <Wordmark size={30} style={{ display: 'block' }} />

        <h1 className="welcome-title">Which Bible do you read?</h1>
        <p className="welcome-body">You can change this any time.</p>
        <div className="onboard-bibles" role="radiogroup" aria-label="Bible translation">
          {options.map(t => {
            const active = choice === t.id
            return (
              <button
                key={t.id}
                type="button"
                className={`onboard-bible${active ? ' active' : ''}`}
                role="radio"
                aria-checked={active}
                onClick={() => setChoice(t.id)}
              >
                <span className="onboard-bible-name">{t.label}</span>
                {t.id === 'BSB' && <span className="onboard-bible-tag">recommended</span>}
              </button>
            )
          })}
        </div>
        <button className="welcome-btn-primary" onClick={finish} disabled={saving}>
          {saving ? 'Getting things ready…' : 'Start reading'}
        </button>
      </div>
    </div>
  )
}
