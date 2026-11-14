import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyQueenPdfWordContent} from '../src/queen-document-verifier.js';
import {verifyQueenResult} from '../src/queen-verifier.js';
import {executeQueenDAG} from '../src/queen-execution.js';
import {validateQueenPlan} from '../src/queen-plan.js';

// Unit controls inject PDF.js observations and parsed DOM trees. These are not
// real PDF conversions or neural tests; actual-byte browser verification is separate.
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const text=value=>({nodeType:3,textContent:value});
function el(name,children=[],attributes={},namespaceURI=W){
 return {nodeType:1,localName:name,namespaceURI,childNodes:children,
  get textContent(){return children.map(child=>child.textContent||'').join('');},
  getAttributeNS:(_namespace,key)=>attributes[key]||'',getAttribute:key=>attributes[key.replace(/^w:/,'')]||'',attributes};
}
const run=value=>el('r',[el('t',[text(value)])]);
const paragraph=(...runs)=>el('p',runs);
function documentFor(pages){
 const blocks=[];
 for(let i=0;i<pages.length;i++){
  if(i)blocks.push(paragraph(el('r',[el('br',[],{type:'page'})])));
  blocks.push(typeof pages[i]==='string'?paragraph(run(pages[i])):pages[i]);
 }
 return el('document',[el('body',blocks)]);
}
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function serialize(node,root=false){
 if(node.nodeType===3)return escape(node.textContent);
 const attrs=Object.entries(node.attributes||{}).map(([key,value])=>' w:'+key+'="'+escape(value)+'"').join('');
 return '<w:'+node.localName+(root?' xmlns:w="'+W+'"':'')+attrs+'>'+node.childNodes.map(child=>serialize(child)).join('')+'</w:'+node.localName+'>';
}
function archive(root,styles=null){
 const xml=serialize(root,true),documents=new Map([[xml,{documentElement:root}]]);
 const files={'[Content_Types].xml':'<Types/>','word/document.xml':xml};
 if(styles){const value=serialize(styles,true);files['word/styles.xml']=value;documents.set(value,{documentElement:styles});}
 return {zip:{files:Object.fromEntries(Object.keys(files).map(name=>[name,{}])),file:name=>name in files?{async:async()=>files[name]}:null},
  parseXml:value=>documents.get(value)||{documentElement:el('parsererror')},xml};
}
const item=(str,x=40,y=700,width=100)=>({str,dir:'ltr',width,transform:[18,0,0,18,x,y]});
function pdfControl(pages){
 const counters={destroyed:0,opened:0};
 const OPS={save:1,showText:2,restore:3,paintImageXObject:4,constructPath:5};
 const doc={numPages:pages.length,getPage:async index=>{
  const page=pages[index-1];return {getOperatorList:async()=>({fnArray:page.ops||[1,2,3]}),getAnnotations:async()=>page.annotations||[],getTextContent:async()=>({items:page.items||[item(page.text)]})};
 }};
 const module={OPS,GlobalWorkerOptions:{},getDocument:()=>{counters.opened++;return {promise:Promise.resolve(doc),destroy:async()=>{counters.destroyed++;}};}};
 return {module,counters,load:async()=>module};
}
const input=()=>new File(['%PDF-unit-observation'],'source.pdf',{type:'application/pdf'});
async function inspect(source,output,options={}){
 const a=archive(Array.isArray(output)?documentFor(output):output),p=pdfControl(source);
 const result=await verifyQueenPdfWordContent([input()],a.zip,{load:p.load,parseXml:a.parseXml,...options});
 return {result,...p};
}

test('text-only PDF unit observations require ordered content and explicit page breaks',async()=>{
 const {result,counters}=await inspect([{text:'Cafe\u0301 12'},{text:'Segunda página 34'}],['Café 12','Segunda página 34']);
 assert.equal(result.verified,true);assert.deepEqual(result.unverified,[]);
 assert.equal(result.evidence[0].pages,2);assert.equal(result.evidence[0].layoutVerified,false);
 assert.equal(counters.opened,1);assert.equal(counters.destroyed,1);
});
test('a valid Word container with another page or reordered numbers cannot pass',async()=>{
 for(const output of ['FIRST PAGE MUST BE ABSENT','Producto A 34 12']){
  const a=archive(documentFor([output])),p=pdfControl([{text:'Producto A 12 34'}]);
  await assert.rejects(verifyQueenPdfWordContent([input()],a.zip,{load:p.load,parseXml:a.parseXml}),error=>error.verificationCode==='DOCUMENT_TEXT_MISMATCH');
  assert.equal(p.counters.destroyed,1);
 }
});
test('matching flattened words cannot hide a lost or misplaced page break',async()=>{
 const a=archive(documentFor(['Primera Segunda'])),p=pdfControl([{text:'Primera'},{text:'Segunda'}]);
 await assert.rejects(verifyQueenPdfWordContent([input()],a.zip,{load:p.load,parseXml:a.parseXml}),/DOCUMENT_TEXT_MISMATCH/);
});
test('split Word runs preserve adjacent digits and decoded XML entities',async()=>{
 const output=paragraph(run('A & '),run('B '),run('1'),run('2'));
 const {result}=await inspect([{text:'A & B 12'}],[output]);assert.equal(result.verified,true);
});
test('a PDF chunk boundary cannot invent a space inside a numeric value',async()=>{
 const a=archive(documentFor(['1 2'])),p=pdfControl([{items:[item('1',0,700,5),item('2',5,700,5)]}]);
 await assert.rejects(verifyQueenPdfWordContent([input()],a.zip,{load:p.load,parseXml:a.parseXml}),/DOCUMENT_TEXT_MISMATCH/);
 const ambiguous=await inspect([{items:[item('1',0,700,5),item('2',7,700,5)]}],['1 2']);
 assert.equal(ambiguous.result.verified,false);assert.ok(ambiguous.result.unverified.includes('pdf-reading-order-or-spacing-ambiguous'));
});
test('scanned or mixed pages never pass from the surviving digital text alone',async()=>{
 for(const source of [[{text:'',ops:[]}],[{text:'Digital page'},{text:'',ops:[]}]]){
  const {result,counters}=await inspect(source,['Digital page']);
  assert.equal(result.verified,false);assert.ok(result.unverified.includes('pdf-page-without-selectable-text'));
  assert.equal(counters.destroyed,1);
 }
});
test('PDF graphics, annotations and ambiguous reading order stay explicitly pending',async()=>{
 const sources=[{text:'A',ops:[1,2,4,3]},{text:'A',ops:[1,2,5,3]},{text:'A',annotations:[{subtype:'Link'}]},
  {items:[item('A',40,500),item('B',40,700)]}];
 for(const source of sources){const {result,counters}=await inspect([source],['A']);assert.equal(result.verified,false);assert.ok(result.unverified.length);assert.equal(counters.destroyed,1);}
});
test('Word drawings, hidden styles or missing XML parsing cannot acquire verified status',async()=>{
 const p=pdfControl([{text:'A'}]);
 const drawing=archive(el('document',[el('body',[paragraph(run('A'),el('r',[el('drawing')]))])]));
 let result=await verifyQueenPdfWordContent([input()],drawing.zip,{load:p.load,parseXml:drawing.parseXml});assert.equal(result.verified,false);
 const hidden=archive(documentFor(['A']),el('styles',[el('vanish')]));
 result=await verifyQueenPdfWordContent([input()],hidden.zip,{load:p.load,parseXml:hidden.parseXml});assert.ok(result.unverified.includes('docx-hidden-text'));
 result=await verifyQueenPdfWordContent([input()],hidden.zip,{load:p.load,parseXml:null});assert.ok(result.unverified.includes('docx-xml-parser-unavailable'));
 assert.equal(p.counters.opened,0);
});
test('DTD, entity declarations and parser errors are rejected before source work',async()=>{
 const p=pdfControl([{text:'A'}]);let parsed=0;
 for(const xml of ['<!DOCTYPE doc [<!ENTITY a "A">]><doc/>','<!ENTITY a SYSTEM "file:///private">']){
  const zip={file:()=>({async:async()=>xml})};
  await assert.rejects(verifyQueenPdfWordContent([input()],zip,{load:p.load,parseXml:()=>{parsed++;return null;}}),/INVALID_DOCX_XML/);
 }
 const a=archive(documentFor(['A']));
 await assert.rejects(verifyQueenPdfWordContent([input()],a.zip,{load:p.load,parseXml:()=>({documentElement:el('parsererror')})}),/INVALID_DOCX_XML/);
 assert.equal(parsed,0);assert.equal(p.counters.opened,0);
});
test('aborting an active PDF read destroys its loading task instead of leaving work running',async()=>{
 const a=archive(documentFor(['A'])),controller=new AbortController();let rejectTask,opened,destructions=0;
 const began=new Promise(resolve=>{opened=resolve;});
 const load=async()=>({OPS:{showText:2},getDocument:()=>{opened();return {promise:new Promise((_,reject)=>{rejectTask=reject;}),destroy:async()=>{destructions++;rejectTask(Error('destroyed'));}};}});
 const pending=verifyQueenPdfWordContent([input()],a.zip,{load,parseXml:a.parseXml,signal:controller.signal});
 await began;controller.abort();await assert.rejects(pending,error=>error.verificationCode==='VERIFICATION_ABORTED');assert.equal(destructions,1);
});

function zipBytes(){
 const bytes=new Uint8Array(72),view=new DataView(bytes.buffer);view.setUint32(0,0x04034b50,true);view.setUint32(4,0x02014b50,true);view.setUint32(50,0x06054b50,true);view.setUint16(60,1,true);view.setUint32(66,4,true);return bytes;
}
test('coordinator marks PDF-to-Word verified only after independent text inspection',async()=>{
 const a=archive(documentFor(['Requested page'])),p=pdfControl([{text:'Requested page'}]);
 const load=async url=>url.includes('jszip')?{default:{loadAsync:async(_bytes,options)=>{assert.equal(options.checkCRC32,true);return a.zip;}}}:p.module;
 const result={filename:'result.docx',blob:new Blob([zipBytes()],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),verification:{status:'validated'}};
 const checked=await verifyQueenResult({tool_id:'pdf-to-word',params:{}},result,[input()],{load,parseXml:a.parseXml});
 assert.equal(checked.verification.status,'verified');assert.equal(checked.verification.evidence[0].scope,'ordered-selectable-text-and-explicit-page-breaks');
 const wrong=pdfControl([{text:'Another page'}]);
 await assert.rejects(verifyQueenResult({tool_id:'pdf-to-word',params:{}},result,[input()],{load:async url=>url.includes('jszip')?{default:{loadAsync:async()=>a.zip}}:wrong.module,parseXml:a.parseXml}),/DOCUMENT_TEXT_MISMATCH/);
});
test('verification timeout aborts its own work without granting another task window or retry',async()=>{
 const plan=validateQueenPlan({intent:'execute',message:'test',steps:[{id:'s1',tool_id:'json-format',params:{text:'{}'},inputs:[],dependsOn:[]}]});
 let calls=0,signal,aborts=0,repairs=0;
 await assert.rejects(executeQueenDAG(plan,[],{maxMs:100,run:async()=>{calls++;return {text:'{}'};},
  verify:async(_step,_result,_inputs,options)=>{signal=options.signal;return new Promise(()=>signal.addEventListener('abort',()=>aborts++,{once:true}));},
  repair:async()=>{repairs++;}
 }),/TASK_TIME_BUDGET/);
 assert.equal(signal.aborted,true);assert.equal(aborts,1);assert.equal(calls,1);assert.equal(repairs,0);
});
