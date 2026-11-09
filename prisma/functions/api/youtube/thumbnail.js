const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const JPEG_START_OF_FRAME=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);

function jpegDimensions(bytes){
  for(let i=2;i+9<bytes.length;){
    if(bytes[i]!==0xff){i++;continue;}
    const marker=bytes[i+1];
    if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7)){i+=2;continue;}
    const length=(bytes[i+2]<<8)|bytes[i+3];
    if(length<2)break;
    if(JPEG_START_OF_FRAME.has(marker)){
      return {height:(bytes[i+5]<<8)|bytes[i+6],width:(bytes[i+7]<<8)|bytes[i+8]};
    }
    i+=2+length;
  }
  return null;
}

export async function onRequestGet({request}){
  const id=new URL(request.url).searchParams.get('id')||'';
  if(!VIDEO_ID.test(id)){
    return Response.json({error:'Identificador de video no válido.'},{status:400,headers:{'Cache-Control':'no-store'}});
  }
  for(const variant of ['maxresdefault.jpg','sddefault.jpg','hqdefault.jpg']){
    let upstream;
    try{
      upstream=await fetch('https://i.ytimg.com/vi/'+id+'/'+variant,{
        headers:{Accept:'image/jpeg'},
        redirect:'error',
        signal:AbortSignal.timeout(7000)
      });
    }catch{continue;}
    if(!upstream.ok)continue;
    const type=String(upstream.headers.get('content-type')||'').toLowerCase();
    if(!type.startsWith('image/jpeg'))continue;
    const declared=Number(upstream.headers.get('content-length')||0);
    if(declared>5*1024*1024)continue;
    const bytes=new Uint8Array(await upstream.arrayBuffer());
    if(bytes.length<500||bytes.length>5*1024*1024)continue;
    const dimensions=jpegDimensions(bytes);
    // YouTube sometimes returns a tiny 120×90 placeholder for a missing max-res image.
    if(dimensions&&dimensions.width<320)continue;
    return new Response(bytes,{
      status:200,
      headers:{
        'Content-Type':'image/jpeg',
        'Content-Length':String(bytes.length),
        'Cache-Control':'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options':'nosniff',
        'Content-Disposition':'inline; filename="youtube-'+id+'-thumbnail.jpg"'
      }
    });
  }
  return Response.json({error:'No se encontró una miniatura disponible para ese video.'},{status:404,headers:{'Cache-Control':'public, max-age=300'}});
}
