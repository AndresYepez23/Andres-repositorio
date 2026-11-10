// Predefined, lightweight avatar identities. No uploads or external images.
// Keep ids stable: they are stored only as editable Supabase user metadata.
export const PRISMA_AVATARS=Object.freeze([
 Object.freeze({id:'prism',label:'Prisma',symbol:'✦'}),
 Object.freeze({id:'aurora',label:'Aurora',symbol:'✧'}),
 Object.freeze({id:'orbit',label:'Órbita',symbol:'◎'}),
 Object.freeze({id:'nova',label:'Nova',symbol:'✳'}),
 Object.freeze({id:'bloom',label:'Flora',symbol:'✿'}),
 Object.freeze({id:'spark',label:'Chispa',symbol:'❖'})
]);
export function prismaAvatar(value){
 const key=String(value||'').trim().toLowerCase();
 return PRISMA_AVATARS.find(item=>item.id===key)||PRISMA_AVATARS[0];
}
export function prismaFirstName(value){
 return String(value||'').trim().split(/\s+/)[0].slice(0,26);
}
