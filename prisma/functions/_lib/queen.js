// Server-only. Never import this module from src/ or the static build.
import {QUEEN_LIMITS} from '../../src/queen-plan.js';
import {queenControlDB} from './queen-control.js';
export class QueenError extends Error{
 constructor(code,status=503,diagnostics=null){super(code);this.code=code;this.status=status;if(diagnostics)this.diagnostics=diagnostics;}
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
export function queenHeaders(env){return {'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+env.QUEEN_API_KEY,
 'CF-Access-Client-Id':env.QUEEN_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.QUEEN_ACCESS_CLIENT_SECRET};}
export async function queenRequest(env,path,{body,signal,fetchImpl=fetch,timeoutMs=55000}={}){
 const config=queenConfig(env);
 const routes={'models':config.base+'/models','completion':config.base+'/chat/completions','tokenize':config.origin+'/tokenize','props':config.origin+'/props','slots':config.origin+'/slots'};
 if(!routes[path])throw new QueenError('QUEEN_ROUTE_NOT_ALLOWED');
 if(signal?.aborted||!(timeoutMs>0))throw new QueenError('QUEEN_TIMEOUT',503,{completionTransportAttempted:false});
 const controller=new AbortController();
 const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,Math.min(55000,Math.max(1,timeoutMs)));
 try{
  const response=await fetchImpl(routes[path],{method:body?'POST':'GET',redirect:'manual',signal:controller.signal,
   headers:queenHeaders(env),
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){
   let category='upstream';
   if(/application\/json/i.test(response.headers.get('content-type')||'')){
    try{const data=await readBoundedJson(response,8192);const message=String(data?.error?.message||data?.error||'');
     category=/context|n_ctx|too (?:long|large)|exceed.*tokens/i.test(message)?'context':/schema|grammar|response_format/i.test(message)?'schema':/model/i.test(message)?'model':'upstream';
    }catch{/* Only fixed categories can leave the server. */}
   }else await response.body?.cancel().catch(()=>{});
   throw new QueenError(response.status===401||response.status===403?'QUEEN_AUTH_REJECTED':response.status===429||response.status===503?'QUEEN_BUSY':'QUEEN_UPSTREAM_ERROR',503,{route:path,upstreamStatus:response.status,category});}
  if(!/application\/json/i.test(response.headers.get('content-type')||'')){await response.body?.cancel().catch(()=>{});throw new QueenError('QUEEN_INVALID_RESPONSE');}
  return await readBoundedJson(response);
 }catch(error){if(error instanceof QueenError)throw error;throw new QueenError(controller.signal.aborted?'QUEEN_TIMEOUT':'QUEEN_UNREACHABLE');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function inferQueen(env,messages,schema,{fetchImpl=fetch,signal,remainingMs=55000,compactMessages=null,maxOutputTokens=QUEEN_LIMITS.maxOutputTokens}={}){
 const config=queenConfig(env),started=Date.now();
 const deadlineAt=started+Math.min(55000,Math.max(0,Number(remainingMs)||0));
 const remaining=()=>{const ms=deadlineAt-Date.now();if(signal?.aborted||ms<=0)throw new QueenError('QUEEN_TIMEOUT');return ms;};
 maxOutputTokens=Math.max(1,Math.min(QUEEN_LIMITS.maxOutputTokens,Math.floor(Number(maxOutputTokens)||QUEEN_LIMITS.maxOutputTokens)));
 // llama.cpp's own tokenizer, authenticated through the same helper as inference.
 // Include framing reserve. Server context enforcement remains the final guard.
 let inputTokens,completionTimeoutMs;
 try{
  if(env.QUEEN_ENABLED==='1')await requireQueenIdle(env,{fetchImpl,signal,timeoutMs:Math.min(5000,remaining())});
  for(let preflight=0;preflight<2;preflight++){
   const content=messages.map(m=>m.role+'\n'+m.content).join('\n');
   if(new TextEncoder().encode(content).length<=12000){
    const tokens=await queenRequest(env,'tokenize',{body:{content,add_special:true},fetchImpl,signal,timeoutMs:Math.min(5000,remaining())});
    inputTokens=tokens.tokens?.length;
    if(!Number.isInteger(inputTokens))throw new QueenError('QUEEN_INVALID_RESPONSE');
    if(inputTokens+maxOutputTokens+128<=QUEEN_LIMITS.contextTokens)break;
   }
   if(preflight===1||!compactMessages)throw new QueenError('QUEEN_CONTEXT_BUDGET',422,{preflightInputTokens:Number.isInteger(inputTokens)?inputTokens:null,maxOutputTokens,contextLimit:QUEEN_LIMITS.contextTokens,completionTransportAttempted:false});
   messages=compactMessages();
  }
  // Metadata and compaction spend the same allowance as completion. Exhaustion
  // must stop before POST, rather than creating an uncertain one-ms request.
  completionTimeoutMs=remaining();
 }catch(error){if(error instanceof QueenError)error.diagnostics={...error.diagnostics,preflightInputTokens:inputTokens??null,contextLimit:QUEEN_LIMITS.contextTokens,maxOutputTokens,completionTransportAttempted:false,durationMs:Date.now()-started};throw error;}
 let result;try{result=await queenRequest(env,'completion',{fetchImpl,signal,timeoutMs:completionTimeoutMs,body:{
  model:config.model,messages,temperature:0,max_tokens:maxOutputTokens,stream:false,cache_prompt:true,
  chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_object',schema}
 }});}catch(error){if(error instanceof QueenError)error.diagnostics={...error.diagnostics,preflightInputTokens:inputTokens,contextLimit:QUEEN_LIMITS.contextTokens,maxOutputTokens,completionTransportAttempted:error.diagnostics?.completionTransportAttempted!==false,durationMs:Date.now()-started};throw error;}
 const choice=result.choices?.[0];
 // Shape only: diagnose output-budget failures without retaining a user's
 // generated text, file names or parameter values in diagnostics.
 const responseText=typeof choice?.message?.content==='string'?choice.message.content:null;
 const outputShape={responseCharacters:responseText?.length??null,responseWhitespaceCharacters:responseText===null?null:(responseText.match(/\s/g)||[]).length};
 const diagnostics={finishReason:['stop','length','tool_calls','content_filter','function_call'].includes(choice?.finish_reason)?choice.finish_reason:null,preflightInputTokens:inputTokens,contextLimit:QUEEN_LIMITS.contextTokens,maxOutputTokens,reasoningContentPresent:Boolean(choice?.message?.reasoning_content||choice?.message?.reasoning),thinkingTagsPresent:/<think>/i.test(String(choice?.message?.content||'')),observedInputTokens:Number.isFinite(result.usage?.prompt_tokens)?result.usage.prompt_tokens:null,observedOutputTokens:Number.isFinite(result.usage?.completion_tokens)?result.usage.completion_tokens:null,generationTokensPerSecond:Number(result.timings?.predicted_per_second)||null,promptTokensPerSecond:Number(result.timings?.prompt_per_second)||null};
 Object.assign(diagnostics,outputShape);
 if(choice?.finish_reason==='length')throw new QueenError('QUEEN_TRUNCATED_PLAN',422,diagnostics);
 const text=choice?.message?.content;if(typeof text!=='string'||text.length>16000)throw new QueenError('QUEEN_INVALID_PLAN',422);
 let plan;try{plan=JSON.parse(text);}catch{throw new QueenError('QUEEN_INVALID_PLAN',422,diagnostics);}
 const finite=n=>Number.isFinite(Number(n))&&Number(n)>=0?Number(n):null;
 return {plan,usage:{inputTokens:finite(result.usage?.prompt_tokens)??inputTokens,
  outputTokens:finite(result.usage?.completion_tokens),externalCostUsd:0},durationMs:Date.now()-started,diagnostics};
}
// A timed-out HTTP request may leave llama.cpp working briefly. Callers must
// not enqueue another inference merely because its D1 lease was released.
export async function requireQueenIdle(env,{fetchImpl=fetch,signal,timeoutMs=5000}={}){
 const slots=await queenRequest(env,'slots',{fetchImpl,signal,timeoutMs:Math.min(5000,timeoutMs)});
 if(!Array.isArray(slots)||slots.length!==1)throw new QueenError('QUEEN_SERVER_READINESS',503,{completionTransportAttempted:false});
 if(slots.some(s=>s.is_processing))throw new QueenError('QUEEN_BUSY',429,{serverProcessing:true,completionTransportAttempted:false});
}
export async function withQueenLease(env,operation){
 const db=queenControlDB(env);if(!db?.prepare)throw new QueenError('QUEEN_CONTROL_UNAVAILABLE');
 const owner=crypto.randomUUID(),now=Date.now();let acquired;
 try{acquired=await db.prepare('INSERT INTO queen_leases(slot,owner,expires_at) VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE queen_leases.expires_at<? RETURNING owner')
  .bind('queen',owner,now+QUEEN_LIMITS.taskMs+5000,now).first();}
 catch{throw new QueenError('QUEEN_CONTROL_UNAVAILABLE');}
 if(acquired?.owner!==owner)throw new QueenError('QUEEN_BUSY',429);
 let coolingDown=false;
 try{return await operation();}
 catch(error){
  if(env.QUEEN_ENABLED==='1'&&error?.code==='QUEEN_TIMEOUT'&&error.diagnostics?.completionTransportAttempted){
   coolingDown=true;const until=Date.now()+300000;
   try{await db.prepare('UPDATE queen_leases SET expires_at=? WHERE slot=? AND owner=?').bind(until,'queen',owner).run();}catch{}
   error.diagnostics={...error.diagnostics,cooldownUntil:until};
  }throw error;
 }
 finally{if(!coolingDown)try{await db.prepare('DELETE FROM queen_leases WHERE slot=? AND owner=?').bind('queen',owner).run();}catch{/* Expiring lease fails closed. */}}
}
export async function recordQueenMetric(env,event,{durationMs=0,inputTokens=0,outputTokens=0}={}){
 if(env.QUEEN_ENABLED!=='1'||!['planned','clarify','delegated','failed','repair','local'].includes(event))return;
 const safe=n=>Math.max(0,Math.min(1000000,Math.round(Number(n)||0)));
 try{await queenControlDB(env)?.prepare('INSERT INTO queen_metrics(day,event,count,duration_ms,input_tokens,output_tokens) VALUES(?,?,1,?,?,?) ON CONFLICT(day,event) DO UPDATE SET count=count+1,duration_ms=duration_ms+excluded.duration_ms,input_tokens=input_tokens+excluded.input_tokens,output_tokens=output_tokens+excluded.output_tokens')
  .bind(new Date().toISOString().slice(0,10),event,safe(durationMs),safe(inputTokens),safe(outputTokens)).run();}catch{/* Never log payloads or exception bodies. */}
}

// Dedicated public planner limits do not spend an external provider's quota.
export async function reserveQueenRequest(env,request,now=Date.now(),{perMinute=5,perDay=30,namespace=''}={}){
 const db=queenControlDB(env);if(!db?.prepare)throw new QueenError('QUEEN_CONTROL_UNAVAILABLE');
 const day=new Date(now).toISOString().slice(0,10);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(day+':'+(namespace?namespace+':':'')+(request.headers.get('CF-Connecting-IP')||'unknown')));
 const visitor=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 for(const [period,window,limit] of [['minute',Math.floor(now/60000),Math.min(12,Math.max(1,perMinute))],['day',Math.floor(now/86400000)*1440,Math.min(96,Math.max(1,perDay))]]){
  let row;try{row=await db.prepare('INSERT INTO queen_request_limits(visitor,window_start,count) VALUES(?,?,1) ON CONFLICT(visitor,window_start) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(visitor+':'+period,window,limit).first();}
  catch{throw new QueenError('QUEEN_CONTROL_UNAVAILABLE');}
  if(!row)throw new QueenError('QUEEN_RATE_LIMIT',429);
 }
 // Retain at most the current daily window. Contains no raw IP or prompts.
 try{await db.prepare('DELETE FROM queen_request_limits WHERE window_start<?').bind(Math.floor(now/86400000)*1440).run();}catch{}
}

// Bounded server-side SSE measurement. No generated text or reasoning is logged.
export async function measureQueenStream(env,{fetchImpl=fetch,signal,maxTokens=32,timeoutMs=55000}={}){
 const config=queenConfig(env),started=Date.now(),controller=new AbortController();
 const deadlineAt=started+Math.min(55000,Math.max(0,Number(timeoutMs)||0));
 const remaining=()=>{const ms=deadlineAt-Date.now();if(signal?.aborted||ms<=0)throw new QueenError('QUEEN_TIMEOUT');return ms;};
 const abort=()=>controller.abort();let timer,reader,completionTransportAttempted=false;
 try{
  if(env.QUEEN_ENABLED==='1')await requireQueenIdle(env,{fetchImpl,signal,timeoutMs:Math.min(5000,remaining())});
  const completionTimeoutMs=remaining();
  signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,completionTimeoutMs);
  completionTransportAttempted=true;
  const response=await fetchImpl(config.base+'/chat/completions',{method:'POST',redirect:'manual',signal:controller.signal,headers:queenHeaders(env),body:JSON.stringify({model:config.model,messages:[{role:'user',content:'Responde únicamente: PRISMA QUEEN preparada.'}],temperature:0,max_tokens:Math.max(1,Math.min(32,maxTokens)),stream:true,stream_options:{include_usage:true},chat_template_kwargs:{enable_thinking:false}})});
  const headersMs=Date.now()-started;
  if(!response.ok){await response.body?.cancel();throw new QueenError(response.status===401||response.status===403?'QUEEN_AUTH_REJECTED':'QUEEN_UPSTREAM_ERROR',503,{route:'stream',upstreamStatus:response.status});}
  if(!response.headers.get('content-type')?.includes('text/event-stream')){await response.body?.cancel();throw new QueenError('QUEEN_INVALID_STREAM');}
  reader=response.body.getReader();let pending='',bytes=0,firstTokenMs=null,contentCharacters=0,thinking=false,reasoning=false,tail='',usage=null,finishReason=null,events=0,timings=null,doneSeen=false;
  const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536)throw new QueenError('QUEEN_STREAM_TOO_LARGE');pending+=decoder.decode(value,{stream:true});
   let newline;while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline).trim();pending=pending.slice(newline+1);if(!line.startsWith('data:'))continue;
    const data=line.slice(5).trim();if(data==='[DONE]'){doneSeen=true;continue;}if(!data)continue;let event;try{event=JSON.parse(data);}catch{throw new QueenError('QUEEN_INVALID_STREAM');}events++;
    const delta=event.choices?.[0]?.delta||{};if(delta.content){if(firstTokenMs===null)firstTokenMs=Date.now()-started;contentCharacters+=delta.content.length;tail=(tail+delta.content).slice(-64);thinking ||= /<think>/i.test(tail);}
    reasoning ||= Boolean(delta.reasoning_content||delta.reasoning);if(event.usage)usage={inputTokens:event.usage.prompt_tokens??null,outputTokens:event.usage.completion_tokens??null};
    if(event.choices?.[0]?.finish_reason)finishReason=event.choices[0].finish_reason;
    if(event.timings)timings={generationTokensPerSecond:event.timings.predicted_per_second??null,promptTokensPerSecond:event.timings.prompt_per_second??null};
   }
  }
  if(firstTokenMs===null)throw new QueenError('QUEEN_EMPTY_STREAM');
  if(!doneSeen||!finishReason)throw new QueenError('QUEEN_INCOMPLETE_STREAM');
  return {realInference:true,streaming:true,headersMs,firstTokenMs,totalMs:Date.now()-started,contentCharacters,events,usage,finishReason:['stop','length'].includes(finishReason)?finishReason:null,thinkingTagsPresent:thinking,reasoningContentPresent:reasoning,timings};
 }catch(error){if(error instanceof QueenError){error.diagnostics={...error.diagnostics,completionTransportAttempted,durationMs:Date.now()-started};throw error;}throw new QueenError(controller.signal.aborted?'QUEEN_TIMEOUT':'QUEEN_UNREACHABLE',503,{completionTransportAttempted,durationMs:Date.now()-started});}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);await reader?.cancel().catch(()=>{});reader?.releaseLock();}
}
