import type { BibleProvider, BibleVerseLine } from './provider'
import { CodedError } from '../errors'
import { reportOccurrence } from '../telemetry/client'

// Serves `primary`, dropping to `fallback` only when primary throws. Whatever
// the answering provider returns is passed through untouched, footnotes
// included — so BSB via helloao carries its alternate-rendering notes and the
// same chapter from the self-hosted bundle simply carries none.
//
// Composition order matters: this must wrap the CACHE, never sit inside it —
// FallbackBibleProvider(CachedBibleProvider(network), fixture), not
// CachedBibleProvider(FallbackBibleProvider(network, fixture)). The cache is
// cache-forever, so a fixture answer written into it would persist as if it
// were real scripture: one offline read would poison that chapter permanently.
// Keeping the fallback outside means only genuine network responses are stored.
export class FallbackBibleProvider implements BibleProvider {
  constructor(
    private readonly primary: BibleProvider,
    private readonly fallback: BibleProvider
  ) {}

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    try {
      return await this.primary.getChapter(bookNumber, chapter)
    } catch (primaryError) {
      try {
        const verses = await this.fallback.getChapter(bookNumber, chapter)
        // Genuinely generic wording: this class now backs FOUR fallbacks — the
        // dev-only fixture (four seeded chapters) and the self-hosted complete
        // BSB, KJV and NET bundles — so the message can name none of them. It
        // used to say "(real BSB)", which became wrong the moment KJV shipped
        // and actively misleading once NET did.
        //
        // A CodedError's message is only its machine code (see src/errors.ts),
        // so the useful half is pulled out explicitly here. This is a console
        // call — local to the device, never transmitted — which is exactly the
        // place the detail is meant to surface.
        console.warn(
          `[lantern] scripture fetch failed for ${bookNumber}/${chapter} — serving ` +
            'offline fallback text.',
          primaryError,
          primaryError instanceof CodedError ? primaryError.detailForConsole() : ''
        )
        // Scalar 6 (scripture_fallback_serves_24h). This is one of the two
        // numbers Postgres cannot produce — the fallback firing is a client-side
        // event that leaves no trace in the database — so it rides the events
        // channel and is aggregated server-side. The code is a fixed literal;
        // the book and chapter deliberately do NOT travel with it, for the same
        // reason they no longer travel in the error message.
        reportOccurrence('scripture_fallback_serve', 'SCRIPTURE_FALLBACK_SERVED')
        return verses
      } catch {
        // The fallback missing a chapter is noise; the network failure is the
        // actual cause, so surface that rather than "no fixture for 40/2".
        throw primaryError
      }
    }
  }
}
