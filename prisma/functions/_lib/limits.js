// Atomic usage counters in D1. Limits apply to ALL provider keys, including backups.
const LIMITS={gemini:50,huggingface:10,groq:30,pollinations:10,cloudflare:30,
 "pollinations-image":2,"cloudflare-image":3,"huggingface-image":1,
 "groq-audio":3,"pollinations-audio":2,"gemini-image":2};
export async function checkLimits(env,request,provider){
 const db=env.PRISMA_RATE_DB;
 if(!db?.prepare)return {status:503,code:"LIMITS_UNAVAILABLE",error:"Prisma no puede comprobar sus límites de consumo."};
 const ip=request.headers.get("CF-Connecting-IP")||"unknown";
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));
 const key=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("").slice(0,32);
 const minute=Math.floor(Date.now()/60000),day=Math.floor(minute/1440)*1440;
 const scopes=[
  ["ip-minute:"+key,minute,10,"GLOBAL_LIMIT"],
  ["ip-day:"+key,day,30,"GLOBAL_LIMIT"],
  ["provider-day:"+provider,day,LIMITS[provider]||10,"PROVIDER_LIMIT"],
  ["total-day",day,60,"GLOBAL_LIMIT"]
 ];
 const denied=([scope,start,max,code])=>{
  const reset=(start+(scope.startsWith("ip-minute:")?1:1440))*60;
  return {status:429,code,scope:scope.split(":")[0],retryAfter:Math.max(1,reset-Math.floor(Date.now()/1000)),
   error:code==="PROVIDER_LIMIT"
    ?"Este proveedor alcanzó la cuota diaria de Prisma. Puedes intentar otro si hay cuota compartida disponible."
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
  if(Math.random()<0.01)await db.prepare("DELETE FROM ai_rate_limits WHERE window_start<?").bind(minute-4320).run().catch(()=>{});
  return null;
 }catch(error){
  console.error("Prisma D1 limiter",error?.message||error);
  return {status:503,code:"LIMITS_UNAVAILABLE",error:"No fue posible validar los límites de Prisma."};
 }
}
