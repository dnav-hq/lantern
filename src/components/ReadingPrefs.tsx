import React from 'react'
import { LOOKS, type LookId } from '../utils/useTheme'
import { TEXT_SIZES, type TextSizeId } from '../utils/useTextSize'
import { TRANSLATIONS, useTranslation } from '../utils/useTranslation'

// The reading preferences, as ONE implementation shared by the full Settings
// modal and the quick display popover you open from the reading view
// (DisplaySettings.tsx). They were duplicated markup for about five minutes and
// that is exactly how the two drift apart, so there is only this.
//
// Look and text size are lifted to App.tsx (both are plain per-component hooks,
// so every surface has to read the same state), and passed down; translation is
// a global store (useTranslation), so it wires itself up here.
export interface DisplayPrefs {
  // The active look (theme + light/dark + pure-black bundled) and a setter that
  // applies all three axes at once. See LOOKS / lookIdFor in useTheme.ts.
  lookId: LookId
  onSelectLook: (id: LookId) => void
  textSize: TextSizeId
  onSetTextSize: (size: TextSizeId) => void
}

function AppearanceSection({
  lookId,
  onSelectLook
}: Pick<DisplayPrefs, 'lookId' | 'onSelectLook'>): React.ReactElement {
  return (
    <div className="rpref-section">
      <div className="rpref-section-label">Appearance</div>
      <div className="theme-picker" role="radiogroup" aria-label="Appearance">
        {LOOKS.map((look, i) => {
          const active = lookId === look.id
          const startsGroup = i === 0 || LOOKS[i - 1].group !== look.group
          return (
            <React.Fragment key={look.id}>
              {startsGroup && <div className="look-group-label">{look.group}</div>}
              <button
                className={`theme-swatch${active ? ' active' : ''}`}
                onClick={() => onSelectLook(look.id)}
                role="radio"
                aria-checked={active}
              >
                <span className={`theme-swatch-preview look-preview-${look.id}`} aria-hidden="true">
                  <span className="look-preview-card" />
                  <span className="theme-preview-accent" />
                </span>
                <span className="theme-swatch-text">
                  <span className="theme-swatch-label">{look.label}</span>
                  <span className="theme-swatch-blurb">{look.blurb}</span>
                </span>
                {active && (
                  <svg
                    className="theme-swatch-check"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

function TextSizeSection({
  textSize,
  onSetTextSize
}: Pick<DisplayPrefs, 'textSize' | 'onSetTextSize'>): React.ReactElement {
  return (
    <div className="rpref-section">
      <div className="rpref-section-label">Scripture text size</div>
      <div className="text-size-picker" role="radiogroup" aria-label="Scripture text size">
        {TEXT_SIZES.map(s => (
          <button
            key={s.id}
            className={`text-size-option${textSize === s.id ? ' active' : ''}`}
            onClick={() => onSetTextSize(s.id)}
            role="radio"
            aria-checked={textSize === s.id}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TranslationSection(): React.ReactElement {
  const [translation, setTranslation] = useTranslation()
  return (
    <div className="rpref-section">
      <div className="rpref-section-label">Translation</div>
      <div className="translation-picker" role="radiogroup" aria-label="Bible translation">
        {TRANSLATIONS.map(t => (
          <button
            key={t.id}
            className={`translation-option${translation === t.id ? ' active' : ''}`}
            onClick={() => setTranslation(t.id)}
            role="radio"
            aria-checked={translation === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Appearance → scripture text size → translation, in that order, divided the
 * way the Settings modal divides its sections.
 *
 * Deliberately a flat list of self-contained sections: the Bible-language
 * switcher lands next to Translation as one more <div className="rpref-section">
 * with no layout to rethink, in both surfaces at once.
 */
export default function ReadingPrefs({
  lookId,
  onSelectLook,
  textSize,
  onSetTextSize
}: DisplayPrefs): React.ReactElement {
  return (
    <>
      <AppearanceSection lookId={lookId} onSelectLook={onSelectLook} />
      <div className="rpref-divider" />
      <TextSizeSection textSize={textSize} onSetTextSize={onSetTextSize} />
      <div className="rpref-divider" />
      <TranslationSection />
    </>
  )
}
