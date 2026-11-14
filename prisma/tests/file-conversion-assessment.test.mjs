import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planFileConversion,planFileAssessment,compatibleFileConversions,assessFileConversions} from '../src/file-conversions.js';
import {planWithPrismaCore} from '../src/developer-api.js';
import {runTool} from '../src/engines.js';
import {inspectArchiveFormat} from '../src/file-inspection.js';
const mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const docx=()=>new File([fs.readFileSync(new URL('fixtures/conversion.docx',import.meta.url))],'informe.docx',{type:mime});
const original='Quiero transformar este archivo a otro formato, pero antes identifica su tipo, determina qué conversiones son compatibles y explícame cuál conserva mejor su contenido';
const metadata=[{name:'informe.docx',type:mime,size:1200}];

test('read-only prerequisites outrank missing-target clarification in both actual planners',()=>{
 for(const text of [original,'Identifica el tipo del documento antes de convertirlo','¿Qué formatos son compatibles con este archivo?','Compara qué formato conserva mejor su estructura','Identify the file type and explain which conversion preserves its content best']){
  const conversion=planFileConversion(text,metadata),core=planWithPrismaCore({text,files:metadata});
  assert.equal(conversion?.type,'assessment',text);
  assert.deepEqual(conversion.steps.map(s=>s.tool_id),['file-inspector']);
  assert.equal(core.planner.source,'prisma-file-assessment');assert.equal(core.planner.type,'assessment');
  assert.equal(core.execution.executed,false,'metadata-only API must not claim to have inspected bytes');
 }
 assert.equal(planFileConversion('Quiero transformar este archivo',metadata).type,'needs-input');
 assert.equal(planFileAssessment(original,[]).type,'needs-input');
});

test('assessment does not hijack commands, negation, payloads or ordinary conversions',()=>{
 for(const text of ['Convierte el documento a HTML','No identifiques su tipo, convierte el archivo a PDF','Formatea JSON: {"nota":"identifica su tipo y explica qué formato conserva mejor su contenido"}','Convierte a TXT el contenido: identifica su tipo y qué formatos son compatibles','Convierte a TXT "identifica su tipo y qué conversiones son compatibles"','Identifica errores del archivo y corrígelos'])
  assert.equal(planFileAssessment(text,metadata),null,text);
 assert.equal(planFileAssessment('Cancela la conversión e identifica su tipo',metadata),null);
 assert.equal(planFileAssessment('No conviertas todavía, identifica su tipo',metadata).type,'assessment');
});

test('compatibility and executors share routes rather than advertising unsupported targets',()=>{
 const byExt={docx:['pdf','txt','html'],pdf:['docx','png','jpg','txt'],txt:['docx','pdf','txt','html'],csv:['csv','json','xlsx'],xlsx:['csv','json','xlsx']};
 for(const [ext,expected] of Object.entries(byExt)){
  const file={name:'input.'+ext,type:''};
  const routes=compatibleFileConversions(file);
  assert.deepEqual(routes.map(r=>r.target),expected,ext);
  for(const route of routes)assert.deepEqual(planFileConversion('Convierte el archivo a '+route.target,[file]).steps,route.steps);
 }
 assert.equal(planFileConversion('Convierte a PNG',metadata).type,'unsupported');
 assert.equal(planFileConversion('A HTML',metadata,[original]).steps[0].tool_id,'docx-html');
});

test('real DOCX directory and UTF-8 bytes produce grounded, local assessments',async()=>{
 const file=docx(),result=await runTool('file-inspector',[file],{});
 assert.equal(result.inspection.kind,'docx');assert.equal(result.inspection.basis,'archive-directory');
 const message=await assessFileConversions([file],{run:runTool});
 assert.match(message,/DOCX \(directorio ZIP de Word\)/);assert.match(message,/PDF, TXT, HTML/);
 assert.match(message,/Mammoth no reproduce exactamente/);assert.match(message,/impresión del navegador/);assert.match(message,/TXT conserva solo texto/);
 const txt=await assessFileConversions([new File(['Café y total 123.'],'notas.txt',{type:'text/plain'})],{run:runTool});
 assert.match(txt,/Texto UTF-8/);assert.match(txt,/DOCX, PDF, TXT, HTML/);
 assert.notEqual(message,txt);
});

test('misleading filenames and unrecognized containers cannot imply supported Word conversion',async()=>{
 const fake=new File([new Uint8Array([0,1,2,3,4])],'fraude.docx',{type:mime});
 const report=await assessFileConversions([fake],{run:runTool});
 assert.match(report,/no coincide/);assert.match(report,/No hay una conversión local confirmada/);
 const renamed=new File([await docx().arrayBuffer()],'informe.pdf',{type:'application/pdf'});
 assert.match(await assessFileConversions([renamed],{run:runTool}),/no coincide/);
 const broken=new File([new Uint8Array([0x50,0x4b,3,4,0,0])],'corrupto.docx',{type:mime});
 await assert.rejects(inspectArchiveFormat(broken),/directorio válido/);
 const bytes=new Uint8Array(await docx().arrayBuffer()),end=bytes.length-22;
 new DataView(bytes.buffer).setUint16(end+10,65535,true);
 await assert.rejects(inspectArchiveFormat(new File([bytes],'large.zip')),/límites/);
});
