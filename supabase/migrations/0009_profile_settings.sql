-- Account-synced preferences: a `settings` jsonb column on profiles.
--
-- WHY A COLUMN, NOT A TABLE. The four preferences (dark mode, visual theme,
-- translation, hide-all-notes) are low-stakes, last-write-wins values with no
-- query or join need of their own — a jsonb blob on the row that already is
-- "this user's account settings" is the lightest correct model. See
-- docs/proposals/guest-preview-mode.md §2b.
--
-- WHY NO NEW RLS POLICY. profiles already has own-row select/update RLS
-- (profiles_select / profiles_update, both in 0001_init.sql) — that covers
-- every column on the row, this one included, automatically.
--
-- Idempotent: add column if not exists, safe to re-run.

alter table public.profiles
  add column if not exists settings jsonb not null default '{}'::jsonb;
