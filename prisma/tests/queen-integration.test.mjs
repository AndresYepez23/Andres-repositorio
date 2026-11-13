import test from 'node:test';
import assert from 'node:assert/strict';
import {queenCatalogSchema} from '../src/queen-schema.js';
import {queenToolCatalog,retrieveQueenTools,queenInflectedOperations} from '../src/queen-contracts.js';
import {queenIntentOptions,planWithQueen} from '../functions/api/core/plan.js';
import {measureQueenStream,inferQueen} from '../functions/_lib/queen.js';
import {queenHandoffFiles} from '../src/queen-handoff.js';
import {validateQueenPlan} from '../src/queen-plan.js';
import {executeQueenDAG,createQueenExecutionState} from '../src/queen-execution.js';
const env=()=>({QUEEN_ENABLED:'1',QUEEN_API_KEY:'test-key',QUEEN_ACCESS_CLIENT_ID:'test-id',QUEEN_ACCESS_CLIENT_SECRET:'test-secret',PRISMA_RATE_DB:{prepare:()=>({bind:(...v)=>({first:async()=>({owner:v[1]}),run:async()=>({})})})}});

test('compact grammar bounds live tool IDs and the application still rejects untyped file or parameter mistakes',()=>{
 const contracts=queenToolCatalog().filter(c=>['pdf-extract','pdf-to-word'].includes(c.id));
 const schema=queenCatalogSchema(contracts,[{name:'input.pdf'}],['execute','clarify']);
 const variants=schema.oneOf||[schema];const execute=variants.find(v=>v.properties.intent.enum.includes('execute'));
 assert.equal(execute.properties.steps.minItems,1);
 assert.deepEqual(execute.properties.steps.items.properties.tool_id.enum,contracts.map(c=>c.id));
 assert.equal(variants.find(v=>v.properties.intent.enum.includes('clarify')).properties.steps.maxItems,0);
 assert.throws(()=>validateQueenPlan({intent:'execute',message:'bad',steps:[{id:'s1',tool_id:'pdf-extract',params:{pages:'2'},inputs:[],dependsOn:[]}]}),/MISSING_INPUT/);
 assert.throws(()=>validateQueenPlan({intent:'execute',message:'bad',steps:[{id:'s1',tool_id:'pdf-to-word',params:{invented:true},inputs:['file:0'],dependsOn:[]}]},{files:[{name:'x.pdf',type:'application/pdf'}]}),/UNKNOWN_PARAMETER/);
});
test('commands, missing user data and informational questions have distinct permitted intents',()=>{
 assert.deepEqual(queenIntentOptions('Redimensiona esta imagen',{status:'needs-input'}),['clarify']);
 assert.ok(!queenIntentOptions('Formatea este JSON',{status:'ready'}).includes('question'));
 assert.ok(!queenIntentOptions('¿Puedes convertir este PDF?',{status:'needs-input'}).includes('execute'));
});
test('invented resize dimensions are rejected even if a model bypasses the output grammar',async()=>{
 let calls=0;
 await assert.rejects(planWithQueen(env(),{text:'Redimensiona esta imagen',files:[{name:'a.png',type:'image/png',size:100}]},{forceNeural:true,loadProviders:async()=>[],infer:async()=>{calls++;return {plan:{intent:'execute',message:'test',steps:[{id:'s1',tool_id:'image-resize',params:{width:100,height:100},inputs:['file:0'],dependsOn:[]}]},usage:{inputTokens:10,outputTokens:10}};}}),e=>e.code==='QUEEN_PLAN_REJECTED'&&e.diagnostics.trace.every(t=>t.validationError==='INTENT_CONFLICT'));
 assert.equal(calls,2);
});
test('explicit intermediate tool IDs survive file compatibility bias in retrieval',()=>{
 const ids=retrieveQueenTools('Convierte mediante pdf-to-image y después image-ocr',[{name:'scan.pdf',type:'application/pdf'}],3).map(c=>c.id);
 assert.ok(ids.includes('pdf-to-image'));assert.ok(ids.includes('image-ocr'));
});
test('Spanish clitic verbs retrieve intermediate operations without interpreting quoted payloads as commands',()=>{
 const request='Formatea el JSON y después minifícalo: {"a":1}';
 assert.ok(retrieveQueenTools(request,[],3).some(c=>c.id==='json-minify'));
 assert.deepEqual(queenInflectedOperations('Formatea JSON: {"nota":"minifícalo"}'),[]);
});
test('a compound PDF request reaches Queen when the old local planner found only its final conversion',async()=>{
 let calls=0;const files=[{name:'x.pdf',type:'application/pdf',size:100}];
 const r=await planWithQueen(env(),{text:'Extrae la segunda página y después convierte el PDF a Word',files},{loadProviders:async()=>[],infer:async()=>{calls++;return {plan:{intent:'execute',message:'test',steps:[{id:'s1',tool_id:'pdf-extract',params:{pages:'2'},inputs:['file:0'],dependsOn:[]},{id:'s2',tool_id:'pdf-to-word',params:{},inputs:['step:s1'],dependsOn:['s1']}]},usage:{inputTokens:10,outputTokens:10}};}});
 assert.equal(calls,1);assert.equal(r.source,'queen');assert.equal(r.plan.steps.length,2);
});
test('declaring a PDF dependency while consuming the original file is rejected before conversion',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'Extrae la segunda página del PDF y después conviértela a Word',files:[{name:'x.pdf',type:'application/pdf',size:100}]},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>({plan:{intent:'execute',message:'bad',steps:[{id:'s1',tool_id:'pdf-extract',params:{pages:'2'},inputs:['file:0'],dependsOn:[]},{id:'s2',tool_id:'pdf-to-word',params:{},inputs:['file:0'],dependsOn:['s1']}]},usage:{inputTokens:10,outputTokens:10}})}),e=>e.diagnostics.trace[0].validationError==='DEPENDENCY_INPUT_REQUIRED:s2:s1');
});
test('model edits to literal JSON data are rejected before any execution',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'Formatea JSON: {"a":1}',files:[]},{forceNeural:true,loadProviders:async()=>[],infer:async()=>({plan:{intent:'execute',message:'test',steps:[{id:'s1',tool_id:'json-format',params:{text:'{"a":2}'},inputs:[],dependsOn:[]}]},usage:{inputTokens:10,outputTokens:10}})}),e=>e.code==='QUEEN_PLAN_REJECTED'&&e.diagnostics.trace.every(t=>t.validationError==='JSON_PAYLOAD_CHANGED'));
});
test('an unavailable image specialist cannot be replaced by an unrelated chat provider',async()=>{
 const r=await planWithQueen(env(),{text:'Genera una imagen de una montaña',files:[]},{forceNeural:true,loadProviders:async()=>[{id:'kilo',available:true,capabilities:[{kind:'chat',executable:true,models:[{id:'free-chat'}]}]}],infer:async(_env,_messages,schema)=>{
  assert.ok(!schema.properties.intent.enum.includes('execute'));
  return {plan:{intent:'delegate',message:'Conecta un motor de imágenes.',steps:[]},usage:{inputTokens:10,outputTokens:10}};
 }});
 assert.equal(r.delegate,null);assert.deepEqual(r.delegationUnavailable,{capability:'image',code:'NO_COMPATIBLE_PROVIDER'});
});
test('a requested spreadsheet cannot be satisfied by PDF metadata operations',async()=>{
 const r=await planWithQueen(env(),{text:'Extrae los datos de este PDF escaneado y entrégamelos en Excel',files:[{name:'scan.pdf',type:'application/pdf',size:100}]},{forceNeural:true,loadProviders:async()=>[],infer:async(_env,_messages,schema)=>{
  assert.ok(!schema.properties.intent.enum.includes('execute'));
  return {plan:{intent:'clarify',message:'¿Qué columnas necesitas?',steps:[]},usage:{inputTokens:10,outputTokens:10}};
 }});assert.equal(r.plan.intent,'clarify');
});
test('a checkpoint may reduce the inference budget to one without losing rejected output usage',async()=>{
 let calls=0;
 await assert.rejects(planWithQueen(env(),{text:'Formatea JSON: {}',files:[]},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>{calls++;return {plan:{intent:'execute',message:'bad',steps:[]},usage:{inputTokens:10,outputTokens:3}};}}),e=>e.code==='QUEEN_PLAN_REJECTED'&&e.diagnostics.inferences===1&&e.diagnostics.inputTokens===10);
 assert.equal(calls,1);
});
test('a proposed execution message cannot announce tool success before execution',()=>{
 const p=validateQueenPlan({intent:'execute',message:'Archivo creado correctamente',steps:[{id:'s1',tool_id:'json-format',params:{text:'{}'},inputs:[],dependsOn:[]}]});
 assert.ok(!p.message.includes('creado'));assert.equal(p.execution.verified,false);
});
test('same task cannot reuse results for changed file bytes even when names and sizes match',async()=>{
 const plan=validateQueenPlan({intent:'execute',message:'test',steps:[{id:'s1',tool_id:'image-metadata',params:{},inputs:['file:0'],dependsOn:[]}]},{files:[{name:'same.png',type:'image/png'}]});
 const a=new File(['a'],'same.png',{type:'image/png'}),b=new File(['b'],'same.png',{type:'image/png'}),state=createQueenExecutionState();let calls=0;
 const options={state,run:async()=>{calls++;return {text:'metadata fixture'};}};
 await executeQueenDAG(plan,[a],options);
 await assert.rejects(executeQueenDAG(plan,[b],options),/INPUT_FILES_CHANGED/);assert.equal(calls,1);
 await executeQueenDAG({...plan,taskId:crypto.randomUUID()},[b],options);assert.equal(calls,2);
});
test('SSE requires a finish event and DONE, handles split chunks and retains both authentication layers',async()=>{
 const events=[{choices:[{delta:{content:'PRISMA'},finish_reason:null}]},{choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:3}}];
 const body=events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n';
 const r=await measureQueenStream(env(),{fetchImpl:async(_url,options)=>{
  assert.equal(options.headers['CF-Access-Client-Secret'],'test-secret');assert.equal(options.headers.Authorization,'Bearer test-key');
  assert.equal(JSON.parse(options.body).chat_template_kwargs.enable_thinking,false);
  return new Response(new ReadableStream({start(c){for(let i=0;i<body.length;i+=7)c.enqueue(new TextEncoder().encode(body.slice(i,i+7)));c.close();}}),{headers:{'content-type':'text/event-stream'}});
 }});
 assert.equal(r.finishReason,'stop');assert.deepEqual(r.usage,{inputTokens:8,outputTokens:3});assert.equal(r.contentCharacters,6);
 await assert.rejects(measureQueenStream(env(),{fetchImpl:async()=>new Response('data: '+JSON.stringify(events[0])+'\n\n',{headers:{'content-type':'text/event-stream'}})}),/INCOMPLETE_STREAM/);
});
test('staging observes the real llama slot before sending another tokenize or completion request',async()=>{
 let calls=0;
 await assert.rejects(inferQueen({...env(),QUEEN_STAGE:'staging'},[],{}, {fetchImpl:async()=>{calls++;return new Response('[{"id":0,"is_processing":true}]',{headers:{'content-type':'application/json'}});}}),e=>e.code==='QUEEN_BUSY'&&e.diagnostics.completionTransportAttempted===false);
 assert.equal(calls,1);
});

function tinyArchive(){const bytes=new Uint8Array(46+22),v=new DataView(bytes.buffer);v.setUint32(0,0x02014b50,true);v.setUint32(24,24,true);v.setUint32(46,0x06054b50,true);v.setUint16(56,1,true);v.setUint32(62,0,true);return bytes;}
test('PDF image archive handoff permits only bounded PNG members from the existing producer',async()=>{
 const data=new Uint8Array(24);data.set([137,80,78,71,13,10,26,10]);const v=new DataView(data.buffer);v.setUint32(16,120);v.setUint32(20,80);
 const zipFile=new File([tinyArchive()],'pages.zip',{type:'application/zip'});
 let entry='pagina-001.png';
 const load=async()=>({default:{loadAsync:async()=>({files:{[entry]:{async:async()=>data}}})}});
 const files=await queenHandoffFiles('pdf-to-image','image-ocr',[zipFile],{load});assert.equal(files[0].type,'image/png');assert.equal(files[0].size,24);
 entry='../secret.png';await assert.rejects(queenHandoffFiles('pdf-to-image','image-ocr',[zipFile],{load}),/INVALID_MEMBER/);
 entry='pagina-001.png';v.setUint32(16,10000);v.setUint32(20,10000);await assert.rejects(queenHandoffFiles('pdf-to-image','image-ocr',[zipFile],{load}),/PIXEL_BUDGET/);
 assert.deepEqual(await queenHandoffFiles('untrusted','image-ocr',[zipFile],{load}),[zipFile]);
});
