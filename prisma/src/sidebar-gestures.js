// Touch-first, zero-dependency sidebar gestures. Works in Safari/iOS PWA.
// Horizontal swipes open/close the drawer; vertical finger movement is left
// entirely to the browser's inertial scrolling inside the sidebar.
export const SIDEBAR_EDGE_PX=44;
export function classifySidebarSwipe({startX=0,startY=0,x=0,y=0,open=false,edge=SIDEBAR_EDGE_PX}={}){
 const dx=x-startX,dy=y-startY,ax=Math.abs(dx),ay=Math.abs(dy);
 if(ax<15&&ay<15)return 'pending';
 if(ay>=13&&ay>ax*1.12)return 'vertical';
 if(ax<18||ax<ay*1.35)return 'pending';
 if(open)return dx<0?'close':'ignore';
 return startX<=edge&&dx>0?'open':'ignore';
}
export function shouldCommitSidebarSwipe({distance=0,drawerWidth=320,elapsed=0}={}){
 const travelled=Math.max(0,Number(distance)||0);
 const width=Math.max(1,Number(drawerWidth)||320);
 const ms=Math.max(1,Number(elapsed)||1);
 return travelled>=Math.max(62,Math.min(110,width*.26)) ||
   travelled>=45&&travelled/ms>.54;
}
export function installMobileSidebarGestures({
 sidebar,backdrop,menu,body=document.body,documentTarget=document,
 mobile=()=>window.matchMedia('(max-width:850px)').matches,
 isBlocked=()=>body.classList.contains('modal-open')||body.classList.contains('sidebar-search-open')
}={}){
 if(!sidebar||!backdrop)return ()=>{};
 let touch=null,cleanupTimer=0;
 const updateAria=open=>{
  menu?.setAttribute('aria-expanded',String(open));
  menu?.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');
 };
 const clearAnimation=()=>{
  if(cleanupTimer){clearTimeout(cleanupTimer);cleanupTimer=0;}
  sidebar.style.removeProperty('transform');
  sidebar.style.removeProperty('transition');
  backdrop.style.removeProperty('opacity');
  sidebar.classList.remove('sidebar-gesture-preview');
  backdrop.classList.remove('sidebar-gesture-preview');
 };
 const settle=open=>{
  sidebar.classList.toggle('open',open);
  backdrop.classList.toggle('open',open);
  updateAria(open);
  if(!touch?.locked){clearAnimation();return;}
  // The panel finishes moving with a short native CSS transition.
  const width=Math.max(1,sidebar.getBoundingClientRect().width);
  const finishX=open?0:-width;
  sidebar.style.transition='transform .2s cubic-bezier(.22,.7,.2,1)';
  sidebar.style.transform='translate3d('+finishX+'px,0,0)';
  backdrop.style.opacity=open?'1':'0';
  cleanupTimer=setTimeout(()=>{clearAnimation();},225);
 };
 const start=event=>{
  if(!mobile()||isBlocked()||event.touches.length!==1)return;
  // Do not steal text editing, selection or form controls from the browser.
  if(event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const point=event.touches[0];
  const open=sidebar.classList.contains('open');
  if(open){
   const bounds=sidebar.getBoundingClientRect();
   if(point.clientX>bounds.right+24)return;
  }else if(point.clientX>SIDEBAR_EDGE_PX)return;
  if(cleanupTimer)clearAnimation();
  touch={id:point.identifier,x:point.clientX,y:point.clientY,
    start:Date.now(),open,locked:false,ignored:false,dx:0,dy:0};
 };
 const move=event=>{
  if(!touch||!mobile())return;
  if(event.touches.length!==1){touch.ignored=true;return;}
  const point=event.touches[0];
  if(point.identifier!==touch.id)return;
  touch.dx=point.clientX-touch.x;
  touch.dy=point.clientY-touch.y;
  if(!touch.locked){
   const intent=classifySidebarSwipe({
    startX:touch.x,startY:touch.y,x:point.clientX,y:point.clientY,open:touch.open
   });
   if(intent==='vertical'||intent==='ignore'){touch.ignored=true;return;}
   if(intent==='pending'||touch.ignored)return;
   touch.locked=true;
   sidebar.classList.add('sidebar-gesture-preview');
   backdrop.classList.add('sidebar-gesture-preview');
  }
  // Avoid the browser performing a page/back gesture only AFTER we know the
  // motion is horizontal. Vertical drawer scrolling is never cancelled.
  if(event.cancelable)event.preventDefault();
  const width=Math.max(1,sidebar.getBoundingClientRect().width);
  const offset=touch.open?Math.max(-width,Math.min(0,touch.dx)):
    Math.max(-width,Math.min(0,-width+touch.dx));
  const fraction=Math.max(0,Math.min(1,1+offset/width));
  sidebar.style.transition='none';
  sidebar.style.transform='translate3d('+offset+'px,0,0)';
  backdrop.style.opacity=String(fraction*.92);
 };
 const end=event=>{
  if(!touch)return;
  const prior=touch;
  if(!prior.locked){touch=null;return;}
  const point=[...event.changedTouches].find(t=>t.identifier===prior.id);
  if(point){prior.dx=point.clientX-prior.x;prior.dy=point.clientY-prior.y;}
  const travel=prior.open?-prior.dx:prior.dx;
  const ok=Math.abs(prior.dy)<=Math.abs(prior.dx)*.9 &&
    shouldCommitSidebarSwipe({
     distance:travel,drawerWidth:sidebar.getBoundingClientRect().width,
     elapsed:Date.now()-prior.start
    });
  settle(ok?!prior.open:prior.open);
  touch=null;
 };
 const cancel=()=>{
  if(!touch)return;
  settle(touch.open);
  touch=null;
 };
 const onResize=()=>{
  if(!mobile())cancel();
 };
 documentTarget.addEventListener('touchstart',start,{passive:true,capture:true});
 documentTarget.addEventListener('touchmove',move,{passive:false,capture:true});
 documentTarget.addEventListener('touchend',end,{passive:true,capture:true});
 documentTarget.addEventListener('touchcancel',cancel,{passive:true,capture:true});
 window.addEventListener('resize',onResize,{passive:true});
 return ()=>{
  cancel();
  clearAnimation();
  documentTarget.removeEventListener('touchstart',start,true);
  documentTarget.removeEventListener('touchmove',move,true);
  documentTarget.removeEventListener('touchend',end,true);
  documentTarget.removeEventListener('touchcancel',cancel,true);
  window.removeEventListener('resize',onResize);
 };
}
