import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeQwenCoreTools,requestQwenCoreInterpretation,resetQwenCoreDisabledForTest} from '../src/qwen-core-client.js';

test('Qwen tool hints only re-rank existing catalog entries',()=>{
 const catalog=[{id:'pdf-to-word',name:'Word'},{id:'pdf-extract',name:'Extract'},{id:'image-rotate',name:'Rotate'}];
 const hint={source:'qwen-core',intent:'tools',tool_ids:['pdf-extract','shell','pdf-to-word']};
 const result=prioritizeQwenCoreTools(catalog,hint);
 assert.deepEqual(result.map(c=>c.id),['pdf-extract','pdf-to-word','image-rotate']);
 assert.equal(prioritizeQwenCoreTools(catalog,null),catalog);
});
test('the browser sends only file metadata, not document bytes or secrets',async()=>{
 resetQwenCoreDisabledForTest();
 let body,method;
 const r=await requestQwenCoreInterpretation({text:'Extrae la página 2 y conviértela a Word',files:[{name:'doc.pdf',type:'application/pdf',size:1000,content:'NEVER_SEND_THIS'}]},{
  fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);method=options.method;
   return new Response(JSON.stringify({ok:true,source:'qwen-core',intent:'tools',tool_ids:['pdf-extract','pdf-to-word']}),{headers:{'Content-Type':'application/json'}});}
 });
 assert.equal(method,'POST');assert.equal(body.files.length,1);
 assert.deepEqual(Object.keys(body.files[0]).sort(),['name','size','type']);
 assert.equal(JSON.stringify(body).includes('NEVER_SEND_THIS'),false);
 assert.deepEqual(r.tool_ids,['pdf-extract','pdf-to-word']);
});
test('a disabled Qwen interpreter is cached and does not block the ordinary fallback',async()=>{
 resetQwenCoreDisabledForTest();let called=0;
 const opts={fetchImpl:async()=>{called++;return new Response(JSON.stringify({ok:false,available:false,fallback:true}),{status:200});}};
 assert.equal(await requestQwenCoreInterpretation({text:'Revisa este PDF'},opts),null);
 assert.equal(await requestQwenCoreInterpretation({text:'Otra petición'},opts),null);
 assert.equal(called,1);resetQwenCoreDisabledForTest();
});
test('invalid or unsuccessful remote hints never become executable plans',async()=>{
 resetQwenCoreDisabledForTest();
 const result=await requestQwenCoreInterpretation({text:'Convertir PDF'},{fetchImpl:async()=>new Response(JSON.stringify({ok:true,source:'qwen-core',intent:'tools',tool_ids:['one','two','three','four']}))});
 assert.equal(result,null);
});
