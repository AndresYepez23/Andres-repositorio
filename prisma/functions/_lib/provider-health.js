// Backoff for providers that reject requests for missing credit or credentials.
export async function getProviderHold(env, provider) {
  const db=env.PRISMA_RATE_DB;
  if(!db?.prepare)return null;
  try {
    return await db.prepare("SELECT state, reason, valid_until FROM ai_provider_health WHERE provider=? AND valid_until>?")
      .bind(provider,Math.floor(Date.now()/1000)).first();
  } catch(error) {
    console.error("Prisma provider health lookup",String(error?.message||error).slice(0,100));
    return null;
  }
}
export async function setProviderHold(env,provider,state,reason,seconds=21600){
  const db=env.PRISMA_RATE_DB;
  if(!db?.prepare)return;
  try{
    await db.prepare("INSERT INTO ai_provider_health(provider,state,reason,valid_until) VALUES(?,?,?,?) ON CONFLICT(provider) DO UPDATE SET state=excluded.state, reason=excluded.reason, valid_until=excluded.valid_until")
      .bind(provider,state,String(reason).slice(0,180),Math.floor(Date.now()/1000)+seconds).run();
  }catch(error){
    console.error("Prisma provider health write",String(error?.message||error).slice(0,100));
  }
}
