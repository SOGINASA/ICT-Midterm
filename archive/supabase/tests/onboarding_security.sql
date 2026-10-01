-- Run as postgres after both migrations, on a disposable Supabase database:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/onboarding_security.sql
-- Every fixture and change is rolled back. No pgTAP extension is required.
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
('c58f5f21-920f-43a1-8f1b-9e28937cf101', 'onboarding-a@tengeflow.test', 'authenticated', 'authenticated', '{"display_name":"Before"}'),
('c58f5f21-920f-43a1-8f1b-9e28937cf102', 'onboarding-b@tengeflow.test', 'authenticated', 'authenticated', '{"display_name":"Other user"}'),
('c58f5f21-920f-43a1-8f1b-9e28937cf103', 'onboarding-c@tengeflow.test', 'authenticated', 'authenticated', '{"display_name":"Incomplete"}');
select pg_temp.assert_true((select bool_and(not onboarding_completed) from public.profiles where id in
('c58f5f21-920f-43a1-8f1b-9e28937cf101', 'c58f5f21-920f-43a1-8f1b-9e28937cf102', 'c58f5f21-920f-43a1-8f1b-9e28937cf103')), 'new accounts require onboarding');
select pg_temp.assert_true((select count(*) = 0 from public.transactions where user_id in
('c58f5f21-920f-43a1-8f1b-9e28937cf101', 'c58f5f21-920f-43a1-8f1b-9e28937cf102', 'c58f5f21-920f-43a1-8f1b-9e28937cf103')), 'new accounts contain no demo expenses');
delete from public.categories where user_id = 'c58f5f21-920f-43a1-8f1b-9e28937cf103' and id = 'study';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c58f5f21-920f-43a1-8f1b-9e28937cf101', true);
select set_config('request.jwt.claims', '{"sub":"c58f5f21-920f-43a1-8f1b-9e28937cf101","role":"authenticated"}', true);

select pg_temp.expect_error('update public.profiles set onboarding_completed = true', '42501', 'browser cannot skip onboarding by changing the marker');
select pg_temp.expect_error($q$select public.complete_onboarding('x', 100, '{"food":10,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'short name rejected');
select pg_temp.expect_error($q$select public.complete_onboarding(repeat('x', 61), 100, '{"food":10,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'long name rejected');
select pg_temp.expect_error($q$select public.complete_onboarding(E'\t \n', 100, '{"food":10,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'whitespace-only name rejected');
select pg_temp.expect_error($q$select public.complete_onboarding(null, 100, '{"food":10,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'null name rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 0, '{"food":0,"transport":0,"study":0,"leisure":0,"other":0}')$q$, '23514', 'zero budget rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', -1, '{"food":0,"transport":0,"study":0,"leisure":0,"other":0}')$q$, '23514', 'negative budget rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 1000000000001, '{"food":0,"transport":0,"study":0,"leisure":0,"other":0}')$q$, '23514', 'oversized budget rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100.001, '{"food":10,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'budget precision rejected without rounding');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 'NaN'::numeric, '{"food":0,"transport":0,"study":0,"leisure":0,"other":0}')$q$, '23514', 'NaN budget rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 'Infinity'::numeric, '{"food":0,"transport":0,"study":0,"leisure":0,"other":0}')$q$, '23514', 'infinite budget rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', null, '{"food":0,"transport":0,"study":0,"leisure":0,"other":0}')$q$, '23514', 'null budget rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, null)$q$, '23514', 'null category object rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '[]')$q$, '23514', 'category array rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":10}')$q$, '23514', 'missing categories rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":10,"transport":10,"study":10,"leisure":10,"other":10,"extra":0}')$q$, '23514', 'extra category rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":10,"transport":10,"study":10,"leisure":10,"unknown":0}')$q$, '23514', 'unknown category rejected even with five entries');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":-1,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'negative category limit rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 1000000000000, '{"food":1000000000001,"transport":0,"study":0,"leisure":0,"other":0}')$q$, '23514', 'oversized category limit rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":1.001,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'category precision rejected without rounding');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":"1","transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'numeric-string category rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":null,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'null category amount rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":true,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'boolean category amount rejected');
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 49.99, '{"food":10,"transport":10,"study":10,"leisure":10,"other":10}')$q$, '23514', 'overallocated category limits rejected');
select pg_temp.assert_true((select not onboarding_completed and display_name = 'Before' and monthly_budget = 120000 from public.profiles), 'failed setups leave profile unchanged');
select pg_temp.assert_true((select sum(monthly_limit) = 120000 from public.categories), 'failed setups leave all category limits unchanged');

select public.complete_onboarding('  Sam  ', 0.30, '{"food":0.10,"transport":0.20,"study":0,"leisure":0,"other":0}');
select pg_temp.assert_true((select onboarding_completed and display_name = 'Sam' and monthly_budget = 0.30 from public.profiles), 'valid setup atomically completes and trims the name');
select pg_temp.assert_true((select count(*) = 5 and sum(monthly_limit) = 0.30 from public.categories), 'all five limits persist with exact decimal total');
select pg_temp.assert_true((select monthly_limit = 0.10 from public.categories where id = 'food'), 'food limit persists');
select pg_temp.assert_true((select monthly_limit = 0.20 from public.categories where id = 'transport'), 'transport limit persists');
select pg_temp.assert_true((select bool_and(monthly_limit = 0) from public.categories where id in ('study', 'leisure', 'other')), 'zero category limits are allowed');

update public.profiles set monthly_budget = 999 where id = 'c58f5f21-920f-43a1-8f1b-9e28937cf101';
update public.categories set monthly_limit = 500 where id = 'food';
select public.complete_onboarding('Changed', 1000, '{"food":1,"transport":1,"study":1,"leisure":1,"other":1}');
select pg_temp.assert_true((select display_name = 'Sam' and monthly_budget = 999 and onboarding_completed from public.profiles), 'idempotent retry preserves later profile changes');
select pg_temp.assert_true((select monthly_limit = 500 from public.categories where id = 'food'), 'idempotent retry preserves later category changes');
select public.complete_onboarding(null, null, null);
select pg_temp.assert_true((select monthly_budget = 999 from public.profiles), 'completed account returns safely before validating an obsolete request');
select pg_temp.expect_error('update public.profiles set onboarding_completed = false', '42501', 'browser cannot reset completion to rerun setup');

select set_config('request.jwt.claim.sub', 'c58f5f21-920f-43a1-8f1b-9e28937cf102', true);
select set_config('request.jwt.claims', '{"sub":"c58f5f21-920f-43a1-8f1b-9e28937cf102","role":"authenticated"}', true);
select pg_temp.assert_true((select not onboarding_completed and display_name = 'Other user' and monthly_budget = 120000 from public.profiles), 'A setup cannot modify B profile or completion');
select pg_temp.assert_true((select sum(monthly_limit) = 120000 from public.categories), 'A setup cannot modify B category limits');
select public.complete_onboarding('Other user', 100, '{"food":1,"transport":1,"study":1,"leisure":1,"other":1}');
select pg_temp.assert_true((select onboarding_completed and monthly_budget = 100 from public.profiles), 'B can finish independently with unallocated budget');

select set_config('request.jwt.claim.sub', 'c58f5f21-920f-43a1-8f1b-9e28937cf103', true);
select set_config('request.jwt.claims', '{"sub":"c58f5f21-920f-43a1-8f1b-9e28937cf103","role":"authenticated"}', true);
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":1,"transport":1,"study":1,"leisure":1,"other":1}')$q$, '23514', 'incomplete server categories prevent completion');
select pg_temp.assert_true((select not onboarding_completed and display_name = 'Incomplete' and monthly_budget = 120000 from public.profiles), 'partial update rollback preserves profile and incomplete marker');
select pg_temp.assert_true((select sum(monthly_limit) = 105000 from public.categories), 'partial update rollback preserves all existing category limits');

select set_config('request.jwt.claim.sub', 'c58f5f21-920f-43a1-8f1b-9e28937cf199', true);
select set_config('request.jwt.claims', '{"sub":"c58f5f21-920f-43a1-8f1b-9e28937cf199","role":"authenticated"}', true);
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":1,"transport":1,"study":1,"leisure":1,"other":1}')$q$, '42501', 'signed-in identity without a profile cannot complete setup');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":1,"transport":1,"study":1,"leisure":1,"other":1}')$q$, '42501', 'missing identity is rejected even under authenticated role');

reset role;
set local role anon;
select pg_temp.expect_error($q$select public.complete_onboarding('Sam', 100, '{"food":1,"transport":1,"study":1,"leisure":1,"other":1}')$q$, '42501', 'anonymous client cannot execute onboarding');
reset role;
rollback;
