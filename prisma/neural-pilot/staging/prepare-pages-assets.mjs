// Local preparation only. No network, tokens, uploads or deployment.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';

const tooling=process.env.QUEEN_TEST_TOOLING||'/workspace/work/queen-tooling';
const require=createRequire(path.join(tooling,'package.json'));
const blake3=require('blake3-wasm');
const cli=await fs.readFile(path.join(tooling,'node_modules/wrangler/wrangler-dist/cli.js'),'utf8');
// Use the exact MIME3 dictionaries bundled into the pinned Wrangler Pages code.
const mimeTypes=new Map();
for(const name of ['standard','other']){
 const marker='mime@3.0.0/node_modules/mime/types/'+name+'.js';
 const start=cli.indexOf('// ../../node_modules/.pnpm/'+marker);
 if(start<0)throw Error('WRANGLER_MIME_TABLE_UNAVAILABLE');
 const literal=cli.slice(start).match(/module2\.exports = (\{[^\n]+\});/);
 if(!literal)throw Error('WRANGLER_MIME_TABLE_UNAVAILABLE');
 for(const [type,extensions] of Object.entries(JSON.parse(literal[1])))for(const extension of extensions){
  if(extension.startsWith('*'))continue;
  if(mimeTypes.has(extension))throw Error('WRANGLER_MIME_CONFLICT');
  mimeTypes.set(extension.toLowerCase(),type.toLowerCase());
 }
}
export const pagesHash=(bytes,name)=>blake3.hash(Buffer.from(bytes).toString('base64')+path.extname(name).substring(1)).toString('hex').slice(0,32);
export const pagesMime=name=>{
 const last=String(name).replace(/^.*[/\\]/,''),extension=last.replace(/^.*\./,'').toLowerCase();
 return (extension.length<last.length-1||last.length===String(name).length)&&mimeTypes.get(extension)||'application/octet-stream';
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_FILE=25*1024*1024,MAX_BATCH=2*1024*1024,MAX_FILES=20000,MAX_TOTAL=128*1024*1024;
const specialNames=new Map([['_headers','text/plain'],['_redirects','text/plain'],['_routes.json','application/json'],
 ['functions-filepath-routing-config.json','application/json'],['_worker.js','application/javascript+module'],['_worker.bundle','application/octet-stream']]);
const ignoredDirs=new Set(['functions','node_modules','.git','.wrangler']);
const unsafeName=name=>name==='.env'||name.startsWith('.env.')||name==='operator-key'||/\.(?:pem|key)$/i.test(name);

export async function preparePagesAssets(directory,output){
 directory=await fs.realpath(directory);output=path.resolve(output);
 if(output===directory||output.startsWith(directory+path.sep))throw Error('OUTPUT_INSIDE_ASSET_DIRECTORY');
 await fs.mkdir(output,{recursive:true,mode:0o700});
 if((await fs.readdir(output)).length)throw Error('OUTPUT_DIRECTORY_NOT_EMPTY');
 const manifest={},assets=new Map(),entries=[],specialFiles=[];let rawBytes=0;
 const save=async(name,bytes)=>{await fs.writeFile(path.join(output,name),bytes,{flag:'wx',mode:0o600});return {path:name,bytes:bytes.length,sha256:sha256(bytes)};};
 await fs.mkdir(path.join(output,'special'),{mode:0o700});
 async function walk(relative=''){
  const names=(await fs.readdir(path.join(directory,relative))).sort();
  for(const name of names){
   const rel=relative?relative+'/'+name:name;
   if(name==='.DS_Store'||ignoredDirs.has(name))continue;
   if(unsafeName(name))throw Error('PRIVATE_ASSET_FILENAME');
   const filename=path.join(directory,rel),stat=await fs.lstat(filename);
   if(stat.isSymbolicLink())throw Error('ASSET_SYMLINK_FORBIDDEN');
   if(stat.isDirectory()){await walk(rel);continue;}
   if(!stat.isFile())throw Error('UNSUPPORTED_ASSET_FILE');
   if(stat.size>MAX_FILE)throw Error('ASSET_FILE_TOO_LARGE');
   const bytes=await fs.readFile(filename);
   if(bytes.length>MAX_FILE)throw Error('ASSET_FILE_TOO_LARGE');
   if(!relative&&specialNames.has(name)){
    specialFiles.push({name,contentType:specialNames.get(name),...await save('special/'+name,bytes)});continue;
   }
   if(entries.length>=MAX_FILES)throw Error('ASSET_COUNT_LIMIT');
   if(rawBytes+bytes.length>MAX_TOTAL)throw Error('TOTAL_ASSET_BYTES_LIMIT');
   const key=pagesHash(bytes,rel),contentType=pagesMime(rel),value=bytes.toString('base64');
   const asset={key,value,metadata:{contentType},base64:true};
   if(assets.has(key)&&JSON.stringify(assets.get(key))!==JSON.stringify(asset))throw Error('ASSET_HASH_COLLISION');
   assets.set(key,asset);manifest['/'+rel]=key;rawBytes+=bytes.length;
   entries.push({path:'/'+rel,key,contentType,bytes:bytes.length});
  }
 }
 await walk();
 const manifestBytes=Buffer.from(JSON.stringify(manifest));
 const manifestFile=await save('manifest.json',manifestBytes);
 const manifestGzip=await save('manifest.json.gz',gzipSync(manifestBytes,{level:9}));
 const buckets=[];let bucket=[],bucketBytes=2;
 const flush=async()=>{
  if(!bucket.length)return;
  const bytes=Buffer.from('['+bucket.join(',')+']'),compressed=gzipSync(bytes,{level:9});
  if(bytes.length>MAX_BATCH)throw Error('ASSET_BUCKET_LIMIT');
  const file=await save('assets-'+String(buckets.length).padStart(4,'0')+'.json.gz',compressed);
  buckets.push({...file,encoding:'gzip',serializedBytes:bytes.length,assets:bucket.length,keys:bucket.map(value=>JSON.parse(value).key)});
  bucket=[];bucketBytes=2;
 };
 for(const asset of assets.values()){
  const text=JSON.stringify(asset),size=Buffer.byteLength(text);
  if(size+2>MAX_BATCH)throw Error('SINGLE_ASSET_EXCEEDS_SERIALIZED_BUCKET_LIMIT');
  if(bucketBytes+size+(bucket.length?1:0)>MAX_BATCH||bucket.length>=2000)await flush();
  bucketBytes+=size+(bucket.length?1:0);bucket.push(text);
 }
 await flush();
 const index={format:'cloudflare-pages-assets-v1',hashAlgorithm:'blake3(base64+extension).hex.slice(0,32)',
  assetCount:entries.length,uniqueAssets:assets.size,rawBytes,maxSerializedBucketBytes:MAX_BATCH,
  manifest:manifestFile,manifestGzip,buckets,specialFiles,entries};
 await save('index.json',Buffer.from(JSON.stringify(index,null,2)+'\n'));
 return index;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [directory,output]=process.argv.slice(2);
 if(!directory||!output)throw Error('USAGE: node prepare-pages-assets.mjs <dist> <out>');
 const index=await preparePagesAssets(directory,output);
 console.log(JSON.stringify({output:path.resolve(output),assetCount:index.assetCount,uniqueAssets:index.uniqueAssets,
  buckets:index.buckets.length,rawBytes:index.rawBytes,compressedBytes:index.buckets.reduce((n,b)=>n+b.bytes,0),specialFiles:index.specialFiles.map(f=>f.name)}));
}
