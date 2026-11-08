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
 const factors={length:{m:1,km:1000,cm:.01,mm:.001,mi:1609.344,ft:.3048},mass:{kg:1,g:.001,mg:1e-6,lb:.45359237,oz:.028349523125}};
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
export async function runTool(id,files=[],p={},cb){
 progress(cb,.05,'Iniciando...');
 if(id.startsWith('pdf-'))return pdfTool(id,files,p,cb);
 if(['image-pdf'].includes(id)){
  const {PDFDocument}=await load(PDF_LIB),doc=await PDFDocument.create();
  for(let i=0;i<files.length;i++){const f=files[i];const img=await createImageBitmap(f);const page=doc.addPage(p.pageSize==='letter'?[612,792]:[595.28,841.89]);const pad=28,scale=Math.min((page.getWidth()-pad*2)/img.width,(page.getHeight()-pad*2)/img.height);const w=img.width*scale,h=img.height*scale;const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);const bytes=await new Promise(r=>canvas.toBlob(async b=>r(await b.arrayBuffer()),'image/jpeg',.92));const emb=await doc.embedJpg(bytes);page.drawImage(emb,{x:(page.getWidth()-w)/2,y:(page.getHeight()-h)/2,width:w,height:h});progress(cb,(i+1)/files.length*.8,'Creando páginas...');}
  return download(makeBlob(await doc.save(),'application/pdf'),'imagenes-a-pdf.pdf');
 }
 if(id.startsWith('image-'))return imageTool(id,files,p,cb);
 if(id==='docx-html')return runDocx(files,cb);
 if(id.startsWith('video-'))return runVideo(id,files,p,cb);
 if(id==='qr')return runQr(p,cb);
 if(id==='currency')return runCurrency(p,cb);
 return runText(id,p);
}
