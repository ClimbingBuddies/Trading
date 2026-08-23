delete from public.watchlists where owner_user_id is null;

alter table public.watchlists
  alter column owner_user_id set not null;

create index if not exists watchlists_owner_user_id_idx
  on public.watchlists(owner_user_id);

create unique index if not exists watchlists_one_default_per_owner_idx
  on public.watchlists(owner_user_id)
  where is_default;

create or replace function private.watchlists_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.watchlists_set_updated_at() from public, anon, authenticated;

drop trigger if exists watchlists_set_updated_at on public.watchlists;
create trigger watchlists_set_updated_at
before update on public.watchlists
for each row execute function private.watchlists_set_updated_at();

create or replace function private.watchlists_default_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default is not true
     and not exists (
       select 1
       from public.watchlists w
       where w.owner_user_id = new.owner_user_id
         and w.is_default
     ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

revoke all on function private.watchlists_default_on_insert() from public, anon, authenticated;

drop trigger if exists watchlists_default_on_insert on public.watchlists;
create trigger watchlists_default_on_insert
before insert on public.watchlists
for each row execute function private.watchlists_default_on_insert();

alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;

drop policy if exists watchlists_owner_select on public.watchlists;
drop policy if exists watchlists_owner_insert on public.watchlists;
drop policy if exists watchlists_owner_update on public.watchlists;
drop policy if exists watchlists_owner_delete on public.watchlists;

create policy watchlists_owner_select
on public.watchlists
for select
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy watchlists_owner_insert
on public.watchlists
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy watchlists_owner_update
on public.watchlists
for update
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
)
with check (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy watchlists_owner_delete
on public.watchlists
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

drop policy if exists watchlist_items_owner_select on public.watchlist_items;
drop policy if exists watchlist_items_owner_insert on public.watchlist_items;
drop policy if exists watchlist_items_owner_update on public.watchlist_items;
drop policy if exists watchlist_items_owner_delete on public.watchlist_items;

create policy watchlist_items_owner_select
on public.watchlist_items
for select
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.watchlists w
    where w.id = watchlist_id
      and w.owner_user_id = (select auth.uid())
  )
);

create policy watchlist_items_owner_insert
on public.watchlist_items
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.watchlists w
    where w.id = watchlist_id
      and w.owner_user_id = (select auth.uid())
  )
);

create policy watchlist_items_owner_update
on public.watchlist_items
for update
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.watchlists w
    where w.id = watchlist_id
      and w.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.watchlists w
    where w.id = watchlist_id
      and w.owner_user_id = (select auth.uid())
  )
);

create policy watchlist_items_owner_delete
on public.watchlist_items
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.watchlists w
    where w.id = watchlist_id
      and w.owner_user_id = (select auth.uid())
  )
);

revoke all privileges on table public.watchlists from anon;
revoke all privileges on table public.watchlist_items from anon;

revoke all privileges on table public.watchlists from authenticated;
revoke all privileges on table public.watchlist_items from authenticated;
grant select, insert, update, delete on table public.watchlists to authenticated;
grant select, insert, update, delete on table public.watchlist_items to authenticated;

create or replace function public.set_watchlist_default(p_watchlist_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_anonymous boolean := coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false);
begin
  if v_user_id is null or v_is_anonymous then
    raise exception 'Permanent authentication is required';
  end if;

  if not exists (
    select 1
    from public.watchlists w
    where w.id = p_watchlist_id
      and w.owner_user_id = v_user_id
  ) then
    raise exception 'Watchlist not found';
  end if;

  update public.watchlists
  set is_default = false
  where owner_user_id = v_user_id
    and is_default
    and id <> p_watchlist_id;

  update public.watchlists
  set is_default = true
  where id = p_watchlist_id
    and owner_user_id = v_user_id;
end;
$$;

revoke all on function public.set_watchlist_default(uuid) from public, anon;
grant execute on function public.set_watchlist_default(uuid) to authenticated, service_role;
