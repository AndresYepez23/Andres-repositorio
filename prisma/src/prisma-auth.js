// Prisma Space Auth — isolated Supabase project, optional login.
const SUPABASE_URL = 'https://hyoxywiwhnhfekakhivp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3I8riH969aihitAxy_qC4w_Vfpuacpd';
let clientPromise;
let signedInUser = null;
let initialized = false;
const $ = selector => document.querySelector(selector);
export function getPrismaUser(){return signedInUser;}
export function prismaAuthReady(){return initialized;}
export async function getPrismaClient(){
  if(!clientPromise)clientPromise=import('https://esm.sh/@supabase/supabase-js@2.57.0')
    .then(({createClient})=>createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}
    })).catch(error=>{clientPromise=null;throw error;});
  return clientPromise;
}
const updateNotice=(message,kind='info')=>{
 const el=$('#prisma-auth-message');if(el){el.textContent=message;el.dataset.kind=kind;}
};
export function openPrismaAuth(){
 const modal=$('#prisma-auth-modal');if(!modal)return;
 modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
 document.body.classList.add('prisma-auth-open');
 $('#prisma-auth-email')?.focus({preventScroll:true});
}
export function closePrismaAuth(){
 const modal=$('#prisma-auth-modal');if(!modal)return;
 modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');
 document.body.classList.remove('prisma-auth-open');
}
function setAuthBusy(busy){
 $('#prisma-auth-submit').disabled=busy;
 $('#prisma-auth-submit').textContent=busy?'Procesando…':$('#prisma-auth-form')?.dataset.mode==='signup'?'Crear cuenta':'Iniciar sesión';
}
function updateUserUI(user){
 signedInUser=user||null;
 const guest=!user;
 $('#profile-guest')?.classList.toggle('hidden',!guest);
 $('#profile-member')?.classList.toggle('hidden',guest);
 const label=user?.email||user?.phone||'Cuenta de Prisma';
 const short=user?.email?.split('@')[0]||'Tú';
 if($('#profile-email'))$('#profile-email').textContent=label;
 if($('#profile-name'))$('#profile-name').textContent=short;
 if($('#profile-avatar'))$('#profile-avatar').textContent=(short[0]||'P').toUpperCase();
 if($('#profile-toggle'))$('#profile-toggle').textContent=(short[0]||'I').toUpperCase();
 const foot=$('#sidebar-account-label');if(foot)foot.textContent=user?short:'Modo invitado';
 document.dispatchEvent(new CustomEvent('prisma:auth-changed',{detail:{user:user?{id:user.id,email:user.email||'',phone:user.phone||''}:null}}));
 if(user)closePrismaAuth();
}
async function refreshAvailableProviders(){
 try{
  const result=await fetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_PUBLISHABLE_KEY},cache:'no-store'});
  if(!result.ok)return;
  const settings=await result.json();
  for(const name of ['google','apple']){
   const button=$('#prisma-auth-'+name);
   if(!button)continue;
   const enabled=!!settings['external_'+name];
   button.disabled=!enabled;
   button.title=enabled?'Continuar con '+name:'Este proveedor necesita configuración en Supabase Auth';
   button.querySelector('small')?.replaceChildren(document.createTextNode(enabled?'':'Por activar'));
  }
  const phone=$('#prisma-auth-phone');
  if(phone){
   const enabled=!!settings.external_phone||!!settings.sms_provider;
   phone.disabled=!enabled;
   phone.title=enabled?'Continuar por SMS':'Se requiere activar un proveedor de SMS antes de usar teléfono';
   phone.querySelector('small')?.replaceChildren(document.createTextNode(enabled?'':'Por activar'));
  }
 }catch{ /* keep OAuth and SMS disabled rather than pretending they work */ }
}
function setupAuthForm(){
 const form=$('#prisma-auth-form');
 if(!form)return;
 const setMode=mode=>{
  form.dataset.mode=mode;
  $('#prisma-auth-submit').textContent=mode==='signup'?'Crear cuenta':'Iniciar sesión';
  $('#prisma-auth-mode-toggle').textContent=mode==='signup'?'¿Ya tienes cuenta? Inicia sesión':'¿No tienes cuenta? Regístrate';
  $('#prisma-auth-title').textContent=mode==='signup'?'Crea tu cuenta en Prisma':'Bienvenido a Prisma';
  updateNotice(mode==='signup'?'Regístrate para sincronizar tus chats. Puedes seguir usando Prisma gratis sin cuenta.':'Tu cuenta es opcional; como invitado puedes seguir usando Prisma gratis.');
 };
 setMode('signin');
 $('#prisma-auth-mode-toggle')?.addEventListener('click',()=>setMode(form.dataset.mode==='signup'?'signin':'signup'));
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const email=$('#prisma-auth-email').value.trim();
  const password=$('#prisma-auth-password').value;
  if(!email||password.length<6){updateNotice('Indica un correo válido y una contraseña de al menos 6 caracteres.','error');return;}
  setAuthBusy(true);
  try{
   const supabase=await getPrismaClient();
   const {data,error}=form.dataset.mode==='signup'
     ? await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}})
     : await supabase.auth.signInWithPassword({email,password});
   if(error)throw error;
   if(!data?.session){
    updateNotice('Revisa tu correo para confirmar la cuenta. Si no recibes el enlace, verifica la configuración de correos y redirecciones de Prisma.','success');
   }else updateNotice('Sesión iniciada correctamente.','success');
  }catch(error){updateNotice(error?.message||'No fue posible conectar con la autenticación.','error');}
  finally{setAuthBusy(false);}
 });
 $('#prisma-auth-reset')?.addEventListener('click',async()=>{
  const email=$('#prisma-auth-email').value.trim();
  if(!email){updateNotice('Escribe tu correo primero.','error');return;}
  try{const client=await getPrismaClient();const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;updateNotice('Si el correo pertenece a una cuenta, recibirás instrucciones para recuperar el acceso.','success');}
  catch(error){updateNotice(error?.message||'No se pudo solicitar el correo de recuperación.','error');}
 });
 const social=async name=>{
  try{const client=await getPrismaClient();const {error}=await client.auth.signInWithOAuth({provider:name,options:{redirectTo:location.origin+location.pathname}});if(error)throw error;}
  catch(error){updateNotice(error?.message||'No se pudo iniciar sesión con '+name+'.','error');}
 };
 $('#prisma-auth-google')?.addEventListener('click',()=>social('google'));
 $('#prisma-auth-apple')?.addEventListener('click',()=>social('apple'));
 $('#prisma-auth-phone')?.addEventListener('click',()=>{
  $('#prisma-auth-phone-form')?.classList.toggle('hidden');
 });
 $('#prisma-auth-phone-send')?.addEventListener('click',async()=>{
  const phone=$('#prisma-auth-phone-number').value.trim();
  if(!/^\+[1-9]\d{6,14}$/.test(phone)){updateNotice('Introduce el teléfono con código de país, por ejemplo +57…','error');return;}
  try{const client=await getPrismaClient();const {error}=await client.auth.signInWithOtp({phone});if(error)throw error;updateNotice('Te enviamos un código por SMS.','success');$('#prisma-auth-phone-verify')?.classList.remove('hidden');}
  catch(error){updateNotice(error?.message||'No se pudo enviar el SMS.','error');}
 });
 $('#prisma-auth-phone-confirm')?.addEventListener('click',async()=>{
  const phone=$('#prisma-auth-phone-number').value.trim();
  const token=$('#prisma-auth-phone-code').value.trim();
  try{const client=await getPrismaClient();const {error}=await client.auth.verifyOtp({phone,token,type:'sms'});if(error)throw error;updateNotice('Teléfono verificado.','success');}
  catch(error){updateNotice(error?.message||'Código incorrecto o vencido.','error');}
 });
}
export async function signOutPrisma(){
 try{const client=await getPrismaClient();const {error}=await client.auth.signOut();if(error)throw error;}
 catch(error){updateNotice(error?.message||'No se pudo cerrar la sesión.','error');}
}
export function setupPrismaAuth(){
 $('#prisma-auth-close')?.addEventListener('click',closePrismaAuth);
 $('#prisma-auth-modal')?.addEventListener('click',event=>{if(event.target===$('#prisma-auth-modal'))closePrismaAuth();});
 $('#profile-signin')?.addEventListener('click',()=>{document.dispatchEvent(new Event('prisma:close-profile'));openPrismaAuth();});
 $('#profile-logout')?.addEventListener('click',async()=>{await signOutPrisma();document.dispatchEvent(new Event('prisma:close-profile'));});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closePrismaAuth();});
 setupAuthForm();
 refreshAvailableProviders();
 getPrismaClient().then(async client=>{
  client.auth.onAuthStateChange((_event,session)=>{
   // Defer any work that uses Supabase from inside the auth callback.
   setTimeout(()=>updateUserUI(session?.user||null),0);
  });
  const {data,error}=await client.auth.getSession();
  initialized=true;
  if(error)console.warn('[Prisma Auth]',error.message);
  updateUserUI(data?.session?.user||null);
 }).catch(error=>{
  console.warn('[Prisma Auth] SDK no disponible:',error?.message);
  initialized=true;
  updateUserUI(null);
  updateNotice('La conexión de cuentas no está disponible en este navegador. Puedes seguir usando Prisma como invitado.','warning');
 });
}
