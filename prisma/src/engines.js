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
 if(id==='pdf-form-fields'){
  const fields=src.getForm().getFields();
  const lines=['CAMPOS INTERACTIVOS DEL PDF','Archivo: '+files[0].name,'Páginas: '+total,'Campos encontrados: '+fields.length,''];
  if(!fields.length)lines.push('Este PDF no contiene campos interactivos AcroForm.');
  fields.forEach((item,i)=>lines.push((i+1)+'. '+item.getName()+' · '+(item.constructor?.name||'Campo')));
  progress(cb,1,'Inspección de formulario completada.');
  return {text:lines.join('\n'),summary:fields.length+' campos identificados. Por privacidad solo se muestran nombres y tipos, nunca valores.'};
 }
 if(id==='pdf-form-flatten'){
  const form=src.getForm(),fields=form.getFields();
  if(!fields.length)throw Error('El PDF no contiene formularios editables.');
  form.flatten();
  progress(cb,1,'Formulario fijado.');
  return {...download(makeBlob(await src.save(),'application/pdf'),fileName(files[0])+'-formulario-fijo.pdf'),summary:fields.length+' campos fijados en un PDF no editable como formulario.'};
 }
 if(id==='pdf-add-blank'){
  const count=Math.max(1,Math.min(10,Math.round(Number(p.count)||1)));
  const first=src.getPage(0),size=[first.getWidth(),first.getHeight()];
  for(let i=0;i<count;i++)if(p.position==='start')src.insertPage(i,size);else src.addPage(size);
  progress(cb,1,'Páginas insertadas.');
  return {...download(makeBlob(await src.save(),'application/pdf'),fileName(files[0])+'-mas-paginas.pdf'),summary:count+' páginas en blanco añadidas '+(p.position==='start'?'al principio':'al final')+'.'};
 }
 if(id==='pdf-metadata'){
  const info={titulo:src.getTitle()||'No indicado',autor:src.getAuthor()||'No indicado',asunto:src.getSubject()||'No indicado',palabrasClave:src.getKeywords()||'No indicadas',creador:src.getCreator()||'No indicado',productor:src.getProducer()||'No indicado',fechaCreacion:src.getCreationDate()?.toISOString()||'No indicada',fechaModificacion:src.getModificationDate()?.toISOString()||'No indicada',paginas:total};
  return {text:JSON.stringify(info,null,2),summary:'Metadatos leídos localmente. No se modificó el PDF.'};
 }
 if(id==='pdf-metadata-clean'){
  const {PDFName,PDFDict}=await load(PDF_LIB);
  try{const ref=src.context.trailerInfo.Info,info=ref?src.context.lookup(ref,PDFDict):null;if(info)for(const key of ['Title','Author','Subject','Keywords','Creator','Producer','CreationDate','ModDate','Trapped'])info.delete(PDFName.of(key));}catch{}
  try{src.catalog.delete(PDFName.of('Metadata'));}catch{}
  return download(makeBlob(await src.save(),'application/pdf'),fileName(files[0])+'-sin-metadatos.pdf');
 }
 if(id==='pdf-compress'){
  const saved=await src.save({useObjectStreams:true,objectsPerTick:50});
  const original=Number(files[0].size)||0,optimized=saved.byteLength,reduction=original?((original-optimized)/original*100):0;
  return {...download(makeBlob(saved,'application/pdf'),fileName(files[0])+'-optimizado.pdf'),summary:optimized<original?'PDF optimizado localmente: '+(original/1024/1024).toFixed(2)+' MB → '+(optimized/1024/1024).toFixed(2)+' MB ('+reduction.toFixed(1)+'% menos).':'PDF reescrito con estructura optimizada. No se redujo el tamaño; los archivos dominados por imágenes requieren compresión específica de imágenes para reducir más el peso.'};
 }
 if(id==='pdf-split'){
  const JSZip=(await import(JSZIP_URL)).default,zip=new JSZip();
  const pages=src.getPageIndices();
  for(let i=0;i<pages.length;i++){
   const single=await PDFDocument.create(),copied=await single.copyPages(src,[pages[i]]);
   single.addPage(copied[0]);zip.file('pagina-'+String(i+1).padStart(3,'0')+'.pdf',await single.save());
   progress(cb,(i+1)/pages.length*.85,'Separando página '+(i+1)+' de '+pages.length+'...');
  }
  const blob=await zip.generateAsync({type:'blob'});return download(blob,fileName(files[0])+'-paginas.zip');
 }

 if(id==='pdf-extract'){
  const ids=parsePages(p.pages,total);
  const selected=await out.copyPages(src,ids);
  selected.forEach(page=>out.addPage(page));
  progress(cb,1,'Se extrajeron '+selected.length+' páginas del PDF.');
  return download(makeBlob(await out.save(),'application/pdf'),fileName(files[0])+'-paginas-seleccionadas.pdf');
 }
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
 if(id==='image-strip-metadata'){
  const bitmap=await createImageBitmap(f),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close?.();
  const type=['image/jpeg','image/png','image/webp'].includes(f.type)?f.type:'image/png';
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,.94));
  if(!blob)throw Error('No se pudo reexportar la imagen.');
  return {...download(blob,fileName(f)+'-sin-metadatos.'+(type==='image/jpeg'?'jpg':type.split('/')[1])),previewUrl:URL.createObjectURL(blob),summary:'Imagen reexportada localmente. Los metadatos EXIF habituales y la ubicación incrustada se descartan.'};
 }
 if(id==='image-metadata'){
  const exifr=await import('https://esm.sh/exifr@7.1.3');
  const meta=await exifr.parse(f).catch(()=>null);
  const bitmap=await createImageBitmap(f);const dimensions=bitmap.width+' × '+bitmap.height+' px';bitmap.close?.();const info={archivo:f.name,tamaño:formatBytesEngine(f.size),tipo:f.type||'desconocido',dimensiones,metadatos:meta||'No se encontraron metadatos EXIF'};
  return {text:JSON.stringify(info,null,2),summary:'Lectura local. Si existen datos GPS, podrían aparecer en los metadatos.'};
 }
 if(id==='image-ocr'){
  const {createWorker}=await load(TESS);const worker=await createWorker(p.language||'spa');progress(cb,.2,'Reconociendo texto...');
  const result=await worker.recognize(f);await worker.terminate();return {text:result.data.text||'No se detectó texto.',summary:'Confianza estimada: '+Math.round(result.data.confidence)+'%'};
 }
 const img=new Image(),url=URL.createObjectURL(f);
 try{await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(Error('No se pudo abrir la imagen.'));img.src=url;});
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 if(['image-grayscale','image-blur','image-adjust','image-rounded','image-sepia'].includes(id)){
  const max=Math.max(128,Math.min(5000,Number(p.maxSize)||1600));
  const scale=id==='image-rounded'?Math.min(1,max/Math.max(img.width,img.height)):1;
  const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
  const pad=id==='image-blur'?Math.ceil(Math.max(1,Math.min(30,Number(p.blur)||5))*3):0;
  canvas.width=w+pad*2;canvas.height=h+pad*2;
  if(id==='image-rounded'){
   const radius=Math.max(0,Math.min(Math.min(w,h)/2,Number(p.radius)||48));
   ctx.beginPath();ctx.roundRect(0,0,w,h,radius);ctx.clip();ctx.drawImage(img,0,0,w,h);
  }else{
   if(id==='image-grayscale')ctx.filter='grayscale(1)';
   if(id==='image-blur')ctx.filter='blur('+Math.max(1,Math.min(30,Number(p.blur)||5))+'px)';
   if(id==='image-adjust')ctx.filter='brightness('+Math.max(10,Math.min(200,Number(p.brightness)||100))+'%) contrast('+Math.max(10,Math.min(200,Number(p.contrast)||100))+'%)';
   if(id==='image-sepia')ctx.filter='sepia(1)';
   ctx.drawImage(img,pad,pad,w,h);ctx.filter='none';
  }
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
  return {...download(blob,fileName(f)+'-'+id+'.png'),previewUrl:URL.createObjectURL(blob),summary:w+' × '+h+' px'};
 }
 if(id==='image-pixelate'){const block=Math.max(4,Math.min(80,Number(p.block)||16)),small=document.createElement('canvas');small.width=Math.max(1,Math.round(img.width/block));small.height=Math.max(1,Math.round(img.height/block));const sctx=small.getContext('2d');sctx.imageSmoothingEnabled=true;sctx.drawImage(img,0,0,small.width,small.height);canvas.width=img.width;canvas.height=img.height;ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,small.width,small.height,0,0,img.width,img.height);}
 if(id==='image-crop'){const w=Math.max(1,Math.round(img.width*Number(p.widthPct||80)/100)),h=Math.max(1,Math.round(img.height*Number(p.heightPct||80)/100));canvas.width=w;canvas.height=h;ctx.drawImage(img,(img.width-w)/2,(img.height-h)/2,w,h,0,0,w,h);}
 else if(id==='image-pixelate'){/* pixelated canvas prepared above */}
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
 progress(cb,.12,'Cargando motor multimedia...');
 await ff.load({coreURL:await toBlobURL(base+'/ffmpeg-core.js','text/javascript'),wasmURL:await toBlobURL(base+'/ffmpeg-core.wasm','application/wasm')});
 const ext=(files[0].name.split('.').pop()||'mp4').toLowerCase().replace(/[^a-z0-9]/g,'')||'mp4';
 const input='input.'+ext;await ff.writeFile(input,await fetchFile(files[0]));
 let output='prisma-video.mp4',args=['-i',input];
 if(id==='video-speed'){
  const speed=Math.max(.5,Math.min(2,Number(p.speed)||1.5));
  output='video-velocidad-'+speed+'x.mp4';
  args=['-i',input,'-filter:v','setpts='+(1/speed).toFixed(5)+'*PTS','-filter:a','atempo='+speed,'-c:v','libx264','-preset','ultrafast','-crf','24','-c:a','aac',output];
 }else if(id==='video-resize'){
  const sizes={vertical:[1080,1920],portrait:[1080,1350],square:[1080,1080],landscape:[1920,1080],hd:[1280,720]};
  const [w,h]=sizes[p.resolution]||sizes.vertical;
  output='video-'+w+'x'+h+'.mp4';
  args=['-i',input,'-vf','scale='+w+':'+h+':force_original_aspect_ratio=decrease,pad='+w+':'+h+':(ow-iw)/2:(oh-ih)/2','-c:v','libx264','-preset','ultrafast','-crf','24','-c:a','aac',output];
 }else if(id==='video-rotate'){
  const filter=p.direction==='ccw'?'transpose=2':p.direction==='180'?'hflip,vflip':'transpose=1';
  output='video-rotado.mp4';
  args=['-i',input,'-vf',filter,'-c:v','libx264','-preset','ultrafast','-crf','24','-c:a','aac',output];
 }else if(id==='audio-convert'){
  const format=['mp3','wav','ogg'].includes(p.format)?p.format:'mp3';
  output='audio-convertido.'+format;
  const codec=format==='mp3'?['-c:a','libmp3lame','-q:a','2']:format==='ogg'?['-c:a','libvorbis','-q:a','5']:['-c:a','pcm_s16le'];
  args=['-i',input,'-vn',...codec,output];
 }else if(id==='audio-normalize'){
  output='audio-normalizado.m4a';
  args=['-i',input,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac','-b:a','192k',output];
 }else if(id==='video-audio'){
  output='audio.wav';args=['-i',input,'-vn','-acodec','pcm_s16le','-ar','44100','-ac','2',output];
 }else{
  output='video-recortado.mp4';args=['-ss',String(p.start||0),'-i',input,'-t',String(p.duration||10),'-c','copy',output];
 }
 progress(cb,.38,'Procesando archivo...');
 await ff.exec(args);
 progress(cb,.9,'Preparando el resultado...');
 const data=await ff.readFile(output);
 const audio=id.startsWith('audio-')||id==='video-audio';
 const mime=output.endsWith('.mp3')?'audio/mpeg':output.endsWith('.wav')?'audio/wav':output.endsWith('.ogg')?'audio/ogg':output.endsWith('.m4a')?'audio/mp4':'video/mp4';
 const blob=makeBlob(data,mime);
 progress(cb,1,'Archivo listo.');
 return {...download(blob,fileName(files[0])+'-'+output),summary:'Procesamiento local en el navegador · '+formatBytesEngine(blob.size)};
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

function formatBytesEngine(bytes){if(!bytes)return '0 B';const u=['B','KB','MB','GB'],i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3);return (bytes/Math.pow(1024,i)).toFixed(i?1:0)+' '+u[i];}
async function audioWaveform(file,p,cb){
 const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw Error('Este navegador no permite procesar audio.');
 const ctx=new AudioCtx();
 try{
  progress(cb,.15,'Leyendo audio...');const buffer=await ctx.decodeAudioData(await file.arrayBuffer());
  const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=460;
  const c=canvas.getContext('2d');c.fillStyle='#101218';c.fillRect(0,0,canvas.width,canvas.height);
  const data=buffer.getChannelData(0),step=Math.max(1,Math.floor(data.length/1800)),mid=canvas.height/2;
  c.strokeStyle=p.color||'#9adbd2';c.lineWidth=1.3;c.beginPath();
  for(let x=0;x<1800;x++){let min=1,max=-1;for(let j=0;j<step;j++){const v=data[x*step+j]||0;if(v<min)min=v;if(v>max)max=v;}c.moveTo(x,mid+min*mid*.88);c.lineTo(x,mid+max*mid*.88);}
  c.stroke();c.fillStyle='rgba(255,255,255,.62)';c.font='18px Arial';c.fillText(file.name.slice(0,70),28,32);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));return {...download(blob,fileName(file)+'-onda.png'),previewUrl:URL.createObjectURL(blob),summary:'Duración: '+buffer.duration.toFixed(2)+' s · '+buffer.numberOfChannels+' canal(es) · '+buffer.sampleRate+' Hz'};
 }finally{await ctx.close();}
}
async function hashFile(file){
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 return {text:'SHA-256  '+hex+'\nArchivo: '+file.name+'\nTamaño: '+formatBytesEngine(file.size),summary:'Huella calculada localmente con Web Crypto.'};
}
async function excelToJson(file,p,cb){
 const mod=await import('https://esm.sh/xlsx@0.18.5'),XLSX=mod.default||mod;
 progress(cb,.2,'Leyendo libro de cálculo...');
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
 if(!wb.SheetNames.length)throw Error('El archivo no contiene hojas legibles.');
 let output;
 if(p.sheet==='all')output=Object.fromEntries(wb.SheetNames.map(name=>[name,XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:''})]));
 else output=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
 if(p.format==='csv'&&p.sheet!=='all'){const csv=XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);return download(new Blob([csv],{type:'text/csv;charset=utf-8'}),fileName(file)+'.csv');}
 const text=JSON.stringify(output,null,2);return {...download(new Blob([text],{type:'application/json'}),fileName(file)+'.json'),text,summary:wb.SheetNames.length+' hoja(s) leídas: '+wb.SheetNames.join(', ')};
}
function decodeJwt(token){
 const parts=String(token||'').trim().split('.');if(parts.length!==3)throw Error('Un JWT debe tener tres segmentos separados por puntos.');
 const decode=part=>{const normalized=part.replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'=')))));};
 const header=decode(parts[0]),payload=decode(parts[1]);
 return {text:'ENCABEZADO\n'+JSON.stringify(header,null,2)+'\n\nPAYLOAD\n'+JSON.stringify(payload,null,2),summary:'Contenido decodificado. La firma no se ha verificado y no debe confiarse en este resultado para autenticar usuarios.'};
}
function textDiff(a,b){
 const A=String(a||'').split(/\\r?\n/),B=String(b||'').split(/\\r?\n/);
 if(A.length>450||B.length>450)throw Error('Para mantener la respuesta rápida, compara hasta 450 líneas por texto.');
 const dp=Array.from({length:A.length+1},()=>new Uint16Array(B.length+1));
 for(let i=A.length-1;i>=0;i--)for(let j=B.length-1;j>=0;j--)dp[i][j]=A[i]===B[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const out=[];let i=0,j=0,added=0,removed=0;
 while(i<A.length||j<B.length){if(i<A.length&&j<B.length&&A[i]===B[j]){out.push('  '+A[i]);i++;j++;}else if(j<B.length&&(i===A.length||dp[i][j+1]>=dp[i+1][j])){out.push('+ '+B[j++]);added++;}else{out.push('- '+A[i++]);removed++;}}
  return {text:out.join(String.fromCharCode(10)),summary:body.length+' filas analizadas · '+headers.length+' columnas.'};
}

async function formatSourceCode(p,kind){
 const source=String(p.text||'');if(!source.trim())throw Error('Pega el código que quieres formatear.');
 if(source.length>250000)throw Error('El límite para formatear es 250 KB.');
 if(kind==='sql'){
  const mod=await import('https://esm.sh/sql-formatter@15.4.6');
  const format=mod.format||mod.default?.format;if(!format)throw Error('No se pudo cargar el formateador SQL.');
  return {text:format(source,{language:p.dialect||'sql',tabWidth:Number(p.indent)||2,keywordCase:'upper'}),summary:'SQL organizado localmente en el navegador.'};
 }
 const prettier=await import('https://esm.sh/prettier@3.3.3/standalone');
 const pluginPath=kind==='html'?'html':kind==='css'?'postcss':'babel';
 const plugin=await import('https://esm.sh/prettier@3.3.3/plugins/'+pluginPath);
 const estree=kind==='js'?await import('https://esm.sh/prettier@3.3.3/plugins/estree'):null;
 const parser=kind==='html'?'html':kind==='css'?'css':'babel';
 const formatted=await prettier.format(source,{parser,plugins:estree?[plugin,estree]:[plugin],tabWidth:Number(p.indent)||2,useTabs:p.indent==='tab',singleQuote:p.quote==='single',semi:p.semicolon!=='false'});
 return {text:formatted,summary:'Código formateado en el navegador con Prettier.'};
}
function formatXmlText(source){
 const parsed=new DOMParser().parseFromString(source,'application/xml');
 if(parsed.querySelector('parsererror'))throw Error('El XML contiene errores de sintaxis. Revisa etiquetas y atributos.');
 const serialized=new XMLSerializer().serializeToString(parsed).replace(/>\s*</g,'><');
 const tokens=serialized.replace(/></g,'>\n<').split('\n');let depth=0;
 const lines=[];
 for(const token of tokens){
  const line=token.trim();if(!line)continue;
  if(/^<\//.test(line))depth=Math.max(0,depth-1);
  lines.push('  '.repeat(depth)+line);
  if(/^<[^!?/][^>]*[^/]?>$/.test(line)&&!/<\/[^>]+>$/.test(line)&&!/^<[^>]+\/>$/.test(line))depth++;
 }
 return lines.join('\n');
}
async function inspectFile(file){
 if(!file)throw Error('Selecciona un archivo.');
 const head=new Uint8Array(await file.slice(0,32).arrayBuffer());
 const hex=[...head].map(x=>x.toString(16).padStart(2,'0')).join(' ').toUpperCase();
 const ascii=[...head].map(x=>x>=32&&x<=126?String.fromCharCode(x):'.').join('');
 let signature='No reconocida por firma';
 const starts=(...b)=>b.every((v,i)=>head[i]===v);
 if(starts(0x25,0x50,0x44,0x46))signature='PDF';
 else if(starts(0x89,0x50,0x4e,0x47))signature='PNG';
 else if(starts(0xff,0xd8,0xff))signature='JPEG';
 else if(starts(0x47,0x49,0x46,0x38))signature='GIF';
 else if(starts(0x50,0x4b,0x03,0x04))signature='ZIP / DOCX / XLSX / PPTX';
 else if(ascii.slice(0,4)==='RIFF'&&ascii.slice(8,12)==='WEBP')signature='WebP';
 else if(ascii.slice(4,8)==='ftyp')signature='MP4 / ISO Base Media';
 else if(ascii.slice(0,3)==='ID3'||starts(0xff,0xfb))signature='MP3';
 else if(ascii.slice(0,4)==='OggS')signature='OGG';
 else if(ascii.slice(0,4)==='fLaC')signature='FLAC';
 return {text:['Nombre: '+file.name,'Tamaño: '+formatBytesEngine(file.size),'Tipo MIME declarado: '+(file.type||'No indicado'),'Última modificación: '+(file.lastModified?new Date(file.lastModified).toLocaleString('es-CO'):'No indicada'),'Extensión: '+(file.name.includes('.')?file.name.split('.').pop().toUpperCase():'Sin extensión'),'Firma detectada: '+signature,'Primeros bytes (hex): '+hex,'Vista ASCII: '+ascii].join('\n'),summary:'Inspección local. No se ha subido el archivo.'};
}
async function jsonToExcel(p){
 const source=String(p.text||'').trim();if(!source)throw Error('Pega una lista JSON.');
 let rows;try{rows=JSON.parse(source)}catch(e){throw Error('JSON inválido: '+e.message)}
 if(!Array.isArray(rows)||!rows.length||rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('El JSON debe ser una lista no vacía de objetos.');
 if(rows.length>50000)throw Error('El límite es de 50.000 registros.');
 const mod=await import('https://esm.sh/xlsx@0.18.5'),XLSX=mod.default||mod;
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);
 XLSX.utils.book_append_sheet(wb,ws,'Datos');
 const data=XLSX.write(wb,{bookType:'xlsx',type:'array'});
 return {...download(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'prisma-datos.xlsx'),summary:rows.length+' registros exportados a Excel.'};
}
async function socialImageKit(file,p,cb){
 const image=await createImageBitmap(file),JSZip=(await import(JSZIP_URL)).default,zip=new JSZip();
 const formats=[['instagram-cuadrado',1080,1080],['instagram-retrato',1080,1350],['stories-reels',1080,1920],['youtube-miniatura',1280,720]];
 for(let i=0;i<formats.length;i++){
  const [name,w,h]=formats[i],canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d'),scale=Math.max(w/image.width,h/image.height),sw=w/scale,sh=h/scale,sx=(image.width-sw)/2,sy=(image.height-sh)/2;
  ctx.drawImage(image,sx,sy,sw,sh,0,0,w,h);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
  zip.file(name+'.jpg',await blob.arrayBuffer());progress(cb,(i+1)/formats.length*.8,'Preparando formato '+(i+1)+' de '+formats.length+'...');
 }
 image.close?.();const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
 return {...download(blob,'prisma-kit-redes-sociales.zip'),summary:'Incluye 4 formatos JPG listos para redes. Se utiliza recorte centrado para llenar cada proporción.'};
}
async function runText(id,p){
 const text=String(p.text||'');
 switch(id){
 case 'jwt-decode':return decodeJwt(p.token);
 case 'text-diff':return textDiff(p.textA,p.textB);
 case 'regex-test':{const pattern=String(p.pattern||'');if(pattern.length>200||text.length>5000)throw Error('Limita el patrón a 200 caracteres y el texto a 5.000.');let re;try{re=new RegExp(pattern,String(p.flags||'').replace(/[^gimsu]/g,''));}catch(e){throw Error('Expresión regular inválida: '+e.message)}const matches=[...text.matchAll(re.global?re:new RegExp(re.source,re.flags+'g'))].slice(0,100);return {text:matches.length?matches.map((m,i)=>(i+1)+'. '+m[0]+' · posición '+m.index).join('\n'):'Sin coincidencias.',summary:matches.length+' coincidencia(s).'};}
 case 'json-yaml':{const yaml=await import('https://esm.sh/js-yaml@4.1.0');if(p.mode==='yaml-to-json'){const obj=yaml.load(text);return {text:JSON.stringify(obj,null,2)};}let obj;try{obj=JSON.parse(text)}catch(e){throw Error('JSON inválido: '+e.message)}return {text:yaml.dump(obj,{noRefs:true,lineWidth:100})};}
 case 'css-gradient':{const a=p.color1||'#9adbd2',b=p.color2||'#a9a0ee',angle=Math.max(0,Math.min(360,Number(p.angle)||135));const css=p.type==='radial'?'background: radial-gradient(circle, '+a+', '+b+');':'background: linear-gradient('+angle+'deg, '+a+', '+b+');';return {text:css,summary:'Copia esta declaración y pégala dentro de una regla CSS.'};}
 case 'json-format':{let obj;try{obj=JSON.parse(text)}catch(e){throw Error('JSON inválido: '+e.message)}return {text:JSON.stringify(obj,p.indent==='tab'?'\t':Number(p.indent||2))};}
 case 'base64':try{return {text:p.mode==='decode'?decodeURIComponent(escape(atob(text.trim()))):btoa(unescape(encodeURIComponent(text)))}}catch{throw Error('No se pudo convertir. Comprueba el contenido.');}
 case 'word-count':{const words=text.trim()?text.trim().split(/\s+/u).length:0;return {text:'Palabras: '+words+'\nCaracteres: '+text.length+'\nSin espacios: '+text.replace(/\s/g,'').length+'\nLíneas: '+(text?text.split(/\r\n|\r|\n/).length:0)+'\nLectura estimada: '+Math.ceil(words/200)+' min'};}
 case 'url-code':try{return {text:p.mode==='decode'?decodeURIComponent(text):encodeURIComponent(text)}}catch{throw Error('La secuencia URL no es válida.');}
 case 'text-case':{let v=text;if(p.mode==='upper')v=text.toLocaleUpperCase('es');if(p.mode==='lower')v=text.toLocaleLowerCase('es');if(p.mode==='title')v=text.toLocaleLowerCase('es').replace(/\b\p{L}/gu,c=>c.toLocaleUpperCase('es'));if(p.mode==='sentence')v=text.toLocaleLowerCase('es').replace(/(^\s*\p{L}|[.!?]\s*\p{L})/gu,c=>c.toLocaleUpperCase('es'));return {text:v};}
 case 'text-remove-empty-lines':{const lines=text.replace(/\r/g,'').split('\n'),kept=lines.filter(line=>line.trim().length);return {text:kept.join('\n'),summary:(lines.length-kept.length)+' línea(s) vacía(s) eliminadas.'};}
 case 'text-prefix-lines':{const lines=text.replace(/\r/g,'').split('\n'),prefix=String(p.prefix||''),suffix=String(p.suffix||'');return {text:lines.map(line=>prefix+line+suffix).join('\n'),summary:prefix+' añadido al inicio y '+suffix+' al final de cada línea.'};}
 case 'text-replace':{const search=String(p.search||'');if(!search)throw Error('Escribe el texto que quieres buscar.');const flags=(p.caseSensitive?'g':'gi');const escaped=search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const re=new RegExp(escaped,p.replaceAll===false?flags.replace('g',''):flags);const output=text.replace(re,String(p.replacement||''));return {text:output,summary:'Texto reemplazado localmente.'};}
 case 'text-extract-hashtags':{const matches=text.match(/#[\p{L}\p{N}_]+/gu)||[],seen=new Set(),unique=matches.filter(tag=>{const key=tag.toLocaleLowerCase('es');if(seen.has(key))return false;seen.add(key);return true;});return {text:unique.join('\n'),summary:unique.length+' hashtag(s) único(s) encontrados.'};}
 case 'text-extract-phones':{const matches=text.match(/\+?\d[\d\s().-]{5,}\d/g)||[],seen=new Set(),unique=matches.map(value=>value.trim()).filter(value=>{const digits=value.replace(/\D/g,'');if(digits.length<7||digits.length>15||seen.has(digits))return false;seen.add(digits);return true;});return {text:unique.join('\n'),summary:unique.length+' posible(s) teléfono(s) encontrados. Verifica los resultados.'};}
 case 'json-flatten':{let value;try{value=JSON.parse(text)}catch(e){throw Error('JSON inválido: '+e.message)}const rows=[];const walk=(node,path)=>{if(Array.isArray(node)){if(!node.length)rows.push((path||'$')+' = []');node.forEach((item,index)=>walk(item,path+'['+index+']'));}else if(node&&typeof node==='object'){const keys=Object.keys(node);if(!keys.length)rows.push((path||'$')+' = {}');keys.forEach(key=>walk(node[key],path?path+'.'+key:key));}else rows.push((path||'$')+' = '+JSON.stringify(node));};walk(value,'');return {text:rows.join('\n'),summary:rows.length+' ruta(s) extraídas del JSON.'};}
 case 'text-remove-accents':return {text:text.normalize('NFD').replace(/[\u0300-\u036f]/g,'') ,summary:'Tildes y marcas diacríticas eliminadas localmente.'};
 case 'text-reverse':return {text:p.mode==='lines'?text.replace(/\r/g,'').split('\n').reverse().join('\n'):[...text].reverse().join(''),summary:p.mode==='lines'?'Orden de líneas invertido.':'Texto invertido respetando caracteres Unicode.'};
 case 'text-extract-emails':{const matches=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];const unique=[...new Set(matches.map(x=>x.toLowerCase()))];return {text:unique.join('\n'),summary:unique.length+' correo(s) único(s) encontrados.'};}
 case 'text-extract-urls':{const matches=text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)||[];const unique=[...new Set(matches.map(x=>x.replace(/[),.;!?]+$/,'')).filter(Boolean))];return {text:unique.join('\n'),summary:unique.length+' enlace(s) único(s) encontrados.'};}
 case 'json-minify':{let obj;try{obj=JSON.parse(text)}catch(e){throw Error('JSON inválido: '+e.message)}return {text:JSON.stringify(obj),summary:'JSON validado y minificado localmente.'};}
 case 'html-to-text':{const doc=new DOMParser().parseFromString(text,'text/html');doc.querySelectorAll('script,style,noscript,template').forEach(node=>node.remove());const output=(doc.body?.textContent||'').replace(/[\t\f\v ]+/g,' ').replace(/\s*\n\s*/g,'\n').replace(/\n{3,}/g,'\n\n').trim();return {text:output,summary:'Texto visible extraído localmente. No se ejecutó HTML ni JavaScript.'};}
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
 case 'text-sort':{const lines=text.replace(/\r/g,'').split('\n');const sensitivity=p.caseSensitive?'variant':'base';lines.sort((a,b)=>a.localeCompare(b,'es',{sensitivity,numeric:true}));return {text:lines.join('\n'),summary:lines.length+' líneas ordenadas alfabéticamente.'};}
 case 'word-frequency':{const words=text.toLocaleLowerCase('es').match(/[\p{L}\p{N}']+/gu)||[];const counts=new Map();for(const word of words)counts.set(word,(counts.get(word)||0)+1);const rows=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es')).slice(0,30);return {text:rows.map(([word,count],index)=>(index+1)+'. '+word+' — '+count).join('\n'),summary:words.length+' palabras analizadas · '+counts.size+' palabras únicas.'};}
 case 'html-format':return formatSourceCode(p,'html');
 case 'css-format':return formatSourceCode(p,'css');
 case 'js-format':return formatSourceCode(p,'js');
 case 'sql-format':return formatSourceCode(p,'sql');
 case 'xml-format':return {text:formatXmlText(text),summary:'XML validado y formateado localmente.'};
 case 'json-schema':{
  const dataText=String(p.data||'').trim(),schemaText=String(p.schema||'').trim();
  if(!dataText||!schemaText)throw Error('Introduce el JSON y el esquema JSON.');
  if(dataText.length>1000000||schemaText.length>200000)throw Error('El tamaño máximo es 1 MB para los datos y 200 KB para el esquema.');
  let data,schema;try{data=JSON.parse(dataText);schema=JSON.parse(schemaText)}catch(e){throw Error('JSON o esquema inválido: '+e.message)}
  const mod=await import('https://esm.sh/ajv@8.17.1'),Ajv=mod.default||mod.Ajv,ajv=new Ajv({allErrors:true,strict:false});
  let validate;try{validate=ajv.compile(schema)}catch(e){throw Error('El esquema no es válido: '+e.message)}
  const valid=validate(data),errors=(validate.errors||[]).map(x=>(x.instancePath||'/')+' '+x.message);
  return {text:valid?'JSON VÁLIDO\n\nEl documento cumple el esquema indicado.':('JSON NO VÁLIDO\n\n'+errors.join('\n')),summary:valid?'Todos los campos cumplen el esquema.':errors.length+' error(es) de validación.'};
 }
 case 'csv-stats':{
  const rows=parseCsv(text,p.delimiter||',');if(rows.length<2)throw Error('El CSV necesita encabezados y al menos una fila.');
  const headers=rows[0],body=rows.slice(1),out=['FILAS: '+body.length,'COLUMNAS: '+headers.length,'','RESUMEN POR COLUMNA'];
  headers.forEach((name,i)=>{const values=body.map(r=>String(r[i]??'').trim()),nonEmpty=values.filter(Boolean),nums=nonEmpty.map(Number).filter(Number.isFinite);out.push('',(name||'Columna '+(i+1))+':','  Valores no vacíos: '+nonEmpty.length,'  Vacíos: '+(body.length-nonEmpty.length));if(nums.length){const sum=nums.reduce((a,b)=>a+b,0),sorted=[...nums].sort((a,b)=>a-b);out.push('  Numéricos: '+nums.length,'  Mínimo: '+Math.min(...nums),'  Máximo: '+Math.max(...nums),'  Promedio: '+(sum/nums.length).toFixed(3),'  Mediana: '+(sorted.length%2?sorted[(sorted.length-1)/2]:((sorted[sorted.length/2-1]+sorted[sorted.length/2])/2)).toFixed(3));}});
  return {text:out.join('\n'),summary:body.length+' filas analizadas · '+headers.length+' columnas.'};
 }
 case 'citation-generator':{
  const author=String(p.author||'').trim(),year=String(p.year||'').trim(),title=String(p.title||'').trim(),source=String(p.source||'').trim(),url=String(p.url||'').trim(),doi=String(p.doi||'').trim();
  if(!author||!title||!year)throw Error('Autor, título y año son campos necesarios.');
  const authorMark=author.endsWith('.')?author:author+'.';
  const apa=authorMark+' ('+year+'). '+title+'.'+(source?' '+source+'.':'')+(doi?' https://doi.org/'+doi.replace(/^https?:\/\/doi\.org\//,''):url?' '+url:'');
  const vancouver=authorMark+' '+title+'. '+source+(source?'; ':'')+year+'.'+(doi?' doi:'+doi:url?' Disponible en: '+url:'');
  const mla=authorMark+' “'+title+'.” '+source+(source?', ':'')+year+'.'+(url?' '+url:'');
  const selected=p.style==='vancouver'?vancouver:p.style==='mla'?mla:apa;
  return {text:selected+'\n\nAPA 7\n'+apa+'\n\nVancouver\n'+vancouver+'\n\nMLA 9\n'+mla,summary:'Referencia generada con los datos proporcionados. Verifica los detalles contra la fuente original.'};
  return {text:selected+'\n\nAPA 7\n'+apa+'\n\nVancouver\n'+vancouver+'\n\nMLA 9\n'+mla,summary:'Referencia generada con los datos proporcionados. Verifica los detalles contra la fuente original.'};
 }
 case 'flashcards-export':{
  const lines=text.split(/\\r?\n/).map(x=>x.trim()).filter(Boolean),cards=[];
  for(const line of lines){const parts=line.split(/\s*(?:\||\t|::)\s*/);if(parts.length<2)continue;const front=parts.shift().trim(),back=parts.join(' — ').trim();if(front&&back)cards.push([front,back]);}
  if(!cards.length)throw Error('Escribe una tarjeta por línea y separa concepto y definición con |, tabulación o ::.');
  const csv=['Front,Back',...cards.map(row=>row.map(csvCell).join(','))].join('\n');
  return {...download(new Blob([csv],{type:'text/csv;charset=utf-8'}),'prisma-tarjetas-anki.csv'),text:csv,summary:cards.length+' tarjetas listas para importar en Anki.'};
 }

 case 'text-summary-local':{
  const source=text.trim();if(!source)throw Error('Pega el texto que quieres resumir.');
  const sentences=source.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[source];
  const words=source.toLocaleLowerCase('es').match(/[\\p{L}\\p{N}]{3,}/gu)||[];
  const stop=new Set('para como desde hasta donde cuando porque sobre entre esta este estas estos pero sin con del las los una uno unos unas que por sus son fue han hay muy más menos también'.split(' '));
  const freq=new Map();words.forEach(w=>{if(!stop.has(w))freq.set(w,(freq.get(w)||0)+1);});
  const scored=sentences.map((sentence,index)=>({sentence,index,score:(sentence.toLocaleLowerCase('es').match(/[\\p{L}\\p{N}]{3,}/gu)||[]).reduce((n,w)=>n+(freq.get(w)||0),0)}));
  const count=Math.max(1,Math.min(12,Number(p.sentences)||Math.ceil(sentences.length*.3)));
  const chosen=scored.sort((a,b)=>b.score-a.score).slice(0,count).sort((a,b)=>a.index-b.index);
  return {text:chosen.map(x=>x.sentence.trim()).join(' '),summary:'Resumen extractivo local: '+chosen.length+' de '+sentences.length+' frases. No es una interpretación generativa.'};
 }
 case 'reading-time-local':{const words=text.trim()?text.trim().split(/\\s+/u).length:0;const wpm=Math.max(80,Math.min(400,Number(p.wpm)||220));const seconds=Math.ceil(words/wpm*60);return {text:'Palabras: '+words+'\nVelocidad: '+wpm+' palabras/min\nTiempo estimado: '+(seconds<60?seconds+' segundos':Math.floor(seconds/60)+' min '+seconds%60+' s'),summary:'Estimación calculada localmente.'};}
 case 'text-analyzer-local':{const words=text.toLocaleLowerCase('es').match(/[\\p{L}\\p{N}]{2,}/gu)||[],freq=new Map();words.forEach(w=>freq.set(w,(freq.get(w)||0)+1));const top=[...freq].sort((a,b)=>b[1]-a[1]).slice(0,12);const sentences=text.split(/[.!?]+/).filter(x=>x.trim()).length;return {text:'Palabras: '+words.length+'\nPalabras únicas: '+freq.size+'\nFrases: '+sentences+'\nDiversidad léxica: '+(words.length?(freq.size/words.length*100).toFixed(1):0)+'%\nTérminos frecuentes:\n'+top.map(([w,n])=>w+' ('+n+')').join('\n'),summary:'Análisis estadístico local del texto.'};}
 case 'csv-to-tsv-local':{const rows=parseCsv(text,p.delimiter||',');return {text:rows.map(row=>row.map(v=>String(v).replace(/\\t/g,' ')).join('\\t')).join('\n'),summary:rows.length+' filas convertidas a TSV.'};}
 case 'tsv-to-csv-local':{const rows=text.replace(/\\r/g,'').split('\n').filter(Boolean).map(line=>line.split('\\t'));return {text:rows.map(row=>row.map(csvCell).join(',')).join('\n'),summary:rows.length+' filas convertidas a CSV.'};}
 case 'json-to-xml-local':{let data;try{data=JSON.parse(text)}catch(e){throw Error('JSON inválido: '+e.message)}const esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');const tag=k=>String(k).replace(/[^\\w.-]/g,'_').replace(/^[^A-Za-z_]/,'_');const node=(key,value)=>Array.isArray(value)?value.map(v=>node(key,v)).join(''):value&&typeof value==='object'?'<'+tag(key)+'>'+Object.entries(value).map(([k,v])=>node(k,v)).join('')+'</'+tag(key)+'>':'<'+tag(key)+'>'+esc(value??'')+'</'+tag(key)+'>';return {text:'<?xml version="1.0" encoding="UTF-8"?>\n<root>'+node('item',data)+'</root>',summary:'JSON convertido a XML local.'};}
 case 'xml-to-json-local':{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('XML inválido.');const convert=node=>{const children=[...node.children];if(!children.length)return node.textContent||'';const obj={};children.forEach(child=>{const value=convert(child);if(Object.hasOwn(obj,child.tagName))obj[child.tagName]=[].concat(obj[child.tagName],value);else obj[child.tagName]=value;});return obj;};return {text:JSON.stringify({[doc.documentElement.tagName]:convert(doc.documentElement)},null,2),summary:'XML convertido a JSON local.'};}
 case 'html-to-markdown-local':{const doc=new DOMParser().parseFromString(text,'text/html');const convert=node=>{if(node.nodeType===3)return node.nodeValue||'';if(node.nodeType!==1)return '';const inner=[...node.childNodes].map(convert).join('');switch(node.tagName.toLowerCase()){case 'h1':return '# '+inner+'\n\n';case 'h2':return '## '+inner+'\n\n';case 'h3':return '### '+inner+'\n\n';case 'strong':case 'b':return '**'+inner+'**';case 'em':case 'i':return '*'+inner+'*';case 'a':return '['+inner+']('+node.getAttribute('href')+')';case 'li':return '- '+inner+'\n';case 'br':return '\n';case 'p':case 'div':return inner+'\n\n';default:return inner;}};return {text:convert(doc.body).replace(/\n{3,}/g,'\n\n').trim(),summary:'HTML convertido a Markdown básico sin ejecutar scripts.'};}
 case 'contrast-check-local':{const hex=v=>{const m=String(v||'').match(/^#?([0-9a-f]{6})$/i);if(!m)throw Error('Usa colores HEX de seis dígitos.');return [0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);};const lum=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];const a=lum(hex(p.color1||'#000000')),b=lum(hex(p.color2||'#ffffff')),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return {text:'Contraste: '+ratio.toFixed(2)+':1\nWCAG AA texto normal: '+(ratio>=4.5?'Cumple':'No cumple')+'\nWCAG AA texto grande: '+(ratio>=3?'Cumple':'No cumple')+'\nWCAG AAA texto normal: '+(ratio>=7?'Cumple':'No cumple'),summary:'Relación de contraste calculada según luminancia relativa WCAG.'};}
 case 'text-dedupe-words-local':{const output=text.replace(/\\b([\\p{L}\\p{N}]+)(\\s+)\\1\\b/giu,'$1');return {text:output,summary:'Se eliminaron repeticiones consecutivas idénticas.'};}
 case 'color-palette':{const base=Math.floor(Math.random()*360),angles=p.harmony==='complementary'?[0,180,0,180,0]:p.harmony==='triadic'?[0,120,240,0,120]:[0,30,60,180,210];const colors=angles.map((a,i)=>'hsl('+((base+a)%360)+' 62% '+([55,62,48,68,52][i])+'%)');return {text:colors.join('\n'),summary:'Paleta generada al azar. Copia los valores HSL.'};}
 }
 throw Error('Herramienta de texto no disponible.');
}
async function runQr(p,cb){
 const QRCode=await load(QR);const data=String(p.text||'');if(!data.trim())throw Error('Escribe un texto o enlace.');
 const dataUrl=await QRCode.toDataURL(data,{width:900,margin:2,errorCorrectionLevel:'H',color:{dark:'#111827',light:'#ffffff'}});
 const blob=await (await fetch(dataUrl)).blob();return {...download(blob,'prisma-codigo-qr.png'),previewUrl:dataUrl};
}
async function runDocx(id,files,cb){
 const mammoth=await load(MAMMOTH);const result=await mammoth.convertToHtml({arrayBuffer:await bytes(files[0])});
 if(!result.value.trim())throw Error('No se encontró contenido de texto.');
 const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+fileName(files[0])+'</title><style>body{font:12pt/1.55 Arial,sans-serif;color:#222;max-width:850px;margin:35px auto;padding:0 24px}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px}@page{size:A4;margin:20mm}@media print{body{margin:0;max-width:none;padding:0}}</style></head><body>'+result.value+'</body></html>';
 if(id==='docx-pdf')return {printHtml:html,summary:'Vista de impresión preparada. En la ventana nueva elige “Guardar como PDF”. La conversión conserva el contenido, pero la maquetación puede variar respecto a Word.'};
 return download(new Blob([html],{type:'text/html'}),fileName(files[0])+'.html');
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
  const jpg=String(p.format||'png').toLowerCase()==='jpeg';
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,jpg?'image/jpeg':'image/png',jpg?.9:undefined));
  if(!blob)throw Error('No se pudo exportar la página '+(ids[n]+1)+'.');
  zip.file('pagina-'+String(ids[n]+1).padStart(3,'0')+(jpg?'.jpg':'.png'),await blob.arrayBuffer());
  progress(cb,(n+1)/ids.length*.85,'Exportando página '+(n+1)+' de '+ids.length+'...');
 }
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
 return {...download(blob,'prisma-paginas-'+(p.format==='jpeg'?'jpg':'png')+'.zip'),summary:ids.length+' páginas exportadas como '+(p.format==='jpeg'?'JPG':'PNG')+' en ZIP.'};
}
async function pdfToWord(file,cb){
 const pdfjs=await getPdfJs();
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await bytes(file))}).promise;
 const {Document,Packer,Paragraph,TextRun,PageBreak}=await import('https://esm.sh/docx@9.5.1');
 const children=[];
 let extracted=0;
 for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
  const page=await pdf.getPage(pageNo),content=await page.getTextContent();
  const items=content.items.filter(item=>typeof item.str==='string'&&item.str.trim());
  const lines=[];
  for(const item of items){
   const y=Number(item.transform?.[5]||0),x=Number(item.transform?.[4]||0);
   let line=lines.find(entry=>Math.abs(entry.y-y)<2.5);
   if(!line){line={y,items:[]};lines.push(line);}
   line.items.push({x,text:item.str});
  }
  lines.sort((a,b)=>b.y-a.y);
  for(const line of lines){
   line.items.sort((a,b)=>a.x-b.x);
   const text=line.items.map(item=>item.text).join(' ').replace(/\\s+/g,' ').trim();
   if(text){children.push(new Paragraph({children:[new TextRun({text})],spacing:{after:100}}));extracted++;}
  }
  if(pageNo<pdf.numPages)children.push(new Paragraph({children:[new PageBreak()]}));
  progress(cb,pageNo/pdf.numPages*.82,'Extrayendo texto de página '+pageNo+' de '+pdf.numPages+'...');
 }
 if(!extracted)throw Error('Este PDF no contiene texto seleccionable. Parece un escaneo; hace falta OCR para convertirlo a Word.');
 const doc=new Document({sections:[{properties:{},children}]});
 progress(cb,.9,'Creando documento Word editable...');
 const blob=await Packer.toBlob(doc);
 progress(cb,1,'Documento Word preparado.');
 return {...download(blob,fileName(file)+'.docx'),summary:pdf.numPages+' páginas procesadas · '+extracted+' líneas de texto recuperadas. La conversión conserva el texto y los saltos de página, pero puede requerir ajustes de maquetación en Word.'};
}

async function pdfToText(file,cb){
 const pdfjs=await getPdfJs(),pdf=await pdfjs.getDocument({data:new Uint8Array(await bytes(file))}).promise;
 const parts=[];
 for(let i=1;i<=pdf.numPages;i++){
  const page=await pdf.getPage(i),data=await page.getTextContent();
  parts.push('--- Página '+i+' ---\n'+data.items.map(x=>x.str).join(' '));
  progress(cb,i/pdf.numPages*.9,'Leyendo página '+i+' de '+pdf.numPages+'...');
 }
 const text=parts.join('\n\n');
 return {...download(new Blob([text],{type:'text/plain;charset=utf-8'}),fileName(file)+'-texto.txt'),text,summary:pdf.numPages+' páginas procesadas. Los documentos escaneados necesitan OCR.'};
}
function imageModelFor(provider,quality){
 const profiles={
  pollinations:{fast:'tongyi-mai/z-image-turbo',balanced:'black-forest-labs/flux.1-schnell',high:'black-forest-labs/flux.1.1-pro'},
  huggingface:{fast:'black-forest-labs/FLUX.1-schnell',balanced:'black-forest-labs/FLUX.1-dev',high:'Qwen/Qwen-Image'},
  gemini:{fast:'gemini-3.1-flash-lite-image',balanced:'gemini-nano-banana-2.1',high:'gemini-3-pro-image'}
 };
 return profiles[provider]?.[quality||'balanced']||profiles[provider]?.balanced;
}
async function generateImage(p,cb){
 const prompt=String(p.prompt||'').trim();
 if(prompt.length<8)throw Error('Describe la imagen con un poco más de detalle.');
 const sizes={square:[1024,1024],landscape:[1024,768],portrait:[768,1024],wide:[1344,768]};
 const [width,height]=sizes[p.ratio]||sizes.square;
 const styles={
  photo:'Photorealistic photography, natural detailed lighting, high dynamic range, professional composition. ',
  illustration:'Premium editorial illustration, refined shapes, beautiful color harmony, polished art direction. ',
  cinematic:'Cinematic composition, dramatic lighting, atmospheric depth, film still quality. ',
  '3d':'High-end 3D render, physically based materials, studio lighting, refined details. ',
  anime:'Detailed anime illustration, expressive visual storytelling, clean line art, polished colors. ',
  product:'Premium commercial product photography, clean studio setup, realistic materials, luxury advertising art direction. '
 };
 let fullPrompt=(styles[p.style]||'')+prompt;
 if(String(p.negativePrompt||'').trim())fullPrompt+=' Avoid these elements: '+String(p.negativePrompt).trim();
 let provider=p.provider||'auto';
 const automatic=provider==='auto';
 const canCloudflare=!!(p.centralFeatures?.cloudflareImages||p.centralProviders?.cloudflare);
 const canPollinations=!!p.centralFeatures?.pollinationsImages;
 const canHuggingface=!!p.centralFeatures?.huggingfaceImages;
 const canGemini=!!p.centralFeatures?.geminiImages; // paid, opt-in only
 if(automatic)provider=canCloudflare?'cloudflare':canPollinations?'pollinations':canHuggingface?'huggingface':canGemini?'gemini':p.polliToken?'pollinations':'';
 if(!provider)throw Error('No hay un motor de imágenes habilitado. Revisa las conexiones del Laboratorio IA.');
 const model=p.model||imageModelFor(provider,p.qualityProfile);
 const candidates=[];
 if(automatic){
  if(canCloudflare)candidates.push({provider:'cloudflare',model:'@cf/black-forest-labs/flux-1-schnell'});
  if(canPollinations){
   candidates.push({provider:'pollinations',model:'black-forest-labs/flux.1-schnell'});
   candidates.push({provider:'pollinations',model:'tongyi-mai/z-image-turbo'});
  }
  if(canHuggingface)candidates.push({provider:'huggingface',model:'stabilityai/stable-diffusion-3-medium-diffusers'});
  if(canGemini)candidates.push({provider:'gemini',model:'gemini-3.1-flash-image'});
 }else if(provider==='cloudflare'||provider==='pollinations'&&canPollinations||provider==='huggingface'&&canHuggingface||provider==='gemini'&&canGemini){
  candidates.push({provider,model:p.model||(
   provider==='cloudflare'?'@cf/black-forest-labs/flux-1-schnell':
   provider==='pollinations'?'black-forest-labs/flux.1-schnell':
   provider==='huggingface'?'stabilityai/stable-diffusion-3-medium-diffusers':'gemini-3.1-flash-image'
  )});
 }
 if(candidates.length){
  const errors=[],blocked=new Set();
  let globalLimit=false;
  for(const item of candidates){
   const selected=item.provider,chosenModel=item.model;
   if(blocked.has(selected))continue;
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),60000);
   try{
    progress(cb,.15,'Generando imagen con '+selected+'…');
    const response=await fetch('/api/ai/image',{
     method:'POST',headers:{'Content-Type':'application/json','Accept':'image/jpeg,image/png,image/webp'},
     signal:controller.signal,
     body:JSON.stringify({provider:selected,model:chosenModel,prompt:fullPrompt.slice(0,1800),ratio:p.ratio,seed:p.seed||undefined})
    });
    if(!response.ok){
     const data=await response.json().catch(()=>({}));
     const detail=data.error||'No fue posible generar la imagen ('+response.status+').';
     if(data.code==='PROVIDER_LIMIT')blocked.add(selected);
     if(data.code==='GLOBAL_LIMIT'){globalLimit=true;throw Error(detail);}
     throw Error(detail);
    }
    const blob=await response.blob();
    if(!blob.type.startsWith('image/'))throw Error('El motor no devolvió una imagen válida.');
    progress(cb,1,'Imagen generada.');
    return {...download(blob,'prisma-imagen-'+Date.now()+'.'+(blob.type.includes('jpeg')?'jpg':blob.type.includes('webp')?'webp':'png')),
     previewUrl:URL.createObjectURL(blob),provider:selected,model:chosenModel,
     summary:'Imagen generada con '+({cloudflare:'Cloudflare FLUX',pollinations:'Pollinations',huggingface:'Hugging Face',gemini:'Gemini Image'}[selected]||selected)+(errors.length?' · se utilizó respaldo automático.':'.')};
   }catch(error){
    errors.push(selected+': '+(error?.name==='AbortError'?'se agotó el tiempo de espera':error?.message||'error'));
    if(globalLimit)break;
   }finally{clearTimeout(timeout);}
  }
  if(!automatic||globalLimit||!p.polliToken)
   throw Error('No fue posible generar la imagen. '+errors.join(' | '));
  provider='pollinations';
 }
 if(provider==='huggingface'&&!canHuggingface)
  throw Error('Hugging Face para imágenes aún no está habilitado. No se usarán créditos sin autorización.');
 if(provider==='gemini'&&!p.geminiKey)
  throw Error('La generación de imágenes con Gemini aún no está habilitada en el backend central. Usa Cloudflare FLUX.');
 if(provider==='pollinations'){
  const token=String(p.polliToken||'').trim();
  if(!token)throw Error('Conecta tu cuenta de Pollinations desde el Laboratorio IA.');
  progress(cb,.16,'Conectando con Pollinations...');
  const url=new URL('https://gen.pollinations.ai/image/'+encodeURIComponent(fullPrompt));
  url.searchParams.set('model',model);url.searchParams.set('width',String(width));url.searchParams.set('height',String(height));
  if(String(p.seed||'').trim()&&Number.isFinite(Number(p.seed)))url.searchParams.set('seed',String(Number(p.seed)));
  progress(cb,.3,'Creando tu imagen...');
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
  if(!response.ok){let detail='';try{detail=await response.text();}catch{}throw Error('Pollinations respondió '+response.status+'. '+detail.slice(0,200));}
  const blob=await response.blob();
  if(!blob.type.startsWith('image/'))throw Error('El proveedor no devolvió una imagen. Revisa el saldo autorizado.');
  progress(cb,1,'Imagen generada.');
  return {...download(blob,'prisma-imagen-'+Date.now()+'.'+(blob.type.includes('png')?'png':'jpg')),previewUrl:URL.createObjectURL(blob),provider:'pollinations',model,summary:'Imagen creada con Pollinations · '+width+' × '+height+' px.'};
 }
 if(provider==='gemini'){
  const token=String(p.geminiKey||'').trim();
  if(!token)throw Error('Conecta Google Gemini desde el Laboratorio IA.');
  progress(cb,.18,'Conectando con Google Gemini...');
  const aspectRatio={square:'1:1',landscape:'4:3',portrait:'3:4',wide:'16:9'}[p.ratio]||'1:1';
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
   method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':token},
   body:JSON.stringify({contents:[{role:'user',parts:[{text:fullPrompt}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],responseFormat:{image:{aspectRatio,imageSize:p.qualityProfile==='high'?'2K':'1K'}}}})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error?.message||'Google Gemini respondió '+response.status+'.');
  const parts=data.candidates?.[0]?.content?.parts||[];
  const imagePart=parts.find(part=>part.inlineData?.data||part.inline_data?.data);
  if(!imagePart)throw Error('Gemini no devolvió una imagen. Comprueba que el modelo y tu proyecto admitan generación de imágenes.');
  const inline=imagePart.inlineData||imagePart.inline_data;
  const binary=atob(inline.data),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const mime=inline.mimeType||inline.mime_type||'image/png',blob=new Blob([bytes],{type:mime});
  progress(cb,1,'Imagen generada.');
  return {...download(blob,'prisma-imagen-'+Date.now()+'.'+(mime.includes('jpeg')?'jpg':'png')),previewUrl:URL.createObjectURL(blob),provider:'gemini',model,summary:'Imagen creada con Google Gemini · '+width+' × '+height+' px.'};
 }
 if(provider==='huggingface'){
  const token=String(p.hfToken||'').trim();
  if(!token.startsWith('hf_'))throw Error('Conecta Hugging Face desde el Laboratorio IA.');
  progress(cb,.12,'Conectando con Hugging Face...');
  const {InferenceClient}=await import(HF_INFERENCE);
  const client=new InferenceClient(token);
  const parameters={width,height,num_inference_steps:p.qualityProfile==='high'?28:p.qualityProfile==='fast'?4:12};
  if(String(p.seed||'').trim()&&Number.isFinite(Number(p.seed)))parameters.seed=Number(p.seed);
  progress(cb,.24,'Creando tu imagen...');
  const image=await client.textToImage({provider:'auto',model,inputs:fullPrompt,parameters});
  const blob=image instanceof Blob?image:new Blob([image],{type:'image/png'});
  if(!blob.type.startsWith('image/'))throw Error('Hugging Face no devolvió una imagen.');
  progress(cb,1,'Imagen generada.');
  return {...download(blob,'prisma-imagen-'+Date.now()+'.png'),previewUrl:URL.createObjectURL(blob),provider:'huggingface',model,summary:'Imagen creada con Hugging Face · '+width+' × '+height+' px.'};
 }
 throw Error('El motor de imagen seleccionado todavía no está disponible.');
}
function classifyTextTask(prompt,tier='balanced'){
 const q=String(prompt||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(cancion|letra|componer|composicion|verso|coro|tema musical|musica original|song|lyrics|compose|chorus|verse)\b/.test(q))return 'songwriting';
 if(/\b(codigo|programacion|javascript|python|sql|api|debug|depurar|software)\b/.test(q))return 'coding';
 if(/\b(resumen|resume|resumir|sintetiza|extrae las ideas|puntos clave)\b/.test(q))return 'summary';
 if(/\b(idea|creativo|creativa|guion|historia|poema|eslogan|campana|contenido original)\b/.test(q))return 'creative';
 if(tier==='smart'||/\b(razona|compara|evalua|analiza|investiga|argumenta|estrategia|planifica)\b/.test(q))return 'reasoning';
 if(tier==='fast')return 'quick';
 return 'general';
}
function isGenericModelRefusal(text){
 return /^(?:lo siento[, ]*(?:pero )?no puedo (?:ayudar con eso|cumplir esa solicitud|crear|generar|escribir|componer)|no puedo ayudarte con eso|no puedo ayudar con eso|no puedo cumplir esa solicitud|no puedo generar ese contenido)[.!\s]*/i.test(String(text||'').trim());
}
function isRestrictedSongRequest(prompt){
 const q=String(prompt||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return /\b(letra exacta|letra completa de|continua(?:r)? la letra|sigue la letra|copia(?:r)? la letra|en el estilo de|al estilo de|imita(?:r)? a|exactamente como canta|como la cancion de|igual que canta)\b/.test(q);
}
// Abort slow inference calls; one stalled upstream must not freeze Prisma Core.
async function fetchJsonWithDeadline(url,options,deadlineMs){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),deadlineMs);
 try{
  const response=await fetch(url,{...options,signal:controller.signal});
  const data=await response.json().catch(()=>({}));
  return {response,data};
 }finally{clearTimeout(timeout);}
}
// The best model depends on the task and recent reliability, not one fixed default.
// Only provider names, aggregate latency and temporary error codes are stored; never prompts.
const ROUTE_MEMORY_KEY='prisma-core-provider-route-v2';
function getRouteMemory(){
 try{
  const saved=JSON.parse(sessionStorage.getItem(ROUTE_MEMORY_KEY)||'{}');
  return saved&&typeof saved==='object'?saved:{};
 }catch{return {};}
}
function reportModelAttempt(provider,task,success,elapsed,error){
 try{
  const all=getRouteMemory(),key=provider+':'+task;
  const previous=all[key]||{},stamp=Date.now();
  const status=Number(error?.status)||0;
  const delay=success?0:status===401||status===403?15*60000:status===402?10*60000:
   status===429?90000:error?.name==='AbortError'?120000:60000;
  all[key]={
   at:stamp,
   successes:success?Math.min(12,(previous.successes||0)+1):0,
   failures:success?0:Math.min(4,(previous.failures||0)+1),
   averageMs:Math.round(success?(previous.averageMs?previous.averageMs*.65+elapsed*.35:elapsed):(previous.averageMs||elapsed)),
   coolingUntil:success?0:stamp+delay
  };
  // Expire stale health observations to avoid keeping old failures indefinitely.
  for(const [name,entry] of Object.entries(all))if(stamp-Number(entry.at||0)>86400000)delete all[name];
  sessionStorage.setItem(ROUTE_MEMORY_KEY,JSON.stringify(all));
 }catch{}
}
function orderModelsForTask(preferred,task,baseOrder,available){
 const providers=[...new Set(preferred==='auto'?baseOrder:[preferred,...baseOrder.filter(name=>name!==preferred)])]
   .filter(name=>available(name));
 if(preferred!=='auto')return providers;
 const now=Date.now(),memory=getRouteMemory();
 // Preserve the task-specific default; cooldown a failing provider but do not
 // keep one recent successful backend at the top for every kind of task.
 return providers.map((name,index)=>{
  const health=memory[name+':'+task]||{};
  const recent=now-Number(health.at||0)<15*60000;
  const cooled=recent&&Number(health.coolingUntil||0)>now;
  return {name,score:index*1.0+(cooled?10:0)+(recent?Math.min(3,Number(health.failures||0))*1.8:0)
   +(recent&&Number(health.averageMs||0)>20000?.7:0)};
 }).sort((a,b)=>a.score-b.score).map(x=>x.name);
}
async function generateText(p,cb){
 const prompt=String(p.prompt||'').trim();
 if(prompt.length<2)throw Error('Escribe una instrucción para el asistente.');
 const tones={professional:'Responde con tono profesional y claro.',friendly:'Responde con tono cercano, natural y amable.',creative:'Usa un enfoque creativo, original y expresivo.',academic:'Utiliza un tono académico, preciso y bien estructurado.',concise:'Sé directo y conciso, sin explicaciones innecesarias.'};
 const tier=p.reasoning||'balanced';
 const task=p.task||classifyTextTask(prompt,tier);
 const songInstruction=task==='songwriting'
  ? 'La tarea es composición musical original. Si el usuario pide una canción, crea una letra completa, cantable y coherente con título, versos, pre-coro, coro, puente y cierre; añade una breve dirección musical y un prompt de producción. No respondas con una negativa genérica ante una petición creativa segura. No copies letras existentes ni imites exactamente a un artista. Si solicita un archivo de audio, aclara que este motor entrega texto y no ha renderizado música.'
  : 'Ayuda a resolver la petición con precisión. Si el usuario solicita una acción que requiere una herramienta, no afirmes que la ejecutaste si no se ejecutó.';
 const system=[
   'Eres Prisma Core, el asistente de Prisma Space, una plataforma multimodelo.',
   'Nunca afirmes que Prisma Core es GPT-4, GPT-6, ChatGPT, OpenAI, Gemini o Google. Eres el asistente de Prisma Space.',
   'No inventes qué motor concreto respondió: la aplicación muestra esa información de forma independiente.',
   'Mantén el hilo real de los mensajes, especialmente ante preguntas cortas como «eso», «aquí» y «¿y ahora?».',
   'Responde en español, salvo petición contraria. Evita repetir saludos cuando la conversación continúa.',
   tones[p.tone]||tones.professional,songInstruction,
   typeof p.context==='string'?p.context.slice(0,2000):''
  ].filter(Boolean).join(' ');
 const user=prompt;
  const history=Array.isArray(p.contextMessages)?p.contextMessages.slice(-14).filter(m=>m&&['user','assistant'].includes(m.role)&&String(m.content||'').trim())
   .map(m=>({role:m.role,content:String(m.content).slice(0,1700)})):[];
  while(history.length&&history[0].role!=='user')history.shift();
  const conversationMessages=[{role:'system',content:system},...history,{role:'user',content:user}];
 const lengths={short:500,medium:1600,long:tier==='smart'?3200:2400};
 const outputTokens=task==='songwriting'?Math.max(lengths[p.length]||2400,3000):(lengths[p.length]||1200);
 const modelProfiles={
  pollinations:{fast:'openai/gpt-5.4-nano',balanced:'openai/gpt-5.4-nano',smart:'openai/gpt-5.4-nano'},
  huggingface:{fast:'openai/gpt-oss-20b:cheapest',balanced:'openai/gpt-oss-120b:cheapest',smart:'deepseek-ai/DeepSeek-R1:cheapest'},
  groq:{fast:'openai/gpt-oss-20b',balanced:'openai/gpt-oss-20b',smart:'openai/gpt-oss-120b'},
  cloudflare:{fast:'@cf/google/gemma-4-26b-a4b-it',balanced:'@cf/google/gemma-4-26b-a4b-it',smart:'@cf/meta/llama-3.3-70b-instruct-fp8-fast'},
  gemini:{fast:'gemini-3.5-flash-lite',balanced:'gemini-3.5-flash-lite',smart:'gemini-3.8-flash'},
  openrouter:{fast:'openrouter/free',balanced:'openrouter/free',smart:'openrouter/free'}
 };
 const priorities={
  songwriting:['groq','gemini','pollinations','cloudflare','huggingface','openrouter'],
  creative:['groq','pollinations','gemini','cloudflare','huggingface','openrouter'],
  coding:['groq','pollinations','gemini','cloudflare','huggingface','openrouter'],
  reasoning:['gemini','groq','pollinations','cloudflare','huggingface','openrouter'],
  summary:['cloudflare','groq','gemini','pollinations','huggingface','openrouter'],
  quick:['groq','cloudflare','gemini','pollinations','huggingface','openrouter'],
  general:['groq','cloudflare','gemini','pollinations','huggingface','openrouter'],
  planner:['groq','cloudflare','gemini','pollinations','huggingface','openrouter'],
  conversation:['groq','cloudflare','gemini','pollinations','huggingface','openrouter']
 };
 const preferred=p.provider||'auto';
 const baseOrder=priorities[task]||priorities.general;
 const providerNames={pollinations:'Pollinations',huggingface:'Hugging Face',groq:'Groq',gemini:'Google Gemini',cloudflare:'Cloudflare Workers AI',openrouter:'OpenRouter'};
 const errors=[],attempted=[];
 const candidates=orderModelsForTask(preferred,task,baseOrder,provider=>
  provider==='pollinations'
   ? Boolean(p.centralProviders?.pollinations||String(p.polliToken||'').trim())
   : Boolean(p.centralProviders?.[provider])
 ).slice(0,6);
 const startedAt=Date.now();
 const totalDeadline=task==='planner'?38000:task==='songwriting'?62000:52000;
 const individualDeadline=task==='planner'?16000:task==='songwriting'?26000:21000;
 const modelFor=provider=>{
  // Planning needs compact structured output; prefer the faster model, not maximum reasoning tokens.
  const desired=(task==='songwriting'||task==='creative')&&provider==='groq'?'openai/gpt-oss-120b':
   task==='coding'&&provider==='pollinations'?'qwen/qwen3-coder-30b-a3b-instruct':
   task==='planner'&&provider==='groq'?modelProfiles.groq.fast:
   task==='planner'&&provider==='gemini'?modelProfiles.gemini.fast:modelProfiles[provider]?.[tier]||'';
  const catalog=p.centralModelCatalog?.chat?.[provider]||[];
  if(!catalog.length)return desired;
  return catalog.some(item=>item.id===desired)?desired:catalog[0]?.id||desired;
 };
 for(const provider of candidates){
  const remaining=totalDeadline-(Date.now()-startedAt);
  if(remaining<=2500){errors.push('La búsqueda de un motor superó el tiempo total de espera.');break;}
  const requestDeadline=Math.min(individualDeadline,remaining);
  if(!['gemini','huggingface','groq','cloudflare','pollinations','openrouter'].includes(provider))continue;
  if(provider==='pollinations'&&!p.centralProviders?.pollinations&&!String(p.polliToken||'').trim())continue;
  if(provider!=='pollinations'&&!p.centralProviders?.[provider]){
   if(provider===preferred||(preferred==='auto'&&provider===baseOrder[0]))errors.push(providerNames[provider]+' no está disponible en Prisma en este momento.');
   continue;
  }
  attempted.push(provider);
  if(attempted.length>1)progress(cb,.2,'Respaldo automático: '+providerNames[attempted[0]]+' no respondió; probando '+providerNames[provider]+'…');
  else progress(cb,.18,'Conectando con '+providerNames[provider]+' mediante Prisma…');
  const attemptStart=Date.now();
  try{
   let text='',model='';
   if(provider==='pollinations'&&!p.centralProviders?.pollinations){
    model=p.model||modelProfiles.pollinations[tier];
    const {response,data}=await fetchJsonWithDeadline('https://gen.pollinations.ai/v1/chat/completions',{
     method:'POST',
     headers:{Authorization:'Bearer '+String(p.polliToken).trim(),'Content-Type':'application/json'},
     body:JSON.stringify({model,messages:conversationMessages,temperature:.7,max_tokens:outputTokens,stream:false})
    },requestDeadline);
    if(!response.ok)throw Object.assign(Error(data.error?.message||data.message||'Pollinations respondió '+response.status+'.'),{status:response.status});
    text=data.choices?.[0]?.message?.content||data.output_text||'';
   }else{
    model=provider===preferred&&p.model?p.model:modelFor(provider);
    const {response,data}=await fetchJsonWithDeadline('/api/ai/chat',{
     method:'POST',
     headers:{'Content-Type':'application/json','Accept':'application/json'},
     cache:'no-store',
     body:JSON.stringify({
      provider,
      model,
      messages:conversationMessages,
      temperature:.7,
      maxOutputTokens:outputTokens
     })
    },requestDeadline);
    if(!response.ok)throw Object.assign(Error(data.error||providerNames[provider]+' respondió '+response.status+'.'),{status:response.status,code:data.code||'',retryAfter:data.retryAfter||null});
    text=String(data.text||'').trim();model=data.model||model;
   }
   if(!text)throw Error(providerNames[provider]+' no devolvió texto.');
   if(task==='songwriting'&&!isRestrictedSongRequest(prompt)&&isGenericModelRefusal(text)){
    throw Error('El modelo devolvió una negativa genérica ante una solicitud creativa original.');
   }
   progress(cb,1,'Respuesta lista.');
   reportModelAttempt(provider,task,true,Date.now()-attemptStart);
   const firstAttempt=attempted[0];
   const firstPreferred=preferred==='auto'?baseOrder[0]:preferred;
   const fallbackFrom=firstPreferred!==provider?firstPreferred:(firstAttempt&&firstAttempt!==provider?firstAttempt:null);
   const summary='Respuesta generada con '+providerNames[provider]+' · modelo '+(model||'predeterminado')+(fallbackFrom?' · respaldo automático tras fallo de '+providerNames[fallbackFrom]:'.');
   return {text,provider,model:model||'predeterminado',fallbackFrom,
    fallbackReason:fallbackFrom?errors[0]||'El motor preferido no estuvo disponible.':'',summary};
  }catch(error){
   reportModelAttempt(provider,task,false,Date.now()-attemptStart,error);
   const code=error?.status?' HTTP '+error.status:'';
   const detail=error?.name==='AbortError'?'superó el tiempo de espera ('+Math.round(requestDeadline/1000)+' s)':(error?.message||'fallo de conexión');
   errors.push(providerNames[provider]+code+': '+detail);
   // A shared IP quota applies to every provider; retrying another provider will not help.
   if(error?.code==='GLOBAL_LIMIT'||error?.status===429&&/Prisma alcanzó su límite temporal gratuito global/i.test(String(error?.message||''))){
    throw Object.assign(new Error('La cuota gratuita compartida de Prisma está agotada temporalmente.'),{code:'GLOBAL_LIMIT',status:429,retryAfter:error?.retryAfter||null});
   }
   if(attempted.length<candidates.length)progress(cb,.22,'No se pudo utilizar '+providerNames[provider]+'. Buscando un motor alternativo…');
  }
 }
 if(errors.length)throw Error('Los motores disponibles no pudieron responder: '+errors.slice(0,3).join(' | '));
 throw Error('No hay un motor de texto disponible para esta tarea. Revisa las conexiones del Laboratorio IA.');
}
async function generateSpeech(p,cb){
 const input=String(p.prompt||p.text||'').trim();
 if(input.length<2)throw Error('Escribe el texto que deseas convertir en voz.');
 if(input.length>1500)throw Error('Este generador admite hasta 1.500 caracteres por operación. Divide el texto largo en fragmentos.');
 const model=String(p.model||'openai/tts-1');
 const voice=String(p.voice||'nova');
 const format=String(p.format||'mp3');
 const requested=String(p.provider||'auto');
 const token=String(p.polliToken||'').trim();
 const tryCentral=requested!=='personal';
 const errors=[];
 const check=async(response,where)=>{
  if(!response.ok){
   let detail='';
   try{const data=await response.json();detail=String(data.error?.message||data.error||data.message||'').slice(0,220);}catch{}
   const error=Object.assign(new Error(detail||where+' no pudo generar voz ('+response.status+').'),{status:response.status});
   throw error;
  }
  const blob=await response.blob();
  if(!blob.size||!blob.type.startsWith('audio/'))throw Error(where+' no devolvió un archivo de audio válido.');
  progress(cb,1,'Audio listo para escuchar y descargar.');
  const extension=format==='opus'?'opus':format==='wav'?'wav':'mp3';
  return {...download(blob,'prisma-voz.'+extension),previewUrl:URL.createObjectURL(blob),audio:true,
   provider:where,model,summary:'Voz '+voice+' · '+where+' · '+model+'. Archivo descargable; sujeto al presupuesto y la cuota configurados.'};
 };
 if(tryCentral){
  progress(cb,.13,'Preparando voz con el motor central de Prisma…');
  try{
   const response=await fetch('/api/ai/speech',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({input,model,voice,format}),signal:AbortSignal.timeout(48000)
   });
   return await check(response,'Pollinations central');
  }catch(error){errors.push('Motor central: '+(error?.message||'sin respuesta'));}
 }
 if(token){
  progress(cb,.46,'Probando tu conexión personal autorizada de Pollinations…');
  try{
   const response=await fetch('https://gen.pollinations.ai/v1/audio/speech',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({model,input,voice,response_format:format}),signal:AbortSignal.timeout(48000)
   });
   return await check(response,'Pollinations personal');
  }catch(error){errors.push('Cuenta personal: '+(error?.message||'sin respuesta'));}
 }else if(requested==='personal'){
  throw Error('No hay una cuenta personal de Pollinations conectada. Puedes usar el motor central automático si está disponible.');
 }
 throw Error('No se pudo generar el archivo de audio. '+errors.join(' · ')+(token?'':' Puedes conectar una cuenta de Pollinations con permiso para audio. No se activa ningún pago automático.'));
}
async function transcribeAudio(files,p,cb){
 if(!files[0])throw Error('Selecciona un archivo de audio.');
 const selected=p.provider||'auto';
 const hasGroqAudio=p.centralFeatures?.groqAudio===true||(p.centralFeatures?.groqAudio!==false&&!!p.centralProviders?.groq);
 const hasHfAudio=!!p.centralFeatures?.huggingfaceAudio;
 const personalToken=String(p.polliToken||'').trim();
 let order;
 if(selected==='auto'){
  order=[...(hasGroqAudio?['groq']:[]),...(hasHfAudio?['huggingface']:[]),...(personalToken?['pollinations']:[])];
 }else if(selected==='pollinations'){
  order=['pollinations',...(hasGroqAudio?['groq']:[]),...(hasHfAudio?['huggingface']:[])];
 }else{
  order=[selected,...(selected!=='groq'&&hasGroqAudio?['groq']:[]),...(selected!=='huggingface'&&hasHfAudio?['huggingface']:[]),...(personalToken?['pollinations']:[])];
 }
 const errors=[];
 for(const provider of [...new Set(order)]){
  try{
   if(provider==='groq'||provider==='huggingface'){
    if(provider==='huggingface'&&!hasHfAudio)throw Error('Hugging Face Audio está desactivado para proteger los créditos.');
    if(provider==='groq'&&p.centralFeatures?.groqAudio===false)throw Error('Groq Whisper está temporalmente en pausa.');
    const form=new FormData();
    form.append('file',files[0]);
    form.append('provider',provider);
    form.append('model',provider==='groq'?'whisper-large-v3-turbo':'openai/whisper-large-v3');
    if(p.language&&p.language!=='auto')form.append('language',p.language);
    progress(cb,.2,'Transcribiendo con '+provider+' mediante el backend protegido de Prisma…');
    const response=await fetch('/api/ai/transcribe',{method:'POST',body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(Error(data.error||'La transcripción no está disponible ('+response.status+').'),{status:response.status});
    progress(cb,1,'Transcripción lista.');
    return {text:data.text,summary:'Archivo: '+files[0].name+' · motor '+provider+' · '+data.model};
   }
   if(provider==='pollinations'){
    if(!personalToken)continue;
    const form=new FormData();form.append('file',files[0]);form.append('model',p.model||'openai/whisper-1');
    if(p.language&&p.language!=='auto')form.append('language',p.language);
    progress(cb,.2,'Groq no está disponible. Probando Pollinations como respaldo…');
    const response=await fetch('https://gen.pollinations.ai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+personalToken},body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(Error(data.error?.message||data.message||'Pollinations respondió '+response.status+'.'),{status:response.status});
    if(!data.text)throw Error('Pollinations no devolvió una transcripción.');
    progress(cb,1,'Transcripción lista.');
    return {text:data.text,summary:'Archivo: '+files[0].name+' · respaldo automático con Pollinations · '+(p.model||'openai/whisper-1')};
   }
  }catch(error){
   errors.push(provider+(error?.status?' HTTP '+error.status:'')+': '+(error?.message||'fallo de conexión'));
  }
 }
 if(errors.length)throw Error('No se pudo transcribir el audio con los motores disponibles. '+errors.join(' | '));
 throw Error('No hay un motor de transcripción activo. Conecta Groq o autoriza un proveedor compatible desde el Laboratorio IA.');
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
async function convertTextFile(files,p,cb){
 const file=files?.[0];if(!file)throw Error('Adjunta un documento de texto o Word.');
 const ext=String(file.name||'').split('.').pop().toLowerCase();
 let text='';
 if(ext==='docx'){
  const mammoth=await load(MAMMOTH);
  const res=await mammoth.extractRawText({arrayBuffer:await bytes(file)});
  text=String(res.value||'');
 }else if(['html','htm'].includes(ext)){
  const html=await file.text();text=new DOMParser().parseFromString(html,'text/html').body.textContent||'';
 }else if(['txt','md','markdown'].includes(ext)||file.type.startsWith('text/'))text=await file.text();
 else throw Error('Este conversor solo admite TXT, Markdown, HTML o DOCX.');
 if(!text.trim())throw Error('El documento no contiene texto legible.');
 if(text.length>1000000)throw Error('El límite para esta conversión es un millón de caracteres.');
 const output=String(p.output||'pdf').toLowerCase();
 const base=file.name.replace(/\.[^.]+$/,'').slice(0,75)||'prisma-documento';
 progress(cb,.25,'Preparando el contenido del documento…');
 if(output==='txt'){
  const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
  return {...download(blob,base+'.txt'),text:text.slice(0,12000),summary:'Texto exportado a TXT. Las imágenes y el formato complejo no se conservan.'};
 }
 if(output==='html'){
  const escape=value=>String(value).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+escape(base)+'</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:850px;margin:45px auto;padding:0 20px;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>'+escape(text)+'</body></html>';
  return {...download(new Blob([html],{type:'text/html;charset=utf-8'}),base+'.html'),summary:'HTML descargable con texto legible. No se ejecuta el código del archivo original.'};
 }
 if(output==='docx'){
  const {Document,Packer,Paragraph,TextRun}=await load('https://esm.sh/docx@9.5.1');
  const paragraphs=text.split(/\r?\n/).slice(0,12000).map(line=>new Paragraph({children:[new TextRun(line||' ')]}));
  const document=new Document({sections:[{properties:{},children:paragraphs}]});
  const blob=await Packer.toBlob(document);
  return {...download(blob,base+'.docx'),summary:'Word editable generado con párrafos de texto. Los estilos del original pueden cambiar.'};
 }
 if(output==='pdf'){
  const {PDFDocument,StandardFonts,rgb}=await load(PDF_LIB);
  const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica);
  const width=595.28,height=841.89,margin=48,size=11,lineHeight=16,limit=width-margin*2;
  const safe=text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
   .replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"')
   .replace(/[^\u000A\u000D\u0020-\u00FF]/g,'?');
  let page=document.addPage([width,height]),y=height-margin,lineCount=0;
  const newLine=()=>{y-=lineHeight;if(y<margin){page=document.addPage([width,height]);y=height-margin;}};
  const draw=line=>{page.drawText(line||' ',{x:margin,y,size,font,color:rgb(.1,.13,.19)});newLine();lineCount++;};
  for(const original of safe.split(/\r?\n/)){
   let line='';
   for(const word of original.split(/\s+/)){
    const candidate=line?line+' '+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=limit){line=candidate;continue;}
    if(line){draw(line);line='';}
    let chunk='';
    for(const ch of word){
     if(font.widthOfTextAtSize(chunk+ch,size)>limit){draw(chunk);chunk='';}
     chunk+=ch;
    }
    line=chunk;
   }
   draw(line);
   if(lineCount>75000)throw Error('El archivo de texto es demasiado largo para exportarlo en este navegador.');
  }
  const blob=makeBlob(await document.save(),'application/pdf');
  progress(cb,1,'PDF generado.');
  return {...download(blob,base+'.pdf'),summary:document.getPageCount()+' página(s) de texto exportadas a PDF. Formato básico sin ilustraciones ni diseño complejo.'};
 }
 throw Error('Formato de salida no compatible. Usa PDF, DOCX, TXT o HTML.');
}
async function convertTabularFile(files,p,cb){
 const source=files?.[0];
 if(!source)throw Error('Selecciona un archivo CSV, JSON, XLS o XLSX.');
 const ext=String(source.name||'').split('.').pop().toLowerCase();
 const kind=ext==='csv'?'csv':ext==='json'?'json':['xlsx','xls'].includes(ext)?'excel':'';
 if(!kind)throw Error('Formato de origen incompatible. Usa un CSV, JSON o Excel (XLS/XLSX).');
 const requested=String(p.output||'auto').toLowerCase();
 const dest=requested==='auto'?kind==='excel'?'csv':kind==='csv'?'json':'csv':requested;
 if(!['csv','json','xlsx'].includes(dest))throw Error('El formato solicitado no está disponible. Selecciona CSV, JSON o XLSX.');
 if((kind==='excel'&&dest==='xlsx')||(kind===dest))throw Error('El archivo ya tiene ese formato. Elige un formato de destino diferente.');
 progress(cb,.08,'Leyendo los datos sin enviarlos a un servidor…');
 const stem=source.name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9áéíóúñ._-]/gi,'-').slice(0,75)||'prisma-datos';
 if(kind==='excel'){
  const result=await excelToJson(source,{sheet:p.sheet||'0',format:dest},cb);
  if(result?.blob)result.filename=stem+'.'+(dest==='csv'?'csv':'json');
  return {...result,summary:(result.summary||'')+' Conversión local; se conserva la primera hoja salvo que selecciones todas para JSON.'};
 }
 let rows;
 if(kind==='csv'){
  const content=await source.text();
  if(content.length>10000000)throw Error('Para proteger la memoria del dispositivo, el CSV debe tener menos de 10 MB de texto.');
  const header=content.split(/\r?\n/)[0]||'';
  const delimiter=p.delimiter&&p.delimiter!=='auto'?p.delimiter:[',',';','\t'].map(ch=>({ch,c:header.split(ch).length-1})).sort((a,b)=>b.c-a.c)[0].ch;
  const parsed=parseCsv(content.replace(/^\uFEFF/,''),delimiter);
  if(!parsed.length)throw Error('El CSV está vacío.');
  const names=parsed.shift().map((name,i)=>String(name||'Columna '+(i+1)).trim()||'Columna '+(i+1));
  rows=parsed.filter(line=>line.some(cell=>String(cell||'').trim())).map(line=>Object.fromEntries(names.map((name,i)=>[name,String(line[i]??'')])));
 }else{
  let raw;
  try{raw=JSON.parse(await source.text());}catch{throw Error('El archivo JSON no es válido.');}
  if(Array.isArray(raw))rows=raw;
  else if(raw&&typeof raw==='object'&&Object.values(raw).length===1&&Array.isArray(Object.values(raw)[0]))rows=Object.values(raw)[0];
  else throw Error('El JSON debe ser una lista de objetos (o contener una única lista dentro de un objeto).');
  if(rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('Para convertir a CSV o Excel, el JSON debe contener una lista de objetos.');
 }
 if(rows.length>50000)throw Error('El archivo supera el máximo de 50.000 registros.');
 if(dest==='xlsx'){
  if(!rows.length)throw Error('No hay registros para crear un Excel.');
  const result=await jsonToExcel({text:JSON.stringify(rows)});
  progress(cb,1,'Excel generado.');
  return {...result,filename:stem+'.xlsx',summary:rows.length+' filas convertidas a Excel en el navegador.'};
 }
 if(dest==='json'){
  const content=JSON.stringify(rows,null,2);
  progress(cb,1,'JSON generado.');
  return {...download(new Blob([content],{type:'application/json;charset=utf-8'}),stem+'.json'),text:content,summary:rows.length+' registros exportados a JSON.'};
 }
 const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
 const lines=[keys.map(csvCell).join(','),...rows.map(row=>keys.map(key=>csvCell(row[key]??'')).join(','))];
 const content='\uFEFF'+lines.join('\r\n');
 progress(cb,1,'CSV generado.');
 return {...download(new Blob([content],{type:'text/csv;charset=utf-8'}),stem+'.csv'),text:content.slice(1),summary:rows.length+' registros exportados a CSV.'};
}
async function profileCsvLocally(files,p,cb){
 if(!files[0])throw Error('Selecciona un archivo CSV.');
 const raw=await files[0].text();
 if(raw.length>5000000)throw Error('Este analizador admite CSV de hasta 5 MB de texto.');
 const header=(raw.split(/\r?\n/)[0]||'');
 const delimiter=p.delimiter&&p.delimiter!=='auto'?p.delimiter:[',',';','\t'].map(ch=>({ch,count:header.split(ch).length-1})).sort((a,b)=>b.count-a.count)[0].ch;
 const rows=parseCsv(raw,delimiter);
 if(rows.length<2)throw Error('El CSV necesita encabezados y al menos una fila de datos.');
 const labels=rows[0].map((name,i)=>String(name||'Columna '+(i+1)).trim()||'Columna '+(i+1));
 const records=rows.slice(1).filter(row=>row.some(value=>String(value??'').trim()));
 const duplicateCount=records.length-new Set(records.map(row=>JSON.stringify(row))).size;
 const details=labels.map((name,index)=>{
  const cells=records.map(row=>String(row[index]??'').trim()),notEmpty=cells.filter(Boolean);
  const numeric=notEmpty.filter(x=>Number.isFinite(Number(x.replace(',','.')))).length;
  const date=notEmpty.filter(x=>/^\d{4}-\d{2}-\d{2}/.test(x)).length;
  const guess=notEmpty.length&&numeric/notEmpty.length>.95?'Número':notEmpty.length&&date/notEmpty.length>.95?'Fecha':'Texto';
  return {name,empty:cells.length-notEmpty.length,unique:new Set(notEmpty).size,type:guess,examples:notEmpty.slice(0,2)};
 });
 const result={file:files[0].name,records:records.length,columns:labels.length,duplicateRows:duplicateCount,delimiter:delimiter==='\t'?'Tabulación':delimiter,details};
 const text='AUDITORÍA CSV · GRATIS Y LOCAL\n'+JSON.stringify(result,null,2);
 progress(cb,1,'Auditoría lista.');
 return {text,blob:new Blob([text],{type:'text/plain;charset=utf-8'}),filename:'prisma-auditoria-csv.txt',summary:records.length+' registros, '+labels.length+' columnas, '+duplicateCount+' filas duplicadas.'};
}
async function validateJsonSchema(p,cb){
 let data,schema;
 try{data=JSON.parse(String(p.text||''));}catch{throw Error('El JSON de datos no es válido.');}
 try{schema=JSON.parse(String(p.schema||''));}catch{throw Error('El esquema de validación no es un JSON válido.');}
 const {default:Ajv}=await load('https://esm.sh/ajv@8.17.1');
 if(typeof Ajv!=='function')throw Error('No se pudo cargar el validador AJV.');
 const ajv=new Ajv({allErrors:true,strict:false});
 let valid;
 try{valid=ajv.validate(schema,data);}catch(error){throw Error('Error al compilar JSON Schema: '+(error.message||error));}
 const errors=(ajv.errors||[]).map(e=>(e.instancePath||'/')+' · '+(e.message||'Error')+(e.params?': '+JSON.stringify(e.params):''));
 progress(cb,1,'Validación finalizada.');
 return {text:valid?'JSON válido: el documento cumple el esquema.':'El JSON no cumple el esquema.\n'+errors.join('\n'),summary:valid?'Datos válidos según JSON Schema.':errors.length+' errores detectados por AJV.'};
}
let localVisionPromise=null;
async function classifyImageLocally(files,p,cb){
 if(!files[0])throw Error('Selecciona una imagen JPG, PNG o WebP.');
 progress(cb,.06,'Preparando ViT ONNX. La primera ejecución descarga el modelo gratuito al navegador…');
 if(!localVisionPromise)localVisionPromise=(async()=>{
   const {pipeline}=await load('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2');
   return pipeline('image-classification','Xenova/vit-base-patch16-224',{device:'wasm',dtype:'q4'});
 })().catch(e=>{localVisionPromise=null;throw e;});
 const model=await localVisionPromise,url=URL.createObjectURL(files[0]);
 try{
  progress(cb,.72,'Reconociendo categorías visuales localmente…');
  const predictions=await model(url,{top_k:5});
  const rows=Array.isArray(predictions)?predictions:[predictions];
  const report=['CLASIFICACIÓN VISUAL · ViT ONNX','Etiquetas aproximadas en inglés:','',
   ...rows.map((x,i)=>(i+1)+'. '+x.label+' · '+Math.round(Number(x.score||0)*1000)/10+'%')].join('\n');
  progress(cb,1,'Clasificación local completada.');
  return {text:report,summary:'Modelo ONNX en el navegador, sin API. Predicciones aproximadas de ImageNet; no identifica personas.',model:'Xenova/vit-base-patch16-224'};
 }finally{URL.revokeObjectURL(url);}
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

function validatePublicApiUrl(value){
 const url=new URL(String(value||'').trim());
 if(url.protocol!=='https:')throw Error('Por seguridad, utiliza una URL HTTPS pública.');
 if(url.username||url.password)throw Error('No incluyas credenciales dentro de la URL.');
 const host=url.hostname.toLowerCase();
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host==='::1'||host.startsWith('fc')||host.startsWith('fd')||host.startsWith('fe80:'))throw Error('No se permiten direcciones locales o privadas.');
 const ipv4=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if(ipv4){
  const a=Number(ipv4[1]),b=Number(ipv4[2]);
  if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===192&&b===168||a===172&&b>=16&&b<=31||a===100&&b>=64&&b<=127)throw Error('No se permiten direcciones IP privadas o reservadas.');
 }
 for(const key of url.searchParams.keys()){
  if(/^(?:api[_-]?key|key|token|access[_-]?token|secret|password|authorization)$/i.test(key))throw Error('No incluyas claves ni tokens en una API pública. Las credenciales privadas deben conectarse desde un proveedor seguro.');
 }
 return url;
}
async function explorePublicApi(p,cb){
 const url=validatePublicApiUrl(p.url);
 progress(cb,.12,'Consultando el endpoint público...');
 let response,source='Conexión directa';
 try{
  response=await fetch(url.href,{method:'GET',headers:{Accept:'application/json, text/plain, */*'},credentials:'omit',cache:'no-store'});
 }catch(directError){
  progress(cb,.38,'El navegador bloqueó la conexión directa. Probando cors.dev para lectura pública...');
  try{
   response=await fetch('https://proxy.cors.dev/'+url.href,{method:'GET',headers:{Accept:'application/json, text/plain, */*'},credentials:'omit',cache:'no-store'});
   source='cors.dev';
  }catch(proxyError){
   throw Error('No fue posible leer la API. Comprueba que el endpoint sea público y esté disponible. '+(proxyError?.message||''));
  }
 }
 const declared=Number(response.headers.get('content-length')||0);
 if(declared>6*1024*1024)throw Error('La respuesta supera el límite de 6 MiB del explorador público.');
 progress(cb,.7,'Leyendo respuesta...');
 const buffer=await response.arrayBuffer();
 if(buffer.byteLength>6*1024*1024)throw Error('La respuesta supera el límite de 6 MiB del explorador público.');
 const mime=response.headers.get('content-type')||'text/plain;charset=utf-8';
 if(mime.startsWith('image/')){
  const imageBlob=new Blob([buffer],{type:mime});
  progress(cb,1,'Imagen recibida.');
  return {blob:imageBlob,previewUrl:URL.createObjectURL(imageBlob),filename:'prisma-api-imagen.'+(mime.includes('png')?'png':mime.includes('webp')?'webp':'jpg'),summary:'HTTP '+response.status+' · '+source+' · '+mime+' · '+(buffer.byteLength/1024).toFixed(1)+' KB'};
 }
 const raw=new TextDecoder().decode(buffer);
 let text=raw,extension='txt';
 if((p.format||'json')==='json'){
  try{text=JSON.stringify(JSON.parse(raw),null,2);extension='json';}
  catch{text=raw;extension='txt';}
 }
 const blob=new Blob([text],{type:extension==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8'});
 const statusLabel=response.status+' '+(response.statusText||'');
 const summary='HTTP '+statusLabel+' · '+source+' · '+mime+' · '+(buffer.byteLength/1024).toFixed(1)+' KB';
 progress(cb,1,'Respuesta recibida.');
 return {text:text.slice(0,100000),blob,filename:'prisma-api-respuesta.'+extension,summary,source,status:response.status};
}
async function discoverGitHubProjects(p,cb){
 const query=String(p.query||'').trim();
 if(query.length<2)throw Error('Escribe al menos dos caracteres para buscar proyectos.');
 const language=p.language&&p.language!=='any'?' language:'+p.language:'';
 const sort=['stars','updated','forks'].includes(p.sort)?p.sort:'stars';
 const limit=Math.max(5,Math.min(20,Number(p.limit)||10));
 const url='https://api.github.com/search/repositories?q='+encodeURIComponent(query+language)+'&sort='+sort+'&order=desc&per_page='+limit;
 progress(cb,.2,'Buscando proyectos públicos en GitHub...');
 let response;
 try{response=await fetch(url,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},credentials:'omit',cache:'no-store'});}
 catch{throw Error('GitHub no respondió. Comprueba tu conexión e inténtalo de nuevo.');}
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  if(response.status===403||response.status===429)throw Error('GitHub alcanzó el límite de búsquedas públicas para esta conexión. Espera un momento y vuelve a intentarlo.');
  throw Error(data.message||'GitHub respondió '+response.status+'.');
 }
 const items=data.items||[];
 const lines=['PROYECTOS OPEN SOURCE EN GITHUB','Búsqueda: '+query+(language?' · '+p.language:''),'Resultados encontrados: '+(data.total_count||items.length),''];
 items.forEach((repo,index)=>{
  lines.push((index+1)+'. '+repo.full_name);
  if(repo.description)lines.push('   '+repo.description.replace(/\s+/g,' '));
  lines.push('   ★ '+(repo.stargazers_count||0).toLocaleString('es-CO')+' · Forks '+(repo.forks_count||0).toLocaleString('es-CO')+' · '+(repo.language||'Lenguaje no indicado')+' · '+(repo.license?.spdx_id||'Licencia no indicada'));
  lines.push('   '+repo.html_url,'');
 });
 if(!items.length)lines.push('No se encontraron repositorios para esa búsqueda.');
 const text=lines.join('\n'),blob=new Blob([text],{type:'text/plain;charset=utf-8'});
 progress(cb,1,'Búsqueda completada.');
 return {text,blob,filename:'prisma-github-open-source.txt',summary:items.length+' proyectos listados · GitHub API pública · límite no autenticado de GitHub aplicado.'};
}
const SPECIALIZED_TEXT_TOOLS = {
 'ai-youtube-kit':{
  task:'creative',label:'Kit de contenido creado',
  instruction:'Actúa como productor profesional de YouTube y redes sociales. A partir de la idea, entrega 5 títulos atractivos sin clickbait engañoso, una descripción lista para publicar, 7 hashtags relevantes, un guion por secciones, 3 ideas de shorts y un prompt visual para miniatura con texto muy corto. No inventes estadísticas de rendimiento.'
 },
 'ai-prompt-lab':{
  task:'creative',label:'Prompt optimizado',
  instruction:'Transforma la solicitud en un prompt profesional, claro, detallado y reutilizable para el medio indicado (texto, imagen, audio, vídeo o código). Entrega el PROMPT FINAL listo para copiar y una versión BREVE; después explica en máximo tres líneas las mejoras. No afirmes generar archivos.'
 },
 'ai-study-notes':{
  task:'reasoning',label:'Material de estudio preparado',
  instruction:'Actúa como tutor académico. Explica el tema de forma clara, crea un esquema, preguntas tipo examen con respuestas separadas y tarjetas de repaso. Indica incertidumbres. No inventes referencias ni estudios y no sustituyas la orientación del docente.'
 },
 'ai-code-helper':{
  task:'coding',label:'Asistencia de programación preparada',
  instruction:'Actúa como ingeniero de software. Analiza y resuelve la petición, entrega código funcional cuando sea posible, explica cambios esenciales, incluye pruebas o casos límite. No afirmes haber ejecutado el programa ni accedido a repositorios.'
 }
};
async function runSpecializedTextTool(id,p,cb){
 const spec=SPECIALIZED_TEXT_TOOLS[id];
 const user=String(p.prompt||p.text||'').trim();
 if(user.length<4)throw Error('Describe qué necesitas antes de ejecutar esta herramienta.');
 const result=await generateText({...p,prompt:spec.instruction+'\n\nPETICIÓN DEL USUARIO:\n'+user,
  task:spec.task,tone:spec.task==='reasoning'?'academic':'creative',
  length:'long',reasoning:p.reasoning||'balanced'},cb);
 return {...result,summary:spec.label+' · '+(result?.provider||'motor de IA')+'.'};
}

export async function runTool(id,files=[],p={},cb){
 progress(cb,.05,'Iniciando...');
 if(id==='text-file-convert')return convertTextFile(files,p,cb);
 if(id==='table-file-convert')return convertTabularFile(files,p,cb);
 if(id==='csv-profile-local')return profileCsvLocally(files,p,cb);
 if(id==='json-schema-validate')return validateJsonSchema(p,cb);
 if(id==='image-identify-local')return classifyImageLocally(files,p,cb);
 if(id==='pdf-to-image')return pdfToImages(files[0],p,cb);
 if(id==='pdf-to-word')return pdfToWord(files[0],cb);
 if(id==='pdf-text')return pdfToText(files[0],cb);
 if(id.startsWith('pdf-'))return pdfTool(id,files,p,cb);
 if(['image-pdf'].includes(id)){
  const {PDFDocument}=await load(PDF_LIB),doc=await PDFDocument.create();
  for(let i=0;i<files.length;i++){const f=files[i];const img=await createImageBitmap(f);const page=doc.addPage(p.pageSize==='letter'?[612,792]:[595.28,841.89]);const pad=28,scale=Math.min((page.getWidth()-pad*2)/img.width,(page.getHeight()-pad*2)/img.height);const w=img.width*scale,h=img.height*scale;const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);const bytes=await new Promise(r=>canvas.toBlob(async b=>r(await b.arrayBuffer()),'image/jpeg',.92));const emb=await doc.embedJpg(bytes);page.drawImage(emb,{x:(page.getWidth()-w)/2,y:(page.getHeight()-h)/2,width:w,height:h});progress(cb,(i+1)/files.length*.8,'Creando páginas...');}
  return download(makeBlob(await doc.save(),'application/pdf'),'imagenes-a-pdf.pdf');
 }
 if(id==='image-gen'||['image-collage','image-palette','image-flip','image-watermark','image-favicon'].includes(id))return imageAdvanced(id,files,p,cb);
 if(id.startsWith('image-'))return imageTool(id,files,p,cb);
 if(id==='docx-html'||id==='docx-pdf')return runDocx(id,files,cb);
 if(id==='video-thumbnail'||id==='video-gif'||id==='video-mute'||id==='audio-trim')return mediaAdvanced(id,files,p,cb);
 if(id==='qr-scan')return scanQr(files[0]);
 if(id==='hash-file')return hashFile(files[0]);
 if(id==='file-inspector')return inspectFile(files[0]);
 if(id==='json-xlsx')return jsonToExcel(p);
 if(id==='image-social-kit')return socialImageKit(files[0],p,cb);
 if(id==='qr-vcard'){
  const escapeV=v=>String(v||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\n');
  const vcard=['BEGIN:VCARD','VERSION:3.0','FN:'+escapeV(p.name),'TEL;TYPE=CELL:'+escapeV(p.phone),'EMAIL:'+escapeV(p.email),'ORG:'+escapeV(p.organization),'END:VCARD'].join('\n');
  const result=await runQr({text:vcard},cb);result.filename='prisma-contacto-qr.png';result.summary='Código QR vCard generado. Escanéalo con la cámara para guardar el contacto.';return result;
 }
 if(id==='api-explorer')return explorePublicApi(p,cb);
 if(id==='github-discover')return discoverGitHubProjects(p,cb);
 if(id==='excel-json')return excelToJson(files[0],p,cb);
 if(id==='audio-waveform')return audioWaveform(files[0],p,cb);
 if(id==='audio-convert'||id==='audio-normalize')return runVideo(id,files,p,cb);
 if(SPECIALIZED_TEXT_TOOLS[id])return runSpecializedTextTool(id,p,cb);
 if(id==='ai-assistant')return generateText(p,cb);
 if(id==='music-lyrics')return generateText({...p,task:'songwriting',prompt:'Compón una canción completamente original. Entrega título, concepto, género, tempo aproximado, versos, pre-coro, coro, puente y un prompt de producción musical. No copies letras existentes ni imites exactamente a un artista. No afirmes que has generado audio.\n\nIdea del usuario: '+String(p.prompt||p.text||'') ,tone:'creative',reasoning:p.reasoning||'smart',length:'long'},cb);
 if(id==='ai-voice')return generateSpeech(p,cb);
 if(id==='ai-transcribe')return transcribeAudio(files,p,cb);
 if(id==='barcode')return makeBarcode(p);
 if(id.startsWith('video-'))return runVideo(id,files,p,cb);
 if(id==='qr')return runQr(p,cb);
 if(id==='currency')return runCurrency(p,cb);
 return runText(id,p);
}
