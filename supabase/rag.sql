
alter table public.knowledge_sources
 add column if not exists ingestion_token uuid,
 add column if not exists ingestion_started_at timestamptz,
 add column if not exists ingestion_error text,
 add column if not exists chunk_count integer not null default 0;

-- Source edits invalidate in-flight work and previously indexed content.
create or replace function public.invalidate_knowledge_ingestion()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='INSERT' or new.raw_text is distinct from old.raw_text
   or new.organization_id is distinct from old.organization_id
   or new.assistant_id is distinct from old.assistant_id then
   new.status := 'pending';
   new.ingestion_token := null;
   new.ingestion_started_at := null;
   new.ingestion_error := null;
   new.chunk_count := 0;
 end if;
 new.updated_at := now();
 return new;
end $$;
create trigger knowledge_source_invalidate before insert or update on public.knowledge_sources
 for each row execute function public.invalidate_knowledge_ingestion();

create or replace function public.claim_knowledge_ingestion(p_source_id uuid,p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare s public.knowledge_sources; t uuid := gen_random_uuid();
begin
 select * into s from public.knowledge_sources where id=p_source_id for update;
 if not found then raise exception 'Source not found'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and role='admin')
 and not exists(select 1 from public.organization_members where user_id=p_user_id
 and organization_id=s.organization_id and role::text in ('owner','admin','manager')) then
   raise exception 'Forbidden' using errcode='42501';
 end if;
 if s.assistant_id is not null and not exists(select 1 from public.assistants
   where id=s.assistant_id and organization_id=s.organization_id) then
   raise exception 'Assistant organization mismatch';
 end if;
 if s.status='processing' and s.ingestion_started_at>now()-interval '3 minutes' then
   return jsonb_build_object('busy',true);
 end if;
 update public.knowledge_sources set status='processing',ingestion_token=t,
 ingestion_started_at=now(),ingestion_error=null where id=s.id;
 return jsonb_build_object('id',s.id,'organization_id',s.organization_id,
 'assistant_id',s.assistant_id,'raw_text',s.raw_text,'token',t);
end $$;

create or replace function public.finish_knowledge_ingestion(p_source_id uuid,p_token uuid,p_chunks jsonb,p_error text default null)
returns boolean language plpgsql security invoker set search_path=public as $$
declare s public.knowledge_sources; c jsonb; i integer:=0;
begin
 select * into s from public.knowledge_sources where id=p_source_id for update;
 if not found or s.ingestion_token is distinct from p_token or s.status<>'processing' then return false; end if;
 if p_error is not null then
   update public.knowledge_sources set status='failed',ingestion_error=left(p_error,300),
    ingestion_token=null where id=s.id;
   return true;
 end if;
 if jsonb_typeof(p_chunks) is distinct from 'array' or jsonb_array_length(p_chunks) not between 1 and 128 then
   raise exception 'Invalid chunk batch';
 end if;
 if s.assistant_id is not null and not exists(select 1 from public.assistants
   where id=s.assistant_id and organization_id=s.organization_id) then raise exception 'Assistant organization mismatch'; end if;
 delete from public.knowledge_chunks where source_id=s.id;
 for c in select value from jsonb_array_elements(p_chunks) loop
   if length(btrim(c->>'content')) is null or length(btrim(c->>'content'))=0
    or length(c->>'content')>2400 or jsonb_array_length(c->'embedding')<>1536 then raise exception 'Invalid chunk'; end if;
   insert into public.knowledge_chunks(organization_id,assistant_id,source_id,chunk_index,content,token_estimate,embedding)
   values(s.organization_id,s.assistant_id,s.id,i,c->>'content',ceil(length(c->>'content')/4.0),(c->'embedding')::text::vector(1536));
   i:=i+1;
 end loop;
 update public.knowledge_sources set status='ready',chunk_count=i,ingestion_error=null,ingestion_token=null where id=s.id;
 return true;
end $$;

create or replace function public.match_knowledge_service(query_embedding vector,match_organization_id uuid,
 match_assistant_id uuid default null,match_count integer default 6,similarity_threshold double precision default 0.2)
returns table(id uuid,content text,source_name text,similarity double precision)
language sql stable security invoker set search_path=public as $$
 select kc.id,kc.content,coalesce(ks.name,'Knowledge Source'),1-(kc.embedding<=>query_embedding)
 from public.knowledge_chunks kc join public.knowledge_sources ks on ks.id=kc.source_id
 where match_organization_id is not null and match_assistant_id is not null
 and vector_dims(query_embedding)=1536
 and exists(select 1 from public.assistants a where a.id=match_assistant_id and a.organization_id=match_organization_id)
 and kc.organization_id=match_organization_id and ks.organization_id=match_organization_id
 and kc.assistant_id is not distinct from ks.assistant_id
 and (ks.assistant_id is null or ks.assistant_id=match_assistant_id)
 and ks.status='ready' and 1-(kc.embedding<=>query_embedding)>=greatest(coalesce(similarity_threshold,0.2),0)
 order by kc.embedding<=>query_embedding limit least(greatest(coalesce(match_count,6),1),12);
$$;
revoke all on function public.claim_knowledge_ingestion(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_knowledge_ingestion(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.match_knowledge_service(vector,uuid,uuid,integer,double precision) from public,anon,authenticated;
revoke all on function public.invalidate_knowledge_ingestion() from public,anon,authenticated;
grant execute on function public.claim_knowledge_ingestion(uuid,uuid) to service_role;
grant execute on function public.finish_knowledge_ingestion(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.match_knowledge_service(vector,uuid,uuid,integer,double precision) to service_role;
-- Browser users must not forge embeddings or processing/ready metadata.
revoke insert,update,delete on public.knowledge_chunks from anon,authenticated;
revoke insert,update on public.knowledge_sources from anon,authenticated;
grant insert(organization_id,assistant_id,name,source_type,source_url,raw_text) on public.knowledge_sources to authenticated;
grant update(assistant_id,name,source_type,source_url,raw_text) on public.knowledge_sources to authenticated;
