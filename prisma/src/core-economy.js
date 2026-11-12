// Prisma Core economy and fallback policy: deterministic, no model invocation.
// Usage stores only aggregate provider/model identifiers and token totals in
// this browser tab. It never stores prompts, responses or API credentials.
export const INFERENCE_USAGE_KEY='prisma-core-inference-usage-v1';

export function selectInferenceCandidates(ranked=[],{preferred='auto',allowFallback=false,task='conversation'}={}){
 const names=[...new Set((Array.isArray(ranked)?ranked:[]).filter(Boolean))];
 if(preferred!=='auto'&&!allowFallback)return names.includes(preferred)?[preferred]:[];
 if(preferred!=='auto')return names; // Explicit fallback was authorized.
 // Normally one model answers. Only real errors trigger a sequential retry.
 // Automatic mode may reach any eligible provider after actual failures.
 // The engine enforces an overall deadline and per-attempt timeouts, so
 // additional configured providers do not cause unbounded retries.
 // Keep OpenRouter in its measured priority position (usually third).
 // Its independently enforced credits and per-visitor ceilings still apply;
 // a successful earlier provider prevents any extra model invocation.
 return names;
}

export function stopInferenceFallback(error={}){
 const status=Number(error?.status)||0;
 const code=String(error?.code||'');
 if(code==='LIMITS_UNAVAILABLE'||code==='INVALID_REQUEST')return true;
 // Bad model identifiers are specific to a provider: another provider can
 // still answer the same valid user prompt. Preserve stops for malformed
 // requests and payload limits instead of retrying them everywhere.
 if(code==='INVALID_MODEL'||code==='MODEL_NOT_ALLOWED')return false;
 return [400,413,415,422].includes(status);
}

export function normalizeInferenceUsage(raw){
 if(!raw||typeof raw!=='object')return null;
 const pick=values=>{
  for(const value of values){
   if(value!==undefined&&value!==null&&Number.isFinite(Number(value))&&Number(value)>=0)
    return Math.min(10000000,Math.floor(Number(value)));
  }
  return null;
 };
 const input=pick([raw.prompt_tokens,raw.input_tokens,raw.promptTokenCount,raw.prompt_tokens_details?.total_tokens]);
 const output=pick([raw.completion_tokens,raw.output_tokens,raw.candidatesTokenCount]);
 const total=pick([raw.total_tokens,raw.totalTokenCount]);
 if(input===null&&output===null&&total===null)return null;
 return {inputTokens:input,outputTokens:output,totalTokens:total??((input??0)+(output??0))};
}
export function recordInferenceUsage(provider,raw,storage=typeof sessionStorage!=='undefined'?sessionStorage:null){
 if(!storage||!provider||!/^[a-z0-9-]{2,25}$/i.test(String(provider)))return null;
 try{
  const today=new Date().toISOString().slice(0,10);
  const saved=JSON.parse(storage.getItem(INFERENCE_USAGE_KEY)||'{}');
  const prev=saved.date===today&&saved.providers&&typeof saved.providers==='object'?saved.providers:{};
  const totals=normalizeInferenceUsage(raw);
  const row=prev[provider]||{requests:0,measuredRequests:0,inputTokens:0,outputTokens:0,totalTokens:0};
  prev[provider]={
   requests:Math.min(100000,(Number(row.requests)||0)+1),
   measuredRequests:Math.min(100000,(Number(row.measuredRequests)||0)+(totals?1:0)),
   inputTokens:Math.min(1000000000,(Number(row.inputTokens)||0)+(totals?.inputTokens??0)),
   outputTokens:Math.min(1000000000,(Number(row.outputTokens)||0)+(totals?.outputTokens??0)),
   totalTokens:Math.min(1000000000,(Number(row.totalTokens)||0)+(totals?.totalTokens??0)),
  };
  const value={date:today,providers:prev};
  storage.setItem(INFERENCE_USAGE_KEY,JSON.stringify(value));
  return value;
 }catch{return null;}
}
export function readInferenceUsage(storage=typeof sessionStorage!=='undefined'?sessionStorage:null){
 try{
  if(!storage)return {requests:0,measuredRequests:0,totalTokens:0};
  const value=JSON.parse(storage.getItem(INFERENCE_USAGE_KEY)||'{}');
  if(value.date!==new Date().toISOString().slice(0,10))return {requests:0,measuredRequests:0,totalTokens:0};
  return Object.values(value.providers||{}).reduce((result,row)=>({
   requests:result.requests+(Number(row.requests)||0),
   measuredRequests:result.measuredRequests+(Number(row.measuredRequests)||0),
   totalTokens:result.totalTokens+(Number(row.totalTokens)||0)
  }),{requests:0,measuredRequests:0,totalTokens:0});
 }catch{return {requests:0,measuredRequests:0,totalTokens:0};}
}
