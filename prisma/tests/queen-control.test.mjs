import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {withQueenLease,reserveQueenRequest,recordQueenMetric,inferQueen,measureQueenStream} from '../functions/_lib/queen.js';
import {observeQueenProvider,readQueenProviderObservations} from '../functions/_lib/queen-observations.js';

function binding(t,{migrated=true}={}){
 const raw=new DatabaseSync(':memory:'),statements=[];t.after(()=>raw.close());
 if(migrated)raw.exec(readFileSync(new URL('../migrations/0004_queen_control.sql',import.meta.url),'utf8'));
 return {raw,statements,prepare(sql){
  statements.push(sql);const s=raw.prepare(sql);
  const bound=values=>({first:async()=>s.get(...values)||null,run:async()=>s.run(...values),all:async()=>({results:s.all(...values)})});
  return {...bound([]),bind:(...values)=>bound(values)};
 }};
}
function production(t,options){
 const control=binding(t,options);let primaryCalls=0;
 return {control,get primaryCalls(){return primaryCalls;},env:{
  QUEEN_ENABLED:'1',QUEEN_STAGE:'production',QUEEN_API_KEY:'fixture-key',
  QUEEN_ACCESS_CLIENT_ID:'fixture-id',QUEEN_ACCESS_CLIENT_SECRET:'fixture-secret',
  QUEEN_CONTROL_DB:control,PRISMA_RATE_DB:{prepare(){primaryCalls++;throw Error('PRINCIPAL_MUST_NOT_RECEIVE_QUEEN_SQL');}}
 }};
}
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const request=()=>new Request('https://prismaspace.pages.dev/api/core/plan',{headers:{'CF-Connecting-IP':'192.0.2.23'}});
const observation={provider:'kilo',model:'fixture-catalog-model',capability:'chat',status:200,durationMs:15,usage:{prompt_tokens:4,completion_tokens:2}};

test('production Queen SQL uses the dedicated control database without accessing principal storage',async t=>{
 const p=production(t),env=p.env;
 await reserveQueenRequest(env,request(),Date.UTC(2026,10,13));
 await withQueenLease(env,async()=>recordQueenMetric(env,'planned',{inputTokens:4,outputTokens:2}));
 await observeQueenProvider(env,observation);
 const observed=await readQueenProviderObservations(env);
 assert.equal(observed.length,1);assert.equal(observed[0].successes,1);
 assert.equal(p.control.raw.prepare('SELECT count(*) AS n FROM queen_leases').get().n,0);
 assert.equal(p.control.raw.prepare('SELECT count(*) AS n FROM queen_request_limits').get().n,2);
 assert.equal(p.control.raw.prepare('SELECT input_tokens FROM queen_metrics').get().input_tokens,4);
 assert.equal(p.primaryCalls,0);
 assert.ok(p.control.statements.every(sql=>/queen_/.test(sql)));
});

test('staging retains its existing database binding when no dedicated Queen binding is configured',async t=>{
 const db=binding(t),env={QUEEN_ENABLED:'1',QUEEN_STAGE:'staging',PRISMA_RATE_DB:db};
 await reserveQueenRequest(env,request(),Date.UTC(2026,10,13));
 assert.equal(await withQueenLease(env,async()=>7),7);
 await observeQueenProvider(env,observation);
 assert.equal((await readQueenProviderObservations(env)).length,1);
});

test('production and staging share one lease when their bindings point to the same isolated database',async t=>{
 const p=production(t),staging={QUEEN_ENABLED:'1',QUEEN_STAGE:'staging',PRISMA_RATE_DB:p.control};
 let finish;const held=withQueenLease(p.env,()=>new Promise(resolve=>{finish=resolve;}));
 await new Promise(resolve=>setImmediate(resolve));
 try{await assert.rejects(withQueenLease(staging,async()=>assert.fail('must not dispatch')),/QUEEN_BUSY/);}
 finally{finish('released');await held;}
 assert.equal(await withQueenLease(staging,async()=>3),3);assert.equal(p.primaryCalls,0);
});

test('missing dedicated control tables fail closed instead of falling back to principal storage',async t=>{
 const p=production(t,{migrated:false});let dispatched=0;
 await assert.rejects(withQueenLease(p.env,async()=>{dispatched++;}),/QUEEN_CONTROL_UNAVAILABLE/);
 await assert.rejects(reserveQueenRequest(p.env,request()),/QUEEN_CONTROL_UNAVAILABLE/);
 assert.equal(dispatched,0);assert.equal(p.primaryCalls,0);
 // Optional telemetry remains best effort and cannot break existing providers.
 await recordQueenMetric(p.env,'planned');await observeQueenProvider(p.env,observation);
 assert.deepEqual(await readQueenProviderObservations(p.env),[]);assert.equal(p.primaryCalls,0);
});

test('an invalid explicit control binding cannot silently select the principal database',async()=>{
 let primaryCalls=0;
 const env={QUEEN_CONTROL_DB:{},PRISMA_RATE_DB:{prepare(){primaryCalls++;}}};
 await assert.rejects(withQueenLease(env,async()=>assert.fail('must not dispatch')),/QUEEN_CONTROL_UNAVAILABLE/);
 await assert.rejects(reserveQueenRequest(env,request()),/QUEEN_CONTROL_UNAVAILABLE/);
 assert.equal(primaryCalls,0);
});

test('enabled production Queen checks the actual slot before either JSON or SSE completions',async t=>{
 const p=production(t);
 for(const invoke of [options=>inferQueen(p.env,[],{},options),options=>measureQueenStream(p.env,options)]){
  const calls=[];
  await assert.rejects(invoke({fetchImpl:async url=>{
   calls.push(url);assert.ok(url.endsWith('/slots'));return json([{id:0,is_processing:true}]);
  }}),error=>error.code==='QUEEN_BUSY'&&error.diagnostics.completionTransportAttempted===false);
  assert.equal(calls.length,1);
 }
});

test('production idle preflight preserves authentication, output ceiling and request order',async t=>{
 const p=production(t),calls=[];
 const result=await inferQueen(p.env,[],{}, {fetchImpl:async(url,options)=>{
  calls.push(new URL(url).pathname);assert.equal(options.headers.Authorization,'Bearer fixture-key');
  assert.equal(options.headers['CF-Access-Client-Secret'],'fixture-secret');
  if(url.endsWith('/slots'))return json([{id:0,is_processing:false}]);
  if(url.endsWith('/tokenize'))return json({tokens:[1]});
  assert.equal(JSON.parse(options.body).max_tokens,256);
  return json({choices:[{finish_reason:'stop',message:{content:'{"intent":"question","message":"Fixture","steps":[]}'}}],usage:{prompt_tokens:2,completion_tokens:4}});
 }});
 assert.deepEqual(calls,['/slots','/tokenize','/v1/chat/completions']);assert.equal(result.usage.outputTokens,4);
});

test('a dispatched production timeout retains the shared five-minute cooldown',async t=>{
 t.mock.method(Date,'now',()=>1000);const p=production(t);
 const timeout=Object.assign(Error('QUEEN_TIMEOUT'),{code:'QUEEN_TIMEOUT',diagnostics:{completionTransportAttempted:true}});
 await assert.rejects(withQueenLease(p.env,async()=>{throw timeout;}),error=>error.diagnostics.cooldownUntil===301000);
 assert.equal(p.control.raw.prepare('SELECT expires_at FROM queen_leases').get().expires_at,301000);
 await assert.rejects(withQueenLease({QUEEN_ENABLED:'1',QUEEN_STAGE:'staging',PRISMA_RATE_DB:p.control},async()=>assert.fail('must not queue')),/QUEEN_BUSY/);
 assert.equal(p.primaryCalls,0);
});

test('production preflight failures release their lease and disabled observations leave providers untouched',async t=>{
 const p=production(t);
 await assert.rejects(withQueenLease(p.env,async()=>{throw Object.assign(Error('QUEEN_TIMEOUT'),{code:'QUEEN_TIMEOUT',diagnostics:{completionTransportAttempted:false}});}),/QUEEN_TIMEOUT/);
 assert.equal(p.control.raw.prepare('SELECT count(*) AS n FROM queen_leases').get().n,0);
 const count=p.control.statements.length;
 await observeQueenProvider({...p.env,QUEEN_ENABLED:'0'},observation);
 assert.equal(p.control.statements.length,count);assert.equal(p.primaryCalls,0);
});
