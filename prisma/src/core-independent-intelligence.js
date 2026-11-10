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
