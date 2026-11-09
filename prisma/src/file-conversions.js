// Capability-based conversion planning: only route to actual Prisma executors.
// Plans are deterministic and require no AI credits.
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
function hasConversionIntent(text){
 const q=norm(text);
 return /(?:convierte|convertir|conversion|conviertelo|conviertela|convirt|transforma|transformar|pasalo|pasala|pasame|pasa|pasar|exporta|exportar|guardalo|guardar|cambiar.*formato|de pdf a|de word a|de imagen a|a formato)/.test(q);
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
 const latest=String(text||''),q=norm(latest),attached=files.length>0;
 const prior=previousTexts.slice(-8).reverse().find(item=>hasConversionIntent(item));
 const followup=attached&&prior&&(/^(?:aqui|ahi|adjunto|ya lo subi|ya lo cargue|este|listo|archivo adjunto|te envio|esta adjunto|aqui esta|aqui tienes|por favor|hazlo|procesa este)/.test(q)||!hasConversionIntent(latest));
 const joined=followup?prior+'\n'+latest:latest;
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
