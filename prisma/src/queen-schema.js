// A small grammar bounds structure and live IDs. Per-tool parameter schemas,
// file compatibility, cycles and actual dataflow are checked after decoding.
// Enumerating optional parameter permutations in a grammar is costly on CPU.
export function queenCatalogSchema(contracts,files,intents,{requiredToolIds=[]}={}){
 const ids=Array.from({length:8},(_,i)=>'s'+(i+1));
 const refs=[...files.map((_,i)=>'file:'+i),...ids.map(id=>'step:'+id)];
 const step={type:'object',additionalProperties:false,required:['id','tool_id','params','dependsOn','inputs'],properties:{
  id:{type:'string',enum:ids},tool_id:{type:'string',enum:contracts.map(c=>c.id)},params:{type:'object'},
  dependsOn:{type:'array',maxItems:7,items:{type:'string',enum:ids}},
  inputs:{type:'array',minItems:contracts.length&&contracts.every(c=>c.inputs.file)?1:0,maxItems:20,items:{type:'string',enum:refs}}
 }};
 const variant=(allowed,execute)=>({type:'object',additionalProperties:false,required:['intent','message','steps'],properties:{
  intent:{type:'string',enum:allowed},message:{type:'string',maxLength:160},search:{type:'string',maxLength:160},
  steps:{type:'array',minItems:execute?Math.max(1,Math.min(8,new Set(requiredToolIds.filter(id=>contracts.some(c=>c.id===id))).size)):0,maxItems:execute?8:0,items:contracts.length?step:{type:'object'}}
 }});
 const choices=[];
 if(intents.includes('execute')&&contracts.length)choices.push(variant(['execute'],true));
 const other=intents.filter(i=>i!=='execute');if(other.length)choices.push(variant(other,false));
 return choices.length===1?choices[0]:{oneOf:choices};
}
