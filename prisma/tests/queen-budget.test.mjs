import test from 'node:test';
import assert from 'node:assert/strict';
import {executeQueenDAG,createQueenExecutionState} from '../src/queen-execution.js';
import {validateQueenPlan} from '../src/queen-plan.js';
import {runTool} from '../src/engines.js';

const step=(id='s1',tool_id='json-format',params={text:'{}'},inputs=[],dependsOn=[])=>({id,tool_id,params,inputs,dependsOn});
const plan=steps=>validateQueenPlan({intent:'execute',message:'Presupuesto de prueba',steps});

test('planning time is charged before any tool can start',async()=>{
 let calls=0;
 await assert.rejects(executeQueenDAG(plan([step()]),[],{
  startedAt:1000,now:()=>121000,run:async()=>{calls++;}
 }),error=>error.message==='TASK_TIME_BUDGET'&&error.metrics.taskDurationMs===120000);
 assert.equal(calls,0);
});

test('resuming a task preserves its original deadline and completed artifacts',async()=>{
 const state=createQueenExecutionState(),p=plan([step(),step('s2','json-minify',{},['step:s1'],['s1'])]);
 let clock=1000,calls=0;
 const run=async(id,...args)=>{calls++;if(id==='json-minify')throw Error('fixture failure');return runTool(id,...args);};
 await assert.rejects(executeQueenDAG(p,[],{state,now:()=>clock,maxMs:100,run}),error=>error.partialResults.length===1);
 clock=1100;
 await assert.rejects(executeQueenDAG(p,[],{state,now:()=>clock,maxMs:120000,run}),error=>error.message==='TASK_TIME_BUDGET'&&error.partialResults[0].tool_id==='json-format');
 assert.equal(calls,2);
 // A changed objective/task receives its own budget, without stale idempotency.
 const fresh=plan([step()]);
 const outcome=await executeQueenDAG(fresh,[],{state,now:()=>clock,run});
 assert.equal(outcome.verified,true);assert.equal(calls,3);
});

test('a rejected repair counts its attempt and cannot gain a third inference on resume',async()=>{
 const state=createQueenExecutionState(),p=plan([step()]);let repairs=0;
 const options={state,run:async()=>{throw Error('fixture local parameter failure');},repair:async()=>{repairs++;throw Error('fixture transport failure');}};
 await assert.rejects(executeQueenDAG(p,[],options),error=>error.message==='fixture transport failure'&&error.metrics.inferences===2&&error.metrics.repairs===1);
 await assert.rejects(executeQueenDAG(p,[],options),/fixture local parameter failure/);
 assert.equal(repairs,1);assert.equal(state.inferences,2);
});

test('repair receives the remaining deadline, aborts on expiry and cannot execute a late response',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const state=createQueenExecutionState(),p=plan([step()]);let calls=0,signal,remainingMs,resolveRepair,entered;
 const repairEntered=new Promise(resolve=>{entered=resolve;});
 const execution=executeQueenDAG(p,[],{state,maxMs:25,now:()=>1000,run:async()=>{calls++;throw Error('fixture parameter failure');},repair:context=>{
  signal=context.signal;remainingMs=context.remainingMs;entered();return new Promise(resolve=>{resolveRepair=resolve;});
 }});
 await repairEntered;
 const rejected=assert.rejects(execution,error=>error.message==='TASK_TIME_BUDGET'&&error.metrics.inferences===2);
 t.mock.timers.tick(25);
 await rejected;
 assert.equal(remainingMs,25);assert.equal(signal.aborted,true);assert.equal(state.inferences,2);
 resolveRepair(step());await Promise.resolve();await Promise.resolve();
 assert.equal(calls,1);
});

test('two planning inferences leave no repair allowance',async()=>{
 let repairs=0;
 await assert.rejects(executeQueenDAG(plan([step()]),[],{initialInferences:2,run:async()=>{throw Error('fixture failure');},repair:async()=>{repairs++;return step();}}),/fixture failure/);
 assert.equal(repairs,0);
});

test('changed files never receive old outputs, including after the original deadline',async()=>{
 for(const expired of [false,true]){
  const state=createQueenExecutionState(),p=plan([step()]);let clock=1000;
  const a=new File(['a'],'same.txt',{type:'text/plain'}),b=new File(['b'],'same.txt',{type:'text/plain'});
  await executeQueenDAG(p,[a],{state,maxMs:100,now:()=>clock,run:runTool});
  if(expired)clock=1100;
  await assert.rejects(executeQueenDAG(p,[b],{state,now:()=>clock,run:()=>assert.fail('changed files cannot execute')}),error=>error.message==='INPUT_FILES_CHANGED'&&error.partialResults.length===0);
  assert.equal(state.completed.size,1);
 }
});

test('changed plan parameters never receive old outputs, including after the original deadline',async()=>{
 for(const expired of [false,true]){
  const state=createQueenExecutionState(),p=plan([step()]);let clock=1000;
  await executeQueenDAG(p,[],{state,maxMs:100,now:()=>clock,run:runTool});
  if(expired)clock=1100;
  await assert.rejects(executeQueenDAG({...p,steps:[step('s1','json-format',{text:'[]'})]},[],{state,now:()=>clock,run:()=>assert.fail('changed plan cannot execute')}),error=>error.message==='IDEMPOTENCY_CONFLICT'&&error.partialResults.length===0);
  assert.equal(state.completed.size,1);
 }
});

test('expired same-file same-plan task retains only its confirmed earlier artifacts',async()=>{
 const state=createQueenExecutionState(),p=plan([step()]);let clock=1000;
 const input=new File(['same bytes'],'same.txt',{type:'text/plain'});
 const first=await executeQueenDAG(p,[input],{state,maxMs:100,now:()=>clock,run:runTool});
 clock=1100;
 const sameBytes=new File(['same bytes'],'same.txt',{type:'text/plain'});
 await assert.rejects(executeQueenDAG(p,[sameBytes],{state,now:()=>clock,run:()=>assert.fail('expired task cannot execute')}),error=>error.message==='TASK_TIME_BUDGET'&&error.partialResults.length===1&&error.partialResults[0]===first.results[0]);
});
