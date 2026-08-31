// Row-cap paging for collection reads.
//
// PostgREST caps how many rows one request will return (Supabase ships a
// default `db-max-rows`, commonly 1,000). A plain `.select()` past that cap
// does NOT error — it silently returns the first N rows. For a whole-workspace
// read like getAllNotes that means the Journal quietly stops showing a
// reader's older notes once they've written enough of them, with no error and
// no signal at all. Losing sight of your own notes is the worst failure this
// app has, so unbounded collection reads page through `.range()` instead.
//
// This lives outside berean-api.ts so the loop itself is testable without
// standing up a fake Supabase client.

// Deliberately below any server cap we expect to meet, so "the server returned
// fewer rows than we asked for" reliably means "that was the last page" rather
// than "we hit the ceiling".
export const PAGE_SIZE = 500

// Backstop so a misbehaving server that always returns a full page cannot spin
// forever. Far above any realistic personal note count; if it ever trips, the
// truncation is at least bounded and deliberate rather than silent at 1,000.
export const MAX_PAGES = 200

export interface PagedResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export interface PageAllOptions {
  pageSize?: number
  maxPages?: number
}

/**
 * Call `run(from, to)` for successive inclusive ranges until it returns a
 * short page, then hand back everything concatenated.
 *
 * A short page is the only normal exit: PostgREST has no "has more" flag, and
 * asking for a count on every page would cost a second scan per request.
 */
export async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  options: PageAllOptions = {}
): Promise<T[]> {
  const size = options.pageSize ?? PAGE_SIZE
  const maxPages = options.maxPages ?? MAX_PAGES
  const out: T[] = []

  for (let page = 0; page < maxPages; page++) {
    const from = page * size
    const { data, error } = await run(from, from + size - 1)
    if (error) throw new Error(error.message)
    if (data === null) throw new Error('No data returned')
    out.push(...data)
    // Short (or empty) page: that was the last one.
    if (data.length < size) break
  }

  return out
}
