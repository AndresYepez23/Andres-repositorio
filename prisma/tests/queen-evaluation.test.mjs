import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {evaluationCases,evaluationRequest,assessEvaluation,inferenceEvidence,stopAfterFailure} from '../neural-pilot/staging/quality-evaluation.mjs';
import {STAGING_DATABASE,assertStagingBuildConfig,stagingHealthReady} from '../neural-pilot/staging/isolation.mjs';
const find=id=>evaluationCases('all').find(c=>c.id===id);
const response=(intent,message,steps=[])=>({ok:true,source:'queen',realInference:true,plan:{intent,message,steps,execution:{executed:false,verified:false}}});
const step=(id,tool_id,params={},inputs=[],dependsOn=[])=>({id,tool_id,params,inputs,dependsOn});
test('evaluation labels never enter requests for original or new cases',()=>{
 for(const c of evaluationCases('all')){
  if(c.dynamic)continue;
  const payload=evaluationRequest({...c,expect:{secretExpectedLabel:'do not send'},referencePlan:{steps:[]}});
  assert.deepEqual(Object.keys(payload).sort(),['text','files',...(c.request.context?['context']:[])].sort());
  assert.ok(!JSON.stringify(payload).includes('secretExpectedLabel'));
  assert.ok(!JSON.stringify(payload).includes('referencePlan'));
 }
});
test('historical intent success does not hide unrelated Word answer or cancellation reconfirmation',()=>{
 const question=find('question-not-permission');
 assert.equal(assessEvaluation(question,response('question','¿Qué columnas necesitas?')).automatedPassed,false);
 const answer=assessEvaluation(question,response('question','Sí, convertiremos PDF a Word.'));
 assert.equal(answer.automatedPassed,true);assert.equal(answer.semanticReview,'pending');assert.equal(answer.artifactVerification,'not-performed');
 assert.equal(assessEvaluation(find('cancel'),response('question','¿Desea cancelar la tarea?')).automatedPassed,false);
 assert.equal(assessEvaluation(find('cancel'),response('question','Tarea cancelada.')).automatedPassed,true);
 assert.equal(assessEvaluation(find('cancel'),response('question','No cancelaré la tarea.')).automatedPassed,false);
});
test('PDF composition requires requested page and intermediate artifact, not only tool IDs',()=>{
 const c=find('heldout-third-page-word');
 const steps=[step('s1','pdf-extract',{pages:'3'},['file:0']),step('s2','pdf-to-word',{},['file:0'],['s1'])];
 assert.equal(assessEvaluation(c,response('execute','Plan preparado',steps)).automatedPassed,false);
 steps[1].inputs=['step:s1'];
 assert.equal(assessEvaluation(c,response('execute','Plan preparado',steps)).automatedPassed,true);
 steps[0].params.pages='2';
 assert.equal(assessEvaluation(c,response('execute','Plan preparado',steps)).automatedPassed,false);
});
test('embedded instructions remain literal JSON data and composition retains minification',()=>{
 const c=find('heldout-quoted-instruction');
 const steps=[step('s1','json-format',{text:JSON.stringify(c.expect.literalJson)}),step('s2','json-minify',{},['step:s1'],['s1'])];
 assert.equal(assessEvaluation(c,response('execute','Plan preparado',steps)).automatedPassed,true);
 steps[0].params.text='{"cantidad":9}';
 assert.equal(assessEvaluation(c,response('execute','Plan preparado',steps)).automatedPassed,false);
});
test('new file references cannot reuse an earlier step and changed goals exclude old operations',()=>{
 const c=find('heldout-new-file-current-ref');
 assert.equal(assessEvaluation(c,response('execute','Plan preparado',[step('s1','pdf-to-word',{},['step:s1'])])).automatedPassed,false);
 assert.equal(assessEvaluation(c,response('execute','Plan preparado',[step('s1','pdf-to-word',{},['file:0'])])).automatedPassed,true);
 const changed=find('heldout-change-goal');
 assert.equal(assessEvaluation(changed,response('execute','Plan preparado',[step('s1','pdf-to-word',{},['file:0'])])).automatedPassed,false);
});
test('unavailable provider case uses observed catalog IDs and never fabricates unavailability',()=>{
 const c=find('heldout-unavailable-provider');
 assert.equal(evaluationRequest(c,[]),null);
 const request=evaluationRequest(c,[{id:'kilo',available:false,capabilities:[{kind:'chat',models:[{id:'model-from-provider-snapshot'}]}]}]);
 assert.equal(request.context.preferences.provider,'kilo');assert.equal(request.context.preferences.model,'model-from-provider-snapshot');
 const body=response('delegate','Proveedor no disponible');body.delegate={provider:'kilo'};
 assert.equal(assessEvaluation(c,body).automatedPassed,false);
});
test('timeouts preserve completed usage and unknown outcome rather than inventing lost tokens',()=>{
 const result={httpStatus:503,body:{code:'QUEEN_TIMEOUT',diagnostics:{inferencesAttempted:2,trace:[{usage:{inputTokens:100,outputTokens:30}}]}}};
 assert.deepEqual(inferenceEvidence(result.body),{completionsObserved:1,requestsAttempted:2,unknownOutcomes:1,inputTokens:100,outputTokens:30,queenCalls:2,specialistCalls:0,specialistCallsNote:'Planning endpoints do not invoke specialists.'});
 assert.equal(stopAfterFailure(result),true);
 const unknown=inferenceEvidence({code:'QUEEN_TIMEOUT',diagnostics:{completionTransportAttempted:true}});
 assert.equal(unknown.unknownOutcomes,1);assert.equal(unknown.outputTokens,null);
 assert.equal(inferenceEvidence({code:'QUEEN_TIMEOUT'}).queenCalls,null);
 const lost=inferenceEvidence({code:'NON_JSON_RESPONSE'});assert.equal(lost.queenCalls,null);assert.equal(lost.unknownOutcomes,null);
 assert.equal(stopAfterFailure({httpStatus:503,body:{code:'NON_JSON_RESPONSE'}}),true);
 assert.equal(stopAfterFailure({httpStatus:404,body:{code:'NON_JSON_RESPONSE'}}),true);
 const missingUsage=inferenceEvidence({diagnostics:{trace:[{usage:{}}],inferencesAttempted:1}});
 assert.equal(missingUsage.inputTokens,null);assert.equal(missingUsage.outputTokens,null);
 const completed=inferenceEvidence({diagnostics:{completedInferences:1,completedInputTokens:20,completedOutputTokens:5,inferencesAttempted:2}});
 assert.equal(completed.completionsObserved,1);assert.equal(completed.outputTokens,5);assert.equal(completed.unknownOutcomes,1);
 assert.equal(stopAfterFailure({httpStatus:429,body:{code:'QUEEN_BUSY'}}),true);
 assert.equal(stopAfterFailure({httpStatus:422,body:{code:'QUEEN_PLAN_REJECTED',diagnostics:{inferences:1,trace:[{usage:{inputTokens:10,outputTokens:5}}]}}}),false);
});
test('offline evaluation requires neither credentials nor network and records no neural results',()=>{
 const directory=mkdtempSync(join(tmpdir(),'queen-evaluation-'));
 try{
  const output=join(directory,'prepared.json');
  const run=spawnSync(process.execPath,['prisma/neural-pilot/staging/evaluate-quality.mjs','--suite=all','--output='+output],{cwd:new URL('../..',import.meta.url),encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(report.rows.length,19);assert.equal(report.summary.queenCalls,0);assert.equal(report.summary.reportedTokens.output,null);
  assert.equal(report.rows.every(r=>r.status==='not-requested'&&r.realInference===false),true);
  assert.deepEqual(report.verifiedArtifacts,[]);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

// The --live branch below runs against an executable fixture called curl.
// PATH contains only this fixture: no network client or model can be invoked.
function runWithFakeCurl(mode){
 const directory=mkdtempSync(join(tmpdir(),'queen-fake-curl-'));
 const keyfile=join(directory,'dummy-key'),capture=join(directory,'payloads.jsonl'),output=join(directory,'report.json'),curl=join(directory,'curl');
 writeFileSync(keyfile,'a'.repeat(64),{mode:0o600});
 writeFileSync(curl,`#!${process.execPath}
const fs=require('node:fs');
const args=process.argv.slice(2),target=args.find(a=>a.startsWith('https://'));
process.stdin.resume();
process.stdin.on('end',()=>{
 const route=new URL(target).pathname,index=args.indexOf('--data');
 const body=index<0?null:JSON.parse(args[index+1]);
 fs.appendFileSync(process.env.QUEEN_FAKE_CURL_CAPTURE,JSON.stringify({route,...(body?{body}:{})})+'\\n');
 const databaseId='${STAGING_DATABASE}';
 let response,status=200;
 if(route==='/__queen/health')response={ok:true,databaseId,environment:'staging',queenEnabled:true,missingSecrets:[]};
 else if(route==='/__queen/plan'&&process.env.QUEEN_FAKE_CURL_MODE==='timeout'){
  status=503;response={ok:false,code:'QUEEN_TIMEOUT',diagnostics:{completionTransportAttempted:true,inferencesAttempted:1,completedInferences:0,trace:[]}};
 }else if(route==='/__queen/plan')response={ok:true,source:'queen',realInference:true,
  plan:{intent:'question',message:'Respuesta fixture de transporte',steps:[],execution:{executed:false,verified:false}},
  metrics:{inferences:1,inputTokens:2,outputTokens:3}};
 else {status=404;response={ok:false,code:'UNEXPECTED_FIXTURE_ROUTE'};}
 // Write the complete curl response before this short-lived fixture exits.
 fs.writeSync(1,JSON.stringify(response)+'\\n'+status);
});
`);
 chmodSync(curl,0o700);
 try{
  const run=spawnSync(process.execPath,['prisma/neural-pilot/staging/evaluate-quality.mjs','--live','--suite=original',
   '--base=https://16436df0.prisma-queen-staging.pages.dev','--output='+output],{
   cwd:new URL('../..',import.meta.url),encoding:'utf8',timeout:10000,
   env:{PATH:directory,QUEEN_STAGING_OPERATOR_KEY_FILE:keyfile,QUEEN_FAKE_CURL_CAPTURE:capture,QUEEN_FAKE_CURL_MODE:mode}});
  return {run,report:JSON.parse(readFileSync(output,'utf8')),calls:readFileSync(capture,'utf8').trim().split('\n').map(JSON.parse)};
 }finally{rmSync(directory,{recursive:true,force:true});}
}

test('live runner emits only eight original plan payloads with one inference each, without expected labels',()=>{
 const {run,report,calls}=runWithFakeCurl('success');
 assert.equal(run.status,0,run.stderr);
 assert.equal(report.maxInferencesPerEvaluationCase,1);
 assert.equal(report.status,'evaluated-awaiting-semantic-review');
 const plans=calls.filter(c=>c.route==='/__queen/plan');
 assert.equal(calls.length,9);assert.equal(calls[0].route,'/__queen/health');assert.equal(plans.length,8);
 assert.deepEqual(plans.map(c=>c.body.text),evaluationCases('original').map(c=>c.request.text));
 for(const c of plans){
  assert.equal(c.body.maxInferences,1);
  assert.deepEqual(Object.keys(c.body).sort(),['files','maxInferences','text']);
  assert.ok(!JSON.stringify(c.body).includes('expectedTools'));
  assert.ok(!JSON.stringify(c.body).includes('messageAll'));
 }
 assert.equal(report.summary.backendPlanningRequests,8);assert.equal(report.summary.queenCalls,8);
 assert.equal(report.summary.specialistCalls,0);assert.equal(report.summary.semanticReviewsPending,8);
 assert.deepEqual(report.toolsExecuted,[]);assert.deepEqual(report.verifiedArtifacts,[]);
});

test('live runner saves first timeout and stops without requesting a second case or retry',()=>{
 const {run,report,calls}=runWithFakeCurl('timeout');
 assert.equal(run.status,1,run.stderr);
 assert.equal(calls.length,2);assert.equal(calls.filter(c=>c.route==='/__queen/plan').length,1);
 assert.equal(calls[1].body.maxInferences,1);
 assert.equal(report.status,'stopped');assert.equal(report.rows.length,1);
 assert.equal(report.stoppedAfter,evaluationCases('original')[0].id);
 assert.equal(report.summary.queenCalls,1);assert.equal(report.summary.completionsObserved,0);
 assert.equal(report.summary.unknownOutcomes,1);assert.equal(report.summary.reportedTokens.output,null);
});

test('live tooling accepts only the current isolated database and a complete readiness response',()=>{
 const config=readFileSync(new URL('../wrangler.staging.toml',import.meta.url),'utf8');
 assert.equal(STAGING_DATABASE,'6a3256b2-c016-4650-9759-79aca3b4446f');
 assert.doesNotThrow(()=>assertStagingBuildConfig(config));
 const healthy={httpStatus:200,body:{ok:true,databaseId:STAGING_DATABASE,environment:'staging',queenEnabled:true,missingSecrets:[],sourceCommit:'a'.repeat(40)}};
 assert.equal(stagingHealthReady(healthy,{requireQueen:true,expectedCommit:'a'.repeat(40)}),true);
 for(const id of ['e02104b5-0861-475a-a60f-7658439d4fe0','980bad8f-0356-48b9-87bc-56bcf363f69a']){
  assert.throws(()=>assertStagingBuildConfig(config.replaceAll(STAGING_DATABASE,id)),/UNSAFE_STAGING_CONFIG/);
  assert.equal(stagingHealthReady({...healthy,body:{...healthy.body,databaseId:id}},{requireQueen:true}),false);
 }
 for(const change of [{queenEnabled:false},{missingSecrets:['QUEEN_API_KEY']},{missingSecrets:undefined},{environment:'production'}])
  assert.equal(stagingHealthReady({...healthy,body:{...healthy.body,...change}},{requireQueen:true}),false);
 assert.equal(stagingHealthReady({...healthy,httpStatus:503},{requireQueen:true}),false);
 assert.equal(stagingHealthReady(healthy,{expectedCommit:'b'.repeat(40)}),false);
});
