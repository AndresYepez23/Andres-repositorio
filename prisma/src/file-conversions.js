// Capability-based conversion planning: only route to actual Prisma executors.
// Plans are deterministic and require no AI credits.
import {extractPayload} from './core-capabilities.js';
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const ext=file=>String(file?.name||'').split('.').pop().toLowerCase();
const sourceKind=file=>{
 const suffix=ext(file),mime=String(file?.type||'').toLowerCase();
 if(suffix==='pdf'||mime==='application/pdf')return 'pdf';
 if(suffix==='docx'||mime.includes('officedocument.wordprocessingml'))return 'docx';
 if(['jpg','jpeg','png','webp'].includes(suffix)||mime.startsWith('image/'))return 'image';
 if(['mp4','mov','mkv','webm','avi'].includes(suffix)||mime.startsWith('video/'))return 'video';
 if(['mp3','wav','ogg','m4a','flac','aac'].includes(suffix)||mime.startsWith('audio/'))return 'audio';
 if(suffix==='csv'||mime==='text/csv')return 'csv';
 if(suffix==='json'||mime==='application/json')return 'json';
 if(['xlsx','xls'].includes(suffix))return 'excel';
 if(['txt','md','markdown','html','htm'].includes(suffix))return 'text';
 return '';
};
const FORMATS={
 word:'docx',docx:'docx',doc:'docx',
 pdf:'pdf',
 png:'png',jpg:'jpg',jpeg:'jpg',webp:'webp',
 imagen:'png',imagenes:'png',foto:'png',fotos:'png',
 gif:'gif',mp3:'mp3',wav:'wav',ogg:'ogg',audio:'wav',
 csv:'csv',json:'json',
 excel:'xlsx',xlsx:'xlsx',xls:'xlsx',
 txt:'txt',texto:'txt',html:'html',markdown:'md',md:'md'
};
const formatPattern='(?:word|docx|doc|pdf|png|jpe?g|webp|imagenes?|fotos?|gif|mp3|wav|ogg|audio|csv|json|excel|xlsx|xls|txt|texto|html|markdown|md)';
function getTarget(text){
 const q=norm(text);
 const expressions=[
  new RegExp('(?:a|al|en|como|formato|tipo)\\s+(?:(?:un|una|archivo|documento|formato|de|tipo)\\s+){0,3}('+formatPattern+')\\b','i'),
  new RegExp('(?:quiero|necesito|dame|genera|crear|haz|hacer)\\s+(?:(?:un|una|el|la|archivo|documento)\\s+){0,3}('+formatPattern+')\\b','i'),
  new RegExp('(?:salida|resultado|extension|extensión)\\s*[:=]\\s*('+formatPattern+')\\b','i')
 ];
 for(const e of expressions){const m=q.match(e);if(m)return FORMATS[m[1]]||'';}
 return '';
}
export {getTarget as requestedConversionFormat};
function hasConversionIntent(text){
 const q=norm(text);
 return /(?:convierte|convertir|conversion|conviertelo|conviertela|convirt|transforma|transformar|pasalo|pasala|pasame|pasa|pasar|exporta|exportar|guarda|guardalo|guardar|cambiar.*formato|de pdf a|de word a|de imagen a|a formato)/.test(q);
}
const step=(id,params={},description='Conversión solicitada')=>({tool_id:id,params,reason:description});
const warning=(message,type='needs-input')=>({type,message,steps:[]});
const ready=(steps,message)=>({type:'ready',message,steps});
const LIMITS={
 pdf:'Word (.docx), texto (.txt), páginas en PNG/JPG (ZIP)',
 docx:'PDF (guardar desde la impresión), HTML o TXT',
 image:'PDF, PNG, JPG o WebP',
 video:'GIF de hasta 12 segundos, WAV, MP3 u OGG',
 audio:'MP3, WAV u OGG',
 excel:'CSV o JSON',
 csv:'JSON o Excel (.xlsx)',
 json:'CSV o Excel (.xlsx)',
 text:'PDF, Word (.docx), TXT o HTML (el contenido se exporta con formato básico)'
};
// Derive compatibility from the same routes that perform conversion. An
// assessment never selects a target on the user's behalf or executes a write.
const TARGETS=['docx','pdf','png','jpg','webp','gif','mp3','wav','ogg','csv','json','xlsx','txt','html'];
export function compatibleFileConversions(file,kind=sourceKind(file)){
 return TARGETS.map(target=>({target,...convert(kind,target,[file],'')})).filter(plan=>plan.type==='ready');
}
export function planFileAssessment(text,files=[]){
 const instruction=norm(extractPayload(text).instruction).replace(/"[^"\n]*"|“[^”\n]*”/g,'');
 const q=instruction.split(/[,;.!?]|\s+(?:pero|y|but|and)\s+/).filter(clause=>!/^\s*(?:no\b|sin\b|do not\b|don't\b|without\b)/.test(clause)).join('. ');
 if(/\b(?:cancela|cancelar|detente|cancel|stop)\b/.test(q))return null;
 const identify=/\b(?:identifica\w*|determina\w*|detecta\w*|inspecciona\w*|averigua\w*|identify|inspect|detect|determine)\b.{0,65}\b(?:tipo|formato|type|format)\b/.test(q);
 const compatible=/\b(?:conversiones?|formatos?|conversions?|formats?)\b.{0,45}\b(?:compatibles?|disponibles?|admitid\w*|soportad\w*|supported|available|compatible)\b|\b(?:a que|a cuales|que|cuales|which|what)\s+formatos?\b/.test(q);
 const preservation=/\b(?:formatos?|conversiones?|conversions?|formats?|convertir|convert)\b/.test(q)&&/\b(?:cual|que|compara\w*|explica\w*|recomienda\w*|which|compare|explain|recommend)\b.{0,90}\b(?:conserv\w*|preserv\w*|pierde|perdida|fidelidad|contenido|estructura|retains?|preserves?|fidelity)\b/.test(q);
 if(!(identify||compatible||preservation)||!(files.length||/\b(?:archivo|documento|adjunto|pdf|docx|conversion|convertir|file|document|attachment|convert)\b/.test(q)))return null;
 if(!files.length)return warning('Adjunta el archivo para identificar su tipo y explicar las conversiones compatibles antes de elegir un destino.');
 return {type:'assessment',message:'Inspeccionar el archivo y evaluar las conversiones locales antes de elegir un formato.',
  steps:[step('file-inspector',{},'Identificar el archivo sin modificarlo')],destination:getTarget(q)};
}
const PRESERVATION={
 docx:'Para conservar texto y estructura semántica (títulos, tablas e imágenes compatibles), HTML suele ser la mejor opción local. Mammoth no reproduce exactamente la maquetación de Word. PDF usa esa misma vista HTML y requiere «Guardar como PDF» en la impresión del navegador; puede variar el diseño. TXT conserva solo texto: pierde imágenes, tablas como estructura y estilos. Conserva el DOCX original si necesitas fidelidad completa.',
 pdf:'PNG conserva mejor el aspecto visual de las páginas como imágenes en un ZIP, pero pierde texto editable y accesibilidad. JPG añade compresión con pérdida. Word y TXT recuperan texto seleccionable; la ruta a Word no conserva imágenes ni diseño complejo. Un escaneo necesita OCR para recuperar texto. Conserva el PDF original para mantener su estructura.',
 text:'TXT conserva el texto sin añadir formato. HTML permite mostrarlo con formato básico; PDF y Word se generan desde texto y pueden simplificarlo. Para HTML o Markdown originales, conserva el original si importan estilos, enlaces o estructura.',
 image:'PNG conserva los píxeles sin compresión con pérdida y admite transparencia. JPG pierde transparencia y añade pérdida; WebP puede comprimir con pérdida. PDF coloca las imágenes en páginas. Conserva el original para mantener sus metadatos.',
 excel:'CSV y JSON exportan los datos de la hoja seleccionada, no todas las hojas ni los estilos, fórmulas o gráficos del libro. Conserva el Excel original para retenerlos.',
 csv:'JSON conserva filas y campos como datos; Excel permite trabajar con la tabla. Revisa tipos, ceros iniciales y campos vacíos al cambiar de formato. No se garantiza conservar la representación textual exacta del CSV.',
 json:'Excel y CSV sirven para datos tabulares; estructuras anidadas y tipos JSON pueden perderse. Conserva el JSON original si necesitas mantener toda su estructura.',
 audio:'WAV evita una nueva compresión con pérdida; MP3 y OGG pueden perder detalle. Ningún formato recupera información ya perdida en el original.',
 video:'Estas rutas extraen audio o generan un GIF de un fragmento (máximo 12 segundos; por defecto 5): ninguna conserva todo el vídeo con su audio. Conserva el original para mantener todo su contenido.'
};
export async function assessFileConversions(files,{run,progress=()=>{}}={}){
 const reports=[];
 for(const file of files){
  progress('Inspeccionando '+file.name+'…');
  const result=await run('file-inspector',[file],{});
  const inspection=result?.inspection;
  if(!inspection)throw Error('La inspección no devolvió evidencia del tipo de archivo.');
  const kind=inspection.kind,declared=sourceKind(file);
  const routes=compatibleFileConversions(file,kind);
  reports.push('**'+file.name+'**\n'+result.text+'\n\n'+
   (kind!==declared?'El contenido detectado no coincide con el tipo declarado o la extensión. Corrige el nombre o revisa el archivo antes de convertirlo.\n\n':'')+
   (routes.length?'**Conversiones locales compatibles:** '+routes.map(r=>r.target.toUpperCase()).join(', ')+'.\n\n'+(PRESERVATION[kind]||'Revisa el resultado y conserva el original.'):
    'No hay una conversión local confirmada para el tipo detectado. No elegiré una herramienta basándome solo en su nombre.'));
 }
 return reports.join('\n\n')+'\n\nLa evaluación es local y no ha convertido ni modificado los archivos. ¿Qué formato prefieres?';
}
function convert(source,target,files,query){
 const filename=files[0]?.name||'archivo';
 if(source==='pdf'){
  if(target==='docx')return ready([step('pdf-to-word',{},'Recuperar el texto del PDF en un Word editable')],'Convertiré el PDF a DOCX. El texto se conserva, pero el diseño complejo puede necesitar ajustes.');
  if(target==='txt')return ready([step('pdf-text',{},'Extraer texto seleccionable en un archivo TXT')],'Exportaré el texto seleccionable del PDF a TXT. Los escaneos necesitan OCR.');
  if(['png','jpg'].includes(target))return ready([step('pdf-to-image',{format:target==='jpg'?'jpeg':'png',scale:1.5},'Exportar páginas como '+target.toUpperCase()+' en ZIP')],'Convertiré cada página a '+target.toUpperCase()+' y reuniré las imágenes en un ZIP descargable.');
 }
 if(source==='docx'){
  if(target==='pdf')return ready([step('docx-pdf',{},'Preparar vista de impresión para guardar como PDF')],'Abriré una vista de impresión desde Word. Debes elegir «Guardar como PDF» en el navegador; el diseño puede variar.');
  if(target==='html')return ready([step('docx-html',{},'Exportar el documento Word a HTML')],'Prepararé un HTML descargable usando Mammoth.');
  if(target==='txt')return ready([step('text-file-convert',{output:'txt'},'Extraer el texto de Word a TXT')],'Extraeré el texto de Word y generaré un TXT para descargar.');
 }
 if(source==='image'){
  if(target==='pdf'){
   if(files.some(file=>sourceKind(file)!=='image'))return warning('Selecciona solamente imágenes JPG, PNG o WebP para unirlas en PDF.');
   return ready([step('image-pdf',{pageSize:'a4'},'Unir imágenes en un PDF')],'Convertiré '+files.length+' imagen(es) a un PDF descargable.');
  }
  if(['png','jpg','webp'].includes(target))return ready([step('image-convert',{format:target==='jpg'?'image/jpeg':'image/'+target},'Convertir la imagen a '+target.toUpperCase())],'Exportaré la imagen como '+target.toUpperCase()+'.');
 }
 if(source==='video'){
  if(target==='gif')return ready([step('video-gif',{start:0,duration:5},'Generar GIF con los primeros 5 segundos')],'El generador GIF admite fragmentos de máximo 12 s. Crearé un GIF de los primeros 5 segundos, a menos que especifiques otro tramo.');
  if(target==='wav')return ready([step('video-audio',{},'Extraer el audio en WAV')],'Separaré el audio del vídeo y entregaré un WAV.');
  if(['mp3','ogg'].includes(target))return ready([step('video-audio',{},'Extraer la pista de audio'),step('audio-convert',{format:target},'Convertir audio a '+target.toUpperCase())],'Extraeré el audio del vídeo y lo convertiré a '+target.toUpperCase()+'. La operación puede requerir memoria en dispositivos móviles.');
 }
 if(source==='audio'){
  if(['mp3','wav','ogg'].includes(target))return ready([step('audio-convert',{format:target},'Convertir audio a '+target.toUpperCase())],'Convertiré el audio al formato '+target.toUpperCase()+' usando FFmpeg en el navegador.');
 }
 if(['excel','csv','json'].includes(source)){
  if(['csv','json','xlsx'].includes(target))return ready([step('table-file-convert',{output:target,sheet:'0'},'Convertir datos tabulares a '+target.toUpperCase())],'Convertiré los datos a '+target.toUpperCase()+' sin enviarlos a un servidor de IA.');
 }
 if(source==='text'){
  if(['pdf','docx','txt','html'].includes(target))return ready([step('text-file-convert',{output:target},'Convertir documento de texto a '+target.toUpperCase())],'Prepararé un '+target.toUpperCase()+' descargable con el contenido del archivo. El formato se simplifica cuando se convierte a PDF o Word.');
 }
 return warning('Puedo procesar «'+filename+'», pero aún no existe una conversión local segura a «'+target.toUpperCase()+'» para ese tipo de archivo. Conversiones disponibles: '+(LIMITS[source]||'revisa el explorador de herramientas')+'.','unsupported');
}
export function planFileConversion(text,files=[],previousTexts=[]){
 const assessment=planFileAssessment(text,files);if(assessment)return assessment;
 const latest=String(text||''),q=norm(latest),attached=files.length>0;
 const history=previousTexts.slice(-8).map(item=>String(item||''));
 const priorIndex=history.findLastIndex(item=>hasConversionIntent(item));
 const prior=priorIndex>=0?history[priorIndex]:null;
 // A new instruction always wins. An old conversion is continued only when
 // this turn merely confirms that the requested source file was uploaded.
 const attachmentOnly=/^(?:aqui|ahi|aqui esta|aqui tienes|aqui esta el archivo|aqui tienes el archivo|aqui esta el pdf|aqui tienes el pdf|adjunto|adjunto el pdf|adjunto el archivo|archivo adjunto|el archivo adjunto|este archivo|este es el archivo|este es el pdf|te envio|te envio el archivo|te envio el pdf|ya lo subi|ya lo cargue|ya lo adjunte|esta adjunto|listo|hazlo|por favor|procesa este archivo|procesa (?:los |estos |mis )?archivos?(?: adjuntos?)?|procesa (?:el |este )?(?:pdf|archivo)(?: adjunto)?|aqui esta el archivo pdf para editar|aqui esta el documento)[.!?\s]*$/;
 const formatOnly=/^(?:a|en|como)\s+(?:word|docx|doc|pdf|png|jpe?g|webp|csv|json|excel|xlsx|xls|mp3|wav|ogg|txt|html|markdown|md)[.!?\s]*$/i;
 const afterPrior=priorIndex>=0?history.slice(priorIndex+1):[];
 // A newer unrelated command takes precedence over the earlier conversion.
 const superseded=afterPrior.some(message=>!formatOnly.test(norm(message).trim())&&!attachmentOnly.test(norm(message).trim()));
 const latestFormat=afterPrior.filter(message=>formatOnly.test(norm(message).trim())).at(-1)||'';
 const followup=prior&&!superseded&&((attached&&attachmentOnly.test(q))||formatOnly.test(q));
 const joined=followup?[prior,latestFormat,latest].filter(Boolean).join('\n'):latest;
 const isIntent=hasConversionIntent(joined)||/^(?:a|en|como)\s+(?:pdf|word|docx|png|jpg|jpeg|webp|csv|json|excel|xlsx|mp3|wav|ogg|txt|html)$/.test(q);
 if(!isIntent)return null;
 const destination=getTarget(latest)||getTarget(joined);
 if(!destination)return warning('¿A qué formato quieres convertir el archivo? Puedes pedir, por ejemplo, PDF, Word, PNG, MP3, CSV o Excel. Las opciones reales dependen del tipo de archivo que adjuntes.');
 if(!attached)return warning('Puedo preparar la conversión a '+destination.toUpperCase()+'. Adjunta el archivo de origen; Prisma seleccionará la herramienta compatible y entregará el resultado, sin simular la conversión.');
 const kind=sourceKind(files[0]);
 if(!kind)return warning('No reconozco el tipo de «'+files[0].name+'». Por ahora necesito un PDF, Word, una imagen, vídeo, audio, CSV, JSON, Excel o archivo de texto.');
 if(files.length>1&&!(kind==='image'&&destination==='pdf'))return warning('Para esta conversión selecciona solo un archivo. Puedes enviarme varias imágenes si deseas unirlas en un PDF.');
 return convert(kind,destination,files,joined);
}
