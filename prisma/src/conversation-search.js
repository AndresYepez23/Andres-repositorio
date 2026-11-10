// Fast, entirely local conversation search. No conversation data leaves
// the browser and search never creates a new chat or consumes AI quota.
const fold=value=>String(value||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();

function excerpt(message,needle=''){
 const raw=String(message||'').replace(/\s+/g,' ').trim();
 if(!raw)return '';
 if(!needle)return raw.slice(0,115)+(raw.length>115?'…':'');
 const normalized=fold(raw);
 const at=normalized.indexOf(needle);
 if(at<0)return raw.slice(0,115)+(raw.length>115?'…':'');
 const start=Math.max(0,at-42);
 const end=Math.min(raw.length,start+128);
 return (start?'…':'')+raw.slice(start,end)+(end<raw.length?'…':'');
}
export function findConversations(conversations=[],query='',limit=24){
 const q=fold(query).replace(/\s+/g,' ');
 const source=Array.isArray(conversations)?conversations:[];
 return source.map(chat=>{
  const title=String(chat?.title||'Nueva conversación');
  const entries=Array.isArray(chat?.messages)?chat.messages:[];
  const match=q?entries.slice().reverse().find(m=>fold(m?.content).includes(q)):null;
  const last=match||entries.slice().reverse().find(m=>String(m?.content||'').trim());
  const titleMatch=fold(title).includes(q);
  const relevant=!q||titleMatch||Boolean(match);
  const score=(q&&titleMatch?100:0)+(q&&match?50:0)+(chat?.pinned?5:0);
  return {id:String(chat?.id||''),title,preview:excerpt(last?.content||'',q),
    count:entries.length,updated:Number(chat?.updated)||0,score,relevant};
 }).filter(row=>row.id&&row.relevant)
  .sort((a,b)=>b.score-a.score||b.updated-a.updated)
  .slice(0,Math.max(1,Math.min(50,Number(limit)||24)));
}
