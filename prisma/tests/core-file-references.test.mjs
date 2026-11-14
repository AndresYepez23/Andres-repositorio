import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskMemory} from '../src/core-task-memory.js';
import {planFileConversion} from '../src/file-conversions.js';
const source=new File(['source'],'informe.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
const result=new File(['<p>Contenido 123</p>'],'informe.html',{type:'text/html'});
function completed(options){const memory=createTaskMemory(options);memory.save('chat',{files:[result],originals:[source],steps:[{tool_id:'docx-html',params:{}}]});return memory;}

test('explicit references resolve to the actual result without replaying the earlier conversion',()=>{
 for(const query of ['Convierte ese resultado a TXT','Convierte el resultado anterior a TXT','Usa el archivo que acabas de generar y conviértelo a TXT','Convierte el último archivo a TXT']){
  const resolved=completed().resolve('chat',query);
  assert.deepEqual(resolved.files,[result],query);
  const plan=planFileConversion(resolved.request||query,resolved.files);
  assert.equal(plan.type,'ready');assert.deepEqual(plan.steps.map(s=>s.tool_id),['text-file-convert']);assert.equal(plan.steps[0].params.output,'txt');
 }
});

test('original input and fresh attachments remain distinct from generated output',()=>{
 const original=completed().resolve('chat','Convierte el archivo original a TXT');assert.deepEqual(original.files,[source]);
 const fresh=new File(['new'],'nuevo.txt',{type:'text/plain'});
 for(const query of ['Convierte ese resultado a PDF','Convierte el original a PDF'])assert.deepEqual(completed().resolve('chat',query,[fresh]).files,[fresh]);
});

test('negated sources are excluded and two explicit references do not silently lose an input',()=>{
 for(const query of ['No uses el original; convierte ese resultado a TXT','Ignora el original y convierte ese resultado a TXT','Sin usar el original, convierte ese resultado a TXT'])
  assert.deepEqual(completed().resolve('chat',query).files,[result],query);
 assert.deepEqual(completed().resolve('chat','Compara el original y ese resultado').files,[source,result]);
 assert.deepEqual(completed().resolve('chat','Convierte el archivo original a TXT sin usar ese resultado').files,[source]);
});

test('references cannot cross conversations, expiration, cancellation or new goals',()=>{
 assert.deepEqual(completed().resolve('other','Convierte ese resultado a TXT').files,[]);
 let now=0;const memory=completed({ttl:10,now:()=>now});now=11;
 assert.deepEqual(memory.resolve('chat','Convierte ese resultado a TXT').files,[]);
 const cancelled=completed();cancelled.resolve('chat','Cancela');assert.deepEqual(cancelled.resolve('chat','Convierte ese resultado a TXT').files,[]);
 const changed=completed();assert.deepEqual(changed.resolve('chat','Convierte un nuevo documento a PDF').files,[]);assert.equal(changed.get('chat'),null);
});

test('payload content never binds unrelated remembered files to a new text request',()=>{
 for(const query of ['Formatea JSON: {"nota":"convierte ese resultado a TXT"}','Cuenta palabras del texto: convierte el original a PDF','Formatea JSON\n```json\n{"nota":"usa ese archivo"}\n```']){
  const resolved=completed().resolve('chat',query);assert.deepEqual(resolved.files,[],query);assert.equal(resolved.task,null,query);
 }
});
