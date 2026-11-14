// Independent original/held-out planning evaluation. No tool engines or
// specialist APIs are invoked; synthetic attachment metadata is labeled below.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {evaluationCases,evaluationRequest,assessEvaluation,inferenceEvidence,stopAfterFailure} from './quality-evaluation.mjs';
import {STAGING_DATABASE,stagingHealthReady} from './isolation.mjs';
const args=process.argv.slice(2),arg=name=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const suite=arg('suite')||'heldout',all=evaluationCases(suite);
const selected=arg('case')?all.filter(c=>c.id===arg('case')):all;
if(!selected.length)throw Error('UNKNOWN_CASE');
const live=args.includes('--live'),base=new URL(arg('base')||'https://prisma-queen-staging.pages.dev');
if(base.protocol!=='https:'||!(/^(?:[0-9a-f]{8}\.)?prisma-queen-staging\.pages\.dev$/.test(base.hostname))||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('STAGING_HOST_REQUIRED');
if(live&&!/^[0-9a-f]{8}\.prisma-queen-staging\.pages\.dev$/.test(base.hostname))throw Error('IMMUTABLE_STAGING_DEPLOYMENT_REQUIRED');
const output=resolve(arg('output')||'work/queen-quality-'+Date.now()+'.json');
const report={date:new Date().toISOString(),base:base.origin,suite,suiteSha256:createHash('sha256').update(JSON.stringify(all)).digest('hex'),
 databaseId:STAGING_DATABASE,status:'prepared',mode:live?'live-neural':'offline-preparation',maxInferencesPerEvaluationCase:1,
 fixtureScope:'Synthetic attachment metadata and fixed user requests; file contents are not sent or verified. In live mode Queen responses are authentic, never response fixtures.',
 methodology:'Expected labels remain in the client evaluator. /__queen/plan forces neural planning; the ordinary product route is used only by the optional local control. Local catalog/intent/validation gates still constrain Qwen. New cases were held out when introduced, not a perpetual unseen benchmark.',
 toolsExecuted:[],verifiedArtifacts:[],physicalVpsMetrics:null,specialistCalls:0,rows:[]};
await mkdir(dirname(output),{recursive:true});await writeFile(output,'',{flag:'wx'});
const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');
let key;
async function call(route,{method='POST',body={},product=false}={}){
 const parameters=['--silent','--show-error','--max-time','125','--config','-','--write-out','\n%{http_code}',base.origin+(product?'/api/core/plan':'/__queen/'+route),'--request',method];
 if(method!=='GET')parameters.push('--header','Origin: '+base.origin,'--header','Content-Type: application/json','--data',JSON.stringify(body));
 const began=Date.now();
 return new Promise(resolve=>{
  const child=spawn('curl',parameters,{stdio:['pipe','pipe','pipe']});let raw='',size=0;
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024)child.kill();else raw+=chunk;});child.stderr.resume();
  child.stdin.end('header = "X-Queen-Staging-Key: '+key+'"\n');
  child.on('error',()=>resolve({httpStatus:0,clientDurationMs:Date.now()-began,body:{code:'REQUEST_FAILED'}}));
  child.on('close',code=>{const split=raw.lastIndexOf('\n');let body;try{body=JSON.parse(raw.slice(0,split));}catch{body={code:'NON_JSON_RESPONSE'};}
   resolve({httpStatus:code===0?Number(raw.slice(split+1)):0,clientDurationMs:Date.now()-began,body});});
 });
}
function summary(){
 const attempted=report.rows.filter(r=>r.result),measured=attempted.filter(r=>r.result.body.realInference===true),evidence=attempted.map(r=>r.neural);
 report.summary={requestedCases:selected.length,attemptedCases:attempted.length,backendPlanningRequests:attempted.length,acceptedNeuralPlans:measured.length,
  automatedChecksPassed:measured.filter(r=>r.assessment.automatedPassed).length,semanticReviewsPending:measured.length,
  completionsObserved:evidence.reduce((n,e)=>n+e.completionsObserved,0),queenCalls:evidence.every(e=>e.queenCalls!==null)?evidence.reduce((n,e)=>n+e.queenCalls,0):null,specialistCalls:0,
  reportedQueenCalls:evidence.reduce((n,e)=>n+(e.queenCalls||0),0),queenUsageUnreportedRequests:evidence.filter(e=>e.queenCalls===null).length,
  unknownOutcomes:evidence.every(e=>e.unknownOutcomes!==null)?evidence.reduce((n,e)=>n+e.unknownOutcomes,0):null,
  reportedTokens:{input:evidence.some(e=>e.inputTokens!==null)?evidence.reduce((n,e)=>n+(e.inputTokens||0),0):null,output:evidence.some(e=>e.outputTokens!==null)?evidence.reduce((n,e)=>n+(e.outputTokens||0),0):null},
  note:'No operational success rate: these are plans, with necessary automated checks and pending human semantic review. Lost-response tokens are unknown.'};
}
try{
 if(!live){report.rows=selected.map(c=>({id:c.id,category:c.category,status:'not-requested',realInference:false}));}
 else{
  const keyfile=process.env.QUEEN_STAGING_OPERATOR_KEY_FILE;if(!keyfile)throw Error('OPERATOR_KEY_FILE_REQUIRED');
  key=(await readFile(keyfile,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_OPERATOR_KEY_FILE');
  report.health=await call('health',{method:'GET'});
  if(!stagingHealthReady(report.health,{requireQueen:true,expectedCommit:arg('expected-commit')}))throw Error('STAGING_READINESS_FAILED');
  report.status='running';await save();
  if(args.includes('--include-local-control')){
   report.localControl=await call('plan',{product:true,body:{text:'Formatea este JSON: {"controlLocal":true}',files:[]}});
   report.localControl.decisionSource=report.localControl.body.source||'unavailable';
   report.localControl.toolsExecuted=[];
   // An unexpected Queen fallback is observable and must not hide in totals.
   report.localControl.neural=inferenceEvidence(report.localControl.body);
   if(stopAfterFailure(report.localControl))throw Error('LOCAL_CONTROL_STOPPED');
  }
  if(selected.some(c=>c.dynamic)){
   report.providers=await call('providers');if(!report.providers.body.ok)throw Error('PROVIDER_OBSERVATION_REQUIRED');
  }
  for(const c of selected){
   const request=evaluationRequest(c,report.providers?.body.providers||[]);
   if(!request){report.rows.push({id:c.id,category:c.category,status:'blocked-no-observed-unavailable-provider',realInference:false});await save();continue;}
   request.maxInferences=1;
   const result=await call('plan',{body:request});
   const row={id:c.id,category:c.category,request,expected:c.expect,status:result.body.realInference===true?'measured':'failed',
    decisionSource:result.body.source||'unavailable',result,neural:inferenceEvidence(result.body),assessment:assessEvaluation(c,result.body),toolsExecuted:[],verifiedArtifacts:[]};
   report.rows.push(row);summary();await save();
   if(stopAfterFailure(result)){report.stoppedAfter=c.id;throw Error('STOPPED_AFTER_TRANSPORT_AVAILABILITY_OR_UNKNOWN_OUTCOME');}
  }
  report.status='evaluated-awaiting-semantic-review';
 }
}catch(error){report.status='stopped';report.error=error.message;process.exitCode=1;}
finally{
 summary();if(report.localControl){const e=report.localControl.neural;report.summary.queenCalls=e.queenCalls===null||report.summary.queenCalls===null?null:report.summary.queenCalls+e.queenCalls;report.summary.reportedQueenCalls+=e.queenCalls||0;report.summary.queenUsageUnreportedRequests+=e.queenCalls===null?1:0;report.summary.completionsObserved+=e.completionsObserved;report.summary.unknownOutcomes=e.unknownOutcomes===null||report.summary.unknownOutcomes===null?null:report.summary.unknownOutcomes+e.unknownOutcomes;
  report.summary.backendPlanningRequests++;
  for(const [target,source] of [['input','inputTokens'],['output','outputTokens']])if(e[source]!==null)report.summary.reportedTokens[target]=(report.summary.reportedTokens[target]||0)+e[source];}
 const usage=[...report.rows.filter(r=>r.result).map(r=>r.neural),...(report.localControl?[report.localControl.neural]:[])];
 report.summary.reportedTokens.complete=usage.some(e=>e.completionsObserved>0)&&usage.every(e=>e.queenCalls!==null&&e.unknownOutcomes===0&&(!e.completionsObserved||Number.isFinite(e.inputTokens)&&Number.isFinite(e.outputTokens)));
 await save();console.log(JSON.stringify({output,status:report.status,summary:report.summary}));
}
