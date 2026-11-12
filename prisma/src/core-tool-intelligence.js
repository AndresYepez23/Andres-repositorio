// Prisma Core: universal, zero-API capability index and conservative local actions.
// Every ready/beta tool is indexed automatically from the source registry.
// AI providers remain available for ambiguous, semantic and multi-step work.
import { tools, categories } from './registry.js';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}./:+-]+/gu,' ').replace(/\s+/g,' ').trim();
const words = value => normalize(value).split(' ').filter(part => part.length > 2);
const STOP = new Set('para como quiero necesito puedes hacer hazme este esta estos estas archivo archivos todo todas todos sobre cual cuales entre desde hasta donde una unos unas las los del por que con sin mas menos muy algo alguien nuevo buenas gracias quiero necesito dame me de el la lo un una este esa y o en al es se a mi tu su ya the this that these those a an and or but with without for from into onto about what which who how why can could would should please do does did is are was were be been being my your our their me you we they it its as at by on to of in not all more less new help show list have has tool tools feature features file files image images photo photos video videos audio text document documents page pages pdf word spreadsheet data code background metadata color colors palette convert merge combine split extract remove delete clean compress resize crop rotate mute trim speed slow normalize volume waveform subtitles subtitle transcribe transcript speech qr scan inspect type format hash compare minify sort duplicate duplicates email emails link links url urls campaign trackable website web create generate make build write review plan action study guide flashcards decision matrix'.split(' '));
const splitWords = text => [...new Set(words(text).filter(w => !STOP.has(w)))];
const capable = tool => tool && ['ready','beta'].includes(tool.status);
const local = tool => tool && ['local','browser'].includes(tool.mode);
const exact = (q,term) => q.includes(normalize(term));

const ALIASES = {
  'pdf-merge':['une pdf','combina documentos','fusionar pdf','juntar documentos'],
  'pdf-extract':['quedate con paginas','conserva paginas','sacame las hojas'],
  'pdf-text':['extrae el texto del pdf','extrae texto del pdf','lee el texto del pdf','texto del documento pdf','pdf a texto'],
  'pdf-split':['divide pdf','separa hojas','dividelo en partes'],
  'image-bg':['quitar fondo','borrar fondo','fondo transparente'],
  'image-grayscale':['blanco y negro','escala de grises','foto monocromatica'],
  'image-palette':['colores dominantes','extrae colores','paleta de la foto'],
  'image-metadata':['datos exif','metadatos foto','informacion de imagen'],
  'image-strip-metadata':['borra exif','quita ubicacion','limpia metadatos','quitale los metadatos','quita los metadatos','borra datos exif'],
  'image-flip':['voltear foto','espejo imagen','invierte horizontal'],
  'image-favicon':['iconos pwa','favicon','iconos web'],
  'image-sepia':['sepia','tono antiguo'],
  'image-pixelate':['pixelar foto','efecto mosaico'],
  'image-social-kit':['formatos redes sociales','versiones instagram','tamano miniatura'],
  'image-ocr':['leer texto de foto','escanea texto de imagen'],
  'image-identify-local':['identifica objetos','que hay en la imagen'],
  'video-thumbnail':['extrae fotograma','captura del video'],
  'video-mute':['video sin sonido','silenciar video','quita audio del video'],
  'video-speed':['acelera video','camara rapida','video lento'],
  'video-resize':['video vertical','video cuadrado','adapta video tiktok'],
  'video-rotate':['gira video','rotar video'],
  'video-gif':['video a gif','crear gif'],
  'audio-waveform':['forma de onda','onda de audio','visualiza sonido'],
  'audio-normalize':['normaliza volumen','nivelar audio','igualar volumen'],
  'audio-convert':['convertir a mp3','audio a wav','audio a ogg'],
  'audio-trim':['recortar audio','corta grabacion'],
  'ai-transcribe':['transcribe grabacion','audio a texto','voz a texto'],
  'table-file-convert':['excel a csv','json a excel','datos a xlsx'],
  'csv-profile-local':['audita csv','revisa duplicados csv','calidad de datos csv'],
  'text-analyzer-local':['analizar texto','estadisticas del texto'],
  'text-redact-sensitive':['ocultar datos sensibles','oculta claves api','anonimizar texto','borra datos personales','censura correos','oculta telefonos'],
  'utm-builder':['crea url utm','enlaces de campana','enlace rastreable','utm para marketing'],
  'subtitle-srt-local':['crear subtitulos srt','generar srt','subtitulos capcut','guion a subtitulos'],
  'text-extract-emails':['extrae correos','lista emails'],
  'text-extract-urls':['extrae enlaces','lista links'],
  'word-frequency':['palabras frecuentes','terminos repetidos'],
  'word-count':['cuantas palabras','cuenta palabras'],
  'text-dedupe-words-local':['repeticion de palabras','palabras repetidas'],
  'text-summary-local':['resumen gratis','resumen extractivo','resume sin ia'],
  'json-format':['embellece json','ordena json'],
  'json-minify':['minifica json','comprime json'],
  'json-schema-validate':['validar esquema json','verificar schema'],
  'json-to-xml-local':['json a xml'],
  'xml-to-json-local':['xml a json'],
  'html-to-markdown-local':['html a markdown'],
  'csv-to-tsv-local':['csv a tsv'],
  'tsv-to-csv-local':['tsv a csv'],
  'github-discover':['busca repositorios','proyectos github','repositorios open source'],
  'api-explorer':['probar api','consultar endpoint'],
  'ai-code-helper':['corrige codigo','programa funcion'],
  'ai-youtube-kit':['titulo youtube','guion para shorts','descripcion de video','hashtags youtube'],
  'music-lyrics':['escribe cancion','componer alabanza','letra original'],
  'ai-voice':['texto a voz','lee en voz alta','genera narracion'],
  'ai-study-notes':['tarjetas de estudio','guia de estudio','preguntas tipo examen'],
  'ai-compare-options':['comparar opciones','que alternativa conviene','pros y contras','matriz de decision'],
  'ai-action-plan':['crea un plan','plan de accion','organizar proyecto','pasos para lograr'],
  'ai-text-review':['revisa este escrito','detecta contradicciones','corrige claridad','revision critica'],
  'json-compare-local':['diferencias entre json','compara json','cambios de json'],
  'citation-ids-local':['extraer doi','identificar pmid','referencias arxiv','doi de articulos'],
  'qr-vcard':['qr de contacto','tarjeta de contacto qr'],
  'qr-scan':['leer qr','escanear codigo qr','escanea qr','escanea el qr','lee el qr','escanear qr'],
  'file-inspector':['inspecciona archivo','tipo de archivo','firma binaria'],
  'hash-file':['hash de archivo','huella sha256','verificar integridad'],
  'pdf-metadata':['metadatos del pdf','autor del pdf'],
  'pdf-metadata-clean':['quita metadatos pdf','borra autor pdf']
};

const ENGLISH_ALIASES = {
 'pdf-merge':['merge pdf','merge pdf files','combine pdfs','combine pdf files','join pdf documents'],
 'pdf-extract':['extract pdf pages','extract pages from pdf','keep selected pdf pages','save selected pdf pages'],
 'pdf-text':['extract text from pdf','pdf to text','read pdf text'],
 'pdf-split':['split pdf','split pdf into pages','separate pdf pages'],
 'pdf-remove-pages':['remove pages from pdf','delete pdf pages'],
 'pdf-page-numbers':['add page numbers to pdf','number pdf pages'],
 'pdf-rotate':['rotate pdf pages','fix pdf page orientation'],
 'pdf-compress':['compress pdf','reduce pdf file size'],
 'pdf-metadata-clean':['remove pdf metadata','clean pdf metadata'],
 'pdf-metadata':['view pdf metadata','inspect pdf properties'],
 'pdf-to-word':['pdf to word','convert pdf to docx'],
 'docx-pdf':['word to pdf','docx to pdf','convert word document to pdf'],
 'pdf-to-image':['convert pdf to images','export pdf pages as images'],
 'image-pdf':['convert images to pdf','images to pdf'],
 'image-bg':['remove image background','remove photo background','make background transparent'],
 'image-compress':['compress image','reduce image file size'],
 'image-resize':['resize image','change image dimensions'],
 'image-convert':['convert image format','convert png to jpg','convert webp image'],
 'image-crop':['crop image','crop photo'],
 'image-grayscale':['grayscale image','black and white photo'],
 'image-palette':['extract image colors','color palette from photo'],
 'image-metadata':['view image metadata','exif data'],
 'image-strip-metadata':['remove image metadata','strip exif data','remove gps metadata'],
 'image-flip':['flip image','mirror image'],
 'image-ocr':['extract text from image','ocr image','read text in photo'],
 'image-identify-local':['identify objects in image','what is in this picture'],
 'image-favicon':['create favicon','make pwa icons'],
 'image-watermark':['add watermark to image'],
 'video-trim':['trim video','cut video'],
 'video-speed':['speed up video','slow down video','change video speed'],
 'video-resize':['resize video','make video vertical','video for tiktok'],
 'video-rotate':['rotate video'],
 'video-mute':['mute video','remove audio from video'],
 'video-thumbnail':['extract video frame','create video thumbnail'],
 'video-gif':['convert video to gif','create gif from video'],
 'audio-trim':['trim audio','cut audio recording'],
 'audio-convert':['convert audio to mp3','audio to wav','audio to ogg'],
 'audio-normalize':['normalize audio volume','level audio volume'],
 'audio-waveform':['audio waveform','visualize audio waveform'],
 'ai-transcribe':['transcribe audio','audio to text','speech to text'],
 'text-redact-sensitive':['anonymize text','redact sensitive data','hide api keys','remove personal data'],
 'subtitle-srt-local':['create srt subtitles','generate subtitles','convert script to srt'],
 'word-count':['count words','word count','count characters'],
 'word-frequency':['most frequent words','word frequency'],
 'text-summary-local':['summarize text without ai','extractive summary'],
 'text-analyzer-local':['analyze text statistics','text statistics'],
 'text-extract-emails':['extract email addresses','find emails'],
 'text-extract-urls':['extract links','extract urls'],
 'text-remove-accents':['remove accents','remove diacritics'],
 'text-sort':['sort lines alphabetically','sort text'],
 'dedupe-lines':['remove duplicate lines','deduplicate lines'],
 'json-format':['format json','pretty print json','beautify json'],
 'json-minify':['minify json','compress json'],
 'json-compare-local':['compare json files','json differences'],
 'csv-json':['convert csv to json','csv to json'],
 'json-csv':['convert json to csv','json to csv'],
 'csv-profile-local':['audit csv data','check csv duplicates'],
 'table-file-convert':['convert excel to csv','convert spreadsheet'],
 'utm-builder':['create utm link','utm campaign url','trackable campaign link'],
 'qr':['create qr code','generate qr code'],
 'qr-scan':['scan qr code','read qr code'],
 'file-inspector':['inspect file type','identify file format'],
 'hash-file':['calculate file hash','sha256 checksum'],
 'ai-youtube-kit':['youtube title and description','write youtube shorts script'],
 'ai-code-helper':['fix code','write a function'],
 'music-lyrics':['write a song','compose a song'],
 'ai-voice':['text to speech','read aloud'],
 'ai-study-notes':['create study guide','study flashcards','exam questions'],
 'ai-compare-options':['compare options','decision matrix','pros and cons'],
 'ai-action-plan':['create action plan','project roadmap','step by step plan'],
 'ai-text-review':['review text','check contradictions','improve writing']
};
for (const [id,aliases] of Object.entries(ENGLISH_ALIASES)) ALIASES[id] = [...(ALIASES[id]||[]),...aliases];
const ENGLISH_INTENT = [
 ['extract text from pdf','extrae texto del pdf'],['pdf to text','pdf a texto'],['read pdf text','lee el texto del pdf'],
 ['remove image background','quitar fondo'],['remove background','quitar fondo'],
 ['remove image metadata','quita metadatos imagen'],['remove pdf metadata','quita metadatos pdf'],['strip exif data','limpia metadatos exif'],
 ['delete pages from pdf','elimina paginas pdf'],['remove pages from pdf','elimina paginas pdf'],
 ['split pdf into pages','divide pdf'],['split pdf','divide pdf'],['merge pdf files','une pdf'],['combine pdf files','combina documentos'],['merge pdf','une pdf'],['combine pdfs','combina documentos'],
 ['compress pdf','comprime pdf'],['compress image','comprime imagen'],['reduce image file size','reduce peso imagen'],
 ['resize image','redimensiona imagen'],['change image dimensions','redimensiona imagen'],['crop image','recorta imagen'],['crop photo','recorta foto'],
 ['convert pdf to docx','pdf a word'],['pdf to word','pdf a word'],['word to pdf','word a pdf'],['convert images to pdf','convierte imagenes a pdf'],
 ['rotate pdf pages','rota pdf'],['rotate pdf','rota pdf'],['grayscale image','escala de grises'],['black and white photo','blanco y negro'],
 ['extract image colors','extrae colores'],['color palette from photo','paleta de la foto'],['flip image','voltear imagen'],['mirror image','espejo imagen'],
 ['mute video','silenciar video'],['remove audio from video','quita audio del video'],['speed up video','acelera video'],['slow down video','ralentiza video'],
 ['trim video','recorta video'],['convert video to gif','video a gif'],['create gif from video','crear gif'],
 ['audio waveform','forma de onda'],['normalize audio volume','normaliza volumen'],['convert audio to mp3','convertir a mp3'],
 ['transcribe audio','transcribe grabacion'],['audio to text','audio a texto'],['speech to text','voz a texto'],
 ['anonymize text','anonimizar texto'],['redact sensitive data','ocultar datos sensibles'],['hide api keys','oculta claves api'],
 ['create srt subtitles','crear subtitulos srt'],['generate subtitles','generar srt'],['count words','cuenta palabras'],
 ['extract email addresses','extrae correos'],['extract links','extrae enlaces'],['extract urls','extrae enlaces'],
 ['format json','formatea json'],['pretty print json','embellece json'],['minify json','minifica json'],
 ['convert csv to json','convierte csv json'],['convert json to csv','convierte json csv'],['sort lines alphabetically','ordena lineas'],['remove duplicate lines','elimina duplicados'],
 ['create utm link','enlace utm'],['utm campaign url','enlace utm'],['qr code','codigo qr'],['scan qr code','escanea qr'],['inspect file type','inspecciona archivo'],
 ['calculate file hash','hash de archivo'],['sha256 checksum','hash sha256'],['text to speech','texto a voz'],['study guide','guia de estudio'],
 ['study flashcards','tarjetas de estudio'],['decision matrix','matriz de decision'],['action plan','plan de accion'],['review text','revisa este escrito'],
 ['image','imagen'],['photo','foto'],['video','video'],['file','archivo'],['document','documento'],['pages','paginas'],['page','pagina'],
 ['metadata','metadatos'],['background','fondo'],['colors','colores'],['palette','paleta'],['subtitles','subtitulos'],['emails','correos'],
 ['links','enlaces'],['duplicate lines','lineas duplicadas'],['campaign','campana'],['sensitive data','datos sensibles'],['api keys','claves api'],
 ['extract','extrae'],['merge','une'],['combine','combina'],['split','divide'],['remove','elimina'],['delete','elimina'],
 ['compress','comprime'],['resize','redimensiona'],['convert','convierte'],['rotate','rota'],['trim','recorta'],['mute','silencia'],
 ['generate','genera'],['create','crea'],['format','formatea'],['minify','minifica'],['compare','compara'],['sort','ordena'],['scan','escanea'],['inspect','inspecciona']
].sort((a,b)=>b[0].length-a[0].length);
const normalizeIntent = value => {
 let q=normalize(value);
 for(const [english,spanish] of ENGLISH_INTENT) q=q.replaceAll(english,spanish);
 return q;
};

const RELATED = [
 ['image-compress','image-resize','image-convert','image-crop','image-social-kit','image-favicon'],
 ['image-bg','image-watermark','image-strip-metadata','image-rounded','image-adjust','image-grayscale','image-sepia','image-pixelate','image-blur'],
 ['image-metadata','image-palette','image-identify-local','image-ocr','qr-scan'],
 ['pdf-merge','pdf-split','pdf-extract','pdf-remove-pages','pdf-page-numbers','pdf-rotate','pdf-compress','pdf-metadata-clean'],
 ['pdf-to-word','pdf-text','pdf-to-image','image-pdf','docx-html','docx-pdf','text-file-convert'],
 ['video-trim','video-speed','video-resize','video-rotate','video-mute','video-thumbnail','video-gif','video-audio'],
 ['audio-trim','audio-convert','audio-normalize','audio-waveform','ai-transcribe','ai-voice'],
 ['table-file-convert','excel-json','json-xlsx','csv-profile-local','csv-stats','csv-json','json-csv','csv-to-tsv-local','tsv-to-csv-local'],
 ['json-format','json-minify','json-flatten','json-yaml','json-schema','json-schema-validate','json-to-xml-local','xml-to-json-local','json-compare-local'],
 ['word-count','word-frequency','text-analyzer-local','text-summary-local','reading-time-local','text-extract-emails','text-extract-urls','clean-text','text-sort','dedupe-lines'],
 ['html-to-text','html-format','html-to-markdown-local','css-format','js-format','sql-format','xml-format','css-gradient'],
 ['image-gen','image-social-kit','ai-youtube-kit','ai-prompt-lab','music-lyrics','ai-assistant','ai-compare-options','ai-action-plan','ai-text-review'],
 ['citation-generator','flashcards-export','ai-study-notes','text-summary-local','citation-ids-local'],
 ['qr','qr-vcard','barcode','qr-scan'],
 ['hash-file','file-inspector','image-metadata','pdf-metadata','jwt-decode']
];
const RELATED_MAP = new Map();
for(const family of RELATED)for(const id of family){
 const related = RELATED_MAP.get(id) || new Set();
 for(const sibling of family) if(sibling !== id) related.add(sibling);
 RELATED_MAP.set(id, related);
}

function fileKind(file){
 const name=normalize(file?.name),type=String(file?.type||'').toLowerCase();
 if(type==='application/pdf'||name.endsWith('.pdf'))return 'pdf';
 if(type.startsWith('image/')||/\.(png|jpe?g|webp|gif|bmp)$/.test(name))return 'image';
 if(type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/.test(name))return 'video';
 if(type.startsWith('audio/')||/\.(wav|mp3|ogg|m4a|flac)$/.test(name))return 'audio';
 if(/\.(csv|json|xlsx|xls|tsv)$/.test(name))return 'data';
 if(/\.(docx|txt|md|html)$/.test(name)||type.startsWith('text/'))return 'document';
 return 'other';
}
const FILE_CATEGORIES = {
 pdf:new Set(['pdf','privacy','study']),
 image:new Set(['image','creator','privacy','ai']),
 audio:new Set(['media','ai']),video:new Set(['media','creator','ai']),
 data:new Set(['data','office','dev','text']),document:new Set(['text','pdf','study','web'])
};
function acceptedFile(tool,files){
 if(!tool.file)return true;
 const patterns=String(tool.accept||'*/*').toLowerCase().split(',').map(s=>s.trim());
 return files.some(file=>patterns.includes('*/*')||patterns.some(pattern=>{
  const name=String(file.name||'').toLowerCase(),mime=String(file.type||'').toLowerCase();
  return pattern[0]==='.'?name.endsWith(pattern):pattern.endsWith('/*')?mime.startsWith(pattern.slice(0,-1)):mime===pattern;
 }));
}
function scoreTool(tool,query,files){
 const q=normalize(query),tokens=splitWords(query);
 const name=normalize(tool.name+' '+tool.id.replaceAll('-',' '));
 const description=normalize(tool.description);
 const aliases=ALIASES[tool.id]||[];
 let score=0,matched=0;
 if(exact(q,tool.id.replaceAll('-',' ')))score+=24;
 if(exact(q,tool.name)&&name.length>4)score+=18;
 for(const alias of aliases)if(exact(q,alias)){score+=28;matched++;}
 for(const token of tokens){
   if(name.includes(token)){score+=8;matched++;}
   else if(token.length>3&&description.includes(token)){score+=2;matched++;}
   else if(token.length>5&&name.includes(token.slice(0,-2))){score+=4;matched++;}
 }
 if(files?.length){
  if(tool.file)score+=acceptedFile(tool,files)?17:-65;
  else score-=2;
  const kinds=files.map(fileKind);
  if(kinds.some(kind=>FILE_CATEGORIES[kind]?.has(tool.category)))score+=6;
  if(kinds.length>1&&tool.multiple)score+=7;
 }else if(tool.file)score-=3;
 if(tool.mode==='online')score-=3;
 else if(tool.mode==='byok')score-=2;
 else if(tool.mode==='local')score+=3;
 if(tool.status==='beta')score-=1;
 if(!matched)score-=8;
 return Math.round(score);
}
export function coreToolCatalog(){
 return tools.filter(capable);
}
export function relatedCoreTools(id){
 const index=new Map(coreToolCatalog().map(tool=>[tool.id,tool]));
 return [...(RELATED_MAP.get(id)||[])].filter(toolId=>index.has(toolId));
}
export function searchCoreTools(query,files=[],limit=28){
 const all=coreToolCatalog();
 const ranked=all.map(tool=>({...tool,rank:scoreTool(tool,query,files)}))
  .sort((a,b)=>b.rank-a.rank||a.name.localeCompare(b.name,'es'));
 const top=ranked.filter(item=>item.rank>2).slice(0,Math.min(20,limit));
 const chosen=new Set(top.map(tool=>tool.id));
 const index=new Map(ranked.map(item=>[item.id,item]));
 // Related tools complete compatible workflows without prompting all 138 tools to an LLM.
 for(const item of top.slice(0,5)){
  for(const id of relatedCoreTools(item.id)){
   if(chosen.size>=limit)break;
   const candidate=index.get(id);
   if(candidate&&(!files.length||!candidate.file||acceptedFile(candidate,files))){
    chosen.add(id);
   }
  }
 }
 if(chosen.size<limit){
  for(const item of ranked){if(chosen.size>=limit)break;if(!chosen.has(item.id))chosen.add(item.id);}
 }
 return [...chosen].map(id=>index.get(id)).filter(Boolean).slice(0,limit).map(tool=>({
  ...tool,related:relatedCoreTools(tool.id).filter(id=>chosen.has(id)).slice(0,5)
 }));
}
const flow=(message,steps=[])=>({type:steps.length?'ready':'needs-input',message,steps});
const step=(tool_id,params={},reason='Capacidad local seleccionada por Prisma Core')=>({tool_id,params,reason});
const ok=steps=>flow('Prisma Core seleccionó '+steps.length+' herramienta(s) para completar tu solicitud directamente en el dispositivo, sin utilizar cuota de IA.',steps);
const pdf=file=>fileKind(file)==='pdf';
const image=file=>fileKind(file)==='image';
const audio=file=>fileKind(file)==='audio';
const video=file=>fileKind(file)==='video';

// This router executes only high-confidence operations; uncertain intent goes
// to the multimodel planner instead of guessing parameters or silent mutations.
export function planCoreOfflineAction(query,files=[],history=[]){
 const q=normalizeIntent(query),file=files[0];
 if(!q)return null;
 // A reference to an existing image is an editing request, not permission to
 // create a new one. Ask for the missing file before any provider/API call.
 if(!file&&/(?:esta|esa|mi|la|una imagen adjunta)\s+(?:imagen|foto|fotografia)\b/.test(q)
   &&/(?:prepar|adapt|optimiz|edit|retoc|quit|elimin|borr|limpi|metadatos|exif|colores|paleta|redimension|web|png|webp|comprim)/.test(q))
  return flow('Puedo preparar esa imagen sin consumir IA: optimizarla para web, quitar sus metadatos y extraer sus colores. Adjunta primero la imagen original para procesarla desde aquí.');
 if(file&&/^(?:aqui|adjunto|listo|hazlo|este archivo|te lo envio|ya lo subi)\b/.test(q)){
  const prior=history.slice(-6).reverse().find(value=>/volte|sepi|pixel|favico|metadato|hash|huella|forma de onda|normaliz|aceler|velocid|gira|rotar|resolucion|qr|prepar|pagina web|colores|paleta|comprim|optimiz/.test(normalize(value)));
  if(prior)return planCoreOfflineAction(prior+' '+query,files,[]);
 }
 if(file){
  if(/(?:inspeccion|que tipo de archivo|revisa|identifica).{0,35}(?:archivo|formato|firma binaria)/.test(q))
   return ok([step('file-inspector',{},'Inspeccionar formato y firma del archivo')]);
  if(/(?:hash|sha.?256|huella digital|integridad).{0,40}(?:archivo|documento|foto|video|pdf)?/.test(q)&&/(?:hash|sha.?256|huella digital|integridad)/.test(q))
   return ok([step('hash-file',{},'Calcular la huella SHA-256 del archivo')]);
  if(pdf(file)){
   if(/(?:limpi|quit|borr|elimin).{0,35}(?:metadatos|autor|informacion privada)/.test(q))
    return ok([step('pdf-metadata-clean',{},'Limpiar metadatos del PDF')]);
   if(/(?:(?:extrae|extraer|saca|obten|lee|leer).{0,26}(?:texto|contenido).{0,32}(?:pdf|documento)|(?:pdf|documento).{0,28}(?:extrae|saca|lee|obten).{0,24}(?:texto|contenido))/.test(q))
    return ok([step('pdf-text',{},'Extraer el texto seleccionable del PDF sin enviar el documento')]);
   if(/(?:metadatos|autor|propiedades).{0,30}(?:pdf|documento)?/.test(q))
    return ok([step('pdf-metadata',{},'Consultar metadatos del PDF')]);
  }
  if(image(file)){
   const tasks=[];
   // Website preparation means editing the attached image; never image-gen.
   // The three-step flow preserves the original, yields an optimized WebP
   // without the source metadata, and reports its dominant colors locally.
   const forWeb=/(?:prepar|adapt|optimiz|usar|publicar|lista).{0,65}(?:pagina web|sitio web|website|\bweb\b|pwa)|(?:imagen|foto).{0,45}(?:pagina web|sitio web|website)/.test(q);
   const strip=/(?:elimin|borr|quit|limpi|retir).{0,42}(?:exif|metadatos|ubicacion|gps)/.test(q);
   const palette=/(?:extrae|extraer|identifica|muestra|detecta|saca|sacar|obten|obtener).{0,38}(?:colores|paleta)|(?:colores (?:principales|dominantes)|paleta de colores)/.test(q);
   if(forWeb){
     if(strip)tasks.push(step('image-strip-metadata',{},'Eliminar metadatos y geolocalización de origen'));
     const format=/\bpng\b/.test(q)?'image/png':/\bjpe?g\b/.test(q)?'image/jpeg':'image/webp';
     tasks.push(step('image-compress',{format,quality:82},'Preparar una imagen optimizada para la web'));
     if(palette)tasks.push(step('image-palette',{},'Obtener la paleta de colores principales'));
     return ok(tasks);
   }
   // Transformations before inspections prevent losing the original input.
   if(/(?:voltea|voltear|espejo|invertir horizontal|invertir vertical)/.test(q))
    tasks.push(step('image-flip',{direction:/(?:vertical|arriba.*abajo)/.test(q)?'vertical':'horizontal'},'Voltear imagen'));
   if(/\bsepia\b|efecto antiguo/.test(q))tasks.push(step('image-sepia',{},'Aplicar efecto sepia'));
   if(/pixel(?:a|ar|ada|ado)|efecto pixel/.test(q))tasks.push(step('image-pixelate',{},'Aplicar efecto pixelado'));
   if(/(?:elimin|borr|quit|limpi).{0,30}(?:exif|metadatos|ubicacion|gps)/.test(q))
    tasks.push(step('image-strip-metadata',{},'Eliminar metadatos de la imagen'));
   if(/(?:favicon|iconos? (?:para )?(?:web|pwa|sitio)|paquete de iconos)/.test(q))
    tasks.push(step('image-favicon',{},'Crear iconos para web y PWA'));
   // Metadata and palette are read-only: execute without changing the image.
   if(/(?:ver|muestra|inspeccion|consult|lee).{0,25}(?:metadatos|exif|informacion de la foto)/.test(q))
    tasks.push(step('image-metadata',{},'Inspeccionar metadatos de la imagen'));
   if(palette)
    tasks.push(step('image-palette',{},'Extraer los colores dominantes'));
   if(/(?:escane|leer|descifrar|detecta).{0,24}(?:codigo qr|qr)/.test(q))
    tasks.push(step('qr-scan',{},'Leer código QR de la imagen'));
   if(tasks.length&&tasks.length<=4)return ok(tasks);
  }
  if(audio(file)){
   if(/(?:normaliz|nivelar|igualar|equilibrar).{0,35}(?:volumen|audio|sonido)|(?:volumen).{0,25}(?:parejo|uniforme)/.test(q))
    return ok([step('audio-normalize',{},'Normalizar volumen')]);
   if(/(?:forma de onda|onda de audio|visualiza el audio|espectro de audio)/.test(q))
    return ok([step('audio-waveform',{},'Mostrar forma de onda')]);
  }
  if(video(file)){
   if(/(?:acelera|ralentiz|velocidad|camara lenta|camara rapida)/.test(q)){
    const match=q.match(/(?:a|en|x)\s*(0[.,]\d+|[12](?:[.,]\d+)?)\s*x?\b/);
    const speed=match?Number(match[1].replace(',','.')):/camara lenta|ralentiz/.test(q)?.5:/acelera|camara rapida/.test(q)?1.5:0;
    if(!speed)return flow('¿A qué velocidad quieres el vídeo? Por ejemplo, 0.5x, 1.5x o 2x.');
    return ok([step('video-speed',{speed},'Cambiar velocidad del vídeo')]);
   }
   if(/(?:gira|girar|rota|rotar).{0,30}(?:video|grabacion|clip)|(?:video).{0,25}(?:derecha|izquierda|180)/.test(q)){
    const direction=/izquierda|antihorario/.test(q)?'ccw':/\b180\b/.test(q)?'180':/derecha|horario|\b90\b/.test(q)?'cw':'';
    if(!direction)return flow('¿En qué dirección quieres girar el vídeo: izquierda, derecha o 180 grados?');
    return ok([step('video-rotate',{direction},'Corregir orientación del vídeo')]);
   }
   if(/(?:adapta|ajusta|redimension|formato|resolucion).{0,50}(?:video|tiktok|reel|short|vertical|horizontal|cuadrado)|(?:video).{0,25}(?:vertical|cuadrado|horizontal)/.test(q)){
    const resolution=/cuadrad|1:1/.test(q)?'square':/horizontal|16:9/.test(q)?'landscape':/vertical|reel|short|tiktok|9:16/.test(q)?'vertical':'';
    if(!resolution)return flow('¿Qué formato de vídeo deseas: vertical, horizontal o cuadrado?');
    return ok([step('video-resize',{resolution},'Adaptar vídeo a formato '+resolution)]);
   }
  }
  return null;
 }
 // No-file commands must carry a real value. Never send the user's instruction
 // itself to a text transformation as if it were the supplied content.
 const code=String(query).match(/```(?:[a-z]+)?\s*\n([\s\S]*?)\n```/i)?.[1]||'';
 const labelled=String(query).match(/(?:texto|contenido|datos|lista)\s*[:：]\s*([\s\S]{3,})$/i)?.[1]||'';
 const quoted=String(query).match(/[“«"]([^”»"]{4,})[”»"]/)?.[1]||'';
 const payload=(code||labelled||quoted).trim();
 if(payload){
  const actions=[
   [/(?:ocult|anonimiz|censur|enmascar).{0,35}(?:datos sensibles|claves|correos|telefonos|datos personales)|(?:borra|elimina).{0,24}(?:claves api|datos personales)/,'text-redact-sensitive',{}],
   [/(?:crea|generar|prepara|convertir|convierte).{0,36}(?:subtitulos|archivo srt|srt)/,'subtitle-srt-local',{secondsPerCue:4}],
   [/cuenta.{0,12}(?:palabras|caracteres)/,'word-count',{}],
    [/(?:extrae|saca|identifica|busca).{0,25}(?:doi|pmid|arxiv)/,'citation-ids-local',{}],
   [/quita.{0,14}(?:tildes|acentos)/,'text-remove-accents',{}],
   [/ordena.{0,12}(?:lineas|lista|alfabet)/,'text-sort',{}],
   [/elimina.{0,14}(?:duplicad|repetid)/,'dedupe-lines',{}],
   [/extrae.{0,18}(?:correos|emails)/,'text-extract-emails',{}],
   [/extrae.{0,18}(?:enlaces|links|urls)/,'text-extract-urls',{}],
   [/minifica.{0,18}json/,'json-minify',{}],
   [/(?:formatea|embellece|ordena).{0,18}json/,'json-format',{}],
   [/(?:convierte|transforma).{0,20}json.{0,8}csv/,'json-csv',{}],
   [/(?:convierte|transforma).{0,20}csv.{0,8}json/,'csv-json',{}],
   [/crea.{0,16}(?:slug|url amigable)/,'slug',{}],
   [/(?:mayusculas|todo en mayuscula)/,'text-case',{mode:'upper'}],
   [/(?:minusculas|todo en minuscula)/,'text-case',{mode:'lower'}],
   [/(?:frecuencia de palabras|palabras mas repetidas)/,'word-frequency',{}]
  ];
  const choices=actions.filter(([pattern])=>pattern.test(q));
  if(choices.length===1){const [,id,params]=choices[0];return ok([step(id,{text:payload,...params},'Transformar el contenido proporcionado')]);}
 }
 if(/\b(?:utm|enlace rastreable|url de campana|enlace de campaña)\b/.test(q)){
  const url=String(query).match(/https?:\/\/[^\s"'<>]+/i)?.[0]||'';
  const source=String(query).match(/(?:fuente|origen|utm_source)\s*[:=]\s*([\w-]+)/i)?.[1]||'';
  const medium=String(query).match(/(?:medio|utm_medium)\s*[:=]\s*([\w-]+)/i)?.[1]||'';
  const campaign=String(query).match(/(?:campana|campaña|utm_campaign)\s*[:=]\s*([\w-]+)/i)?.[1]||'';
  if(url&&source&&medium&&campaign)
   return ok([step('utm-builder',{url,source,medium,campaign},'Preparar un enlace de campaña rastreable')]);
  return flow('Puedo generar tu enlace UTM sin usar IA. Indícame la URL completa, origen, medio y campaña (por ejemplo: URL: https://ejemplo.com; origen: instagram; medio: social; campaña: lanzamiento).');
 }
 const qrMatch=String(query).match(/(?:codigo\s+qr|c[oó]digo\s+qr|\bqr\b).{0,45}?(https?:\/\/[^\s]+|www\.[^\s]+)/i);
 if(qrMatch&&/(?:crea|crear|genera|generar|haz|quiero|necesito)/.test(q))
  return ok([step('qr',{text:qrMatch[1]},'Crear código QR con el enlace indicado')]);
 return null;
}
function capabilityGroups(){
 const list=coreToolCatalog();
 return categories.filter(category=>category.id!=='all').map(category=>{
  const items=list.filter(tool=>tool.category===category.id);
  if(!items.length)return null;
  return {id:category.id,name:category.name,count:items.length,examples:items.slice(0,2).map(tool=>tool.name)};
 }).filter(Boolean);
}
export function coreCapabilityContext(){
  const list=coreToolCatalog(),localCount=list.filter(local).length;
  const groups=capabilityGroups();
  const english=typeof window!=='undefined'&&window.prismaI18n?.language==='en';
  const t=value=>english?(window.prismaI18n?.t(value)||value):value;
  if(english)return [
   'REAL PRISMA SPACE CAPABILITIES (source: active tool registry):',
   'There are '+list.length+' active or beta tools; '+localCount+' run locally or in the browser.',
   ...groups.map(group=>t(group.name)+': '+group.count+' tools. Example: '+t(group.examples[0])+'.'),
   'I can also explain, summarize, compare, reason, write, create content, and help with programming using connected AI engines.',
   'Local and browser tools do not use AI inference quota; remote capabilities depend on the connection, model, and its limits.',
   'Do not claim a tool is ready unless it appears in this registry. Do not invent features, active engines, results, or completed actions.'
  ].join('\n').slice(0,1450);
  return [
   'CAPACIDADES REALES DE PRISMA SPACE (fuente: registro de herramientas activo):',
   'Hay '+list.length+' herramientas activas o beta; '+localCount+' funcionan localmente o en el navegador.',
   ...groups.map(group=>group.name+': '+group.count+' herramientas. Ejemplo: '+group.examples[0]+'.'),
   'También puedo conversar, explicar, resumir, comparar, razonar, redactar, crear contenido y ayudar con programación mediante los motores de IA conectados.',
   'Las herramientas locales/navegador no necesitan cuota de inferencia; las capacidades remotas dependen de la conexión, el modelo y sus límites.',
   'No afirmes que una herramienta está lista si no figura en este registro. No inventes funciones, motores activos, resultados ni ejecuciones.'
  ].join('\n').slice(0,1450);
}

export function describeCoreTools(query,files=[]){
  const list=coreToolCatalog();
  const localCount=list.filter(local).length;
  const english=typeof window!=='undefined'&&window.prismaI18n?.language==='en';
  const t=value=>english?(window.prismaI18n?.t(value)||value):value;
  if(isBroadCapabilityQuestion(query)){
   const groups=capabilityGroups();
   if(english)return [
    '**I can help with much more than a conversation.** I am the Prisma Space assistant, and I can choose tools based on the result you need.',
    'I currently have **'+list.length+' active tools**, including **'+localCount+' that run locally or in your browser**, without using AI inference quota.',
    '**Main areas**',
    ...groups.map(group=>'- **'+t(group.name)+'** ('+group.count+' tools): '+group.examples.map(t).join(' and ')+'.'),
    '**I can also** explain topics, summarize and analyze information, compare options, reason, code, write, create scripts, and help you plan.',
    'Tell me the result you want or attach a file. I will select and chain compatible tools, and ask for authorization when an operation uses external services.'
   ].join('\n\n');
   return [
    '**¡Puedo ayudarte con bastante más que una conversación!** Soy el asistente de Prisma Space y puedo elegir herramientas según el resultado que necesites.',
    'Actualmente tengo **'+list.length+' herramientas activas**, de las cuales **'+localCount+' funcionan localmente o en tu navegador**, sin consumir cuota de inferencia.',
    '**Mis áreas principales**',
    ...groups.map(group=>'- **'+group.name+'** ('+group.count+(group.count===1?' herramienta':' herramientas')+'): '+group.examples.join(' y ')+'.'),
    '**También puedo** explicar temas, resumir y analizar información, comparar opciones, razonar, programar, redactar, crear guiones y ayudarte a planificar.',
    'Puedes pedirme directamente el resultado que buscas o adjuntar un archivo. Yo selecciono y encadeno las herramientas compatibles; te pediré autorización cuando una operación utilice servicios externos.'
   ].join('\n\n');
  }
  const search=searchCoreTools(query,files,12).filter(tool=>tool.rank>3);
  if(!search.length)return english?'Prisma Core has '+list.length+' active tools (ready or beta), including '+localCount+' local or browser-based tools. I can search by file type or desired result. What would you like to create or transform?':'Prisma Core tiene '+list.length+' herramientas activas (ready o beta), de las cuales '+localCount+' son locales o funcionan en el navegador. Puedo buscar por tipo de archivo o resultado deseado. ¿Qué quieres crear o transformar?';
  const selected=search.slice(0,7);
  return english?'Prisma Core has '+list.length+' available tools, including '+localCount+' local or browser-based tools. The most relevant options for this task are:\n'+selected.map(item=>'- '+t(item.name)+' ('+(local(item)?'no AI quota required':'provider required')+')').join('\n')+'\nTell me the result you want, attach files, and let me choose compatible operations. You do not need to know each tool name.':'Prisma Core conoce '+list.length+' herramientas disponibles, incluyendo '+localCount+' locales o de navegador. Para esta tarea, las más relacionadas son:\n'+selected.map(item=>'- '+item.name+' ('+(local(item)?'sin cuota de IA':'requiere proveedor')+')').join('\n')+'\nPuedes pedirme el resultado final, adjuntar archivos y dejar que seleccione las operaciones. No es necesario indicar el nombre de cada herramienta.';
}

function isBroadCapabilityQuestion(query){
  const q=normalize(query);
  const specific=/\b(pdf|documentos?|imagenes?|fotos?|videos?|audio|excel|hojas de calculo|csv|json|codigo|programacion|web|miniaturas?|youtube|redes sociales)\b/.test(q);
  const spanish=/(?:que|cuales|cuantas).{0,35}(?:habilidades|capacidades|puedes hacer|sabes hacer|puedo pedirte)|(?:que sabes hacer|que puedes hacer|en que puedes ayudarme|como me puedes ayudar|para que sirves|cual es tu repertorio|muestrame todo lo que puedes hacer)/.test(q);
  const english=/(?:what can you do|what are your capabilities|what tools do you have|show me all (?:your )?tools|what can i ask you|how can you help me|what are you able to do|show me your features)/.test(q);
  return (spanish||english)&&!specific;
}

export function isToolDiscoveryQuestion(query){
  const q=normalize(query);
  const specificCapability=/(?:que|cuales|cuantas).{0,40}(?:habilidades|capacidades|puedes hacer|sabes hacer).{0,55}\b(pdf|documentos?|imagenes?|fotos?|videos?|audio|excel|csv|json|codigo|programacion|web)\b/.test(q);
  const generalTools=/(?:que|cuales|cuantas|dime|muestrame|recomienda).{0,45}(?:herramientas|funciones|utilidades|capacidades)|(?:herramientas|funciones|utilidades).{0,35}(?:tienes|hay|recomiendas|puedo usar)|(?:que puedo hacer con|que herramientas usarias para)/.test(q);
  const englishTools=/(?:what tools|which tools|tools for|what can i do with|what features|show me tools|recommend a tool|do you have a tool)/.test(q);
  return isBroadCapabilityQuestion(q)||specificCapability||englishTools||generalTools&&!/(?:crea|convierte|transforma|ejecuta|procesa|genera).{0,30}(?:archivo|imagen|pdf|video)/.test(q);
}
