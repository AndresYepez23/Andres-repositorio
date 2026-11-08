import { categories, tools, statusLabels } from './registry.js';
import { providers } from './providers.js';
import { runTool } from './engines.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const iconPaths = {
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
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(iconPaths[name]||iconPaths.grid)+'</svg>';}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const favorites = new Set(JSON.parse(localStorage.getItem('prisma-favorites')||'[]'));
let activeCategory='all', activeView='explore', searchTerm='', layout='grid', currentTool=null, selectedFiles=[], running=false, outputUrl=null;

function renderCategories(){
  const nav=$('#category-nav');
  nav.innerHTML=categories.filter(c=>c.id!=='all').map(c=>'<button class="category-item" data-category="'+c.id+'"><span class="category-icon">'+icon(c.icon)+'</span><span>'+c.name+'</span></button>').join('');
  $$('#category-nav [data-category]').forEach(b=>b.addEventListener('click',()=>{activeView='explore';activeCategory=b.dataset.category;render();$('#sidebar').classList.remove('open');}));
}
function renderProviders(){
  $('#provider-grid').innerHTML=providers.map(p=>'<article class="provider-card"><div class="provider-card-top"><span class="provider-stage">'+p.stage+'</span><span class="nav-dot"></span></div><h4>'+p.name+'</h4><div class="provider-kind">'+p.kind+'</div><div class="provider-tags">'+p.capabilities.map(t=>'<span>'+t+'</span>').join('')+'</div><p class="provider-note">'+p.note+'</p></article>').join('');
}
function visibleTools(){
  let list=tools;
  if(activeView==='favorites') list=list.filter(t=>favorites.has(t.id));
  if(activeView==='explore'&&activeCategory!=='all') list=list.filter(t=>t.category===activeCategory);
  if(searchTerm) list=list.filter(t=>(t.name+' '+t.description+' '+t.category+' '+t.tag).toLowerCase().includes(searchTerm.toLowerCase()));
  return list;
}
function render(){
  const ai=activeView==='ai';
  $('#tools-section').classList.toggle('hidden',ai);
  $('#ai-section').classList.toggle('hidden',!ai);
  $('#breadcrumb-current').textContent=ai?'Laboratorio IA':activeView==='favorites'?'Favoritos':'Explorar';
  $('#section-title').textContent=activeView==='favorites'?'Tus herramientas favoritas':activeCategory==='all'?'Explora las herramientas':categories.find(c=>c.id===activeCategory)?.name||'Explora las herramientas';
  $('#section-description').textContent=activeView==='favorites'?'Accede rápidamente a las herramientas que guardaste.':'Elige una herramienta y empieza a trabajar al instante.';
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));
  $$('#category-nav [data-category]').forEach(b=>b.classList.toggle('active',activeView==='explore'&&b.dataset.category===activeCategory));
  $('#favorite-count').textContent=favorites.size;
  const list=visibleTools();
  $('#tool-grid').classList.toggle('list-view',layout==='list');
  $('#tool-grid').innerHTML=list.map(t=>'<article class="tool-card '+(t.status==='soon'?'is-disabled':'')+'" data-tool="'+t.id+'" '+(t.status==='soon'?'aria-disabled="true"':'')+'><div class="tool-card-top"><span class="tool-icon">'+icon(t.icon)+'</span><button class="tool-favorite '+(favorites.has(t.id)?'active':'')+'" data-favorite="'+t.id+'" aria-label="Guardar favorito" title="Guardar en favoritos">'+icon('star')+'</button></div><h3>'+t.name+'</h3><p>'+t.description+'</p><div class="tool-card-bottom"><span class="tool-tag">'+t.tag+'</span><span class="tool-status '+t.status+'">'+statusLabels[t.status]+'</span></div><span class="tool-open">Abrir herramienta →</span></article>').join('');
  $('#empty-state').classList.toggle('hidden',list.length>0);
  $('#tool-grid').classList.toggle('hidden',list.length===0);
  $('#result-count').textContent=list.length+' herramientas';
  $('#filter-chips').innerHTML=categories.map(c=>'<button class="filter-chip '+(activeCategory===c.id?'active':'')+'" data-filter="'+c.id+'">'+c.name+'</button>').join('');
  $('#metric-tools').textContent=tools.length;
  $('#metric-local').textContent=tools.filter(t=>t.mode==='local'||t.mode==='browser').length;
  $$('#tool-grid [data-tool]').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('[data-favorite]'))return;const t=tools.find(x=>x.id===card.dataset.tool);if(t.status==='soon'){toast('Esta herramienta está en preparación.','info');return;}openTool(t);}));
  $$('#tool-grid [data-favorite]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toggleFavorite(b.dataset.favorite);}));
  $$('#filter-chips [data-filter]').forEach(b=>b.addEventListener('click',()=>{activeView='explore';activeCategory=b.dataset.filter;render();}));
}
function toggleFavorite(id){if(favorites.has(id))favorites.delete(id);else favorites.add(id);localStorage.setItem('prisma-favorites',JSON.stringify([...favorites]));render();}
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
function buildFields(t){
  switch(t.id){
    case 'pdf-extract':return field('Páginas que deseas conservar','pages','text','1-3','Ejemplos: 1, 3, 5-8. La numeración comienza en 1.');
    case 'pdf-rotate':return selectField('Rotación','degrees',[['90','90° a la derecha'],['180','180°'],['270','90° a la izquierda']],'90');
    case 'pdf-watermark':return field('Texto de la marca de agua','watermark','text','PRISMA','Se aplicará en diagonal y con transparencia.');
    case 'image-pdf':return selectField('Tamaño de página','pageSize',[['a4','A4'],['letter','Carta'],['fit','Ajustar a la imagen']],'a4');
    case 'image-compress':return '<div class="inline-fields">'+field('Calidad','quality','number','78','Entre 10 y 100.','min="10" max="100"')+selectField('Formato de salida','format',[['image/webp','WebP (recomendado)'],['image/jpeg','JPG']],'image/webp')+'</div>';
    case 'image-resize':return '<div class="inline-fields">'+field('Ancho (px)','width','number','1200','Ancho final.','min="1" max="12000"')+field('Alto (px)','height','number','800','Alto final.','min="1" max="12000"')+'</div><label class="check-line"><input type="checkbox" name="keep" checked> Mantener proporción original</label>';
    case 'image-convert':return selectField('Formato de salida','format',[['image/png','PNG'],['image/jpeg','JPG'],['image/webp','WebP']],'image/webp');
    case 'image-crop':return '<div class="inline-fields">'+field('Ancho del recorte (%)','widthPct','number','80','Porcentaje del ancho.','min="10" max="100"')+field('Alto del recorte (%)','heightPct','number','80','Porcentaje del alto.','min="10" max="100"')+'</div><div class="tool-hint">Se realiza un recorte centrado. Para edición libre con selección visual añadiremos un editor dedicado.</div>';
    case 'image-ocr':return selectField('Idioma del documento','language',[['spa','Español'],['eng','Inglés'],['spa+eng','Español e inglés']],'spa','La primera ejecución descarga los datos de idioma.');
    case 'video-trim':return '<div class="inline-fields">'+field('Inicio (segundos)','start','number','0','Desde qué segundo iniciar.','min="0" step="0.1"')+field('Duración (segundos)','duration','number','10','Duración del fragmento.','min="0.1" step="0.1"')+'</div>';
    case 'json-format':return textareaField('Contenido JSON','text','{\n  "prisma": "listo"\n}','Valida y organiza el contenido con la indentación seleccionada.')+selectField('Indentación','indent',[['2','2 espacios'],['4','4 espacios'],['tab','Tabulación']],'2');
    case 'base64':return textareaField('Texto','text','','Admite caracteres especiales y tildes.')+selectField('Operación','mode',[['encode','Codificar a Base64'],['decode','Decodificar Base64']],'encode');
    case 'word-count':return textareaField('Texto para analizar','text','','El análisis se realiza localmente.');
    case 'password':return '<div class="inline-fields">'+field('Longitud','length','number','20','Entre 8 y 128 caracteres.','min="8" max="128"')+selectField('Complejidad','complexity',[['strong','Alta'],['medium','Media'],['easy','Fácil de escribir']],'strong')+'</div><label class="check-line"><input type="checkbox" name="symbols" checked> Incluir símbolos</label>';
    case 'qr':return textareaField('Texto o enlace','text','https://','El código QR se genera en tu navegador.');
    case 'currency':return '<div class="inline-fields">'+field('Cantidad','amount','number','1','','min="0" step="any"')+selectField('Moneda de origen','from',[['USD','USD · Dólar'],['COP','COP · Peso colombiano'],['EUR','EUR · Euro'],['MXN','MXN · Peso mexicano'],['BRL','BRL · Real'],['GBP','GBP · Libra']],'USD')+'</div>'+selectField('Moneda de destino','to',[['COP','COP · Peso colombiano'],['USD','USD · Dólar'],['EUR','EUR · Euro'],['MXN','MXN · Peso mexicano'],['BRL','BRL · Real'],['GBP','GBP · Libra']],'COP','Consulta tasas de referencia. No es una cotización financiera en tiempo real.');
    case 'units':return selectField('Tipo de conversión','kind',[['length','Longitud'],['mass','Masa'],['temperature','Temperatura']],'length')+field('Valor','value','number','1','','step="any"')+selectField('De','from',[['m','Metros'],['km','Kilómetros'],['cm','Centímetros'],['mi','Millas'],['ft','Pies']],'m')+selectField('A','to',[['km','Kilómetros'],['m','Metros'],['cm','Centímetros'],['mi','Millas'],['ft','Pies']],'km');
    case 'timestamp':return selectField('Conversión','mode',[['unix-to-date','Unix a fecha'],['date-to-unix','Fecha a Unix']],'unix-to-date')+field('Valor','value','text','1762550400','Acepta segundos, milisegundos o una fecha ISO.');
    case 'url-code':return textareaField('Texto o URL','text','','')+selectField('Operación','mode',[['encode','Codificar'],['decode','Decodificar']],'encode');
    case 'text-case':return textareaField('Texto','text','')+selectField('Transformación','mode',[['upper','MAYÚSCULAS'],['lower','minúsculas'],['title','Tipo título'],['sentence','Tipo oración']],'upper');
    case 'markdown':return textareaField('Markdown','text','# PRISMA\n\nEscribe **Markdown** aquí.','La vista previa básica se genera en tu navegador.');
    case 'color-palette':return selectField('Armonía','harmony',[['analogous','Análogos'],['complementary','Complementarios'],['triadic','Triádicos']],'analogous');
    default:return '';
  }
}
function openTool(t){
  currentTool=t;selectedFiles=[];running=false;
  $('#modal-title').textContent=t.name;$('#modal-kicker').textContent=categories.find(c=>c.id===t.category)?.name.toUpperCase()||'HERRAMIENTA';
  $('#modal-icon').innerHTML=icon(t.icon);
  let html='<p class="modal-description">'+t.description+'</p>';
  if(t.file){
    html+='<label class="file-drop" id="file-drop"><input id="file-input" type="file" '+(t.multiple?'multiple':'')+' accept="'+(t.accept||'*/*')+'"><span class="file-drop-icon">'+icon('upload')+'</span><strong>Selecciona o arrastra tus archivos aquí</strong><p>'+(t.multiple?'Puedes añadir varios archivos. ':'')+'No se subirán a un servidor.</p></label><div class="file-list" id="file-list"></div>';
  }
  html+=buildFields(t);
  html+='<div class="progress-wrap hidden" id="progress-wrap"><div class="progress-label"><span id="progress-message">Preparando...</span><span id="progress-value">0%</span></div><div class="progress-track"><div class="progress-bar" id="progress-bar"></div></div></div><div id="tool-output"></div>';
  $('#modal-body').innerHTML=html;
  $('#tool-modal').classList.remove('hidden');
  $('#modal-run').classList.toggle('hidden',t.status==='soon');
  $('#modal-run').disabled=false;
  $('#modal-run').innerHTML=icon('play')+' Ejecutar herramienta';
  if(t.file){
    const drop=$('#file-drop'),input=$('#file-input');
    input.addEventListener('change',()=>{selectedFiles=[...input.files];renderFileList();});
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover');});
    drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
    drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');const incoming=[...e.dataTransfer.files];selectedFiles=t.multiple?incoming:incoming.slice(0,1);renderFileList();});
    drop.addEventListener('click',e=>{if(e.target.tagName!=='INPUT')input.click();});
  }
  if(t.id==='units')$('#field-kind').addEventListener('change',updateUnitOptions);
  if(t.id==='timestamp')$('#field-mode').addEventListener('change',updateTimestampField);
}
function updateUnitOptions(){
  const kind=$('#field-kind').value;
  const sets={length:[['m','Metros'],['km','Kilómetros'],['cm','Centímetros'],['mm','Milímetros'],['mi','Millas'],['ft','Pies']],mass:[['kg','Kilogramos'],['g','Gramos'],['mg','Miligramos'],['lb','Libras'],['oz','Onzas']],temperature:[['C','Celsius'],['F','Fahrenheit'],['K','Kelvin']]};
  const opts=sets[kind];['from','to'].forEach((name,i)=>{$('#field-'+name).innerHTML=opts.map(o=>'<option value="'+o[0]+'">'+o[1]+'</option>').join('');$('#field-'+name).value=kind==='length'?(i?'km':'m'):kind==='mass'?(i?'g':'kg'):(i?'F':'C');});
}
function updateTimestampField(){
  const mode=$('#field-mode').value;
  $('#field-value').value=mode==='unix-to-date'?'1762550400':new Date().toISOString().slice(0,16);
}
function renderFileList(){
  const list=$('#file-list');if(!list)return;
  list.innerHTML=selectedFiles.map(f=>'<div class="file-row">'+icon('file-text')+'<span>'+escapeHtml(f.name)+'</span><small>'+formatBytes(f.size)+'</small></div>').join('');
}
function formatBytes(bytes){if(!bytes)return '0 B';const u=['B','KB','MB','GB'];const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3);return (bytes/Math.pow(1024,i)).toFixed(i?1:0)+' '+u[i];}
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
async function executeCurrentTool(){
  if(!currentTool||running)return;
  if(currentTool.file&&!selectedFiles.length){toast('Selecciona al menos un archivo.','error');return;}
  running=true;$('#modal-run').disabled=true;$('#modal-run').textContent='Procesando...';$('#tool-output').innerHTML='';
  updateProgress(.02,'Preparando herramienta...');
  try{
    const result=await runTool(currentTool.id,selectedFiles,readParams(),updateProgress);
    if(result?.blob){if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(result.blob);}
    renderOutput(result);
    updateProgress(1,'Proceso completado');
    toast('La operación terminó correctamente.','success');
  }catch(error){
    console.error(error);
    $('#tool-output').innerHTML='<div class="tool-hint"><strong>No se pudo completar la operación.</strong><br>'+escapeHtml(error?.message||'Error inesperado. Prueba con otro archivo o vuelve a intentarlo.')+'</div>';
    toast(error?.message||'Ocurrió un error.','error');
  }finally{
    running=false;$('#modal-run').disabled=false;$('#modal-run').innerHTML=icon('play')+' Ejecutar herramienta';
  }
}
function renderOutput(result){
  const panel=document.createElement('div');panel.className='output-panel';
  let html='<div class="output-head"><strong>✓ Resultado listo</strong><div class="output-actions">';
  if(result.blob)html+='<button class="mini-button" id="download-output">'+icon('download')+' Descargar</button>';
  if(result.text)html+='<button class="mini-button" id="copy-output">'+icon('copy')+' Copiar</button>';
  html+='</div></div>';
  if(result.previewUrl)html+='<img class="output-preview" src="'+result.previewUrl+'" alt="Vista previa del resultado">';
  if(result.text)html+='<pre class="output-text" id="output-text">'+escapeHtml(result.text)+'</pre>';
  if(result.html)html+='<pre class="output-text">'+escapeHtml(result.html)+'</pre>';
  if(result.summary)html+='<p class="tool-hint" style="margin:10px 0 0">'+escapeHtml(result.summary)+'</p>';
  panel.innerHTML=html;$('#tool-output').append(panel);
  if(result.blob)$('#download-output').addEventListener('click',()=>downloadBlob(result.blob,result.filename||'prisma-result'));
  if(result.text)$('#copy-output').addEventListener('click',async()=>{await navigator.clipboard.writeText(result.text);toast('Texto copiado.');});
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function closeTool(){if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl=null;}$('#tool-modal').classList.add('hidden');currentTool=null;selectedFiles=[];running=false;}
function showView(view){activeView=view;activeCategory='all';searchTerm='';$('#global-search').value='';render();window.scrollTo({top:0,behavior:'smooth'});}
renderCategories();renderProviders();render();
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$$('[data-view-jump]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.viewJump)));
$('#global-search').addEventListener('input',e=>{searchTerm=e.target.value;activeView='explore';activeCategory='all';render();});
$('#theme-toggle').addEventListener('click',()=>{const root=document.documentElement;const next=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=next;$('#theme-toggle').innerHTML=icon(next==='dark'?'sun':'moon');localStorage.setItem('prisma-theme',next);});
const savedTheme=localStorage.getItem('prisma-theme');if(savedTheme){document.documentElement.dataset.theme=savedTheme;$('#theme-toggle').innerHTML=icon(savedTheme==='dark'?'sun':'moon');}
$('#explore-tools').addEventListener('click',()=>$('#tools-section').scrollIntoView({behavior:'smooth'}));
$('#clear-search').addEventListener('click',()=>{$('#global-search').value='';searchTerm='';render();});
$('#modal-close').addEventListener('click',closeTool);$('#modal-cancel').addEventListener('click',closeTool);
$('#tool-modal').addEventListener('click',e=>{if(e.target===$('#tool-modal'))closeTool();});
$('#modal-run').addEventListener('click',executeCurrentTool);
$('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#about-button').addEventListener('click',()=>toast('PRISMA 1.0 · Herramientas locales y motores IA intercambiables.','info'));
$('#privacy-link').addEventListener('click',e=>{e.preventDefault();toast('Tus archivos se procesan localmente salvo que una herramienta indique expresamente lo contrario.','info');});
$$('[data-layout]').forEach(b=>b.addEventListener('click',()=>{layout=b.dataset.layout;$$('[data-layout]').forEach(x=>x.classList.toggle('active',x===b));render();}));
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#global-search').focus();}if(e.key==='Escape')closeTool();});
