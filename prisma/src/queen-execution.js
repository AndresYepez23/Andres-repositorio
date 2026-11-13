import {tools} from './registry.js';
import {runToolBatch,resultFiles} from './core-execution.js';
import {validateQueenPlan,QUEEN_LIMITS} from './queen-plan.js';
import {verifyQueenResult} from './queen-verifier.js';

export function createQueenExecutionState(){return {taskId:null,completed:new Map(),uncertain:new Set(),running:false};}
export async function executeQueenDAG(plan,files,{run,verify=verifyQueenResult,authorize=()=>false,cancel=()=>false,progress=()=>{},repair=null,state=createQueenExecutionState(),now=Date.now,maxMs=QUEEN_LIMITS.taskMs,maxOutputBytes=50*1024*1024,maxInferences=2,initialInferences=1}={}){
 if(state.running)throw Error('EXECUTION_ALREADY_RUNNING');
 // Do not permit an old task's idempotency records to satisfy new dependencies.
 if(state.taskId!==plan.taskId){state.completed.clear();state.uncertain=new Set();state.taskId=plan.taskId;}
 state.running=true;const start=now(),results=[],events=[];let repairs=0,inferences=state.inferences??initialInferences,outputBytes=0;
 const bounded=async operation=>{
  const remaining=Math.max(1,maxMs-(now()-start));let timer;
  try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TASK_TIME_BUDGET')),remaining);})]);}
  finally{clearTimeout(timer);}
 };
 const assertBudget=()=>{if(cancel())throw Error('EXECUTION_CANCELLED');if(now()-start>maxMs)throw Error('TASK_TIME_BUDGET');};
 const ledger=[];
 try{
  const validated=validateQueenPlan(plan,{files,objective:plan.objective,taskId:plan.taskId,validateProviders:false});
  for(const original of validated.steps){
   assertBudget();let step={...original,delegation:plan.steps.find(s=>s.id===original.id)?.delegation};
   for(const dep of step.dependsOn)if(!state.completed.has(dep))throw Error('DEPENDENCY_INCOMPLETE');
   const prior=state.completed.get(step.id);
   // Reusing a completed step requires the exact same inputs and parameters.
   const identity=JSON.stringify([step.tool_id,step.params,step.inputs]);
   if(prior){if(prior.identity!==identity)throw Error('IDEMPOTENCY_CONFLICT');results.push(prior);continue;}
   let record={id:step.id,status:'executing',attempts:0};ledger.push(record);
   for(let attempt=0;attempt<=QUEEN_LIMITS.repairs;attempt++){
    assertBudget();record.attempts++;
    state.activeStepId=step.id;
    const tool=tools.find(t=>t.id===step.tool_id);
    if(state.uncertain?.has(step.id))throw Error('EXTERNAL_OUTCOME_UNKNOWN');
    if(!['local','browser'].includes(tool.mode)&&!authorize(step))throw Error('EXTERNAL_ACTION_NOT_AUTHORIZED');
    const inputs=step.inputs.flatMap(ref=>ref.startsWith('file:')?[files[Number(ref.slice(5))]]:state.completed.get(ref.slice(5))?.files||[]);
    const dependencyText=step.inputs.filter(ref=>ref.startsWith('step:')).map(ref=>state.completed.get(ref.slice(5))?.result?.text||'').filter(Boolean).join('\n');
    const params={...step.params};if(dependencyText&&!params.text&&!params.prompt){params.text=dependencyText;if(tool.mode==='byok')params.prompt=dependencyText;}
    let rawReceived=false;
    try{
     const raw=await bounded(runToolBatch(tool,tool.file?inputs:[],params,run,progress,()=>cancel()||now()-start>maxMs));
     rawReceived=true;record.status='executed';assertBudget();
     const inspected=await bounded(verify({...step,params},raw,inputs));assertBudget();
     const outputFiles=resultFiles(inspected.result);
     outputBytes+=outputFiles.reduce((n,f)=>n+f.size,0);if(outputBytes>maxOutputBytes)throw Error('OUTPUT_RESOURCE_BUDGET');
     record.status=inspected.verification.status==='verified'?'verified':'verification-pending';
     const completed={id:step.id,tool_id:step.tool_id,identity:JSON.stringify([step.tool_id,step.params,step.inputs]),result:inspected.result,files:outputFiles,verification:inspected.verification};
     state.completed.set(step.id,completed);results.push(completed);events.push({step:step.id,state:record.status});break;
    }catch(error){
     record.status='failed';
     if(tool.mode==='byok'){state.uncertain??=new Set();state.uncertain.add(step.id);}
     // Do not re-run remote operations or repeat a result-producing step: its
     // side effects/quota may already have occurred. Corrections are restricted
     // to local, pre-result parameter failures and consume a bounded model call.
     const code=String(error.verificationCode||'TOOL_FAILED');
     if(cancel()||now()-start>=maxMs||error.message==='TASK_TIME_BUDGET')throw error;
     events.push({step:step.id,state:'failed',code});
     if(!repair||attempt>=QUEEN_LIMITS.repairs||repairs>=QUEEN_LIMITS.repairs||inferences>=maxInferences||!['local','browser'].includes(tool.mode)||rawReceived||error.verificationCode)throw error;
     const corrected=await repair({taskId:plan.taskId,step,code,completed:results.map(r=>r.id)});
     inferences++;state.inferences=inferences;repairs++;
     const replacement=validateQueenPlan({intent:'execute',message:'Corrección',steps:[{...corrected,id:step.id,dependsOn:[],inputs:step.inputs.filter(r=>r.startsWith('file:'))}]},{files,objective:plan.objective}).steps[0];
     if(replacement.tool_id!==step.tool_id||step.dependsOn.length)throw Error('UNSAFE_REPAIR');
     step={...step,params:replacement.params};
    }
   }
  }
  const verified=results.every(r=>r.verification.status==='verified');
  return {taskId:plan.taskId,status:verified?'verified':'verification-pending',executed:true,verified,results,ledger,events,metrics:{repairs,inferences,durationMs:now()-start,outputBytes}};
 }catch(error){throw Object.assign(error,{partialResults:results,ledger,events,taskId:plan.taskId,validateProviders:false});}
 finally{state.inferences=inferences;state.running=false;}
}
