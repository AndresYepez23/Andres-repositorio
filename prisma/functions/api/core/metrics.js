import { metricEvent } from '../../../src/core-telemetry.js';
const reply=status=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(request.headers.get('Origin')!==url.origin)return reply(403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply(415);
 if(Number(request.headers.get('Content-Length')||0)>6000)return reply(413);
 // Bound the stream even when Content-Length is absent or dishonest.
 const reader=request.body?.getReader();if(!reader)return reply(400);
 let raw='',size=0;const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>6000){await reader.cancel();return reply(413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}catch{return reply(400);}
 let data;try{data=JSON.parse(raw);}catch{return reply(400);}
 if(!Array.isArray(data.events)||data.events.length<1||data.events.length>20)return reply(400);
 const rows=data.events.map(e=>metricEvent(e?.id,e?.event,e));if(rows.some(e=>!e))return reply(400);
 if(!env.PRISMA_RATE_DB?.prepare)return reply(503);
 const day=new Date().toISOString().slice(0,10);
 try{
  await env.PRISMA_RATE_DB.batch(rows.map(e=>env.PRISMA_RATE_DB.prepare(`INSERT INTO core_metrics(day,tool_id,event,count,duration_ms,files) VALUES(?,?,?,1,?,?) ON CONFLICT(day,tool_id,event) DO UPDATE SET count=MIN(count+1,100000),duration_ms=MIN(duration_ms+excluded.duration_ms,30000000000),files=MIN(files+excluded.files,10000000)`).bind(day,e.id,e.event,e.duration,e.files)));
  return reply(204);
 }catch{return reply(503);}
}
