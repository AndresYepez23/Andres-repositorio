// Lightweight, browser-native output checks. Never infer a valid artifact from
// a filename, a model's success claim or the tool's MIME header alone.
// These checks validate format signatures, not full PDF/Office/media contents.
const EXTENSIONS={
 pdf:'pdf',png:'png',jpg:'jpeg',jpeg:'jpeg',webp:'webp',gif:'gif',
 zip:'zip',docx:'docx',xlsx:'xlsx',pptx:'pptx',wav:'wav',json:'json'
};
const MIME={
 'application/pdf':'pdf','image/png':'png','image/jpeg':'jpeg',
 'image/webp':'webp','image/gif':'gif',
 'application/zip':'zip','application/x-zip-compressed':'zip',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx',
 'audio/wav':'wav','audio/x-wav':'wav','audio/wave':'wav',
 'application/json':'json','text/json':'json'
};
const OFFICE=new Set(['docx','xlsx','pptx','zip']);
const OUTPUT_FORMAT={
 'pdf-to-word':'docx','image-pdf':'pdf','docx-pdf':'pdf',
 'pdf-merge':'pdf','pdf-extract':'pdf','pdf-remove-pages':'pdf',
 'pdf-rotate':'pdf','pdf-watermark':'pdf','pdf-page-numbers':'pdf',
 'pdf-add-blank':'pdf','pdf-metadata-clean':'pdf','pdf-form-flatten':'pdf'
};
const ascii=(bytes,start,length)=>String.fromCharCode(...bytes.slice(start,start+length));
function sniff(bytes){
 if(bytes.length>=5&&ascii(bytes,0,5)==='%PDF-')return 'pdf';
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpeg';
 if(bytes.length>=6&&['GIF87a','GIF89a'].includes(ascii(bytes,0,6)))return 'gif';
 if(bytes.length>=12&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP')return 'webp';
 if(bytes.length>=12&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WAVE')return 'wav';
 if(bytes.length>=4&&ascii(bytes,0,2)==='PK'&&
    [[3,4],[5,6],[7,8]].some(([a,b])=>bytes[2]===a&&bytes[3]===b))return 'zip';
 return null;
}
function formatFromName(name){
 const ext=String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]||'';
 return EXTENSIONS[ext]||null;
}
function compatibleSignature(declared,actual){
 return declared===actual||(OFFICE.has(declared)&&actual==='zip');
}
function mergeVerification(artifact,checks){
 if(!checks.length)return artifact;
 const prior=artifact.verification||{};
 const all=[...new Set([...(Array.isArray(prior.checks)?prior.checks:[]),...checks])];
 return {...artifact,verification:{...prior,status:prior.status==='validated'?'validated':'signature-validated',checks:all}};
}
export async function verifyOutputArtifact(artifact,{toolId='',maxJsonBytes=2*1024*1024}={}){
 const blob=artifact?.blob;
 if(!blob||typeof blob.slice!=='function'||typeof blob.size!=='number')return artifact;
 if(blob.size===0)throw Error('El archivo generado está vacío.');
 const filename=String(artifact.filename||artifact.name||'');
 const named=formatFromName(filename);
 const contentType=String(blob.type||artifact.type||'').split(';')[0].trim().toLowerCase();
 const mimed=MIME[contentType]||null;
 if(named&&mimed&&named!==mimed){
  throw Error('El archivo '+(filename||'generado')+' anuncia una extensión '+named+' incompatible con su tipo MIME '+contentType+'.');
 }
 const declared=named||mimed;
 const required=OUTPUT_FORMAT[toolId]||null;
 if(required&&declared&&!compatibleSignature(required,declared)){
  throw Error('La herramienta '+toolId+' devolvió '+declared+' en vez del formato solicitado ('+required+').');
 }
 const expected=required||declared;
 if(!expected)return artifact;
 if(expected==='json'){
  if(blob.size>maxJsonBytes)return artifact; // Do not claim structural verification for oversized JSON.
  try{JSON.parse(await blob.text());}
  catch{throw Error('El archivo JSON generado no contiene JSON válido.');}
  return mergeVerification(artifact,['parsed-json']);
 }
 const head=new Uint8Array(await blob.slice(0,24).arrayBuffer());
 const detected=sniff(head);
 if(!detected||!compatibleSignature(expected,detected)){
  throw Error('La firma binaria del archivo '+(filename||'generado')+
    ' no coincide con su formato anunciado ('+expected+').'+
    (detected?' La firma corresponde a '+detected+'.':' El contenido no tiene una cabecera reconocible.'));
 }
 return mergeVerification(artifact,['file-signature','format-consistency']);
}
export async function verifyToolOutputArtifacts(toolId,result){
 if(!result||typeof result!=='object')return result;
 let next=result;
 if(result.blob)next=await verifyOutputArtifact(result,{toolId});
 if(Array.isArray(result.artifacts)&&result.artifacts.length){
  const artifacts=[];
  for(const item of result.artifacts)artifacts.push(await verifyOutputArtifact(item,{toolId}));
  next={...next,artifacts};
 }
 return next;
}
