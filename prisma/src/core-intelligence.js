// Respuestas factuales del producto, no atribuibles falsamente a GPT/Gemini.
// Soporte básico local cuando el presupuesto de modelos compartidos está agotado.
const fold = value => String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const PROVIDERS={gemini:'Google Gemini',groq:'Groq',cloudflare:'Cloudflare Workers AI',pollinations:'Pollinations',huggingface:'Hugging Face',openrouter:'OpenRouter'};
function modelLine(history=[]){
 const last=[...history].reverse().find(entry=>entry.role==='assistant'&&entry.engine);
 if(!last)return 'Todavía no hay una respuesta identificada de un modelo en esta conversación.';
 const name=PROVIDERS[last.engine]||last.engine;
 return 'La última respuesta generada por IA se procesó con '+name+(last.model?' · '+String(last.model).slice(0,85):'')+'.';
}
function connectedLine(providers={}){
 const active=Object.entries(PROVIDERS).filter(([id])=>!!providers[id]).map(([,name])=>name);
 return active.length?'Motores compartidos anunciados como conectados: '+active.join(', ')+'. Su disponibilidad puede cambiar por cuotas.':
 'Actualmente no puedo confirmar motores compartidos disponibles; revisa «Laboratorio IA».';
}
function lastTopic(history=[]){
 return [...history].reverse().filter(m=>m.role==='user').slice(0,3).map(x=>fold(x.content)).join(' ');
}
export function resolvePrismaProductQuestion(text,history=[],providers={}){
 const q=fold(text).replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
 const earlier=lastTopic(history);
 if(!q)return null;
 // Questions about the identity / models of THIS application are product facts.
 const queryModels=/\b(modelos?|motores?|gemini|groq|openrouter|gpt ?[3456]|chatgpt|openai|claude|llama)\b/.test(q);
 const localIdentity=/^(eres una (?:inteligencia|ia|inteligente)|eres ia|eres un (?:robot|chatbot)|quien eres|que eres|tu quien eres)\??$/.test(q);
 const selfModel=/(?:eres|usas|utilizas|funcionas con|que modelo|cual modelo|que ia|en prisma|aqui en prisma)/.test(q);
 const briefFollowup=/^(?:aqui|aqui en prisma|y aqui|y gemini|y groq|y ahora|eso|pero aqui|hay otros|hay mas modelos|y que modelos)$/.test(q);
 const inContext=queryModels||/\b(prisma|core|aqui|tu)\b/.test(q)||briefFollowup;
 const previousProduct=/\b(prisma|gemini|groq|modelo|motor|gpt|openai)\b/.test(earlier);
 if(localIdentity){
  return 'Sí, soy Prisma Core, el asistente de IA de Prisma Space. Puedo conversar y coordinar herramientas. No soy un modelo único: puedo utilizar motores diferentes según la tarea y la disponibilidad. '+modelLine(history);
 }
 if(briefFollowup&&previousProduct){
  if(q==='eso')return 'Sí, te refieres a cómo funciono dentro de Prisma Space. Puedo utilizar distintos motores de IA, no solamente uno. '+modelLine(history);
  return 'Aquí en Prisma Core puedo utilizar varios motores de IA. '+connectedLine(providers)+' '+modelLine(history)+' No todos estarán disponibles si alcanzan sus límites de uso.';
 }
 if(queryModels&&selfModel&&inContext){
  return 'Prisma Core es el asistente de Prisma Space, no un único GPT‑4 ni una versión exclusiva de Gemini. '+modelLine(history)+' '+connectedLine(providers)+' El nombre del motor que respondió también aparece debajo de las respuestas generadas por IA.';
 }
 if((/^y (?:gemini|groq|cloudflare|openai)$/.test(q)||/^pero no que eras (?:gemini|gpt.*)$/.test(q))&&previousProduct){
  return 'No necesariamente. Prisma Core puede trabajar con varios proveedores; cambiar de motor no cambia la identidad del asistente. '+modelLine(history)+' '+connectedLine(providers);
 }
 return null;
}
export function localQuotaExplanation(scope='GLOBAL_LIMIT'){
 return scope==='PROVIDER_LIMIT'
 ? 'Ese proveedor alcanzó su cuota temporal. Prisma puede intentar otro motor autorizado, siempre respetando los límites compartidos. Las herramientas locales continúan disponibles.'
 : 'La capacidad gratuita compartida de Prisma está temporalmente agotada. No es un fallo de tu pregunta ni significa que Gemini, Groq y Cloudflare estén caídos a la vez. Para proteger el servicio no repetiré llamadas que vuelvan a consumir cuota. Puedes seguir utilizando las herramientas locales y reintentar cuando se renueve el límite.';
}
