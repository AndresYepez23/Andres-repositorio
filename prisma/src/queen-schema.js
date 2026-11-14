// A small grammar bounds structure and live IDs. Only short flows with tiny
// scalar contracts bind parameters in the grammar; larger optional-parameter
// permutations remain outside it. Independent validation checks every plan.
import {OBSERVERS} from './core-execution.js';

// llama.cpp gives pattern precedence over maxLength. Keep the full finite
// length bound inside the pattern and exclude raw JSON-unsafe characters.
const MESSAGE_CHARACTER=String.raw`[^"\\\x00-\x1F]`;
const COMPLETE_MESSAGE_PATTERN='^'+MESSAGE_CHARACTER+'{1,98}[.!?…]$';
const BINARY_CAPABILITY_PATTERN='^(Sí, |No, |Depende: )'+MESSAGE_CHARACTER+'{1,89}[.!…]$';

export function queenCatalogSchema(contracts,files,intents,{requiredToolIds=[],maxSteps=8,sequentialFileFlow=false,binaryCapabilityQuestion=false}={}){
 // Only a complete caller-proven short flow uses per-ID alternatives. Generic
 // plans retain a compact grammar plus the independent graph validator.
 const bounded=maxSteps===2||maxSteps===3;
 const limit=bounded?maxSteps:8,ids=Array.from({length:limit},(_,i)=>'s'+(i+1));
 const originals=files.map((_,i)=>'file:'+i);
 const fileInputsRequired=contracts.length&&contracts.every(c=>c.inputs.file);
 const smallContracts=bounded&&contracts.length>0&&contracts.length<=3&&contracts.every(c=>{
  const fields=Object.values(c.parameters?.properties||{});
  return c.parameters?.type==='object'&&c.parameters.properties&&fields.length<=2&&fields.every(field=>
   ['string','number','integer','boolean'].includes(field.type)&&!['oneOf','anyOf','allOf'].some(key=>key in field));
 });
 const sequential=sequentialFileFlow&&smallContracts&&files.length===1&&contracts.every(c=>c.inputs.file&&!c.inputs.multiple&&!OBSERVERS.has(c.id));
 const parameterSchema=(contract,previous)=>({type:'object',additionalProperties:false,
  properties:Object.fromEntries(Object.entries(contract.parameters.properties).map(([key,field])=>[key,
   Object.fromEntries(['type','enum','minimum','maximum','minLength','maxLength','pattern'].filter(name=>field[name]!==undefined).map(name=>[name,field[name]]))
  ])),
  // A later step may obtain literal text from a dependency, as the existing
  // parameter validator permits. Actual refs are still checked after decoding.
  required:(contract.parameters.required||[]).filter(key=>!previous.length||!['text','prompt'].includes(key))
 });
 // IDs establish a partial order independently of the array's item positions.
 // A step can consume originals or preceding IDs, never its own/future output.
 const stepVariant=(allowedIds,previous,refs,contract=null)=>{
  const requiredPrevious=sequential&&previous.length?previous.at(-1):null;
  if(requiredPrevious)refs=['step:'+requiredPrevious];
  return {type:'object',additionalProperties:false,required:['id','tool_id','params','dependsOn','inputs'],properties:{
   id:{type:'string',enum:allowedIds},tool_id:{type:'string',enum:contract?[contract.id]:contracts.map(c=>c.id)},params:contract?parameterSchema(contract,previous):{type:'object'},
   dependsOn:{type:'array',...(requiredPrevious?{minItems:1}:{}),maxItems:requiredPrevious?1:previous.length,items:previous.length?{type:'string',enum:requiredPrevious?[requiredPrevious]:previous}:{type:'string'}},
   inputs:{type:'array',minItems:refs.length&&fileInputsRequired?1:0,maxItems:refs.length?(contract?.inputs.file&&!contract.inputs.multiple?1:20):0,items:refs.length?{type:'string',enum:refs}:{type:'string'}}
  }};
 };
 const step=bounded?{oneOf:ids.map((id,index)=>{
  const previous=ids.slice(0,index);
  const refs=[...originals,...previous.map(value=>'step:'+value)];
  if(!smallContracts)return stepVariant([id],previous,refs);
  const variants=contracts.map(contract=>stepVariant([id],previous,refs,contract));
  return variants.length===1?variants[0]:{oneOf:variants};
 })}:stepVariant(ids,ids,[...originals,...ids.map(value=>'step:'+value)]);
 const variant=(allowed,execute)=>({type:'object',additionalProperties:false,required:['intent','message','steps'],properties:{
  // Execute messages are replaced by the validated executor notice. Do not
  // spend the fixed output budget generating prose or an inapplicable search.
  intent:{type:'string',enum:allowed},message:execute?{type:'string',enum:['Plan preparado.']}:{type:'string',maxLength:99,pattern:binaryCapabilityQuestion&&allowed.length===1&&allowed[0]==='question'?BINARY_CAPABILITY_PATTERN:COMPLETE_MESSAGE_PATTERN},
  ...(allowed.includes('retrieve')?{search:{type:'string',maxLength:160}}:{}),
  steps:{type:'array',minItems:execute?Math.max(1,Math.min(limit,new Set(requiredToolIds.filter(id=>contracts.some(c=>c.id===id))).size)):0,maxItems:execute?limit:0,items:execute&&contracts.length?step:{type:'object'}}
 }});
 const choices=[];
 if(intents.includes('execute')&&contracts.length)choices.push(variant(['execute'],true));
 const other=intents.filter(i=>i!=='execute');if(other.length)choices.push(variant(other,false));
 return choices.length===1?choices[0]:{oneOf:choices};
}
