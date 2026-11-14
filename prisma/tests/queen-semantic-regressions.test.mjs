import test from 'node:test';
import assert from 'node:assert/strict';
import {planCapabilityRequest,isInformationalIntent,excludedCapabilityIds} from '../src/core-capabilities.js';
import {planWithQueen,queenMessages} from '../functions/api/core/plan.js';
import {queenToolCatalog} from '../src/queen-contracts.js';
import {queenCatalogSchema} from '../src/queen-schema.js';

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
   for(const slot of execute.properties.steps.items.oneOf)for(const variant of slot.oneOf||[slot])assert.equal(variant.properties.inputs.minItems,1);
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

test('an explicit sequential file task cannot become two independent original-file operations',async()=>{
 await assert.rejects(planWithQueen(env(),{text:'Extrae la quinta página del PDF y después conviértela a Word',files:pdf},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async()=>result({intent:'execute',message:'Prepararé los resultados.',steps:[step('s1','pdf-extract',{pages:'5'},['file:0']),step('s2','pdf-to-word',{},['file:0'])]})}),error=>error.diagnostics.trace[0].validationError==='SEQUENTIAL_INPUT_REQUIRED:s2:s1');
});

test('each step grammar permits only original files and preceding IDs, never own or future references',()=>{
 const contracts=queenToolCatalog().filter(c=>['pdf-extract','pdf-to-word'].includes(c.id));
 const schema=queenCatalogSchema(contracts,pdf,['execute'],{requiredToolIds:['pdf-extract','pdf-to-word'],maxSteps:3});
 assert.equal(schema.properties.steps.minItems,2);
 const variants=schema.properties.steps.items.oneOf;
 assert.equal(variants.length,3);
 for(let i=0;i<variants.length;i++){
  assert.equal(variants[i].oneOf.length,contracts.length);
  for(const variant of variants[i].oneOf){
   const properties=variant.properties;
   assert.deepEqual(properties.id.enum,['s'+(i+1)]);
   assert.deepEqual(properties.inputs.items.enum,['file:0',...Array.from({length:i},(_,n)=>'step:s'+(n+1))]);
   assert.equal(properties.inputs.minItems,1);
   assert.equal(properties.dependsOn.maxItems,i);
   if(i)assert.deepEqual(properties.dependsOn.items.enum,Array.from({length:i},(_,n)=>'s'+(n+1)));
   else assert.equal(properties.dependsOn.items.enum,undefined);
  }
 }
});

test('a short PDF grammar forbids uncontracted or nested params and keeps Word params empty',()=>{
 const contracts=queenToolCatalog().filter(c=>['pdf-extract','pdf-to-word'].includes(c.id));
 const schema=queenCatalogSchema(contracts,pdf,['execute'],{requiredToolIds:['pdf-extract','pdf-to-word'],maxSteps:2});
 for(const slot of schema.properties.steps.items.oneOf){
  const variants=slot.oneOf.map(variant=>variant.properties);
  const extract=variants.find(properties=>properties.tool_id.enum[0]==='pdf-extract');
  assert.deepEqual(extract.tool_id.enum,['pdf-extract']);
  assert.equal(extract.inputs.maxItems,1);
  assert.deepEqual(extract.params,{type:'object',additionalProperties:false,properties:{pages:{type:'string'}},required:['pages']});
  const word=variants.find(properties=>properties.tool_id.enum[0]==='pdf-to-word');
  assert.deepEqual(word.tool_id.enum,['pdf-to-word']);
  assert.equal(word.inputs.maxItems,1);
  assert.deepEqual(word.params,{type:'object',additionalProperties:false,properties:{},required:[]});
 }
 const multi={...contracts[0],inputs:{...contracts[0].inputs,multiple:true}};
 const multiSchema=queenCatalogSchema([multi],pdf,['execute'],{maxSteps:2});
 assert.equal(multiSchema.properties.steps.items.oneOf[0].properties.inputs.maxItems,20);
});

test('proven sequential file grammar consumes exactly the preceding transformed output',()=>{
 const contracts=queenToolCatalog().filter(c=>['pdf-extract','pdf-rotate','pdf-to-word'].includes(c.id));
 const schema=queenCatalogSchema(contracts,pdf,['execute'],{requiredToolIds:contracts.map(c=>c.id),maxSteps:3,sequentialFileFlow:true});
 for(const [index,slot] of schema.properties.steps.items.oneOf.entries())for(const variant of slot.oneOf){
  const properties=variant.properties;
  assert.equal(properties.inputs.minItems,1);assert.equal(properties.inputs.maxItems,1);
  if(index){
   assert.deepEqual(properties.inputs.items.enum,['step:s'+index]);
   assert.deepEqual(properties.dependsOn,{type:'array',minItems:1,maxItems:1,items:{type:'string',enum:['s'+index]}});
  }else{
   assert.deepEqual(properties.inputs.items.enum,['file:0']);
   assert.equal(properties.dependsOn.maxItems,0);
  }
 }
});

test('generic, observation and multi-file schemas retain original inputs instead of forcing a transform chain',()=>{
 const catalog=queenToolCatalog(),transforms=catalog.filter(c=>['pdf-extract','pdf-to-word'].includes(c.id));
 for(const contracts of [
  [...transforms.filter(c=>c.id==='pdf-extract'),catalog.find(c=>c.id==='pdf-metadata')],
  transforms.map(c=>({...c,inputs:{...c.inputs,multiple:true}}))
 ]){
  const schema=queenCatalogSchema(contracts,pdf,['execute'],{maxSteps:2,sequentialFileFlow:true});
  for(const variant of schema.properties.steps.items.oneOf[1].oneOf){
   assert.ok(variant.properties.inputs.items.enum.includes('file:0'));
   assert.equal(variant.properties.dependsOn.minItems,undefined);
  }
 }
 const generic=queenCatalogSchema(transforms,pdf,['execute'],{sequentialFileFlow:true});
 assert.ok(generic.properties.steps.items.properties.inputs.items.enum.includes('file:0'));
 assert.equal(generic.properties.steps.items.properties.dependsOn.minItems,undefined);
});

test('an explicit original-file goal does not constrain conversion to the extracted output',async()=>{
 await planWithQueen(env(),{text:'Extrae la segunda página del PDF y después convierte el PDF original a Word',files:pdf},{
  forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,_messages,schema)=>{
   const execute=(schema.oneOf||[schema]).find(v=>v.properties.intent.enum.includes('execute'));
   for(const variant of execute.properties.steps.items.oneOf[1].oneOf){
    assert.ok(variant.properties.inputs.items.enum.includes('file:0'));
    assert.equal(variant.properties.dependsOn.minItems,undefined);
   }
   return result({intent:'execute',message:'Plan preparado.',steps:[step('s1','pdf-extract',{pages:'2'},['file:0']),step('s2','pdf-to-word',{},['file:0'])]});
  }
 });
});

test('whole-document wording preserves the original input in both grammar and semantic validation',async()=>{
 for(const whole of ['todo el PDF','el PDF completo','el documento entero','todo el archivo']){
  const response=await planWithQueen(env(),{text:`Extrae la segunda página del PDF y después convierte ${whole} a Word`,files:pdf},{
   forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,_messages,schema)=>{
    const execute=(schema.oneOf||[schema]).find(v=>v.properties.intent.enum.includes('execute'));
    for(const variant of execute.properties.steps.items.oneOf[1].oneOf){
     assert.ok(variant.properties.inputs.items.enum.includes('file:0'));
     assert.equal(variant.properties.dependsOn.minItems,undefined);
    }
    return result({intent:'execute',message:'Plan preparado.',steps:[step('s1','pdf-extract',{pages:'2'},['file:0']),step('s2','pdf-to-word',{},['file:0'],['s1'])]});
   }
  });
  assert.deepEqual(response.plan.steps[1].inputs,['file:0']);
 }
});

test('whole-document wording in the first operation cannot bypass later result dependencies',async()=>{
 for(const dependsOn of [[],['s1']]){
  await assert.rejects(planWithQueen(env(),{text:'Comprime todo el PDF y después convierte ese resultado a Word',files:pdf},{
   forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,_messages,schema)=>{
    const execute=(schema.oneOf||[schema]).find(v=>v.properties.intent.enum.includes('execute'));
    for(const variant of execute.properties.steps.items.oneOf[1].oneOf){
     assert.deepEqual(variant.properties.inputs.items.enum,['step:s1']);
     assert.equal(variant.properties.dependsOn.minItems,1);
    }
    return result({intent:'execute',message:'Plan preparado.',steps:[step('s1','pdf-compress',{},['file:0']),step('s2','pdf-to-word',{},['file:0'],dependsOn)]});
   }
  }),error=>error.diagnostics.trace[0].validationError===(dependsOn.length?'DEPENDENCY_INPUT_REQUIRED:s2:s1':'SEQUENTIAL_INPUT_REQUIRED:s2:s1'));
 }
});

test('generation constrains intermediate input only when the later clause explicitly refers to it',async()=>{
 for(const [later,intermediate] of [['convierte el PDF a Word',false],['conviértela a Word',true],['convierte dicha salida a Word',true]]){
  await planWithQueen(env(),{text:'Extrae la segunda página del PDF y después '+later,files:pdf},{
   forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,_messages,schema)=>{
    const execute=(schema.oneOf||[schema]).find(v=>v.properties.intent.enum.includes('execute'));
    for(const variant of execute.properties.steps.items.oneOf[1].oneOf){
     if(intermediate){
      assert.deepEqual(variant.properties.inputs.items.enum,['step:s1']);
      assert.equal(variant.properties.dependsOn.minItems,1);
     }else{
      assert.ok(variant.properties.inputs.items.enum.includes('file:0'));
      assert.equal(variant.properties.dependsOn.minItems,undefined);
     }
    }
    return result({intent:'execute',message:'Plan preparado.',steps:[step('s1','pdf-extract',{pages:'2'},['file:0']),step('s2','pdf-to-word',{},['step:s1'],['s1'])]});
   }
  });
 }
});

test('small scalar contracts retain exact choices while dependency text remains optional only later',()=>{
 const contracts=queenToolCatalog().filter(c=>c.id==='json-format');
 const schema=queenCatalogSchema(contracts,[],['execute'],{maxSteps:2});
 const [first,later]=schema.properties.steps.items.oneOf.map(variant=>variant.properties.params);
 assert.deepEqual(first.required,['text']);assert.deepEqual(later.required,[]);
 assert.deepEqual(first.properties.indent,{type:'string',enum:['2','4','tab']});
 assert.deepEqual(first.properties.text,{type:'string'});
 assert.equal(first.additionalProperties,false);
});

test('complex or larger bounded contracts keep the compact untyped parameter fallback',()=>{
 const basic=queenToolCatalog().find(c=>c.id==='pdf-extract');
 for(const contracts of [
  [{...basic,parameters:{...basic.parameters,properties:{...basic.parameters.properties,details:{type:'object'}}}}],
  [{...basic,parameters:{...basic.parameters,properties:{a:{type:'string'},b:{type:'string'},c:{type:'string'}}}}],
  Array.from({length:4},(_,i)=>({...basic,id:'bounded-tool-'+i}))
 ]){
  const schema=queenCatalogSchema(contracts,pdf,['execute'],{maxSteps:2});
  const first=schema.properties.steps.items.oneOf[0];
  assert.equal(first.oneOf,undefined);
  assert.deepEqual(first.properties.params,{type:'object'});
  assert.deepEqual(first.properties.tool_id.enum,contracts.map(c=>c.id));
 }
});

test('literal-text grammar keeps first inputs and dependencies empty without an invalid empty enum',()=>{
 const contracts=queenToolCatalog().filter(c=>c.id==='json-format');
 const schema=queenCatalogSchema(contracts,[],['execute'],{maxSteps:2});
 const first=schema.properties.steps.items.oneOf[0].properties;
 assert.equal(first.inputs.minItems,0);assert.equal(first.inputs.maxItems,0);
 assert.equal(first.inputs.items.enum,undefined);
 assert.equal(first.dependsOn.maxItems,0);assert.equal(first.dependsOn.items.enum,undefined);
 assert.equal(schema.properties.steps.items.oneOf[1].properties.inputs.maxItems,20);
 const serialized=JSON.stringify(schema);
 assert.equal(serialized.includes('"enum":[]'),false);
});

test('generic or longer planning stays compact and delegates graph correctness to validation',()=>{
 const contracts=queenToolCatalog().filter(c=>['pdf-extract','pdf-to-word'].includes(c.id));
 const schema=queenCatalogSchema(contracts,pdf,['execute','clarify'],{requiredToolIds:['pdf-extract','pdf-to-word']});
 const execute=schema.oneOf.find(v=>v.properties.intent.enum.includes('execute'));
 assert.equal(execute.properties.steps.maxItems,8);
 assert.equal(execute.properties.steps.items.oneOf,undefined);
 assert.deepEqual(execute.properties.steps.items.properties.id.enum,Array.from({length:8},(_,i)=>'s'+(i+1)));
 assert.deepEqual(execute.properties.steps.items.properties.params,{type:'object'});
 assert.equal(execute.properties.steps.items.properties.inputs.maxItems,20);
 const clarify=schema.oneOf.find(v=>v.properties.intent.enum.includes('clarify'));
 assert.equal(clarify.properties.steps.maxItems,0);
 assert.deepEqual(clarify.properties.steps.items,{type:'object'});
 assert.ok(JSON.stringify(schema).length<2000);
});

test('execution grammar reserves output for the plan instead of replaceable prose or search',()=>{
 const contracts=queenToolCatalog().filter(c=>['pdf-extract','pdf-to-word'].includes(c.id));
 for(const maxSteps of [2,8]){
  const schema=queenCatalogSchema(contracts,pdf,['execute','clarify'],{requiredToolIds:['pdf-extract','pdf-to-word'],maxSteps});
  const execute=schema.oneOf.find(v=>v.properties.intent.enum.includes('execute'));
  assert.deepEqual(execute.properties.message,{type:'string',enum:['Plan preparado.']});
  assert.equal(execute.properties.search,undefined);
  const clarify=schema.oneOf.find(v=>v.properties.intent.enum.includes('clarify'));
  assert.deepEqual(clarify.properties.message,{type:'string',maxLength:160});
  assert.equal(clarify.properties.search,undefined);
 }
 const messages=queenMessages({text:'Extrae la segunda página y después conviértela a Word',files:pdf,context:{},contracts,providers:[]});
 assert.ok(messages[0].content.includes('Execute message: "Plan preparado."'));
 assert.ok(messages[0].content.includes('omit search for other intents'));
});

test('retrieval keeps its search field without expanding mixed non-execution grammar',()=>{
 const contracts=queenToolCatalog().filter(c=>c.id==='pdf-text');
 const schema=queenCatalogSchema(contracts,pdf,['execute','question','clarify','retrieve']);
 assert.equal(schema.oneOf.length,2);
 const execute=schema.oneOf.find(v=>v.properties.intent.enum.includes('execute'));
 assert.equal(execute.properties.search,undefined);
 const other=schema.oneOf.find(v=>v.properties.intent.enum.includes('retrieve'));
 assert.deepEqual(other.properties.intent.enum,['question','clarify','retrieve']);
 assert.deepEqual(other.properties.search,{type:'string',maxLength:160});
 assert.deepEqual(other.properties.message,{type:'string',maxLength:160});
});

test('a complete local file flow omits unrelated provider menus and empty UI preferences from the model only',async()=>{
 const providers=Array.from({length:9},(_,i)=>({id:'configured-provider-'+i,available:true,capabilities:[{kind:'chat',executable:true,models:[{id:'model-'+i}]}]}));
 let observed=false;
 const response=await planWithQueen(env(),{text:'Extrae la segunda página de este PDF y después convierte esa página a Word',files:pdf,
  context:{previousGoal:'',procedure:[],previousTools:[],preferences:{mode:'auto',provider:'',model:''}}},{
  forceNeural:true,maxInferences:2,loadProviders:async()=>{observed=true;return providers;},infer:async(_env,messages,schema)=>{
   assert.equal(observed,true);
   assert.deepEqual(JSON.parse(messages[1].content).context,{});
   const catalog=JSON.parse(messages[0].content.split('\n').find(line=>line.startsWith('CATALOGO:')).slice(9));
   assert.deepEqual(catalog.map(tool=>tool.id).sort(),['pdf-extract','pdf-to-word']);
   assert.ok(messages[0].content.includes('ESPECIALISTAS DISPONIBLES:[]'));
   assert.equal(messages[0].content.includes('configured-provider-'),false);
   assert.equal(intents(schema).includes('retrieve'),false);
   const execute=(schema.oneOf||[schema]).find(variant=>variant.properties.intent.enum.includes('execute'));
   for(const variant of execute.properties.steps.items.oneOf[1].oneOf){
    assert.deepEqual(variant.properties.inputs.items.enum,['step:s1']);
    assert.equal(variant.properties.dependsOn.minItems,1);
    assert.deepEqual(variant.properties.dependsOn.items.enum,['s1']);
   }
   return result({intent:'execute',message:'Prepararé la página solicitada.',steps:[step('s1','pdf-extract',{pages:'2'},['file:0']),step('s2','pdf-to-word',{},['step:s1'],['s1'])]});
  }
 });
 assert.equal(response.source,'queen');assert.equal(response.metrics.inferences,1);
});

test('a complete local flow retains meaningful procedure and manual preference context',async()=>{
 const context={previousGoal:'Preparar un informe',procedure:[{tool_id:'pdf-rotate',params:{degrees:90}}],previousTools:['pdf-rotate'],preferences:{mode:'manual',provider:'chosen-provider',model:'chosen-model'}};
 await planWithQueen(env(),{text:'Extrae la tercera página de este PDF y después conviértela a Word',files:pdf,context},{forceNeural:true,maxInferences:1,loadProviders:async()=>[],infer:async(_env,messages)=>{
  const sent=JSON.parse(messages[1].content).context;
  assert.equal(sent.previousGoal,context.previousGoal);assert.equal(sent.previousTools[0],'pdf-rotate');
  assert.equal(sent.preferences.mode,'manual');assert.equal(sent.preferences.provider,'chosen-provider');
  return result({intent:'execute',message:'Prepararé la página solicitada.',steps:[step('s1','pdf-extract',{pages:'3'},['file:0']),step('s2','pdf-to-word',{},['step:s1'],['s1'])]});
 }});
});
