// Runs fixed staging tests. Credentials are read from a local operator-key file,
// never from command arguments or logs; Queen credentials stay in Cloudflare.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import cases from '../queen-cases.json' with {type:'json'};
const args=process.argv.slice(2),arg=name=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const base=new URL(arg('base')||'https://prisma-queen-staging.pages.dev');
if(base.protocol!=='https:'||!(base.hostname==='prisma-queen-staging.pages.dev'||base.hostname.endsWith('.prisma-queen-staging.pages.dev'))||base.username||base.password||base.search||base.hash)throw Error('STAGING_HOST_REQUIRED');
const keyfile=arg('keyfile')||process.env.QUEEN_STAGING_OPERATOR_KEY_FILE;
if(!keyfile)throw Error('Set QUEEN_STAGING_OPERATOR_KEY_FILE to the private operator-key file; do not pass the key itself.');
const key=(await readFile(keyfile,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_OPERATOR_KEY_FILE');
const output=resolve(arg('output')||'work/queen-staging-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,'', {flag:'wx'}); // Keep earlier reports; never silently overwrite.
const live=args.includes('--live');
const previous=arg('resume-from')?JSON.parse(await readFile(resolve(arg('resume-from')),'utf8')):null;
if(previous&&(previous.base!==base.origin||previous.databaseId!=='980bad8f-0356-48b9-87bc-56bcf363f69a'||Date.now()-Date.parse(previous.date)>3600000))throw Error('RESUME_REQUIRES_SAME_RECENT_DEPLOYMENT');
const report={date:new Date().toISOString(),base:base.origin,mode:live?'live':'credentials-independent',databaseId:'980bad8f-0356-48b9-87bc-56bcf363f69a',primaryProductionModified:false,isolatedPagesEnvironment:'production',
 modelCompletionsObserved:0,modelRequestsWithUnknownOutcome:0,realVpsRamCpuMeasurement:false,rows:[],controls:[],status:'running',methodology:'Real Qwen output constrained by live catalog grammar and existing deterministic safety gates; case expected labels never enter the model prompt.'};
async function save(){await writeFile(output,JSON.stringify(report,null,2)+'\n');}
async function call(route,{method='POST',body={}}={}){
 const parameters=['--silent','--show-error','--max-time','135','--config','-','--write-out','\n%{http_code}',base.origin+'/__queen/'+route,'--request',method];
 if(method!=='GET')parameters.push('--header','Content-Type: application/json','--data',JSON.stringify(body));
 const started=Date.now();
 return new Promise(resolve=>{
  const child=spawn('curl',parameters,{stdio:['pipe','pipe','pipe']});let stdout='',size=0;
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){child.kill();return;}stdout+=chunk;});
  child.stderr.resume();child.stdin.end('header = "X-Queen-Staging-Key: '+key+'"\n');
  child.on('error',()=>resolve({httpStatus:0,clientDurationMs:Date.now()-started,body:{code:'STAGING_REQUEST_FAILED'}}));
  child.on('close',code=>{const split=stdout.lastIndexOf('\n');let data;try{data=JSON.parse(stdout.slice(0,split));}catch{data={code:'STAGING_NON_JSON_RESPONSE'};}
   resolve({httpStatus:code===0?Number(stdout.slice(split+1)):0,clientDurationMs:Date.now()-started,body:data});});
 });
}
function inferenceEvidence(result){
 const b=result?.body||{},m=b.metrics,d=b.diagnostics||{};
 if(b.realInference===true&&m)return {completionsObserved:m.inferences||1,requestsAttempted:m.inferences||1,inputTokens:m.inputTokens??null,outputTokens:m.outputTokens??null,usageComplete:Number.isFinite(m.inputTokens)&&Number.isFinite(m.outputTokens)};
 const trace=Array.isArray(d.trace)?d.trace:[],finalObserved=Number.isFinite(d.observedOutputTokens),known=trace.length+(finalObserved?1:0);
 const attempts=d.inferencesAttempted??d.inferences??(d.completionTransportAttempted||finalObserved?Math.max(known,1):known);
 return {completionsObserved:known,requestsAttempted:attempts,inputTokens:known?trace.reduce((n,t)=>n+(t.usage?.inputTokens||0),0)+(finalObserved?(d.observedInputTokens||0):0):null,
  outputTokens:known?trace.reduce((n,t)=>n+(t.usage?.outputTokens||0),0)+(finalObserved?d.observedOutputTokens:0):null,usageComplete:known>0&&known===attempts};
}
function summarizeInference(){
 const requests=[report.smoke,...report.rows,report.composition,...report.controls.map(c=>c.result)].filter(Boolean).map(inferenceEvidence);
 report.modelCompletionsObserved=requests.reduce((n,r)=>n+r.completionsObserved,0);
 report.modelRequestsWithUnknownOutcome=requests.reduce((n,r)=>n+Math.max(0,r.requestsAttempted-r.completionsObserved),0);
 const known=requests.filter(r=>r.completionsObserved>0);
 report.reportedTokenTotals={inputTokens:known.length?known.reduce((n,r)=>n+(r.inputTokens||0),0):null,outputTokens:known.length?known.reduce((n,r)=>n+(r.outputTokens||0),0):null,complete:known.length>0&&report.modelRequestsWithUnknownOutcome===0&&known.every(r=>r.usageComplete)};
}
try{
 report.health=await call('health',{method:'GET'});
 if(!report.health.body.ok||report.health.body.databaseId!==report.databaseId)throw Error('STAGING_READINESS_FAILED');
 report.localTools=await call('local-tools');report.guards=await call('guards');
 if(!report.localTools.body.verified||!report.guards.body.ok)throw Error('STAGING_LOCAL_CHECK_FAILED');
 const missing=report.health.body.missingSecrets||[];
 if(!live||missing.length){
  report.status=missing.length?'waiting-for-secrets':'prepared-for-live';
  report.rows=cases.map(c=>({id:c.id,status:missing.length?'blocked':'not-requested',missingSecrets:missing,realInference:false,latencyMs:null,inputTokens:null,outputTokens:null,passed:null}));
 }else{
  report.models=await call('models');
  if(report.models.httpStatus===404){report.readinessRetries=[{route:'models',result:report.models}];report.models=await call('models');}
  report.server=await call('server');
  if(previous?.smoke?.body?.realInference&&previous.smoke.body.execution?.verified){report.smoke=previous.smoke;report.resumedFrom=resolve(arg('resume-from'));report.reusedSmoke=true;}
  else report.smoke=await call('smoke');
  if(!report.models.body.ok||!report.smoke.body.realInference||!report.smoke.body.execution?.verified)throw Error('REAL_SMOKE_REQUIRED');
  report.modelCompletionsObserved++;
  for(const c of cases){
   const completed=previous?.rows?.find(r=>r.id===c.id);
   if(completed){report.rows.push(completed);await save();continue;}
   let result=await call('case',{body:{id:c.id}});
   if(result.body.code==='QUEEN_RATE_LIMIT'){
    await new Promise(r=>setTimeout(r,60000));result=await call('case',{body:{id:c.id}});
   }
   const measured=result.body.realInference===true;
   report.rows.push({id:c.id,status:measured?'measured':'failed',expected:{intents:c.intents,tools:c.expectedTools||null,forbidden:c.forbidden||[]},neural:inferenceEvidence(result),...result});
   if(measured)report.modelCompletionsObserved+=result.body.metrics?.inferences||1;
   else report.modelRequestsWithUnknownOutcome++;
   await save();
  }
  report.composition=await call('compose');
  if(report.composition.body.realInference)report.modelCompletionsObserved+=report.composition.body.metrics?.inferences||1;
  else report.modelRequestsWithUnknownOutcome++;
  const truncation=await call('truncation');if(truncation.body.diagnostics?.finishReason==='length')report.modelCompletionsObserved++;
  report.controls.push({id:'truncated-output',expectedCode:'QUEEN_TRUNCATED_PLAN',passed:truncation.body.code==='QUEEN_TRUNCATED_PLAN',result:truncation});
  report.status='evaluated';
 }
 const measured=report.rows.filter(r=>r.status==='measured'),attempted=report.rows.filter(r=>['measured','failed'].includes(r.status));
 const passed=measured.filter(r=>r.body.passed).length;
 summarizeInference();
 report.selection={requestedCases:cases.length,validatedNeuralResponses:measured.length,attemptedCases:attempted.length,correct:measured.length?passed:null,
  correctAmongValidatedPercent:measured.length?100*passed/measured.length:null,endToEndPassPercent:attempted.length?100*passed/attempted.length:null,
  note:'Blocked/not-requested cases are never counted as failures of Qwen. Selection does not prove artifact verification.'};
}catch(error){report.status='stopped';report.error=error.message;process.exitCode=1;}
finally{summarizeInference();await save();console.log(JSON.stringify({output,status:report.status,missingSecrets:report.health?.body?.missingSecrets||[],modelCompletionsObserved:report.modelCompletionsObserved,selection:report.selection}));}
