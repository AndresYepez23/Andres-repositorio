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
