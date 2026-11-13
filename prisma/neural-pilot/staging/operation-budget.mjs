// Harness-only task accounting. Phase controls share this budget; starting a
// second planner request never resets elapsed time or inference/step ceilings.
const operationMetrics=response=>({...response?.diagnostics,...response?.metrics?.diagnostics,...(response?.metrics||response?.usage||{})});
export function operationOutcomeUnknown(response={}){
 const metrics=operationMetrics(response),attempted=metrics.inferencesAttempted,completed=metrics.completedInferences??metrics.inferences;
 return response?.code==='LIVE_BRIDGE_FAILED'||response?.code==='QUEEN_TIMEOUT'&&metrics.completionTransportAttempted!==false||
  response?.ok!==true&&metrics.completionTransportAttempted===true||
  Number.isInteger(attempted)&&(Number.isInteger(completed)?attempted>completed:attempted>0&&response?.ok!==true);
}
export function operationUsageEvidence(response={}){
 const metrics=operationMetrics(response),number=value=>Number.isFinite(value)&&value>=0?value:null;
 const attempted=number(metrics.inferencesAttempted),completed=number(metrics.completedInferences??metrics.inferences);
 const incomplete=operationOutcomeUnknown(response)||metrics.usageComplete===false||attempted!==null&&completed!==null&&attempted>completed;
 const input=number(metrics.inputTokens??metrics.prompt_tokens),output=number(metrics.outputTokens??metrics.completion_tokens);
 return {inputTokens:incomplete?null:input,outputTokens:incomplete?null:output,
  completedInputTokens:number(metrics.completedInputTokens)??input,completedOutputTokens:number(metrics.completedOutputTokens)??output,
  usageComplete:!incomplete&&input!==null&&output!==null};
}
export async function dispatchOperationRequest({taskId,budget,remainingMs,now=Date.now},dispatch){
 if(!budget||taskId!==budget.id)throw Error('TASK_OWNERSHIP_REQUIRED');
 const remaining=Math.min(budget.deadline-now(),Number.isFinite(remainingMs)?remainingMs:Infinity);
 if(!(remaining>0))throw Error('TASK_TIME_BUDGET');
 return dispatch({taskId:budget.id,timeoutSeconds:Math.min(135,remaining/1000)});
}
export function specialistProofParameters(params={}){
 if(!params.provider||params.provider==='auto')throw Error('EXPLICIT_SPECIALIST_PROVIDER_REQUIRED');
 return {...params,allowFallback:false};
}
export function createOperationBudget({id,objective,now=Date.now,maxMs=120000,maxInferences=2,maxSteps=8}={}){
 maxMs=Math.max(1,Math.min(120000,Number(maxMs)||120000));maxInferences=Math.max(1,Math.min(2,Math.floor(maxInferences)||2));maxSteps=Math.max(1,Math.min(8,Math.floor(maxSteps)||8));
 const started=now(),queenCalls=[],localActions=[];let inferences=0,steps=0;
 const remainingMs=()=>Math.max(0,maxMs-(now()-started));
 const assertTime=()=>{if(!remainingMs())throw Error('TASK_TIME_BUDGET');};
 const bounded=async(fn)=>{
  assertTime();const controller=new AbortController();let timer;
  try{const value=await Promise.race([fn(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('TASK_TIME_BUDGET'));},remainingMs());})]);assertTime();return value;}
  finally{clearTimeout(timer);}
 };
 return {
  id,objective,remainingMs,bounded,
  reserveSteps(count){assertTime();if(!Number.isInteger(count)||count<0||steps+count>maxSteps)throw Error('TASK_STEP_BUDGET');steps+=count;},
  async queen(label,request,{maxAttempts=1}={}){
   if(queenCalls.some(call=>call.status==='outcome-unknown'))throw Error('QUEEN_OUTCOME_UNKNOWN');
   assertTime();if(!Number.isInteger(maxAttempts)||maxAttempts<1||inferences+maxAttempts>maxInferences)throw Error('TASK_INFERENCE_BUDGET');
   // Reserve the entire server allowance. An absent response cannot establish
   // that a reserved inference did not run, so it is never refunded.
   inferences+=maxAttempts;
   const call={label,reservedInferences:maxAttempts,startedMs:now()-started,status:'pending',inputTokens:null,outputTokens:null,completedInputTokens:null,completedOutputTokens:null,usageComplete:false};queenCalls.push(call);
   try{
    const response=await bounded(request),metrics=operationMetrics(response);
    const unknown=operationOutcomeUnknown(response);
    const observed=response.source==='prisma-core-local'?0:unknown?metrics.inferencesAttempted:metrics.inferencesAttempted??metrics.inferences??metrics.completedInferences;
    if(Number.isInteger(observed)&&observed>=0&&observed<=maxAttempts){inferences-=maxAttempts-observed;call.observedInferences=observed;}
    call.status=unknown?'outcome-unknown':response.ok?'completed':'rejected';call.code=response.code||null;
    Object.assign(call,operationUsageEvidence(response));
    return response;
   }catch(error){call.status='outcome-unknown';call.code=error.message;throw error;}
   finally{call.durationMs=now()-started-call.startedMs;}
  },
  async local(label,fn){this.reserveSteps(1);const action={label,startedMs:now()-started,status:'pending'};localActions.push(action);try{const value=await bounded(fn);action.status='completed';return value;}catch(error){action.status='failed';action.code=error.message;throw error;}finally{action.durationMs=now()-started-action.startedMs;}},
  snapshot(){return {id,objective,maxMs,maxInferences,maxSteps,durationMs:now()-started,remainingMs:remainingMs(),inferencesReservedOrObserved:inferences,stepsReserved:steps,queenCalls:queenCalls.map(c=>({...c})),localActions:localActions.map(c=>({...c}))};}
 };
}
