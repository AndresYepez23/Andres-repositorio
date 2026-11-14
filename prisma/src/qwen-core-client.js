// The browser never receives Qwen's credentials or a tool-execution command.
// Hints only re-rank EXISTING catalog entries; Core still plans and validates.
let disabledForPage=false;
export function prioritizeQwenCoreTools(catalog,hint){
 if(!Array.isArray(catalog))return [];
 if(hint?.source!=='qwen-core'||hint?.intent!=='tools'||!Array.isArray(hint.tool_ids))return catalog;
 const chosen=[...new Set(hint.tool_ids)].filter(id=>typeof id==='string');
 const indexed=new Map(catalog.map(c=>[c.id,c]));
 return [...chosen.filter(id=>indexed.has(id)).map(id=>indexed.get(id)),...catalog.filter(c=>!chosen.includes(c.id))];
}
export async function requestQwenCoreInterpretation({text,files=[]},{fetchImpl=fetch,signal,timeoutMs=30500}={}){
 if(disabledForPage)return null;
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,Math.min(30500,Math.max(500,timeoutMs)));
 try{
  const response=await fetchImpl('/api/core/qwen-interpret',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
   body:JSON.stringify({text:String(text||'').slice(0,4000),files:files.slice(0,20).map(f=>({name:String(f.name||'').slice(0,180),type:String(f.type||'').slice(0,120),size:Number(f.size)||0}))})});
  if(!response.ok){controller.abort();return null;}
  const payload=await response.json();
  if(payload?.available===false){disabledForPage=true;return null;}
  if(payload?.ok!==true||payload.source!=='qwen-core'||!['tools','question','clarify'].includes(payload.intent)||
   !Array.isArray(payload.tool_ids)||payload.tool_ids.length>3||payload.tool_ids.some(id=>typeof id!=='string'))return null;
  return {source:'qwen-core',intent:payload.intent,tool_ids:payload.tool_ids,metrics:payload.metrics||null};
 }catch{return null;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function resetQwenCoreDisabledForTest(){disabledForPage=false;}
