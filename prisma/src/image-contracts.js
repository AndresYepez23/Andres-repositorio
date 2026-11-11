// Enforce the implemented units before allocating a canvas or modifying a file.
const contracts = {
 'image-resize': { width:[1,12000], height:[1,12000], keep:'boolean' },
 'image-crop': { widthPct:[10,100], heightPct:[10,100] }
};
export function validateImageParameters(id, params={}) {
 const schema=contracts[id]; if(!schema)return;
 const shared={format:'format',quality:[10,100],maxBytes:[1024,100*1024*1024]};
 for(const [key,value] of Object.entries(params)) {
  if(['polliToken','hfToken','geminiKey','groqKey','centralProviders','centralFeatures','centralModelCatalog'].includes(key))continue;
  const rule=schema[key]||shared[key];
  if(!rule)throw Error('Parámetro no admitido por '+id+': '+key+'. '+(id==='image-crop'?'El recorte es centrado y usa widthPct/heightPct en porcentajes.':'Usa width, height y keep.'));
  if(rule==='boolean'){if(typeof value!=='boolean')throw Error(key+' debe ser booleano.');continue;}
  if(rule==='format'){if(!['image/png','image/jpeg','image/webp'].includes(value))throw Error('Formato de imagen no admitido.');continue;}
  if(value===''||value===null||typeof value==='boolean'||!Number.isFinite(Number(value))||Number(value)<rule[0]||Number(value)>rule[1])throw Error('Valor fuera de rango para '+key+'.');
  if(['width','height','maxBytes'].includes(key)&&!Number.isInteger(Number(value)))throw Error(key+' debe ser un entero.');
 }
}

// Decode the actual output rather than trusting canvas metadata or its summary.
export async function verifyImageResult(id,result,params={},inputs=[],decode=globalThis.createImageBitmap) {
 if(!contracts[id])return result;
 if(!result?.blob?.size)throw Error('La operación no produjo una imagen verificable.');
 if(typeof decode!=='function')throw Error('Este navegador no permite verificar las dimensiones de la imagen generada.');
 const output=await decode(result.blob);
 let source;
 try {
  if(!inputs[0])throw Error('Falta la imagen original para comprobar el resultado.');
  source=await decode(inputs[0]);
  let width=source.width,height=source.height;
  if(id==='image-crop'){
   width=Math.max(1,Math.round(width*Number(params.widthPct||80)/100));
   height=Math.max(1,Math.round(height*Number(params.heightPct||80)/100));
  }else{
   width=Number(params.width)||width;height=Number(params.height)||height;
   if(params.keep){const ratio=Math.min(width/source.width,height/source.height);width=Math.round(source.width*ratio);height=Math.round(source.height*ratio);}
  }
  if(output.width!==width||output.height!==height)throw Error('Las dimensiones generadas no coinciden con las solicitadas.');
  if(params.format&&result.blob.type!==params.format)throw Error('El navegador no produjo el formato solicitado: '+params.format+'.');
  return {...result,verification:{status:'validated',checks:['decoded-image','dimensions'],width:output.width,height:output.height}};
 }finally{output.close?.();source?.close?.();}
}
