// Aggregate upstream API evidence only. No request/response content or keys.
export async function observeQueenProvider(env,{provider,model,capability,status,durationMs=0,usage=null}={}){
 if(env.QUEEN_ENABLED!=='1'||!provider||!model||!['chat','image','transcription','speech'].includes(capability))return;
 const safe=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
 const ok=status>=200&&status<300,now=Date.now();
 try{await env.PRISMA_RATE_DB?.prepare(`INSERT INTO queen_provider_observations
 (provider,model,capability,successes,failures,last_success_at,last_failure_at,last_status,duration_ms,samples,input_tokens,output_tokens)
 VALUES(?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(provider,model,capability) DO UPDATE SET
 successes=successes+excluded.successes,failures=failures+excluded.failures,
 last_success_at=MAX(last_success_at,excluded.last_success_at),last_failure_at=MAX(last_failure_at,excluded.last_failure_at),
 last_status=excluded.last_status,duration_ms=duration_ms+excluded.duration_ms,samples=samples+1,
 input_tokens=input_tokens+excluded.input_tokens,output_tokens=output_tokens+excluded.output_tokens`)
 .bind(String(provider).slice(0,40),String(model).slice(0,160),capability,ok?1:0,ok?0:1,ok?now:0,ok?0:now,Number(status)||0,
  Math.min(300000,safe(durationMs)),safe(usage?.prompt_tokens),safe(usage?.completion_tokens)).run();}catch{/* Missing preview migration never breaks existing providers. */}
}
export async function readQueenProviderObservations(env){
 try{const r=await env.PRISMA_RATE_DB?.prepare('SELECT * FROM queen_provider_observations').all();return r?.results||[];}catch{return [];}
}
