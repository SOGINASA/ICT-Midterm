-- TengeFlow: apply once to an empty Supabase project's SQL Editor or via migrations.
-- All money values use unconstrained numeric plus explicit checks: numeric(p,2)
-- would round excess decimal places before a CHECK could reject them.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  currency text not null default 'KZT' check (currency = 'KZT'),
  monthly_budget numeric not null default 120000
    check (monthly_budget >= 0 and monthly_budget <= 1000000000000 and scale(monthly_budget) <= 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  user_id uuid not null references public.profiles(id) on delete cascade,
  id text not null check (id in ('food', 'transport', 'study', 'leisure', 'other')),
  name text not null check (name in ('Food', 'Transport', 'Study', 'Leisure', 'Other')),
  icon text not null,
  monthly_limit numeric not null default 0
    check (monthly_limit >= 0 and monthly_limit <= 1000000000000 and scale(monthly_limit) <= 2),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id text not null,
  amount numeric not null
    check (amount > 0 and amount <= 1000000000000 and scale(amount) <= 2),
  payment_method text not null check (payment_method in ('card', 'cash')),
  note text not null default '' check (char_length(note) <= 120),
  occurred_at date not null check (occurred_at between date '0100-01-01' and date '9999-12-31'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, category_id) references public.categories(user_id, id)
);

create index transactions_owner_created_idx on public.transactions(user_id, created_at desc, id desc);
create index transactions_owner_date_idx on public.transactions(user_id, occurred_at desc);
create index transactions_owner_category_idx on public.transactions(user_id, category_id);

create function public.tengeflow_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.tengeflow_touch_updated_at() from public, anon, authenticated;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.tengeflow_touch_updated_at();
create trigger categories_updated_at before update on public.categories
for each row execute function public.tengeflow_touch_updated_at();
create trigger transactions_updated_at before update on public.transactions
for each row execute function public.tengeflow_touch_updated_at();

create function public.tengeflow_initialize_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Student'), 60));

  insert into public.categories (user_id, id, name, icon, monthly_limit, color)
  values
    (new.id, 'food', 'Food', 'utensils', 45000, '#15776E'),
    (new.id, 'transport', 'Transport', 'bus', 20000, '#75AAA4'),
    (new.id, 'study', 'Study', 'book-open', 15000, '#A4C5BD'),
    (new.id, 'leisure', 'Leisure', 'clapperboard', 25000, '#C4D6CC'),
    (new.id, 'other', 'Other', 'shapes', 15000, '#D9E1D4');
  return new;
end;
$$;
revoke all on function public.tengeflow_initialize_account() from public, anon, authenticated;
create trigger tengeflow_account_created after insert on auth.users
for each row execute function public.tengeflow_initialize_account();

-- Also initialize users created before this migration was installed.
insert into public.profiles (id, display_name)
select id, left(coalesce(nullif(btrim(raw_user_meta_data ->> 'display_name'), ''), 'Student'), 60)
from auth.users;
insert into public.categories (user_id, id, name, icon, monthly_limit, color)
select profiles.id, defaults.id, defaults.name, defaults.icon, defaults.monthly_limit, defaults.color
from public.profiles
cross join (values
  ('food', 'Food', 'utensils', 45000, '#15776E'),
  ('transport', 'Transport', 'bus', 20000, '#75AAA4'),
  ('study', 'Study', 'book-open', 15000, '#A4C5BD'),
  ('leisure', 'Leisure', 'clapperboard', 25000, '#C4D6CC'),
  ('other', 'Other', 'shapes', 15000, '#D9E1D4')
) as defaults(id, name, icon, monthly_limit, color);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

-- Supabase projects may have default grants: remove them explicitly first.
revoke all on public.profiles, public.categories, public.transactions from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.categories, public.transactions to authenticated;
grant update (display_name, monthly_budget) on public.profiles to authenticated;
grant update (monthly_limit) on public.categories to authenticated;
grant insert (id, user_id, category_id, amount, payment_method, note, occurred_at) on public.transactions to authenticated;
grant update (category_id, amount, payment_method, note, occurred_at) on public.transactions to authenticated;
grant delete on public.transactions to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy categories_select_own on public.categories for select to authenticated
using ((select auth.uid()) = user_id);
create policy categories_update_own on public.categories for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy transactions_select_own on public.transactions for select to authenticated
using ((select auth.uid()) = user_id);
create policy transactions_insert_own on public.transactions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy transactions_update_own on public.transactions for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy transactions_delete_own on public.transactions for delete to authenticated
using ((select auth.uid()) = user_id);

commit;
