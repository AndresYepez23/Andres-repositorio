// Browser sends only attachment metadata and relevant procedure references.
// Queen credentials, prompts and upstream URLs exist exclusively in functions/.
export function queenTaskContext(resolvedTask,selection){
 const task=resolvedTask?.task;
 const proceduralKeys=new Set(['format','output','mode','width','height','keep','quality','sheet','language','direction','position','degrees']);
 const procedure=task?.steps?.slice(-8).map(s=>({tool_id:s.tool_id,params:Object.fromEntries(Object.entries(s.params||{}).filter(([k,v])=>proceduralKeys.has(k)&&['number','boolean','string'].includes(typeof v)&&String(v).length<=120))}))||[];
 return {previousGoal:'',procedure,previousTools:task?.steps?.map(s=>s.tool_id).slice(-8)||[],
  preferences:{mode:selection?.mode==='manual'?'manual':'auto',provider:selection?.provider||'',model:selection?.model||''}};
}
export async function requestQueenPlan({text,files=[],context={},repair=false},{fetchImpl=fetch,signal}={}){
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,115000);
 try{
  const response=await fetchImpl('/api/core/plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
   body:JSON.stringify({text,files:files.map(f=>({name:f.name,type:f.type,size:f.size})),context,repair})});
  if(!response.ok){
   // Fetch resolves when headers arrive. Abort now to cancel the unread error body
   // and release the response stream while preserving the existing local fallback.
   controller.abort();
   return null;
  }
  const payload=await response.json();return payload?.ok?payload:null;
 }catch{return null;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export function queenFailureDescription(error){
 const descriptions={
  EXECUTION_CANCELLED:'La solicitud fue cancelada.',TASK_TIME_BUDGET:'La tarea agotó su límite de tiempo.',
  DEPENDENCY_INCOMPLETE:'Un paso previo no terminó y sus dependencias no se ejecutaron.',
  EXTERNAL_OUTCOME_UNKNOWN:'El resultado de la llamada externa anterior es incierto; no se repetirá automáticamente.',
  EXTERNAL_ACTION_NOT_AUTHORIZED:'La operación externa no tiene autorización.',
  OUTPUT_RESOURCE_BUDGET:'Los resultados superan el presupuesto de memoria de esta tarea.',
  JSON_DATA_MISMATCH:'El JSON producido cambió los datos originales.',
  PDF_PAGE_COUNT_MISMATCH:'El PDF producido no contiene la cantidad de páginas solicitada.',
  PDF_ROTATION_MISMATCH:'La rotación del PDF no coincide con la solicitud.',
  IMAGE_DIMENSIONS_MISMATCH:'Las dimensiones de la imagen no coinciden con la solicitud.',
  INVALID_OFFICE_STRUCTURE:'El documento Office no contiene la estructura requerida.',
  INVALID_ZIP_STRUCTURE:'El archivo comprimido no pasó la comprobación de integridad.',
  ARCHIVE_RESOURCE_BUDGET:'El contenido expandido del archivo excede el presupuesto de memoria.',
  EMPTY_RESULT:'La herramienta no produjo contenido comprobable.',
  EMPTY_ARTIFACT:'La herramienta produjo un archivo vacío.',
  SIZE_TARGET_MISMATCH:'El archivo supera el tamaño solicitado.',
  REPAIR_UNAVAILABLE:'No fue posible obtener una corrección segura de Queen.',
  UNSAFE_REPAIR:'La corrección propuesta cambia operaciones que requieren otro plan.'
 };
 return descriptions[error?.verificationCode||error?.message]||'La herramienta falló o su resultado no pasó la validación independiente.';
}
