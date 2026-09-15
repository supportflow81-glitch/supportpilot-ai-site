-- Atomic limits shared by every Edge Function instance. No browser access.
create schema if not exists servelink_private;
revoke all on schema servelink_private from public, anon, authenticated;
grant usage on schema servelink_private to service_role;
create table servelink_private.request_buckets (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null,
  subject text not null,
  window_seconds integer not null,
  window_start bigint not null,
  requests integer not null check(requests > 0),
  expires_at timestamptz not null,
  primary key(organization_id,action,subject,window_seconds)
);
alter table servelink_private.request_buckets enable row level security;
revoke all on servelink_private.request_buckets from public,anon,authenticated;
grant select,insert,update,delete on servelink_private.request_buckets to service_role;
create index request_buckets_expiry on servelink_private.request_buckets(expires_at);

create function public.consume_launch_limit(p_organization_id uuid,p_action text,p_subject text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare epoch bigint:=floor(extract(epoch from clock_timestamp()));
  spec record; bucket bigint; used integer; retry integer:=0;
begin
  if p_action not in ('config','history','message','ingest') or p_subject is null or length(p_subject)>64 then
    raise exception 'Invalid limit scope';
  end if;
  -- Serialize this organization's reservations, including concurrent instances.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,731));
  delete from servelink_private.request_buckets where ctid in
    (select ctid from servelink_private.request_buckets where expires_at<now() limit 100);
  for spec in select * from (values
    ('',60,case p_action when 'config' then 300 when 'history' then 1200 when 'message' then 60 else 10 end),
    ('',86400,case p_action when 'config' then 20000 when 'history' then 100000 when 'message' then 1000 else 100 end),
    (p_subject,60,case p_action when 'config' then 300 when 'history' then 30 when 'message' then 10 else 3 end)
  ) as limits(subject,seconds,maximum) loop
    bucket:=epoch/spec.seconds;
    select requests into used from servelink_private.request_buckets
      where organization_id=p_organization_id and action=p_action and subject=spec.subject
      and window_seconds=spec.seconds and window_start=bucket;
    if coalesce(used,0)>=spec.maximum then retry:=greatest(retry,((bucket+1)*spec.seconds-epoch)::integer); end if;
  end loop;
  if retry>0 then return jsonb_build_object('allowed',false,'retry_after',retry); end if;
  for spec in select * from (values ('',60),('',86400),(p_subject,60)) as limits(subject,seconds) loop
    bucket:=epoch/spec.seconds;
    insert into servelink_private.request_buckets as b values
      (p_organization_id,p_action,spec.subject,spec.seconds,bucket,1,to_timestamp((bucket+1)*spec.seconds))
    on conflict(organization_id,action,subject,window_seconds) do update
      set requests=case when b.window_start=excluded.window_start then b.requests+1 else 1 end,
      window_start=excluded.window_start,expires_at=excluded.expires_at;
  end loop;
  return jsonb_build_object('allowed',true,'retry_after',0);
end $$;
revoke all on function public.consume_launch_limit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.consume_launch_limit(uuid,text,text) to service_role;

-- Retrieval now exclusively uses the scoped, ready-source service RPC.
revoke execute on function public.match_knowledge(public.vector,uuid,uuid,integer,double precision) from public,anon,authenticated;
-- Trigger functions do not need callable API grants.
revoke execute on function public.accept_pending_team_invitation() from public,anon,authenticated;

-- Both existing permissive message policies must also satisfy tenant consistency.
create policy messages_consistent_conversation on public.messages as restrictive
for all to authenticated
using (exists(select 1 from public.conversations c where c.id=conversation_id and c.organization_id=messages.organization_id))
with check (exists(select 1 from public.conversations c where c.id=conversation_id and c.organization_id=messages.organization_id));
-- Invitees cannot rewrite the organization or role on their own invitation.
alter policy team_invitations_update on public.team_invitations to authenticated
using (public.can_manage_org(organization_id)) with check(public.can_manage_org(organization_id));

