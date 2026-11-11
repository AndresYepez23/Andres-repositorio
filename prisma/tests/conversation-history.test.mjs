import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasConversationMessages, normalizeConversation, retainActiveConversationDraft, mergeConversationLists } from '../src/conversation-sync.js';
import { createTaskMemory } from '../src/core-task-memory.js';
import { planCapabilityRequest } from '../src/core-capabilities.js';

const empty=normalizeConversation({id:'draft-chat',title:'Nueva conversación',messages:[]});
const valid=normalizeConversation({id:'real-chat',title:'Hola',messages:[{role:'user',content:'Hola',time:1}]});
const legacy=normalizeConversation({id:'legacy-chat',messages:[{role:'assistant',content:'Respuesta',time:2}]});

assert.equal(hasConversationMessages(null),false);
assert.equal(hasConversationMessages(empty),false,'A zero-message draft must not be considered history');
assert.equal(hasConversationMessages({id:'missing-messages'}),false);
assert.equal(hasConversationMessages(valid),true,'A chat with a user message belongs in history');
assert.equal(hasConversationMessages(legacy),true,'Legacy conversations with messages remain valid');

const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
const account=readFileSync(new URL('../src/prisma-account.js',import.meta.url),'utf8');
const aurora=readFileSync(new URL('../aurora-system.css',import.meta.url),'utf8');

const loadStart=core.indexOf('function loadChatHistory(){');
const loadEnd=core.indexOf('async function restoreIndexedHistory(){',loadStart);
const loadSource=core.slice(loadStart,loadEnd);
assert.match(loadSource,/if\(needsCleanup\)\{[\s\S]*localStorage\.setItem\(CHATS_KEY,JSON\.stringify\(persisted\)\)/,
  'Pruning localStorage must not overwrite IndexedDB before its valid backup is restored');
assert.doesNotMatch(loadSource,/persistChatHistory\(\)/,
  'Boot-time cleanup must not erase a valid IndexedDB backup');
assert.match(core,/filter\(hasConversationMessages\)/,'Core must filter empty chats before persisting or rendering history');
assert.match(core,/const persisted=conversations\.filter\(hasConversationMessages\)/,'Remote history hydration must not save an empty draft');
assert.match(account,/filter\(hasConversationMessages\)/,'Account sync must filter empty local, IndexedDB and remote chats');
assert.match(account,/emptyRemoteIds/,'Old zero-message cloud rows must be cleaned during sync');

const assistantRule=aurora.match(/body\.is-core-view \.core-message\.assistant\s*\{([^}]*)\}/s)?.[1]||'';
assert.match(assistantRule,/background\s*:\s*transparent/,'Assistant response background must be transparent');
assert.match(assistantRule,/border\s*:\s*0/,'Assistant response must not render a card border');
assert.match(assistantRule,/box-shadow\s*:\s*none/,'Assistant response must not cast a card shadow');

const userRule=aurora.match(/body\.is-core-view \.core-message\.user\s*\{([^}]*)\}/s)?.[1]||'';
assert.match(userRule,/background\s*:/,'User bubble keeps its own background styling');
console.log('Prisma Core conversation history and clean-message regressions passed.');


const draft={id:'new-draft',title:'Nueva conversación',created:100,updated:100,messages:[]};
const oldChat={id:'old-chat',title:'Chat previo',created:10,updated:20,messages:[{role:'user',content:'Antes',time:12}]};
const secondChat={id:'second-chat',title:'Otro chat',created:5,updated:8,messages:[{role:'assistant',content:'Hola',time:6}]};

// IndexedDB restoration must not close a new unsent conversation.
const restored=retainActiveConversationDraft([oldChat,draft],[oldChat,secondChat],'new-draft');
assert.equal(restored[0].id,'new-draft');
assert.equal(restored.find(chat=>chat.id==='new-draft')?.messages.length,0);
assert.equal(restored.length,3);
assert.equal(restored.filter(hasConversationMessages).length,2,'Draft does not enter saved history');

// Cloud history updates must keep the blank chat open without losing saved chats.
const synced=retainActiveConversationDraft([oldChat,draft],[secondChat,oldChat],'new-draft');
assert.equal(synced[0].id,'new-draft');
assert.deepEqual(new Set(synced.filter(hasConversationMessages).map(chat=>chat.id)),new Set(['old-chat','second-chat']));

// Previously opened blank chats are not resurrected when a saved chat is selected.
const switched=retainActiveConversationDraft([oldChat,draft],[oldChat],'old-chat');
assert.deepEqual(switched.map(chat=>chat.id),['old-chat']);

// After the first message, the draft becomes ordinary saved history.
const sent={...draft,messages:[{role:'user',content:'Primer mensaje',time:101}]};
const afterSend=retainActiveConversationDraft([sent],[sent,oldChat],'new-draft');
assert.equal(afterSend.find(chat=>chat.id==='new-draft')?.messages[0].content,'Primer mensaje');
assert.equal(afterSend.filter(hasConversationMessages).length,2);

// Even without existing history, the active draft survives empty hydration.
assert.deepEqual(retainActiveConversationDraft([draft],[],'new-draft').map(chat=>chat.id),['new-draft']);

const restoreStart=core.indexOf('async function restoreIndexedHistory(){');
const restoreEnd=core.indexOf('function renderConversationSearch(){',restoreStart);
assert.match(core.slice(restoreStart,restoreEnd),/retainActiveConversationDraft\(conversations,merged,activeConversationId\)/,
  'IndexedDB restoration must preserve the active unsent conversation');
assert.match(core,/retainActiveConversationDraft\(conversations,synced,activeConversationId\)/,
  'Supabase history hydration must preserve the active unsent conversation');
const newStart=core.indexOf('function startNewConversation(){');
const newEnd=core.indexOf('function updateChatScreen(){',newStart);
assert.doesNotMatch(core.slice(newStart,newEnd),/persistChatHistory\(/,
  'Creating an empty draft must not write history or trigger cloud sync');

// Regression: confirmations must continue a failed/pending PDF job with the original file.
const taskMemory=createTaskMemory();
const pdf={name:'calendario.pdf',type:'application/pdf',size:4321};
taskMemory.wait('pdf-chat','Dividir pdf',[pdf]);
const resumed=taskMemory.resolve('pdf-chat','Sí');
assert.equal(resumed.request,'Dividir pdf','A bare confirmation is not a new chat request');
assert.deepEqual(resumed.files,[pdf],'The already-uploaded PDF is retained');
const resumedPlan=planCapabilityRequest(resumed.request,resumed.files);
assert.equal(resumedPlan?.type,'ready');
assert.deepEqual(resumedPlan.steps.map(step=>step.tool_id),['pdf-split']);
const afterResolution=taskMemory.resolve('pdf-chat','Hola');
assert.equal(afterResolution.request,undefined,'An unrelated greeting must not replay a pending operation');

// Regression: a delayed cloud snapshot cannot delete local assistant replies.
const oldRemote={...oldChat,updated:50,messages:[{id:'user-1',role:'user',content:'Dividir pdf',time:30}]};
const localWithReply={...oldChat,updated:60,messages:[
 {id:'user-1',role:'user',content:'Dividir pdf',time:30},
 {id:'answer-1',role:'assistant',content:'ZIP generado',time:45}
]};
const mergedCloud=mergeConversationLists([oldRemote],[localWithReply]);
assert.deepEqual(mergedCloud[0].messages.map(m=>m.content),['Dividir pdf','ZIP generado']);
assert.match(core,/mergeConversationLists\(remote,conversations\)/,'Cloud sync must merge, not replace, local replies');
assert.match(core,/queueConversationSnapshot\(records\)/,'History writes must be serialized');
assert.match(core,/taskMemory\.wait\(activeConversationId,plan\.userRequest/,'A failed tool must keep its retry task');
const sendSource=core.slice(core.indexOf('async function sendMessage(){'),core.indexOf('function renameActiveChat(){'));
assert.doesNotMatch(sendSource,/finally\{[\s\S]*attachments=\[\];renderAttachments\(\)/,
 'Submitting a file must not clear it unconditionally when an operation fails');
console.log('Prisma Core PDF retry and history synchronization regressions passed.');
