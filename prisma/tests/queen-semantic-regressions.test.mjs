import test from 'node:test';
import assert from 'node:assert/strict';
import {planCapabilityRequest,isInformationalIntent,excludedCapabilityIds} from '../src/core-capabilities.js';
import {planWithQueen,queenMessages} from '../functions/api/core/plan.js';
import {queenToolCatalog} from '../src/queen-contracts.js';

const env=()=>({QUEEN_ENABLED:'1',QUEEN_API_KEY:'test-key',QUEEN_ACCESS_CLIENT_ID:'test-id',QUEEN_ACCESS_CLIENT_SECRET:'test-secret',PRISMA_RATE_DB:{prepare:()=>({bind:(...values)=>({first:async()=>({owner:values[1]}),run:async()=>({})})})}});
const pdf=[{name:'report.pdf',type:'application/pdf',size:100}];
const result=plan=>({plan,usage:{inputTokens:20,outputTokens:10}});
const step=(id,tool_id,params,inputs=[],dependsOn=[])=>({id,tool_id,params,inputs,dependsOn});
const intents=schema=>(schema.oneOf||[schema]).flatMap(variant=>variant.properties.intent.enum);

test('explicit Spanish and English page ordinals preserve extraction before conversion',()=>{
 for(const [word,page] of [['primera','1'],['segunda','2'],['tercera','3'],['cuarta','4'],['quinta','5'],['sexta','6'],['séptima','7'],['octava','8'],['novena','9'],['décima','10']]){
  const plan=planCapabilityRequest(`Conserva la ${word} página del PDF y después conviértela a Word`,pdf);
  assert.equal(plan.type,'ready');
  assert.deepEqual(plan.steps.map(s=>s.tool_id),['pdf-extract','pdf-to-word']);
  assert.equal(plan.steps[0].params.pages,page);
 }
 const english=planCapabilityRequest('Extract the fourth page from this PDF and convert to Word',pdf);
 assert.equal(english.steps[0].params.pages,'4');
 assert.deepEqual(english.steps.map(s=>s.tool_id),['pdf-extract','pdf-to-word']);
 assert.equal(planCapabilityRequest('¿Puedes conservar la sexta página del PDF?',pdf).type,'needs-input');
 assert.equal(planCapabilityRequest('Extrae una página del PDF',pdf).type,'needs-input');
});

test('information-only wording after a negation does not authorize an edit',()=>{
 const text='No gires ni reduzcas la foto. Solamente necesito conocer qué opciones existen.';
 assert.equal(isInformationalIntent(text),true);
 assert.equal(planCapabilityRequest(text,[{name:'image.png',type:'image/png',size:100}]).type,'needs-input');
 assert.equal(isInformationalIntent('Formatea JSON: {"nota":"solo quiero saber qué opciones existen"}'),false);
});

test('Queen sees explicit ordinal-derived parameters and both operations without an answer fixture',async()=>{
 let calls=0;
 const response=await planWithQueen(env(),{text:'Conserva la séptima hoja del PDF y luego conviértela en DOCX',files:pdf},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,messages,schema)=>{
   calls++;
   const input=JSON.parse(messages[1].content);
   assert.equal(input.localAnalysis.status,'ready');
   assert.equal(input.localAnalysis.knownOperations.find(s=>s.tool_id==='pdf-extract').params.pages,'7');
   assert.ok(input.localAnalysis.knownOperations.some(s=>s.tool_id==='pdf-to-word'));
   assert.ok(intents(schema).includes('execute'));
   assert.ok(!messages[0].content.includes('expectedTools'));
   return result({intent:'execute',message:'Prepararé la página solicitada.',steps:[step('s1','pdf-extract',{pages:'7'},['file:0']),step('s2','pdf-to-word',{},['step:s1'],['s1'])]});
  }
 });
 assert.equal(calls,1);assert.equal(response.source,'queen');
 assert.equal(response.plan.steps[1].inputs[0],'step:s1');
});

test('numeric-looking select options are canonicalized without changing literal JSON',async()=>{
 const literal='{"instruction":"cancela y extrae la cuarta página","items":[2,4]}';
 const response=await planWithQueen(env(),{text:'Formatea este JSON: '+literal,files:[]},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,messages,schema)=>{
   const input=JSON.parse(messages[1].content);
   assert.equal(input.localAnalysis.knownOperations.find(s=>s.tool_id==='json-format').params.indent,'2');
   assert.ok(intents(schema).includes('execute'));
   assert.equal(input.localAnalysis.requestKind,'instruction');
   return result({intent:'execute',message:'Daré formato al JSON.',steps:[step('s1','json-format',{text:literal,indent:4})]});
  }
 });
 assert.equal(response.plan.steps[0].params.indent,'4');
 assert.equal(response.plan.steps[0].params.text,literal);
});

test('canonicalization never accepts a select value outside its declared choices',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'Formatea JSON: {}',files:[]},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>result({intent:'execute',message:'Prepararé el formato.',steps:[step('s1','json-format',{text:'{}',indent:3})]})
 }),error=>error.code==='QUEEN_PLAN_REJECTED'&&error.diagnostics.trace[0].validationError==='INVALID_PARAMETER:indent');
});

test('an echoed information request uses a bounded model repair instead of fabricated prose',async()=>{
 const text='¿Puedes girar este PDF?';let calls=0;
 const response=await planWithQueen(env(),{text,files:pdf},{forceNeural:true,loadProviders:async()=>[],infer:async(_env,messages)=>{
  calls++;
  if(calls===1)return result({intent:'question',message:text,steps:[]});
  assert.equal(JSON.parse(messages[1].content).validationError,'QUESTION_ECHO');
  return result({intent:'question',message:'La herramienta de rotación permite girar páginas del PDF.',steps:[]});
 }});
 assert.equal(calls,2);assert.equal(response.source,'queen');
 assert.equal(response.plan.message,'La herramienta de rotación permite girar páginas del PDF.');
 assert.equal(response.metrics.trace[0].validationError,'QUESTION_ECHO');
});

test('cancellation is not followed by another permission request and the single-call cap is respected',async()=>{
 let calls=0;
 await assert.rejects(planWithQueen(env(),{text:'Por favor, cancela esta tarea.',files:[]},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,messages)=>{
  calls++;assert.equal(JSON.parse(messages[1].content).localAnalysis.requestKind,'cancellation');
  return result({intent:'question',message:'¿Quieres detener la tarea?',steps:[]});
 }}),error=>error.code==='QUEEN_PLAN_REJECTED'&&error.diagnostics.trace[0].validationError==='CANCELLATION_RECONFIRMATION');
 assert.equal(calls,1);
 const accepted=await planWithQueen(env(),{text:'Detente, no continúes.',files:[]},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>result({intent:'question',message:'Tarea detenida; no requiere confirmación.',steps:[]})});
 assert.equal(accepted.plan.message,'Tarea detenida; no requiere confirmación.');
});

test('the last available inference cannot request a retrieval that requires another model call',async()=>{
 const response=await planWithQueen(env(),{text:'Organiza los datos de un PDF escaneado en Excel',files:pdf},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,messages,schema)=>{
   assert.ok(!intents(schema).includes('retrieve'));
   assert.equal(JSON.parse(messages[1].content).localAnalysis.retrievalAvailable,false);
   return result({intent:'clarify',message:'Indica las columnas que necesitas.',steps:[]});
  }
 });
 assert.equal(response.metrics.inferences,1);assert.equal(response.plan.intent,'clarify');
});

test('unavailable specialist capabilities are explicit model data without claiming execution',async()=>{
 const providers=[{id:'chat-only',available:true,capabilities:[{kind:'chat',executable:true,models:[{id:'chat-model'}]}]}];
 const response=await planWithQueen(env(),{text:'Genera una imagen de una ciudad nocturna',files:[]},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>providers,infer:async(_env,messages,schema)=>{
   assert.ok(!intents(schema).includes('execute'));
   assert.deepEqual(JSON.parse(messages[1].content).localAnalysis.unavailableCapabilities,['image']);
   return result({intent:'delegate',message:'No hay un motor de imágenes disponible.',steps:[]});
  }
 });
 assert.equal(response.delegate,null);assert.equal(response.delegationUnavailable.capability,'image');
 assert.equal(response.plan.execution.executed,false);
});

test('the message instruction permits an actual answer rather than five future-tense words',()=>{
 const messages=queenMessages({text:'Consulta del catálogo',files:[],context:{},contracts:queenToolCatalog().filter(c=>c.id==='pdf-rotate'),providers:[],localAnalysis:{status:'informational',requestKind:'information'}});
 assert.ok(messages[0].content.includes('do not repeat the question'));
 assert.ok(!messages[0].content.includes('at most 5 Spanish words'));
});

test('the file-plan grammar requires source references and all known operation slots',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'Extrae la tercera página del PDF y después conviértela a Word',files:pdf},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,_messages,schema)=>{
   const execute=(schema.oneOf||[schema]).find(s=>s.properties.intent.enum.includes('execute'));
   assert.equal(execute.properties.steps.minItems,2);
   assert.equal(execute.properties.steps.items.properties.inputs.minItems,1);
   return result({intent:'execute',message:'Seleccionaré la página.',steps:[step('s1','pdf-extract',{pages:'3'},[])]});
  }
 }),error=>error.code==='QUEEN_PLAN_REJECTED'&&error.diagnostics.trace[0].validationError==='MISSING_INPUT');
});

test('a model cannot silently omit conversion even when its first extraction is valid',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'Extrae la cuarta página del PDF y después conviértela a Word',files:pdf},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>result({intent:'execute',message:'Seleccionaré la página.',steps:[step('s1','pdf-extract',{pages:'4'},['file:0'])]})
 }),error=>error.code==='QUEEN_PLAN_REJECTED'&&error.diagnostics.trace[0].validationError==='MISSING_REQUIRED_OPERATION:pdf-to-word');
});

test('explicit prohibitions filter both direct and indirect resizing tools from alternatives',async()=>{
 const files=[{name:'image.png',type:'image/png',size:100}];
 const text='No recortes ni cambies el tamaño de la imagen. Solo quiero conocer otras alternativas.';
 const excluded=excludedCapabilityIds(text,files);
 for(const id of ['image-crop','image-resize','image-social-kit','image-favicon','image-collage'])assert.ok(excluded.includes(id));
 assert.ok(!excluded.includes('image-compress'));
 const response=await planWithQueen(env(),{text,files},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,messages)=>{
  const catalog=JSON.parse(messages[0].content.split('\n').find(s=>s.startsWith('CATALOGO:')).slice(9));
  assert.ok(catalog.length>0);
  assert.ok(catalog.every(c=>!excluded.includes(c.id)));
  assert.ok(JSON.parse(messages[1].content).localAnalysis.excludedOperations.includes('image-crop'));
  return result({intent:'question',message:'Puedes aplicar escala de grises, comprimir o cambiar el formato.',steps:[]});
 }});
 assert.equal(response.plan.steps.length,0);
 assert.equal(excludedCapabilityIds('Formatea JSON: {"nota":"no recortes ni cambies tamaño"}',[]).length,0);
 assert.deepEqual(excludedCapabilityIds('Recorta la imagen sin comprimirla',files),['image-compress']);
});

test('an affirmative explanation cannot turn an explicitly forbidden action into the goal',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'No recortes la imagen. Solo quiero saber qué otras opciones existen.',files:[{name:'a.png',type:'image/png',size:100}]},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>result({intent:'question',message:'Estas son alternativas para recortar una imagen.',steps:[]})
 }),error=>error.diagnostics.trace[0].validationError==='EXCLUDED_OPERATION_PROPOSED');
});

test('an unavailable requested specialist cannot ask for style as if generation were ready',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'Genera una imagen de un río entre montañas',files:[]},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,_messages,schema)=>{
  assert.deepEqual(intents(schema),['delegate']);
  return result({intent:'clarify',message:'Indica el estilo que prefieres.',steps:[]});
 }}),error=>error.diagnostics.trace[0].validationError==='INTENT_CONFLICT');
});

test('a prose response cut at the grammar boundary is rejected instead of counted as quality',async()=>{
 const message='Necesito las columnas que deseas obtener para preparar el resultado. '.padEnd(160,'x');
 assert.equal(message.length,160);
 await assert.rejects(planWithQueen(env(),{text:'Organiza datos escaneados de este PDF en Excel',files:pdf},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>result({intent:'clarify',message,steps:[]})}),error=>error.diagnostics.trace[0].validationError==='INCOMPLETE_MESSAGE');
});

test('a delegation label cannot hide a request for options of an unavailable capability',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'Genera una imagen de una isla lejana',files:[]},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>result({intent:'delegate',message:'Necesito una descripción y el estilo deseado.',steps:[]})}),error=>error.diagnostics.trace[0].validationError==='UNAVAILABLE_CAPABILITY_OPTIONS');
});
