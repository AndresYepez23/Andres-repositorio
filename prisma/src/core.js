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
    welcome.innerHTML='<div class="core-welcome-mark">✦</div><span class="eyebrow">PRISMA CORE</span><h2>¿Qué quieres conseguir?</h2><p>Cuéntame el resultado que necesitas. Puedo analizar tu solicitud, elegir herramientas y coordinar varios pasos.</p>';
    const examples=document.createElement('div');examples.className='core-examples';
    examples.innerHTML=['Optimiza esta imagen para Instagram','Analiza un PDF y extrae sus ideas principales','Crea una página web sencilla para una joyería','Investiga un tema y prepara un resumen'].map((x,i)=>'<button type="button" data-example="'+i+'">'+escapeHtml(x)+'</button>').join('');
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
function availableCatalog(){
  return tools.filter(tool=>tool.status==='ready').map(tool=>({
    id:tool.id,name:tool.name,description:tool.description,category:tool.category,
    mode:tool.mode,file:!!tool.file,multiple:!!tool.multiple,accept:tool.accept||'',
    tag:tool.tag||'',policy:toolPolicy(tool)
  }));
}
function buildPlannerPrompt(userText){
  const catalog=availableCatalog();
  return [
    'Eres el planificador de ejecución de PRISMA CORE. Convierte la solicitud del usuario en un plan concreto usando exclusivamente el catálogo proporcionado.',
    'Devuelve SOLO JSON válido, sin Markdown ni texto fuera del objeto. Esquema: {"message":"explicación breve en español","needs_clarification":false,"question":"","steps":[{"tool_id":"id exacto","reason":"por qué se usa","params":{}}]}.',
    'Reglas: máximo '+MAX_STEPS+' pasos; 0 pasos si necesitas una aclaración; nunca inventes IDs ni capacidades; usa solo herramientas con status ready (el catálogo ya está filtrado); ordena pasos por dependencia; usa params con nombres de campos esperados por la herramienta; para herramientas de texto usa params.text; para IA usa params.prompt; no afirmes que se ha ejecutado nada.',
    'Si el usuario pide una función no disponible, dilo en message y no inventes una herramienta. No selecciones una operación beta o próximamente.',
    'Si el usuario adjuntó archivos, considera que estarán disponibles para los pasos compatibles. No pidas que vuelva a describir el archivo.',
    'No selecciones herramientas de envío, publicación, compra, borrado externo ni acciones irreversibles. No hay autorización para esas acciones.',
    'CONTEXTO RECIENTE DE LA CONVERSACIÓN:\n'+messages.slice(-8).map(item=>(item.role==='user'?'Usuario: ':'Prisma: ')+item.content).join('\n').slice(-7000),
    'CATÁLOGO DISPONIBLE:\n'+JSON.stringify(catalog),
    'ARCHIVOS ADJUNTOS:\n'+(attachments.length?attachments.map(f=>({name:f.name,type:f.type,size:f.size})): 'Ninguno'),
    'SOLICITUD DEL USUARIO:\n'+userText
  ].join('\n\n');
}
function validatePlan(plan){
  if(!plan||typeof plan!=='object'||!Array.isArray(plan.steps))throw new Error('El plan no tiene el formato esperado.');
  if(plan.steps.length>MAX_STEPS)throw new Error('El plan supera el máximo seguro de '+MAX_STEPS+' operaciones.');
  const ready=new Map(tools.filter(tool=>tool.status==='ready').map(tool=>[tool.id,tool]));
  const steps=plan.steps.map((step,index)=>{
    const tool=ready.get(String(step.tool_id||''));
    if(!tool)throw new Error('El plan solicitó una herramienta no disponible: '+String(step.tool_id||'desconocida'));
    if(tool.file&&!attachments.length)throw new Error('Para usar '+tool.name+' necesitas adjuntar un archivo compatible.');
    if(tool.file&&attachments.length){
      const accepted=String(tool.accept||'*/*').split(',').map(value=>value.trim().toLowerCase());
      const candidates=tool.multiple?attachments:[attachments[0]];
      const compatible=candidates.filter(file=>accepted.includes('*/*')||accepted.some(rule=>rule.startsWith('.')?file.name.toLowerCase().endsWith(rule):rule.endsWith('/*')?file.type.toLowerCase().startsWith(rule.slice(0,-1)):file.type.toLowerCase()===rule));
      if(!compatible.length)throw new Error('El archivo adjunto no es compatible con '+tool.name+'. Formatos esperados: '+(tool.accept||'formato compatible')+'.');
    }
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
  const plannerPrompt=buildPlannerPrompt(userText);
  let plan,steps;
  try{
    const result=await runTool('ai-assistant',[],{
      prompt:plannerPrompt,provider:'auto',tone:'professional',length:'long',...creds
    },(p,msg)=>{status(msg||'Planificando…');setProgress(.04+Math.max(0,Math.min(1,Number(p)||0))*.12,msg||'Planificando…');});
    plan=parsePlan(result.text);
    if(!plan.needs_clarification)steps=validatePlan(plan);
  }catch(firstError){
    status('Revisando el formato y la compatibilidad del plan…');setProgress(.17,'Corrigiendo el plan…');
    const repair=await runTool('ai-assistant',[],{
      prompt:'Tu respuesta anterior no cumplió el formato o seleccionó una herramienta no disponible. Corrige el plan usando exclusivamente el catálogo del mensaje original. Devuelve SOLO JSON válido con el esquema indicado. Error detectado: '+(firstError?.message||'plan inválido')+'\\n\\nSOLICITUD Y CATÁLOGO ORIGINAL:\\n'+plannerPrompt,
      provider:'auto',tone:'professional',length:'long',...creds
    },(p,msg)=>{status(msg||'Corrigiendo el plan…');setProgress(.17+Math.max(0,Math.min(1,Number(p)||0))*.08,msg||'Corrigiendo el plan…');});
    plan=parsePlan(repair.text);
    if(!plan.needs_clarification)steps=validatePlan(plan);
  }
  plan.userRequest=userText;
  if(plan.needs_clarification){showPlan(plan,[]);addMessage('assistant',plan.message||plan.question||'Necesito una aclaración antes de continuar.');status('Hace falta una aclaración.','warning');return;}
  if(!steps.length){addMessage('assistant',plan.message||'No encontré una herramienta disponible para esa solicitud.');status('No se generó un plan ejecutable.','warning');return;}
  showPlan(plan,steps);status('Plan listo. Revisa las operaciones antes de autorizarlas.','success');setProgress(1,'Plan listo; esperando tu autorización');
}
async function executePlan(){
  if(!pendingPlan||busy)return;
  const {plan,steps}=pendingPlan;pendingPlan=null;
  $('#core-plan').classList.add('hidden');setBusy(true);
  const executed=[];let currentFiles=[...attachments],lastText='';
  try{
    for(let index=0;index<steps.length;index++){
      const {tool,params:plannedParams,reason}=steps[index];
      status('Paso '+(index+1)+' de '+steps.length+': '+tool.name+'…');setProgress(index/steps.length,'Paso '+(index+1)+' de '+steps.length+': '+tool.name);
      const params={...plannedParams,...credentials()};
      if(tool.id==='ai-assistant')params.prompt=(params.prompt||plan.userRequest||plan.message||'Resuelve la tarea')+(lastText?'\\n\\nCONTENIDO OBTENIDO EN EL PASO ANTERIOR:\\n'+lastText.slice(0,18000):'');
      if(!params.text&&lastText&&['text-sort','word-frequency','text-remove-accents','text-reverse','text-extract-emails','text-extract-urls','text-remove-empty-lines','text-prefix-lines','text-replace','text-extract-hashtags','text-extract-phones','json-minify','json-flatten','html-to-text','word-count','clean-text','text-case'].includes(tool.id))params.text=lastText;
      let inputFiles=[];
      if(tool.file){
        if(!currentFiles.length)throw new Error('El paso '+tool.name+' necesita un archivo y el paso anterior no produjo uno.');
        inputFiles=tool.multiple?currentFiles:[currentFiles[0]];
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
    renderExecutionResults(executed,false);
    addMessage('assistant','He completado '+executed.length+' operación(es). Revisa los resultados y descarga los archivos generados.');
    status('Ejecución completada.','success');
  }catch(error){
    console.error(error);renderExecutionResults(executed,true);addMessage('assistant','La ejecución se detuvo: '+(error?.message||'error inesperado')+'. Los resultados de los pasos que sí terminaron están disponibles abajo.');status('Ejecución detenida.','error');
  }finally{
    setBusy(false);attachments=[];renderAttachments();$('#core-file-input').value='';
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
  $('#core-open-settings').addEventListener('click',()=>{document.querySelector('[data-view="ai"]')?.click();});
  status('Listo para planificar. Conecta un motor de texto si todavía no lo has hecho.','info');
}
