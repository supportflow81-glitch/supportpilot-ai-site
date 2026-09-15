-- Preserve authorization semantics while keeping privileged implementations private.
set lock_timeout='5s';
grant usage on schema servelink_private to authenticated;
CREATE OR REPLACE FUNCTION servelink_private.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$function$
;
revoke all on function servelink_private.is_platform_admin() from public,anon;
grant execute on function servelink_private.is_platform_admin() to authenticated,service_role;
CREATE OR REPLACE FUNCTION servelink_private.is_org_member(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$function$
;
revoke all on function servelink_private.is_org_member(uuid) from public,anon;
grant execute on function servelink_private.is_org_member(uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION servelink_private.has_org_role(org_id uuid, allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role::text = any(allowed_roles)
  );
$function$
;
revoke all on function servelink_private.has_org_role(uuid,text[]) from public,anon;
grant execute on function servelink_private.has_org_role(uuid,text[]) to authenticated,service_role;
CREATE OR REPLACE FUNCTION servelink_private.shares_org_with(other_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user_id
  );
$function$
;
revoke all on function servelink_private.shares_org_with(uuid) from public,anon;
grant execute on function servelink_private.shares_org_with(uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION servelink_private.current_org_role(org_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select om.role::text
  from public.organization_members om
  where om.organization_id = org_id
    and om.user_id = auth.uid()
  limit 1;
$function$
;
revoke all on function servelink_private.current_org_role(uuid) from public,anon;
grant execute on function servelink_private.current_org_role(uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION servelink_private.can_manage_org(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select servelink_private.is_platform_admin()
      or coalesce(servelink_private.current_org_role(org_id) in ('owner','admin'), false);
$function$
;
revoke all on function servelink_private.can_manage_org(uuid) from public,anon;
grant execute on function servelink_private.can_manage_org(uuid) to authenticated,service_role;
create or replace function public.is_platform_admin() returns boolean language sql stable security invoker set search_path='' as $$ select servelink_private.is_platform_admin(); $$;
revoke all on function public.is_platform_admin() from public,anon;
grant execute on function public.is_platform_admin() to authenticated,service_role;
create or replace function public.is_org_member(org_id uuid) returns boolean language sql stable security invoker set search_path='' as $$ select servelink_private.is_org_member(org_id); $$;
revoke all on function public.is_org_member(uuid) from public,anon;
grant execute on function public.is_org_member(uuid) to authenticated,service_role;
create or replace function public.has_org_role(org_id uuid, allowed_roles text[]) returns boolean language sql stable security invoker set search_path='' as $$ select servelink_private.has_org_role(org_id,allowed_roles); $$;
revoke all on function public.has_org_role(uuid,text[]) from public,anon;
grant execute on function public.has_org_role(uuid,text[]) to authenticated,service_role;
create or replace function public.shares_org_with(other_user_id uuid) returns boolean language sql stable security invoker set search_path='' as $$ select servelink_private.shares_org_with(other_user_id); $$;
revoke all on function public.shares_org_with(uuid) from public,anon;
grant execute on function public.shares_org_with(uuid) to authenticated,service_role;
create or replace function public.current_org_role(org_id uuid) returns text language sql stable security invoker set search_path='' as $$ select servelink_private.current_org_role(org_id); $$;
revoke all on function public.current_org_role(uuid) from public,anon;
grant execute on function public.current_org_role(uuid) to authenticated,service_role;
create or replace function public.can_manage_org(org_id uuid) returns boolean language sql stable security invoker set search_path='' as $$ select servelink_private.can_manage_org(org_id); $$;
revoke all on function public.can_manage_org(uuid) from public,anon;
grant execute on function public.can_manage_org(uuid) to authenticated,service_role;

-- These policies are subsumed by the retained organization/member-or-admin rules.
drop policy "assistants_member" on public.assistants;
drop policy "conversations_member" on public.conversations;
drop policy "knowledge_sources_member" on public.knowledge_sources;
drop policy "leads_member" on public.leads;
drop policy "messages_member" on public.messages;
drop policy "knowledge_chunks_write" on public.knowledge_chunks;
alter policy "org access assistants" on public.assistants to authenticated;
alter policy "org access knowledge" on public.knowledge_sources to authenticated;
alter policy "org access conversations" on public.conversations to authenticated;
alter policy "org access leads" on public.leads to authenticated;
alter policy "org access messages" on public.messages to authenticated;
alter policy "crm_integrations_admin" on public.crm_integrations using ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = crm_integrations.organization_id) AND (om.user_id = (select auth.uid())) AND ((om.role)::text = ANY (ARRAY['owner'::text, 'admin'::text])))))) with check ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = crm_integrations.organization_id) AND (om.user_id = (select auth.uid())) AND ((om.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));
alter policy "profiles_read_access" on public.profiles using (((id = (select auth.uid())) OR is_platform_admin() OR shares_org_with(id)));
alter policy "profiles_update_self" on public.profiles using (((id = (select auth.uid())) OR is_platform_admin())) with check (((id = (select auth.uid())) OR is_platform_admin()));
alter policy "organizations_insert_authenticated" on public.organizations with check (((created_by = (select auth.uid())) OR is_platform_admin()));
alter policy "organization_members_delete_admin" on public.organization_members using ((is_platform_admin() OR (can_manage_org(organization_id) AND (NOT ((user_id = (select auth.uid())) AND ((role)::text = 'owner'::text))))));
alter policy "team_invitations_read" on public.team_invitations using ((can_manage_org(organization_id) OR (invited_user_id = (select auth.uid())) OR (lower(email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text)))));
alter policy "team_invitations_insert" on public.team_invitations with check ((can_manage_org(organization_id) AND ((invited_by = (select auth.uid())) OR is_platform_admin()) AND ((role)::text = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text]))));
revoke all on public.application_errors from public,anon,authenticated;
create policy service_backend_only on public.application_errors for all to service_role using(true) with check(true);
revoke all on public.billing_events from public,anon,authenticated;
create policy service_backend_only on public.billing_events for all to service_role using(true) with check(true);
revoke all on public.integration_deliveries from public,anon,authenticated;
create policy service_backend_only on public.integration_deliveries for all to service_role using(true) with check(true);
revoke all on servelink_private.request_buckets from public,anon,authenticated;
create policy service_backend_only on servelink_private.request_buckets for all to service_role using(true) with check(true);
create index assistants_created_by_fk_idx on public.assistants(created_by);
create index billing_events_organization_id_fk_idx on public.billing_events(organization_id);
create index conversations_assigned_to_fk_idx on public.conversations(assigned_to);
create index integration_deliveries_integration_id_fk_idx on public.integration_deliveries(integration_id);
create index knowledge_chunks_assistant_id_fk_idx on public.knowledge_chunks(assistant_id);
create index leads_conversation_id_fk_idx on public.leads(conversation_id);
create index messages_organization_id_fk_idx on public.messages(organization_id);
create index organizations_created_by_fk_idx on public.organizations(created_by);
create index team_invitations_invited_by_fk_idx on public.team_invitations(invited_by);
create index team_invitations_invited_user_id_fk_idx on public.team_invitations(invited_user_id);
drop index public.idx_assistants_org;
drop index public.idx_conversations_org;
drop index public.idx_knowledge_sources_org;
drop index public.idx_leads_org;
drop index public.idx_members_user;
-- Extension relocation preserves the column/index type OIDs and all stored embeddings.
alter extension vector set schema extensions;
alter function public.match_knowledge_service(extensions.vector,uuid,uuid,integer,double precision) set search_path=public,extensions;
alter function public.finish_knowledge_ingestion(uuid,uuid,jsonb,text) set search_path=public,extensions;
notify pgrst,'reload schema';
