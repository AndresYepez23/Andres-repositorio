import { initPrismaCore } from './core.js';
import { categories, tools, statusLabels } from './registry.js';
import { providers } from './providers.js';
import { runTool } from './engines.js';
import { workflows, runWorkflow } from './workflows.js';
import { getProviderCredential, saveProviderCredential, removeProviderCredential, isProviderConnected, validateProviderCredential, getCentralProviderStatus } from './provider-connections.js';

const POLLINATIONS_APP_KEY = '';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const iconPaths = {
  'brain-circuit':'<path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.6 6.5a3 3 0 0 0-5.6-1.5 3 3 0 0 0-5.6 1.5A3.5 3.5 0 0 0 5 13a3.5 3.5 0 0 0 3.4 5h7.2A3.5 3.5 0 0 0 19 13a3.5 3.5 0 0 0-1.4-6.5Z"/><path d="M9 21h6"/>',
  paperclip:'<path d="m21.4 11.1-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  plug:'<path d="M12 22v-5"/><path d="M9 8V2m6 6V2"/><path d="M5 8h14v4a7 7 0 0 1-14 0V8Z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  star:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  sparkles:'<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/><path d="m5 3 .6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6L5 3Z"/>',
  'shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon:'<path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  x:'<path d="m18 6-12 12M6 6l12 12"/>',
  'arrow-down':'<path d="M12 4v15m-6-6 6 6 6-6"/>',
  'arrow-right':'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  list:'<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  history:'<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
  'search-x':'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4m-7-7 4 4m0-4-4 4"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  gauge:'<path d="M20 13a8 8 0 1 0-16 0"/><path d="m12 13 4-4"/><path d="M8 18h8"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h8"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18m10-18v18M3 8h4m-4 8h4m10-8h4m-4 8h4"/>',
  code:'<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14"/>',
  sliders:'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/>',
  files:'<path d="M15 2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M15 2v5h5M8 13h8m-8 4h6"/><path d="M8 2v2"/>',
  'file-output':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/>',
  'rotate-cw':'<path d="M20 7v5h-5"/><path d="M20 12a8 8 0 1 1-2.3-5.7L20 9"/>',
  stamp:'<path d="M12 2a4 4 0 0 0-4 4c0 2 1 3 1 5H7a2 2 0 0 0-2 2v3h14v-3a2 2 0 0 0-2-2h-2c0-2 1-3 1-5a4 4 0 0 0-4-4Z"/><path d="M5 20h14"/>',
  images:'<rect x="3" y="3" width="14" height="14" rx="2"/><path d="m17 9 4 2v10H9l-2-4"/><circle cx="8" cy="8" r="1.5"/><path d="m4 14 4-4 4 4"/>',
  'file-code':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 14l-2 2 2 2m6-4 2 2-2 2m-2-5-2 6"/>',
  'file-archive':'<path d="M4 4h16v16H4z"/><path d="M9 4v4h6V4m-3 4v3m0 2v1m0 2v1"/>',
  maximize:'<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/>',
  'refresh-cw':'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2"/>',
  crop:'<path d="M6 3v12a3 3 0 0 0 3 3h12M18 21V9a3 3 0 0 0-3-3H3"/>',
  scan:'<path d="M4 7V5a1 1 0 0 1 1-1h2m10 0h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2m-10 0H5a1 1 0 0 1-1-1v-2"/><path d="M7 12h10"/>',
  'scan-text':'<path d="M4 7V5a1 1 0 0 1 1-1h2m10 0h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2m-10 0H5a1 1 0 0 1-1-1v-2"/><path d="M7 10h10M7 14h7"/>',
  'image-down':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 14 3-3 5 5m-4 1v-6m-3 3 3 3 3-3"/>',
  shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/>',
  'audio-lines':'<path d="M2 10v4m4-8v12m4-15v18m4-14v10m4-13v16m4-10v4"/>',
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.2 8.2 12.6 12.6M14.5 9.5 20 4M8.2 15.8l3.3-3.3"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  braces:'<path d="M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2m8-14h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2"/><path d="m10 8-2 4 2 4m4-8 2 4-2 4"/>',
  binary:'<path d="M7 4H5v6h2V4Zm0 10H5v6h2v-6Zm12-10h-2v6h2V4Zm0 10h-2v6h2v-6Z"/><path d="M10 7h4m-4 10h4"/>',
  'text-cursor':'<path d="M8 4h8m-4 0v16m-4 0h8M5 8v8m14-8v8"/>',
  'key-round':'<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8L22 6l-2 2 2 2-3 3-2-2-2 2"/>',
  'qr-code':'<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/><path d="M14 14h3v3h-3zm5 0h2m-2 3v4m-5 0h3m4-4h1"/>',
  'arrow-left-right':'<path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4m14 4H3"/>',
  ruler:'<path d="M21 3 3 21m2-14 3 3m1-7 3 3m1-7 3 3m1-7 3 3"/>',
  'calendar-clock':'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18m-9 4v4l3 1"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>',
  'case-sensitive':'<path d="m3 18 5-13 5 13M5 13h6m2 5 4-10 4 10m-6-3h4"/>',
  'file-code-2':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 14l-2 2 2 2m6-4 2 2-2 2"/>',
  palette:'<path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.7-4.3 1.8 1.8 0 0 1 1.2-3.1H19a2 2 0 0 0 2-2A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="15" cy="7" r="1"/>',
  play:'<path d="m8 5 11 7-11 7V5Z"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  download:'<path d="M12 4v12m-5-5 5 5 5-5"/><path d="M4 20h16"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  'message-circle':'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(iconPaths[name]||iconPaths.grid)+'</svg>';}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
document.querySelectorAll('[data-icon]').forEach(element=>{if(!element.innerHTML.trim())element.innerHTML=icon(element.dataset.icon);});
function readStoredArray(key){
  try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}
}
const favorites=new Set(readStoredArray('prisma-favorites').filter(value=>typeof value==='string'));
let recentTools=readStoredArray('prisma-recent').map(item=>typeof item==='string'?{id:item,at:0}:item).filter(item=>item&&typeof item.id==='string'&&tools.some(tool=>tool.id===item.id)).slice(0,12);
let activeCategory='all',activeView='core',searchTerm='',layout='grid',currentTool=null,currentWorkflow=null,selectedFiles=[],running=false,outputUrl=null,lastFocusedElement=null,lastOpenedToolId=null,activeOperation=0;
const popularToolIds=['pdf-merge','image-bg','image-gen','docx-pdf','image-compress','qr'];
const searchAliases={
  'pdf-merge':'unir pdf juntar pdf combinar pdf fusionar documentos combinar archivos',
  'pdf-split':'separar pdf dividir pdf partir pdf separar paginas',
  'pdf-extract':'extraer paginas seleccionar paginas conservar paginas',
  'pdf-remove-pages':'eliminar paginas borrar paginas quitar paginas pdf',
  'pdf-to-image':'pdf a imagen convertir pdf en imagen pdf a png',
  'pdf-text':'extraer texto de pdf pdf a texto leer pdf',
  'pdf-compress':'comprimir pdf reducir peso documento',
  'pdf-protect':'proteger pdf poner contraseña pdf',
  'docx-pdf':'word a pdf doc a pdf docx a pdf convertir word documento a pdf',
  'docx-html':'word a html docx a html convertir word a html',
  'image-bg':'quitar fondo eliminar fondo fondo transparente borrar fondo quitar fondo a foto',
  'image-compress':'comprimir foto reducir peso imagen achicar imagen reducir tamaño foto',
  'image-convert':'convertir imagen cambiar formato png jpg webp',
  'image-ocr':'ocr reconocer texto extraer texto de imagen leer texto en foto',
  'image-pdf':'imagenes a pdf fotos a pdf jpg a pdf convertir foto a pdf',
  'image-gen':'crear imagen generar imagen imagen con ia generador de imagen texto a imagen',
  'video-audio':'extraer audio de video video a audio',
  'video-trim':'recortar video cortar video',
  'video-transcribe':'transcribir video',
  'audio-trim':'recortar audio cortar audio',
  'ai-assistant':'asistente de texto redactar resumir explicar texto ia',
  'ai-voice':'texto a voz leer texto voz sintetizar voz',
  'ai-transcribe':'transcribir audio voz a texto audio a texto pasar audio a texto',
  'qr':'crear qr generar qr codigo qr',
  'qr-scan':'leer qr escanear qr decodificar qr',
  'currency':'cambiar moneda tasa de cambio pesos colombianos',
  'units':'convertir unidades medidas',
  'password':'generar contraseña generar clave clave segura',
  'word-count':'contar palabras contar caracteres',
  'excel-json':'excel a json hoja de calculo a json xlsx a json',
  'csv-json':'csv a json convertir csv',
  'json-csv':'json a csv convertir json',
  'hash-file':'hash sha256 huella digital archivo'
};
const queryToolAliases={
  'quitar fondo':['image-bg'],'eliminar fondo':['image-bg'],'fondo transparente':['image-bg'],
  'word a pdf':['docx-pdf'],'doc a pdf':['docx-pdf'],'docx a pdf':['docx-pdf'],'convertir word a pdf':['docx-pdf'],
  'unir pdf':['pdf-merge'],'juntar pdf':['pdf-merge'],'combinar pdf':['pdf-merge'],
  'separar pdf':['pdf-split'],'dividir pdf':['pdf-split'],'partir pdf':['pdf-split'],
  'pdf a imagen':['pdf-to-image'],'convertir pdf a imagen':['pdf-to-image'],
  'foto a pdf':['image-pdf'],'fotos a pdf':['image-pdf'],'imagenes a pdf':['image-pdf'],
  'comprimir imagen':['image-compress'],'reducir peso foto':['image-compress'],
  'crear imagen':['image-gen'],'generar imagen':['image-gen'],'imagen ia':['image-gen'],
  'texto a voz':['ai-voice'],'voz a texto':['ai-transcribe'],'audio a texto':['ai-transcribe'],'transcribir audio':['ai-transcribe'],
  'recortar video':['video-trim'],'extraer audio':['video-audio'],
  'crear qr':['qr'],'generar qr':['qr'],'leer qr':['qr-scan'],'escanear qr':['qr-scan'],
  'contar palabras':['word-count'],'generar contraseña':['password'],
  'excel a json':['excel-json'],'json a csv':['json-csv'],'csv a json':['csv-json']
};
function normalizeSearch(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function renderCategories(){
  const nav=$('#category-nav');
  nav.innerHTML=categories.filter(c=>c.id!=='all').map(c=>'<button class="category-item" data-category="'+c.id+'"><span class="category-icon">'+icon(c.icon)+'</span><span>'+c.name+'</span></button>').join('');
  document.querySelectorAll('#category-nav [data-category]').forEach(b=>b.addEventListener('click',()=>{activeView='explore';activeCategory=b.dataset.category;searchTerm='';$('#global-search').value='';render();closeSidebar();scrollToCurrentView();}));
}
function renderProviders(){
  $('#provider-grid').innerHTML=providers.map(p=>'<article class="provider-card"><div class="provider-card-top"><span class="provider-stage">'+p.stage+'</span><span class="nav-dot"></span></div><h4>'+p.name+'</h4><div class="provider-kind">'+p.kind+'</div><div class="provider-tags">'+p.capabilities.map(t=>'<span>'+t+'</span>').join('')+'</div><p class="provider-note">'+p.note+'</p></article>').join('');
}
function visibleTools(){
  let list=tools;
  if(activeView==='favorites')list=list.filter(tool=>favorites.has(tool.id));
  if(activeView==='recent')list=recentTools.map(item=>tools.find(tool=>tool.id===item.id)).filter(Boolean);
  if(activeView==='explore'&&activeCategory!=='all')list=list.filter(tool=>tool.category===activeCategory);
  if(searchTerm){
    const query=normalizeSearch(searchTerm),terms=query.split(/\s+/).filter(Boolean),aliasIds=new Set();
    Object.entries(queryToolAliases).forEach(([phrase,ids])=>{if(query.includes(phrase))ids.forEach(id=>aliasIds.add(id));});
    list=list.filter(tool=>{
      const category=categories.find(item=>item.id===tool.category)?.name||'';
      const corpus=normalizeSearch([tool.id,tool.name,tool.description,tool.category,category,tool.tag,searchAliases[tool.id]||''].join(' '));
      return corpus.includes(query)||terms.every(term=>corpus.includes(term))||aliasIds.has(tool.id);
    });
  }
  return list;
}
function renderMiniTools(containerId,ids,emptyMessage){
  const container=$('#'+containerId);if(!container)return;
  const list=ids.map(id=>tools.find(tool=>tool.id===id)).filter(Boolean);
  if(!list.length){container.innerHTML='<div class="mini-empty">'+escapeHtml(emptyMessage)+'</div>';return;}
  container.innerHTML=list.map(tool=>'<button type="button" class="mini-tool-card" data-open-tool="'+tool.id+'"><span class="mini-tool-icon">'+icon(tool.icon)+'</span><span class="mini-tool-copy"><strong>'+escapeHtml(tool.name)+'</strong><small>'+escapeHtml(tool.tag||categories.find(c=>c.id===tool.category)?.name||'Herramienta')+'</small></span><span class="mini-tool-arrow">'+icon('arrow-right')+'</span></button>').join('');
  $$('[data-open-tool]',container).forEach(button=>button.addEventListener('click',()=>{
    const tool=tools.find(item=>item.id===button.dataset.openTool);
    if(!tool)return;
    if(tool.status==='soon'){toast('Esta herramienta todavía está en preparación.','info');return;}
    openTool(tool);
  }));
}
function renderHomeRecents(){
  renderMiniTools('home-recent',recentTools.slice(0,4).map(item=>item.id),'Aquí aparecerán las herramientas que abras. Tu historial se guarda solo en este navegador.');
}
function render(){
  const ai=activeView==='ai',core=activeView==='core',isHome=activeView==='explore'&&activeCategory==='all'&&!searchTerm;
  $('#home-dashboard').classList.toggle('hidden',!isHome);
  $('.hero-section').classList.toggle('hidden',core||ai);
  $('.metric-strip').classList.toggle('hidden',core||ai);
  $('#tools-section').classList.toggle('hidden',ai||core);$('#ai-section').classList.toggle('hidden',!ai);$('#core-section').classList.toggle('hidden',!core);
  $('#breadcrumb-current').textContent=core?'Prisma Core':ai?'Laboratorio IA':activeView==='favorites'?'Favoritos':activeView==='recent'?'Recientes':activeCategory!=='all'?(categories.find(c=>c.id===activeCategory)?.name||'Explorar'):searchTerm?'Resultados':'Explorar';
  $('#section-title').textContent=activeView==='favorites'?'Tus herramientas favoritas':activeView==='recent'?'Abiertas recientemente':searchTerm?'Resultados de búsqueda':activeCategory==='all'?'Explora las herramientas':categories.find(c=>c.id===activeCategory)?.name||'Explora las herramientas';
  $('#section-description').textContent=activeView==='favorites'?'Tus accesos guardados en este dispositivo.':activeView==='recent'?'Retoma rápidamente una herramienta que utilizaste antes.':searchTerm?'Resultados relacionados con tu búsqueda, incluidos sinónimos.':'Elige una herramienta y empieza a trabajar al instante.';
  $$('.nav-item').forEach(button=>{const active=button.dataset.view===activeView;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  $('#category-label').classList.toggle('hidden',activeView==='ai');$('#category-nav').classList.toggle('hidden',activeView==='ai');
  document.querySelectorAll('#category-nav [data-category]').forEach(button=>button.classList.toggle('active',activeView==='explore'&&button.dataset.category===activeCategory));
  $('#favorite-count').textContent=favorites.size;$('#recent-count').textContent=recentTools.length;
  $('#filter-chips').classList.toggle('hidden',activeView!=='explore');
  $('#clear-recent').classList.toggle('hidden',activeView!=='recent'||!recentTools.length);
  $('#clear-search').classList.toggle('hidden',!searchTerm);
  const list=visibleTools();
  $('#tool-grid').classList.toggle('list-view',layout==='list');
  $('#tool-grid').innerHTML=list.map(tool=>'<article class="tool-card '+(tool.status==='soon'?'is-disabled':'')+'" data-tool="'+tool.id+'"><div class="tool-card-top"><span class="tool-icon">'+icon(tool.icon)+'</span><button type="button" class="tool-favorite '+(favorites.has(tool.id)?'active':'')+'" data-favorite="'+tool.id+'" aria-label="'+(favorites.has(tool.id)?'Quitar de favoritos':'Guardar en favoritos')+'" aria-pressed="'+favorites.has(tool.id)+'" title="'+(favorites.has(tool.id)?'Quitar de favoritos':'Guardar en favoritos')+'">'+icon('star')+'</button></div><button type="button" class="tool-card-launch" aria-label="'+escapeHtml('Abrir herramienta: '+tool.name)+'"><h3>'+escapeHtml(tool.name)+'</h3></button><p>'+escapeHtml(tool.description)+'</p><div class="tool-card-bottom"><span class="tool-tag">'+escapeHtml(tool.tag||'')+'</span><span class="tool-status '+tool.status+'">'+statusLabels[tool.status]+'</span></div><span class="tool-open">Abrir herramienta →</span></article>').join('');

  $('#empty-state').classList.toggle('hidden',list.length>0);$('#tool-grid').classList.toggle('hidden',list.length===0);
  $('#empty-title').textContent=activeView==='favorites'?'Todavía no tienes favoritos':activeView==='recent'?'Todavía no hay herramientas recientes':'No encontramos herramientas';
  $('#empty-description').textContent=activeView==='favorites'?'Guarda una herramienta con la estrella para tenerla siempre a mano.':activeView==='recent'?'Cuando abras una herramienta, aparecerá aquí para que puedas retomarla.':'Prueba con otras palabras o busca por lo que quieres conseguir.';
  $('#result-count').textContent=list.length+' herramientas';
  $('#filter-chips').innerHTML=categories.map(category=>'<button type="button" class="filter-chip '+(activeCategory===category.id?'active':'')+'" data-filter="'+category.id+'" aria-pressed="'+(activeCategory===category.id)+'">'+category.name+'</button>').join('');
  $('#metric-tools').textContent=tools.length;$('#metric-local').textContent=tools.filter(tool=>tool.mode==='local'||tool.mode==='browser').length;
  renderMiniTools('home-popular',popularToolIds,'Estamos preparando recomendaciones.');renderHomeRecents();
  $$('#tool-grid [data-tool]').forEach(card=>{
    const open=event=>{
      if(event.target.closest('[data-favorite]'))return;
      const tool=tools.find(item=>item.id===card.dataset.tool);if(!tool)return;
      if(tool.status==='soon'){toast('Esta herramienta todavía está en preparación.','info');return;}
      openTool(tool);
    };
    card.addEventListener('click',open);
  });
  $$('#tool-grid [data-favorite]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();toggleFavorite(button.dataset.favorite);}));
  $$('#filter-chips [data-filter]').forEach(button=>button.addEventListener('click',()=>{activeView='explore';activeCategory=button.dataset.filter;render();}));
}

function toggleFavorite(id){
  if(favorites.has(id))favorites.delete(id);else favorites.add(id);
  localStorage.setItem('prisma-favorites',JSON.stringify([...favorites]));render();
}
function recordRecentTool(id){
  recentTools=[{id:id,at:Date.now()},...recentTools.filter(item=>item.id!==id)].slice(0,12);
  localStorage.setItem('prisma-recent',JSON.stringify(recentTools));
  $('#recent-count').textContent=recentTools.length;renderHomeRecents();
}
function closeProfileMenu(){
  const menu=$('#profile-menu'),toggle=$('#profile-toggle');if(!menu||!toggle)return;
  menu.classList.add('hidden');toggle.setAttribute('aria-expanded','false');
}
function setupProfileMenu(){
  const toggle=$('#profile-toggle'),menu=$('#profile-menu');
  toggle.addEventListener('click',event=>{event.stopPropagation();const open=menu.classList.toggle('hidden')===false;toggle.setAttribute('aria-expanded',String(open));});
  menu.addEventListener('click',event=>event.stopPropagation());document.addEventListener('click',closeProfileMenu);
  $('#clear-local-data').addEventListener('click',()=>{
    if(!window.confirm('Se borrarán favoritos, historial, tema y la App Key guardada en este navegador. ¿Continuar?'))return;
    favorites.clear();recentTools=[];
    ['prisma-favorites','prisma-recent','prisma-theme','prisma-polli-client-id'].forEach(key=>localStorage.removeItem(key));
    ['prisma-polli-token','prisma-polli-expiry','prisma-polli-verifier','prisma-polli-state'].forEach(key=>sessionStorage.removeItem(key));
    document.documentElement.dataset.theme='dark';$('#theme-toggle').innerHTML=icon('sun');
    const keyInput=$('#polli-app-key');if(keyInput)keyInput.value='';
    refreshPollinationsStatus();closeProfileMenu();render();toast('Se borraron los datos locales de este navegador.','success');
  });
}
function setupHomeDashboard(){
  $$('[data-home-category]').forEach(button=>button.addEventListener('click',()=>{
    activeView='explore';activeCategory=button.dataset.homeCategory;searchTerm='';$('#global-search').value='';render();
    $('#tools-section').scrollIntoView({behavior:'smooth',block:'start'});
  }));
  $('#clear-recent').addEventListener('click',()=>{recentTools=[];localStorage.removeItem('prisma-recent');render();toast('Historial reciente borrado.','success');});
}
function setupMobileSearch(){
  const search=$('.global-search'),input=$('#global-search');
  search.addEventListener('click',event=>{
    if(window.matchMedia('(max-width: 620px)').matches&&!search.classList.contains('is-open')&&event.target.closest('span')){
      event.preventDefault();search.classList.add('is-open');input.focus();
    }
  });
  input.addEventListener('blur',()=>{if(!input.value.trim())search.classList.remove('is-open');});
}
function toast(message,type='success'){const el=document.createElement('div');el.className='toast '+type;el.textContent=message;$('#toast-region').append(el);setTimeout(()=>el.remove(),3400);}
function field(label,name,type='text',value='',hint='',extra=''){
  return '<div class="form-field"><label for="field-'+name+'">'+label+'</label><input class="form-control" id="field-'+name+'" name="'+name+'" type="'+type+'" value="'+escapeHtml(value)+'" '+extra+'>'+ (hint?'<small>'+hint+'</small>':'')+'</div>';
}
function textareaField(label,name,value='',hint=''){
  return '<div class="form-field"><label for="field-'+name+'">'+label+'</label><textarea class="form-control" id="field-'+name+'" name="'+name+'" placeholder="Escribe o pega aquí...">'+escapeHtml(value)+'</textarea>'+(hint?'<small>'+hint+'</small>':'')+'</div>';
}
function selectField(label,name,options,value,hint=''){
  return '<div class="form-field"><label for="field-'+name+'">'+label+'</label><select class="form-control" id="field-'+name+'" name="'+name+'">'+options.map(o=>'<option value="'+o[0]+'" '+(o[0]===value?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>'+(hint?'<small>'+hint+'</small>':'')+'</div>';
}
function pollinationsAuthFields(){
  return '<div class="provider-config" id="polli-config"><div class="provider-modal-status"><span id="polli-modal-status">Pollinations: no conectado</span><button type="button" class="mini-button" id="open-ai-settings">Configurar conexión</button></div><small>Conecta tu cuenta una sola vez desde el Laboratorio IA. La autorización y el presupuesto son personales.</small></div>';
}

function huggingFaceAuthFields(){
  return '<div class="provider-config hidden" id="hf-config">'+
    field('Token personal de Hugging Face','hfToken','password','','Necesita permiso Inference Providers. <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener">Crear token</a>. No se guarda en Prisma Space.','autocomplete="off" spellcheck="false"')+
    '<div class="tool-hint">Importante: las cuentas Free no incluyen créditos mensuales de Inference Providers. Hugging Face PRO incluye USD 2 mensuales; el consumo adicional puede ser de pago.</div>'+
  '</div>';
}

function setupApiExplorer(){
  const preset=$('#field-preset'),url=$('#field-url');
  const examples={
    'github-repo':'https://api.github.com/repos/AndresYepez23/PRISMA',
    'github-search':'https://api.github.com/search/repositories?q=generative-ai+language:javascript&sort=stars&order=desc&per_page=10',
    jsonplaceholder:'https://jsonplaceholder.typicode.com/todos/1',
    'open-meteo':'https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m,relative_humidity_2m,wind_speed_10m'
  };
  preset?.addEventListener('change',()=>{
    if(url&&examples[preset.value])url.value=examples[preset.value];
    if(url&&preset.value==='custom')url.value='';
  });
}
function buildFields(t){
  switch(t.id){
    case 'pdf-split':return '<div class="tool-hint">Divide el documento en un PDF por página y descarga todos los archivos en un ZIP. Se procesa en tu dispositivo, sin subir el documento ni necesitar una API.</div>';
    case 'pdf-compress':return '<div class="tool-hint">Optimiza la estructura interna del PDF sin convertir las páginas en imágenes. No necesita API y conserva el texto seleccionable. La reducción depende del documento; si el peso está en fotografías, esta técnica puede no reducirlo. La compresión avanzada de imágenes se incorporará por separado.</div>';
    case 'pdf-to-word':return '<div class="tool-hint">Convierte PDF digitales con texto seleccionable en un archivo DOCX editable. No requiere cuenta ni API: el procesamiento ocurre en tu navegador. Los PDFs escaneados necesitan OCR y la maquetación compleja puede requerir ajustes en Word.</div>';
    case 'docx-pdf':return '<div class="tool-hint">Prisma Space convertirá el documento a una vista HTML de impresión. Desde la ventana que se abre, selecciona <strong>Guardar como PDF</strong> en el diálogo de impresión del navegador. El diseño puede variar respecto a Microsoft Word.</div>';
    case 'image-blur':return field('Intensidad del desenfoque (px)','blur','number','5','','min="1" max="30"');
    case 'image-adjust':return '<div class="inline-fields">'+field('Brillo (%)','brightness','number','110','','min="10" max="200"')+field('Contraste (%)','contrast','number','110','','min="10" max="200"')+'</div>';
    case 'image-rounded':return field('Radio de esquina (px)','radius','number','48','','min="0" max="500"')+field('Tamaño máximo (px)','maxSize','number','1600','Limita el tamaño del PNG exportado.','min="128" max="5000"');
    case 'image-metadata':return '<div class="tool-hint">Lee dimensiones y metadatos EXIF que estén presentes. Algunas plataformas eliminan estos datos al compartir imágenes.</div>';
    case 'audio-waveform':return selectField('Color de la onda','color',[['#9adbd2','Turquesa'],['#a9a0ee','Lavanda'],['#ffffff','Blanco'],['#f0b77a','Ámbar']],'#9adbd2');
    case 'hash-file':return '<div class="tool-hint">Calcula SHA-256 directamente en tu navegador. El archivo no se sube a Prisma Space.</div>';
    case 'github-discover':return textareaField('¿Qué tipo de proyecto buscas?','query','open source AI tools','Describe la tecnología o el problema que quieres resolver.')+
      selectField('Lenguaje','language',[['any','Cualquier lenguaje'],['javascript','JavaScript'],['typescript','TypeScript'],['python','Python'],['rust','Rust'],['go','Go']],'any')+
      selectField('Ordenar resultados','sort',[['stars','Más estrellas'],['updated','Actualizados recientemente'],['forks','Más bifurcaciones']],'stars')+
      selectField('Cantidad de resultados','limit',[['5','5 proyectos'],['10','10 proyectos'],['20','20 proyectos']],'10')+
      '<div class="tool-hint">Consulta repositorios públicos de GitHub. No necesita token para búsquedas públicas, pero GitHub aplica límites por IP.</div>';
    case 'api-explorer':return selectField('Ejemplo para probar','preset',[['github-repo','GitHub · repositorio público'],['github-search','GitHub · proyectos open source'],['jsonplaceholder','JSONPlaceholder · datos de prueba'],['open-meteo','Open-Meteo · datos meteorológicos'],['custom','Mi propia API pública']],'github-repo')+
      field('URL pública (solo lectura)','url','url','https://api.github.com/repos/AndresYepez23/PRISMA','Solo HTTPS y endpoints públicos. No pegues claves API, contraseñas ni datos privados.')+
      selectField('Cómo mostrar la respuesta','format',[['json','JSON organizado'],['text','Texto sin formato'],['raw','Respuesta original']],'json')+
      '<div class="tool-hint">Prisma intentará consultar la API directamente. Si el navegador bloquea el acceso por CORS, probará cors.dev para una lectura pública GET. No se envían credenciales ni cookies.</div>';
    case 'jwt-decode':return textareaField('Token JWT','token','','Pega el token completo. Prisma Space solo decodifica su contenido: no valida firma, emisor ni vencimiento.');
    case 'regex-test':return field('Expresión regular','pattern','text','\\bPrisma Space\\b','No incluyas las barras /.../.','maxlength="200"')+field('Flags','flags','text','gi','Flags permitidos: g, i, m, s, u.','maxlength="5"')+textareaField('Texto de prueba','text','Prisma Space reúne herramientas. Prisma es un espacio digital.');
    case 'json-yaml':return textareaField('Contenido','text','nombre: Prisma Space\\nversion: 1','Pega JSON o YAML.')+selectField('Conversión','mode',[['json-to-yaml','JSON a YAML'],['yaml-to-json','YAML a JSON']],'json-to-yaml');
    case 'excel-json':return selectField('Hoja','sheet',[['0','Primera hoja'],['all','Todas las hojas']],'0')+selectField('Formato de salida','format',[['json','JSON'],['csv','CSV']],'json');
    case 'css-gradient':return '<div class="inline-fields">'+field('Color inicial','color1','color','#9adbd2')+field('Color final','color2','color','#a9a0ee')+'</div>'+field('Ángulo (grados)','angle','number','135','','min="0" max="360"')+selectField('Tipo','type',[['linear','Lineal'],['radial','Radial']],'linear');
    case 'text-diff':return textareaField('Texto original','textA','','Pega aquí la primera versión.')+textareaField('Texto modificado','textB','','Pega aquí la segunda versión.');
    case 'pdf-extract':return field('Páginas que deseas conservar','pages','text','1-3','Ejemplos: 1, 3, 5-8. La numeración comienza en 1.');
    case 'pdf-remove-pages':return field('Páginas que deseas eliminar','pages','text','2, 4-5','Ejemplos: 2, 4-5. Las páginas restantes se conservarán.');
    case 'pdf-page-numbers':return selectField('Ubicación de la numeración','position',[['bottom','Inferior'],['top','Superior']],'bottom');
    case 'pdf-to-image':return field('Páginas (opcional)','pages','text','','Vacío = todas las páginas. Ejemplo: 1-3, 5.')+selectField('Resolución','scale',[['1','Estándar'],['1.5','Alta (recomendada)'],['2','Muy alta']],'1.5');
    case 'pdf-text':return '<div class="tool-hint">Extrae texto de PDFs digitales. Si el documento es un escaneo o una fotografía, utiliza OCR en la categoría Imágenes.</div>';
    case 'pdf-rotate':return selectField('Rotación','degrees',[['90','90° a la derecha'],['180','180°'],['270','90° a la izquierda']],'90');
    case 'pdf-watermark':return field('Texto de la marca de agua','watermark','text','Prisma Space','Se aplicará en diagonal y con transparencia.');
    case 'image-pdf':return selectField('Tamaño de página','pageSize',[['a4','A4'],['letter','Carta'],['fit','Ajustar a la imagen']],'a4');
    case 'image-compress':return '<div class="inline-fields">'+field('Calidad','quality','number','78','Entre 10 y 100.','min="10" max="100"')+selectField('Formato de salida','format',[['image/webp','WebP (recomendado)'],['image/jpeg','JPG']],'image/webp')+'</div>';
    case 'image-resize':return '<div class="inline-fields">'+field('Ancho (px)','width','number','1200','Ancho final.','min="1" max="12000"')+field('Alto (px)','height','number','800','Alto final.','min="1" max="12000"')+'</div><label class="check-line"><input type="checkbox" name="keep" checked> Mantener proporción original</label>';
    case 'image-convert':return selectField('Formato de salida','format',[['image/png','PNG'],['image/jpeg','JPG'],['image/webp','WebP']],'image/webp');
    case 'image-crop':return '<div class="inline-fields">'+field('Ancho del recorte (%)','widthPct','number','80','Porcentaje del ancho.','min="10" max="100"')+field('Alto del recorte (%)','heightPct','number','80','Porcentaje del alto.','min="10" max="100"')+'</div><div class="tool-hint">Se realiza un recorte centrado. Para edición libre con selección visual añadiremos un editor dedicado.</div>';
    case 'image-gen':return selectField('Motor de imagen','provider',[['auto','Automático · recomendado'],['pollinations','Pollinations · tu saldo'],['huggingface','Hugging Face'],['gemini','Google Gemini']],'auto')+
      selectField('Calidad','qualityProfile',[['fast','Más rápido'],['balanced','Equilibrado'],['high','Mayor detalle']],'balanced')+
      textareaField('Describe la imagen que quieres crear','prompt','','Describe sujeto, ambiente, composición, iluminación y estilo.')+
      selectField('Estilo visual','style',[['photo','Fotografía realista'],['cinematic','Cinematográfico'],['illustration','Ilustración editorial'],['3d','Render 3D'],['anime','Anime'],['product','Fotografía de producto']],'photo')+
      selectField('Formato','ratio',[['square','Cuadrado · 1:1'],['landscape','Horizontal · 4:3'],['portrait','Vertical · 3:4'],['wide','Panorámico · 16:9']],'square')+
      field('Semilla (opcional)','seed','number','','Usa el mismo número para intentar reproducir una composición.','min="0" step="1"')+
      textareaField('Elementos que quieres evitar (opcional)','negativePrompt','','Elementos que prefieres evitar.')+
      '<div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'ai-assistant':return textareaField('¿Qué necesitas crear o resolver?','prompt','','Ejemplo: redacta una descripción profesional para un producto...')+
      selectField('Motor de texto','provider',[['auto','Automático · recomendado'],['pollinations','Pollinations'],['huggingface','Hugging Face'],['groq','Groq'],['gemini','Google Gemini']],'auto')+
      selectField('Capacidad del modelo','reasoning',[['fast','Rápido · menor latencia'],['balanced','Equilibrado · recomendado'],['smart','Avanzado · mejor razonamiento']],'balanced')+
      selectField('Tono','tone',[['professional','Profesional'],['friendly','Cercano'],['creative','Creativo'],['academic','Académico'],['concise','Directo y breve']],'professional')+
      selectField('Extensión','length',[['short','Breve'],['medium','Media'],['long','Detallada']],'medium')+
      textareaField('Contexto adicional (opcional)','context','','Añade datos que el modelo deba tener en cuenta.')+
      '<div class="tool-hint workflow-provider-notice" id="tool-provider-notice"></div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
    case 'ai-voice':return textareaField('Texto que quieres convertir en voz','prompt','','Escribe el texto que quieres escuchar.')+
      selectField('Modelo de voz','model',[['openai/tts-1','TTS estándar'],['openai/tts-1-hd','TTS alta calidad']],'openai/tts-1')+
      selectField('Voz','voice',[['nova','Nova · femenina'],['alloy','Alloy · neutra'],['echo','Echo · masculina'],['shimmer','Shimmer · femenina']],'nova')+
      selectField('Formato de audio','format',[['mp3','MP3'],['wav','WAV'],['opus','Opus']],'mp3')+
      pollinationsAuthFields();
    case 'ai-transcribe':return selectField('Modelo de transcripción','model',[['openai/whisper-1','Whisper · automático']],'openai/whisper-1')+
      selectField('Idioma','language',[['es','Español'],['en','Inglés'],['auto','Detectar automáticamente']],'es')+
      pollinationsAuthFields();
    case 'image-watermark':return field('Texto de la marca','watermark','text','Prisma Space','Puedes usar tu nombre, marca o sitio web.')+selectField('Ubicación','position',[['bottom-right','Abajo a la derecha'],['bottom-left','Abajo a la izquierda'],['top-right','Arriba a la derecha'],['top-left','Arriba a la izquierda'],['center','Centro']],'bottom-right')+field('Tamaño (px)','size','number','36','','min="12" max="180"')+field('Opacidad (%)','opacity','number','45','Entre 8 y 90.','min="8" max="90"')+selectField('Color','color',[['#ffffff','Blanco'],['#111827','Negro'],['#9adbd2','Turquesa'],['#ffffff','Blanco']],'#ffffff');
    case 'image-flip':return selectField('Dirección','direction',[['horizontal','Horizontal'],['vertical','Vertical']],'horizontal');
    case 'image-collage':return selectField('Fondo del mosaico','background',[['#ffffff','Blanco'],['#101218','Oscuro'],['#9adbd2','Turquesa claro']],'#ffffff');
    case 'image-ocr':return selectField('Idioma del documento','language',[['spa','Español'],['eng','Inglés'],['spa+eng','Español e inglés']],'spa','La primera ejecución descarga los datos de idioma.');
    case 'video-trim':return '<div class="inline-fields">'+field('Inicio (segundos)','start','number','0','Desde qué segundo iniciar.','min="0" step="0.1"')+field('Duración (segundos)','duration','number','10','Duración del fragmento.','min="0.1" step="0.1"')+'</div>';
    case 'video-thumbnail':return field('Segundo del video','second','number','1','Elige el instante que quieres capturar.','min="0" step="0.1"');
    case 'video-gif':case 'audio-trim':return '<div class="inline-fields">'+field('Inicio (segundos)','start','number','0','Punto de inicio.','min="0" step="0.1"')+field('Duración (segundos)','duration','number',t.id==='video-gif'?'5':'10','GIF: máximo 12 segundos.','min="0.1" max="12" step="0.1"')+'</div><div class="tool-hint">El motor multimedia se descarga al ejecutar la primera vez. Los archivos se procesan en tu navegador.</div>';
    case 'qr-scan':return '<div class="tool-hint">Sube una imagen que contenga un código QR. Prisma Space intentará leerlo en tu navegador.</div>';
    case 'barcode':return field('Contenido','value','text','123456789012','Para EAN-13 utiliza exactamente 12 o 13 dígitos.')+selectField('Formato','format',[['CODE128','Code 128'],['EAN13','EAN-13'],['CODE39','Code 39']],'CODE128');
    case 'json-format':return textareaField('Contenido JSON','text','{\n  "prisma": "listo"\n}','Valida y organiza el contenido con la indentación seleccionada.')+selectField('Indentación','indent',[['2','2 espacios'],['4','4 espacios'],['tab','Tabulación']],'2');
    case 'base64':return textareaField('Texto','text','','Admite caracteres especiales y tildes.')+selectField('Operación','mode',[['encode','Codificar a Base64'],['decode','Decodificar Base64']],'encode');
    case 'word-count':return textareaField('Texto para analizar','text','','El análisis se realiza localmente.');
    case 'password':return '<div class="inline-fields">'+field('Longitud','length','number','20','Entre 8 y 128 caracteres.','min="8" max="128"')+selectField('Complejidad','complexity',[['strong','Alta'],['medium','Media'],['easy','Fácil de escribir']],'strong')+'</div><label class="check-line"><input type="checkbox" name="symbols" checked> Incluir símbolos</label>';
    case 'qr':return textareaField('Texto o enlace','text','https://','El código QR se genera en tu navegador.');
    case 'currency':return '<div class="inline-fields">'+field('Cantidad','amount','number','1','','min="0" step="any"')+selectField('Moneda de origen','from',[['USD','USD · Dólar'],['COP','COP · Peso colombiano'],['EUR','EUR · Euro'],['MXN','MXN · Peso mexicano'],['BRL','BRL · Real'],['GBP','GBP · Libra']],'USD')+'</div>'+selectField('Moneda de destino','to',[['COP','COP · Peso colombiano'],['USD','USD · Dólar'],['EUR','EUR · Euro'],['MXN','MXN · Peso mexicano'],['BRL','BRL · Real'],['GBP','GBP · Libra']],'COP','Consulta tasas de referencia. No es una cotización financiera en tiempo real.');
    case 'units':return selectField('Tipo de conversión','kind',[['length','Longitud'],['mass','Masa'],['area','Área'],['volume','Volumen'],['speed','Velocidad'],['data','Datos digitales'],['temperature','Temperatura']],'length')+field('Valor','value','number','1','','step="any"')+selectField('De','from',[['m','Metros'],['km','Kilómetros'],['cm','Centímetros'],['mm','Milímetros'],['mi','Millas'],['ft','Pies'],['in','Pulgadas'],['yd','Yardas']],'m')+selectField('A','to',[['km','Kilómetros'],['m','Metros'],['cm','Centímetros'],['mm','Milímetros'],['mi','Millas'],['ft','Pies'],['in','Pulgadas'],['yd','Yardas']],'km');
    case 'timestamp':return selectField('Conversión','mode',[['unix-to-date','Unix a fecha'],['date-to-unix','Fecha a Unix']],'unix-to-date')+field('Valor','value','text','1762550400','Acepta segundos, milisegundos o una fecha ISO.');
    case 'url-code':return textareaField('Texto o URL','text','','')+selectField('Operación','mode',[['encode','Codificar'],['decode','Decodificar']],'encode');
    case 'text-case':return textareaField('Texto','text','')+selectField('Transformación','mode',[['upper','MAYÚSCULAS'],['lower','minúsculas'],['title','Tipo título'],['sentence','Tipo oración']],'upper');
    case 'text-remove-empty-lines':return textareaField('Texto','text','','Se eliminan las líneas vacías y se conservan las líneas con contenido.');
    case 'text-prefix-lines':return textareaField('Texto','text','','Cada línea recibirá el prefijo y sufijo indicados.')+'<div class="inline-fields">'+field('Prefijo','prefix','text','','')+field('Sufijo','suffix','text','','')+'</div>';
    case 'text-replace':return textareaField('Texto original','text','','')+'<div class="inline-fields">'+field('Buscar','search','text','','')+field('Reemplazar por','replacement','text','','')+'</div><label class="check-line"><input type="checkbox" name="caseSensitive"> Distinguir mayúsculas y minúsculas</label><label class="check-line"><input type="checkbox" name="replaceAll" checked> Reemplazar todas las coincidencias</label>';
    case 'text-extract-hashtags':return textareaField('Publicación o texto','text','','Se extraen hashtags únicos respetando tildes y caracteres Unicode.');
    case 'text-extract-phones':return textareaField('Texto de origen','text','','Se detectan posibles teléfonos; verifica cada resultado antes de usarlo.');
    case 'json-flatten':return textareaField('Contenido JSON','text','{\n  "usuario": { "nombre": "Ana", "ciudad": "Chinú" },\n  "activo": true\n}','Convierte objetos anidados en rutas como usuario.nombre.');
    case 'text-remove-accents':return textareaField('Texto','text','','Se eliminan las marcas diacríticas sin cambiar el resto del contenido.');
    case 'text-reverse':return textareaField('Texto','text','','Invierte los caracteres o las líneas.')+selectField('Qué invertir','mode',[['characters','Caracteres'],['lines','Orden de líneas']],'characters');
    case 'text-extract-emails':return textareaField('Texto de origen','text','','Se extraerán correos únicos sin enviar el texto a ningún servidor.');
    case 'text-extract-urls':return textareaField('Texto de origen','text','','Se extraerán enlaces HTTP y HTTPS únicos.');
    case 'json-minify':return textareaField('Contenido JSON','text','{\n  "prisma": "listo"\n}','Valida el JSON antes de eliminar espacios.');
    case 'html-to-text':return textareaField('Código HTML','text','<h1>Hola</h1><p>Texto de ejemplo</p>','El contenido HTML se analiza como documento inerte; no se ejecutan scripts.');
    case 'markdown':return textareaField('Markdown','text','# Prisma Space\n\nEscribe **Markdown** aquí.','La vista previa básica se genera en tu navegador.');
    case 'color-palette':return selectField('Armonía','harmony',[['analogous','Análogos'],['complementary','Complementarios'],['triadic','Triádicos']],'analogous');
    case 'csv-json':return textareaField('Contenido CSV','text','nombre,ciudad\nAna,Chinú\nLuis,Cartagena','La primera fila se utiliza como encabezado.')+selectField('Separador','delimiter',[[',','Coma'],[';','Punto y coma'],['\\t','Tabulación']],',');
    case 'json-csv':return textareaField('Lista JSON','text','[{"nombre":"Ana","ciudad":"Chinú"},{"nombre":"Luis","ciudad":"Cartagena"}]','El JSON debe ser una lista de objetos.');
    case 'slug':return textareaField('Título o texto','text','Mi primera página en Prisma Space','Se eliminan tildes, símbolos y espacios repetidos.');
    case 'dedupe-lines':return textareaField('Lista de líneas','text','','Se conservará la primera aparición de cada línea.')+'<label class="check-line"><input type="checkbox" name="caseSensitive"> Distinguir mayúsculas y minúsculas</label>';
    case 'clean-text':return textareaField('Texto para limpiar','text','','Se normalizan espacios y saltos de línea.');
    case 'html-entities':return textareaField('Contenido','text','<h1>Hola Prisma Space</h1>','Escapa HTML o recupera el texto original.')+selectField('Operación','mode',[['encode','Codificar / escapar'],['decode','Decodificar']],'encode');
    case 'uuid':return field('Cantidad','count','number','5','Genera hasta 50 UUID v4.','min="1" max="50"');
    case 'lorem':return '<div class="inline-fields">'+field('Palabras','words','number','120','','min="10" max="1500"')+field('Párrafos','paragraphs','number','3','','min="1" max="12"')+'</div>';
    case 'random':return '<div class="inline-fields">'+field('Mínimo','min','number','1')+field('Máximo','max','number','100')+'</div>'+field('Cantidad','count','number','10','','min="1" max="100"');
    case 'calculator':return field('Expresión matemática','expression','text','(125 * 1.19) + 5000','Admite +, -, *, /, %, ^ y paréntesis.');
    case 'percentage':return selectField('Operación','mode',[['of','Calcular porcentaje de una cantidad'],['change','Variación porcentual entre dos valores']],'of')+'<div class="inline-fields">'+field('Cantidad / valor inicial','a','number','250','','step="any"')+field('Porcentaje / valor final','b','number','19','','step="any"')+'</div>';
    case 'date-diff':return '<div class="inline-fields">'+field('Fecha inicial','start','date','2026-01-01')+field('Fecha final','end','date',new Date().toISOString().slice(0,10))+'</div>';
    case 'timezone':return field('Fecha y hora','datetime','datetime-local',new Date().toISOString().slice(0,16))+selectField('Zona de destino','zone',[['America/Bogota','Bogotá'],['America/Mexico_City','Ciudad de México'],['America/New_York','Nueva York'],['America/Los_Angeles','Los Ángeles'],['Europe/Madrid','Madrid'],['Europe/London','Londres'],['Asia/Tokyo','Tokio'],['Australia/Sydney','Sídney']],'America/Bogota');
    case 'contrast':return '<div class="inline-fields">'+field('Color del texto','foreground','text','#111827')+field('Color del fondo','background','text','#ffffff')+'</div><div class="tool-hint">Introduce colores HEX de 3 o 6 dígitos. Se calcula la relación de contraste WCAG.</div>';
    case 'text-sort':return textareaField('Líneas para ordenar','text','','Cada línea se ordenará alfabéticamente.')+'<label class="check-line"><input type="checkbox" name="caseSensitive"> Orden sensible a mayúsculas</label>';
    case 'word-frequency':return textareaField('Texto para analizar','text','','Se mostrarán hasta 30 palabras por frecuencia.');
    case 'html-format':case 'css-format':case 'js-format':case 'sql-format':return textareaField('Código fuente','text','','Pega aquí el código que quieres organizar.')+selectField('Indentación','indent',[['2','2 espacios'],['4','4 espacios'],['tab','Tabulación']],'2')+(t.id==='sql-format'?selectField('Dialecto SQL','dialect',[['sql','SQL estándar'],['postgresql','PostgreSQL'],['mysql','MySQL'],['sqlite','SQLite'],['bigquery','BigQuery']],'sql'):'');
    case 'xml-format':return textareaField('Documento XML','text','<prisma><estado>listo</estado></prisma>','El documento se valida antes de formatearlo.');
    case 'json-schema':return textareaField('JSON que quieres validar','data','{\\n  "nombre": "Prisma",\\n  "activo": true\\n}','Introduce el contenido que quieres comprobar.')+textareaField('Esquema JSON','schema','{\\n  "type": "object",\\n  "required": ["nombre", "activo"],\\n  "properties": { "nombre": { "type": "string" }, "activo": { "type": "boolean" } }\\n}','Define los campos y tipos permitidos.');
    case 'csv-stats':return textareaField('Datos CSV','text','producto,ventas,precio\\nA,120,10.5\\nB,90,8.2\\nC,,12','Pega una tabla CSV con encabezados.')+selectField('Separador','delimiter',[[',','Coma'],[';','Punto y coma'],['\\\\t','Tabulación']],',');
    case 'json-xlsx':return textareaField('Lista JSON','text','[{\\n  "producto": "A", "ventas": 120\\n}, {\\n  "producto": "B", "ventas": 90\\n}]','Cada objeto se convertirá en una fila de Excel.');
    case 'file-inspector':return '<div class="tool-hint">Selecciona cualquier archivo para revisar su tamaño, tipo declarado y firma binaria. El análisis ocurre en este navegador.</div>';
    case 'image-strip-metadata':return '<div class="tool-hint">Reexporta JPEG, PNG o WebP para descartar metadatos EXIF habituales, incluidos datos de ubicación cuando estén presentes. La imagen se procesa en tu dispositivo.</div>';
    case 'pdf-metadata':return '<div class="tool-hint">Consulta título, autor, creador, productor, fechas y número de páginas sin modificar el documento.</div>';
    case 'pdf-metadata-clean':return '<div class="tool-hint">Genera una copia del PDF limpiando los campos habituales de autoría y metadatos. Revisa el archivo resultante antes de compartirlo.</div>';
    case 'image-pixelate':return field('Tamaño de bloque (px)','block','number','16','Cuanto mayor sea el número, más pixelado será el resultado.','min="4" max="80"');
    case 'image-sepia':return '<div class="tool-hint">Aplica un tono sepia clásico y exporta una copia PNG sin modificar el original.</div>';
    case 'image-social-kit':return '<div class="tool-hint">Genera cuatro recortes centrados: publicación cuadrada, retrato 4:5, historia/Reel 9:16 y miniatura horizontal 16:9. Descarga todo en un ZIP.</div>';
    case 'citation-generator':return field('Autor o autores','author','text','Apellido, N.','Usa los datos tal como aparecen en la publicación.')+field('Año','year','text','2026')+field('Título','title','text','','Título del artículo, libro o recurso.')+field('Revista, editorial o sitio','source','text','','Nombre de la fuente.')+field('DOI (opcional)','doi','text','','Puedes pegar el DOI o su URL.')+field('URL (opcional)','url','url','','Enlace directo a la fuente.')+selectField('Formato de salida principal','style',[['apa','APA 7'],['vancouver','Vancouver'],['mla','MLA 9']],'apa');
    case 'flashcards-export':return textareaField('Conceptos y definiciones','text','Caries | Enfermedad multifactorial que afecta los tejidos duros del diente.\\nPulpa | Tejido conectivo vascularizado e inervado del diente.','Una tarjeta por línea. Separa el concepto y la definición con |, tabulación o ::. Descarga CSV compatible con Anki.');
    case 'qr-vcard':return field('Nombre completo','name','text','Andrés Simón Yépez')+field('Teléfono','phone','tel','','Incluye el indicativo del país.')+field('Correo electrónico','email','email','','')+field('Empresa u organización','organization','text','','Opcional.');
    case 'video-speed':return selectField('Velocidad de reproducción','speed',[['0.5','0,5× · Cámara lenta'],['0.75','0,75×'],['1.25','1,25×'],['1.5','1,5×'],['2','2× · Rápido']],'1.5')+'<div class="tool-hint">El video se vuelve a codificar para sincronizar imagen y audio. La duración final cambiará.</div>';
    case 'video-resize':return selectField('Formato de salida','resolution',[['vertical','Vertical · 1080 × 1920'],['portrait','Retrato · 1080 × 1350'],['square','Cuadrado · 1080 × 1080'],['landscape','Horizontal · 1920 × 1080'],['hd','HD · 1280 × 720']],'vertical')+'<div class="tool-hint">Conserva la proporción del video y completa el espacio sobrante con bandas. No estira la imagen.</div>';
    case 'video-rotate':return selectField('Orientación','direction',[['cw','90° a la derecha'],['ccw','90° a la izquierda'],['180','180°']],'cw');
    case 'audio-convert':return selectField('Formato de salida','format',[['mp3','MP3'],['wav','WAV'],['ogg','OGG']],'mp3');
    case 'audio-normalize':return '<div class="tool-hint">Ajusta la sonoridad hacia un nivel objetivo aproximado de -16 LUFS para voz y contenido digital. Exporta M4A.</div>';
    default:return '';
  }
}

function base64Url(bytes){
  let binary='';new Uint8Array(bytes).forEach(b=>binary+=String.fromCharCode(b));
  return btoa(binary).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
}
function randomBase64Url(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return base64Url(bytes);}
function getPollinationsToken(){
  const token=sessionStorage.getItem('prisma-polli-token')||'';
  const expiry=Number(sessionStorage.getItem('prisma-polli-expiry')||0);
  if(expiry&&Date.now()>expiry){sessionStorage.removeItem('prisma-polli-token');sessionStorage.removeItem('prisma-polli-expiry');return '';}
  return token;
}
function refreshPollinationsStatus(){
  const connected=!!getPollinationsToken(),label=connected?'Conectado en esta pestaña':'No conectado';
  const status=$('#polli-status');if(status){status.textContent=label;status.classList.toggle('connected',connected);}
  refreshProviderConnectionStatuses();
}
function providerConnectionCard(config){
  if(config.shared){
    return '<article class="provider-connection-card" data-connection-card="'+config.id+'" data-central-provider="'+config.id+'"><div class="provider-connection-top"><div><h4>'+config.name+'</h4><p>'+config.summary+'</p></div><span class="provider-connection-status" data-connection-status="'+config.id+'">Consultando Cloudflare…</span></div><p class="provider-connection-detail">'+config.detail+'</p><div class="provider-connect-row"><small>Secreto de Cloudflare: <code>'+config.secretName+'</code> · Solo el backend puede leerlo.</small></div></article>';
  }
  const connected=!!getPollinationsToken();
  const details='<details class="provider-credential-details" id="provider-config-pollinations"><summary>Configuración inicial de Prisma Space</summary><label class="connection-key-label" for="polli-app-key">App Key pública</label><input class="form-control" id="polli-app-key" type="text" placeholder="pk_..." autocomplete="off" spellcheck="false"><small>Identifica esta aplicación; no es tu contraseña ni tu clave de consumo. Registra la URL de retorno que aparece abajo en <a href="https://enter.pollinations.ai/keys" target="_blank" rel="noopener noreferrer">Pollinations Connect</a>.</small><div class="provider-redirect"><code id="polli-redirect"></code><button type="button" class="mini-button" id="polli-copy-redirect">Copiar URL de retorno</button></div><button type="button" class="button button-primary" id="polli-connect">Continuar con Pollinations</button></details>';
  const action='<button type="button" class="button button-primary" id="polli-connect-start">'+(connected?'Conectar otra cuenta':'Conectar mi cuenta')+'</button><button type="button" class="button button-quiet '+(connected?'':'hidden')+'" id="polli-disconnect">Desconectar</button>';
  return '<article class="provider-connection-card" data-connection-card="pollinations"><div class="provider-connection-top"><div><h4>Pollinations Connect</h4><p>Imágenes, texto y audio</p></div><span class="provider-connection-status '+(connected?'connected':'')+'" data-connection-status="pollinations">'+(connected?'Conectado en esta pestaña':'Cuenta personal sin conectar')+'</span></div><p class="provider-connection-detail">Esta conexión OAuth sigue siendo personal y utiliza los permisos y límites de tu cuenta de Pollinations.</p><div class="provider-connect-row">'+action+'</div>'+details+'</article>';
}
function renderProviderConnections(){
  const container=$('#provider-connect-grid');if(!container)return;
  const configs=[
    {id:'gemini',name:'Google Gemini',summary:'Razonamiento, chat y análisis multimodal',detail:'Motor central de Prisma. Una sola clave maestra protegida permite que todos los visitantes utilicen el servicio, sujetos a las cuotas y límites de tu proyecto.',secretName:'GEMINI_API_KEY',shared:true},
    {id:'huggingface',name:'Hugging Face',summary:'Modelos abiertos y proveedores de inferencia',detail:'Conectaremos el token central de Prisma para ofrecer modelos open source sin pedir claves individuales a los visitantes.',secretName:'HF_TOKEN',shared:true},
    {id:'groq',name:'Groq',summary:'Inferencia rápida y modelos de lenguaje',detail:'Se habilitará como motor compartido para tareas compatibles, con límites de solicitudes y alternativas cuando alcance su cuota.',secretName:'GROQ_API_KEY',shared:true},
    {id:'pollinations',name:'Pollinations Connect',shared:false}
  ];
  container.innerHTML=configs.map(providerConnectionCard).join()+
    '<article class="provider-connection-card provider-managed-card"><div class="provider-connection-top"><div><h4>Cloudflare Workers AI</h4><p>Motor administrado por Prisma</p></div><span class="provider-connection-status">En preparación</span></div><p class="provider-connection-detail">Evaluaremos sus modelos gratuitos y límites antes de habilitarlo como motor compartido.</p></article>'+
    '<article class="provider-connection-card provider-managed-card"><div class="provider-connection-top"><div><h4>Motores open source locales</h4><p>Procesamiento en el dispositivo</p></div><span class="provider-connection-status connected">Disponibles</span></div><p class="provider-connection-detail">PDF-Lib, Tesseract.js, FFmpeg y otras bibliotecas ejecutan tareas directamente en el dispositivo cuando es posible.</p></article>';
  const input=$('#polli-app-key');if(input){input.value=localStorage.getItem('prisma-polli-client-id')||POLLINATIONS_APP_KEY;input.addEventListener('input',()=>localStorage.setItem('prisma-polli-client-id',input.value.trim()));}
  const redirect=$('#polli-redirect');if(redirect)redirect.textContent=location.origin+location.pathname;
  $('#polli-connect-start')?.addEventListener('click',()=>{const key=$('#polli-app-key')?.value||localStorage.getItem('prisma-polli-client-id')||'';if(key.trim().startsWith('pk_'))connectPollinations();else{$('#provider-config-pollinations').open=true;$('#polli-app-key')?.focus();toast('Configura una sola vez la App Key pública de Prisma Space.','info');}});
  $('#polli-connect')?.addEventListener('click',connectPollinations);
  $('#polli-disconnect')?.addEventListener('click',()=>{sessionStorage.removeItem('prisma-polli-token');sessionStorage.removeItem('prisma-polli-expiry');refreshPollinationsStatus();toast('Se borró la conexión de esta pestaña.','success');});
  $('#polli-copy-redirect')?.addEventListener('click',async()=>{await navigator.clipboard.writeText(location.origin+location.pathname);toast('URL de retorno copiada.','success');});
  refreshProviderConnectionStatuses();
}
async function refreshProviderConnectionStatuses(){
  const central=await getCentralProviderStatus();
  const connected={pollinations:!!getPollinationsToken(),huggingface:!!central.providers.huggingface,gemini:!!central.providers.gemini,groq:!!central.providers.groq};
  Object.entries(connected).forEach(([provider,isConnected])=>{
    const status=$('[data-connection-status="'+provider+'"]');
    if(status){
      status.textContent=provider==='pollinations'?(isConnected?'Conectado en esta pestaña':'Cuenta personal sin conectar'):!central.ok?'No se pudo consultar Cloudflare':isConnected?'Disponible para todos':'Pendiente de configurar';
      status.classList.toggle('connected',isConnected);
    }
    if(provider==='pollinations'){
      $('#polli-disconnect')?.classList.toggle('hidden',!isConnected);
      const openButton=$('#polli-connect-start');if(openButton)openButton.textContent=isConnected?'Conectar otra cuenta':'Conectar mi cuenta';
    }
  });
  const count=Object.values(connected).filter(Boolean).length;
  const summary=$('#connections-summary');if(summary)summary.textContent=count+' motor'+(count===1?'':'es')+' disponible'+(count===1?'':'s')+' para Prisma';
}
async function connectPollinations(){
  const input=$('#polli-app-key');
  const appKey=(input?.value||localStorage.getItem('prisma-polli-client-id')||POLLINATIONS_APP_KEY).trim();
  if(!appKey.startsWith('pk_')){
    const details=$('#provider-config-pollinations');if(details)details.open=true;
    input?.focus();toast('Añade la App Key pública de Prisma Space.','error');return;
  }
  localStorage.setItem('prisma-polli-client-id',appKey);
  const verifier=randomBase64Url(48),state=randomBase64Url(24);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const challenge=base64Url(digest),redirectUri=location.origin+location.pathname;
  sessionStorage.setItem('prisma-polli-verifier',verifier);sessionStorage.setItem('prisma-polli-state',state);
  const params=new URLSearchParams({response_type:'code',client_id:appKey,redirect_uri:redirectUri,state,code_challenge:challenge,code_challenge_method:'S256',models:'image,text,audio'});
  location.href='https://enter.pollinations.ai/authorize?'+params.toString();
}
async function finishPollinationsAuth(){
  const url=new URL(location.href),code=url.searchParams.get('code');
  if(!code){refreshPollinationsStatus();return;}
  try{
    const state=url.searchParams.get('state'),expected=sessionStorage.getItem('prisma-polli-state');
    if(!expected||state!==expected)throw Error('No se pudo validar la autorización. Intenta conectar de nuevo.');
    const verifier=sessionStorage.getItem('prisma-polli-verifier')||'',clientId=localStorage.getItem('prisma-polli-client-id')||'',redirectUri=location.origin+location.pathname;
    const response=await fetch('https://enter.pollinations.ai/api/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:clientId,redirect_uri:redirectUri,code_verifier:verifier})});
    const data=await response.json();
    if(!response.ok||!data.access_token)throw Error(data.error_description||data.error||'Pollinations no pudo completar la conexión.');
    sessionStorage.setItem('prisma-polli-token',data.access_token);
    sessionStorage.setItem('prisma-polli-expiry',String(Date.now()+Number(data.expires_in||604800)*1000));
    toast('Pollinations conectado. Tu presupuesto personal está activo.','success');
  }catch(error){toast(error.message||'No se pudo completar la conexión.','error');}
  finally{
    sessionStorage.removeItem('prisma-polli-verifier');sessionStorage.removeItem('prisma-polli-state');
    history.replaceState({},'',location.pathname);refreshPollinationsStatus();
  }
}
function setupPollinationsSettings(){
  renderProviderConnections();
  refreshPollinationsStatus();
}

const pollinationsModelCache={image:[],text:[],audio:[]};
const pollinationsPricingCache={image:[],text:[]};
const fallbackModels={
  image:[['black-forest-labs/flux.1-schnell','FLUX.1 Schnell · rápido'],['tongyi-mai/z-image-turbo','Z-Image Turbo · rápido']],
  text:[['openai/gpt-5.4-nano','GPT-5.4 Nano · rápido'],['deepseek/deepseek-v4-flash-0731','DeepSeek V4 Flash'],['qwen/qwen3-32b','Qwen 3 · general']],
  audio:[['openai/tts-1','TTS estándar'],['openai/tts-1-hd','TTS alta calidad'],['openai/whisper-1','Whisper · transcripción']]
};
function modelOptions(kind,provider){
  if(kind==='image'&&provider==='huggingface')return [['black-forest-labs/FLUX.1-schnell','FLUX.1 Schnell · rápido'],['Qwen/Qwen-Image','Qwen Image · detalle'],['black-forest-labs/FLUX.1-Krea-dev','FLUX.1 Krea · creativo']];
  return pollinationsModelCache[kind].length?pollinationsModelCache[kind]:fallbackModels[kind];
}
async function loadPollinationsModels(kind,provider='pollinations'){
  const select=$('#field-model');if(!select)return;
  const selected=select.value;
  const options=modelOptions(kind,provider);
  select.innerHTML=options.map(([value,label])=>'<option value="'+escapeHtml(value)+'">'+escapeHtml(label)+'</option>').join('');
  if(options.some(o=>o[0]===selected))select.value=selected;
  if(provider!=='pollinations'||pollinationsModelCache[kind].length)return;
  try{
    const response=await fetch('https://gen.pollinations.ai/'+kind+'/models');
    if(!response.ok)return;
    const raw=await response.json(),list=Array.isArray(raw)?raw:raw.models||raw.data||raw.items||[];
    const options=list.map(item=>{
      if(typeof item==='string')return [item,item];
      const id=item.id||item.model||item.name||item.slug;
      if(!id)return null;
      const label=item.name&&item.name!==id?item.name+' · '+id:id;
      return [id,label];
    }).filter(Boolean);
    if(!options.length)return;
    pollinationsModelCache[kind]=options;
    const current=$('#field-model');if(current){current.innerHTML=options.map(([v,l])=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(l)+'</option>').join('');if(options.some(o=>o[0]===selected))current.value=selected;}
  }catch(error){console.info('Catálogo de modelos Pollinations no disponible; se usan opciones de respaldo.',error);}
}
async function loadPollinationsPricing(kind='image'){
  if(pollinationsPricingCache[kind]?.length)return pollinationsPricingCache[kind];
  try{
    const response=await fetch('https://gen.pollinations.ai/'+kind+'/models',{cache:'no-store'});
    if(!response.ok)return [];
    const raw=await response.json(),list=Array.isArray(raw)?raw:raw.models||raw.data||raw.items||[];
    pollinationsPricingCache[kind]=list;
    return list;
  }catch(error){console.info('No se pudo consultar la tarifa en vivo de Pollinations.',error);return [];}
}
function providerNoticeText(provider,quality,task='image'){
  const connected={
    pollinations:!!getPollinationsToken(),
    huggingface:isProviderConnected('huggingface'),
    gemini:isProviderConnected('gemini'),
    groq:isProviderConnected('groq')
  };
  let selected=provider||'auto';
  if(selected==='auto'){
    const order=task==='image'?['pollinations','huggingface','gemini']:['groq','huggingface','gemini','pollinations'];
    selected=order.find(item=>connected[item])||'';
  }
  if(!selected)return 'No hay un motor conectado para esta tarea. Abre el Laboratorio IA y conecta una cuenta.';
  if(!connected[selected])return 'Este motor todavía no está conectado. Conéctalo desde el Laboratorio IA antes de generar.';
  const names={pollinations:'Pollinations Connect',huggingface:'Hugging Face',gemini:'Google Gemini',groq:'Groq'};
  if(selected==='pollinations'&&task==='image'){
    const models={fast:'tongyi-mai/z-image-turbo',balanced:'black-forest-labs/flux.1-schnell',high:'black-forest-labs/flux.1.1-pro'};
    const modelId=models[quality||'balanced'];
    const model=pollinationsPricingCache.image.find(item=>(item.name||item.id)===modelId);
    const price=model?.pricing?.completionImageTokens;
    if(price)return names[selected]+': '+(model.title||model.name)+'. Tarifa publicada: '+price+' Pollen por imagen. El texto adicional se cobra según los tokens utilizados. Puedes limitar el presupuesto al autorizar la cuenta.';
    return names[selected]+': el consumo se descuenta de tu saldo Pollen. El precio exacto se consulta en el catálogo actualizado del proveedor.';
  }
  if(selected==='pollinations')return names[selected]+': el texto consume Pollen según los tokens de entrada y salida. Tu autorización limita el presupuesto total.';
  if(selected==='huggingface')return names[selected]+': el consumo depende del modelo y del proveedor de inferencia seleccionado. Consulta sus tarifas y tu consumo en Hugging Face.';
  if(selected==='gemini')return names[selected]+': el consumo depende del modelo y de la resolución solicitada. Consulta la facturación de tu proyecto de Google AI Studio.';
  return names[selected]+': consulta los límites y el consumo de tu plan en Groq antes de generar.';
}
function updateProviderNotice(target,task='image'){
  const notice=$(target);if(!notice)return;
  const provider=$('#field-provider')?.value||'auto';
  const quality=$('#field-qualityProfile')?.value||'balanced';
  notice.textContent=providerNoticeText(provider,quality,task);
}
function setupAIAuthorization(tool){
  refreshProviderConnectionStatuses();
  const provider=$('#field-provider'),quality=$('#field-qualityProfile');
  const update=()=>updateProviderNotice('#tool-provider-notice',tool.id==='image-gen'?'image':'text');
  provider?.addEventListener('change',update);quality?.addEventListener('change',update);
  $('#open-ai-settings')?.addEventListener('click',()=>{
    closeTool();showView('ai');
    $('#ai-connection-card')?.scrollIntoView({behavior:'smooth',block:'center'});
  });
  if(tool.id==='image-gen')void loadPollinationsPricing('image').then(update);
  update();
}

function openTool(t){
  lastFocusedElement=document.activeElement;lastOpenedToolId=t.id;recordRecentTool(t.id);
  currentTool=t;currentWorkflow=null;selectedFiles=[];running=false;
  $('#modal-title').textContent=t.name;$('#modal-kicker').textContent=categories.find(c=>c.id===t.category)?.name.toUpperCase()||'HERRAMIENTA';
  $('#modal-icon').innerHTML=icon(t.icon);
  let html='<p class="modal-description">'+t.description+'</p>';
  if(t.file){
    const privacy=t.mode==='byok'?'El contenido se envía al proveedor de IA con tu token personal.':'El archivo se procesa en tu navegador; no se sube a Prisma Space.';
    html+='<label class="file-drop" id="file-drop"><input id="file-input" type="file" '+(t.multiple?'multiple':'')+' accept="'+(t.accept||'*/*')+'"><span class="file-drop-icon">'+icon('upload')+'</span><strong>Arrastra y suelta tus archivos aquí</strong><p>o haz clic para seleccionar desde tu dispositivo</p><small class="file-drop-note">'+(t.multiple?'Puedes añadir varios archivos. ':'')+privacy+'</small><span class="file-drop-formats">Formatos admitidos: '+escapeHtml(t.accept||'cualquier archivo')+'</span></label><div class="file-list" id="file-list"></div>';
  }
  html+=buildFields(t);
  html+='<div class="progress-wrap hidden" id="progress-wrap"><div class="progress-label"><span id="progress-message">Preparando...</span><span id="progress-value">0%</span></div><div class="progress-track"><div class="progress-bar" id="progress-bar"></div></div></div><div id="tool-output" aria-live="polite"></div>';
  $('#modal-body').innerHTML=html;
  $('#tool-modal').classList.remove('hidden');
  $('#tool-modal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  $('#modal-run').classList.toggle('hidden',t.status==='soon');
  $('#modal-run').disabled=false;
  $('#modal-run').innerHTML=icon('play')+' Ejecutar herramienta';
  if(t.file){
    const drop=$('#file-drop'),input=$('#file-input');
    input.addEventListener('change',()=>{addSelectedFiles([...input.files],t);input.value='';});
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover');});
    drop.addEventListener('dragleave',e=>{if(!drop.contains(e.relatedTarget))drop.classList.remove('dragover');});
    drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');addSelectedFiles([...e.dataTransfer.files],t);});
    $('#file-list').addEventListener('click',e=>{const remove=e.target.closest('[data-remove-file]');if(remove){selectedFiles.splice(Number(remove.dataset.removeFile),1);renderFileList();return;}if(e.target.closest('[data-clear-files]')){selectedFiles=[];renderFileList();}});
  }
  if(['image-gen','ai-assistant','ai-voice','ai-transcribe'].includes(t.id))setupAIAuthorization(t);
  if(t.id==='api-explorer')setupApiExplorer();
  if(t.id==='units')$('#field-kind').addEventListener('change',updateUnitOptions);
  if(t.id==='timestamp')$('#field-mode').addEventListener('change',updateTimestampField);
  $('#modal-close').focus({preventScroll:true});
}
function buildWorkflowFields(workflow){
  if(workflow.id==='image-pipeline'){
    return '<div class="workflow-options">'+
      '<label class="workflow-check"><input type="checkbox" name="removeBg" checked><span><strong>Quitar fondo</strong><small>Usa el motor local de IA cuando está disponible.</small></span></label>'+
      '<label class="workflow-check"><input type="checkbox" name="resize" checked><span><strong>Ajustar dimensiones</strong><small>Mantiene la proporción de la imagen original.</small></span></label>'+
      '<label class="workflow-check"><input type="checkbox" name="compress" checked><span><strong>Comprimir resultado</strong><small>WebP conserva transparencia y reduce el peso.</small></span></label>'+
      '<label class="workflow-check"><input type="checkbox" name="addWatermark"><span><strong>Añadir marca de agua</strong><small>Opcional: identifica tu creación.</small></span></label>'+
    '</div><div class="inline-fields">'+field('Ancho máximo (px)','width','number','1200','','min="128" max="5000"')+
      field('Alto máximo (px)','height','number','1200','','min="128" max="5000"')+
      field('Calidad (%)','quality','number','82','Entre 10 y 100.','min="10" max="100"')+
      selectField('Formato final','format',[['image/webp','WebP · recomendado'],['image/jpeg','JPG']],'image/webp')+
    '</div>'+field('Texto de marca de agua','watermark','text','Prisma Space')+
      selectField('Ubicación de marca','watermarkPosition',[['bottom-right','Abajo a la derecha'],['bottom-left','Abajo a la izquierda'],['top-right','Arriba a la derecha'],['top-left','Arriba a la izquierda'],['center','Centro']],'bottom-right')+
      '<div class="tool-hint">Los archivos se procesan en tu navegador. Si activas quitar fondo, la primera ejecución puede descargar el modelo de IA.</div>';
  }
  if(workflow.id==='document-pipeline'){
    return '<div class="workflow-options">'+
      '<label class="workflow-check"><input type="checkbox" name="merge" checked><span><strong>Combinar varios PDF</strong><small>Si seleccionas más de uno, los une en un único documento.</small></span></label>'+
      '<label class="workflow-check"><input type="checkbox" name="numberPages" checked><span><strong>Numerar páginas</strong><small>Agrega numeración consecutiva al PDF final.</small></span></label>'+
      '<label class="workflow-check"><input type="checkbox" name="extractText" checked><span><strong>Extraer texto disponible</strong><small>Genera un TXT adicional cuando el PDF permite seleccionar texto.</small></span></label>'+
    '</div>'+selectField('Ubicación de la numeración','position',[['bottom','Parte inferior'],['top','Parte superior']],'bottom')+
      '<div class="tool-hint">Los PDF se procesan localmente. Los documentos escaneados necesitan OCR; si no contienen texto seleccionable, se conserva el PDF y se informa.</div>';
  }
  if(workflow.id==='ai-task'){
    return selectField('Qué necesitas hacer','task',[['write','Redactar algo'],['summarize','Resumir información'],['explain','Explicar un tema'],['translate','Traducir un texto'],['ideas','Generar ideas'],['improve','Mejorar un texto']],'write')+
      textareaField('Cuéntanos qué necesitas','prompt','','Escribe la tarea con tus propias palabras. No necesitas conocer modelos ni proveedores.')+
      textareaField('Contexto o contenido (opcional)','context','','Pega el texto, añade contexto o indica el público al que va dirigido.')+
      selectField('Estilo de respuesta','tone',[['professional','Profesional'],['friendly','Cercano'],['creative','Creativo'],['academic','Académico'],['concise','Breve y directo']],'professional')+
      selectField('Nivel de detalle','length',[['short','Breve'],['medium','Equilibrado'],['long','Detallado']],'medium')+
      '<div class="tool-hint">Prisma seleccionará automáticamente un motor conectado. Tus credenciales se configuran una sola vez en el Laboratorio IA.</div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
  }
  if(workflow.id==='ai-creation'){
    return selectField('Motor para imágenes','provider',[['auto','Automático · recomendado'],['pollinations','Pollinations · tu saldo autorizado'],['huggingface','Hugging Face · tu cuenta'],['gemini','Google Gemini · tu cuenta']],'auto','Prisma solo utilizará las cuentas que hayas conectado.')+
      selectField('Calidad de generación','qualityProfile',[['fast','Más rápido'],['balanced','Equilibrado'],['high','Mayor detalle']],'balanced')+
      selectField('Motor para el texto','textProvider',[['auto','Automático · recomendado'],['pollinations','Pollinations'],['huggingface','Hugging Face'],['groq','Groq'],['gemini','Google Gemini']],'auto')+      '<div class="tool-hint workflow-provider-notice" id="workflow-provider-notice"></div><div class="tool-hint workflow-provider-notice" id="workflow-text-notice"></div>'+
      '<div class="prompt-examples"><span>Ideas para empezar</span><button type="button" class="mini-button prompt-example" data-prompt-example="Fotografía publicitaria premium de un perfume minimalista sobre una superficie de piedra, iluminación de estudio suave y fondo elegante.">Producto premium</button><button type="button" class="mini-button prompt-example" data-prompt-example="Una ciudad futurista bajo la lluvia al anochecer, luces cinematográficas, reflejos detallados y atmósfera épica.">Escena cinematográfica</button><button type="button" class="mini-button prompt-example" data-prompt-example="Ilustración editorial moderna sobre creatividad e inteligencia artificial, composición limpia y colores armónicos.">Ilustración editorial</button><button type="button" class="mini-button prompt-example" data-prompt-example="Miniatura de YouTube con alto contraste, sujeto principal expresivo, composición clara y espacio visual para un título corto.">Miniatura YouTube</button></div>'+

      textareaField('Cuéntanos qué quieres crear','prompt','','Describe el sujeto, el ambiente, el propósito y el estilo. Prisma se encarga de preparar el prompt visual.')+
      selectField('Estilo visual','style',[['photo','Fotografía realista'],['cinematic','Cinematográfico'],['illustration','Ilustración editorial'],['3d','Render 3D'],['anime','Anime'],['product','Fotografía de producto']],'photo')+
      selectField('Composición','ratio',[['square','Cuadrada · 1:1'],['landscape','Horizontal · 4:3'],['portrait','Vertical · 3:4'],['wide','Panorámica · 16:9']],'square')+
      textareaField('Elementos que quieres evitar (opcional)','negativePrompt','','Ejemplo: texto ilegible, marcas de agua ajenas, manos deformes.')+
      '<div class="workflow-options">'+
      '<label class="workflow-check"><input type="checkbox" name="resize" checked><span><strong>Ajustar imagen final</strong><small>Prepara una dimensión equilibrada para compartir.</small></span></label>'+
      '<label class="workflow-check"><input type="checkbox" name="compress" checked><span><strong>Optimizar tamaño</strong><small>Exporta una versión WebP más ligera.</small></span></label>'+
      '<label class="workflow-check"><input type="checkbox" name="addWatermark"><span><strong>Añadir marca de agua</strong><small>Opcional: añade Prisma Space a la imagen.</small></span></label>'+
      '</div><div class="inline-fields">'+field('Ancho máximo (px)','width','number','1200','','min="128" max="5000"')+
      field('Alto máximo (px)','height','number','1200','','min="128" max="5000"')+
      field('Calidad (%)','quality','number','86','Entre 10 y 100.','min="10" max="100"')+
      selectField('Formato final','format',[['image/webp','WebP · recomendado'],['image/jpeg','JPG']],'image/webp')+
      '</div>'+field('Texto de marca de agua','watermark','text','Prisma Space')+
      selectField('Ubicación de marca','watermarkPosition',[['bottom-right','Abajo a la derecha'],['bottom-left','Abajo a la izquierda'],['top-right','Arriba a la derecha'],['top-left','Arriba a la izquierda'],['center','Centro']],'bottom-right')+
      '<label class="workflow-check"><input type="checkbox" name="allowFallback"><span><strong>Permitir cambio automático si falla el motor</strong><small>Prisma podrá probar otra cuenta conectada. Cada proveedor aplica sus propias condiciones de uso.</small></span></label><div class="tool-hint">Gestiona tus conexiones desde el Laboratorio IA. No tienes que pegar claves en cada creación.</div><button type="button" class="mini-button" id="open-ai-settings">Gestionar conexiones</button>';
  }
  return '';
}

function setupWorkflowAI(){
  refreshProviderConnectionStatuses();
  const provider=$('#field-provider'),quality=$('#field-qualityProfile'),textProvider=$('#field-textProvider');
  const update=()=>{
    updateProviderNotice('#workflow-provider-notice','image');
    const textNotice=$('#workflow-text-notice');
    if(textNotice)textNotice.textContent=providerNoticeText(textProvider?.value||'auto','balanced','text');
  };
  provider?.addEventListener('change',update);quality?.addEventListener('change',update);textProvider?.addEventListener('change',update);
  $$('.prompt-example').forEach(button=>button.addEventListener('click',()=>{
    const prompt=$('#field-prompt');if(prompt){prompt.value=button.dataset.promptExample||'';prompt.focus();}
  }));
  $('#open-ai-settings')?.addEventListener('click',()=>{
    closeTool();showView('ai');
    $('#ai-connection-card')?.scrollIntoView({behavior:'smooth',block:'center'});
  });
  void loadPollinationsPricing('image').then(update);
  update();
}
function openWorkflow(workflow){
  if(!workflow)return;
  lastFocusedElement=document.activeElement;lastOpenedToolId=null;
  currentTool=null;currentWorkflow=workflow;selectedFiles=[];running=false;
  $('#modal-title').textContent=workflow.name;$('#modal-kicker').textContent='FLUJOS INTELIGENTES';$('#modal-icon').innerHTML=icon(workflow.icon);
  let html='<p class="modal-description">'+escapeHtml(workflow.description)+'</p>';
  if(workflow.file){
    html+='<label class="file-drop" id="file-drop"><input id="file-input" type="file" '+(workflow.multiple?'multiple':'')+' accept="'+(workflow.accept||'*/*')+'"><span class="file-drop-icon">'+icon('upload')+'</span><strong>Arrastra tus archivos aquí</strong><p>o haz clic para seleccionarlos desde tu dispositivo</p><small class="file-drop-note">'+(workflow.multiple?'Puedes añadir varios archivos. ':'')+'Se procesan localmente en tu navegador.</small><span class="file-drop-formats">Formatos admitidos: '+escapeHtml(workflow.accept||'cualquier archivo')+'</span></label><div class="file-list" id="file-list"></div>';
  }
  html+=buildWorkflowFields(workflow);
  html+='<div class="progress-wrap hidden" id="progress-wrap"><div class="progress-label"><span id="progress-message">Preparando...</span><span id="progress-value">0%</span></div><div class="progress-track"><div class="progress-bar" id="progress-bar"></div></div></div><div id="tool-output" aria-live="polite"></div>';
  $('#modal-body').innerHTML=html;$('#tool-modal').classList.remove('hidden');$('#tool-modal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  $('#modal-run').classList.remove('hidden');$('#modal-run').disabled=false;$('#modal-run').innerHTML=icon('play')+' Ejecutar flujo completo';
  if(workflow.file){
    const drop=$('#file-drop'),input=$('#file-input');
    input.addEventListener('change',()=>{addSelectedFiles([...input.files],workflow);input.value='';});
    drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragover');});
    drop.addEventListener('dragleave',event=>{if(!drop.contains(event.relatedTarget))drop.classList.remove('dragover');});
    drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragover');addSelectedFiles([...event.dataTransfer.files],workflow);});
    $('#file-list').addEventListener('click',event=>{
      const remove=event.target.closest('[data-remove-file]');
      if(remove){selectedFiles.splice(Number(remove.dataset.removeFile),1);renderFileList();return;}
      if(event.target.closest('[data-clear-files]')){selectedFiles=[];renderFileList();}
    });
  }
  if(workflow.id==='ai-creation')setupWorkflowAI();
  $('#modal-close').focus({preventScroll:true});
}
function updateUnitOptions(){
  const kind=$('#field-kind').value;
  const sets={length:[['m','Metros'],['km','Kilómetros'],['cm','Centímetros'],['mm','Milímetros'],['mi','Millas'],['ft','Pies'],['in','Pulgadas'],['yd','Yardas']],mass:[['kg','Kilogramos'],['g','Gramos'],['mg','Miligramos'],['lb','Libras'],['oz','Onzas'],['t','Toneladas']],area:[['m2','m²'],['km2','km²'],['cm2','cm²'],['ha','Hectáreas'],['acre','Acres'],['ft2','Pies²']],volume:[['l','Litros'],['ml','Mililitros'],['m3','m³'],['gal','Galones US'],['cup','Tazas US']],speed:[['ms','m/s'],['kmh','km/h'],['mph','mph'],['kn','Nudos']],data:[['B','Bytes'],['KB','Kilobytes'],['MB','Megabytes'],['GB','Gigabytes'],['TB','Terabytes']],temperature:[['C','Celsius'],['F','Fahrenheit'],['K','Kelvin']]};
  const opts=sets[kind];['from','to'].forEach((name,i)=>{$('#field-'+name).innerHTML=opts.map(o=>'<option value="'+o[0]+'">'+o[1]+'</option>').join('');$('#field-'+name).value=kind==='length'?(i?'km':'m'):kind==='mass'?(i?'g':'kg'):(i?'F':'C');});
}
function updateTimestampField(){
  const mode=$('#field-mode').value;
  $('#field-value').value=mode==='unix-to-date'?'1762550400':new Date().toISOString().slice(0,16);
}
function addSelectedFiles(incoming,tool){
  const allowed=incoming.filter(file=>acceptsFile(file,tool.accept||'*/*'));
  if(allowed.length!==incoming.length)toast('Algunos archivos no tienen un formato admitido.','error');
  const next=tool.multiple?[...selectedFiles,...allowed]:allowed.slice(0,1);
  const max=tool.multiple?(tool.maxFiles||20):1;
  const limited=next.slice(0,max);
  const total=limited.reduce((sum,file)=>sum+file.size,0);
  if(total>200*1024*1024){toast('El conjunto supera el límite de 200 MB para procesamiento en navegador.','error');return;}
  if(next.length>max)toast('Esta herramienta admite hasta '+max+' archivos.','info');
  selectedFiles=limited;renderFileList();
}
function acceptsFile(file,accept){
  const rules=String(accept||'*/*').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!rules.length||rules.includes('*/*'))return true;
  const name=file.name.toLowerCase(),type=(file.type||'').toLowerCase();
  return rules.some(rule=>rule.startsWith('.')?name.endsWith(rule):rule.endsWith('/*')?type.startsWith(rule.slice(0,-1)):type===rule);
}
function renderFileList(){
  const list=$('#file-list');if(!list)return;
  if(!selectedFiles.length){list.innerHTML='';return;}
  const total=selectedFiles.reduce((sum,file)=>sum+file.size,0);
  list.innerHTML='<div class="upload-list-head"><strong>'+selectedFiles.length+' archivo'+(selectedFiles.length===1?'':'s')+'</strong><span>'+formatBytes(total)+' en total</span><button type="button" data-clear-files>Vaciar</button></div>'+selectedFiles.map((f,i)=>'<div class="file-row">'+icon('file-text')+'<span title="'+escapeHtml(f.name)+'">'+escapeHtml(f.name)+'</span><small>'+formatBytes(f.size)+'</small><button class="remove-file" type="button" data-remove-file="'+i+'" aria-label="Quitar '+escapeHtml(f.name)+'">'+icon('x')+'</button></div>').join('');
}
function formatBytes(bytes){if(!bytes)return '0 B';const u=['B','KB','MB','GB'];const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3);return (bytes/Math.pow(1024,i)).toFixed(i?1:0)+' '+u[i];}
async function attachProviderCredentials(params){
  const central=await getCentralProviderStatus();
  params.polliToken=getPollinationsToken();
  params.hfToken='';
  params.geminiKey='';
  params.groqKey='';
  params.centralProviders=central.providers||{gemini:false,huggingface:false,groq:false};
  return params;
}
function readParams(){
  const params={};
  $$('#modal-body [name]').forEach(el=>{if(el.type==='checkbox')params[el.name]=el.checked;else params[el.name]=el.value;});
  return params;
}
function updateProgress(progress,message){
  const wrap=$('#progress-wrap');if(!wrap)return;wrap.classList.remove('hidden');
  const pct=Math.max(0,Math.min(100,Math.round((progress||0)*100)));
  $('#progress-bar').style.width=pct+'%';$('#progress-value').textContent=pct+'%';$('#progress-message').textContent=message||'Procesando...';
}
async function executeCurrentWorkflow(){
  if(!currentWorkflow||running)return;
  if(currentWorkflow.file&&!selectedFiles.length){toast('Selecciona al menos un archivo.','error');return;}
  const operationId=++activeOperation,workflowAtStart=currentWorkflow,filesAtStart=[...selectedFiles];
  const progressForWorkflow=(progress,message)=>{if(operationId===activeOperation&&currentWorkflow===workflowAtStart)updateProgress(progress,message);};
  running=true;$('#modal-body').setAttribute('aria-busy','true');$('#modal-run').disabled=true;$('#modal-run').textContent='Ejecutando flujo...';$('#tool-output').innerHTML='';updateProgress(.02,'Preparando flujo inteligente...');
  try{
    const params=await attachProviderCredentials(readParams());
    const result=await runWorkflow(workflowAtStart.id,filesAtStart,params,progressForWorkflow);
    if(operationId!==activeOperation||currentWorkflow!==workflowAtStart||$('#tool-modal').classList.contains('hidden'))return;
    if($('#field-hfToken'))$('#field-hfToken').value='';
    renderWorkflowOutput(result);updateProgress(1,'Flujo completado');toast('Flujo completado correctamente.','success');
  }catch(error){
    if(operationId!==activeOperation||currentWorkflow!==workflowAtStart||$('#tool-modal').classList.contains('hidden'))return;
    console.error(error);$('#tool-output').innerHTML='<div class="tool-hint"><strong>No se pudo completar el flujo.</strong><br>'+escapeHtml(error?.message||'Ocurrió un error inesperado.')+'</div>';
    toast(error?.message||'No se pudo completar el flujo.','error');
  }finally{
    if(operationId!==activeOperation||currentWorkflow!==workflowAtStart)return;
    if($('#field-hfToken'))$('#field-hfToken').value='';
    running=false;$('#modal-body').setAttribute('aria-busy','false');$('#modal-run').disabled=false;$('#modal-run').innerHTML=icon('play')+' Ejecutar flujo completo';
  }
}

function renderWorkflowOutput(result){
  const panel=document.createElement('div');panel.className='output-panel workflow-result-panel';
  const heading=document.createElement('div');heading.className='output-head';
  const headingText=document.createElement('strong');headingText.textContent='✓ Flujo completado';heading.append(headingText);panel.append(heading);
  if(result.steps?.length){
    const list=document.createElement('ol');list.className='workflow-result-steps';
    result.steps.forEach(step=>{const item=document.createElement('li');item.textContent=step;list.append(item);});panel.append(list);
  }
  if(result.summary){const summary=document.createElement('p');summary.className='tool-hint workflow-summary';summary.textContent=result.summary;panel.append(summary);}
  (result.artifacts||[]).forEach(artifact=>{
    const row=document.createElement('div');row.className='workflow-artifact';
    const copy=document.createElement('div');copy.className='workflow-artifact-copy';
    const name=document.createElement('strong');name.textContent=artifact.name||artifact.filename||'Archivo generado';
    const filename=document.createElement('small');filename.textContent=artifact.filename||'Archivo listo';copy.append(name,filename);row.append(copy);
    const actions=document.createElement('div');actions.className='workflow-artifact-actions';
    if(artifact.text){const copyButton=document.createElement('button');copyButton.type='button';copyButton.className='mini-button';copyButton.textContent='Copiar texto';copyButton.addEventListener('click',async()=>{await navigator.clipboard.writeText(artifact.text);toast('Texto copiado.','success');});actions.append(copyButton);}
    if(artifact.blob){const downloadButton=document.createElement('button');downloadButton.type='button';downloadButton.className='mini-button';downloadButton.innerHTML=icon('download')+' Descargar';downloadButton.addEventListener('click',()=>downloadBlob(artifact.blob,artifact.filename||'prisma-resultado'));actions.append(downloadButton);}
    row.append(actions);panel.append(row);
    if(artifact.previewUrl&&String(artifact.type||artifact.blob?.type||'').startsWith('image/')){const preview=document.createElement('img');preview.className='output-preview workflow-preview';preview.src=artifact.previewUrl;preview.alt=artifact.name||'Vista previa del resultado';panel.append(preview);}
    if(artifact.text){const preview=document.createElement('pre');preview.className='output-text workflow-text-preview';preview.textContent=artifact.text.slice(0,5000);panel.append(preview);}
  });
  $('#tool-output').append(panel);
}

async function executeCurrentTool(){
  if(currentWorkflow)return executeCurrentWorkflow();
  if(!currentTool||running)return;
  if(currentTool.file&&!selectedFiles.length){toast('Selecciona al menos un archivo.','error');return;}
  const operationId=++activeOperation,toolAtStart=currentTool,filesAtStart=[...selectedFiles];
  const progressForOperation=(progress,message)=>{if(operationId===activeOperation&&currentTool===toolAtStart)updateProgress(progress,message);};
  running=true;$('#modal-body').setAttribute('aria-busy','true');$('#modal-run').disabled=true;$('#modal-run').textContent='Procesando...';$('#tool-output').innerHTML='';
  updateProgress(.02,'Preparando herramienta...');
  try{
    const params=await attachProviderCredentials(readParams());
    const result=await runTool(toolAtStart.id,filesAtStart,params,progressForOperation);
    if(operationId!==activeOperation||currentTool!==toolAtStart||$('#tool-modal').classList.contains('hidden'))return;
    recordRecentTool(toolAtStart.id);
    if($('#field-hfToken'))$('#field-hfToken').value='';
    if(result?.blob){if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=result.previewUrl&&result.previewUrl.startsWith('blob:')?result.previewUrl:URL.createObjectURL(result.blob);if(!result.previewUrl)result.previewUrl=outputUrl;}
    renderOutput(result);updateProgress(1,'Proceso completado');toast('La operación terminó correctamente.','success');
  }catch(error){
    if(operationId!==activeOperation||currentTool!==toolAtStart||$('#tool-modal').classList.contains('hidden'))return;
    console.error(error);
    $('#tool-output').innerHTML='<div class="tool-hint"><strong>No se pudo completar la operación.</strong><br>'+escapeHtml(error?.message||'Error inesperado. Prueba con otro archivo o vuelve a intentarlo.')+'</div>';
    toast(error?.message||'Ocurrió un error.','error');
  }finally{
    if(operationId!==activeOperation||currentTool!==toolAtStart)return;
    if($('#field-hfToken'))$('#field-hfToken').value='';
    running=false;$('#modal-body').setAttribute('aria-busy','false');$('#modal-run').disabled=false;$('#modal-run').innerHTML=icon('play')+' Ejecutar herramienta';
  }
}

function renderOutput(result){
  const panel=document.createElement('div');panel.className='output-panel';
  let html='<div class="output-head"><strong>✓ Resultado listo</strong><div class="output-actions">';
  if(result.blob)html+='<button class="mini-button" id="download-output">'+icon('download')+' Descargar</button>';
  if(result.text)html+='<button class="mini-button" id="copy-output">'+icon('copy')+' Copiar</button>';
  html+='</div></div>';
  if(result.previewUrl&&!result.audio)html+='<img class="output-preview" src="'+result.previewUrl+'" alt="Vista previa del resultado">';
  if(result.audio&&result.previewUrl)html+='<audio class="output-audio" controls src="'+result.previewUrl+'"></audio>';
  if(result.printHtml)html+='<button class="mini-button" id="print-output">Abrir vista para guardar como PDF</button>';
  if(result.text)html+='<pre class="output-text" id="output-text">'+escapeHtml(result.text)+'</pre>';
  if(result.html)html+='<pre class="output-text">'+escapeHtml(result.html)+'</pre>';
  if(result.colors?.length)html+='<div class="color-palette-results">'+result.colors.map(color=>'<button class="color-swatch" type="button" data-color="'+escapeHtml(color)+'" title="Copiar '+escapeHtml(color)+'"><span style="background:'+escapeHtml(color)+'"></span><code>'+escapeHtml(color)+'</code></button>').join('')+'</div>';
  if(result.summary)html+='<p class="tool-hint" style="margin:10px 0 0">'+escapeHtml(result.summary)+'</p>';
  panel.innerHTML=html;$('#tool-output').append(panel);
  if(result.blob)$('#download-output').addEventListener('click',()=>downloadBlob(result.blob,result.filename||'prisma-result'));
  if(result.printHtml)$('#print-output').addEventListener('click',()=>{const win=window.open('','_blank');if(!win){toast('Permite las ventanas emergentes para imprimir el documento.','error');return;}win.document.open();win.document.write(result.printHtml);win.document.close();win.addEventListener('load',()=>win.print());});
  if(result.text)$('#copy-output').addEventListener('click',async()=>{await navigator.clipboard.writeText(result.text);toast('Texto copiado.');});
  $$('.color-swatch',panel).forEach(b=>b.addEventListener('click',async()=>{await navigator.clipboard.writeText(b.dataset.color);toast(b.dataset.color+' copiado.');}));
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function closeTool(){
  const modal=$('#tool-modal');
  if(!modal||modal.classList.contains('hidden'))return;
  if($('#field-hfToken'))$('#field-hfToken').value='';
  if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl=null;}
  $('#modal-body').innerHTML='';$('#modal-body').setAttribute('aria-busy','false');
  modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
  currentTool=null;currentWorkflow=null;selectedFiles=[];activeOperation++;running=false;
  if(activeView==='recent')render();
  const target=lastFocusedElement?.isConnected?lastFocusedElement:
    $('#tool-grid [data-tool="'+lastOpenedToolId+'"] .tool-card-launch')||
    $('#home-recent [data-open-tool="'+lastOpenedToolId+'"]')||
    $('#home-popular [data-open-tool="'+lastOpenedToolId+'"]');
  lastFocusedElement=null;
  requestAnimationFrame(()=>target?.focus?.({preventScroll:true}));
}
function closeSidebar(){
  $('#sidebar').classList.remove('open');
  $('#mobile-menu').setAttribute('aria-expanded','false');
}
function scrollToCurrentView(){
  const target=activeView==='core'?$('#core-section'):activeView==='ai'?$('#ai-section'):
    activeView==='explore'&&activeCategory==='all'&&!searchTerm?$('#home-dashboard'):$('#tools-section');
  if(!target)return;
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
}
function showView(view){
  activeView=view;activeCategory='all';searchTerm='';$('#global-search').value='';
  render();closeSidebar();scrollToCurrentView();
}

function setupHeroInteraction(){
  const art=$('.hero-art');
  const core=art&&$('.prism-core',art);
  if(!art||!core||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let frame=0;
  const reset=()=>{
    art.classList.remove('is-hovered');
    core.style.transform='';
    const glow=$('.prism-glow',art);
    glow.style.setProperty('--glow-x','0px');
    glow.style.setProperty('--glow-y','0px');
    $$('.art-tag',art).forEach(tag=>{tag.style.transform='';});
  };
  art.addEventListener('pointermove',event=>{
    if(event.pointerType&&event.pointerType!=='mouse')return;
    const rect=art.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width-.5;
    const y=(event.clientY-rect.top)/rect.height-.5;
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      art.classList.add('is-hovered');
      core.style.transform=`translate3d(${(x*12).toFixed(1)}px,${(y*9).toFixed(1)}px,0) rotateX(${(-y*5).toFixed(2)}deg) rotateY(${(x*7).toFixed(2)}deg)`;
      const glow=$('.prism-glow',art);
      glow.style.setProperty('--glow-x',`${(x*18).toFixed(1)}px`);
      glow.style.setProperty('--glow-y',`${(y*12).toFixed(1)}px`);
      $$('.art-tag',art).forEach((tag,index)=>{
        const strength=[-.22,.28,-.16][index]??.2;
        tag.style.transform=`translate3d(${(x*14*strength).toFixed(1)}px,${(y*10*strength).toFixed(1)}px,0)`;
      });
    });
  });
  art.addEventListener('pointerleave',()=>{
    if(frame)cancelAnimationFrame(frame);
    reset();
  });
}

// Startup is fault-isolated: one optional module must never disable the entire interface.
function safeStartup(label,callback){
  try{callback();return true;}
  catch(error){
    console.error('[Prisma startup] '+label,error);
    const region=$('#toast-region');
    if(region){const notice=document.createElement('div');notice.className='toast error';notice.textContent='Un módulo de Prisma no pudo inicializarse ('+label+'). El resto de la página sigue disponible.';region.append(notice);}
    return false;
  }
}
safeStartup('categorías',renderCategories);
safeStartup('proveedores',renderProviders);
safeStartup('interfaz',render);
safeStartup('interacción visual',setupHeroInteraction);
safeStartup('menú de perfil',setupProfileMenu);
safeStartup('panel principal',setupHomeDashboard);
safeStartup('búsqueda móvil',setupMobileSearch);
safeStartup('conexiones',setupPollinationsSettings);
void finishPollinationsAuth().catch(error=>console.warn('[Prisma auth] No se pudo completar la autorización:',error));
$$('[data-workflow]').forEach(button=>button.addEventListener('click',()=>openWorkflow(workflows.find(workflow=>workflow.id===button.dataset.workflow))));
$('#open-image-gen')?.addEventListener('click',()=>{const tool=tools.find(t=>t.id==='image-gen');if(tool)openTool(tool);});
$('#open-image-gen-hero')?.addEventListener('click',()=>{const tool=tools.find(t=>t.id==='image-gen');if(tool)openTool(tool);});
$('#open-ai-assistant')?.addEventListener('click',()=>{const tool=tools.find(t=>t.id==='ai-assistant');if(tool)openTool(tool);});
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$$('[data-view-jump]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.viewJump)));
$('#global-search').addEventListener('input',e=>{const wasEmpty=!searchTerm.trim();searchTerm=e.target.value;activeView='explore';activeCategory='all';render();if((wasEmpty&&searchTerm.trim())||!searchTerm.trim())scrollToCurrentView();});
$('#theme-toggle').addEventListener('click',()=>{const root=document.documentElement;const next=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=next;$('#theme-toggle').innerHTML=icon(next==='dark'?'sun':'moon');localStorage.setItem('prisma-theme',next);});
const savedTheme=localStorage.getItem('prisma-theme');if(savedTheme){document.documentElement.dataset.theme=savedTheme;$('#theme-toggle').innerHTML=icon(savedTheme==='dark'?'sun':'moon');}
$('#explore-tools').addEventListener('click',()=>$('#tools-section').scrollIntoView({behavior:'smooth'}));
$('#clear-search').addEventListener('click',()=>{$('#global-search').value='';searchTerm='';activeView='explore';activeCategory='all';render();scrollToCurrentView();});
document.addEventListener('click',event=>{
  const closeButton=event.target.closest?.('#modal-close, #modal-cancel');
  if(closeButton){event.preventDefault();closeTool();return;}
  if(event.target===$('#tool-modal'))closeTool();
},true);
$('#modal-run').addEventListener('click',executeCurrentTool);
$('#mobile-menu').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#mobile-menu').setAttribute('aria-expanded',String(open));});
$('#about-button').addEventListener('click',()=>toast('Prisma Space 1.0 · Herramientas locales y motores IA intercambiables.','info'));

$$('[data-layout]').forEach(b=>b.addEventListener('click',()=>{layout=b.dataset.layout;$$('[data-layout]').forEach(x=>x.classList.toggle('active',x===b));safeStartup('cambio de vista',render);}));
safeStartup('Prisma Core',initPrismaCore);
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#global-search').focus();}
  if(event.key==='Escape'){closeProfileMenu();if(!$('#tool-modal').classList.contains('hidden'))closeTool();else if($('#sidebar').classList.contains('open'))closeSidebar();}
  if(event.key==='Tab'&&!$('#tool-modal').classList.contains('hidden')){
    const focusable=Array.from($('#tool-modal').querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')).filter(element=>!element.classList.contains('hidden')&&element.getAttribute('aria-hidden')!=='true'&&element.offsetParent!==null);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
