// PNG icon for Safari Add to Home Screen. A deterministic 180px PNG, independent of raster build tools.
const W=180,H=180;
function crc32(bytes){
 let crc=0xffffffff;
 for(const b of bytes){crc^=b;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
}
function packUint32(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
function chunk(name,data){
 const type=Uint8Array.from(name.split('').map(c=>c.charCodeAt(0)));
 const combined=new Uint8Array(type.length+data.length);combined.set(type);combined.set(data,type.length);
 const out=new Uint8Array(12+data.length);
 out.set(packUint32(data.length));out.set(combined,4);out.set(packUint32(crc32(combined)),8+data.length);return out;
}
function distanceToSegment(px,py,x1,y1,x2,y2){
 const dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy)));
 return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
}
function imageBytes(){
 const scan=new Uint8Array(H*(1+W*4));let offset=0;
 const lines=[[90,36,143,139],[143,139,37,139],[37,139,90,36],[90,36,90,139],[37,139,90,106],[90,106,143,139],[90,106,120,88]];
 for(let y=0;y<H;y++){
  scan[offset++]=0;
  for(let x=0;x<W;x++){
   const t=y/H,bg=[Math.round(16+12*t),Math.round(19+12*t),Math.round(31+17*t)];
   let d=999;for(let k=0;k<lines.length;k++){const a=lines[k];d=Math.min(d,distanceToSegment(x,y,a[0],a[1],a[2],a[3]));}
   const glow=Math.max(0,1-d/12)*.15;
   const stroke=Math.max(0,Math.min(1,5.1-d));
   const g=x/W,v=y/H;const color=[Math.round(136+42*g),Math.round(225-51*v),Math.round(216+18*v)];
   for(let j=0;j<3;j++)scan[offset++]=Math.max(0,Math.min(255,Math.round(bg[j]*(1-stroke)+color[j]*stroke+color[j]*glow)));
   scan[offset++]=255;
  }
 }
 let a=1,b=0;for(const byte of scan){a=(a+byte)%65521;b=(b+a)%65521;}
 const blocks=[0x78,0x01];let pos=0;
 while(pos<scan.length){
  const len=Math.min(65535,scan.length-pos),last=pos+len===scan.length?1:0;
  blocks.push(last,len&255,(len>>8)&255,(~len)&255,((~len)>>8)&255);
  for(let i=0;i<len;i++)blocks.push(scan[pos+i]);
  pos+=len;
 }
 blocks.push(...packUint32(((b<<16)|a)>>>0));
 const header=new Uint8Array(13);header.set(packUint32(W),0);header.set(packUint32(H),4);header[8]=8;header[9]=6;
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',Uint8Array.from(blocks)),chunk('IEND',new Uint8Array(0))];
 const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;
}
const PNG=imageBytes();
export function onRequestGet(){return new Response(PNG,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});}
