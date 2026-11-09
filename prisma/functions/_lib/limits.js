// Atomic counters in Cloudflare D1. Fail closed if bindings/storage are missing.
const LIMITS = {gemini:50,huggingface:10,groq:30,pollinations:10,cloudflare:30,"pollinations-image":2,"cloudflare-image":3,"huggingface-image":1,"groq-audio":3,"pollinations-audio":2};
export async function checkLimits(env,request,provider) {
  const db=env.PRISMA_RATE_DB;
  if(!db?.prepare)return {status:503,error:"Prisma no puede comprobar sus límites de consumo."};
  const ip=request.headers.get("CF-Connecting-IP")||"unknown";
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));
  const key=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("").slice(0,32);
  const minute=Math.floor(Date.now()/60000);
  const day=Math.floor(minute/1440)*1440;
  const scopes=[
    ["ip-minute:"+key,minute,10],
    ["ip-day:"+key,day,30],
    ["provider-day:"+provider,day,LIMITS[provider]||10],
    ["total-day",day,60]
  ];
  const sql=`INSERT INTO ai_rate_limits(scope,window_start,request_count)
VALUES(?,?,1) ON CONFLICT(scope,window_start) DO UPDATE
SET request_count=request_count+1 WHERE request_count<? RETURNING request_count`;
  try{
    for(const [scope,windowStart,max] of scopes){
      const result=await db.prepare(sql).bind(scope,windowStart,max).first();
      if(!result)return {status:429,error:"Prisma alcanzó su límite temporal gratuito. Vuelve a intentarlo más tarde."};
    }
    if(Math.random()<0.01)await db.prepare("DELETE FROM ai_rate_limits WHERE window_start<?").bind(minute-4320).run().catch(()=>{});
    return null;
  }catch(e){
    console.error("Prisma D1 limiter",e?.message||e);
    return {status:503,error:"No fue posible validar los límites de Prisma."};
  }
}
