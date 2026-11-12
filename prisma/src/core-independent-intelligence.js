import { evaluateCoreExpression } from './core-math.js';
// Independent deterministic abilities for Prisma Core. No AI API or Prisma Mini.
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const DATA=[
['inteligencia artificial','Técnicas que permiten automatizar percepción, predicción, clasificación o generación; no toda IA requiere redes neuronales.','Distingue modelos estadísticos, lógica programada y sistemas mixtos.'],
['entrenamiento de ia','Proceso de ajustar parámetros de un modelo con datos y optimización. Incorporar reglas o textos al código no equivale a entrenar una red neuronal.','Para aumentar autonomía combina conocimiento verificado, algoritmos y herramientas que puedan ejecutarse localmente.'],
['modelo de lenguaje','Modelo que reconoce patrones de lenguaje y genera texto; puede equivocarse de manera convincente.','Verifica información crítica con datos fiables.'],
['algoritmo','Secuencia finita de instrucciones para transformar entradas en resultados.','Comprueba entradas, salidas y casos extremos.'],
['api','Interfaz de comunicación entre programas.','Valida permisos, límites y errores.'],
['api key','Credencial utilizada para acceder a una API.','Almacénala como secreto del servidor.'],
['http 401','Respuesta de una solicitud sin autenticación válida.','Revisa token, autorización y endpoint regional.'],
['http 403','Respuesta que indica acceso denegado.','Verifica permisos y producto autorizado.'],
['http 429','Respuesta de límite de solicitudes alcanzado.','Respeta Retry-After y evita evadir cuotas.'],
['http 502','Un intermediario recibió una respuesta inválida de otro servidor.','Investiga el origen real del error, no asumas un token incorrecto.'],
['http 503','Servicio temporalmente no disponible.','Revisa salud del proveedor y reintentos controlados.'],
['javascript','Lenguaje de programación de navegadores y servidores.','Valida datos y maneja errores asíncronos.'],
['json','Formato de datos con objetos, arreglos y valores simples.','Comprueba sintaxis y esquema.'],
['sql','Lenguaje de consulta de bases de datos relacionales.','Usa parámetros y privilegios mínimos.'],
['base de datos','Sistema para almacenar y consultar información.','Define integridad, índices, permisos y respaldos.'],
['autenticacion','Proceso de verificar identidad.','No lo confundas con autorización, que determina permisos.'],
['autorizacion','Control de las acciones y recursos permitidos.','Aplica los permisos en el servidor.'],
['oauth','Protocolo de delegación de acceso limitado sin compartir una contraseña.','Para identidad federada suele combinarse con OpenID Connect.'],
['pwa','Aplicación web instalable que puede ofrecer funciones sin conexión.','Comprueba service worker, manifest y compatibilidad.'],
['service worker','Script del navegador para cachear solicitudes y gestionar algunas tareas fuera de la página.','Versiona cachés al actualizar.'],
['dns','Sistema de nombres y registros para localizar servicios de internet.','Comprueba A, AAAA, CNAME y TXT.'],
['dominio','Nombre registrado usado para identificar recursos en internet.','El dominio no incluye necesariamente hospedaje o correo.'],
['https','Protocolo HTTP protegido por TLS.','No reemplaza autenticación ni permisos.'],
['smtp','Protocolo de transporte de correo saliente.','Revisa autenticación y registros de remitente.'],
['dkim','Firma criptográfica para verificar integridad de correos y el dominio firmante.','Publica el registro DNS indicado por el proveedor.'],
['dmarc','Política que evalúa la alineación de autenticación del correo.','Monitoriza antes de bloquear.'],
['git','Sistema de control de versiones de código.','Haz commits pequeños y pruebas.'],
['github actions','Servicio de automatización de pruebas y despliegues.','Revisa resultados reales de ejecuciones.'],
['cloudflare pages','Plataforma para publicar aplicaciones web y ejecutar funciones.','Distingue Preview y Production.'],
['supabase','Servicios sobre PostgreSQL que incluyen autenticación, almacenamiento y funciones.','Protege datos con RLS.'],
['rls','Control de acceso a filas en una base de datos.','Prueba restricciones entre diferentes usuarios.'],
['ocr','Reconocimiento de texto visual en imágenes.','Valida errores de lectura.'],
['peso de imagen','El peso mide los bytes del archivo; las dimensiones miden ancho y alto en píxeles. Reducir calidad puede bajar bytes sin cambiar dimensiones.','Prisma distingue compresión y redimensionado; un límite de KB se verifica contra el archivo generado.'],
['png','Formato de imagen con compresión sin pérdida y soporte de transparencia.','Reducir un parámetro de calidad en canvas no garantiza reducir un PNG; usa WebP/JPG si aceptas otro formato.'],
['webp','Formato de imagen que admite compresión y transparencia.','En Prisma puedes seleccionar WebP al convertir o comprimir; conserva el original para comparar.'],
['jpg','Formato de fotografía habitualmente comprimido con pérdida, sin canal de transparencia.','Para mantener un fondo transparente elige PNG o WebP.'],
['metadatos','Información adicional asociada a un archivo, como autor, fecha o ubicación EXIF.','Quitar metadatos no borra información que siga visible en los píxeles o en el texto del documento.'],
['csv','Tabla de texto organizada por filas y columnas delimitadas.','Los delimitadores dentro de valores deben entrecomillarse; conserva encabezados y revisa campos vacíos.'],
['json valido','Un documento JSON válido respeta la sintaxis del formato; eso no garantiza que tenga los campos que necesita tu aplicación.','Un esquema permite comprobar estructura y tipos después de validar sintaxis.'],
['pdf','Formato de documento con diseño visual conservado.','Distingue texto seleccionable de escaneos.'],
['token','Unidad de texto procesada por modelos de lenguaje, no siempre una palabra.','Ten en cuenta los límites de contexto y salida.'],
['contexto','Información pertinente para interpretar una petición.','Usa historial relevante sin mezclar conversaciones.'],
['prompt injection','Intento de hacer pasar datos externos por instrucciones para un asistente.','Separa los datos no confiables de las órdenes.'],
['webhook','Solicitud HTTP emitida automáticamente ante un evento.','Verifica firma, duplicados y reintentos.'],
['latencia','Tiempo transcurrido entre solicitud y respuesta.','Separa demoras de red, servidor y cómputo.'],
['respaldo','Copia recuperable de datos o configuraciones.','Prueba su restauración.'],
['hipotesis','Proposición comprobable a partir de observaciones.','Define qué la apoyaría o refutaría.'],
['correlacion','Asociación estadística entre variables que no implica por sí sola causalidad.','Investiga factores de confusión.'],
['porcentaje','Proporción relativa a cien unidades.','Para calcular p% de N, multiplica N por p y divide entre 100.'],
['promedio','Suma de valores dividida por el número de valores.','Considera la mediana si existen valores extremos.'],
['mediana','Valor central de una serie ordenada.','Es menos sensible a valores extremos.'],
['metodologia','Conjunto de procedimientos para realizar una tarea o estudio.','Describe objetivos, datos, criterios y límites.'],
['resumen ejecutivo','Resumen breve de hallazgos, implicaciones y próximos pasos.','Redáctalo con base en el informe completo.']
];
const DATA_EN = [
  [
    "Artificial Intelligence",
    "Techniques that enable the automation of perception, prediction, classification, or generation; not all AI requires neural networks.",
    "Distinguishes statistical models, programmed logic, and mixed systems."
  ],
  [
    "AI Training",
    "Process of adjusting a model's parameters with data and optimization. Incorporating rules or text into code does not equate to training a neural network.",
    "To increase autonomy, combine verified knowledge, algorithms, and tools that can be executed locally."
  ],
  [
    "Language Model",
    "Model that recognizes language patterns and generates text; it can convincingly make mistakes.",
    "Verifies critical information with reliable data."
  ],
  [
    "Algorithm",
    "Finite sequence of instructions to transform inputs into results.",
    "Checks inputs, outputs, and edge cases."
  ],
  [
    "API",
    "Interface for communication between programs.",
    "Validates permissions, limits, and errors."
  ],
  [
    "API Key",
    "A credential used to access an API.",
    "Store it as a server secret."
  ],
  [
    "HTTP 401",
    "A response to a request without valid authentication.",
    "Check token, authorization, and regional endpoint."
  ],
  [
    "HTTP 403",
    "A response indicating access denied.",
    "Verify permissions and authorized product."
  ],
  [
    "HTTP 429",
    "A response indicating the request limit has been reached.",
    "Respect Retry-After and avoid evading quotas."
  ],
  [
    "HTTP 502",
    "An intermediary received an invalid response from another server.",
    "Investigate the actual origin of the error, do not assume an incorrect token."
  ],
  [
    "HTTP 503",
    "Temporarily unavailable service.",
    "Check service provider health and controlled retries."
  ],
  [
    "JavaScript",
    "Browser and server-side scripting language.",
    "Validates data and handles asynchronous errors."
  ],
  [
    "JSON",
    "Data format with objects, arrays, and simple values.",
    "Checks syntax and schema."
  ],
  [
    "SQL",
    "Relational database query language.",
    "Use parameters and minimum privileges."
  ],
  [
    "Database",
    "System for storing and querying information.",
    "Define integrity, indexes, permissions, and backups."
  ],
  [
    "Authentication",
    "The process of verifying identity.",
    "Do not confuse it with Authorization, which determines permissions."
  ],
  [
    "Authorization",
    "Control of actions and resources allowed.",
    "Apply permissions on the server."
  ],
  [
    "OAuth",
    "A limited access delegation protocol without sharing a password.",
    "For federated identity, it is often combined with OpenID Connect."
  ],
  [
    "Progressive Web App (PWA)",
    "An installable web application that can offer offline functions.",
    "Check service worker, manifest, and compatibility."
  ],
  [
    "Service Worker",
    "Browser script for caching requests and managing some tasks outside the page.",
    "Version cache on update."
  ],
  [
    "DNS",
    "Domain Name System, a system of names and records for locating internet services.",
    "Checks A, AAAA, CNAME, and TXT records."
  ],
  [
    "Domain",
    "A registered name used to identify resources on the internet.",
    "A domain does not necessarily include hosting or email."
  ],
  [
    "HTTPS",
    "A secure version of the HTTP protocol protected by TLS.",
    "Does not replace authentication or permissions."
  ],
  [
    "SMTP",
    "A protocol for outgoing email transport.",
    "Verify authentication and sender logs."
  ],
  [
    "DKIM",
    "A cryptographic signature to verify the integrity of emails and the signing domain.",
    "Publish the DNS record indicated by the provider."
  ],
  [
    "DMARC",
    "A policy that evaluates email authentication alignment.",
    "Monitor before blocking."
  ],
  [
    "Git",
    "A version control system for code.",
    "Make small commits and test."
  ],
  [
    "GitHub Actions",
    "A service for automating tests and deployments.",
    "Review real execution results."
  ],
  [
    "Cloudflare Pages",
    "A platform for publishing web applications and executing functions.",
    "Distinguish between Preview and Production."
  ],
  [
    "Supabase",
    "PostgreSQL services including authentication, storage, and functions.",
    "Protect data with Row-Level Security (RLS)."
  ],
  [
    "Row-Level Security",
    "Access control to rows in a database.",
    "Test restrictions between different users."
  ],
  [
    "Optical Character Recognition",
    "Visual text recognition in images.",
    "Validates reading errors."
  ],
  [
    "Image File Size",
    "The weight measures the bytes of the file; dimensions measure width and height in pixels. Reducing quality can lower bytes without changing dimensions.",
    "Prisma distinguishes compression and resizing; a KB limit is verified against the generated file."
  ],
  [
    "PNG",
    "Image format with lossless compression and support for transparency.",
    "Reducing a quality parameter in canvas does not guarantee reducing a PNG; use WebP/JPG if you accept another format."
  ],
  [
    "WebP",
    "Image format that supports compression and transparency.",
    "In Prisma, you can select WebP when converting or compressing; preserve the original for comparison."
  ],
  [
    "JPG",
    "A commonly used compressed image format with loss, no transparency channel.",
    "To maintain a transparent background, choose PNG or WebP."
  ],
  [
    "Metadata",
    "Additional information associated with a file, such as author, date, or EXIF location.",
    "Removing metadata does not erase information that may still be visible in pixels or document text."
  ],
  [
    "CSV",
    "A text table organized by rows and columns with delimiters.",
    "Delimiters within values must be quoted; preserve headers and check for empty fields."
  ],
  [
    "valid json",
    "A valid JSON document respects the format's syntax; this does not guarantee it has the fields your application needs.",
    "A schema allows you to check structure and types after validating syntax."
  ],
  [
    "PDF",
    "A document format that preserves visual design.",
    "Distinguishes selectable text from scans."
  ],
  [
    "Token",
    "A processed text unit handled by language models, not always a word.",
    "Consider context and output limits."
  ],
  [
    "Context",
    "Relevant information to interpret a request.",
    "Use relevant history without mixing conversations."
  ],
  [
    "Prompt Injection",
    "An attempt to pass external data as instructions for an assistant.",
    "Separate untrusted data from commands."
  ],
  [
    "Webhook",
    "An automatically triggered HTTP request due to an event.",
    "Verify signature, duplicates, and retries."
  ],
  [
    "Latency",
    "Time elapsed between a request and response.",
    "Distinguish network, server, and computation delays."
  ],
  [
    "Backup",
    "A recoverable copy of data or configurations.",
    "Test its restoration."
  ],
  [
    "Hypothesis",
    "A testable proposition based on observations.",
    "Define what would support or refute it."
  ],
  [
    "Correlation",
    "A statistical association between variables that does not imply causality on its own.",
    "Investigate confounding factors."
  ],
  [
    "Percentage",
    "A proportion relative to 100 units.",
    "To calculate p% of N, multiply N by p and divide by 100."
  ],
  [
    "Average",
    "The sum of values divided by the number of values.",
    "Consider the median if there are extreme values."
  ],
  [
    "Median",
    "The central value of a sorted series.",
    "It is less sensitive to extreme values."
  ],
  [
    "Methodology",
    "A set of procedures to perform a task or study.",
    "It describes objectives, data, criteria, and limits."
  ],
  [
    "Executive Summary",
    "A brief summary of findings, implications, and next steps.",
    "Write it based on the complete report."
  ]
];
const GLOSSARY=new Map([
 ...DATA.map(([key,definition,application],index)=>[fold(key),{definition,application,topicEn:DATA_EN[index][0],definitionEn:DATA_EN[index][1],applicationEn:DATA_EN[index][2]}]),
 ...DATA_EN.map(([key,definition,application],index)=>[fold(key),{definition:DATA[index][1],application:DATA[index][2],topicEn:key,definitionEn:definition,applicationEn:application}])
]);
const N='[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)';
const number=x=>Number(String(x).replace(',','.'));
const english=()=>typeof window!=='undefined'&&window.prismaI18n?.language==='en';
const format=x=>Number.isFinite(x)?new Intl.NumberFormat(english()?'en-US':'es-CO',{maximumFractionDigits:6}).format(Number(x.toPrecision(12))):null;

export function solveOfflineArithmetic(text){
 const useEnglish=english();
 const q=fold(text).replace(/^[¿?¡!\s]+|[¿?¡!\s]+$/g,'')
  .replace(/\bwhat is\b/g,'cuanto es').replace(/\bcalculate\b/g,'calcula')
  .replace(/\bcompute\b/g,'calcula').replace(/\bsolve\b/g,'resuelve')
  .replace(/\bpercent\b/g,'%').replace(/\bof\b/g,'de')
  .replace(/\bincrease\b/g,'aumento').replace(/\bdiscount\b/g,'descuento');
 if(q.length>150)return null;
 let m=q.match(new RegExp('^(?:cuanto es |calcula |calcular |resuelve )?('+N+')\\s*%\\s*(?:de|del)\\s*('+N+')$'));
 if(m)return useEnglish
  ?'**'+format(number(m[1]))+'% of '+format(number(m[2]))+' = '+format(number(m[1])*number(m[2])/100)+'**. Formula: base × percentage / 100.'
  :'**'+format(number(m[1]))+' % de '+format(number(m[2]))+' = '+format(number(m[1])*number(m[2])/100)+'**. Fórmula: base × porcentaje / 100.';
 m=q.match(new RegExp('^(?:cuanto es |calcula |calcular |resuelve )?('+N+')\\s*([+*/×÷-])\\s*('+N+')$'));
 if(m){
  const a=number(m[1]),b=number(m[3]),op=m[2];
  if((op==='/'||op==='÷')&&b===0)return useEnglish?'You cannot divide by zero.':'No se puede dividir entre cero.';
  const result=op==='+'?a+b:op==='-'?a-b:op==='*'||op==='×'?a*b:a/b;
  return '**'+format(a)+' '+op+' '+format(b)+' = '+format(result)+'**.';
 }
 m=q.match(new RegExp('^(?:calcula |calcular )?(?:el )?(aumento|descuento) (?:del? )?('+N+')\\s*%\\s*(?:de|sobre)\\s*('+N+')$'));
 if(m){
  const factor=m[1]==='aumento'?1:-1;
  return useEnglish
   ?'Total after '+(factor>0?'increase':'discount')+': **'+format(number(m[3])*(1+factor*number(m[2])/100))+'**.'
   :'Total tras '+m[1]+': **'+format(number(m[3])*(1+factor*number(m[2])/100))+'**.';
 }
 return null;
}

export function getOfflineExtractiveSummary(text){
 const q=fold(text),useEnglish=english();
 if(!/^(?:resume|resumir|haz un resumen|sintetiza|extrae (?:las )?ideas principales|dame (?:las )?ideas principales|puntos clave de|summarize|summarise|make a summary|give me the key points|extract the main ideas)\b/.test(q))return null;
 const source=String(text).match(/:\s*([\s\S]+)/)?.[1]?.trim()||'';
 if(source.length<90||source.length>15000)return null;
 const sentences=source.replace(/\r/g,'').split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(x=>x.length>25);
 if(sentences.length<2)return null;
 const freq=new Map();
 for(const word of fold(source).match(/[\p{L}]{4,}/gu)||[])freq.set(word,(freq.get(word)||0)+1);
 const ranked=sentences.map((sentence,index)=>{
  const words=[...new Set(fold(sentence).match(/[\p{L}]{4,}/gu)||[])];
  return {sentence,index,score:words.reduce((sum,word)=>sum+(freq.get(word)||0),0)/(2+Math.sqrt(words.length||1))+(index===0?.5:0)};
 });
 const selected=ranked.sort((a,b)=>b.score-a.score).slice(0,Math.min(5,Math.ceil(sentences.length*.4))).sort((a,b)=>a.index-b.index);
 return useEnglish
  ?'**Local extractive summary** (original sentences, not generative interpretation):\n\n'+selected.map(item=>'- '+item.sentence).join('\n')+'\n\n*No information was sent to external providers. Review the selection before using it as a final summary.*'
  :'**Resumen extractivo local** (frases originales, no interpretación generativa):\n\n'+selected.map(item=>'- '+item.sentence).join('\n')+'\n\n*No se ha enviado información a proveedores externos. Revisa la selección antes de usarla como resumen definitivo.*';
}

export function resolveIndependentCoreRequest(text,{allowKnowledge=true}={}){
 const useEnglish=english();
 const arithmetic=solveOfflineArithmetic(text);
 if(arithmetic)return {kind:'calculation',text:arithmetic};
 const expression=String(text).replace(/^(?:cuanto es|cuánto es|calcula|resuelve|what is|calculate|compute|solve)\s+/i,'').replace(/[¿?]/g,'').trim();
 if(/[()+*/^]/.test(expression)){
  try{
   const result=evaluateCoreExpression(expression);
   if(result!==null)return {kind:'calculation',text:useEnglish?'**'+expression+' = '+format(result)+'**. Local calculation; decimals are approximate due to floating-point arithmetic.':'**'+expression+' = '+format(result)+'**. Cálculo local; decimales aproximados con aritmética de punto flotante.'};
  }catch(error){return {kind:'calculation',text:useEnglish?translateMathError(error.message):error.message};}
 }
 const extraction=getOfflineExtractiveSummary(text);
 if(extraction)return {kind:'extraction',text:extraction};
 if(!allowKnowledge)return null;
 const q=fold(text).replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
 const direct=q.match(/^(?:que es|que significa|define|explica(?:me)?|para que sirve|como funciona|en que consiste|what is|define|explain|how does|what is the use of)\s+(?:(?:un|una|el|la|los|las|a|an|the)\s+)?(.+)$/);
 const whatDoes=q.match(/^what does (.+?) mean$/);
 const howWork=q.match(/^how does (.+?) work$/);
 const topic=(direct?.[1]||whatDoes?.[1]||howWork?.[1]||'').replace(/\s+(?:en pocas palabras|de manera sencilla|por favor|in simple terms|in plain language|please)$/,'').trim();
 const found=GLOSSARY.get(topic);
 if(!found)return null;
 const label=useEnglish?found.topicEn:topic.toUpperCase();
 const definition=useEnglish?found.definitionEn:found.definition;
 const application=useEnglish?found.applicationEn:found.application;
 return {kind:'knowledge',text:'**'+label+'**: '+definition+(useEnglish?'\n\n**In practice:** ':'\n\n**En la práctica:** ')+application};
}
export const INDEPENDENT_CORE_KNOWLEDGE_COUNT=DATA.length;

function translateMathError(message){
 const map={
  'Expresión demasiado anidada.':'Expression is too deeply nested.',
  'Paréntesis incompletos.':'Unmatched parentheses.',
  'Número inválido.':'Invalid number.',
  'Expresión incompleta o resultado fuera de rango.':'Incomplete expression or result out of range.'
 };
 return map[message]||message;
}
function knowledgeAnswer(topic,mode='both'){
 const item=GLOSSARY.get(fold(topic));
 if(!item)return null;
 if(english()){
  if(mode==='use')return '**'+item.topicEn+' — practical application:** '+item.applicationEn+'\n\n'+item.definitionEn;
  if(mode==='definition')return '**'+item.topicEn+':** '+item.definitionEn;
  return '**'+item.topicEn+'**: '+item.definitionEn+'\n\n**In practice:** '+item.applicationEn;
 }
 if(mode==='use')return '**'+topic+' — aplicación práctica:** '+item.application+'\n\n'+item.definition;
 if(mode==='definition')return '**'+topic+':** '+item.definition;
 return '**'+topic.toUpperCase()+'**: '+item.definition+'\n\n**En la práctica:** '+item.application;
}
function knownTopicIn(text){
 const query=' '+fold(text).replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
 return [...GLOSSARY.keys()].sort((a,b)=>b.length-a.length).find(key=>query.includes(' '+key+' '))||'';
}
export function resolveContextualCoreRequest(text,history=[]){
 const q=fold(text).replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
 const useEnglish=english();
 if(!q||q.length>500||!Array.isArray(history))return null;
 const explicitComparison=q.match(/^(?:cual es )?(?:la )?diferencia entre (.+?) y (.+?)(?: por favor)?$/)||
  q.match(/^(?:what is )?(?:the )?difference between (.+?) and (.+?)(?: please)?$/);
 if(explicitComparison){
  const left=fold(explicitComparison[1]).replace(/^(?:la|el|una|un|the|a|an)\s+/,'');
  const right=fold(explicitComparison[2]).replace(/^(?:la|el|una|un|the|a|an)\s+/,'');
  const first=GLOSSARY.get(left),second=GLOSSARY.get(right);
  if(first&&second&&left!==right){
   if(useEnglish)return {kind:'comparison',text:'**'+first.topicEn+'**: '+first.definitionEn+'\n\n**'+second.topicEn+'**: '+second.definitionEn+'\n\n**Practical difference:** '+first.applicationEn+' '+second.applicationEn+'\n\n*Comparison based on Prisma internal knowledge.*'};
   return {kind:'comparison',text:'**'+left+'**: '+first.definition+'\n\n**'+right+'**: '+second.definition+'\n\n**Diferencia práctica:** '+first.application+' '+second.application+'\n\n*Comparación basada en conocimientos internos de Prisma.*'};
  }
 }
 const asksContinuation=/^(?:y\s+)?(?:para que sirve|como (?:se usa|funciona|lo uso|se aplica)|dame (?:un )?ejemplo|explicalo (?:mejor|mas facil)|puedes ampliarlo|y eso que significa|y en la practica|por que es importante|and )?(?:what is it used for|how do i use it|how does it work|give me an example|explain further|can you expand|why is it important)?(?: (?:eso|en la practica|por favor|please))?$/.test(q);
 if(asksContinuation){
  const previous=history.slice(-8).reverse().find(item=>item?.role==='user'&&String(item.content||'').trim());
  const topic=previous?knownTopicIn(previous.content):'';
  const entry=GLOSSARY.get(topic);
  if(entry){
   const use=/sirve|uso|aplica|ejemplo|practica|importante|used for|use|example|practice|important/.test(q);
   return {kind:'context',text:knowledgeAnswer(topic,use?'use':'both')+(useEnglish?'\n\n*Contextual follow-up resolved without external models.*':'\n\n*Continuación contextual resuelta sin modelos externos.*')};
  }
 }
 const explain=q.match(/^(?:explica(?:me)?|define|que es|para que sirve|como funciona|explain|define|what is|how does)\s+(?:el|la|un|una|the|a|an)?\s*(.+)$/);
 if(explain){
  const topic=fold(explain[1]).replace(/\s+(?:con un ejemplo|en palabras sencillas|de forma sencilla|por favor|in simple terms|in plain language|please)$/,'').trim();
  if(GLOSSARY.has(topic))return {kind:'knowledge',text:knowledgeAnswer(topic,/para que sirve|used for/.test(q)?'use':'both')};
 }
 const twoStage=q.match(/^(?:tengo|parto de|empiezo con|calcula con|sobre)\s+([-+]?\d+(?:[.,]\d+)?)\s*(?:y|,)\s*(?:le\s+)?(?:aplica|haz|realiza|agrega|quita|aumenta|descuenta|suma|resta)\s+(?:un\s+)?(?:aumento|descuento|incremento|rebaja)\s+(?:del?\s+)?(\d+(?:[.,]\d+)?)\s*%\s*(?:y|,|luego|despues|después|y luego|y despues|y después)\s*(?:un\s+)?(?:aplica|haz|realiza|agrega|quita)?\s*(aumento|descuento|incremento|rebaja)\s+(?:del?\s+)?(\d+(?:[.,]\d+)?)\s*%$/);
 if(twoStage){
  const base=number(twoStage[1]),pctA=number(twoStage[2]),pctB=number(twoStage[4]);
  if(![base,pctA,pctB].every(Number.isFinite)||base<0||pctA<0||pctB<0||pctA>1000||pctB>1000)return null;
  const discountA=/descuento|rebaja|quita|resta/.test(q.slice(0,q.indexOf(twoStage[3])));
  const discountB=/descuento|rebaja/.test(twoStage[3]);
  const first=base*(1+(discountA?-1:1)*pctA/100);
  const final=first*(1+(discountB?-1:1)*pctB/100);
  return {kind:'plan',text:useEnglish?'**Two-step calculation verified locally**\n\n1. Starting value: '+format(base)+'. '+(discountA?'Discount':'Increase')+' of '+format(pctA)+'% → **'+format(first)+'**.\n2. '+(discountB?'Discount':'Increase')+' of '+format(pctB)+'% on '+format(first)+' → **'+format(final)+'**.\n\n**Final result: '+format(final)+'**. Percentages are applied successively, not added.':'**Cálculo local verificado en dos pasos**\n\n1. Base: '+format(base)+'. '+(discountA?'Descuento':'Aumento')+' del '+format(pctA)+' % → **'+format(first)+'**.\n2. '+(discountB?'Descuento':'Aumento')+' del '+format(pctB)+' % sobre '+format(first)+' → **'+format(final)+'**.\n\n**Resultado final: '+format(final)+'**. Los porcentajes se aplican sucesivamente, no se suman.'};
 }
 return null;
}
