import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationBudget,dispatchOperationRequest,operationUsageEvidence,specialistProofParameters} from '../neural-pilot/staging/operation-budget.mjs';

test('OCR continuation keeps the original task deadline, inference and step ceilings',async()=>{
 let now=0;const task=createOperationBudget({id:'scan-excel',now:()=>now});
 await task.queen('extract',async()=>{now=50000;return {ok:true,metrics:{inferences:1,inputTokens:600,outputTokens:140}};});task.reserveSteps(2);
 await task.local('explicit whitespace rule',async()=>{now=90000;});
 assert.equal(task.remainingMs(),30000);
 await task.queen('structure observation',async()=>({ok:true,metrics:{inferences:1,inputTokens:500,outputTokens:100}}));task.reserveSteps(2);
 await assert.rejects(task.queen('third checkpoint',async()=>assert.fail('must not request an inference')),/TASK_INFERENCE_BUDGET/);
 assert.throws(()=>task.reserveSteps(4),/TASK_STEP_BUDGET/);
 now=120000;await assert.rejects(task.local('late operation',async()=>assert.fail('must not execute')),/TASK_TIME_BUDGET/);
 assert.equal(task.snapshot().stepsReserved,5);
});

test('unknown transport outcomes retain the reserved calls and unknown token counts',async()=>{
 const task=createOperationBudget();await assert.rejects(task.queen('initial',async()=>{throw Error('TRANSPORT_LOST');},{maxAttempts:2}),/TRANSPORT_LOST/);
 await assert.rejects(task.queen('repeat',async()=>assert.fail('must not repeat uncertain calls')),/QUEEN_OUTCOME_UNKNOWN/);
 const [call]=task.snapshot().queenCalls;assert.equal(call.status,'outcome-unknown');assert.equal(call.inputTokens,null);assert.equal(call.outputTokens,null);assert.equal(task.snapshot().inferencesReservedOrObserved,2);
});

test('completed validation failures count every reported attempt and keep partial token usage',async()=>{
 const task=createOperationBudget();await task.queen('invalid plan',async()=>({ok:false,code:'QUEEN_PLAN_REJECTED',diagnostics:{inferences:2,inputTokens:900,outputTokens:130}}),{maxAttempts:2});
 assert.equal(task.snapshot().inferencesReservedOrObserved,2);assert.equal(task.snapshot().queenCalls[0].inputTokens,900);
});

test('task deadline aborts an outstanding request without retrying it',async()=>{
 const task=createOperationBudget({maxMs:15});let aborted=false;
 await assert.rejects(task.queen('slow',signal=>new Promise(()=>signal.addEventListener('abort',()=>{aborted=true;}))),/TASK_TIME_BUDGET/);
 assert.equal(aborted,true);assert.equal(task.snapshot().queenCalls[0].status,'outcome-unknown');
});

test('harness task limits cannot be raised by an operation option',()=>{
 const {maxMs,maxInferences,maxSteps}=createOperationBudget({maxMs:999999,maxInferences:9,maxSteps:99}).snapshot();
 assert.deepEqual({maxMs,maxInferences,maxSteps},{maxMs:120000,maxInferences:2,maxSteps:8});
});

test('expired and wrong-owner requests are rejected before any bridge dispatch',async()=>{
 let dispatches=0;const dispatch=()=>{dispatches++;};
 await assert.rejects(dispatchOperationRequest({taskId:'old',budget:{id:'old',deadline:20},now:()=>20},dispatch),/TASK_TIME_BUDGET/);
 await assert.rejects(dispatchOperationRequest({taskId:'old',budget:{id:'next',deadline:100},now:()=>21},dispatch),/TASK_OWNERSHIP_REQUIRED/);
 assert.equal(dispatches,0);
 const result=await dispatchOperationRequest({taskId:'old',budget:{id:'old',deadline:100},remainingMs:20,now:()=>50},value=>{dispatches++;return value;});
 assert.deepEqual(result,{taskId:'old',timeoutSeconds:.02});assert.equal(dispatches,1);
});

test('timeout usage retains completed subtotals without presenting them as total consumption',async()=>{
 const response={ok:false,code:'QUEEN_TIMEOUT',diagnostics:{inferencesAttempted:1,completedInferences:0,completedInputTokens:0,completedOutputTokens:0}};
 const task=createOperationBudget();await task.queen('timeout',async()=>response);
 const [call]=task.snapshot().queenCalls;assert.equal(call.status,'outcome-unknown');assert.equal(call.inputTokens,null);assert.equal(call.outputTokens,null);assert.equal(call.completedInputTokens,0);assert.equal(call.usageComplete,false);
 await assert.rejects(task.queen('unsafe retry',async()=>assert.fail('must not retry')),/QUEEN_OUTCOME_UNKNOWN/);
 assert.deepEqual(operationUsageEvidence({...response,diagnostics:{inputTokens:900,outputTokens:100,completedInferences:1,inferencesAttempted:2}}),{inputTokens:null,outputTokens:null,completedInputTokens:900,completedOutputTokens:100,usageComplete:false});
});

test('bridge failure is an unknown outcome even if the wrapper returned JSON',async()=>{
 const task=createOperationBudget();await task.queen('bridge failure',async()=>({ok:false,code:'LIVE_BRIDGE_FAILED'}));
 const [call]=task.snapshot().queenCalls;assert.equal(call.status,'outcome-unknown');assert.equal(call.inputTokens,null);assert.equal(call.completedInputTokens,null);assert.equal(task.snapshot().inferencesReservedOrObserved,1);
});

test('specialist proof is pinned to one provider with fallback disabled',async()=>{
 const {selectInferenceCandidates}=await import('../src/core-economy.js');
 const params=specialistProofParameters({provider:'kilo',model:'observed-model',allowFallback:true});
 assert.deepEqual(selectInferenceCandidates(['kilo','other'],{preferred:params.provider,allowFallback:params.allowFallback}),['kilo']);
 assert.throws(()=>specialistProofParameters({provider:'auto'}),/EXPLICIT_SPECIALIST_PROVIDER_REQUIRED/);
});

test('uncertain completion evidence blocks further Queen calls across transport error types',async()=>{
 for(const diagnostics of [{completionTransportAttempted:true},{inferencesAttempted:2,completedInferences:1,completedInputTokens:700,completedOutputTokens:100}]){
  const task=createOperationBudget();await task.queen('lost completion',async()=>({ok:false,code:'QUEEN_UNREACHABLE',diagnostics}));
  assert.equal(task.snapshot().queenCalls[0].status,'outcome-unknown');assert.equal(task.snapshot().queenCalls[0].inputTokens,null);
  await assert.rejects(task.queen('another phase',async()=>assert.fail('must not issue a second call')),/QUEEN_OUTCOME_UNKNOWN/);
 }
 const task=createOperationBudget();await task.queen('metadata failure',async()=>({ok:false,code:'QUEEN_UNREACHABLE',diagnostics:{completionTransportAttempted:false}}));
 const [call]=task.snapshot().queenCalls;assert.equal(call.status,'rejected');assert.equal(call.observedInferences,undefined);assert.equal(call.inputTokens,null);
});
