import test from 'node:test';
import assert from 'node:assert/strict';
import {planCapabilityRequest} from '../src/core-capabilities.js';
import {createTaskMemory} from '../src/core-task-memory.js';
const pdf={name:'documento.pdf',type:'application/pdf',size:100};
test('multi-operation PDF plans retain downstream Word and explicit file order',()=>{
 for(const query of ['Extrae la última página y conviértela a Word','Quiero solo la página 2 y después a Word','Extrae páginas 2-4 y conviértelas a Word']){
  const p=planCapabilityRequest(query,[pdf]);assert.equal(p.type,'ready',query);assert.equal(p.steps.at(-1).tool_id,'pdf-to-word');assert.equal(p.steps.length,2);assert.equal(p.steps[0].tool_id,'pdf-extract');assert.deepEqual(p.steps[1].dependsOn,['step-1']);
 }
 const p=planCapabilityRequest('Une primero el segundo PDF y después el primero',[pdf,pdf]);assert.deepEqual(p.steps[0].params.sourceOrder,[1,0]);
});
test('cancellation and format changes cannot revive pending split across conversations',()=>{
 for(let i=0;i<25;i++){
  const m=createTaskMemory();m.wait('a','Divide este PDF',[pdf]);
  const r=m.resolve('a','A Word');assert.equal(r.request,'Convierte el PDF A Word');assert.deepEqual(r.files,[pdf]);
  assert.equal(m.resolve('b','A Word').task,null);
  assert.equal(m.resolve('a','Cancela').cancelled,true);
  assert.deepEqual(m.resolve('a','Procesa el archivo').files,[]);
 }
});
test('conditional and cancelled file operations do not execute',()=>{
 for(const q of ['Si tiene seis páginas divide este PDF','Cancela y convierte a Word','No hagas nada'])assert.equal(planCapabilityRequest(q,[pdf]).steps.length,0);
});
test('downstream operations cannot revive a forbidden conversion',()=>{
 const p=planCapabilityRequest('Extrae la última página pero no conviertas a Word',[pdf]);
 assert.ok(!p.steps.some(s=>s.tool_id==='pdf-to-word'));
});
