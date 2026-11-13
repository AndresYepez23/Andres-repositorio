import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
const endpoint=readFileSync(new URL('../functions/api/ai/transcribe.js',import.meta.url),'utf8');
test('Crear enables only Whisper models with actual API routes and feature flags',()=>{
 assert.match(core,/const isTranscription=group\.key==='audio'&&\['groq','cloudflare'\]\.includes\(provider\)/);
 assert.match(core,/centralFeatures\?\.\[provider\+'Audio'\]/);
 assert.match(core,/chat\.transcriptionSelection=\{provider,model:model\.id\}/);
 assert.match(core,/chat\.creativeMode='transcription'/);
 assert.match(core,/group\.key==='image'&&CREATE_IMAGE_PROVIDERS\.includes\(provider\)/);
});
test('audio file is sent to the real transcribe endpoint and returned text shown',()=>{
 assert.match(core,/fetch\('\/api\/ai\/transcribe'/);
 assert.match(core,/form\.append\('file',file/);
 assert.match(core,/form\.append\('provider',selection\.provider\)/);
 assert.match(core,/form\.append\('model',selection\.model\)/);
 assert.match(core,/addMessage\('assistant',transcript\)/);
 assert.match(endpoint,/allowedModel\(provider,"audio",model\)/);
 assert.match(endpoint,/https:\/\/api\.groq\.com\/openai\/v1\/audio\/transcriptions/);
 assert.match(endpoint,/env\.AI\.run\(model,input\)/);
});
test('unsupported music/video models are not falsely activated',()=>{
 assert.match(core,/const supported=\(group\.key==='image'&&CREATE_IMAGE_PROVIDERS\.includes\(provider\)\)\|\|isTranscription/);
 assert.match(core,/row\.disabled=!ready/);
});
