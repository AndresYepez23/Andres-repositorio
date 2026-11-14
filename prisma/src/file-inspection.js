// Read the bounded ZIP directory, without inflating entries or executing data.
// This identifies the Office container, not the fidelity of its document content.
export async function inspectArchiveFormat(file){
 const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer());
 const end=new DataView(tail.buffer);let offset=-1;
 for(let i=tail.length-22;i>=0;i--)if(end.getUint32(i,true)===0x06054b50&&i+22+end.getUint16(i+20,true)===tail.length){offset=i;break;}
 if(offset<0)throw Error('El contenedor ZIP no tiene un directorio válido.');
 const count=end.getUint16(offset+10,true),size=end.getUint32(offset+12,true),start=end.getUint32(offset+16,true);
 if(count>1000||size>1024*1024||start+size>file.size-tail.length+offset||end.getUint16(offset+4,true)||end.getUint16(offset+6,true))throw Error('El directorio ZIP supera los límites de inspección o usa un formato no admitido.');
 const buffer=await file.slice(start,start+size).arrayBuffer(),view=new DataView(buffer),names=new Set();
 let cursor=0,expanded=0;
 for(let i=0;i<count;i++){
  if(cursor+46>size||view.getUint32(cursor,true)!==0x02014b50)throw Error('El directorio ZIP está dañado.');
  const length=view.getUint16(cursor+28,true),next=cursor+46+length+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true);
  expanded+=view.getUint32(cursor+24,true);
  if(next>size||expanded>50*1024*1024)throw Error('El ZIP excede el límite de contenido expandido para inspección.');
  names.add(new TextDecoder().decode(new Uint8Array(buffer,cursor+46,length)));cursor=next;
 }
 if(cursor!==size)throw Error('El tamaño del directorio ZIP no coincide.');
 if(names.has('[Content_Types].xml')){
  if(names.has('word/document.xml'))return {kind:'docx',signature:'DOCX (directorio ZIP de Word)'};
  if(names.has('xl/workbook.xml'))return {kind:'excel',signature:'XLSX (directorio ZIP de Excel)'};
  if(names.has('ppt/presentation.xml'))return {kind:'pptx',signature:'PPTX (directorio ZIP de PowerPoint)'};
 }
 return {kind:'zip',signature:'ZIP (sin estructura Office reconocida)'};
}
