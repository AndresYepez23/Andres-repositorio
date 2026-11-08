import { tools } from './registry.js';
import { runTool } from './engines.js';
import { getProviderCredential } from './provider-connections.js';

const $ = (selector, root=document) => root.querySelector(selector);
const STORAGE_KEY = 'prisma-core-workspace-v1';
const MAX_STEPS = 10;
let messages = [];
let attachments = [];
let pendingPlan = null;
let busy = false;
let executionActive = false;
let cancelRequested = false;

function readPollinationsToken(){
  const expiry=Number(sessionStorage.getItem('prisma-polli-expiry')||0);
  if(expiry&&Date.now()>expiry){sessionStorage.removeItem('prisma-polli-token');sessionStorage.removeItem('prisma-polli-expiry');return '';}
  return sessionStorage.getItem('prisma-polli-token')||'';
}
function credentials(){
  return {
    polliToken:readPollinationsToken(),
    hfToken:getProviderCredential('huggingface'),
    geminiKey:getProviderCredential('gemini'),
    groqKey:getProviderCredential('groq')
  };
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(messages.slice(-40).map(({role,content,time})=>({role,content,time}))));}catch{}
}
function addMessage(role,content,extra={}){
  messages.push({role,content:String(content||''),time:Date.now(),...extra});
  messages=messages.slice(-40);save();renderMessages();
}
function renderMessages(){
  const list=$('#core-messages');if(!list)return;
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
    list.append(bubble);
  }
  list.scrollTop=list.scrollHeight;
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
function buildPlannerPrompt(userText){
  const catalog=availableCatalog();
  return [
    'Eres PRISMA CORE, el agente central de un ecosistema de herramientas. No eres un buscador de herramientas: entiendes el resultado final que la persona quiere y orquestas las operaciones necesarias para entregarlo.',
    'Devuelve SOLO JSON válido, sin Markdown ni texto fuera del objeto. Esquema: {"message":"explicación breve en español","needs_clarification":false,"question":"","steps":[{"tool_id":"id exacto","reason":"por qué se usa","params":{}}]}.',
    'Reglas: máximo '+MAX_STEPS+' pasos; 0 pasos si necesitas una aclaración; nunca inventes IDs ni capacidades; usa solo herramientas ready o beta incluidas en el catálogo; ordena pasos por dependencia; usa parámetros exactos según las instrucciones de cada herramienta; para herramientas de texto usa params.text y para IA params.prompt. No digas al usuario que abra una herramienta manual si puedes ejecutar la operación aquí.',
    'Piensa en el resultado final y no en una única operación. Ejemplos: analizar PDF = extraer texto + sintetizar hallazgos; preparar imagen para redes = quitar fondo, ajustar y comprimir según lo pedido; crear documento desde información = analizar contenido + redactar o generar archivo si existe una herramienta compatible. No agregues pasos innecesarios ni repitas conversiones. Si una operación no existe, dilo con honestidad y ofrece la alternativa más cercana.',
    'Si el usuario adjuntó archivos, considera que estarán disponibles para los pasos compatibles. No pidas que vuelva a describir el archivo.',
    'No selecciones herramientas de envío, publicación, compra, borrado externo ni acciones irreversibles. No hay autorización para esas acciones.',
    'CONTEXTO RECIENTE DE LA CONVERSACIÓN:\n'+messages.slice(-8).map(item=>(item.role==='user'?'Usuario: ':'Prisma: ')+item.content).join('\n').slice(-7000),
    'CATÁLOGO DISPONIBLE:\n'+JSON.stringify(catalog),
    'ARCHIVOS ADJUNTOS:\n'+(attachments.length?attachments.map(f=>({name:f.name,type:f.type,size:f.size})): 'Ninguno'),
    'SOLICITUD DEL USUARIO:\n'+userText
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
async function requestPlan(userText){
  const creds=credentials();
  if(!creds.polliToken&&!creds.hfToken&&!creds.geminiKey&&!creds.groqKey){
    status('Conecta un motor de texto en Laboratorio IA para que Prisma Core pueda planificar.','warning');
    addMessage('assistant','Para planificar y coordinar herramientas necesito un motor de texto. Abre Laboratorio IA, conecta Pollinations, Groq, Hugging Face o Gemini y vuelve aquí. Tus herramientas locales seguirán disponibles desde Explorar.');
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
        if(content.trim())extracted.push('ARCHIVO '+file.name+'\\n'+content.slice(0,10000));
      }catch(error){console.warn('No se pudo leer el archivo para contextualizar:',file.name,error);}
    }
    if(extracted.length)attachmentContext='\\n\\nCONTENIDO EXTRAÍDO EN EL DISPOSITIVO (solo el texto necesario se incluye en la solicitud al motor de IA; los archivos originales permanecen disponibles para ejecutar herramientas):\\n'+extracted.join('\\n\\n').slice(0,22000);
  }
  const plannerPrompt=buildPlannerPrompt(userText+attachmentContext);
  let plan,steps;
  try{
    const result=await runTool('ai-assistant',[],{
      prompt:plannerPrompt,provider:'auto',reasoning:'smart',tone:'professional',length:'long',...creds
    },(p,msg)=>{status(msg||'Planificando…');setProgress(.04+Math.max(0,Math.min(1,Number(p)||0))*.12,msg||'Planificando…');});
    plan=parsePlan(result.text);
    if(!plan.needs_clarification)steps=validatePlan(plan);
  }catch(firstError){
    status('Revisando el formato y la compatibilidad del plan…');setProgress(.17,'Corrigiendo el plan…');
    const repair=await runTool('ai-assistant',[],{
      prompt:'Tu respuesta anterior no cumplió el formato o seleccionó una herramienta no disponible. Corrige el plan usando exclusivamente el catálogo del mensaje original. Devuelve SOLO JSON válido con el esquema indicado. Error detectado: '+(firstError?.message||'plan inválido')+'\\n\\nSOLICITUD Y CATÁLOGO ORIGINAL:\\n'+plannerPrompt,
      provider:'auto',reasoning:'smart',tone:'professional',length:'long',...creds
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
  if(!pendingPlan||busy)return;
  const {plan,steps}=pendingPlan;pendingPlan=null;
  $('#core-plan').classList.add('hidden');executionActive=true;cancelRequested=false;setBusy(true);
  const executed=[];let currentFiles=[...attachments],lastText='';
  try{
    for(let index=0;index<steps.length;index++){
      if(cancelRequested)break;
      const {tool,params:plannedParams,reason}=steps[index];
      status('Paso '+(index+1)+' de '+steps.length+': '+tool.name+'…');setProgress(index/steps.length,'Paso '+(index+1)+' de '+steps.length+': '+tool.name);
      const params={...plannedParams,...credentials()};
      if(tool.id==='ai-assistant'){const base=String(params.prompt||plan.userRequest||plan.message||'Resuelve la tarea');const original=String(plan.userRequest||'');params.prompt=base+(original&&!base.includes(original)?'\\n\\nSOLICITUD Y CONTEXTO DEL USUARIO:\\n'+original.slice(0,18000):'')+(lastText?'\\n\\nCONTENIDO OBTENIDO EN EL PASO ANTERIOR:\\n'+lastText.slice(0,18000):'');}
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
    if(cancelRequested){renderExecutionResults(executed,true);addMessage('assistant','Detuve la secuencia por tu solicitud. Se conservan los resultados de los pasos que ya terminaron.');status('Ejecución detenida por ti.','warning');}
    else{renderExecutionResults(executed,false);addMessage('assistant','He completado '+executed.length+' operación(es). Revisa los resultados y descarga los archivos generados.');status('Ejecución completada.','success');}
  }catch(error){
    console.error(error);renderExecutionResults(executed,true);addMessage('assistant','La ejecución se detuvo: '+(error?.message||'error inesperado')+'. Los resultados de los pasos que sí terminaron están disponibles abajo.');status('Ejecución detenida.','error');
  }finally{
    executionActive=false;setBusy(false);attachments=[];renderAttachments();$('#core-file-input').value='';
  }
}
function renderExecutionResults(executed,partial){
  const output=$('#core-results');output.replaceChildren();
  if(!executed.length)return;
  const header=document.createElement('div');header.className='core-results-heading';header.textContent=partial?'Resultados parciales · ejecución detenida':'✓ Trabajo completado';output.append(header);
  executed.forEach((entry,index)=>{
    const card=document.createElement('section');card.className='core-result-card';
    const name=document.createElement('strong');name.textContent=(index+1)+'. '+entry.name;card.append(name);
    if(entry.result?.summary){const summary=document.createElement('p');summary.textContent=entry.result.summary;card.append(summary);}
    if(entry.result?.text){
      const pre=document.createElement('pre');pre.textContent=String(entry.result.text).slice(0,8000);card.append(pre);
      const copy=document.createElement('button');copy.type='button';copy.className='mini-button';copy.textContent='Copiar texto';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(String(entry.result.text));status('Texto copiado.','success');}catch{status('No se pudo acceder al portapapeles.','warning');}});card.append(copy);
    }
    if(entry.result?.blob){
      if(String(entry.result.blob.type||'').startsWith('image/')){const preview=document.createElement('img');preview.className='core-result-preview';preview.alt=entry.result.filename||'Imagen generada';preview.src=URL.createObjectURL(entry.result.blob);card.append(preview);}
      const row=document.createElement('div');row.className='core-result-download';
      const label=document.createElement('span');label.textContent=entry.result.filename||'Archivo generado';
      const button=document.createElement('button');button.type='button';button.className='mini-button';button.textContent='Descargar';
      button.addEventListener('click',()=>{const url=URL.createObjectURL(entry.result.blob);const a=document.createElement('a');a.href=url;a.download=entry.result.filename||'prisma-resultado';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);});
      row.append(label,button);card.append(row);
    }
    if(entry.result?.html){const pre=document.createElement('pre');pre.textContent=String(entry.result.html).slice(0,8000);card.append(pre);}
    output.append(card);
  });
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
  renderMessages();
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
    messages=[];pendingPlan=null;localStorage.removeItem(STORAGE_KEY);renderMessages();$('#core-plan').classList.add('hidden');$('#core-results').replaceChildren();status('Conversación nueva. El historial local se ha limpiado.','success');
  });
  const openConnections=()=>document.querySelector('[data-view="ai"]')?.click();
  $('#core-open-settings').addEventListener('click',openConnections);
  $('#core-connect-now').addEventListener('click',openConnections);
  $('#core-connect-banner').classList.toggle('hidden',!!(credentials().polliToken||credentials().hfToken||credentials().geminiKey||credentials().groqKey));
  status('Listo. Escribe una tarea o adjunta un archivo.','info');
  $('#core-cancel').disabled=false;
}
