const PDF_LIB='https://esm.sh/pdf-lib@1.17.1';
const QR='https://esm.sh/qrcode@1.5.4';
const MAMMOTH='https://esm.sh/mammoth@1.9.1';
const TESS='https://esm.sh/tesseract.js@5.1.1';
const BG0='https://esm.sh/@bg0/browser@0.1.2';
const FF='https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
const UTIL='https://esm.sh/@ffmpeg/util@0.12.2';
const load=async url=>import(url);
const bytes=blob=>blob.arrayBuffer();
const download=(blob,name)=>({blob,filename:name});
const fileName=f=>(f.name||'archivo').replace(/\.[^.]+$/,'');
const progress=(cb,p,msg)=>cb?.(p,msg);
const makeBlob=(bytes,type)=>new Blob([bytes],{type});
function parsePages(value,total){
 const pages=new Set();
 for(const part of String(value||'').split(',')){
  const s=part.trim();if(!s)continue;
  const m=s.match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error('Formato de páginas inválido.');
  const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<a||b>total)throw Error('Rango de páginas fuera del documento.');
  for(let i=a;i<=b;i++)pages.add(i-1);
 }
 if(!pages.size)throw Error('Indica al menos una página.');
 return [...pages].sort((a,b)=>a-b);
}
async function pdfTool(id,files,p,cb){
 const {PDFDocument, StandardFonts, rgb, degrees}=await load(PDF_LIB);
 if(id==='pdf-merge'){
  const out=await PDFDocument.create();
  for(let i=0;i<files.length;i++){progress(cb,(i/files.length)*.8,'Uniendo documentos...');const src=await PDFDocument.load(await bytes(files[i]));const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(pg=>out.addPage(pg));}
  return download(makeBlob(await out.save(),'application/pdf'),'prisma-documento-unido.pdf');
 }
 const src=await PDFDocument.load(await bytes(files[0]));const out=await PDFDocument.create();const total=src.getPageCount();
 if(id==='pdf-extract'){const ids=parsePages(p.pages,total);const pages=await out.copyPages(src,ids);pages.forEach(x=>out.addPage(x));}
 if(id==='pdf-rotate'){src.getPages().forEach(pg=>pg.setRotation(degrees((pg.getRotation().angle+Number(p.degrees))%360)));return download(makeBlob(await src.save(),'application/pdf'),fileName(files[0])+'-rotado.pdf');}
 if(id==='pdf-remove-pages'){const ids=parsePages(p.pages,total);ids.sort((a,b)=>b-a).forEach(i=>src.removePage(i));if(!src.getPageCount())throw Error('No puedes eliminar todas las páginas del documento.');return download(makeBlob(await src.save(),'application/pdf'),fileName(files[0])+'-sin-paginas.pdf');}
 if(id==='pdf-page-numbers'){const font=await src.embedFont(StandardFonts.Helvetica);src.getPages().forEach((pg,i)=>{const {width,height}=pg.getSize(),text=String(i+1)+' / '+total;const size=10,w=font.widthOfTextAtSize(text,size),position=p.position||'bottom';pg.drawText(text,{x:(width-w)/2,y:position==='top'?height-24:18,size,font,color:rgb(.42,.45,.5),opacity:.9});});return download(makeBlob(await src.save(),'application/pdf'),fileName(files[0])+'-numerado.pdf');}
 if(id==='pdf-watermark'){
  const font=await src.embedFont(StandardFonts.HelveticaBold);
  src.getPages().forEach(pg=>{const {width,height}=pg.getSize();pg.drawText(String(p.watermark||'PRISMA'),{x:width*.12,y:height*.48,size:36,font,color:rgb(.5,.5,.5),opacity:.19,rotate:degrees(35)});});
  return download(makeBlob(await src.save(),'application/pdf'),fileName(files[0])+'-marca.pdf');
 }
 const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(x=>out.addPage(x));
 return download(makeBlob(await out.save(),'application/pdf'),fileName(files[0])+'-paginas.pdf');
}
async function imageTool(id,files,p,cb){
 const f=files[0];progress(cb,.15,'Leyendo imagen...');
 if(id==='image-bg'){
  const {removeBackground}=await load(BG0);progress(cb,.25,'Cargando modelo de IA en el navegador...');
  const blob=await removeBackground(f,{quality:'quality',onProgress:e=>progress(cb,.25+(e.progress||0)*.65,e.message||'Eliminando fondo...')});
  return {...download(blob,fileName(f)+'-sin-fondo.png'),previewUrl:URL.createObjectURL(blob)};
 }
 if(id==='image-ocr'){
  const {createWorker}=await load(TESS);const worker=await createWorker(p.language||'spa');progress(cb,.2,'Reconociendo texto...');
  const result=await worker.recognize(f);await worker.terminate();return {text:result.data.text||'No se detectó texto.',summary:'Confianza estimada: '+Math.round(result.data.confidence)+'%'};
 }
 const img=new Image(),url=URL.createObjectURL(f);
 try{await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(Error('No se pudo abrir la imagen.'));img.src=url;});
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 if(id==='image-crop'){const w=Math.max(1,Math.round(img.width*Number(p.widthPct||80)/100)),h=Math.max(1,Math.round(img.height*Number(p.heightPct||80)/100));canvas.width=w;canvas.height=h;ctx.drawImage(img,(img.width-w)/2,(img.height-h)/2,w,h,0,0,w,h);}
 else{let w=img.width,h=img.height;if(id==='image-resize'){w=Number(p.width)||w;h=Number(p.height)||h;if(p.keep){const r=Math.min(w/img.width,h/img.height);w=Math.round(img.width*r);h=Math.round(img.height*r);}}canvas.width=w;canvas.height=h;ctx.drawImage(img,0,0,w,h);}
 let type=p.format||'image/png',quality=Math.max(.1,Math.min(1,Number(p.quality||82)/100));
 if(id==='image-compress')type=p.format||'image/webp';
 const blob=await new Promise(r=>canvas.toBlob(r,type,quality));if(!blob)throw Error('No se pudo convertir la imagen.');
 const ext=type.split('/')[1].replace('jpeg','jpg');return {...download(blob,fileName(f)+'-prisma.'+ext),previewUrl:URL.createObjectURL(blob),summary:img.width+' × '+img.height+' px'};
 }finally{URL.revokeObjectURL(url);}
}
async function runVideo(id,files,p,cb){
 const {FFmpeg}=await load(FF),{fetchFile,toBlobURL}=await load(UTIL);const ff=new FFmpeg();
 const base='https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
 await ff.load({coreURL:await toBlobURL(base+'/ffmpeg-core.js','text/javascript'),wasmURL:await toBlobURL(base+'/ffmpeg-core.wasm','application/wasm')});
 const input='input.'+((files[0].name.split('.').pop()||'mp4').replace(/[^a-z0-9]/gi,''));
 const output=id==='video-audio'?'audio.wav':'clip.mp4';
 await ff.writeFile(input,await fetchFile(files[0]));
 const args=id==='video-audio'?['-i',input,'-vn','-acodec','pcm_s16le','-ar','44100','-ac','2',output]:['-ss',String(p.start||0),'-i',input,'-t',String(p.duration||10),'-c','copy',output];
 await ff.exec(args);progress(cb,.9,'Preparando archivo final...');const data=await ff.readFile(output);return download(makeBlob(data,id==='video-audio'?'audio/wav':'video/mp4'),fileName(files[0])+(id==='video-audio'?'-audio.wav':'-recorte.mp4'));
}
function convertUnits(p){
 const v=Number(p.value);if(!Number.isFinite(v))throw Error('Introduce un valor válido.');
 const kind=p.kind,from=p.from,to=p.to;
 const factors={
  length:{m:1,km:1000,cm:.01,mm:.001,mi:1609.344,ft:.3048,in:.0254,yd:.9144},
  mass:{kg:1,g:.001,mg:1e-6,lb:.45359237,oz:.028349523125,t:1000},
  area:{m2:1,km2:1e6,cm2:.0001,ha:10000,acre:4046.8564224,ft2:.09290304},
  volume:{l:1,ml:.001,m3:1000,gal:3.785411784,cup:.2365882365},
  speed:{ms:1,kmh:1/3.6,mph:.44704,kn:0.514444},
  data:{B:1,KB:1000,MB:1e6,GB:1e9,TB:1e12}
 };
 let result;
 if(kind==='temperature'){const c=from==='C'?v:from==='F'?(v-32)*5/9:v-273.15;result=to==='C'?c:to==='F'?c*9/5+32:c+273.15;}
 else result=v*factors[kind][from]/factors[kind][to];
 return {text:v+' '+from+' = '+Number(result.toPrecision(10))+' '+to};
}
async function runText(id,p){
 const text=String(p.text||'');
 switch(id){
 case 'json-format':{let obj;try{obj=JSON.parse(text)}catch(e){throw Error('JSON inválido: '+e.message)}return {text:JSON.stringify(obj,p.indent==='tab'?'\t':Number(p.indent||2))};}
 case 'base64':try{return {text:p.mode==='decode'?decodeURIComponent(escape(atob(text.trim()))):btoa(unescape(encodeURIComponent(text)))}}catch{throw Error('No se pudo convertir. Comprueba el contenido.');}
 case 'word-count':{const words=text.trim()?text.trim().split(/\s+/u).length:0;return {text:'Palabras: '+words+'\nCaracteres: '+text.length+'\nSin espacios: '+text.replace(/\s/g,'').length+'\nLíneas: '+(text?text.split(/\r\n|\r|\n/).length:0)+'\nLectura estimada: '+Math.ceil(words/200)+' min'};}
 case 'url-code':try{return {text:p.mode==='decode'?decodeURIComponent(text):encodeURIComponent(text)}}catch{throw Error('La secuencia URL no es válida.');}
 case 'text-case':{let v=text;if(p.mode==='upper')v=text.toLocaleUpperCase('es');if(p.mode==='lower')v=text.toLocaleLowerCase('es');if(p.mode==='title')v=text.toLocaleLowerCase('es').replace(/\b\p{L}/gu,c=>c.toLocaleUpperCase('es'));if(p.mode==='sentence')v=text.toLocaleLowerCase('es').replace(/(^\s*\p{L}|[.!?]\s*\p{L})/gu,c=>c.toLocaleUpperCase('es'));return {text:v};}
 case 'markdown':{const html=text.replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/^## (.*)$/gm,'<h2>$1</h2>').replace(/^# (.*)$/gm,'<h1>$1</h1>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');return {html,summary:'Vista previa HTML básica. No se ejecuta código.'};}
 case 'units':return convertUnits(p);
 case 'timestamp':{if(p.mode==='unix-to-date'){let n=Number(p.value);if(!Number.isFinite(n))throw Error('Marca de tiempo inválida.');if(Math.abs(n)<1e12)n*=1000;const d=new Date(n);if(isNaN(d))throw Error('Fecha fuera de rango.');return {text:d.toLocaleString('es-CO',{dateStyle:'full',timeStyle:'long'})+'\nISO: '+d.toISOString()};}const d=new Date(p.value);if(isNaN(d))throw Error('Fecha inválida.');return {text:'Segundos Unix: '+Math.floor(d.getTime()/1000)+'\nMilisegundos: '+d.getTime()};}
 case 'password':{const len=Math.max(8,Math.min(128,Number(p.length)||20));const chars=p.complexity==='easy'?'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789':p.complexity==='medium'?'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789':'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+';const pool=p.symbols===false?chars.replace(/[!@#$%^&*()\-_=+]/g,''):chars;const arr=new Uint32Array(len);crypto.getRandomValues(arr);return {text:[...arr].map(n=>pool[n%pool.length]).join(''),summary:'Generada con crypto.getRandomValues en este dispositivo.'};}
 case 'csv-json':{const rows=parseCsv(text,p.delimiter||',');if(rows.length<2)throw Error('El CSV necesita encabezados y al menos una fila.');const headers=rows[0].map((x,i)=>x.trim()||'columna_'+(i+1));const data=rows.slice(1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])));return {text:JSON.stringify(data,null,2),summary:data.length+' registros convertidos.'};}
 case 'json-csv':{let data;try{data=JSON.parse(text)}catch(e){throw Error('JSON inválido: '+e.message)}if(!Array.isArray(data)||!data.length||typeof data[0]!=='object')throw Error('El JSON debe ser una lista de objetos.');const headers=[...new Set(data.flatMap(o=>Object.keys(o)))];const rows=[headers,...data.map(o=>headers.map(h=>typeof o[h]==='object'&&o[h]!==null?JSON.stringify(o[h]):o[h]??''))];return {text:rows.map(row=>row.map(csvCell).join(',')).join('\n'),summary:data.length+' registros exportados a CSV.'};}
 case 'slug':return {text:text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')};
 case 'dedupe-lines':{const seen=new Set(),out=[];for(const line of text.split(/\r?\n/)){const key=p.caseSensitive?line:line.toLocaleLowerCase('es');if(!seen.has(key)){seen.add(key);out.push(line);}}return {text:out.join('\n'),summary:(text.split(/\r?\n/).length-out.length)+' líneas duplicadas eliminadas.'};}
 case 'clean-text':return {text:text.replace(/\r\n?/g,'\n').split('\n').map(x=>x.replace(/[ \t]+$/g,'').replace(/[ \t]{2,}/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim(),summary:'Espacios y saltos de línea normalizados.'};
 case 'html-entities':{if(p.mode==='decode'){const el=document.createElement('textarea');el.innerHTML=text;return {text:el.value};}return {text:text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')};}
 case 'lorem':{const words='lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat'.split(' ');const count=Math.max(10,Math.min(1500,Number(p.words)||120)),paragraphs=Math.max(1,Math.min(12,Number(p.paragraphs)||3));const out=[];for(let i=0;i<count;i++)out.push(words[i%words.length]);const chunk=Math.ceil(count/paragraphs);return {text:Array.from({length:paragraphs},(_,i)=>out.slice(i*chunk,(i+1)*chunk).join(' ')).filter(Boolean).map(x=>x[0].toUpperCase()+x.slice(1)+'.').join('\n\n')};}
 case 'uuid':{const count=Math.max(1,Math.min(50,Number(p.count)||5));return {text:Array.from({length:count},()=>crypto.randomUUID()).join('\n'),summary:count+' identificadores UUID v4.'};}
 case 'random':{const min=Math.ceil(Number.isFinite(Number(p.min))?Number(p.min):0),max=Math.floor(Number.isFinite(Number(p.max))?Number(p.max):100),count=Math.max(1,Math.min(100,Number(p.count)||1));if(max<min)throw Error('El máximo debe ser mayor o igual al mínimo.');const range=max-min+1;if(range>4294967295)throw Error('El rango es demasiado grande.');const nums=new Uint32Array(count);crypto.getRandomValues(nums);return {text:[...nums].map(n=>min+(n%range)).join('\n')};}
 case 'calculator':return {text:String(calculateExpression(p.expression||text)),summary:'Cálculo local. No se ejecuta código.'};
 case 'percentage':{const a=Number(p.a),b=Number(p.b);if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Introduce valores válidos.');if(p.mode==='change'){if(a===0)throw Error('El valor inicial no puede ser cero.');const change=(b-a)/Math.abs(a)*100;return {text:change.toFixed(2)+' %',summary:'Variación de '+a+' a '+b+'.'};}return {text:String(Number((a*b/100).toFixed(6))),summary:b+' % de '+a};}
 case 'date-diff':{const a=new Date(p.start+'T00:00:00Z'),b=new Date(p.end+'T00:00:00Z');if(isNaN(a)||isNaN(b))throw Error('Selecciona dos fechas válidas.');const days=Math.round((b-a)/86400000);return {text:Math.abs(days)+' días',summary:days===0?'Las fechas coinciden.':days>0?'La fecha final está '+days+' días después.':'La fecha final está '+Math.abs(days)+' días antes.'};}
 case 'timezone':{const d=new Date(p.datetime);if(isNaN(d))throw Error('Selecciona una fecha y hora válidas.');return {text:new Intl.DateTimeFormat('es-CO',{dateStyle:'full',timeStyle:'long',timeZone:p.zone||'America/Bogota'}).format(d),summary:'Zona horaria: '+(p.zone||'America/Bogota')};}
 case 'contrast':{const ratio=contrastRatio(p.foreground||'#111827',p.background||'#ffffff');return {text:ratio.toFixed(2)+':1',summary:'WCAG AA texto normal: '+(ratio>=4.5?'Cumple':'No cumple')+' · WCAG AAA: '+(ratio>=7?'Cumple':'No cumple')};}
 case 'text-sort':{const lines=text.split(/\r?\n/);lines.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:p.caseSensitive?'variant':'base'}));return {text:lines.join('\n'),summary:lines.length+' líneas ordenadas.'};}
 case 'word-frequency':{const words=text.toLocaleLowerCase('es').match(/[\p{L}\p{N}']+/gu)||[],counts=new Map();words.forEach(w=>counts.set(w,(counts.get(w)||0)+1));const rows=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,30);return {text:rows.map(([w,n])=>w+' — '+n).join('\n'),summary:words.length+' palabras analizadas · '+counts.size+' palabras únicas.'};}
 case 'color-palette':{const base=Math.floor(Math.random()*360),angles=p.harmony==='complementary'?[0,180,0,180,0]:p.harmony==='triadic'?[0,120,240,0,120]:[0,30,60,180,210];const colors=angles.map((a,i)=>'hsl('+((base+a)%360)+' 62% '+([55,62,48,68,52][i])+'%)');return {text:colors.join('\n'),summary:'Paleta generada al azar. Copia los valores HSL.'};}
 }
 throw Error('Herramienta de texto no disponible.');
}
async function runQr(p,cb){
 const QRCode=await load(QR);const data=String(p.text||'');if(!data.trim())throw Error('Escribe un texto o enlace.');
 const dataUrl=await QRCode.toDataURL(data,{width:900,margin:2,errorCorrectionLevel:'H',color:{dark:'#111827',light:'#ffffff'}});
 const blob=await (await fetch(dataUrl)).blob();return {...download(blob,'prisma-codigo-qr.png'),previewUrl:dataUrl};
}
async function runDocx(files,cb){
 const mammoth=await load(MAMMOTH);const result=await mammoth.convertToHtml({arrayBuffer:await bytes(files[0])});
 if(!result.value.trim())throw Error('No se encontró contenido de texto.');
 return download(new Blob([ '<!doctype html><meta charset="utf-8"><article>'+result.value+'</article>'],{type:'text/html'}),fileName(files[0])+'.html');
}
async function runCurrency(p,cb){
 const amount=Number(p.amount);if(!Number.isFinite(amount))throw Error('Cantidad inválida.');
 if(p.from===p.to)return {text:amount+' '+p.from+' = '+amount+' '+p.to};
 const res=await fetch('https://api.frankfurter.dev/v1/latest?base='+encodeURIComponent(p.from)+'&symbols='+encodeURIComponent(p.to));
 if(!res.ok)throw Error('No fue posible consultar el tipo de cambio.');
 const data=await res.json(),rate=data.rates?.[p.to];if(!rate)throw Error('No hay tasa disponible para esas monedas.');
 return {text:new Intl.NumberFormat('es-CO',{style:'currency',currency:p.to}).format(amount*rate),summary:'Tasa de referencia: 1 '+p.from+' = '+rate+' '+p.to+' · Fecha: '+data.date};
}

const HF_INFERENCE='https://esm.sh/@huggingface/inference';
const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const JSZIP_URL='https://esm.sh/jszip@3.10.1';

async function getPdfJs(){
 const pdfjs=await import(PDFJS_URL);
 pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
 return pdfjs;
}
async function pdfToImages(file,p,cb){
 const pdfjs=await getPdfJs();
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await bytes(file))}).promise;
 const ids=String(p.pages||'').trim()?parsePages(p.pages,pdf.numPages):Array.from({length:pdf.numPages},(_,i)=>i);
 const JSZip=(await import(JSZIP_URL)).default,zip=new JSZip();
 const scale=Math.max(.75,Math.min(2.5,Number(p.scale)||1.5));
 for(let n=0;n<ids.length;n++){
  const page=await pdf.getPage(ids[n]+1),viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  zip.file('pagina-'+String(ids[n]+1).padStart(3,'0')+'.png',await blob.arrayBuffer());
  progress(cb,(n+1)/ids.length*.85,'Exportando página '+(n+1)+' de '+ids.length+'...');
 }
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
 return {...download(blob,'prisma-paginas-png.zip'),summary:ids.length+' páginas exportadas como PNG.'};
}
async function pdfToText(file,cb){
 const pdfjs=await getPdfJs(),pdf=await pdfjs.getDocument({data:new Uint8Array(await bytes(file))}).promise;
 const parts=[];
 for(let i=1;i<=pdf.numPages;i++){
  const page=await pdf.getPage(i),data=await page.getTextContent();
  parts.push('--- Página '+i+' ---\n'+data.items.map(x=>x.str).join(' '));
  progress(cb,i/pdf.numPages*.9,'Leyendo página '+i+' de '+pdf.numPages+'...');
 }
 return {text:parts.join('\n\n'),summary:pdf.numPages+' páginas procesadas. Los documentos escaneados necesitan OCR.'};
}
async function generateImage(p,cb){
 const token=String(p.hfToken||'').trim();
 if(!token.startsWith('hf_'))throw Error('Introduce un token de Hugging Face válido (comienza por hf_).');
 const prompt=String(p.prompt||'').trim();
 if(prompt.length<8)throw Error('Describe la imagen con un poco más de detalle.');
 progress(cb,.12,'Conectando con Hugging Face Inference...');
 const {InferenceClient}=await import(HF_INFERENCE);
 const client=new InferenceClient(token);
 const sizes={square:[1024,1024],landscape:[1024,768],portrait:[768,1024],wide:[1344,768]};
 const [width,height]=sizes[p.ratio]||sizes.square;
 const styles={
  photo:'Photorealistic photography, natural detailed lighting, high dynamic range, professional composition. ',
  illustration:'Premium editorial illustration, refined shapes, beautiful color harmony, polished art direction. ',
  cinematic:'Cinematic composition, dramatic lighting, atmospheric depth, film still quality. ',
  3d:'High-end 3D render, physically based materials, studio lighting, refined details. ',
  anime:'Detailed anime illustration, expressive visual storytelling, clean line art, polished colors. ',
  product:'Premium commercial product photography, clean studio setup, realistic materials, luxury advertising art direction. '
 };
 const fullPrompt=(styles[p.style]||'')+prompt;
 const parameters={width,height,num_inference_steps:Math.max(4,Math.min(30,Number(p.steps)||4))};
 if(String(p.negativePrompt||'').trim())parameters.negative_prompt=String(p.negativePrompt).trim();
 if(String(p.seed||'').trim()&&Number.isFinite(Number(p.seed)))parameters.seed=Number(p.seed);
 progress(cb,.24,'Generando imagen con '+p.model+'...');
 const image=await client.textToImage({provider:'auto',model:p.model||'black-forest-labs/FLUX.1-schnell',inputs:fullPrompt,parameters});
 const blob=image instanceof Blob?image:new Blob([image],{type:'image/png'});
 progress(cb,1,'Imagen generada.');
 return {...download(blob,'prisma-imagen-'+Date.now()+'.png'),summary:'Modelo: '+(p.model||'FLUX.1-schnell')+' · '+width+' × '+height+' px · La imagen se generó con tu cuenta de Hugging Face.'};
}
async function imageAdvanced(id,files,p,cb){
 if(id==='image-gen')return generateImage(p,cb);
 if(id==='image-collage'){
  if(files.length<2)throw Error('Selecciona al menos dos imágenes para crear el mosaico.');
  const imgs=await Promise.all(files.slice(0,12).map(f=>createImageBitmap(f)));
  const cols=Math.ceil(Math.sqrt(imgs.length)),rows=Math.ceil(imgs.length/cols),cell=620,gap=16,pad=24;
  const canvas=document.createElement('canvas');canvas.width=cols*cell+(cols+1)*gap;canvas.height=rows*cell+(rows+1)*gap;
  const ctx=canvas.getContext('2d');ctx.fillStyle=p.background||'#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  imgs.forEach((img,i)=>{const x=gap+(i%cols)*(cell+gap),y=gap+Math.floor(i/cols)*(cell+gap),r=Math.max(cell/img.width,cell/img.height),w=img.width*r,h=img.height*r;ctx.save();ctx.beginPath();ctx.roundRect(x,y,cell,cell,12);ctx.clip();ctx.drawImage(img,x+(cell-w)/2,y+(cell-h)/2,w,h);ctx.restore();progress(cb,(i+1)/imgs.length*.8,'Componiendo mosaico...');});
  const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.92));return {...download(blob,'prisma-mosaico.jpg'),summary:imgs.length+' imágenes combinadas.'};
 }
 const f=files[0],img=await createImageBitmap(f),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 if(id==='image-palette'){
  const sw=96,sh=Math.max(1,Math.round(img.height/img.width*sw));canvas.width=sw;canvas.height=sh;ctx.drawImage(img,0,0,sw,sh);
  const data=ctx.getImageData(0,0,sw,sh).data,counts=new Map();
  for(let i=0;i<data.length;i+=16){if(data[i+3]<180)continue;const r=Math.round(data[i]/32)*32,g=Math.round(data[i+1]/32)*32,b=Math.round(data[i+2]/32)*32,key=[Math.min(255,r),Math.min(255,g),Math.min(255,b)].map(v=>v.toString(16).padStart(2,'0')).join('');counts.set('#'+key,(counts.get('#'+key)||0)+1);}
  const colors=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
  return {colors,text:colors.join('\n'),summary:'Paleta aproximada extraída de la imagen. Selecciona un color para copiarlo.'};
 }
 canvas.width=img.width;canvas.height=img.height;
 if(id==='image-flip'){
  ctx.save();if(p.direction==='vertical'){ctx.translate(0,canvas.height);ctx.scale(1,-1);}else{ctx.translate(canvas.width,0);ctx.scale(-1,1);}ctx.drawImage(img,0,0);ctx.restore();
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));return {...download(blob,fileName(f)+'-invertida.png'),summary:img.width+' × '+img.height+' px'};
 }
 if(id==='image-watermark'){
  ctx.drawImage(img,0,0);const text=String(p.watermark||'PRISMA').trim();if(!text)throw Error('Escribe el texto de la marca de agua.');
  const size=Math.max(12,Math.min(180,Number(p.size)||36)),margin=Math.max(16,Math.round(Math.min(img.width,img.height)*.035));
  ctx.font='700 '+size+'px Manrope, Arial, sans-serif';ctx.fillStyle=p.color||'#ffffff';ctx.globalAlpha=Math.max(.08,Math.min(.9,(Number(p.opacity)||45)/100));
  ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=5;
  const w=ctx.measureText(text).width,position=p.position||'bottom-right';
  const x=position.includes('left')?margin:position.includes('center')?(canvas.width-w)/2:canvas.width-w-margin;
  const y=position.includes('top')?size+margin:position.includes('center')?canvas.height/2:canvas.height-margin;
  ctx.fillText(text,x,y);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));return {...download(blob,fileName(f)+'-marca.png'),summary:'Marca de agua aplicada · '+img.width+' × '+img.height+' px'};
 }
 if(id==='image-favicon'){
  const JSZip=(await import(JSZIP_URL)).default,zip=new JSZip();
  for(const size of [16,32,48,180,192,512]){
   const c=document.createElement('canvas');c.width=size;c.height=size;const cctx=c.getContext('2d');cctx.drawImage(img,0,0,size,size);
   const blob=await new Promise(r=>c.toBlob(r,'image/png'));zip.file('icon-'+size+'.png',await blob.arrayBuffer());
  }
  const blob=await zip.generateAsync({type:'blob'});return {...download(blob,'prisma-iconos-web.zip'),summary:'Incluye PNG de 16, 32, 48, 180, 192 y 512 px.'};
 }
 throw Error('Operación de imagen no disponible.');
}
async function mediaAdvanced(id,files,p,cb){
 if(id==='video-thumbnail'){
  const url=URL.createObjectURL(files[0]),video=document.createElement('video');
  try{
   video.muted=true;video.preload='metadata';video.src=url;
   await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('No se pudo leer el video.'));});
   const time=Math.max(0,Math.min(Number(p.second)||0,Math.max(0,video.duration-.1)));
   const seeked=new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(Error('No se pudo capturar ese instante.'));});video.currentTime=time;await seeked;
   const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
   const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.92));return {...download(blob,'miniatura-video.jpg'),summary:video.videoWidth+' × '+video.videoHeight+' px · Segundo '+time.toFixed(1)};
  }finally{URL.revokeObjectURL(url);video.removeAttribute('src');video.load();}
 }
 const {FFmpeg}=await load(FF),{fetchFile,toBlobURL}=await load(UTIL),ff=new FFmpeg();
 const base='https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
 progress(cb,.08,'Cargando motor multimedia (primera vez puede tardar)...');
 await ff.load({coreURL:await toBlobURL(base+'/ffmpeg-core.js','text/javascript'),wasmURL:await toBlobURL(base+'/ffmpeg-core.wasm','application/wasm')});
 const ext=(files[0].name.split('.').pop()||'mp4').replace(/[^a-z0-9]/gi,'');
 const input='prisma-input.'+ext,output=id==='video-gif'?'prisma-output.gif':id==='audio-trim'?'prisma-output.wav':'prisma-silencio.mp4';
 await ff.writeFile(input,await fetchFile(files[0]));
 let args;
 if(id==='video-gif')args=['-ss',String(Math.max(0,Number(p.start)||0)),'-i',input,'-t',String(Math.max(1,Math.min(12,Number(p.duration)||5))),'-vf','fps=12,scale=640:-1:flags=lanczos','-loop','0',output];
 else if(id==='video-mute')args=['-i',input,'-an','-c:v','copy','-movflags','+faststart',output];
 else args=['-ss',String(Math.max(0,Number(p.start)||0)),'-t',String(Math.max(.1,Number(p.duration)||10)),'-i',input,'-vn','-acodec','pcm_s16le','-ar','44100','-ac','2',output];
 await ff.exec(args);progress(cb,.9,'Preparando el resultado...');const data=await ff.readFile(output);
 const type=id==='video-gif'?'image/gif':id==='audio-trim'?'audio/wav':'video/mp4';
 return download(makeBlob(data,type),id==='video-gif'?'prisma-animacion.gif':id==='audio-trim'?'audio-recortado.wav':'video-sin-audio.mp4');
}
async function scanQr(file){
 const mod=await import('https://esm.sh/jsqr@1.4.0'),jsQR=mod.default||mod;
 const img=await createImageBitmap(file),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 const scale=Math.min(1,1800/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
 ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);
 const result=jsQR(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'});
 if(!result)throw Error('No se encontró un código QR legible en esta imagen.');
 return {text:result.data,summary:'Código QR detectado correctamente.'};
}
async function makeBarcode(p){
 const mod=await import('https://esm.sh/jsbarcode@3.11.6'),JsBarcode=mod.default||mod;
 const value=String(p.value||'').trim();if(!value)throw Error('Escribe el contenido del código de barras.');
 const canvas=document.createElement('canvas');
 try{JsBarcode(canvas,value,{format:p.format||'CODE128',displayValue:true,lineColor:'#111827',background:'#ffffff',width:2,height:110,margin:18,fontSize:16});}
 catch(e){throw Error('El contenido no es válido para ese formato de código de barras.');}
 const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));return {...download(blob,'prisma-codigo-barras.png'),previewUrl:URL.createObjectURL(blob)};
}
function parseCsv(text,delimiter){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++;}
  else if(ch==='"')quoted=!quoted;
  else if(ch===delimiter&&!quoted){row.push(cell);cell='';}
  else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}
  else cell+=ch;
 }
 row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
}
function csvCell(value){const s=String(value??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function calculateExpression(input){
 const tokens=String(input).replace(/,/g,'.').match(/\d+(?:\.\d+)?|[()+\-*\/%^]/g)||[];
 const source=String(input).replace(/\s/g,'').replace(/,/g,'.');
 if(tokens.join('')!==source)throw Error('Usa números y operadores +, −, ×, ÷, %, ^ y paréntesis.');
 let i=0;
 function primary(){const t=tokens[i++];if(t==='('){const v=expr();if(tokens[i++]!==')')throw Error('Falta un paréntesis de cierre.');return v;}if(t==='+'||t==='-')return (t==='-'?-1:1)*primary();const n=Number(t);if(!Number.isFinite(n))throw Error('Expresión incompleta.');return n;}
 function power(){let v=primary();if(tokens[i]==='^'){i++;v=Math.pow(v,power());}return v;}
 function term(){let v=power();while(['*','/','%'].includes(tokens[i])){const op=tokens[i++],b=power();if((op==='/'||op==='%')&&b===0)throw Error('No se puede dividir entre cero.');v=op==='*'?v*b:op==='/'?v/b:v%b;}return v;}
 function expr(){let v=term();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],b=term();v=op==='+'?v+b:v-b;}return v;}
 const result=expr();if(i!==tokens.length||!Number.isFinite(result))throw Error('No se pudo calcular la expresión.');return result;
}
function contrastRatio(hex1,hex2){
 const rgb=h=>{let s=h.replace('#','');if(s.length===3)s=s.split('').map(x=>x+x).join('');if(!/^[0-9a-f]{6}$/i.test(s))throw Error('Usa colores hexadecimales como #FFFFFF.');return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));};
 const lum=a=>.2126*a[0]+.7152*a[1]+.0722*a[2],a=lum(rgb(hex1)),b=lum(rgb(hex2));
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

export async function runTool(id,files=[],p={},cb){
 progress(cb,.05,'Iniciando...');
 if(id==='pdf-to-image')return pdfToImages(files[0],p,cb);
 if(id==='pdf-text')return pdfToText(files[0],cb);
 if(id.startsWith('pdf-'))return pdfTool(id,files,p,cb);
 if(['image-pdf'].includes(id)){
  const {PDFDocument}=await load(PDF_LIB),doc=await PDFDocument.create();
  for(let i=0;i<files.length;i++){const f=files[i];const img=await createImageBitmap(f);const page=doc.addPage(p.pageSize==='letter'?[612,792]:[595.28,841.89]);const pad=28,scale=Math.min((page.getWidth()-pad*2)/img.width,(page.getHeight()-pad*2)/img.height);const w=img.width*scale,h=img.height*scale;const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);const bytes=await new Promise(r=>canvas.toBlob(async b=>r(await b.arrayBuffer()),'image/jpeg',.92));const emb=await doc.embedJpg(bytes);page.drawImage(emb,{x:(page.getWidth()-w)/2,y:(page.getHeight()-h)/2,width:w,height:h});progress(cb,(i+1)/files.length*.8,'Creando páginas...');}
  return download(makeBlob(await doc.save(),'application/pdf'),'imagenes-a-pdf.pdf');
 }
 if(id==='image-gen'||['image-collage','image-palette','image-flip','image-watermark','image-favicon'].includes(id))return imageAdvanced(id,files,p,cb);
 if(id.startsWith('image-'))return imageTool(id,files,p,cb);
 if(id==='docx-html')return runDocx(files,cb);
 if(id==='video-thumbnail'||id==='video-gif'||id==='video-mute'||id==='audio-trim')return mediaAdvanced(id,files,p,cb);
 if(id==='qr-scan')return scanQr(files[0]);
 if(id==='barcode')return makeBarcode(p);
 if(id.startsWith('video-'))return runVideo(id,files,p,cb);
 if(id==='qr')return runQr(p,cb);
 if(id==='currency')return runCurrency(p,cb);
 return runText(id,p);
}
