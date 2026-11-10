// Distinguish contextual understanding from literal OCR requests.
// Running the text detector before the planner avoids a transcription-only answer.
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function imageAnalysisIntent(text,files=[]){
 if(!Array.isArray(files)||!files.some(file=>String(file?.type||'').startsWith('image/')||/\.(?:png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(String(file?.name||''))))return '';
 const q=normalize(text);
 // A contextual request must never be interpreted as a metadata operation.
 // Spanish enclitic forms (analízame, interprétame, explícamela) are common in chat.
 if(/\b(?:metadatos?|exif|gps|propiedades (?:tecnicas|del archivo)|tamano (?:del archivo|en bytes))\b/.test(q)&&!/(?:analiz|interpret|explic|describ|que (?:hay|ves|aparece)|de que trata)/.test(q))return '';
 if(/\b(?:extrae|extraer|transcribe|transcribir|copia|copiar|pasame|pasar|saca|sacar|reconoce|reconocer|ocr)\b.{0,55}\b(?:texto|literal|palabras|escrito)\b/.test(q)||
    /\b(?:texto|contenido)\b.{0,55}\b(?:literal|exacto|tal cual|sin cambiar|sin interpretar)\b/.test(q)||
    /\b(?:solo|unicamente)\s+(?:el\s+)?(?:texto|ocr)\b/.test(q))return 'transcribe';
 if(/\b(?:analiz(?:a|ame|ala|alo|ar|arla|arlo|ando|is)|interpret(?:a|ame|ala|alo|ar|acion)|explic(?:a|ame|ala|alo|ar|acion)|describ(?:e|eme|ela|elo|ir)|comprend(?:e|er)|resumen|resume|contextualiz(?:a|ar|acion)|evalu(?:a|ar|acion)|opina|significado|de que trata|que quiere decir|que significa|conclusiones|ideas principales|que dice|que (?:hay|ves|aparece) en (?:esta|esa|la) (?:foto|imagen))\b/.test(q)||
    !q||/\b(?:lee|leer|revisa|revisar|entiende|entender)\b/.test(q))return 'interpret';
 return '';
}

export function isBatchImageTranscription(text,files=[]){
 const q=normalize(text);
 const images=Array.isArray(files)?files.filter(file=>String(file?.type||'').startsWith('image/')||/\.(?:png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(String(file?.name||''))):[];
 if(!images.length)return false;
 const wantsText=/\b(?:texto|ocr|transcrib|transcrip|palabras|escrito)\b/.test(q);
 const wantsExtract=/\b(?:saca|sacame|extrae|extraer|pasame|pasa|transcribe|transcribir|copia|copiar|reconoce|reconocer|lee|leer|obten|obtener)\b/.test(q);
 return wantsText&&wantsExtract;
}
