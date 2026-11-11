// Structured, deterministic language layer. Raw payloads never enter normalization.
import { tools } from './registry.js';
import { buildSmartLocalFlow } from './smart-flows.js';
import { workflowCatalog } from './workflow-catalog.js';
export const normalizeIntent = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/\b(comrpime|conprime)\b/g,'comprime').replace(/\bfndo\b/g,'fondo').replace(/\bpalbras\b/g,'palabras').replace(/\borganisa\b/g,'organiza');
export function fileKind(f){const n=String(f?.name||'').toLowerCase(),t=String(f?.type||'');return t==='application/pdf'||n.endsWith('.pdf')?'pdf':t.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/.test(n)?'image':t.startsWith('video/')?'video':t.startsWith('audio/')?'audio':'data';}
export const CAPABILITIES = [
 ['image-bg','image',/quitar?\w*.*fondo|elimin\w*.*fondo|borr\w*.*fondo|retir\w*.*fondo|sin fondo|fondo.*desapare|dej\w*.*transparen|(?:solo|solamente) el objeto|solo (?:la persona|el sujeto)|aislar? el sujeto|recorta el sujeto.*detras|conserva el objeto/],
 ['image-strip-metadata','image',/(?:quit|borr|elimin|limpi|retir)\w*.*(?:metadatos|exif|ubicacion|gps)/],
 ['image-resize','image',/redimension|\b\d{2,4}\s*[x×]\s*\d{2,4}\b|cambia(?:r)? (?:las )?dimensiones/],
 ['image-compress','image',/comprim|pese menos|baja\w* el peso|reduce.*peso|ocupe menos espacio|mas ligera|tamano del archivo|cargue mas rapido|optimiz|debajo de \d|menos de \d/],
 ['image-convert','image',/(?:conviert|convert|pasa|export|guarda|cambia|transforma|necesito|quiero|version|de jpg).*(?:png|jpe?g|webp)/],
 ['image-palette','image',/(?:extra|saca|obten|identifica|muestra|detecta).*colores|paleta de colores|colores dominantes/],
 ['image-favicon','image',/favicon|iconos.*(?:web|pwa)|crea.*iconos/],
 ['image-grayscale','image',/blanco y negro|escala de grises/],
 ['pdf-merge','pdf',/\b(?:une|unir|junta\w*|combina\w*|fusiona\w*|pega|reune|unifica|agrupa)\b|un (?:solo|unico) pdf|todo en un documento/],
 ['pdf-extract','pdf',/(?:extra|conserva|quedate|saca|solo quiero|guarda|selecciona|aisla|dame|deja|separa|necesito).*(?:paginas|hojas)/],
 ['pdf-remove-pages','pdf',/(?:elimina|quita|borra).*(?:paginas|hojas)/],
 ['pdf-split','pdf',/(?:divide|dividir|separa|separar).*(?:pdf|documento|archivos|partes)|una pagina por archivo/],
 ['pdf-text','pdf',/(?:extra|saca|pasa|dame|quiero|lee|obten|copia|necesito|convierte).*?(?:texto|contenido escrito|contenido textual|palabras)|texto del documento|pdf a texto/],
 ['pdf-compress','pdf',/comprim|pese menos|baja\w* el peso|reduce.*peso/],
 ['pdf-page-numbers','pdf',/numera|numeros de pagina/],
 ['pdf-rotate','pdf',/gira|rota/],
 ['pdf-watermark','pdf',/marca de agua/],
 ['pdf-to-word','pdf',/(?:a|en|como) word|a docx/],
 ['pdf-metadata-clean','pdf',/(?:quita|limpia|borra|elimina).*metadatos/],
 ['json-format','text',/(?:organiza|formatea|embellece|ordena|indenta|sangria|legible|valida|mal formado|sintaxis|comprueba).*json|json bonito|formatear json|json.*mal formado/],
 ['json-minify','text',/(?:minifica|comprime).*json/],
 ['csv-json','text',/(?:csv|tabla).*(?:a|en|como|por) json|json (?:desde|del) (?:este )?csv/],
 ['json-csv','text',/json.*(?:a|en|como) csv/],
 ['qr','text',/\bqr\b/],
 ['word-count','text',/(?:cuenta|cuantas|contar|numero|recuenta|conteo|contador|total).*palabras/],
 ['text-extract-urls','text',/(?:extrae|saca|lista|obten).*(?:enlaces|urls|links)/],
 ['text-extract-emails','text',/(?:extrae|saca|lista|obten).*(?:correos|emails)/],
 ['dedupe-lines','text',/(?:elimina|quita|borra).*(?:filas|lineas) (?:repetidas|duplicadas)/],
 ['text-sort','text',/ordena.*alfabet|organiza.*alfabet/],
 ['clean-text','text',/limpia.*(?:texto|documento)/],
 ['text-diff','text',/compara.*textos|diferencias.*textos/],
 ['flashcards-export','text',/anki|exporta.*tarjetas/]
].map(([id,kind,pattern])=>({id,kind,pattern,tool:tools.find(t=>t.id===id)}));
export const CAPABILITY_WORKFLOWS=workflowCatalog.map(flow=>({...flow}));
export function extractPayload(raw){
 const s=String(raw||'');const fenced=s.match(/```[^\n]*\n([\s\S]*?)\n?```/);if(fenced)return {instruction:s.slice(0,fenced.index),text:fenced[1]};
 const label=s.match(/(?:texto|contenido|datos|lista)\s*:\s*([\s\S]*)$/i);if(label)return {instruction:s.slice(0,label.index),text:label[1]};
 const json=s.search(/[\[{]/);if(json>=0&&/json/i.test(s.slice(0,json)))return {instruction:s.slice(0,json),text:s.slice(json)};
 const colon=s.search(/:(?!\/\/)/);if(colon>=0)return {instruction:s.slice(0,colon),text:s.slice(colon+1).replace(/^\s/, '')};
 const quote=s.match(/[“"]([^”"]+)[”"]\s*$/);if(quote)return {instruction:s.slice(0,quote.index),text:quote[1]};
 return {instruction:s,text:''};
}
const need=message=>({type:'needs-input',message,steps:[],confidence:0});
const mime=q=>/\bwebp\b/.test(q)?'image/webp':/\bpng\b/.test(q)?'image/png':/\bjpe?g\b/.test(q)?'image/jpeg':'';
export function planCapabilityRequest(raw,files=[],task=null){
 let {instruction,text}=extractPayload(raw);let q=normalizeIntent(instruction).trim();
 q=q.replace(/\bsin cambiar (?:las )?dimensiones\b/g,'conservando dimensiones');
 if(task?.text&&!text&&/^(?:ahora|tambien|mejor|con menos)/.test(q))text=task.text;
 if(task&&/^ahora al contrario[.!\s]*$/.test(q)){
  const last=task.steps?.at(-1)?.tool_id;
  if(last==='csv-json')q='json a csv';else if(last==='json-csv')q='csv a json';
  else if(last==='image-convert'&&task.originals?.[0]?.type)q='convierte a '+task.originals[0].type.split('/')[1];
  else return need('Esta operación no tiene una inversa segura. Indica el resultado que necesitas.');
 }
 if(task?.text&&/^ahora (?:a|en) csv/.test(q))q='json a csv';
 if(task?.text&&/^ahora (?:a|en) json/.test(q))q='csv a json';
 if(!q||/^(?:que es|como funciona|para que sirve|explica|por que)\b/.test(q))return null;
 if(/^(?:hazlo|continua|tambien eso|todas|la segunda|el segundo|repite el proceso(?: con este archivo)?)[.!\s]*$/.test(q)&&task?.steps?.length){
  return {type:'ready',message:'Retomo las operaciones de esta tarea.',steps:task.steps.map(s=>({...s,params:{...s.params}})),confidence:1};
 }
 if(/^(?:mejor en|ahora (?:en|a)|con menos calidad|conserva las dimensiones|utiliza el mismo formato|dejala|dejalas)/.test(q)&&task?.steps?.length){
  if(mime(q))q='convierte '+q;
  else if(/menos calidad|debajo|menos de/.test(q))q='comprime '+q;
  else return need('Conservaré las dimensiones y el formato; dime qué operación quieres aplicar.');
 }
 const kinds=new Set(files.map(fileKind));
 let kind=kinds.size===1?[...kinds][0]:/\b(?:foto|imagen|fotograf|png|webp)\w*\b/.test(q)?'image':/\bpdf\b/.test(q)?'pdf':'text';
 if(kinds.size>1)return need('Hay tipos de archivo distintos. Selecciona un grupo compatible para procesarlo sin omitir archivos.');
 // A relative page means one exact output, not a split of every page.
 // Resolve "last" only after the PDF engine knows its actual page count.
 if(kind==='pdf'&&/\\b(?:ultima|ultimo)\\s+(?:pagina|hoja)\\b/.test(q)&&!/\\b(?:elimina|quita|borra)\\b/.test(q)){
  if(!files.length)return need('Adjunta el PDF para extraer únicamente su última página.');
  return {type:'ready',confidence:1,message:'Extraeré solo la última página del PDF en un archivo independiente.',steps:[{tool_id:'pdf-split',params:{mode:'selected',pages:'last'},reason:'Seleccionar exclusivamente la última página'}]};
 }
 if(kind==='image'&&/a pdf|en pdf|como pdf/.test(q))return null;
 if(kind==='pdf'&&/divid|separ|partir|fragment|troce/.test(q)&&!/(?:paginas|hojas)\s*\d/.test(q))return buildSmartLocalFlow(raw,files,[]);
 if(kind==='image'&&/reduce (?:su |el )?tamano/.test(q)&&!/(?:archivo|peso|dimensiones|\d+\s*[x×])/.test(q))return need('¿Quieres reducir el peso del archivo o sus dimensiones en píxeles?');
 if(/(?:sin|no uses|no utilizar).*?(?:ia|inteligencia artificial)/.test(q)&&/\b(?:genera|inventa|escribe).*(?:cuento|ensayo|cancion)/.test(q))return need('Esa creación requiere un motor generativo. Puedo hacer transformaciones locales de un texto que proporciones.');
 let found=CAPABILITIES.filter(c=>(c.kind===kind||c.kind==='text'&&!files.length)&&c.pattern.test(q));
 if(!found.length)return null;
 // Negation is not authorization, and unsupported clauses may not disappear.
 if(/\bno\s+(?:comprim|quit|elimin|convier|extra|gener|cambi)/.test(q))return need('Hay una instrucción negativa. Confirma únicamente las operaciones que sí quieres aplicar.');
 if(/borra.*objeto|cambia.*fondo|reduc.*ruido|sube.*(?:web|instagram)|publica|envia.*correo/.test(q))return need('La petición incluye una operación que este plan local no puede completar. Separa esa operación para no omitirla.');
 if(found.some(c=>c.id==='image-bg')&&!/(?:a|en) (?:webp|jpe?g)/.test(q))found=found.filter(c=>c.id!=='image-convert');
 if(found.some(c=>c.id==='pdf-extract'))found=found.filter(c=>c.id!=='pdf-split');
 if(found.some(c=>c.id==='image-compress'))found=found.filter(c=>c.id!=='image-convert');
 const clauses=q.split(/[,;]|\s+(?:y|luego|despues|tambien)\s+/);
 const unknown=clauses.find(clause=>/\b(?:cambia|borra|quita|elimina|crea|genera|convierte|traduce|resume|envia|publica|recorta|comprime|extrae|ordena|organiza|redimensiona|rota|gira)\b/.test(clause)&&!found.some(c=>c.pattern.test(clause))&&!/conserva|sin cambiar|dimensiones|calidad/.test(clause)&&!(found.some(c=>c.id==='image-bg')&&/sujeto|detras|objeto/.test(clause)));
 if(unknown)return need('No he podido asociar todas las operaciones a un flujo seguro. Aclara esta parte: «'+unknown.trim().slice(0,120)+'».');
 const steps=[];
 for(const c of found){
  const p={};
  if(c.tool.file&&!files.length)return need('Adjunta los archivos que quieres procesar; conservaré el orden de selección.');
  if(c.kind==='text'){
   if(!text&&!(c.id==='qr'&&/https?:\/\//.test(raw)))return need('Pega el contenido después de «texto:» o dentro de un bloque de código.');
   p.text=text||String(raw).match(/https?:\/\/[^\s<>]+/)?.[0]?.replace(/[.,;!?]+$/,'');
  }
  if(c.id==='json-format'){p.indent=/\btab/.test(q)?'tab':Number(q.match(/(\d+) espacios/)?.[1]||2);if(p.indent!=='tab'&&(p.indent<1||p.indent>8))return need('La sangría debe ser de 1 a 8 espacios o una tabulación.');}
  if(c.id==='text-diff'){const blocks=[...String(raw).matchAll(/```[^\n]*\n([\s\S]*?)\n?```/g)];if(blocks.length!==2)return need('Pega los dos textos en dos bloques de código separados.');p.textA=blocks[0][1];p.textB=blocks[1][1];delete p.text;}
  if(c.id==='image-convert')p.format=mime(q)||'image/png';
  if(c.id==='image-compress'){
   p.format=mime(q)||(/mismo formato/.test(q)?files[0]?.type:'image/webp');p.quality=Number(q.match(/calidad\s*(?:de|al)?\s*(\d+)/)?.[1]||(/menos calidad/.test(q)?65:82));
   const target=q.match(/(?:debajo de|menos de|maximo|hasta)\s*(\d+(?:[.,]\d+)?)\s*(kb|mb)/);
   if(p.quality<10||p.quality>100)return need('La calidad debe estar entre 10 y 100.');
   if(target)p.maxBytes=Math.floor(Number(target[1].replace(',','.'))*(target[2]==='mb'?1024*1024:1024));
  }
  if(c.id==='image-resize'){const d=q.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})/);if(!d)return need('Indica ancho y alto en píxeles, por ejemplo 1080 × 720.');p.width=+d[1];p.height=+d[2];p.keep=!/exact|deforma/.test(q);}
  if(['pdf-extract','pdf-remove-pages'].includes(c.id)){const m=q.match(/(?:paginas|hojas)\s*(\d+(?:\s*(?:-|al|a|,|y)\s*\d+)*)/);if(!m)return need('Indica las páginas, por ejemplo 2-4, 7.');p.pages=m[1].replace(/\s+(?:al|a)\s+/g,'-').replace(/\s+y\s+/g,',');}
  if(c.id==='pdf-merge'&&files.length<2)return need('Adjunta al menos dos PDF para unirlos.');
  if(c.id==='pdf-rotate'){const d=q.match(/(90|180|270)/);if(!d&&!/izquierda|derecha/.test(q))return need('Indica 90, 180 o 270 grados, o izquierda/derecha.');p.degrees=d?+d[1]:/izquierda/.test(q)?270:90;}
  if(c.id==='pdf-watermark'){p.watermark=String(raw).match(/marca de agua\s*(?:que diga|:|=)\s*["“]?([^"”\n]+)/i)?.[1];if(!p.watermark)return need('¿Qué texto debe llevar la marca de agua?');}
  if(c.kind==='text'&&steps.some(s=>CAPABILITIES.find(x=>x.id===s.tool_id)?.kind==='text')&&c.id!=='text-diff')delete p.text;
  steps.push({tool_id:c.id,params:p,reason:'Capacidad y parámetros identificados localmente',input:'current'});
 }
 // Shared transformation first, read-only/branch results last. No duplicated calls.
 const order=id=>id==='image-bg'?0:id==='image-strip-metadata'?1:id==='image-resize'?2:id==='image-compress'?3:id==='image-palette'?4:id==='image-favicon'?5:2;
 if(kind==='image')steps.sort((a,b)=>order(a.tool_id)-order(b.tool_id));
 return {type:'ready',confidence:1,message:'Voy a ejecutar '+steps.length+' operación(es), procesando todos los archivos compatibles y comprobando cada resultado.',steps};
}
