// Independent, deliberately narrow PDF -> Word correspondence check. It proves
// ordered selectable text and explicit page breaks, never visual/layout fidelity.
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const WORD='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const normalize=text=>String(text).normalize('NFC').replace(/\s+/gu,' ').trim();
const fail=code=>{throw Object.assign(Error(code),{verificationCode:code});};
const aborted=signal=>{if(signal?.aborted)fail('VERIFICATION_ABORTED');};
const partial=reason=>({verified:false,evidence:[],unverified:[reason]});
const nativeXml=xml=>typeof globalThis.DOMParser==='function'?new globalThis.DOMParser().parseFromString(xml,'application/xml'):null;
const elements=node=>Array.from(node?.childNodes||[]).filter(child=>child.nodeType===1);
const looseText=node=>Array.from(node?.childNodes||[]).some(child=>[3,4].includes(child.nodeType)&&String(child.textContent||'').trim());
const formatTags=new Set(['pPr','rPr','sectPr','pgSz','pgMar','pgNumType','docGrid','spacing','b','bCs','i','iCs','u','sz','szCs','rFonts','color','jc','keepNext','keepLines','contextualSpacing','widowControl']);
const allTags=new Set(['document','body','p','r','t','br','tab','cr',...formatTags]);
const safeOperators=new Set(['dependency','save','restore','transform','setLineWidth','setLineCap','setLineJoin','setMiterLimit','setDash','setRenderingIntent','setFlatness',
 'beginText','endText','setCharSpacing','setWordSpacing','setHScale','setLeading','setFont','setTextRenderingMode','setTextRise','moveText','setLeadingMoveText','setTextMatrix','nextLine',
 'showText','showSpacedText','nextLineShowText','nextLineSetSpacingShowText','setStrokeGray','setFillGray','setStrokeRGBColor','setFillRGBColor','setStrokeCMYKColor','setFillCMYKColor']);
const textOperators=new Set(['showText','showSpacedText','nextLineShowText','nextLineSetSpacingShowText']);

async function parseDocument(xml,parseXml,signal){
 aborted(signal);
 if(typeof xml!=='string'||/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))fail('INVALID_DOCX_XML');
 if(typeof parseXml!=='function')return null;
 let doc;try{doc=await parseXml(xml);}catch{fail('INVALID_DOCX_XML');}
 aborted(signal);if(!doc)return null;
 const root=doc.documentElement;if(!root||doc.doctype)fail('INVALID_DOCX_XML');
 const pending=[root];
 while(pending.length){const node=pending.pop();if(node.localName==='parsererror')fail('INVALID_DOCX_XML');for(const child of elements(node))pending.push(child);}
 return doc;
}

function wordPages(doc){
 const root=doc.documentElement;
 if(root.namespaceURI!==WORD||root.localName!=='document')fail('INVALID_DOCX_XML');
 const pending=[root];
 while(pending.length){
  const node=pending.pop();
  if(node.namespaceURI!==WORD||!allTags.has(node.localName))return null;
  for(const child of elements(node))pending.push(child);
 }
 const rootChildren=elements(root);if(rootChildren.length!==1||rootChildren[0].localName!=='body'||looseText(root))return null;
 const format=node=>{
  const pending=[node];
  while(pending.length){const current=pending.pop();if(looseText(current)||!formatTags.has(current.localName))return false;for(const child of elements(current))pending.push(child);}
  return true;
 };
 const pages=[''];
 for(const block of elements(rootChildren[0])){
  if(block.localName==='sectPr'){if(!format(block))return null;continue;}
  if(block.localName!=='p'||looseText(block))return null;
  for(const child of elements(block)){
   if(child.localName==='pPr'){if(!format(child))return null;continue;}
   if(child.localName!=='r'||looseText(child))return null;
   for(const run of elements(child)){
    if(run.localName==='rPr'){if(!format(run))return null;continue;}
    if(run.localName==='t'){
     if(elements(run).length)return null;
     pages[pages.length-1]+=run.textContent||'';
    }else if(run.localName==='br'){
     const kind=run.getAttributeNS?.(WORD,'type')||run.getAttribute?.('w:type')||'';
     if(kind==='page')pages.push('');else if(!kind||kind==='textWrapping')pages[pages.length-1]+='\n';else return null;
    }else if(run.localName==='tab'||run.localName==='cr')pages[pages.length-1]+='\n';
    else return null;
   }
  }
  pages[pages.length-1]+='\n';
 }
 if(looseText(rootChildren[0]))return null;
 return pages.map(normalize);
}

// Do not invent a space between adjacent PDF chunks: that could silently change
// a split numeric value. Unclear gaps/order stay pending instead of being guessed.
function sourcePageText(items){
 let text='',previous=null;
 for(const item of items){
  if(typeof item?.str!=='string')return null;
  if(!item.str){if(item.hasEOL)text+='\n';continue;}
  const matrix=item.transform;
  if(!Array.isArray(matrix)||matrix.length<6||!matrix.every(Number.isFinite)||Math.abs(matrix[1])>1e-6||Math.abs(matrix[2])>1e-6||item.dir==='ttb')return null;
  if(previous){
   const dy=matrix[5]-previous.transform[5];
   if(dy>1e-6)return null;
   if(dy<-1e-6)text+='\n';
   else{
    if(matrix[4]<previous.transform[4]-1e-6)return null;
    if(!/\s$/.test(text)&&!/^\s/.test(item.str)){
     if(!Number.isFinite(previous.width)||Math.abs(matrix[4]-(previous.transform[4]+previous.width))>1e-3)return null;
    }
   }
  }
  text+=item.str;if(item.hasEOL)text+='\n';previous=item;
 }
 return normalize(text);
}

export async function verifyQueenPdfWordContent(inputs,zip,{load=url=>import(url),parseXml=nativeXml,signal}={}){
 aborted(signal);
 if(inputs.length!==1||!inputs[0]?.arrayBuffer)return partial('pdf-word-source-required');
 const entry=zip.file('word/document.xml');if(!entry)fail('INVALID_DOCX_XML');
 const doc=await parseDocument(await entry.async('text'),parseXml,signal);
 if(!doc)return partial('docx-xml-parser-unavailable');
 const outputPages=wordPages(doc);
 if(!outputPages)return partial('docx-nontext-or-unsupported-structure');
 if(Object.keys(zip.files||{}).some(name=>/^word\/(?:media|embeddings|drawings|charts)\//i.test(name)))return partial('docx-nontext-content');
 const styles=zip.file('word/styles.xml');
 if(styles){
  const parsed=await parseDocument(await styles.async('text'),parseXml,signal);if(!parsed)return partial('docx-xml-parser-unavailable');
  const pending=[parsed.documentElement];
  while(pending.length){const node=pending.pop();if(node.namespaceURI===WORD&&['vanish','webHidden','specVanish'].includes(node.localName))return partial('docx-hidden-text');for(const child of elements(node))pending.push(child);}
 }
 let pdfjs;try{pdfjs=await load(PDFJS);}catch{aborted(signal);return partial('pdf-text-verification-unavailable');}
 aborted(signal);
 if(!pdfjs?.getDocument||!pdfjs.OPS)return partial('pdf-content-proof-unavailable');
 if(pdfjs.GlobalWorkerOptions)pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
 const allowed=new Set(Object.entries(pdfjs.OPS).filter(([name])=>safeOperators.has(name)).map(([,value])=>value));
 const showsText=new Set(Object.entries(pdfjs.OPS).filter(([name])=>textOperators.has(name)).map(([,value])=>value));
 let task,pdf,destroyed=false;
 const destroy=async()=>{if(destroyed||!task)return;destroyed=true;try{if(task.destroy)await task.destroy();else await pdf?.destroy?.();}catch{/* Cleanup must not hide the verification result. */}};
 const onAbort=()=>{void destroy();};signal?.addEventListener('abort',onAbort,{once:true});
 try{
  const data=new Uint8Array(await inputs[0].arrayBuffer());aborted(signal);
  task=pdfjs.getDocument({data});pdf=await task.promise;aborted(signal);
  if(!Number.isInteger(pdf?.numPages)||pdf.numPages<1)return partial('pdf-content-proof-unavailable');
  const sourcePages=[];
  for(let i=1;i<=pdf.numPages;i++){
   aborted(signal);const page=await pdf.getPage(i);aborted(signal);
   if(!page.getOperatorList||!page.getAnnotations||!page.getTextContent)return partial('pdf-content-proof-unavailable');
   const operators=await page.getOperatorList();aborted(signal);
   if(!operators?.fnArray||!Array.from(operators.fnArray).some(op=>showsText.has(op)))return partial('pdf-page-without-selectable-text');
   if(Array.from(operators.fnArray).some(op=>!allowed.has(op)))return partial('pdf-nontext-or-unsupported-graphics');
   const annotations=await page.getAnnotations();aborted(signal);
   if(!Array.isArray(annotations)||annotations.length)return partial('pdf-annotations-unverified');
   const content=await page.getTextContent();aborted(signal);
   if(!Array.isArray(content?.items))return partial('pdf-content-proof-unavailable');
   const text=sourcePageText(content.items);
   if(text===null)return partial('pdf-reading-order-or-spacing-ambiguous');
   if(!text)return partial('pdf-page-without-selectable-text');
   sourcePages.push(text);
  }
  if(sourcePages.length!==outputPages.length||sourcePages.some((text,i)=>text!==outputPages[i]))fail('DOCUMENT_TEXT_MISMATCH');
  return {verified:true,unverified:[],evidence:[{check:'pdf-word-selectable-text-and-page-breaks',passed:true,pages:sourcePages.length,characters:sourcePages.reduce((n,text)=>n+text.length,0),scope:'ordered-selectable-text-and-explicit-page-breaks',layoutVerified:false}]};
 }catch(error){if(signal?.aborted)fail('VERIFICATION_ABORTED');if(error.verificationCode)throw error;return partial('pdf-source-text-unreadable');}
 finally{signal?.removeEventListener('abort',onAbort);await destroy();}
}
