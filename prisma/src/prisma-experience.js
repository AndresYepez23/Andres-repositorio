import { initPrismaAccount, openPrismaAuth } from './prisma-account.js';
import { initPrismaSettings } from './prisma-settings.js';
import { initPrismaDeveloperBridge } from './developer-bridge.js';
const $=s=>document.querySelector(s);
const HIDE_UNTIL='prisma-pwa-banner-hide-until';
let installPrompt=null;
const inStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function hideBanner(days=14){
 $('#pwa-banner')?.classList.add('hidden');
 if(days)localStorage.setItem(HIDE_UNTIL,String(Date.now()+days*86400000));
}
function updateBanner(){
 if(inStandalone()){hideBanner(0);return;}
 const until=Number(localStorage.getItem(HIDE_UNTIL)||0);
 if(until>Date.now()){hideBanner(0);return;}
 $('#pwa-banner')?.classList.remove('hidden');
}
function openInstructions(){
 const dialog=$('#pwa-instructions'),label=$('#pwa-instructions-text');
 if(!dialog)return;
 label.textContent=isIOS()
 ? 'En Safari, toca Compartir y elige «Añadir a pantalla de inicio». Confirma «Añadir» y abre Prisma desde su icono.'
 : 'En el menú de tu navegador, selecciona «Instalar aplicación» o «Añadir a pantalla de inicio». Algunas opciones dependen del navegador.';
 dialog.classList.remove('hidden');$('#pwa-instructions-done')?.focus();
}
export async function askInstall(){
 if(inStandalone())return;
 if(installPrompt){
  const event=installPrompt;installPrompt=null;
  try{await event.prompt();const choice=await event.userChoice;if(choice?.outcome==='accepted')hideBanner(0);}
  catch{openInstructions();}
 }else openInstructions();
}
function initPwa(){
 if('serviceWorker' in navigator){
  // A PWA can keep an old JavaScript module graph after a new worker activates.
  // Reload only when this page already had a controller; first installation stays put.
  const hadController=!!navigator.serviceWorker.controller;
  if(hadController){
   let refreshing=false;
   navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshing)return;
    refreshing=true;
    const splash=$('#app-startup'),label=$('#app-startup-status');
    if(label)label.textContent='Actualizando Prisma Space…';
    splash?.classList.remove('hidden');
    document.body.classList.add('app-booting');
    location.reload();
   },{once:true});
  }
  window.addEventListener('load',()=>{
   navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'})
    .then(registration=>registration.update().catch(error=>console.warn('No se pudo comprobar la actualización de Prisma:',error?.message||error)))
    .catch(error=>console.warn('PWA sin registro:',error?.message||error));
  },{once:true});
 }
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateBanner();});
 window.addEventListener('appinstalled',()=>{installPrompt=null;hideBanner(0);});
 $('#pwa-install')?.addEventListener('click',askInstall);
 $('#profile-install')?.addEventListener('click',()=>{document.dispatchEvent(new Event('prisma:close-profile'));askInstall();});
 document.addEventListener('prisma:request-install',askInstall);
 $('#core-more-install')?.addEventListener('click',askInstall);
 $('#pwa-dismiss')?.addEventListener('click',()=>hideBanner(14));
 $('#pwa-instructions-close')?.addEventListener('click',()=>$('#pwa-instructions')?.classList.add('hidden'));
 $('#pwa-instructions-done')?.addEventListener('click',()=>{$('#pwa-instructions')?.classList.add('hidden');hideBanner(14);});
 $('#pwa-instructions')?.addEventListener('click',event=>{if(event.target===$('#pwa-instructions'))$('#pwa-instructions').classList.add('hidden');});
 if(!inStandalone()&&(isIOS()||/Android/i.test(navigator.userAgent)))setTimeout(updateBanner,1300);
}
function closeMore(){
 $('#core-more-menu')?.classList.add('hidden');$('#core-top-more')?.setAttribute('aria-expanded','false');
}
function initCoreMenu(){
 $('#core-top-new')?.addEventListener('click',()=>$('#core-history-new')?.click());
 $('#core-top-more')?.addEventListener('click',event=>{
  event.stopPropagation();const menu=$('#core-more-menu'),open=menu.classList.toggle('hidden')===false;
  $('#core-top-more')?.setAttribute('aria-expanded',String(open));
 });
 $('#core-more-history')?.addEventListener('click',()=>{
  closeMore();const sidebar=$('#sidebar');
  if(window.matchMedia('(max-width:850px)').matches && !sidebar?.classList.contains('open'))$('#mobile-menu')?.click();
  $('#core-history-search')?.focus();
 });
 $('#core-more-export')?.addEventListener('click',()=>{closeMore();document.dispatchEvent(new Event('prisma:core-export-request'));});
 $('#core-more-rename')?.addEventListener('click',()=>{closeMore();document.dispatchEvent(new Event('prisma:core-rename-request'));});
 $('#core-more-delete')?.addEventListener('click',()=>{closeMore();document.dispatchEvent(new Event('prisma:core-delete-request'));});
 $('#core-more-voice')?.addEventListener('click',()=>{closeMore();$('#core-talk')?.click();});
 document.addEventListener('click',event=>{if(!event.target.closest?.('#core-top-more,#core-more-menu'))closeMore();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMore();});
}
export function initPrismaExperience(){
 // Keep the personal sheet out of Safari's backdrop-filter stacking context.
 const profile=$('#profile-menu');if(profile&&profile.parentElement!==document.body)document.body.append(profile);
 initPwa();
 initCoreMenu();
 initPrismaSettings();
 initPrismaDeveloperBridge();
 initPrismaAccount().catch(error=>console.warn('Cuenta Prisma no conectada:',error?.message||error));
 $('#open-account-auth')?.addEventListener('click',()=>{document.dispatchEvent(new Event('prisma:close-profile'));openPrismaAuth();});
 $('#profile-guest-login')?.addEventListener('click',()=>{
  document.dispatchEvent(new Event('prisma:close-profile'));
  openPrismaAuth('login');
 });
 $('#profile-guest-signup')?.addEventListener('click',()=>{
  document.dispatchEvent(new Event('prisma:close-profile'));
  openPrismaAuth('signup');
 });
 document.addEventListener('prisma:close-profile',()=>{
  $('#profile-menu')?.classList.add('hidden');document.body.classList.remove('profile-open');$('#profile-toggle')?.setAttribute('aria-expanded','false');
 });
}
