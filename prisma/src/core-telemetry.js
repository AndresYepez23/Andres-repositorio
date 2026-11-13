// First-party aggregate counters only. Never serialize prompts, filenames, content,
// credentials, account IDs or error strings. Disabled in preview and Node tests.
import { tools } from './registry.js';
const ids=new Set(tools.map(t=>t.id));
const events=new Set(['requested','succeeded','failed','clarification','unresolved','local-plan','provider-attempt','provider-success','provider-failed','queen-plan','queen-verified','queen-verification-pending','queen-failed']);
export function metricEvent(id,event,{duration=0,files=0}={}){
 if(!ids.has(id)&&id!=='core')return null;if(!events.has(event))return null;
 return {id,event,duration:Math.min(300000,Math.max(0,Math.round(Number(duration)||0))),files:Math.min(100,Math.max(0,Math.round(Number(files)||0)))};
}
let queue=[],timer=null;
export function recordCoreMetric(id,event,details={}){
 const item=metricEvent(id,event,details);if(!item)return;
 if(typeof window==='undefined'||window.location.hostname!=='prismaspace.pages.dev'||navigator.doNotTrack==='1')return;
 queue.push(item);if(queue.length>40)queue.shift();
 if(!timer)timer=setTimeout(flushCoreMetrics,4000);
}
async function flushCoreMetrics(){
 timer=null;const batch=queue.splice(0,20);if(!batch.length)return;
 try{await fetch('/api/core/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:batch}),keepalive:true});}catch{/* Metrics cannot fail a user's task. */}
 if(queue.length)timer=setTimeout(flushCoreMetrics,4000);
}
