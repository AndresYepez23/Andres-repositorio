// Preserve bounded, relevant context from the active conversation only.
// Attachments are represented by their names and the assistant's analysis; raw
// files and credentials are never copied into model context.
const fold = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const STOP = new Set([
  'para','como','cual','cuales','quiero','necesito','puedes','hazme','hacer','hazlo',
  'esta','este','estos','estas','algo','unos','unas','las','los','del','por','con',
  'una','uno','que','pero','tambien','sobre','mas','menos','esa','eso','aqui',
  'ahi','mismo','misma','igual','otro','otra','ahora','dame','donde','cuando',
  'continua','sigue','ponlo','mejoralo','cambialo','ajustalo'
]);
function keywords(value) {
  return [...new Set((fold(value).match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter(word => !STOP.has(word)))];
}

export function isCoreFollowUp(value=''){
 const q=fold(value).replace(/[¿?¡!.,;:]+/g,' ').replace(/\s+/g,' ').trim();
 if(!q)return false;
 if(/^(?:y|pero|entonces|eso|esa|ese|esta|este|estos|estas|ahi|aqui|por que|como asi|que tal si|y por que|y como|y eso|y esa|y esta|y este|y la otra|y los otros|la anterior|el anterior|el mismo|la misma)(?:\s|$)/.test(q))return true;
 return /\b(?:lo anterior|la respuesta anterior|lo que dijiste|de eso|de esa|de ese|de aquello|explicalo mejor|amplia eso|continua con eso|y las demas|y los demas|ese resultado|tu respuesta|lo ultimo|la misma idea|esos datos|esos archivos|esa foto|esa imagen|la imagen anterior|la foto anterior|ese documento|ese archivo|otra version|el mismo archivo|la misma foto|la misma imagen|a partir de eso|con esa imagen|con esa foto|mejorala|ampliala|cambiala|hazla|hazlo|puedes hacerla|puedes cambiarla|puedes mejorarlo|puedes ampliarlo)\b/.test(q);
}

export function isCoreNewTask(value=''){
 const q=fold(value).replace(/^[¿?¡!\s]+/,'').replace(/[.,;:]+/g,' ').replace(/\s+/g,' ').trim();
 if(!q)return false;
 if(/\b(?:cambiando de tema|otra cosa|por otro lado|nuevo tema|tema distinto|dejando eso aparte)\b/.test(q))return true;
 // Explicit references to the current artifact/file keep the previous context.
 if(/\b(?:esa foto|esa imagen|ese archivo|ese documento|lo anterior|la misma|otra version|el mismo|con eso|a partir de eso)\b/.test(q))return false;
 const actions='redacta|escribe|crea|genera|diseña|convierte|traduce|resume|analiza|calcula|busca|compara|prepara|planifica|programa|implementa';
 if(new RegExp('^(?:(?:y\\s+)?ahora\\s+)(?:'+actions+')\\b').test(q))return true;
 if(/^(?:necesito|quiero que)\s+(?:me\s+)?(?:redactes|escribas|crees|generes|diseñes|conviertas|traduzcas|resumas|analices|calcules|busques|compares|prepares|planifiques|programes|implementes|redactar|escribir|crear|generar|diseñar|convertir|traducir|resumir|analizar|calcular|buscar|comparar|preparar|planificar|programar|implementar)\b/.test(q))return true;
 return new RegExp('^(?:'+actions+')\\s+(?:un|una|el|la|los|las)?\\s*(?:correo|mensaje|carta|resumen|informe|ensayo|presentacion|miniatura|logo|banner|imagen|portada|guion|publicacion|plan|cronograma|tabla|lista|documento|archivo|codigo)\\b').test(q);
}

function attachmentNames(item){
 const files=Array.isArray(item?.files)?item.files:[];
 return files.map(file=>String(file?.name||file||'').trim()).filter(Boolean).slice(0,8);
}

/**
 * Build bounded chronological context from the current conversation.
 * Follow-ups retain the latest file/image exchange even after many turns;
 * explicit new tasks deliberately avoid importing unrelated old material.
 */
export function buildConversationContext(history = [], query = '', options = {}) {
  const limit = Math.max(4, Math.min(16, Number(options.maxMessages) || 13));
  const budget = Math.max(2800, Math.min(22000, Number(options.maxChars) || 14000));
  const revision=/\b(?:cambia|corrige|reescribe|revisa|edita|ajusta|modifica|mejora|continua|sigue|hazlo|hazla|el anterior|la anterior|esa cancion|ese texto|ese codigo|el coro|la estrofa|la respuesta|otra version)\b/.test(fold(query));
  const newTask=options.newTask===true||isCoreNewTask(query);
  const followup=!newTask&&isCoreFollowUp(query);
  const entries = (Array.isArray(history) ? history : [])
    .filter(item => item && ['user', 'assistant'].includes(item.role) &&
      typeof item.content === 'string' && item.content.trim())
    .map(item => {
      const files=attachmentNames(item);
      const fileNote=files.length?'\n[Archivos adjuntos en este turno: '+files.join(', ')+']':'';
      return {role:item.role,content:(item.content.trim()+fileNote).slice(0,12000),files};
    });
  if (!entries.length) return [];

  const desiredRecent=Number(options.maxMessages)||13;
  const recentCount = Math.min(entries.length, newTask ? Math.min(3,desiredRecent) : Math.min(9,desiredRecent));
  const previousAssistantIndex=(revision||followup)?entries.findLastIndex(item=>item.role==='assistant'):-1;
  const recentStart = entries.length - recentCount;
  const selected = new Set(entries.map((_, index) => index).slice(recentStart));
  const words = keywords(query);
  const vague = words.length <= 1 || /^(?:y|pero|entonces|eso|esta|este|ahi|aqui)\b/.test(fold(query).trim());

  if (!newTask && recentStart && !vague) {
    const ranked = entries.slice(0, recentStart).map((entry, index) => {
      const past = fold(entry.content.slice(0, 3500));
      const overlap = words.filter(word => past.includes(word)).length;
      const score = overlap * 3 + (entry.role === 'user' && overlap ? 1 : 0) +
        (overlap >= 2 ? 2 : 0);
      return { index, score };
    }).filter(item => item.score >= 4).sort((a, b) =>
      b.score - a.score || b.index - a.index);
    for (const entry of ranked.slice(0, Math.max(0, limit - recentCount))) selected.add(entry.index);
  }

  // A short follow-up such as "¿y si...?" must still have the image/document
  // exchange available even when several questions have passed since upload.
  if(followup){
    const fileTurns=entries.map((entry,index)=>({entry,index}))
      .filter(({entry})=>entry.role==='user'&&entry.files.length)
      .slice(-2);
    for(const {index} of fileTurns){
      selected.add(index);
      const answerIndex=entries.findIndex((entry,i)=>i>index&&entry.role==='assistant');
      if(answerIndex>=0)selected.add(answerIndex);
    }
  }

  if(previousAssistantIndex>=0)selected.add(previousAssistantIndex);

  // Enforce the character and message budgets. The latest turns and the
  // preserved file/assistant pair win over older keyword matches.
  const priority=[...selected].sort((a,b)=>{
    const aRecent=a>=recentStart,bRecent=b>=recentStart;
    if(aRecent!==bRecent)return aRecent?1:-1;
    return b-a;
  });
  const result=[];
  let remaining=budget;
  for(const index of priority){
    if(result.length>=limit||remaining<120)break;
    const recent=index>=recentStart;
    const cap=index===previousAssistantIndex?6500:recent?(entries[index].role==='user'?2300:2400):index<recentStart?2200:1400;
    const content=entries[index].content.slice(0,Math.min(cap,remaining));
    if(content){result.push({index,role:entries[index].role,content});remaining-=content.length;}
  }
  return result.sort((a,b)=>a.index-b.index).map(({role,content})=>({role,content}));
}

/**
 * Adapt history to the actual task. Revisions/follow-ups preserve more context;
 * clearly independent requests start with a small, clean context window.
 */
export function chooseCoreContextOptions(task='conversation',text=''){
 const q=fold(text).replace(/^[¿?¡!\s]+/,'').trim();
 const newTask=isCoreNewTask(q);
 const revision=/\b(?:eso|esa|ese|anterior|ultimo|ultima|cambia|corrige|reescribe|edita|ajusta|modifica|mejora|continua|sigue|hazlo|hazla|otra version|mismo|la letra|el coro|ese codigo|tu respuesta)\b/.test(q)||isCoreFollowUp(q);
 const standalone=/^(?:hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|que es|quien es|cual es|para que sirve|cuanto es|define|explica brevemente)\b/.test(q)&&!isCoreFollowUp(q);
 if(revision||task==='songwriting'&&/\b(?:revisa|cambia|edita|corrige|version)\b/.test(q))
  return {maxMessages:13,maxChars:14500,newTask:false};
 if(newTask)return {maxMessages:4,maxChars:4500,newTask:true};
 if(standalone&&q.length<180)return {maxMessages:3,maxChars:3500,newTask:false};
 if(['coding','reasoning'].includes(task))return {maxMessages:11,maxChars:11500,newTask:false};
 return {maxMessages:8,maxChars:7500,newTask:false};
}

export function chooseCoreReasoning(task = 'conversation', text = '') {
  const q = fold(text).replace(/^[¿?¡!\s]+/,'').trim();
  const deep = /\b(depura|debug|refactoriza|implementa|reescribe|arquitectura|analiza|investiga|demuestra|demostrar|resuelve|evalua|razonamiento|argumenta|exhaustivo|profundo|a fondo|detalladamente|paso a paso|diagnostica|por que falla|por que no funciona|comparame|recomiendame|explica las causas)\b/.test(q);
  if (task === 'coding') {
    if(q.length < 180 && /^(?:que es|para que sirve|cual es|explica brevemente|dame un ejemplo)\b/.test(q) && !deep) return 'balanced';
    return 'smart';
  }
  if (task === 'reasoning') return q.length < 130 && !deep ? 'balanced' : 'smart';
  if (task === 'songwriting' || task === 'creative') return 'balanced';
  if ((task === 'conversation' || task === 'general') && (deep||q.length>220)) return 'smart';
  if ((task === 'conversation' || task === 'general') && q.length <= 100 && !deep && !isCoreFollowUp(q)) return 'fast';
  return 'balanced';
}

// Limit unneeded output tokens without making substantive requests artificially
// short. A concise answer should not reserve the same tokens as a full report.
export function chooseCoreResponseLength(task = 'conversation', text = '') {
  const q = fold(text).replace(/^[¿?¡!\s]+/,'').trim();
  const detailed = /\b(?:detallad\w*|complet\w*|extens\w*|profund\w*|a fondo|paso a paso|informe|ensayo|tutorial|guia completa|proyecto completo|archivo completo)\b/.test(q);
  const brief = /\b(?:breve(?:mente)?|cort[oa]|resumid[oa]|en una frase|rapido|simple|sin explicaciones)\b/.test(q);
  if(task === 'songwriting') return 'long';
  if(detailed) return 'long';
  if(brief) return 'short';
  if(task === 'coding') return q.length < 150 && /^(?:que es|para que sirve|explica|dame un ejemplo)\b/.test(q) ? 'medium' : 'long';
  if(task === 'reasoning') return q.length < 130 ? 'medium' : 'long';
  if(task === 'conversation' || task === 'quick' || task === 'general'){
    if(/^(?:hola|holi|hey|gracias|muchas gracias|buenas|ok|listo)[.!s]*$/.test(q))return 'short';
    if(q.length>260||/\b(?:explica|analiza|compara|porque|por que|como funciona|ejemplos|alternativas|recomendacion|desarrolla|relaciona|profundiza)\b/.test(q))return 'long';
    return 'medium';
  }
  return 'medium';
}
