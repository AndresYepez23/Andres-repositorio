// Staging-only wrapper; never imported by production Pages Functions.
import {queenConfig,queenRequest,inferQueen,withQueenLease,reserveQueenRequest,readBoundedJson,measureQueenStream,requireQueenIdle} from '../../functions/_lib/queen.js';
import {planWithQueen} from '../../functions/api/core/plan.js';
import {getQueenProviders} from '../../functions/_lib/queen-providers.js';
import {validateQueenPlan,QUEEN_PLAN_SCHEMA} from '../../src/queen-plan.js';
import {executeQueenDAG} from '../../src/queen-execution.js';
import {verifyQueenResult} from '../../src/queen-verifier.js';
import {runTool} from '../../src/engines.js';
import cases from '../queen-cases.json' with {type:'json'};
import {createCredentialPromotionHandler} from './credential-promotion.mjs';
import {STAGING_DATABASE} from './isolation.mjs';
export {STAGING_DATABASE};
const PRODUCTION_DATABASE='e02104b5-0861-475a-a60f-7658439d4fe0';
const SECRET_NAMES=['QUEEN_ACCESS_CLIENT_ID','QUEEN_ACCESS_CLIENT_SECRET','QUEEN_API_KEY'];
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export async function assertQueenStaging(env){
 if(env.QUEEN_STAGE!=='staging'||env.QUEEN_STAGING_DATABASE_ID!==STAGING_DATABASE||env.QUEEN_STAGING_DATABASE_ID===PRODUCTION_DATABASE)throw Error('STAGING_CONFIG_REQUIRED');
 const identity=await env.PRISMA_RATE_DB?.prepare('SELECT database_id,environment FROM queen_staging_identity WHERE id=1').first();
 if(identity?.database_id!==STAGING_DATABASE||identity?.environment!=='staging')throw Error('STAGING_BINDING_MISMATCH');
 return {databaseId:identity.database_id,environment:identity.environment};
}
export async function authorizedQueenStaging(request,env){
 const key=request.headers.get('X-Queen-Staging-Key')||'';
 if(key.length<32||key.length>200||!/^[a-f0-9]{64}$/.test(env.QUEEN_STAGING_KEY_SHA256||''))return false;
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)));
 let difference=0;for(let i=0;i<32;i++)difference|=digest[i]^parseInt(env.QUEEN_STAGING_KEY_SHA256.slice(i*2,i*2+2),16);
 return difference===0;
}
const errorResult=error=>({ok:false,code:error?.code||(['STAGING_CONFIG_REQUIRED','STAGING_BINDING_MISMATCH'].includes(error?.message)?error.message:'STAGING_TEST_FAILED'),diagnostics:error?.diagnostics||null});
function casePassed(c,plan){
 const ids=plan.steps.map(s=>s.tool_id);
 return c.intents.includes(plan.intent)&&!(c.forbidden||[]).some(id=>ids.includes(id))&&(!c.expectedTools||JSON.stringify(c.expectedTools)===JSON.stringify(ids))&&(!c.allowedTools||ids.every(id=>c.allowedTools.includes(id)));
}
export async function runStagingLocalTools(){
 const started=Date.now();
 const plan=validateQueenPlan({intent:'execute',message:'Plan determinista de prueba; no generado por Queen',steps:[
  {id:'s1',tool_id:'json-format',params:{text:'{"prisma":true,"valor":7}'},dependsOn:[],inputs:[]},
  {id:'s2',tool_id:'json-minify',params:{},dependsOn:['s1'],inputs:['step:s1']}
 ]});
 const execution=await executeQueenDAG(plan,[],{run:async(id,...args)=>{
  if(!['json-format','json-minify'].includes(id))throw Error('STAGING_LOCAL_TOOL_ONLY');return runTool(id,...args);
 }});
 const text=execution.results.at(-1).result.text;
 if(JSON.stringify(JSON.parse(text))!==JSON.stringify({prisma:true,valor:7}))throw Error('STAGING_DATA_MISMATCH');
 const exported={filename:'queen-staging.json',blob:new Blob([text],{type:'application/json'})};
 const artifact=await verifyQueenResult({tool_id:'json-minify',params:{text}},exported);
 return {ok:true,realInference:false,planSource:'deterministic-test-fixture',executed:execution.executed,verified:execution.verified,
  toolIds:execution.results.map(r=>r.tool_id),text,durationMs:Date.now()-started,artifact:artifact.verification,blob:exported.blob};
}
export async function runStagingGuards(){
 const cases=[
  {id:'unknown-tool',plan:{intent:'execute',message:'test',steps:[{id:'s1',tool_id:'shell',params:{},inputs:[],dependsOn:[]}]}},
  {id:'cycle',plan:{intent:'execute',message:'test',steps:[{id:'s1',tool_id:'json-format',params:{text:'{}'},inputs:[],dependsOn:['s1']}]}},
  {id:'question-with-actions',plan:{intent:'question',message:'test',steps:[{id:'s1',tool_id:'json-format',params:{text:'{}'},inputs:[],dependsOn:[]}]}},
  {id:'invalid-parameters',plan:{intent:'execute',message:'test',steps:[{id:'s1',tool_id:'json-format',params:{text:'{}',code:'test'},inputs:[],dependsOn:[]}]}}
 ];
 const checks=cases.map(c=>{try{validateQueenPlan(c.plan);return {id:c.id,rejected:false};}catch{return {id:c.id,rejected:true};}});
 let corruptJsonRejected=false;try{await verifyQueenResult({tool_id:'json-format',params:{text:'{}'}},{text:'not-json'});}catch{corruptJsonRejected=true;}
 return {ok:checks.every(c=>c.rejected)&&corruptJsonRejected,realInference:false,planSource:'adversarial-test-fixtures',checks,corruptJsonRejected};
}
export function createQueenStagingWorker(pages,{credentialPromotion=null,sourceCommit=null}={}){
 const promote=createCredentialPromotionHandler(credentialPromotion);
 return {async fetch(request,env,ctx){
 if(credentialPromotion&&new URL(request.url).pathname==='/__queen/credential-promotion')return await promote(request,env)||new Response('Not found',{status:404});
 if(!await authorizedQueenStaging(request,env))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
 let identity;try{identity=await assertQueenStaging(env);}catch(error){return json(errorResult(error),503);}
 const path=new URL(request.url).pathname;
 if(path==='/__queen/health')return json({ok:true,...identity,queenEnabled:env.QUEEN_ENABLED==='1',missingSecrets:SECRET_NAMES.filter(name=>!env[name]),sourceCommit:sourceCommit||env.CF_PAGES_COMMIT_SHA||env.QUEEN_SOURCE_COMMIT||null});
 if(!path.startsWith('/__queen/'))return pages.fetch(request,env,ctx);
 if(path==='/__queen/local-tools'||path==='/__queen/artifact'){
  const result=await runStagingLocalTools();
  if(path.endsWith('artifact'))return new Response(result.blob,{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="queen-staging.json"','Cache-Control':'no-store','X-Queen-Verification':result.verified?'verified':'pending','X-Queen-Artifact-SHA256':result.artifact.evidence[0].sha256}});
  const {blob,...evidence}=result;return json({...evidence,...identity});
 }
 if(path==='/__queen/guards')return json({...await runStagingGuards(),...identity});
 if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
 const started=Date.now();
 try{
  queenConfig(env);await reserveQueenRequest(env,request,Date.now(),{perMinute:12,perDay:96,namespace:'staging-operator'});
  if(path==='/__queen/providers')return json({ok:true,...identity,providers:await getQueenProviders(env),realProviderInference:false});
  if(path==='/__queen/local-routing'){
   const outcome=await planWithQueen(env,{text:'Formatea este JSON: {"local":true}',files:[]},{signal:request.signal});
   return json({...outcome,...identity,realInference:outcome.source==='queen'});
  }
  if(path==='/__queen/schema-controls'){
   return json({ok:true,...identity,checks:await withQueenLease(env,async()=>{
    const schema={type:'object',additionalProperties:false,properties:{answer:{type:'string',enum:['SCHEMA_OK']}},required:['answer']};const checks=[];
    for(const format of ['json_object_schema','json_schema']){
     const began=Date.now();
     try{await requireQueenIdle(env,{signal:request.signal});const value=await queenRequest(env,'completion',{signal:request.signal,body:{model:env.QUEEN_MODEL,messages:[{role:'user',content:'Devuelve exactamente el JSON {"answer":"UNCONSTRAINED"}.'}],temperature:0,max_tokens:32,chat_template_kwargs:{enable_thinking:false},response_format:format==='json_schema'?{type:'json_schema',json_schema:{name:'queen_schema_control',strict:true,schema}}:{type:'json_object',schema}}});
      let parsed;try{parsed=JSON.parse(value.choices?.[0]?.message?.content);}catch{}
      checks.push({format,schemaEnforced:parsed?.answer==='SCHEMA_OK',observedValue:['SCHEMA_OK','UNCONSTRAINED'].includes(parsed?.answer)?parsed.answer:'other',usage:value.usage||null,finishReason:value.choices?.[0]?.finish_reason,durationMs:Date.now()-began});
     }catch(error){checks.push({format,...errorResult(error),durationMs:Date.now()-began});if(error.code==='QUEEN_TIMEOUT'){error.diagnostics={...error.diagnostics,completionTransportAttempted:true,completedSchemaControls:checks};throw error;}}
    }return checks;
   })});
  }
  if(path==='/__queen/auth-controls'){
   const checks=[];
   for(const layer of ['access','llama']){
    const changed={...env,...(layer==='access'?{QUEEN_ACCESS_CLIENT_SECRET:'invalid-validation-token'}:{QUEEN_API_KEY:'invalid-validation-key'})};
    try{await queenRequest(changed,layer==='access'?'models':'completion',{signal:request.signal,body:layer==='llama'?{model:env.QUEEN_MODEL,messages:[{role:'user',content:'Test'}],max_tokens:1}:undefined});checks.push({layer,rejected:false});}
    catch(error){checks.push({layer,rejected:error.code==='QUEEN_AUTH_REJECTED'||layer==='access'&&error.diagnostics?.upstreamStatus===302,code:error.code,...error.diagnostics});}
   }
   return json({ok:checks.every(c=>c.rejected),...identity,realRequests:true,checks});
  }
  if(path==='/__queen/stream')return json({ok:true,...identity,...await withQueenLease(env,()=>measureQueenStream(env,{signal:request.signal}))});
  if(path==='/__queen/timeout'){
   try{await queenRequest(env,'models',{signal:request.signal,timeoutMs:5});return json({ok:false,code:'TIMEOUT_NOT_TRIGGERED'});}
   catch(error){return json({ok:error.code==='QUEEN_TIMEOUT',...identity,realTransportRequest:true,code:error.code,target:'models-metadata',modelInferenceRequested:false});}
  }
  if(path==='/__queen/context'){
   try{await withQueenLease(env,()=>inferQueen(env,[{role:'user',content:'x '.repeat(2500)}],QUEEN_PLAN_SCHEMA,{signal:request.signal}));return json({ok:false,code:'CONTEXT_NOT_REJECTED'});}
   catch(error){return json({...errorResult(error),ok:error.code==='QUEEN_CONTEXT_BUDGET',...identity,realTokenizerRequest:Number.isInteger(error.diagnostics?.preflightInputTokens)});}
  }
  if(path==='/__queen/connection-error'){
   try{await queenRequest({...env,QUEEN_BASE_URL:'https://queen-connection-control.invalid/v1'},'models',{signal:request.signal,timeoutMs:5000});return json({ok:false,code:'CONNECTION_ERROR_NOT_TRIGGERED'});}
   catch(error){return json({ok:error.code==='QUEEN_UNREACHABLE'||error.code==='QUEEN_UPSTREAM_ERROR'&&error.diagnostics?.upstreamStatus>=500,...identity,realTransportRequest:true,target:'reserved-invalid-domain',code:error.code,diagnostics:error.diagnostics||null});}
  }
  if(path==='/__queen/plan'){
   const payload=await readBoundedJson(request,24000);const outcome=await planWithQueen(env,payload,{signal:request.signal,forceNeural:true,maxInferences:payload.maxInferences===1?1:2,capturePartialOutput:payload.capturePartialOutput===true});return json({...outcome,...identity,realInference:outcome.source==='queen'});
  }
  if(path==='/__queen/models'){
   const models=await queenRequest(env,'models',{signal:request.signal});
   const tokenizer=await queenRequest(env,'tokenize',{body:{content:'Queen responde JSON desde Prisma.',add_special:true},signal:request.signal});
   return json({ok:true,...identity,models:models.data?.map(m=>m.id)||[],tokenize:{ok:Array.isArray(tokenizer.tokens),tokens:tokenizer.tokens?.length},durationMs:Date.now()-started});
  }
  if(path==='/__queen/server'){
   const observations={};
   for(const route of ['props','slots']){
    try{const value=await queenRequest(env,route,{signal:request.signal});
     observations[route]=route==='slots'?{available:true,slots:Array.isArray(value)?value.map(s=>({id:s.id,contextTokens:s.n_ctx,isProcessing:!!s.is_processing})):[]}:
      {available:true,totalSlots:value.total_slots??null,contextTokens:value.default_generation_settings?.n_ctx??null};
    }catch(error){observations[route]={available:false,...errorResult(error)};}
   }
   return json({ok:true,...identity,observations,physicalRamCpuMeasured:false,note:'API slot/context state does not measure physical VPS RAM or CPU.'});
  }
  if(path==='/__queen/smoke'||path==='/__queen/truncation'){
   const result=await withQueenLease(env,()=>inferQueen(env,[{role:'system',content:'Eres Queen. Devuelve SOLO JSON: intent execute, message breve y steps con un paso id s1, tool_id json-format, params.text con el JSON {"prisma":true}, dependsOn [] e inputs []. Nunca afirmes haber ejecutado.'},{role:'user',content:'Formatea el JSON solicitado.'}],QUEEN_PLAN_SCHEMA,{signal:request.signal,maxOutputTokens:path.endsWith('truncation')?8:256}));
   const plan=validateQueenPlan(result.plan,{objective:'Formatea {"prisma":true}',allowedToolIds:['json-format']});
   const execution=await executeQueenDAG(plan,[],{run:runTool});
   const last=execution.results.at(-1);const exported={filename:'queen-smoke.json',blob:new Blob([last.result.text],{type:'application/json'})};
   const artifact=await verifyQueenResult({tool_id:last.tool_id,params:plan.steps.at(-1).params},exported);
   return json({ok:true,...identity,realInference:true,plan,metrics:{...result.usage,durationMs:Date.now()-started,...result.diagnostics},execution:{status:execution.status,executed:execution.executed,verified:execution.verified,results:execution.results.map(r=>({tool:r.tool_id,text:r.result.text,verification:r.verification}))},artifact:artifact.verification});
  }
  if(path==='/__queen/case'||path==='/__queen/compose'){
   const payload=await readBoundedJson(request,24000);
   const c=path.endsWith('case')?cases.find(c=>c.id===payload.id):{id:'json-chain',text:'Formatea este JSON sin cambiar los datos y después minifícalo: {"prisma":true,"valor":7}',files:[],intents:['execute'],expectedTools:['json-format','json-minify']};
   if(!c)return json({ok:false,code:'UNKNOWN_CASE'},400);
   const outcome=await planWithQueen(env,c,{signal:request.signal,forceNeural:true});
   const passed=casePassed(c,outcome.plan);
   let execution=null;
   if(path.endsWith('compose')&&passed){const e=await executeQueenDAG(outcome.plan,[],{run:runTool});execution={executed:e.executed,verified:e.verified,status:e.status,results:e.results.map(r=>({id:r.id,tool:r.tool_id,text:r.result.text,verification:r.verification}))};}
   return json({ok:true,...identity,id:c.id,realInference:outcome.source==='queen',passed,plan:outcome.plan,metrics:outcome.metrics,execution,durationMs:Date.now()-started});
  }
  return json({ok:false,code:'UNKNOWN_STAGING_ROUTE'},404);
 }catch(error){return json({...errorResult(error),...identity,durationMs:Date.now()-started},Number(error?.status)||502);}
 }};}
