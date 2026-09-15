begin;
do $$
declare o uuid; a uuid; other_a uuid; s uuid; u uuid; job jsonb; job2 jsonb; v jsonb:=to_jsonb(array_fill(0.01::float8,array[1536])); n int;
begin
 select id into u from public.profiles where role='admin' limit 1;
 if u is null then raise exception 'No admin test principal'; end if;
 insert into organizations(name,slug) values('TEMP Phase 3.2 transaction test','temp-rag-'||gen_random_uuid()) returning id into o;
 insert into assistants(organization_id,name) values(o,'TEMP RAG A') returning id into a;
 insert into assistants(organization_id,name) values(o,'TEMP RAG B') returning id into other_a;
 insert into knowledge_sources(organization_id,assistant_id,name,source_type,raw_text) values(o,a,'TEMP Phase 3.2 atomic test','text','Temporary content') returning id into s;
 job:=claim_knowledge_ingestion(s,u);
 if not (claim_knowledge_ingestion(s,u)->>'busy')::boolean then raise exception 'Duplicate claim allowed'; end if;
 if not finish_knowledge_ingestion(s,(job->>'token')::uuid,jsonb_build_array(jsonb_build_object('content','original','embedding',v))) then raise exception 'First finish failed'; end if;
 select count(*) into n from match_knowledge_service(v::text::extensions.vector,o,a,6,0);
 if n<>1 then raise exception 'Retrieval failed'; end if;
 select count(*) into n from match_knowledge_service(v::text::extensions.vector,o,other_a,6,0);
 if n<>0 then raise exception 'Cross assistant leak'; end if;
 select count(*) into n from match_knowledge_service(v::text::extensions.vector,gen_random_uuid(),a,6,0);
 if n<>0 then raise exception 'Cross tenant leak'; end if;
 select count(*) into n from match_knowledge_service(v::text::extensions.vector,o,null,6,0);
 if n<>0 then raise exception 'Null assistant leak'; end if;
 job:=claim_knowledge_ingestion(s,u);
 begin
  perform finish_knowledge_ingestion(s,(job->>'token')::uuid,jsonb_build_array(jsonb_build_object('content','bad','embedding','[1,2]'::jsonb)));
  raise exception 'Bad dimensions accepted';
 exception when others then
  if sqlerrm='Bad dimensions accepted' then raise; end if;
 end;
 if (select content from knowledge_chunks where source_id=s)<>'original' then raise exception 'Atomic rollback failed'; end if;
 update knowledge_sources set raw_text='Newer source version' where id=s;
 if finish_knowledge_ingestion(s,(job->>'token')::uuid,jsonb_build_array(jsonb_build_object('content','stale','embedding',v))) then raise exception 'Stale completion accepted'; end if;
 job2:=claim_knowledge_ingestion(s,u);
 perform finish_knowledge_ingestion(s,(job2->>'token')::uuid,jsonb_build_array(jsonb_build_object('content','new version','embedding',v)));
 if (select count(*) from knowledge_chunks where source_id=s)<>1 then raise exception 'Duplicate chunks'; end if;
 if (select content from knowledge_chunks where source_id=s)<>'new version' then raise exception 'Replacement failed'; end if;
 begin
  perform claim_knowledge_ingestion(s,gen_random_uuid());
  raise exception 'Unauthorized claim allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
select 'PASS: atomic rollback, replacement, stale job rejection, busy claim, tenant/assistant/null isolation, unauthorized claim; temporary data rolled back' as result;

