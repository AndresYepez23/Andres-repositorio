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
const GLOSSARY=new Map(DATA.map(([k,definition,application])=>[fold(k),{definition,application}]));
const N='[-+]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)';
const number=x=>Number(String(x).replace(',','.'));
const format=x=>Number.isFinite(x)?new Intl.NumberFormat('es-CO',{maximumFractionDigits:6}).format(Number(x.toPrecision(12))):null;
export function solveOfflineArithmetic(text){
 const q=fold(text).replace(/^[¿?¡!\s]+|[¿?¡!\s]+$/g,'');
 if(q.length>150)return null;
 let m=q.match(new RegExp('^(?:cuanto es |calcula |calcular |resuelve )?('+N+')\\s*%\\s*(?:de|del)\\s*('+N+')$'));
 if(m)return '**'+format(number(m[1]))+' % de '+format(number(m[2]))+' = '+format(number(m[1])*number(m[2])/100)+'**. Fórmula: base × porcentaje / 100.';
 m=q.match(new RegExp('^(?:cuanto es |calcula |calcular |resuelve )?('+N+')\\s*([+*/×÷-])\\s*('+N+')$'));
 if(m){const a=number(m[1]),b=number(m[3]),op=m[2];if((op==='/'||op==='÷')&&b===0)return 'No se puede dividir entre cero.';return '**'+format(a)+' '+op+' '+format(b)+' = '+format(op==='+'?a+b:op==='-'?a-b:op==='*'||op==='×'?a*b:a/b)+'**.';}
 m=q.match(new RegExp('^(?:calcula |calcular )?(?:el )?(aumento|descuento) (?:del? )?('+N+')\\s*%\\s*(?:de|sobre)\\s*('+N+')$'));
 if(m){const factor=m[1]==='aumento'?1:-1;return 'Total tras '+m[1]+': **'+format(number(m[3])*(1+factor*number(m[2])/100))+'**.';}
 return null;
}
export function getOfflineExtractiveSummary(text){
 const q=fold(text);
 if(!/^(?:resume|resumir|haz un resumen|sintetiza|extrae (?:las )?ideas principales|dame (?:las )?ideas principales|puntos clave de)\b/.test(q))return null;
 const source=String(text).match(/:\s*([\s\S]+)/)?.[1]?.trim()||'';
 if(source.length<90||source.length>15000)return null;
 const sentences=source.replace(/\r/g,'').split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(x=>x.length>25);
 if(sentences.length<2)return null;
 const freq=new Map();
 for(const w of fold(source).match(/[\p{L}]{4,}/gu)||[])freq.set(w,(freq.get(w)||0)+1);
 const ranked=sentences.map((sentence,i)=>{const words=[...new Set(fold(sentence).match(/[\p{L}]{4,}/gu)||[])];return {sentence,i,score:words.reduce((n,w)=>n+(freq.get(w)||0),0)/(2+Math.sqrt(words.length||1))+(i===0?.5:0)};});
 const selected=ranked.sort((a,b)=>b.score-a.score).slice(0,Math.min(5,Math.ceil(sentences.length*.4))).sort((a,b)=>a.i-b.i);
 return '**Resumen extractivo local** (frases originales, no interpretación generativa):\n\n'+selected.map(s=>'- '+s.sentence).join('\n')+'\n\n*No se ha enviado información a proveedores externos. Revisa la selección antes de usarla como resumen definitivo.*';
}
export function resolveIndependentCoreRequest(text,{allowKnowledge=true}={}){
 const arithmetic=solveOfflineArithmetic(text);
 if(arithmetic)return {kind:'calculation',text:arithmetic};
 const expression=String(text).replace(/^(?:cuanto es|cuánto es|calcula|resuelve)\s+/i,'').replace(/[¿?]/g,'').trim();
 if(/[()+*/^]/.test(expression)){try{const n=evaluateCoreExpression(expression);if(n!==null)return {kind:'calculation',text:'**'+expression+' = '+format(n)+'**. Cálculo local; decimales aproximados con aritmética de punto flotante.'};}catch(error){return {kind:'calculation',text:error.message};}}
 const extraction=getOfflineExtractiveSummary(text);
 if(extraction)return {kind:'extraction',text:extraction};
 if(!allowKnowledge)return null;
 const q=fold(text).replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
 const m=q.match(/^(?:que es|que significa|define|explica(?:me)?|para que sirve|como funciona|en que consiste)\s+(?:(?:un|una|el|la|los|las)\s+)?(.+)$/);
 const topic=m?.[1]?.replace(/\s+(?:en pocas palabras|de manera sencilla|por favor)$/,'').trim()||'';
 const found=GLOSSARY.get(topic);
 if(!found)return null;
 return {kind:'knowledge',text:'**'+topic.toUpperCase()+'**: '+found.definition+'\n\n**En la práctica:** '+found.application};
}
export const INDEPENDENT_CORE_KNOWLEDGE_COUNT=GLOSSARY.size;

/**
 * Deterministic conversational layer. No network inference, no Prisma Mini.
 * Returns null when the request cannot be safely grounded in shipped knowledge.
 * History is restricted to this active conversation by the caller.
 */
function knowledgeAnswer(topic, mode='both'){
 const item=GLOSSARY.get(fold(topic));
 if(!item)return null;
 if(mode==='use')return '**'+topic+' — aplicación práctica:** '+item.application+'\n\n'+item.definition;
 if(mode==='definition')return '**'+topic+':** '+item.definition;
 return '**'+topic.toUpperCase()+'**: '+item.definition+'\n\n**En la práctica:** '+item.application;
}
function knownTopicIn(text){
 const q=' '+fold(text).replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
 // Longer glossary terms win (API key before API), with exact word boundaries.
 return [...GLOSSARY.keys()].sort((a,b)=>b.length-a.length).find(key=>q.includes(' '+key+' '))||'';
}
export function resolveContextualCoreRequest(text,history=[]){
 const q=fold(text).replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
 if(!q||q.length>500||!Array.isArray(history))return null;
 // Only unambiguous requests. No invented facts, no third-party API.
 const explicitComparison=q.match(/^(?:cual es )?(?:la )?diferencia entre (.+?) y (.+?)(?: por favor)?$/);
 if(explicitComparison){
  const left=fold(explicitComparison[1]).replace(/^(?:la|el|una|un)\s+/,'');
  const right=fold(explicitComparison[2]).replace(/^(?:la|el|una|un)\s+/,'');
  const a=GLOSSARY.get(left),b=GLOSSARY.get(right);
  if(a&&b&&left!==right)return {kind:'comparison',text:'**'+left+'**: '+a.definition+'\n\n**'+right+'**: '+b.definition+'\n\n**Diferencia práctica:** '+a.application+' '+b.application+'\n\n*Comparación basada en conocimientos internos de Prisma.*'};
 }
 const asksContinuation=/^(?:y\s+)?(?:para que sirve|como (?:se usa|funciona|lo uso|se aplica)|dame (?:un )?ejemplo|explicalo (?:mejor|mas facil)|puedes ampliarlo|y eso que significa|y en la practica|por que es importante)(?: (?:eso|en la practica|por favor))?$/.test(q);
 if(asksContinuation){
  const previous=history.slice(-8).reverse().find(m=>m?.role==='user'&&String(m.content||'').trim());
  const topic=previous?knownTopicIn(previous.content):'';
  const entry=GLOSSARY.get(topic);
  if(entry){
   const use=/sirve|uso|aplica|ejemplo|practica|importante/.test(q);
   return {kind:'context',text:knowledgeAnswer(topic,use?'use':'both')+'\n\n*Continuación contextual resuelta sin modelos externos.*'};
  }
 }
 // Exact topic identification, not arbitrary embedding-like association.
 const explain=q.match(/^(?:explica(?:me)?|define|que es|para que sirve|como funciona)\s+(?:el|la|un|una)?\s*(.+)$/);
 if(explain){
  const topic=fold(explain[1]).replace(/\s+(?:con un ejemplo|en palabras sencillas|de forma sencilla|por favor)$/,'').trim();
  if(GLOSSARY.has(topic))return {kind:'knowledge',text:knowledgeAnswer(topic,/para que sirve/.test(q)?'use':'both')};
 }
 // Two-stage arithmetic, each intermediate value shown for verification.
 const twoStage=q.match(/^(?:tengo|parto de|empiezo con|calcula con|sobre)\s+([-+]?\d+(?:[.,]\d+)?)\s*(?:y|,)\s*(?:le\s+)?(?:aplica|haz|realiza|agrega|quita|aumenta|descuenta|suma|resta)\s+(?:un\s+)?(?:aumento|descuento|incremento|rebaja)\s+(?:del?\s+)?(\d+(?:[.,]\d+)?)\s*%\s*(?:y|,|luego|despues|después|y luego|y despues|y después)\s*(?:un\s+)?(?:aplica|haz|realiza|agrega|quita)?\s*(aumento|descuento|incremento|rebaja)\s+(?:del?\s+)?(\d+(?:[.,]\d+)?)\s*%$/);
 if(twoStage){
  const base=number(twoStage[1]),pctA=number(twoStage[2]),pctB=number(twoStage[4]);
  if(![base,pctA,pctB].every(Number.isFinite)||base<0||pctA<0||pctB<0||pctA>1000||pctB>1000)return null;
  const isDiscountA=/descuento|rebaja|quita|resta/.test(q.slice(0,q.indexOf(twoStage[3])));
  const isDiscountB=/descuento|rebaja/.test(twoStage[3]);
  const first=base*(1+(isDiscountA?-1:1)*pctA/100);
  const final=first*(1+(isDiscountB?-1:1)*pctB/100);
  return {kind:'plan',text:'**Cálculo local verificado en dos pasos**\n\n1. Base: '+format(base)+'. '+(isDiscountA?'Descuento':'Aumento')+' del '+format(pctA)+' % → **'+format(first)+'**.\n2. '+(isDiscountB?'Descuento':'Aumento')+' del '+format(pctB)+' % sobre '+format(first)+' → **'+format(final)+'**.\n\n**Resultado final: '+format(final)+'**. Los porcentajes se aplican sucesivamente, no se suman.'};
 }
 return null;
}
