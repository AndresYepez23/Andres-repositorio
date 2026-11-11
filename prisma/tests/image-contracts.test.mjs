import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImageParameters} from '../src/image-contracts.js';
import {runTool} from '../src/engines.js';
test('crop rejects pixel coordinates before any file processing',async()=>{
 await assert.rejects(runTool('image-crop',[],{x:0,y:0,width:32,height:24}),/no admitido/);
 validateImageParameters('image-crop',{widthPct:50,heightPct:75});
});
test('resize validates bounded dimensions and explicit boolean aspect ratio',()=>{
 validateImageParameters('image-resize',{width:32,height:24,keep:false});
 for(const p of [{width:0},{width:Infinity},{width:12001},{width:1.5},{keep:'false'},{height:null},{width:true}])assert.throws(()=>validateImageParameters('image-resize',p));
});
test('contracts preserve other engines and reject unsupported image encodings',()=>{
 validateImageParameters('pdf-merge',{custom:'unchanged'});
 assert.throws(()=>validateImageParameters('image-resize',{format:'image/avif'}));
});
import {verifyImageResult} from '../src/image-contracts.js';
test('output verification rejects wrong dimensions and closes decoded resources',async()=>{
 let closed=0;const original=new Blob(['source']);const blob=new Blob(['output'],{type:'image/png'});
 const decode=async value=>({width:value===original?64:32,height:value===original?48:24,close(){closed++;}});
 const result=await verifyImageResult('image-resize',{blob},{width:32,height:24},[original],decode);
 assert.equal(result.verification.status,'validated');assert.equal(closed,2);
 await assert.rejects(verifyImageResult('image-resize',{blob},{width:16,height:12},[original],decode),/dimensiones/);
 await assert.rejects(verifyImageResult('image-resize',{blob},{width:32,height:24,format:'image/webp'},[original],decode),/formato/);
});
