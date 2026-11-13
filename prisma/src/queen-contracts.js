// Contracts are projected from the live registry and the SAME fields as Explore.
import {tools} from './registry.js';
import {renderToolFields} from './tool-fields.js';
import {relatedCoreTools,searchCoreTools} from './core-tool-intelligence.js';
import {validateImageParameters} from './image-contracts.js';

const OPTIONAL=new Set(['context','negativePrompt','content','term','doi','url','organization','sheet','language','model','provider']);
const attr=(text,key)=>String(text).match(new RegExp('(?:^|\\s)'+key+'="([^"]*)"'))?.[1];
export function toolContract(tool){
 const properties={},required=[];
 const add=(label,name,type='text',value='',hint='',extra='',values=null)=>{
  const numeric=type==='number';
  properties[name]={type:numeric?'number':'string',description:[label,hint].filter(Boolean).join('. ')};
  const schema=properties[name];
  if(values)schema.enum=values.map(v=>String(v[0]));
  for(const [key,to] of [['min','minimum'],['max','maximum'],['maxlength','maxLength']]){
   const n=Number(attr(extra,key));if(attr(extra,key)!==undefined&&Number.isFinite(n))schema[to]=n;
  }
  if(values||numeric){if(value!==''&&value!==undefined)schema.default=numeric?Number(value):String(value);}
  // Free-text UI values are examples, never defaults for a user's operation.
  if(!OPTIONAL.has(name)&&!numeric&&!values&&!/opcional/i.test(label+' '+hint))required.push(name);
  return '';
 };
 const html=renderToolFields(tool,{
  field:add,textareaField:(label,name,value,hint)=>add(label,name,'text',value,hint),
  selectField:(label,name,values,value,hint)=>add(label,name,'text',value,hint,'',values),
  textStudioModelSettings:()=>''
 });
 for(const match of html.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)){
  const name=attr(match[0],'name');if(name)properties[name]={type:'boolean',default:/\bchecked\b/.test(match[0])};
 }
 if(tool.id==='pdf-split'||tool.id==='pdf-to-image'){
  for(const name of ['pages','ranges']){const i=required.indexOf(name);if(i>=0)required.splice(i,1);}
 }
 // Semantic parameters lack safe implicit defaults even when Explore shows an example.
 for(const name of tool.id==='image-resize'?['width','height']:['video-trim','audio-trim','video-gif'].includes(tool.id)?['start','duration']:[]){
  if(properties[name])delete properties[name].default;
 }
 if(tool.id==='image-resize')properties.width.anyOfGroup=properties.height.anyOfGroup='dimensions';
 if(['video-trim','audio-trim','video-gif'].includes(tool.id))required.push('start','duration');
 if(tool.id==='utm-builder')required.push('url');
 if(tool.mode==='byok')for(const name of ['provider','model']){
  properties[name]={...(properties[name]||{type:'string'}),dynamicEnum:'provider-registry'};delete properties[name].enum;
 }
 const notes=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 return {id:tool.id,name:tool.name,description:tool.description,capabilities:[tool.category,tool.description],
  availability:tool.status,engine:tool.tag||tool.mode,mode:tool.mode,
  inputs:{file:!!tool.file,accept:tool.accept||null,multiple:!!tool.multiple,maxFiles:tool.maxFiles||null},
  parameters:{type:'object',properties,required:[...new Set(required)],additionalProperties:false},
  dependencies:relatedCoreTools(tool.id),outputs:{description:tool.description,format:null},
  limitations:notes||null,risks:['local','browser'].includes(tool.mode)?['device-resources']:['external-data-transfer','provider-quota'],
  estimatedMs:null,estimatedCostUsd:null};
}
export const queenToolCatalog=()=>tools.map(toolContract);
export function retrieveQueenTools(query,files=[],limit=6){
 return searchCoreTools(query,files,limit).map(toolContract);
}
export function validateQueenParameters(id,params,{fromDependency=false}={}){
 const tool=tools.find(t=>t.id===id&&['ready','beta'].includes(t.status));
 if(!tool)throw Error('UNKNOWN_TOOL');
 if(!params||typeof params!=='object'||Array.isArray(params))throw Error('INVALID_PARAMETERS');
 const {properties,required}=toolContract(tool).parameters;
 const output={};
 for(const [key,value] of Object.entries(params)){
  const schema=properties[key];if(!schema)throw Error('UNKNOWN_PARAMETER:'+id+':'+key);
  const n=schema.type==='number'?Number(value):value;
  if(schema.type==='number'&&(value===''||typeof value==='boolean'||!Number.isFinite(n)))throw Error('INVALID_PARAMETER:'+key);
  if(schema.type!=='number'&&typeof value!==schema.type)throw Error('INVALID_PARAMETER:'+key);
  if(schema.enum&&!schema.enum.includes(String(n)))throw Error('INVALID_ENUM:'+key);
  if(schema.minimum!==undefined&&n<schema.minimum||schema.maximum!==undefined&&n>schema.maximum)throw Error('PARAMETER_RANGE:'+key);
  if(typeof n==='string'&&n.length>(schema.maxLength||12000))throw Error('PARAMETER_SIZE:'+key);
  output[key]=n;
 }
 for(const key of required){
  if(fromDependency&&['text','prompt'].includes(key))continue;
  if(output[key]===undefined||output[key]==='')throw Error('MISSING_PARAMETER:'+key);
 }
 if(id==='image-resize'&&!output.width&&!output.height)throw Error('MISSING_DIMENSIONS');
 validateImageParameters(id,output);
 return output;
}
