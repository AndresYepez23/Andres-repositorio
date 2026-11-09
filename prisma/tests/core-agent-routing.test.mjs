import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Smoke test the same registry and zero-API router that ship to the PWA.
// No provider keys, no model downloads, no cloud quotas and no user files.
const registrySource = readFileSync(new URL('../src/registry.js', import.meta.url), 'utf8');
const registered = new Function(registrySource.replace(/^export /gm, '') + ';return tools;')();
const routerSource = readFileSync(new URL('../src/core-tool-intelligence.js', import.meta.url), 'utf8');
const router = new Function('tools', routerSource.replace(/^import .*;$/gm, '').replace(/^export /gm, '') +
  ';return { coreToolCatalog, searchCoreTools, planCoreOfflineAction, describeCoreTools };')(registered);
const available = registered.filter(item => ['ready', 'beta'].includes(item.status));
assert.equal(router.coreToolCatalog().length, available.length);
assert.ok(available.length >= 130, 'Core registry has lost tools unexpectedly');
assert.ok(available.every(tool => router.coreToolCatalog().some(item => item.id === tool.id)));

const pdf = [{ name:'ejemplo.pdf',type:'application/pdf' }];
const picture = [{ name:'foto.png',type:'image/png' }];
const video = [{ name:'video.mp4',type:'video/mp4' }];
const audio = [{ name:'audio.wav',type:'audio/wav' }];
const scenarios = [
 ['Extrae el texto del PDF', pdf, 'pdf-text'],
 ['Quítale los metadatos a la foto', picture, 'image-strip-metadata'],
 ['Escanea el QR de esta imagen', picture, 'qr-scan'],
 ['Voltea esta foto horizontal', picture, 'image-flip'],
 ['Crea iconos PWA de esta foto', picture, 'image-favicon'],
 ['Quiero los colores dominantes de la foto', picture, 'image-palette'],
 ['Normaliza el volumen de este audio', audio, 'audio-normalize'],
 ['Muestra la forma de onda de este audio', audio, 'audio-waveform'],
 ['Acelera este video a 1.5x', video, 'video-speed'],
 ['Haz este video vertical para reels', video, 'video-resize'],
 ['Inspecciona este archivo', pdf, 'file-inspector'],
 ['Calcula el hash SHA-256 de este archivo', pdf, 'hash-file'],
 ['Cuenta palabras de texto: Buenos dias desde Prisma', [], 'word-count'],
 ['Extrae correos de texto: contacto@example.com y hola@example.org', [], 'text-extract-emails'],
 ['Crea un QR para https://prismaspace.pages.dev', [], 'qr'],
];
for (const [request, files, toolId] of scenarios) {
 const plan = router.planCoreOfflineAction(request,files,[]);
 assert.equal(plan?.steps?.[0]?.tool_id,toolId,request);
 const options = router.searchCoreTools(request,files,32);
 assert.ok(options.some(item=>item.id===toolId), 'Tool missing from candidate list: '+toolId);
}
assert.ok(router.describeCoreTools('herramientas para editar un video', video).includes('herramientas'));

// Validate typed tool handoffs: never pass a ZIP to PDF/image editing.
const coreSource=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
const start=coreSource.indexOf('function compatibleFiles(tool,files){');
const finish=coreSource.indexOf('function showPlan(plan,steps){',start);
assert.ok(start>=0&&finish>start,'Core validation module not found');
const planSource=coreSource.slice(start,finish);
const validate = files => new Function('tools','attachments','MAX_STEPS','toolPolicy',
 planSource+';return validatePlan;')(registered,files,10,()=>({external:false}));
const mk = ids => ({steps:ids.map(id=>({tool_id:id,params:{}}))});
assert.doesNotThrow(()=>validate(pdf)(mk(['pdf-text','clean-text'])));
assert.throws(()=>validate(pdf)(mk(['pdf-split','pdf-page-numbers'])),/no es compatible/);
assert.doesNotThrow(()=>validate(video)(mk(['video-audio','ai-transcribe','text-summary-local'])));
assert.throws(()=>validate(picture)(mk(['image-favicon','image-convert'])),/no es compatible/);

console.log('Prisma Core agent: registry index, local actions and artifact compatibility verified.');
