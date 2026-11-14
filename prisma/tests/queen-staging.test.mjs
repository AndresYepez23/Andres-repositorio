import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertQueenStaging,authorizedQueenStaging,createQueenStagingWorker,STAGING_DATABASE} from '../neural-pilot/staging/worker.js';
const key='test-staging-key-with-adequate-entropy-length';
async function environment(identity=STAGING_DATABASE){return {QUEEN_STAGE:'staging',QUEEN_STAGING_DATABASE_ID:STAGING_DATABASE,
 QUEEN_STAGING_KEY_SHA256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))].map(b=>b.toString(16).padStart(2,'0')).join(''),
 PRISMA_RATE_DB:{prepare:()=>({first:async()=>({database_id:identity,environment:'staging'})})}};}
const request=(headers={})=>new Request('https://stage/__queen/health',{headers});
test('staging rejects the production database even if the environment label says staging',async()=>{
 const e=await environment();e.QUEEN_STAGING_DATABASE_ID='e02104b5-0861-475a-a60f-7658439d4fe0';await assert.rejects(assertQueenStaging(e),/CONFIG_REQUIRED/);
});
test('staging verifies actual database identity rather than trusting Wrangler names',async()=>{
 await assert.rejects(assertQueenStaging(await environment('e02104b5-0861-475a-a60f-7658439d4fe0')),/BINDING_MISMATCH/);
});
test('unauthorized staging requests never touch a database or inference endpoint',async()=>{
 let io=0;const response=await createQueenStagingWorker({fetch:()=>{io++;}}).fetch(request(),{PRISMA_RATE_DB:{prepare:()=>{io++;}}},{});
 assert.equal(response.status,404);assert.equal(io,0);
});
test('operator authorization uses a digest and does not return credentials',async()=>{
 const e=await environment();assert.equal(await authorizedQueenStaging(request({'X-Queen-Staging-Key':key}),e),true);
 assert.equal(await authorizedQueenStaging(request({'X-Queen-Staging-Key':key+'bad'}),e),false);
 const response=await createQueenStagingWorker({}).fetch(request({'X-Queen-Staging-Key':key}),e,{});const body=await response.json();
 assert.equal(body.databaseId,STAGING_DATABASE);assert.equal(body.missingSecrets.length,3);assert.ok(!JSON.stringify(body).includes(key));
});
test('isolated Wrangler configuration does not reference any production D1',()=>{
 const config=readFileSync(new URL('../wrangler.staging.toml',import.meta.url),'utf8');
 assert.ok(config.includes('prisma-queen-staging'));assert.ok(config.includes(STAGING_DATABASE));assert.ok(!config.includes('e02104b5-0861-475a-a60f-7658439d4fe0'));
});

test('staging health reports the built source commit instead of a stale environment value',async()=>{
 const env=await environment();env.QUEEN_SOURCE_COMMIT='b'.repeat(40);
 const response=await createQueenStagingWorker({},{sourceCommit:'a'.repeat(40)}).fetch(request({'X-Queen-Staging-Key':key}),env,{});
 assert.equal((await response.json()).sourceCommit,'a'.repeat(40));
});

test('staging runs actual existing tools and exports a structurally verified JSON artifact without model credentials',async()=>{
 const {runStagingLocalTools}=await import('../neural-pilot/staging/worker.js');
 const r=await runStagingLocalTools();assert.equal(r.realInference,false);assert.equal(r.executed,true);assert.equal(r.verified,true);
 assert.deepEqual(r.toolIds,['json-format','json-minify']);assert.equal(r.artifact.status,'verified');assert.deepEqual(JSON.parse(await r.blob.text()),{prisma:true,valor:7});
});
test('staging guard fixtures exercise actual validators and identify themselves as fixtures',async()=>{
 const {runStagingGuards}=await import('../neural-pilot/staging/worker.js');const r=await runStagingGuards();
 assert.equal(r.ok,true);assert.equal(r.realInference,false);assert.ok(r.planSource.includes('fixtures'));
});

test('the server-only evaluation option can request actual neural planning for a deterministic case',async()=>{
 const {planWithQueen}=await import('../functions/api/core/plan.js');let calls=0;
 const e={QUEEN_ENABLED:'1',QUEEN_API_KEY:'test',QUEEN_ACCESS_CLIENT_ID:'test',QUEEN_ACCESS_CLIENT_SECRET:'test',PRISMA_RATE_DB:{prepare:sql=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>({})})})}};
 const r=await planWithQueen(e,{text:'Formatea JSON: {}',files:[]},{forceNeural:true,loadProviders:async()=>[],infer:async()=>{calls++;return {plan:{intent:'execute',message:'test',steps:[{id:'s1',tool_id:'json-format',params:{text:'{}'},dependsOn:[],inputs:[]}]},usage:{inputTokens:5,outputTokens:10}};}});
 assert.equal(calls,1);assert.equal(r.source,'queen');assert.equal(r.plan.execution.executed,false);
});

test('staging Wrangler activates Queen only in the isolated Production environment, keeping Preview disabled',()=>{
 const config=readFileSync(new URL('../wrangler.staging.toml',import.meta.url),'utf8');
 const root=config.split('[vars]')[1].split('[env.preview.vars]')[0];const preview=config.split('[env.preview.vars]')[1];
 assert.match(root,/QUEEN_ENABLED = "1"/);assert.match(preview,/QUEEN_ENABLED = "0"/);
 assert.match(preview,/\[\[env.preview.d1_databases\]\]/);assert.ok(preview.includes(STAGING_DATABASE));
});

test('diagnostic classification never copies upstream messages or authentication values',async()=>{
 const {queenRequest}=await import('../functions/_lib/queen.js');
 const e={QUEEN_ENABLED:'1',QUEEN_API_KEY:'test-server-key',QUEEN_ACCESS_CLIENT_ID:'test-access-id',QUEEN_ACCESS_CLIENT_SECRET:'test-access-secret'};
 await assert.rejects(queenRequest(e,'completion',{fetchImpl:async()=>new Response(JSON.stringify({error:{message:'invalid schema test-server-key test-access-secret'}}),{status:400,headers:{'Content-Type':'application/json'}})}),error=>{
  assert.deepEqual(error.diagnostics,{route:'completion',upstreamStatus:400,category:'schema'});assert.ok(!JSON.stringify(error.diagnostics).includes('test-server-key'));return true;
 });
});
test('staging cannot increase the production token ceiling through the diagnostic option',async()=>{
 const {inferQueen}=await import('../functions/_lib/queen.js');let calls=0;
 const e={QUEEN_ENABLED:'1',QUEEN_API_KEY:'test',QUEEN_ACCESS_CLIENT_ID:'test',QUEEN_ACCESS_CLIENT_SECRET:'test'};
 await inferQueen(e,[],{}, {maxOutputTokens:10000,fetchImpl:async(url,options)=>{
  if(url.endsWith('/slots'))return new Response('[{"id":0,"is_processing":false}]',{headers:{'Content-Type':'application/json'}});
  if(!calls++)return new Response('{"tokens":[1]}',{headers:{'Content-Type':'application/json'}});
  assert.equal(JSON.parse(options.body).max_tokens,256);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}',reasoning_content:''}}],usage:{prompt_tokens:1,completion_tokens:2}}),{headers:{'Content-Type':'application/json'}});
 }});
});
