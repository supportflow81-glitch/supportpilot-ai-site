
alter table public.conversations add column if not exists widget_token_hash text;
create unique index if not exists conversations_widget_session_idx on public.conversations(assistant_id,widget_token_hash) where widget_token_hash is not null;
alter table public.messages add column if not exists client_request_id uuid;
create unique index if not exists messages_widget_request_idx on public.messages(conversation_id,sender_type,client_request_id) where client_request_id is not null;

create or replace function public.widget_agent_takeover() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if new.sender_type='agent' then
  update public.conversations set ai_enabled=false,status='handoff',updated_at=now()
   where id=new.conversation_id and organization_id=new.organization_id;
  if not found then raise exception 'Conversation unavailable'; end if;
 end if;
 return new;
end $$;
create trigger widget_agent_takeover before insert on public.messages
for each row execute function public.widget_agent_takeover();
revoke all on function public.widget_agent_takeover() from public,anon,authenticated;

create or replace function public.widget_complete_reply(p_conversation_id uuid,p_organization_id uuid,p_assistant_id uuid,p_request_id uuid,p_content text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare enabled boolean;
begin
 select ai_enabled into enabled from public.conversations where id=p_conversation_id
 and organization_id=p_organization_id and assistant_id=p_assistant_id for update;
 if not found or not enabled then return false; end if;
 insert into public.messages(organization_id,conversation_id,sender_type,content,client_request_id)
 values(p_organization_id,p_conversation_id,'assistant',left(p_content,4000),p_request_id)
 on conflict(conversation_id,sender_type,client_request_id) where client_request_id is not null do nothing;
 return true;
end $$;
revoke all on function public.widget_complete_reply(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.widget_complete_reply(uuid,uuid,uuid,uuid,text) to service_role;
