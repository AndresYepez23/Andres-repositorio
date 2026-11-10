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
export function canGuestSubmit({signedIn=false,count=0}={}){
 return signedIn||Number(count)<GUEST_TASK_LIMIT;
}
export function recordGuestTask(storage,{signedIn=false}={}){
 if(signedIn)return {count:readGuestTaskCount(storage),justReachedLimit:false};
 const oldCount=readGuestTaskCount(storage);
 const count=Math.min(GUEST_TASK_LIMIT,oldCount+1);
 try{storage?.setItem(GUEST_TASK_STORAGE_KEY,String(count));}
 catch(error){console.warn('Prisma: no se pudo guardar el progreso de invitado.',error?.message||error);}
 return {count,justReachedLimit:oldCount<GUEST_TASK_LIMIT&&count===GUEST_TASK_LIMIT};
}
