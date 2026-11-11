import test from 'node:test';
import assert from 'node:assert/strict';
import {rankLocalTools} from '../src/local-brain.js';

function fakeModel(calls){
 return async (texts,options)=>{
  calls.push([...texts]);
  assert.equal(options.pooling,'mean');
  assert.equal(options.normalize,true);
  return {tolist:async()=>texts.map(t=>[
   /pdf|documento/i.test(t)?1:0,
   /imagen|foto|png/i.test(t)?1:0,
   /audio|wav/i.test(t)?1:0,
   0.01
  ])};
 };
}
const catalog=[
 {id:'pdf-extract',name:'Extraer página de PDF',description:'Seleccionar páginas del documento',hint:'pages'},
 {id:'image-resize',name:'Redimensionar imagen',description:'Modificar tamaño de foto',hint:'width height'},
 {id:'audio-trim',name:'Recortar audio',description:'Editar archivo WAV',hint:'start duration'}
];

test('Prisma Mini ranks fresh requests while caching tool descriptions',async()=>{
 const calls=[];const model=fakeModel(calls);
 const first=await rankLocalTools('extrae pagina pdf',catalog,3,{model});
 assert.equal(first[0].id,'pdf-extract');
 assert.equal(calls[0].length,4,'one query and three tool descriptions');
 const second=await rankLocalTools('redimensiona imagen',catalog,3,{model});
 assert.equal(second[0].id,'image-resize');
 assert.equal(calls[1].length,1,'only the new user query is embedded');
 assert.equal(calls.length,2);
 assert.equal(second.length,3);
});

test('changing a tool description invalidates only its cached vector',async()=>{
 const calls=[],model=fakeModel(calls);
 await rankLocalTools('pdf',catalog,3,{model});
 const changed=catalog.map((tool,i)=>i===0?{...tool,description:'Separa una hoja de un PDF'}:tool);
 const result=await rankLocalTools('pdf',changed,3,{model});
 assert.equal(result.length,3);
 assert.equal(calls[1].length,2,'new query plus changed tool description');
});

test('equivalent labels share cached embeddings; no prompts are cached',async()=>{
 const calls=[],model=fakeModel(calls);
 const duplicates=[catalog[0],{...catalog[0],id:'alternate-pdf'}];
 await rankLocalTools('primera pregunta',duplicates,2,{model});
 await rankLocalTools('segunda pregunta',duplicates,2,{model});
 assert.equal(calls[0].length,2,'duplicate catalog labels are embedded only once');
 assert.deepEqual(calls[1],['segunda pregunta']);
});

test('invalid embedding output fails safely without pretending to rank tools',async()=>{
 const bad=async()=>({tolist:async()=>[[1,2,3]]});
 await assert.rejects(rankLocalTools('pdf',catalog,3,{model:bad}),/incompletos/);
 assert.deepEqual(await rankLocalTools('pdf',[],3,{model:bad}),[]);
});
