// Per-conversation task references, memory-only: no uploads, prompts or credentials.
import { normalizeIntent } from './core-capabilities.js';
export function createTaskMemory({maxBytes=120*1024*1024,maxChats=8,ttl=30*60*1000,now=Date.now}={}){
 const tasks=new Map(),pending=new Map();
 const get=id=>{const t=tasks.get(id);if(t&&now()-t.updated>ttl){tasks.delete(id);return null;}return t||null;};
 return {get,clear:id=>{tasks.delete(id);pending.delete(id);},clearAll:()=>{tasks.clear();pending.clear();},
 wait(id,request,files=[]){pending.set(id,{request,files,updated:now()});if(pending.size>maxChats)pending.delete(pending.keys().next().value);},
 save(id,{files=[],originals=[],steps=[],text=''}={}){tasks.delete(id);pending.delete(id);const bytes=[...files,...originals].reduce((n,f)=>n+(f.size||0),0)+text.length*2;if(bytes>maxBytes)return false;tasks.set(id,{files,originals,text,steps:steps.map(s=>({tool_id:s.tool_id,params:{...s.params}})),updated:now(),bytes});while(tasks.size>maxChats||[...tasks.values()].reduce((n,t)=>n+t.bytes,0)>maxBytes)tasks.delete(tasks.keys().next().value);return true;},
 resolve(id,query,newFiles=[]){const task=get(id),q=normalizeIntent(query).trim();
  const waiting=pending.get(id);
  // Attachment-only turns and format clarifications must retain the latest unfinished
  // objective, not resurrect a prior successful split or conversion.
  const uploadReply=/^(?:aqui|ahi|adjunto|te envio|ya (?:lo )?(?:subi|cargue|adjunte)|listo|hazlo|este archivo|el archivo|el pdf|procesa (?:los |estos |mis )?archivos?(?: adjuntos?)?|procesa (?:este |el )?(?:archivo|pdf)|continua (?:con )?(?:el |los )?archivos?|\d|png$|webp$|jpg$)/.test(q);
  const formatReply=/^(?:a|en|como)\s+(?:word|docx|pdf|png|jpe?g|webp|csv|json|excel|xlsx|mp3|wav|txt|html)[.!?\s]*$/.test(q);
  if(waiting&&now()-waiting.updated<ttl&&(uploadReply||formatReply)){
   return {task:null,files:newFiles.length?newFiles:waiting.files,request:waiting.request+' '+query};
  }
  if(waiting)pending.delete(id);
  if(!task)return {task:null,files:newFiles};
  const follow=/^(?:tambien|ahora|mejor|con menos|conserva|utiliza el mismo|hazlo|continua|todas|la segunda|el segundo|repite|dejala|dejalas|quita(?:le|les)? los metadatos)/.test(q);
  if(!follow){if(!/^(?:gracias|muchas gracias|hola|ok|perfecto|listo)[!.\s]*$/.test(q))tasks.delete(id);return {task:null,files:newFiles};}
  let files=newFiles.length?newFiles:task.files;
  if(/^(?:la segunda|el segundo)/.test(q))files=files[1]?[files[1]]:[];
  return {task,files};
 }};
}
