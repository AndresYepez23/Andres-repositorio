// Shared, deterministic PDF split planning. No network calls or file uploads.
// The UI uses page numbers starting at 1; pdf-lib expects indices starting at 0.
export function parsePdfPageSelection(value,total){
 const chosen=new Set(),spec=String(value??'').trim();
 if(!spec)throw Error('Indica las páginas que deseas separar, por ejemplo 2, 4-6.');
 for(const part of spec.split(',')){
  const found=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if(!found)throw Error('Formato de páginas inválido. Usa números y rangos: 2, 4-6.');
  const from=Number(found[1]),to=found[2]?Number(found[2]):from;
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<1||to<from||to>total)
   throw Error('El rango de páginas está fuera del documento (1-'+total+').');
  for(let page=from;page<=to;page++)chosen.add(page-1);
 }
 return [...chosen].sort((a,b)=>a-b);
}
function validInteger(value,label,min,max){
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(label);
 return n;
}
export function planPdfSplit(params={},pageCount=0){
 const total=validInteger(pageCount,'El PDF no contiene páginas válidas.',1,100000);
 const mode=String(params.mode||(params.ranges?'ranges':params.pages?'selected':params.parts?'parts':params.chunkSize?'chunk':'all')).toLowerCase();
 const all=Array.from({length:total},(_,i)=>i);
 let indices;
 if(mode==='all')indices=all.map(i=>[i]);
 else if(mode==='selected')indices=parsePdfPageSelection(params.pages,total).map(i=>[i]);
 else if(mode==='ranges'){
  const specs=String(params.ranges||'').split(';').map(x=>x.trim()).filter(Boolean);
  if(!specs.length)throw Error('Indica rangos separados por punto y coma.');
  if(specs.length>100)throw Error('Admite como máximo 100 rangos.');
  const seen=new Set();
  indices=specs.map(spec=>{
   const pages=parsePdfPageSelection(spec,total);
   for(const i of pages){if(seen.has(i))throw Error('Hay páginas repetidas entre los rangos.');seen.add(i);}
   return pages;
  });
 }else if(mode==='parts'){
  const parts=validInteger(params.parts,'Indica entre 2 y 20 partes.',2,20);
  if(parts>total)throw Error('La cantidad de partes no puede superar el número de páginas.');
  indices=Array.from({length:parts},(_,i)=>all.slice(Math.floor(i*total/parts),Math.floor((i+1)*total/parts)));
 }else if(mode==='chunk'){
  const size=validInteger(params.chunkSize,'Indica entre 1 y 200 páginas por bloque.',1,200);
  indices=Array.from({length:Math.ceil(total/size)},(_,i)=>all.slice(i*size,(i+1)*size));
 }else throw Error('Elige un modo de división válido.');
 const groups=indices.map((pages,i)=>{
  const number=String(i+1).padStart(3,'0'),first=pages[0]+1,last=pages[pages.length-1]+1;
  const filename=mode==='all'||mode==='selected'?'pagina-'+String(first).padStart(3,'0')+'.pdf'
   :(mode==='ranges'?'rango-':'parte-')+number+'-paginas-'+first+(last===first?'':'-'+last)+'.pdf';
  return {indices:pages,filename};
 });
 return {mode,totalPages:total,selectedCount:groups.reduce((n,g)=>n+g.indices.length,0),groups};
}
