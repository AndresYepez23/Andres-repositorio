import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {evaluationCases,evaluationRequest,assessEvaluation,inferenceEvidence,stopAfterFailure} from '../neural-pilot/staging/quality-evaluation.mjs';
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
