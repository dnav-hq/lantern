-- Retiring a category, without touching a single note.
--
-- WHY ARCHIVE AND NOT DELETE. Removing a category makes a key STOP HAVING A
-- MEANING, and every note carrying it becomes a note filed under a word the app
-- can no longer explain. The unacceptable outcome is losing or orphaning a
-- reader's notes, and archive is the only option where no note is touched at
-- all: the definition stays, `notes.category` stays, the `@tag` inside the
-- note's content stays. The category simply stops being OFFERED. See
-- docs/proposals/custom-categories.md §2.
--
-- This is the same grain 0010 was built on. That migration is explicit that
-- note_categories is "DEFINITIONS ONLY, NOT A FOREIGN KEY" precisely so that
-- "deleting a category must not cascade-delete notes". Archiving is what that
-- foresight was for.
--
-- WHY A ROW CAN NOW EXIST FOR AN UNCHANGED BUILT-IN. Until now, absence of a
-- row meant "use the default", so a workspace that customised nothing stored
-- nothing. Archiving a BUILT-IN is a real case — someone who never writes
-- historical notes will retire it — and it cannot be expressed by absence. So a
-- retired built-in gets an explicit row whose label and colour are still the
-- defaults and whose archived_at is set. Absence still means "default, active",
-- which is still what every uncustomised workspace stores: nothing.
--
-- NO RLS CHANGE. 0010's `note_categories_all` policy is `for all` on the
-- workspace-membership rule, so it already covers reading and writing this
-- column. It is restated below only because 0010 restates it too, and both are
-- idempotent — re-running either leaves exactly one policy.
--
-- Idempotent: safe to re-run.

-- When the category was retired. NULL means active, which is what every
-- existing row means today, so this backfills to exactly the current behaviour.
alter table public.note_categories
  add column if not exists archived_at timestamptz;

-- The pickers read the ACTIVE set, which after this is the common query.
create index if not exists note_categories_active_idx
  on public.note_categories (workspace_id, sort_order)
  where archived_at is null;

alter table public.note_categories enable row level security;

drop policy if exists note_categories_all on public.note_categories;
create policy note_categories_all on public.note_categories
  for all using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid()))
  ) with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid()))
  );
