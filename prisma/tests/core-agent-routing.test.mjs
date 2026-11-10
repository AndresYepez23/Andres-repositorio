import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileIosPwaViewport } from '../src/pwa-viewport.js';
import { rankProviders, selectTaskModel, ROUTE_ORDER } from '../src/provider-routing.js';
import { getCredentialSlots, getCredentialStatus, maxCredentialSlots, requestWithCredentialPool, CREDENTIAL_ROOTS, CREDENTIAL_POOL_VARIABLES } from '../functions/_lib/credential-pool.js';
import { renderMarkdownSafe } from '../src/core-markdown.js';
import { findConversations } from '../src/conversation-search.js';
import { getProviderDailyLimit, getProviderMinuteLimit, getSharedDailyBudget, getVisitorDailyLimit } from '../functions/_lib/limits.js';
import { CHAT_MODELS } from '../functions/_lib/model-catalog.js';
import { isAcknowledgementMessage, buildAcknowledgementReply } from '../src/core-conversation.js';
import { routeWebsiteRequest, resolveGeneralCapabilityQuestion, extractWebsiteHtml, WEBSITE_FOLLOWUP } from '../src/core-intent.js';
import { resolvePrismaProductQuestion } from '../src/core-intelligence.js';
import { validateAgentStepResult } from '../src/core-agent-guard.js';
import { buildConversationContext, chooseCoreReasoning, chooseCoreResponseLength, chooseCoreContextOptions } from '../src/core-context.js';
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
const coreSource=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
const stylesSource=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

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
assert.match(authSource, /auth-provider-grid/);
assert.match(authSource, /!enabled/);
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
assert.match(resolvePrismaProductQuestion('¿Tienes memoria?'),/historial reciente en este navegador/);
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
assert.match(coreSource,/websiteBrief:chat\.websiteBrief/,'Website context must survive page reload in this browser');
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
assert.match(memoryReply,/50 conversaciones/);
assert.match(memoryReply,/60 mensajes/);
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
assert.match(coreSource,/websiteBrief:chat.websiteBrief/,'Website brief must survive a browser reload');
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

console.log('Prisma Core agent: registry index, local actions and artifact compatibility verified.');
