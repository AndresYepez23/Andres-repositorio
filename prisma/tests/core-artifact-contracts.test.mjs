import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOutputArtifact,verifyToolOutputArtifacts} from '../src/core-artifact-contracts.js';
import {runToolBatch} from '../src/core-execution.js';

const blob=(data,type)=>new Blob([data],{type});
const pdf='%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pF0wAAAAASUVORK5CYII=','base64'));
const zip=Uint8Array.from([80,75,3,4,20,0,0,0,0,0,0,0,0,0,0,0]);
const wav=Uint8Array.from([...Buffer.from('RIFF'),4,0,0,0,...Buffer.from('WAVE'),...Buffer.from('fmt '),16,0,0,0]);

test('valid PDF, PNG, DOCX and WAV receive signature-only evidence',async()=>{
 for(const [toolId,filename,data,type] of [
  ['pdf-extract','seleccion.pdf',pdf,'application/pdf'],
  ['image-resize','foto.png',png,'image/png'],
  ['pdf-to-word','resultado.docx',zip,'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['audio-trim','sonido.wav',wav,'audio/wav']]){
  const result=await verifyOutputArtifact({filename,blob:blob(data,type)},{toolId});
  assert.equal(result.verification.status,'signature-validated');
  assert.ok(result.verification.checks.includes('file-signature'));
 }
});

test('PDF claims cannot disguise ZIP payloads or random bytes',async()=>{
 for(const [filename,data] of [['pagina.pdf',zip],['pagina.pdf','not a PDF']]){
  await assert.rejects(verifyOutputArtifact({filename,blob:blob(data,'application/pdf')},{toolId:'pdf-extract'}),/firma binaria/);
 }
});

test('an image extension cannot disagree with the actual MIME or file signature',async()=>{
 await assert.rejects(verifyOutputArtifact({filename:'foto.webp',blob:blob(png,'image/png')},{toolId:'image-convert'}),/extensión/);
 await assert.rejects(verifyOutputArtifact({filename:'foto.png',blob:blob('not a png','image/png')},{toolId:'image-resize'}),/firma binaria/);
 await assert.rejects(verifyOutputArtifact({filename:'foto.png',blob:blob(zip,'image/png')},{toolId:'image-convert'}),/firma binaria/);
});

test('the planned output contract catches PDF-to-Word accidentally returning PDF',async()=>{
 await assert.rejects(verifyToolOutputArtifacts('pdf-to-word',{filename:'salida.pdf',blob:blob(pdf,'application/pdf')}),/formato solicitado/);
 await assert.rejects(verifyToolOutputArtifacts('pdf-extract',{filename:'paginas.zip',blob:blob(zip,'application/zip')}),/formato solicitado/);
});

test('valid JSON outputs are parsed, corrupted JSON is rejected, plain text stays unchanged',async()=>{
 const valid=await verifyOutputArtifact({filename:'datos.json',blob:blob('{"name":"Prisma","count":3}','application/json')});
 assert.deepEqual(valid.verification.checks,['parsed-json']);
 await assert.rejects(verifyOutputArtifact({filename:'datos.json',blob:blob('{"bad":','application/json')}),/JSON válido/);
 const plain={filename:'notas.txt',blob:blob('hola','text/plain')};
 assert.equal(await verifyOutputArtifact(plain),plain);
});

test('multiple artifacts are checked independently and existing image checks survive',async()=>{
 const result=await verifyToolOutputArtifacts('pdf-split',{
  artifacts:[
   {filename:'p1.pdf',blob:blob(pdf,'application/pdf'),verification:{status:'validated',checks:['page-count']}},
   {filename:'p2.pdf',blob:blob(pdf,'application/pdf')}
  ]});
 assert.equal(result.artifacts.length,2);
 assert.deepEqual(result.artifacts[0].verification.checks,['page-count','file-signature','format-consistency']);
 assert.equal(result.artifacts[0].verification.status,'validated');
 await assert.rejects(verifyToolOutputArtifacts('pdf-split',{artifacts:[
  {filename:'p1.pdf',blob:blob(pdf,'application/pdf')},
  {filename:'p2.pdf',blob:blob(zip,'application/pdf')}
 ]}),/firma binaria/);
});

test('batch execution rejects false successful PDFs before they can become inputs',async()=>{
 let count=0;
 const tool={id:'pdf-extract',name:'Extraer PDF',file:true,multiple:false,accept:'application/pdf'};
 const input=new File([pdf],'original.pdf',{type:'application/pdf'});
 await assert.rejects(runToolBatch(tool,[input],{pages:'last'},async()=>{count++;return {filename:'pagina.pdf',blob:blob(zip,'application/pdf')};}),/firma binaria/);
 assert.equal(count,1);
 const valid=await runToolBatch(tool,[input],{pages:'last'},async()=>({filename:'pagina.pdf',blob:blob(pdf,'application/pdf')}));
 assert.equal(valid.verification.status,'signature-validated');
});
