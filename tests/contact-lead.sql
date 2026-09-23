begin;
do $$ declare first_id uuid; second_id uuid; request uuid:=gen_random_uuid(); begin
 first_id:=public.capture_contact_lead('8378fb15-bfb3-4638-a247-44f0930cde41',request,'TEMP Contact Atomic','contact-test@example.invalid','TEMP Example','Answer customer questions');
 second_id:=public.capture_contact_lead('8378fb15-bfb3-4638-a247-44f0930cde41',request,'TEMP Contact Atomic','contact-test@example.invalid','TEMP Example','Answer customer questions');
 if first_id<>second_id then raise exception 'Duplicate lead'; end if;
 if not exists(select 1 from public.leads l join public.conversations c on c.id=l.conversation_id where l.id=first_id and c.ai_enabled=false and c.status='handoff' and l.notes like '%TEMP Example%') then raise exception 'Incomplete capture'; end if;
 if has_function_privilege('anon','public.capture_contact_lead(uuid,uuid,text,text,text,text)','EXECUTE') or has_function_privilege('authenticated','public.capture_contact_lead(uuid,uuid,text,text,text,text)','EXECUTE') then raise exception 'Public RPC access'; end if;
 end $$;
rollback;
select 'PASS: atomic contact capture, idempotent retry, human handoff and private RPC; data rolled back' as result;