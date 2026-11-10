// Respuestas factuales del producto, no atribuibles falsamente a GPT/Gemini.
// Soporte básico local cuando el presupuesto de modelos compartidos está agotado.
const fold = value => String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const PROVIDERS={gemini:'Google Gemini',groq:'Groq',cloudflare:'Cloudflare Workers AI',pollinations:'Pollinations',huggingface:'Hugging Face',openrouter:'OpenRouter',requesty:'Requesty',sensenova:'SenseNova',zai:'Z.AI',kilo:'Kilo Gateway',aihubmix:'AIHubMix'};
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
 // Core persists the full conversation history in IndexedDB with a localStorage cache.
 // Cloud sync is optional, account-wide and requires the user's explicit consent.
 // The model receives only the active conversation, not every chat automatically.
 if(/^(?:tienes memoria|tienes buena memoria|tienes memoria de (?:lo que hablamos|nuestras conversaciones|este chat)|guardas (?:lo que hablamos|las conversaciones|mis mensajes)|recuerdas (?:lo que hablamos|lo de ayer|mis conversaciones)|puedes recordar (?:lo que te digo|lo que hablamos)|que (?:memoria|recuerdas) tienes|como funciona tu memoria)$/.test(q)){
  return 'Sí, tengo **memoria de conversación**: Prisma conserva el historial completo de tus chats en el almacenamiento local ampliado del navegador (IndexedDB), sin un tope fijo de 50 conversaciones o 60 mensajes. Si activas la sincronización en tu cuenta, podrás continuar esos chats desde otros dispositivos. Los archivos adjuntos no se sincronizan. **No es una memoria personal ilimitada**: el modelo recibe el contexto de la conversación activa, no consulta automáticamente todos tus otros chats.';
 }
 if(/^(?:que recuerdas de mi|que sabes de mi|te acuerdas de mi|recuerdas algo sobre mi)$/.test(q)){
  return 'Puedo usar lo que aparece en esta conversación activa y sus mensajes recientes. El historial de otros chats que ves en Prisma no se incorpora automáticamente a mis respuestas. Si me indicas un dato de este chat, puedo retomarlo contigo; no afirmaré recordar información que no tengo disponible.';
 }
 // Questions about the identity / models of THIS application are product facts.
 const queryModels=/\b(modelos?|motores?|gemini|groq|openrouter|gpt ?[3456]|chatgpt|openai|claude|llama)\b/.test(q);
 const localIdentity=/^(eres una (?:inteligencia|ia|inteligente)|eres ia|eres un (?:robot|chatbot)|quien eres|que eres|tu quien eres)\??$/.test(q);
 const selfModel=/(?:eres|usas|utilizas|funcionas con|que modelo|cual modelo|que ia|en prisma|aqui en prisma)/.test(q);
 const briefFollowup=/^(?:aqui|aqui en prisma|y aqui|y gemini|y groq|y ahora|eso|pero aqui|hay otros|hay mas modelos|y que modelos)$/.test(q);
 const inContext=queryModels||/\b(prisma|core|aqui|tu)\b/.test(q)||briefFollowup;
 const previousProduct=/\b(prisma|gemini|groq|openrouter|modelo|motor|gpt|openai)\b/.test(earlier);
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
 if(scope==='PROVIDER_MINUTE_LIMIT')return 'OpenRouter alcanzó su límite de solicitudes por minuto. Prisma esperará a que se renueve esa ventana antes de volver a utilizarlo; las herramientas locales siguen disponibles.';
 return scope==='PROVIDER_LIMIT'
 ? 'Ese proveedor alcanzó su cuota temporal. Prisma ya intentó los motores alternativos disponibles, incluido OpenRouter cuando estaba configurado. Las herramientas locales continúan disponibles.'
 : 'La capacidad compartida de los motores de IA está temporalmente agotada, incluso después de probar OpenRouter cuando estaba configurado. No es un fallo de tu pregunta ni significa que todos los proveedores estén caídos a la vez. Para proteger el servicio no repetiré llamadas que vuelvan a consumir cuota. Puedes seguir utilizando las herramientas locales y reintentar cuando se renueven los límites.';
}
