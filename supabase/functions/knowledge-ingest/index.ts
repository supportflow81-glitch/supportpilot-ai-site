import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { chunkText, embedTexts, boundedBody, launchLimit } from '../_shared/rag.mjs';
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers});
 if(req.method!=='POST') return json({error:'Method not allowed'},405);
 let source:any=null;
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 try {
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token) return json({error:'Sign in to process knowledge.'},401);
  const {data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth.user||auth.user.is_anonymous) return json({error:'Sign in to process knowledge.'},401);
  const raw=await boundedBody(req,4096);
  if(raw.length>4096) return json({error:'Request too large'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request'},400);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.source_id||''))return json({error:'Valid source_id required'},400);
  const claim=await db.rpc('claim_knowledge_ingestion',{p_source_id:body.source_id,p_user_id:auth.user.id});
  if(claim.error)return json({error:'Source unavailable or permission denied.'},403);
  source=claim.data;
  if(source.busy)return json({status:'processing'},202);
  const limit=await launchLimit(db,source.organization_id,'ingest',auth.user.id);
  if(!limit.allowed){
   await db.rpc('finish_knowledge_ingestion',{p_source_id:source.id,p_token:source.token,p_chunks:null,p_error:'Processing limit reached. Retry in '+limit.retry_after+' seconds.'});
   return new Response(JSON.stringify({status:'failed',error:'Processing limit reached. Retry later.',retry_after:limit.retry_after}),{status:429,headers:{...headers,'Retry-After':String(limit.retry_after)}});
  }
  let chunks;
  try{chunks=chunkText(source.raw_text)}catch(e){
   const message=(e as Error).message;
   const failed=await db.rpc('finish_knowledge_ingestion',{p_source_id:source.id,p_token:source.token,p_chunks:null,p_error:message});
   if(failed.error)throw new Error('Status update failed');
   return json({status:failed.data?'failed':'pending',error:message},422);
  }
  const embeddings=await embedTexts(chunks,Deno.env.get('OPENAI_API_KEY'));
  const result=await db.rpc('finish_knowledge_ingestion',{p_source_id:source.id,p_token:source.token,
   p_chunks:chunks.map((content:string,i:number)=>({content,embedding:embeddings[i]}))});
  if(result.error)throw new Error('Atomic replacement failed');
  if(!result.data)return json({status:'pending',error:'Source changed during processing. Retry the latest version.'},409);
  return json({status:'ready',source_id:source.id,chunk_count:chunks.length});
 }catch(error){
  if(error instanceof RangeError)return json({error:"Request too large"},413);
  const detail=error instanceof Error&&/^AI request failed \([0-9]{3}:[a-z_]+\)$/.test(error.message)?error.message:
    error instanceof Error&&error.message==='AI unavailable'?'AI service is not configured.':'Processing failed. Retry shortly.';
  if(source?.id&&source?.token) {
   const r=await db.rpc('finish_knowledge_ingestion',{p_source_id:source.id,p_token:source.token,p_chunks:null,
    p_error:detail});
   if(r.error)console.error('knowledge-ingest: status update failed');
  }
  console.error('knowledge-ingest: processing failed');
  return json({status:'failed',error:detail},503);
 }
});

