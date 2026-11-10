// Four completed Prisma Core tasks per guest browser before account creation.
// This is a product onboarding limit, not a server-side security or rate limit.
export const GUEST_TASK_LIMIT=4;
export const GUEST_TASK_STORAGE_KEY='prisma-core-guest-completed-v1';

export function readGuestTaskCount(storage){
 try{
  const raw=Number(storage?.getItem(GUEST_TASK_STORAGE_KEY)||0);
  return Number.isFinite(raw)?Math.min(GUEST_TASK_LIMIT,Math.max(0,Math.floor(raw))):0;
 }catch{return 0;}
}
export function isGuestFileTask({text='',attachments=[]}={}){
 if(Array.isArray(attachments)&&attachments.length>0)return true;
 const q=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 // Gate tangible file outputs and file transformations, not ordinary chat.
 const output=/(?:descarga|descargar|archivo descargable|guardar (?:como|en) (?:pdf|word|excel|mp3|png|jpg|zip)|exporta|exportar|convierte|convertir|comprime|comprimir|transcribe|transcribir|genera|generar|crea|crear|haz|prepara|edita|editar|reduce|transforma|separa|divide|extrae)/;
 const artifact=/\b(?:archivos?|documentos?|pdf|docx?|word|xlsx?|excel|csv|zip|png|jpe?g|webp|gif|imagenes?|fotos?|audios?|mp3|wav|videos?|mp4|mov|miniaturas?|logos?|flyers?|banners?|portadas?|html descargable)\b/;
 const directFile=/\b(?:subir|adjuntar|cargar|procesar|comprimir|convertir|descargar|exportar|transcribir)\b/;
 const produce=/\b(?:quiero|necesito|dame|hazme|puedes hacer|dibujame|dibuja|disena|disename|fabricame|renderiza)\b/;
 return (output.test(q)&&artifact.test(q))||(directFile.test(q)&&artifact.test(q))||
   (produce.test(q)&&/\b(?:una?\s+)?(?:imagen|foto|logo|miniatura|flyer|banner|video|audio|mp3|pdf|zip|archivo|documento descargable)\b/.test(q));
}
export function canGuestSubmit({signedIn=false,count=0,fileTask=true}={}){
 return signedIn||!fileTask||Number(count)<GUEST_TASK_LIMIT;
}
export function recordGuestTask(storage,{signedIn=false}={}){
 if(signedIn)return {count:readGuestTaskCount(storage),justReachedLimit:false};
 const oldCount=readGuestTaskCount(storage);
 const count=Math.min(GUEST_TASK_LIMIT,oldCount+1);
 try{storage?.setItem(GUEST_TASK_STORAGE_KEY,String(count));}
 catch(error){console.warn('Prisma: no se pudo guardar el progreso de invitado.',error?.message||error);}
 return {count,justReachedLimit:oldCount<GUEST_TASK_LIMIT&&count===GUEST_TASK_LIMIT};
}
