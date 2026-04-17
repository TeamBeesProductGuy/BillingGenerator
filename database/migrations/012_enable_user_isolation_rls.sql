-- User-level isolation for Supabase Auth backed access
-- Run this in the Supabase SQL editor before deploying the hardened app.

create extension if not exists pgcrypto;

alter table public.clients add column if not exists owner_user_id uuid;
alter table public.permanent_clients add column if not exists owner_user_id uuid;
alter table public.permanent_client_contacts add column if not exists owner_user_id uuid;
alter table public.permanent_orders add column if not exists owner_user_id uuid;
alter table public.permanent_reminders add column if not exists owner_user_id uuid;
alter table public.sow_document_index add column if not exists owner_user_id uuid;
alter table public.rate_cards add column if not exists owner_user_id uuid;
alter table public.attendance add column if not exists owner_user_id uuid;
alter table public.billing_runs add column if not exists owner_user_id uuid;
alter table public.billing_items add column if not exists owner_user_id uuid;
alter table public.billing_errors add column if not exists owner_user_id uuid;
alter table public.quotes add column if not exists owner_user_id uuid;
alter table public.quote_items add column if not exists owner_user_id uuid;
alter table public.sows add column if not exists owner_user_id uuid;
alter table public.sow_items add column if not exists owner_user_id uuid;
alter table public.purchase_orders add column if not exists owner_user_id uuid;
alter table public.po_consumption_log add column if not exists owner_user_id uuid;
alter table public.employee_po_history add column if not exists owner_user_id uuid;
alter table public.audit_log add column if not exists owner_user_id uuid;

alter table public.clients alter column owner_user_id set default auth.uid();
alter table public.permanent_clients alter column owner_user_id set default auth.uid();
alter table public.permanent_client_contacts alter column owner_user_id set default auth.uid();
alter table public.permanent_orders alter column owner_user_id set default auth.uid();
alter table public.permanent_reminders alter column owner_user_id set default auth.uid();
alter table public.sow_document_index alter column owner_user_id set default auth.uid();
alter table public.rate_cards alter column owner_user_id set default auth.uid();
alter table public.attendance alter column owner_user_id set default auth.uid();
alter table public.billing_runs alter column owner_user_id set default auth.uid();
alter table public.billing_items alter column owner_user_id set default auth.uid();
alter table public.billing_errors alter column owner_user_id set default auth.uid();
alter table public.quotes alter column owner_user_id set default auth.uid();
alter table public.quote_items alter column owner_user_id set default auth.uid();
alter table public.sows alter column owner_user_id set default auth.uid();
alter table public.sow_items alter column owner_user_id set default auth.uid();
alter table public.purchase_orders alter column owner_user_id set default auth.uid();
alter table public.po_consumption_log alter column owner_user_id set default auth.uid();
alter table public.employee_po_history alter column owner_user_id set default auth.uid();
alter table public.audit_log alter column owner_user_id set default auth.uid();

do $$
declare
  default_owner uuid;
  auth_user_count integer;
begin
  select count(*) into auth_user_count from auth.users;

  if auth_user_count = 0 then
    raise exception 'Create the first Supabase auth user before running migration 012.';
  end if;

  if auth_user_count > 1 then
    raise exception 'Migration 012 found multiple Supabase users. Backfill owner_user_id explicitly for existing data before enabling RLS.';
  end if;

  select id into default_owner
  from auth.users
  order by created_at
  limit 1;

  update public.clients
  set owner_user_id = coalesce(owner_user_id, default_owner);

  update public.permanent_clients
  set owner_user_id = coalesce(owner_user_id, default_owner);

  update public.permanent_client_contacts c
  set owner_user_id = coalesce(
    c.owner_user_id,
    (select pc.owner_user_id from public.permanent_clients pc where pc.id = c.client_id),
    default_owner
  );

  update public.permanent_orders o
  set owner_user_id = coalesce(
    o.owner_user_id,
    (select pc.owner_user_id from public.permanent_clients pc where pc.id = o.client_id),
    default_owner
  );

  update public.permanent_reminders r
  set owner_user_id = coalesce(
    r.owner_user_id,
    (select o.owner_user_id from public.permanent_orders o where o.id = r.order_id),
    default_owner
  );

  update public.sow_document_index sdi
  set owner_user_id = coalesce(
    sdi.owner_user_id,
    (select q.owner_user_id from public.quotes q where q.id = sdi.quote_id),
    (select c.owner_user_id from public.clients c where c.id = sdi.client_id),
    default_owner
  );

  update public.rate_cards rc
  set owner_user_id = coalesce(
    rc.owner_user_id,
    (select c.owner_user_id from public.clients c where c.id = rc.client_id),
    default_owner
  );

  update public.attendance
  set owner_user_id = coalesce(owner_user_id, default_owner);

  update public.billing_runs br
  set owner_user_id = coalesce(
    br.owner_user_id,
    (select c.owner_user_id from public.clients c where c.id = br.client_id),
    default_owner
  );

  update public.billing_items bi
  set owner_user_id = coalesce(
    bi.owner_user_id,
    (select br.owner_user_id from public.billing_runs br where br.id = bi.billing_run_id),
    default_owner
  );

  update public.billing_errors be
  set owner_user_id = coalesce(
    be.owner_user_id,
    (select br.owner_user_id from public.billing_runs br where br.id = be.billing_run_id),
    default_owner
  );

  update public.quotes q
  set owner_user_id = coalesce(
    q.owner_user_id,
    (select c.owner_user_id from public.clients c where c.id = q.client_id),
    default_owner
  );

  update public.quote_items qi
  set owner_user_id = coalesce(
    qi.owner_user_id,
    (select q.owner_user_id from public.quotes q where q.id = qi.quote_id),
    default_owner
  );

  update public.sows s
  set owner_user_id = coalesce(
    s.owner_user_id,
    (select c.owner_user_id from public.clients c where c.id = s.client_id),
    (select q.owner_user_id from public.quotes q where q.id = s.quote_id),
    default_owner
  );

  update public.sow_items si
  set owner_user_id = coalesce(
    si.owner_user_id,
    (select s.owner_user_id from public.sows s where s.id = si.sow_id),
    default_owner
  );

  update public.purchase_orders po
  set owner_user_id = coalesce(
    po.owner_user_id,
    (select c.owner_user_id from public.clients c where c.id = po.client_id),
    (select s.owner_user_id from public.sows s where s.id = po.sow_id),
    (select q.owner_user_id from public.quotes q where q.id = po.quote_id),
    default_owner
  );

  update public.po_consumption_log pcl
  set owner_user_id = coalesce(
    pcl.owner_user_id,
    (select po.owner_user_id from public.purchase_orders po where po.id = pcl.po_id),
    (select br.owner_user_id from public.billing_runs br where br.id = pcl.billing_run_id),
    default_owner
  );

  update public.employee_po_history eph
  set owner_user_id = coalesce(
    eph.owner_user_id,
    (select rc.owner_user_id from public.rate_cards rc where rc.id = eph.rate_card_id),
    (select po.owner_user_id from public.purchase_orders po where po.id = eph.po_id),
    (select c.owner_user_id from public.clients c where c.id = eph.client_id),
    default_owner
  );

  update public.audit_log
  set owner_user_id = coalesce(owner_user_id, default_owner);
end $$;

alter table public.clients alter column owner_user_id set not null;
alter table public.permanent_clients alter column owner_user_id set not null;
alter table public.permanent_client_contacts alter column owner_user_id set not null;
alter table public.permanent_orders alter column owner_user_id set not null;
alter table public.permanent_reminders alter column owner_user_id set not null;
alter table public.sow_document_index alter column owner_user_id set not null;
alter table public.rate_cards alter column owner_user_id set not null;
alter table public.attendance alter column owner_user_id set not null;
alter table public.billing_runs alter column owner_user_id set not null;
alter table public.billing_items alter column owner_user_id set not null;
alter table public.billing_errors alter column owner_user_id set not null;
alter table public.quotes alter column owner_user_id set not null;
alter table public.quote_items alter column owner_user_id set not null;
alter table public.sows alter column owner_user_id set not null;
alter table public.sow_items alter column owner_user_id set not null;
alter table public.purchase_orders alter column owner_user_id set not null;
alter table public.po_consumption_log alter column owner_user_id set not null;
alter table public.employee_po_history alter column owner_user_id set not null;
alter table public.audit_log alter column owner_user_id set not null;

create index if not exists idx_clients_owner_user on public.clients(owner_user_id);
create index if not exists idx_permanent_clients_owner_user on public.permanent_clients(owner_user_id);
create index if not exists idx_permanent_client_contacts_owner_user on public.permanent_client_contacts(owner_user_id);
create index if not exists idx_permanent_orders_owner_user on public.permanent_orders(owner_user_id);
create index if not exists idx_permanent_reminders_owner_user on public.permanent_reminders(owner_user_id);
create index if not exists idx_sow_document_index_owner_user on public.sow_document_index(owner_user_id);
create index if not exists idx_rate_cards_owner_user on public.rate_cards(owner_user_id);
create index if not exists idx_attendance_owner_user on public.attendance(owner_user_id);
create index if not exists idx_billing_runs_owner_user on public.billing_runs(owner_user_id);
create index if not exists idx_billing_items_owner_user on public.billing_items(owner_user_id);
create index if not exists idx_billing_errors_owner_user on public.billing_errors(owner_user_id);
create index if not exists idx_quotes_owner_user on public.quotes(owner_user_id);
create index if not exists idx_quote_items_owner_user on public.quote_items(owner_user_id);
create index if not exists idx_sows_owner_user on public.sows(owner_user_id);
create index if not exists idx_sow_items_owner_user on public.sow_items(owner_user_id);
create index if not exists idx_purchase_orders_owner_user on public.purchase_orders(owner_user_id);
create index if not exists idx_po_consumption_log_owner_user on public.po_consumption_log(owner_user_id);
create index if not exists idx_employee_po_history_owner_user on public.employee_po_history(owner_user_id);
create index if not exists idx_audit_log_owner_user on public.audit_log(owner_user_id);

create or replace view public.rate_cards_view
with (security_invoker = true) as
select rc.*, c.client_name, po.po_number
from public.rate_cards rc
join public.clients c on rc.client_id = c.id
left join public.purchase_orders po on rc.po_id = po.id;

create or replace view public.quotes_view
with (security_invoker = true) as
select q.*, c.client_name
from public.quotes q
join public.clients c on q.client_id = c.id;

create or replace view public.sows_view
with (security_invoker = true) as
select s.*, c.client_name
from public.sows s
join public.clients c on s.client_id = c.id;

create or replace view public.purchase_orders_view
with (security_invoker = true) as
select po.*, c.client_name, sw.sow_number,
  case when po.po_value > 0 then round((po.consumed_value / po.po_value) * 100, 2) else 0 end as consumption_pct,
  round(po.po_value - po.consumed_value, 2) as remaining_value,
  (select count(*) from public.rate_cards rc where rc.po_id = po.id and rc.is_active = true) as linked_employees
from public.purchase_orders po
join public.clients c on po.client_id = c.id
left join public.sows sw on po.sow_id = sw.id;

grant select on public.rate_cards_view to authenticated;
grant select on public.quotes_view to authenticated;
grant select on public.sows_view to authenticated;
grant select on public.purchase_orders_view to authenticated;

create or replace function public.is_owner(owner_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and owner_id = auth.uid();
$$;

create or replace function public.apply_owner_rls(table_name text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', table_name);
  execute format('alter table public.%I force row level security', table_name);
  execute format('drop policy if exists %I_owner_select on public.%I', table_name, table_name);
  execute format('drop policy if exists %I_owner_insert on public.%I', table_name, table_name);
  execute format('drop policy if exists %I_owner_update on public.%I', table_name, table_name);
  execute format('drop policy if exists %I_owner_delete on public.%I', table_name, table_name);
  execute format(
    'create policy %I_owner_select on public.%I for select to authenticated using (public.is_owner(owner_user_id))',
    table_name,
    table_name
  );
  execute format(
    'create policy %I_owner_insert on public.%I for insert to authenticated with check (public.is_owner(owner_user_id))',
    table_name,
    table_name
  );
  execute format(
    'create policy %I_owner_update on public.%I for update to authenticated using (public.is_owner(owner_user_id)) with check (public.is_owner(owner_user_id))',
    table_name,
    table_name
  );
  execute format(
    'create policy %I_owner_delete on public.%I for delete to authenticated using (public.is_owner(owner_user_id))',
    table_name,
    table_name
  );
end;
$$;

select public.apply_owner_rls('clients');
select public.apply_owner_rls('permanent_clients');
select public.apply_owner_rls('permanent_client_contacts');
select public.apply_owner_rls('permanent_orders');
select public.apply_owner_rls('permanent_reminders');
select public.apply_owner_rls('sow_document_index');
select public.apply_owner_rls('rate_cards');
select public.apply_owner_rls('attendance');
select public.apply_owner_rls('billing_runs');
select public.apply_owner_rls('billing_items');
select public.apply_owner_rls('billing_errors');
select public.apply_owner_rls('quotes');
select public.apply_owner_rls('quote_items');
select public.apply_owner_rls('sows');
select public.apply_owner_rls('sow_items');
select public.apply_owner_rls('purchase_orders');
select public.apply_owner_rls('po_consumption_log');
select public.apply_owner_rls('employee_po_history');
select public.apply_owner_rls('audit_log');

drop function if exists public.apply_owner_rls(text);
