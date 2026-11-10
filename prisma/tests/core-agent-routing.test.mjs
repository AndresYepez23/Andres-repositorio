import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileIosPwaViewport } from '../src/pwa-viewport.js';
import { isVideoCompressionIntent, isVideoFile, preferNativeVideoCompression, videoCompressionSettings, chooseNativeRecordingType, localizedVideoError, compressVideoNative } from '../src/video-compression.js';
import { rankProviders, selectTaskModel, ROUTE_ORDER } from '../src/provider-routing.js';
import { getCredentialSlots, getCredentialStatus, getHealthyCredentialCount, maxCredentialSlots, requestWithCredentialPool, CREDENTIAL_ROOTS, CREDENTIAL_POOL_VARIABLES } from '../functions/_lib/credential-pool.js';
import { renderMarkdownSafe } from '../src/core-markdown.js';
import { findConversations } from '../src/conversation-search.js';
import { mergeConversationLists, normalizeConversation } from '../src/conversation-sync.js';
import { GUEST_TASK_LIMIT, GUEST_TASK_STORAGE_KEY, readGuestTaskCount, canGuestSubmit, recordGuestTask, isGuestFileTask } from '../src/core-guest-limit.js';
import { validateAccountPassword, accountAuthMessage, isAccountProviderAvailable } from '../src/prisma-account.js';
import { classifySidebarSwipe, shouldCommitSidebarSwipe, SIDEBAR_EDGE_PX, installMobileSidebarGestures } from '../src/sidebar-gestures.js';
import { getProviderDailyLimit, getProviderMinuteLimit, getSharedDailyBudget, getVisitorDailyLimit } from '../functions/_lib/limits.js';
import { CHAT_MODELS } from '../functions/_lib/model-catalog.js';
import { isAcknowledgementMessage, buildAcknowledgementReply } from '../src/core-conversation.js';
import { imageAnalysisIntent, isBatchImageTranscription } from '../src/core-image-analysis.js';
import { routeWebsiteRequest, resolveGeneralCapabilityQuestion, extractWebsiteHtml, WEBSITE_FOLLOWUP } from '../src/core-intent.js';
import { resolvePrismaProductQuestion } from '../src/core-intelligence.js';
import { validateAgentStepResult } from '../src/core-agent-guard.js';
import { buildConversationContext, chooseCoreReasoning, chooseCoreResponseLength, chooseCoreContextOptions, isCoreFollowUp } from '../src/core-context.js';
import { resolveIndependentCoreRequest, resolveContextualCoreRequest, solveOfflineArithmetic, getOfflineExtractiveSummary, INDEPENDENT_CORE_KNOWLEDGE_COUNT } from '../src/core-independent-intelligence.js';
import { selectInferenceCandidates, stopInferenceFallback, normalizeInferenceUsage, recordInferenceUsage, readInferenceUsage, INFERENCE_USAGE_KEY } from '../src/core-economy.js';
import { selectImageCandidates, imageFailureDecision } from '../src/image-routing.js';
import { runLocalCreatorTool } from '../src/local-creator-tools.js';
import { compareJsonDocuments, extractAcademicIdentifiers, redactSensitiveText } from '../src/advanced-text-tools.js';

// Smoke test the same registry and zero-API router that ship to the PWA.
// No provider keys, no model downloads, no cloud quotas and no user files.
const registrySource = readFileSync(new URL('../src/registry.js', import.meta.url), 'utf8');
const registry = new Function(registrySource.replace(/^export /gm, '') + ';return {tools,categories};')();
const registered = registry.tools;
const routerSource = readFileSync(new URL('../src/core-tool-intelligence.js', import.meta.url), 'utf8');
const router = new Function('tools','categories', routerSource.replace(/^import .*;$/gm, '').replace(/^export /gm, '') +
  ';return { coreToolCatalog, searchCoreTools, planCoreOfflineAction, describeCoreTools, isToolDiscoveryQuestion, coreCapabilityContext };')(registered,registry.categories);
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
 ['Oculta datos sensibles del texto: contacto@example.com', [], 'text-redact-sensitive'],
 ['Crea subtítulos SRT del texto: Hola, esto es Prisma', [], 'subtitle-srt-local'],
 ['Crea URL UTM para https://example.com origen:instagram medio:social campaña:lanzamiento', [], 'utm-builder'],
];
for (const [request, files, toolId] of scenarios) {
 const plan = router.planCoreOfflineAction(request,files,[]);
 assert.equal(plan?.steps?.[0]?.tool_id,toolId,request);
 const options = router.searchCoreTools(request,files,32);
 assert.ok(options.some(item=>item.id===toolId), 'Tool missing from candidate list: '+toolId);
}
assert.ok(router.describeCoreTools('herramientas para editar un video', video).includes('herramientas'));

// Validate typed tool handoffs: never pass a ZIP to PDF/image editing.
// Guest onboarding: 4 successful operations, across all chats on this browser.
const guestMemory=new Map();
const guestStorage={
 getItem:key=>guestMemory.get(key)||null,
 setItem:(key,value)=>guestMemory.set(key,String(value))
};
assert.equal(GUEST_TASK_LIMIT,4);
assert.equal(readGuestTaskCount(guestStorage),0);
assert.equal(canGuestSubmit({signedIn:false,count:0}),true);
for(let n=1;n<=4;n++){
 const result=recordGuestTask(guestStorage,{signedIn:false});
 assert.equal(result.count,n);
 assert.equal(result.justReachedLimit,n===4);
}
assert.equal(guestMemory.get(GUEST_TASK_STORAGE_KEY),'4');
assert.equal(canGuestSubmit({signedIn:false,count:4,fileTask:true}),false,'A fifth file task must require an account');
assert.equal(canGuestSubmit({signedIn:false,count:4,fileTask:false}),true,'Plain text chat must remain available indefinitely');
assert.equal(isGuestFileTask({text:'Hola, ¿cómo estás?'}),false);
assert.equal(isGuestFileTask({text:'Explícame cómo funciona un archivo PDF'}),false,'Questions about files are still chat');
assert.equal(isGuestFileTask({text:'Analiza estos documentos',attachments:[{name:'prueba.pdf'}]}),true);
assert.equal(isGuestFileTask({text:'Comprime este vídeo'}),true);
assert.equal(isGuestFileTask({text:'Quiero una imagen de un bosque'}),true);
assert.equal(isGuestFileTask({text:'Crea un PDF descargable'}),true);
assert.equal(canGuestSubmit({signedIn:true,count:4}),true,'Signed-in users must never be blocked');
assert.equal(recordGuestTask(guestStorage,{signedIn:false}).count,4,'Guest task limit must not overflow');
assert.equal(recordGuestTask(guestStorage,{signedIn:true}).count,4,'Signed-in tasks must not spend guest allowance');
assert.equal(readGuestTaskCount({getItem:()=>{throw Error('Storage disabled');}}),0,'Storage failure must not crash Core');
const uploadedPhoto=[{name:'foto-documento.jpg',type:'image/jpeg'}];
assert.equal(imageAnalysisIntent('Haz un análisis de texto de esta imagen',uploadedPhoto),'interpret');
assert.equal(imageAnalysisIntent('Contextualiza lo que dice este documento',uploadedPhoto),'interpret');
assert.equal(imageAnalysisIntent('¿Qué significa esto?',uploadedPhoto),'interpret');
assert.equal(imageAnalysisIntent('Extrae el texto de esta imagen',uploadedPhoto),'transcribe');
assert.equal(imageAnalysisIntent('Transcribe el texto literalmente',uploadedPhoto),'transcribe');
assert.equal(imageAnalysisIntent('Analiza este texto',[]),'','Un chat sin imágenes no debe activar OCR');
assert.equal(isBatchImageTranscription('Sácame el texto de todas esas imágenes',[{name:'IMG_6717.png',type:'image/png'},{name:'IMG_6715.png',type:'image/png'},{name:'IMG_6716.png',type:'image/png'},{name:'IMG_6713.png',type:'image/png'},{name:'ScreenRecording.mp4',type:'video/mp4'}]),true,'Process every still image in a mixed upload');
assert.equal(isBatchImageTranscription('Analiza esta foto',[{name:'foto.jpg',type:'image/jpeg'}]),false,'Analysis is not literal OCR');
assert.equal(imageAnalysisIntent('Analízame esa imagen por favor',picture),'interpret','Colloquial Spanish analysis must not become a metadata lookup');
assert.equal(imageAnalysisIntent('Interprétame esta fotografía',picture),'interpret');
assert.equal(imageAnalysisIntent('Explícame la imagen',picture),'interpret');
assert.equal(imageAnalysisIntent('Describe esta foto',picture),'interpret');
assert.equal(imageAnalysisIntent('Muéstrame los metadatos EXIF',picture),'','Explicit metadata requests remain local');

assert.equal(resolveContextualCoreRequest('¿Y para qué sirve?',[{role:'user',content:'¿Qué es una API?'}])?.kind,'context');
assert.equal(resolveContextualCoreRequest('¿Y para qué sirve?',[{role:'user',content:'¿Qué es un agujero negro?'}]),null,'Unknown history should not invent a local answer');
assert.equal(resolveContextualCoreRequest('Diferencia entre autenticación y autorización')?.kind,'comparison');
assert.equal(resolveContextualCoreRequest('Diferencia entre autenticación y agujeros negros'),null);
assert.equal(resolveContextualCoreRequest('Tengo 200 y aplica un aumento del 10% y luego un descuento del 10%')?.kind,'plan');
assert.match(resolveContextualCoreRequest('Tengo 200 y aplica un aumento del 10% y luego un descuento del 10%')?.text||'',/198/);
const coreSource=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
assert.match(coreSource,/const explanation=\/\^/,'Explanatory questions must bypass the tool planner');
assert.match(coreSource,/if\(explanation&&!explicitExecution\)/,'Questions mentioning file formats should remain in ordinary chat');
const engineQualitySource=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(engineQualitySource,/Comprensión profunda:/,'All providers should receive improved contextual reasoning instructions');
assert.match(engineQualitySource,/No te limites a repetir, parafrasear o enumerar datos/,'Core must contextualize instead of restating raw input');
assert.match(engineQualitySource,/slice\(0,5500\)/,'Previous drafts need enough context for faithful revisions');

assert.match(coreSource,/imageAnalysisIntent\(userText,attachments\)==='interpret'/,'Contextual image reading is routed before generic tool planning');
assert.match(coreSource,/async function interpretAttachedImageText\(userText\)/,'OCR is interpreted using a dedicated model reasoning path');
assert.match(coreSource,/async function transcribeAttachedImageBatch\(userText\)/,'Batch OCR must process each attached image');
assert.match(coreSource,/for\(let i=0;i<images\.length;i\+\+\)/,'Every image is processed independently');
assert.match(coreSource,/Archivos no procesados como imágenes/,'Video must be reported separately, not silently dropped');
assert.match(coreSource,/attachments=\[\];renderAttachments\(\);\s*\$\('#core-attachments'\)\?\.classList\.remove\('hidden'\);\s*const fileInput=\$\('#core-file-input'\)/,'Submitted attachments must be cleared and preview tray restored after processing');
assert.match(coreSource,/\$\('#core-attachments'\)\?\.classList\.add\('hidden'\)/,'The submitted file tray must disappear as soon as a request is sent');

assert.match(coreSource,/No te limites a transcribir/,'Contextual analysis must not merely echo OCR');
assert.match(coreSource,/no inventes elementos visuales/,'OCR analysis must not hallucinate unseen visual elements');
assert.match(coreSource,/recordCompletedCoreTask\(\{fileTask:true\}\)/,'Successful file analysis consumes a file task');
assert.match(coreSource,/const attachmentPreviewUrls=new Map\(\)/,'Attachment previews must reuse object URLs');
assert.match(coreSource,/URL\.revokeObjectURL\(url\)/,'Discarded previews must release browser object URLs');
assert.match(coreSource,/className='core-attachment-thumb'/,'Uploaded images and videos must display small previews');
assert.match(coreSource,/const message=\{id:'m-'/,'Complete assistant messages are persisted before display animation');
assert.match(coreSource,/revealNewAssistantAnswer\(message\)/,'Fresh assistant replies must progressively appear');
assert.match(coreSource,/prefers-reduced-motion: reduce/,'Answer animation must respect accessibility settings');
assert.match(coreSource,/cancelAnimationFrame\(answerRevealFrame\)/,'Re-rendering the chat must cancel stale reveal animations');
assert.match(coreSource,/fileTask:isGuestFileTask\(\{text,attachments\}\)/,'Only requests involving files are blocked after trial');
assert.match(coreSource,/openPrismaAuthForGuestLimit\(\)/,'Core must open its real Supabase login/sign-up modal when the trial ends');
assert.match(coreSource,/prisma:guest-gate-closed/,'Returning from registration should show in-chat invitation');
assert.match(coreSource,/guestNoticeDismissed=true/,'In-chat invitation must be dismissible');
assert.match(coreSource,/core-guest-register-card/,'In-chat invitation must be separately rendered');
assert.match(coreSource,/openPrismaAuthForGuestLimit\('signup'\)/,'Banner registration action opens real signup flow');
assert.match(coreSource,/openPrismaAuthForGuestLimit\('login'\)/,'Banner login action opens real login flow');
assert.match(coreSource,/card\.classList\.toggle\('hidden',!visible\)/,'Banner must disappear when authenticated or dismissed');

assert.match(coreSource,/input\.blur\(\);\s*openPrismaAuthForGuestLimit\(\);\s*return/,'Blocked task must keep the message and attachments untouched');
assert.match(coreSource,/recordCompletedCoreTask\(\{fileTask:true\}\)/,'Successful file creations count toward the trial');
assert.match(coreSource,/successful=true;[\s\S]*?recordCompletedCoreTask\(\{fileTask:attachments\.length>0/,'Only file-related workflows count once after successful completion');
const guestAccountSource=readFileSync(new URL('../src/prisma-account.js',import.meta.url),'utf8');
assert.match(guestAccountSource,/export function isPrismaAuthenticated\(\)/,'Auth check must use live Supabase session state');
assert.match(guestAccountSource,/export function openPrismaAuthForGuestLimit\(mode='intro'\)/,'Guest gate must open account signup or login');
assert.match(guestAccountSource,/prisma:guest-gate-closed/,'Auth modal closing must notify the chat');
assert.match(guestAccountSource,/prisma:guest-gate-open/,'Auth modal opening must temporarily hide the in-chat banner');
assert.match(guestAccountSource,/if\(mode==='signup'\|\|mode==='login'\)/,'Signup and login must use the existing account screens');
assert.match(guestAccountSource,/prisma-guest-gate-open/,'Only the guest-limit dialog should use mobile sheet styling');


const generatedFileStorageSource=readFileSync(new URL('../src/core-result-storage.js',import.meta.url),'utf8');
const engineCode=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(engineCode,/dimensiones:dimensions/,'Image metadata must use the declared dimensions variable');
const chatBackendSource=readFileSync(new URL('../functions/api/ai/chat.js',import.meta.url),'utf8');
assert.match(chatBackendSource,/PROVIDER_AUTH/,'Provider authentication failures must be distinguished from 502 network errors');
assert.match(chatBackendSource,/\[400,401,402,403,429\]\.includes\(status\)/,'Original authentication status must propagate to the client');

assert.match(generatedFileStorageSource,/indexedDB\.open\(DB_NAME, 1\)/,'Generated videos must be retained in a dedicated IndexedDB store');
assert.match(generatedFileStorageSource,/files\.createIndex\('chatId'/,'Results must be associated with their conversation for cleanup');
assert.match(generatedFileStorageSource,/blob\s*\n\s*\}\)/,'Generated file storage must preserve binary Blob bytes');
assert.match(coreSource,/fileKey:String\(entry\.result\?\.fileKey\|\|''\)/,'Saved chats must retain a generated file lookup key');
assert.match(coreSource,/await persistGeneratedResults\(visibleResults\)/,'Generated files must be stored before success is reported');
assert.match(coreSource,/loadGeneratedFile\(result\.fileKey\)/,'History must restore downloadable binaries after a reload or remote sync');
assert.match(coreSource,/document\.body\.appendChild\(a\);a\.click\(\);a\.remove\(\)/,'Downloads must use a DOM-connected anchor for mobile browsers');
assert.match(coreSource,/navigator\.share\(\{files:\[nativeFile\]\}\)/,'Mobile users should have a native save/share fallback');
assert.match(coreSource,/clearGeneratedFiles\(\)/,'Clearing local history must also clear locally generated files');
const stylesSource=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
assert.match(stylesSource,/body\.is-core-view \.core-guest-register-card\{/,'Signup banner is styled within the Core chat');
assert.match(stylesSource,/flex:0 0 auto/,'Signup banner occupies its own flow area without covering the messages');
assert.match(stylesSource,/body\.prisma-guest-gate-open #auth-modal\.auth-backdrop/,'Mobile limit modal uses a bottom-sheet variant');
const chatHtmlSource=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(chatHtmlSource,/id="core-guest-register-card"[\s\S]*?id="core-guest-register-login"[\s\S]*?id="core-guest-register-signup"/,'Signup card has accessible distinct account actions');
assert.ok(chatHtmlSource.indexOf('id="core-guest-register-card"')<chatHtmlSource.indexOf('id="core-composer"'),'Signup card must be above composer');
assert.ok(chatHtmlSource.indexOf('id="core-guest-register-card"')>chatHtmlSource.indexOf('id="core-messages"'),'Signup card must not appear inside message-scrolling region');

// The animated matrix is purely decorative and restricted to Core's empty state.
const welcomeGridSource=readFileSync(new URL('../src/core-welcome-grid.js',import.meta.url),'utf8');
assert.match(coreSource,/Cuéntame qué necesitas o adjunta un archivo\. Prisma organiza el resto\./,'Welcome helper copy must stay concise and explain the assistant flow');
assert.match(stylesSource,/max-width:680px;\s*margin:0 auto 17px;\s*color:color-mix\(in srgb,var\(--text\) 76%,var\(--accent\) 24%\);\s*font-weight:500;\s*line-height:1\.5/,'Welcome helper copy must be more readable without increasing its footprint');
assert.match(stylesSource,/body\.is-core-view \.core-welcome p\{\s*margin-bottom:14px;\s*line-height:1\.45;/,'Mobile welcome helper copy must remain compact');
assert.match(coreSource,/mountCoreWelcomeGrid\(list\)/,'The reactive dot matrix must cover the full chat viewport');
assert.match(coreSource,/list\.classList\.toggle\('is-empty',messages\.length===0\)/,'Core must mark its empty state for dedicated scroll behavior');
assert.match(welcomeGridSource,/container\.append\(layer\)/,'The ambient canvas must be attached to the full-width messages container');
assert.match(welcomeGridSource,/dotsDesktop=15,dotsTablet=17,dotsMobile=18/,'Dot density must be increased consistently across desktop, tablet and mobile');
assert.match(welcomeGridSource,/width<=580\?dotsMobile:width<=900\?dotsTablet:dotsDesktop/,'Dot spacing must adapt to viewport width');
assert.match(coreSource,/disposeWelcomeGrid\?\.\(\)/,'Chat changes must dispose the previous dot matrix animation');
assert.match(coreSource,/if\(!messages\.length\)/,'The matrix must be restricted to the empty chat state');
assert.match(welcomeGridSource,/pointermove/,'Desktop cursor must illuminate nearby dots');
assert.match(welcomeGridSource,/pointerleave/,'Cursor reaction must fade on exit');
assert.match(welcomeGridSource,/pointerdown/,'Mobile touch must have a lightweight interaction');
assert.match(welcomeGridSource,/prefers-reduced-motion: reduce/,'Respect reduced-motion accessibility');
assert.match(welcomeGridSource,/IntersectionObserver/,'Pause the matrix when offscreen');
assert.match(welcomeGridSource,/visibilitychange/,'Pause when the page is hidden');
assert.match(welcomeGridSource,/cancelAnimationFrame/,'Release animation resources on unmount');
assert.doesNotMatch(welcomeGridSource,/\bfetch\s*\(|XMLHttpRequest|\bgetContext\(['"]webgl|new WebSocket/,'Welcome matrix must not use network APIs or WebGL');
assert.match(stylesSource,/body\.is-core-view #core-messages\.is-empty/,'Empty Core state must receive dedicated layout styles');assert.match(stylesSource,/overflow-y:auto!important;\s*scrollbar-width:none!important/,'Empty welcome must not show a limiting scrollbar but remain scrollable if needed');
assert.match(stylesSource,/core-messages\.is-empty::\-webkit-scrollbar/,'Empty welcome must hide WebKit scrollbars');
assert.match(stylesSource,/inset:0!important;\s*z-index:0!important;\s*width:100%!important;\s*height:100%!important/,'Ambient canvas must fill the whole chat area');
assert.match(stylesSource,/body\.is-core-view \.core-welcome-ambient/,'Dot matrix must be styled only inside Core');
assert.match(stylesSource,/html\[data-theme="light"\] body\.is-core-view \.core-welcome-ambient/,'Dot matrix must support light mode');
assert.match(stylesSource,/-webkit-mask-image:radial-gradient/,'Dot matrix must fade gently into the surrounding chat');
assert.match(stylesSource,/pointer-events:none/,'Welcome background must not intercept taps');

// A short compliment about a previous song is a conversational turn, not a
// new songwriting request. Explicitly asking for another song remains an action.
assert.equal(isAcknowledgementMessage('Muy buena canción'),true);
assert.equal(isAcknowledgementMessage('Me encantó la canción'),true);
assert.equal(isAcknowledgementMessage('Gracias'),true);
assert.equal(isAcknowledgementMessage('Muy buena canción, crea otra'),false);
assert.match(buildAcknowledgementReply('Muy buena canción','Aquí está la letra completa de la canción.'),/esta misma/);
assert.match(buildAcknowledgementReply('Gracias',''),/Con gusto/);
const directTaskStart=coreSource.indexOf('function directCoreTask(text){');
const directTaskEnd=coreSource.indexOf('async function answerConversation',directTaskStart);
assert.ok(directTaskStart>=0&&directTaskEnd>directTaskStart,'Core conversation task router not found');
const directTask=new Function('attachments',coreSource.slice(directTaskStart,directTaskEnd)+';return directCoreTask;')([]);
assert.equal(directTask('Muy buena canción'),'conversation');
assert.equal(directTask('Explica qué es la fotosíntesis'),'conversation','Simple explanations should not use expensive reasoning route');
assert.equal(directTask('Analiza las consecuencias de tres estrategias'),'reasoning');
assert.equal(directTask('Me encanta la canción'),'conversation');
assert.equal(directTask('Crea una canción original'),'songwriting');
assert.equal(directTask('Una canción sobre esperanza'),'songwriting');
assert.match(coreSource,/core-message-row/,'messages must render inside a shared alignment lane');
assert.match(stylesSource,/body\.is-core-view \.core-message-row/,'chat lane layout CSS is missing');
assert.equal(directTask('Muy buena canción, crea otra'),'songwriting');
assert.match(stylesSource,/overflow-x: hidden !important/,'Core must prevent page-level horizontal overflow');
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

// Providers support up to six slots, except Requesty which is currently capped at three. Compact JSON pools
// keep the binding count below Cloudflare's per-Worker environment limit.
const fakeKeys = {
 GEMINI_API_KEY:'g1', GEMINI_API_KEY_2:'g2', GEMINI_API_KEY_3:'g3',
 GEMINI_API_KEY_4:'g4', GEMINI_API_KEY_5:'g5', GEMINI_API_KEY_6:'g6',
 GROQ_API_KEY:'q1', GROQ_API_KEY_2:'q2', GROQ_API_KEY_3:'q3',
 GROQ_API_KEY_4:'q4', GROQ_API_KEY_5:'q5', GROQ_API_KEY_6:'q6',
 OPENROUTER_API_KEY:'o1', OPENROUTER_API_KEY_2:'o2', OPENROUTER_API_KEY_3:'o3',
 OPENROUTER_API_KEY_4:'o4', OPENROUTER_API_KEY_5:'o5', OPENROUTER_API_KEY_6:'o6',
};
for (const provider of Object.keys(CREDENTIAL_ROOTS)) {
 assert.equal(maxCredentialSlots(provider),provider==='requesty'?3:6,provider+' credential slot cap');
}
assert.equal(maxCredentialSlots('cloudflare'),0,'Workers AI uses a Cloudflare binding, not API keys');
assert.equal(getCredentialSlots(fakeKeys,'gemini').length,6);
assert.equal(getCredentialStatus(fakeKeys,'gemini').max,6);
assert.equal(getCredentialSlots(fakeKeys,'openrouter').length,6);
assert.equal(getCredentialStatus(fakeKeys,'openrouter').slots.length,6);
assert.equal(getCredentialSlots(fakeKeys,'groq').length,6);
assert.equal(getCredentialStatus(fakeKeys,'groq').slots.length,6);

const compactPools = Object.fromEntries(Object.entries(CREDENTIAL_POOL_VARIABLES).map(([provider,variable]) =>
 [variable,JSON.stringify(Array.from({length:maxCredentialSlots(provider)},(_,index)=>provider+'-key-'+(index+1)))]
));
for (const provider of Object.keys(CREDENTIAL_ROOTS)) {
 const slots=getCredentialSlots(compactPools,provider);
 assert.equal(slots.length,maxCredentialSlots(provider),provider+' JSON pool must expose its configured maximum');
 assert.equal(slots.at(-1).number,maxCredentialSlots(provider),provider+' JSON pool must map its final key');
 const status=getCredentialStatus(compactPools,provider);
 assert.equal(status.poolValid,true);
 assert.ok(status.slots[0].variable.endsWith('[1]'));
 assert.doesNotMatch(JSON.stringify(status),new RegExp(provider+'-key-1'),'credential values must never appear in status metadata');
}
const mixedPool={REQUESTY_API_KEYS_JSON:'["json-key-1","json-key-2"]',REQUESTY_API_KEY_2:'manual-key-2'};
assert.equal(getCredentialSlots(mixedPool,'requesty')[0].value,'json-key-1');
assert.equal(getCredentialSlots(mixedPool,'requesty')[1].value,'manual-key-2','individual slot variables override the same JSON position');
const duplicatePool={ZAI_API_KEYS_JSON:'["same-key","same-key","third-key"]'};
assert.deepEqual(getCredentialSlots(duplicatePool,'zai').map(slot=>slot.number),[1,3],'duplicate secrets are not counted as separate credentials');
const blankPool={ZAI_API_KEYS_JSON:'["first-key","","third-key"]'};
assert.deepEqual(getCredentialSlots(blankPool,'zai').map(slot=>slot.number),[1,3],'blank JSON entries preserve the remaining slot positions');
assert.equal(getCredentialStatus({REQUESTY_API_KEYS_JSON:'{"not":"an array"}'},'requesty').poolValid,false);
assert.equal(getCredentialStatus({ZAI_API_KEYS_JSON:JSON.stringify(Array.from({length:7},(_,i)=>'key-'+i))},'zai').poolValid,false,'JSON pools cannot exceed six credentials');
assert.equal(maxCredentialSlots('requesty'),3,'Requesty is currently limited to three keys');
assert.equal(getCredentialStatus({REQUESTY_API_KEYS_JSON:'["r1","r2","r3"]'},'requesty').count,3);
assert.equal(getCredentialStatus({REQUESTY_API_KEYS_JSON:'["r1","r2","r3","r4"]'},'requesty').poolValid,false,'Requesty JSON cannot exceed three credentials');
assert.equal(getCredentialSlots({GROQ_API_KEY:'q1',GROQ_API_KEY_BACKUP:'q2'},'groq').length,2,'legacy BACKUP aliases remain supported');

// SenseNova authentication failures must try every configured independent key
// but must never rotate credentials to evade 429/402 quota restrictions.
const senseKeys={SENSENOVA_API_KEYS_JSON:JSON.stringify(['s1','s2','s3','s4','s5','s6'])};
let senseAttempts=[];
const authRecovery=await requestWithCredentialPool(senseKeys,'sensenova',async(key)=>{
 senseAttempts.push(key);
 return new Response(key==='s6'?'OK':'Unauthorized',{status:key==='s6'?200:401});
},{startIndex:0,sweepAuthSlots:true});
assert.equal(authRecovery.status,200,'SenseNova should reach the sixth valid API key after five rejected keys');
assert.deepEqual(senseAttempts,['s1','s2','s3','s4','s5','s6']);
let quotaAttempts=0;
const limitedSense=await requestWithCredentialPool(senseKeys,'sensenova',async()=>{
 quotaAttempts++;
 return new Response('Rate limited',{status:429});
},{startIndex:0,sweepAuthSlots:true});
assert.equal(limitedSense.status,429);
assert.equal(quotaAttempts,1,'Quota limits must never trigger account/key rotation');
let networkAttempts=0;
const networkSense=await requestWithCredentialPool(senseKeys,'sensenova',async()=>{
 networkAttempts++;
 return new Response('Gateway error',{status:502});
},{startIndex:0,sweepAuthSlots:true});
assert.equal(networkSense.status,502);
assert.equal(networkAttempts,2,'Network outages should not exhaust all six slots');
const credentialPoolSource=readFileSync(new URL('../functions/_lib/credential-pool.js',import.meta.url),'utf8');
assert.match(credentialPoolSource,/crypto\.subtle\.digest\('SHA-256',bytes\)/,'Pauses should identify credentials by a nonreversible key fingerprint');
assert.match(credentialPoolSource,/await credentialHealthKey\(provider, slot\)/,'A replaced secret must not inherit its prior slot cooldown');
assert.match(credentialPoolSource,/El proveedor devolvió HTTP 401/,'Provider health should identify upstream authentication errors');
assert.match(credentialPoolSource,/response.status === 401\) \{/,'Only 401 should put an individual credential on authentication cooldown');
let forbiddenAttempts=0;
const forbiddenResponse=await requestWithCredentialPool(senseKeys,'sensenova',async()=>{forbiddenAttempts++;return new Response('Model not permitted',{status:403});},{startIndex:0,sweepAuthSlots:true});
assert.equal(forbiddenResponse.status,403);
assert.equal(forbiddenAttempts,1,'Model permission errors must not sweep or invalidate other keys');
assert.equal(await getHealthyCredentialCount(senseKeys,'sensenova'),6,'All slots must be considered healthy when D1 is unavailable');
const rejectedSenseKeys={
 ...senseKeys,
 PRISMA_RATE_DB:{
  prepare(){return {bind(){return {async first(){return {state:'auth_error',valid_until:9999999999};}};}};}
 }
};
assert.equal(await getHealthyCredentialCount(rejectedSenseKeys,'sensenova'),0,'Rejected SenseNova keys must not remain advertised as available');
const providerStatusSource=readFileSync(new URL('../functions/api/providers/status.js',import.meta.url),'utf8');
assert.match(providerStatusSource,/senseNovaHealthySlots\s*>\s*0/,'Prisma must not route to SenseNova when all six keys are on auth cooldown');
assert.match(providerStatusSource,/HTTP 401\/403/,'Provider panel must explain authentication rejection clearly');


const compatibleChatSource=readFileSync(new URL('../functions/api/ai/chat.js',import.meta.url),'utf8');
assert.match(compatibleChatSource,/sweepAuthSlots:provider==="sensenova"/,'SenseNova must enable valid-key auth sweep');
assert.match(compatibleChatSource,/sensenova:\{url:"https:\/\/token\.sensenova\.cn\/v1\/chat\/completions"/,'SenseNova keys must use the documented official API host');
assert.match(compatibleChatSource,/provider==="sensenova"\?2048:128/,'SenseNova reasoning should have an adequate output token budget');

// Prisma Core independent intelligence must work without AI models or Mini.
assert.ok(INDEPENDENT_CORE_KNOWLEDGE_COUNT>=40,'Ship at least 40 curated, bounded factual concepts');
assert.match(solveOfflineArithmetic('15% de 200'),/30/,'Offline percentage');
assert.match(solveOfflineArithmetic('¿Cuánto es 25 * 4?'),/100/,'Offline multiplication');
assert.match(solveOfflineArithmetic('10 / 0'),/dividir entre cero/,'Zero division');
assert.match(resolveIndependentCoreRequest('¿Qué es RLS?').text,/filas/,'Offline technical knowledge');
assert.match(resolveIndependentCoreRequest('¿Qué significa HTTP 401?').text,/autenticación|autenticacion/,'Offline error guidance');
assert.equal(resolveIndependentCoreRequest('Explícame el conflicto internacional de hoy'),null,'No fabricated fresh facts');
assert.equal(solveOfflineArithmetic('cuanto es 2+2 y además compara con el año pasado'),null,'Unsupported compound arithmetic must not silently drop instructions');
const offlineSummary=getOfflineExtractiveSummary('Resume: La seguridad de las aplicaciones exige permisos adecuados. Los permisos se comprueban del lado del servidor. Las credenciales no deben exponerse en el navegador. Los registros deben revisarse periódicamente.');
assert.match(offlineSummary,/extractivo local/,'Extractive summary must be clearly labeled');
assert.equal(getOfflineExtractiveSummary('Resume: hola'),null,'Do not invent a summary of insufficient input');
const independentCoreSource=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
assert.match(independentCoreSource,/resolveIndependentCoreRequest\(userText\)/,'Core must use local intelligence');
assert.match(independentCoreSource,/const localPlan=buildLocalPlan\(userText\)/,'No-provider fallback must use independent local tools rather than browser models');
assert.doesNotMatch(independentCoreSource,/const nativePlan=await requestNativeBrowserPlan\(userText,attachmentContext\)/,'Prisma Mini must not be part of Core fallback');

// Cost-aware provider selection: one best-fit model first, sequential fallbacks only.
const allProviders = new Set(['groq','cloudflare','gemini','pollinations','huggingface','openrouter','kilo','requesty','sensenova','zai','aihubmix']);
const availableAll = name => allProviders.has(name);
assert.deepEqual(rankProviders({task:'planner',available:availableAll}),ROUTE_ORDER.planner);
assert.deepEqual(rankProviders({task:'coding',available:availableAll}),ROUTE_ORDER.coding);
assert.deepEqual(rankProviders({preferred:'gemini',task:'coding',available:availableAll})[0],'gemini');
const now=Date.now();
const cooled=rankProviders({task:'planner',available:availableAll,now,health:{
 'groq:planner':{at:now,failures:3,coolingUntil:now+60000,averageMs:22000}
}});
assert.equal(cooled[0],'cloudflare','a cooled provider must move behind healthy alternatives');
assert.equal(cooled.at(-1),'openrouter','OpenRouter stays the final independent reserve');
assert.equal(selectTaskModel('cloudflare','coding','balanced',[{id:'@cf/qwen/qwen3.8-27b'}]),'@cf/qwen/qwen3.8-27b');
assert.equal(selectTaskModel('pollinations','coding','balanced',[{id:'qwen/qwen3-coder-30b-a3b-instruct'}]),'qwen/qwen3-coder-30b-a3b-instruct');
assert.equal(selectTaskModel('gemini','reasoning','smart',[{id:'gemini-3.8-flash'}]),'gemini-3.8-flash');
assert.equal(selectTaskModel('openrouter','general','fast',[{id:'openrouter/free'}]),'openrouter/free');
assert.equal(selectTaskModel('sensenova','general','balanced',[{id:'sensenova-6.8-flash-lite'}]),'sensenova-6.8-flash-lite');
assert.equal(selectTaskModel('zai','reasoning','smart',[{id:'glm-4.7-flash'}]),'glm-4.7-flash');
assert.equal(selectTaskModel('requesty','coding','balanced',[{id:'novita/ling-3.1-flash'}]),'novita/ling-3.1-flash');
assert.equal(selectTaskModel('requesty','general','fast',CHAT_MODELS.requesty),'novita/inclusionai/ling-3.0-tiny');
assert.equal(selectTaskModel('kilo','quick','fast',[{id:'nvidia/nemotron-3-ultra:free'}]),'nvidia/nemotron-3-ultra:free');
assert.equal(rankProviders({preferred:'kilo',task:'general',available:availableAll})[0],'kilo');
assert.equal(rankProviders({preferred:'aihubmix',task:'general',available:availableAll})[0],'aihubmix');
assert.equal(ROUTE_ORDER.general.includes('kilo'),true,'Kilo may be used as safe automatic fallback with vetted non-NVIDIA models');
assert.equal(ROUTE_ORDER.general.includes('aihubmix'),true,'AIHubMix is a candidate but its trial must be gated by the runtime flag');
assert.equal(CHAT_MODELS.baidu,undefined,'Excluded providers must not be registered');
assert.deepEqual(rankProviders({task:'planner',available:name=>name==='groq'||name==='openrouter'}),['groq','openrouter']);

// Mock D1 provider-health storage. Tests make no network requests and spend no quotas.
function mockCredentialEnv(values={}) {
 const holds=new Map();
 const db={
  prepare(sql){
   return {bind(...args){
    return {
     first:async()=>{
      if(sql.includes('SELECT state, reason, valid_until FROM ai_provider_health')){
       const [provider,nowSeconds]=args,hold=holds.get(provider);
       return hold&&hold.valid_until>nowSeconds?hold:null;
      }
      return null;
     },
     run:async()=>{
      if(sql.includes('INSERT INTO ai_provider_health')){
       const [provider,state,reason,valid_until]=args;
       holds.set(provider,{provider,state,reason,valid_until});
      }
      return {success:true};
     }
    };
   }};
  }
 };
 return {...values,PRISMA_RATE_DB:db,__holds:holds};
}
const authEnv=mockCredentialEnv({GEMINI_API_KEY:'g1',GEMINI_API_KEY_2:'g2',GEMINI_API_KEY_3:'g3'});
const authSlots=[];
const authResult=await requestWithCredentialPool(authEnv,'gemini',async(key,slot)=>{
 authSlots.push(slot);
 return new Response(slot===1?'unauthorized':'ok',{status:slot===1?401:200});
},{startIndex:0});
assert.equal(authResult.status,200);
assert.deepEqual(authSlots,[1,2],'only a key-specific auth failure may try one alternate credential');

const rateEnv=mockCredentialEnv({GROQ_API_KEY:'q1',GROQ_API_KEY_2:'q2',GROQ_API_KEY_3:'q3'});
let rateCalls=0;
const rateResult=await requestWithCredentialPool(rateEnv,'groq',async()=>{
 rateCalls++;
 return new Response('rate limited',{status:429,headers:{'Retry-After':'60'}});
});
assert.equal(rateResult.status,429);
assert.equal(rateCalls,1,'a provider 429 must not rotate to another account');
await assert.rejects(()=>requestWithCredentialPool(rateEnv,'groq',async()=>{
 rateCalls++;
 return new Response('ok',{status:200});
}),error=>error.code==='PROVIDER_COOLDOWN');
assert.equal(rateCalls,1,'provider cooldown must prevent repeated paid/quota calls');

const creditEnv=mockCredentialEnv({POLLINATIONS_API_KEY:'p1',POLLINATIONS_API_KEY_2:'p2'});
let creditCalls=0;
const creditResult=await requestWithCredentialPool(creditEnv,'pollinations',async()=>{
 creditCalls++;
 return new Response('no credits',{status:402});
});
assert.equal(creditResult.status,402);
assert.equal(creditCalls,1,'HTTP 402 must stop the provider pool instead of trying more accounts');

const transientEnv=mockCredentialEnv({OPENROUTER_API_KEY:'o1',OPENROUTER_API_KEY_2:'o2',OPENROUTER_API_KEY_3:'o3'});
const transientSlots=[];
const transientResult=await requestWithCredentialPool(transientEnv,'openrouter',async(key,slot)=>{
 transientSlots.push(slot);
 return new Response(slot===1?'upstream error':'ok',{status:slot===1?503:200});
},{startIndex:0});
assert.equal(transientResult.status,200);
assert.deepEqual(transientSlots,[1,2],'transient upstream errors may try one backup key only');

const requestyThreeSlotEnv=mockCredentialEnv({
 REQUESTY_API_KEYS_JSON:JSON.stringify(['r1','r2','r3'])
});
let selectedSlot=0;
const selectedResult=await requestWithCredentialPool(requestyThreeSlotEnv,'requesty',async(key,slot)=>{
 selectedSlot=slot;
 return new Response('ok',{status:200});
},{startIndex:2});
assert.equal(selectedResult.status,200);
assert.equal(selectedSlot,3,'Requesty must be able to select its third configured key');


// Provider-independent Markdown rendering and real capability discovery.
const sampleTable = renderMarkdownSafe([
  '| Área | Funciones disponibles |',
  '|------|-----------------------|',
  '| **Procesamiento de texto** | Contar palabras, cambiar mayúsculas/minúsculas, buscar y reemplazar. |',
  '| **Trabajo con imágenes** | Convertir formatos, comprimir, recortar y ajustar. |'
].join('\n'));
assert.match(sampleTable, /<table class="core-markdown-table">/);
assert.match(sampleTable, /<th class="align-left" scope="col">Área<\/th>/);
assert.match(sampleTable, /<strong>Procesamiento de texto<\/strong>/);
assert.match(sampleTable, /<tbody>/);
assert.doesNotMatch(sampleTable, /\|------/);
const richMarkdown = renderMarkdownSafe([
  '## Resumen',
  '',
  '- **Primero:** revisar el archivo.',
  '- Segundo: ejecutar el cambio.',
  '',
  '\`\`\`js',
  'const ready = true;',
  '\`\`\`',
  '',
  '<img src=x onerror=alert(1)>'
].join('\n'));
assert.match(richMarkdown, /<h3>Resumen<\/h3>/);
assert.match(richMarkdown, /<ul><li><strong>Primero:<\/strong>/);
assert.match(richMarkdown, /<pre><code>const ready = true;<\/code><\/pre>/);
assert.match(richMarkdown, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(richMarkdown, /<img src=/);

assert.equal(router.isToolDiscoveryQuestion('Hola, ¿qué habilidades tienes?'), true);
assert.equal(router.isToolDiscoveryQuestion('¿Qué sabes hacer?'), true);
const capabilityAnswer = router.describeCoreTools('Hola, ¿qué habilidades tienes?');
assert.match(capabilityAnswer, /\*\*Mis áreas principales\*\*/);
assert.match(capabilityAnswer, /herramientas activas/);
assert.match(router.coreCapabilityContext(), /CAPACIDADES REALES DE PRISMA SPACE/);
assert.match(router.coreCapabilityContext(), /No inventes funciones/);
const pdfCapabilities = router.describeCoreTools('¿Qué puedes hacer con un PDF?');
assert.doesNotMatch(pdfCapabilities, /Mis áreas principales/,
  'specific capability questions should show relevant tools, not the full generic catalog');
assert.match(pdfCapabilities, /PDF/i);
const engineSource = readFileSync(new URL('../src/engines.js', import.meta.url), 'utf8');
const corePromptSource = readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
assert.match(engineSource, /Formato universal/);
assert.match(engineSource, /No escribas tablas ASCII/);
assert.match(corePromptSource, /coreCapabilityContext/);
assert.match(corePromptSource, /Motores de texto configurados en el servidor/);

// Sidebar UI contract: compact brand, temporary chat search, new-chat row,
// desktop collapse/reopen, and profile kept in the main top bar.
const sidebarHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sidebarMain = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const sidebarCore = readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
const sidebarCss = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
for (const id of [
  'sidebar-search-toggle','sidebar-collapse-toggle','conversation-search-layer',
  'sidebar-new-chat-slot','core-history-search','core-history-new','mobile-menu'
]) {
  assert.equal((sidebarHtml.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
    'sidebar control must exist exactly once: ' + id);
}
assert.match(sidebarCore, /searchOverlaySlot\.append\(searchField\)/);
assert.match(sidebarCore, /sidebarNewChatSlot\.append\(newChatButton\)/);
assert.match(sidebarMain, /function setupSidebarControls\(\)/);
assert.match(sidebarMain, /prisma-sidebar-collapsed/);
assert.match(sidebarMain, /sidebar-search-open/);
assert.match(sidebarCss, /body\.sidebar-collapsed \.sidebar/);
assert.match(sidebarCss, /\.conversation-search-layer\{/);
assert.doesNotMatch(sidebarHtml,/id="sidebar-search-slot"/);
const topbarIndex = sidebarHtml.indexOf('class="topbar"');
const profileIndex = sidebarHtml.indexOf('class="profile-wrap"');
const topbarEnd = sidebarHtml.indexOf('</header>', topbarIndex);
assert.ok(topbarIndex >= 0 && profileIndex > topbarIndex && profileIndex < topbarEnd,
  'profile menu must remain in its existing topbar position');

// First-paint contract: static HTML must already match the default Core route.
// This prevents the old tools dashboard from flashing before the module executes.
assert.match(sidebarHtml, /<body class="is-core-view app-booting">/);
assert.match(sidebarHtml, /class="nav-item active core-nav-item" data-view="core"/);
assert.match(sidebarHtml, /id="breadcrumb-current">Prisma Core</);
assert.match(sidebarHtml, /<section class="core-section" id="core-section">/);
assert.match(sidebarHtml, /<div class="hero-section hidden">/);
assert.match(sidebarHtml, /<div class="metric-strip hidden">/);
assert.match(sidebarHtml, /<section class="home-dashboard hidden" id="home-dashboard">/);
assert.match(sidebarHtml, /<section class="tools-section hidden" id="tools-section">/);
assert.match(sidebarHtml, /<section class="ai-section hidden" id="ai-section">/);
assert.ok(sidebarHtml.indexOf('id="core-messages"') < sidebarHtml.indexOf('class="core-welcome"'));
assert.ok(sidebarHtml.includes('class="core-welcome"'));
assert.ok(sidebarHtml.includes('class="category-nav hidden" id="category-nav"'));
assert.doesNotMatch(sidebarHtml, /class="core-sidebar-conversations hidden"/);
assert.ok(sidebarCore.includes('mainSidebarSlot.replaceChildren(integratedHistory)'));
assert.ok(sidebarCss.includes('body.is-core-view #core-workspace > .core-history'));
assert.match(sidebarMain, /activeView='core'/);

const themeBootstrapIndex = sidebarHtml.indexOf("localStorage.getItem('prisma-theme')");
const stylesheetIndex = sidebarHtml.indexOf('rel="stylesheet" href="./styles.css"');
assert.ok(themeBootstrapIndex >= 0 && themeBootstrapIndex < stylesheetIndex);
assert.match(sidebarHtml, /id="app-startup"/);
assert.match(sidebarHtml, /core-connect-banner hidden/);
assert.ok(sidebarMain.indexOf("safeStartup('Prisma Core',initPrismaCore)") < sidebarMain.indexOf("document.body.classList.remove('app-booting')"));
assert.match(sidebarMain, /syncThemeChrome/);
const authSource = readFileSync(new URL('../src/prisma-account.js', import.meta.url), 'utf8');
assert.match(sidebarHtml, /auth-provider-grid/);
assert.match(authSource, /setProviderAvailability/);
assert.match(authSource, /!config\.enabled/);
const experienceSource = readFileSync(new URL('../src/prisma-experience.js', import.meta.url), 'utf8');
assert.match(experienceSource, /controllerchange/);
assert.match(experienceSource, /updateViaCache/);
const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
assert.match(swSource, /cache:"no-store"/);



// The app-wide daily ceiling grows with active provider families, not raw key
// count. Extra keys never multiply a project's actual provider quota.
const capacityEnv = {
 GEMINI_API_KEY:'g1',
 GROQ_API_KEY:'q1',
 HF_TOKEN:'hf1',
 POLLINATIONS_API_KEY:'p1',
 AI:{run(){}},
};
const capacityWithMoreKeys = {
 ...capacityEnv,
 GEMINI_API_KEY_2:'g2', GEMINI_API_KEY_3:'g3',
 GROQ_API_KEY_2:'q2', GROQ_API_KEY_3:'q3', GROQ_API_KEY_4:'q4', GROQ_API_KEY_5:'q5',
};
assert.equal(getProviderDailyLimit(capacityEnv,'groq'),30);
assert.equal(getSharedDailyBudget(capacityEnv),getSharedDailyBudget(capacityWithMoreKeys));
assert.equal(getSharedDailyBudget(capacityEnv),150);
assert.equal(getVisitorDailyLimit(capacityEnv),75);
assert.equal(getProviderDailyLimit({...capacityEnv,PRISMA_GROQ_DAILY_LIMIT:'18'},'groq'),18);
assert.equal(getProviderDailyLimit({AIHUBMIX_DAILY_QUOTA_ACTIVE:'1'},'aihubmix'),15);
assert.equal(getProviderMinuteLimit('aihubmix'),10);
assert.equal(getProviderMinuteLimit('requesty'),10);
assert.equal(getProviderMinuteLimit('sensenova'),5);
assert.equal(getProviderMinuteLimit('zai'),3);
assert.equal(getProviderMinuteLimit('kilo'),3);
assert.equal(getSharedDailyBudget({...capacityEnv,PRISMA_TOTAL_DAILY_LIMIT:'60'}),60);
assert.equal(getVisitorDailyLimit({...capacityEnv,PRISMA_VISITOR_DAILY_LIMIT:'42'}),42);
const statusSource = readFileSync(new URL('../functions/api/providers/status.js', import.meta.url), 'utf8');
assert.match(statusSource, /dailyUsage: usage/);
assert.match(statusSource, /dailyAvailable/);
assert.match(statusSource, /perMinutePerVisitor: 20/);
assert.match(statusSource, /aihubmixLifetime/);
assert.match(statusSource, /getKiloFreeModels/);
assert.match(statusSource, /getAihubmixFreeModels/);
assert.match(statusSource, /getProviderMinuteLimit/);
assert.match(statusSource, /aihubmixDailyQuotaActive/);
assert.match(statusSource, /kiloAutomaticEligible/);
const chatSource = readFileSync(new URL('../functions/api/ai/chat.js', import.meta.url), 'utf8');
assert.doesNotMatch(chatSource, /BAIDU_FREE_QUOTA_CONFIRMED/);
assert.doesNotMatch(chatSource,/RADEON|QIANFAN|developer\.amd\.com/i,'Excluded endpoints must be absent from chat routing');
assert.doesNotMatch(statusSource,/RADEON|QIANFAN|developer\.amd\.com/i,'Excluded endpoints must be absent from provider status');
const modelCatalogSource = readFileSync(new URL('../functions/_lib/model-catalog.js', import.meta.url), 'utf8');
for (const provider of ['kilo','requesty','sensenova','zai','aihubmix']) assert.match(modelCatalogSource, new RegExp(provider+':'));
assert.equal(CHAT_MODELS.requesty.length,13);
assert.equal(CHAT_MODELS.aihubmix.length,0,'AIHubMix catalogue is loaded from its live API, not a stale hard-coded list');
assert.equal(CHAT_MODELS.amd,undefined,'AMD is removed from the model catalog');
assert.ok(CHAT_MODELS.requesty.some(model=>model.id==='novita/ling-3.1-flash'));
assert.ok(CHAT_MODELS.requesty.some(model=>model.id==='novita/inclusionai/ling-3.0-tiny'));
const aihubmixSource = readFileSync(new URL('../functions/_lib/aihubmix-models.js', import.meta.url), 'utf8');
assert.match(aihubmixSource, /free_quota_config/);
assert.match(aihubmixSource, /weight !== 1/);

// Browser-independent intelligence and privacy utility regressions.
const priorChat=[
 {role:'user',content:'El proyecto se llama Prisma Space y utiliza proveedores Groq y Gemini.'},
 {role:'assistant',content:'Podemos priorizar el uso gratuito del sistema.'},
 ...Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:'Detalle de otra tarea '+i}))
];
const recalled=buildConversationContext(priorChat,'¿Qué proveedores tiene Prisma Space?',{maxMessages:12,maxChars:10000});
assert.ok(recalled.some(entry=>entry.content.includes('Groq y Gemini')),'Relevant older context must be retained.');
assert.ok(recalled.at(-1).content.includes('otra tarea'),'Recent context must be retained.');
assert.ok(recalled.length<=12);
assert.equal(chooseCoreReasoning('coding','Depura este código'),'smart');
assert.equal(chooseCoreReasoning('conversation','Hola, ¿qué tal?'),'fast');
assert.equal(isCoreFollowUp('¿Y las demás?'),true,'Short follow-up must reference the conversation');
assert.equal(isCoreFollowUp('¿Qué es un PDF?'),false,'Independent factual question must not be forced to use a previous artifact');
assert.deepEqual(chooseCoreContextOptions('conversation','¿Y eso por qué?'),{maxMessages:13,maxChars:14500},'Short follow-ups need ample relevant context');
assert.equal(chooseCoreReasoning('conversation','Analiza por qué falla esta autenticación y evalúa las causas'),'smart','Complex requests deserve deeper model routing');
assert.equal(chooseCoreReasoning('conversation','Hola, ¿qué tal?'),'fast','Quick greetings remain efficient');
assert.equal(chooseCoreResponseLength('conversation','Explica cómo funciona y cuándo conviene usar un sistema de registro de pacientes'),'long','Meaningful explanations must not be artificially short');
assert.equal(chooseCoreResponseLength('conversation','¿Qué es un archivo PDF?'),'medium','Ordinary factual answers should not be one-line by default');

assert.ok(runLocalCreatorTool('text-redact-sensitive',{text:'Correo: test@example.com y clave: rqsty-sk-Abc123Abc123Abc123'}).text.includes('[CLAVE OCULTA]'));
assert.doesNotMatch(runLocalCreatorTool('text-redact-sensitive',{text:'test@example.com'}).text,/test@example.com/);
const utm=runLocalCreatorTool('utm-builder',{url:'https://example.com/?a=1',source:'instagram',medium:'social',campaign:'prisma'});
assert.match(utm.text,/utm_source=instagram/);
assert.match(utm.text,/a=1/);
assert.throws(()=>runLocalCreatorTool('utm-builder',{url:'javascript:alert(1)',source:'x',medium:'y',campaign:'z'}));
const srt=runLocalCreatorTool('subtitle-srt-local',{text:'Hola Prisma\nBienvenidos',secondsPerCue:3});
assert.match(srt.text,/00:00:00,000 --> 00:00:03,000/);
assert.equal(srt.filename,'prisma-subtitulos.srt');
const autoRouteEngineSource=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(autoRouteEngineSource,/aihubmixDailyQuotaActive/,'Automatic AIHubMix needs confirmed top-up.');
assert.match(autoRouteEngineSource,/startsWith\('nvidia\/'\)/,'NVIDIA trial endpoints must not be auto-selected.');

// Additional browser-native utilities and specialist routing.
const localJsonDiff=compareJsonDocuments('{"a":1,"nested":{"status":"pending"}}','{"a":2,"nested":{"status":"ready","added":true}}');
assert.ok(localJsonDiff.text.includes('$.a')&&localJsonDiff.text.includes('$.nested.status'));
assert.ok(localJsonDiff.text.includes('$.nested.added'));
assert.equal(compareJsonDocuments('{"a":1}','{"a":1}').text,'Los dos documentos JSON son equivalentes.');
assert.throws(()=>compareJsonDocuments('not json','{}'),/JSON original no es válido/);
const extractedIds=extractAcademicIdentifiers('DOI 10.1038/s41586-020-2649-2 · PMID: 32895569 · arXiv: 2401.12345');
assert.ok(extractedIds.text.includes('https://doi.org/10.1038/s41586-020-2649-2'));
assert.ok(extractedIds.text.includes('https://pubmed.ncbi.nlm.nih.gov/32895569/'));
assert.ok(extractedIds.text.includes('https://arxiv.org/abs/2401.12345'));
const redactedText=redactSensitiveText('usuario@ejemplo.com +57 300 123 4567');
assert.doesNotMatch(redactedText.text,/usuario@ejemplo.com/);
for(const id of ['json-compare-local','citation-ids-local','ai-compare-options','ai-action-plan','ai-text-review'])
 assert.ok(registered.some(tool=>tool.id===id),id+' registered');
const enhancedEngine=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
const enhancedCore=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
for(const id of ['ai-compare-options','ai-action-plan','ai-text-review']){
 assert.ok(enhancedEngine.includes("'"+id+"'"),id+' is executable');
 assert.ok(enhancedCore.includes("'"+id+"'"),id+' routes from Core');
}
assert.ok(enhancedEngine.includes('runAdvancedTextTool'));
assert.ok(readFileSync(new URL('../src/provider-connections.js',import.meta.url),'utf8').includes('cachedCentralStatus'));


/* Images are generated only on explicitly enabled backend providers. No
 * hidden personal-key fallback, costly multi-model probes or invalid retries. */
const imageFeatures={cloudflareImages:true,pollinationsImages:true,huggingfaceImages:false,geminiImages:false};
assert.deepEqual(selectImageCandidates({features:imageFeatures}).map(item=>item.provider),['cloudflare','pollinations']);
assert.deepEqual(selectImageCandidates({features:{}}),[]);
assert.deepEqual(selectImageCandidates({provider:'gemini',features:imageFeatures}),[]);
assert.equal(selectImageCandidates({provider:'pollinations',features:imageFeatures,model:'tongyi-mai/z-image-turbo'})[0].model,'tongyi-mai/z-image-turbo');
assert.equal(imageFailureDecision({status:429}).blockProvider,true);
assert.equal(imageFailureDecision({status:402}).stop,false);
assert.equal(imageFailureDecision({code:'GLOBAL_LIMIT'}).stop,true);
assert.equal(imageFailureDecision({status:400}).stop,true);
assert.equal(imageFailureDecision({status:503}).stop,false);
const imageEngineSource=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(imageEngineSource,/selectImageCandidates\(/);
assert.match(imageEngineSource,/imageFailureDecision\(/);
assert.match(imageEngineSource,/No hidden retries with a personal Pollinations key/);
assert.match(statusSource,/const imageUsage =/);
assert.match(statusSource,/imageReady\("cloudflare"\)/);
assert.match(statusSource,/imageReady\("pollinations"\)/);
assert.match(statusSource,/imageUsage,/);
assert.equal(chooseCoreResponseLength('conversation','Hola'),'short');
assert.equal(chooseCoreResponseLength('reasoning','Explica brevemente la comparación'),'short');
assert.equal(chooseCoreResponseLength('songwriting','Crea una canción completa'),'long');
assert.equal(chooseCoreReasoning('coding','¿Qué es HTML?'),'balanced');

// Connection panel exposes independently tracked image quota, not only text usage.
const connectionsSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(connectionsSource,/central\.imageUsage\?\.\[provider\]/);
assert.match(connectionsSource,/cloudflare-image-usage/);
assert.match(connectionsSource,/pollinations-image-usage/);
assert.match(connectionsSource,/const count=Object\.values\(central\.providers\|\|\{\}\)\.filter\(Boolean\)\.length/);


// Core 4: bounded API budget, no hidden personal credits, and observable usage.
const rankedEngines=['groq','cloudflare','gemini','requesty','sensenova','zai','kilo','openrouter'];
assert.deepEqual(selectInferenceCandidates(rankedEngines,{task:'conversation'}),['groq','cloudflare','gemini','requesty','sensenova','openrouter']);
assert.deepEqual(selectInferenceCandidates(rankedEngines,{task:'reasoning'}),['groq','cloudflare','gemini','requesty','sensenova','zai','openrouter']);
assert.deepEqual(selectInferenceCandidates(rankedEngines,{preferred:'gemini'}),['gemini']);
assert.deepEqual(selectInferenceCandidates(['groq'],{preferred:'gemini'}),[],'Manual selection never substitutes another provider');
assert.deepEqual(selectInferenceCandidates(rankedEngines,{preferred:'gemini',allowFallback:true}),rankedEngines);
assert.equal(stopInferenceFallback({status:400}),true,'Permanent invalid requests must not be retried');
assert.equal(stopInferenceFallback({status:429}),false,'Provider quota failures may use a different authorized backend');
assert.equal(stopInferenceFallback({status:503}),false);
assert.equal(stopInferenceFallback({code:'INVALID_REQUEST'}),true);
assert.deepEqual(normalizeInferenceUsage({prompt_tokens:43,completion_tokens:12,total_tokens:55}),{
 inputTokens:43,outputTokens:12,totalTokens:55
});
assert.deepEqual(normalizeInferenceUsage({input_tokens:10,output_tokens:8}),{
 inputTokens:10,outputTokens:8,totalTokens:18
});
assert.equal(normalizeInferenceUsage({}),null,'Never invent token metrics');
const usageValues=new Map();
const usageStorage={
 getItem:key=>usageValues.get(key)||null,
 setItem:(key,value)=>usageValues.set(key,value)
};
recordInferenceUsage('groq',{prompt_tokens:100,completion_tokens:50},usageStorage);
recordInferenceUsage('cloudflare',null,usageStorage);
assert.deepEqual(readInferenceUsage(usageStorage),{
 requests:2,measuredRequests:1,totalTokens:150
});
assert.ok(!usageValues.get(INFERENCE_USAGE_KEY).includes('secret'),'No secret values recorded in usage');
assert.deepEqual(chooseCoreContextOptions('conversation','Hola'),{maxMessages:3,maxChars:3500});
assert.deepEqual(chooseCoreContextOptions('songwriting','Cambia el coro de esa canción'),{maxMessages:13,maxChars:14500});
assert.deepEqual(chooseCoreContextOptions('coding','Implementa una función segura'),{maxMessages:11,maxChars:11500});
const entireSong='TÍTULO\\n'+('Verso de la canción '.repeat(220))+'FIN DEL CORO';
const revisionContext=buildConversationContext([
 {role:'user',content:'Compón una canción sobre esperanza.'},
 {role:'assistant',content:entireSong}
],'Cambia el coro de esa canción',{maxChars:14500,maxMessages:13});
assert.ok(revisionContext.some(item=>item.role==='assistant'&&item.content.includes('FIN DEL CORO')),
 'An explicit revision must preserve the complete previous draft, not just 1900 chars.');
const economyEngine=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(economyEngine,/selectInferenceCandidates\(/);
assert.match(economyEngine,/stopInferenceFallback\(/);
assert.match(economyEngine,/recordInferenceUsage\(provider,usage\)/);
assert.match(economyEngine,/preferred!=='auto'/,'Personal keys cannot be spent by Core automatic text routing');
const economyCore=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
assert.match(economyCore,/chooseCoreContextOptions\(task,taskText\)/);
assert.match(economyCore,/asksAboutPrisma/,'Provider catalog must not be sent with every question');
const economyMain=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(economyMain,/readInferenceUsage\(\)/);
assert.match(economyMain,/tokens reportados/);


// Prisma Core 5: distinguish what Core CAN do from an instruction to do it.
const pendingWeb={started:Date.now()};
assert.equal(routeWebsiteRequest('¿Puedes hacer una página web?')?.type,'ask');
assert.equal(routeWebsiteRequest('¿Puedes hacer una web?')?.type,'ask');
assert.equal(routeWebsiteRequest('Hazme una página web')?.type,'ask');
assert.equal(routeWebsiteRequest('Necesito una web para mi negocio')?.type,'ask');
assert.equal(routeWebsiteRequest('¿Puedes hacer una página web para un consultorio odontológico?')?.type,'build');
assert.equal(routeWebsiteRequest('Quiero una landing para vender zapatos')?.type,'build');
assert.equal(routeWebsiteRequest('Una tienda de ropa',pendingWeb)?.type,'build');
assert.equal(routeWebsiteRequest('Cancelar',pendingWeb)?.type,'cancel');
assert.equal(routeWebsiteRequest('Hola, ¿qué es HTML?',pendingWeb)?.type,'abandon');
assert.equal(routeWebsiteRequest('Quiero una imagen',pendingWeb)?.type,'abandon');
assert.equal(routeWebsiteRequest('Quiero una imagen para mi web'),null);
assert.equal(routeWebsiteRequest('¿Cuánto cuesta una página web?'),null);
assert.equal(routeWebsiteRequest('¿Cómo hacer una página web?'),null);
assert.equal(routeWebsiteRequest('Haz una web para un museo',null,true),null,'An attached file is never silently ignored');
assert.match(resolveGeneralCapabilityQuestion('¿Puedes hacer una canción?'),/tema/);
assert.match(resolveGeneralCapabilityQuestion('¿Puedes hacer una imagen?'),/Qué quieres/);
assert.equal(resolveGeneralCapabilityQuestion('Crea una canción sobre esperanza'),null,
 'A clear creation request must not be mistaken for a general capability question');
assert.match(resolvePrismaProductQuestion('¿Tienes memoria?'),/IndexedDB/);
assert.match(resolvePrismaProductQuestion('¿Qué recuerdas de mí?'),/esta conversación activa/);
assert.ok(!resolvePrismaProductQuestion('¿Tienes memoria?').includes('No guardo información una vez que la sesión termina'));
const webHTML='<!DOCTYPE html><html lang="es"><head><title>Prueba</title></head><body><h1>Hola</h1></body></html>';
assert.equal(extractWebsiteHtml(webHTML),webHTML);
const tripleBacktick=String.fromCharCode(96).repeat(3);
assert.equal(extractWebsiteHtml(tripleBacktick+'html\n'+webHTML+'\n'+tripleBacktick),webHTML);
assert.throws(()=>extractWebsiteHtml('Aquí tienes: <h1>Hola</h1>'),/HTML completo/);
assert.throws(()=>extractWebsiteHtml('<html><head></head><body>Sin cierre'),/incompleto/);
assert.throws(()=>extractWebsiteHtml('<html><head></head><body><iframe src="https://example.com"></iframe></body></html>'),/externo/);
assert.throws(()=>extractWebsiteHtml('<html><head></head><body><script src="https://example.com/x.js"></script></body></html>'),/externo/);
assert.equal(registered.filter(tool=>tool.id==='ai-webpage').length,1,'A real website tool must exist in the registry');
assert.equal(router.coreToolCatalog().find(tool=>tool.id==='ai-webpage')?.status,'beta');
assert.match(coreSource,/handleWebsiteConversation\(userText\)/,'Capability route missing in Core');
assert.match(coreSource,/serializeConversation\(/,'Conversation persistence uses the shared loss-resistant serializer');
assert.equal(normalizeConversation({id:'website-context',websiteBrief:{summary:'Saved context'},messages:[]}).websiteBrief.summary,'Saved context','Website context must survive conversation serialization');
assert.match(coreSource,/routeWebsiteRequest\(/);
assert.match(coreSource,/validateAgentStepResult\(tool\.id,result\)/,'Agent must validate each tool output');
assert.match(coreSource,/sandbox.{0,3}allow-scripts/,'HTML preview must be sandboxed');
assert.doesNotMatch(coreSource,/sandbox.{0,3}allow-same-origin/,'Never grant generated HTML same-origin access');
const enginesWebsite=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(enginesWebsite,/if\(id==='ai-webpage'\)return generateWebsite\(p,cb\)/);
assert.match(enginesWebsite,/extractWebsiteHtml\(response\.text\)/);
assert.throws(()=>validateAgentStepResult('ai-assistant',{}),/no devolvió contenido/);
assert.throws(()=>validateAgentStepResult('ai-webpage',{}),/archivo esperado/);
assert.throws(()=>validateAgentStepResult('image-gen',{text:'I created a photo'}),/archivo esperado/);
assert.equal(validateAgentStepResult('ai-webpage',{blob:new Blob([webHTML],{type:'text/html'})}).blob.size>0,true);
assert.equal(validateAgentStepResult('ai-assistant',{text:'Respuesta real'}).text,'Respuesta real');


// Core 5 regression: the actual user prompt must be answered as a capability
// question, not with unsolicited HTML boilerplate or a billed model call.
assert.deepEqual(routeWebsiteRequest('¿Puedes hacer una página web?'),{
 type:'ask',message:WEBSITE_FOLLOWUP
});
assert.equal(routeWebsiteRequest('¿Puedes hacer una página web para un restaurante?')?.type,'build');
assert.equal(routeWebsiteRequest('Crea una web para un gimnasio')?.type,'build');
assert.equal(routeWebsiteRequest('Quiero una página web')?.type,'ask');
assert.equal(routeWebsiteRequest('¿Cuánto cuesta una página web?'),null);
assert.equal(routeWebsiteRequest('¿Qué es una página web?'),null);
assert.equal(routeWebsiteRequest('Quítale los metadatos a la foto para mi web'),null);
assert.equal(routeWebsiteRequest('Crea una imagen para mi web'),null);
assert.equal(routeWebsiteRequest('Hazme una canción sobre mi web'),null);
assert.equal(routeWebsiteRequest('Quiero una web de mi negocio')?.type,'ask');
const pendingWebsite={started:Date.now()};
assert.equal(routeWebsiteRequest('Para una clínica dental',pendingWebsite)?.type,'build','The second user turn supplies the missing website subject');
assert.equal(routeWebsiteRequest('Una tienda de ropa',pendingWebsite)?.type,'build');
assert.equal(routeWebsiteRequest('Cancelar',pendingWebsite)?.type,'cancel');
assert.equal(routeWebsiteRequest('Ahora haz una miniatura',pendingWebsite)?.type,'abandon');
assert.equal(routeWebsiteRequest('Hola',pendingWebsite)?.type,'abandon');
assert.equal(routeWebsiteRequest('Para una floristería',{started:Date.now()-48*3600000}),null,'Expired brief must not be resumed');
assert.match(resolveGeneralCapabilityQuestion('¿Puedes hacer una canción?')||'',/tema quieres/);
assert.match(resolveGeneralCapabilityQuestion('¿Puedes crear una imagen?')||'',/imagen/);
assert.equal(resolveGeneralCapabilityQuestion('Crea una imagen de un paisaje'),null);
const memoryReply=resolvePrismaProductQuestion('¿Tienes memoria?',[],{});
assert.match(memoryReply,/navegador/);
assert.match(memoryReply,/IndexedDB/);
assert.match(memoryReply,/sincronización/);
assert.doesNotMatch(memoryReply,/50 conversaciones|60 mensajes/);
assert.doesNotMatch(memoryReply,/no guardo información una vez que la sesión termina/i);
assert.match(resolvePrismaProductQuestion('¿Qué recuerdas de mí?',[],{}),/conversación activa/);
const sampleWeb='<!doctype html><html lang="es"><head><title>Mi web</title></head><body><main>Hola</main></body></html>';
assert.equal(extractWebsiteHtml(sampleWeb),sampleWeb);
assert.equal(extractWebsiteHtml(String.fromCharCode(96).repeat(3)+'html\n'+sampleWeb+'\n'+String.fromCharCode(96).repeat(3)),sampleWeb);
assert.throws(()=>extractWebsiteHtml('<div>Solo una sección</div>'),/documento HTML completo/);
assert.throws(()=>extractWebsiteHtml('<html><head></head><body>Sin cierre'),/incompleto/);
assert.throws(()=>extractWebsiteHtml('<html><head></head><body><iframe src="https://bad.com"></iframe></body></html>'),/código externo/);
assert.throws(()=>extractWebsiteHtml('<html><head></head><body><script src="https://bad.com/a.js"></script></body></html>'),/código externo/);
assert.ok(registered.some(item=>item.id==='ai-webpage'&&item.status==='beta'),'Website tool must be registered');
assert.match(coreSource,/routeWebsiteRequest\(text,chat\.websiteBrief,false\)/);
assert.match(coreSource,/if\(await handleWebsiteConversation\(userText\)\)return/);
assert.match(coreSource,/resolveGeneralCapabilityQuestion\(userText\)/);
assert.match(coreSource,/frame\.setAttribute\('sandbox','allow-scripts'\)/);
assert.match(coreSource,/serializeConversation\(/,'Core persistence must use the shared serializer');
assert.equal(normalizeConversation({id:'website-brief',websiteBrief:{summary:'Persisted'},messages:[]}).websiteBrief.summary,'Persisted','Website brief must survive a browser reload');
const engineSource5=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(engineSource5,/if\(id==='ai-webpage'\)return generateWebsite\(p,cb\)/);
assert.match(engineSource5,/extractWebsiteHtml\(response.text\)/,'HTML must be validated before delivering the file');
assert.match(engineSource5,/filename:'prisma-sitio-web.html'/);


// PWA layout / searchable conversations: the sidebar search should no longer
// occupy its own row. Search is instant, local, and accent-insensitive.
const searchFixture=[
 {id:'a',title:'Clínica dental',updated:100,messages:[{role:'user',content:'Tratamiento de implantes cerámicos'}]},
 {id:'b',title:'Nueva conversación',updated:300,messages:[{role:'user',content:'Hola, cómo estás'}]},
 {id:'c',title:'Videos de música',updated:200,messages:[{role:'user',content:'Miniaturas de YouTube para Navidad'}]}
];
assert.equal(findConversations(searchFixture,'clinica')[0].id,'a');
assert.equal(findConversations(searchFixture,'IMPLANTES')[0].id,'a');
assert.equal(findConversations(searchFixture,'Návidad')[0].id,'c');
assert.equal(findConversations(searchFixture,'zzzzz').length,0);
assert.deepEqual(findConversations(searchFixture,'').map(x=>x.id),['b','c','a']);
assert.equal(findConversations(searchFixture,'',1).length,1);
assert.match(findConversations(searchFixture,'implantes')[0].preview,/implantes/);
const uiHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const uiMain=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(uiHtml,/id="conversation-search-layer"/);
assert.match(uiHtml,/id="conversation-search-results"/);
assert.match(uiHtml,/id="conversation-search-field-slot"/);
assert.doesNotMatch(uiHtml,/id="sidebar-search-slot"/,'The search row must not reserve sidebar height');
assert.match(coreSource,/findConversations\(conversations,q,q\?35:14\)/);
assert.match(coreSource,/searchOverlaySlot\.append\(searchField\)/);
assert.match(coreSource,/prisma:close-conversation-search/);
assert.match(uiMain,/function openSidebarSearch\(\)/);
assert.match(uiMain,/conversation-search-backdrop/);
assert.match(uiMain,/closeSidebarSearch\(\{restoreFocus:true\}\)/);
assert.match(uiMain,/event\.key\.toLowerCase\(\)==='k'/);
assert.match(stylesSource,/\.conversation-search-layer\{/);
assert.match(stylesSource,/\.conversation-search-results\{/);
assert.match(stylesSource,/body\.is-prisma-ios\.is-prisma-standalone #tool-modal \.modal-header\{/);
assert.match(stylesSource,/padding-top:max\(64px/,'iPhone PWA tool heading must clear the island');
assert.match(stylesSource,/body\.is-core-view\.is-prisma-ios\.is-prisma-standalone:not\(\.is-keyboard-open\) \.core-composer\{/);


assert.match(uiMain,/--prisma-search-viewport/,'Search must track mobile viewport');
assert.match(uiMain,/searchFocused\?visible/,'Keyboard-open search must shrink');
assert.match(uiMain,/event\.target===searchInput/,'Search focus must recalculate viewport');
assert.match(stylesSource,/\.conversation-search-layer:not\(\.hidden\)/);
assert.match(stylesSource,/height:var\(--prisma-search-viewport,100dvh\)/);


// A previous iPhone PWA layout used innerHeight || visualViewport.height:
// when innerHeight was truthy but SHORTER, the visual viewport was ignored.
assert.equal(reconcileIosPwaViewport({
 innerHeight:759,documentHeight:759,visualHeight:790,cssDvhHeight:780
}),790,'PWA should reclaim 31 paintable CSS pixels');
assert.equal(reconcileIosPwaViewport({
 innerHeight:790,documentHeight:770,visualHeight:754,cssDvhHeight:768
}),790,'Never shorten a larger legitimate layout');
assert.equal(reconcileIosPwaViewport({
 innerHeight:775,documentHeight:775,visualHeight:759,cssDvhHeight:815
}),815,'Use CSS dynamic viewport when the JS metrics under-report');
assert.equal(reconcileIosPwaViewport({
 innerHeight:852,documentHeight:852,visualHeight:852,cssDvhHeight:852
}),852,'Do not add unverified margins or screen-height correction');
assert.equal(reconcileIosPwaViewport({
 innerHeight:759,documentHeight:759,visualHeight:350,cssDvhHeight:759
}),759,'Keyboard sizing remains controlled separately by visualViewport');
assert.equal(reconcileIosPwaViewport({innerHeight:0,visualHeight:0}),240);
assert.match(uiMain,/reconcileIosPwaViewport\(\{/);
assert.match(uiMain,/getComputedStyle\(dvhProbe\)\.height/,'Measure actual CSS 100dvh');
assert.match(uiMain,/standalone&&!keyboardOpen\?layoutHeight:visible/,
 'Keyboard must keep a separate viewport height');
assert.doesNotMatch(uiMain,/\bMath\.max\([^\n]*screen\.height/,
 'Never expand the PWA to physical screen.height and cover the home indicator');
assert.match(stylesSource,/PWA screen reconciliation:/);
assert.match(stylesSource,/height:var\(--prisma-core-viewport,100dvh\)/);


// Video conversion regression: user uploaded an iPhone ScreenRecording MP4
// with "Comprímeme ese video". A planner must not choose video-trim or make
// an LLM call, and Safari must not leak "The operation is insecure".
assert.equal(isVideoCompressionIntent('Comprímeme ese video'),true);
assert.equal(isVideoCompressionIntent('Comprime mi ScreenRecording.mp4'),true);
assert.equal(isVideoCompressionIntent('Reduce el tamaño del vídeo'),true);
assert.equal(isVideoCompressionIntent('¿Cómo comprimir un video?'),false);
assert.equal(isVideoCompressionIntent('Recorta este video'),false);
assert.equal(isVideoCompressionIntent('Es una gran canción'),false);
assert.equal(isVideoFile({name:'ScreenRecording_11-09-2026 23-19-47_1.mp4',type:'video/mp4'}),true);
assert.equal(isVideoFile({name:'captura.MOV',type:''}),true);
assert.equal(isVideoFile({name:'documento.pdf',type:'application/pdf'}),false);
assert.equal(preferNativeVideoCompression({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)'}),true);
assert.equal(preferNativeVideoCompression({userAgent:'Mozilla/5.0 (X11; Linux x86_64) Chrome/132'}),false);
const mobileSettings=videoCompressionSettings({
 width:1170,height:2532,fileSize:40*1024*1024,duration:48,quality:'balanced'
});
assert.ok(mobileSettings.width<=960&&mobileSettings.height<=960,'Portrait video should not be upscaled');
assert.ok(mobileSettings.videoBitsPerSecond>150000,'Actual encoder bitrate must be set');
assert.equal(mobileSettings.width%2,0);
assert.equal(mobileSettings.height%2,0);
assert.throws(()=>videoCompressionSettings({width:1000,height:720,fileSize:100,duration:200}),/3 minutos/);
const recordingTypes=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4'];
assert.match(chooseNativeRecordingType({isTypeSupported:type=>recordingTypes.includes(type)}),/video\/mp4/);
assert.match(chooseNativeRecordingType({isTypeSupported:type=>type==='video/mp4'||type==='video/webm'},
 {preferMp4:false}),/video\/webm/,'Chrome fallback must choose WebM over unqualified MP4');
assert.match(chooseNativeRecordingType({isTypeSupported:type=>type==='video/mp4'||type==='video/webm'},
 {preferMp4:true}),/video\/mp4/,'Safari fallback must prefer MP4');
assert.equal(chooseNativeRecordingType({isTypeSupported:()=>false}),null);
assert.match(localizedVideoError({name:'SecurityError',message:'The operation is insecure.'}),/restricción de seguridad/);
assert.doesNotMatch(localizedVideoError({name:'SecurityError',message:'The operation is insecure.'}),/the operation is insecure/i);
await assert.rejects(
 ()=>compressVideoNative({name:'reporte.pdf',type:'application/pdf',size:100}),
 /Adjunta un archivo de vídeo válido/
);
assert.ok(registered.some(tool=>tool.id==='video-compress'&&tool.file&&tool.status==='beta'));
assert.match(coreSource,/isVideoCompressionIntent\(userText\)/);
assert.match(coreSource,/tool_id:'video-compress'/);
assert.match(coreSource,/attachments\.filter\(isVideoFile\)/);
assert.match(coreSource,/localizedVideoError\(error\)/);
assert.match(coreSource,/Continúa esta solicitud anterior con el archivo adjunto/);
const videoEngineSource=readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(videoEngineSource,/if\(id==='video-compress'\)\{/);
assert.match(videoEngineSource,/compressVideoNative\(file,p,cb\)/);
assert.match(videoEngineSource,/trunc\(iw\*min\(1,/,'Portrait videos must limit longest dimension, not just width');
assert.match(videoEngineSource,/preferNativeVideoCompression/);
assert.match(videoEngineSource,/blob\.size>=files\[0\]\.size/,'Do not report success for larger files');
const videoMainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(videoMainSource,/case 'video-compress':return selectField/);


// The user's iPhone recording: horizontal edge swipes should reveal Prisma's
// drawer, while vertical swipes INSIDE it remain native inertial scrolling.
assert.equal(SIDEBAR_EDGE_PX,44);
assert.equal(classifySidebarSwipe({startX:8,startY:440,x:118,y:452,open:false}),'open');
assert.equal(classifySidebarSwipe({startX:20,startY:200,x:26,y:315,open:false}),'vertical',
 'Vertical scroll from the edge must not open the drawer');
assert.equal(classifySidebarSwipe({startX:100,startY:400,x:215,y:407,open:false}),'ignore',
 'Start outside the edge zone should not steal ordinary gestures');
assert.equal(classifySidebarSwipe({startX:260,startY:300,x:130,y:309,open:true}),'close');
assert.equal(classifySidebarSwipe({startX:200,startY:280,x:209,y:392,open:true}),'vertical');
assert.equal(classifySidebarSwipe({startX:13,startY:100,x:22,y:106,open:false}),'pending');
assert.equal(shouldCommitSidebarSwipe({distance:90,drawerWidth:320,elapsed:280}),true);
assert.equal(shouldCommitSidebarSwipe({distance:50,drawerWidth:320,elapsed:70}),true,
 'Fast flicks should work without requiring a long drag');
assert.equal(shouldCommitSidebarSwipe({distance:22,drawerWidth:320,elapsed:200}),false,
 'Small touches must not open the menu');
const sidebarGestureHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(sidebarGestureHtml,/id="sidebar-scroll-region"/);
assert.match(sidebarGestureHtml,/sidebar-scroll-region[\s\S]*?<\/div>\s*<div class="sidebar-bottom"/,
 'Footer is outside the independently scrollable navigation area');
assert.match(stylesSource,/\.sidebar-scroll-region\s*\{/);
assert.match(stylesSource,/-webkit-overflow-scrolling:touch/);
assert.match(stylesSource,/touch-action:pan-y/);
assert.match(stylesSource,/sidebar-backdrop\.sidebar-gesture-preview/);
assert.match(uiMain,/installMobileSidebarGestures\(\{sidebar,backdrop,menu\}\)/);
const sidebarGesturesSource=readFileSync(new URL('../src/sidebar-gestures.js',import.meta.url),'utf8');
assert.match(sidebarGesturesSource,/touchmove',move,\{passive:false,capture:true\}/);
assert.match(sidebarGesturesSource,/intent==='vertical'/);


// Exercise the actual touch handlers, not only the direction classifier.
// This detects regressions where gestures classify correctly but fail to
// change the CSS class that opens the drawer.
const makeClasses=initial=>{
 const values=new Set(initial);
 return {
  add:v=>values.add(v),remove:v=>values.delete(v),
  contains:v=>values.has(v),
  toggle:(v,force)=>{
   if(force===true){values.add(v);return true;}
   if(force===false){values.delete(v);return false;}
   if(values.has(v)){values.delete(v);return false;}
   values.add(v);return true;
  }
 };
};
const mockSidebar={classList:makeClasses([]),
 style:{removeProperty(k){delete this[k];}},
 getBoundingClientRect(){return {width:300,right:300};}};
const mockBackdrop={classList:makeClasses([]),
 style:{removeProperty(k){delete this[k];}}};
const mockMenu={attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
const touchListeners={};
const mockDocument={
 addEventListener(name,fn){touchListeners[name]=fn;},
 removeEventListener(name){delete touchListeners[name];}
};
const previousWindow=globalThis.window;
globalThis.window={matchMedia:()=>({matches:true}),
 addEventListener(){},removeEventListener(){}};
const cleanupGestures=installMobileSidebarGestures({
 sidebar:mockSidebar,backdrop:mockBackdrop,menu:mockMenu,
 body:{classList:makeClasses([])},documentTarget:mockDocument,mobile:()=>true
});
function touchPoint(x,y){return {identifier:9,clientX:x,clientY:y};}
function dispatchTouch(name,point){
 let blocked=false;
 touchListeners[name]?.({
  target:{closest(){return null;}},
  touches:name==='touchend'?[]:[point],
  changedTouches:[point],cancelable:true,
  preventDefault(){blocked=true;}
 });
 return blocked;
}
dispatchTouch('touchstart',touchPoint(9,210));
assert.equal(dispatchTouch('touchmove',touchPoint(105,213)),true,'Horizontal drag is captured');
dispatchTouch('touchend',touchPoint(105,213));
assert.equal(mockSidebar.classList.contains('open'),true,'Gesture must open actual sidebar');
assert.equal(mockBackdrop.classList.contains('open'),true);
assert.equal(mockMenu.attrs['aria-expanded'],'true');
dispatchTouch('touchstart',touchPoint(125,270));
assert.equal(dispatchTouch('touchmove',touchPoint(130,430)),false,
 'Vertical scrolling inside drawer must never be prevented');
dispatchTouch('touchend',touchPoint(130,430));
assert.equal(mockSidebar.classList.contains('open'),true,'Vertical scroll must not close sidebar');
dispatchTouch('touchstart',touchPoint(250,260));
assert.equal(dispatchTouch('touchmove',touchPoint(100,265)),true);
dispatchTouch('touchend',touchPoint(100,265));
assert.equal(mockSidebar.classList.contains('open'),false,'Swipe left must close sidebar');
cleanupGestures();
globalThis.window=previousWindow;


// Account security + UX: independent Prisma Supabase Auth, genuine provider
// gates and successful profile persistence. No real users are created by CI.
assert.equal(validateAccountPassword('secure-pass-123'),null);
assert.match(validateAccountPassword('1234567'),/8 caracteres/);
assert.match(validateAccountPassword('secure-pass-123','secure-pass-124'),/no coinciden/);
assert.equal(validateAccountPassword('secure-pass-123','secure-pass-123'),null);
assert.match(accountAuthMessage({message:'Invalid login credentials'}),/incorrectos/);
assert.match(accountAuthMessage({message:'Email not confirmed'}),/Confirma tu correo/);
assert.match(accountAuthMessage({message:'The operation is insecure'}),/The operation is insecure|no se pudo/i);
assert.equal(isAccountProviderAvailable({email:true,google:false,apple:false,phone:false},'google'),false);
assert.equal(isAccountProviderAvailable({email:true,google:true},'google'),true);

// Cross-device history must merge all messages and conversations, not just a
// recent slice. Message IDs are deduplicated while messages from both devices survive.
const longMessages=Array.from({length:85},(_,index)=>({
 id:'message-'+index,role:index%2?'assistant':'user',content:'Mensaje completo '+index,time:index+1
}));
const mergedHistory=mergeConversationLists(
 [{id:'chat-shared',title:'Conversación',updated:200,messages:longMessages.slice(45)}],
 [{id:'chat-shared',title:'Conversación',updated:100,messages:longMessages.slice(0,60)},
  {id:'chat-local-only',title:'Solo en este dispositivo',updated:150,messages:[{id:'only-local',role:'user',content:'Local',time:1}]}]
);
assert.equal(mergedHistory.find(chat=>chat.id==='chat-shared').messages.length,85,'All messages from both devices must be merged');
assert.equal(mergedHistory.length,2,'Conversations from both devices must be retained');
assert.equal(normalizeConversation({id:'long',messages:longMessages}).messages.length,85,'Normalization must not truncate messages');
assert.equal(normalizeConversation({id:'clean',messages:[{id:'x',role:'assistant',content:'ok',blob:{private:true},previewUrl:'blob:local'}]}).messages[0].blob,undefined,'Binary artifacts must not be sent to cloud sync');
const prismaAccountCode=readFileSync(new URL('../src/prisma-account.js',import.meta.url),'utf8');
const authConfigCode=readFileSync(new URL('../functions/api/auth/config.js',import.meta.url),'utf8');
const accountHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(accountHtml,/<button type="button" id="auth-apple" disabled title="Próximamente"/,'Apple sign-in must be visibly locked');
assert.match(prismaAccountCode,/provider!=='apple'/,'Apple sign-in must remain disabled even if an environment flag is enabled');
assert.match(prismaAccountCode,/if\(provider==='apple'\|\|/,'Apple OAuth handler must refuse to start before its release');
assert.match(prismaAccountCode,/provider==='apple'\?'Próximamente'/,'Apple button must retain its coming-soon label');
for(const method of ['signUp','signInWithPassword','signInWithOAuth','signInWithOtp','verifyOtp','resetPasswordForEmail','updateUser','onAuthStateChange']){
 assert.ok(prismaAccountCode.includes('auth.'+method),method+' must call the real Supabase Auth SDK');
}
assert.match(prismaAccountCode,/api\.from\('prisma_profiles'\)/,'Profiles are stored in actual protected database');
assert.match(prismaAccountCode,/onConflict:'user_id'/);
assert.match(prismaAccountCode,/localStorage\.setItem\(SYNC_KEY,user\.id\)/,'Sync consent is remembered on each device');
assert.match(prismaAccountCode,/sync_enabled/,'Sync preference is account-wide in the protected profile');
assert.match(prismaAccountCode,/\.range\(offset,offset\+pageSize-1\)/,'Remote history must be fetched with pagination');
assert.match(prismaAccountCode,/setInterval\(refresh,30000\)/,'Other devices refresh automatically');
assert.match(prismaAccountCode,/deleted_at/,'Conversation deletions use cloud tombstones');
assert.doesNotMatch(prismaAccountCode,/messages\.slice\(-30\)/,'Cloud sync must not truncate a conversation to 30 messages');
assert.doesNotMatch(prismaAccountCode,/slice\(0,50\)/,'Cloud sync must not cap the account history at 50 chats');
assert.match(prismaAccountCode,/if\(!agreed\)return/,'Consent rejection must not sync');
const coreConversationCode=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
assert.match(coreConversationCode,/readConversationSnapshot/,'IndexedDB preserves local history beyond localStorage quota');
assert.doesNotMatch(coreConversationCode,/messages=messages\.slice\(-60\)/,'The active conversation must not discard messages after 60 turns');
assert.doesNotMatch(coreConversationCode,/slice\(0,MAX_CHATS\)/,'The local history must not silently cap the number of chats');
assert.match(prismaAccountCode,/if\(event==='PASSWORD_RECOVERY'\)/,'Recovery redirects must show password-change form');
assert.match(prismaAccountCode,/if\(event==='SIGNED_OUT'\)/);
assert.doesNotMatch(prismaAccountCode,/service_role|SUPABASE_SERVICE_ROLE_KEY/,'Never expose private DB key in browser');
assert.match(authConfigCode,/PRISMA_AUTH_GOOGLE_ENABLED==='1'/);
assert.match(authConfigCode,/PRISMA_AUTH_APPLE_ENABLED==='1'/);
assert.match(authConfigCode,/PRISMA_AUTH_PHONE_ENABLED==='1'/);
for(const id of ['auth-intro-screen','auth-email-screen','auth-phone-screen','auth-reset-screen',
 'auth-recovery-screen','auth-confirm-screen','auth-welcome-screen','auth-account-screen',
 'auth-profile-form','auth-account-sync','auth-account-signout']){
 assert.ok(accountHtml.includes('id="'+id+'"'),id+' must exist in the account experience');
}
assert.match(accountHtml,/id="auth-google" disabled/);
assert.match(accountHtml,/id="auth-apple" disabled/);
assert.match(accountHtml,/id="auth-phone" disabled/);
assert.match(accountHtml,/autocomplete="one-time-code"/);
assert.match(accountHtml,/autocomplete="new-password"/);
assert.match(accountHtml,/aria-label="Acceso a Prisma Space"/);
const allAuthScreenIds=[...accountHtml.matchAll(/id="auth-([a-z-]+)-screen"/g)].map(m=>m[1]);
for(const id of ['intro','email','phone','reset','recovery','confirm','welcome','account']){
 assert.ok(allAuthScreenIds.includes(id),'Navigation state '+id+' must have a corresponding visible screen');
}
assert.match(prismaAccountCode,/for\(const item of SCREENS\)/,'State manager must hide other screens');
assert.match(prismaAccountCode,/for\(const selector of \['#auth-submit'/,'Email submit must be enabled once auth is configured');

const accountStyles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
assert.match(accountStyles,/#auth-modal \.auth-account-identity/);
assert.match(accountStyles,/#auth-modal \.auth-password-wrap/);
assert.match(accountStyles,/#auth-modal \.auth-screen\.hidden/);

console.log('Prisma Core agent: registry index, local actions and artifact compatibility verified.');
