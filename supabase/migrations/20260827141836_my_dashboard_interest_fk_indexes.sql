-- MYDASH-002: cover nullable interest foreign keys for owner-scoped lookups and deletes.
create index if not exists user_market_interests_instrument_idx
  on public.user_market_interests (instrument_id)
  where instrument_id is not null;

create index if not exists user_market_interests_theme_idx
  on public.user_market_interests (theme_id)
  where theme_id is not null;
