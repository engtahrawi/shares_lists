-- SaveMind sync schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to run again: every statement is idempotent.
--
-- Each saved link and collection is one row in public.items, owned by the signed-in user.
-- Row Level Security keeps every row visible only to its owner.
-- Devices push changes through push_items (last write wins by the client's updated_at)
-- and pull everything with a seq greater than the last one they saw.

create sequence if not exists public.items_seq;

create table if not exists public.items (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('link', 'collection')),
  data        jsonb not null default '{}'::jsonb,
  deleted     boolean not null default false,
  updated_at  bigint not null,
  seq         bigint not null default nextval('public.items_seq')
);

create index if not exists items_user_seq on public.items (user_id, seq);

-- Every update gets a new seq, so other devices pick it up on their next pull.
create or replace function public.items_bump_seq() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('public.items_seq');
  return new;
end;
$$;

drop trigger if exists items_bump_seq on public.items;
create trigger items_bump_seq before update on public.items
  for each row execute function public.items_bump_seq();

alter table public.items enable row level security;

drop policy if exists "items: owner can read" on public.items;
create policy "items: owner can read" on public.items
  for select using (user_id = auth.uid());

drop policy if exists "items: owner can insert" on public.items;
create policy "items: owner can insert" on public.items
  for insert with check (user_id = auth.uid());

drop policy if exists "items: owner can update" on public.items;
create policy "items: owner can update" on public.items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "items: owner can delete" on public.items;
create policy "items: owner can delete" on public.items
  for delete using (user_id = auth.uid());

-- Upserts a batch of items; an older copy never overwrites a newer one.
create or replace function public.push_items(items jsonb) returns integer
language plpgsql security invoker as $$
declare
  it jsonb;
  n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  for it in select * from jsonb_array_elements(items) loop
    insert into public.items as t (id, user_id, kind, data, deleted, updated_at)
    values (
      it->>'id',
      auth.uid(),
      it->>'kind',
      coalesce(it->'data', '{}'::jsonb),
      coalesce((it->>'deleted')::boolean, false),
      (it->>'updated_at')::bigint
    )
    on conflict (id) do update
      set kind = excluded.kind,
          data = excluded.data,
          deleted = excluded.deleted,
          updated_at = excluded.updated_at
      where t.user_id = auth.uid() and t.updated_at <= excluded.updated_at;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on table public.items from anon;
grant select, insert, update, delete on table public.items to authenticated;
grant usage, select on sequence public.items_seq to authenticated;
revoke execute on function public.push_items(jsonb) from anon, public;
grant execute on function public.push_items(jsonb) to authenticated;
