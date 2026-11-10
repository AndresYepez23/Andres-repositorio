// Prisma Core ambient: a lightweight interactive halftone/dot matrix.
// Purely decorative: no external services, WebGL, tracking or layout shifts.
// Mounted once on the complete chat column and kept behind messages and composer.
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function mountCoreWelcomeGrid(container){
 if(!container||typeof document==='undefined'||typeof window==='undefined')return ()=>{};
 const layer=document.createElement('div');
 layer.className='core-welcome-ambient';
 layer.setAttribute('aria-hidden','true');
 const canvas=document.createElement('canvas');
 canvas.className='core-welcome-dots';
 canvas.setAttribute('role','presentation');
 layer.append(canvas);
 container.append(layer);
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(!ctx)return ()=>layer.remove();

 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const precise=window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches===true;
 const touchOnly=!precise;
 let width=0,height=0,ratio=1,raf=0,lastFrame=0;
 let destroyed=false,inView=true,theme='';
 let pointerX=-1000,pointerY=-1000,targetX=-1000,targetY=-1000;
 let strength=0,targetStrength=0,touchUntil=0;
 const nominalInterval=precise?1000/27:1000/22;
 const dotsDesktop=15,dotsTablet=17,dotsMobile=18;

 function currentTheme(){
  return document.documentElement.dataset.theme==='light'?'light':'dark';
 }
 function measure(){
  if(destroyed)return;
  const bounds=layer.getBoundingClientRect();
  const nextWidth=Math.round(bounds.width),nextHeight=Math.round(bounds.height);
  if(nextWidth<5||nextHeight<5)return;
  const nextRatio=Math.min(window.devicePixelRatio||1,1.5);
  if(width!==nextWidth||height!==nextHeight||ratio!==nextRatio){
   width=nextWidth;height=nextHeight;ratio=nextRatio;
   canvas.width=Math.round(width*ratio);
   canvas.height=Math.round(height*ratio);
   canvas.style.width=width+'px';
   canvas.style.height=height+'px';
  }
  draw(performance.now());
 }
 function draw(now){
  if(destroyed||!width||!height)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,width,height);
  const dark=currentTheme()==='dark';
  theme=dark?'dark':'light';
  const midX=width*.50,midY=height*.49;
  const glow=ctx.createRadialGradient(midX,midY,8,midX,midY,Math.max(width*.76,height*1.08));
  glow.addColorStop(0,dark?'rgba(68,205,198,.105)':'rgba(55,155,160,.078)');
  glow.addColorStop(.48,dark?'rgba(54,112,176,.052)':'rgba(80,141,162,.027)');
  glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);

  pointerX+=(targetX-pointerX)*.16;
  pointerY+=(targetY-pointerY)*.16;
  strength+=(targetStrength-strength)*.14;
  const hoverRadius=precise?190:138;
  const space=width<=580?dotsMobile:width<=900?dotsTablet:dotsDesktop;
  const offsetX=((width%space)/2)+space/2;
  const offsetY=((height%space)/2)+space/2;
  const breathe=reduced?0:Math.sin(now*.00048)*.065;
  const envelopeX=Math.max(150,width*.47),envelopeY=Math.max(120,height*.54);

  if(strength>.012){
   const aura=ctx.createRadialGradient(pointerX,pointerY,1,pointerX,pointerY,hoverRadius*1.58);
   aura.addColorStop(0,dark?'rgba(111,243,224,.17)':'rgba(27,153,146,.12)');
   aura.addColorStop(.38,dark?'rgba(94,188,237,.075)':'rgba(72,149,198,.046)');
   aura.addColorStop(1,'rgba(0,0,0,0)');
   ctx.fillStyle=aura;
   ctx.globalAlpha=strength;
   ctx.fillRect(pointerX-hoverRadius*1.58,pointerY-hoverRadius*1.58,hoverRadius*3.16,hoverRadius*3.16);
   ctx.globalAlpha=1;
  }

  for(let y=offsetY,row=0;y<height;y+=space,row++){
   for(let x=offsetX,col=0;x<width;x+=space,col++){
    const ex=(x-midX)/envelopeX,ey=(y-midY)/envelopeY;
    const falloff=Math.exp(-.72*(ex*ex+ey*ey));
    const distance=Math.hypot(x-pointerX,y-pointerY);
    const near=strength*Math.exp(-Math.pow(distance/hoverRadius,2)*1.85);
    const topology=Math.sin(x*.029+y*.021+now*.00034)*.5+.5;
    const alpha=clamp((dark?.105:.092)+(dark?.235:.19)*falloff+
      (.085+breathe)*falloff*topology+near*(dark?.72:.53),0,.98);
    const radius=.76+.48*falloff+near*1.22;
    const tint=(col*7+row*3)%17;
    const rgb=tint<10?(dark?'135,222,218':'45,127,133'):
      tint<15?(dark?'118,167,229':'58,111,172'):
      (dark?'177,153,228':'123,97,171');
    ctx.fillStyle='rgba('+rgb+','+alpha.toFixed(3)+')';
    ctx.beginPath();
    ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fill();
    // A few brighter anchor pixels reinforce the subtle circuit-grid look.
    if((col+row*5)%19===0&&falloff>.30){
     ctx.fillStyle=dark?'rgba(167,241,234,.34)':'rgba(47,131,145,.25)';
     ctx.fillRect(x-.55,y-.55,1.1,1.1);
    }
   }
  }
  if(strength>.025){
   // Short connected traces exist only inside the pointer field.
   const startX=Math.floor((pointerX-hoverRadius-offsetX)/space);
   const endX=Math.ceil((pointerX+hoverRadius-offsetX)/space);
   const startY=Math.floor((pointerY-hoverRadius-offsetY)/space);
   const endY=Math.ceil((pointerY+hoverRadius-offsetY)/space);
   ctx.lineWidth=.68;
   for(let col=Math.max(0,startX);col<=endX;col++){
    for(let row=Math.max(0,startY);row<=endY;row++){
     if((col*13+row*7)%5!==0)continue;
     const x=offsetX+col*space,y=offsetY+row*space;
     const distance=Math.hypot(x-pointerX,y-pointerY);
     const near=clamp(1-distance/hoverRadius,0,1)*strength;
     if(near<.10)continue;
     ctx.strokeStyle=dark?'rgba(127,234,222,'+(near*.27).toFixed(3)+')':
       'rgba(38,125,139,'+(near*.22).toFixed(3)+')';
     ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+space,y);ctx.stroke();
    }
   }
  }
 }

 function shouldRun(){
  return !destroyed&&!reduced&&inView&&!document.hidden;
 }
 function tick(now){
  raf=0;
  if(!shouldRun())return;
  if(touchOnly&&now>touchUntil)targetStrength=0;
  if(now-lastFrame>=nominalInterval){
   lastFrame=now;
   draw(now);
  }
  if(precise||now<touchUntil||strength>.018)raf=requestAnimationFrame(tick);
 }
 function resume(){
  if(!shouldRun()||raf)return;
  raf=requestAnimationFrame(tick);
 }
 function move(event){
  if(!precise||event.pointerType==='touch'||destroyed||reduced)return;
  const rect=layer.getBoundingClientRect();
  targetX=event.clientX-rect.left;
  targetY=event.clientY-rect.top;
  if(pointerX<0){pointerX=targetX;pointerY=targetY;}
  targetStrength=1;
  resume();
 }
 function leave(){
  targetStrength=0;
  resume();
 }
 function touch(event){
  if(precise||reduced||destroyed)return;
  const rect=layer.getBoundingClientRect();
  targetX=pointerX=event.clientX-rect.left;
  targetY=pointerY=event.clientY-rect.top;
  targetStrength=1;
  touchUntil=performance.now()+850;
  resume();
 }
 function visibility(){if(shouldRun())resume();else if(raf){cancelAnimationFrame(raf);raf=0;}}
 const pointerTarget=container;
 if(!reduced){
  if(precise){
   pointerTarget.addEventListener('pointermove',move,{passive:true});
   pointerTarget.addEventListener('pointerleave',leave,{passive:true});
  }else pointerTarget.addEventListener('pointerdown',touch,{passive:true});
 }
 document.addEventListener('visibilitychange',visibility);
 const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
 if(resizeObserver)resizeObserver.observe(layer);
 else window.addEventListener('resize',measure,{passive:true});
 const intersectionObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  inView=entries[0]?.isIntersecting!==false;
  visibility();
 },{threshold:.01}):null;
 intersectionObserver?.observe(container);
 measure();
 if(!reduced&&precise)resume();

 return ()=>{
  destroyed=true;
  if(raf)cancelAnimationFrame(raf);
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  if(!resizeObserver)window.removeEventListener('resize',measure);
  document.removeEventListener('visibilitychange',visibility);
  pointerTarget.removeEventListener('pointermove',move);
  pointerTarget.removeEventListener('pointerleave',leave);
  pointerTarget.removeEventListener('pointerdown',touch);
  layer.remove();
 };
}
