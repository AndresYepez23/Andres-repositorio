// Core 5: verify that tools actually returned their promised result.
// Never claim a generated file exists based on model text or a success banner.
const TEXT=new Set([
 'ai-assistant','ai-youtube-kit','ai-prompt-lab','ai-study-notes',
 'ai-code-helper','music-lyrics'
]);
const FILE={
 'ai-webpage':'text/html',
 'image-gen':'image/',
 'ai-voice':'audio/'
};
export function validateAgentStepResult(id,result){
 if(!result||typeof result!=='object')throw Error('La herramienta no devolvió un resultado utilizable.');
 if(result.error||result.ok===false)throw Error(String(result.error||'La herramienta indicó que no se completó la operación.').slice(0,250));
 if(TEXT.has(id)&&!String(result.text||'').trim())
  throw Error('El motor de texto no devolvió contenido; se conservan los pasos anteriores.');
 if(Object.prototype.hasOwnProperty.call(FILE,id)&&FILE[id]){
  const expected=FILE[id];
  if(!result.blob||typeof result.blob.size!=='number'||result.blob.size===0||
    !String(result.blob.type||'').startsWith(expected))
    throw Error('La herramienta '+id+' no produjo el archivo esperado.');
 }
 return result;
}
