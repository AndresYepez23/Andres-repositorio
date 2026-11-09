import { tools } from './registry.js';
import { runTool } from './engines.js';
import { getCentralProviderStatus } from './provider-connections.js';
import { loadLocalBrain, rankLocalTools } from './local-brain.js';
import { buildSmartLocalFlow } from './smart-flows.js';
import { coreToolCatalog, searchCoreTools, planCoreOfflineAction, describeCoreTools, isToolDiscoveryQuestion, coreCapabilityContext } from './core-tool-intelligence.js';
import { planFileConversion } from './file-conversions.js';
import { openImageEditor, initImageEditor, applyImageText } from './core-image-editor.js';
import { renderMarkdownSafe } from './core-markdown.js';
import { initPrismaVoice } from './prisma-voice.js';
import { resolvePrismaProductQuestion, localQuotaExplanation } from './core-intelligence.js';
import { isAcknowledgementMessage, buildAcknowledgementReply } from './core-conversation.js';

const $ = (selector, root=document) => root.querySelector(selector);
const STORAGE_KEY = 'prisma-core-workspace-v1';
const CHATS_KEY = 'prisma-core-chats-v2';
const MAX_CHATS = 50;
let conversations = [];
let activeConversationId = '';
let conversationSearch = '';
const MAX_STEPS = 10;
let messages = [];
let attachments = [];
let pendingPlan = null;
let busy = false;
let executionActive = false;
let cancelRequested = false;
let centralProviders = { gemini: false, huggingface: false, groq: false, cloudflare: false, pollinations: false, openrouter: false, kilo:false, requesty:false, sensenova:false, zai:false, baidu:false, aihubmix:false, amd:false };
let centralFeatures = { pollinationsImages:false, cloudflareImages:false, huggingfaceImages:false, huggingfaceAudio:false, groqAudio:false, openrouterChat:false };
let centralModelCatalog = { chat:{}, image:{}, audio:{} };
let userPinnedToBottom = true;
let localBrainEnabled = false;
let voiceReading = false;
let voiceUtterance = 0;
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
    const serializable=messages.slice(-60).map(message=>{
      const item={role:message.role,content:String(message.content||'').slice(0,22000),time:message.time,id:message.id||'',feedback:message.feedback||''};
      if(message.engine)item.engine=message.engine;
      if(message.model)item.model=message.model;
      if(message.fallbackFrom)item.fallbackFrom=message.fallbackFrom;
      if(message.fallbackReason)item.fallbackReason=message.fallbackReason;
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
    const active=conversations.find(chat=>chat.id===activeConversationId);
    if(active){
      active.messages=messages.slice(-60);
      active.updated=Date.now();
      const first=messages.find(message=>message.role==='user'&&message.content.trim());
      if(first&&(!active.titled||active.title==='Nueva conversación')){
        active.title=String(first.content).replace(/\s+/g,' ').trim().slice(0,58)||'Nueva conversación';
        active.titled=true;
      }
    }
    persistChatHistory(serializable);
    localStorage.removeItem(STORAGE_KEY);
  }catch{}
}
function newChatRecord(content=[]){
 const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'chat-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
 const first=content.find(message=>message.role==='user'&&message.content?.trim());
 return {id,title:first?String(first.content).replace(/\s+/g,' ').trim().slice(0,58):'Nueva conversación',
   titled:!!first,updated:Date.now(),created:Date.now(),messages:content,thumbnailBrief:null,pinned:false};
}
function persistChatHistory(activeSerialized=null){
 try{
  const records=conversations.slice().sort((a,b)=>b.updated-a.updated).slice(0,MAX_CHATS).map(chat=>({
   id:chat.id,title:chat.title,titled:!!chat.titled,created:chat.created,updated:chat.updated,thumbnailBrief:chat.thumbnailBrief||null,pinned:!!chat.pinned,
   messages:chat.id===activeConversationId&&activeSerialized
    ?activeSerialized:chat.messages.slice(-60).map(message=>({
     id:message.id||'',role:message.role,content:String(message.content||'').slice(0,22000),time:message.time,
     engine:message.engine,model:message.model,fallbackFrom:message.fallbackFrom,
     feedback:message.feedback||'',files:message.files?.slice(0,8),
     results:message.results?.map(entry=>({name:entry.name,reason:entry.reason,
      result:{summary:String(entry.result?.summary||'').slice(0,500),
       text:String(entry.result?.text||'').slice(0,6000),filename:entry.result?.filename||'',
       hasFile:!!(entry.result?.blob||entry.result?.hasFile)}}))
    }))
  }));
  localStorage.setItem(CHATS_KEY,JSON.stringify(records));
  document.dispatchEvent(new Event('prisma:chats-changed'));
 }catch(error){
  // Browser storage may be full. Retain the active chat and discard oldest
  // persisted chats before retrying; never silently discard the active thread.
  try{
   const records=conversations.slice().sort((a,b)=>b.updated-a.updated).slice(0,12).map(chat=>({
     id:chat.id,title:chat.title,titled:chat.titled,created:chat.created,updated:chat.updated,thumbnailBrief:chat.thumbnailBrief||null,
     messages:chat.messages.slice(-20).map(m=>({id:m.id,role:m.role,content:String(m.content||'').slice(0,9000),time:m.time,engine:m.engine,model:m.model,feedback:m.feedback}))
   }));
   localStorage.setItem(CHATS_KEY,JSON.stringify(records));
  }catch{}
 }
}
function loadChatHistory(){
 let stored=[];
 try{
  const records=JSON.parse(localStorage.getItem(CHATS_KEY)||'[]');
  if(Array.isArray(records))stored=records.filter(chat=>chat&&typeof chat.id==='string'&&Array.isArray(chat.messages))
    .slice(0,MAX_CHATS).map(chat=>({id:chat.id,title:String(chat.title||'Nueva conversación').slice(0,70),titled:!!chat.titled,created:Number(chat.created)||Date.now(),updated:Number(chat.updated)||Date.now(),messages:chat.messages.slice(-60),thumbnailBrief:chat.thumbnailBrief||null,pinned:!!chat.pinned}));
 }catch{}
 if(!stored.length){
  let legacy=[];try{const old=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(old))legacy=old.slice(-60);}catch{}
  stored=[newChatRecord(legacy)];
 }
 conversations=stored;
 conversations.sort((a,b)=>b.updated-a.updated);
 activeConversationId=conversations[0].id;
 messages=conversations[0].messages.slice();
 renderConversationList();
}
function renderConversationList(){
 const list=$('#core-conversation-list');if(!list)return;
 const sorted=conversations.slice().sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||b.updated-a.updated);
 const visible=sorted.filter(chat=>!conversationSearch||
  chat.title.toLocaleLowerCase('es').includes(conversationSearch)||
  chat.messages.some(message=>String(message.content||'').toLocaleLowerCase('es').includes(conversationSearch)));
 list.replaceChildren();
 if(!visible.length){const empty=document.createElement('p');empty.className='core-history-empty';empty.textContent='No se encontraron conversaciones.';list.append(empty);return;}
 for(const chat of visible){
  const row=document.createElement('div');row.className='core-history-entry'+(chat.id===activeConversationId?' active':'');
  const select=document.createElement('button');select.type='button';select.className='core-history-select';select.title=chat.title;
  select.setAttribute('aria-current',chat.id===activeConversationId?'page':'false');
  const strong=document.createElement('strong');strong.textContent=chat.title;
  const small=document.createElement('small');small.textContent=(chat.pinned?'📌 · ':'')+chat.messages.length+' mensajes';
  select.append(strong,small);
  select.addEventListener('click',()=>openConversation(chat.id));
  const more=document.createElement('button');more.type='button';more.className='core-history-more';more.textContent='⋯';more.title='Opciones de conversación';more.setAttribute('aria-label','Opciones de '+chat.title);
  more.addEventListener('click',()=>{
   if(row.querySelector('.core-history-menu')){row.querySelector('.core-history-menu').remove();return;}
   list.querySelectorAll('.core-history-menu').forEach(menu=>menu.remove());
   const menu=document.createElement('div');menu.className='core-history-menu';
   const rename=document.createElement('button');rename.type='button';rename.textContent='Renombrar';
   rename.addEventListener('click',()=>{
    const title=window.prompt('Nombre de la conversación',chat.title);
    if(title?.trim()){chat.title=title.trim().slice(0,70);chat.titled=true;persistChatHistory();renderConversationList();}
   });
   const remove=document.createElement('button');remove.type='button';remove.textContent='Eliminar';remove.className='danger';
   remove.addEventListener('click',()=>{
    if(!window.confirm('¿Eliminar esta conversación de este dispositivo?'))return;
    if(busy)return;
    conversations=conversations.filter(item=>item.id!==chat.id);
   document.dispatchEvent(new CustomEvent('prisma:chat-deleted',{detail:{id:chat.id}}));
    if(!conversations.length)conversations=[newChatRecord()];
    if(activeConversationId===chat.id){activeConversationId=conversations[0].id;messages=conversations[0].messages.slice();renderMessages({forceBottom:true});}
    persistChatHistory();renderConversationList();
   });
   const pin=document.createElement('button');pin.type='button';pin.textContent=chat.pinned?'Desanclar':'Anclar';
   pin.addEventListener('click',()=>{chat.pinned=!chat.pinned;persistChatHistory();renderConversationList();});
   menu.append(pin,rename,remove);row.append(menu);
  });
  row.append(select,more);list.append(row);
 }
}
function closeConversationDrawer(){document.querySelector('#core-workspace')?.classList.remove('history-open');document.dispatchEvent(new Event('prisma:close-sidebar'));}
function openConversation(id){
 if(busy||executionActive)return;
 const chat=conversations.find(item=>item.id===id);if(!chat)return;
 speechSynthesisStop();
 activeConversationId=chat.id;messages=chat.messages.slice();attachments=[];renderAttachments();
 pendingPlan=null;$('#core-plan')?.classList.add('hidden');
 userPinnedToBottom=true;renderMessages({forceBottom:true});renderConversationList();closeConversationDrawer();
 updateChatScreen();status('Conversación cargada.','success');
}
function startNewConversation(){
 if(busy||executionActive)return;
 speechSynthesisStop();
 const active=conversations.find(chat=>chat.id===activeConversationId);
 if(active&&!active.messages.length){closeConversationDrawer();$('#core-input')?.focus();return;}
 const record=newChatRecord();conversations.unshift(record);activeConversationId=record.id;
 messages=[];attachments=[];pendingPlan=null;renderAttachments();$('#core-plan')?.classList.add('hidden');
 persistChatHistory();renderMessages({forceBottom:true});renderConversationList();closeConversationDrawer();updateChatScreen();
 status('Nueva conversación. El historial anterior sigue disponible.','success');
 $('#core-input')?.focus();
}
function updateChatScreen(){const section=$('#core-section');section?.classList.toggle('has-conversation',messages.length>0);const title=$('#core-conversation-name');if(title)title.textContent=conversations.find(c=>c.id===activeConversationId)?.title||'Nueva conversación';}
function addMessage(role,content,extra={}){
  messages.push({id:'m-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),role,content:String(content||''),time:Date.now(),...extra});
  messages=messages.slice(-60);save();renderMessages({forceBottom:role==='user'});renderConversationList();updateChatScreen();
  document.dispatchEvent(new CustomEvent('prisma:core-message',{detail:{role,content:String(content||'')}}));
}
function speechSynthesisStop(){
 voiceUtterance++;
 voiceReading=false;
 try{window.speechSynthesis?.cancel();}catch{}
 document.querySelectorAll('[data-core-action="listen"]').forEach(button=>button.setAttribute('aria-pressed','false'));
}
function speakInBrowser(text,button){
 if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window)){
  status('Este navegador no permite reproducir lectura de voz. Puedes generar MP3 con Texto a voz IA.','warning');
  return;
 }
 if(voiceReading){speechSynthesisStop();status('Lectura detenida.','info');return;}
 const clean=String(text||'').replace(/\s+/g,' ').trim();
 if(!clean){status('No hay texto para reproducir.','warning');return;}
 speechSynthesisStop();
 voiceReading=true;const token=voiceUtterance;
 button?.setAttribute('aria-pressed','true');
 const all=window.speechSynthesis.getVoices()||[];
 const spanish=all.filter(v=>/^es(?:-|_)/i.test(v.lang));
 const rank=voice=>{
  const name=String(voice.name||'').toLowerCase();
  return (/premium|enhanced|natural|neural/.test(name)?20:0)+
   (/google|mónica|monica|paulina|siri|helena|luciana/.test(name)?14:0)+
   (/es-(co|mx|es)/i.test(voice.lang)?5:0)+(voice.default?2:0);
 };
 const voice=spanish.sort((a,b)=>rank(b)-rank(a))[0]||all.find(v=>v.default)||null;
 const chunks=clean.match(/.{1,420}(?:[.!?]\s|$)|.{1,420}/g)||[clean];
 let index=0;
 const next=()=>{
  if(token!==voiceUtterance||!voiceReading)return;
  if(index>=chunks.length){voiceReading=false;button?.setAttribute('aria-pressed','false');status('Lectura terminada.','success');return;}
  const utterance=new SpeechSynthesisUtterance(chunks[index++]);
  utterance.lang=voice?.lang||'es-ES';if(voice)utterance.voice=voice;
  utterance.rate=1;utterance.pitch=1;utterance.volume=1;
  utterance.onend=next;
  utterance.onerror=event=>{if(event.error==='interrupted'||event.error==='canceled')return;speechSynthesisStop();status('El navegador no pudo reproducir esa voz. Prueba otra disponible en tu dispositivo.','warning');};
  window.speechSynthesis.speak(utterance);
 };
 status('Leyendo con la voz del navegador. No consume créditos de Prisma.','info');
 next();
}
function coreActionIcon(name){
 const paths={
  listen:'<path d="m11 5-5 4H3v6h3l5 4V5Z"/><path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
  copy:'<rect width="13" height="13" x="8" y="8" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  share:'<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  like:'<path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 5-8a3 3 0 0 1 3 3v4h5a2 2 0 0 1 2 2l-1 8a2 2 0 0 1-2 2H7"/>',
  dislike:'<path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3Zm0 0 5 8a3 3 0 0 0 3-3v-4h5a2 2 0 0 0 2-2l-1-8a2 2 0 0 0-2-2H7"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
 };
 return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+(paths[name]||paths.more)+'</svg>';
}
function renderMessageActions(message){
 const actions=document.createElement('div');actions.className='core-message-actions';
 const button=(name,title,handler)=>{
  const el=document.createElement('button');el.type='button';el.className='core-message-action';
  el.title=title;el.setAttribute('aria-label',title);el.innerHTML=coreActionIcon(name);
  el.addEventListener('click',()=>handler(el));actions.append(el);return el;
 };
 button('listen','Escuchar respuesta con la voz del navegador',el=>speakInBrowser(message.content,el));
 button('copy','Copiar respuesta',async()=>{
  try{await navigator.clipboard.writeText(message.content);status('Respuesta copiada.','success');}
  catch{status('No fue posible copiar al portapapeles.','warning');}
 });
 button('share','Compartir respuesta o archivo',async()=>{
  const fileResult=message.results?.map(entry=>entry.result).find(result=>result?.blob&&result.blob.size<100*1024*1024);
  const shareFile=fileResult?new File([fileResult.blob],fileResult.filename||'prisma-archivo',{type:fileResult.blob.type||'application/octet-stream'}):null;
  const payload=shareFile&&navigator.canShare?.({files:[shareFile]})?{title:'Prisma Space',files:[shareFile]}:{title:'Respuesta de Prisma',text:message.content};
  if(navigator.share){try{await navigator.share(payload);}catch(error){if(error.name!=='AbortError')status('No se pudo compartir.','warning');}}
  else{try{await navigator.clipboard.writeText(message.content);status('Texto copiado para compartir. Descarga el archivo para enviarlo.','success');}catch{status('Compartir no está disponible en este navegador.','warning');}}
 });
 for(const [key,title] of [['like','Me gustó'],['dislike','No me gustó']]){
  const el=button(key,title,()=>{
   message.feedback=message.feedback===key?'':key;
   save();renderMessages();status('Valoración guardada solo en este navegador.','success');
  });
  el.setAttribute('aria-pressed',message.feedback===key?'true':'false');
 }
 const more=button('more','Más opciones',()=>{
  const current=actions.querySelector('.core-action-menu');
  if(current){current.remove();return;}
  document.querySelectorAll('.core-action-menu').forEach(menu=>menu.remove());
  const menu=document.createElement('div');menu.className='core-action-menu';
  const option=(label,handler)=>{
   const b=document.createElement('button');b.type='button';b.textContent=label;
   b.addEventListener('click',()=>{menu.remove();handler();});menu.append(b);
  };
  option('Preparar un MP3 de esta respuesta',()=>{
   const text=String(message.content).slice(0,1450);
   const input=$('#core-input');input.value='Convierte a audio: '+text;input.dispatchEvent(new Event('input'));input.focus();
   status('Preparé la solicitud. Enviar consumirá una generación de voz si el proveedor tiene cuota.','info');
  });
  option('Pedir otra versión',()=>{
   const previous=messages.slice(0,messages.indexOf(message)).reverse().find(entry=>entry.role==='user');
   const input=$('#core-input');input.value=previous?'Dame otra versión de tu respuesta a: '+previous.content:'Dame otra versión de esta respuesta.';
   input.dispatchEvent(new Event('input'));input.focus();
   status('Solicitud preparada. Envíala cuando quieras generar otra respuesta.','info');
  });
  option('Copiar como texto',()=>{navigator.clipboard?.writeText(message.content).then(()=>status('Copiado.','success')).catch(()=>status('No se pudo copiar.','warning'));});
  more.parentNode?.append(menu);
 });
 return actions;
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
    welcome.innerHTML='<span class="eyebrow core-welcome-eyebrow">PRISMA CORE · TU ASISTENTE</span><h2>¿Qué necesitas hacer?<span class="core-welcome-gradient">Déjaselo a Prisma.</span></h2><p>No necesitas saber qué herramienta usar. Escríbeme en lenguaje natural o adjunta un archivo y me encargo de organizar el trabajo.</p>';
    const examples=document.createElement('div');examples.className='core-examples';
    examples.innerHTML=['Divide este PDF y guarda cada página por separado','Convierte este PDF en un Word editable','Analiza este documento y resume lo importante','Prepara esta imagen para Instagram','Crea una página web para mi negocio'].map((x,i)=>'<button type="button" data-example="'+i+'">'+escapeHtml(x)+'</button>').join('');
    welcome.append(examples);list.append(welcome);
    examples.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{const input=$('#core-input');input.value=button.textContent;input.focus();}));
  }
  for(const message of messages){
    const bubble=document.createElement('article');bubble.className='core-message '+(message.role==='user'?'user':'assistant');
    const label=document.createElement('span');label.className='core-message-label';label.textContent=message.role==='user'?'TÚ':'PRISMA CORE';
    const body=document.createElement('div');body.className='core-message-body';
    if(message.role==='assistant')body.innerHTML=renderMarkdownSafe(message.content);
    else body.textContent=message.content;
    bubble.append(label,body);
    if(message.role==='assistant'&&message.engine){
      const names={gemini:'Gemini',groq:'Groq',pollinations:'Pollinations',cloudflare:'Cloudflare',huggingface:'Hugging Face',kilo:'Kilo',requesty:'Requesty',sensenova:'SenseNova',zai:'Z.AI',baidu:'Baidu ERNIE',aihubmix:'AIHubMix',amd:'AMD Token Factory'};
      const source=document.createElement('small');source.className='core-message-engine';
      source.textContent='Respondió '+(names[message.engine]||message.engine)+(message.model?' · '+String(message.model).slice(0,60):'')+(message.fallbackFrom?' · Respaldo después de '+(names[message.fallbackFrom]||message.fallbackFrom):'');
      if(message.fallbackReason)source.title=String(message.fallbackReason).slice(0,240);
      bubble.append(source);
    }
    if(message.files?.length){const files=document.createElement('div');files.className='core-message-files';files.textContent=message.files.join(' · ');bubble.append(files);}
    if(message.results?.length){bubble.classList.add('has-results');bubble.append(createExecutionResults(message.results,!!message.partial));}
    if(message.role==='assistant'&&message.content?.trim())bubble.append(renderMessageActions(message));
    const row=document.createElement('div');
    row.className='core-message-row '+(message.role==='user'?'user':'assistant');
    row.append(bubble);
    list.append(row);
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
  const el=$('#core-status');if(el){el.textContent=text;el.dataset.kind=kind;}
  const thinking=$('#core-thinking-label');
  if(thinking&&busy)thinking.textContent=String(text||'Prisma está preparando tu respuesta…').slice(0,180);
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
  const list=$('#core-messages');
  if(list){
    const existing=$('#core-thinking');
    if(value&&!existing){
      const indicator=document.createElement('div');indicator.id='core-thinking';indicator.className='core-thinking';
      const dot=document.createElement('span');dot.className='core-thinking-dot';dot.setAttribute('aria-hidden','true');dot.textContent='✦';
      const label=document.createElement('span');label.id='core-thinking-label';label.textContent='Prisma está preparando tu respuesta…';
      indicator.append(dot,label);list.append(indicator);
      if(userPinnedToBottom)list.scrollTop=list.scrollHeight;
    }else if(!value&&existing)existing.remove();
  }
  $('#core-send').disabled=value;
  $('#core-input').disabled=value;
  $('#core-file-button').disabled=value;
  const sendLabel=$('#core-send-label');if(sendLabel)sendLabel.textContent=value?'Trabajando…':'Enviar';
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
    'pdf-split':'Opcional: params.parts para dividir en 2-20 bloques; params.chunkSize para grupos de N páginas. Sin parámetros, una página por PDF dentro de un ZIP. Después de extraer o editar, debe ser el último paso.',
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
    'ai-voice':'Usa params.prompt con el texto real para sintetizar (máximo 1.500 caracteres), params.model="openai/tts-1", params.voice="nova", params.format="mp3". Entrega audio binario descargable; nunca simules la voz con texto.',
    'image-bg':'No requiere parámetros; elimina el fondo de una imagen.',
    'image-ocr':'No requiere parámetros; extrae texto de imágenes.',
    'excel-json':'Usa params.sheet y params.format: "json" o "csv".',
    'docx-pdf':'No requiere parámetros; prepara la vista de impresión.',
    'image-resize':'Usa width y height en píxeles. Si faltan ambos, pregunta el tamaño, no inventes 1080x1080.',
    'image-convert':'Usa format: image/png, image/jpeg o image/webp.',
    'image-flip':'Usa direction: horizontal o vertical.',
    'image-crop':'Usa widthPct y heightPct; si el recorte no es claro pide confirmación.',
    'image-adjust':'Usa brightness y contrast en escala porcentual 10-200.',
    'image-blur':'Usa blur 1-30.',
    'image-pixelate':'Usa block 4-80; valor predeterminado 16.',
    'image-watermark':'Usa watermark con el texto real; si falta, pregunta.',
    'video-speed':'Usa speed entre 0.5 y 2.0.',
    'video-resize':'Usa resolution: vertical, portrait, square, landscape o hd.',
    'video-rotate':'Usa direction: cw, ccw o 180.',
    'video-trim':'Usa start y duration en segundos; si faltan los tiempos, pregunta.',
    'video-thumbnail':'Usa second en segundos, opcional.',
    'audio-trim':'Usa start y duration en segundos, no inventes un tramo.',
    'audio-convert':'Usa format: mp3, wav u ogg.',
    'json-format':'Usa text con JSON válido.',
    'text-case':'Usa text y mode: upper, lower, title o sentence.',
    'text-replace':'Usa text, search y replacement. No inventes valores.',
    'table-file-convert':'Usa output: csv, json o xlsx y sheet opcional.',
    'qr':'Usa text con el contenido real. No inventes enlaces.',
    'barcode':'Usa value y format opcional (CODE128 o EAN13).',
    'file-inspector':'Requiere archivo, no parámetros.',
    'hash-file':'Requiere archivo, no parámetros.',
    'image-metadata':'Requiere imagen, no parámetros.',
    'image-palette':'Requiere imagen, no parámetros.',
    'audio-waveform':'Requiere audio, no parámetros.',
    'audio-normalize':'Requiere audio, no parámetros.'
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
  // Index ALL available tools before selecting a compact shortlist. Rank by
  // task, attachment type and related capabilities, not exact keywords alone.
  // This avoids spending model tokens listing 138 tools per request.
  return searchCoreTools(userText,attachments,32).map(tool=>({
    id:tool.id,name:tool.name,category:tool.category,mode:tool.mode,
    description:tool.description.slice(0,115),file:!!tool.file,
    ...(tool.file?{accept:String(tool.accept||'').slice(0,65)}:{}),
    hint:toolParamsHint(tool.id).slice(0,190),
    ...(tool.related?.length?{related:tool.related.slice(0,5)}:{})
  }));
}
function buildPlannerPrompt(userText,optionalCatalog=null){
  const catalog=optionalCatalog||compactPlanningCatalog(userText);
  return [
    'Eres PRISMA CORE, asistente central que ejecuta tareas con las herramientas de Prisma.',
    'Responde SOLO JSON valido, sin Markdown. Formato: {"message":"breve explicación","needs_clarification":false,"question":"","steps":[{"tool_id":"id exacto","reason":"motivo","params":{}}]}.',
    'Máximo '+MAX_STEPS+' pasos. Selecciona solo IDs del catálogo; el orden respeta dependencias. Usa params.text para texto, params.prompt para tareas con IA. No simules operaciones ejecutadas. No publiques, compres, elimines recursos externos ni autorices consumos.',
    'Para crear una canción o letra original, selecciona music-lyrics; redacta letra original completa y un prompt de producción musical. ai-voice es texto a voz, no genera música. No afirmes que has creado un archivo musical si no existe un generador de música en el catálogo. Si piden audio musical final y no hay motor, explica la limitación y ofrece crear la letra como paso disponible.',
    'No rechaces por defecto peticiones creativas seguras. Distingue entre escribir una obra original y copiar letras protegidas o imitar exactamente a un artista. Para lo primero, utiliza la herramienta creativa; para lo segundo, ofrece una alternativa original con rasgos musicales generales.',
    'Antes de elegir una herramienta, identifica el resultado final que pide el usuario. Puedes encadenar lectura, transformación, generación y exportación cuando cada paso tenga entradas y salidas compatibles. No selecciones herramientas solo porque comparten palabras con la petición.',
    'Eres el agente coordinador de las herramientas disponibles desde el CHAT, no un menú. Prioriza las herramientas de navegador para operaciones mecánicas; no insertes una llamada ai-assistant para explicar o autorizar cada paso local. Reserva los modelos para razonamiento, escritura, interpretación semántica realmente necesaria o generación. Para seleccionar páginas de un PDF y entregarlas por separado, encadena pdf-extract seguido de pdf-split; para añadir numeración/marca de agua, realiza esos pasos antes de pdf-split. Nunca afirmes haber procesado un archivo sin una herramienta ejecutada.',
    'Compara herramientas equivalentes y complementarias antes de elegir. Prefiere la ruta con menos pasos y menos consumo; evita conversiones repetidas, OCR innecesario y generación remota si existe herramienta local. Si dos capacidades son similares, elige la que produce el archivo solicitado y considera sus salidas y compatibilidades. Pregunta solo cuando falta un parámetro esencial o hay cambios destructivos, nunca inventes valores. Las herramientas relacionadas se marcan con related.',
    'Puedes generar un plan con 0 pasos si la solicitud es solo una pregunta o no puede ejecutarse con las herramientas mostradas. Explícalo en message sin inventar capacidades.',
    'HISTORIAL RECIENTE:\n'+messages.slice(-5).map(item=>(item.role==='user'?'Usuario: ':'Prisma: ')+String(item.content).slice(0,600)).join('\n').slice(-2400),
    'HERRAMIENTAS RELEVANTES (seleccionadas y relacionadas desde un índice de '+coreToolCatalog().length+' herramientas disponibles; otras herramientas pueden estar en el registro completo):\n'+JSON.stringify(catalog),
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
  let inputs=attachments.map(file=>({name:file.name,type:file.type||''}));
  const changes={
   'video-thumbnail':['fotograma.jpg','image/jpeg'],
   'video-audio':['audio.wav','audio/wav'],
   'video-trim':['video.mp4','video/mp4'],
   'video-mute':['video.mp4','video/mp4'],
   'video-speed':['video.mp4','video/mp4'],
   'video-resize':['video.mp4','video/mp4'],
   'video-rotate':['video.mp4','video/mp4'],
   'video-gif':['animacion.gif','image/gif'],
   'audio-trim':['audio.wav','audio/wav'],
   'audio-normalize':['audio.m4a','audio/mp4'],
   'audio-waveform':['onda.png','image/png'],
   'ai-voice':['voz.mp3','audio/mpeg'],
   'json-xlsx':['datos.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
   'image-social-kit':['redes.zip','application/zip'],
   'image-favicon':['iconos.zip','application/zip'],
   'image-pdf':['documento.pdf','application/pdf'],
   'pdf-to-word':['documento.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
   'pdf-to-image':['imagenes.zip','application/zip'],
   'pdf-split':['paginas.zip','application/zip'],
   'pdf-text':['documento.txt','text/plain'],
   'docx-html':['documento.html','text/html']
  };
  return plan.steps.map((item,index)=>{
    const tool=ready.get(String(item.tool_id||''));
    if(!tool)throw new Error('La herramienta no está disponible: '+String(item.tool_id||'desconocida'));
    if(tool.file&&!inputs.length)throw new Error('Adjunta un archivo compatible con '+tool.name+'.');
    if(tool.file&&!compatibleFiles(tool,inputs).length)throw new Error('La salida del paso anterior no es compatible con '+tool.name+'. Formatos esperados: '+(tool.accept||'archivos compatibles')+'.');
    const params=item.params&&typeof item.params==='object'?item.params:{};
    let changed=changes[tool.id];
    if(tool.id==='table-file-convert'){
      const format=String(params.output||'').toLowerCase();
      changed=format==='xlsx'?['datos.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']:
        format==='json'?['datos.json','application/json']:
        format==='csv'?['datos.csv','text/csv']:null;
    }
    if(tool.id==='audio-convert'){
      const format=String(params.format||'mp3').toLowerCase();
      changed=format==='wav'?['audio.wav','audio/wav']:
        format==='ogg'?['audio.ogg','audio/ogg']:['audio.mp3','audio/mpeg'];
    }
    if(tool.id==='image-convert'){
      const format=String(params.format||'image/png');
      changed=format==='image/jpeg'?['imagen.jpg','image/jpeg']:
        format==='image/webp'?['imagen.webp','image/webp']:['imagen.png','image/png'];
    }
    if(changed)inputs=[{name:changed[0],type:changed[1]}];
    else if(tool.id.startsWith('pdf-')&&!['pdf-text','pdf-metadata','pdf-form-fields'].includes(tool.id))inputs=[{name:'documento.pdf',type:'application/pdf'}];
    else if(tool.id.startsWith('image-')&&!['image-ocr','image-palette','image-identify-local','image-metadata'].includes(tool.id))inputs=[{name:'imagen.png',type:'image/png'}];
    return {tool,policy:toolPolicy(tool),reason:String(item.reason||'Paso '+(index+1)),params};
  });
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

function normalizeCoreIntent(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function isPdfEditIntent(text){
 const q=normalizeCoreIntent(text);
 const pdfContext=/\b(pdf|documento|paginas?|folios?|hojas?|marca de agua|numeracion|enumerar|numerar|foliar)\b/.test(q);
 const editAction=/extrae|extraer|extraccion|seleccion|conservar|quedarme|sacar|solo|especific|editar|marcar|marca de agua|numer|enumer|foliar|renumerar|divid|separ|partir|fragment|troce|repart|entreg|dame/.test(q);
 return pdfContext&&editAction;
}
function pdfPagesFromText(text){
 const q=normalizeCoreIntent(text);
 const part='\\d+(?:\\s*(?:-|a|hasta)\\s*\\d+)?';
 const list=new RegExp('(?:paginas?|hojas?|folios?)\\s*(?:n(?:um(?:eros?)?)?\\.?\\s*|n(?:ro|ros)\\.?\\s*|de\\s+la\\s+|del?\\s+|:)?('+part+'(?:\\s*(?:,|y)\\s*'+part+')*)');
 const matched=q.match(list);
 const short=matched?.[1]||(/^(?:\s*\d+(?:\s*(?:-|a|hasta)\s*\d+)?(?:\s*(?:,|y)\s*\d+(?:\s*(?:-|a|hasta)\s*\d+)?)*)(?:\s|$)/.exec(q)?.[0]||'');
 return String(short).replace(/\s*(?:a|hasta)\s*/g,'-').replace(/\s+y\s+/g,', ').replace(/\s*-\s*/g,'-').trim();
}
function pdfWatermarkFromText(text){
 const source=String(text||'');
 const matches=source.match(/marca\s+de\s+agua\s*(?:que\s+diga|con\s+(?:el\s+)?texto|de\s+texto|:|=)\s*["“'«]?([^"”'»\n,.!?]{2,65})/i);
 return String(matches?.[1]||'').replace(/\s+(?:y|ademas|tambien)\s+(?:numer|enumer|foliar|paginas?).*$/i,'').trim();
}
// Deterministic local execution: a document editor is more reliable than asking
// a language model to guess whether a known PDF tool exists.
function buildPdfEditPlan(userText){
 const pdfAttached=attachments.some(file=>file.type==='application/pdf'||/\.pdf$/i.test(file.name));
 let request=userText;
 if(pdfAttached){
  // The last request may contain instructions while the next turn only
  // attaches a file, supplies page numbers, or supplies a watermark label.
  const previous=messages.slice(-8,-1).reverse().find(message=>message.role==='user'&&isPdfEditIntent(message.content));
  const shortReply=normalizeCoreIntent(userText).trim();
  const attachmentReply=/^(?:aqui|ahi|adjunto|te envio|ya|este|listo|ese|el archivo|el pdf|subi|cargue|por favor|\d|marca de agua|paginas?\s*\d)/.test(shortReply);
  const labelReply=/^[\p{Lu}][\p{Lu}\s-]{2,45}$/u.test(String(userText).trim())||/^(?:el texto es|que diga|quiero que diga)\s+.{2,45}$/i.test(String(userText).trim());
  if(previous&&(attachmentReply||labelReply)&&previous.content!==userText){
   request=previous.content+'\n'+userText;
  }
 }
 if(!isPdfEditIntent(request))return null;
 const q=normalizeCoreIntent(request);
 const select=/(solo|unas|algunas|especific|seleccion|conservar|extrae|extraccion|sacar|dame|entreg|dejar|recortar)/.test(q)&&/\b(paginas?|folios?|hojas?)\b/.test(q);
 const number=/(numer|enumer|foliar|numero de pagina|numeros de pagina)/.test(q);
 const watermark=/marca de agua/.test(q);
 const split=/(divid|separ|partir|fragment|troce|repart)/.test(q);
 if(!(select||number||watermark||split))return null;
 // Combine extraction, numbering, watermarking and splitting without an LLM
 // when the command names exact operations and supplies their parameters.
 const partsMatch=q.match(/\b(?:en|entre)\s+(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d{1,2})\s+(?:partes|archivos|pdfs?)\b/);
 const partsWords={dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
 const parts=partsMatch?(partsWords[partsMatch[1]]||Number(partsMatch[1])):0;
 const chunkMatch=q.match(/(?:cada|bloques? de|grupos? de)\s+(\d{1,3})\s+(?:paginas?|hojas?)/);
 const chunkSize=chunkMatch?Number(chunkMatch[1]):0;
 // Collect parameters from short follow-ups so that "2-4, 7" and then
 // "CONFIDENCIAL" work without asking the same question twice.
 const history=messages.slice(-9).filter(item=>item.role==='user').map(item=>String(item.content||''));
 const lastRoot=history.findLastIndex(item=>isPdfEditIntent(item));
 const replies=lastRoot>=0?history.slice(lastRoot+1):[];
 const pages=pdfPagesFromText(userText)||pdfPagesFromText(request)||replies.map(pdfPagesFromText).find(Boolean)||'';
 const labelFromReply=text=>{
  const label=String(text||'').trim();
  const assigned=label.match(/^(?:el texto es|que diga|quiero que diga)\s+(.{2,45})$/i)?.[1]?.trim();
  if(assigned)return assigned;
  return /^[\p{Lu}][\p{Lu}\s-]{2,45}$/u.test(label)?label:'';
 };
 const mark=pdfWatermarkFromText(userText)||pdfWatermarkFromText(request)||
  (watermark?replies.map(item=>pdfWatermarkFromText(item)||labelFromReply(item)).filter(Boolean).at(-1)||'':'');
 const lacking=[];
 if(!pdfAttached) {
  return {type:'missing-file',message:'Puedo procesar el PDF directamente desde este chat y sin gastar cuota de IA: seleccionar páginas, numerarlas, aplicar marcas de agua y dividirlas en archivos separados. Adjunta el PDF'+(select&&!pages?', e indica qué páginas quieres conservar (por ejemplo, 2-4, 7)':'')+(watermark&&!mark?' y el texto de la marca de agua':'')+'.'};
 }
 if(select&&!pages)lacking.push('las páginas que quieres conservar (por ejemplo, 2-4, 7)');
 if(watermark&&!mark)lacking.push('el texto de la marca de agua (por ejemplo, CONFIDENCIAL)');
 if(split&&/(?:por|segun)\s+(?:capitulos|secciones|temas)/.test(q))lacking.push('las páginas donde comienzan los capítulos o secciones');
 if(split&&parts===1)lacking.push('al menos dos partes para dividir el documento');
 if(split&&parts>20)lacking.push('un máximo de 20 partes para una división por cantidad');
 if(split&&chunkSize>200)lacking.push('un máximo de 200 páginas por bloque');
 if(split&&parts&&chunkSize)lacking.push('una sola forma de división: por número de partes o por páginas por bloque');
 if(split&&!parts&&!chunkSize&&/\b(?:en|entre)\s+(?:varias\s+)?partes\b/.test(q))lacking.push('el número de partes (por ejemplo, 2 o 3)');
 if(lacking.length)return {type:'missing-parameters',message:'Puedo organizar el PDF adjunto sin consumir cuota de IA. Indícame '+lacking.join(' y ')+'.'+(number?' La numeración comenzará en 1 en las páginas resultantes.':'')};
 const steps=[];
 const add=(tool_id,params,reason)=>steps.push({tool_id,params,reason});
 if(select)add('pdf-extract',{pages},'Conservar únicamente las páginas indicadas');
 if(number)add('pdf-page-numbers',{position:/\b(arriba|superior|encabezado)\b/.test(q)?'top':'bottom'},'Numerar consecutivamente las páginas resultantes');
 if(watermark)add('pdf-watermark',{watermark:mark},'Añadir la marca de agua solicitada');
 if(split)add('pdf-split',{...(parts?{parts}:{}),...(chunkSize?{chunkSize}:{})},parts?'Dividir el resultado en '+parts+' partes':chunkSize?'Dividir el resultado en bloques de '+chunkSize+' páginas':'Entregar cada página por separado en un ZIP');
 return {type:'execute',plan:{message:'Desde el chat realizaré estas operaciones en el PDF, sin consumir cuota de IA: '+steps.map(step=>step.reason.toLowerCase()).join('; ')+'. Entregaré el resultado descargable.',needs_clarification:false,steps,combineFinalFiles:true,userRequest:request}};
}

// File-based capabilities should be explained from the real registry before any
// model is asked to invent capabilities or pretend to edit an absent file.
function describeUnattachedToolRequest(userText){
 if(attachments.length)return null;
 const q=normalizeCoreIntent(userText);
 const options=[
  {id:'pdf-to-word',test:/\b(pdf.*(?:word|docx)|(?:word|docx).*pdf)\b/,description:'convertir un PDF digital con texto seleccionable a Word editable'},
  {id:'pdf-merge',test:/(?:unir|combinar|juntar|fusionar).{0,50}(?:pdf|documentos?)/,description:'combinar varios PDF en uno'},
  {id:'pdf-split',test:/(?:dividir|separar|partir).{0,50}(?:pdf|paginas?)|(?:pdf).{0,30}(?:dividir|separar)/,description:'dividir un PDF en archivos separados'},
  {id:'pdf-compress',test:/(?:comprimir|optimizar|reducir).{0,50}(?:pdf|documento)/,description:'optimizar la estructura de un PDF'},
  {id:'pdf-text',test:/(?:extraer|obtener|sacar|leer).{0,40}(?:texto|contenido).{0,30}pdf|pdf.{0,40}(?:extraer|sacar|leer).{0,20}texto/,description:'extraer texto seleccionable de un PDF'},
  {id:'image-bg',test:/(?:quitar|eliminar|borrar).{0,40}fondo.{0,40}(?:foto|imagen|fotografia)|(?:foto|imagen|fotografia).{0,50}(?:quitar|eliminar).{0,30}fondo/,description:'eliminar el fondo de una imagen con un modelo que funciona en el navegador'},
  {id:'image-compress',test:/(?:comprimir|optimizar|reducir).{0,50}(?:foto|imagen|jpg|png|webp)/,description:'comprimir imágenes directamente en el navegador'},
  {id:'image-ocr',test:/(?:extraer|obtener|reconocer|leer).{0,40}texto.{0,30}(?:imagen|foto)|(?:imagen|foto).{0,40}(?:ocr|texto)/,description:'reconocer texto de imágenes mediante OCR'}
 ];
 const picked=options.find(item=>item.test.test(q)&&tools.some(t=>t.id===item.id&&['ready','beta'].includes(t.status)));
 if(!picked)return null;
 return 'Sí. Prisma ya dispone de la herramienta «'+tools.find(t=>t.id===picked.id).name+'» para '+picked.description+'. Adjunta el archivo y dime los ajustes que necesitas; la procesaré con esa herramienta, sin pedirle a un modelo que simule el resultado.';
}
// Text requests are conversations, not approval screens. Reserve tool planning for
// actual file conversion, image/audio generation and multi-stage operations.
// Generic visual creation: thumbnails are one kind of image, not a separate hard-coded assistant.
function imageCreationType(text){
 if(attachments.length)return '';
 const q=normalizeCoreIntent(text);
 if(/^(?:como|por que|explica|ensename|tutorial|dime como|sabes como)\b/.test(q))return '';
 if(/\b(?:prompt|guion|ideas|consejos)\s+(?:para|de)\b.{0,65}\b(?:imagen|miniatura|logo|portada|poster)\b/.test(q))return '';
 const action=/(?:\b(?:crea|crear|creame|genera|generar|generame|haz|hazme|hacer|disena|disenar|dibujame|dibuja|ilustra|ilustrame|renderiza|prepara|necesito|quiero|construye)\b)/.test(q);
 const visual=/\b(?:imagen|imagenes|foto|fotografia|miniatura|thumbnail|portada|poster|afiche|flyer|banner|logotipo|logo|ilustracion|dibujo|wallpaper|fondo de pantalla|arte digital|publicidad visual|anuncio grafico|post|publicacion)\b/.test(q);
 if(!action||!visual)return '';
 if(/\b(?:miniatura|thumbnail)\b/.test(q))return 'thumbnail';
 if(/\b(?:logo|logotipo)\b/.test(q))return 'logo';
 if(/\b(?:flyer|afiche|poster|anuncio grafico|publicidad visual)\b/.test(q))return 'flyer';
 if(/\b(?:banner)\b/.test(q))return 'banner';
 if(/\b(?:portada)\b/.test(q))return 'cover';
 if(/\b(?:post|publicacion|instagram|facebook)\b/.test(q))return 'social';
 if(/\b(?:ilustracion|dibujo|arte digital)\b/.test(q))return 'illustration';
 return 'image';
}
function visualContextEnough(text){
 const q=normalizeCoreIntent(text)
  .replace(/\b(?:crea|crear|creame|genera|generar|generame|haz|hazme|hacer|disena|disenar|dibuja|dibujame|ilustra|ilustrame|renderiza|prepara|quiero|necesito|una|un|el|la|para|de|del|con|que|sea|mi|en|por|y|al)\b/g,' ')
  .replace(/\b(?:imagen|imagenes|foto|fotografia|miniatura|thumbnail|portada|flyer|banner|poster|afiche|logo|logotipo|ilustracion|dibujo|post|publicacion|youtube|instagram|facebook|tiktok|redes|sociales|video|reel|historia)\b/g,' ')
  .replace(/\s+/g,' ').trim();
 const words=q.split(' ').filter(Boolean);
 return (words.length>=2 && q.length>=7)||(words.length===1&&q.length>=11);
}
function visualHeadline(text){
 const raw=String(text||'');
 const found=raw.match(/(?:que\s+diga|y\s+diga|diga|texto(?:\s+principal)?|frase|t[ií]tulo(?:\s+grande)?|que\s+escriba)\s*(?:[:：=-]\s*|\s+)["“'«]?(.{2,110})/i)?.[1]||'';
 return found.split(/\s+(?:de\s+estilo|con\s+(?:estilo|colores)|en\s+(?:color|estilo))\b|\s+y\s+(?:(?:se\s+)?(?:vea|aparezca|muestre|tenga)|con|que\s+se\s+vea)\b|[,;]|\n|[.!?]/i)[0]
  .replace(/["”'»]+$/,'').trim().slice(0,68);
}
function visualRatio(text,kind){
 const q=normalizeCoreIntent(text);
 if(kind==='thumbnail'||/\b(?:16:9|youtube|horizontal|panoramica|apaisada|widescreen)\b/.test(q))return 'wide';
 if(/\b(?:9:16|historia|story|reel|tiktok|vertical|fondo de pantalla)\b/.test(q))return 'portrait';
 if(/\b(?:4:3|paisaje)\b/.test(q))return 'landscape';
 return 'square';
}
function visualStyle(text,kind){
 const q=normalizeCoreIntent(text);
 if(/\b(?:foto|fotografico|fotorealista|realista)\b/.test(q))return 'photo';
 if(/\b(?:3d|tridimensional)\b/.test(q))return '3d';
 if(/\b(?:anime|manga)\b/.test(q))return 'anime';
 if(/\b(?:ilustracion|dibujo|acuarela|vectorial)\b/.test(q))return 'illustration';
 if(kind==='logo')return 'illustration';
 return 'cinematic';
}
function visualQuestion(kind){
 if(kind==='thumbnail')return 'Claro. ¿De qué trata la miniatura de YouTube? Puedes indicar el texto grande, el ambiente y si llevará un rostro o elemento principal.';
 if(kind==='logo')return 'Claro. ¿Qué nombre o marca representará el logo y qué estilo buscas?';
 if(kind==='flyer'||kind==='banner')return 'Claro. ¿Qué vas a anunciar y qué texto o elementos debe llevar el diseño?';
 if(kind==='cover')return 'Claro. ¿De qué trata la portada y para dónde la usarás?';
 if(kind==='social')return 'Claro. ¿Qué quieres comunicar con la publicación? Si necesitas un formato específico, indícame si es post o historia.';
 return 'Claro. ¿Qué tipo de imagen quieres crear y qué debería aparecer en ella? Puedes describir el tema, el estilo y cualquier texto.';
}
async function generateVisualRequest(text,creds,kind){
 const headline=visualHeadline(text);
 const ratio=visualRatio(text,kind);
 const style=visualStyle(text,kind);
 const label={thumbnail:'miniatura de YouTube',logo:'logo',flyer:'flyer',banner:'banner',cover:'portada',social:'imagen para redes',illustration:'ilustración',image:'imagen'}[kind]||'imagen';
 const artDirection={
  thumbnail:'Create a premium YouTube thumbnail background, strong focal subject and 16:9 video composition, compelling clear lighting, readable at small sizes.',
  logo:'Create a clean, distinctive, scalable visual identity concept, balanced geometry and simple recognizable forms.',
  flyer:'Create a polished advertising flyer composition with professional visual hierarchy, clear main subject.',
  banner:'Create a professional promotional banner with excellent hierarchy and ample negative space.',
  cover:'Create a sophisticated cover image with an expressive central visual and polished art direction.',
  social:'Create a refined compelling social media artwork with strong visual clarity.',
  illustration:'Create a coherent creative illustration with skilled composition.',
  image:'Create a high quality image faithful to the exact request, clear subject and professional visual composition.'
 }[kind]||'Create a high quality image.';
 const prompt=artDirection+' Subject, scene, mood and user requirements: '+text+'. '+
  (headline?'Reserve a clean area for a precise typography overlay to be applied locally. Do not draw any letters or text in the generated background.':'Avoid unwanted watermarks and illegible small lettering.');
 status('Generando '+label+' con respaldo automático si el motor principal no está disponible…');
 const result=await runTool('image-gen',[],{
  ...creds,prompt,provider:$('#core-image-provider')?.value||'auto',ratio,style
 },(p,msg)=>{status(msg||'Generando imagen…');setProgress(Math.max(.05,Math.min(.96,Number(p)||.1)),msg||'Generando '+label+'…');});
 if(!result?.blob||!String(result.blob.type||'').startsWith('image/'))throw Error('El motor no devolvió una imagen utilizable.');
 if(headline){
  try{
   const typed=await applyImageText(result.blob,headline,ratio);
   result.blob=typed;
   result.filename='prisma-'+kind+'-'+Date.now()+'.png';
   result.previewUrl=URL.createObjectURL(typed);
   result.summary=(result.summary||'Imagen creada')+' · Texto aplicado gratis en el navegador.';
  }catch(error){console.warn('No se pudo componer texto localmente:',error);}
 }
 result.originTopic=text;result.suggestedText=headline;result.visualRatio=ratio;
 addMessage('assistant','Aquí tienes tu '+label+'. Puedes descargarla, editar el texto gratis o solicitar otra versión.'+(headline?' El texto solicitado se añadió localmente cuando el navegador lo permitió.':''),{
  results:[{name:'Resultado: '+label,reason:'Generación visual solicitada',result}]
 });
 status('Imagen lista para descargar y editar.','success');
}
async function handleImageCreationRequest(text){
 const chat=conversations.find(item=>item.id===activeConversationId);
 if(!chat)return false;
 const pending=chat.thumbnailBrief;
 const kind=pending?.kind||imageCreationType(text);
 const uploadedImage=attachments.find(file=>String(file.type||'').startsWith('image/'));
 const wantsText=/(?:anade|anadir|agrega|escribe|pon|coloca|editar|edita).{0,45}(?:texto|titulo|frase|imagen|miniatura)/i.test(normalizeCoreIntent(text));
 if(uploadedImage&&wantsText){
  await openImageEditor({blob:uploadedImage,filename:uploadedImage.name,initialText:visualHeadline(text),onSave:async output=>{
   addMessage('assistant','Imagen editada localmente. Ya puedes descargar el resultado.',{
    results:[{name:'Imagen editada',reason:'Edición gratuita y local',result:output}]
   });
   attachments=[];renderAttachments();
  }});
  status('Editor de imágenes abierto, sin consumir créditos.','success');return true;
 }
 if(!pending&&!kind)return false;
 if(pending&&/^(?:cancelar|cancela|olvida|no quiero|salir|deja eso)\b/i.test(normalizeCoreIntent(text))){
  chat.thumbnailBrief=null;persistChatHistory();
  addMessage('assistant','Cancelé el diseño pendiente. ¿Qué necesitas ahora?');return true;
 }
 const description=pending?String(pending.original||'')+'\n'+String(text||''):String(text||'');
 if(!visualContextEnough(pending?text:description)){
  chat.thumbnailBrief={kind:kind||'image',original:pending?.original||text,started:Date.now()};
  persistChatHistory();
  addMessage('assistant',visualQuestion(kind||'image'));
  status('Esperando el contexto de la imagen; no se consumió cuota.','info');
  return true;
 }
 chat.thumbnailBrief=null;persistChatHistory();
 try{
  const available=await getCentralProviderStatus();
  centralProviders=available.providers||centralProviders;
  centralFeatures=available.features||centralFeatures;
  centralModelCatalog=available.modelCatalog||centralModelCatalog;
  await generateVisualRequest(description,credentials(),kind||'image');
 }catch(error){
  const detail=String(error?.message||'El motor de imágenes no respondió.').slice(0,420);
  addMessage('assistant','Entendí tu diseño, pero no pude completar la generación porque los motores disponibles fallaron o alcanzaron sus límites. Tu descripción no necesita cambiar. '+detail+' Puedes probar otro motor en Laboratorio IA o reintentar después.');
  status('El diseño se entendió, pero el motor no pudo producirlo.','warning');
 }
 return true;
}
function directCoreTask(text){
 if(attachments.length)return null;
 const q=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const isPrompt=/(?:\bprompt\b|\bidea\b|\bguion\b|\bdescripcion\b|\btexto\b|\bplan\b).{0,40}(?:imagen|miniatura|video|audio)|(?:imagen|miniatura|video).{0,40}(?:\bprompt\b|\bidea\b|\bguion\b|\bdescripcion\b|\btexto\b)/.test(q);
 if(/\b(pdf|docx|xlsx|excel|csv|zip|ocr|archivo|subir|descargar|comprimir|convertir formato|rotar paginas|extraer paginas|codigo qr|codigo de barras|quitar fondo|eliminar fondo|redimensionar|transcribir audio|procesar video)\b/.test(q))return null;
 if(!isPrompt&&/(?:gener|crea|crear|haz|hacer|dibuja|editar|produce|producir|renderiza|conviert).{0,55}\b(imagen|foto|ilustracion|miniatura|poster|video|audio|mp3|wav|archivo 3d|modelo 3d)\b/.test(q))return null;
  const mentionsSong=/\b(letra|cancion|compon|composicion musical|estrofa|verso|coro|alabanza|balada)\b/.test(q);
  const requestsSong=/^(?:por favor )?(?:(?:crea|crear|haz(?:me)?|escribe|compone|compon|genera|prepara|dame|quiero|necesito|inventa|produce|redacta|puedes hacer|me gustaria)\b|(?:(?:una|otra|nueva|otra nueva) )?(?:cancion|letra|alabanza|balada)\b|y si (?:hacemos|creamos|escribimos)\b)/.test(q)||/\b(?:crea|crear|haz|hazme|hazla|escribe|compone|compon|genera|prepara|dame|produce|inventa|redacta|modifica|cambia|ajusta|reescribe)\s+(?:(?:otra|una|nueva)\s+)?(?:cancion|letra|alabanza|balada)?\b/.test(q);
  if(mentionsSong&&requestsSong)return 'songwriting';
 if(/\b(codigo|programacion|javascript|typescript|python|sql|script|debug|desarrolla una funcion|corrige esta funcion)\b/.test(q))return 'coding';
 if(/\b(youtube|miniatura|instagram|tiktok|publicacion|marketing|anuncio|titulo|descripcion del video)\b/.test(q))return 'creative';
 if(/\b(analiz|investig|compara|explica|razona|solucion|estrategia|plan de|evalua)\b/.test(q))return 'reasoning';
 return 'conversation';
}
async function answerConversation(text,creds,task='conversation'){
  status(task==='songwriting'?'Componiendo una canción original…':'Prisma está preparando tu respuesta…');
  const instruction=task==='songwriting'
   ? 'Escribe una canción enteramente original con título, versos, coro, puente y una propuesta breve de producción; no simules haber generado audio.'
   : task==='creative'?'Entrega la pieza creativa solicitada, lista para copiar o adaptar.'
   : task==='coding'?'Resuelve la solicitud de programación e incluye código. No simules ejecución.'
   : 'Responde de forma natural a la solicitud actual, atendiendo correctamente los turnos anteriores.';
  const taskText=String(text||'');
  const toolId=task==='songwriting'?'music-lyrics':
   task==='coding'?'ai-code-helper':
   /\b(youtube|tiktok|instagram|hashtags|miniatura|publicacion|redes sociales)\b/i.test(taskText)&&task==='creative'?'ai-youtube-kit':
   /\b(guia de estudio|apuntes|cuestionario|tarjetas de estudio)\b/i.test(taskText)?'ai-study-notes':'ai-assistant';
  const contextMessages=messages.slice(-13,-1).filter(m=>['user','assistant'].includes(m.role)&&String(m.content||'').trim())
   .map(m=>({role:m.role,content:String(m.content).slice(0,1800)}));
  const connectedNames={groq:'Groq',gemini:'Gemini',cloudflare:'Cloudflare Workers AI',huggingface:'Hugging Face',pollinations:'Pollinations',openrouter:'OpenRouter',kilo:'Kilo Gateway',requesty:'Requesty',sensenova:'SenseNova',zai:'Z.AI',baidu:'Baidu Qianfan',aihubmix:'AIHubMix',amd:'AMD Token Factory'};
  const connected=Object.entries(centralProviders).filter(([id,enabled])=>enabled&&connectedNames[id]).map(([id])=>connectedNames[id]);
  if(creds.polliToken&&!connected.includes('Pollinations'))connected.push('Pollinations Connect personal');
  const providerContext=connected.length
    ?'Motores de texto configurados en el servidor: '+connected.join(', ')+'. Configurado no significa disponibilidad garantizada: respeta sus cuotas y no inventes cuál respondió.'
    :'No se ha confirmado ningún motor compartido conectado en este momento. No afirmes que un proveedor está disponible.';
  const assistantContext=[instruction,coreCapabilityContext(),providerContext].join('\n\n').slice(0,1950);
  const response=await runTool(toolId,[],{
    prompt:taskText,context:assistantContext,contextMessages,provider:'auto',
    reasoning:task==='reasoning'?'smart':'balanced',
    tone:task==='songwriting'||task==='creative'?'creative':'friendly',
    length:task==='songwriting'||task==='coding'||task==='reasoning'?'long':'medium',
    task,...creds
  },(p,msg)=>{status(msg||'Escribiendo…');setProgress(Math.max(.05,Math.min(.96,Number(p)||.12)),msg||'Escribiendo…');});
  const answer=String(response?.text||'').trim();
  if(!answer)throw Error('El motor seleccionado no devolvió contenido.');
  addMessage('assistant',answer,{engine:response.provider,model:response.model,fallbackFrom:response.fallbackFrom,fallbackReason:response.fallbackReason});
  status('Respuesta lista. Puedes continuar esta conversación.','success');
}

function speechIntent(message){
 const q=String(message||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(/(?:audio|voz)\s+a\s+texto|transcrib|subtitul/.test(q))return false;
 if(/(?:cancion|musica|melodia|instrumental|banda sonora)/.test(q)&&!/(?:letra|texto).*\b(?:voz|narrac|habla)/.test(q))return false;
 if(/^[¿?\s]*(?:que es|como funciona|para que sirve|cuanto cuesta|es posible|puedes explicar)\b/.test(q))return false;
 if(/^[¿?\s]*(?:por que|por qué|no me|me falla|error|fallo|problema)\b/.test(q))return false;
 const narration=/(?:leeme|\blee\b|lectura en voz alta|\bnarra\b|narrame|ponle voz|hablalo|dilo en voz alta|escuchar.*(?:texto|respuesta|mensaje))/.test(q);
 const generation=/(?:pas(?:a|ar|ame|alo|ala)|conviert|convert|transform|genera|generar|crea|crear|haz(?:me)?|graba|produce|quiero|necesito|guardar|guarda).{0,85}(?:audio|mp3|voz|narracion|hablado)/.test(q);
 const reverse=/(?:texto|archivo|documento|respuesta|mensaje|frase).{0,65}(?:a\s+audio|a\s+voz|en\s+audio|en\s+mp3)/.test(q);
 return narration||generation||reverse||/(?:texto\s+a\s+(?:voz|audio)|text\s*to\s*speech|\btts\b)/.test(q);
}
function inlineSpeechText(command){
 const full=String(command||'').trim();
 const quoted=full.match(/[«“"]([^«”"]{2,1600})[»”"]/);
 if(quoted)return quoted[1].trim();
 const separator=full.match(/(?:texto|frase|mensaje|contenido|que diga|lo siguiente)\s*[:：]\s*([\s\S]{2,})$/i);
 if(separator)return separator[1].trim();
 const natural=full.match(/^(?:convierte|convertir|pasa|pasame|pásame|hazme|genera|graba|narra|léeme|leeme)\s+(?:(?:este|el|mi|un)\s+)?(?:(?:texto|mensaje|frase)\s+)?(?:a|en)\s+(?:audio|voz|mp3)\s*[,;:\-]?\s+([\s\S]{2,})$/i);
 if(natural&&!/^(?:este texto|el texto|el archivo|un documento|mi documento|el documento)\s*$/i.test(natural[1].trim()))return natural[1].trim();
 const casual=full.match(/^(?:hazme|genera(?:me)?|crea(?:me)?|graba(?:me)?|quiero|necesito|dame|prepara(?:me)?|pon|dilo|di|narra|leeme|léeme)\s+(?:un\s+)?(?:audio|mp3|voz|locucion|locución)?\s*(?:que\s+(?:diga|suene|lea)|con\s+(?:la\s+)?frase|de\s+)?\s*[:,-]?\s*([\s\S]{3,})$/i);
 if(casual&&casual[1]&&!/^(?:este|el|mi)\s+(?:texto|archivo|documento|pdf|word)\s*$/i.test(casual[1].trim()))return casual[1].trim();
 const spoken=full.match(/(?:que\s+diga|para\s+decir)\s*[:,-]?\s*([\s\S]{3,})$/i);
 if(spoken)return spoken[1].trim();
 const colon=full.match(/[:：]\s*([^\n]{2,}(?:\n[\s\S]*)?)$/);
 if(colon)return colon[1].trim();
 const newlines=full.split(/\n+/).slice(1).join('\n').trim();
 if(newlines.length>2)return newlines;
 return '';
}
async function fulfillSpeechRequest(userText){
 const q=String(userText||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let content=inlineSpeechText(userText);
 let origin='texto proporcionado';
 if(!content&&attachments.length){
  if(attachments.length>1){addMessage('assistant','Para crear el audio, adjunta un documento a la vez. Puedes enviarme los demás después.');return;}
  const file=attachments[0],name=String(file.name||'').toLowerCase();
  status('Leyendo el documento en tu navegador, antes de generar el audio…');
  try{
   if(file.type==='application/pdf'||name.endsWith('.pdf')){
    const result=await runTool('pdf-text',[file],{},(p,msg)=>status(msg||'Leyendo PDF…'));
    content=String(result?.text||'').replace(/--- Página \d+ ---/g,' ').trim();
   }else if(name.endsWith('.docx')){
    const result=await runTool('docx-html',[file],{},(p,msg)=>status(msg||'Leyendo Word…'));
    const html=await result?.blob?.text?.();
    if(html)content=new DOMParser().parseFromString(html,'text/html').body.textContent||'';
   }else if(/\.(txt|md|markdown|html|htm)$/i.test(name)||file.type.startsWith('text/')){
    const raw=await file.text();
    content=/\.(html|htm)$/i.test(name)?new DOMParser().parseFromString(raw,'text/html').body.textContent||'':raw;
   }else if(file.type.startsWith('image/')){
    const result=await runTool('image-ocr',[file],{language:'spa'},(p,msg)=>status(msg||'Extrayendo texto de la imagen…'));
    content=result?.text||'';
   }else{
    addMessage('assistant','Este archivo todavía no tiene una ruta de lectura para texto a voz. Puedes adjuntar PDF con texto seleccionable, Word DOCX, TXT, Markdown, HTML o una imagen legible.');return;
   }
   origin='archivo '+file.name;
  }catch(error){addMessage('assistant','No pude leer el documento para producir una voz: '+(error?.message||'error de lectura')+'. Puedes pegar el texto directamente.');return;}
 }
 if(!content&&/(?:anterior|ultimo|ultima|acabas de|tu respuesta|lo que escribiste|lo que dijiste)/.test(q)){
  const last=messages.slice(0,-1).reverse().find(item=>item.role==='assistant'&&String(item.content||'').trim());
  if(last){content=String(last.content).trim();origin='respuesta anterior';}
 }
 if(!content){
  addMessage('assistant','Sí, puedo convertir texto a un archivo de audio MP3 descargable. Pega el contenido después de «Convierte a audio:» o adjunta un PDF, Word o archivo de texto. También puedes pedirme «lee tu respuesta anterior en voz».');
  status('Falta el texto para crear la voz.','info');return;
 }
 content=String(content).replace(/\s+/g,' ').trim();
 if(content.length<2){addMessage('assistant','No encontré texto legible para sintetizar. Puedes pegarlo directamente.');return;}
 if(content.length>1500){
  addMessage('assistant','Encontré '+content.length+' caracteres en '+origin+'. Para proteger tu presupuesto, cada audio admite hasta 1.500 caracteres. Indica un fragmento concreto o pega el párrafo que quieres escuchar; no voy a recortar el documento sin avisarte.');
  status('Texto demasiado largo para la cuota de voz.','info');return;
 }
 if(attachments.length)addMessage('assistant','Preparé el texto de '+origin+'. Para generar el MP3, ese texto se enviará al proveedor de voz conectado; los archivos originales no se enviarán.');
 status('Generando una voz real con el texto solicitado…');
 const result=await runTool('ai-voice',[],{
  ...credentials(),prompt:content,provider:'auto',
  model:'openai/tts-1',voice:'nova',format:'mp3'
 },(progress,message)=>{status(message||'Generando audio…');setProgress(Math.max(.05,Math.min(1,Number(progress)||.15)),message||'Generando audio…');});
 if(!result?.blob||!String(result.blob.type||'').startsWith('audio/'))throw Error('El motor no devolvió un archivo de audio válido.');
 addMessage('assistant','Aquí tienes la narración en audio. Puedes reproducirla y descargarla en MP3.',{
  results:[{name:'Texto convertido a voz',reason:'Audio generado a partir de '+origin,result}]
 });
 attachments=[];renderAttachments();$('#core-file-input').value='';
 status('Audio listo para escuchar y descargar.','success');
}
async function requestPlan(userText){
  // Simple greetings must work instantly, even when every external inference
  // provider is unavailable; do not spend AI quota on a basic salutation.
  const greeting=String(userText||'').trim().toLocaleLowerCase('es').normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').replace(/[!?,.¿¡]/g,'').trim();
  if(/^(hola+(?: prisma)?|holi+|hey|hello|buenas(?: tardes| noches| dias)?|saludos|buenos dias|buenas noches)$/.test(greeting)&&!attachments.length){
    addMessage('assistant','¡Hola! Soy Prisma Core. Pídeme una tarea o adjunta un archivo: puedo seleccionar las herramientas disponibles y ayudarte a crear, analizar o convertir contenido.');
    status('Listo para ayudarte.','success');
    return;
  }
   // Pure praise/thanks is a conversational turn, not a request to repeat the
   // previous creative task. "Muy buena canción" must not generate another song.
   const previousAssistant=messages.slice(0,-1).reverse().find(item=>item.role==='assistant'&&String(item.content||'').trim());
   if(!attachments.length&&isAcknowledgementMessage(userText)){
     addMessage('assistant',buildAcknowledgementReply(userText,previousAssistant?.content||''));
     status('Seguimos en la misma conversación.','success');
     return;
   }
  // Las preguntas sobre la identidad de Prisma y sus proveedores son hechos
  // del producto: no deben quedar expuestas a respuestas inventadas del LLM.
  if(!attachments.length){
    const productAnswer=resolvePrismaProductQuestion(userText,messages.slice(-16,-1),centralProviders);
    if(productAnswer){addMessage('assistant',productAnswer);status('Información de Prisma.','success');return;}
  }
  // Universal discovery is local and cost-free. The assistant knows the full
  // ready/beta registry and suggests related tools without provider requests.
  if(isToolDiscoveryQuestion(userText)){
    addMessage('assistant',describeCoreTools(userText,attachments));
    status('Herramientas relacionadas identificadas sin usar IA.','success');
    return;
  }
  // Existing-image edits must be handled before generative-visual intent.
  // In particular, "prepara ESTA imagen para mi web" must never spend a
  // remote image-generation request, with or without the attachment.
  const earlyHistory=messages.slice(-9,-1).filter(item=>item.role==='user').map(item=>item.content);
  const localImageIntent=planCoreOfflineAction(userText,attachments,earlyHistory);
  const hasImage=attachments.some(file=>String(file.type||'').startsWith('image/')||/\.(?:png|jpe?g|webp|gif|bmp)$/i.test(String(file.name||'')));
  if(localImageIntent&&(hasImage||!attachments.length&&localImageIntent.type==='needs-input')){
    if(localImageIntent.type!=='ready'){
      addMessage('assistant',localImageIntent.message);
      status('Adjunta la imagen original para editarla sin gastar IA.','info');
      return;
    }
    const localPlan={message:localImageIntent.message,steps:localImageIntent.steps,
      userRequest:userText,needs_clarification:false,combineFinalFiles:false};
    const localSteps=validatePlan(localPlan);
    if(!localSteps.every(({tool})=>['local','browser'].includes(tool.mode)))
      throw Error('Una edición local intentó utilizar un proveedor remoto.');
    pendingPlan={plan:localPlan,steps:localSteps};
    addMessage('assistant',localPlan.message);
    await executePlan();
    return;
  }
  // Genuine creation requests still use image generation, when intended.
  if(await handleImageCreationRequest(userText))return;
  // Text-to-speech is a real media output, never a prose-only model answer.
  if(speechIntent(userText)){await fulfillSpeechRequest(userText);return;}
  // Explicit conversions take priority over generic chat or PDF edit heuristics.
  const previousTexts=messages.slice(-9,-1).filter(message=>message.role==='user').map(message=>message.content);
  const fileConversion=planFileConversion(userText,attachments,previousTexts);
  if(fileConversion){
    if(fileConversion.type!=='ready'){
      addMessage('assistant',fileConversion.message);
      status('Convertidor preparado.','info');
      return;
    }
    const plan={message:fileConversion.message,steps:fileConversion.steps,userRequest:userText,needs_clarification:false,combineFinalFiles:true,conversion:true};
    const steps=validatePlan(plan);
    pendingPlan={plan,steps};
    addMessage('assistant',fileConversion.message);
    await executePlan();
    return;
  }
  const pdfAction=buildPdfEditPlan(userText);
  if(pdfAction){
   if(pdfAction.type!=='execute'){addMessage('assistant',pdfAction.message);status('Edición de documentos lista.','info');return;}
   const plan=pdfAction.plan;
   const steps=validatePlan(plan);
   pendingPlan={plan,steps};
   addMessage('assistant',plan.message);
   await executePlan();
   return;
  }
  const localCapability=describeUnattachedToolRequest(userText);
  if(localCapability){
   addMessage('assistant',localCapability);
   status('Herramienta disponible. Adjunta un archivo para continuar.','info');
   return;
  }
  const previousUserTexts=messages.slice(-9,-1).filter(m=>m.role==='user').map(m=>m.content);
  const guidedFlow=buildSmartLocalFlow(userText,attachments,previousUserTexts);
  if(guidedFlow){
    if(guidedFlow.type!=='ready'){
      addMessage('assistant',guidedFlow.message);
      status('Entendí la operación: falta información para ejecutarla.','info');
      return;
    }
    const preserveMultiple=guidedFlow.steps.some(item=>['ai-transcribe','image-ocr','image-identify-local','csv-profile-local','ai-assistant'].includes(item.tool_id));
    const guidedPlan={message:guidedFlow.message,steps:guidedFlow.steps,needs_clarification:false,userRequest:userText,combineFinalFiles:!preserveMultiple};
    const guidedSteps=validatePlan(guidedPlan);
    pendingPlan={plan:guidedPlan,steps:guidedSteps};
    const external=guidedSteps.some(({tool})=>!['local','browser'].includes(tool.mode));
    if(external){showPlan(guidedPlan,guidedSteps);status('Este flujo usa un servicio externo; revisa y autoriza.','warning');}
    else{addMessage('assistant',guidedPlan.message);await executePlan();}
    return;
  }
  // More local tools are reachable from chat even without any provider quota:
  // image privacy/effects, video speed/orientation, audio normalization,
  // file inspection, hashes and safe text processing.
  const directLocal=planCoreOfflineAction(userText,attachments,previousUserTexts);
  if(directLocal){
    if(directLocal.type!=='ready'){
      addMessage('assistant',directLocal.message);
      status('Falta un dato necesario para ejecutar esta herramienta.','info');
      return;
    }
    const directPlan={message:directLocal.message,steps:directLocal.steps,userRequest:userText,
      needs_clarification:false,combineFinalFiles:!directLocal.steps.some(s=>['image-palette','image-metadata','audio-waveform'].includes(s.tool_id))};
    const directSteps=validatePlan(directPlan);
    if(!directSteps.every(({tool})=>['local','browser'].includes(tool.mode)))throw Error('El flujo gratuito incluye una herramienta de consumo externo.');
    pendingPlan={plan:directPlan,steps:directSteps};
    addMessage('assistant',directPlan.message);
    await executePlan();
    return;
  }
  const centralStatus=await getCentralProviderStatus();
  centralProviders=centralStatus.providers||{gemini:false,huggingface:false,groq:false,cloudflare:false,pollinations:false,openrouter:false,kilo:false,requesty:false,sensenova:false,zai:false,baidu:false,aihubmix:false,amd:false};
  centralFeatures=centralStatus.features||centralFeatures;
  centralModelCatalog=centralStatus.modelCatalog||centralModelCatalog;
  const creds=credentials();
  const hasConnectedModel=!!(creds.polliToken||creds.hfToken||creds.geminiKey||creds.groqKey||Object.values(centralProviders).some(Boolean));
  // Las peticiones de generación visual ya fueron atendidas por el flujo contextual.
  const directTask=directCoreTask(userText);
  if(directTask){
    if(hasConnectedModel)await answerConversation(userText,creds,directTask);
    else {addMessage('assistant','Puedo ayudarte con esta petición, pero los motores de texto no están disponibles ahora. Las herramientas locales siguen funcionando. Revisa Laboratorio IA o vuelve a intentarlo.');status('Motores de texto no disponibles.','warning');}
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
  let miniShortlist=null;
  if(localBrainEnabled){
    try{
      const baseline=compactPlanningCatalog(userText);
      // The semantic model only reorders known, safe tools; it never executes an action.
      miniShortlist=await rankLocalTools(userText,baseline,28);
      status('Prisma Mini analizó las herramientas en este dispositivo; completando planificación…');
    }catch(error){
      console.warn('Prisma Mini ranking unavailable',error?.message||error);
      localBrainEnabled=false;
      const miniButton=$('#core-mini-toggle');
      if(miniButton)miniButton.textContent='Activar Prisma Mini';
    }
  }
  const plannerPrompt=buildPlannerPrompt(userText+attachmentContext.slice(0,7500),miniShortlist);
  let plan,steps;
  // Provider/network errors must not trigger a second costly inference request.
  // Deterministic tools already ran without consuming inference; plan only
  // unresolved tasks, using inexpensive models for routine selections.
  const complexPlanning=attachments.length>2||userText.length>340||
    /(?:primero|despues|luego|ademas|finalmente|por separado|varios formatos|combina.*y.*convierte|compar.*y.*resum)/i.test(userText);
  const result=await runTool('ai-assistant',[],{
    prompt:plannerPrompt,provider:'auto',reasoning:complexPlanning?'balanced':'fast',
    tone:'professional',length:complexPlanning?'long':'medium',task:'planner',...creds
  },(p,msg)=>{status(msg||'Planificando…');setProgress(.04+Math.max(0,Math.min(1,Number(p)||0))*.12,msg||'Planificando…');});
  try{
    plan=parsePlan(result.text);
    if(!plan.needs_clarification)steps=validatePlan(plan);
  }catch(firstError){
    // Avoid a second large planner request that wastes quotas. Use the local
    // rule-based planner when it can identify a safe operation; otherwise
    // explain the limitation instead of silently showing a dead approval form.
    console.warn('Prisma Core plan invalid; using deterministic fallback',firstError?.message||firstError);
    const local=buildLocalPlan(userText);
    if(local.steps?.length){
      const safeLocal=local.steps.every(step=>tools.some(tool=>tool.id===step.tool_id&&['local','browser'].includes(tool.mode)));
      if(safeLocal){plan=local;steps=validatePlan(local);}
    }
    if(!plan){
      addMessage('assistant','Entendí tu solicitud, pero no pude construir una secuencia segura de herramientas. Intenta describir el resultado final o abre la herramienta correspondiente en Explorar. Los motores de IA siguen disponibles para responder preguntas y redactar contenido.');
      status('No fue posible organizar el flujo; prueba una instrucción más específica.','warning');
      return;
    }
  }
  plan.userRequest=userText+attachmentContext;
  if(plan.needs_clarification){showPlan(plan,[]);addMessage('assistant',plan.message||plan.question||'Necesito una aclaración antes de continuar.');status('Hace falta una aclaración.','warning');return;}
  if(!steps.length){addMessage('assistant',plan.message||'No encontré una herramienta disponible para esa solicitud.');status('No se generó un plan ejecutable.','warning');return;}
  // A single expressly requested generation can run directly; approvals remain
  // for multi-provider pipelines or other external actions.
  const safeSingleGeneration=steps.length===1&&['ai-assistant','music-lyrics','image-gen','ai-youtube-kit','ai-prompt-lab','ai-study-notes','ai-code-helper'].includes(steps[0].tool.id);
  const requiresApproval=!safeSingleGeneration&&steps.some(({tool})=>!['local','browser'].includes(tool.mode));
  if(requiresApproval){showPlan(plan,steps);status('Este flujo usa servicios externos. Revisa y autoriza antes de continuar.','warning');setProgress(1,'Esperando tu autorización');}
  else{pendingPlan={plan,steps};$('#core-plan').classList.add('hidden');await executePlan();}
}
async function executePlan(){
  if(!pendingPlan||executionActive)return;
  const {plan,steps}=pendingPlan;pendingPlan=null;
  $('#core-plan').classList.add('hidden');executionActive=true;cancelRequested=false;setBusy(true);
  const executed=[];let currentFiles=[...attachments],lastText='',successful=false;
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
      // Pass the previous result to the next compatible text tool without
      // invoking another model. Explicit model-supplied text always wins.
      const textHandoff=['text-sort','word-frequency','text-remove-accents','text-reverse',
        'text-extract-emails','text-extract-urls','text-remove-empty-lines','text-prefix-lines',
        'text-replace','text-extract-hashtags','text-extract-phones','json-minify','json-format',
        'json-flatten','json-yaml','json-xlsx','json-csv','csv-json','csv-stats','csv-to-tsv-local',
        'tsv-to-csv-local','json-to-xml-local','xml-to-json-local','html-to-text','html-to-markdown-local',
        'text-summary-local','text-analyzer-local','reading-time-local','text-dedupe-words-local',
        'word-count','clean-text','text-case','dedupe-lines','slug','markdown','html-format',
        'css-format','js-format','sql-format','xml-format','text-reverse','qr','base64','url-code'];
      if(!params.text&&lastText&&textHandoff.includes(tool.id))params.text=lastText;
      if(tool.id==='ai-voice'&&!params.prompt&&!params.text&&lastText)params.prompt=lastText;
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
      else if(result?.html)lastText=String(result.html).slice(0,30000);
      else if(result?.blob&&result.blob.size<=120000&&
        /^(?:text\/|application\/(?:json|xml))/.test(String(result.blob.type||''))){
        lastText=(await result.blob.text()).slice(0,30000);
      }
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
      const single=executed.length===1?executed[0]:null;
      if(single&&['ai-assistant','music-lyrics','ai-youtube-kit','ai-prompt-lab','ai-study-notes','ai-code-helper'].includes(steps[0].tool.id)&&single.result?.text&&!single.result?.blob){
        addMessage('assistant',String(single.result.text),{engine:single.result.provider,model:single.result.model,fallbackFrom:single.result.fallbackFrom,fallbackReason:single.result.fallbackReason});
      }else{
        const visibleResults=plan.combineFinalFiles&&executed.length?executed.slice(-1):executed;
        const label=plan.conversion?'Conversión preparada. Descarga el archivo resultante o sigue las instrucciones de impresión si aparecen.':plan.combineFinalFiles?'Proceso completado. Aquí tienes el archivo final con las modificaciones solicitadas.':executed.length===1&&steps[0].tool.id==='image-gen'?'Aquí tienes la imagen que pediste. Puedes descargarla desde esta misma conversación.':'Completé '+executed.length+' operación(es). Aquí están tus resultados.';
        addMessage('assistant',label,{results:visibleResults,partial:false});
      }
      successful=true;
      status('Ejecución completada.','success');
    }
  }catch(error){
    console.error(error);
    addMessage('assistant','No pude completar toda la tarea: '+(error?.message||'error inesperado')+'.'+(executed.length?' Conservé los resultados anteriores.':' Puedes ajustar la solicitud o volver a intentar.'),{results:executed,partial:true});
    status('Ejecución detenida.','error');
  }finally{
    executionActive=false;setBusy(false);
    // Keep source files available after a failed or cancelled operation, so the
    // user can correct a page range without uploading the original PDF again.
    if(successful){attachments=[];$('#core-file-input').value='';}
    renderAttachments();
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
    if(result.printHtml){
      const button=document.createElement('button');button.type='button';button.className='mini-button';
      button.textContent='Abrir vista y guardar como PDF';
      button.addEventListener('click',()=>{
        const win=window.open('','_blank');
        if(!win){status('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo otra vez.','warning');return;}
        win.document.open();win.document.write(String(result.printHtml));win.document.close();
        win.addEventListener('load',()=>win.print(),{once:true});
      });
      card.append(button);
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
      row.append(label,button);
      if(String(result.blob.type||'').startsWith('image/')){
       const edit=document.createElement('button');edit.type='button';edit.className='mini-button core-edit-thumb';edit.textContent='Añadir texto / Editar';
       edit.addEventListener('click',async()=>{
        try{await openImageEditor({blob:result.blob,filename:result.filename,initialText:result.suggestedText||'',onSave:async output=>{
         addMessage('assistant','Imagen editada en tu dispositivo, sin gastar otra generación de IA.',{
          results:[{name:'Imagen con texto',reason:'Edición local gratuita',result:{...output,previewUrl:URL.createObjectURL(output.blob)}}]
         });
         status('Miniatura editada y lista para descargar.','success');
        }});}catch(error){status(error?.message||'No pude abrir el editor.','warning');}
       });
       row.append(edit);
       const variation=document.createElement('button');variation.type='button';variation.className='mini-button';
       variation.textContent='Otra versión';
       variation.addEventListener('click',()=>{
         const last=messages.slice().reverse().find(entry=>entry.role==='user'&&/(?:miniatura|imagen|foto|diseñ|gener)/i.test(entry.content));
         const input=$('#core-input');input.value=(last?.content||'Genera una imagen atractiva')+'; crea otra versión con una composición distinta, más detalles y mejor calidad visual.';
         input.dispatchEvent(new Event('input'));input.focus();
         status('Petición preparada. Enviar generará otra imagen y utilizará cuota del modelo seleccionado.','info');
       });
       row.append(variation);
      }
      if(result.blob.size<=200*1024*1024&&!/\\.zip$/i.test(result.filename||'')){
        const reuse=document.createElement('button');reuse.type='button';reuse.className='mini-button';
        reuse.textContent='Usar en otra tarea';
        reuse.title='Seleccionar el resultado para convertirlo o editarlo de nuevo dentro de Prisma Core';
        reuse.addEventListener('click',()=>{
          attachments=[new File([result.blob],result.filename||'prisma-resultado',{type:result.blob.type||'application/octet-stream'})];
          renderAttachments();$('#core-input')?.focus();
          status('Resultado seleccionado. Escribe qué deseas hacer ahora con este archivo.','success');
        });
        row.append(reuse);
      }
      card.append(row);
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
  input.value='';input.style.height='39px';
  // An attachment-only reply should continue a pending PDF editing request,
  // instead of launching an unrelated AI analysis of the uploaded document.
  const awaitingPdfEdit=attachments.some(file=>file.type==='application/pdf'||/\\.pdf$/i.test(file.name))&&
    messages.slice(-9,-1).some(item=>item.role==='user'&&isPdfEditIntent(item.content));
  const priorRequest=messages.slice(-9,-1).reverse().find(m=>m.role==='user'&&String(m.content||'').trim())?.content||'';
  const requestText=text||(awaitingPdfEdit?'Aquí está el archivo PDF para editar.':priorRequest?'Aquí está el archivo para la tarea anterior.':'Analiza los archivos adjuntos y recomienda operaciones útiles.');
  setBusy(true);
  try{await requestPlan(requestText);}
  catch(error){
    console.warn('Prisma Core',error?.code||error?.message||error);
    const detail=String(error?.message||'');
    const globalLimit=error?.code==='GLOBAL_LIMIT'||/Prisma alcanzó su límite temporal gratuito global|Se alcanzó el límite de solicitudes de Prisma/i.test(detail);
    const providerLimit=error?.code==='PROVIDER_LIMIT'||error?.code==='PROVIDER_MINUTE_LIMIT';
    if(globalLimit||providerLimit){
      addMessage('assistant',localQuotaExplanation(globalLimit?'GLOBAL_LIMIT':error?.code||'PROVIDER_LIMIT'));
      status('Se alcanzó una cuota temporal.','warning');
    }else{
      addMessage('assistant','No pude completar esa operación con los motores disponibles. '+detail.slice(0,280)+' Puedes seguir utilizando las herramientas locales.');
      status('El motor no respondió.','warning');
    }
  }
  finally{setBusy(false);}
}
function renameActiveChat(){
 if(busy||executionActive)return;
 const chat=conversations.find(x=>x.id===activeConversationId);if(!chat)return;
 const title=window.prompt('Nombre de la conversación',chat.title);
 if(!title?.trim())return;
 chat.title=title.trim().slice(0,70);chat.titled=true;chat.updated=Date.now();
 persistChatHistory();renderConversationList();updateChatScreen();
}
function deleteActiveChat(){
 if(busy||executionActive)return;
 const chat=conversations.find(x=>x.id===activeConversationId);if(!chat)return;
 if(!window.confirm('¿Eliminar definitivamente esta conversación? Esta acción también la borrará de la nube si activaste la sincronización.'))return;
 const id=chat.id;
 conversations=conversations.filter(x=>x.id!==id);
 if(!conversations.length)conversations=[newChatRecord()];
 activeConversationId=conversations[0].id;messages=conversations[0].messages.slice();attachments=[];renderAttachments();
 pendingPlan=null;$('#core-plan')?.classList.add('hidden');
 persistChatHistory();renderMessages({forceBottom:true});renderConversationList();updateChatScreen();
 document.dispatchEvent(new CustomEvent('prisma:chat-deleted',{detail:{id}}));
}
function exportActiveChat(){
 const chat=conversations.find(x=>x.id===activeConversationId);if(!chat)return;
 const payload={title:chat.title,exportedAt:new Date().toISOString(),messages:messages.map(m=>({role:m.role,content:String(m.content||''),time:m.time}))};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='prisma-chat-'+new Date().toISOString().slice(0,10)+'.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),800);status('Conversación exportada.','success');
}
export function initPrismaCore(){
  const root=$('#core-section');if(!root)return;
  const integratedHistory=$('#core-history');
  const mainSidebarSlot=$('#core-sidebar-conversations');
  const sidebarSearchSlot=$('#sidebar-search-slot');
  const sidebarNewChatSlot=$('#sidebar-new-chat-slot');
  if(integratedHistory&&mainSidebarSlot)mainSidebarSlot.replaceChildren(integratedHistory);
  // The chat search and new-chat action live in the persistent sidebar shell,
  // not inside the Core-only history list. They remain available on every view.
  const chatSearch=$('#core-history-search');
  const newChatButton=$('#core-history-new');
  if(chatSearch&&sidebarSearchSlot)sidebarSearchSlot.append(chatSearch);
  if(newChatButton&&sidebarNewChatSlot)sidebarNewChatSlot.append(newChatButton);
  initImageEditor();
  initPrismaVoice();
  loadChatHistory();
  renderMessages({forceBottom:true});updateChatScreen();
  document.addEventListener('prisma:core-export-request',exportActiveChat);
  document.addEventListener('prisma:core-rename-request',renameActiveChat);
  document.addEventListener('prisma:core-delete-request',deleteActiveChat);
  document.addEventListener('prisma:remote-chats-ready',()=>{if(busy||executionActive)return;loadChatHistory();userPinnedToBottom=true;renderMessages({forceBottom:true});updateChatScreen();});
  $('#core-history-search')?.addEventListener('input',event=>{conversationSearch=String(event.target.value||'').toLocaleLowerCase('es').trim();renderConversationList();});
  $('#core-history-toggle')?.addEventListener('click',()=>$('#core-workspace')?.classList.toggle('history-open'));
  $('#core-history-close')?.addEventListener('click',closeConversationDrawer);
  $('#core-history-backdrop')?.addEventListener('click',closeConversationDrawer);
  $('#core-history-new')?.addEventListener('click',startNewConversation);
  $('#core-messages').addEventListener('scroll',()=>{userPinnedToBottom=isNearBottom($('#core-messages'));},{passive:true});
  $('#core-send').addEventListener('click',sendMessage);
  const miniButton=$('#core-mini-toggle');
  miniButton?.addEventListener('click',async()=>{
    if(localBrainEnabled){localBrainEnabled=false;miniButton.textContent='Activar Prisma Mini';status('Prisma Mini en pausa. Las herramientas locales siguen disponibles.');return;}
    if(busy)return;
    miniButton.disabled=true;
    miniButton.textContent='Descargando Prisma Mini…';
    status('Descargando el modelo ONNX de clasificación al navegador. No se utiliza ninguna API de inferencia…');
    try{
      await loadLocalBrain(percent=>{
        miniButton.textContent='Descargando Prisma Mini… '+percent+'%';
      });
      localBrainEnabled=true;
      miniButton.textContent='Prisma Mini activo';
      status('Prisma Mini listo: seleccionará herramientas localmente. No es un chatbot generativo.','success');
    }catch(error){
      miniButton.textContent='Activar Prisma Mini';
      status('No se pudo descargar el motor local en este dispositivo. Prisma seguirá usando sus demás capacidades.','warning');
      console.warn('Prisma Mini could not load',error?.message||error);
    }finally{
      miniButton.disabled=false;
    }
  });
  $('#core-cancel').addEventListener('click',()=>{if(!executionActive||!busy)return;cancelRequested=true;$('#core-cancel').disabled=true;status('Detendré la secuencia al terminar la operación actual…','warning');});
  $('#core-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage();}});
  $('#core-input').addEventListener('input',event=>{
    const input=event.target;
    input.style.height='44px';
    input.style.height=Math.min(110,Math.max(44,input.scrollHeight))+'px';
  });
  // Motor de imágenes: desplegable discreto que se cierra fuera o con Escape.
  const imageSettings=$('.core-model-settings');
  document.addEventListener('pointerdown',event=>{
    if(imageSettings?.open&&!imageSettings.contains(event.target))imageSettings.open=false;
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&imageSettings?.open)imageSettings.open=false;
  });
  $('#core-file-button').addEventListener('click',()=>$('#core-file-input').click());
  $('#core-file-input').addEventListener('change',event=>{
    const incoming=[...event.target.files];const total=attachments.reduce((sum,file)=>sum+file.size,0)+incoming.reduce((sum,file)=>sum+file.size,0);
    if(total>100*1024*1024){status('El total de archivos no puede superar 100 MB.','warning');event.target.value='';return;}
    attachments=[...attachments,...incoming].slice(0,8);renderAttachments();event.target.value='';
  });
  $('#core-clear').addEventListener('click',startNewConversation);
  const openConnections=()=>document.querySelector('[data-view="ai"]')?.click();
  $('#core-open-settings').addEventListener('click',openConnections);
  $('#core-connect-now').addEventListener('click',openConnections);
  getCentralProviderStatus().then(result=>{
    centralProviders=result.providers||{gemini:false,huggingface:false,groq:false,cloudflare:false,pollinations:false,openrouter:false,kilo:false,requesty:false,sensenova:false,zai:false,baidu:false,aihubmix:false,amd:false};
    centralFeatures=result.features||centralFeatures;
    centralModelCatalog=result.modelCatalog||centralModelCatalog;
    const creds=credentials();
    const ready=!!(creds.polliToken||creds.hfToken||creds.geminiKey||creds.groqKey||Object.values(centralProviders).some(Boolean));
    $('#core-connect-banner')?.classList.toggle('hidden',ready);
  });
  status('Listo. Escribe una tarea o adjunta un archivo.','info');
  $('#core-cancel').disabled=false;
}
