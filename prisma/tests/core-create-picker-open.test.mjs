import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
test('Crear selections keep model picker open until user dismisses it',()=>{
 const create=core.slice(core.indexOf('function renderImageModelControls()'),core.indexOf('function renderModelPicker()'));
 assert.match(create,/setCoreCreativeMode\('image',\{keepPickerOpen:true\}\)/);
 assert.doesNotMatch(create,/core-model-settings'\)\.open=false/);
 assert.match(core,/function setCoreCreativeMode\(mode,\{keepPickerOpen=false\}=\{\}\)/);
 assert.match(core,/if\(picker&&!keepPickerOpen\)picker\.open=false/);
 assert.match(core,/if\(!keepPickerOpen\)\$\('#core-input'\)\?\.focus\(\)/);
});
