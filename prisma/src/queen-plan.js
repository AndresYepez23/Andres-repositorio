import {tools} from './registry.js';
import {validateQueenParameters} from './queen-contracts.js';
import {compatibleInputs} from './core-execution.js';

/** @typedef {{id:string,tool_id:string,params:Object,dependsOn:string[],inputs:string[],status:string}} QueenStep */
/** @typedef {{taskId:string,objective:string,intent:string,steps:QueenStep[],constraints:string[],status:string}} QueenPlan */
export const QUEEN_LIMITS=Object.freeze({steps:8,repairs:1,inferences:2,maxOutputTokens:256,contextTokens:2048,taskMs:120000,maxBytes:50*1024*1024});
export const QUEEN_PLAN_SCHEMA={type:'object',additionalProperties:false,required:['intent','message','steps'],properties:{
 intent:{type:'string',enum:['execute','question','clarify','delegate','retrieve']},message:{type:'string'},
 search:{type:'string',maxLength:160},
 steps:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['id','tool_id','params','dependsOn','inputs'],properties:{
  id:{type:'string'},tool_id:{type:'string'},params:{type:'object'},dependsOn:{type:'array',items:{type:'string'}},inputs:{type:'array',items:{type:'string'}}
 }}}
}};
const fail=code=>{throw Error(code);};
export function validateQueenPlan(raw,{files=[],objective='',taskId=crypto.randomUUID(),allowedToolIds=null,providers=[],manual=null,validateProviders=true}={}){
 if(!raw||!['execute','question','clarify','delegate','retrieve'].includes(raw.intent)||!Array.isArray(raw.steps)||raw.steps.length>QUEEN_LIMITS.steps)fail('INVALID_PLAN');
 if(raw.intent!=='execute'&&raw.steps.length)fail('INTENT_CANNOT_EXECUTE');
 if(raw.intent==='execute'&&!raw.steps.length)fail('EMPTY_EXECUTION');
 if(typeof raw.message!=='string'||raw.message.length>1200)fail('INVALID_MESSAGE');
 const index=new Map(),fingerprints=new Set();
 for(const item of raw.steps){
  if(!item||!/^s[1-8]$/.test(item.id)||index.has(item.id))fail('INVALID_STEP_ID');
  const tool=tools.find(t=>t.id===item.tool_id&&['ready','beta'].includes(t.status));
  if(!tool||allowedToolIds&&!allowedToolIds.includes(item.tool_id))fail('UNKNOWN_TOOL');
  if(!Array.isArray(item.dependsOn)||!Array.isArray(item.inputs)||item.inputs.length>20||item.dependsOn.length>8)fail('INVALID_DEPENDENCIES');
  const refs=item.inputs.map(ref=>{
   if(typeof ref!=='string'||!/^file:\d+$|^step:s[1-8]$/.test(ref))fail('INVALID_INPUT_REF');
   if(ref.startsWith('file:')){const n=Number(ref.slice(5));if(!files[n])fail('MISSING_INPUT');}
   return ref;
  });
  const depends=[...new Set(item.dependsOn)];
  for(const ref of refs.filter(r=>r.startsWith('step:')))if(!depends.includes(ref.slice(5)))fail('MISSING_DEPENDENCY');
  const params=validateQueenParameters(item.tool_id,item.params,{fromDependency:refs.some(r=>r.startsWith('step:'))});
  if(tool.file&&!refs.length)fail('MISSING_INPUT');
  const originals=refs.filter(r=>r.startsWith('file:')).map(r=>files[Number(r.slice(5))]);
  if(tool.file&&originals.length&&compatibleInputs(tool,originals).length!==originals.length)fail('INCOMPATIBLE_INPUT');
  if(tool.multiple&&tool.maxFiles&&originals.length>tool.maxFiles)fail('TOO_MANY_FILES');
  if(validateProviders&&!['local','browser'].includes(tool.mode)&&params.provider&&params.provider!=='auto'){
   const provider=providers.find(p=>p.id===params.provider);
   if(!provider?.available)fail('PROVIDER_UNAVAILABLE');
   const kind=tool.id==='image-gen'?'image':tool.id==='ai-voice'?'speech':tool.id==='ai-transcribe'?'transcription':'chat';
   if(!provider.capabilities.some(c=>c.kind===kind&&c.executable&&(!params.model||c.models.some(m=>m.id===params.model))))fail('MODEL_UNAVAILABLE');
   if(manual?.mode==='manual'&&manual.provider!==params.provider&&tool.id.startsWith('ai-')&&tool.id!=='ai-voice'&&tool.id!=='ai-transcribe')fail('MANUAL_PREFERENCE');
  }
  const fingerprint=JSON.stringify([item.tool_id,Object.entries(params).sort(),refs]);
  if(fingerprints.has(fingerprint))fail('REDUNDANT_STEP');fingerprints.add(fingerprint);
  index.set(item.id,{id:item.id,tool_id:tool.id,params,dependsOn:depends,inputs:refs,status:'planned'});
 }
 const sorted=[],visiting=new Set(),visited=new Set();
 function visit(id){
  if(visited.has(id))return;if(visiting.has(id))fail('CYCLIC_PLAN');
  const step=index.get(id);if(!step)fail('UNKNOWN_DEPENDENCY');visiting.add(id);
  for(const dep of step.dependsOn)visit(dep);
  visiting.delete(id);visited.add(id);sorted.push(step);
 }
 for(const id of index.keys())visit(id);
 return {taskId,objective:String(objective).slice(0,4000),intent:raw.intent,message:raw.intent==='execute'?'Plan preparado para '+sorted.length+' operación(es); los resultados se comprobarán después de ejecutar.':raw.message,
  steps:sorted,constraints:['catalog-only','existing-permissions','verify-before-success'],status:'validated',
  needs_clarification:raw.intent==='clarify',question:raw.intent==='clarify'?raw.message:'',execution:{executed:false,verified:false}};
}

// No uncalibrated model confidence score can authorize execution. These gates
// are observable; empirical semantic accuracy is reported separately.
export function queenDecisionEvidence(plan){
 return {schemaValid:plan.status==='validated',catalogValid:true,parametersValid:true,
  semanticConfidence:null,calibration:'requires-authenticated-evaluation',requiresApproval:plan.steps.some(s=>{
   const tool=tools.find(t=>t.id===s.tool_id);return !['local','browser'].includes(tool?.mode);
  })};
}
