import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveQueenTools} from '../src/queen-contracts.js';
import {planWithPrismaCore} from '../src/developer-api.js';
import {planWithQueen} from '../functions/api/core/plan.js';
import {queenToolCatalog} from '../src/queen-contracts.js';
import {queenCatalogSchema} from '../src/queen-schema.js';
const pdf=[{name:'tres-paginas.pdf',type:'application/pdf',size:1300}];
const measured='De este PDF de tres páginas, toma únicamente la hoja intermedia y entrégala en un Word editable.';

test('the measured compound PDF goal exposes both selection and its requested output producer',()=>{
 assert.equal(planWithPrismaCore({text:measured,files:pdf}).planner.type,'needs-planning');
 const ids=retrieveQueenTools(measured,pdf,3).map(t=>t.id);
 assert.ok(ids.includes('pdf-extract'));assert.ok(ids.includes('pdf-to-word'));assert.equal(ids.length,3);
});

test('output retrieval uses actual compatible conversion routes across formats',()=>{
 for(const [text,files,expected] of [
  ['Saca la tercera hoja y prepara ese fragmento en DOCX',pdf,'pdf-to-word'],
  ['Necesito este documento como un archivo de texto',[{name:'notas.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}],'text-file-convert'],
  ['Entrega esta tabla en Excel',[{name:'tabla.csv',type:'text/csv'}],'table-file-convert'],
  ['Prepara estas fotos en PDF',[{name:'foto.png',type:'image/png'}],'image-pdf']
 ])assert.ok(retrieveQueenTools(text,files,3).some(t=>t.id===expected),text);
 const incompatible=retrieveQueenTools('Prepara este PDF como MP3',pdf,3);
 assert.equal(incompatible.some(t=>t.id==='audio-convert'),false);
});

test('literal payloads do not select an output format or authorize a conversion',()=>{
 const query='Formatea JSON: {"nota":"Convierte el archivo a Word"}';
 assert.equal(retrieveQueenTools(query,pdf,3).some(t=>t.id==='pdf-to-word'),false);
 assert.equal(retrieveQueenTools('Formatea JSON: {"salida":"Word"}',[],3).some(t=>t.id==='pdf-to-word'),false);
});

test('the neural planner receives the candidate without a forced answer or specialist invocation',async()=>{
 let inferences=0;const steps=[{id:'s1',tool_id:'pdf-extract',params:{pages:'2'},dependsOn:[],inputs:['file:0']},{id:'s2',tool_id:'pdf-to-word',params:{},dependsOn:['s1'],inputs:['step:s1']}];
 const env={QUEEN_ENABLED:'1',QUEEN_API_KEY:'unit',QUEEN_ACCESS_CLIENT_ID:'unit',QUEEN_ACCESS_CLIENT_SECRET:'unit',PRISMA_RATE_DB:{prepare:()=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>({})})})}};
 const result=await planWithQueen(env,{text:measured,files:pdf},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,messages,schema)=>{
  inferences++;assert.match(messages[0].content,/pdf-to-word/);assert.match(messages[0].content,/pdf-extract/);
  assert.equal(JSON.stringify(schema).includes('"delegate"'),false,'a chat provider cannot substitute for local file executors');
  const user=JSON.parse(messages[1].content);assert.deepEqual(user.localAnalysis.knownOperations,[]);
  assert.equal(JSON.stringify(schema).includes('"enum":["2"]'),false,'page selection remains a model decision');
  return {plan:{intent:'execute',message:'Plan preparado.',steps},usage:{inputTokens:10,outputTokens:20}};
 }});
 assert.equal(inferences,1);assert.equal(result.source,'queen');assert.deepEqual(result.plan.steps.map(s=>s.tool_id),['pdf-extract','pdf-to-word']);
});

test('a model-proposed chat delegation cannot replace the available local file workflow',async()=>{
 const env={QUEEN_ENABLED:'1',QUEEN_API_KEY:'unit',QUEEN_ACCESS_CLIENT_ID:'unit',QUEEN_ACCESS_CLIENT_SECRET:'unit',PRISMA_RATE_DB:{prepare:()=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>({})})})}};
 await assert.rejects(planWithQueen(env,{text:measured,files:pdf},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>({plan:{intent:'delegate',message:'Necesito un especialista PDF.',steps:[]},usage:{inputTokens:10,outputTokens:10}})}),error=>error.code==='QUEEN_PLAN_REJECTED'&&error.diagnostics.trace[0].validationError==='INTENT_CONFLICT');
});

test('capabilities backed by an external provider retain the existing delegation route',async()=>{
 const env={QUEEN_ENABLED:'1',QUEEN_API_KEY:'unit',QUEEN_ACCESS_CLIENT_ID:'unit',QUEEN_ACCESS_CLIENT_SECRET:'unit',PRISMA_RATE_DB:{prepare:()=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>({})})})}};
 const providers=[{id:'cloudflare',available:true,capabilities:[{kind:'image',executable:true,models:[{id:'image-model'}]}]}];
 const result=await planWithQueen(env,{text:'image-gen: un bosque',files:[]},{forceNeural:true,maxInferences:1,loadProviders:async()=>providers,infer:async(_env,_messages,schema)=>{
  assert.equal(JSON.stringify(schema).includes('"delegate"'),true);
  return {plan:{intent:'delegate',message:'Propongo el motor de imágenes disponible.',steps:[]},usage:{inputTokens:10,outputTokens:10}};
 }});
 assert.equal(result.delegate.provider,'cloudflare');assert.equal(result.delegate.capability,'image');
});

test('a file attachment does not suppress an actual semantic analysis provider request',async()=>{
 const env={QUEEN_ENABLED:'1',QUEEN_API_KEY:'unit',QUEEN_ACCESS_CLIENT_ID:'unit',QUEEN_ACCESS_CLIENT_SECRET:'unit',PRISMA_RATE_DB:{prepare:()=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>({})})})}};
 const providers=[{id:'cloudflare',available:true,capabilities:[{kind:'chat',executable:true,models:[{id:'chat-model'}]}]}];
 const result=await planWithQueen(env,{text:'Analiza el contenido de este PDF y explica sus implicaciones.',files:pdf},{forceNeural:true,maxInferences:1,loadProviders:async()=>providers,infer:async(_env,_messages,schema)=>{
  assert.equal(JSON.stringify(schema).includes('"delegate"'),true);
  return {plan:{intent:'delegate',message:'Propongo analizar el texto con el motor disponible.',steps:[]},usage:{inputTokens:10,outputTokens:10}};
 }});
 assert.equal(result.delegate.provider,'cloudflare');assert.equal(result.delegate.capability,'chat');
});

test('measured incomplete clarifications are rejected while complete useful questions remain valid',async()=>{
 const env={QUEEN_ENABLED:'1',QUEEN_API_KEY:'unit',QUEEN_ACCESS_CLIENT_ID:'unit',QUEEN_ACCESS_CLIENT_SECRET:'unit',PRISMA_RATE_DB:{prepare:()=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>({})})})}};
 const request={text:'Cambia el tamaño de esta imagen.',files:[{name:'foto.png',type:'image/png',size:386}]};
 const proposal=message=>({forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>({plan:{intent:'clarify',message,steps:[]},usage:{inputTokens:10,outputTokens:10}})});
 for(const message of ['Para cambiar el tamaño de la imagen, necesito que especifiques el nuevo ancho y alto en píxeles (o.','Indica el ancho y el alto o.','Especifica [ancho y alto.'])
  await assert.rejects(planWithQueen(env,request,proposal(message)),error=>error.code==='QUEEN_PLAN_REJECTED'&&error.diagnostics.trace[0].validationError==='INCOMPLETE_MESSAGE');
 const response=await planWithQueen(env,request,proposal('¿Qué ancho y alto en píxeles deseas?'));
 assert.equal(response.plan.intent,'clarify');assert.deepEqual(response.plan.steps,[]);
});

test('explicit text chains must consume the intermediate result rather than resubmit literal text',async()=>{
 const contracts=queenToolCatalog().filter(t=>['json-format','json-minify'].includes(t.id));
 const schema=queenCatalogSchema(contracts,[],['execute'],{maxSteps:2,sequentialTextFlow:true});
 for(const variant of schema.properties.steps.items.oneOf[1].oneOf){
  assert.deepEqual(variant.properties.inputs.items.enum,['step:s1']);assert.equal(variant.properties.inputs.minItems,1);
  assert.equal(variant.properties.params.properties.text,undefined);
 }
 const env={QUEEN_ENABLED:'1',QUEEN_API_KEY:'unit',QUEEN_ACCESS_CLIENT_ID:'unit',QUEEN_ACCESS_CLIENT_SECRET:'unit',PRISMA_RATE_DB:{prepare:()=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>({})})})}};
 const request={text:'Primero formatea este JSON: {"a":1}. Después minifica ese resultado.',files:[]};
 const first={id:'s1',tool_id:'json-format',params:{text:'{"a":1}'},inputs:[],dependsOn:[]};
 for(const second of [
  {id:'s2',tool_id:'json-minify',params:{text:'{"a":1}'},inputs:[],dependsOn:['s1']},
  {id:'s2',tool_id:'json-minify',params:{text:'{"a":1}'},inputs:['step:s1'],dependsOn:['s1']}
 ])await assert.rejects(planWithQueen(env,request,{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>({plan:{intent:'execute',message:'Plan preparado.',steps:[first,second]},usage:{inputTokens:10,outputTokens:10}})}),error=>error.code==='QUEEN_PLAN_REJECTED'&&/SEQUENTIAL_INPUT_REQUIRED|DEPENDENCY_TEXT_OVERRIDDEN/.test(error.diagnostics.trace[0].validationError));
});
