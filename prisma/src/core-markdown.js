// Markdown rendering with escaping and an explicit safe link allowlist.
// Untrusted model text is never inserted as raw HTML.
function escape(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function inline(text){
 let source=escape(text),codes=[];
 source=source.replace(/`([^`\n]+)`/g,(_,content)=>{
  const id=codes.length;codes.push('<code>'+content+'</code>');return '\u0000'+id+'\u0000';
 });
 source=source.replace(/\*\*([^\n*]+)\*\*/g,'<strong>$1</strong>');
 source=source.replace(/__([^\n_]+)__/g,'<strong>$1</strong>');
 source=source.replace(/(?<!\*)\*([^\n*]+)\*(?!\*)/g,'<em>$1</em>');
 source=source.replace(/\[([^\]\n]{1,100})\]\((https?:\/\/[^\s)\n]{1,1000})\)/gi,(match,label,url)=>{
  return '<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+'</a>';
 });
 source=source.replace(/\u0000(\d+)\u0000/g,(_,index)=>codes[Number(index)]||'');
 return source;
}
export function renderMarkdownSafe(source){
 const lines=String(source??'').slice(0,50000).replace(/\r\n/g,'\n').split('\n');
 let result='',list='',code=false,codeLines=[];
 const closeList=()=>{if(list){result+='</'+list+'>';list='';}};
 for(const raw of lines){
  if(/^\s*```/.test(raw)){
   closeList();
   if(code){result+='<pre><code>'+escape(codeLines.join('\n'))+'</code></pre>';codeLines=[];code=false;}
   else code=true;
   continue;
  }
  if(code){codeLines.push(raw);continue;}
  if(!raw.trim()){closeList();continue;}
  const heading=raw.match(/^\s*(#{1,4})\s+(.+)$/);
  if(heading){closeList();const level=heading[1].length+1;result+='<h'+level+'>'+inline(heading[2])+'</h'+level+'>';continue;}
  const bullet=raw.match(/^\s*[-*+]\s+(.+)$/);
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
