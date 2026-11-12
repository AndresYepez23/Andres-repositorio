import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../index.html');
const core=read('../src/core.js');
const status=read('../functions/api/providers/status.js');
const kilo=read('../functions/_lib/kilo-models.js');
const aihubmix=read('../functions/_lib/aihubmix-models.js');

test('Crear replaces image-only picker without modifying composer controls',()=>{
 assert.match(html,/data-model-tab="image"[^>]*>Crear<\/button>/);
 assert.match(html,/id="core-creative-groups"/);
 for(const old of ['Generación de imágenes','Motor de imagen','Modelo de imagen','Usar modo imagen en este chat']){
  assert.ok(!html.includes(old),old+' should not appear in picker');
 }
 for(const id of ['core-file-button','core-input','core-send','core-dictate','core-talk'])
  assert.ok(html.includes('id="'+id+'"'),id+' remains');
});
test('specialist groups include image music audio transcription video and safety',()=>{
 for(const name of ['Imágenes','Música','Audio y voz','Transcripción','Vídeo','Moderación'])
  assert.ok(core.includes("title:'"+name+"'"),name);
 assert.match(core,/function renderCreativeModelCatalog\(\)/);
 assert.match(core,/if\(ready\)\{[\s\S]*?core-creative-use/);
 assert.match(core,/banner\?\.classList\.add\('hidden'\)/);
 assert.match(core,/input\.placeholder='Escribe a Prisma…'/);
});
test('dynamic creative catalogs remain separate from chat and free-priced',()=>{
 assert.match(status,/modelCatalog\.creative=\{kilo:kiloCreative,aihubmix:aihubmixCreative\}/);
 assert.match(kilo,/Number\(model\.pricing\.prompt\)===0&&Number\(model\.pricing\.completion\)===0/);
 assert.match(aihubmix,/id\.endsWith\("-free"\)&&specialist&&Number\(weights\[id\]\?\?NaN\)===1/);
});
