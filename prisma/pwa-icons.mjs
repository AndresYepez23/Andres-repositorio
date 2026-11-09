// Generate Prisma Space app icons without external dependencies.
// Creates opaque PNG icons from the geometric Prisma mark with a safe zone for maskable.
import {writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
function crc32(data){let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(name,data){const payload=Buffer.from(data);const size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(payload.length);crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(name),payload])));return Buffer.concat([size,Buffer.from(name),payload,crc]);}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function segment(x,y,x1,y1,x2,y2,width){
 const vx=x2-x1,vy=y2-y1,d=vx*vx+vy*vy;
 const t=d?clamp(((x-x1)*vx+(y-y1)*vy)/d,0,1):0;
 return Math.hypot(x-(x1+t*vx),y-(y1+t*vy))<=width/2;
}
function shade(t){
 const stops=[[164,228,220],[140,176,236],[186,157,245]];
 if(t<.5){const a=t*2;return stops[0].map((v,i)=>Math.round(v*(1-a)+stops[1][i]*a));}
 const a=(t-.5)*2;return stops[1].map((v,i)=>Math.round(v*(1-a)+stops[2][i]*a));
}
function png(size){
 const buf=Buffer.alloc((size*4+1)*size);
 const segs=[
  [[.5,.22],[.77,.73]],[[.77,.73],[.23,.73]],[[.23,.73],[.5,.22]],
  [[.5,.22],[.5,.73]],[[.23,.73],[.5,.55]],[[.5,.55],[.77,.73]],
  [[.5,.55],[.645,.475]]
 ];
 const stroke=.015;
 for(let yy=0;yy<size;yy++){
  const offset=yy*(size*4+1);buf[offset]=0;
  for(let xx=0;xx<size;xx++){
   const x=(xx+.5)/size,y=(yy+.5)/size;
   const r=Math.hypot(x-.5,y-.48);
   let R=Math.round(12+13*y),G=Math.round(17+16*y),B=Math.round(31+21*y);
   const glow=clamp(1-r/.62,0,1);
   R+=Math.round(glow*8);G+=Math.round(glow*13);B+=Math.round(glow*21);
   let hit=false;
   for(const [[x1,y1],[x2,y2]] of segs)if(segment(x,y,x1,y1,x2,y2,stroke)){hit=true;break;}
   if(hit){
    const [cr,cg,cb]=shade(clamp((x-.2)/.6,0,1));
    R=cr;G=cg;B=cb;
   }
   const i=offset+1+xx*4;
   buf[i]=clamp(R,0,255);buf[i+1]=clamp(G,0,255);buf[i+2]=clamp(B,0,255);buf[i+3]=255;
  }
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 const signature=Buffer.from([137,80,78,71,13,10,26,10]);
 return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(buf,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
export async function generateIcons(directory){
 for(const size of [180,192,512])await writeFile(new URL('./prisma-app-'+size+'.png',directory),png(size));
}
