// Animated rotating tetrahedron with real 3D vertices, rotation and perspective.
// Rendered with Canvas 2D for mobile efficiency; no APIs or external dependencies.
export function initPrismMotion(){
 const container=document.querySelector('.prism-core');
 const art=document.querySelector('.hero-art');
 if(!container||!art||container.querySelector('.hero-prism-canvas'))return;
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const canvas=document.createElement('canvas');
 canvas.className='hero-prism-canvas';
 canvas.setAttribute('aria-hidden','true');
 canvas.width=520;canvas.height=520;
 const ctx=canvas.getContext('2d',{alpha:true});
 if(!ctx)return;
 container.append(canvas);
 container.classList.add('canvas-ready');
 const vertices=[[0,1.3,0],[-1.05,-.55,.80],[1.05,-.55,.80],[0,-.55,-1.23]];
 const faces=[[0,2,1],[0,3,2],[0,1,3],[1,2,3]];
 const colors=['rgba(160,237,225,.25)','rgba(161,169,248,.20)','rgba(211,184,255,.20)','rgba(125,147,220,.13)'];
 let visible=true,handle=0,lastFrame=0,spin=.43,pointerX=0,pointerY=0;
 const rotate=(vertex,ry,rx)=>{
  let [x,y,z]=vertex;
  const cy=Math.cos(ry),sy=Math.sin(ry);
  [x,z]=[x*cy+z*sy,-x*sy+z*cy];
  const cx=Math.cos(rx),sx=Math.sin(rx);
  [y,z]=[y*cx-z*sx,y*sx+z*cx];
  return [x,y,z];
 };
 const project=point=>{
  const f=3.6/(3.6-point[2]),scale=115*f;
  return {x:260+point[0]*scale,y:267-point[1]*scale,z:point[2]};
 };
 function render(time){
  const t=reduce?0:time*.00033;
  const angle=t+spin;
  ctx.clearRect(0,0,520,520);
  const points=vertices.map(v=>project(rotate(v,angle+pointerX*.3,.08+Math.sin(t*.77)*.12+pointerY*.3)));
  const sorted=faces.map((face,i)=>({face,i,depth:face.reduce((sum,n)=>sum+points[n].z,0)/3})).sort((a,b)=>a.depth-b.depth);
  for(const item of sorted){
   const [a,b,c]=item.face.map(n=>points[n]);
   const shade=ctx.createLinearGradient(a.x,a.y,c.x,c.y);
   shade.addColorStop(0,colors[item.i]);shade.addColorStop(1,'rgba(172,153,245,.05)');
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();
   ctx.fillStyle=shade;ctx.fill();
   ctx.strokeStyle='rgba(169,215,240,.48)';ctx.lineWidth=2;ctx.stroke();
  }
  ctx.save();
  ctx.shadowBlur=16;ctx.shadowColor='rgba(158,218,242,.65)';
  for(const [a,b] of [[0,1],[0,2],[0,3],[1,2],[2,3],[3,1]]){
   const from=points[a],to=points[b];
   ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);
   ctx.strokeStyle='rgba(211,237,252,'+(.62+.27*(from.z+to.z+2.5)/5)+')';
   ctx.lineWidth=2.4;ctx.stroke();
  }
  ctx.restore();
  // An inner radial beam indicates spatial depth without distracting from text.
  const center={x:(points[1].x+points[2].x+points[3].x)/3,y:(points[1].y+points[2].y+points[3].y)/3};
  ctx.beginPath();ctx.arc(center.x,center.y,4.7,0,Math.PI*2);
  ctx.fillStyle='rgba(231,255,249,.95)';ctx.shadowColor='#a4e4dc';ctx.shadowBlur=15;ctx.fill();ctx.shadowBlur=0;
 }
 const loop=timestamp=>{
  if(!visible||document.hidden){handle=0;return;}
  if(timestamp-lastFrame>32){render(timestamp);lastFrame=timestamp;}
  handle=requestAnimationFrame(loop);
 };
 function start(){if(reduce){render(0);return;}if(!handle)handle=requestAnimationFrame(loop);}
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  visible=entries[0]?.isIntersecting||false;
  if(visible)start();else if(handle){cancelAnimationFrame(handle);handle=0;}
 },{threshold:.02}):null;
 observer?.observe(art);
 art.addEventListener('pointermove',e=>{
  if(e.pointerType&&e.pointerType!=='mouse')return;
  const bounds=art.getBoundingClientRect();
  pointerX=((e.clientX-bounds.left)/bounds.width-.5)*2;
  pointerY=((e.clientY-bounds.top)/bounds.height-.5)*2;
 });
 art.addEventListener('pointerleave',()=>{pointerX=0;pointerY=0;});
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&visible)start();
  if(document.hidden&&handle){cancelAnimationFrame(handle);handle=0;}
 });
 start();
}
