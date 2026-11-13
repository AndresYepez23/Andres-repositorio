import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
const speech=readFileSync(new URL('../functions/api/ai/speech.js',import.meta.url),'utf8');
test('Crear exposes only Imágenes and Audio and keeps TTS in Audio',()=>{
 const groups=core.slice(core.indexOf('const CREATE_GROUPS=['),core.indexOf('const CREATE_IMAGE_PROVIDERS='));
 assert.match(groups,/key:'image'/);
 assert.match(groups,/key:'audio'/);
 for(const key of ['music','video','embedding','safety','transcription'])assert.doesNotMatch(groups,new RegExp("key:'"+key+"'"));
 assert.match(core,/entries\.push\(\{provider:'pollinations',model:/);
 assert.match(core,/id:'openai\/tts-1'/);
 assert.match(core,/centralFeatures\?\.pollinationsAudio/);
});
test('TTS selection routes through existing real audio pipeline',()=>{
 assert.match(core,/chat\.creativeMode='tts'/);
 assert.match(core,/activeChat\?\.creativeMode==='tts'/);
 assert.match(core,/await fulfillSpeechRequest\('Convierte a audio: '/);
 assert.match(core,/runTool\('ai-voice'/);
 assert.match(speech,/https:\/\/gen\.pollinations\.ai\/v1\/audio\/speech/);
 assert.match(speech,/const MAX_TEXT=1500/);
 assert.match(speech,/const MODELS=new Set\(\["openai\/tts-1","openai\/tts-1-hd"\]\)/);
});
