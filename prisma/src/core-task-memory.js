// Per-conversation task references, memory-only: no uploads, prompts or credentials.
import { normalizeIntent, extractPayload } from './core-capabilities.js';
export function createTaskMemory({maxBytes=120*1024*1024,maxChats=8,ttl=30*60*1000,now=Date.now}={}){
 const tasks=new Map(),pending=new Map();
 const get=id=>{const t=tasks.get(id);if(t&&now()-t.updated>ttl){tasks.delete(id);return null;}return t||null;};
 return {get,clear:id=>{tasks.delete(id);pending.delete(id);},clearAll:()=>{tasks.clear();pending.clear();},
 wait(id,request,files=[]){pending.set(id,{request,files,updated:now()});if(pending.size>maxChats)pending.delete(pending.keys().next().value);},
 save(id,{files=[],originals=[],steps=[],text='',execution=null}={}){tasks.delete(id);pending.delete(id);const bytes=[...files,...originals].reduce((n,f)=>n+(f.size||0),0)+text.length*2;if(bytes>maxBytes)return false;tasks.set(id,{files,originals,text,execution,steps:steps.map(s=>({tool_id:s.tool_id,params:{...s.params}})),updated:now(),bytes});while(tasks.size>maxChats||[...tasks.values()].reduce((n,t)=>n+t.bytes,0)>maxBytes)tasks.delete(tasks.keys().next().value);return true;},
 resolve(id,query,newFiles=[]){const task=get(id),q=normalizeIntent(query).trim();
  if(/^(?:no[,\s]+)?(?:cancela|cancelar|detente|no hagas (?:nada|lo anterior))\b/.test(q)){tasks.delete(id);pending.delete(id);return {task:null,files:[],cancelled:true};}
  const waiting=pending.get(id);
  // Attachment-only turns and format clarifications must retain the latest unfinished
  // objective, not resurrect a prior successful split or conversion.
  // Confirmations only resume a task that is genuinely waiting, never replay a completed job.
  const confirmReply=/^(?:si|adelante|ejecuta|procede|confirmo|reintenta|intentalo de nuevo|vuelve a intentar|hazlo|continua)[.!\s]*$/.test(q);
  const uploadReply=/^(?:aqui|ahi|adjunto|te envio|ya (?:lo )?(?:subi|cargue|adjunte)|listo|hazlo|este archivo|el archivo|el pdf|procesa (?:los |estos |mis )?archivos?(?: adjuntos?)?|procesa (?:este |el )?(?:archivo|pdf)|continua (?:con )?(?:el |los )?archivos?|\d|png$|webp$|jpg$)/.test(q);
  const formatReply=/^(?:a|en|como)\s+(?:word|docx|pdf|png|jpe?g|webp|csv|json|excel|xlsx|mp3|wav|txt|html)[.!?\s]*$/.test(q);
  if(waiting&&now()-waiting.updated<ttl&&(confirmReply||uploadReply||formatReply)){
   return {task:null,files:newFiles.length?newFiles:waiting.files,request:confirmReply?waiting.request:formatReply?'Convierte '+(/pdf/i.test(waiting.request)?'el PDF':'el archivo')+' '+query:waiting.request+' '+query};
  }
  if(waiting)pending.delete(id);
  if(!task)return {task:null,files:newFiles};
  // Bind explicit file references to this chat's latest completed operation.
  // Read only the instruction: quoted text and JSON values are not references.
  const instruction=normalizeIntent(extractPayload(query).instruction).split(/[,;.!?]|\s+(?:y|pero)\s+|\s+(?=sin\b)/)
   .filter(clause=>!/^\s*(?:no\b|sin\b|nunca\b|ignora\b|descarta\b)/.test(clause)).join('. ');
  const originalReference=/\b(?:el (?:archivo |documento )?original|los (?:archivos |documentos )?originales|(?:el )?archivo de origen)\b/.test(instruction);
  const resultReference=/\b(?:(?:ese|esa|esos|esas|este|esta|estos|estas) (?:resultado\w*|archivo\w*|documento\w*)|(?:el|los|la|las) (?:ultimo\w* )?(?:resultado\w*|archivo\w*|documento\w*) (?:anterior\w*|generado\w*|que acabas de (?:generar|crear|convertir))|(?:el|los) ultimo\w* (?:resultado\w*|archivo\w*|documento\w*))\b/.test(instruction);
  const follow=/^(?:a word|a docx|la ultima pagina|tambien|ahora|mejor|con menos|conserva|utiliza el mismo|haz lo mismo|hazlo|continua|todas|la segunda|el segundo|repite|dejala|dejalas|quita(?:le|les)? los metadatos)/.test(q);
  if(!follow&&!originalReference&&!resultReference){if(!/^(?:gracias|muchas gracias|hola|ok|perfecto|listo)[!.\s]*$/.test(q))tasks.delete(id);return {task:null,files:newFiles};}
  let files=newFiles.length?newFiles:originalReference?
   resultReference?[...new Set([...task.originals,...task.files])]:task.originals:task.files;
  if(/^(?:la segunda|el segundo)/.test(q))files=files[1]?[files[1]]:[];
  return {task,files,request:formatReply?'Convierte el archivo '+query:undefined};
 }};
}
