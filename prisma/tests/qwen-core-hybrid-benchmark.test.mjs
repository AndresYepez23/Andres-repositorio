import test from 'node:test';
import assert from 'node:assert/strict';
import {planWithPrismaCore} from '../src/developer-api.js';
import {assessQwenCorePlanCoverage} from '../src/qwen-core-plan-coverage.js';
import {tools} from '../src/registry.js';

// Deterministic offline comparison. This does NOT claim Qwen inference quality.
// Prior results were allowed to omit requested operations. New routing must
// decline incomplete plans without losing known-safe direct operations.
const pdf=[{name:'informe.pdf',type:'application/pdf',size:1200}];
const image=[{name:'foto.jpg',type:'image/jpeg',size:1200}];
const csv=[{name:'datos.csv',type:'text/csv',size:1200}];
const cases=[
 ['PDF page 2 to Word','Extrae la segunda página del PDF y conviértela a Word',pdf],
 ['PDF plain Word','Convierte el PDF a Word',pdf],
 ['PDF page extraction','Extrae la página 2 del PDF',pdf],
 ['PDF image fidelity','Convierte el PDF a Word y conserva las imágenes',pdf],
 ['PDF no compress','No comprimas el PDF: conviértelo a Word',pdf],
 ['PDF informational','¿Cómo puedo extraer la segunda página del PDF?',pdf],
 ['PDF rotate','Gira la página 2 del PDF 90 grados',pdf],
 ['PDF metadata','Limpia los metadatos del PDF',pdf],
 ['PDF split','Divide el PDF en páginas 1-2 y 3-4',pdf],
 ['PDF merge','Une dos PDF en uno',pdf],
 ['Image metadata WebP','Quita los metadatos de esta foto y conviértela a WebP',image],
 ['Image resize WebP','Redimensiona la foto a 800x600 y conviértela a WebP',image],
 ['Image grayscale','Convierte esta foto a blanco y negro',image],
 ['Image transparent','Quita el fondo de la foto',image],
 ['Image reduce file weight','Comprime la foto con calidad 80',image],
 ['CSV duplicate cleanup XLSX','Organiza estos datos en Excel, elimina duplicados y entrégame un archivo',csv],
 ['CSV profile only','Analiza las columnas y duplicados de este CSV',csv],
 ['CSV convert Excel','Convierte el CSV en Excel',csv],
 ['Question about CSV','¿Cómo puedo quitar duplicados en CSV?',csv],
 ['Multi-step PDF repeat','Selecciona la página 3 del PDF y conviértela a Word',pdf]
];
test('20 deterministic requests: no accepted plan may omit checked explicit requirements',()=>{
 assert.equal(cases.length,20);
 const active=new Set(tools.filter(t=>['ready','beta'].includes(t.status)).map(t=>t.id));
 for(const [name,text,files] of cases){
  const result=planWithPrismaCore({text,files});
  assert.equal(result.ok,true,name);
  const plan=result.planner;
  assert.ok(['ready','needs-input','needs-planning','error'].includes(plan.type),name+': '+plan.type);
  const review=assessQwenCorePlanCoverage(text,plan.steps);
  if(plan.type==='ready'){
   assert.equal(review.needsSemanticReview,false,name+': incomplete but accepted '+review.missing.join(','));
   for(const step of plan.steps)assert.ok(active.has(step.tool_id),name+': unknown tool '+step.tool_id);
  }
 }
});
test('regression: incomplete PDF→Word and CSV→Excel must be marked needs-planning',()=>{
 const p=planWithPrismaCore({text:cases[0][1],files:pdf});
 const c=planWithPrismaCore({text:cases[15][1],files:csv});
 // A complete deterministic plan is even better than semantic review.
 if(p.planner.type==='ready')assert.deepEqual(p.planner.steps.map(s=>s.tool_id),['pdf-extract','pdf-to-word']);
 else{assert.equal(p.planner.type,'needs-planning');assert.equal(p.planner.steps.length,0);}
 assert.equal(c.planner.type,'needs-planning');
 assert.equal(c.planner.steps.length,0);
});
test('regression: known-safe image pipeline stays executable',()=>{
 const r=planWithPrismaCore({text:cases[10][1],files:image});
 assert.equal(r.planner.type,'ready');
 assert.deepEqual(r.planner.steps.map(s=>s.tool_id),['image-strip-metadata','image-convert']);
});
