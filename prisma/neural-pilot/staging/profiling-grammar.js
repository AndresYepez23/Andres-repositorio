// Historical, expensive schema retained ONLY for the authenticated A/B performance control.
// Narrow the grammar to the live catalog. Validation still checks DAG semantics.
// No evaluation labels or expected answers are used to build this schema.
export function historicalQueenSchema(contracts,files,intents){
 const ids=Array.from({length:8},(_,i)=>'s'+(i+1));
 const alternatives=contracts.flatMap(c=>ids.flatMap((id,index)=>{
  const prior=ids.slice(0,index),refs=[...files.map((_,i)=>'file:'+i),...prior.map(id=>'step:'+id)];
  if(c.inputs.file&&!refs.length)return [];
  return [{type:'object',additionalProperties:false,required:['id','tool_id','params','dependsOn','inputs'],properties:{
   id:{type:'string',const:id},tool_id:{type:'string',const:c.id},
   params:{type:'object',additionalProperties:false,properties:Object.fromEntries(Object.entries(c.parameters.properties).map(([key,value])=>[key,Object.fromEntries(Object.entries(value).filter(([name])=>['type','enum','minimum','maximum','maxLength'].includes(name)))])),
    required:c.parameters.required.filter(k=>!['text','prompt'].includes(k))},
   dependsOn:{type:'array',maxItems:prior.length,items:prior.length?{type:'string',enum:prior}:{type:'string'}},
   inputs:{type:'array',minItems:c.inputs.file?1:0,maxItems:refs.length?20:0,items:refs.length?{type:'string',enum:refs}:{type:'string'}}
  }}];
 }));
 return {type:'object',additionalProperties:false,required:['intent','message','steps'],properties:{
  intent:{type:'string',enum:intents},message:{type:'string',maxLength:160},search:{type:'string',maxLength:160},
  steps:{type:'array',maxItems:alternatives.length?8:0,items:alternatives.length?{oneOf:alternatives}:{type:'object'}}
 }};
}
