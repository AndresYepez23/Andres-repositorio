// Product facts about Prisma Core; do not attribute these responses to a model provider.
const fold = value => String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const english = () => typeof window!=='undefined' && window.prismaI18n?.language==='en';
const PROVIDERS={gemini:'Google Gemini',groq:'Groq',cloudflare:'Cloudflare Workers AI',pollinations:'Pollinations',huggingface:'Hugging Face',openrouter:'OpenRouter',requesty:'Requesty',sensenova:'SenseNova',zai:'Z.AI',kilo:'Kilo Gateway',aihubmix:'AIHubMix'};
function modelLine(history=[]){
 const last=[...history].reverse().find(entry=>entry.role==='assistant'&&entry.engine);
 if(!last)return english()?'No model-generated response has been identified in this conversation yet.':'Todavía no hay una respuesta identificada de un modelo en esta conversación.';
 const name=PROVIDERS[last.engine]||last.engine;
 return english()?'The latest AI-generated response was processed by '+name+(last.model?' · '+String(last.model).slice(0,85):'')+'.':'La última respuesta generada por IA se procesó con '+name+(last.model?' · '+String(last.model).slice(0,85):'')+'.';
}
function connectedLine(providers={}){
 const active=Object.entries(PROVIDERS).filter(([id])=>!!providers[id]).map(([,name])=>name);
 if(english())return active.length?'Shared engines currently reported as connected: '+active.join(', ')+'. Availability may change based on usage limits.':'I cannot currently confirm that shared engines are available; check the AI Lab.';
 return active.length?'Motores compartidos anunciados como conectados: '+active.join(', ')+'. Su disponibilidad puede cambiar por cuotas.':'Actualmente no puedo confirmar motores compartidos disponibles; revisa «Laboratorio IA».';
}
function lastTopic(history=[]){
 return [...history].reverse().filter(m=>m.role==='user').slice(0,3).map(x=>fold(x.content)).join(' ');
}
export function resolvePrismaProductQuestion(text,history=[],providers={}){
 const q=fold(text).replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
 const earlier=lastTopic(history);
 if(!q)return null;
 if(/^(?:tienes memoria|tienes buena memoria|tienes memoria de (?:lo que hablamos|nuestras conversaciones|este chat)|guardas (?:lo que hablamos|las conversaciones|mis mensajes)|recuerdas (?:lo que hablamos|lo de ayer|mis conversaciones)|puedes recordar (?:lo que te digo|lo que hablamos)|que (?:memoria|recuerdas) tienes|como funciona tu memoria|do you have memory|do you remember our chats|what do you remember|how does your memory work)$/.test(q)){
  return english()
   ?'Yes. Prisma stores your chat history locally in your browser (IndexedDB), subject to available device storage. If you enable account sync, you can continue those chats on other devices. Attachments are not synced. **This is not unlimited personal memory**: the model receives context from the active conversation and does not automatically consult all your other chats.'
   :'Sí, tengo **memoria de conversación**: Prisma conserva el historial completo de tus chats en el almacenamiento local ampliado del navegador (IndexedDB), sin un límite fijo de cantidad de conversaciones o mensajes, sujeto al espacio disponible. Si activas la sincronización en tu cuenta, podrás continuar esos chats desde otros dispositivos. Los archivos adjuntos no se sincronizan. **No es una memoria personal ilimitada**: el modelo recibe el contexto de la conversación activa, no consulta automáticamente todos tus otros chats.';
 }
 if(/^(?:que recuerdas de mi|que sabes de mi|te acuerdas de mi|recuerdas algo sobre mi|what do you know about me|what do you remember about me|do you know me)$/.test(q)){
  return english()
   ?'I can use the messages and recent context in this active conversation. Other chats in Prisma are not automatically included in my replies. If you share a detail in this chat, I can use it here; I will not claim to remember information I cannot access.'
   :'Puedo usar lo que aparece en esta conversación activa y sus mensajes recientes. El historial de otros chats que ves en Prisma no se incorpora automáticamente a mis respuestas. Si me indicas un dato de este chat, puedo retomarlo contigo; no afirmaré recordar información que no tengo disponible.';
 }
 const queryModels=/\b(modelos?|motores?|gemini|groq|openrouter|gpt ?[3456]|chatgpt|openai|claude|llama|models?|engines?|which ai|what ai)\b/.test(q);
 const localIdentity=/^(eres una (?:inteligencia|ia|inteligente)|eres ia|eres un (?:robot|chatbot)|quien eres|que eres|tu quien eres|who are you|what are you|are you an ai|are you a chatbot)\??$/.test(q);
 const selfModel=/(?:eres|usas|utilizas|funcionas con|que modelo|cual modelo|que ia|en prisma|aqui en prisma|are you|do you use|which model|what model|what ai|powered by|here in prisma)/.test(q);
 const briefFollowup=/^(?:aqui|aqui en prisma|y aqui|y gemini|y groq|y ahora|eso|pero aqui|hay otros|hay mas modelos|y que modelos|what about here|and here|and gemini|and groq|what now|are there others|any other models|which models)$/.test(q);
 const inContext=queryModels||/\b(prisma|core|aqui|tu|here|you)\b/.test(q)||briefFollowup;
 const previousProduct=/\b(prisma|gemini|groq|openrouter|modelo|motor|gpt|openai|model|engine|chatgpt)\b/.test(earlier);
 if(localIdentity){
  return english()
   ?'I am Prisma Core, the AI assistant in Prisma Space. I can converse and coordinate tools. I am not a single fixed model: I can use different engines depending on the task and availability. '+modelLine(history)
   :'Sí, soy Prisma Core, el asistente de IA de Prisma Space. Puedo conversar y coordinar herramientas. No soy un modelo único: puedo utilizar motores diferentes según la tarea y la disponibilidad. '+modelLine(history);
 }
 if(briefFollowup&&previousProduct){
  if(q==='eso')return english()?'Yes, you are asking how I work inside Prisma Space. I can use different AI engines, not just one. '+modelLine(history):'Sí, te refieres a cómo funciono dentro de Prisma Space. Puedo utilizar distintos motores de IA, no solamente uno. '+modelLine(history);
  return english()?'Prisma Core can use several AI engines. '+connectedLine(providers)+' '+modelLine(history)+' Not all engines will be available when they reach their usage limits.':'Aquí en Prisma Core puedo utilizar varios motores de IA. '+connectedLine(providers)+' '+modelLine(history)+' No todos estarán disponibles si alcanzan sus límites de uso.';
 }
 if(queryModels&&selfModel&&inContext){
  return english()
   ?'Prisma Core is the assistant for Prisma Space, not a single GPT-4 model or an exclusive version of Gemini. '+modelLine(history)+' '+connectedLine(providers)+' The responding engine is also shown below AI-generated answers.'
   :'Prisma Core es el asistente de Prisma Space, no un único GPT‑4 ni una versión exclusiva de Gemini. '+modelLine(history)+' '+connectedLine(providers)+' El nombre del motor que respondió también aparece debajo de las respuestas generadas por IA.';
 }
 if((/^y (?:gemini|groq|cloudflare|openai)$/.test(q)||/^pero no que eras (?:gemini|gpt.*)$/.test(q)||/^(?:what about|are you actually|but i thought you were) (?:gemini|groq|cloudflare|openai|gpt.*)$/.test(q))&&previousProduct){
  return english()
   ?'Not necessarily. Prisma Core can work with several providers; switching engines does not change the assistant identity. '+modelLine(history)+' '+connectedLine(providers)
   :'No necesariamente. Prisma Core puede trabajar con varios proveedores; cambiar de motor no cambia la identidad del asistente. '+modelLine(history)+' '+connectedLine(providers);
 }
 return null;
}
export function localQuotaExplanation(scope='GLOBAL_LIMIT'){
 if(english()){
  if(scope==='PROVIDER_MINUTE_LIMIT')return 'OpenRouter reached its per-minute request limit. Prisma will wait for that window to reset before using it again; local tools remain available.';
  if(scope==='PROVIDER_LIMIT')return 'That provider has reached its temporary usage limit. Prisma has already tried the available alternative engines, including OpenRouter when configured. Local tools remain available.';
  return 'Shared AI engine capacity is temporarily exhausted, even after trying OpenRouter when configured. This is not a problem with your question and does not mean every provider is down. To protect the service, I will not repeat calls that would consume more quota. You can keep using local tools and try again when usage limits reset.';
 }
 if(scope==='PROVIDER_MINUTE_LIMIT')return 'OpenRouter alcanzó su límite de solicitudes por minuto. Prisma esperará a que se renueve esa ventana antes de volver a utilizarlo; las herramientas locales siguen disponibles.';
 return scope==='PROVIDER_LIMIT'
  ?'Ese proveedor alcanzó su cuota temporal. Prisma ya intentó los motores alternativos disponibles, incluido OpenRouter cuando estaba configurado. Las herramientas locales continúan disponibles.'
  :'La capacidad compartida de los motores de IA está temporalmente agotada, incluso después de probar OpenRouter cuando estaba configurado. No es un fallo de tu pregunta ni significa que todos los proveedores estén caídos a la vez. Para proteger el servicio no repetiré llamadas que vuelvan a consumir cuota. Puedes seguir utilizando las herramientas locales y reintentar cuando se renueven los límites.';
}
