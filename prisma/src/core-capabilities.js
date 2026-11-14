// Structured, deterministic language layer. Raw payloads never enter normalization.
import { tools } from './registry.js';
import { buildSmartLocalFlow } from './smart-flows.js';
import { workflowCatalog } from './workflow-catalog.js';
const ENGLISH_NEGATIONS = [
 [/\b(?:do not|don't|dont) want to\b/g,'no quiero'],
 [/\b(?:do not|don't|dont) remove\b/g,'no quites'],
 [/\b(?:do not|don't|dont) delete\b/g,'no elimines'],
 [/\b(?:do not|don't|dont) erase\b/g,'no borres'],
 [/\b(?:do not|don't|dont) split\b/g,'no dividas'],
 [/\b(?:do not|don't|dont) merge\b/g,'no unas'],
 [/\b(?:do not|don't|dont) combine\b/g,'no combines'],
 [/\b(?:do not|don't|dont) compress\b/g,'no comprimas'],
 [/\b(?:do not|don't|dont) convert\b/g,'no conviertas'],
 [/\b(?:do not|don't|dont) resize\b/g,'no redimensiones'],
 [/\b(?:do not|don't|dont) crop\b/g,'no recortes'],
 [/\b(?:do not|don't|dont) rotate\b/g,'no gires'],
 [/\b(?:do not|don't|dont) overwrite\b/g,'no sobrescribas'],
 ['without removing','sin quitar'],['without deleting','sin eliminar'],
 ['without cropping','sin recortar'],['without compressing','sin comprimir']
];
const ENGLISH_PHRASES = [
 ['remove the image background','quitar fondo'],['remove image background','quitar fondo'],
 ['remove the background','quitar fondo'],['remove background','quitar fondo'],
 ['make the background transparent','quitar fondo'],['make background transparent','quitar fondo'],
 ['black and white','blanco y negro'],['grayscale','escala de grises'],
 ['pdf to word','pdf a word'],['convert pdf to word','convierte pdf a word'],
 ['convert to word','a word'],['word to pdf','word a pdf'],['convert word to pdf','convierte word a pdf'],
 ['pdf to text','pdf a texto'],['extract text from pdf','extrae texto del pdf'],
 ['read text from pdf','lee texto pdf'],['extract text from image','extrae texto imagen'],
 ['convert images to pdf','imagenes a pdf'],['images to pdf','imagenes a pdf'],['image to pdf','imagen a pdf'],
 ['convert image to png','convierte imagen a png'],['convert image to jpg','convierte imagen a jpg'],
 ['convert image to jpeg','convierte imagen a jpeg'],['convert image to webp','convierte imagen a webp'],
 ['convert to png','a png'],['convert to jpg','a jpg'],['convert to jpeg','a jpeg'],['convert to webp','a webp'],
 ['csv to json','csv a json'],['convert csv to json','convierte csv a json'],
 ['json to csv','json a csv'],['convert json to csv','convierte json a csv'],
 ['excel to csv','excel a csv'],['convert excel to csv','convierte excel a csv'],
 ['csv to excel','csv a excel'],['convert csv to excel','convierte csv a excel'],
 ['json to xml','json a xml'],['convert json to xml','convierte json a xml'],
 ['xml to json','xml a json'],['convert xml to json','convierte xml a json'],
 ['html to markdown','html a markdown'],['convert html to markdown','convierte html a markdown'],
 ['video to gif','video a gif'],['convert video to gif','convierte video a gif'],
 ['audio to text','audio a texto'],['speech to text','voz a texto'],['text to speech','texto a voz'],
 ['remove duplicate lines','elimina lineas duplicadas'],['delete duplicate lines','elimina lineas duplicadas'],
 ['sort lines alphabetically','ordena lineas alfabeticamente'],
 ['extract email addresses','extrae correos'],['extract urls','extrae enlaces'],['extract links','extrae enlaces'],
 ['create qr code','crea codigo qr'],['generate qr code','genera codigo qr'],['scan qr code','escanea codigo qr'],
 ['count words','cuenta palabras'],['word count','cuenta palabras'],
 ['add page numbers','numera paginas'],['number pdf pages','numera paginas'],
 ['add a watermark','marca de agua'],['add watermark','marca de agua'],
 ['remove exif metadata','quita metadatos exif'],['remove gps metadata','quita metadatos gps'],
 ['remove metadata','quita metadatos'],['strip exif','quita exif'],
 ['remove accents','quita tildes'],['remove diacritics','quita diacriticos'],
 ['remove sensitive data','oculta datos sensibles'],['anonymize text','anonimiza texto'],
 ['hide api keys','oculta claves api'],['create subtitles','crea subtitulos'],
 ['generate subtitles','genera subtitulos'],['create flashcards','crea tarjetas'],
 ['make a study guide','crea guia de estudio'],['create an action plan','crea plan de accion'],
 ['create a website','crea una pagina web'],['build a website','crea una pagina web'],
 ['resize video','redimensiona video'],['trim video','recorta video'],['cut video','recorta video'],
 ['mute video','silencia video'],['extract audio from video','extrae audio de video'],
 ['speed up video','acelera video'],['slow down video','ralentiza video'],
 ['compress pdf','comprime pdf'],['compress image','comprime imagen'],
 ['reduce file size','reduce peso'],['resize image','redimensiona imagen'],['resize photo','redimensiona foto'],
 ['change image dimensions','cambia dimensiones imagen'],['crop image','recorta imagen'],['crop photo','recorta foto'],
 ['rotate pdf','rota pdf'],['rotate image','rota imagen'],['rotate photo','rota foto'],
 ['split pdf','divide pdf'],['split this pdf','divide pdf'],['split pdf into pages','divide pdf'],
 ['merge pdfs','une pdf'],['merge pdf files','une pdf'],['combine pdfs','combina pdf'],
 ['combine pdf files','combina pdf'],['join pdf','une pdf'],
 ['extract pages','extrae paginas'],['extract pdf pages','extrae paginas pdf'],
 ['remove pages','elimina paginas'],['delete pages','elimina paginas'],
 ['format json','formatea json'],['pretty print json','formatea json'],
 ['minify json','minifica json'],['validate json','valida json'],
 ['clean text','limpia texto'],['analyze text','analiza texto'],['summarize text','resume texto'],
 ['compare texts','compara textos'],['flip image','voltea imagen'],['mirror image','espejo imagen']
].sort((a,b)=>b[0].length-a[0].length);
const ENGLISH_WORDS = [
 [/\bimages\b/g,'imagenes'],[/\bimage\b/g,'imagen'],[/\bphotos\b/g,'fotos'],[/\bphoto\b/g,'foto'],
 [/\bpictures\b/g,'imagenes'],[/\bpicture\b/g,'imagen'],
 [/\bfiles\b/g,'archivos'],[/\bfile\b/g,'archivo'],
 [/\bdocuments\b/g,'documentos'],[/\bdocument\b/g,'documento'],
 [/\bpages\b/g,'paginas'],[/\bpage\b/g,'pagina'],
 [/\bbackgrounds\b/g,'fondos'],[/\bbackground\b/g,'fondo'],
 [/\bmetadata\b/g,'metadatos'],[/\bwatermark\b/g,'marca de agua'],
 [/\bwords\b/g,'palabras'],
 [/\blines\b/g,'lineas'],[/\bline\b/g,'linea'],
 [/\bemails\b/g,'correos'],[/\bemail\b/g,'correo'],
 [/\burls\b/g,'urls'],[/\burl\b/g,'url'],[/\blinks\b/g,'enlaces'],[/\blink\b/g,'enlace'],
 [/\bsubtitles\b/g,'subtitulos'],[/\bsubtitle\b/g,'subtitulo'],
 [/\bspreadsheets\b/g,'hojas de calculo'],[/\bspreadsheet\b/g,'hoja de calculo'],
 [/\bduplicates\b/g,'duplicados'],[/\bduplicate\b/g,'duplicado'],
 [/\bto\b/g,'a'],[/\bfrom\b/g,'de'],[/\binto\b/g,'a'],[/\bwith\b/g,'con'],
 [/\bwithout\b/g,'sin'],[/\bfor\b/g,'para'],[/\band\b/g,'y'],[/\bor\b/g,'o'],
 [/\bunder\b/g,'debajo de'],[/\bbelow\b/g,'debajo de'],
 [/\bplease\b/g,' '],[/\bkindly\b/g,' '],[/\bthe\b/g,' '],
 [/\bthis\b/g,'este'],[/\bthese\b/g,'estos'],[/\bmy\b/g,'mi'],[/\byour\b/g,'tu'],
 [/\bremove\b/g,'quita'],[/\bdelete\b/g,'elimina'],[/\berase\b/g,'borra'],
 [/\bmerge\b/g,'une'],[/\bcombine\b/g,'combina'],[/\bjoin\b/g,'une'],
 [/\bsplit\b/g,'divide'],[/\bseparate\b/g,'separa'],[/\bextract\b/g,'extrae'],
 [/\bcompress(?:ed|ing)?\b/g,'comprime'],[/\bresize(?:d|ing)?\b/g,'redimensiona'],[/\bconvert(?:ed|ing)?\b/g,'convierte'],
 [/\brotate(?:d|ing)?\b/g,'rota'],[/\bcrop(?:ped|ping)?\b/g,'recorta'],[/\btrim(?:med|ming)?\b/g,'recorta'],
 [/\bmute\b/g,'silencia'],[/\bnormalize\b/g,'normaliza'],[/\btranscribe\b/g,'transcribe'],
 [/\bcount\b/g,'cuenta'],[/\bformat\b/g,'formatea'],[/\bminify\b/g,'minifica'],
 [/\bvalidate\b/g,'valida'],[/\bscan\b/g,'escanea'],[/\bcreate\b/g,'crea'],
 [/\bgenerate\b/g,'genera'],[/\bsort\b/g,'ordena'],[/\bclean\b/g,'limpia'],
 [/\banalyze\b/g,'analiza'],[/\bsummarize\b/g,'resume'],[/\badd\b/g,'anade'],
 [/\bnumber\b/g,'numera'],[/\bread\b/g,'lee'],[/\bflip\b/g,'voltea'],
 [/\bmirror\b/g,'espejo'],[/\bpdfs\b/g,'pdf'],[/\bqr code\b/g,'codigo qr']
];
export const normalizeIntent = value => {
 let q=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 q=q.replace(/\b(comrpime|conprime)\b/g,'comprime').replace(/\bfndo\b/g,'fondo')
  .replace(/\bpalbras\b/g,'palabras').replace(/\borganisa\b/g,'organiza');
 for(const [pattern,replacement] of ENGLISH_NEGATIONS)q=q.replace(pattern,replacement);
 for(const [phrase,replacement] of ENGLISH_PHRASES)q=q.replaceAll(phrase,replacement);
 for(const [pattern,replacement] of ENGLISH_WORDS)q=q.replace(pattern,replacement);
 return q.replace(/\s+/g,' ').trim();
};

export function fileKind(f){const n=String(f?.name||'').toLowerCase(),t=String(f?.type||'');return t==='application/pdf'||n.endsWith('.pdf')?'pdf':t.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/.test(n)?'image':t.startsWith('video/')?'video':t.startsWith('audio/')?'audio':'data';}
export const CAPABILITIES = [
 ['image-bg','image',/quitar?\w*.*fondo|elimin\w*.*fondo|borr\w*.*fondo|retir\w*.*fondo|sin fondo|fondo.*desapare|dej\w*.*transparen|(?:solo|solamente) el objeto|solo (?:la persona|el sujeto)|aislar? el sujeto|recorta el sujeto.*detras|conserva el objeto/],
 ['image-strip-metadata','image',/(?:quit|borr|elimin|limpi|retir)\w*.*(?:metadatos|exif|ubicacion|gps)/],
 ['image-resize','image',/redimension|\b\d{2,4}\s*[x×]\s*\d{2,4}\b|(?:cambia(?:r)?|ajusta(?:r)?) (?:(?:el|las) )?(?:dimensiones|tamano(?! del archivo))/],
 ['image-compress','image',/comprim|pese menos|baja\w* el peso|reduce.*peso|ocupe menos espacio|mas ligera|tamano del archivo|cargue mas rapido|optimiz|debajo de \d|menos de \d/],
 ['image-convert','image',/(?:conviert|convert|pasa|export|guarda|cambia|transforma|necesito|quiero|version|de jpg).*(?:png|jpe?g|webp)/],
 ['image-palette','image',/(?:extra|saca|obten|identifica|muestra|detecta).*colores|paleta de colores|colores dominantes/],
 ['image-favicon','image',/favicon|iconos.*(?:web|pwa)|crea.*iconos/],
 ['image-grayscale','image',/blanco y negro|escala de grises/],
 ['pdf-merge','pdf',/\b(?:une|unir|junta\w*|combina\w*|fusiona\w*|pega|reune|unifica|agrupa)\b|un (?:solo|unico) pdf|todo en un documento/],
 ['pdf-extract','pdf',/(?:extra|conserva|quedate|saca|solo quiero|guarda|selecciona|aisla|dame|deja|separa|necesito).*(?:paginas?|hojas?)/],
 ['pdf-remove-pages','pdf',/(?:elimina|quita|borra).*(?:paginas?|hojas?)/],
 ['pdf-split','pdf',/(?:divide|dividir|separa|separar).*(?:pdf|documento|archivos|partes)|una pagina por archivo/],
 ['pdf-text','pdf',/(?:extra|saca|pasa|dame|quiero|lee|obten|copia|necesito|convierte).*?(?:texto|contenido escrito|contenido textual|palabras)|texto del documento|pdf a texto/],
 ['pdf-compress','pdf',/comprim|pese menos|baja\w* el peso|reduce.*peso/],
 ['pdf-page-numbers','pdf',/numera|numeros de pagina/],
 ['pdf-rotate','pdf',/gira|rota/],
 ['pdf-watermark','pdf',/marca de agua/],
 ['pdf-to-word','pdf',/(?:a|en|como) word|a docx/],
 ['pdf-metadata-clean','pdf',/(?:quita|limpia|borra|elimina).*metadatos/],
 ['json-format','text',/(?:organiza|formatea|embellece|ordena|indenta|sangria|legible|valida|mal formado|sintaxis|comprueba).*json|json bonito|formatear json|json.*mal formado/],
 ['json-minify','text',/(?:minifica|comprime).*json|json.*(?:minifica|minificar)|\bminifica\s+(?:(?:el|la|este|esta|ese|esa|dicho|dicha)\s+)?(?:resultado|salida)\b/],
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
 const label=s.match(/(?:texto|contenido|datos|lista|text|content|data|list)\s*:\s*([\s\S]*)$/i);if(label)return {instruction:s.slice(0,label.index),text:label[1]};
 const json=s.search(/[\[{]/);
 if(json>=0&&/json/i.test(s.slice(0,json))){
  // A JSON literal can sit between two instructions. Never promote strings
  // contained INSIDE the literal into executable user instructions.
  const stack=[];let quoted=false,escaped=false;
  for(let i=json;i<s.length;i++){
   const ch=s[i];
   if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
   if(ch==='"'){quoted=true;continue;}
   if(ch==='{'||ch==='[')stack.push(ch);
   else if(ch==='}'||ch===']'){
    const previous=stack.pop();
    if(previous!==(ch==='}'?'{':'['))break;
    if(!stack.length){
     const literal=s.slice(json,i+1);
     try{
      JSON.parse(literal);
      const prefix=s.slice(0,json).trim().replace(/[:\s]+$/,'');
      const trailing=s.slice(i+1).trim().replace(/^[.;,:\s]+/,'');
      return {instruction:trailing?prefix+'. '+trailing:prefix,text:literal};
     }catch{/* Preserve existing behavior for invalid JSON. */}
     break;
    }
   }
  }
  return {instruction:s.slice(0,json),text:s.slice(json)};
 }
 const colon=s.search(/:(?!\/\/)/);if(colon>=0)return {instruction:s.slice(0,colon),text:s.slice(colon+1).replace(/^\s/, '')};
 const quote=s.match(/[“"]([^”"]+)[”"]\s*$/);if(quote)return {instruction:s.slice(0,quote.index),text:quote[1]};
 return {instruction:s,text:''};
}
// Questions and explanations are NOT permission to modify an uploaded file.
// Keep this guard shared by Core chat and Prisma Developer's MCP planner.
const SPANISH_QUESTION_START=/^(?:como|cual(?:es)?|cuant[ao]s?|que|por que|para que|puedes|podrias|puedo|podemos|me puedes|me podrias|es posible|sera posible|se puede|se podria)\b/;
function informationalInstruction(raw){
 let {instruction}=extractPayload(raw);
 // A conversational preface can use a colon without introducing data. Only
 // unwrap it when an actual question follows; quoted/fenced payloads and
 // commands such as "Por favor, convierte..." keep their existing meaning.
 let candidate=String(raw||'').trim(),prefixed=false;
 const intro=/^(?:por\s+favor|antes\s+de\s+(?:decidir|empezar|comenzar|hacerlo|continuar)|(?:tengo\s+)?(?:una\s+)?(?:consulta|pregunta))(?:\s*[:,]\s*|\s+(?=¿))/i;
 while(intro.test(candidate)){candidate=candidate.replace(intro,'');prefixed=true;}
 if(prefixed&&SPANISH_QUESTION_START.test(normalizeIntent(candidate).replace(/^[¿\s]+/,'')))instruction=extractPayload(candidate).instruction;
 return instruction;
}
export function isInformationalIntent(raw){
 const instruction=informationalInstruction(raw);
 const q=normalizeIntent(instruction).trim().replace(/^[¿¡\s]+/,'');
 // A direct English request such as "Can you compress this PDF?" is an
 // action request, not an informational question. Do not block execution.
 const original=String(instruction||'').trim().toLowerCase();
 if(/^(?:can|could|would)\s+you\s+(?:please\s+)?(?:remove|delete|erase|split|merge|combine|compress|convert|resize|crop|rotate|extract|trim|mute|transcribe|count|format|validate|scan|create|generate|sort|clean|analyze|summarize|add|number)\b/.test(original))return false;
 if(/^how many (?:words|characters|letters)\b/.test(original)&&
    /(?:text|content|data|list)\s*:/i.test(String(raw||'')))return false;
 if(/^how\b|^what\b|^why\b|^which\b|^where\b|^when\b|^(?:can|could|would)\s+you\s+(?:explain|tell me|show me)\b|^tell me how\b/.test(original))return true;
 if(/^cuant[ao]s?\s+(?:palabras|letras|caracteres)\b/.test(q)&&
    /(?:texto|contenido|datos|lista|text|content|data|list)\s*:/i.test(String(raw||'')))return false;
 if(/\b(?:solo|solamente|unicamente)\s+(?:quiero|necesito)\s+(?:saber|conocer|entender)\b/.test(q))return true;
 return SPANISH_QUESTION_START.test(q)||
  /^(?:(?:solo|solamente|unicamente)\s+)?(?:explica|explicame|describe|informame|dime\s+(?:como|por\s+que|para\s+que))\b/.test(q);
}
// This describes the question's form, never whether a capability is available.
// Queen must still choose a truthful affirmative, negative or conditional reply.
export function isBinaryCapabilityQuestion(raw){
 if(!isInformationalIntent(raw))return false;
 const q=normalizeIntent(informationalInstruction(raw)).replace(/^[¿¡\s]+/,'');
 return /^(?:puedes|puedo|podemos|se puede|es posible)\b/.test(q);
}

// Explicit prohibitions constrain both operation selection and explanations.
// Match only instruction text: quoted JSON/text payloads cannot remove tools.
export function excludedCapabilityIds(raw,files=[]){
 const instruction=normalizeIntent(extractPayload(raw).instruction);
 const image=files.length?files.every(f=>fileKind(f)==='image'):/\b(?:imagen|imagenes|foto|fotografia)\b/.test(instruction);
 if(!image)return [];
 const negative='(?:\\bno\\s+(?:(?:quiero|necesito)\\s+(?:que\\s+)?)?|\\bni\\s+|\\bsin\\s+)';
 const excluded=new Set();
 const effects=[
  ['recort\\w*',['image-crop','image-social-kit']],
  ['(?:redimension\\w*|cambi\\w*\\s+(?:(?:el|la|las|de)\\s+)?(?:tamano|dimensiones))',['image-resize','image-crop','image-social-kit','image-favicon','image-collage']],
  ['comprim\\w*',['image-compress']],
  ['(?:gir|rot)\\w*',['image-rotate']],
  ['(?:quit|borr|elimin)\\w*\\s+(?:los\\s+)?(?:metadatos|exif|gps)',['image-strip-metadata']]
 ];
 for(const [action,ids] of effects)if(new RegExp(negative+action+'\\b').test(instruction))for(const id of ids)if(tools.some(t=>t.id===id))excluded.add(id);
 return [...excluded];
}

function positiveClauses(original) {
 const parts=original.split(/[,;]|\bpero\b|\s+y\s+(?=(?:no|solo|solamente|unicamente)\b)/).map(v=>v.trim()).filter(Boolean);
 let negated=0;
 const keep=[];
 for(const raw of parts){
  const c=raw.replace(/^(?:y|pero)\s+/,'');
  if(/^(?:no\s+(?:quiero|necesito|vayas|hagas|uses|utilices|extraigas|dividas|elimines|quites|borres|conviertas|recortes|comprimas|gires|rot[ae]s|cambies|reduzcas|generes|exportes|guardes|incluyas)\b|sin\s+(?:recortar|extraer|dividir|eliminar|quitar|borrar|convertir|generar|rotar)\b)/.test(c)){negated++;continue;}
  keep.push(c.replace(/^(?:solo|solamente|unicamente)\s+/,''));
 }
 return {value:keep.join(', '),negated};
}
const need=message=>({type:'needs-input',message,steps:[],confidence:0});
const mime=q=>/\bwebp\b/.test(q)?'image/webp':/\bpng\b/.test(q)?'image/png':/\bjpe?g\b/.test(q)?'image/jpeg':'';
// Normalize only explicit page ordinals in the instruction, never quoted data.
// Relative references and an unspecified page count remain execution-time facts.
const PAGE_ORDINALS=Object.freeze({primer:1,primero:1,primera:1,first:1,segundo:2,segunda:2,second:2,
 tercer:3,tercero:3,tercera:3,third:3,cuarto:4,cuarta:4,fourth:4,quinto:5,quinta:5,fifth:5,
 sexto:6,sexta:6,sixth:6,septimo:7,septima:7,seventh:7,octavo:8,octava:8,eighth:8,
 noveno:9,novena:9,ninth:9,decimo:10,decima:10,tenth:10});
const ordinalWords=Object.keys(PAGE_ORDINALS).join('|');
function explicitPageOrdinals(q){
 return q.replace(new RegExp('\\b('+ordinalWords+')\\s+(pagina|hoja)\\b','g'),(_,word,noun)=>noun+' '+PAGE_ORDINALS[word])
  .replace(new RegExp('\\b(pagina|hoja)\\s+('+ordinalWords+')\\b','g'),(_,noun,word)=>noun+' '+PAGE_ORDINALS[word]);
}
function resolveCapabilityRequest(raw,files=[],task=null){
 let {instruction,text}=extractPayload(raw);let q=explicitPageOrdinals(normalizeIntent(instruction).trim());
 // In file-edit instructions, a colon may introduce page ranges rather than
 // content payload: "Divide el PDF en dos: páginas 1-3 y 4-6".
 if(/^(?:divide|dividir|separa|separar|extrae|extraer|quita|elimina|gira|rota)\b/.test(q)&&
    /^\s*(?:paginas?|hojas?)\b/i.test(normalizeIntent(text))){
  q=normalizeIntent(instruction+' '+text).trim();text='';
 }
 if(isInformationalIntent(raw))return files.length?need('Esta es una consulta informativa: no modificaré el archivo. Puedo explicarte la herramienta y sus límites; solicita explícitamente una operación cuando quieras ejecutarla.'):null;
 const positive=positiveClauses(q);
 if(positive.negated&&!positive.value)return need('Entendido: no ejecutaré la operación que has descartado. Indica qué quieres hacer en su lugar.');
 if(positive.negated)q=positive.value;
 if(positive.negated&&/^(?:explica|describe|dime|indica|informa)\b/.test(q))
  return need('No modificaré el archivo: has solicitado información, no una transformación.');
 q=q.replace(/\bsin (?:cambiar|ajustar) (?:(?:las )?dimensiones|(?:el )?tamano(?! del archivo))\b/g,'conservando dimensiones');
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
 if(/^(?:hazlo|continua|tambien eso|todas|la segunda|el segundo|haz lo mismo(?: con este(?: otro)? archivo)?|repite el proceso(?: con este archivo)?)[.!\s]*$/.test(q)&&task?.steps?.length){
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
 // Resolve page numbers with the *actual* PDF page count at execution time.
 // Questions are filtered above, and negative clauses cannot trigger edits.
 if(kind==='pdf'){
  // Explicitly excluded pages must never be reintroduced by an all-pages
  // fallback. Resolve the complement after opening the actual PDF.
  const splitAction=/\b(?:divide|dividir|separa|separar|parte|partir)\b/.test(q);
  const excluded=q.match(/\b(?:excluye|excluir|excluyendo|excepto|sin incluir)\s+(?:la\s+)?(?:pagina|hoja)\s+(\d+)\b/);
  if(splitAction&&excluded){
   if(!files.length)return need('Adjunta el PDF para dividirlo excluyendo las páginas indicadas.');
   return {type:'ready',confidence:1,message:'Separaré las páginas excepto la '+excluded[1]+', sin incluirla en ningún archivo.',
    steps:[{tool_id:'pdf-split',params:{mode:'exclude',pages:excluded[1]},reason:'Excluir la página solicitada'}]};
  }
  // When both actions are explicit, never drop the first transformation.
  if(/\b(?:une|unir|junta|combina|fusiona|unifica)\b/.test(q)&&
     /\b(?:extrae|extraer|saca|separa)\b/.test(q)&&
     /\b(?:ultima|ultimo)\s+(?:pagina|hoja)\b/.test(q)){
   if(files.length<2)return need('Adjunta los PDF que hay que unir antes de extraer la última página.');
   return {type:'ready',confidence:1,message:'Primero uniré los PDF y después extraeré la última página del documento combinado.',
    steps:[{tool_id:'pdf-merge',params:{},reason:'Unir todos los PDF en orden'},
      {tool_id:'pdf-extract',params:{pages:'last'},reason:'Extraer la última página del documento unido'}]};
  }
  if(/\b(?:gira|rot[ae])\b/.test(q)&&/\b(?:a|en)\s+(?:word|docx)\b/.test(q)){
   const deg=q.match(/\b(90|180|270)\b/);
   const chosen=q.match(/(?:paginas?|hojas?)\s+(\d+(?:\s*(?:-|al|a|,|y)\s*\d+)*)/);
   if(!deg)return need('Indica cuántos grados deseas girar el PDF antes de convertirlo a Word.');
   if(!files.length)return need('Adjunta el PDF que deseas girar y convertir a Word.');
   const params={degrees:Number(deg[1])};
   if(chosen)params.pages=chosen[1].replace(/\s+(?:al|a)\s+/g,'-').replace(/\s+y\s+/g,',');
   return {type:'ready',confidence:1,message:'Giraré las páginas seleccionadas y después convertiré el resultado a Word.',
    steps:[{tool_id:'pdf-rotate',params,reason:'Modificar la orientación del PDF'},
      {tool_id:'pdf-to-word',params:{},reason:'Convertir el PDF ya girado a DOCX'}]};
  }
  const individually=q.match(/\b(?:paginas?|hojas?)\s+(\d+(?:\s*,\s*\d+)*\s+y\s+\d+)\s+por\s+separado\b/);
  if(individually&&/\b(?:crea|separa|divide|quiero)\b/.test(q)){
   if(!files.length)return need('Adjunta el PDF para extraer las páginas elegidas en archivos individuales.');
   const selection=individually[1].replace(/\s+y\s+/g,',').replace(/\s/g,'');
   return {type:'ready',confidence:1,message:'Separaré solo las páginas indicadas, una por archivo.',
    steps:[{tool_id:'pdf-split',params:{mode:'selected',pages:selection},reason:'Selección explícita, no todas las páginas'}]};
  }
  const exclusive=q.match(/\b(?:solo|unicamente|solamente)\s+(?:la\s+)?(?:pagina|hoja)\s+(\d+)\b/);
  if(exclusive){
   if(!files.length)return need('Adjunta el PDF para extraer únicamente la página solicitada.');
   return {type:'ready',confidence:1,message:'Extraeré exclusivamente la página '+exclusive[1]+'.',
    steps:[{tool_id:'pdf-extract',params:{pages:exclusive[1]},reason:'Seleccionar solo la página indicada'}]};
  }
  if(/\b(?:hoja|pagina)\s+final\b/.test(q)){
   if(!files.length)return need('Adjunta el PDF para extraer su última página.');
   return {type:'ready',confidence:1,message:'Extraeré solo la última página del PDF.',
    steps:[{tool_id:'pdf-extract',params:{pages:'last'},reason:'Resolver la página final al abrir el PDF'}]};
  }
  const single=id=>({type:'ready',confidence:1,message:'Procesaré únicamente las páginas indicadas.',steps:[{tool_id:id,params:{pages:'last'},reason:'Referencia relativa a la última página'}]});
  if(/\b(?:elimina|quita|borra)\b.*\b(?:ultima|ultimo)\s+(?:pagina|hoja)\b/.test(q)){
   if(!files.length)return need('Adjunta el PDF para eliminar su última página.');
   return single('pdf-remove-pages');
  }
  if(/(?:primera|primer)\s+(?:y\s+(?:la\s+)?)?(?:ultima|ultimo)\s+(?:pagina|hoja)|(?:primera|primer)\s+(?:pagina|hoja)\s+y\s+(?:la\s+)?(?:ultima|ultimo)/.test(q)){
   if(!files.length)return need('Adjunta el PDF para extraer la primera y la última página.');
   return {type:'ready',confidence:1,message:'Extraeré la primera y la última página en un único PDF.',steps:[{tool_id:'pdf-extract',params:{pages:'first,last'},reason:'Extraer dos páginas relativas sin suponer el total'}]};
  }
  if(/\b(?:ultimas|ultimos)\s+(?:dos|2)\s+(?:paginas|hojas)\b/.test(q)){
   if(!files.length)return need('Adjunta el PDF para extraer sus dos últimas páginas.');
   return {type:'ready',confidence:1,message:'Extraeré las dos últimas páginas en un único PDF.',steps:[{tool_id:'pdf-extract',params:{pages:'last:2'},reason:'Dos últimas páginas relativas al total'}]};
  }
  if(/\b(?:penultima|penultimo)\s+(?:pagina|hoja)\b/.test(q)){
   if(!files.length)return need('Adjunta el PDF para extraer su penúltima página.');
   return {type:'ready',confidence:1,message:'Extraeré únicamente la penúltima página.',steps:[{tool_id:'pdf-extract',params:{pages:'penultima'},reason:'Referencia relativa penúltima página'}]};
  }
  if(/\b(?:ultima|ultimo)\s+(?:pagina|hoja)\b/.test(q)){
   if(!files.length)return need('Adjunta el PDF para extraer únicamente su última página.');
   return {type:'ready',confidence:1,message:'Extraeré solo la última página del PDF en un archivo independiente.',steps:[{tool_id:'pdf-split',params:{mode:'selected',pages:'last'},reason:'Seleccionar exclusivamente la última página'}]};
  }
  const splitting=/\b(?:divide|dividir|separa|separar|partir|parte)\b/.test(q);
  const ranges=[...q.matchAll(/\b(\d{1,5})\s*[-–]\s*(\d{1,5})\b/g)].map(m=>m[1]+'-'+m[2]);
  if(splitting&&ranges.length>=2){
   if(!files.length)return need('Adjunta el PDF para dividirlo por los rangos que indicaste.');
   return {type:'ready',confidence:1,message:'Dividiré el PDF en '+ranges.length+' rangos exactos, sin repartir páginas arbitrariamente.',steps:[{tool_id:'pdf-split',params:{mode:'ranges',ranges:ranges.join(';')},reason:'Respetar los límites explícitos de cada grupo'}]};
  }
  const twoDistinct=q.match(/\b(?:pagina|paginas|hoja|hojas)\s+(\d+)\s+y\s+(?:la\s+)?(\d+)\b/);
  if(splitting&&twoDistinct&&/\b(?:dos|2)\s+archivos\b/.test(q)){
   if(!files.length)return need('Adjunta el PDF para extraer las páginas por separado.');
   return {type:'ready',confidence:1,message:'Crearé un PDF independiente por cada página seleccionada.',steps:[{tool_id:'pdf-split',params:{mode:'selected',pages:twoDistinct[1]+','+twoDistinct[2]},reason:'Páginas específicas, no partes iguales'}]};
  }
 }
 if(kind==='video'&&
    /\b(?:cambia|cambiar|pasa|pasar|convierte|convertir|transforma|adapta|ajusta|redimensiona|pon)\b/.test(q)&&
    /(?:a|en|como)\s+(?:formato\s+)?(?:vertical|horizontal|cuadrado|apaisado)\b|\bformato\s+(?:vertical|horizontal|cuadrado|apaisado)\b/.test(q)){
  if(!files.length)return need('Adjunta el vídeo que quieres adaptar.');
  const resolution=/\b(?:cuadrado)\b/.test(q)?'square':
    /\b(?:horizontal|apaisado)\b/.test(q)?'landscape':'vertical';
  return {type:'ready',confidence:1,
    message:'Adaptaré el vídeo al formato '+(resolution==='square'?'cuadrado':resolution==='landscape'?'horizontal':'vertical')+' conservando su contenido y audio.',
    steps:[{tool_id:'video-resize',params:{resolution},reason:'Orientación y proporción, no conversión de contenedor'}]};
 }
 if(kind==='video'&&/\b(?:comprim|comprime|comprimir|reduce\s+(?:el\s+)?peso|optimiza)\w*\b/.test(q)&&!/\b(?:recorta|corta)\b/.test(q)){
  if(!files.length)return need('Adjunta el vídeo que quieres comprimir.');
  return {type:'ready',confidence:1,message:'Comprimiré el vídeo conservando su duración y su pista de audio.',steps:[{tool_id:'video-compress',params:{quality:'balanced'},reason:'Compresión sin recorte de duración'}]};
 }
 if(kind==='image'&&/a pdf|en pdf|como pdf/.test(q))return null;
 if(kind==='pdf'&&/divid|separ|partir|fragment|troce/.test(q)&&!/(?:paginas?|hojas?)\s*\d/.test(q))return buildSmartLocalFlow(raw,files,[]);
 if(kind==='image'&&/reduce (?:su |el )?tamano/.test(q)&&!/(?:archivo|peso|dimensiones|\d+\s*[x×])/.test(q))return need('¿Quieres reducir el peso del archivo o sus dimensiones en píxeles?');
 if(/(?:sin|no uses|no utilizar).*?(?:ia|inteligencia artificial)/.test(q)&&/\b(?:genera|inventa|escribe).*(?:cuento|ensayo|cancion)/.test(q))return need('Esa creación requiere un motor generativo. Puedo hacer transformaciones locales de un texto que proporciones.');
 let found=CAPABILITIES.filter(c=>(c.kind===kind||c.kind==='text'&&!files.length)&&c.pattern.test(q));
 if(!found.length)return null;
 // Negation is not authorization, and unsupported clauses may not disappear.
 // Explicit negative clauses were removed before matching; positive steps may proceed.
 if(/borra.*objeto|cambia.*fondo|reduc.*ruido|sube.*(?:web|instagram)|publica|envia.*correo/.test(q))return need('La petición incluye una operación que este plan local no puede completar. Separa esa operación para no omitirla.');
 if(found.some(c=>c.id==='image-bg')&&!/(?:a|en) (?:webp|jpe?g)/.test(q))found=found.filter(c=>c.id!=='image-convert');
 if(found.some(c=>c.id==='pdf-extract'))found=found.filter(c=>c.id!=='pdf-split');
 if(found.some(c=>c.id==='image-compress')&&found.some(c=>c.id==='image-convert')&&
    !/\b(?:y|luego|despues|tambien|primero)\b.*\b(?:conviert\w*|pas\w*|export\w*|guard\w*)\b/.test(q))
   found=found.filter(c=>c.id!=='image-convert');
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
  if(['pdf-extract','pdf-remove-pages'].includes(c.id)){const m=q.match(/(?:paginas?|hojas?)\s*(\d+(?:\s*(?:-|al|a|,|y)\s*\d+)*)/);if(!m)return need('Indica las páginas, por ejemplo 2-4, 7.');p.pages=m[1].replace(/\s+(?:al|a)\s+/g,'-').replace(/\s+y\s+/g,',');}
  if(c.id==='pdf-merge'&&files.length<2)return need('Adjunta al menos dos PDF para unirlos.');
  if(c.id==='pdf-rotate'){
   const d=q.match(/(90|180|270)/);
   if(!d&&!/izquierda|derecha/.test(q))return need('Indica 90, 180 o 270 grados, o izquierda/derecha.');
   p.degrees=d?+d[1]:/izquierda/.test(q)?270:90;
   const selected=q.match(/(?:paginas?|hojas?)\s+(\d+(?:\s*(?:-|al|a|,|y)\s*\d+)*)/);
   if(selected)p.pages=selected[1].replace(/\s+(?:al|a)\s+/g,'-').replace(/\s+y\s+/g,',');
   if(/(?:solo|solamente|unicamente)\s+(?:las?\s+)?(?:paginas?|hojas?)/.test(q)&&!selected)
    return need('Indica qué páginas deseas girar. No modificaré el resto del documento.');
  }
  if(c.id==='pdf-watermark'){p.watermark=String(raw).match(/marca de agua\s*(?:que diga|:|=)\s*["“]?([^"”\n]+)/i)?.[1];if(!p.watermark)return need('¿Qué texto debe llevar la marca de agua?');}
  if(c.kind==='text'&&steps.some(s=>CAPABILITIES.find(x=>x.id===s.tool_id)?.kind==='text')&&c.id!=='text-diff')delete p.text;
  steps.push({tool_id:c.id,params:p,reason:'Capacidad y parámetros identificados localmente',input:'current'});
 }
 // Shared transformation first, read-only/branch results last. No duplicated calls.
 const order=id=>id==='image-bg'?0:id==='image-strip-metadata'?1:id==='image-resize'?2:id==='image-compress'?3:id==='image-convert'?4:id==='image-palette'?5:id==='image-favicon'?6:2;
 if(kind==='image')steps.sort((a,b)=>order(a.tool_id)-order(b.tool_id));
 return {type:'ready',confidence:1,message:'Voy a ejecutar '+steps.length+' operación(es), procesando todos los archivos compatibles y comprobando cada resultado.',steps};
}

// Do not allow specialized early returns to drop later requested transformations.
export function planCapabilityRequest(raw,files=[],task=null){
 const q=positiveClauses(normalizeIntent(extractPayload(raw).instruction)).value;
 if(files.length&&/\b(?:si|cuando|a menos que|excepto si)\b/.test(q))return need('Aclara la condición antes de ejecutar; no aplicaré operaciones condicionales sin comprobarla.');
 if(/\b(?:cancela|cancelar|detente|no hagas nada)\b/.test(q))return need('Tarea cancelada. No ejecutaré ninguna operación.');
 let plan=resolveCapabilityRequest(raw,files,task);
 if(plan?.type!=='ready')return plan;
 const ids=new Set(plan.steps.map(s=>s.tool_id));
 const pdf=files.length&&files.every(f=>fileKind(f)==='pdf');
 if(pdf&&/\b(?:a|en) (?:word|docx)\b/.test(q)&&!ids.has('pdf-to-word')){
  const split=plan.steps.find(s=>s.tool_id==='pdf-split');
  if(split){if(split.params?.mode!=='selected')return need('La división genera un ZIP. Indica qué páginas deben convertirse a Word.');split.tool_id='pdf-extract';split.params={pages:split.params.pages};}
  plan={...plan,steps:[...plan.steps,{tool_id:'pdf-to-word',params:{},reason:'Convertir el resultado seleccionado a Word'}]};
 }
 const merge=plan.steps.find(s=>s.tool_id==='pdf-merge');
 if(merge&&/segundo.*(?:primero|primer)/.test(q)){
  if(files.length!==2)return need('El orden indicado identifica dos PDF; selecciona exactamente esos dos archivos.');
  merge.params={...merge.params,sourceOrder:[1,0]};
 }
 const actions=[['pdf-merge',/\b(?:une|junta|fusiona)\b/],['pdf-rotate',/\b(?:gira|rota)\b/],['pdf-to-word',/\b(?:a|en) (?:word|docx)\b/]];
 if(pdf&&actions.some(([id,re])=>re.test(q)&&!plan.steps.some(s=>s.tool_id===id)))return need('No puedo conservar todas las operaciones en este plan. Aclara el orden antes de ejecutar.');
 return {...plan,objective:String(raw),state:'planned',inputs:files.map((f,index)=>({index,name:f.name,type:f.type})),steps:plan.steps.map((s,i)=>({...s,id:'step-'+(i+1),dependsOn:i?['step-'+i]:[],input:i?'previous-output':'attachments',successCriteria:['nonempty-output','compatible-format']}))};
}
