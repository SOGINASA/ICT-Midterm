-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/finance_security.sql
-- against a disposable migrated Supabase database, as postgres. No pgTAP needed.
-- Everything, including the temporary auth users, is rolled back.
begin;

create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end;
$$;
create function pg_temp.expect_error(statement text, expected_state text, label text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then
      raise notice 'PASS: %', label;
      return;
    end if;
    raise;
  end;
  raise exception 'FAIL: % (statement unexpectedly succeeded)', label;
end;
$$;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
('c58f5f21-920f-43a1-8f1b-9e28937cf001', 'rls-a@tengeflow.test', 'authenticated', 'authenticated', '{"display_name":"Ayan"}'),
('c58f5f21-920f-43a1-8f1b-9e28937cf002', 'rls-b@tengeflow.test', 'authenticated', 'authenticated', '{"display_name":"  "}');
select pg_temp.assert_true((select count(*) = 10 from public.categories where user_id in
('c58f5f21-920f-43a1-8f1b-9e28937cf001', 'c58f5f21-920f-43a1-8f1b-9e28937cf002')), 'signup creates exactly five categories per user');
select pg_temp.assert_true((select display_name = 'Student' from public.profiles where id = 'c58f5f21-920f-43a1-8f1b-9e28937cf002'), 'blank signup display name gets safe fallback');
select pg_temp.assert_true((select count(*) = 0 from public.transactions where user_id in
('c58f5f21-920f-43a1-8f1b-9e28937cf001', 'c58f5f21-920f-43a1-8f1b-9e28937cf002')), 'real accounts begin without demo expenses');
insert into public.transactions (id, user_id, category_id, amount, payment_method, occurred_at)
values ('cd8c010b-673a-4d4f-913f-8851c69aa002', 'c58f5f21-920f-43a1-8f1b-9e28937cf002', 'food', 1500, 'card', '2026-09-30');
-- Only B retains leisure: the composite FK must reject A referencing that row.
delete from public.categories where user_id = 'c58f5f21-920f-43a1-8f1b-9e28937cf001' and id = 'leisure';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c58f5f21-920f-43a1-8f1b-9e28937cf001', true);
select set_config('request.jwt.claims', '{"sub":"c58f5f21-920f-43a1-8f1b-9e28937cf001","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'A reads only own profile');
select pg_temp.assert_true((select count(*) = 4 from public.categories), 'A reads only own categories');
select pg_temp.assert_true((select count(*) = 0 from public.transactions), 'A cannot read B expense');

update public.profiles set monthly_budget = 180000 where id = 'c58f5f21-920f-43a1-8f1b-9e28937cf001';
select pg_temp.assert_true((select monthly_budget = 180000 from public.profiles), 'A updates own budget');
update public.categories set monthly_limit = 50000 where id = 'food';
select pg_temp.assert_true((select monthly_limit = 50000 from public.categories where id = 'food'), 'A updates own category limit');
with changed as (update public.profiles set monthly_budget = 1 where id = 'c58f5f21-920f-43a1-8f1b-9e28937cf002' returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'A cannot update B profile');
with changed as (update public.categories set monthly_limit = 1 where user_id = 'c58f5f21-920f-43a1-8f1b-9e28937cf002' returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'A cannot update B categories');
with changed as (update public.transactions set amount = 1 where id = 'cd8c010b-673a-4d4f-913f-8851c69aa002' returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'A cannot update B expense');
with removed as (delete from public.transactions where id = 'cd8c010b-673a-4d4f-913f-8851c69aa002' returning id)
select pg_temp.assert_true((select count(*) = 0 from removed), 'A cannot delete B expense');

insert into public.transactions (id, user_id, category_id, amount, payment_method, note, occurred_at)
values ('cd8c010b-673a-4d4f-913f-8851c69aa001', 'c58f5f21-920f-43a1-8f1b-9e28937cf001', 'food', 1234.50, 'card', 'Lunch', '2026-09-30');
select pg_temp.assert_true((select count(*) = 1 from public.transactions), 'A creates and reads own expense');
update public.transactions set amount = 1400, payment_method = 'cash' where id = 'cd8c010b-673a-4d4f-913f-8851c69aa001';
select pg_temp.assert_true((select amount = 1400 and payment_method = 'cash' from public.transactions), 'A edits own expense');
select pg_temp.expect_error($q$insert into public.transactions (user_id, category_id, amount, payment_method, occurred_at) values ('c58f5f21-920f-43a1-8f1b-9e28937cf002', 'food', 1, 'card', '2026-09-30')$q$, '42501', 'A cannot forge B expense owner');
select pg_temp.expect_error($q$update public.transactions set user_id = 'c58f5f21-920f-43a1-8f1b-9e28937cf002'$q$, '42501', 'A cannot transfer expense ownership');
select pg_temp.expect_error($q$insert into public.transactions (user_id, category_id, amount, payment_method, occurred_at) values ('c58f5f21-920f-43a1-8f1b-9e28937cf001', 'leisure', 1, 'card', '2026-09-30')$q$, '23503', 'A cannot use a category belonging only to B');
select pg_temp.expect_error($q$insert into public.profiles (id, display_name) values ('c58f5f21-920f-43a1-8f1b-9e28937cf002', 'spoof')$q$, '42501', 'client cannot create profiles directly');
select pg_temp.expect_error($q$delete from public.profiles$q$, '42501', 'client cannot delete profiles directly');
select pg_temp.expect_error($q$insert into public.categories (user_id, id, name, icon, color) values ('c58f5f21-920f-43a1-8f1b-9e28937cf001', 'leisure', 'Leisure', 'x', '#FFFFFF')$q$, '42501', 'client cannot create categories directly');
select pg_temp.expect_error($q$delete from public.categories$q$, '42501', 'client cannot delete categories directly');
select pg_temp.expect_error($q$update public.categories set name = 'Other' where id = 'food'$q$, '42501', 'client cannot change category identity');
select pg_temp.expect_error($q$update public.transactions set created_at = now()$q$, '42501', 'client cannot rewrite server timestamps');
select pg_temp.expect_error($q$update public.transactions set amount = 0$q$, '23514', 'zero amount rejected');
select pg_temp.expect_error($q$update public.transactions set amount = -1$q$, '23514', 'negative amount rejected');
select pg_temp.expect_error($q$update public.transactions set amount = 1.234$q$, '23514', 'excess precision rejected without rounding');
select pg_temp.expect_error($q$update public.transactions set amount = 1000000000001$q$, '23514', 'oversized amount rejected');
select pg_temp.expect_error($q$update public.transactions set amount = 'NaN'::numeric$q$, '23514', 'NaN amount rejected');
select pg_temp.expect_error($q$update public.transactions set note = repeat('x', 121)$q$, '23514', 'long note rejected');
select pg_temp.expect_error($q$update public.transactions set payment_method = 'bitcoin'$q$, '23514', 'unsupported payment method rejected');
select pg_temp.expect_error($q$update public.transactions set occurred_at = '2026-02-30'$q$, '22008', 'invalid calendar date rejected');
select pg_temp.expect_error($q$update public.profiles set monthly_budget = -1$q$, '23514', 'negative budget rejected');
select pg_temp.expect_error($q$update public.profiles set monthly_budget = 2.345$q$, '23514', 'budget precision rejected');
select pg_temp.expect_error($q$update public.categories set monthly_limit = -1$q$, '23514', 'negative category limit rejected');
select pg_temp.expect_error($q$select public.tengeflow_initialize_account()$q$, '42501', 'security-definer account initializer is not callable by client');
with removed as (delete from public.transactions where id = 'cd8c010b-673a-4d4f-913f-8851c69aa001' returning id)
select pg_temp.assert_true((select count(*) = 1 from removed), 'A deletes own expense');

select set_config('request.jwt.claim.sub', 'c58f5f21-920f-43a1-8f1b-9e28937cf002', true);
select set_config('request.jwt.claims', '{"sub":"c58f5f21-920f-43a1-8f1b-9e28937cf002","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 1 and min(monthly_budget) = 120000 from public.profiles), 'B profile remains unchanged');
select pg_temp.assert_true((select monthly_limit = 45000 from public.categories where id = 'food'), 'B category remains unchanged');
select pg_temp.assert_true((select count(*) = 1 and min(amount) = 1500 from public.transactions), 'B expense remains unchanged');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.expect_error('select * from public.profiles', '42501', 'anonymous profile reads denied');
select pg_temp.expect_error('select * from public.categories', '42501', 'anonymous category reads denied');
select pg_temp.expect_error('select * from public.transactions', '42501', 'anonymous expense reads denied');
select pg_temp.expect_error($q$insert into public.transactions (user_id, category_id, amount, payment_method, occurred_at) values ('c58f5f21-920f-43a1-8f1b-9e28937cf002', 'food', 1, 'card', '2026-09-30')$q$, '42501', 'anonymous expense inserts denied');
select pg_temp.expect_error('update public.transactions set amount = 1', '42501', 'anonymous expense updates denied');
select pg_temp.expect_error('delete from public.transactions', '42501', 'anonymous expense deletes denied');
reset role;
rollback;
