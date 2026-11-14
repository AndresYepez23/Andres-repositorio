import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveQueenTools} from '../src/queen-contracts.js';
import {planWithPrismaCore} from '../src/developer-api.js';
import {planWithQueen} from '../functions/api/core/plan.js';
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
