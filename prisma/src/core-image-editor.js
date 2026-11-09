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
 const boxWidth=Math.max(260,Math.min(w-110,where==='center'?1060:850));
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
 const canvas=$('#core-editor-canvas');
 const imageRatio=img.naturalWidth/img.naturalHeight;
 if(imageRatio>=1){canvas.width=1280;canvas.height=Math.round(1280/imageRatio);}
 else{canvas.height=1280;canvas.width=Math.round(1280*imageRatio);}
 $('#core-editor-main-text').value=String(initialText||'').slice(0,68);$('#core-editor-sub-text').value='';
 $('#core-editor-position').value='left';$('#core-editor-color').value='#ffffff';
 $('#core-editor-size').value='82';$('#core-editor-shade').checked=true;
 imageEditor().classList.remove('hidden');document.body.classList.add('core-editor-open');
 redraw();$('#core-editor-main-text')?.focus();
}
// Compose requested text directly onto generated imagery without another AI request.
export async function applyImageText(blob,title,ratio='square'){
 if(!blob||!String(blob.type||'').startsWith('image/'))throw Error('Se requiere una imagen válida.');
 const url=URL.createObjectURL(blob),img=new Image();
 try{
  img.src=url;await img.decode();
  const sizes={wide:[1280,720],square:[1024,1024],portrait:[768,1024],landscape:[1024,768]};
  const [w,h]=sizes[ratio]||sizes.square;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas no disponible.');
  cover(ctx,img,w,h);
  const shade=ctx.createLinearGradient(0,0,w,0);
  shade.addColorStop(0,'rgba(4,8,20,.85)');shade.addColorStop(.57,'rgba(4,8,20,.42)');shade.addColorStop(1,'rgba(4,8,20,0)');
  ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  const phrase=stopWords(title).slice(0,68);
  const maxWidth=w*.75;let size=Math.round(Math.min(92,w*.084));
  ctx.font='900 '+size+'px system-ui,-apple-system,sans-serif';
  let lines=wrapLines(ctx,phrase,maxWidth,3);
  while(lines.some(line=>ctx.measureText(line).width>maxWidth)&&size>30){
   size-=4;ctx.font='900 '+size+'px system-ui,-apple-system,sans-serif';
   lines=wrapLines(ctx,phrase,maxWidth,3);
  }
  ctx.textBaseline='middle';ctx.textAlign='left';ctx.lineJoin='round';
  ctx.strokeStyle='rgba(0,0,0,.92)';ctx.lineWidth=Math.max(5,size*.12);
  ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=13;ctx.fillStyle='#fff';
  const rowHeight=size*1.17;
  const start=Math.max(size,Math.min(h-(lines.length+.3)*rowHeight,(h-lines.length*rowHeight)/2));
  for(let i=0;i<lines.length;i++){
   const y=start+i*rowHeight;ctx.strokeText(lines[i],w*.065,y,maxWidth);ctx.fillText(lines[i],w*.065,y,maxWidth);
  }
  const composed=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo exportar el PNG.')),'image/png'));
  return composed;
 }finally{URL.revokeObjectURL(url);}
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
   await saveCallback({blob,filename:'prisma-imagen-editada-'+Date.now()+'.png',summary:'Imagen con texto editada y exportada localmente sin consumir créditos de IA.'});
   close();
  }catch(error){window.alert(error?.message||'No se pudo guardar la imagen.');}
  finally{button.disabled=false;button.textContent='Guardar imagen en el chat';}
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!imageEditor().classList.contains('hidden'))close();});
}
