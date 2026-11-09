// Deterministic task router for common, safe file operations in Prisma Core.
// Never guesses missing destructive parameters or sends uploaded files to a model.
const normalized=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const pdf=file=>/\.pdf$/i.test(file?.name||'')||file?.type==='application/pdf';
const image=file=>String(file?.type||'').startsWith('image/');
const video=file=>String(file?.type||'').startsWith('video/');
const audio=file=>String(file?.type||'').startsWith('audio/');
const csv=file=>/\.csv$/i.test(file?.name||'')||file?.type==='text/csv';
const capture=(source,pattern)=>String(source||'').match(pattern)?.[1]?.trim()||'';
const step=(tool_id,params={},reason='Operación solicitada')=>({tool_id,params,reason});
const result=(message,steps=[])=>({type:steps.length?'ready':'needs-input',message,steps});
const ready=(steps,category)=>result('Voy a realizar '+steps.length+' operaciones de '+category+' en el orden adecuado y entregar el resultado aquí.',steps);

function imageTasks(text){
 const q=normalized(text),steps=[];
 const removeBg=/(?:quita|quitar|elimina|eliminar|borra|borrar|retira|retirar).{0,40}\bfondo\b|fondo transparente/.test(q);
 const privacy=/(?:quita|quitar|elimina|eliminar|limpia|limpiar|borra|borrar).{0,42}(?:metadatos|exif|ubicacion|geolocalizacion)/.test(q);
 const identify=/(?:reconoc|identific|clasific).{0,45}(?:objet|imagen|foto|contenido visual)/.test(q);
 const size=/(?:redimension|dimension|cambiar.{0,12}tama|ajustar.{0,12}tama|\b\d{3,4}\s*[x×]\s*\d{3,4})/.test(q);
 const watermark=/marca de agua|ponle mi marca|pon mi marca/.test(q);
 const compress=/(?:comprim|optimiza|reduce).{0,25}(?:peso|archivo|imagen|foto)|comprim(?:e|ir)\b/.test(q);
 const convert=/(?:convert|export|pasar|guardar).{0,30}(?:webp|png|jpe?g)|(?:webp|png|jpe?g).{0,20}(?:convert|export)/.test(q);
 const grayscale=/blanco y negro|escala de grises/.test(q);
 const social=/(?:instagram|youtube|redes sociales|tiktok)/.test(q)&&/(?:adapta|prepara|ajusta|dimension|tama|redimension)/.test(q);
 if(![removeBg,privacy,identify,size,watermark,compress,convert,grayscale,social].some(Boolean))return null;
 if(identify&&![removeBg,privacy,size,watermark,compress,convert,grayscale,social].some(Boolean))
  return ready([step('image-identify-local',{},'Reconocer objetos con ViT ONNX sin una API')],'imagen');
 if(removeBg)steps.push(step('image-bg',{},'Eliminar fondo usando el modelo local'));
 if(privacy)steps.push(step('image-strip-metadata',{},'Eliminar los metadatos de origen'));
 if(grayscale)steps.push(step('image-grayscale',{},'Convertir a blanco y negro'));
 if(size||social){
  const match=q.match(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/);
  const preset=/youtube|miniatura/.test(q)?[1280,720]:/historia|story|reel|tiktok/.test(q)?[1080,1920]:/instagram|publicacion/.test(q)?[1080,1350]:null;
  const target=match?[Number(match[1]),Number(match[2])]:preset;
  if(!target)return result('Puedo redimensionar la imagen. ¿Qué tamaño quieres? Por ejemplo, 1080 × 1350 píxeles.');
  if(target.some(x=>x<16||x>8000))return result('Indica unas dimensiones entre 16 y 8000 píxeles.');
  steps.push(step('image-resize',{width:target[0],height:target[1],keep:!/\bexact[oa]|deformar\b/.test(q)},'Redimensionar a '+target.join(' × ')+' px'));
 }
 if(watermark){
  const mark=capture(text,/marca\s+de\s+agua\s*(?:que\s+diga|con\s+texto|:|=)\s*["“'«]?([^"”'»\n,.!?]{2,50})/i).replace(/\\s+y\\s+(?:comprim|convert|redimension|quita|elimina|optimiza|recorta).*$/i,'').trim();
  if(!mark)return result('Puedo añadir una marca de agua. ¿Qué texto debe aparecer en la imagen?');
  steps.push(step('image-watermark',{watermark:mark,position:'bottom-right',size:36,opacity:45,color:'#ffffff'},'Añadir marca de agua'));
 }
 if(convert&&!compress){
  const format=/\bwebp\b/.test(q)?'image/webp':/\bjpe?g\b/.test(q)?'image/jpeg':'image/png';
  steps.push(step('image-convert',{format},'Convertir al formato solicitado'));
 }
 if(compress){
  const format=/\bjpe?g\b/.test(q)?'image/jpeg':'image/webp';
  steps.push(step('image-compress',{quality:82,format},'Comprimir la imagen'));
 }
 return ready(steps,'imagen');
}
function videoTasks(text){
 const q=normalized(text),steps=[];
 const transcribe=/(?:transcrib|subtitul|voz a texto|audio a texto)/.test(q);
 const extractAudio=/(?:extrae|extraer|sacar|separa|separar).{0,35}(?:audio|sonido|voz)/.test(q);
 const thumbnail=/(?:fotograma|captura|miniatura|thumbnail|frame)/.test(q);
 const trim=/(?:recortar|recorta|cortar|corta|fragmento|tramo)/.test(q);
 const mute=/(?:sin sonido|sin audio|silencia|silenciar|quita audio|quitar audio|elimina audio|eliminar audio)/.test(q);
 const watermark=/marca de agua/.test(q);
 const summary=/(?:resum|puntos clave|notas|explica lo que dice)/.test(q);
 if(![transcribe,extractAudio,thumbnail,trim,mute].some(Boolean))return null;
 if(thumbnail){
  const second=Number(capture(q,/(?:segundo|en|en el segundo|del segundo)\s*(\d+(?:\.\d+)?)/))||1;
  steps.push(step('video-thumbnail',{second},'Capturar fotograma del vídeo'));
  if(watermark){
   const mark=capture(text,/marca\s+de\s+agua\s*(?:que\s+diga|:|=)\s*["“'«]?([^"”'»\n,.!?]{2,50})/i).replace(/\\s+y\\s+(?:comprim|convert|redimension|quita|elimina|optimiza|recorta).*$/i,'').trim();
   if(!mark)return result('¿Qué texto debe llevar la marca de agua de la miniatura?');
   steps.push(step('image-watermark',{watermark:mark,position:'bottom-right'},'Marcar la miniatura'));
  }
  return ready(steps,'vídeo');
 }
 if(trim){
  const range=q.match(/(?:desde|del|entre)\s*(?:el\s*)?(?:segundo\s*)?(\d+(?:\.\d+)?)\s*(?:al|hasta|y)\s*(?:el\s*)?(?:segundo\s*)?(\d+(?:\.\d+)?)/);
  const start=range?Number(range[1]):Number(capture(q,/inicio\s*(?:en|:|=)?\s*(\d+(?:\.\d+)?)/));
  const duration=range?Number(range[2])-start:Number(capture(q,/duraci[oó]n\s*(?:de|:|=)?\s*(\d+(?:\.\d+)?)/));
  if(!(duration>0))return result('Para recortar el vídeo, indícame el inicio y el final en segundos; por ejemplo, «del segundo 10 al 25».');
  steps.push(step('video-trim',{start,duration},'Conservar el fragmento solicitado'));
 }
 if(mute)steps.push(step('video-mute',{},'Quitar el audio del vídeo'));
 if(extractAudio||transcribe)steps.push(step('video-audio',{},'Extraer audio del vídeo'));
 if(transcribe)steps.push(step('ai-transcribe',{provider:'auto',language:'auto'},'Transcribir el audio con el motor disponible'));
 if(transcribe&&summary)steps.push(step('ai-assistant',{provider:'auto',task:'summary',prompt:'Resume claramente la transcripción. Señala los puntos clave y no inventes nada fuera de lo transcrito.'},'Resumir la transcripción'));
 return ready(steps,'vídeo');
}
function audioTasks(text){
 const q=normalized(text),transcribe=/(?:transcrib|voz a texto|audio a texto|pasa a texto)/.test(q);
 const trim=/(?:recort|cort|fragmento)/.test(q),summary=/(?:resum|puntos clave|notas|ideas principales)/.test(q);
 if(!transcribe&&!trim)return null;
 const steps=[];
 if(trim){
  const range=q.match(/(?:desde|del|entre)\s*(?:el\s*)?(?:segundo\s*)?(\d+(?:\.\d+)?)\s*(?:al|hasta|y)\s*(?:el\s*)?(?:segundo\s*)?(\d+(?:\.\d+)?)/);
  if(!range)return result('Indícame el tramo del audio, por ejemplo «del segundo 5 al 20».');
  steps.push(step('audio-trim',{start:Number(range[1]),duration:Number(range[2])-Number(range[1])},'Recortar el audio'));
 }
 if(transcribe)steps.push(step('ai-transcribe',{provider:'auto',language:'auto'},'Transcribir el audio'));
 if(transcribe&&summary)steps.push(step('ai-assistant',{provider:'auto',task:'summary',prompt:'Resume esta transcripción de forma fiel y organizada. Incluye ideas clave, sin inventar contenido.'},'Resumir transcripción'));
 return ready(steps,'audio');
}
export function buildSmartLocalFlow(text,files=[],recentTexts=[]){
 const latest=String(text||''),q=normalized(latest),file=files[0];
 const previous=recentTexts.slice(-7).reverse().find(s=>/(?:quita|elimina|redimension|comprim|convierte|audita|transcrib|recorta|miniatura|fotograma|formulario|blanco|ocr)/.test(normalized(s))&&String(s).length<1500);
 const reference=files.length&&/^(?:aqui|adjunto|este archivo|ya lo cargue|listo|hazlo|procesa este archivo|analiza los archivos)/.test(q)&&previous?previous+'\n'+latest:latest;
 const target=normalized(reference);
 const valid=ids=>ids.every(id=>true);
 if(pdf(file)){
  if(/(?:inspeccion|revisa|lista|muestra|consulta).{0,36}(?:campo|formulario)/.test(target))return ready([step('pdf-form-fields',{},'Inspeccionar los campos interactivos')],'PDF');
  if(/(?:aplana|aplanar|fija|fijar).{0,35}(?:formulario|pdf|campos)/.test(target))return ready([step('pdf-form-flatten',{},'Aplanar el formulario')],'PDF');
  if(/(?:insert|anade|agrega|pon).{0,30}(?:pagina|hoja).{0,20}(?:blanc|vacia)/.test(target)){
   const count=Number(capture(target,/\b(\d+)\s+(?:paginas?|hojas?)/))||1;
   return ready([step('pdf-add-blank',{count:Math.min(10,count),position:/al principio|al inicio|antes|delante/.test(target)?'start':'end'},'Insertar páginas en blanco')],'PDF');
  }
  return null;
 }
 if(image(file)){
  if(/(?:foto|imagen|imagenes?).{0,45}(?:a pdf|en pdf)|(?:convert|pasar).{0,45}(?:foto|imagen).{0,25}pdf/.test(target))
   return ready([step('image-pdf',{pageSize:'a4'},'Convertir imágenes a PDF')],'imágenes');
  const imagePlan=imageTasks(reference);
  if(imagePlan)return imagePlan;
  if(/(?:extrae|saca|reconoc|lee).{0,30}(?:texto|ocr)/.test(target)){
   const steps=[step('image-ocr',{language:'spa'},'Reconocer texto mediante OCR')];
   if(/\bresum|puntos clave|explica/.test(target))steps.push(step('ai-assistant',{provider:'auto',task:'summary',prompt:'Resume el texto OCR con fidelidad y señala palabras poco claras.'},'Resumir el texto OCR'));
   return ready(steps,'imagen');
  }
 }
 if(video(file))return videoTasks(reference);
 if(audio(file))return audioTasks(reference);
 if(csv(file)&&/(?:auditor|analiz|perfil|columnas|nulos|vacios|duplicad|calidad de datos|estadistic)/.test(target))
  return ready([step('csv-profile-local',{delimiter:'auto'},'Analizar filas, columnas y duplicados')],'CSV');
 if(!file){
  if(/(?:clasificar|reconocer|identificar).{0,35}(?:imagen|foto|objeto)/.test(target))
   return result('Puedo reconocer objetos con ViT ONNX directamente en tu dispositivo. Adjunta una imagen para descargar y ejecutar el modelo local.');
  if(/(?:transcrib|audio a texto|voz a texto)/.test(target))
   return result('Puedo transcribir grabaciones usando Groq Whisper si hay cuota disponible. Adjunta un archivo de audio para empezar.');
  if(/(?:quitar fondo|eliminar fondo|eliminar metadatos).{0,45}(?:imagen|foto)|(?:imagen|foto).{0,45}(?:quitar fondo|eliminar metadatos)/.test(target))
   return result('Prisma tiene herramientas locales para esa edición. Adjunta la imagen para preparar el resultado.');
 }
 return null;
}
