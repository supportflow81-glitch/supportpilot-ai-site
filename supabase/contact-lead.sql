create function public.capture_contact_lead(p_assistant_id uuid,p_request_id uuid,p_name text,p_email text,p_company text,p_need text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.assistants; c uuid; lead_id uuid; token text:='contact:'||p_request_id::text; note text;
begin
 if p_request_id is null or p_name is null or length(btrim(p_name)) not between 1 and 200 or p_email is null or length(p_email) not between 3 and 320
 or p_company is null or length(btrim(p_company)) not between 1 and 200 or p_need is null or length(p_need) not between 1 and 200 then raise exception 'Invalid submission'; end if;
 select * into a from public.assistants where id=p_assistant_id;
 if not found or a.status::text not in ('active','live') then raise exception 'Contact unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text||token,917));
 select id into c from public.conversations where assistant_id=a.id and organization_id=a.organization_id and widget_token_hash=token;
 if c is not null then
  select id into lead_id from public.leads where conversation_id=c and organization_id=a.organization_id;
  if lead_id is null then raise exception 'Incomplete submission'; end if;
  return lead_id;
 end if;
 note:='Website contact form'||chr(10)||'Company: '||p_company||chr(10)||'Interested in: '||p_need;
 insert into public.conversations(organization_id,assistant_id,widget_token_hash,visitor_id,visitor_name,visitor_email,status,ai_enabled)
 values(a.organization_id,a.id,token,p_request_id::text,p_name,p_email,'handoff',false) returning id into c;
 insert into public.messages(organization_id,conversation_id,sender_type,content,client_request_id)
 values(a.organization_id,c,'visitor',note,p_request_id);
 insert into public.leads(organization_id,conversation_id,name,email,notes,status)
 values(a.organization_id,c,p_name,p_email,note,'new') returning id into lead_id;
 return lead_id;
end $$;
revoke all on function public.capture_contact_lead(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.capture_contact_lead(uuid,uuid,text,text,text,text) to service_role;
