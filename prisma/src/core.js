import { tools } from './registry.js';
import { runTool } from './engines.js';
import { getCentralProviderStatus } from './provider-connections.js';

const $ = (selector, root=document) => root.querySelector(selector);
const STORAGE_KEY = 'prisma-core-workspace-v1';
const MAX_STEPS = 10;
let messages = [];
let attachments = [];
let pendingPlan = null;
let busy = false;
let executionActive = false;
let cancelRequested = false;
let centralProviders = { gemini: false, huggingface: false, groq: false, cloudflare: false };
let centralFeatures = { cloudflareImages:false, huggingfaceImages:false, huggingfaceAudio:false, groqAudio:false };
let centralModelCatalog = { chat:{}, image:{}, audio:{} };
let userPinnedToBottom = true;
const resultObjectUrls = new Map();

function readPollinationsToken(){
  const expiry=Number(sessionStorage.getItem('prisma-polli-expiry')||0);
  if(expiry&&Date.now()>expiry){sessionStorage.removeItem('prisma-polli-token');sessionStorage.removeItem('prisma-polli-expiry');return '';}
  return sessionStorage.getItem('prisma-polli-token')||'';
}
function credentials(){
  return {
    polliToken:readPollinationsToken(),
    // Shared engines run only through Cloudflare Pages Functions.
    hfToken:'',
    geminiKey:'',
    groqKey:'',
    centralProviders,
    centralFeatures,
    centralModelCatalog
  };
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function save(){
  try{
    const serializable=messages.slice(-40).map(message=>{
      const item={role:message.role,content:message.content,time:message.time};
      if(message.files?.length)item.files=message.files.slice(0,8);
      if(message.partial)item.partial=true;
      if(message.results?.length)item.results=message.results.map(entry=>({
        name:entry.name,
        reason:entry.reason,
        result:{
          summary:String(entry.result?.summary||'').slice(0,500),
          text:typeof entry.result?.text==='string'?entry.result.text.slice(0,8000):'',
          filename:String(entry.result?.filename||''),
          html:typeof entry.result?.html==='string'?entry.result.html.slice(0,8000):'',
          hasFile:!!(entry.result?.blob||entry.result?.hasFile)
        }
      }));
      return item;
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify(serializable));
  }catch{}
}
function addMessage(role,content,extra={}){
  messages.push({role,content:String(content||''),time:Date.now(),...extra});
  messages=messages.slice(-40);save();renderMessages({forceBottom:role==='user'});
}
function isNearBottom(list,threshold=120){
  return list.scrollHeight-list.scrollTop-list.clientHeight<threshold;
}
function renderMessages({forceBottom=false}={}){
  const list=$('#core-messages');if(!list)return;
  const shouldStick=forceBottom||userPinnedToBottom||!list.childElementCount||isNearBottom(list);
  if(forceBottom)userPinnedToBottom=true;
  list.replaceChildren();
  if(!messages.length){
    const welcome=document.createElement('div');welcome.className='core-welcome';
    welcome.innerHTML='<div class="core-welcome-mark">✦</div><span class="eyebrow">PRISMA CORE · TU ASISTENTE</span><h2>Empieza por lo que quieres lograr</h2><p>No necesitas saber qué herramienta usar. Escríbeme en lenguaje natural o adjunta un archivo y me encargo de organizar el trabajo.</p>';
    const examples=document.createElement('div');examples.className='core-examples';
    examples.innerHTML=['Divide este PDF y guarda cada página por separado','Convierte este PDF en un Word editable','Analiza este documento y resume lo importante','Prepara esta imagen para Instagram','Crea una página web para mi negocio'].map((x,i)=>'<button type="button" data-example="'+i+'">'+escapeHtml(x)+'</button>').join('');
    welcome.append(examples);list.append(welcome);
    examples.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{const input=$('#core-input');input.value=button.textContent;input.focus();}));
  }
  for(const message of messages){
    const bubble=document.createElement('article');bubble.className='core-message '+(message.role==='user'?'user':'assistant');
    const label=document.createElement('span');label.className='core-message-label';label.textContent=message.role==='user'?'TÚ':'PRISMA CORE';
    const body=document.createElement('div');body.className='core-message-body';body.textContent=message.content;
    bubble.append(label,body);
    if(message.files?.length){const files=document.createElement('div');files.className='core-message-files';files.textContent=message.files.join(' · ');bubble.append(files);}
    if(message.results?.length){bubble.classList.add('has-results');bubble.append(createExecutionResults(message.results,!!message.partial));}
    list.append(bubble);
  }
  if(shouldStick){
    requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight;userPinnedToBottom=true;});
  }
  list.querySelectorAll('img.core-result-preview').forEach(img=>{
    const keepVisible=()=>{if(userPinnedToBottom){list.scrollTop=list.scrollHeight;}};
    if(img.complete)keepVisible();else img.addEventListener('load',keepVisible,{once:true});
  });
}
function status(text,kind='info'){
  const el=$('#core-status');if(!el)return;el.textContent=text;el.dataset.kind=kind;
}
function setProgress(value,label){
  const wrap=$('#core-progress');if(!wrap)return;
  wrap.classList.remove('hidden');
  const percent=Math.max(0,Math.min(100,Math.round((Number(value)||0)*100)));
  $('#core-progress-bar').style.width=percent+'%';
  $('#core-progress-label').textContent=label||'Procesando…';
}
function setBusy(value){
  busy=value;
  $('#core-send').disabled=value;
  $('#core-input').disabled=value;
  $('#core-file-button').disabled=value;
  $('#core-send').textContent=value?'Trabajando…':'Enviar';
  $('#core-composer').setAttribute('aria-busy',String(value));
  const cancelButton=$('#core-cancel');if(cancelButton){cancelButton.classList.toggle('hidden',!(value&&executionActive));cancelButton.disabled=false;}
  if(value)setProgress(.02,'Preparando…');
  else $('#core-progress')?.classList.add('hidden');
}
function renderAttachments(){
  const list=$('#core-attachments');if(!list)return;
  list.replaceChildren();
  attachments.forEach((file,index)=>{
    const item=document.createElement('span');item.className='core-attachment';
    const name=document.createElement('span');name.textContent=file.name+' · '+(file.size/1024/1024).toFixed(2)+' MB';
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Quitar '+file.name);
    remove.addEventListener('click',()=>{attachments.splice(index,1);renderAttachments();});
    item.append(name,remove);list.append(item);
  });
}
function parsePlan(raw){
  const text=String(raw||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  const start=text.indexOf('{'),end=text.lastIndexOf('}');
  if(start<0||end<=start)throw new Error('El modelo no devolvió un plan estructurado. Inténtalo de nuevo con una solicitud más concreta.');
  return JSON.parse(text.slice(start,end+1));
}
function toolPolicy(tool){
  if(tool.mode==='local')return {
    engine:'JavaScript local en el navegador',
    privacy:'El contenido permanece en este dispositivo',
    cost:'Sin coste de API; utiliza recursos del dispositivo',
    fallback:'No necesita proveedor externo',
    external:false
  };
  if(tool.mode==='browser')return {
    engine:tool.tag||'Biblioteca open source en el navegador',
    privacy:'El archivo se procesa localmente; puede descargar dependencias',
    cost:'Sin coste de API conocido; depende del equipo y la descarga inicial',
    fallback:'Si falla el navegador o la dependencia, detener y ofrecer alternativa',
    external:false
  };
  if(tool.mode==='byok')return {
    engine:tool.tag||'Proveedor conectado por el usuario',
    privacy:'El contenido necesario se transmite al proveedor elegido',
    cost:'Depende de la cuenta, modelo, cuota y tarifa del proveedor',
    fallback:'Cambiar de proveedor solo cuando la operación admita otro motor',
    external:true
  };
  if(tool.mode==='online')return {
    engine:tool.tag||'API externa',
    privacy:'La consulta se envía al servicio externo',
    cost:'Cuotas y condiciones del servicio pueden cambiar',
    fallback:'Reintentar o seleccionar una alternativa compatible',
    external:true
  };
  return {
    engine:'Motor no verificado',
    privacy:'No ejecutar sin revisar el flujo de datos',
    cost:'Desconocido',
    fallback:'No disponible',
    external:true
  };
}
function toolParamsHint(id){
  const hints={
    'pdf-split':'No requiere parámetros: divide todas las páginas y entrega un ZIP.',
    'pdf-to-word':'No requiere parámetros. Genera params.docx desde un PDF digital; requiere texto seleccionable.',
    'pdf-compress':'No requiere parámetros.',
    'pdf-merge':'No requiere parámetros; acepta varios PDF.',
    'pdf-extract':'Usa params.pages como texto, por ejemplo "1-3, 5".',
    'pdf-remove-pages':'Usa params.pages con las páginas que se eliminarán, por ejemplo "2, 4-5".',
    'pdf-rotate':'Usa params.degrees: 90, 180 o 270.',
    'pdf-page-numbers':'Usa params.position: "top" o "bottom".',
    'pdf-watermark':'Usa params.watermark con el texto.',
    'pdf-text':'No requiere parámetros; devuelve texto extraído.',
    'pdf-to-image':'Usa params.pages opcional y params.scale: 1, 1.5 o 2.',
    'ai-assistant':'Usa params.prompt con la instrucción completa, params.context opcional, params.tone y params.length.',
    'music-lyrics':'Usa params.prompt con la idea, tema, idioma, género y ambiente. Entrega letra original completa y un prompt de producción; no afirmes que se generó audio.',
    'image-gen':'Usa params.prompt con una descripción visual completa y params.ratio/style si aplica.',
    'image-bg':'No requiere parámetros; elimina el fondo de una imagen.',
    'image-ocr':'No requiere parámetros; extrae texto de imágenes.',
    'excel-json':'Usa params.sheet y params.format: "json" o "csv".',
    'docx-pdf':'No requiere parámetros; prepara la vista de impresión.'
  };
  return hints[id]||'Usa únicamente parámetros que estén descritos por la herramienta; si no requiere opciones, deja params como {}.';
}
function availableCatalog(){
  return tools.filter(tool=>['ready','beta'].includes(tool.status)).map(tool=>({
    id:tool.id,name:tool.name,description:tool.description,category:tool.category,
    mode:tool.mode,file:!!tool.file,multiple:!!tool.multiple,accept:tool.accept||'',
    tag:tool.tag||'',paramsHint:toolParamsHint(tool.id),policy:toolPolicy(tool)
  }));
}
function compactPlanningCatalog(userText){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const query=normalize(userText).slice(0,2400);
  const words=new Set((query.match(/[a-z0-9]{3,}/g)||[]).filter(word=>!['para','con','que','como','este','esta','quiero','hacer','necesito','puedes','tengo','archivo','crear','prisma'].includes(word)));
  const categoryHints={
    pdf:/pdf|documento|docx|\bword\b|pagina(?:s)?\s+(?:de|del|en|pdf)\b/i,
    image:/imagen|foto|miniatura|instagram|fondo|retrato|disen|ilustr|png|jpg|jpeg/i,
    media:/video|clip|audio|voz|subtitul|musica|sonido|mp3|mp4|transcrib/i,
    text:/texto|escrit|redact|resumen|palabra|traduc|correg|frase/i,
    data:/dato|csv|json|excel|estadistic|tabla|analiz|grafica/i,
    office:/excel|xlsx|hoja de calculo|tabla|oficina/i,
    ai:/inteligencia|modelo|razona|investiga|analiz|explica|escrib|cancion|letra|compos|musica|musical/i,
    web:/pagina web|sitio web|landing|html|css|website|web/i,
    dev:/codigo|program|javascript|python|desarroll|html|css|sql|api/i,
    creator:/youtube|miniatura|publicacion|social|creativ|disen/i,
    study:/academ|articul|estudio|investig|cientific|universidad/i,
    utility:/convert|gener|codigo qr|utilidad|comprim/i,
    privacy:/privad|cifra|segurid|contrasen/i
  };
  const categories=new Set(Object.entries(categoryHints).filter(([,regex])=>regex.test(query)).map(([category])=>category));
  const fileType=attachments.length?attachments[0].type.toLowerCase():'';
  const fileName=attachments.length?attachments[0].name.toLowerCase():'';
  if(fileType.includes('pdf')||fileName.endsWith('.pdf'))categories.add('pdf');
  if(fileType.startsWith('image/'))categories.add('image');
  if(fileType.startsWith('audio/')||fileType.startsWith('video/'))categories.add('media');
  if(/\.(xlsx|xls|csv)$/.test(fileName)){categories.add('data');categories.add('office');}
  if(/\.(docx|doc)$/.test(fileName)){categories.add('pdf');categories.add('text');}
  const directIntent=[
    [/divid|separ.*pagina|partir.*pdf/, 'pdf-split'],
    [/pdf.*(?:word|docx)|(?:word|docx).*pdf/, 'pdf-to-word'],
    [/quit.*fondo|elimin.*fondo|fondo.*transparen/, 'image-bg'],
    [/redimension|cambiar.*tamano/, 'image-resize'],
    [/comprim.*imagen|optimizar.*imagen/, 'image-compress'],
    [/miniatura|imagen.*youtube/, 'image-social-kit'],
    [/texto.*imagen|ocr/, 'image-ocr'],
    [/analiz.*pdf|resumen.*pdf|extraer.*texto.*pdf/, 'pdf-text'],
    [/letra.*cancion|cancion.*original|compon|composicion musical|escrib.*cancion|haz.*cancion|haces.*cancion|quiero.*cancion|necesito.*cancion|hazme.*cancion|escribeme.*cancion|crea.*cancion|crear.*cancion|gener.*cancion/, 'music-lyrics'],
    [/gener.*imagen|crear.*imagen|ilustracion.*ia/, 'image-gen'],
    [/transcrib.*audio|audio.*texto|voz.*texto/, 'ai-transcribe'],
    [/texto.*voz|voz sintetica|leer.*texto/, 'ai-voice']
  ];
  const preferredToolIds=new Set(directIntent.filter(([pattern])=>pattern.test(query)).map(([,id])=>id));
  const ranked=availableCatalog().map(tool=>{
    const name=normalize(tool.name+' '+tool.id),description=normalize(tool.description);
    let score=categories.has(tool.category)?10:0;
    for(const word of words){if(name.includes(word))score+=10;else if(description.includes(word))score+=2;}
    if(tool.file&&attachments.length)score+=2;
    if(preferredToolIds.has(tool.id))score+=50;
    if(tool.id==='ai-assistant')score+=6;
    return {...tool,score};
  });
  ranked.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es'));
  const shortlist=ranked.slice(0,28);
  // The catalog is only a shortlist: preserve the full local registry for plan validation.
  return shortlist.map(tool=>({
    id:tool.id,name:tool.name,category:tool.category,mode:tool.mode,
    description:tool.description.slice(0,100),file:tool.file,
    ...(tool.file?{accept:tool.accept.slice(0,65)}:{}),
    hint:tool.paramsHint.slice(0,140)
  }));
}
function buildPlannerPrompt(userText){
  const catalog=compactPlanningCatalog(userText);
  return [
    'Eres PRISMA CORE, asistente central que ejecuta tareas con las herramientas de Prisma.',
    'Responde SOLO JSON valido, sin Markdown. Formato: {"message":"breve explicación","needs_clarification":false,"question":"","steps":[{"tool_id":"id exacto","reason":"motivo","params":{}}]}.',
    'Máximo '+MAX_STEPS+' pasos. Selecciona solo IDs del catálogo; el orden respeta dependencias. Usa params.text para texto, params.prompt para tareas con IA. No simules operaciones ejecutadas. No publiques, compres, elimines recursos externos ni autorices consumos.',
    'Para crear una canción o letra original, selecciona music-lyrics; redacta letra original completa y un prompt de producción musical. ai-voice es texto a voz, no genera música. No afirmes que has creado un archivo musical si no existe un generador de música en el catálogo. Si piden audio musical final y no hay motor, explica la limitación y ofrece crear la letra como paso disponible.',
    'No rechaces por defecto peticiones creativas seguras. Distingue entre escribir una obra original y copiar letras protegidas o imitar exactamente a un artista. Para lo primero, utiliza la herramienta creativa; para lo segundo, ofrece una alternativa original con rasgos musicales generales.',
    'Antes de elegir una herramienta, identifica el resultado final que pide el usuario. Puedes encadenar lectura, transformación, generación y exportación cuando cada paso tenga entradas y salidas compatibles. No selecciones herramientas solo porque comparten palabras con la petición.',
    'Puedes generar un plan con 0 pasos si la solicitud es solo una pregunta o no puede ejecutarse con las herramientas mostradas. Explícalo en message sin inventar capacidades.',
    'HISTORIAL RECIENTE:\n'+messages.slice(-5).map(item=>(item.role==='user'?'Usuario: ':'Prisma: ')+String(item.content).slice(0,600)).join('\n').slice(-2400),
    'HERRAMIENTAS RELEVANTES:\n'+JSON.stringify(catalog),
    'ARCHIVOS:\n'+JSON.stringify(attachments.slice(0,5).map(f=>({name:f.name,type:f.type,size:f.size}))),
    'PETICION:\n'+String(userText).slice(0,10500)
  ].join('\n\n');
}

function compatibleFiles(tool,files){
  const accepted=String(tool.accept||'*/*').split(',').map(value=>value.trim().toLowerCase());
  return files.filter(file=>accepted.includes('*/*')||accepted.some(rule=>rule.startsWith('.')?file.name.toLowerCase().endsWith(rule):rule.endsWith('/*')?file.type.toLowerCase().startsWith(rule.slice(0,-1)):file.type.toLowerCase()===rule));
}
function validatePlan(plan){
  if(!plan||typeof plan!=='object'||!Array.isArray(plan.steps))throw new Error('El plan no tiene el formato esperado.');
  if(plan.steps.length>MAX_STEPS)throw new Error('El plan supera el máximo seguro de '+MAX_STEPS+' operaciones.');
  const ready=new Map(tools.filter(tool=>['ready','beta'].includes(tool.status)).map(tool=>[tool.id,tool]));
  const steps=plan.steps.map((step,index)=>{
    const tool=ready.get(String(step.tool_id||''));
    if(!tool)throw new Error('El plan solicitó una herramienta no disponible: '+String(step.tool_id||'desconocida'));
    if(tool.file&&!attachments.length)throw new Error('Para usar '+tool.name+' necesitas adjuntar un archivo compatible.');
    if(tool.file&&!compatibleFiles(tool,attachments).length)throw new Error('El archivo adjunto no es compatible con '+tool.name+'. Formatos esperados: '+(tool.accept||'formato compatible')+'.');
    return {tool,policy:toolPolicy(tool),reason:String(step.reason||'Paso '+(index+1)),params:step.params&&typeof step.params==='object'?step.params:{}};
  });
  return steps;
}
function showPlan(plan,steps){
  pendingPlan={plan,steps};
  const panel=$('#core-plan');panel.replaceChildren();panel.classList.remove('hidden');
  const heading=document.createElement('div');heading.className='core-plan-heading';
  const title=document.createElement('strong');title.textContent='Plan de ejecución';
  const count=document.createElement('span');count.textContent=steps.length+' operaciones';
  heading.append(title,count);panel.append(heading);
  const description=document.createElement('p');description.textContent=plan.message||'Prisma propone esta secuencia para resolver tu solicitud.';panel.append(description);
  if(plan.needs_clarification||!steps.length){
    const question=document.createElement('p');question.className='core-plan-question';question.textContent=plan.question||plan.message||'Necesito un dato adicional para continuar.';panel.append(question);
    pendingPlan=null;return;
  }
  const list=document.createElement('ol');list.className='core-plan-steps';
  steps.forEach(({tool,reason},index)=>{
    const item=document.createElement('li');
    const number=document.createElement('span');number.className='core-plan-number';number.textContent=String(index+1);
    const copy=document.createElement('span');copy.className='core-plan-copy';
    const name=document.createElement('strong');name.textContent=tool.name;
    const detail=document.createElement('small');detail.textContent=reason+' · '+(tool.mode==='local'?'Local':tool.mode==='browser'?'Navegador':tool.mode==='byok'?'Proveedor conectado':'Servicio externo')+' · '+toolPolicy(tool).cost;
    copy.append(name,detail);item.append(number,copy);list.append(item);
  });
  panel.append(list);
  const external=steps.some(({tool})=>!['local','browser'].includes(tool.mode));
  if(external){const note=document.createElement('p');note.className='core-plan-warning';note.textContent='Este plan incluye servicios externos. Al continuar, los datos necesarios se enviarán al proveedor correspondiente y podrían aplicarse sus límites o costes.';panel.append(note);}
  const actions=document.createElement('div');actions.className='core-plan-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='button button-quiet';cancel.textContent='Cancelar plan';cancel.addEventListener('click',()=>{pendingPlan=null;panel.classList.add('hidden');status('Plan cancelado.');});
  const run=document.createElement('button');run.type='button';run.className='button button-primary';run.textContent='Autorizar y ejecutar';run.addEventListener('click',executePlan);
  actions.append(cancel,run);panel.append(actions);
}
function buildLocalPlan(userText){
  const q=String(userText||'').toLowerCase();
  const files=attachments;
  const has=(...terms)=>terms.some(term=>q.includes(term));
  const pick=(id,params={})=>{const tool=tools.find(item=>item.id===id&&['ready','beta'].includes(item.status)&&['local','browser'].includes(item.mode));return tool?{tool,params,reason:'Capacidad local seleccionada por la intención y el tipo de archivo'}:null;};
  let selected=[];
  if(files.length){
    const f=files[0],name=f.name.toLowerCase(),image=f.type.startsWith('image/'),pdf=f.type==='application/pdf'||name.endsWith('.pdf'),docx=name.endsWith('.docx'),sheet=/\\.(xlsx|xls|csv)$/i.test(name);
    if(pdf){
      if(has('divide','separa cada pagina','separar paginas','partir'))selected=[pick('pdf-split')];
      else if(has('comprime','optimiza','reduce el peso'))selected=[pick('pdf-compress')];
      else if(has('rota','gira'))selected=[pick('pdf-rotate',{degrees:90})];
      else if(has('extrae paginas','extraer paginas','selecciona paginas'))selected=[pick('pdf-extract',{pages:(q.match(/\\d+(?:\\s*-\\s*\\d+)?(?:\\s*,\\s*\\d+(?:\\s*-\\s*\\d+)?)*/)||[])[0]||'1'})];
      else if(has('imagen','imagenes','png'))selected=[pick('pdf-to-image')];
      else if(has('word','editable','docx','convierte'))selected=[pick('pdf-to-word')];
      else selected=[pick('pdf-text')];
    }else if(image){
      if(has('fondo','quitar fondo','transparente'))selected=[pick('image-bg')];
      else if(has('texto','leer','extraer','ocr','transcribir'))selected=[pick('image-ocr',{language:'spa'})];
      else if(has('comprime','peso','liviana'))selected=[pick('image-compress',{quality:82})];
      else if(has('redimensiona','tamaño','resize'))selected=[pick('image-resize',{width:1080,height:1080})];
      else if(has('comprime','peso','liviana'))selected=[pick('image-compress',{quality:88})];
    }else if(docx)selected=[pick('docx-html')];
    else if(sheet)selected=[pick('excel-json',{sheet:'all',format:'json'})];
    else if(/\\.(txt|md|csv)$/i.test(name))selected=[pick('clean-text',{text:''})];
  }else if(has('qr','código qr'))selected=[pick('qr',{text:userText})];
  else if(has('contraseña','password','clave segura'))selected=[pick('password')];
  else if(has('json'))selected=[pick('json-format',{text:userText})];
  else if(has('cuenta palabras','contar palabras','longitud del texto'))selected=[pick('word-count',{text:userText})];
  else if(has('quita tildes','quitar tildes'))selected=[pick('text-remove-accents',{text:userText})];
  else if(has('ordena alfabeticamente','ordenar alfabeticamente'))selected=[pick('text-sort',{text:userText})];
  else if(has('mayusculas','mayúsculas','uppercase'))selected=[pick('text-case',{text:userText,mode:'upper'})];
  else if(has('formatea json','formatear json','embellece json','pretty json'))selected=[pick('json-format',{text:userText.slice(userText.indexOf('{')>=0?userText.indexOf('{'):0)})];
  else if(has('minifica json','minificar json'))selected=[pick('json-minify',{text:userText.slice(userText.indexOf('{')>=0?userText.indexOf('{'):0)})];
  else if(has('formatea html','formatear html','indenta html'))selected=[pick('html-format',{text:userText})];
  else if(has('formatea css','formatear css','indenta css'))selected=[pick('css-format',{text:userText})];
  else if(has('formatea javascript','formatear javascript','formatea js','formatear js'))selected=[pick('js-format',{text:userText})];
  else if(has('formatea sql','formatear sql','indenta sql'))selected=[pick('sql-format',{text:userText})];
  else if(has('formatea xml','formatear xml'))selected=[pick('xml-format',{text:userText})];
  else if(has('expresion regular','regex','coincidencias regex'))selected=[pick('regex-test',{text:userText,pattern:'',flags:'gi'})];
  else if(has('estadisticas csv','analiza csv','resumen csv'))selected=[pick('csv-stats',{text:userText})];
  else if(has('paleta de colores','colores armonicos','paleta armonica'))selected=[pick('color-palette',{text:userText})];
  else if(has('gradiente css','gradient css','degradado css'))selected=[pick('css-gradient',{color1:'#9adbd2',color2:'#a9a0ee',angle:135})];
  else if(has('compara textos','comparar textos','diferencias entre textos'))selected=[pick('text-diff',{textA:'',textB:''})];
  else if(has('resume','resumen','sintetiza'))selected=[pick('text-summary-local',{text:userText,sentences:5})];
  else if(has('tiempo de lectura','cuanto tardo en leer','duracion de lectura'))selected=[pick('reading-time-local',{text:userText})];
  else if(has('analiza este texto','analizar texto','estadisticas del texto'))selected=[pick('text-analyzer-local',{text:userText})];
  else if(has('csv a tsv','csv-to-tsv'))selected=[pick('csv-to-tsv-local',{text:userText})];
  else if(has('tsv a csv','tsv-to-csv'))selected=[pick('tsv-to-csv-local',{text:userText})];
  else if(has('json a xml','json-to-xml'))selected=[pick('json-to-xml-local',{text:userText.slice(userText.indexOf('{')>=0?userText.indexOf('{'):0)})];
  else if(has('xml a json','xml-to-json'))selected=[pick('xml-to-json-local',{text:userText.slice(userText.indexOf('<')>=0?userText.indexOf('<'):0)})];
  else if(has('html a markdown','html-to-markdown'))selected=[pick('html-to-markdown-local',{text:userText.slice(userText.indexOf('<')>=0?userText.indexOf('<'):0)})];
  else if(has('contraste wcag','contraste entre colores','comprobar contraste'))selected=[pick('contrast-check-local',{color1:'#000000',color2:'#ffffff'})];
  else if(has('palabras repetidas','repeticiones consecutivas'))selected=[pick('text-dedupe-words-local',{text:userText})];
  selected=selected.filter(Boolean);
  if(!selected.length)return {message:'Puedo trabajar sin conectar motores externos cuando la tarea corresponde a una capacidad local. Por ahora no encuentro una operación local suficientemente segura para esta solicitud. Puedes adjuntar un PDF, imagen, documento u hoja de cálculo, o pedirme una conversión o transformación compatible.',needs_clarification:false,question:'',steps:[]};
  const toolNames=selected.map(item=>item.tool.name).join(' y ');
  return {message:'Entendí lo que necesitas. Voy a utilizar '+toolNames+' directamente en tu dispositivo, sin solicitar una API key ni enviar el archivo a un proveedor de IA.',needs_clarification:false,question:'',steps:selected.map(item=>({tool_id:item.tool.id,reason:item.reason,params:item.params})),userRequest:String(userText||'')};
}
async function requestNativeBrowserPlan(userText,attachmentContext=''){
  const NativeModel=globalThis.LanguageModel;
  if(!NativeModel||typeof NativeModel.create!=='function')return null;
  let session;
  try{
    const availability=typeof NativeModel.availability==='function'?await NativeModel.availability(): 'available';
    if(availability==='unavailable'||availability==='after-download'||availability==='downloadable')return null;
    session=await NativeModel.create({systemPrompt:[
      'Eres Prisma Core, un agente local privado que organiza tareas usando herramientas del navegador.',
      'Devuelve exclusivamente JSON con message, needs_clarification, question y steps. Cada step contiene tool_id, reason y params.',
      'Selecciona solo herramientas con modo local o browser y estado ready o beta del catálogo. No inventes herramientas ni parámetros.',
      'Planifica máximo 6 pasos. No envíes datos a servicios externos. No uses herramientas byok, online ni acciones irreversibles.',
      'Si el pedido no se puede resolver localmente, devuelve steps vacíos y explica honestamente la limitación.',
      'Para análisis de documentos, utiliza el texto adjunto y selecciona una operación local que pueda procesarlo.'
    ].join(' ')});
    const catalog=availableCatalog().filter(tool=>['local','browser'].includes(tool.mode));
    const prompt='CATÁLOGO LOCAL:\n'+JSON.stringify(catalog)+'\nCONTEXTO DE ARCHIVOS:\n'+attachmentContext.slice(0,12000)+'\nMENSAJES RECIENTES:\n'+messages.slice(-6).map(m=>(m.role==='user'?'Usuario: ':'Prisma: ')+m.content).join('\n').slice(-4000)+'\nSOLICITUD:\n'+userText;
    const answer=await session.prompt(prompt);
    const plan=parsePlan(answer);
    if(!plan||!Array.isArray(plan.steps)||plan.steps.length>6)return null;
    if(plan.steps.some(step=>!catalog.some(tool=>tool.id===step.tool_id)))return null;
    return plan;
  }catch(error){console.info('El modelo nativo del navegador no está disponible en esta sesión:',error?.message||error);return null;}
  finally{try{session?.destroy?.();}catch{}}
}
function isConversationWithoutTools(text){
  if(attachments.length)return false;
  const normalized=String(text||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(normalized.length>160)return false;
  const simpleConversation=/^(hola+(?: prisma)?|holi+|hey|hello|buenas(?: tardes| noches| dias)?|saludos|que tal|como estas|quien eres|que eres|gracias|muchas gracias|que puedes hacer|que sabes hacer|me escuchas|estas ahi|buenos dias|buenas noches)[!?,.\s]*$/i.test(normalized);
  const capabilityQuestion=/^(?:puedes|podrias|se puede|es posible|tienes la capacidad de)\b.{0,130}\?+$/i.test(normalized)&&!/(?:hazme|creame|escribeme|generame|preparame|componme|hacer|crear|escribir|generar|componer|preparar|producir|convertir|editar|quitar|traducir|resumir|analizar|transcribir|programar|disenar|dibujar|redactar)/i.test(normalized);
  return simpleConversation||capabilityQuestion;
}
async function answerConversation(text,creds){
  status('Prisma está respondiendo…');
  const context=messages.slice(-5,-1).map(item=>(item.role==='user'?'Usuario: ':'Prisma: ')+String(item.content).slice(0,400)).join('\n');
  const response=await runTool('ai-assistant',[],{
    prompt:'Responde a este mensaje como Prisma Core, en español, con naturalidad y brevedad. No prepares planes, no devuelvas JSON, no afirmes haber realizado acciones. Explica con precisión qué herramientas están disponibles: puedes redactar letras originales, pero no generar audio musical si no existe un motor musical conectado; ai-voice solo convierte texto en voz. Si te preguntan por una canción, distingue letra original de audio musical.\n'+(context?'Contexto reciente:\n'+context+'\n':'')+'Usuario: '+text,
    provider:'auto',reasoning:'fast',tone:'friendly',length:'short',task:'conversation',...creds
  },(p,msg)=>status(msg||'Redactando respuesta…'));
  addMessage('assistant',response.text||'¡Hola! Soy Prisma Core. ¿En qué puedo ayudarte?');
  status('Listo.','success');
}
async function requestPlan(userText){
  const centralStatus=await getCentralProviderStatus();
  centralProviders=centralStatus.providers||{gemini:false,huggingface:false,groq:false,cloudflare:false};
  centralFeatures=centralStatus.features||centralFeatures;
  centralModelCatalog=centralStatus.modelCatalog||centralModelCatalog;
  const creds=credentials();
  const hasConnectedModel=!!(creds.polliToken||creds.hfToken||creds.geminiKey||creds.groqKey||Object.values(centralProviders).some(Boolean));
  if(isConversationWithoutTools(userText)){
    if(hasConnectedModel)await answerConversation(userText,creds);
    else{addMessage('assistant','¡Hola! Soy Prisma Core. Puedo ayudarte a trabajar con documentos, imágenes y herramientas locales. ¿Qué necesitas hacer?');status('Listo.','success');}
    return;
  }

  if(!hasConnectedModel){
    status('Buscando una capacidad local para resolver tu solicitud…');setProgress(.12,'Seleccionando herramientas locales…');
    let attachmentContext='';
    if(attachments.length){
      const extracted=[];
      for(const file of attachments.slice(0,4)){
        const name=file.name.toLowerCase();
        try{
          let content='';
          if(file.type==='application/pdf'||name.endsWith('.pdf'))content=(await runTool('pdf-text',[file],{},(p,msg)=>status(msg||'Leyendo PDF localmente…')))?.text||'';
          else if(file.type.startsWith('image/'))content=(await runTool('image-ocr',[file],{language:'spa'},(p,msg)=>status(msg||'Reconociendo texto…')))?.text||'';
          else if(name.endsWith('.docx')){const result=await runTool('docx-html',[file],{},()=>{});const html=await result?.blob?.text?.();if(html)content=new DOMParser().parseFromString(html,'text/html').body.textContent||'';}
          else if(/\\.(txt|md|csv)$/i.test(name)||file.type.startsWith('text/'))content=await file.text();
          else if(/\\.(xlsx|xls)$/i.test(name)){const result=await runTool('excel-json',[file],{sheet:'all',format:'json'},()=>{});content=result?.text||await result?.blob?.text?.()||'';}
          if(content.trim())extracted.push(file.name+':\n'+content.slice(0,9000));
        }catch(error){console.warn('Lectura local del archivo falló:',file.name,error);}
      }
      if(extracted.length)attachmentContext='\n\nCONTENIDO LEÍDO LOCALMENTE (no enviado a ningún modelo):\n'+extracted.join('\n\n').slice(0,18000);
    }
    status('Comprobando si el navegador ofrece un modelo de IA local…');
    const nativePlan=await requestNativeBrowserPlan(userText,attachmentContext);
    const localPlan=nativePlan||buildLocalPlan(userText);
    let localSteps;
    try{localSteps=validatePlan(localPlan);}catch(error){addMessage('assistant','No pude preparar una operación local segura: '+error.message);status('No se pudo preparar el trabajo.','warning');return;}
    if(!localSteps.length){addMessage('assistant',localPlan.message);status('Sin conexión de IA: capacidad local no disponible para esta solicitud.','warning');return;}
    pendingPlan={plan:{...localPlan,userRequest:userText+attachmentContext},steps:localSteps};
    addMessage('assistant',localPlan.message);
    $('#core-plan').classList.add('hidden');
    await executePlan();
    return;
  }

  status('Analizando tu solicitud y seleccionando herramientas…');setProgress(.04,'Entendiendo la solicitud y consultando el catálogo…');
  let attachmentContext='';
  const wantsAnalysis=/analiz|resum|extrae|lee|conclus|explica|investiga|compara|contenido|ideas principales|revisa|interpreta|transcribe|datos de/i.test(userText);
  if(attachments.length&&wantsAnalysis){
    status('Preparando el contenido de tus archivos para entender la tarea…');
    const extracted=[];
    for(const file of attachments.slice(0,4)){
      if(file.size>25*1024*1024)continue;
      const name=file.name.toLowerCase();
      try{
        let content='';
        if(file.type==='application/pdf'||name.endsWith('.pdf')){
          const result=await runTool('pdf-text',[file],{},(p,msg)=>{status(msg||'Leyendo PDF…');});
          content=result?.text||'';
          if(!content.trim())content='No se detectó texto seleccionable; puede ser un PDF escaneado que requiere OCR.';
        }else if(file.type.startsWith('image/')){
          const result=await runTool('image-ocr',[file],{language:'spa'},(p,msg)=>{status(msg||'Reconociendo texto de imagen…');});
          content=result?.text||'';
        }else if(name.endsWith('.docx')){
          const result=await runTool('docx-html',[file],{},()=>{});
          const html=await result?.blob?.text?.();
          if(html)content=new DOMParser().parseFromString(html,'text/html').body.textContent||'';
        }else if(/\\.(txt|md|csv)$/i.test(name)||file.type.startsWith('text/')){
          content=await file.text();
        }else if(/\\.(xlsx|xls)$/i.test(name)){
          const result=await runTool('excel-json',[file],{sheet:'all',format:'json'},()=>{});
          content=await result?.blob?.text?.()||'';
        }
        if(content.trim())extracted.push('ARCHIVO '+file.name+'\n'+content.slice(0,10000));
      }catch(error){console.warn('No se pudo leer el archivo para contextualizar:',file.name,error);}
    }
    if(extracted.length)attachmentContext='\n\nCONTENIDO EXTRAÍDO EN EL DISPOSITIVO (solo el texto necesario se incluye en la solicitud al motor de IA; los archivos originales permanecen disponibles para ejecutar herramientas):\n'+extracted.join('\n\n').slice(0,22000);
  }
  const plannerPrompt=buildPlannerPrompt(userText+attachmentContext.slice(0,7500));
  let plan,steps;
  // Provider/network errors must not trigger a second costly inference request.
  const result=await runTool('ai-assistant',[],{
    prompt:plannerPrompt,provider:'auto',reasoning:'smart',tone:'professional',length:'long',task:'planner',...creds
  },(p,msg)=>{status(msg||'Planificando…');setProgress(.04+Math.max(0,Math.min(1,Number(p)||0))*.12,msg||'Planificando…');});
  try{
    plan=parsePlan(result.text);
    if(!plan.needs_clarification)steps=validatePlan(plan);
  }catch(firstError){
    status('Revisando el formato y la compatibilidad del plan…');setProgress(.17,'Corrigiendo el plan…');
    const repair=await runTool('ai-assistant',[],{
      prompt:'Tu respuesta anterior no cumplió el formato o seleccionó una herramienta no disponible. Corrige el plan usando exclusivamente el catálogo del mensaje original. Devuelve SOLO JSON válido con el esquema indicado. Error detectado: '+(firstError?.message||'plan inválido')+'\n\nSOLICITUD Y CATÁLOGO ORIGINAL:\n'+plannerPrompt,
      provider:'auto',reasoning:'smart',tone:'professional',length:'long',task:'planner',...creds
    },(p,msg)=>{status(msg||'Corrigiendo el plan…');setProgress(.17+Math.max(0,Math.min(1,Number(p)||0))*.08,msg||'Corrigiendo el plan…');});
    plan=parsePlan(repair.text);
    if(!plan.needs_clarification)steps=validatePlan(plan);
  }
  plan.userRequest=userText+attachmentContext;
  if(plan.needs_clarification){showPlan(plan,[]);addMessage('assistant',plan.message||plan.question||'Necesito una aclaración antes de continuar.');status('Hace falta una aclaración.','warning');return;}
  if(!steps.length){addMessage('assistant',plan.message||'No encontré una herramienta disponible para esa solicitud.');status('No se generó un plan ejecutable.','warning');return;}
  const requiresApproval=steps.some(({tool})=>!['local','browser'].includes(tool.mode));
  if(requiresApproval){showPlan(plan,steps);status('El plan incluye servicios externos. Revisa y autoriza antes de continuar.','warning');setProgress(1,'Esperando tu autorización');}
  else{pendingPlan={plan,steps};$('#core-plan').classList.add('hidden');addMessage('assistant',plan.message||'Ya entendí lo que necesitas. Voy a ejecutar las herramientas locales disponibles y te entregaré el resultado aquí.');await executePlan();}
}
async function executePlan(){
  if(!pendingPlan||executionActive)return;
  const {plan,steps}=pendingPlan;pendingPlan=null;
  $('#core-plan').classList.add('hidden');executionActive=true;cancelRequested=false;setBusy(true);
  const executed=[];let currentFiles=[...attachments],lastText='';
  try{
    for(let index=0;index<steps.length;index++){
      if(cancelRequested)break;
      const {tool,params:plannedParams,reason}=steps[index];
      status('Paso '+(index+1)+' de '+steps.length+': '+tool.name+'…');setProgress(index/steps.length,'Paso '+(index+1)+' de '+steps.length+': '+tool.name);
      const params={...plannedParams,...credentials()};
      if(tool.id==='ai-assistant'){const base=String(params.prompt||plan.userRequest||plan.message||'Resuelve la tarea');const original=String(plan.userRequest||'');params.prompt=base+(original&&!base.includes(original)?'\n\nSOLICITUD Y CONTEXTO DEL USUARIO:\n'+original.slice(0,18000):'')+(lastText?'\n\nCONTENIDO OBTENIDO EN EL PASO ANTERIOR:\n'+lastText.slice(0,18000):'');}
      if(tool.id==='music-lyrics'){
        const base=String(params.prompt||plan.userRequest||'Crea una canción original');
        const original=String(plan.userRequest||'');
        params.prompt=[
          'Compón una canción completamente original en español, con título, concepto, género, tempo aproximado y estructura clara (verso 1, pre-coro, coro, verso 2, puente y coro final).',
          'Entrega una letra completa, coherente, memorable y cantable. Añade al final un prompt de producción musical listo para un futuro generador de audio. No copies letras existentes ni imites exactamente a un artista.',
          'No afirmes que has renderizado audio: esta herramienta entrega letra y dirección musical en texto.',
          'Idea solicitada: '+base,
          original&&!base.includes(original)?'Contexto del usuario: '+original.slice(0,12000):'',
          lastText?'Material del paso anterior: '+lastText.slice(0,12000):''
        ].filter(Boolean).join('\n\n');
        params.provider='auto';params.reasoning='smart';params.tone='creative';params.length='long';params.task='songwriting';
      }
      if(!params.text&&lastText&&['text-sort','word-frequency','text-remove-accents','text-reverse','text-extract-emails','text-extract-urls','text-remove-empty-lines','text-prefix-lines','text-replace','text-extract-hashtags','text-extract-phones','json-minify','json-flatten','html-to-text','word-count','clean-text','text-case'].includes(tool.id))params.text=lastText;
      let inputFiles=[];
      if(tool.file){
        if(!currentFiles.length)throw new Error('El paso '+tool.name+' necesita un archivo y el paso anterior no produjo uno.');
        inputFiles=compatibleFiles(tool,currentFiles);
        if(!inputFiles.length)throw new Error('El archivo del paso anterior no es compatible con '+tool.name+'.');
        if(!tool.multiple)inputFiles=[inputFiles[0]];
      }
      const result=await runTool(tool.id,inputFiles,params,(progress,message)=>{const detail='Paso '+(index+1)+'/'+steps.length+' · '+(message||tool.name);status(detail);setProgress((index+Math.max(0,Math.min(1,Number(progress)||0)))/steps.length,detail);});
      executed.push({name:tool.name,reason,result});setProgress((index+1)/steps.length,'Paso '+(index+1)+' de '+steps.length+' completado');
      if(result?.text)lastText=String(result.text).slice(0,30000);
      if(result?.blob){
        const file=new File([result.blob],result.filename||('prisma-paso-'+(index+1)),{type:result.blob.type||'application/octet-stream'});
        currentFiles=[file];
      }else if(result?.artifacts?.length){
        const files=result.artifacts.filter(item=>item.blob).map(item=>new File([item.blob],item.filename||'prisma-resultado',{type:item.type||item.blob.type||'application/octet-stream'}));
        if(files.length)currentFiles=files;
        const textArtifact=result.artifacts.find(item=>item.text);if(textArtifact)lastText=textArtifact.text;
      }
    }
    if(cancelRequested){
      addMessage('assistant','Detuve la secuencia por tu solicitud. Se conservan los resultados de los pasos que ya terminaron.',{results:executed,partial:true});
      status('Ejecución detenida por ti.','warning');
    }else{
      addMessage('assistant','He completado '+executed.length+' operación(es). Los resultados y archivos están disponibles en esta conversación.',{results:executed,partial:false});
      status('Ejecución completada.','success');
    }
  }catch(error){
    console.error(error);
    addMessage('assistant','La ejecución se detuvo: '+(error?.message||'error inesperado')+'. Los resultados de los pasos que sí terminaron se conservan en esta conversación.',{results:executed,partial:true});
    status('Ejecución detenida.','error');
  }finally{
    executionActive=false;setBusy(false);attachments=[];renderAttachments();$('#core-file-input').value='';
  }
}
function resultObjectUrl(blob){
  if(!blob)return '';
  let url=resultObjectUrls.get(blob);
  if(!url){url=URL.createObjectURL(blob);resultObjectUrls.set(blob,url);}
  return url;
}
function releaseResultObjectUrls(){
  for(const url of resultObjectUrls.values())URL.revokeObjectURL(url);
  resultObjectUrls.clear();
}
function createExecutionResults(executed,partial){
  const wrapper=document.createElement('div');wrapper.className='core-message-results';
  const heading=document.createElement('div');heading.className='core-results-heading';
  heading.textContent=partial?'Resultados parciales · ejecución detenida':'✓ Trabajo completado';
  wrapper.append(heading);
  executed.forEach((entry,index)=>{
    const result=entry.result||{};
    const card=document.createElement('section');card.className='core-result-card';
    const name=document.createElement('strong');name.textContent=(index+1)+'. '+entry.name;card.append(name);
    if(result.summary){const summary=document.createElement('p');summary.textContent=result.summary;card.append(summary);}
    if(result.text){
      const pre=document.createElement('pre');pre.textContent=String(result.text).slice(0,8000);card.append(pre);
      const copy=document.createElement('button');copy.type='button';copy.className='mini-button';copy.textContent='Copiar texto';
      copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(String(result.text));status('Texto copiado.','success');}catch{status('No se pudo acceder al portapapeles.','warning');}});
      card.append(copy);
    }
    if(result.blob){
      const url=resultObjectUrl(result.blob);
      if(String(result.blob.type||'').startsWith('image/')){
        const preview=document.createElement('img');preview.className='core-result-preview';preview.alt=result.filename||'Imagen generada';preview.loading='lazy';preview.src=url;card.append(preview);
      }else if(String(result.blob.type||'').startsWith('audio/')){
        const player=document.createElement('audio');player.className='core-result-player';player.controls=true;player.preload='metadata';player.src=url;card.append(player);
      }else if(String(result.blob.type||'').startsWith('video/')){
        const player=document.createElement('video');player.className='core-result-player';player.controls=true;player.preload='metadata';player.src=url;card.append(player);
      }
      const row=document.createElement('div');row.className='core-result-download';
      const label=document.createElement('span');label.textContent=result.filename||'Archivo generado';
      const button=document.createElement('button');button.type='button';button.className='mini-button';button.textContent='Descargar';
      button.addEventListener('click',()=>{const a=document.createElement('a');a.href=url;a.download=result.filename||'prisma-resultado';a.click();});
      row.append(label,button);card.append(row);
    }else if(result.hasFile){
      const note=document.createElement('p');note.className='core-result-expired';note.textContent='Este archivo se generó en una sesión anterior y ya no está disponible para descargar. Puedes volver a ejecutar la tarea para obtenerlo.';card.append(note);
    }
    if(result.html){const pre=document.createElement('pre');pre.textContent=String(result.html).slice(0,8000);card.append(pre);}
    wrapper.append(card);
  });
  return wrapper;
}
async function sendMessage(){
  if(busy)return;
  const input=$('#core-input'),text=input.value.trim();
  if(!text&&!attachments.length)return;
  const filesNow=[...attachments];
  addMessage('user',text||'Procesa los archivos adjuntos.',{files:filesNow.map(file=>file.name)});
  input.value='';input.style.height='auto';
  const requestText=text||'Analiza los archivos adjuntos y recomienda operaciones útiles.';
  setBusy(true);
  try{await requestPlan(requestText);}
  catch(error){console.error(error);addMessage('assistant','No pude preparar el plan: '+(error?.message||'error de conexión')+'. Revisa tus conexiones en Laboratorio IA e inténtalo otra vez.');status('No se pudo planificar.','error');}
  finally{setBusy(false);}
}
export function initPrismaCore(){
  const root=$('#core-section');if(!root)return;
  try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(saved))messages=saved.slice(-40);}catch{messages=[];}
  renderMessages({forceBottom:true});
  $('#core-messages').addEventListener('scroll',()=>{userPinnedToBottom=isNearBottom($('#core-messages'));},{passive:true});
  $('#core-send').addEventListener('click',sendMessage);
  $('#core-cancel').addEventListener('click',()=>{if(!executionActive||!busy)return;cancelRequested=true;$('#core-cancel').disabled=true;status('Detendré la secuencia al terminar la operación actual…','warning');});
  $('#core-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage();}});
  $('#core-input').addEventListener('input',event=>{event.target.style.height='auto';event.target.style.height=Math.min(event.target.scrollHeight,160)+'px';});
  $('#core-file-button').addEventListener('click',()=>$('#core-file-input').click());
  $('#core-file-input').addEventListener('change',event=>{
    const incoming=[...event.target.files];const total=attachments.reduce((sum,file)=>sum+file.size,0)+incoming.reduce((sum,file)=>sum+file.size,0);
    if(total>100*1024*1024){status('El total de archivos no puede superar 100 MB.','warning');event.target.value='';return;}
    attachments=[...attachments,...incoming].slice(0,8);renderAttachments();event.target.value='';
  });
  $('#core-clear').addEventListener('click',()=>{
    if(busy)return;
    releaseResultObjectUrls();messages=[];pendingPlan=null;userPinnedToBottom=true;localStorage.removeItem(STORAGE_KEY);renderMessages({forceBottom:true});$('#core-plan').classList.add('hidden');status('Conversación nueva. El historial local se ha limpiado.','success');
  });
  const openConnections=()=>document.querySelector('[data-view="ai"]')?.click();
  $('#core-open-settings').addEventListener('click',openConnections);
  $('#core-connect-now').addEventListener('click',openConnections);
  getCentralProviderStatus().then(result=>{
    centralProviders=result.providers||{gemini:false,huggingface:false,groq:false,cloudflare:false};
    centralFeatures=result.features||centralFeatures;
    centralModelCatalog=result.modelCatalog||centralModelCatalog;
    const creds=credentials();
    const ready=!!(creds.polliToken||creds.hfToken||creds.geminiKey||creds.groqKey||Object.values(centralProviders).some(Boolean));
    $('#core-connect-banner')?.classList.toggle('hidden',ready);
  });
  status('Listo. Escribe una tarea o adjunta un archivo.','info');
  $('#core-cancel').disabled=false;
}
