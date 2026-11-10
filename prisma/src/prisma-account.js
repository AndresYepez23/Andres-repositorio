// Prisma Space account and session management. Separate Supabase project;
// OAuth and SMS are never presented as active without backend configuration.
// No passwords, OTP codes or tokens enter application analytics.
const $=selector=>document.querySelector(selector);
let api=null,user=null,profile=null;
let config={enabled:false,features:{}},screen='intro',authMode='login';
let syncTimer=0,pendingAuth=false,recovering=false,handledWelcome=false;
const STORAGE='prisma-core-chats-v2';
const SYNC_KEY='prisma-user-sync-consent-v1';
const OAUTH_PENDING='prisma-account-oauth-pending';
const SCREENS=['intro','email','phone','reset','recovery','confirm','welcome','account'];

export function validateAccountPassword(password,confirmation=null){
 const value=String(password||'');
 if(value.length<8)return 'La contraseña debe tener al menos 8 caracteres.';
 if(value.length>72)return 'La contraseña no debe superar los 72 caracteres.';
 if(confirmation!==null&&value!==confirmation)return 'Las contraseñas no coinciden.';
 return null;
}
export function accountAuthMessage(error){
 const raw=String(error?.message||error||'').toLowerCase();
 if(/invalid login credentials|invalid credentials/.test(raw))return 'Correo o contraseña incorrectos.';
 if(/email not confirmed/.test(raw))return 'Confirma tu correo usando el enlace que recibiste antes de iniciar sesión.';
 if(/already registered|already exists|user already registered/.test(raw))return 'Esta cuenta ya existe. Prueba iniciar sesión o recuperar la contraseña.';
 if(/password.*weak|password should be|password is too short/.test(raw))return 'Elige una contraseña más segura, de al menos 8 caracteres.';
 if(/rate limit|too many requests|over_email_send_rate_limit/.test(raw))return 'Has alcanzado el límite temporal de intentos o correos. Prueba nuevamente más tarde.';
 if(/signup is disabled/.test(raw))return 'El registro está deshabilitado temporalmente.';
 if(/provider is not enabled|unsupported provider/.test(raw))return 'Este proveedor todavía no está habilitado para Prisma.';
 if(/failed to fetch|network|connection/.test(raw))return 'No se pudo conectar al servidor. Comprueba tu conexión e inténtalo de nuevo.';
 return String(error?.message||'No se pudo completar la solicitud. Inténtalo de nuevo.').slice(0,260);
}
export function isAccountProviderAvailable(features,provider){
 return features?.[provider]===true;
}
function info(message,kind='info'){
 const element=$('#auth-message');
 if(!element)return;
 element.textContent=message||'';
 element.dataset.kind=kind;
}
function focusScreen(name){
 const element=$('#auth-'+name+'-screen');
 if(!element)return;
 const target=element.querySelector('input,button:not([disabled])');
 target?.focus?.({preventScroll:true});
}
function showScreen(name,{focus=false}={}){
 if(!SCREENS.includes(name))return;
 screen=name;
 for(const item of SCREENS)$('#auth-'+item+'-screen')?.classList.toggle('hidden',name!==item);
 if(focus)requestAnimationFrame(()=>focusScreen(name));
 const panel=$('#auth-modal .auth-panel');
 if(panel)panel.scrollTop=0;
}
function showAuth(show,{focus=false}={}){
 const modal=$('#auth-modal');if(!modal)return;
 if(!show&&modal.contains(document.activeElement))document.activeElement.blur?.();
 modal.classList.toggle('hidden',!show);
 modal.setAttribute('aria-hidden',String(!show));
 document.body.classList.toggle('prisma-auth-open',show);
 if(show&&focus)requestAnimationFrame(()=>focusScreen(screen));
}
function fullName(value){
 return String(value||'').trim().replace(/\s+/g,' ').slice(0,60);
}
function displayName(){
 const result=fullName(profile?.display_name)||
  fullName(user?.user_metadata?.full_name||user?.user_metadata?.name);
 return result||String(user?.email||user?.phone||'Mi cuenta').split('@')[0].slice(0,45);
}
function setProviderAvailability(){
 for(const provider of ['google','apple','phone']){
  const btn=$('#auth-'+provider);
  if(!btn)continue;
  const ready=config.enabled&&isAccountProviderAvailable(config.features,provider);
  btn.disabled=!ready;
  btn.setAttribute('aria-disabled',String(!ready));
  const label=btn.querySelector('small');
  if(label)label.textContent=ready?'Disponible':provider==='phone'?'Requiere configurar SMS':'Por configurar';
 }
 const email=$('#auth-email-choice');
 if(email)email.disabled=!config.enabled;
 const availability=$('#auth-availability');
 if(availability)availability.textContent=config.enabled
  ?'Correo y contraseña disponibles. Otros métodos se habilitarán cuando estén configurados.'
  :'Las cuentas no están disponibles en este momento. Puedes seguir usando Prisma sin registrarte.';
}
function updateTabs(){
 const signup=authMode==='signup';
 $('#auth-tab-login')?.classList.toggle('active',!signup);
 $('#auth-tab-signup')?.classList.toggle('active',signup);
 $('#auth-name-label')?.classList.toggle('hidden',!signup);
 $('#auth-password-confirm-label')?.classList.toggle('hidden',!signup);
 const confirm=$('#auth-password-confirm');
 if(confirm)confirm.required=signup;
 const password=$('#auth-password');
 if(password)password.autocomplete=signup?'new-password':'current-password';
 const title=$('#auth-email-title');
 if(title)title.textContent=signup?'Crear cuenta en Prisma':'Accede a tu cuenta';
 const description=$('#auth-email-description');
 if(description)description.textContent=signup
  ?'Crea tu espacio personal con un correo y una contraseña segura.'
  :'Bienvenido de nuevo. Introduce tus datos para continuar.';
 const submit=$('#auth-submit');
 if(submit)submit.textContent=signup?'Crear mi cuenta':'Iniciar sesión';
 $('#auth-reset')?.classList.toggle('hidden',signup);
 info('');
}
function refreshIdentity(){
 const label=$('#account-menu-state'),login=$('#profile-login-label');
 if(label)label.textContent=user?(user.email||user.phone||displayName()):'Modo invitado · gratis';
 if(login)login.textContent=user?'Mi cuenta de Prisma':'Iniciar sesión o crear cuenta';
 $('#account-signout')?.classList.toggle('hidden',!user);
 $('#account-sync')?.classList.toggle('hidden',!user);
 const helper=$('#profile-menu-privacy');
 if(helper)helper.textContent=user
  ?'Tu cuenta está activa. Solo sincronizaremos conversaciones cuando lo autorices.'
  :'Puedes seguir usando Prisma gratis sin cuenta. Registrarte es opcional.';
 if(!user)return;
 const name=displayName();
 const avatar=$('#auth-account-avatar');
 if(avatar)avatar.textContent=name.slice(0,1).toLocaleUpperCase('es')||'P';
 const accountName=$('#auth-account-name');
 if(accountName)accountName.textContent=name;
 const accountEmail=$('#auth-account-email');
 if(accountEmail)accountEmail.textContent=user.email||user.phone||'Cuenta conectada';
 const verified=$('#auth-account-verification');
 if(verified)verified.textContent=user.email
  ?(user.email_confirmed_at?'Correo verificado':'Correo pendiente de verificación')
  :(user.phone_confirmed_at?'Teléfono verificado':'Sesión activa');
 const profileInput=$('#auth-profile-name');
 if(profileInput&&document.activeElement!==profileInput)profileInput.value=fullName(profile?.display_name)||'';
 const syncStatus=$('#auth-account-sync-status');
 if(syncStatus)syncStatus.textContent=selectedSync()
  ?'Sincronización autorizada en este dispositivo.'
  :'El historial permanece local hasta que autorices la sincronización.';
}
async function ensureProfile(){
 if(!api||!user?.id)return;
 const current=user.id;
 const {data,error}=await api.from('prisma_profiles')
  .select('user_id,display_name,theme').eq('user_id',current).maybeSingle();
 if(user?.id!==current||error)return;
 if(data){profile=data;refreshIdentity();return;}
 const suggested=fullName(user.user_metadata?.full_name||user.user_metadata?.name);
 const {data:created,error:createError}=await api.from('prisma_profiles')
  .insert({user_id:current,display_name:suggested||null})
  .select('user_id,display_name,theme').single();
 if(user?.id!==current)return;
 if(created&&!createError){profile=created;refreshIdentity();}
 else if(createError)console.warn('Prisma: perfil pendiente de sincronizar');
}
function openAccount(){
 if(user){
  showScreen('account');
  refreshIdentity();
 }else{
  showScreen('intro');
 }
 info('');
 showAuth(true,{focus:true});
}
export function openPrismaAuth(){openAccount();}
function selectedSync(){return !!user&&localStorage.getItem(SYNC_KEY)===user.id;}
function sanitizeChats(){
 let chats=[];
 try{chats=JSON.parse(localStorage.getItem(STORAGE)||'[]');}catch{}
 return Array.isArray(chats)
  ?chats.filter(x=>x&&typeof x.id==='string'&&Array.isArray(x.messages)).slice(0,50):[];
}
async function doSync(){
 if(!api||!user||!selectedSync())return;
 const activeUserId=user.id;
 const local=sanitizeChats();
 const {data:remote,error}=await api.from('prisma_conversations')
  .select('id,title,pinned,updated_at,data')
  .order('updated_at',{ascending:false}).limit(50);
 if(error)throw error;
 if(activeUserId!==user?.id)return;
 const map=new Map((remote||[]).filter(x=>x.data&&typeof x.data==='object')
  .map(x=>[x.id,x.data]));
 const changes=[];
 for(const chat of local){
  const normalized={
   id:String(chat.id).slice(0,120),title:String(chat.title||'Nueva conversación').slice(0,70),
   pinned:!!chat.pinned,created:Number(chat.created)||Date.now(),
   updated:Number(chat.updated)||Date.now(),titled:!!chat.titled,
   thumbnailBrief:null,
   messages:chat.messages.slice(-30).map(m=>({
    id:m.id,role:m.role,content:String(m.content||'').slice(0,5000),
    time:m.time,engine:m.engine,model:m.model,feedback:m.feedback
   }))
  };
  const existing=map.get(normalized.id);
  if(!existing||normalized.updated>(Number(existing.updated)||0)){
   map.set(normalized.id,normalized);
   changes.push({
    user_id:activeUserId,id:normalized.id,title:normalized.title,
    pinned:normalized.pinned,updated_at:new Date(normalized.updated).toISOString(),
    data:normalized
   });
  }
 }
 if(changes.length){
  const {error:writeError}=await api.from('prisma_conversations')
   .upsert(changes,{onConflict:'user_id,id'});
  if(writeError)throw writeError;
 }
 if(user?.id!==activeUserId||!selectedSync())return;
 const merged=[...map.values()].sort((a,b)=>(Number(b.updated)||0)-(Number(a.updated)||0)).slice(0,50);
 localStorage.setItem(STORAGE,JSON.stringify(merged));
 document.dispatchEvent(new CustomEvent('prisma:remote-chats-ready'));
}
function scheduleSync(){
 if(!selectedSync()||!api)return;
 clearTimeout(syncTimer);
 syncTimer=setTimeout(()=>doSync().catch(e=>console.warn('Prisma sincronización:',e?.message)),1400);
}
async function performSync(){
 if(!api||!user)return;
 if(!selectedSync()){
  const agreed=window.confirm('¿Guardar el texto de los chats de este navegador en tu cuenta Prisma? No se enviarán archivos adjuntos ni contraseñas.');
  if(!agreed)return;
  localStorage.setItem(SYNC_KEY,user.id);
 }
 info('Sincronizando conversaciones…');
 try{await doSync();info('Conversaciones sincronizadas.','success');}
 catch(error){info('La sincronización no se completó: '+accountAuthMessage(error),'error');}
 refreshIdentity();
}
async function signOut(){
 if(!api||!user)return;
 const synced=selectedSync();
 if(synced&&!window.confirm('Cerrarás sesión y se quitarán de este dispositivo las copias locales sincronizadas para proteger tu privacidad. ¿Continuar?'))return;
 const {error}=await api.auth.signOut();
 if(error){info(accountAuthMessage(error),'error');return;}
 if(synced){localStorage.removeItem(STORAGE);localStorage.removeItem(SYNC_KEY);}
 user=null;profile=null;
 document.dispatchEvent(new Event('prisma:close-profile'));
 showAuth(false);location.reload();
}
function withBusy(button,action){
 if(!button||button.disabled)return;
 button.disabled=true;
 Promise.resolve().then(action).catch(error=>{
  info(accountAuthMessage(error),'error');
 }).finally(()=>{button.disabled=false;});
}
async function signInProvider(provider){
 if(!api||!config.enabled||!isAccountProviderAvailable(config.features,provider)){
  info('Este método todavía no está configurado. Usa correo y contraseña.','error');
  return;
 }
 info('Conectando con '+(provider==='google'?'Google':'Apple')+'…');
 sessionStorage.setItem(OAUTH_PENDING,provider);
 try{
  const {error}=await api.auth.signInWithOAuth({
   provider,options:{redirectTo:location.origin+location.pathname}
  });
  if(error)throw error;
 }catch(error){
  sessionStorage.removeItem(OAUTH_PENDING);
  info('No fue posible continuar con '+(provider==='google'?'Google':'Apple')+': '+accountAuthMessage(error),'error');
 }
}
async function onSignedIn(newUser,{fromInteraction=false}={}){
 if(!newUser?.id)return;
 const changed=user?.id!==newUser.id;
 user=newUser;
 if(changed)profile=null;
 refreshIdentity();
 ensureProfile().catch(()=>{});
 if(selectedSync())setTimeout(()=>doSync().catch(()=>{}),750);
 const oauth=sessionStorage.getItem(OAUTH_PENDING);
 const welcome=fromInteraction||pendingAuth||Boolean(oauth);
 if(oauth)sessionStorage.removeItem(OAUTH_PENDING);
 pendingAuth=false;
 if(recovering)return;
 if(welcome&&!handledWelcome){
  handledWelcome=true;
  const title=$('#auth-welcome-title');
  if(title)title.textContent='¡Bienvenido a Prisma!';
  showScreen('welcome');
  info('Sesión iniciada correctamente.','success');
  showAuth(true);
 }else if(screen==='account')refreshIdentity();
}
function bindForms(){
 $('#auth-close')?.addEventListener('click',()=>showAuth(false));
 $('#auth-guest')?.addEventListener('click',()=>showAuth(false));
 $('#auth-modal')?.addEventListener('click',event=>{
  if(event.target?.id==='auth-modal')showAuth(false);
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('#auth-modal')?.classList.contains('hidden'))showAuth(false);
 });
 document.querySelectorAll('[data-auth-back]').forEach(button=>
  button.addEventListener('click',()=>{showScreen(button.dataset.authBack,{focus:true});info('');})
 );
 $('#auth-email-choice')?.addEventListener('click',()=>{
  authMode='login';updateTabs();showScreen('email',{focus:true});
 });
 $('#auth-tab-login')?.addEventListener('click',()=>{
  authMode='login';updateTabs();focusScreen('email');
 });
 $('#auth-tab-signup')?.addEventListener('click',()=>{
  authMode='signup';updateTabs();focusScreen('email');
 });
 document.querySelectorAll('[data-password-target]').forEach(button=>{
  button.addEventListener('click',()=>{
   const input=document.getElementById(button.dataset.passwordTarget);
   if(!input)return;
   input.type=input.type==='password'?'text':'password';
   button.textContent=input.type==='password'?'Mostrar':'Ocultar';
   button.setAttribute('aria-label',input.type==='password'?'Mostrar contraseña':'Ocultar contraseña');
  });
 });
 $('#auth-form')?.addEventListener('submit',event=>{
  event.preventDefault();
  const btn=$('#auth-submit');
  withBusy(btn,async()=>{
   if(!api||!config.enabled)throw Error('El sistema de cuentas todavía no está disponible.');
   const email=String($('#auth-email')?.value||'').trim().toLowerCase();
   const password=String($('#auth-password')?.value||'');
   const error=validateAccountPassword(password,authMode==='signup'?$('#auth-password-confirm')?.value||'':null);
   if(error){info(error,'error');return;}
   info(authMode==='signup'?'Creando tu cuenta…':'Comprobando tus credenciales…');
   const signup=authMode==='signup';
   const {data,error:authError}=signup
    ?await api.auth.signUp({
      email,password,options:{
       data:{full_name:fullName($('#auth-display-name')?.value)},
       emailRedirectTo:location.origin+location.pathname
      }
     })
    :await api.auth.signInWithPassword({email,password});
   if(authError)throw authError;
   if(signup&&!data?.session){
    $('#auth-confirm-email').textContent=email;
    showScreen('confirm');
    info('Revisa tu correo para confirmar tu cuenta.','success');
    return;
   }
   pendingAuth=true;
   if(data?.user)await onSignedIn(data.user,{fromInteraction:true});
  });
 });
 $('#auth-google')?.addEventListener('click',()=>signInProvider('google'));
 $('#auth-apple')?.addEventListener('click',()=>signInProvider('apple'));
 $('#auth-phone')?.addEventListener('click',()=>{
  if(!isAccountProviderAvailable(config.features,'phone'))return;
  showScreen('phone',{focus:true});
 });
 $('#auth-send-code')?.addEventListener('click',()=>{
  const btn=$('#auth-send-code');
  withBusy(btn,async()=>{
   if(!api||!isAccountProviderAvailable(config.features,'phone'))throw Error('El acceso por SMS aún no está habilitado.');
   const phone=String($('#auth-phone-number')?.value||'').replace(/[\s()-]/g,'');
   if(!/^\+[1-9]\d{7,14}$/.test(phone)){info('Usa el formato internacional, por ejemplo +573001234567.','error');return;}
   info('Solicitando código por SMS…');
   const {error}=await api.auth.signInWithOtp({phone});
   if(error)throw error;
   info('SMS enviado. Introduce el código recibido.','success');
  });
 });
 $('#auth-phone-form')?.addEventListener('submit',event=>{
  event.preventDefault();
  withBusy($('#auth-verify-phone'),async()=>{
   if(!api||!isAccountProviderAvailable(config.features,'phone'))throw Error('El SMS no está configurado.');
   const phone=String($('#auth-phone-number')?.value||'').replace(/[\s()-]/g,'');
   const token=String($('#auth-otp-code')?.value||'').trim();
   if(!/^\+[1-9]\d{7,14}$/.test(phone)||!/^\d{4,8}$/.test(token)){info('Comprueba el teléfono y el código SMS.','error');return;}
   const {data,error}=await api.auth.verifyOtp({phone,token,type:'sms'});
   if(error)throw error;
   pendingAuth=true;
   if(data?.user)await onSignedIn(data.user,{fromInteraction:true});
  });
 });
 $('#auth-reset')?.addEventListener('click',()=>{
  $('#auth-reset-email').value=$('#auth-email')?.value||'';
  showScreen('reset',{focus:true});
 });
 $('#auth-reset-form')?.addEventListener('submit',event=>{
  event.preventDefault();
  withBusy($('#auth-reset-submit'),async()=>{
   if(!api)throw Error('El correo no está disponible.');
   const email=String($('#auth-reset-email')?.value||'').trim();
   const {error}=await api.auth.resetPasswordForEmail(email,{
    redirectTo:location.origin+location.pathname
   });
   if(error)throw error;
   $('#auth-confirm-email').textContent=email;
   showScreen('confirm');
   info('Si existe una cuenta con ese correo, recibirás un enlace.','success');
  });
 });
 $('#auth-recovery-form')?.addEventListener('submit',event=>{
  event.preventDefault();
  withBusy($('#auth-recovery-submit'),async()=>{
   if(!api||!recovering)throw Error('Abre el enlace de recuperación desde tu correo.');
   const password=$('#auth-new-password')?.value||'';
   const error=validateAccountPassword(password,$('#auth-new-password-confirm')?.value||'');
   if(error){info(error,'error');return;}
   const {error:changeError}=await api.auth.updateUser({password});
   if(changeError)throw changeError;
   recovering=false;
   $('#auth-new-password').value='';
   $('#auth-new-password-confirm').value='';
   showScreen('account');
   info('Tu contraseña se actualizó correctamente.','success');
  });
 });
 $('#auth-confirm-done')?.addEventListener('click',()=>showAuth(false));
 $('#auth-welcome-continue')?.addEventListener('click',()=>showAuth(false));
 $('#auth-profile-form')?.addEventListener('submit',event=>{
  event.preventDefault();
  withBusy($('#auth-profile-save'),async()=>{
   if(!api||!user)return;
   const value=fullName($('#auth-profile-name')?.value);
   const {data,error}=await api.from('prisma_profiles')
    .upsert({user_id:user.id,display_name:value||null,updated_at:new Date().toISOString()},{onConflict:'user_id'})
    .select('user_id,display_name,theme').single();
   if(error)throw error;
   profile=data;refreshIdentity();
   info('Perfil actualizado.','success');
  });
 });
 $('#auth-account-sync')?.addEventListener('click',performSync);
 $('#auth-account-signout')?.addEventListener('click',signOut);
 $('#account-sync')?.addEventListener('click',()=>{
  openAccount();
  performSync();
 });
 $('#account-signout')?.addEventListener('click',signOut);
 document.addEventListener('prisma:chats-changed',scheduleSync);
 document.addEventListener('prisma:chat-deleted',async event=>{
  if(!api||!selectedSync())return;
  const id=String(event.detail?.id||'');
  if(!id)return;
  const {error}=await api.from('prisma_conversations')
   .delete().eq('id',id).eq('user_id',user.id);
  if(error)console.warn('No se pudo borrar conversación remota:',error.message);
 });
}
export async function initPrismaAccount(){
 bindForms();
 setProviderAvailability();
 let response=null;
 try{response=await fetch('/api/auth/config',{cache:'no-store'});}
 catch(error){console.warn('Prisma Auth config:',error?.message);}
 if(!response?.ok){
  setProviderAvailability();refreshIdentity();return;
 }
 try{config=await response.json();}catch{config={enabled:false,features:{}};}
 setProviderAvailability();
 if(!config.enabled){refreshIdentity();return;}
 try{
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.80.0?bundle');
  api=createClient(config.url,config.publishableKey,{
   auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}
  });
  api.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY'){
    recovering=true;user=session?.user||user;
    refreshIdentity();
    showScreen('recovery');showAuth(true,{focus:true});
    info('Elige tu nueva contraseña.','success');
    return;
   }
   if(event==='SIGNED_OUT'){
    user=null;profile=null;refreshIdentity();return;
   }
   if(event==='SIGNED_IN'&&session?.user){
    // Do not call Supabase REST from the synchronous auth callback. Some
    // auth clients hold internal locks while delivering this event.
    setTimeout(()=>onSignedIn(session.user).catch(console.warn),0);
   }
  });
  const {data,error}=await api.auth.getUser();
  if(!error&&data?.user)await onSignedIn(data.user);
  else{user=null;refreshIdentity();}
 }catch(error){
  api=null;config.enabled=false;setProviderAvailability();
  info('El sistema de cuentas no pudo inicializarse. Puedes seguir usando Prisma gratis.','error');
  console.warn('Prisma Auth initialization:',error?.message);
 }
}
