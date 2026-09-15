import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const url=new URL('../supabase/functions/widget-chat/index.ts',import.meta.url);
let source=fs.readFileSync(url,'utf8')
 .replace("import { createClient } from 'npm:@supabase/supabase-js@2.116.0';",'')
 .replace("'../_shared/rag.mjs'",JSON.stringify(new URL('../supabase/functions/_shared/rag.mjs',import.meta.url).href))
 .replace(/const db=createClient[^\n]+/,'const db=globalThis.__testDb;');
source=stripTypeScriptTypes(source);
let handler;let tables;let responseBody;let rpcArgs;let outage=false;let noMatch=false;
const query=(table)=>{
 let mode='read',payload,filters=[],take;
 const q={
  select(){return q},insert(v){mode='insert';payload=v;return q},update(v){mode='update';payload=v;return q},
  in(k,v){filters.push(r=>v.includes(r[k]));return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},
  order(){return q},limit(n){take=n;return q},maybeSingle(){return run(true)},single(){return run(true)},
  then(resolve,reject){return run(false).then(resolve,reject)}
 };
 async function run(single){
  let rows=tables[table].filter(r=>filters.every(f=>f(r)));
  if(mode==='insert'){
   if(table==='messages'&&tables[table].some(r=>r.conversation_id===payload.conversation_id&&r.sender_type===payload.sender_type&&r.client_request_id===payload.client_request_id))return {data:null,error:{code:'23505'}};
   if(table==='messages'&&!['visitor','assistant','agent','system'].includes(payload.sender_type))return {data:null,error:{code:'23514'}};
   const row={id:crypto.randomUUID(),...payload};tables[table].push(row);rows=[row];
  }
  if(mode==='update')rows.forEach(r=>Object.assign(r,payload));
  if(take)rows=rows.slice(-take).reverse();
  return {data:single?rows[0]||null:rows.map(r=>({...r})),error:null};
 }
 return q;
};
globalThis.__testDb={from:query,rpc:async(name,args)=>{
 if(name==='widget_complete_reply'){const c=tables.conversations.find(c=>c.id===args.p_conversation_id);if(!c?.ai_enabled)return {data:false,error:null};tables.messages.push({id:crypto.randomUUID(),organization_id:args.p_organization_id,conversation_id:c.id,sender_type:'assistant',client_request_id:args.p_request_id,content:args.p_content});return {data:true,error:null};}
 assert.equal(name,'match_knowledge_service');rpcArgs=args;
 return {data:noMatch?[]:[{content:'Verified fee is 47 dollars.',source_name:'Reference'}],error:null};
}};
globalThis.Deno={env:{get:()=> 'test-key'},serve(fn){handler=fn;}};
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function setup(){
 tables={assistants:[{id:'assistant-a',organization_id:'org-a',widget_key:'widget-a',name:'Test',status:'active',allowed_origins:['https://example.test']}],conversations:[],messages:[],leads:[]};
 responseBody=null;rpcArgs=null;outage=false;noMatch=false;
 globalThis.fetch=async(url,opts)=>{
  if(outage)throw new Error('Service unavailable');
  const body=JSON.parse(opts.body);
  if(url.endsWith('/embeddings'))return Response.json({data:[{index:0,embedding:Array(1536).fill(0.01)}]});
  responseBody=body;
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'The fee is 47 dollars.'}]}]});
 };
}
async function send(body,origin='https://example.test'){
 const res=await handler(new Request('https://test/functions/widget-chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({widget_key:'widget-a',session_token:'a'.repeat(64),request_id:crypto.randomUUID(),...body})}));
 return {...await res.json(),status:res.status};
}
test('retrieved chunks only, tenant scope, history, current message once and lead capture',async()=>{
 setup();
 const r=await send({message:'What is the fee?',visitor_email:'test@example.invalid'});
 assert.equal(r.model,'gpt-5.6-luna');assert.equal(rpcArgs.match_organization_id,'org-a');assert.equal(rpcArgs.match_assistant_id,'assistant-a');
 assert.equal(responseBody.input.at(-1).content,'What is the fee?');
 assert.equal(responseBody.input.filter(x=>x.content==='What is the fee?').length,1);
 assert.match(responseBody.input[0].content,/Verified fee/);
 assert.equal(tables.leads.length,1);assert.equal(tables.messages.length,2);
 const again=await send({message:'Repeat that',conversation_id:r.conversation_id});
 assert.equal(again.status,200);assert.ok(responseBody.input.some(x=>x.role==='assistant'&&x.content==='The fee is 47 dollars.'));
});
test('no knowledge or AI outage gives safe fallback and preserves lead capture',async()=>{
 for(const unavailable of [false,true]){
  setup();outage=unavailable;noMatch=!unavailable;
  const r=await send({message:'What is the fee?',visitor_email:'test@example.invalid'});
  assert.equal(r.model,null);assert.match(r.reply,/verified information/);assert.equal(tables.leads.length,1);assert.equal(responseBody,null);
 }
});
test('handoff persists AI shutoff and later messages without generating an answer',async()=>{
 setup();
 const first=await send({message:'I want a human'});
 assert.equal(first.handoff,true);assert.equal(tables.conversations[0].ai_enabled,false);
 const held=await send({message:'What is the fee?',conversation_id:first.conversation_id});
 assert.equal(held.model,null);assert.match(held.reply,/human teammate/);assert.equal(responseBody,null);
 assert.equal(tables.messages.filter(m=>m.sender_type==='assistant').length,1);
});
test('cross-assistant conversation and disallowed origin rejected before writing',async()=>{
 setup();tables.conversations.push({id:'00000000-0000-4000-8000-000000000002',organization_id:'org-a',assistant_id:'assistant-b',ai_enabled:true});
 assert.equal((await send({message:'hello',conversation_id:'00000000-0000-4000-8000-000000000002'})).status,403);
 assert.equal((await send({message:'hello'},'https://wrong.test')).status,403);assert.equal(tables.messages.length,0);
});


test('config excludes private prompts and history requires a matching session token',async()=>{
 setup();
 const config=await send({action:'config'});
 assert.equal(config.status,200);assert.ok(!('system_prompt' in config.assistant));
 const first=await send({message:'Hello'});
 const restored=await send({action:'history',conversation_id:first.conversation_id});
 assert.equal(restored.status,200);assert.equal(restored.messages.length,2);
 const denied=await send({action:'history',conversation_id:first.conversation_id,session_token:'b'.repeat(64)});
 assert.equal(denied.status,403);
});
test('duplicate request IDs do not save or generate a second reply',async()=>{
 setup();const id=crypto.randomUUID();
 const first=await send({message:'Hello',request_id:id});
 const second=await send({message:'Hello',request_id:id,conversation_id:first.conversation_id});
 assert.equal(second.replayed,true);assert.equal(tables.messages.length,2);
});
