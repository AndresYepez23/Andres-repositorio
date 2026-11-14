// A small grammar bounds structure and live IDs. Per-tool parameter schemas,
// file compatibility, cycles and actual dataflow are checked after decoding.
// Enumerating optional parameter permutations in a grammar is costly on CPU.
export function queenCatalogSchema(contracts,files,intents,{requiredToolIds=[],maxSteps=8}={}){
 // Only a complete caller-proven short flow uses per-ID alternatives. Generic
 // plans retain a compact grammar plus the independent graph validator.
 const bounded=maxSteps===2||maxSteps===3;
 const limit=bounded?maxSteps:8,ids=Array.from({length:limit},(_,i)=>'s'+(i+1));
 const originals=files.map((_,i)=>'file:'+i);
 const fileInputsRequired=contracts.length&&contracts.every(c=>c.inputs.file);
 // IDs establish a partial order independently of the array's item positions.
 // A step can consume originals or preceding IDs, never its own/future output.
 const stepVariant=(allowedIds,previous,refs)=>{
  return {type:'object',additionalProperties:false,required:['id','tool_id','params','dependsOn','inputs'],properties:{
   id:{type:'string',enum:allowedIds},tool_id:{type:'string',enum:contracts.map(c=>c.id)},params:{type:'object'},
   dependsOn:{type:'array',maxItems:previous.length,items:previous.length?{type:'string',enum:previous}:{type:'string'}},
   inputs:{type:'array',minItems:refs.length&&fileInputsRequired?1:0,maxItems:refs.length?20:0,items:refs.length?{type:'string',enum:refs}:{type:'string'}}
  }};
 };
 const step=bounded?{oneOf:ids.map((id,index)=>{
  const previous=ids.slice(0,index);
  return stepVariant([id],previous,[...originals,...previous.map(value=>'step:'+value)]);
 })}:stepVariant(ids,ids,[...originals,...ids.map(value=>'step:'+value)]);
 const variant=(allowed,execute)=>({type:'object',additionalProperties:false,required:['intent','message','steps'],properties:{
  // Execute messages are replaced by the validated executor notice. Do not
  // spend the fixed output budget generating prose or an inapplicable search.
  intent:{type:'string',enum:allowed},message:execute?{type:'string',enum:['Plan preparado.']}:{type:'string',maxLength:160},
  ...(allowed.includes('retrieve')?{search:{type:'string',maxLength:160}}:{}),
  steps:{type:'array',minItems:execute?Math.max(1,Math.min(limit,new Set(requiredToolIds.filter(id=>contracts.some(c=>c.id===id))).size)):0,maxItems:execute?limit:0,items:execute&&contracts.length?step:{type:'object'}}
 }});
 const choices=[];
 if(intents.includes('execute')&&contracts.length)choices.push(variant(['execute'],true));
 const other=intents.filter(i=>i!=='execute');if(other.length)choices.push(variant(other,false));
 return choices.length===1?choices[0]:{oneOf:choices};
}
