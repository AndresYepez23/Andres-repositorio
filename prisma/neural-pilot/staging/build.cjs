// Compiles only. Does not deploy, create databases or run migrations.
const path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../../..'),project=path.join(repo,'prisma');
const tooling=process.env.QUEEN_TEST_TOOLING;
const dependency=name=>require(tooling?path.join(tooling,'node_modules',name):name);
const out=path.resolve(process.env.QUEEN_STAGING_BUILD_OUTPUT||'work/queen-staging-build');
const config=fs.readFileSync(path.join(project,'wrangler.staging.toml'),'utf8');
if(!config.includes('name = "prisma-queen-staging"')||!config.includes('980bad8f-0356-48b9-87bc-56bcf363f69a')||config.includes('e02104b5-0861-475a-a60f-7658439d4fe0'))throw Error('UNSAFE_STAGING_CONFIG');
fs.mkdirSync(out,{recursive:true});
const wrangler=tooling?path.join(tooling,'node_modules','wrangler','bin','wrangler.js'):require.resolve('wrangler/bin/wrangler.js');
execFileSync(process.execPath,[wrangler,'--config','wrangler.staging.toml','pages','functions','build','functions','--outdir',path.join(out,'pages'),'--compatibility-date','2026-11-08'],{cwd:project,stdio:'inherit',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
(async()=>{
 await dependency('esbuild').build({stdin:{contents:`import pages from ${JSON.stringify(path.join(out,'pages','index.js'))};import {createQueenStagingWorker} from ${JSON.stringify(path.join(__dirname,'worker.js'))};export default createQueenStagingWorker(pages);`,resolveDir:repo},outfile:path.join(out,'worker.js'),bundle:true,format:'esm',platform:'browser',minify:true,external:['node:*','cloudflare:*'],logLevel:'warning'});
 console.log(JSON.stringify({artifact:path.join(out,'worker.js'),bytes:fs.statSync(path.join(out,'worker.js')).size,project:'prisma-queen-staging',productionChanged:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1});
