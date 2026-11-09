// Prisma Space account: entirely optional. Never use OdontoUdeC credentials or tables.
const $=s=>document.querySelector(s);
let api=null,user=null,config={enabled:false,features:{}},authMode='login',syncTimer=0;
const STORAGE='prisma-core-chats-v2';
const SYNC_KEY='prisma-user-sync-consent-v1';
function info(message,kind='info'){
 const el=$('#auth-message');if(!el)return;el.textContent=message;el.dataset.kind=kind;
}
function showAuth(show){
 const modal=$('#auth-modal');if(!modal)return;
 if(!show){
  if(modal.contains(document.activeElement))document.activeElement?.blur?.();
  modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');
 }else{
  modal.removeAttribute('aria-hidden');
  modal.classList.remove('hidden');
  const panel=modal.querySelector('.auth-panel');if(panel)panel.scrollTop=0;
 }
 document.body.classList.toggle('prisma-auth-open',show);
}
export function openPrismaAuth(){
 const signed=!!user;
 $('#auth-title').textContent=signed?'Tu cuenta de Prisma Space':'Bienvenido a Prisma Space';
 for(const selector of ['.auth-provider-grid','.auth-divider','.auth-tabs','#auth-form','#auth-reset']){
  const element=$(selector);if(element)element.classList.toggle('hidden',signed);
 }
 showAuth(true);
 if(signed)info('Sesión iniciada con '+(user.email||'tu cuenta')+'. Puedes sincronizar tus conversaciones desde el panel Tu espacio.','success');
 else if(!config.enabled)info('El registro se habilitará con un proyecto Supabase independiente. Prisma sigue siendo gratuito sin cuenta.');
}
function updateTabs(){
 const login=authMode==='login';
 $('#auth-tab-login')?.classList.toggle('active',login);
 $('#auth-tab-signup')?.classList.toggle('active',!login);
 const button=$('#auth-submit');if(button)button.textContent=login?'Entrar con correo':'Crear cuenta';
 const password=$('#auth-password');if(password)password.autocomplete=login?'current-password':'new-password';
}
function refreshIdentity(){
 const label=$('#account-menu-state'),login=$('#profile-login-label'),logout=$('#account-signout'),sync=$('#account-sync');
 if(label)label.textContent=user?.email||'Modo invitado · gratis';
 if(login)login.textContent=user?'Ver mi cuenta':'Iniciar sesión o crear cuenta';
 logout?.classList.toggle('hidden',!user);
 sync?.classList.toggle('hidden',!user);
 const helper=$('#profile-menu-privacy');
 if(helper)helper.textContent=user
  ? 'Tu cuenta está conectada. La sincronización del historial necesita tu autorización y utiliza el proyecto exclusivo de Prisma.'
  : 'Puedes utilizar Prisma gratis sin cuenta. Al registrarte, podrás sincronizar el historial y preferencias cuando la nube esté activa.';
}
function selectedSync(){return !!user&&localStorage.getItem(SYNC_KEY)===user.id;}
function sanitizeChats(){
 let list=[];try{list=JSON.parse(localStorage.getItem(STORAGE)||'[]');}catch{}
 return Array.isArray(list)?list.filter(x=>x&&typeof x.id==='string'&&Array.isArray(x.messages)).slice(0,50):[];
}
async function doSync(){
 if(!api||!selectedSync())return;
 const local=sanitizeChats();
 const {data:remote,error}=await api.from('prisma_conversations').select('id,title,pinned,updated_at,data').order('updated_at',{ascending:false}).limit(50);
 if(error)throw error;
 const map=new Map((remote||[]).filter(x=>x.data&&typeof x.data==='object').map(x=>[x.id,x.data]));
 const newRows=[];
 for(const chat of local){
  const normalized={id:String(chat.id).slice(0,120),title:String(chat.title||'Nueva conversación').slice(0,70),
    pinned:!!chat.pinned,created:Number(chat.created)||Date.now(),updated:Number(chat.updated)||Date.now(),
    titled:!!chat.titled,thumbnailBrief:null,
    messages:chat.messages.slice(-30).map(m=>({id:m.id,role:m.role,content:String(m.content||'').slice(0,5000),time:m.time,engine:m.engine,model:m.model,feedback:m.feedback}))};
  const existing=map.get(normalized.id);
  if(!existing||Number(normalized.updated)>Number(existing.updated)||0){
   map.set(normalized.id,normalized);
   newRows.push({user_id:user.id,id:normalized.id,title:normalized.title,pinned:normalized.pinned,
     updated_at:new Date(normalized.updated).toISOString(),data:normalized});
  }
 }
 if(newRows.length){
  const {error:writeError}=await api.from('prisma_conversations').upsert(newRows,{onConflict:'user_id,id'});
  if(writeError)throw writeError;
 }
 const merged=[...map.values()].sort((a,b)=>(Number(b.updated)||0)-(Number(a.updated)||0)).slice(0,50);
 localStorage.setItem(STORAGE,JSON.stringify(merged));
 document.dispatchEvent(new CustomEvent('prisma:remote-chats-ready'));
}
function scheduleSync(){
 if(!selectedSync()||!api)return;
 clearTimeout(syncTimer);syncTimer=setTimeout(()=>doSync().catch(err=>console.warn('Prisma sincronización:',err?.message||err)),1400);
}
function bindForms(){
 $('#auth-close')?.addEventListener('click',event=>{event.preventDefault();showAuth(false);});
 $('#auth-guest')?.addEventListener('click',event=>{event.preventDefault();showAuth(false);});
 $('#auth-modal')?.addEventListener('pointerup',event=>{
  if(event.target?.closest?.('#auth-close,#auth-guest')){event.preventDefault();showAuth(false);}
 },{passive:false});
 $('#auth-modal')?.addEventListener('click',e=>{if(e.target===$('#auth-modal'))showAuth(false)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#auth-modal')?.classList.contains('hidden'))showAuth(false)});
 $('#auth-tab-login')?.addEventListener('click',()=>{authMode='login';updateTabs();});
 $('#auth-tab-signup')?.addEventListener('click',()=>{authMode='signup';updateTabs();});
 $('#auth-form')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!api){info('El registro no está habilitado hasta conectar el proyecto separado de Supabase.','error');return;}
  const email=$('#auth-email').value.trim(),password=$('#auth-password').value;
  const btn=$('#auth-submit');btn.disabled=true;info('Validando tu solicitud…');
  try{
   const result=authMode==='signup'
    ?await api.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}})
    :await api.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   if(authMode==='signup'&&!result.data?.session)info('Revisa tu correo para confirmar el registro. No compartas tu código.','success');
   else {info('Sesión iniciada. Tu historial local permanece en este dispositivo.','success');showAuth(false);}
  }catch(error){info(error?.message||'No se pudo iniciar sesión.','error');}
  finally{btn.disabled=false;}
 });
 $('#auth-google')?.addEventListener('click',()=>signInProvider('google'));
 $('#auth-apple')?.addEventListener('click',()=>signInProvider('apple'));
 $('#auth-phone')?.addEventListener('click',()=>{
  $('#auth-phone-form').classList.toggle('hidden');
  $('#auth-form').classList.toggle('hidden');
 });
 $('#auth-send-code')?.addEventListener('click',async()=>{
  if(!api||!config.features.phone)return;
  const phone=$('#auth-phone-number').value.trim();
  if(!/^\+[1-9]\d{7,14}$/.test(phone)){info('Indica el teléfono en formato internacional, por ejemplo +573001234567.','error');return;}
  try{const {error}=await api.auth.signInWithOtp({phone});if(error)throw error;info('Si el proveedor está disponible, recibirás un SMS de verificación.','success');}
  catch(err){info(err.message,'error');}
 });
 $('#auth-phone-form')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!api)return;
  const phone=$('#auth-phone-number').value.trim(),token=$('#auth-otp-code').value.trim();
  try{const {error}=await api.auth.verifyOtp({phone,token,type:'sms'});if(error)throw error;info('Teléfono verificado.','success');showAuth(false);}
  catch(err){info(err.message,'error');}
 });
 $('#auth-reset')?.addEventListener('click',async()=>{
  if(!api)return;
  const email=$('#auth-email').value.trim();if(!email){info('Escribe tu correo para recuperar la contraseña.');return;}
  try{const {error}=await api.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;info('Si el correo existe, recibirás instrucciones de recuperación.','success');}
  catch(err){info(err.message,'error');}
 });
 $('#account-signout')?.addEventListener('click',async()=>{
  if(!api)return;
  const synced=selectedSync();
  if(synced&&!window.confirm('Se cerrará sesión y se quitará el historial sincronizado de este dispositivo. Confirma que tus conversaciones estén guardadas en la nube. ¿Continuar?'))return;
  const {error}=await api.auth.signOut();
  if(error){info(error.message,'error');return;}
  document.dispatchEvent(new Event('prisma:close-profile'));
  if(synced){localStorage.removeItem(STORAGE);localStorage.removeItem(SYNC_KEY);}
  location.reload();
 });
 $('#account-sync')?.addEventListener('click',async()=>{
  if(!api||!user)return;
  if(!selectedSync()){
   if(!window.confirm('¿Guardar y sincronizar con tu cuenta el texto de los chats de ESTE navegador? Los archivos adjuntos no se subirán.'))return;
   localStorage.setItem(SYNC_KEY,user.id);
  }
  info('Sincronizando tu historial…');
  try{await doSync();info('Historial sincronizado.','success');}
  catch(error){info('No pude sincronizar: '+error.message,'error');}
 });
 document.addEventListener('prisma:chats-changed',scheduleSync);
 document.addEventListener('prisma:chat-deleted',async event=>{
  if(!api||!selectedSync())return;
  const id=String(event.detail?.id||'');if(!id)return;
  const {error}=await api.from('prisma_conversations').delete().eq('id',id).eq('user_id',user.id);
  if(error)console.warn('No se pudo borrar la conversación remota',error.message);
 });
}
async function signInProvider(provider){
 if(!api||!config.features[provider])return;
 try{
  const {error}=await api.auth.signInWithOAuth({provider,options:{redirectTo:location.origin+location.pathname}});
  if(error)throw error;
 }catch(err){info('No se pudo iniciar con '+provider+': '+err.message,'error');}
}
export async function initPrismaAccount(){
 bindForms();
 let response;
 try{response=await fetch('/api/auth/config',{cache:'no-store'});}catch{response=null;}
 if(!response?.ok){$('#auth-availability').textContent='El acceso con cuenta aún no está configurado. Puedes usar Prisma gratis.';refreshIdentity();return;}
 config=await response.json();
 if(!config.enabled){
  $('#auth-availability').textContent='Registro pendiente: falta el proyecto independiente de Supabase. La versión gratuita funciona sin cuenta.';
  refreshIdentity();return;
 }
 $('#auth-availability').textContent='Puedes usar Prisma gratis como invitado o iniciar sesión para guardar tus chats.';
 const form=$('#auth-submit'),reset=$('#auth-reset');form.disabled=false;reset.disabled=false;
 for(const provider of ['google','apple','phone']){
  const button=$('#auth-'+provider),ready=!!config.features?.[provider];
  if(button){button.disabled=!ready;const status=button.querySelector('small');if(status)status.textContent=ready?'Disponible':'Por configurar';}
 }
 try{
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.80.0?bundle');
  api=createClient(config.url,config.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
  const result=await api.auth.getUser();user=result.data?.user||null;refreshIdentity();
  api.auth.onAuthStateChange((_event,session)=>{
   user=session?.user||null;refreshIdentity();
   if(user&&selectedSync())setTimeout(()=>doSync().catch(console.warn),600);
  });
 }catch(err){
  form.disabled=true;reset.disabled=true;
  $('#auth-availability').textContent='No fue posible iniciar el sistema de cuentas. Puedes seguir gratis.';
  console.warn('Prisma Auth:',err?.message||err);
 }
}
