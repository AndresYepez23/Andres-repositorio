// Practical browser-only utilities for Prisma Core; never transmit the pasted content.
const safeText = value => {
  const text = String(value ?? '');
  if (text.length > 200000) throw Error('Por rendimiento, limita el texto a 200.000 caracteres.');
  return text;
};
const preview = value => {
  const raw = JSON.stringify(value);
  return raw === undefined ? String(value) : raw.length > 100 ? raw.slice(0,97) + '…' : raw;
};

export function redactSensitiveText(input) {
  let text=safeText(input);
  if (!text.trim()) throw Error('Pega el texto que quieres anonimizar.');
  const counts={urls:0,emails:0,ips:0,phones:0};
  // First mask complete links so addresses and numbers inside URLs aren't counted twice.
  text=text.replace(/https?:\/\/[^\s<>"']+/gi, match=>{
    const end=match.match(/[),.;!?]+$/)?.[0]||'';
    const value=end?match.slice(0,-end.length):match;
    if(!value)return match;
    counts.urls++;
    return '[ENLACE_'+counts.urls+']'+end;
  });
  text=text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,()=>{
    counts.emails++;return '[CORREO_'+counts.emails+']';
  });
  text=text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,match=>{
    if(!match.split('.').every(octet=>Number(octet)<=255))return match;
    counts.ips++;return '[IP_'+counts.ips+']';
  });
  text=text.replace(/(?<![\p{L}\p{N}])\+?\d(?:[\s().-]*\d){7,14}(?![\p{L}\p{N}])/gu,match=>{
    if(!/[0-9]{7}/.test(match.replace(/\D/g,'')))return match;
    counts.phones++;return '[TELEFONO_'+counts.phones+']';
  });
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  return {text,summary:total+' dato(s) detectado(s) y reemplazado(s) localmente. Verifica el resultado: no se detectan nombres, direcciones postales ni todos los identificadores personales.'};
}

export function compareJsonDocuments(original,updated) {
  const first=safeText(original),second=safeText(updated);
  if(!first.trim()||!second.trim())throw Error('Pega las dos versiones JSON para compararlas.');
  let left,right;
  try{left=JSON.parse(first);}catch(e){throw Error('El JSON original no es válido: '+e.message);}
  try{right=JSON.parse(second);}catch(e){throw Error('El JSON actualizado no es válido: '+e.message);}
  const stack=[{path:'$',left,right}],changes=[];
  let visited=0;
  while(stack.length&&changes.length<150&&visited++<8000){
    const {path,left:a,right:b}=stack.pop();
    if(Object.is(a,b))continue;
    const objectA=a!==null&&typeof a==='object',objectB=b!==null&&typeof b==='object';
    if(objectA&&objectB&&Array.isArray(a)===Array.isArray(b)){
      const keys=Array.isArray(a)
        ?Array.from({length:Math.max(a.length,b.length)},(_,i)=>String(i))
        :[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
      if(keys.length>1500){changes.push('! '+path+': estructura demasiado grande para una comparación detallada');continue;}
      for(let i=keys.length-1;i>=0;i--){
        const key=keys[i],child=/^[A-Za-z_$][\w$]*$/.test(key)?path+'.'+key:path+'['+JSON.stringify(key)+']';
        if(!Object.prototype.hasOwnProperty.call(a,key))changes.push('+ '+child+': '+preview(b[key]));
        else if(!Object.prototype.hasOwnProperty.call(b,key))changes.push('- '+child+': '+preview(a[key]));
        else stack.push({path:child,left:a[key],right:b[key]});
        if(changes.length>=150)break;
      }
    }else changes.push('~ '+path+': '+preview(a)+' → '+preview(b));
  }
  const hasMore=stack.length>0||visited>=8000||changes.length>=150;
  return {
    text:changes.length?changes.join('\n')+(hasMore?'\n… Comparación truncada por tamaño.':''):'Los dos documentos JSON son equivalentes.',
    summary:changes.length+' cambio(s) JSON encontrados. Comparación estructural local; no se enviaron datos a servidores.'
  };
}

export function extractAcademicIdentifiers(input) {
  const text=safeText(input);
  if(!text.trim())throw Error('Pega un artículo o bibliografía para identificar DOI y PMID.');
  const doi=[...new Set((text.match(/\b10\.\d{4,9}\/[^\s<>"'[\]{}]+/gi)||[]).map(x=>x.replace(/[.,;:!?)+]+$/g,'').toLowerCase()))].slice(0,100);
  const pmid=[...new Set([...text.matchAll(/\bPMID\s*:?\s*(\d{5,10})\b/gi)].map(m=>m[1]))].slice(0,100);
  const arxiv=[...new Set([...text.matchAll(/\barXiv\s*:\s*(\d{4}\.\d{4,5}(?:v\d+)?)\b/gi)].map(m=>m[1]))].slice(0,100);
  const lines=[
    'DOI ('+doi.length+')',...(doi.length?doi.map(x=>'https://doi.org/'+x):['No se encontraron DOI.']),
    '','PMID ('+pmid.length+')',...(pmid.length?pmid.map(x=>'https://pubmed.ncbi.nlm.nih.gov/'+x+'/'):['No se encontraron PMID.']),
    '','arXiv ('+arxiv.length+')',...(arxiv.length?arxiv.map(x=>'https://arxiv.org/abs/'+x):['No se encontraron identificadores arXiv.'])
  ];
  return {text:lines.join('\n'),summary:'Identificadores detectados: '+doi.length+' DOI, '+pmid.length+' PMID, '+arxiv.length+' arXiv. Enlaces generados localmente; existencia y metadatos no verificados.'};
}

export function runAdvancedTextTool(id,p={}) {
  if(id==='text-redact-local')return redactSensitiveText(p.text);
  if(id==='json-compare-local')return compareJsonDocuments(p.textA,p.textB);
  if(id==='citation-ids-local')return extractAcademicIdentifiers(p.text);
  throw Error('Herramienta avanzada de texto desconocida.');
}
