// Temporary operator migration: only an encrypted, fixed-name credential capsule.
// Normal builds pass null, so the endpoint does not exist.
const PATH='/__queen/credential-promotion';
const DATABASE='980bad8f-0356-48b9-87bc-56bcf363f69a';
const ACCOUNT='26c2a31382f903f4ce4f5f7bafbd6820';
const PURPOSE='queen-credential-promotion';
const ALGORITHM='RSA-OAEP-256+A256GCM';
const NAMES=['QUEEN_ACCESS_CLIENT_ID','QUEEN_ACCESS_CLIENT_SECRET','QUEEN_API_KEY'];
const encoder=new TextEncoder();
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const answer=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const failure=(code,status=503)=>answer({ok:false,code},status);
const base64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
const binary=value=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));
const ownKeys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key));

function validConfig(config){
 if(!ownKeys(config,['publicKeyJwk','nonceSha256','expiresAt','sourceCommit','destination','accountId'])||
  config.destination!=='prismaspace'||config.accountId!==ACCOUNT||
  !/^[a-f0-9]{64}$/.test(config.nonceSha256||'')||!/^[a-f0-9]{40}$/.test(config.sourceCommit||'')||
  !Number.isSafeInteger(config.expiresAt)||config.expiresAt<=0)return false;
 const key=config.publicKeyJwk;
 return ownKeys(key,['kty','n','e','alg','ext','key_ops'])&&key.kty==='RSA'&&
  typeof key.n==='string'&&/^[A-Za-z0-9_-]{256,1368}$/.test(key.n)&&
  typeof key.e==='string'&&/^[A-Za-z0-9_-]{2,16}$/.test(key.e)&&
  (key.alg===undefined||key.alg==='RSA-OAEP-256')&&
  (key.ext===undefined||typeof key.ext==='boolean')&&
  (key.key_ops===undefined||Array.isArray(key.key_ops)&&key.key_ops.length===1&&key.key_ops[0]==='encrypt');
}

function associatedData(config){
 return encoder.encode(JSON.stringify({purpose:PURPOSE,sourceCommit:config.sourceCommit,
  destination:config.destination,accountId:config.accountId,nonceSha256:config.nonceSha256}));
}

function validEnvelope(value,aad){
 if(!ownKeys(value,['version','algorithm','wrappedKey','iv','ciphertext','associatedData'])||
  Object.keys(value).length!==6||value.version!==1||value.algorithm!==ALGORITHM||value.associatedData!==base64(aad))return false;
 try{
  for(const field of ['wrappedKey','iv','ciphertext','associatedData']){
   if(typeof value[field]!=='string'||value[field].length>65536||!/^[A-Za-z0-9+/]*={0,2}$/.test(value[field])||value[field].length%4)return false;
  }
  return binary(value.iv).length===12&&binary(value.wrappedKey).length>=256&&
   binary(value.wrappedKey).length<=1024&&binary(value.ciphertext).length>=16;
 }catch{return false;}
}

async function nonceMatches(request,expected){
 const nonce=request.headers.get('X-Queen-Promotion-Nonce')||'';
 if(!/^[a-f0-9]{64}$/.test(nonce))return false;
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(nonce)));
 let difference=0;
 for(let index=0;index<digest.length;index++)difference|=digest[index]^parseInt(expected.slice(index*2,index*2+2),16);
 return difference===0;
}

async function encryptedEnvelope(config,credentials,aad){
 const key=await crypto.subtle.importKey('jwk',config.publicKeyJwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 if(key.algorithm.modulusLength<2048)throw Error('PROMOTION_PUBLIC_KEY_INVALID');
 const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const plaintext=encoder.encode(JSON.stringify({purpose:PURPOSE,sourceCommit:config.sourceCommit,
  destination:config.destination,accountId:config.accountId,credentials}));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},aes,plaintext);
 const wrappedKey=await crypto.subtle.encrypt({name:'RSA-OAEP'},key,await crypto.subtle.exportKey('raw',aes));
 return {version:1,algorithm:ALGORITHM,wrappedKey:base64(wrappedKey),iv:base64(iv),
  ciphertext:base64(ciphertext),associatedData:base64(aad)};
}

export function createCredentialPromotionHandler(configuration){
 if(configuration==null)return async()=>null;
 let config;
 try{config=structuredClone(configuration);}catch{config=null;}
 return async(request,env)=>{
  if(new URL(request.url).pathname!==PATH)return null;
  if(request.method!=='POST')return failure('METHOD_NOT_ALLOWED',405);
  if(!validConfig(config))return failure('PROMOTION_CONFIG_INVALID');
  const now=Date.now();
  if(config.expiresAt<=now)return failure('PROMOTION_EXPIRED',410);
  if(config.expiresAt-now>15*60*1000)return failure('PROMOTION_CONFIG_INVALID');
  try{
   if(!await nonceMatches(request,config.nonceSha256))return failure('NOT_FOUND',404);
  }catch{return failure('PROMOTION_UNAVAILABLE');}
  let db;
  try{
   if(env.QUEEN_STAGE!=='staging'||env.QUEEN_STAGING_DATABASE_ID!==DATABASE||env.QUEEN_SOURCE_COMMIT!==config.sourceCommit)
    return failure('PROMOTION_STAGING_REQUIRED');
   db=env.QUEEN_CONTROL_DB||env.PRISMA_RATE_DB;
   if(!db?.prepare)return failure('PROMOTION_STORAGE_UNAVAILABLE');
   const identity=await db.prepare('SELECT database_id,environment FROM queen_staging_identity WHERE id=1').bind().first();
   if(identity?.database_id!==DATABASE||identity?.environment!=='staging')return failure('PROMOTION_STAGING_REQUIRED');
  }catch{return failure('PROMOTION_STORAGE_UNAVAILABLE');}
  const slot='credential-promotion:'+config.nonceSha256,aad=associatedData(config);
  const existing=async()=>db.prepare('SELECT owner,expires_at FROM queen_leases WHERE slot=?').bind(slot).first();
  const fromRow=row=>{
   if(row?.expires_at!==config.expiresAt||typeof row.owner!=='string'||row.owner.length>70000)return null;
   try{const envelope=JSON.parse(row.owner);return validEnvelope(envelope,aad)?envelope:null;}catch{return null;}
  };
  try{
   const row=await existing();
   if(row){const envelope=fromRow(row);return envelope?answer(envelope):failure('PROMOTION_STORAGE_UNAVAILABLE');}
  }catch{return failure('PROMOTION_STORAGE_UNAVAILABLE');}
  const credentials={};
  try{
   for(const name of NAMES){
    const value=env[name];
    if(typeof value!=='string'||!value.trim()||value.length>4096)return failure('PROMOTION_SOURCE_UNAVAILABLE');
    credentials[name]=value;
   }
  }catch{return failure('PROMOTION_SOURCE_UNAVAILABLE');}
  let envelope;
  try{envelope=await encryptedEnvelope(config,credentials,aad);}catch{return failure('PROMOTION_UNAVAILABLE');}
  if(Date.now()>=config.expiresAt)return failure('PROMOTION_EXPIRED',410);
  try{
   const saved=await db.prepare('INSERT INTO queen_leases(slot,owner,expires_at) VALUES(?,?,?) ON CONFLICT(slot) DO NOTHING')
    .bind(slot,JSON.stringify(envelope),config.expiresAt).run();
   if(saved?.success===false)return failure('PROMOTION_STORAGE_UNAVAILABLE');
   const winner=fromRow(await existing());
   return winner?answer(winner):failure('PROMOTION_STORAGE_UNAVAILABLE');
  }catch{return failure('PROMOTION_STORAGE_UNAVAILABLE');}
 };
}
