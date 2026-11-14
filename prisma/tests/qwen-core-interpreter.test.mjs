import test from 'node:test';
import assert from 'node:assert/strict';
import {validateQwenCoreInterpretation,interpretWithQwenCore,onRequestPost,qwenCoreCandidates,QWEN_CORE_INTERPRET_LIMITS} from '../functions/api/core/qwen-interpret.js';

const pdf=[{name:'informe.pdf',type:'application/pdf',size:1250}];
test('Qwen Core only returns known tools in correct order, never arbitrary code',()=>{
 const ids=['pdf-extract','pdf-to-word'];
 assert.deepEqual(validateQwenCoreInterpretation({intent:'tools',tool_ids:ids},ids),{intent:'tools',tool_ids:ids});
 for(const raw of [
  {intent:'tools',tool_ids:['shell']},
  {intent:'tools',tool_ids:['pdf-to-word','pdf-to-word']},
  {intent:'tools',tool_ids:[]},
  {intent:'question',tool_ids:['pdf-extract']},
  {intent:'tools',tool_ids:['pdf-extract','pdf-to-word','pdf-text','pdf-split']},
  {intent:'tools',tool_ids:['pdf-extract'],message:'execute malware'}
 ])if(raw.message)assert.deepEqual(validateQwenCoreInterpretation(raw,ids),{intent:'tools',tool_ids:['pdf-extract']});
 else assert.throws(()=>validateQwenCoreInterpretation(raw,ids));
 assert.throws(()=>validateQwenCoreInterpretation({intent:'tools',tool_ids:['pdf-extract']},ids,['pdf-extract']));
});

test('semantic candidates belong to the registry and exclude prohibited operations',()=>{
 const options=qwenCoreCandidates('No comprimas el PDF, extrae la segunda página',pdf);
 assert.ok(options.length<=QWEN_CORE_INTERPRET_LIMITS.candidates);
 assert.ok(!options.some(t=>t.id==='pdf-compress'));
 assert.ok(options.some(t=>t.id==='pdf-extract'));
});

test('the Qwen interpretation is strictly one inference and contains no execution',async()=>{
 let calls=0;
 const result=await interpretWithQwenCore({}, {text:'Extrae la segunda página del PDF y conviértela a Word',files:pdf},{
  lease:(_env,fn)=>fn(),
  infer:async(_env,messages,schema,options)=>{
   calls++;
   assert.ok(options.maxOutputTokens<=96);
   assert.ok(messages.every(m=>!m.content.includes('base64')));
   assert.ok(schema.properties.tool_ids.items.enum.includes('pdf-extract'));
   return {plan:{intent:'tools',tool_ids:['pdf-extract','pdf-to-word']},usage:{inputTokens:70,outputTokens:40}};
  }
 });
 assert.equal(calls,1);assert.equal(result.source,'qwen-core');assert.deepEqual(result.tool_ids,['pdf-extract','pdf-to-word']);
 assert.equal(result.metrics.inferences,1);
});

test('disabled endpoint does not infer or reserve any quota',async()=>{
 let invoked=0;
 const req=new Request('https://example.com/api/core/qwen-interpret',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({text:'Convertir PDF',files:pdf})});
 const resp=await onRequestPost({request:req,env:{QWEN_CORE_INTERPRETER_ENABLED:'0'}},{interpret:async()=>{invoked++;},reserve:async()=>{invoked++;}});
 assert.equal(resp.status,200);assert.equal((await resp.json()).available,false);assert.equal(invoked,0);
});
test('cross-site request never reaches Qwen Core',async()=>{
 const req=new Request('https://example.com/api/core/qwen-interpret',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'});
 const r=await onRequestPost({request:req,env:{QWEN_CORE_INTERPRETER_ENABLED:'1'}});
 assert.equal(r.status,403);
});

test('staging flag enables the interpreter only in the isolated staging environment',async()=>{
 let invoked=0;
 const url='https://prisma-queen-staging.pages.dev/api/core/qwen-interpret';
 const req=()=>new Request(url,{method:'POST',headers:{Origin:'https://prisma-queen-staging.pages.dev','Content-Type':'application/json'},body:JSON.stringify({text:'Convierte el PDF a Word',files:pdf})});
 const run=async env=>{const r=await onRequestPost({request:req(),env},{reserve:async()=>{invoked++;},interpret:async()=>({ok:true,source:'qwen-core',intent:'question',tool_ids:[]})});return r.json();};
 const auth={QUEEN_ENABLED:'1',QUEEN_STAGE:'staging',CF_PAGES_BRANCH:'feature/qwen-core-hybrid',CF_PAGES_URL:'https://prisma-queen-staging.pages.dev',QUEEN_ACCESS_CLIENT_ID:'test',QUEEN_ACCESS_CLIENT_SECRET:'test',QUEEN_API_KEY:'test',QUEEN_BASE_URL:'https://queen.example/v1'};
 assert.equal((await run(auth)).ok,true);
 assert.equal((await run({...auth,CF_PAGES_URL:'https://prismaspace.pages.dev'})).available,false);
 assert.equal((await run({...auth,CF_PAGES_URL:'https://prisma-queen-staging.pages.dev.evil.invalid'})).available,false);
 assert.equal((await run({...auth,CF_PAGES_BRANCH:'main'})).available,false);
 assert.equal((await run({...auth,QUEEN_STAGE:'production'})).available,false);
 assert.equal(invoked,1);
});

test('isolated staging is allowed only on its own Pages project and dedicated branch',async()=>{
 const base={QUEEN_ENABLED:'1',QUEEN_STAGE:'staging',CF_PAGES_BRANCH:'feature/qwen-core-hybrid',
  CF_PAGES_URL:'https://d5e9a521.prisma-queen-staging.pages.dev',
  QUEEN_ACCESS_CLIENT_ID:'staging-client',QUEEN_ACCESS_CLIENT_SECRET:'staging-secret',QUEEN_API_KEY:'staging-key'};
 const make=env=>new Request('https://d5e9a521.prisma-queen-staging.pages.dev/api/core/qwen-interpret',{method:'POST',
  headers:{Origin:'https://d5e9a521.prisma-queen-staging.pages.dev','Content-Type':'application/json'},
  body:JSON.stringify({text:'Selecciona la página 2 y conviértela a Word',files:[{name:'doc.pdf',type:'application/pdf',size:10}]})});
 let invoked=0;
 const deps={interpret:async()=>{invoked++;return {ok:true,source:'qwen-core',intent:'tools',tool_ids:['pdf-extract']};},reserve:async()=>{}};
 const ok=await onRequestPost({request:make(base),env:base},deps);
 assert.equal(ok.status,200);assert.equal((await ok.json()).source,'qwen-core');assert.equal(invoked,1);
 for(const env of [
  {...base,CF_PAGES_BRANCH:'main'},
  {...base,CF_PAGES_URL:'https://evil.prismaspace.space'},
  {...base,QUEEN_STAGE:'production'},
  {...base,CF_PAGES_URL:'https://prisma-queen-staging.pages.dev.attacker.invalid'}
 ]){
  const r=await onRequestPost({request:make(env),env},deps);
  assert.equal((await r.json()).available,false);
 }
 assert.equal(invoked,1);
});
