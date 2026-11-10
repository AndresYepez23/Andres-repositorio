// Core 5: distinguish capability questions, underspecified requests and
// actual website-generation instructions before spending any provider quota.
// All decisions here are local and deterministic. No prompts are stored.
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();

const WEB=/\b(?:pagina(?:s)? web|sitio(?:s)? web|website|landing(?: page)?|pagina de internet|web de|web para|sitio de internet|web)\b/;
const CREATE=/\b(?:haz(?:me)?|hacer|crea(?:r)?|generar?|disena(?:r)?|constru(?:ye|ir)|desarrolla(?:r)?|programa(?:r)?|prepara(?:r)?|necesito|quiero|puedes|podrias|sabes|serias capaz)\b/;
const QUESTION=/^(?:(?:me )?(?:puedes|podrias|sabes|serias capaz de|es posible|se puede|es posible que|puede prisma)\b)/;
const UNRELATED=/^(?:hola|buenas|adios|gracias|que hora es|cuanto es|que es|quien es|explica|resume|analiza|investiga|ayudame con otra|cambia de tema)\b/;
const CANCEL=/^(?:cancelar|cancela|olvida(?:lo)?|ya no|no quiero|dejalo|salir|detente)(?:\b|$)/;

export const WEBSITE_FOLLOWUP='Sí. Puedo preparar una página adaptable a móvil y computadora y entregarte un archivo HTML para descargar y probar. ¿Qué tipo de página web necesitas?';

function siteDetail(q){
 // The subject or purpose is enough for a safe prototype with placeholders.
 const match=q.match(/\b(?:para|sobre|de|dedicada a|destinada a|que venda|que muestre|donde pueda|tipo)\s+(.+)$/);
 const purpose=match?.[1]?.trim()||'';
 if(!purpose||/^(?:mi negocio|mi empresa|un negocio|una empresa|lo que sea|algo|una pagina|un sitio|mi proyecto|una web|un sitio web)$/.test(purpose))return '';
 if(purpose.length<3)return '';
 return purpose;
}
export function routeWebsiteRequest(text,pending=null,hasAttachments=false,now=Date.now()){
 if(hasAttachments)return null;
 const q=fold(text);
 if(!q)return null;
 const active=pending&&Number(pending.started)>0&&now-Number(pending.started)<24*60*60*1000;
 const mentioned=WEB.test(q);
 if(active&&CANCEL.test(q))return {type:'cancel',message:'Entendido. Cancelé la página web pendiente.'};
 if(active&&(UNRELATED.test(q)||/^(?:ahora\s+)?(?:dame|crea|haz|necesito|quiero).{0,40}\b(?:imagen|miniatura|video|cancion|audio|pdf|otra cosa)\b/.test(q))&&!mentioned)
  return {type:'abandon'};
 // Secondary mentions of a website inside a song/image request are not
 // website-generation instructions. Actual page requests take priority.
 if(/\b(?:cancion|poema|musica|imagen|foto|video|audio|miniatura|logo|banner|texto|pdf)\b/.test(q)&&
    !/\b(?:pagina(?:s)? web|sitio(?:s)? web|website|landing(?: page)?)\b/.test(q))
  return null;
 if(mentioned){
  // Questions about cost, definitions and tutorials are not a creation task.
  if(/^(?:cuanto cuesta|que es|como se hace|como hacer|como funciona|cual es el precio|donde puedo|que necesito para|por que|cual recomiendas)\b/.test(q))
   return null;
  if(!CREATE.test(q)&&!/^una (?:pagina|web|landing)/.test(q))return null;
  const detail=siteDetail(q);
  if(!detail)return {type:'ask',message:WEBSITE_FOLLOWUP};
  // "¿Puedes hacer una página web para...?" contains a real brief; build it.
  return {type:'build',description:String(text).trim()};
 }
 if(active){
  if(QUESTION.test(q)&&/\b(?:responsive|adaptable|gratis|publicarla|hosting|dominio|html|css)\b/.test(q))
   return {type:'answer',message:'Puedo hacerla adaptable a diferentes pantallas y entregarte el HTML. Publicarla en un dominio o activar cuentas y pagos sería un paso aparte. ¿Para qué proyecto es la web?'};
  if(/^(?:si|dale|ok|vale|perfecto|claro|no se|no tengo idea|ayudame a elegir)$/.test(q))
   return {type:'ask',message:'¿Para qué negocio, proyecto o actividad quieres la página? Con eso puedo preparar una primera versión.'};
  return {type:'build',description:'Crea una página web para '+String(text).trim()};
 }
 return null;
}

export function resolveGeneralCapabilityQuestion(text){
 const q=fold(text);
 if(!QUESTION.test(q))return null;
 // Only broad yes/no capability questions with no useful specification.
 if(/\b(?:pagina web|sitio web|website|landing)\b/.test(q))return null;
 if(/^(?:puedes|podrias|sabes|serias capaz de|es posible que|se puede)\s+(?:hacer|crear|componer|escribir|generar)\s+(?:una?\s+)?(?:cancion|letra|musica|alabanza)\b(?:\s+(?:completa|original))?$/.test(q))
  return 'Puedo componer una letra original completa y preparar el prompt musical. No debo afirmar que he generado una pista musical de audio si no existe ese motor conectado. ¿Sobre qué tema quieres la canción?';
 if(/^(?:puedes|podrias|sabes|serias capaz de|es posible que|se puede)\s+(?:hacer|crear|generar|dibujar|disenar)\s+(?:una?\s+)?(?:imagen|foto|ilustracion|miniatura|logo)\b$/.test(q))
  return 'Sí, puedo crear una imagen con un motor habilitado, sujeto a sus cuotas. ¿Qué quieres que aparezca en la imagen?';
 if(/^(?:puedes|podrias|sabes|serias capaz de|es posible que|se puede)\s+(?:editar|convertir|leer|analizar|crear)\s+(?:una?\s+)?(?:pdf|documento|archivo|video)\b$/.test(q))
  return 'Puedo trabajar con esos archivos usando las herramientas disponibles. ¿Qué resultado necesitas exactamente?';
 return null;
}

export function extractWebsiteHtml(value){
 const source=String(value||'').trim();
 if(!source||source.length>250000)throw Error('La respuesta HTML está vacía o supera el tamaño seguro.');
 const fence=source.match(/\`\`\`(?:html)?\s*([\s\S]*?)\`\`\`/i);
 const candidate=(fence?.[1]||source).trim();
 const start=candidate.search(/<!doctype\s+html\b|<html\b/i);
 if(start<0)throw Error('El motor no entregó un documento HTML completo.');
 const end=candidate.toLowerCase().lastIndexOf('</html>');
 if(end<start)throw Error('El HTML está incompleto: falta el cierre del documento.');
 const html=candidate.slice(start,end+7);
 if(!/<head\b[^>]*>[\s\S]*<\/head\s*>/i.test(html)||!/<body\b[^>]*>[\s\S]*<\/body\s*>/i.test(html))
  throw Error('El motor no entregó una página HTML con head y body.');
 // Never package external scripts or embedded frames into the one-file site.
 if(/<script\b[^>]*\bsrc\s*=/i.test(html)||/<iframe\b/i.test(html))
  throw Error('La página contiene código externo que no es compatible con el sitio autónomo.');
 return /^<!doctype\s+html\b/i.test(html)?html:'<!DOCTYPE html>\n'+html;
}
