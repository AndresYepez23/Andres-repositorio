// Prisma Core voice controls: dictation + hands-free turn-based conversation.
// Not full-duplex realtime speech. Browser speech services can require internet.
const $=selector=>document.querySelector(selector);
let recognition=null;
let recorder=null;
let stream=null;
let listening=false;
let mode='dictation';
let callActive=false;
let callCount=0;
let voiceCancelled=false;
const Recognition=()=>window.SpeechRecognition||window.webkitSpeechRecognition;
function announce(text){
 const el=$('#core-voice-status');if(el)el.textContent=text;
 const state=$('#core-call-state');if(state)state.textContent=text;
}
function markListening(on){
 listening=on;
 $('#core-mic')?.classList.toggle('is-listening',on);
 $('#core-mic')?.setAttribute('aria-pressed',String(on));
 $('#core-mic')?.setAttribute('title',on?'Detener dictado':'Dictar mensaje');
}
function setDraft(text){
 const input=$('#core-input');if(!input)return;
 input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));
}
async function stopRecording(){
 if(recognition){try{recognition.abort();}catch{}recognition=null;}
 if(recorder&&recorder.state!=='inactive')recorder.stop();
 if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
 markListening(false);
}
function stopSpeaking(){
 voiceCancelled=true;
 if('speechSynthesis' in window)try{speechSynthesis.cancel();}catch{}
}
export async function stopPrismaVoice(){
 callActive=false;callCount++;
 stopSpeaking();
 await stopRecording();
 $('#core-call-panel')?.classList.add('hidden');
 $('#core-voice-mode')?.classList.remove('active');
 announce('Dictado y conversación detenidos.');
}
function speakAnswer(text){
 return new Promise(resolve=>{
  if(!callActive||!('speechSynthesis' in window)||!text?.trim()){resolve();return;}
  stopSpeaking();voiceCancelled=false;
  const msg=new SpeechSynthesisUtterance(text.slice(0,1600));
  msg.lang='es-ES';msg.rate=1;msg.pitch=1;
  const voices=speechSynthesis.getVoices();
  msg.voice=voices.find(v=>/^es[-_]/i.test(v.lang)&&/natural|premium|enhanced/i.test(v.name))||
     voices.find(v=>/^es[-_]/i.test(v.lang))||null;
  msg.onend=resolve;msg.onerror=resolve;
  announce('Prisma está respondiendo…');
  speechSynthesis.speak(msg);
 });
}
async function deliverText(text){
 if(!text?.trim())return;
 const field=$('#core-input');if(!field)return;
 const prev=field.value.trim();
 setDraft((prev?prev+' ':'')+text.trim());
 if(callActive){
  const button=$('#core-send');
  if(button&&!button.disabled){
   announce('Enviando tu mensaje…');
   button.click();
  }else announce('Prisma está ocupado. Tu mensaje quedó escrito para enviarlo.');
 }else announce('Texto transcrito. Revísalo y pulsa Enviar.');
}
async function useBrowserRecognition(){
 const Engine=Recognition();
 if(!Engine)return false;
 try{
  const session=new Engine();recognition=session;
  session.lang='es-ES';session.interimResults=true;session.continuous=false;session.maxAlternatives=1;
  let transcript='',interim='',resolved=false;
  const draft=$('#core-input')?.value||'';
  session.onresult=event=>{
   transcript='';interim='';
   for(let i=event.resultIndex;i<event.results.length;i++){
    const item=event.results[i],s=item[0]?.transcript||'';
    if(item.isFinal)transcript+=s;else interim+=s;
   }
   setDraft((draft?draft+' ':'')+(transcript||interim).trim());
  };
  session.onerror=event=>{
   const code=event.error||'unknown';
   announce(code==='not-allowed'?'Debes autorizar el micrófono en el navegador.':'El dictado no está disponible ('+code+').');
   resolved=true;markListening(false);
   if(callActive&&(code==='not-allowed'||code==='service-not-allowed'))stopPrismaVoice();
  };
  session.onend=async()=>{
   if(recognition===session)recognition=null;
   markListening(false);
   if(resolved)return;
   if(transcript.trim()){
    setDraft(draft);
    await deliverText(transcript);
   }else if(interim.trim()){
    setDraft(draft);
    await deliverText(interim);
   }else announce('No se detectó voz. Puedes volver a intentar.');
  };
  session.start();markListening(true);announce('Escuchando. Habla ahora…');
  return true;
 }catch(error){recognition=null;console.warn('SpeechRecognition:',error?.message);return false;}
}
async function useRecordedTranscription(){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){announce('Este navegador no permite grabar el micrófono.');return;}
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
  const pieces=[];
  recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  recorder.ondataavailable=event=>{if(event.data?.size)pieces.push(event.data);};
  recorder.onstop=async()=>{
   markListening(false);stream?.getTracks().forEach(t=>t.stop());stream=null;
   if(!pieces.length){announce('No se grabó ningún audio.');return;}
   const blob=new Blob(pieces,{type:mime||'audio/webm'});
   if(blob.size>9*1024*1024){announce('El audio supera el límite de 9 MB. Prueba un mensaje más corto.');return;}
   announce('Transcribiendo el audio mediante el motor conectado…');
   try{
    const form=new FormData();
    form.append('file',blob,'prisma-voz.'+(mime.includes('mp4')?'m4a':'webm'));
    form.append('provider','groq');form.append('model','whisper-large-v3-turbo');form.append('language','es');
    const response=await fetch('/api/ai/transcribe',{method:'POST',body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'Error de transcripción: '+response.status);
    await deliverText(String(data.text||''));
   }catch(error){announce(error.message||'No fue posible transcribir el audio.');}
  };
  recorder.start();markListening(true);
  announce('Grabando. Toca de nuevo el micrófono para transcribir mediante un servicio externo.');
 }catch(error){markListening(false);announce(error?.name==='NotAllowedError'?'Autoriza el uso del micrófono.':'No se pudo iniciar la grabación.');}
}
async function startListening(){
 if(listening){if(recognition){recognition.stop();}else if(recorder?.state==='recording')recorder.stop();return;}
 if(await useBrowserRecognition())return;
 await useRecordedTranscription();
}
function finishVoiceTurn(message){
 if(!callActive)return;
 const token=callCount;
 // A generated assistant response may include warnings or service errors.
 speakAnswer(String(message?.content||'')).then(()=>{
  if(!callActive||token!==callCount)return;
  if(Recognition()){
   announce('Tu turno. Escuchando…');startListening();
  }else{
   announce('Pulsa el micrófono para hablar otra vez. El modo de conversación es por turnos.');
  }
 });
}
function setupConversationPanel(){
 $('#core-call-close')?.addEventListener('click',stopPrismaVoice);
 $('#core-call-panel')?.addEventListener('click',event=>{if(event.target===$('#core-call-panel'))stopPrismaVoice();});
 $('#core-call-mic')?.addEventListener('click',startListening);
}
export function setupPrismaVoice(){
 $('#core-mic')?.addEventListener('click',startListening);
 $('#core-voice-mode')?.addEventListener('click',async()=>{
  if(callActive){stopPrismaVoice();return;}
  callActive=true;voiceCancelled=false;callCount++;
  $('#core-call-panel')?.classList.remove('hidden');
  $('#core-voice-mode')?.classList.add('active');
  announce('Conversación experimental por turnos. Habla y Prisma responderá con voz.');
  await startListening();
 });
 document.addEventListener('prisma:core-assistant',event=>finishVoiceTurn(event.detail));
 document.addEventListener('prisma:core-switch-chat',()=>{if(callActive)stopPrismaVoice();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&callActive)stopPrismaVoice();});
 setupConversationPanel();
 if(!Recognition()&&!navigator.mediaDevices?.getUserMedia){
  $('#core-mic').disabled=true;
  $('#core-mic').title='El micrófono no es compatible con este navegador';
  $('#core-voice-mode').disabled=true;
 }
}
