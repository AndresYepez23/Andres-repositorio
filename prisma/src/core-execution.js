import { validateAgentStepResult } from './core-agent-guard.js';
// Observations and branch outputs must not replace the working document/image.
export const OBSERVERS=new Set(['image-palette','image-metadata','image-favicon','image-social-kit','file-inspector','hash-file','pdf-metadata','pdf-form-fields','audio-waveform']);
export function compatibleInputs(tool,files){
 const accept=String(tool.accept||'*/*').toLowerCase().split(',').map(s=>s.trim());
 return files.filter(f=>accept.some(a=>a==='*/*'||a.startsWith('.')?a==='*/*'||String(f.name||'').toLowerCase().endsWith(a):a.endsWith('/*')?String(f.type||'').startsWith(a.slice(0,-1)):f.type===a));
}
export function resultFiles(result){
 const list=result?.blob?[result]:result?.artifacts||[];
 return list.filter(a=>a.blob).map(a=>new File([a.blob],a.filename||'prisma-resultado',{type:a.blob.type||a.type||'application/octet-stream'}));
}
export async function runToolBatch(tool,files,params,run,progress=()=>{},cancel=()=>false){
 const input=tool.file?compatibleInputs(tool,files):[];
 if(tool.file&&(!files.length||input.length!==files.length))throw Error('Todos los archivos deben ser compatibles con '+tool.name+'. No se ha omitido ninguno.');
 if(tool.multiple&&tool.maxFiles&&input.length>tool.maxFiles)throw Error('La herramienta admite como máximo '+tool.maxFiles+' archivos juntos. Divide el lote.');
 const batches=tool.file&&!tool.multiple?input.map(f=>[f]):[input];
 const results=[];
 if(batches.length>1&&['hash-file','file-inspector'].includes(tool.id)){
  const settled=await runIndependentJobs(batches.map(batch=>()=>runToolBatch(tool,batch,params,run,progress,cancel)));
  const complete=settled.filter(s=>s.status==='fulfilled').map(s=>s.value);
  const failed=settled.find(s=>s.status==='rejected');if(failed)throw Object.assign(failed.reason,{partialResults:complete});
  return combineBatchResults(complete);
 }
 // One file at a time bounds canvas/FFmpeg/model memory on phones. Safe lightweight
 // independent computations may opt into concurrency through runIndependentJobs.
 for(let i=0;i<batches.length;i++){
  if(cancel())throw Object.assign(Error('Ejecución cancelada; se conservan los resultados terminados.'),{partialResults:results});
  try{
   const r=await run(tool.id,batches[i],params,(p,m)=>progress((i+Number(p||0))/batches.length,m));
   validateAgentStepResult(tool.id,r);
   if(r.blob&&r.blob.size===0)throw Error('La herramienta devolvió un archivo vacío.');
   if(!r.blob&&!r.artifacts?.length&&typeof r.text!=='string'&&!r.html&&!r.printHtml)throw Error('La herramienta no devolvió contenido verificable.');
   if(r.artifacts?.some(a=>a.blob?a.blob.size===0:typeof a.text!=='string'))throw Error('Uno de los archivos generados está vacío.');
   if(r.warnings?.length)throw Object.assign(Error('La operación terminó con avisos: '+r.warnings.join(' ')),{partialResults:[r]});
   results.push({...r,sourceName:batches[i][0]?.name||''});
  }catch(error){error.partialResults=[...results,...(error.partialResults||[])];throw error;}
 }
 return combineBatchResults(results);
}
function combineBatchResults(results){
 if(results.length===1)return results[0];
 return {artifacts:results.flatMap((r,i)=>r.blob?[{...r,name:r.sourceName,filename:(i+1)+'-'+(r.filename||'resultado')}]:r.artifacts||[{name:r.sourceName,filename:(i+1)+'-resultado.txt',text:r.text??r.html,blob:new Blob([r.text??r.html],{type:'text/plain'})}]),text:results.map(r=>r.text? r.sourceName+'\n'+r.text:'').filter(Boolean).join('\n\n'),summary:results.length+' archivos procesados, en el orden original.'};
}
export async function runIndependentJobs(jobs,{concurrency=2}={}){
 const results=new Array(jobs.length);let next=0;
 await Promise.all(Array.from({length:Math.min(jobs.length,Math.max(1,Math.min(2,concurrency)))},async()=>{while(next<jobs.length){const i=next++;try{results[i]={status:'fulfilled',value:await jobs[i]()};}catch(error){results[i]={status:'rejected',reason:error};}}}));
 return results;
}
// Core's existing renderer/storage handles one downloadable blob per card.
export function executionCards(name,reason,result,stepIndex){
 const artifacts=result?.artifacts||[];
 return artifacts.length?artifacts.map((a,i)=>({name:name+' · '+(a.name||a.filename||String(i+1)),reason,stepIndex,result:{...a,summary:a.summary||result.summary}})):[{name,reason,result,stepIndex}];
}
