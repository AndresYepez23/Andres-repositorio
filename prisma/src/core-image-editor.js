// Client-side thumbnail typography. Only Canvas API; no upload or model credits.
let sourceImage=null;
let saveCallback=null;
let sourceUrl=null;
const $=selector=>document.querySelector(selector);
const imageEditor=()=>$('#core-image-editor');
const stopWords=value=>String(value||'').trim().replace(/\s+/g,' ').slice(0,90);
function cover(ctx,image,w,h){
 const sw=image.naturalWidth||image.width,sh=image.naturalHeight||image.height;
 const ratio=Math.max(w/sw,h/sh),dw=sw*ratio,dh=sh*ratio;
 ctx.drawImage(image,(w-dw)/2,(h-dh)/2,dw,dh);
}
function wrapLines(ctx,text,maxWidth,maxLines=3){
 const words=stopWords(text).split(/\s+/).filter(Boolean),lines=[];
 let current='';
 for(const word of words){
  const candidate=current?current+' '+word:word;
  if(ctx.measureText(candidate).width<=maxWidth){current=candidate;continue;}
  if(current){lines.push(current);current='';}
  if(ctx.measureText(word).width<=maxWidth){current=word;continue;}
  let piece='';
  for(const letter of word){
   if(ctx.measureText(piece+letter).width>maxWidth&&piece){lines.push(piece);piece='';}
   piece+=letter;
  }
  current=piece;
 }
 if(current)lines.push(current);
 if(lines.length>maxLines) return [...lines.slice(0,maxLines-1),lines.slice(maxLines-1).join(' ')];
 return lines;
}
function redraw(){
 const canvas=$('#core-editor-canvas');if(!canvas||!sourceImage)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);cover(ctx,sourceImage,w,h);
 const main=stopWords($('#core-editor-main-text')?.value),sub=stopWords($('#core-editor-sub-text')?.value);
 if(!main&&!sub)return;
 const where=$('#core-editor-position')?.value||'left';
 const color=$('#core-editor-color')?.value||'#ffffff';
 const useShade=$('#core-editor-shade')?.checked;
 const boxWidth=where==='center'?1060:850;
 const x=where==='right'?w-66:where==='center'?w/2:66;
 const alignment=where==='right'?'right':where==='center'?'center':'left';
 const baseline=h*.51;
 if(useShade){
  const shade=ctx.createLinearGradient(where==='right'?w:0,0,where==='right'?0:w,0);
  shade.addColorStop(0,'rgba(10,15,30,.88)');
  shade.addColorStop(0.62,'rgba(10,15,30,.4)');
  shade.addColorStop(1,'rgba(10,15,30,0)');
  ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
 }
 ctx.textAlign=alignment;ctx.textBaseline='middle';ctx.lineJoin='round';
 let size=Number($('#core-editor-size')?.value)||82;
 ctx.font='900 '+size+'px system-ui,-apple-system,sans-serif';
 let lines=wrapLines(ctx,main,boxWidth);
 while(lines.length>3&&size>34){size-=4;ctx.font='900 '+size+'px system-ui,-apple-system,sans-serif';lines=wrapLines(ctx,main,boxWidth);}
 if(lines.length>3)lines=lines.slice(0,3);
 const interval=size*1.18,total=lines.length*interval+(sub?58:0);
 const start=Math.max(100,Math.min(h-105-total,baseline-total/2));
 ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=16;ctx.lineWidth=10;ctx.strokeStyle='rgba(3,9,22,.88)';ctx.fillStyle=color;
 lines.forEach((line,i)=>{const y=start+i*interval;ctx.strokeText(line,x,y,boxWidth);ctx.fillText(line,x,y,boxWidth);});
 if(sub){
  ctx.font='800 35px system-ui,-apple-system,sans-serif';ctx.lineWidth=7;ctx.fillStyle='#ffffff';
  ctx.strokeText(sub,x,start+lines.length*interval+9,boxWidth);
  ctx.fillText(sub,x,start+lines.length*interval+9,boxWidth);
 }
 ctx.shadowBlur=0;
}
function close(){imageEditor()?.classList.add('hidden');document.body.classList.remove('core-editor-open');}
export async function openImageEditor({blob,filename,initialText='',onSave}){
 if(!blob||!String(blob.type||'').startsWith('image/'))throw Error('Selecciona una imagen válida para editar.');
 close();
 if(sourceUrl)URL.revokeObjectURL(sourceUrl);
 sourceUrl=URL.createObjectURL(blob);
 const img=new Image();
 img.decoding='async';img.src=sourceUrl;await img.decode();
 sourceImage=img;saveCallback=onSave;
 $('#core-editor-main-text').value=String(initialText||'').slice(0,68);$('#core-editor-sub-text').value='';
 $('#core-editor-position').value='left';$('#core-editor-color').value='#ffffff';
 $('#core-editor-size').value='82';$('#core-editor-shade').checked=true;
 imageEditor().classList.remove('hidden');document.body.classList.add('core-editor-open');
 redraw();$('#core-editor-main-text')?.focus();
}
export function initImageEditor(){
 if(!imageEditor()||imageEditor().dataset.ready)return;
 imageEditor().dataset.ready='yes';
 imageEditor().addEventListener('click',event=>{if(event.target===imageEditor())close();});
 $('#core-editor-close').addEventListener('click',close);
 $('#core-editor-reset').addEventListener('click',()=>{
  $('#core-editor-main-text').value='';$('#core-editor-sub-text').value='';
  $('#core-editor-size').value='82';$('#core-editor-position').value='left';
  $('#core-editor-color').value='#ffffff';$('#core-editor-shade').checked=true;redraw();
 });
 ['core-editor-main-text','core-editor-sub-text','core-editor-position','core-editor-color','core-editor-size','core-editor-shade'].forEach(id=>{
  $('#'+id)?.addEventListener('input',redraw);$('#'+id)?.addEventListener('change',redraw);
 });
 $('#core-editor-save').addEventListener('click',async()=>{
  if(!sourceImage||!saveCallback)return;
  const button=$('#core-editor-save');button.disabled=true;button.textContent='Guardando…';
  try{
   redraw();
   const blob=await new Promise((resolve,reject)=>$('#core-editor-canvas').toBlob(result=>result?resolve(result):reject(Error('No se pudo exportar el PNG.')),'image/png'));
   await saveCallback({blob,filename:'prisma-miniatura-editada-'+Date.now()+'.png',summary:'Miniatura de 1280 × 720 con textos aplicados localmente, sin gastar créditos de IA.'});
   close();
  }catch(error){window.alert(error?.message||'No se pudo guardar la imagen.');}
  finally{button.disabled=false;button.textContent='Guardar imagen en el chat';}
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!imageEditor().classList.contains('hidden'))close();});
}
