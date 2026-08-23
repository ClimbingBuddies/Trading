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
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy watchlists_owner_insert
on public.watchlists
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy watchlists_owner_update
on public.watchlists
for update
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
)
with check (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy watchlists_owner_delete
on public.watchlists
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
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
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
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
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
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
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.watchlists w
    where w.id = watchlist_id
      and w.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
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
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.watchlists w
    where w.id = watchlist_id
      and w.owner_user_id = (select auth.uid())
  )
);

create or replace function public.set_watchlist_default(p_watchlist_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_anonymous boolean := coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false);
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
