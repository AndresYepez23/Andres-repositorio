// Voz en Prisma: dictado y conversación por turnos. Sin promesas de streaming full-duplex.
const $=selector=>document.querySelector(selector);
let recorder=null,recognition=null,mediaStream=null,active=false,mode='dictate',conversationOpen=false;
let waitingForResponse=false,readableResponse='',recordTimer=0,generation=0,remoteFailed=false;
const speechEngine=()=>window.SpeechRecognition||window.webkitSpeechRecognition;
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent);
function feedback(value){
 const text=String(value||'');
 const label=$('#core-voice-feedback'),panel=$('#voice-transcript');
 if(label){label.textContent=text;label.classList.toggle('hidden',!text||conversationOpen);}
 if(panel)panel.textContent=text;
}
function setActive(value){
 active=value;
 $('#core-dictate')?.setAttribute('aria-pressed',String(value&&mode==='dictate'));
 $('#voice-record')?.setAttribute('aria-pressed',String(value));
 if($('#voice-record'))$('#voice-record').textContent=value?'Terminar':'Hablar';
}
function cleanup(){
 clearTimeout(recordTimer);recordTimer=0;
 mediaStream?.getTracks().forEach(track=>track.stop());mediaStream=null;
 recorder=null;recognition=null;setActive(false);
}
function stop(){
 clearTimeout(recordTimer);
 if(recognition){try{recognition.stop()}catch{};return;}
 if(recorder?.state==='recording'){try{recorder.stop()}catch{}}
}
function normalize(text){return String(text||'').replace(/\s+/g,' ').trim().slice(0,2500);}
function setTranscript(value){
 const text=normalize(value);
 if(!text){feedback('No se detectó voz. Intenta de nuevo o utiliza el micrófono del teclado.');return;}
 feedback('Reconocido: '+text);
 const field=$('#core-input');
 if(!field)return;
 if(mode==='conversation'&&conversationOpen){
  field.value=text;
  field.dispatchEvent(new Event('input',{bubbles:true}));
  if($('#core-send')?.disabled){feedback('El chat todavía está ocupado. Puedes enviar el texto manualmente.');return;}
  waitingForResponse=true;$('#core-send')?.click();
  feedback('Mensaje enviado. Prisma está preparando la respuesta…');
 }else{
  field.value=[field.value.trim(),text].filter(Boolean).join(' ');
  field.dispatchEvent(new Event('input',{bubbles:true}));
  field.focus();
  feedback('Texto listo para revisar y enviar.');
 }
}
function speak(text){
 readableResponse=normalize(text).slice(0,1800);
 $('#voice-play-reply')?.classList.toggle('hidden',!readableResponse);
 if(!readableResponse)return;
 if(!('speechSynthesis' in window)){
  feedback('Tu navegador no permite lectura por voz; la respuesta sigue en el chat.');
  return;
 }
 try{
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(readableResponse);
  utterance.lang='es-ES';utterance.rate=1;utterance.pitch=1;
  utterance.voice=window.speechSynthesis.getVoices().find(v=>/^es(?:-|_)/i.test(v.lang))||null;
  utterance.onstart=()=>feedback('Prisma está respondiendo en voz alta…');
  utterance.onend=()=>feedback('Tu turno. Pulsa Hablar para continuar.');
  utterance.onerror=()=>feedback('Pulsa «Escuchar respuesta» para permitir la reproducción en este dispositivo.');
  window.speechSynthesis.speak(utterance);
 }catch{feedback('Pulsa «Escuchar respuesta» para reproducir la respuesta.');}
}
async function captureWithRecorder(token){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
  cleanup();feedback('Este navegador no admite grabación. Usa el micrófono del teclado o prueba Safari/Chrome actualizado.');return;
 }
 try{
  mediaStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  if(token!==generation){cleanup();return;}
  const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'].find(type=>MediaRecorder.isTypeSupported?.(type));
  const instance=mime?new MediaRecorder(mediaStream,{mimeType:mime}):new MediaRecorder(mediaStream);
  recorder=instance;
  const chunks=[];
  instance.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
  instance.onerror=()=>{cleanup();feedback('La grabación falló. Revisa el permiso de micrófono del navegador.');};
  instance.onstop=async()=>{
   const type=instance.mimeType||mime||'audio/mp4';
   const blob=new Blob(chunks,{type});
   cleanup();
   if(token!==generation)return;
   if(blob.size<600){feedback('La grabación quedó vacía. Intenta hablar más cerca del micrófono.');return;}
   if(blob.size>10*1024*1024){feedback('El audio superó los 10 MB permitidos para la transcripción.');return;}
   feedback('Transcribiendo tu voz…');
   const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';
   try{
    const body=new FormData();
    body.append('file',new File([blob],'prisma-voz.'+ext,{type}));
    body.append('provider','groq');body.append('model','whisper-large-v3-turbo');body.append('language','es');
    const response=await fetch('/api/ai/transcribe',{method:'POST',body});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'La transcripción no está disponible ahora.');
    if(token===generation)setTranscript(result.text);
   }catch(error){
    if(token===generation)feedback('No pude transcribir el audio: '+String(error?.message||'motor no disponible').slice(0,175)+'. Puedes dictar con el teclado.');
   }
  };
  instance.start(250);
  setActive(true);
  feedback('Grabando… habla y pulsa Terminar al acabar.');
  recordTimer=setTimeout(stop,20000);
 }catch(error){
  cleanup();
  feedback(error?.name==='NotAllowedError'
   ?'No se concedió permiso al micrófono. Habilítalo en Safari o Ajustes de iOS.'
   :'No se pudo acceder al micrófono. Comprueba los permisos del navegador.');
 }
}
function captureWithRecognition(token,Recognizer){
 try{
  const session=new Recognizer();
  recognition=session;
  let final='',failure='';
  session.lang='es-ES';session.continuous=false;session.interimResults=true;session.maxAlternatives=1;
  session.onstart=()=>{setActive(true);feedback('Escuchando…')};
  session.onresult=event=>{
   let partial='';
   for(let i=event.resultIndex;i<event.results.length;i++){
    const spoken=event.results[i][0]?.transcript||'';
    if(event.results[i].isFinal)final+=' '+spoken;else partial+=' '+spoken;
   }
   if(partial&&!final)feedback('Escuchando: '+partial.trim());
  };
  session.onerror=event=>{
   failure=event.error||'error';
   if(failure==='not-allowed'||failure==='service-not-allowed'){
    feedback('Permiso de voz denegado. Habilita el micrófono para Prisma.');
   }else feedback('El reconocimiento del navegador falló ('+failure+'). Buscando alternativa…');
  };
  session.onend=()=>{
   cleanup();
   if(token!==generation)return;
   if(normalize(final)){setTranscript(final);return;}
   if(!failure||failure==='no-speech'){
    feedback('No se detectó voz. Vuelve a pulsar el micrófono.');
    return;
   }
   if(['not-allowed','service-not-allowed','audio-capture'].includes(failure))return;
   if(!remoteFailed){
    remoteFailed=true;
    void captureWithRecorder(token);
   }
  };
  session.start();setActive(true);
  recordTimer=setTimeout(stop,20000);
 }catch{
  recognition=null;
  void captureWithRecorder(token);
 }
}
function start(nextMode){
 if(active){stop();return;}
 if(waitingForResponse){feedback('Prisma todavía está respondiendo.');return;}
 mode=nextMode;remoteFailed=false;
 const token=++generation;
 const Recognition=speechEngine();
 if(Recognition)captureWithRecognition(token,Recognition);
 else void captureWithRecorder(token);
}
function closeConversation(){
 conversationOpen=false;waitingForResponse=false;
 ++generation;stop();cleanup();
 window.speechSynthesis?.cancel();
 $('#voice-modal')?.classList.add('hidden');
 feedback('');
}
export function initPrismaVoice(){
 $('#core-dictate')?.addEventListener('click',()=>start('dictate'));
 $('#core-talk')?.addEventListener('click',()=>{
  conversationOpen=true;waitingForResponse=false;mode='conversation';
  $('#voice-modal')?.classList.remove('hidden');
  feedback('Pulsa Hablar. Tras cada turno podrás escuchar la respuesta de Prisma.');
 });
 $('#voice-record')?.addEventListener('click',()=>start('conversation'));
 $('#voice-stop')?.addEventListener('click',()=>{
  if(active)stop();window.speechSynthesis?.cancel();
  feedback('Voz detenida. Puedes iniciar otro turno.');
 });
 $('#voice-play-reply')?.addEventListener('click',()=>speak(readableResponse));
 $('#voice-close')?.addEventListener('click',closeConversation);
 $('#voice-modal')?.addEventListener('click',event=>{if(event.target===$('#voice-modal'))closeConversation()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&conversationOpen)closeConversation()});
 document.addEventListener('prisma:core-message',event=>{
  if(!conversationOpen||!waitingForResponse||event.detail?.role!=='assistant')return;
  waitingForResponse=false;
  speak(event.detail?.content||'');
 });
}
