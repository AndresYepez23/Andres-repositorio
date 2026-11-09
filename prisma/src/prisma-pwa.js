// PWA UX: lightweight top invite, platform-specific installation and opt-out.
let pendingPrompt=null;
let lastPlatform='';
const $=selector=>document.querySelector(selector);
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const ios=()=>/iPad|iPhone|iPod/i.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
const Android=()=>/Android/i.test(navigator.userAgent);
function setGuide(text){const el=$('#prisma-install-steps');if(el)el.textContent=text;}
function visibleInvite(){
 if(standalone()||localStorage.getItem('prisma-pwa-dismissed')==='1')return false;
 return ios()||Android()||!!pendingPrompt;
}
function renderInvite(){
 const banner=$('#prisma-install-banner');if(!banner)return;
 banner.classList.toggle('hidden',!visibleInvite());
 const copy=$('#prisma-install-copy');
 if(copy)copy.textContent='Prisma Space en tu pantalla de inicio';
}
export function openPrismaInstall(){
 if(standalone())return;
 if(pendingPrompt){
  const prompt=pendingPrompt;pendingPrompt=null;
  prompt.prompt();
  Promise.resolve(prompt.userChoice).finally(renderInvite);
  return;
 }
 const modal=$('#prisma-install-guide');
 if(!modal)return;
 if(ios()){
  setGuide('En Safari, toca Compartir y después «Añadir a pantalla de inicio». Activa «Abrir como app» y confirma con «Añadir».');
 }else if(Android()){
  setGuide('Abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».');
 }else{
  setGuide('Usa el menú de Chrome o Edge para instalar Prisma Space. En Safari de Mac: Archivo → Añadir al Dock.');
 }
 modal.classList.remove('hidden');
}
export function setupPrismaPWA(){
 if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'})
   .catch(error=>console.warn('[Prisma PWA] No se pudo registrar el modo sin conexión:',error?.message)),{once:true});
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();pendingPrompt=event;renderInvite();
 });
 window.addEventListener('appinstalled',()=>{
  pendingPrompt=null;
  $('#prisma-install-banner')?.classList.add('hidden');
  $('#prisma-install-guide')?.classList.add('hidden');
 });
 $('#prisma-install-dismiss')?.addEventListener('click',()=>{
  localStorage.setItem('prisma-pwa-dismissed','1');
  $('#prisma-install-banner')?.classList.add('hidden');
 });
 $('#prisma-install-button')?.addEventListener('click',openPrismaInstall);
 $('#profile-install-app')?.addEventListener('click',()=>{
  document.dispatchEvent(new Event('prisma:close-profile'));
  openPrismaInstall();
 });
 $('#prisma-install-guide-close')?.addEventListener('click',()=>$('#prisma-install-guide')?.classList.add('hidden'));
 $('#prisma-install-guide')?.addEventListener('click',event=>{if(event.target===$('#prisma-install-guide'))event.target.classList.add('hidden');});
 if(!standalone())window.setTimeout(renderInvite,2100);
}
