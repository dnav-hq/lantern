-- User-owned note categories.
--
-- WHY. The four built-in categories (observation / historical / application /
-- personal) are good discipline and the right default, but the category set IS
-- the retrieval index: a reader who studies mostly typology, or prophecy, or
-- prayer has no category for it, so every note lands in `observation` and the
-- Journal stops discriminating exactly when it starts mattering. See
-- docs/proposals/note-object.md §3.
--
-- SHAPE: DEFINITIONS ONLY, NOT A FOREIGN KEY. `notes.category` stays the text
-- key it already is. This table describes what a key MEANS (its label, colour
-- and order) for one workspace. Deliberately not a foreign key from notes,
-- because:
--   * no backfill and no data migration — every existing note keeps working
--     untouched, and this migration cannot lose anyone's data;
--   * deleting a category must not cascade-delete notes, which a real FK would
--     invite someone to configure by accident;
--   * a note whose category was later removed degrades to "uncategorised
--     colour, key still visible", which is recoverable, rather than to a
--     constraint violation.
--
-- NO SEEDING, NO TRIGGER. A workspace with NO rows here uses the four built-in
-- defaults, which is what every existing workspace does today. Rows appear only
-- when a reader actually customises. That means this migration adds behaviour
-- for people who want it and changes nothing for people who don't.
--
-- THE CHECK CONSTRAINT HAS TO GO. 0001_init.sql pinned notes.category to the
-- four literals. Keeping it would make the feature impossible; dropping it is
-- the whole point. Validation moves to the app, which is where a user-defined
-- set has to live anyway.
--
-- Idempotent: safe to re-run.

-- 1. Let a note carry a category the reader invented.
alter table public.notes
  drop constraint if exists notes_category_check;

-- 2. The definitions.
create table if not exists public.note_categories (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- The value stored in notes.category. Stable; renaming a category changes
  -- `label`, never this, so existing notes keep their category.
  key          text not null,
  label        text not null,
  -- Hex, e.g. '#6b62d6'. The app maps this onto its own tokens.
  color        text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, key)
);

create index if not exists note_categories_workspace_idx
  on public.note_categories (workspace_id, sort_order);

alter table public.note_categories enable row level security;

-- Same membership rule as passages_all: you see and write the categories of a
-- workspace you belong to. Groups later needs no policy change here.
drop policy if exists note_categories_all on public.note_categories;
create policy note_categories_all on public.note_categories
  for all using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid()))
  ) with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid()))
  );
