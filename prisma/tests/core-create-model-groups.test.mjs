import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../index.html');
const core=read('../src/core.js');
const css=read('../aurora-system.css');

test('Create pane uses grouped model cards, not image-only dropdowns',()=>{
 assert.match(html,/data-model-tab="image"[^>]*>Crear<\/button>/);
 assert.match(html,/id="core-create-groups"/);
 for(const id of ['core-image-provider','core-image-model','core-image-activate'])assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/Generación de imágenes|Motor de imagen|Modelo de imagen|Usar modo imagen en este chat/);
});
test('Crear only shows images and audio with individual purposes',()=>{
 for(const [key,title] of [['image','Imágenes'],['audio','Audio']]){
  assert.ok(core.includes("key:'"+key+"',title:'"+title+"'"));
 }
 for(const key of ['music','video','embedding','safety'])assert.doesNotMatch(core,new RegExp("key:'"+key+"',title:"));
 assert.match(core,/purpose\.textContent=String\(model\.specialty/);
 assert.match(core,/if\(\['huggingface','requesty'\]\.includes\(provider\)\|\|!Array\.isArray\(models\)\)continue/);
 assert.match(css,/\.core-create-option-copy \.core-create-purpose/);
});
test('Image generation receives selected card model, not removed dropdown values',()=>{
 assert.match(core,/provider:activeChatRecord\(\)\?\.imageSelection\?\.provider\|\|'auto'/);
 assert.match(core,/model:activeChatRecord\(\)\?\.imageSelection\?\.model\|\|''/);
 assert.doesNotMatch(core,/\$\('#core-image-provider'\)/);
 assert.doesNotMatch(core,/\$\('#core-image-model'\)/);
});
test('Unsupported creative media are informational, never sent to text chat as fake files',()=>{
 assert.match(core,/const ready=supported&&availability\.available/);
 assert.match(core,/row\.disabled=!ready/);
 assert.match(core,/if\(ready\)row\.addEventListener/);
 assert.match(core,/\$\('#core-composer-mode'\)\?\.classList\.add\('hidden'\)/);
});
