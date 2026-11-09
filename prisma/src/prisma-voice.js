// Dictado y conversación por turnos. No implementa llamadas de audio en tiempo real.
const $=s=>document.querySelector(s);
let recognizer=null,mediaRecorder=null,mediaStream=null,recordChunks=[],recordTimer=0;
let mode='',listening=false,pendingResponse=false,conversationOpen=false,currentFinal='';
const supportedRecognition=()=>window.SpeechRecognition||window.webkitSpeechRecognition;
function message(text){const el=$('#voice-transcript');if(el)el.textContent=String(text||'');}
function setListening(value){
 listening=value;
 $('#core-dictate')?.setAttribute('aria-pressed',String(value&&mode==='dictate'));
 $('#voice-record')?.setAttribute('aria-pressed',String(value));
 if($('#voice-record'))$('#voice-record').textContent=value?'Terminar':'Hablar';
}
function closeStream(){if(mediaStream){for(const track of mediaStream.getTracks())track.stop();mediaStream=null;}}
function speak(text){
 if(!('speechSynthesis' in window))return message('La lectura en voz alta no está disponible en este navegador.');
 try{
  const phrase=String(text||'').replace(/[*#_<>]+/g,' ').replace(/\s+/g,' ').trim().slice(0,1700);
  if(!phrase)return;
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(phrase);
  utterance.lang='es-ES';utterance.rate=1;utterance.pitch=1;
  const spanish=speechSynthesis.getVoices().find(v=>/^es[-_]/i.test(v.lang));
  if(spanish)utterance.voice=spanish;
  utterance.onstart=()=>message('Prisma está hablando…');
  utterance.onend=()=>{if(conversationOpen)message('Tu turno. Pulsa Hablar para continuar.');};
  utterance.onerror=()=>message('No fue posible reproducir voz en este navegador. Puedes leer la respuesta en el chat.');
  speechSynthesis.speak(utterance);
 }catch(e){message('No fue posible iniciar la lectura por voz.');}
}
function pushTranscript(text){
 const normalized=String(text||'').trim().slice(0,2500);
 if(!normalized){message('No se reconoció ninguna frase. Vuelve a intentar.');return;}
 if(mode==='conversation'&&conversationOpen){
  message('Tú: '+normalized);
  const input=$('#core-input');
  if(input){input.value=normalized;input.dispatchEvent(new Event('input',{bubbles:true}));}
  pendingResponse=true;
  $('#core-send')?.click();
 }else{
  const input=$('#core-input');
  if(input){input.value=(input.value.trim()?(input.value.trim()+' '):'')+normalized;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
 }
}
function resetCapture(){
 clearTimeout(recordTimer);recordTimer=0;recognizer=null;mediaRecorder=null;closeStream();setListening(false);
}
function stopCapture(){
 clearTimeout(recordTimer);
 if(recognizer){try{recognizer.stop();}catch{};return;}
 if(mediaRecorder&&mediaRecorder.state!=='inactive'){try{mediaRecorder.stop();}catch{}}
}
async function recordFallback(){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
  setListening(false);message('El navegador no admite grabación. Puedes usar el micrófono del teclado para dictar.');return;
 }
 try{
  mediaStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  const supported=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg'].find(type=>MediaRecorder.isTypeSupported?.(type));
  const recorder=supported?new MediaRecorder(mediaStream,{mimeType:supported}):new MediaRecorder(mediaStream);
  mediaRecorder=recorder;recordChunks=[];
  recorder.ondataavailable=e=>{if(e.data?.size)recordChunks.push(e.data);};
  recorder.onerror=()=>{resetCapture();message('No se pudo grabar el audio.');};
  recorder.onstop=async()=>{
   const mime=recorder.mimeType||supported||'audio/webm';
   const audio=new Blob(recordChunks,{type:mime});resetCapture();
   if(audio.size<1000){message('La grabación fue demasiado corta.');return;}
   message('Transcribiendo audio…');
   try{
    const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';
    const data=new FormData();data.append('file',new File([audio],'prisma-voz.'+ext,{type:mime}));data.append('provider','groq');data.append('model','whisper-large-v3-turbo');data.append('language','es');
    const response=await fetch('/api/ai/transcribe',{method:'POST',body:data});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'El servicio no pudo transcribir el audio.');
    pushTranscript(result.text||'');
   }catch(error){
    message('No se pudo transcribir: '+(error?.message||'motor no disponible')+'. También puedes utilizar el dictado de tu teclado.');
   }
  };
  recorder.start();
  setListening(true);
  message('Grabando. Pulsa Terminar cuando acabes de hablar.');
  recordTimer=setTimeout(stopCapture,20000);
 }catch(error){
  resetCapture();
  message(error?.name==='NotAllowedError'?'Permiso de micrófono denegado. Actívalo en el navegador.':'No se pudo abrir el micrófono en este dispositivo.');
 }
}
function startWebRecognition(Recognizer){
 try{
  const r=new Recognizer();
  recognizer=r;currentFinal='';
  r.lang='es-ES';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
  r.onstart=()=>{setListening(true);message('Escuchando…');};
  r.onresult=event=>{
   let interim='',final='';
   for(let i=event.resultIndex;i<event.results.length;i++){
    const value=event.results[i][0]?.transcript||'';
    if(event.results[i].isFinal)final+=value;else interim+=value;
   }
   if(final)currentFinal=(currentFinal+' '+final).trim();
   if(interim&&!currentFinal)message('Escuchando: '+interim);
  };
  r.onerror=event=>{message(event.error==='not-allowed'?'Micrófono sin permiso. Puedes dictar con el teclado.':'No pude reconocer la voz ('+event.error+').');};
  r.onend=()=>{
   const captured=currentFinal;resetCapture();
   if(captured)pushTranscript(captured);else message('No se reconoció texto. Puedes intentarlo de nuevo.');
  };
  r.start();recordTimer=setTimeout(stopCapture,20000);
 }catch{recognizer=null;void recordFallback();}
}
function beginCapture(nextMode){
 if(listening){stopCapture();return;}
 if(pendingResponse){message('Prisma está preparando su respuesta.');return;}
 mode=nextMode;
 if(conversationOpen)$('#voice-modal')?.classList.remove('hidden');
 const Recognizer=supportedRecognition();
 if(Recognizer)startWebRecognition(Recognizer);
 else void recordFallback();
}
function closeConversation(){
 conversationOpen=false;pendingResponse=false;stopCapture();
 if('speechSynthesis' in window)speechSynthesis.cancel();
 $('#voice-modal')?.classList.add('hidden');
}
export function openVoiceConversation(){
 conversationOpen=true;mode='conversation';pendingResponse=false;
 $('#voice-modal')?.classList.remove('hidden');
 message('Pulsa Hablar. En cada turno Prisma transcribirá tu voz, responderá y podrá leer la respuesta.');
}
export function initPrismaVoice(){
 $('#core-dictate')?.addEventListener('click',()=>beginCapture('dictate'));
 $('#core-talk')?.addEventListener('click',openVoiceConversation);
 $('#voice-record')?.addEventListener('click',()=>beginCapture('conversation'));
 $('#voice-stop')?.addEventListener('click',()=>{if(listening)stopCapture();if('speechSynthesis' in window)speechSynthesis.cancel();message('Voz detenida.');});
 $('#voice-close')?.addEventListener('click',closeConversation);
 $('#voice-modal')?.addEventListener('click',e=>{if(e.target===$('#voice-modal'))closeConversation();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&conversationOpen)closeConversation();});
 document.addEventListener('prisma:core-message',event=>{
  const data=event.detail||{};
  if(!conversationOpen||!pendingResponse||data.role!=='assistant')return;
  const content=String(data.content||'');
  if(!content.trim())return;
  pendingResponse=false;
  speak(content);
 });
}
