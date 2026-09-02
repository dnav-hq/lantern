import { useCallback, useState } from 'react'
import { useApi } from '../api/context'
import { exportAllNotesAsZip } from '../platform/export'

export type NotesExportState = 'idle' | 'exporting' | 'error'

/**
 * Exporting every note, and what the surface should say while it happens.
 *
 * ONE state machine, because there are two surfaces. `ProfilePage` (the mobile
 * destination) and `NavBar`'s avatar menu (the only export a desktop reader can
 * reach) both call `exportAllNotesAsZip`, and until 2026-09-02 each wrote its
 * own copy of this. They drifted exactly the way two copies do: the page
 * rendered an error state, the menu logged to the console and set its label
 * back to "Export notes", so a desktop reader whose export failed saw a flicker
 * and reasonably concluded it had worked (desktop sweep, finding 6).
 *
 * The two surfaces still render themselves — a dropdown item and a page button
 * are not the same control, and pretending otherwise would make both worse.
 * What they share is the part that has to agree.
 */
export function useNotesExport(): { state: NotesExportState; run: () => void } {
  const api = useApi()
  const [state, setState] = useState<NotesExportState>('idle')

  const run = useCallback(() => {
    setState('exporting')
    void exportAllNotesAsZip(api)
      .then(() => setState('idle'))
      .catch(err => {
        console.error('[export] failed:', err)
        setState('error')
      })
  }, [api])

  return { state, run }
}
