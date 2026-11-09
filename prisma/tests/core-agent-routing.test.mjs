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

// Regression: edits to an existing image never authorize paid image generation.
const webEditingRequest='Prisma, quiero preparar esta imagen para mi página web, quitarle los metadatos y sacar sus colores principales';
const webEditing = router.planCoreOfflineAction(webEditingRequest,picture,[]);
assert.deepEqual(webEditing?.steps?.map(step=>step.tool_id),
 ['image-strip-metadata','image-compress','image-palette']);
assert.equal(webEditing.steps[1].params.format,'image/webp');
assert.equal(webEditing.steps[1].params.quality,82);
assert.equal(router.planCoreOfflineAction(webEditingRequest,[],[])?.type,'needs-input');
assert.equal(router.planCoreOfflineAction('Quiero preparar una imagen nueva para mi página web',[],[]),null);
assert.deepEqual(router.planCoreOfflineAction('Saca los colores principales de esta imagen',picture,[])?.steps?.map(x=>x.tool_id),['image-palette']);
// Route existing-image work before any remote image generator.
assert.ok(coreSource.indexOf('const localImageIntent=planCoreOfflineAction(')>=0);
assert.ok(coreSource.indexOf('const localImageIntent=planCoreOfflineAction(')<
 coreSource.indexOf('if(await handleImageCreationRequest(userText))return;'));
assert.doesNotThrow(()=>validate(picture)({
 steps:webEditing.steps.map(step=>({tool_id:step.tool_id,params:step.params}))
}));

// Provider-specific credential pools: six for Gemini/OpenRouter/HF/Pollinations,
// but Groq deliberately remains capped at five.
import { getCredentialSlots, getCredentialStatus, maxCredentialSlots } from '../functions/_lib/credential-pool.js';
const fakeKeys = {
 GEMINI_API_KEY:'g1', GEMINI_API_KEY_2:'g2', GEMINI_API_KEY_3:'g3',
 GEMINI_API_KEY_4:'g4', GEMINI_API_KEY_5:'g5', GEMINI_API_KEY_6:'g6',
 GROQ_API_KEY:'q1', GROQ_API_KEY_2:'q2', GROQ_API_KEY_3:'q3',
 GROQ_API_KEY_4:'q4', GROQ_API_KEY_5:'q5', GROQ_API_KEY_6:'q6',
 OPENROUTER_API_KEY:'o1', OPENROUTER_API_KEY_2:'o2', OPENROUTER_API_KEY_3:'o3',
 OPENROUTER_API_KEY_4:'o4', OPENROUTER_API_KEY_5:'o5', OPENROUTER_API_KEY_6:'o6',
};
for (const provider of ['gemini','openrouter','huggingface','pollinations']) {
 assert.equal(maxCredentialSlots(provider),6,provider+' must support six slots');
}
assert.equal(maxCredentialSlots('groq'),5);
assert.equal(getCredentialSlots(fakeKeys,'gemini').length,6);
assert.equal(getCredentialStatus(fakeKeys,'gemini').max,6);
assert.equal(getCredentialSlots(fakeKeys,'openrouter').length,6);
assert.equal(getCredentialStatus(fakeKeys,'openrouter').slots.length,6);
assert.equal(getCredentialSlots(fakeKeys,'groq').length,5);
assert.equal(getCredentialStatus(fakeKeys,'groq').slots.length,5);

console.log('Prisma Core agent: registry index, local actions and artifact compatibility verified.');
