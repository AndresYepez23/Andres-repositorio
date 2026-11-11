// Prisma Space account and session management. Separate Supabase project;
// OAuth and SMS are never presented as active without backend configuration.
// No passwords, OTP codes or tokens enter application analytics.
import { mergeConversationLists, normalizeConversation, serializeConversation, hasConversationMessages } from './conversation-sync.js';
import { readConversationSnapshot, saveConversationSnapshot } from './conversation-storage.js';
import { PRISMA_AVATARS, prismaAvatar, prismaFirstName } from './profile-avatars.js';
const $=selector=>document.querySelector(selector);
let api=null,user=null,profile=null;
let config={enabled:false,features:{}},screen='intro',authMode='login';
let syncTimer=0,syncInterval=0,syncInFlight=false,syncQueued=false,pendingAuth=false,recovering=false,handledWelcome=false;
const STORAGE='prisma-core-chats-v2';
const SYNC_KEY='prisma-user-sync-consent-v1';
const DELETED_KEY='prisma-sync-deleted-conversations-v1';
const OAUTH_PENDING='prisma-account-oauth-pending';
const SIGNUP_PENDING='prisma-account-signup-confirm-pending';
const SCREENS=['intro','email','phone','reset','recovery','confirm','welcome','account'];
let guestGateModalActive=false;
let profileAvatarChoice='prism';

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
 document.body.classList.toggle('prisma-guest-gate-open',show&&guestGateModalActive);
 if(show&&focus)requestAnimationFrame(()=>focusScreen(screen));
 if(!show&&guestGateModalActive){
  guestGateModalActive=false;
  document.dispatchEvent(new Event('prisma:guest-gate-closed'));
 }
}
function fullName(value){
 return String(value||'').trim().replace(/\s+/g,' ').slice(0,60);
}
function storedAvatar(){
 return prismaAvatar(user?.user_metadata?.prisma_avatar).id;
}
function paintAvatar(element,value){
 if(!element)return;
 const choice=prismaAvatar(value);
 element.dataset.prismaAvatar=choice.id;
 element.replaceChildren();
 if(choice.id==='prism'){
  const img=document.createElement('img');
  img.src='./assets/prisma-app-icon.svg';
  img.alt='';
  img.decoding='async';
  element.append(img);
 }else{
  const glyph=document.createElement('span');
  glyph.className='prisma-avatar-glyph';
  glyph.textContent=choice.symbol;
  glyph.setAttribute('aria-hidden','true');
  element.append(glyph);
 }
}
// Only predefined avatar ids are accepted; no user-controlled HTML or URL.
function renderAvatarChoices(id,name,selected,onChange){
 const root=document.getElementById(id);if(!root)return;
 root.replaceChildren();
 for(const avatar of PRISMA_AVATARS){
  const label=document.createElement('label');
  label.className='auth-avatar-choice';
  const input=document.createElement('input');
  input.type='radio';input.name=name;input.value=avatar.id;
  input.checked=avatar.id===selected;
  input.setAttribute('aria-label',avatar.label);
  input.addEventListener('change',()=>{if(input.checked)onChange(avatar.id);});
  const face=document.createElement('span');
  face.className='prisma-avatar-face';
  paintAvatar(face,avatar.id);
  const caption=document.createElement('small');caption.textContent=avatar.label;
  label.append(input,face,caption);
  root.append(label);
 }
}
function prepareAccountAvatarChoices(){
 profileAvatarChoice=storedAvatar();
 renderAvatarChoices('auth-profile-avatar-choices','prisma-profile-avatar',profileAvatarChoice,id=>{profileAvatarChoice=id;});
}

function displayName(){
 const result=fullName(profile?.display_name)||
  fullName(user?.user_metadata?.full_name||user?.user_metadata?.name);
 return result||String(user?.email||user?.phone||'Mi cuenta').split('@')[0].slice(0,45);
}
function setProviderAvailability(){
 for(const provider of ['google','apple','phone']){
  // Google appears on the intro screen and both email tabs, with the same OAuth flow.
  const buttons=provider==='google'
   ?[$('#auth-google'),$('#auth-google-email')]
   :[$('#auth-'+provider)];
  const ready=provider!=='apple'&&config.enabled&&isAccountProviderAvailable(config.features,provider);
  for(const btn of buttons){
   if(!btn)continue;
   btn.disabled=!ready;
   btn.setAttribute('aria-disabled',String(!ready));
   if(provider==='apple'){
    btn.title='Próximamente';
    btn.setAttribute('aria-label','Continuar con Apple. Próximamente');
   }
   const label=btn.querySelector('small');
   if(label)label.textContent=ready?'Disponible':provider==='apple'?'Próximamente':provider==='phone'?'Requiere configurar SMS':'Por configurar';
  }
 }
 const email=$('#auth-email-choice');
 if(email)email.disabled=!config.enabled;
 // The HTML defaults to disabled to prevent submitting before the SDK loads.
 // Reactivate real email/signup controls only after Supabase is configured.
 for(const selector of ['#auth-submit','#auth-reset-submit','#auth-recovery-submit']){
  const button=$(selector);
  if(button)button.disabled=!config.enabled;
 }
 const availability=$('#auth-availability');
 if(availability)availability.textContent=config.enabled
  ?'Correo y contraseña disponibles. Otros métodos se habilitarán cuando estén configurados.'
  :'Las cuentas no están disponibles en este momento. Puedes seguir usando Prisma sin registrarte.';
}
function showEmailConfirmation(email,kind='signup'){
 const title=$('#auth-confirm-title'),description=$('#auth-confirm-description');
 if(title)title.textContent=kind==='reset'?'Revisa tu correo':'Confirma tu cuenta';
 if(description)description.textContent=kind==='reset'
  ?'Si existe una cuenta con ese correo, recibirás un enlace para crear una contraseña nueva.'
  :'Te enviamos un enlace de confirmación. Ábrelo para activar tu cuenta.';
 $('#auth-confirm-email').textContent=email;
 $('#auth-resend-signup')?.classList.toggle('hidden',kind!=='signup');
 showScreen('confirm');
}
function updateTabs(){
 const signup=authMode==='signup';
 $('#auth-tab-login')?.classList.toggle('active',!signup);
 $('#auth-tab-signup')?.classList.toggle('active',signup);
 $('#auth-name-label')?.classList.toggle('hidden',!signup);
 const nameInput=$('#auth-display-name');
 if(nameInput)nameInput.required=signup;
 $('#auth-password-confirm-label')?.classList.toggle('hidden',!signup);
 const confirm=$('#auth-password-confirm');
 if(confirm)confirm.required=signup;
 const password=$('#auth-password');
 if(password){
  password.autocomplete=signup?'new-password':'current-password';
  // Accounts created by the previous Prisma form accepted 6-character
  // passwords. Do not lock them out when increasing signup standards.
  password.minLength=signup?8:6;
 }
 const title=$('#auth-email-title');
 if(title)title.textContent=signup?'Crear cuenta en Prisma':'Accede a tu cuenta';
 const description=$('#auth-email-description');
 if(description)description.textContent=signup
  ?'Continúa con Google o crea tu cuenta con correo. Personaliza tu avatar después.'
  :'Bienvenido de nuevo. Continúa con Google o introduce tus datos.';
 const submit=$('#auth-submit');
 if(submit)submit.textContent=signup?'Crear mi cuenta':'Iniciar sesión';
 $('#auth-reset')?.classList.toggle('hidden',signup);
 info('');
}
function refreshIdentity(){
 document.dispatchEvent(new CustomEvent('prisma:auth-session-changed',{detail:{authenticated:Boolean(user?.id)}}));
 const label=$('#account-menu-state'),login=$('#profile-login-label');
 if(label)label.textContent=user?(user.email||user.phone||displayName()):'Modo invitado · gratis';
 if(login)login.textContent=user?'Mi perfil y preferencias':'Iniciar sesión o crear cuenta';
 const menuTitle=$('#profile-menu-title');
 if(menuTitle)menuTitle.textContent=user?'Hola, '+prismaFirstName(displayName()):'Prisma Space';
 $('#profile-guest-actions')?.classList.toggle('hidden',Boolean(user?.id));
 const accountEntry=$('#open-account-auth');
 if(accountEntry)accountEntry.setAttribute('aria-label',user?'Abrir mi perfil y preferencias':'Abrir acceso a Prisma: iniciar sesión o crear cuenta');
 const toggle=$('#profile-toggle');
 if(toggle)toggle.setAttribute('aria-label',user?'Abrir el espacio de '+displayName():'Abrir tu espacio en Prisma');
 paintAvatar($('#profile-avatar-face'),user?storedAvatar():'prism');
 $('#account-signout')?.classList.toggle('hidden',!user);
 $('#account-sync')?.classList.toggle('hidden',!user);
 const helper=$('#profile-menu-privacy');
 if(helper)helper.textContent=user
  ?(selectedSync()?'Tus conversaciones se mantienen sincronizadas entre tus dispositivos.':'Activa una sola vez la sincronización para continuar tus chats en otros dispositivos.')
  :'Puedes seguir usando Prisma gratis sin cuenta. Registrarte es opcional.';
 if(!user)return;
 const name=displayName();
 paintAvatar($('#auth-account-avatar'),storedAvatar());
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
 const syncButton=$('#auth-account-sync');
 if(syncButton)syncButton.textContent=selectedSync()?'Sincronizar ahora':'Activar sincronización en todos mis dispositivos';
 const profileSync=$('#account-sync');
 const profileSyncLabel=profileSync?.querySelector('span:last-child');
 if(profileSyncLabel)profileSyncLabel.textContent=selectedSync()?'Sincronizar ahora':'Activar sincronización';
 const syncStatus=$('#auth-account-sync-status');
 if(syncStatus)syncStatus.textContent=selectedSync()
  ?'Sincronización activada para todos tus dispositivos. Tus chats se actualizan automáticamente.'
  :'Tus conversaciones siguen en este dispositivo. Activa la sincronización una sola vez para compartirlas entre tus dispositivos.';
}
async function ensureProfile(){
 if(!api||!user?.id)return;
 const current=user.id;
 const {data,error}=await api.from('prisma_profiles')
  .select('user_id,display_name,theme,sync_enabled').eq('user_id',current).maybeSingle();
 if(user?.id!==current||error)return;
 if(data){
  profile=data;
  if(profile.sync_enabled===true)localStorage.setItem(SYNC_KEY,current);
  else localStorage.removeItem(SYNC_KEY);
  refreshIdentity();return;
 }
 const suggested=fullName(user.user_metadata?.full_name||user.user_metadata?.name);
 const {data:created,error:createError}=await api.from('prisma_profiles')
  .insert({user_id:current,display_name:suggested||null})
  .select('user_id,display_name,theme,sync_enabled').single();
 if(user?.id!==current)return;
 if(created&&!createError){profile=created;refreshIdentity();}
 else if(createError)console.warn('Prisma: perfil pendiente de sincronizar');
}
function openAccount(mode='intro'){
 guestGateModalActive=false;
 if(user){
  prepareAccountAvatarChoices();
  showScreen('account');
  refreshIdentity();
 }else{
  const directMode=mode==='login'||mode==='signup';
  authMode=mode==='signup'?'signup':'login';
  updateTabs();
  showScreen(directMode?'email':'intro');
  const title=$('#auth-title');
  if(title)title.textContent='Bienvenido a Prisma';
  const description=$('#auth-intro-screen .auth-description');
  if(description)description.textContent='Entra a tu espacio. Guarda tus preferencias y decide cuándo sincronizar tus conversaciones.';
  $('#auth-guest')?.classList.remove('hidden');
 }
 info('');
 showAuth(true,{focus:true});
}
export function openPrismaAuth(mode='intro'){openAccount(mode);}
export function isPrismaAuthenticated(){return Boolean(user?.id);}
export async function getPrismaSessionAccessToken(){
 if(!api)return '';
 try{
  const {data,error}=await api.auth.getSession();
  if(error)return '';
  return String(data?.session?.access_token||'');
 }catch{return '';}
}
export function openPrismaAuthForGuestLimit(mode='intro'){
 if(user?.id)return false;
 guestGateModalActive=true;
 showScreen('intro');
 const title=$('#auth-title');
 if(title)title.textContent='Continúa creando con Prisma';
 const description=$('#auth-intro-screen .auth-description');
 if(description)description.textContent='Ya probaste 4 trabajos con archivos. Crea una cuenta gratis para seguir adjuntando, procesando y generando resultados. Puedes seguir chateando sin cuenta.';
 // Never block dismissing the modal or reading previous conversations.
 $('#auth-guest')?.classList.add('hidden');
 info('Registro gratuito para seguir trabajando con archivos. El chat de texto sigue disponible.','info');
 if(mode==='signup'||mode==='login'){
  authMode=mode==='signup'?'signup':'login';
  updateTabs();
  showScreen('email');
 }
 document.dispatchEvent(new Event('prisma:guest-gate-open'));
 showAuth(true,{focus:false});
 return true;
}
function selectedSync(){
 return !!user&&profile?.sync_enabled===true;
}
function sanitizeChats(){
 let chats=[];
 try{chats=JSON.parse(localStorage.getItem(STORAGE)||'[]');}catch{}
 return Array.isArray(chats)?chats.map(serializeConversation).filter(Boolean).filter(hasConversationMessages):[];
}
function readDeletedIds(){
 try{
  const ids=JSON.parse(localStorage.getItem(DELETED_KEY)||'[]');
  return Array.isArray(ids)?[...new Set(ids.map(value=>String(value||'').slice(0,120)).filter(Boolean))]:[];
 }catch{return [];}
}
function queueDeletedId(id){
 const ids=new Set(readDeletedIds());ids.add(String(id).slice(0,120));
 try{localStorage.setItem(DELETED_KEY,JSON.stringify([...ids]));}
 catch(error){console.error('Prisma: no se pudo guardar la marca local de eliminación.',error?.message||error);}
}
async function refreshSyncState(){
 if(!api||!user)return;
 const activeUserId=user.id;
 const {data,error}=await api.from('prisma_profiles')
  .select('user_id,display_name,theme,sync_enabled').eq('user_id',activeUserId).maybeSingle();
 if(error||!data||user?.id!==activeUserId)return;
 profile=data;
 if(profile.sync_enabled===true)localStorage.setItem(SYNC_KEY,activeUserId);
 else localStorage.removeItem(SYNC_KEY);
 refreshIdentity();
 if(selectedSync())await doSync();
}
function startSyncWatchers(){
 if(syncInterval)return;
 const refresh=()=>{
  if(document.visibilityState==='visible')refreshSyncState().catch(error=>console.warn('Prisma sync:',error?.message||error));
 };
 syncInterval=window.setInterval(refresh,30000);
 window.addEventListener('focus',refresh);
 window.addEventListener('online',refresh);
 document.addEventListener('visibilitychange',refresh);
}
function conversationNeedsUpload(merged,remote){
 if(!remote||remote.deleted_at)return true;
 const previous=normalizeConversation({
  ...(remote.data&&typeof remote.data==='object'?remote.data:{}),
  id:remote.id,title:remote.title,pinned:remote.pinned
 });
 if(!previous)return true;
 if(merged.title!==previous.title||merged.pinned!==previous.pinned||merged.updated>previous.updated||merged.messages.length!==previous.messages.length)return true;
 return merged.messages.some((message,index)=>JSON.stringify(message)!==JSON.stringify(previous.messages[index]));
}
async function doSync(){
 if(!api||!user||!selectedSync())return;
 if(syncInFlight){syncQueued=true;return;}
 syncInFlight=true;
 const activeUserId=user.id;
 try{
  await (window.__prismaHistoryReady||Promise.resolve());
  await (window.__prismaHistoryWrite||Promise.resolve());
  let local=sanitizeChats();
  try{
   const indexed=(await readConversationSnapshot()).map(serializeConversation).filter(Boolean).filter(hasConversationMessages);
   if(indexed.length)local=mergeConversationLists(local,indexed).filter(hasConversationMessages);
  }catch(error){console.warn('Prisma: no se pudo leer la copia IndexedDB antes de sincronizar.',error?.message||error);}
  const remoteRows=[];
  const pageSize=200;
  for(let offset=0;;offset+=pageSize){
   const {data,error}=await api.from('prisma_conversations')
    .select('id,title,pinned,updated_at,data,deleted_at')
    .order('updated_at',{ascending:false}).range(offset,offset+pageSize-1);
   if(error)throw error;
   remoteRows.push(...(data||[]));
   if(!data||data.length<pageSize)break;
  }
  if(user?.id!==activeUserId)return;
  const remoteById=new Map(remoteRows.map(row=>[row.id,row]));
  const remoteDeleted=new Set(remoteRows.filter(row=>row.deleted_at).map(row=>row.id));
  const queuedDeleted=new Set(readDeletedIds());
  const deleted=new Set([...remoteDeleted,...queuedDeleted]);
  const remoteActive=remoteRows.filter(row=>!row.deleted_at&&!deleted.has(row.id)).map(row=>normalizeConversation({
   ...(row.data&&typeof row.data==='object'?row.data:{}),
   id:row.id,title:row.title,pinned:row.pinned
  })).filter(Boolean).filter(hasConversationMessages);
  const localActive=local.filter(chat=>!deleted.has(chat.id)&&hasConversationMessages(chat));
  const merged=mergeConversationLists(remoteActive,localActive).filter(hasConversationMessages);
  const upserts=merged.filter(chat=>conversationNeedsUpload(chat,remoteById.get(chat.id))).map(chat=>({
   user_id:activeUserId,id:chat.id,title:chat.title,pinned:!!chat.pinned,
   updated_at:new Date(Math.max(1,chat.updated)).toISOString(),deleted_at:null,data:chat
  }));
  for(let offset=0;offset<upserts.length;offset+=3){
   const {error}=await api.from('prisma_conversations')
    .upsert(upserts.slice(offset,offset+3),{onConflict:'user_id,id'});
   if(error){
    if(/prisma_conversation_payload_limit|check constraint|octet_length/i.test(error.message||'')){
     throw new Error('Una conversación supera el límite seguro de 5 MB para sincronizarse. Prisma no recortó ni borró su historial local.');
    }
    throw error;
   }
  }
  const localMessageIds=new Set(localActive.map(chat=>chat.id));
  const emptyRemoteIds=remoteRows.filter(row=>!row.deleted_at&&!deleted.has(row.id)).filter(row=>{
   const chat=normalizeConversation({
    ...(row.data&&typeof row.data==='object'?row.data:{}),
    id:row.id,title:row.title,pinned:row.pinned
   });
   return !!chat&&!hasConversationMessages(chat)&&!localMessageIds.has(row.id);
  }).map(row=>row.id);
  const pendingTombstones=[...new Set([...queuedDeleted,...emptyRemoteIds])].filter(id=>!remoteDeleted.has(id));
  if(pendingTombstones.length){
   const now=new Date().toISOString();
   const tombstones=pendingTombstones.map(id=>{
    const existing=remoteById.get(id);
    const data=normalizeConversation(existing?.data||{id,title:'Conversación eliminada',created:Date.now(),updated:Date.now(),messages:[]})||
     {id,title:'Conversación eliminada',created:Date.now(),updated:Date.now(),messages:[]};
    return {user_id:activeUserId,id,title:existing?.title||'Conversación eliminada',pinned:false,updated_at:now,deleted_at:now,data};
   });
   const {error}=await api.from('prisma_conversations').upsert(tombstones,{onConflict:'user_id,id'});
   if(error)throw error;
   try{localStorage.removeItem(DELETED_KEY);}catch{}
  }else if(queuedDeleted.size){
   try{localStorage.removeItem(DELETED_KEY);}catch{}
  }
  if(user?.id!==activeUserId||!selectedSync())return;
  try{localStorage.setItem(STORAGE,JSON.stringify(merged));}
  catch(error){console.warn('Prisma: historial remoto conservado en IndexedDB; localStorage lleno.',error?.message||error);}
  try{await saveConversationSnapshot(merged);}
  catch(error){console.error('Prisma: fallo al guardar la copia local del historial sincronizado.',error?.message||error);}
  document.dispatchEvent(new CustomEvent('prisma:remote-chats-ready',{detail:{conversations:merged}}));
 }finally{
  syncInFlight=false;
  if(syncQueued){syncQueued=false;scheduleSync();}
 }
}
function scheduleSync(){
 if(!selectedSync()||!api)return;
 clearTimeout(syncTimer);
 syncTimer=setTimeout(()=>doSync().catch(error=>console.warn('Prisma sincronización:',error?.message||error)),900);
}
async function performSync(){
 if(!api||!user)return;
 if(!profile)await ensureProfile();
 if(!profile?.sync_enabled){
  const agreed=window.confirm('¿Activar la sincronización de conversaciones en todos tus dispositivos? El texto de tus chats se guardará en tu cuenta Prisma. No se sincronizan archivos adjuntos ni contraseñas. Puedes seguir usando Prisma sin activar esta opción.');
  if(!agreed)return;
  const {data,error}=await api.from('prisma_profiles').update({
   sync_enabled:true,updated_at:new Date().toISOString()
  }).eq('user_id',user.id).select('user_id,display_name,theme,sync_enabled').single();
  if(error)throw error;
  profile=data;
 }
 localStorage.setItem(SYNC_KEY,user.id);
 startSyncWatchers();
 refreshIdentity();
 info('Sincronizando todo tu historial…');
 try{await doSync();info('Historial sincronizado. Desde ahora se actualizará en tus dispositivos.','success');}
 catch(error){info('La sincronización no se completó: '+accountAuthMessage(error),'error');}
 refreshIdentity();
}
async function signOut(){
 if(!api||!user)return;
 const synced=selectedSync();
 if(synced&&!window.confirm('Cerrarás sesión y se quitará de este dispositivo la copia local sincronizada. Tu historial seguirá guardado en Prisma y volverá a aparecer al iniciar sesión. ¿Continuar?'))return;
 const {error}=await api.auth.signOut();
 if(error){info(accountAuthMessage(error),'error');return;}
 if(synced){
  localStorage.removeItem(STORAGE);localStorage.removeItem(SYNC_KEY);
  document.dispatchEvent(new Event('prisma:clear-local-history'));
  await (window.__prismaClearHistoryPromise||Promise.resolve());
 }
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
 if(provider==='apple'||!api||!config.enabled||!isAccountProviderAvailable(config.features,provider)){
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
function signupRedirectUrl(){
 const target=new URL(location.origin+location.pathname);
 target.searchParams.set('prisma_welcome','1');
 return target.toString();
}
// Only verified, recently created/confirmed accounts qualify. This also
// covers a confirmation opened on another device or a later first sign-in.
function isRecentWelcomeAccount(account,now=Date.now()){
 if(!account?.id||!account.email||account.is_anonymous)return false;
 const confirmed=account.email_confirmed_at||account.confirmed_at;
 if(!confirmed)return false;
 const limit=14*24*60*60*1000;
 return [account.created_at,confirmed].some(value=>{
  const time=Date.parse(value||'');
  return Number.isFinite(time)&&time<=now+60000&&now-time<=limit;
 });
}
const welcomeRequestsInFlight=new Set();
async function sendWelcomeEmailIfEligible(newUser){
 if(!api||!isRecentWelcomeAccount(newUser)||welcomeRequestsInFlight.has(newUser.id))return;
 welcomeRequestsInFlight.add(newUser.id);
 try{
  const {data,error}=await api.auth.getSession();
  const session=data?.session;
  if(error||!session?.access_token||session.user?.id!==newUser.id)return;
  const response=await fetch('/api/auth/welcome',{
   method:'POST',
   headers:{Authorization:'Bearer '+session.access_token,Accept:'application/json'}
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error('HTTP '+response.status);
  if(result.pending)return; // Retry on a later authenticated visit.
  const target=new URL(location.href);
  if(target.searchParams.has('prisma_welcome')){
   target.searchParams.delete('prisma_welcome');
   history.replaceState(history.state,'',target.pathname+target.search+target.hash);
  }
  sessionStorage.removeItem(SIGNUP_PENDING);
 }catch(error){
  // This email is optional and must never block access or registration.
  console.warn('Prisma welcome email:',error?.message||error);
 }finally{
  welcomeRequestsInFlight.delete(newUser.id);
 }
}
async function onSignedIn(newUser,{fromInteraction=false,isNewSignup=false}={}){
 if(!newUser?.id)return;
 const changed=user?.id!==newUser.id;
 user=newUser;
 if(changed)profile=null;
 refreshIdentity();
 // Deliver on the first confirmed session, whether opened from the signup
 // email, Google OAuth, another device, or a later login.
 if(!recovering)void sendWelcomeEmailIfEligible(newUser);
 await ensureProfile();
 startSyncWatchers();
 if(selectedSync()){
  await (window.__prismaHistoryReady||Promise.resolve());
  try{await doSync();}catch(error){console.warn('Prisma: no se pudo completar la sincronización inicial.',error?.message||error);}
 }
 const oauth=sessionStorage.getItem(OAUTH_PENDING);
 const signupPending=Number(sessionStorage.getItem(SIGNUP_PENDING)||0);
 const pendingSignupValid=signupPending>0&&Date.now()-signupPending<86400000;
 const welcome=fromInteraction||pendingAuth||Boolean(oauth)||pendingSignupValid;
 if(oauth)sessionStorage.removeItem(OAUTH_PENDING);
 if(pendingSignupValid)sessionStorage.removeItem(SIGNUP_PENDING);
 pendingAuth=false;
 if(recovering)return;
 // Email delivery is not gated on a redirect query flag: a verified account
 // can arrive via another device or sign in after its confirmation link.
 // The server checks freshness and D1 makes the welcome exactly-once.
 if(welcome&&!handledWelcome){
  handledWelcome=true;
  const title=$('#auth-welcome-title');
  if(title)title.textContent='¡Bienvenido a Prisma, '+prismaFirstName(displayName())+'!';
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
   const error=authMode==='signup'
    ?validateAccountPassword(password,$('#auth-password-confirm')?.value||'')
    :password?'':'Introduce tu contraseña.';
   if(error){info(error,'error');return;}
   const signup=authMode==='signup';
   const chosenName=fullName($('#auth-display-name')?.value);
   if(signup&&chosenName.length<2){
    info('Indica tu nombre o apodo (al menos 2 caracteres) para personalizar tu espacio.','error');
    return;
   }
   info(signup?'Creando tu espacio personalizado…':'Comprobando tus credenciales…');
   const {data,error:authError}=signup
    ?await api.auth.signUp({
      email,password,options:{
       data:{full_name:chosenName},
       emailRedirectTo:signupRedirectUrl()
      }
     })
    :await api.auth.signInWithPassword({email,password});
   if(authError)throw authError;
   if(signup&&!data?.session){
    sessionStorage.setItem(SIGNUP_PENDING,String(Date.now()));
    showEmailConfirmation(email,'signup');
    info('Revisa tu correo para confirmar tu cuenta.','success');
    return;
   }
   pendingAuth=true;
   if(data?.user)await onSignedIn(data.user,{fromInteraction:true,isNewSignup:signup});
  });
 });
 for(const selector of ['#auth-google','#auth-google-email']){
  $(selector)?.addEventListener('click',()=>signInProvider('google'));
 }
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
   showEmailConfirmation(email,'reset');
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
 $('#auth-resend-signup')?.addEventListener('click',()=>{
  const button=$('#auth-resend-signup');
  withBusy(button,async()=>{
   if(!api)throw Error('El servicio de correo no está disponible.');
   const email=String($('#auth-confirm-email')?.textContent||'').trim();
   if(!email)throw Error('No se encontró el correo para reenviar.');
   const {error}=await api.auth.resend({type:'signup',email,
    options:{emailRedirectTo:signupRedirectUrl()}});
   if(error)throw error;
   info('Si la cuenta está pendiente, llegará una nueva confirmación. Espera unos minutos antes de volver a intentarlo.','success');
  });
 });
 $('#auth-confirm-done')?.addEventListener('click',()=>showAuth(false));
 $('#auth-welcome-continue')?.addEventListener('click',()=>showAuth(false));
 $('#auth-profile-form')?.addEventListener('submit',event=>{
  event.preventDefault();
  withBusy($('#auth-profile-save'),async()=>{
   if(!api||!user)return;
   const id=user.id;
   const name=fullName($('#auth-profile-name')?.value);
   const avatar=prismaAvatar(profileAvatarChoice).id;
   // A safe visual preference in editable auth metadata, never for RLS roles.
   const {data:updatedAuth,error:avatarError}=await api.auth.updateUser({data:{prisma_avatar:avatar}});
   if(avatarError)throw avatarError;
   if(user?.id!==id)return;
   if(updatedAuth?.user)user=updatedAuth.user;
   const fields={display_name:name||null,updated_at:new Date().toISOString()};
   // Keep sync_enabled and theme untouched when editing the visible profile.
   const query=profile
    ?api.from('prisma_profiles').update(fields).eq('user_id',id)
    :api.from('prisma_profiles').insert({...fields,user_id:id});
   const {data,error}=await query.select('user_id,display_name,theme,sync_enabled').single();
   if(error){refreshIdentity();throw error;}
   if(user?.id!==id)return;
   profile=data;
   refreshIdentity();
   info('Tu nombre y tu avatar se guardaron correctamente.','success');
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
 document.addEventListener('prisma:chat-deleted',event=>{
  if(!api||!selectedSync())return;
  const id=String(event.detail?.id||'');
  if(!id)return;
  queueDeletedId(id);
  scheduleSync();
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
