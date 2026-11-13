import test from 'node:test';
import assert from 'node:assert/strict';
import {inferQueen,queenRequest,withQueenLease,measureQueenStream} from '../functions/_lib/queen.js';

const env=()=>({QUEEN_ENABLED:'1',QUEEN_API_KEY:'fixture-key',QUEEN_ACCESS_CLIENT_ID:'fixture-id',QUEEN_ACCESS_CLIENT_SECRET:'fixture-secret'});
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const completion=()=>json({choices:[{message:{content:'{"intent":"question","message":"Fixture","steps":[]}'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1}});
function leaseEnv(statements){return {...env(),QUEEN_STAGE:'staging',PRISMA_RATE_DB:{prepare:sql=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>{statements.push(sql);return {};}})})}};}

test('tokenizer exhausting the inference allowance cannot launch a one-millisecond completion',async t=>{
 let clock=0;const calls=[];t.mock.method(Date,'now',()=>clock);
 await assert.rejects(inferQueen(env(),[{role:'user',content:'fixture'}],{}, {fetchImpl:async url=>{
  calls.push(url);if(url.endsWith('/slots'))return json([{id:0,is_processing:false}]);if(url.endsWith('/tokenize')){clock=55000;return json({tokens:[1]});}return completion();
 }}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 assert.equal(calls.length,2);assert.ok(calls[0].endsWith('/slots'));assert.ok(calls[1].endsWith('/tokenize'));
});

test('an exhausted initial allowance sends no tokenizer or completion request',async()=>{
 let calls=0;
 await assert.rejects(inferQueen(env(),[{role:'user',content:'fixture'}],{}, {remainingMs:0,fetchImpl:async()=>{calls++;return completion();}}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 assert.equal(calls,0);
});

test('already-aborted inference and direct requests cannot dispatch transport',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const fetchImpl=async()=>{calls++;return completion();};
 await assert.rejects(inferQueen(env(),[{role:'user',content:'fixture'}],{}, {signal:controller.signal,fetchImpl}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 await assert.rejects(queenRequest(env(),'completion',{signal:controller.signal,fetchImpl}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 await assert.rejects(queenRequest(env(),'completion',{timeoutMs:0,fetchImpl}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 assert.equal(calls,0);
});

test('readiness exhausting the allowance stops before tokenize and releases the lease without cooldown',async t=>{
 let clock=0;const calls=[],statements=[];t.mock.method(Date,'now',()=>clock);
 const e=leaseEnv(statements);
 await assert.rejects(withQueenLease(e,()=>inferQueen(e,[],{}, {remainingMs:100,fetchImpl:async url=>{
  calls.push(url);clock=100;return json([{id:0,is_processing:false}]);
 }})),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false&&!error.diagnostics.cooldownUntil);
 assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/slots'));
 assert.ok(statements.some(sql=>sql.startsWith('DELETE FROM queen_leases')));
 assert.ok(!statements.some(sql=>sql.startsWith('UPDATE queen_leases')));
});

test('staging readiness timeout is capped by the total remaining allowance',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:0});
 const e=leaseEnv([]);let entered;const readinessStarted=new Promise(resolve=>{entered=resolve;});
 const inference=inferQueen(e,[],{}, {remainingMs:3,fetchImpl:async(url,{signal})=>{
  assert.ok(url.endsWith('/slots'));entered();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('fixture abort')),{once:true}));
 }});
 const rejected=assert.rejects(inference,error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false&&error.diagnostics.durationMs===3);
 await readinessStarted;t.mock.timers.tick(3);await rejected;
});

test('readiness, tokenizer and dispatched completion share 55 seconds and uncertain POST keeps cooldown',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:0});
 const statements=[],calls=[],e=leaseEnv(statements);let entered,completionAborted=false;
 const completionStarted=new Promise(resolve=>{entered=resolve;});
 const inference=withQueenLease(e,()=>inferQueen(e,[{role:'user',content:'fixture'}],{}, {fetchImpl:async(url,options)=>{
  calls.push(url);
  assert.equal(options.headers.Authorization,'Bearer fixture-key');
  assert.equal(options.headers['CF-Access-Client-Id'],'fixture-id');
  assert.equal(options.headers['CF-Access-Client-Secret'],'fixture-secret');
  if(url.endsWith('/slots')){t.mock.timers.tick(3000);return json([{id:0,is_processing:false}]);}
  if(url.endsWith('/tokenize')){t.mock.timers.tick(2000);return json({tokens:[1]});}
  const body=JSON.parse(options.body);assert.equal(body.max_tokens,256);assert.equal(body.chat_template_kwargs.enable_thinking,false);
  entered();return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{completionAborted=true;reject(Error('fixture timeout'));},{once:true}));
 }}));
 const rejected=assert.rejects(inference,error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===true&&error.diagnostics.durationMs===55000&&error.diagnostics.cooldownUntil===355000);
 await completionStarted;t.mock.timers.tick(49999);await Promise.resolve();assert.equal(completionAborted,false);
 t.mock.timers.tick(1);await rejected;
 assert.equal(calls.length,3);assert.equal(completionAborted,true);
 assert.ok(statements.some(sql=>sql.startsWith('UPDATE queen_leases')));
 assert.ok(!statements.some(sql=>sql.startsWith('DELETE FROM queen_leases')));
});

test('compacting an oversized context cannot renew an exhausted inference allowance',async t=>{
 let clock=0,calls=0;t.mock.method(Date,'now',()=>clock);
 await assert.rejects(inferQueen(env(),[{role:'user',content:'fixture'}],{}, {compactMessages:()=>{clock=55000;return [{role:'user',content:'smaller fixture'}];},fetchImpl:async url=>{calls++;return url.endsWith('/slots')?json([{id:0,is_processing:false}]):json({tokens:Array(2000).fill(1)});}}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 assert.equal(calls,2);
});

test('cancellation during tokenizer preflight prevents the completion POST',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(inferQueen(env(),[{role:'user',content:'fixture'}],{}, {signal:controller.signal,fetchImpl:async url=>{
  calls++;if(url.endsWith('/slots'))return json([{id:0,is_processing:false}]);controller.abort();return json({tokens:[1]});
 }}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 assert.equal(calls,2);
});

test('SSE already-aborted or zero-budget requests do not dispatch metadata or completion',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 for(const options of [{signal:controller.signal},{timeoutMs:0}])await assert.rejects(measureQueenStream({...env(),QUEEN_STAGE:'staging'},{...options,fetchImpl:async()=>{calls++;return completion();}}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 assert.equal(calls,0);
});

test('SSE readiness exhausting the total allowance releases the lease without a completion cooldown',async t=>{
 let clock=0;const calls=[],statements=[],e=leaseEnv(statements);t.mock.method(Date,'now',()=>clock);
 await assert.rejects(withQueenLease(e,()=>measureQueenStream(e,{fetchImpl:async url=>{
  calls.push(url);clock=55000;return json([{id:0,is_processing:false}]);
 }})),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false&&!error.diagnostics.cooldownUntil);
 assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/slots'));
 assert.ok(statements.some(sql=>sql.startsWith('DELETE FROM queen_leases')));
 assert.ok(!statements.some(sql=>sql.startsWith('UPDATE queen_leases')));
});

test('SSE readiness and body share the 55-second cap and a dispatched timeout retains cooldown',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:0});
 const statements=[],calls=[],e=leaseEnv(statements);let entered,aborted=false;
 const completionStarted=new Promise(resolve=>{entered=resolve;});
 const stream=withQueenLease(e,()=>measureQueenStream(e,{timeoutMs:90000,fetchImpl:async(url,options)=>{
  calls.push(url);
  if(url.endsWith('/slots')){t.mock.timers.tick(3000);return json([{id:0,is_processing:false}]);}
  assert.equal(options.headers.Authorization,'Bearer fixture-key');assert.equal(options.headers['CF-Access-Client-Secret'],'fixture-secret');
  const body=JSON.parse(options.body);assert.equal(body.stream,true);assert.equal(body.max_tokens,32);assert.equal(body.chat_template_kwargs.enable_thinking,false);
  const response=new Response(new ReadableStream({start(c){options.signal.addEventListener('abort',()=>{aborted=true;c.error(Error('fixture abort'));},{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});
  entered();return response;
 }}));
 const rejected=assert.rejects(stream,error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===true&&error.diagnostics.durationMs===55000&&error.diagnostics.cooldownUntil===355000);
 await completionStarted;t.mock.timers.tick(51999);await Promise.resolve();assert.equal(aborted,false);
 t.mock.timers.tick(1);await rejected;
 assert.equal(calls.length,2);assert.equal(aborted,true);
 assert.ok(statements.some(sql=>sql.startsWith('UPDATE queen_leases')));
 assert.ok(!statements.some(sql=>sql.startsWith('DELETE FROM queen_leases')));
});

test('SSE cancellation during readiness prevents any completion POST',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(measureQueenStream({...env(),QUEEN_STAGE:'staging'},{signal:controller.signal,fetchImpl:async()=>{
  calls++;controller.abort();return json([{id:0,is_processing:false}]);
 }}),error=>error.code==='QUEEN_TIMEOUT'&&error.diagnostics.completionTransportAttempted===false);
 assert.equal(calls,1);
});
