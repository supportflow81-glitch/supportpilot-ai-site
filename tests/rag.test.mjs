
import test from 'node:test';
import assert from 'node:assert/strict';
import {chunkText,embedTexts} from '../supabase/functions/_shared/rag.mjs';
test('chunking preserves long unbroken text with overlap and bounded chunks',()=>{
 const raw='a'.repeat(9000)+'END';
 const chunks=chunkText(raw);
 assert.ok(chunks.length>1);assert.ok(chunks.every(c=>c.length<=2200));
 assert.equal(chunks[0]+chunks.slice(1).map(c=>c.slice(200)).join(''),raw);
});
test('chunking handles Unicode and rejects empty or oversized sources',()=>{
 const chunks=chunkText('🙂'.repeat(4000));
 assert.ok(chunks.every(c=>!/[\uD800-\uDBFF]$/.test(c)&&! /^[\uDC00-\uDFFF]/.test(c)));
 assert.throws(()=>chunkText('  '));assert.throws(()=>chunkText('a'.repeat(200001)));
});
test('embedding batches preserve order and explicitly request 1536 dimensions',async()=>{
 const old=global.fetch;let calls=0;
 try{
 global.fetch=async(_url,options)=>{
  const b=JSON.parse(options.body);assert.equal(b.dimensions,1536);assert.equal(b.model,'text-embedding-3-small');
  calls++;return Response.json({data:b.input.map((x,i)=>({index:i,embedding:Array(1536).fill(Number(x)+1)})).reverse()});
 };
 const vectors=await embedTexts(Array.from({length:20},(_,i)=>String(i)),'test-key');
 assert.equal(calls,2);assert.deepEqual(vectors.map(v=>v[0]),Array.from({length:20},(_,i)=>i+1));
 }finally{global.fetch=old;}
});
test('invalid dimensions and upstream failure reject instead of creating bad chunks',async()=>{
 const old=global.fetch;
 try{
 global.fetch=async()=>Response.json({data:[{index:0,embedding:[1,2]}]});
 await assert.rejects(()=>embedTexts(['x'],'test-key'));
 global.fetch=async()=>new Response('private upstream detail',{status:429});
 await assert.rejects(()=>embedTexts(['x'],'test-key'),/AI request failed \(429:unknown\)/);
 }finally{global.fetch=old;}
});
