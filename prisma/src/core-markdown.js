// Safe, provider-independent Markdown rendering for every Prisma Core engine.
// Model output is untrusted: escape HTML first and generate only known elements.
function escape(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function inline(text){
 let source=escape(text),codes=[];
 source=source.replace(/\`([^\`\n]+)\`/g,(_,content)=>{
  const id=codes.length;codes.push('<code>'+content+'</code>');return '\u0000'+id+'\u0000';
 });
 source=source.replace(/\*\*([^\n*]+)\*\*/g,'<strong>$1</strong>');
 source=source.replace(/__([^\n_]+)__/g,'<strong>$1</strong>');
 source=source.replace(/~~([^\n~]+)~~/g,'<del>$1</del>');
 source=source.replace(/(?<!\*)\*([^\n*]+)\*(?!\*)/g,'<em>$1</em>');
 source=source.replace(/\[([^\]\n]{1,100})\]\((https?:\/\/[^\s)\n]{1,1000})\)/gi,(match,label,url)=>{
  return '<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+'</a>';
 });
 source=source.replace(/\u0000(\d+)\u0000/g,(_,index)=>codes[Number(index)]||'');
 return source;
}
function splitTableRow(line){
 let source=String(line||'').trim();
 if(source.startsWith('|'))source=source.slice(1);
 if(source.endsWith('|')&&!source.endsWith('\\|'))source=source.slice(0,-1);
 const cells=[];let current='',escaped=false,code=false;
 for(let i=0;i<source.length;i++){
  const char=source[i];
  if(char===String.fromCharCode(96)&&!escaped)code=!code;
  if(char==='|'&&!escaped&&!code){cells.push(current.trim());current='';continue;}
  current+=char;
  if(char==='\\'&&!escaped)escaped=true;else escaped=false;
 }
 cells.push(current.trim());
 return cells.map(cell=>cell.replace(/\\\|/g,'|'));
}
function tableSeparator(line){
 const cells=splitTableRow(line);
 return cells.length>=2&&cells.every(cell=>/^:?-{3,}:?$/.test(cell.replace(/\s/g,'')));
}
function isTableStart(lines,index){
 if(index+1>=lines.length||!String(lines[index]).includes('|'))return false;
 const header=splitTableRow(lines[index]),separator=splitTableRow(lines[index+1]);
 return header.length>=2&&tableSeparator(lines[index+1])&&separator.length===header.length;
}
function renderTable(header,separator,rows){
 const alignments=separator.map(cell=>cell.trim().startsWith(':')&&cell.trim().endsWith(':')?'center':cell.trim().endsWith(':')?'right':'left');
 const cell=(value,index,tag)=>'<'+tag+' class="align-'+(alignments[index]||'left')+'"'+(tag==='th'?' scope="col"':'')+'>'+inline(value||'')+'</'+tag+'>';
 const head='<thead><tr>'+header.map((value,index)=>cell(value,index,'th')).join('')+'</tr></thead>';
 const body=rows.length?'<tbody>'+rows.map(row=>'<tr>'+header.map((_,index)=>cell(row[index]||'',index,'td')).join('')+'</tr>').join('')+'</tbody>':'';
 return '<div class="core-table-wrap" role="region" aria-label="Tabla de datos con desplazamiento horizontal" tabindex="0"><table class="core-markdown-table">'+head+body+'</table></div>';
}
export function renderMarkdownSafe(source){
 const lines=String(source??'').slice(0,50000).replace(/\r\n?/g,'\n').split('\n');
 let result='',list='',code=false,codeLines=[];
 const closeList=()=>{if(list){result+='</'+list+'>';list='';}};
 for(let i=0;i<lines.length;i++){
  const raw=lines[i];
  if(/^\s*\`\`\`/.test(raw)){
   closeList();
   if(code){result+='<pre><code>'+escape(codeLines.join('\n'))+'</code></pre>';codeLines=[];code=false;}
   else code=true;
   continue;
  }
  if(code){codeLines.push(raw);continue;}
  if(!raw.trim()){closeList();continue;}
  if(isTableStart(lines,i)){
   closeList();
   const header=splitTableRow(raw),separator=splitTableRow(lines[i+1]),rows=[];
   i+=2;
   while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')&&!tableSeparator(lines[i])){
    const row=splitTableRow(lines[i]);
    if(row.length>=2)rows.push(row.slice(0,header.length));
    i++;
   }
   i--;
   result+=renderTable(header,separator,rows);
   continue;
  }
  if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)){closeList();result+='<hr class="core-md-rule">';continue;}
  const heading=raw.match(/^\s*(#{1,5})\s+(.+)$/);
  if(heading){closeList();const level=Math.min(5,heading[1].length+1);result+='<h'+level+'>'+inline(heading[2])+'</h'+level+'>';continue;}
  const bullet=raw.match(/^\s*[-*+•]\s+(.+)$/);
  const numbered=raw.match(/^\s*\d+[.)]\s+(.+)$/);
  const newList=bullet?'ul':numbered?'ol':'';
  if(newList){
   if(list!==newList){closeList();result+='<'+newList+'>';list=newList;}
   result+='<li>'+inline((bullet||numbered)[1])+'</li>';
   continue;
  }
  closeList();
  if(/^\s*>\s+/.test(raw))result+='<blockquote>'+inline(raw.replace(/^\s*>\s+/,''))+'</blockquote>';
  else result+='<p>'+inline(raw)+'</p>';
 }
 closeList();
 if(code)result+='<pre><code>'+escape(codeLines.join('\n'))+'</code></pre>';
 return result;
}
