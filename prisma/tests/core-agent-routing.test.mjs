import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankProviders, selectTaskModel, ROUTE_ORDER } from '../src/provider-routing.js';
import { getCredentialSlots, getCredentialStatus, maxCredentialSlots, requestWithCredentialPool, CREDENTIAL_ROOTS, CREDENTIAL_POOL_VARIABLES } from '../functions/_lib/credential-pool.js';
import { renderMarkdownSafe } from '../src/core-markdown.js';
import { getProviderDailyLimit, getProviderMinuteLimit, getSharedDailyBudget, getVisitorDailyLimit } from '../functions/_lib/limits.js';
import { CHAT_MODELS } from '../functions/_lib/model-catalog.js';

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

// Every external API-key provider supports six slots. Compact JSON pools
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
 assert.equal(maxCredentialSlots(provider),6,provider+' must support six slots');
}
assert.equal(maxCredentialSlots('cloudflare'),0,'Workers AI uses a Cloudflare binding, not API keys');
assert.equal(getCredentialSlots(fakeKeys,'gemini').length,6);
assert.equal(getCredentialStatus(fakeKeys,'gemini').max,6);
assert.equal(getCredentialSlots(fakeKeys,'openrouter').length,6);
assert.equal(getCredentialStatus(fakeKeys,'openrouter').slots.length,6);
assert.equal(getCredentialSlots(fakeKeys,'groq').length,6);
assert.equal(getCredentialStatus(fakeKeys,'groq').slots.length,6);

const compactPools = Object.fromEntries(Object.entries(CREDENTIAL_POOL_VARIABLES).map(([provider,variable]) =>
 [variable,JSON.stringify(Array.from({length:6},(_,index)=>provider+'-key-'+(index+1)))]
));
for (const provider of Object.keys(CREDENTIAL_ROOTS)) {
 const slots=getCredentialSlots(compactPools,provider);
 assert.equal(slots.length,6,provider+' JSON pool must expose six keys');
 assert.equal(slots[5].number,6,provider+' JSON pool must map its sixth key');
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
assert.equal(getCredentialStatus({REQUESTY_API_KEYS_JSON:'{"not":"an array"}'},'requesty').poolValid,false);
assert.equal(getCredentialStatus({ZAI_API_KEYS_JSON:JSON.stringify(Array.from({length:7},(_,i)=>'key-'+i))},'zai').poolValid,false,'JSON pools cannot exceed six credentials');
assert.equal(getCredentialSlots({GROQ_API_KEY:'q1',GROQ_API_KEY_BACKUP:'q2'},'groq').length,2,'legacy BACKUP aliases remain supported');

// Cost-aware provider selection: one best-fit model first, sequential fallbacks only.
const allProviders = new Set(['groq','cloudflare','gemini','pollinations','huggingface','openrouter','kilo','requesty','sensenova','zai','baidu','aihubmix','amd']);
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
assert.equal(rankProviders({preferred:'amd',task:'general',available:availableAll})[0],'amd');
assert.equal(ROUTE_ORDER.general.includes('kilo'),false,'Kilo free trial endpoints remain manual-only');
assert.equal(ROUTE_ORDER.general.includes('aihubmix'),false,'AIHubMix trial stays manual-only');
assert.equal(ROUTE_ORDER.general.includes('amd'),false,'AMD evaluation endpoints stay manual-only');
assert.equal(ROUTE_ORDER.general.includes('baidu'),false,'Baidu remains manual until regional eligibility is confirmed');
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

const sixSlotEnv=mockCredentialEnv({
 REQUESTY_API_KEYS_JSON:JSON.stringify(['r1','r2','r3','r4','r5','r6'])
});
let selectedSlot=0;
const selectedResult=await requestWithCredentialPool(sixSlotEnv,'requesty',async(key,slot)=>{
 selectedSlot=slot;
 return new Response('ok',{status:200});
},{startIndex:5});
assert.equal(selectedResult.status,200);
assert.equal(selectedSlot,6,'the request pool must be able to select the sixth configured key');


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

// Sidebar UI contract: compact brand, persistent chat search, new-chat row,
// desktop collapse/reopen, and profile kept in the main top bar.
const sidebarHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sidebarMain = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const sidebarCore = readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
const sidebarCss = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
for (const id of [
  'sidebar-search-toggle','sidebar-collapse-toggle','sidebar-search-slot',
  'sidebar-new-chat-slot','core-history-search','core-history-new','mobile-menu'
]) {
  assert.equal((sidebarHtml.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
    'sidebar control must exist exactly once: ' + id);
}
assert.match(sidebarCore, /sidebarSearchSlot\.append\(chatSearch\)/);
assert.match(sidebarCore, /sidebarNewChatSlot\.append\(newChatButton\)/);
assert.match(sidebarMain, /function setupSidebarControls\(\)/);
assert.match(sidebarMain, /prisma-sidebar-collapsed/);
assert.match(sidebarMain, /sidebar-search-open/);
assert.match(sidebarCss, /body\.sidebar-collapsed \.sidebar/);
assert.match(sidebarCss, /body\.sidebar-search-open \.sidebar-search-slot/);
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
assert.match(statusSource, /getAmdFreeModels/);
assert.match(statusSource, /getAihubmixFreeModels/);
assert.match(statusSource, /getProviderMinuteLimit/);
assert.match(statusSource, /BAIDU_FREE_QUOTA_CONFIRMED/);
const chatSource = readFileSync(new URL('../functions/api/ai/chat.js', import.meta.url), 'utf8');
assert.match(chatSource, /BAIDU_FREE_QUOTA_CONFIRMED/);
const modelCatalogSource = readFileSync(new URL('../functions/_lib/model-catalog.js', import.meta.url), 'utf8');
for (const provider of ['kilo','requesty','sensenova','zai','baidu','aihubmix','amd']) assert.match(modelCatalogSource, new RegExp(provider+':'));
assert.equal(CHAT_MODELS.requesty.length,13);
assert.equal(CHAT_MODELS.aihubmix.length,0,'AIHubMix catalogue is loaded from its live API, not a stale hard-coded list');
assert.ok(CHAT_MODELS.requesty.some(model=>model.id==='novita/ling-3.1-flash'));
assert.ok(CHAT_MODELS.requesty.some(model=>model.id==='novita/inclusionai/ling-3.0-tiny'));
const aihubmixSource = readFileSync(new URL('../functions/_lib/aihubmix-models.js', import.meta.url), 'utf8');
assert.match(aihubmixSource, /free_quota_config/);
assert.match(aihubmixSource, /weight !== 1/);

console.log('Prisma Core agent: registry index, local actions and artifact compatibility verified.');
