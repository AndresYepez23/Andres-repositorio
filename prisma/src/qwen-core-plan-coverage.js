// Qwen Core hybrid: conservative goal-coverage check for deterministic plans.
// This checks only a few explicit, high-risk requirements. Passing does NOT
// mean that execution succeeded; the existing validators verify real outputs.
// No inference, uploads, secrets, model calls or provider selection occur here.
import {extractPayload,isInformationalIntent,normalizeIntent} from './core-capabilities.js';

const normalize=text=>normalizeIntent(text).replace(/\s+/g,' ').trim();
const ids=steps=>steps.map(s=>String(s?.tool_id||s?.tool?.id||''));
const includesOrdered=(items,a,b)=>items.indexOf(a)>=0&&items.indexOf(b)>items.indexOf(a);
const hasSelectedPage=step=>step?.tool_id==='pdf-extract'||
 (step?.tool_id==='pdf-split'&&step?.params?.mode==='selected'&&!!step?.params?.pages);
const xlsxProducer=step=>step?.tool_id==='json-xlsx'||
 (step?.tool_id==='table-file-convert'&&String(step?.params?.output||'').toLowerCase()==='xlsx');

/**
 * Use before automatically accepting a deterministic plan. Missing requirements
 * mean the original request must receive a better plan or a clarification;
 * do not silently execute an incomplete plan and call it finished.
 */
export function assessQwenCorePlanCoverage(request,steps=[]){
 const instruction=extractPayload(String(request||'')).instruction;
 if(isInformationalIntent(instruction))
  return {coversCheckedRequirements:true,needsSemanticReview:false,missing:[]};
 const q=normalize(instruction),list=Array.isArray(steps)?steps:[],toolIds=ids(list),missing=[];
 const pdf=/\bpdf\b/.test(q);
 const page=/\b(?:pagina|paginas|hoja|hojas)\b/.test(q);
 const extract=/\b(?:extrae|extraer|saca|sacar|selecciona|seleccionar|conserva|conservar|separa|separar|extract|select)\b/.test(q);
 const word=/\b(?:word|docx)\b/.test(q);
 const convert=/\b(?:convierte|convertir|pasala|pasalo|pasar|transforma|transformar|convert|turn)\b/.test(q);
 if(pdf&&page&&extract&&word&&convert){
  const first=list.findIndex(hasSelectedPage);
  const second=toolIds.indexOf('pdf-to-word');
  if(first<0)missing.push('extract-requested-pdf-page');
  if(second<0)missing.push('convert-selected-page-to-word');
  if(first>=0&&second>=0&&first>=second)missing.push('preserve-pdf-processing-order');
 }
 const tabular=/\b(?:csv|xlsx|excel|hoja de calculo|spreadsheet)\b/.test(q);
 const deduplicate=/\b(?:duplicad\w*|duplicates?|deduplicat\w*|repetid\w*)\b/.test(q);
 const removeDupes=/\b(?:elimina|eliminar|quita|quitar|borra|borrar|limpia|limpiar|remove|delete|deduplicate)\b/.test(q);
 if(tabular&&deduplicate&&removeDupes){
  // A profile/audit reports duplicates; it does not remove them.
  // Never mistake a text-line deduplicator for structured CSV row editing.
  if(!toolIds.includes('table-deduplicate')&&!toolIds.includes('csv-deduplicate'))
   missing.push('remove-structured-duplicates');
 }
 if(tabular&&/\b(?:excel|xlsx)\b/.test(q)&&
    /\b(?:entrega\w*|exporta\w*|crea\w*|genera\w*|convierte\w*|convertir|en|a|as|into)\b/.test(q)&&
    !list.some(xlsxProducer))missing.push('produce-excel-file');
 if(pdf&&word&&/\b(?:conserva|conservar|mant[eie]n|preserva|preservar|keep|preserve)\b.{0,55}\b(?:imagenes|imagen|images|pictures)\b/.test(q))
  missing.push('preserve-pdf-images-not-supported-by-text-converter');
 if(/\b(?:no\s+(?:quiero\s+)?(?:comprimas|comprimir|comprime)|sin\s+comprimir|do\s+not\s+compress)\b/.test(q)&&
  toolIds.some(id=>['pdf-compress','image-compress','video-compress'].includes(id)))
  missing.push('forbidden-compression');
 return {coversCheckedRequirements:missing.length===0,needsSemanticReview:missing.length>0,missing};
}
