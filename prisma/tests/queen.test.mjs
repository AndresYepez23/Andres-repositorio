import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tools} from '../src/registry.js';
import {queenToolCatalog,retrieveQueenTools,validateQueenParameters} from '../src/queen-contracts.js';
import {validateQueenPlan} from '../src/queen-plan.js';
import {executeQueenDAG,createQueenExecutionState} from '../src/queen-execution.js';
import {verifyQueenResult} from '../src/queen-verifier.js';
import {queenRequest,inferQueen,withQueenLease,readBoundedJson,reserveQueenRequest} from '../functions/_lib/queen.js';
import {buildQueenProviderRegistry,selectQueenDelegate} from '../functions/_lib/queen-providers.js';
import {planWithQueen,onRequestPost} from '../functions/api/core/plan.js';
import {queenTaskContext,requestQueenPlan} from '../src/queen-client.js';
import {runTool} from '../src/engines.js';

function database(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0004_queen_control.sql',import.meta.url),'utf8'));
 return {prepare(sql){const s=db.prepare(sql);const bound=args=>({first:async()=>s.get(...args)||null,run:async()=>s.run(...args),all:async()=>({results:s.all(...args)})});return {...bound([]),bind:(...args)=>bound(args)};},db};
}
const env=()=>({QUEEN_ENABLED:'1',QUEEN_API_KEY:'test-server-key',QUEEN_ACCESS_CLIENT_ID:'test-access-id',QUEEN_ACCESS_CLIENT_SECRET:'test-access-secret',PRISMA_RATE_DB:database()});
const step=(tool_id,params={},inputs=[],dependsOn=[],id='s1')=>({id,tool_id,params,inputs,dependsOn});
const proposal=(steps,intent='execute')=>({intent,message:'Plan propuesto',steps});
const input=new File(['pdf'],'doc.pdf',{type:'application/pdf'});
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const dependencies={loadProviders:async()=>[],infer:async()=>({plan:proposal([step('json-format',{text:'{"a":1}'})]),usage:{inputTokens:42,outputTokens:30}})};

test('Queen contracts mirror all 150 current registry entries and existing field definitions',()=>{
 const catalog=queenToolCatalog();assert.equal(catalog.length,tools.length);assert.deepEqual(catalog.map(t=>t.id),tools.map(t=>t.id));
 assert.ok(catalog.find(t=>t.id==='image-resize').parameters.properties.width.maximum===12000);
 assert.deepEqual(catalog.find(t=>t.id==='image-convert').parameters.properties.format.enum,['image/png','image/jpeg','image/webp']);
 assert.ok(!JSON.stringify(catalog).includes('test-server-key'));
});
test('Queen parameters reject invention, malformed values, missing data and canvas abuse',()=>{
 for(const [id,p] of [['shell',{command:'rm -rf /'}],['pdf-extract',{}],['image-resize',{width:500000}],['image-resize',{width:3,code:'alert(1)'}],['image-convert',{format:'image/svg+xml'}],['json-format',{text:[]}],['video-trim',{start:1}]])assert.throws(()=>validateQueenParameters(id,p));
 assert.deepEqual(validateQueenParameters('json-format',{}, {fromDependency:true}),{});
});
test('Queen validates a typed DAG and sorts forward references before execution',()=>{
 const p=validateQueenPlan(proposal([step('json-minify',{},['step:s1'],['s1'],'s2'),step('json-format',{text:'{"a":1}'})]));
 assert.deepEqual(p.steps.map(s=>s.id),['s1','s2']);assert.equal(p.execution.executed,false);assert.equal(p.status,'validated');
});
test('unknown IDs, cycles, missing dependencies, duplicate actions and incompatible files fail closed',()=>{
 for(const p of [proposal([step('eval')]),proposal([step('json-format',{text:'{}'},[],['s1'])]),proposal([step('json-format',{},['step:s2'],[])]),proposal([step('json-format',{text:'{}'}),step('json-format',{text:'{}'},[],[],'s2')]),proposal([step('image-compress',{},['file:0'])]),proposal([step('pdf-text',{},['file:5'])])])assert.throws(()=>validateQueenPlan(p,{files:[input]}));
});
test('a question or clarification never carries executable steps',()=>{
 for(const intent of ['question','clarify','delegate'])assert.throws(()=>validateQueenPlan(proposal([step('json-format',{text:'{}'})],intent)));
});
test('every auxiliary and inference route carries BOTH Access headers and the llama API key',async()=>{
 const seen=[];const e=env();
 for(const route of ['models','tokenize','completion'])await queenRequest(e,route,{body:route==='models'?undefined:{},fetchImpl:async(url,options)=>{seen.push({url,options});return json({});}});
 assert.equal(seen.length,3);
 for(const {options} of seen){assert.equal(options.headers.Authorization,'Bearer test-server-key');assert.equal(options.headers['CF-Access-Client-Id'],'test-access-id');assert.equal(options.headers['CF-Access-Client-Secret'],'test-access-secret');assert.equal(options.redirect,'manual');}
});
test('missing credentials and invalid config never send upstream requests',async()=>{
 let calls=0;
 for(const e of [{},{...env(),QUEEN_API_KEY:''},{...env(),QUEEN_BASE_URL:'http://insecure/v1'},{...env(),QUEEN_BASE_URL:'https://user:password@example.com/v1'}])await assert.rejects(queenRequest(e,'models',{fetchImpl:async()=>{calls++;return json({});}}));
 assert.equal(calls,0);
});
test('redirects and raw upstream errors are never exposed or followed',async()=>{
 for(const status of [302,401,403,500])await assert.rejects(queenRequest(env(),'completion',{fetchImpl:async()=>new Response('test-secret-leak',{status})}),e=>!e.message.includes('leak')&&e.code.startsWith('QUEEN_'));
});
test('bounded JSON reading rejects chunked bodies larger than the limit',async()=>{
 await assert.rejects(readBoundedJson(new Response('x'.repeat(200)),100),/TOO_LARGE/);
 await assert.rejects(readBoundedJson(new Response('bad')),/INVALID_JSON/);
});
test('one timeout covers receiving the upstream body, not just response headers',async()=>{
 const stream=new ReadableStream({start(){},cancel(){}});
 await assert.rejects(queenRequest(env(),'models',{timeoutMs:5,fetchImpl:async(_url,{signal})=>{
  return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(Error('abort')));}}),{headers:{'content-type':'application/json'}});
 }}),/QUEEN_TIMEOUT/);
});
test('llama tokenizer preflight refuses context overflow without running completion',async()=>{
 const calls=[];await assert.rejects(inferQueen(env(),[{role:'user',content:'test'}],{}, {fetchImpl:async url=>{calls.push(url);return url.endsWith('/slots')?json([{id:0,is_processing:false}]):json({tokens:Array(2000).fill(1)});}}),/CONTEXT_BUDGET/);
 assert.equal(calls.length,2);assert.ok(calls[0].endsWith('/slots'));assert.ok(calls[1].endsWith('/tokenize'));
});
test('Queen disables thinking, uses structured bounded output and records actual usage',async()=>{
 let count=0;
 const r=await inferQueen(env(),[{role:'user',content:'test'}],{type:'object'},{fetchImpl:async(url,options)=>{
  if(url.endsWith('/slots'))return json([{id:0,is_processing:false}]);
  if(count++===0)return json({tokens:[1,2]});const body=JSON.parse(options.body);assert.equal(body.stream,false);assert.equal(body.max_tokens,256);assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.cache_prompt,true);
  return json({choices:[{message:{content:JSON.stringify(proposal([],'clarify'))},finish_reason:'stop'}],usage:{prompt_tokens:5,completion_tokens:12}});
 }});assert.equal(r.usage.inputTokens,5);assert.equal(r.usage.outputTokens,12);
});
test('truncated model output cannot be accepted as a plan',async()=>{
 const content='{\n "message":"private-user-value"';let calls=0;
 await assert.rejects(inferQueen(env(),[],{}, {fetchImpl:async url=>{
  if(url.endsWith('/slots'))return json([{id:0,is_processing:false}]);
  if(url.endsWith('/tokenize'))return json({tokens:[1]});
  calls++;return json({choices:[{message:{content},finish_reason:'length'}],usage:{prompt_tokens:468,completion_tokens:256}});
 }}),error=>{
  assert.equal(error.code,'QUEEN_TRUNCATED_PLAN');
  assert.equal(error.diagnostics.observedOutputTokens,256);
  assert.equal(error.diagnostics.responseCharacters,content.length);
  assert.equal(error.diagnostics.responseWhitespaceCharacters,2);
  assert.equal(JSON.stringify(error.diagnostics).includes('private-user-value'),false);
  return true;
 });
 assert.equal(calls,1);
});
test('D1 lease serializes concurrent requests across independent callers and releases on errors',async()=>{
 const e=env();let finish;const first=withQueenLease(e,()=>new Promise(resolve=>{finish=resolve;}));await new Promise(r=>setImmediate(r));
 await assert.rejects(withQueenLease(e,async()=>{}),/BUSY/);finish('ok');assert.equal(await first,'ok');
 await assert.rejects(withQueenLease(e,async()=>{throw Error('failure');}),/failure/);assert.equal(await withQueenLease(e,async()=>1),1);
});
test('missing migration or database refuses inference without isolate-local locks',async()=>{
 await assert.rejects(withQueenLease({},async()=>{}),/CONTROL_UNAVAILABLE/);
});
test('a real completion timeout leaves a five-minute staging cooldown instead of immediately queuing another request',async()=>{
 const e=env();e.QUEEN_STAGE='staging';
 await assert.rejects(withQueenLease(e,async()=>{throw Object.assign(Error('QUEEN_TIMEOUT'),{code:'QUEEN_TIMEOUT',diagnostics:{completionTransportAttempted:true}});}),error=>error.diagnostics.cooldownUntil>Date.now()+290000);
 await assert.rejects(withQueenLease(e,async()=>{}),/QUEEN_BUSY/);
});
test('public planner rate limits are enforced by SQLite without storing raw IPs',async()=>{
 const e=env(),r=new Request('https://app/api/core/plan',{headers:{'CF-Connecting-IP':'192.0.2.10'}}),now=Date.UTC(2026,10,13,5,13);
 for(let i=0;i<5;i++)await reserveQueenRequest(e,r,now);
 await assert.rejects(reserveQueenRequest(e,r,now),/RATE_LIMIT/);
 assert.ok(!JSON.stringify(e.PRISMA_RATE_DB.db.prepare('SELECT * FROM queen_request_limits').all()).includes('192.0.2.10'));
});
test('protected staging evaluations cannot consume the public planner request budget',async()=>{
 const e=env(),r=new Request('https://stage/api/core/plan'),now=Date.UTC(2026,10,13,5,13);
 for(let i=0;i<6;i++)await reserveQueenRequest(e,r,now,{perMinute:12,perDay:96,namespace:'staging-operator'});
 for(let i=0;i<5;i++)await reserveQueenRequest(e,r,now);
 await assert.rejects(reserveQueenRequest(e,r,now),/RATE_LIMIT/);
});
test('Queen planner keeps unambiguous local operations off the VPS',async()=>{
 let calls=0;const r=await planWithQueen({}, {text:'Formatea JSON: {"a":1}',files:[]},{...dependencies,infer:async()=>{calls++;}});assert.equal(r.source,'prisma-core-local');assert.equal(calls,0);
});
test('semantic planning repairs one invalid proposal and never performs a tool action',async()=>{
 let calls=0;const r=await planWithQueen(env(),{text:'Interpreta estos datos y selecciona JSON format',files:[]},{...dependencies,infer:async()=>({plan:calls++===0?proposal([step('shell')]):proposal([step('json-format',{text:'{}'})]),usage:{inputTokens:42,outputTokens:30}})});
 assert.equal(calls,2);assert.equal(r.plan.execution.executed,false);assert.equal(r.metrics.repairs,1);assert.equal(r.metrics.inputTokens,84);
});
test('semantic query expansion searches the real catalog once within the total inference budget',async()=>{
 let calls=0;const r=await planWithQueen(env(),{text:'Busca una capacidad distinta',files:[]},{...dependencies,infer:async()=>({plan:calls++===0?{intent:'retrieve',search:'json format minify',message:'buscar',steps:[]}:proposal([step('json-format',{text:'{}'})]),usage:{inputTokens:10,outputTokens:10}})});
 assert.equal(calls,2);assert.equal(r.metrics.retrievals,1);assert.equal(r.metrics.repairs,0);
});
test('repeated malformed plans stop after exactly two proposals',async()=>{
 let calls=0;await assert.rejects(planWithQueen(env(),{text:'Interpreta estos datos y selecciona JSON format',files:[]},{...dependencies,infer:async()=>{calls++;return {plan:proposal([step('shell')]),usage:{}};}}),/PLAN_REJECTED/);assert.equal(calls,2);
});
test('question wording cannot be promoted into tool execution by a model',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'¿Cómo se podría organizar el contenido?',files:[]},dependencies),/PLAN_REJECTED/);
});
test('origin, content type and missing auth are safe explicit failures at the public endpoint',async()=>{
 const make=(headers,body='{}')=>new Request('https://app/api/core/plan',{method:'POST',headers,body});
 assert.equal((await onRequestPost({request:make({}),env:{}})).status,403);
 assert.equal((await onRequestPost({request:make({Origin:'https://app'}),env:{}})).status,415);
 const r=await onRequestPost({request:make({Origin:'https://app','Content-Type':'application/json'},JSON.stringify({text:'consulta',files:[]})),env:{}});assert.equal(r.status,503);assert.equal((await r.json()).code,'QUEEN_DISABLED');
});
test('provider registry distinguishes advertised, executable and observed capabilities and excludes discarded vendors',()=>{
 const status={providers:{groq:true,kilo:true,amd:true,baidu:true},configured:{groq:true},providerHealth:{groq:{state:'configured'}},modelCatalog:{chat:{groq:[{id:'text-model'}]},creative:{kilo:[{id:'image-advertised-only'}]}},features:{}};
 const p=buildQueenProviderRegistry(status,{groq:{1:{lastSuccessAt:100}}});assert.deepEqual(p.map(p=>p.id),['groq','kilo']);
 assert.equal(p[0].authentication,'previous-success');assert.equal(p[0].capabilities[0].models[0].tested,false);assert.equal(p[1].capabilities.find(c=>c.kind==='image').executable,false);
 assert.equal(selectQueenDelegate(p,{kind:'image'}),null);
 assert.deepEqual(selectQueenDelegate(p,{manual:{mode:'manual',provider:'groq',model:'text-model'}}),{provider:'groq',model:'text-model'});
 assert.equal(selectQueenDelegate(p,{manual:{mode:'manual',provider:'groq',model:'invented'}}),null);
});
test('independent verifier detects formatted JSON with changed input data',async()=>{
 await assert.rejects(verifyQueenResult(step('json-format',{text:'{"a":1}'}),{text:'{"a":2}'}),/DATA_MISMATCH/);
 const verified=await verifyQueenResult(step('json-format',{text:'{"a":1}'}),{text:'{ "a": 1 }'});assert.equal(verified.verification.status,'verified');
});
test('independent verifier checks numeric line ordering through the real local engine',async()=>{
 const s=step('text-sort',{text:'item10\nitem2\nitem1'});const r=await verifyQueenResult(s,await runTool(s.tool_id,[],s.params));assert.equal(r.verification.status,'verified');
});
test('generated prose remains verification-pending even when the model says succeeded',async()=>{
 const r=await verifyQueenResult(step('ai-assistant',{prompt:'test'}),{text:'succeeded',verification:{status:'validated'}});assert.equal(r.verification.status,'partial');
});
test('DAG executes real local JSON transforms, hands off text and verifies without network',async()=>{
 const p=validateQueenPlan(proposal([step('json-format',{text:'{"a":1}'}),step('json-minify',{},['step:s1'],['s1'],'s2')]));
 const r=await executeQueenDAG(p,[],{run:runTool});assert.equal(r.status,'verified');assert.equal(r.results[1].result.text,'{"a":1}');assert.equal(r.ledger[1].status,'verified');
});
test('completed DAG steps are idempotent, changed params cannot reuse their records',async()=>{
 const state=createQueenExecutionState(),p=validateQueenPlan(proposal([step('json-format',{text:'{}'})]));let calls=0;
 const options={state,run:async(...args)=>{calls++;return runTool(...args);}};
 await executeQueenDAG(p,[],options);await executeQueenDAG(p,[],options);assert.equal(calls,1);
 await assert.rejects(executeQueenDAG({...p,steps:[step('json-format',{text:'[]'})]},[],options),/IDEMPOTENCY_CONFLICT/);
});
test('failure preserves completed steps and never executes dependent steps',async()=>{
 const p=validateQueenPlan(proposal([step('json-format',{text:'{}'}),step('json-minify',{},['step:s1'],['s1'],'s2')]));
 await assert.rejects(executeQueenDAG(p,[],{run:async(id,...args)=>{if(id==='json-minify')throw Error('failure');return runTool(id,...args);}}),e=>e.partialResults.length===1&&e.ledger.at(-1).status==='failed');
});
test('a previously validated label cannot hide corrupt artifact bytes',async()=>{
 await assert.rejects(verifyQueenResult(step('pdf-extract',{pages:'1'}),{blob:new Blob(['bad'],{type:'application/pdf'}),filename:'fake.pdf',verification:{status:'validated'}}),/firma/);
});
test('DAG rejects unapproved external operations, cancellation and time exhaustion',async()=>{
 const p=validateQueenPlan(proposal([step('ai-assistant',{prompt:'test'})]));let calls=0;
 await assert.rejects(executeQueenDAG(p,[],{run:async()=>{calls++;}}),/NOT_AUTHORIZED/);assert.equal(calls,0);
 const local=validateQueenPlan(proposal([step('json-format',{text:'{}'})]));
 await assert.rejects(executeQueenDAG(local,[],{cancel:()=>true,run:runTool}),/CANCELLED/);
 await assert.rejects(executeQueenDAG(local,[],{maxMs:5,run:async()=>new Promise(()=>{})}),/TIME_BUDGET/);
});
test('bounded local recovery only changes the failed step parameters and does not replay predecessors',async()=>{
 const p=validateQueenPlan(proposal([step('json-format',{text:'not-json'})]));let calls=0,corrections=0;
 const r=await executeQueenDAG(p,[],{run:async(...args)=>{calls++;return runTool(...args);},repair:async()=>{corrections++;return step('json-format',{text:'{}'});}});
 assert.equal(calls,2);assert.equal(corrections,1);assert.equal(r.metrics.repairs,1);
});
test('verification failure cannot trigger another execution or spend an external quota',async()=>{
 const p=validateQueenPlan(proposal([step('json-format',{text:'{}'})]));let repairs=0;
 await assert.rejects(executeQueenDAG(p,[],{run:async()=>({text:'[]'}),repair:async()=>{repairs++;}}),/DATA_MISMATCH/);assert.equal(repairs,0);
});
test('browser client sends only metadata and procedure references, with no files or conversation dumps',async()=>{
 const c=queenTaskContext({task:{text:'private old transcript',steps:[{tool_id:'pdf-text'}]}},{mode:'manual',provider:'groq',model:'test'});
 assert.ok(!JSON.stringify(c).includes('private'));
 await requestQueenPlan({text:'current request',files:[input],context:c},{fetchImpl:async(url,options)=>{
  assert.equal(url,'/api/core/plan');const payload=JSON.parse(options.body);assert.deepEqual(payload.files,[{name:'doc.pdf',type:'application/pdf',size:3}]);assert.ok(!options.body.includes('test-server-key'));return json({ok:true});
 }});
});

test('browser client aborts non-success responses so unread error bodies are cancelled',async()=>{
 let requestSignal,cancelled=false;
 const result=await requestQueenPlan({text:'current request'},{fetchImpl:async(url,options)=>{
  assert.equal(url,'/api/core/plan');requestSignal=options.signal;
  const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:422});
  // Native fetch binds its response stream to the request signal; mirror that in this mock.
  options.signal.addEventListener('abort',()=>{void response.body?.cancel().catch(()=>{});},{once:true});
  return response;
 }});
 assert.equal(result,null);
 assert.equal(requestSignal.aborted,true);
 assert.equal(cancelled,true);
});

test('provider observations persist model and modality evidence without promoting unrelated capabilities',async()=>{
 const {observeQueenProvider,readQueenProviderObservations}=await import('../functions/_lib/queen-observations.js');
 const e=env();await observeQueenProvider(e,{provider:'groq',model:'known-text',capability:'chat',status:200,durationMs:150,usage:{prompt_tokens:10,completion_tokens:5}});
 const observed=await readQueenProviderObservations(e);assert.equal(observed[0].successes,1);assert.equal(observed[0].input_tokens,10);
 const r=buildQueenProviderRegistry({providers:{groq:true},configured:{groq:true},providerHealth:{groq:{state:'configured'}},modelCatalog:{chat:{groq:[{id:'known-text'}]},audio:{groq:[{id:'whisper'}]}},features:{groqAudio:true}},{},observed);
 assert.equal(r[0].capabilities.find(c=>c.kind==='chat').models[0].tested,true);
 assert.equal(r[0].capabilities.find(c=>c.kind==='transcription').models[0].tested,false);
 assert.equal(r[0].latencyMs,150);assert.equal(r[0].authentication,'previous-success');
});
test('modality validation never accepts a chat model for image generation',()=>{
 const providers=[{id:'cloudflare',available:true,capabilities:[{kind:'chat',executable:true,models:[{id:'chat-only'}]}]}];
 assert.throws(()=>validateQueenPlan(proposal([step('image-gen',{prompt:'A landscape',provider:'cloudflare',model:'chat-only'})]),{providers}),/MODEL_UNAVAILABLE/);
});
test('resume after a failed step uses existing completion evidence without replaying its dependency',async()=>{
 const state=createQueenExecutionState(),p=validateQueenPlan(proposal([step('json-format',{text:'{}'}),step('json-minify',{},['step:s1'],['s1'],'s2')]));
 let failed=true,firstCalls=0;const run=async(id,...args)=>{if(id==='json-format')firstCalls++;if(id==='json-minify'&&failed)throw Error('temporary');return runTool(id,...args);};
 await assert.rejects(executeQueenDAG(p,[],{state,run}));failed=false;
 const complete=await executeQueenDAG(p,[],{state,run});assert.equal(complete.status,'verified');assert.equal(firstCalls,1);
});
test('task memory cancels the previous objective and retains same-format procedures only for follow-ups',async()=>{
 const {createTaskMemory}=await import('../src/core-task-memory.js');const {planCapabilityRequest}=await import('../src/core-capabilities.js');
 const memory=createTaskMemory(),old=new File(['old'],'old.png',{type:'image/png'}),next=new File(['new'],'new.png',{type:'image/png'});
 memory.save('chat',{files:[old],originals:[old],steps:[{tool_id:'image-convert',params:{format:'image/webp'}}]});
 const same=memory.resolve('chat','Haz lo mismo con este otro archivo',[next]);assert.equal(same.files[0],next);
 assert.equal(planCapabilityRequest('Haz lo mismo con este otro archivo',same.files,same.task).steps[0].params.format,'image/webp');
 assert.equal(memory.resolve('chat','No, no hagas lo anterior').cancelled,true);assert.equal(memory.get('chat'),null);
 memory.save('chat',{files:[old],steps:[{tool_id:'image-convert',params:{format:'image/webp'}}]});
 assert.equal(memory.resolve('chat','Calcula otra cosa completamente diferente').task,null);
});
test('new task IDs cannot inherit another task completion ledger',async()=>{
 const state=createQueenExecutionState();let calls=0;const run=async(...args)=>{calls++;return runTool(...args);};
 for(let i=0;i<2;i++)await executeQueenDAG(validateQueenPlan(proposal([step('json-format',{text:'{}'})])),[],{state,run});
 assert.equal(calls,2);
});
test('live confidence stays unknown until actual model cases are measured',async()=>{
 const {queenDecisionEvidence}=await import('../src/queen-plan.js');
 const evidence=queenDecisionEvidence(validateQueenPlan(proposal([step('json-format',{text:'{}'})])));
 assert.equal(evidence.semanticConfidence,null);assert.equal(evidence.calibration,'requires-authenticated-evaluation');
});

test('approved specialist delegation can execute after server capability validation while prose stays unverified',async()=>{
 const providers=[{id:'groq',available:true,capabilities:[{kind:'chat',executable:true,models:[{id:'text-model'}]}]}];
 const p=validateQueenPlan(proposal([step('ai-assistant',{prompt:'Análisis',provider:'groq',model:'text-model'})]),{providers});let calls=0;
 const result=await executeQueenDAG(p,[],{authorize:()=>true,run:async()=>{calls++;return {text:'Respuesta del especialista'};}});
 assert.equal(calls,1);assert.equal(result.executed,true);assert.equal(result.verified,false);
});

test('context compaction rechecks actual tokens without increasing context or generation concurrency',async()=>{
 let requests=0,compacted=0;
 const result=await inferQueen(env(),[{role:'user',content:'large input'}],{}, {compactMessages:()=>{compacted++;return [{role:'user',content:'small input'}];},fetchImpl:async url=>{
  requests++;if(url.endsWith('/slots'))return json([{id:0,is_processing:false}]);if(requests===2)return json({tokens:Array(2000).fill(1)});if(requests===3)return json({tokens:[1,2]});return json({choices:[{message:{content:JSON.stringify(proposal([],'clarify'))},finish_reason:'stop'}]});
 }});assert.equal(compacted,1);assert.equal(requests,4);assert.equal(result.plan.intent,'clarify');
});
test('ordinary online tools do not require an unrelated AI provider delegation',async()=>{
 const result=await planWithQueen(env(),{text:'Necesito consultar la cotización de monedas con currency',files:[]},{...dependencies,infer:async()=>({plan:proposal([step('currency',{amount:1,from:'USD',to:'COP'})]),usage:{inputTokens:10,outputTokens:10}})});
 assert.equal(result.plan.steps[0].tool_id,'currency');assert.equal(result.plan.steps[0].delegation,undefined);
});

test('archive resource limits reject oversized expansion before running ZIP decompression',async()=>{
 const {checkQueenArchiveBudget}=await import('../src/queen-verifier.js');
 const bytes=new ArrayBuffer(68),data=new DataView(bytes);data.setUint32(0,0x02014b50,true);data.setUint32(24,100*1024*1024,true);data.setUint32(46,0x06054b50,true);data.setUint16(56,1,true);data.setUint32(62,0,true);
 assert.throws(()=>checkQueenArchiveBudget(bytes),/ARCHIVE_RESOURCE_BUDGET/);
});

test('an uncertain external result cannot be retried when resuming the same task',async()=>{
 const p=validateQueenPlan(proposal([step('ai-assistant',{prompt:'test'})])),state=createQueenExecutionState();let calls=0;
 const options={state,authorize:()=>true,run:async()=>{calls++;throw Error('network failure');}};
 await assert.rejects(executeQueenDAG(p,[],options));
 await assert.rejects(executeQueenDAG(p,[],options),/EXTERNAL_OUTCOME_UNKNOWN/);assert.equal(calls,1);
});
