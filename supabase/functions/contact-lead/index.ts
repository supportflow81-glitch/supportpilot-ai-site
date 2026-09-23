import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
// Public website form: exact origin, active public installation key, validation and shared server-side limits.
const origin='https://supportflow81-glitch.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
const json=(data:unknown,status=200,retry=0)=>new Response(JSON.stringify(data),{status,headers:{...headers,...(retry?{'Retry-After':String(retry)}:{})}});
Deno.serve(async req=>{
 if(req.headers.get('origin')!==origin)return json({error:'This form is not available on this website.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const reader=req.body?.getReader();if(!reader)return json({error:'Submission required'},400);
  let bytes=0,raw='';const decoder=new TextDecoder();
  try{for(;;){const {value,done}=await reader.read();if(done){raw+=decoder.decode();break;}bytes+=value.byteLength;if(bytes>4096){await reader.cancel();return json({error:'Submission too large'},413);}raw+=decoder.decode(value,{stream:true});}}finally{reader.releaseLock();}
  let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid submission'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid submission'},400);
  const fields=['first_name','last_name','email','company','need','request_id','widget_key'];
  if(fields.some(k=>typeof body[k]!=='string'))return json({error:'Complete all required fields.'},400);
  for(const k of fields)body[k]=body[k].trim();
  const name=body.first_name+' '+body.last_name;
  if(!body.first_name||!body.last_name||name.length>200||!body.company||body.company.length>200||body.email.length>320||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)||
   !['Answer customer questions','Capture and qualify leads','Book appointments','Build a complete AI support system'].includes(body.need)||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id))return json({error:'Check your name, email, company, and selection.'},400);
  const {data:a,error:ae}=await db.from('assistants').select('id,organization_id,status,allowed_origins').eq('widget_key',body.widget_key).maybeSingle();
  if(ae||!a||!['active','live'].includes(a.status)||(!a.allowed_origins?.includes(origin)&&!a.allowed_origins?.includes('*')))return json({error:'Enquiries are temporarily unavailable. Please try again later.'},503);
  const {data:limit,error:le}=await db.rpc('consume_launch_limit',{p_organization_id:a.organization_id,p_action:'message',p_subject:body.request_id});
  if(le||typeof limit?.allowed!=='boolean')throw Error('Limit unavailable');
  if(!limit.allowed)return json({error:'Too many requests. Please try again later.',retry_after:limit.retry_after},429,limit.retry_after);
  const {data:id,error}=await db.rpc('capture_contact_lead',{p_assistant_id:a.id,p_request_id:body.request_id,p_name:name,p_email:body.email,p_company:body.company,p_need:body.need});
  if(error||!id)throw Error('Save failed');
  return json({received:true});
 }catch{console.error('contact-lead: submission failed');return json({error:'We could not confirm your submission. Please retry.'},503);}
});
