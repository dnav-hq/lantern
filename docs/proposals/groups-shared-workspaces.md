# Groups / shared workspaces + invites — implementation strategy

Status: **proposal, not started**. This document ships no application code and no
migration. It answers the brief: what groups actually require beyond "new rows,"
where the real risk sits, and what a defensible first slice looks like.

## tl;dr

- **BACKLOG.md currently undersells this.** Its one line — "the schema
  (`workspace_id`, `workspace_members`) and the single RLS pattern are already in
  place — this is new rows plus invite/role UI, no migration" — is true for the
  read path and false for almost everything else. Four things are genuinely new,
  not UI dressing over an existing capability:
  1. The member-visibility RLS policy is deliberately **own-rows-only** (its own
     comment says so, to dodge recursion) and a member list needs to see
     *co*-members — that requires new policy machinery, not a flag flip.
  2. `workspace_members.role` (owner/editor/viewer) exists as a column but is
     enforced by **zero** CRUD policy today — every member can write, no matter
     their role.
  3. `workspace_members` has **no INSERT/UPDATE/DELETE policy at all** today —
     only the SELECT own-rows one. The only code path that ever writes a
     membership row is the `SECURITY DEFINER` signup trigger. Inviting, accepting,
     leaving, and role changes all need their own `SECURITY DEFINER` RPCs; there
     is no client-writable membership surface to extend.
  4. `SupabaseBereanApi` is **architecturally single-workspace**: `create()`
     resolves one `kind = 'personal'` workspace once at construction and caches
     it in `this.workspaceId` for the instance's lifetime
     (`src/api/berean-api.ts:56-72`). Every read and write method filters or
     joins on that one cached id. There is no `Workspace` type anywhere in
     `src/types/index.ts`, and no method on `BereanApi` takes or returns one.
     Supporting a second, group workspace is an interface change, not a config
     value.
- **Recommendation: don't build the full thing now. Build the smallest slice that
  makes group membership itself safe and correct, ship it, and defer role
  enforcement, invite-by-email-with-no-account, and conflict handling until a
  named trigger fires.** See "Recommendation" at the end — this follows the same
  shape as `study-id.md` and `offline-write-outbox.md`: this is not a neutral
  options dump, it's a stance, and the stance is "smaller than the backlog line
  implies, and later than 'no migration' implies."

## 1. What already exists vs. what's genuinely new

Grounded in `supabase/migrations/0001_init.sql` (read in full for this brief) and
`src/api/berean-api.ts` / `src/api/types.ts` / `src/types/index.ts`.

**Already exists, confirmed by reading the migration:**

- `workspaces.kind check (kind in ('personal', 'group'))` (line 28) — `'group'`
  is a legal value today; inserting one violates no constraint.
- `workspace_members.role check (role in ('owner', 'editor', 'viewer'))`
  (line 37) — the three roles this brief is asked to reckon with are real
  column values already, defaulting to `'owner'`.
- `passages.workspace_id` (line 44), and `sessions`/`notes` reach a workspace
  only by joining up through `passages` — there is no `workspace_id` column on
  either of those tables, and there doesn't need to be one for groups.
- **One RLS pattern, applied four times**: `passages_all`, `sessions_all`, and
  `notes_all` (lines 138-182) all resolve to the same shape — "the target row's
  `workspace_id` (direct or via join) is in `select workspace_id from
  workspace_members where user_id = (select auth.uid())`." A second membership
  row for the same user, pointed at a group workspace, makes every one of those
  policies pass for that workspace's rows with **zero policy edits** — this half
  of the backlog claim is correct and confirmed.

**Genuinely new — confirmed absent, not just "not yet built":**

- No member-list visibility. `workspace_members_select` (line 129) is
  `using (user_id = (select auth.uid()))` — a member can see their own
  membership row and nothing else. There is no query today, RLS-legal or
  otherwise, that returns "who else is in this workspace." See §2.
- No role enforcement anywhere. `passages_all`/`sessions_all`/`notes_all` gate
  purely on *membership*, `for all` (select+insert+update+delete alike), with no
  reference to `role` in any `using`/`with check`. A `'viewer'` today has
  identical write access to an `'owner'`. See §3.
- No membership-mutation surface. `workspace_members` has exactly one policy —
  the select above. No `create policy ... for insert`, no update, no delete. The
  only thing that has ever written a row into this table is
  `handle_new_user()` (lines 84-105), which is `security definer` precisely
  because a brand-new user has no membership yet to authorize the insert under
  RLS. Any invite/accept/leave/promote/demote/remove-member flow needs the same
  pattern: a `security definer` function, not a policy widening, because there
  is no "I'm already a member, let me add another member" self-service case RLS
  can express safely without also asking "which role can add members, and to
  what role." See §5.
- No multi-workspace client. `BereanApi` (`src/api/types.ts:24-56`) has no
  `getWorkspaces()`, no `switchWorkspace()`, nothing workspace-shaped in its
  surface at all — every method operates against "the" workspace implicitly.
  `SupabaseBereanApi.create()` (`src/api/berean-api.ts:56-72`) makes that
  literal: it queries for the one `kind = 'personal'` workspace `created_by` the
  signed-in user and hard-codes its id for the object's lifetime. `memory.ts`
  mirrors this with a single module-level `WORKSPACE_ID = 'personal-stub'`
  constant used everywhere. Neither implementation has a concept of "which
  workspace is active" as state, because there has only ever been one. Groups
  makes that a real piece of app state (which workspace is the user currently
  reading/writing in) that has to live somewhere — `App.tsx`'s view state is the
  natural place, mirroring how it already owns capture/reading view state per
  CLAUDE.md, but it does not exist today.

None of this is a criticism of the schema — the design notes in `0001_init.sql`
(lines 6-9) say plainly "Groups later is just new rows... zero policy
migration," and that promise is honestly kept for the *data model*. It just
doesn't extend to RLS visibility, role enforcement, or the client. Those three
are where this brief spends its time.

## 2. The RLS recursion trap, head-on

The comment at `0001_init.sql:126-128` is explicit about why
`workspace_members_select` is own-rows-only: *"The self-referential check is
kept simple (own rows) to avoid recursion; that is sufficient for the personal
case and for authorizing the joins below."*

**Why the obvious widening recurses.** The tempting rewrite is the same shape
already used on `passages_all` et al.:

```sql
-- DO NOT DO THIS on workspace_members itself:
create policy workspace_members_select on public.workspace_members
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid()))
  );
```

This looks identical to the `passages_all` pattern, but there the subquery
targets a *different* table. Here the subquery targets `workspace_members`
itself, and Postgres RLS re-applies the very policy being defined to every row
the subquery touches, which re-invokes the subquery, which re-applies the
policy — the planner does not special-case "this subquery only needs my own
rows"; it just sees a self-referencing policy and recurses. This is a
well-documented Postgres RLS trap (Supabase's own docs warn about it by name)
whenever a policy's `using`/`with check` queries its own table.

**Why it doesn't block role enforcement.** It's worth separating this from §3:
`passages_all`/`sessions_all`/`notes_all` already query `workspace_members`
from a *different* table's policy, filtered to `user_id = (select auth.uid())`
— that's precisely the shape the current own-rows `workspace_members_select`
policy is designed to authorize, and it works today (it's how membership gating
already functions for the personal case). Widening role checks on passages/
sessions/notes needs no changes to `workspace_members_select` at all — see §3.
Only a **member-list UI** ("who else is in this group") needs *other* users'
membership rows, which is the part that's actually blocked.

**The standard fix: a `security definer` helper function.** Wrap the
membership check in a function owned by a role that bypasses RLS on
`workspace_members` (the same trick `handle_new_user()` already uses for
writes):

```sql
create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid()
  );
$$;

create policy workspace_members_select_cowospace on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));
```

Because the function is `security definer` and its *internal* query runs as
the function owner (a role that either owns the table or has `bypassrls`,
exactly like `handle_new_user`), that internal `select` never re-triggers RLS
on `workspace_members`, so there's no recursion — the policy calls the
function, the function's own query is exempt, and the function returns a plain
boolean back into the policy. This is the idiomatic Supabase pattern for
"members can see other members of a group they belong to," not a novel
invention for this app.

**What this does NOT need to solve, and shouldn't try to:** wide-open "any
authenticated user can see any workspace_members row" — the function still
scopes to `target_workspace`, and the policy still requires the caller be a
member of that specific workspace before seeing anyone in it. Nothing here
weakens the personal-workspace case, where the answer is unchanged (a solo
member sees exactly their own row).

## 3. The role-enforcement gap

Today, `passages_all`/`sessions_all`/`notes_all` each use a single `for all`
policy with the same `using`/`with check` — membership, no role check. A
`'viewer'` in a group workspace can `insert`/`update`/`delete` notes exactly
like an `'owner'`, because the policy never looks at the `role` column.

**What has to change for roles to be real:** split each `for all` policy into
a `select` policy (any member, role irrelevant — reading is not the
sensitive operation) and separate `insert`/`update`/`delete` policies gated on
`role in ('owner', 'editor')`. This is enforceable in RLS today, no recursion
risk, because — per §2 — the subquery still only needs the caller's *own*
membership row:

```sql
-- Illustrative, not a literal migration diff:
drop policy passages_all on public.passages;

create policy passages_select on public.passages
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid()))
  );

create policy passages_write on public.passages
  for insert, update, delete using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = (select auth.uid()) and role in ('owner', 'editor')
    )
  ) with check ( /* same predicate */ );
```

...repeated for `sessions_all` and `notes_all`'s join shape. This is
mechanical once decided, but it is a real migration touching every RLS policy
in the schema, not a no-op — the "no migration" line in BACKLOG.md is wrong on
this specific point.

**Two decisions this forces that the brief flags rather than resolves,
because they're product calls, not technical ones:**

- **Does `'viewer'` mean "can read but never write," full stop — including
  their own notes inside someone else's group passage?** For a personal
  study-notes app, a plausible alternative reading is "viewer can add personal
  reflections but not edit the group's shared observations," which the current
  flat `notes.category` model has no way to express (there's no per-note
  owner-only-editable flag, and `created_by` exists but nothing checks it).
  Recommend: **start with the blunt reading** (viewer = read-only, full stop)
  for the MVP, and treat "viewers can still add their own notes" as a later
  refinement if a real user asks for it — building the nuanced version first
  is exactly the kind of speculative scope this brief is supposed to catch.
- **Where does role enforcement live for UI purposes — RLS only, or also
  client-side?** RLS is the source of truth and must exist regardless (never
  trust the client). But RLS alone means a viewer's illegal write attempt
  fails as a raw Postgres/PostgREST error surfaced through
  `SupabaseBereanApi.write()`'s existing offline-error path (which is built for
  *network* failures, not permission failures — see
  `berean-api.ts`'s `read`/`write` wrappers) unless the UI also hides/disables
  write affordances for viewers. Recommend: **UI-level graying-out is required
  for a good experience**, not optional polish, given the existing error
  surface isn't built to explain "you don't have permission" distinctly from
  "you're offline."

## 4. Invite mechanism

**The hard constraint, confirmed from `berean-api.ts`/`supabase.ts`/RLS**: the
client only ever authenticates as `anon`/`authenticated`, and neither role can
query `auth.users` (Supabase does not expose it to PostgREST). So "invite
someone by email" cannot be "look up their user id and insert a
`workspace_members` row" — the app never learns whether that email has an
account, let alone its id, from the client.

**Recommended design: a `pending_invites` table + a token-link accept flow,
matching the invitee-may-not-have-an-account requirement directly.**

```sql
create table public.workspace_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  invited_email text not null,
  role          text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  invited_by    uuid references auth.users (id) on delete set null,
  token         uuid not null default gen_random_uuid() unique,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days')
);
```

- **Creating an invite** (owner/editor only) goes through a `security definer`
  RPC (`create_workspace_invite(workspace_id, email, role)`), for the same
  reason membership writes already require one (§1): there is no client-legal
  path to insert into a membership-adjacent table without one. The function
  checks the caller's role in that workspace before inserting — this is where
  role enforcement for *invites specifically* lives, independent of §3's
  passages/sessions/notes work.
- **Sending the email** is new integration work, not a reuse of what exists.
  The task brief's premise that Brevo is "the existing send pipe" is correct
  for the *transport* but not the *surface*: today Brevo is wired only as
  Supabase Auth's SMTP relay for its own two templates
  (`supabase/templates/magic-link.html`, `confirm-signup.html`) — there is no
  general "send an arbitrary app email" pipe (`supabase/functions/` has exactly
  one function, `hq-telemetry`, and it doesn't send mail). An invite email
  needs its own Supabase Edge Function calling Brevo's transactional send API
  directly with an API key, in the same "small, boring, server-side" shape
  `hq-telemetry` already establishes as a precedent in this repo — not a new
  auth template, since this isn't an auth event.
- **Accepting**: the invite link carries `token` (`https://lanternword.com/invite/<token>`,
  a new route). Because the invitee may not have an account:
  - **No account yet**: land on sign-up (email OTP or Google) pre-filled with
    `invited_email`, *then* run the accept step. The existing signup trigger
    (`handle_new_user`) is untouched — it still creates the personal
    workspace regardless, since a user having a personal workspace and also
    joining a group are independent facts.
  - **Has an account**: sign in if needed, then call a second `security
    definer` RPC, `accept_workspace_invite(token)`. This function (a) looks up
    the invite by token, checking `expires_at` and `status = 'pending'`, (b)
    compares `invited_email` against the *caller's own* verified email — read
    via `auth.users` from inside the function, which is legal precisely
    because `security definer` functions run with elevated rights, the same
    trick `handle_new_user()` already relies on — and only proceeds if they
    match, (c) inserts the `workspace_members` row with the invite's `role`,
    (d) marks the invite `accepted`. Rejecting a mismatched email here is the
    one correctness-critical check in the whole feature: without it, anyone
    who guesses/receives a token (forwarded email, e.g.) could join as
    whoever's logged in, not just the intended invitee.
  - **Declining**: a symmetric `decline_workspace_invite(token)` RPC, or simply
    letting it expire — low stakes either way, recommend supporting explicit
    decline only if it turns out invites linger visibly in a UI that makes
    "not yet responded" awkward; otherwise expiry alone is enough for v1.
- **Why token-link over a `pending-invites`-only in-app "requests" list**: this
  app has no in-app notification surface today (confirmed: no notifications
  table, no push, nothing in `src/components/` resembling a bell/inbox) and
  building one just to carry invites is more new surface than the feature
  needs. Email is already the account's out-of-band channel (it's how sign-in
  itself works), so reusing it for invites is the smaller build.

## 5. Concurrent multi-user editing

Confirmed premise, from CLAUDE.md and `berean-api.ts`: ids are
`crypto.randomUUID()`, client-generated; `created_at`/`updated_at` are
client-set ISO strings; there is no conflict resolution today. For a
single-user app (today's only real deployment shape — every workspace is
`kind = 'personal'`, one member) that's a non-issue: nobody else's device is
ever writing the same row. Groups **is** the event that turns this from a
theoretical gap into a real one, because it introduces genuinely concurrent
*different people*, not just one person's two devices.

**This is not a new problem to solve from scratch — it's the same problem
`docs/proposals/offline-write-outbox.md` already researched in depth for the
two-devices-one-person case ("Conflict reconciliation," lines 175-205 of that
doc), just with the stakes raised**: that proposal's recommendation — never
silently overwrite note content; on a detected conflict (client-set
`updated_at`/a revision column mismatch), insert the conflicting edit as a new
note alongside the original rather than clobbering it, and surface a one-line
"conflicting edit, both kept" banner — applies unchanged to two *different*
people editing the same note. The mechanism doesn't change; only the frequency
does. **Multiple people in a live group workspace makes concurrent edits to
the same note the expected case, not the rare one**, which changes this from
"nice to have before the trigger fires" to "must ship in the same release as
groups, or groups regresses data safety for the notes people already have
saved." That offline-write-outbox proposal explicitly deferred conflict
handling (its "v1 covers creates and updates only," lines 209-219) because
single-person-two-devices conflicts are rare; groups removes that "rare"
premise for any note in a *group* workspace specifically (personal workspaces
are unaffected — still genuinely single-user).

**What this means for scoping**: groups cannot ship editable shared notes
without at least the minimal half of the outbox proposal's conflict design —
a revision/timestamp check on `updateNote` that refuses to silently apply a
stale write. It does **not** need the rest of that proposal (queue-and-replay
for offline mutations, idempotent upserts, cascade-delete replay safety) —
those solve *offline* durability, which is an orthogonal problem groups
doesn't newly create. Recommend treating "conflict-safe `updateNote`" as a
shared prerequisite item both proposals now depend on, built once, referenced
by both — not duplicated.

**Delete races get worse the same way.** `deleteNoteAndCascade`
(`berean-api.ts`, referenced in `offline-write-outbox.md`'s cascade-delete
section) already re-derives "is this session/passage now empty?" from a live
count each time it runs, which — per that proposal's own analysis — makes it
safe against the *offline replay* version of this race. It says nothing about
the *live, both-online* version groups introduces: member A deletes the last
note in a session while member B is actively viewing/typing in a sibling note
of the same session; A's delete's live count reads zero (B's edit hasn't
landed yet) and cascades the session away out from under B. This isn't a
groups-specific bug to fix in this brief — it's a pre-existing gap in
`deleteNoteAndCascade`'s count-then-cascade logic that groups exposes for the
first time (two humans acting in the same second was never possible before).
Recommend flagging it as a known risk to watch in the MVP rather than
blocking on it: it requires unlucky timing (a delete and a create/edit racing
within the same session inside roughly a network round-trip), and the failure
mode is "a note gets orphaned or a session gets deleted a beat early," not
silent data corruption — annoying, not catastrophic, and disproportionate to
fix (a locking/transaction redesign) for a v1 with likely single or low-digit
group sizes.

## 6. Privacy, legal, and notification surface

- **Privacy page.** `public/privacy.html` currently describes a single-user
  data model implicitly (per the launch-readiness closeout in BACKLOG.md, the
  processor list and "no third-party tracking" claims were audited against
  exactly this shape). Groups changes what "your data" means: a group owner's
  notes become visible to whoever they invite, and a member's own notes
  written *into a group workspace* become visible to the rest of that group.
  Per the standing rule already in this repo ("adding ANY analytics, or any
  new service touching user data, means updating the privacy page in the same
  change" — CLAUDE.md/BACKLOG.md precedent), groups needs its own privacy-page
  update, stating plainly: content added to a group workspace is visible to
  every member of that group, membership is by invite, and removing/leaving
  does not retroactively hide what was already shared (see next bullet) —
  don't let a user assume group notes are as private as personal ones by
  default.
- **Terms.** Needs a line on account/content ownership when a member leaves or
  is removed: does their note content stay in the group workspace (it has to,
  structurally — notes belong to a workspace, not a user, and deleting a
  departing member's contributions would surprise the remaining group more
  than keeping them) or is it deleted? Recommend: **content stays**, ownership
  of the workspace's data is collective by design (the same way a shared
  Google Doc doesn't delete your paragraphs when you're removed), and the
  terms should say so explicitly rather than leaving it implicit — this is a
  real behavior change from personal workspaces (where deleting your account
  deletes your notes) that a user could reasonably not expect.
- **Removal/leaving mechanics**: need `leave_workspace()` and
  `remove_member(workspace_id, user_id)` `security definer` RPCs (owner-only
  for the latter; the "last owner can't leave/be removed without promoting
  someone else or deleting the workspace" edge case needs an explicit decision
  — recommend blocking it outright for v1 rather than designing workspace
  orphan-handling now).
- **Notification/email surface**: beyond the invite email itself (§4), the
  acceptance criteria ask about this generally. Recommend **v1 sends exactly
  one new email type — the invite** — and defers any "member X added a note"
  activity notification entirely. That's real, separate scope (needs its own
  preference/opt-out model, its own Brevo template, its own privacy-page
  language about a second thing the app now emails about) and nothing in the
  backlog or this brief's acceptance criteria makes it a blocker for a useful
  first slice.

## 7. Recommendation

**Don't build the full feature now. Build a narrow, safe MVP; explicitly defer
the rest; name the trigger to revisit.** In the tradition of `study-id.md`
("no schema change; the real gap was one UI affordance") and
`offline-write-outbox.md` ("wait; ship the smaller, safer fix first") — the
honest answer here isn't "yes, ship groups" or "no, skip it," it's "the
schema promise in BACKLOG.md is half-true, and the effort has been
systematically underestimated because the parts that look done (the tables)
are the easy 20%."

**Recommended MVP slice, in order, each shippable independently:**

1. **Read-only groups.** Create-group + invite + accept (§4), member-list
   visibility fix (§2), but notes/passages/sessions stay governed by the
   *existing* membership-only policies — meaning every member, including
   `'viewer'`s, can read **and write**. This sounds like it skips the point of
   roles, and it does — deliberately: it isolates "can people safely see each
   other's stuff" (the RLS-recursion fix, genuinely new and worth getting
   right in isolation) from "are roles enforced" (§3, a second, separable
   migration) and from conflict-safety (§5, needed the moment writes are
   concurrent). Shipping step 1 alone is honest only if it's *labeled*
   internally as "everyone's an editor for now" — not presented to users as
   having real viewer/owner distinctions yet.
2. **Conflict-safe `updateNote`** (§5) — must land before or alongside step 1
   if step 1 allows concurrent writes at all (it does, per above). This is the
   one item in this brief that isn't optional polish; shipping concurrent
   group writes without it is a real, likely-to-be-hit data-loss regression
   for existing users' note content the moment two people edit near each
   other, not a theoretical one.
3. **Role enforcement** (§3) — once steps 1-2 are live and validated, split
   the `for all` policies and gray out write UI for viewers.
4. **Leave/remove/privacy-and-terms updates** (§6) — needed before any real
   external user is invited into a group, not before internal/owner-only
   testing.

**Explicitly deferred, with why:**

- **Nuanced viewer permissions** (viewer can add personal notes but not edit
  group observations) — real UX question, no current model support, wait for
  a user to actually ask.
- **Activity notifications beyond the invite email** — separate scope,
  separate opt-out design, not blocking.
- **The live delete-race edge case** in §5 — rare, non-catastrophic, revisit
  if it's ever actually hit.
- **The full offline write outbox** — already deferred by its own proposal;
  groups doesn't change that call, it only makes the *conflict-detection*
  half of it (not the queue/replay half) a shared prerequisite (§5).

**Trigger to revisit / build at all:** Lantern is a single-owner, "one real
user with more arriving" app today (per the same framing
`offline-write-outbox.md` used). Groups is worth building when there's an
actual expressed want for shared study — a spouse, a small group, a Bible
study cohort wanting to read each other's notes — not speculatively ahead of
that. If/when it's greenlit, build in the order above; don't start with the
schema (it's already there) or skip straight to invite UI (the RLS/role/
conflict work underneath it is the part that's actually hard, and is exactly
what this brief exists to make visible before someone estimates this as "just
new rows plus UI").

## Files read for this brief

`supabase/migrations/0001_init.sql` (in full), `src/api/types.ts`,
`src/api/berean-api.ts`, `src/api/context.tsx`, `src/api/memory.ts`
(workspace-id handling only), `src/types/index.ts` (confirmed no `Workspace`
type), `supabase/functions/` and `supabase/templates/` directory listings
(confirmed only `hq-telemetry` and the two auth templates exist),
`docs/proposals/study-id.md`, `docs/proposals/offline-write-outbox.md`,
`docs/proposals/onboarding-hints.md` and `docs/proposals/scripture-search.md`
(structure/tone reference only), `docs/BACKLOG.md`, `CLAUDE.md`.

---

## Addendum — 2026-08-30 (research + product-strategy session)

The brief above asked for "a named trigger" before building. This addendum
records what the research pass found about whether group study is a real
market need, and a product decision that changes the *shape* of the first
slice rather than its size.

### The demand evidence is weak, and the recoil is sharper than expected

A Reddit pass (via the Chrome connector; ~15 threads across r/Christianity,
r/Reformed, r/TrueChristian, r/Christian, r/youthministry, r/Bible) looked
specifically for how groups share study notes today.

- **Nobody described sharing personal study notes with their group.** Not
  once, across every prep-and-leading thread read. Targeted searches for the
  expected mechanics (Google Docs, WhatsApp, screenshots, email) returned
  essentially nothing.
- The only artifacts that actually move between people are church-produced
  study guides, published curricula, DVD series, and the leader's spoken
  questions.
- **What leaders produce is questions, not notes.** The most concrete prep
  description found is entirely question-authoring: "What questions am I going
  to ask each week? Are the questions that I'm asking worded in such a way that
  facilitates or promotes conversation/participation?"

Caveat, stated honestly: absence of Reddit discussion is weak evidence. The
practice could be too mundane to post about. But it is **not** the signature of
a painful, latent, unmet need.

### The hard constraint: no activity visibility, ever

The strongest reaction in the entire research corpus came from a
r/youthministry thread where a founder described a leader dashboard —
explicitly *not* a feed, explicitly framed as non-policing:

> "I know that if my youth leader wanted to keep track of my Bible reading via
> an app, I'd immediately bail. That's a level of intrusion and oversight I
> wouldn't deal with… Adults don't want to be ordered around that way in their
> spiritual lives, and I doubt kids do, either."

> "The Bible cannot be school. Faith grows in lived experience."

The offence was **observability of activity itself**, not note contents. The
builder's protest that he was "not at all policing" did not help.

**Constraint: members see what someone deliberately shared and nothing else.**
No "who's read," no last-seen, no participation counts, no leader dashboard, no
aggregate progress. Per-note opt-in does not by itself satisfy this; the
constraint is about *activity signals*, which per-note sharing does not create
but a dashboard would.

Corroborating from the YouVersion social backlash: "I liked it better when it
was just a Bible app and not trying so hard to be this social ... thing." The
same commenter then designed the acceptable version unprompted, which is close
to a spec:

> "a little unobtrusive micro-star or subtle highlight that if I wished, I
> could hover on and see that my buddy highlighted… **Nothing to get in the way
> of the study, and content that is ideally directly relevant to the text.**"

Anchored to the verse, ambient, pull not push, zero surface area when you are
not curious.

### The shape decision: this is TWO products, not one

Dennis's own two situations split cleanly, and forcing them into one model is
the mistake to avoid.

**A. The one-on-one / study partner.** Wanting to trade ideas in a shared
environment. Dennis named the dealbreaker himself: writing a note into a group
space and then not having it in his personal notes.

> **Sharing must be a property of the note, not a different place you write.**

One row, a visibility flag, appearing in both the personal Journal and the
shared view because it *is* the same note. Nothing forks; the journal stays
whole. This is materially less work than a second workspace, and it matches the
ambient, verse-anchored model above.

**B. The 10+ group.** Dennis: "it's less about personal study… I don't mind it
just being in a group note space." Different job, different primary object. The
research points at what that object should be: **a leader's passage plus two or
three questions, with responses in place.** That is not a personal anchored
note and should not be modelled as one.

**Sequencing consequence:** A is a visibility flag on an object that already
exists. B is a genuinely new object. **A does not commit Lantern to B**, which
is a better decomposition than the "read-only groups first" slice proposed in
§7 above — it delivers something useful to Dennis sooner and defers more.

### Where this leaves §7's recommendation

The §7 MVP ordering (membership/RLS first, conflict-safe `updateNote`
alongside, roles later) is still correct **for the workspace-shaped feature
(B)**. It is heavier than needed for (A), which may not require a second
workspace at all.

Two items from §7 survive unchanged and remain the real cost:

- **Conflict-safe `updateNote` (§5) is still non-optional** the moment two
  people can write near each other.
- **The member-visibility RLS work (§2) is still genuinely new** and still the
  part worth getting right in isolation.

### Revised trigger

The brief said: build when there is "an actual expressed want for shared study
— a spouse, a small group, a Bible study cohort." That trigger **has fired for
Dennis personally** (a one-on-one study and a 10+ group), and **has not fired
as a market**.

Both can be true. The honest position: build (A) small, private, invite-only,
because Dennis wants it for his own study — the same dogfooding logic that
justifies everything else in Lantern. Do not productise (B) or position groups
as a growth feature on this evidence.

**Priority note:** the 2026-08-30 session concluded that the **note object**
work (highlights, user-owned categories, retrieval — see `note-object.md`) sits
*underneath* group sharing and should come first. Sharing-as-a-visibility-flag
is much cheaper once the note object has been revisited anyway.
