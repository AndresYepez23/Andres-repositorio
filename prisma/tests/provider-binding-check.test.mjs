import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingInventory, compareBindings, checkBindings} from '../scripts/check-provider-bindings.mjs';

const fixture = () => ({
  ok: true,
  credentialSlots: Object.fromEntries(Object.entries({gemini:7,groq:5,huggingface:0,openrouter:6,pollinations:6,kilo:6,requesty:0,sensenova:6,zai:6,aihubmix:5}).map(([name,count])=>[name,{count}])),
  research: {tavily:{configuredKeys:7},jina:{configured:true}},
  configured: {cloudflare:true}, protection: {d1RateLimiting:true}
});

test('an unchanged valid inventory passes instead of raising the historical undefined-variable error', async()=>{
  const result=await checkBindings('production','https://abcdef12.prismaspace.pages.dev','https://17a6c338.prismaspace.pages.dev',async()=>Response.json(fixture()));
  assert.deepEqual(result.regressed,[]);
  assert.equal(result.next.tavily,7);
});

test('losing a single slot fails even when its provider remains configured',()=>{
  const next=fixture();next.credentialSlots.groq.count=4;
  assert.deepEqual(compareBindings(next,fixture(),'production').regressed,['groq']);
});

test('the measured same-code outage includes generation, Tavily and Jina but retains AI and D1',()=>{
  const next=fixture();
  for(const item of Object.values(next.credentialSlots))item.count=0;
  next.research.tavily.configuredKeys=0;next.research.jina.configured=false;
  const {regressed}=compareBindings(next,fixture(),'production');
  assert.deepEqual(regressed,['gemini','groq','openrouter','pollinations','kilo','sensenova','zai','aihubmix','tavily','jina']);
});

test('research and infrastructure cannot regress behind healthy generation providers',()=>{
  for(const [name,change] of [
    ['tavily',r=>r.research.tavily.configuredKeys--],
    ['jina',r=>r.research.jina.configured=false],
    ['cloudflare',r=>r.configured.cloudflare=false],
    ['d1',r=>r.protection.d1RateLimiting=false]
  ]){const next=fixture();change(next);assert.deepEqual(compareBindings(next,fixture(),'production').regressed,[name]);}
});

test('missing inventories and unconfigured production baselines fail closed',()=>{
  for(const change of [r=>delete r.research,r=>delete r.configured.cloudflare,r=>delete r.protection,r=>r.credentialSlots.gemini.count=-1]){
    const next=fixture();change(next);assert.throws(()=>bindingInventory(next),/Missing/);
  }
  const empty=fixture();for(const item of Object.values(empty.credentialSlots))item.count=0;
  assert.throws(()=>compareBindings(empty,empty,'production'),/baseline has no/);
  assert.deepEqual(compareBindings(empty,empty,'preview').regressed,[]);
});

test('transport errors, identical hosts and invalid environments cannot pass a release check',async()=>{
  const url='https://abcdef12.prismaspace.pages.dev',other='https://17a6c338.prismaspace.pages.dev';
  await assert.rejects(checkBindings('production',url,url),/distinct/);
  await assert.rejects(checkBindings('production',url,other,async()=>new Response('',{status:503})),/HTTP 503/);
  await assert.rejects(checkBindings('production',url,other,async()=>Response.json({ok:false})),/Invalid/);
  assert.throws(()=>compareBindings(fixture(),fixture(),'unknown'),/Invalid Pages environment/);
});
