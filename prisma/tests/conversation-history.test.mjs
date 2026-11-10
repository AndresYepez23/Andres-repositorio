import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasConversationMessages, normalizeConversation } from '../src/conversation-sync.js';

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
