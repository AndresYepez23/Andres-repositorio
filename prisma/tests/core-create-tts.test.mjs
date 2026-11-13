import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
const intent=readFileSync(new URL('../src/core-speech-intent.js',import.meta.url),'utf8');
test('Crear exposes only images and audio and uses device speech',()=>{
 const groups=core.slice(core.indexOf('const CREATE_GROUPS=['),core.indexOf('const CREATE_IMAGE_PROVIDERS='));
 assert.match(groups,/key:'image'/);
 assert.match(groups,/key:'audio'/);
 for(const key of ['music','video','embedding','safety','transcription'])assert.doesNotMatch(groups,new RegExp("key:'"+key+"'"));
 assert.match(core,/provider:'browser',model:/);
 assert.match(core,/id:'browser-speech'/);
 assert.match(core,/speechSynthesis' in window/);
 assert.doesNotMatch(core,/entries\.push\(\{provider:'pollinations',model:/);
});
test('local voice mode plays text without remote generation or MP3 claims',()=>{
 assert.match(core,/chat\.creativeMode='tts'/);
 assert.match(core,/activeChat\?\.creativeMode==='tts'/);
 assert.match(core,/else readTextLocally\(text\)/);
 assert.match(core,/speakInBrowser\(content\)/);
 assert.match(core,/No exporta MP3/);
 assert.match(intent,/export function inlineSpeechText/);
 assert.doesNotMatch(core,/await fulfillSpeechRequest\('Convierte a audio: '/);
});
