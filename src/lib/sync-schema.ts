// Penny — the one-time Supabase SQL to set up a Space. Surfaced (copyable) in
// Settings so the user can paste it into Supabase → SQL editor.
export const SYNC_SCHEMA_SQL = `-- Penny sync — run once in Supabase → SQL editor (safe to re-run).
-- The project itself is your shared "Space": everyone with the anon key is a member.

create table if not exists penny_entities (
  kind        text    not null,
  id          text    not null,
  owner       text    not null default 'space',
  data        jsonb   not null,
  updated_at  bigint  not null,
  deleted     boolean not null default false,
  primary key (kind, id, owner)
);

alter table penny_entities enable row level security;

-- Single-tenant project = one household. Anyone holding the anon key is trusted.
drop policy if exists "penny anon all" on penny_entities;
create policy "penny anon all" on penny_entities
  for all to anon, authenticated
  using (true) with check (true);

-- Live updates across devices. Wrapped so a re-run (table already published)
-- can't roll back the whole script.
do $$
begin
  alter publication supabase_realtime add table penny_entities;
exception
  when duplicate_object then null;
  when others then null;
end $$;
`;
