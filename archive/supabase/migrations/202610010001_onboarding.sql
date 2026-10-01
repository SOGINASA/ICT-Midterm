-- Existing accounts keep their data and can continue using the app immediately.
-- Accounts created after this migration must complete their initial setup.
begin;

alter table public.profiles
  add column onboarding_completed boolean not null default true;
alter table public.profiles
  alter column onboarding_completed set default false;

-- The browser can read the marker, but only the atomic RPC can complete setup.
-- Existing grants are column-specific; explicitly exclude the new column too.
revoke update (onboarding_completed) on public.profiles from public, anon, authenticated;

create function public.complete_onboarding(
  p_display_name text,
  p_monthly_budget numeric,
  p_category_limits jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  already_completed boolean;
  clean_name text;
  category_key text;
  category_value jsonb;
  category_amount numeric;
  allocated numeric := 0;
  changed_count integer;
begin
  if account_id is null then
    raise exception 'Sign in before setting up your account.' using errcode = '42501';
  end if;

  -- Serializes parallel submits and allows a safe retry after a lost response.
  -- A repeated request must never revert budgets changed since initial setup.
  select onboarding_completed into already_completed
  from public.profiles where id = account_id for update;
  if not found then
    raise exception 'The signed-in account has no profile.' using errcode = '42501';
  end if;
  if already_completed then return; end if;

  clean_name := regexp_replace(p_display_name, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if clean_name is null or char_length(clean_name) not between 2 and 60 then
    raise exception 'Display name must contain 2 to 60 characters.' using errcode = '23514';
  end if;
  if p_monthly_budget is null or not (
    p_monthly_budget > 0 and p_monthly_budget <= 1000000000000
    and scale(p_monthly_budget) <= 2
  ) then
    raise exception 'Enter a positive budget with at most two decimal places.' using errcode = '23514';
  end if;

  if p_category_limits is null or jsonb_typeof(p_category_limits) <> 'object' then
    raise exception 'Category limits must be an object.' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_object_keys(p_category_limits)) <> 5
    or not (p_category_limits ?& array['food', 'transport', 'study', 'leisure', 'other']) then
    raise exception 'Include exactly the five supported category limits.' using errcode = '23514';
  end if;

  for category_key, category_value in select key, value from jsonb_each(p_category_limits)
  loop
    if jsonb_typeof(category_value) <> 'number' then
      raise exception 'Category limits must be numbers.' using errcode = '23514';
    end if;
    category_amount := category_value::text::numeric;
    if not (category_amount >= 0 and category_amount <= 1000000000000 and scale(category_amount) <= 2) then
      raise exception 'Use nonnegative category limits with at most two decimal places.' using errcode = '23514';
    end if;
    allocated := allocated + category_amount;
  end loop;
  if allocated > p_monthly_budget then
    raise exception 'Category limits must fit within the monthly budget.' using errcode = '23514';
  end if;

  update public.categories
  set monthly_limit = (p_category_limits ->> id)::numeric
  where user_id = account_id;
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    -- Throwing rolls back every category update, leaving setup retryable.
    raise exception 'Account categories are incomplete.' using errcode = '23514';
  end if;
  update public.profiles set
    display_name = clean_name,
    monthly_budget = p_monthly_budget,
    onboarding_completed = true
  where id = account_id;
end;
$$;

revoke all on function public.complete_onboarding(text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.complete_onboarding(text, numeric, jsonb) to authenticated;

commit;
