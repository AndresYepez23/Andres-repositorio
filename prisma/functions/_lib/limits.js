import { getOpenRouterLimits } from "./openrouter.js";
import { getCredentialSlots } from "./credential-pool.js";

// Atomic usage counters in D1. Limits apply to ALL provider keys, including backups.
export const OPENROUTER_VISITOR_LIMITS=Object.freeze({perMinute:5,perDay:20});
export const LIMITS=Object.freeze({
 gemini:50,huggingface:10,groq:30,pollinations:10,cloudflare:30,
 kilo:20,requesty:25,sensenova:25,zai:25,aihubmix:10,
 "pollinations-image":2,"cloudflare-image":3,"huggingface-image":1,
 "groq-audio":3,"cloudflare-audio":3,"pollinations-audio":2,"gemini-image":2
});

const PROVIDER_MINUTE_LIMITS=Object.freeze({kilo:3,requesty:10,sensenova:5,zai:3,aihubmix:10});
export function getProviderMinuteLimit(provider){return PROVIDER_MINUTE_LIMITS[provider]||null;}

// Internal budgets are per provider/project, not per API key. Multiple keys
// in one account do not multiply the provider's real quota. An owner can tune
// a safe app-side ceiling with PRISMA_<PROVIDER>_DAILY_LIMIT in Cloudflare.
export function getProviderDailyLimit(env,provider){
 const variable='PRISMA_'+String(provider||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_')+'_DAILY_LIMIT';
 const configured=Number(env?.[variable]);
 if(Number.isFinite(configured)&&configured>0)return Math.max(1,Math.min(5000,Math.floor(configured)));
 if(provider==="aihubmix"&&env?.AIHUBMIX_DAILY_QUOTA_ACTIVE==="1")return 15;
 return LIMITS[provider]||10;
}
export function getSharedDailyBudget(env){
 const pooled=['gemini','groq','huggingface','pollinations','requesty','sensenova','zai','aihubmix'];
 let budget=pooled.reduce((sum,provider)=>sum+(getCredentialSlots(env,provider).length?getProviderDailyLimit(env,provider):0),0);
 budget+=getProviderDailyLimit(env,'kilo');
 if(env?.AI?.run)budget+=getProviderDailyLimit(env,'cloudflare');
 const configured=Number(env?.PRISMA_TOTAL_DAILY_LIMIT);
 if(Number.isFinite(configured)&&configured>0)budget=Math.min(budget,Math.floor(configured));
 return Math.max(1,Math.min(600,budget));
}
export function getVisitorDailyLimit(env){
 const configured=Number(env?.PRISMA_VISITOR_DAILY_LIMIT);
 if(Number.isFinite(configured)&&configured>0)return Math.max(10,Math.min(200,Math.floor(configured)));
 return Math.max(30,Math.min(90,Math.ceil(getSharedDailyBudget(env)*.5)));
}
function windows(now=Date.now()){
 const minute=Math.floor(now/60000),day=Math.floor(minute/1440)*1440;
 return {minute,day};
}

export async function getProviderUsage(env,provider,dailyLimit=getProviderDailyLimit(env,provider),perMinuteLimit=null){
 const db=env.PRISMA_RATE_DB;
 if(!db?.prepare)return {available:false,daily:null,minute:null};
 const {minute,day}=windows();
 try{
  const dailyRow=await db.prepare("SELECT request_count FROM ai_rate_limits WHERE scope=? AND window_start=?")
   .bind("provider-day:"+provider,day).first();
  const dailyUsed=Number(dailyRow?.request_count||0);
  let minuteUsage=null;
  if(perMinuteLimit!==null){
   const minuteRow=await db.prepare("SELECT request_count FROM ai_rate_limits WHERE scope=? AND window_start=?")
    .bind("provider-minute:"+provider,minute).first();
   const used=Number(minuteRow?.request_count||0);
   minuteUsage={used,limit:perMinuteLimit,remaining:Math.max(0,perMinuteLimit-used),resetAt:new Date((minute+1)*60000).toISOString()};
  }
  return {
   available:true,
   daily:{used:dailyUsed,limit:dailyLimit,remaining:Math.max(0,dailyLimit-dailyUsed),resetAt:new Date((day+1440)*60000).toISOString()},
   minute:minuteUsage
  };
 }catch(error){
  console.error("Prisma provider usage lookup",error?.message||error);
  return {available:false,daily:null,minute:null};
 }
}

export async function getProviderLifetimeUsage(env,provider,limit=10){
 const db=env.PRISMA_RATE_DB;
 if(!db?.prepare)return {available:false,used:0,limit,remaining:limit};
 try{
  const row=await db.prepare("SELECT request_count FROM ai_rate_limits WHERE scope=? AND window_start=0").bind("provider-lifetime:"+provider).first();
  const used=Number(row?.request_count||0);
  return {available:true,used,limit,remaining:Math.max(0,limit-used)};
 }catch(error){
  console.error("Prisma provider lifetime usage lookup",error?.message||error);
  return {available:false,used:0,limit,remaining:limit};
 }
}

export async function checkLimits(env,request,provider){
 const db=env.PRISMA_RATE_DB;
 if(!db?.prepare)return {status:503,code:"LIMITS_UNAVAILABLE",error:"Prisma no puede comprobar sus límites de consumo."};
 const ip=request.headers.get("CF-Connecting-IP")||"unknown";
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));
 const key=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("").slice(0,32);
 const {minute,day}=windows();
 const openrouterLimits=provider==="openrouter"?await getOpenRouterLimits(env):null;
 const providerDailyLimit=provider==="openrouter"?openrouterLimits.dailyLimit:provider==="cloudflare-audio"?Math.min(3,getProviderDailyLimit(env,provider)):getProviderDailyLimit(env,provider);
 // Distinct per-visitor anti-abuse limits allow the backup to respond
 // even if this visitor has already used their daily/minute allowance
 // with Prisma's main providers. Neither allowance is unlimited.
 const isBackup=provider==="openrouter";
 const scopes=[
  [isBackup?"ip-minute:openrouter:"+key:"ip-minute:"+key,minute,isBackup?OPENROUTER_VISITOR_LIMITS.perMinute:20,isBackup?"PROVIDER_MINUTE_LIMIT":"GLOBAL_LIMIT"],
  [isBackup?"ip-day:openrouter:"+key:"ip-day:"+key,day,isBackup?OPENROUTER_VISITOR_LIMITS.perDay:getVisitorDailyLimit(env),isBackup?"PROVIDER_LIMIT":"GLOBAL_LIMIT"],
  ...(isBackup?[["provider-minute:openrouter",minute,openrouterLimits.perMinuteLimit,"PROVIDER_MINUTE_LIMIT"]]:[]),
  ["provider-day:"+provider,day,providerDailyLimit,"PROVIDER_LIMIT"],
  ...(PROVIDER_MINUTE_LIMITS[provider] ? [["provider-minute:"+provider,minute,PROVIDER_MINUTE_LIMITS[provider],"PROVIDER_MINUTE_LIMIT"]] : []),
  ...(provider==="aihubmix" && env.AIHUBMIX_DAILY_QUOTA_ACTIVE!=="1" ? [["provider-lifetime:aihubmix",0,10,"PROVIDER_LIMIT"]] : []),
  // OpenRouter is the independent paid/free safety net. It must remain usable
  // when the shared free quotas of the primary Prisma providers are exhausted.
  ...(provider==="openrouter"?[]:[["total-day",day,getSharedDailyBudget(env),"GLOBAL_LIMIT"]])
 ];
 const denied=([scope,start,max,code])=>{
  const isMinute=scope.includes("-minute:");
  const reset=(start+(isMinute?1:1440))*60;
  return {status:429,code,scope:scope.split(":")[0],
   retryAfter:Math.max(1,reset-Math.floor(Date.now()/1000)),
   error:code==="PROVIDER_MINUTE_LIMIT"
    ?(provider==="openrouter"?"OpenRouter alcanzó su límite de solicitudes por minuto. Espera un momento y vuelve a intentarlo.":provider+" alcanzó su límite de solicitudes por minuto.")
    :code==="PROVIDER_LIMIT"
     ?(provider==="openrouter"?"OpenRouter alcanzó la cuota diaria de respaldo o el límite de seguridad de este visitante.":"Este proveedor alcanzó su límite diario de solicitudes.")
     :"Prisma alcanzó su límite temporal gratuito global. Las herramientas locales siguen disponibles."};
 };
 const sql=String.raw`INSERT INTO ai_rate_limits(scope,window_start,request_count)
VALUES(?,?,1) ON CONFLICT(scope,window_start) DO UPDATE
SET request_count=request_count+1 WHERE request_count<? RETURNING request_count`;
 try{
  // Preflight does not spend counters for a provider already at its limit.
  for(const record of scopes){
   const [scope,start,max]=record;
   const row=await db.prepare("SELECT request_count FROM ai_rate_limits WHERE scope=? AND window_start=?")
    .bind(scope,start).first();
   if(Number(row?.request_count||0)>=max)return denied(record);
  }
  // The upsert is atomic even when requests race after preflight.
  for(const record of scopes){
   const [scope,start,max]=record;
   if(!await db.prepare(sql).bind(scope,start,max).first())return denied(record);
  }
  if(Math.random()<0.01)await db.prepare("DELETE FROM ai_rate_limits WHERE window_start<? AND scope NOT LIKE 'provider-lifetime:%'").bind(minute-4320).run().catch(()=>{});
  return null;
 }catch(error){
  console.error("Prisma D1 limiter",error?.message||error);
  return {status:503,code:"LIMITS_UNAVAILABLE",error:"No fue posible validar los límites de Prisma."};
 }
}
