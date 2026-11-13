// A small grammar bounds structure and live IDs. Per-tool parameter schemas,
// file compatibility, cycles and actual dataflow are checked after decoding.
// Enumerating optional parameter permutations in a grammar is costly on CPU.
export function queenCatalogSchema(contracts,files,intents,{requiredToolIds=[]}={}){
 const ids=Array.from({length:8},(_,i)=>'s'+(i+1));
 const originals=files.map((_,i)=>'file:'+i);
 const fileInputsRequired=contracts.length&&contracts.every(c=>c.inputs.file);
 // IDs establish a partial order independently of the array's item positions.
 // A step can consume originals or preceding IDs, never its own/future output.
 const step={oneOf:ids.map((id,index)=>{
  const previous=ids.slice(0,index),refs=[...originals,...previous.map(value=>'step:'+value)];
  return {type:'object',additionalProperties:false,required:['id','tool_id','params','dependsOn','inputs'],properties:{
   id:{type:'string',enum:[id]},tool_id:{type:'string',enum:contracts.map(c=>c.id)},params:{type:'object'},
   dependsOn:{type:'array',maxItems:previous.length,items:previous.length?{type:'string',enum:previous}:{type:'string'}},
   inputs:{type:'array',minItems:refs.length&&fileInputsRequired?1:0,maxItems:refs.length?20:0,items:refs.length?{type:'string',enum:refs}:{type:'string'}}
  }};
 })};
 const variant=(allowed,execute)=>({type:'object',additionalProperties:false,required:['intent','message','steps'],properties:{
  intent:{type:'string',enum:allowed},message:{type:'string',maxLength:160},search:{type:'string',maxLength:160},
  steps:{type:'array',minItems:execute?Math.max(1,Math.min(8,new Set(requiredToolIds.filter(id=>contracts.some(c=>c.id===id))).size)):0,maxItems:execute?8:0,items:contracts.length?step:{type:'object'}}
 }});
 const choices=[];
 if(intents.includes('execute')&&contracts.length)choices.push(variant(['execute'],true));
 const other=intents.filter(i=>i!=='execute');if(other.length)choices.push(variant(other,false));
 return choices.length===1?choices[0]:{oneOf:choices};
}
