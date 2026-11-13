import {checkQueenArchiveBudget} from './queen-verifier.js';
// Representation adapter between two existing tools; it is not a new tool.
// Only the PNG archive emitted by pdf-to-image may feed image-ocr this way.
export async function queenHandoffFiles(sourceId,targetId,files,{load=url=>import(url)}={}){
 if(sourceId!=='pdf-to-image'||targetId!=='image-ocr')return files;
 const images=[];let total=0;
 for(const file of files){
  if(file.type!=='application/zip'&&!file.name.endsWith('.zip'))throw Error('OCR_HANDOFF_EXPECTED_ZIP');
  const bytes=await file.arrayBuffer();checkQueenArchiveBudget(bytes,{maxEntries:10,maxExpandedBytes:20*1024*1024});
  const JSZip=(await load('https://esm.sh/jszip@3.10.1')).default;
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  for(const name of Object.keys(zip.files).sort()){
   const entry=zip.files[name];if(entry.dir)continue;
   if(entry.unsafeOriginalName&&entry.unsafeOriginalName!==name||!/^pagina-\d{3,}\.png$/.test(name))throw Error('OCR_HANDOFF_INVALID_MEMBER');
   const data=await entry.async('uint8array');total+=data.length;
   if(total>20*1024*1024||images.length>=10)throw Error('OCR_HANDOFF_RESOURCE_BUDGET');
   if(data.length<24||data.slice(0,8).some((v,i)=>v!==[137,80,78,71,13,10,26,10][i]))throw Error('OCR_HANDOFF_INVALID_PNG');
   const view=new DataView(data.buffer,data.byteOffset,data.byteLength),width=view.getUint32(16),height=view.getUint32(20);
   if(!width||!height||width*height>4000000)throw Error('OCR_HANDOFF_PIXEL_BUDGET');
   images.push(new File([data],name,{type:'image/png'}));
  }
 }
 if(!images.length)throw Error('OCR_HANDOFF_EMPTY');
 return images;
}
