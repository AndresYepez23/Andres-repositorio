// Runs fixed staging tests. Credentials are read from a local operator-key file,
// never from command arguments or logs; Queen credentials stay in Cloudflare.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import cases from '../queen-cases.json' with {type:'json'};
const args=process.argv.slice(2),arg=name=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const base=new URL(arg('base')||'https://queen-validation.prisma-queen-staging.pages.dev');
if(base.protocol!=='https:'||!(base.hostname==='prisma-queen-staging.pages.dev'||base.hostname.endsWith('.prisma-queen-staging.pages.dev'))||base.username||base.password||base.search||base.hash)throw Error('STAGING_HOST_REQUIRED');
const keyfile=arg('keyfile')||process.env.QUEEN_STAGING_OPERATOR_KEY_FILE;
if(!keyfile)throw Error('Set QUEEN_STAGING_OPERATOR_KEY_FILE to the private operator-key file; do not pass the key itself.');
const key=(await readFile(keyfile,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_OPERATOR_KEY_FILE');
const output=resolve(arg('output')||'work/queen-staging-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,'', {flag:'wx'}); // Keep earlier reports; never silently overwrite.
const live=args.includes('--live');
const report={date:new Date().toISOString(),base:base.origin,mode:live?'live':'credentials-independent',databaseId:'980bad8f-0356-48b9-87bc-56bcf363f69a',productionModified:false,
 modelCompletionsObserved:0,modelRequestsWithUnknownOutcome:0,realVpsRamCpuMeasurement:false,rows:[],controls:[],status:'running'};
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
  report.models=await call('models');report.server=await call('server');report.smoke=await call('smoke');
  if(!report.models.body.ok||!report.smoke.body.realInference||!report.smoke.body.execution?.verified)throw Error('REAL_SMOKE_REQUIRED');
  report.modelCompletionsObserved++;
  for(const c of cases){
   let result=await call('case',{body:{id:c.id}});
   if(result.body.code==='QUEEN_RATE_LIMIT'){
    await new Promise(r=>setTimeout(r,60000));result=await call('case',{body:{id:c.id}});
   }
   const measured=result.body.realInference===true;
   report.rows.push({id:c.id,status:measured?'measured':'failed',...result});
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
 const metered=[report.smoke?.body.metrics,...measured.map(r=>r.body.metrics),report.composition?.body.metrics].filter(Boolean);
 const truncated=report.controls.find(c=>c.id==='truncated-output')?.result?.body?.diagnostics;
 report.reportedTokenTotals={inputTokens:metered.length?metered.reduce((n,m)=>n+(m.inputTokens||0),0)+(truncated?.observedInputTokens||0):null,outputTokens:metered.length?metered.reduce((n,m)=>n+(m.outputTokens||0),0)+(truncated?.observedOutputTokens||0):null,complete:report.modelRequestsWithUnknownOutcome===0&&metered.length>0};
 report.selection={requestedCases:cases.length,validatedNeuralResponses:measured.length,attemptedCases:attempted.length,correct:measured.length?passed:null,
  correctAmongValidatedPercent:measured.length?100*passed/measured.length:null,endToEndPassPercent:attempted.length?100*passed/attempted.length:null,
  note:'Blocked/not-requested cases are never counted as failures of Qwen. Selection does not prove artifact verification.'};
}catch(error){report.status='stopped';report.error=error.message;process.exitCode=1;}
finally{await save();console.log(JSON.stringify({output,status:report.status,missingSecrets:report.health?.body?.missingSecrets||[],modelCompletionsObserved:report.modelCompletionsObserved,selection:report.selection}));}
