begin;
do $test$
declare u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); o uuid; other_o uuid; a uuid; c uuid; invitation uuid; n integer;
begin
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(u,'authenticated','authenticated','audit-'||u||'@example.invalid',now(),'{"provider":"email","providers":["email"]}','{"full_name":"TEMP Audit Member"}',now(),now()),
 (outsider,'authenticated','authenticated','audit-'||outsider||'@example.invalid',now(),'{"provider":"email","providers":["email"]}','{"full_name":"TEMP Audit Outsider"}',now(),now());
 insert into public.organizations(name,slug) values('TEMP Audit A','audit-'||gen_random_uuid()) returning id into o;
 insert into public.organizations(name,slug) values('TEMP Audit B','audit-'||gen_random_uuid()) returning id into other_o;
 insert into public.organization_members(organization_id,user_id,role) values(o,u,'owner');
 insert into public.assistants(organization_id,name,status) values(o,'TEMP Audit Assistant','paused') returning id into a;
 insert into public.conversations(organization_id,assistant_id,status) values(o,a,'open') returning id into c;
 insert into public.team_invitations(organization_id,email,role,invited_by,invited_user_id,status)
 values(o,'audit-'||outsider||'@example.invalid','member',u,outsider,'pending') returning id into invitation;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if not public.is_org_member(o) or public.is_org_member(other_o) or not public.can_manage_org(o) or public.is_platform_admin() then raise exception 'Member authorization regression'; end if;
 if public.current_org_role(o)<>'owner' or not public.has_org_role(o,array['owner']) then raise exception 'Role helper regression'; end if;
 select count(*) into n from public.organizations where id in(o,other_o);
 if n<>1 then raise exception 'Organization isolation regression'; end if;
 insert into public.messages(organization_id,conversation_id,sender_type,content) values(o,c,'visitor','TEMP scoped message');
 begin
  insert into public.messages(organization_id,conversation_id,sender_type,content) values(other_o,c,'visitor','TEMP mismatch');
  raise exception 'Cross-organization insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.profiles set role='admin' where id=u;
  raise exception 'Privilege escalation allowed';
 exception when others then if sqlerrm='Privilege escalation allowed' then raise; end if; end;
 if public.is_platform_admin() then raise exception 'Escalation succeeded'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','email','audit-'||outsider||'@example.invalid')::text,true);
 select count(*) into n from public.messages where conversation_id=c;
 if n<>0 then raise exception 'Outsider read allowed'; end if;
 update public.team_invitations set role='admin' where id=invitation;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Invitee rewrote role'; end if;
 begin
  perform * from servelink_private.request_buckets;
  raise exception 'Browser can read counters';
 exception when insufficient_privilege then null; end;
 begin
  perform public.consume_launch_limit(o,'message','test');
  raise exception 'Browser can reserve requests';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $test$;
rollback;
select 'PASS: member/outsider isolation, role helpers, message ownership, role escalation denial, invitation update denial, private counter/RPC denial; fixtures rolled back' as result;