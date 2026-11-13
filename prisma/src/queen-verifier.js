import {verifyToolOutputArtifacts} from './core-artifact-contracts.js';
import {parsePdfPageSelection} from './pdf-split-options.js';
const moduleLoader=url=>import(url);
const OFFICE={docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml'};
const error=code=>{throw Object.assign(Error(code),{verificationCode:code});};

// Check central-directory sizes before CRC validation can inflate entries.
export function checkQueenArchiveBudget(buffer,{maxEntries=1000,maxExpandedBytes=50*1024*1024}={}){
 const data=new DataView(buffer);let end=-1;
 for(let i=data.byteLength-22;i>=Math.max(0,data.byteLength-65557);i--)if(data.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)error('INVALID_ZIP_STRUCTURE');
 const count=data.getUint16(end+10,true);let offset=data.getUint32(end+16,true),expanded=0;
 if(count===65535||count>maxEntries)error('ARCHIVE_RESOURCE_BUDGET');
 for(let i=0;i<count;i++){
  if(offset+46>data.byteLength||data.getUint32(offset,true)!==0x02014b50)error('INVALID_ZIP_STRUCTURE');
  const size=data.getUint32(offset+24,true);expanded+=size;
  if(size===0xffffffff||expanded>maxExpandedBytes)error('ARCHIVE_RESOURCE_BUDGET');
  offset+=46+data.getUint16(offset+28,true)+data.getUint16(offset+30,true)+data.getUint16(offset+32,true);
 }
 return {entries:count,expandedBytes:expanded};
}

// Runs independently of the model and the executor's succeeded flag. Prior
// verification labels never substitute for reading the returned bytes.
export async function verifyQueenResult(step,result,inputs=[],{load=moduleLoader,decode=globalThis.createImageBitmap}={}){
 const checked=await verifyToolOutputArtifacts(step.tool_id,result);
 const artifacts=checked?.blob?[checked]:checked?.artifacts||[];
 const evidence=[],unverified=[];
 if(!artifacts.length){
  const text=String(checked?.text||'');if(!text.trim())error('EMPTY_RESULT');
  if(['json-format','json-minify','csv-json','xml-to-json-local'].includes(step.tool_id)){
   try{JSON.parse(text);}catch{error('INVALID_JSON');}evidence.push({check:'parsed-json',passed:true});
   if(['json-format','json-minify'].includes(step.tool_id)){
    if(JSON.stringify(JSON.parse(text))!==JSON.stringify(JSON.parse(step.params.text)))error('JSON_DATA_MISMATCH');
    evidence.push({check:'input-data-preserved',passed:true});
   }else unverified.push('text-correspondence');
  }else if(['text-sort','dedupe-lines'].includes(step.tool_id)){
   const lines=String(step.params.text||'').split(/\r?\n/);
   const expected=step.tool_id==='text-sort'?[...lines].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:step.params.caseSensitive?'variant':'base',numeric:true})).join('\n'):
    lines.filter((line,i)=>lines.findIndex(v=>(step.params.caseSensitive?v:v.toLocaleLowerCase('es'))===(step.params.caseSensitive?line:line.toLocaleLowerCase('es')))===i).join('\n');
   if(text.trim()!==expected.trim())error('TEXT_TRANSFORM_MISMATCH');evidence.push({check:'text-transformation',passed:true});
  }else unverified.push('text-correspondence');
  evidence.push({check:'nonempty-text',passed:true});
 }
 for(const artifact of artifacts){
  const blob=artifact.blob;if(!blob?.size)error('EMPTY_ARTIFACT');
  if(blob.size>50*1024*1024)error('VERIFICATION_SIZE_LIMIT');
  const bytes=await blob.arrayBuffer();
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const checks=['exists','nonempty','sha256',...(artifact.verification?.checks||[])];
  const ext=String(artifact.filename||'').split('.').at(-1).toLowerCase();
  let details={};
  if(blob.type==='application/pdf'||ext==='pdf'){
   const {PDFDocument}=await load('https://esm.sh/pdf-lib@1.17.1');
   let pdf;try{pdf=await PDFDocument.load(bytes);}catch{error('INVALID_PDF_STRUCTURE');}
   const pages=pdf.getPageCount();if(!pages)error('EMPTY_PDF');details.pages=pages;checks.push('parsed-pdf');
   if(['pdf-extract','pdf-remove-pages','pdf-merge'].includes(step.tool_id)){
    const originals=await Promise.all(inputs.map(async f=>PDFDocument.load(await f.arrayBuffer())));
    if(!originals.length)error('MISSING_ORIGINAL');
    const sourcePages=originals[0].getPageCount();
    const expected=step.tool_id==='pdf-merge'?originals.reduce((n,p)=>n+p.getPageCount(),0):
     step.tool_id==='pdf-extract'?parsePdfPageSelection(step.params.pages,sourcePages).length:
      sourcePages-parsePdfPageSelection(step.params.pages,sourcePages).length;
    if(pages!==expected)error('PDF_PAGE_COUNT_MISMATCH');checks.push('requested-page-count');
   }else if(step.tool_id==='pdf-rotate'){
    const original=await PDFDocument.load(await inputs[0].arrayBuffer());
    if(pages!==original.getPageCount()||pdf.getPages().some((p,i)=>p.getRotation().angle%360!==(original.getPage(i).getRotation().angle+Number(step.params.degrees||90))%360))error('PDF_ROTATION_MISMATCH');
    checks.push('requested-rotation');
   }else unverified.push('pdf-parameter-correspondence');
  }else if(OFFICE[ext]||ext==='zip'){
   checkQueenArchiveBudget(bytes);
   const JSZip=(await load('https://esm.sh/jszip@3.10.1')).default;
   let zip;try{zip=await JSZip.loadAsync(bytes,{checkCRC32:true});}catch{error('INVALID_ZIP_STRUCTURE');}
   const names=Object.keys(zip.files);if(!names.length)error('EMPTY_ARCHIVE');
   if(OFFICE[ext]&&(!zip.file('[Content_Types].xml')||!zip.file(OFFICE[ext])))error('INVALID_OFFICE_STRUCTURE');
   checks.push('archive-crc','archive-structure');details.entries=names.length;
   unverified.push(ext==='zip'?'archive-member-correspondence':'document-content-correspondence');
  }else if(String(blob.type).startsWith('image/')){
   if(typeof decode!=='function')unverified.push('image-decoding');
   else{
    let image;try{image=await decode(blob);}catch{error('INVALID_IMAGE');}
    details={width:image.width,height:image.height};image.close?.();checks.push('decoded-image');
    if(['image-resize','image-crop'].includes(step.tool_id)){
     const source=await decode(inputs[0]);let width,height;
     if(step.tool_id==='image-crop'){width=Math.max(1,Math.round(source.width*Number(step.params.widthPct||80)/100));height=Math.max(1,Math.round(source.height*Number(step.params.heightPct||80)/100));}
     else{width=Number(step.params.width)||source.width;height=Number(step.params.height)||source.height;
      if(step.params.keep){const ratio=Math.min(width/source.width,height/source.height);width=Math.round(source.width*ratio);height=Math.round(source.height*ratio);}}
     source.close?.();if(details.width!==width||details.height!==height)error('IMAGE_DIMENSIONS_MISMATCH');checks.push('requested-dimensions');
    }else unverified.push('image-parameter-correspondence');
   }
   if(step.params.maxBytes&&blob.size>step.params.maxBytes)error('SIZE_TARGET_MISMATCH');
  }else if(ext==='json'||blob.type.startsWith('application/json')){
   try{JSON.parse(new TextDecoder().decode(bytes));}catch{error('INVALID_JSON');}checks.push('parsed-json');
  }else unverified.push(/^audio\/|^video\//.test(blob.type)?'media-duration-and-parameters':'format-and-correspondence');
  evidence.push({check:'artifact',passed:true,bytes:blob.size,sha256,checks,...details});
 }
 return {result:checked,verification:{status:unverified.length?'partial':'verified',evidence,unverified:[...new Set(unverified)]}};
}
