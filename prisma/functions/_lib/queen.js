// Server-only. Never import this module from src/ or the static build.
import {QUEEN_LIMITS} from '../../src/queen-plan.js';
export class QueenError extends Error{
 constructor(code,status=503){super(code);this.code=code;this.status=status;}
}
export function queenConfig(env){
 if(env.QUEEN_ENABLED!=='1')throw new QueenError('QUEEN_DISABLED');
 if(!['QUEEN_ACCESS_CLIENT_ID','QUEEN_ACCESS_CLIENT_SECRET','QUEEN_API_KEY'].every(k=>typeof env[k]==='string'&&env[k].trim()))throw new QueenError('QUEEN_AUTH_NOT_CONFIGURED');
 let base;try{base=new URL(env.QUEEN_BASE_URL||'https://queen.prismaspace.space/v1');}catch{throw new QueenError('QUEEN_INVALID_CONFIG');}
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname.replace(/\/$/,'')!=='/v1')throw new QueenError('QUEEN_INVALID_CONFIG');
 return {base:base.origin+'/v1',origin:base.origin,model:env.QUEEN_MODEL||'unsloth/Qwen3.5-2B-GGUF:Q4_K_M'};
}
export async function readBoundedJson(response,maxBytes=32768){
 if(!response.body)throw new QueenError('QUEEN_INVALID_RESPONSE');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>maxBytes)throw new QueenError('QUEEN_RESPONSE_TOO_LARGE',413);chunks.push(value);}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new QueenError('QUEEN_INVALID_JSON');}
}
export async function queenRequest(env,path,{body,signal,fetchImpl=fetch,timeoutMs=55000}={}){
 const config=queenConfig(env);
 const routes={'models':config.base+'/models','completion':config.base+'/chat/completions','tokenize':config.origin+'/tokenize'};
 if(!routes[path])throw new QueenError('QUEEN_ROUTE_NOT_ALLOWED');
 const controller=new AbortController();
 const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,Math.min(55000,Math.max(1,timeoutMs)));
 try{
  const response=await fetchImpl(routes[path],{method:body?'POST':'GET',redirect:'manual',signal:controller.signal,
   headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+env.QUEEN_API_KEY,
    'CF-Access-Client-Id':env.QUEEN_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.QUEEN_ACCESS_CLIENT_SECRET},
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){await response.body?.cancel().catch(()=>{});
   throw new QueenError(response.status===401||response.status===403?'QUEEN_AUTH_REJECTED':response.status===429||response.status===503?'QUEEN_BUSY':'QUEEN_UPSTREAM_ERROR');}
  if(!/application\/json/i.test(response.headers.get('content-type')||'')){await response.body?.cancel().catch(()=>{});throw new QueenError('QUEEN_INVALID_RESPONSE');}
  return await readBoundedJson(response);
 }catch(error){if(error instanceof QueenError)throw error;throw new QueenError(controller.signal.aborted?'QUEEN_TIMEOUT':'QUEEN_UNREACHABLE');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function inferQueen(env,messages,schema,{fetchImpl=fetch,signal,remainingMs=55000,compactMessages=null}={}){
 const config=queenConfig(env),started=Date.now();
 // llama.cpp's own tokenizer, authenticated through the same helper as inference.
 // Include framing reserve. Server context enforcement remains the final guard.
 let inputTokens;
 for(let preflight=0;preflight<2;preflight++){
  const content=messages.map(m=>m.role+'\n'+m.content).join('\n');
  if(new TextEncoder().encode(content).length<=12000){
   const tokens=await queenRequest(env,'tokenize',{body:{content,add_special:true},fetchImpl,signal,timeoutMs:Math.min(5000,remainingMs-(Date.now()-started))});
   inputTokens=tokens.tokens?.length;
   if(!Number.isInteger(inputTokens))throw new QueenError('QUEEN_INVALID_RESPONSE');
   if(inputTokens+QUEEN_LIMITS.maxOutputTokens+128<=QUEEN_LIMITS.contextTokens)break;
  }
  if(preflight===1||!compactMessages)throw new QueenError('QUEEN_CONTEXT_BUDGET',422);
  messages=compactMessages();
 }
 const result=await queenRequest(env,'completion',{fetchImpl,signal,timeoutMs:Math.max(1,remainingMs-(Date.now()-started)),body:{
  model:config.model,messages,temperature:0,max_tokens:QUEEN_LIMITS.maxOutputTokens,stream:false,cache_prompt:true,
  chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_object',schema}
 }});
 const choice=result.choices?.[0];
 if(choice?.finish_reason==='length')throw new QueenError('QUEEN_TRUNCATED_PLAN',422);
 const text=choice?.message?.content;if(typeof text!=='string'||text.length>16000)throw new QueenError('QUEEN_INVALID_PLAN',422);
 let plan;try{plan=JSON.parse(text);}catch{throw new QueenError('QUEEN_INVALID_PLAN',422);}
 const finite=n=>Number.isFinite(Number(n))&&Number(n)>=0?Number(n):null;
 return {plan,usage:{inputTokens:finite(result.usage?.prompt_tokens)??inputTokens,
  outputTokens:finite(result.usage?.completion_tokens),externalCostUsd:0},durationMs:Date.now()-started};
}
export async function withQueenLease(env,operation){
 const db=env.PRISMA_RATE_DB;if(!db?.prepare)throw new QueenError('QUEEN_CONTROL_UNAVAILABLE');
 const owner=crypto.randomUUID(),now=Date.now();let acquired;
 try{acquired=await db.prepare('INSERT INTO queen_leases(slot,owner,expires_at) VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE queen_leases.expires_at<? RETURNING owner')
  .bind('queen',owner,now+QUEEN_LIMITS.taskMs+5000,now).first();}
 catch{throw new QueenError('QUEEN_CONTROL_UNAVAILABLE');}
 if(acquired?.owner!==owner)throw new QueenError('QUEEN_BUSY',429);
 try{return await operation();}
 finally{try{await db.prepare('DELETE FROM queen_leases WHERE slot=? AND owner=?').bind('queen',owner).run();}catch{/* Expiring lease fails closed. */}}
}
export async function recordQueenMetric(env,event,{durationMs=0,inputTokens=0,outputTokens=0}={}){
 if(env.QUEEN_ENABLED!=='1'||!['planned','clarify','delegated','failed','repair','local'].includes(event))return;
 const safe=n=>Math.max(0,Math.min(1000000,Math.round(Number(n)||0)));
 try{await env.PRISMA_RATE_DB?.prepare('INSERT INTO queen_metrics(day,event,count,duration_ms,input_tokens,output_tokens) VALUES(?,?,1,?,?,?) ON CONFLICT(day,event) DO UPDATE SET count=count+1,duration_ms=duration_ms+excluded.duration_ms,input_tokens=input_tokens+excluded.input_tokens,output_tokens=output_tokens+excluded.output_tokens')
  .bind(new Date().toISOString().slice(0,10),event,safe(durationMs),safe(inputTokens),safe(outputTokens)).run();}catch{/* Never log payloads or exception bodies. */}
}

// Dedicated public planner limits do not spend an external provider's quota.
export async function reserveQueenRequest(env,request,now=Date.now()){
 if(!env.PRISMA_RATE_DB?.prepare)throw new QueenError('QUEEN_CONTROL_UNAVAILABLE');
 const day=new Date(now).toISOString().slice(0,10);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(day+':'+(request.headers.get('CF-Connecting-IP')||'unknown')));
 const visitor=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 for(const [period,window,limit] of [['minute',Math.floor(now/60000),5],['day',Math.floor(now/86400000)*1440,30]]){
  let row;try{row=await env.PRISMA_RATE_DB.prepare('INSERT INTO queen_request_limits(visitor,window_start,count) VALUES(?,?,1) ON CONFLICT(visitor,window_start) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(visitor+':'+period,window,limit).first();}
  catch{throw new QueenError('QUEEN_CONTROL_UNAVAILABLE');}
  if(!row)throw new QueenError('QUEEN_RATE_LIMIT',429);
 }
 // Retain at most the current daily window. Contains no raw IP or prompts.
 try{await env.PRISMA_RATE_DB.prepare('DELETE FROM queen_request_limits WHERE window_start<?').bind(Math.floor(now/86400000)*1440).run();}catch{}
}
