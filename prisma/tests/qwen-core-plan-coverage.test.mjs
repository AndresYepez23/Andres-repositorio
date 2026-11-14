import test from 'node:test';
import assert from 'node:assert/strict';
import {assessQwenCorePlanCoverage as audit} from '../src/qwen-core-plan-coverage.js';

const step=(tool_id,params={})=>({tool_id,params});
const pdf='Extrae la segunda página del PDF y conviértela a Word';
const csv='Organiza estos datos en Excel, elimina duplicados y entrégame un archivo';

test('Qwen Core does not accept a Word conversion that skipped requested extraction',()=>{
 const review=audit(pdf,[step('pdf-to-word')]);
 assert.equal(review.needsSemanticReview,true);
 assert.deepEqual(review.missing,['extract-requested-pdf-page']);
});

test('Qwen Core preserves both requested PDF operations in the correct order',()=>{
 const correct=audit(pdf,[step('pdf-extract',{pages:'2'}),step('pdf-to-word')]);
 assert.equal(correct.coversCheckedRequirements,true);
 assert.deepEqual(correct.missing,[]);
 const reverse=audit(pdf,[step('pdf-to-word'),step('pdf-extract',{pages:'2'})]);
 assert.ok(reverse.missing.includes('preserve-pdf-processing-order'));
});

test('Qwen Core rejects profiling CSV as if duplicates were removed and Excel exported',()=>{
 const review=audit(csv,[step('csv-profile-local',{delimiter:'auto'})]);
 assert.ok(review.missing.includes('remove-structured-duplicates'));
 assert.ok(review.missing.includes('produce-excel-file'));
});

test('a mere Excel conversion still does not satisfy requested structured deduplication',()=>{
 const review=audit(csv,[step('table-file-convert',{output:'xlsx'})]);
 assert.deepEqual(review.missing,['remove-structured-duplicates']);
});

test('protect image preservation limitation of current text-only PDF to Word',()=>{
 const review=audit('Convierte el PDF a Word y conserva las imágenes',[step('pdf-to-word')]);
 assert.deepEqual(review.missing,['preserve-pdf-images-not-supported-by-text-converter']);
});

test('do not include explicitly prohibited compression',()=>{
 const review=audit('No comprimas el PDF: conviértelo a Word',[step('pdf-compress'),step('pdf-to-word')]);
 assert.deepEqual(review.missing,['forbidden-compression']);
});

test('keep legitimate one-step conversions and unrelated safe local workflows',()=>{
 assert.equal(audit('Convierte el PDF a Word',[step('pdf-to-word')]).coversCheckedRequirements,true);
 assert.equal(audit('Quita los metadatos de esta foto y conviértela a WebP',
  [step('image-strip-metadata'),step('image-convert',{format:'image/webp'})]).coversCheckedRequirements,true);
});

test('informational questions never trigger a destructive plan coverage requirement',()=>{
 assert.equal(audit('¿Cómo puedo extraer una página y convertir el PDF a Word?',[]).coversCheckedRequirements,true);
});

test('English multi-step PDF request keeps both operations',()=>{
 const review=audit('Extract the second page of this PDF and convert it to Word',[step('pdf-to-word')]);
 assert.ok(review.missing.includes('extract-requested-pdf-page'));
});

test('the actual Prisma Core planner never approves an incomplete multi-step PDF goal',async()=>{
 const {planWithPrismaCore}=await import('../src/developer-api.js');
 const result=planWithPrismaCore({text:'Extrae la segunda página del PDF y conviértela a Word',files:[{name:'documento.pdf',type:'application/pdf',size:2500}]});
 assert.equal(result.ok,true);
 if(result.planner.type==='ready'){
  assert.deepEqual(result.planner.steps.map(s=>s.tool_id),['pdf-extract','pdf-to-word']);
 }else{
  assert.equal(result.planner.type,'needs-planning');
  assert.equal(result.planner.steps.length,0);
  assert.ok(result.planner.goalCoverage?.missing.includes('extract-requested-pdf-page'));
 }
});

test('the actual Core planner flags CSV auditing as incomplete deduplication/export',async()=>{
 const {planWithPrismaCore}=await import('../src/developer-api.js');
 const result=planWithPrismaCore({text:'Organiza estos datos en Excel, elimina duplicados y entrégame un archivo',files:[{name:'datos.csv',type:'text/csv',size:1800}]});
 assert.equal(result.ok,true);
 assert.equal(result.planner.type,'needs-planning');
 assert.equal(result.planner.steps.length,0);
 assert.ok(result.planner.goalCoverage?.missing.includes('remove-structured-duplicates'));
 assert.ok(result.planner.goalCoverage?.missing.includes('produce-excel-file'));
});
