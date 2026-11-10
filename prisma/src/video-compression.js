// Native, offline video compression for browsers where FFmpeg WebAssembly
// workers are unavailable (notably iOS standalone Safari). No uploads, no AI.
// MediaRecorder availability and actual output size are checked, never assumed.
const MB=1024*1024;
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

export function isVideoCompressionIntent(message){
 const q=fold(message).replace(/^[¿?¡! ]+/,'');
 if(/^(como|por que|que es|explica|dime como|tutorial|pasos para)\b/.test(q))return false;
 const action=/(?:\b(?:comprime|comprimir|comprimas|comprimeme|comprímeme|comprimelo|comprimirlo|optimiza|optimizar|reduce|reducir|achica|haz mas liviano|hazlo mas ligero|baja|disminuye)\b)/;
 const target=/(?:video|videos|mp4|mov|mkv|webm|grabacion|grabaciones|archivo|peso|tamano|tamaño|megas|mb|este|ese|esto)/;
 return action.test(q)&&target.test(q);
}
export function isVideoFile(file){
 return Boolean(file && (
  /^video\//i.test(String(file.type||'')) ||
  /\.(?:mp4|mov|m4v|webm|mkv)$/i.test(String(file.name||''))
 ));
}
export function preferNativeVideoCompression({userAgent='',standalone=false}={}){
 // Safari/WebKit iOS often refuses FFmpeg's cross-origin blob worker.
 return /(?:iPhone|iPad|iPod)/i.test(userAgent) ||
  standalone&&/Macintosh/i.test(userAgent)&&/Mobile/i.test(userAgent);
}
export function videoCompressionSettings({width,height,fileSize,duration,quality='balanced'}={}){
 const w=Number(width),h=Number(height),sec=Number(duration);
 if(![w,h,sec].every(Number.isFinite)||w<=0||h<=0||sec<=0)
  throw Error('No se pudo leer el tamaño o la duración del video.');
 if(sec>180)throw Error('Para proteger la memoria del móvil, el compresor local admite hasta 3 minutos por ejecución.');
 const presets={small:{dimension:720,fps:20,ratio:.38},
  balanced:{dimension:960,fps:24,ratio:.56},
  quality:{dimension:1280,fps:30,ratio:.73}};
 const preset=presets[quality]||presets.balanced;
 const scale=Math.min(1,preset.dimension/Math.max(w,h));
 const resultWidth=Math.max(2,Math.round(w*scale/2)*2);
 const resultHeight=Math.max(2,Math.round(h*scale/2)*2);
 const originalBitsPerSecond=Number(fileSize)*8/sec;
 const videoBitrate=Math.max(150000,Math.min(3400000,
  Math.round((originalBitsPerSecond*preset.ratio-96000)/10000)*10000));
 return {width:resultWidth,height:resultHeight,
  frameRate:preset.fps,videoBitsPerSecond:videoBitrate,
  audioBitsPerSecond:96000,quality};
}
export function chooseNativeRecordingType(recorder=globalThis.MediaRecorder){
 if(!recorder?.isTypeSupported)return null;
 for(const type of [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4',
  'video/webm;codecs="vp8,opus"',
  'video/webm'
 ])if(recorder.isTypeSupported(type))return type;
 return null;
}
export function localizedVideoError(error){
 const detail=String(error?.message||'');
 const name=String(error?.name||'');
 if(name==='SecurityError'||/the operation is insecure|securityerror|insecure operation/i.test(detail))
  return 'Safari impidió iniciar el motor multimedia por una restricción de seguridad. Prisma no modificó ni subió tu archivo. Se intentará el motor nativo cuando esté disponible; si tampoco funciona, prueba el mismo archivo en un navegador de escritorio.';
 if(name==='NotAllowedError'||/notallowed|user gesture|play\(\) failed|not allowed by the user agent/i.test(detail))
  return 'iOS bloqueó la reproducción necesaria para comprimir el vídeo. Toca Ejecutar desde la herramienta con el vídeo adjunto y mantén abierta la aplicación.';
 if(name==='NotSupportedError'||/not supported|unsupported|no compatible/i.test(detail))
  return 'Este navegador no permite codificar el vídeo con los formatos disponibles. No se generó ningún archivo falso. Prueba en Chrome o Safari de escritorio.';
 if(name==='QuotaExceededError'||/out of memory|memory access|allocation failed|abort\(out of memory/i.test(detail))
  return 'El archivo requiere más memoria de la disponible en este móvil. Prueba un vídeo más corto o utiliza el compresor en un ordenador.';
 return detail||'No se pudo codificar el archivo de vídeo.';
}
// Track cancellation never drops a user's input file. A failed recording does
// not return an empty Blob, MP4 with a WebM signature or larger "compressed" file.
export async function compressVideoNative(file,opts={},cb){
 if(!isVideoFile(file))throw Error('Adjunta un archivo de vídeo válido (MP4, MOV o WebM).');
 if(file.size>100*MB)throw Error('El vídeo supera el límite local de 100 MB.');
 if(typeof document==='undefined'||typeof MediaRecorder==='undefined')
  throw Error('Este navegador no ofrece grabación multimedia local.');
 const mime=chooseNativeRecordingType(MediaRecorder);
 if(!mime)throw Object.assign(Error('Formato de vídeo no compatible.'),{name:'NotSupportedError'});
 if(typeof HTMLCanvasElement==='undefined'||!HTMLCanvasElement.prototype.captureStream)
  throw Object.assign(Error('No existe captura de lienzo.'),{name:'NotSupportedError'});
 const url=URL.createObjectURL(file);
 const video=document.createElement('video');
 video.playsInline=true;video.setAttribute('playsinline','');
 video.preload='auto';video.muted=true;video.src=url;
 // On iOS video decoding can pause when the element is display:none.
 video.style.cssText='position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
 document.body.appendChild(video);
 let ctx=null,stream=null,recorder=null,frame=0,interval=0;
 try{
  cb?.(.08,'Leyendo duración y resolución del vídeo…');
  if(video.readyState<1){
   await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>finish(Error('El vídeo no pudo abrirse en este navegador.')),15000);
    function finish(err){clearTimeout(timeout);video.removeEventListener('loadedmetadata',loaded);video.removeEventListener('error',failed);err?reject(err):resolve();}
    const loaded=()=>finish(),failed=()=>finish(Error('Safari no pudo decodificar este archivo de vídeo.'));
    video.addEventListener('loadedmetadata',loaded,{once:true});
    video.addEventListener('error',failed,{once:true});
    video.load();
   });
  }
  const settings=videoCompressionSettings({width:video.videoWidth,height:video.videoHeight,
    fileSize:file.size,duration:video.duration,quality:opts.quality||'balanced'});
  const canvas=document.createElement('canvas');
  canvas.width=settings.width;canvas.height=settings.height;
  const draw=canvas.getContext('2d',{alpha:false});
  if(!draw)throw Object.assign(Error('Lienzo de vídeo no disponible.'),{name:'NotSupportedError'});
  stream=canvas.captureStream(settings.frameRate);
  if(!stream.getVideoTracks().length)throw Error('El navegador no permitió capturar los fotogramas.');
  // Route audio from the uploaded local video through Web Audio. Never
  // silently remove audio in a compression request.
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx)throw Object.assign(Error('No se puede conservar el audio.'),{name:'NotSupportedError'});
  ctx=new AudioCtx();
  const source=ctx.createMediaElementSource(video);
  const destination=ctx.createMediaStreamDestination();
  source.connect(destination);
  const tracks=destination.stream.getAudioTracks();
  if(!tracks.length)throw Error('No se pudo preparar una pista para conservar el audio.');
  stream.addTrack(tracks[0]);
  await ctx.resume();
  if(ctx.state!=='running')throw Object.assign(Error('El audio no pudo iniciarse.'),{name:'NotAllowedError'});
  cb?.(.12,'Codificando vídeo localmente; mantén Prisma abierto…');
  recorder=new MediaRecorder(stream,{mimeType:mime,
    videoBitsPerSecond:settings.videoBitsPerSecond,
    audioBitsPerSecond:settings.audioBitsPerSecond});
  const pieces=[];
  const recorded=new Promise((resolve,reject)=>{
   recorder.ondataavailable=event=>{if(event.data?.size)pieces.push(event.data);};
   recorder.onerror=event=>reject(event.error||Error('Error del codificador de vídeo.'));
   recorder.onstop=()=>resolve();
  });
  function paint(){
   if(video.readyState>=2){
    try{draw.drawImage(video,0,0,canvas.width,canvas.height);}
    catch(error){
     // Some WebKit builds prohibit drawing protected video frames. Preserve
     // the input file and reject rather than record a blank result.
     if(recorder?.state==='recording')recorder.stop();
     throw error;
    }
   }
   frame=requestAnimationFrame(paint);
  }
  // Record only after video playback begins, to avoid an empty file.
  await video.play();
  try{draw.drawImage(video,0,0,canvas.width,canvas.height);}
  catch(error){throw Object.assign(Error(error?.message||'No se pudieron leer los fotogramas.'),{name:error?.name||'SecurityError'});}
  recorder.start(1000);
  frame=requestAnimationFrame(paint);
  interval=setInterval(()=>{
   cb?.(.16+Math.min(.73,Math.max(0,video.currentTime/video.duration)*.73),
    'Comprimiendo '+Math.floor(video.currentTime)+' de '+Math.ceil(video.duration)+' segundos…');
  },500);
  const finished=new Promise((resolve,reject)=>{
   video.addEventListener('ended',resolve,{once:true});
   video.addEventListener('error',()=>reject(Error('Se interrumpió la reproducción del vídeo.')),{once:true});
   setTimeout(()=>reject(Error('La codificación excedió el tiempo de seguridad.')),Math.ceil(video.duration*1300)+20000);
  });
  await finished;
  if(recorder.state==='recording')recorder.stop();
  await recorded;
  const container=recorder.mimeType||mime;
  const isMp4=/mp4/i.test(container);
  const type=isMp4?'video/mp4':'video/webm';
  const blob=new Blob(pieces,{type});
  if(blob.size<1024)throw Error('La codificación no produjo un vídeo utilizable.');
  if(blob.size>=file.size)throw Error('La nueva codificación no redujo el tamaño. Se conserva el archivo original sin presentarlo como comprimido.');
  cb?.(1,'Vídeo comprimido y listo para descargar.');
  const percent=Math.round((1-blob.size/file.size)*100);
  return {blob,filename:(file.name||'video').replace(/\.[^.]+$/,'')+'-comprimido.'+(isMp4?'mp4':'webm'),
   summary:'Compresión local · '+percent+' % menos · '+(file.size/MB).toFixed(1)+' MB → '+(blob.size/MB).toFixed(1)+' MB · audio incluido en el flujo de grabación.'};
 }catch(error){throw Error(localizedVideoError(error));}
 finally{
  if(frame)cancelAnimationFrame(frame);
  if(interval)clearInterval(interval);
  if(recorder?.state==='recording'){try{recorder.stop();}catch{}}
  stream?.getTracks().forEach(track=>track.stop());
  video.pause();video.removeAttribute('src');video.load();video.remove();
  URL.revokeObjectURL(url);
  if(ctx){try{await ctx.close();}catch{}}
 }
}
