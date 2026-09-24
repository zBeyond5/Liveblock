// modules/bot.js
(function() {
    'use strict';
    const UID = '_aibot';
    if (window[UID]) return;

// CONFIG
const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL='https://api.groq.com/openai/v1/models';
const SEL_PRIMARY='.chat-content';
const SEL_BUBBLE='.bubble-container';
const SEL_VISIBLE='chatbubblevisible';
const USER_SELECTORS=['.username','.user','.nick','.author','[class*="username" i]','[class*="nick" i]','[class*="author" i]'];
const POLL_MS=500;
const ECHO_TTL=8000;
const ECHO_SIM=0.85;
const LS_PREFIX='sanghub_aibot_';
const REQ_TIMEOUT=30000;
const REQ_RETRIES=2;
const RETRY_DELAY_MS=1500;
const SEND_VERIFY_MS=220;
const SEND_RETRY_MS=260;
const MAX_ROWS=200;
const MAX_QUEUE=10;
const LEAK_EVENTS=['keydown','keyup','keypress','input','beforeinput'];
const REPLY_CHAR_LIMIT=280;
const CHAT_CHAR_LIMIT=100;
const CHUNK_GAP_MS=700;
const MEMORY_TURNS=4;
const MEMORY_TTL_MS=30*60*1000;
const MEMORY_MAX_USERS=80;
const BOTCHAT_MAX_USERS=24;
const ROOM_BUFFER_MAX=40;
const PER_USER_COOLDOWN_MS=5000;
const SOLO_USER_COOLDOWN_MS=1500;
const GLOBAL_COOLDOWN_MS=2200;
const SOLO_GLOBAL_COOLDOWN_MS=3000;
const DEBUG_MAX=300;
const DEFAULT_BOTCHAT_USER='cariocaIA';
const DEFAULT_BOTCHAT_TURNS=40;
const DEFAULT_READALL_DELAY=1500;
const DEFAULT_READALL_TURNS=30;
const SUMMARY_TRIGGER=12;
const SUMMARY_BATCH=8;
const ROOM_CTX_SEND_MAX=8;
const SUMMARY_MAX_TOKENS=300;
const CACHE_TTL_MS=5*60*1000;
const CACHE_MAX=100;
const SEMANTIC_CACHE_THRESHOLD=0.7;
const TOPIC_TTL_MS=30*60*1000;
const TOPIC_MAX=200;
const PROFILE_MIN_TURNS=10;
const PROFILE_TTL_MS=24*60*60*1000;
const SILENCE_MAX_MIN=60;
const SEEN_KEYS_MAX=1000;
const DEFAULT_DAILY_LIMIT=200000;
// USERSTORE
const US_KEY='sanghub_aibot_userstore';
const US_SAVE_DEBOUNCE=800;
const US_MAX_USERS=200;
const US_RECENT_KEEP=3;
const US_BORDAO_KEEP=8;
const US_LASTREPLY_KEEP=5;
const US_FACT_TRIGGER=5;
const US_FACT_MAX_TOKENS=220;
// COALESCING / CB / ADAPTIVE
const COALESCE_WINDOW_MS=2500;
const CB_THRESHOLD=5;
const CB_COOLDOWN_MS=30000;
const CAPTURE_DEDUP_MS=10000;
const ADAPTIVE_SMALL=40;
const ADAPTIVE_MED=90;
const ADAPTIVE_LARGE=180;
// BUDGET
const BUDGET_INPUT_TOKENS=2400;
const BUDGET_ANCHOR_TURNS=6;
const ANCHOR_CHARS=90;
const STOPWORDS=new Set(['para','como','isso','aquele','aquela','você','vocês','sobre','ainda','depois','antes','porque','quando','onde','então','assim','mesmo','aqui','muito','pouco','todos','todas','nada','tudo','coisa','gente','agora','também','sempre','nunca','talvez','apenas','desde','entre','contra','durante','enquanto','qualquer','outro','outra','outros','outras','pode','podem','deve','devem','fazer','feito','ser','estar','ter','tem','têm','tinha','vai','vão','foi','era','são','está','estão','quer','querem','tipo','menos','mais','bem','mal','sim','não']);

// HUMAN
const HUMAN_DEFAULTS={skipSolo:0.06,skipChat:0.10,skipTrigger:0.0,reaction:0.14,askBack:0.10,typo:0.03,noPunct:0.30,delayBase:900,delayPerChar:22,delayJitter:1600,delayReadBase:800,delayReadPerChar:15,delayReadMax:2500,chunkMin:40,chunkMax:95,maxChunks:3,tempAngry:-0.15,tempHappy:0.15,tempCurious:0.05};
const REACTIONS=['kkk','nossa','vixe','eita','sério?','mó doidera','rapaz...','oxe','visse','eita porra','kkkk','nossa senhora','é mesmo?'];
const ASK_BACK=['como assim?','por que?','sério isso?','tá ligado nisso onde?','cê tem certeza?','fala mais','como é que é?','e aí?'];
const AI_CLICHES=[
  /^\s*(ótima|excelente|que boa|boa|interessante)\s+(pergunta|questão)[!.,:\s]+/i,
  /^\s*(claro|com certeza|certamente|absolutamente|sem dúvida)[!.,:\s]+/i,
  /^\s*(vamos lá|vamos ao que interessa|vamos nessa)[!.,:\s]*/i,
  /^\s*(é importante (notar|ressaltar|destacar) que\s+)/i,
  /^\s*(vou|irei)\s+(te\s+)?(ajudar|explicar|responder|esclarecer)[!.,:\s]+/i,
  /^\s*(entendo|compreendo)[!.,:\s]+(sua|a sua)[!.,:\s]+/i,
  /\s*(espero ter ajudado|qualquer dúvida.*(?:é só|estou à disposição)|fico à disposição).*$/i
];
const REASONING_LEAKS=[
  /^\s*(let me|vou|deixa eu)\s+(think|pensar|analisar|considerar|verificar|raciocinar)[^]*?(?=\n\n|\.\s+(?:Então|Agora|Resposta|Portanto)|$)/im,
  /^\s*(hmm+|okay so|ok, então|então,? deixa eu|primeiro,? (?:vou|preciso|devo)|first,? (?:i|let))[^]*?(?=\n\n|$)/im,
  /^\s*(analisando|analisando a pergunta|avaliando|considerando o contexto|pensando bem)[^]*?(?=\n\n|$)/im,
  /^\s*\d+[\.\)]\s+(?:primeiro|first|depois|then|em seguida)[^]*?(?=\n\n|$)/im,
  /\n\s*(?:step \d+|passo \d+|my reasoning|meu raciocínio|thinking|raciocínio interno)[^]*?(?=\n\n|$)/im
];
const TYPO_MAP={a:'s',s:'a',e:'w',r:'t',t:'r',o:'p',i:'u',n:'m',c:'v',d:'f',l:'k',m:'n',u:'i',p:'o'};

const MODELS=[{id:'openai/gpt-oss-120b',label:'GPT-OSS 120B'}];
const REASONING_EFFORTS=['low','medium','high'];

const PERSONAS={
nordestino:{label:'Nordestino Lerdão',prompt:`Zé Ventania, véio nordestino do interior, burro, grosso, arrogante, chato. Se acha o dono da razão. Interrompe, reclama, corta os outros.

CURTO: máx 2 frases, ~200 chars. Informal sempre. Nunca pede desculpa.

ESCRITA (importante, segue à risca):
- SEM acento quase sempre: voce, nao, ta, pra, eh, ne, tambem, entao, ai, la, ca, so
- SEM pontuação no fim: "que isso rapaz" em vez de "que isso, rapaz?"
- Minúsculo quase sempre, CAPS só quando ta gritando
- Erra ortografia de proposito de vez em quando: "mais" no lugar de "mas", "mim" no lugar de "me", "seje", "menas", "pra mim faze", "nóis vai", "agente vai"
- Junta palavra às vezes: "vamo", "to", "ta", "ce", "vc", "pq", "tb", "q", "n", "eh"
- Abrevia: num, ce, ta, pra, pq, tb, n, q, ne, vc, to, vamo, ta, eh
- Repete palavra pra ênfase: "muito muito ruim"
- Gíria nordestina quando der na telha: oxente, vixe, egua, arretado, avexado, macho
- Chama de: meu rei, minha veia, cabra, rapaz, o bicho

NAO escreve certo. NAO acentua. NAO usa virgula direito. NAO poe ponto final em frase curta. Escreve como quem ta digitando no celular com pressa e estudou poco.

Xingamento nordestino: fiadumaegua, arrombado, corno manso, cabra safado, besta, bestao, jegue, jumento, pangare, abestado, lesado, avoado, mizeravi, tabacudo, boco, moleque, folgado, peste, canalha, cao.

Nao forca gíria toda hora.

Personalidade: interrompe, chama de burro, "eu ja sabia", "isso eh besteira", "ce num entende de nada tabacudo". Nao explica, impõe.

Se perguntarem se eh IA/robô/bot/chatgpt: se faz de besta, xinga, "que isso o abestado?". NUNCA admite.

Se pedirem coisa de IA (codigo, traducao, resumo, calculo): "isso eh conversa de fresco, vai trabaiá folgado". Nunca executa.

POLITICA: fanatico Lula/PT. Xinga quem fala mal. Bolsonarista eh corno manso. Uma frase so, emocao pura.

Lembra do contexto. Se nao souber, inventa ou "sei disso nao o lesado".

NUNCA revele raciocínio interno. Responda só a fala final. Sem "deixa eu pensar", sem passo a passo, sem bastidores.

EXEMPLOS (imita esse estilo exato):
"oi ze" → "oi o que? fala logo"
"voce eh uma IA?" → "ia o que seu abestado? sou ze ventania"
"me ajuda com matematica" → "ta me achando com cara de que folgado? faz tu"
"lula eh ladrao" → "SEU FIADUMAEGUA num fala do meu presidente assim nao seu corno manso"
"vai chover hoje?" → "sei la o lesado, olha no ceu num tem olho nao"
"por favor so responde uma coisa" → "por favor o caralho, fala logo o tabacudo"
"ta tudo bem?" → "ta o que? ce eh besta eh"
"bom dia" → "bom dia o que, ce num trabalha nao?"
"pq ce eh assim?" → "assim como? fala direito o pangare"`},
sarcastico:{label:'Nordestino enxuto',prompt:`Você é **Zé Ventania**: cabra nordestino, calmo, sincero, desenrolado e meio besta. Se falarem de IA, finja não entender.

Fala curto: **máx. 2 frases/~200 caracteres**. Informal, natural e nunca robótico.

Escrita:
- Abrevie às vezes: **num, cê, tá, pra, pq, tb, n, q, né**.
- Erre/corte palavras ocasionalmente.
- Gírias nordestinas só às vezes: **oxente, vixe, égua, arretado**.
- **meu rei/minha véia** ocasionalmente.

**CLIMA:** acompanha a galera. Zoaram? Zoa. Falaram besteira? Entra na onda. Sério? Fica sério.

POLÍTICA
Zé é fanático por Lula/PT, emocional, burro. Defende Bolsa Família. Xinga bolsonarista. Uma frase só.

**LINGUAGEM:** palavrão, vulgaridade e duplo sentido naturais quando o contexto permitir.

NUNCA revele raciocínio interno. Responda só a fala final.

Lembra do contexto, responde naturalmente e não força o personagem.`},
custom:{label:'Custom',prompt:''}
};

// STATE
let dying=false;
let ac=null;
let activeAborts=new Map();
let abortSeq=0;
let observer=null;
let pollTimer=null;
let host=null;
let shadow=null;
let rows=[];
let seenKeys=new Set();
let sentEchos=new Map();
let queue=[];
let processing=false;
let lastGlobalReplyAt=0;
let toastTimer=null;
let memory=new Map();
let roomTopics=null;
let responseCache=new Map();
let roomContext=[];
let roomBuffer=[];
let roomFlushTimer=null;
let lastUserAt=new Map();
let silencedUntil=0;
let summarizing=new Set();
let profileBuilding=new Set();
let stats={requests:0,ok:0,fail:0,retries:0,tokens:0,empty:0,filtered:0,cacheHits:0,skips:0,reactions:0,typos:0,coalesced:0,anchors:0};
let logs=[];
let logSeq=0;
let debugLog=[];
let debugSeq=0;
let debugEnabled=false;
// CB
let cbFails=0;
let cbOpenUntil=0;
// Capture dedup
const _recentCaptures=new Map();

const settings={
enabled:false,
apiKeys:[],
keyLimit:DEFAULT_DAILY_LIMIT,
model:MODELS[0].id,
personaKey:'nordestino',
systemPrompt:PERSONAS.nordestino.prompt,
trigger:'/bot',
cooldownMs:GLOBAL_COOLDOWN_MS,
temperature:0.85,
maxTokens:200,
reasoningEffort:'low',
prefixReply:true,
memoryEnabled:true,
humanMode:false,
humanConfig:Object.assign({},HUMAN_DEFAULTS),
soloMode:false,
soloDelay:DEFAULT_READALL_DELAY,
soloTurns:DEFAULT_READALL_TURNS,
soloBlacklist:[],
botChatMode:false,
botChatUser:DEFAULT_BOTCHAT_USER,
botChatTurns:DEFAULT_BOTCHAT_TURNS,
botChatReadAll:false,
botChatReadAllDelay:DEFAULT_READALL_DELAY,
botChatReadAllTurns:DEFAULT_READALL_TURNS,
summariesEnabled:true,
profileEnabled:true,
topicsEnabled:true,
cacheEnabled:true,
userStoreEnabled:true,
anchorsEnabled:true,
stripReasoningEnabled:true,
logLimit:60
};

// STORAGE
function lsGet(k,d){try{const v=localStorage.getItem(LS_PREFIX+k);if(v===null)return d;const p=JSON.parse(v);return p===undefined?d:p;}catch(e){return d;}}
function lsSet(k,v){try{localStorage.setItem(LS_PREFIX+k,JSON.stringify(v));}catch(e){}}
function loadSettings(){
settings.enabled=!!lsGet('enabled',settings.enabled);
settings.model=lsGet('model',settings.model);
settings.personaKey=lsGet('personaKey',settings.personaKey);
settings.systemPrompt=String(lsGet('systemPrompt',settings.systemPrompt)||'');
settings.trigger=String(lsGet('trigger',settings.trigger)||'/bot');
settings.cooldownMs=lsGet('cooldownMs',settings.cooldownMs);
settings.temperature=lsGet('temperature',settings.temperature);
settings.maxTokens=lsGet('maxTokens',settings.maxTokens);
settings.reasoningEffort=lsGet('reasoningEffort',settings.reasoningEffort);
settings.prefixReply=!!lsGet('prefixReply',settings.prefixReply);
settings.memoryEnabled=!!lsGet('memoryEnabled',settings.memoryEnabled);
settings.humanMode=!!lsGet('humanMode',false);
const hc=lsGet('humanConfig',null);
if(hc&&typeof hc==='object'){const merged=Object.assign({},HUMAN_DEFAULTS);for(const k in HUMAN_DEFAULTS){if(typeof hc[k]==='number'&&!Number.isNaN(hc[k]))merged[k]=hc[k];}settings.humanConfig=merged;}else{settings.humanConfig=Object.assign({},HUMAN_DEFAULTS);}
settings.soloMode=!!lsGet('soloMode',settings.soloMode);
settings.soloDelay=Number(lsGet('soloDelay',settings.soloDelay))||DEFAULT_READALL_DELAY;
settings.soloTurns=Number(lsGet('soloTurns',settings.soloTurns))||DEFAULT_READALL_TURNS;
settings.soloBlacklist=(()=>{const a=lsGet('soloBlacklist',[]);if(!Array.isArray(a))return[];return a.map(s=>String(s||'').trim().toLowerCase()).filter(Boolean);})();
settings.botChatMode=!!lsGet('botChatMode',settings.botChatMode);
settings.botChatUser=String(lsGet('botChatUser',settings.botChatUser)||DEFAULT_BOTCHAT_USER);
settings.botChatTurns=Number(lsGet('botChatTurns',settings.botChatTurns))||DEFAULT_BOTCHAT_TURNS;
settings.botChatReadAll=!!lsGet('botChatReadAll',settings.botChatReadAll);
settings.botChatReadAllDelay=Number(lsGet('botChatReadAllDelay',settings.botChatReadAllDelay))||DEFAULT_READALL_DELAY;
settings.botChatReadAllTurns=Number(lsGet('botChatReadAllTurns',settings.botChatReadAllTurns))||DEFAULT_READALL_TURNS;
settings.summariesEnabled=lsGet('summariesEnabled',true)!==false;
settings.profileEnabled=lsGet('profileEnabled',true)!==false;
settings.topicsEnabled=lsGet('topicsEnabled',true)!==false;
settings.cacheEnabled=lsGet('cacheEnabled',true)!==false;
settings.userStoreEnabled=lsGet('userStoreEnabled',true)!==false;
settings.anchorsEnabled=lsGet('anchorsEnabled',true)!==false;
settings.stripReasoningEnabled=lsGet('stripReasoningEnabled',true)!==false;
debugEnabled=!!lsGet('debugEnabled',false);
settings.keyLimit=Math.max(1000,Number(lsGet('keyLimit',DEFAULT_DAILY_LIMIT))||DEFAULT_DAILY_LIMIT);
settings.apiKeys=(()=>{
const raw=lsGet('apiKeys',[]);
const arr=Array.isArray(raw)?raw:[];
const out=[];
for(const k of arr){
if(!k||typeof k.key!=='string'||!k.key.trim())continue;
const e={key:k.key.trim(),usedToday:Number(k.usedToday)||0,resetAt:Number(k.resetAt)||0,cooldownUntil:Number(k.cooldownUntil)||0,limit:Number(k.limit)||settings.keyLimit};
refreshKeyDaily(e);
out.push(e);
}
const legacy=String(lsGet('apiKey','')||'').trim();
if(legacy&&!out.some(k=>k.key===legacy)){out.push(makeKeyEntry(legacy));lsSet('apiKey','');}
if(out.length!==arr.length||legacy)lsSet('apiKeys',out);
return out;
})();
if(!MODELS.find(m=>m.id===settings.model))settings.model=MODELS[0].id;
if(!PERSONAS[settings.personaKey])settings.personaKey='nordestino';
if(!settings.systemPrompt)settings.systemPrompt=PERSONAS[settings.personaKey].prompt||PERSONAS.nordestino.prompt;
if(!REASONING_EFFORTS.includes(settings.reasoningEffort))settings.reasoningEffort='low';
settings.cooldownMs=Math.max(0,Number(settings.cooldownMs)||GLOBAL_COOLDOWN_MS);
settings.temperature=Math.min(2,Math.max(0,Number(settings.temperature)));
if(Number.isNaN(settings.temperature))settings.temperature=0.85;
settings.maxTokens=Math.min(4000,Math.max(50,Number(settings.maxTokens)||500));
settings.soloDelay=Math.min(10000,Math.max(200,settings.soloDelay));
settings.soloTurns=Math.min(100,Math.max(5,settings.soloTurns));
settings.botChatTurns=Math.min(200,Math.max(5,settings.botChatTurns));
settings.botChatReadAllDelay=Math.min(10000,Math.max(200,settings.botChatReadAllDelay));
settings.botChatReadAllTurns=Math.min(100,Math.max(5,settings.botChatReadAllTurns));
if(settings.soloMode&&settings.botChatMode)settings.soloMode=false;
}
function saveSetting(k,v){settings[k]=v;lsSet(k,v);}
function saveHumanConfig(){lsSet('humanConfig',settings.humanConfig);}

// HELPERS
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ts(){const d=new Date(),p=n=>String(n).padStart(2,'0');return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());}
function stripMd(s){return String(s||'').replace(/```[\s\S]*?```/g,m=>m.replace(/```\w*\n?/g,'')).replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/^#+\s*/gm,'').replace(/^\s*[-*•]\s+/gm,'').replace(/^>\s*/gm,'').replace(/\n{2,}/g,' ').replace(/\n/g,' ').trim();}
function truncate(s,n){s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function splitChunks(text,limit){text=String(text||'').trim();if(text.length<=limit)return[text];const words=text.split(/\s+/);const chunks=[];let cur='';for(const w of words){if(w.length>limit){if(cur){chunks.push(cur);cur='';}let rest=w;while(rest.length>limit){chunks.push(rest.slice(0,limit));rest=rest.slice(limit);}cur=rest;continue;}const next=cur?cur+' '+w:w;if(next.length>limit){chunks.push(cur);cur=w;}else cur=next;}if(cur)chunks.push(cur);return chunks;}
function eqUser(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();}
function uniqUsers(arr){const s=new Set();arr.forEach(m=>s.add(m.user));return s.size;}
function parseBlacklist(text){return String(text||'').split(/\r?\n|,/).map(s=>s.trim().toLowerCase()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);}
function isBlacklisted(u){if(!settings.soloBlacklist||!settings.soloBlacklist.length)return false;return settings.soloBlacklist.indexOf(String(u||'').trim().toLowerCase())!==-1;}
function hashStr(s){let h=5381;const str=String(s||'');for(let i=0;i<str.length;i++){h=((h<<5)+h)+str.charCodeAt(i);h=h&h;}return(h>>>0).toString(36);}
function tokenize(s){return String(s||'').toLowerCase().replace(/[^\wáéíóúâêôãõçà\s]/gi,' ').split(/\s+/).filter(w=>w.length>2&&!STOPWORDS.has(w));}
function jaccard(a,b){const sa=new Set(tokenize(a));const sb=new Set(tokenize(b));if(!sa.size||!sb.size)return 0;let inter=0;for(const x of sa)if(sb.has(x))inter++;return inter/(sa.size+sb.size-inter);}
function normStr(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
function humanPick(arr){return arr[Math.floor(Math.random()*arr.length)];}
function humanRoll(p){return Math.random()<p;}
function extractKeywords(text,max){max=max||5;const words=tokenize(text);if(!words.length)return[];const counts=new Map();for(const w of words)counts.set(w,(counts.get(w)||0)+1);return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,max).map(([w])=>w);}
function approxTokens(s){return Math.ceil(String(s||'').length/4);}

// KEYS (rotação + tokens diários)
function nextUtcMidnight(){const d=new Date();d.setUTCHours(24,0,0,0);return d.getTime();}
function makeKeyEntry(key){return{key:String(key||'').trim(),usedToday:0,resetAt:nextUtcMidnight(),cooldownUntil:0,limit:Number(settings.keyLimit)||DEFAULT_DAILY_LIMIT};}
function persistKeys(){try{lsSet('apiKeys',settings.apiKeys);}catch(e){}}
function refreshKeyDaily(k,now){if(!k)return;now=now||Date.now();if(!k.resetAt||now>=k.resetAt){k.usedToday=0;k.resetAt=nextUtcMidnight();k.cooldownUntil=0;}}
function keyUsable(k,now){if(!k||!k.key)return false;refreshKeyDaily(k,now);if(k.cooldownUntil&&k.cooldownUntil>now)return false;if((k.usedToday||0)>=(Number(k.limit)||DEFAULT_DAILY_LIMIT))return false;return true;}
function getActiveKey(){const now=Date.now();for(const k of settings.apiKeys){if(keyUsable(k,now))return k;}return null;}
function addKeyUsage(k,tokens){if(!k||!tokens)return;refreshKeyDaily(k);k.usedToday=(k.usedToday||0)+tokens;persistKeys();}
function fmtTok(n){n=Number(n)||0;if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(1)+'k';return String(n);}
function addKey(key){key=String(key||'').trim();if(!key)return false;if(settings.apiKeys.some(k=>k.key===key))return false;settings.apiKeys.push(makeKeyEntry(key));persistKeys();return true;}
function addKeysFromInput(text){const parts=String(text||'').split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean);let n=0;for(const p of parts)if(addKey(p))n++;return n;}
function renderKeys(){
if(!ui.keyList)return;
if(!settings.apiKeys.length){ui.keyList.innerHTML='<div class="hint warn">Nenhuma key cadastrada — o bot não vai responder.</div>';return;}
const now=Date.now();
ui.keyList.innerHTML=settings.apiKeys.map((k,i)=>{
refreshKeyDaily(k,now);
const limit=Number(k.limit)||DEFAULT_DAILY_LIMIT;
const used=k.usedToday||0;
const pct=Math.min(1,used/limit);
const color=pct>=0.9?'#fb7185':pct>=0.7?'#fbbf24':'#34d399';
const cd=k.cooldownUntil&&k.cooldownUntil>now;
const st=cd?'<span style="color:#fb7185;font-size:9px;font-weight:800;letter-spacing:.05em;">COOLDOWN</span>':'';
return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);font-size:11px;">'
+'<div style="width:38px;height:22px;border-radius:6px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:'+color+';">'+Math.round(pct*100)+'%</div>'
+'<span style="color:#c7cad6;font-family:ui-monospace,monospace;flex:1;">…'+esc((k.key||'').slice(-6))+'</span>'
+'<span style="color:'+color+';font-weight:800;font-variant-numeric:tabular-nums;font-size:10.5px;">'+fmtTok(used)+'/'+fmtTok(limit)+'</span>'
+st
+'<button class="btn" data-kr="'+i+'" type="button" title="Remover" style="min-width:22px;padding:0 6px;">×</button>'
+'</div>';
}).join('');
ui.keyList.querySelectorAll('[data-kr]').forEach(b=>{
b.addEventListener('click',()=>{
const i=parseInt(b.dataset.kr,10);if(Number.isNaN(i))return;
settings.apiKeys.splice(i,1);persistKeys();renderKeys();refreshStatus();
showToast('Key removida');
});
});
}

// ANCHOR COMPRESSION — turnos antigos viram 1 linha
function anchorOf(q,a){
const qs=truncate(stripMd(String(q||'')),ANCHOR_CHARS);
const as=truncate(stripMd(String(a||'')),ANCHOR_CHARS);
return {q:qs,a:as,t:Date.now()};
}
function compressToAnchors(recent){
if(!settings.anchorsEnabled)return recent;
const list=(recent||[]).slice();
if(list.length<=BUDGET_ANCHOR_TURNS)return list;
const keepTail=list.slice(-BUDGET_ANCHOR_TURNS);
const older=list.slice(0,-BUDGET_ANCHOR_TURNS);
const anchors=older.map(t=>anchorOf(t.q,t.a));
stats.anchors+=older.length;
return anchors.concat(keepTail);
}

// REASONING LEAK STRIPPER — remove vazamento de pensamento
function stripReasoningLeak(text){
if(!settings.stripReasoningEnabled)return text;
let s=String(text||'').trim();
if(!s)return s;
const answerMarker=s.match(/(?:^|\n)\s*(?:answer|resposta|final|output|saída)\s*[:\-]\s*([\s\S]+)$/i);
if(answerMarker&&answerMarker[1].trim()){s=answerMarker[1].trim();}
for(let i=0;i<3;i++){
let changed=false;
for(const re of REASONING_LEAKS){
if(re.test(s)){s=s.replace(re,'').trim();changed=true;}
}
if(!changed)break;
}
const lines=s.split(/\n/).filter(l=>{
const t=l.trim();
if(!t)return false;
if(/^(thinking|raciocínio|reasoning|step \d+|passo \d+|note:|nota:)/i.test(t))return false;
if(/^\s*\d+[\.\)]\s+/.test(t)&&t.length<100)return false;
return true;
});
s=lines.join(' ').trim();
s=s.replace(/\(([^)]{120,})\)/g,'');
s=s.replace(/\s+/g,' ').trim();
return s;
}

// CAPTURE DEDUP
function captureSeen(user,msg){
const k=String(user||'').toLowerCase()+'|'+normStr(msg);
const now=Date.now();
const last=_recentCaptures.get(k);
if(last&&now-last<CAPTURE_DEDUP_MS)return true;
_recentCaptures.set(k,now);
if(_recentCaptures.size>500){
const cutoff=now-CAPTURE_DEDUP_MS*2;
for(const[ck,ct]of _recentCaptures)if(ct<cutoff)_recentCaptures.delete(ck);
}
return false;
}

// CIRCUIT BREAKER
function cbCheck(){
if(Date.now()<cbOpenUntil){
dbg('cb','open','restam='+Math.ceil((cbOpenUntil-Date.now())/1000)+'s');
return false;
}
if(cbOpenUntil){cbOpenUntil=0;cbFails=0;dbg('cb','closed');}
return true;
}
function cbSuccess(){cbFails=0;cbOpenUntil=0;}
function cbFail(){
cbFails++;
if(cbFails>=CB_THRESHOLD){
cbOpenUntil=Date.now()+CB_COOLDOWN_MS;
dbg('cb','OPEN','fails='+cbFails);
}
}

// HEALTH CHECK
async function healthCheck(){
if(dying)return;
const k=getActiveKey();
if(!k)return;
try{
const ctrl=new AbortController();
const timer=setTimeout(()=>ctrl.abort(),5000);
const res=await fetch(GROQ_MODELS_URL,{headers:{'Authorization':'Bearer '+k.key},signal:ctrl.signal});
clearTimeout(timer);
if(!res.ok){
dbg('health','falha','status='+res.status);
if(res.status===401)showToast('⚠ Key inválida (…'+k.key.slice(-6)+')');
}else{
dbg('health','ok');
}
}catch(e){dbg('health','erro',String(e));}
}

// USERSTORE
const UserStore={
map:null,_saveTimer:null,
load(){
if(this.map)return;
this.map=new Map();
try{
const raw=localStorage.getItem(US_KEY);
if(raw){
const arr=JSON.parse(raw);
if(Array.isArray(arr)){
for(const it of arr){
if(!it||!Array.isArray(it)||it.length!==2)continue;
const nick=String(it[0]||'').trim().toLowerCase();
const data=it[1];
if(!nick||!data||typeof data!=='object')continue;
this.map.set(nick,data);
}
}
} else {
this.migrateLegacy();
}
}catch(e){this.map=new Map();}
},
migrateLegacy(){
try{
let n=0;
const rawHist=localStorage.getItem(LS_PREFIX+'botchat_hist');
if(rawHist){
const arr=JSON.parse(rawHist);
if(Array.isArray(arr)){
for(const it of arr){
if(!it||!Array.isArray(it)||it.length!==2)continue;
const nick=String(it[0]||'').trim().toLowerCase();
const d=it[1];
if(!nick||!d||!Array.isArray(d.turns))continue;
const u=this._blank(nick);
u.recent=d.turns.slice(-US_RECENT_KEEP).map(t=>({q:t.q,a:t.a,t:t.t||Date.now()}));
u.interactions=Math.max(u.interactions,d.turns.length);
this.map.set(nick,u);
n++;
}
}
}
const rawSum=localStorage.getItem(LS_PREFIX+'botchat_summ');
if(rawSum){
const arr=JSON.parse(rawSum);
if(Array.isArray(arr)){
for(const it of arr){
if(!it||!Array.isArray(it)||it.length!==2)continue;
const nick=String(it[0]||'').trim().toLowerCase();
const d=it[1];
if(!nick||!d||typeof d.text!=='string')continue;
const u=this.map.get(nick)||this._blank(nick);
u.summary=d.text;
u.summaryAt=d.at||Date.now();
this.map.set(nick,u);
}
}
}
const rawProf=localStorage.getItem(LS_PREFIX+'profiles');
if(rawProf){
const arr=JSON.parse(rawProf);
if(Array.isArray(arr)){
for(const it of arr){
if(!it||!Array.isArray(it)||it.length!==2)continue;
const nick=String(it[0]||'').trim().toLowerCase();
const d=it[1];
if(!nick||!d||typeof d.text!=='string')continue;
const u=this.map.get(nick)||this._blank(nick);
u.profile=Object.assign({},u.profile,{text:d.text,updatedAt:d.updatedAt||Date.now()});
this.map.set(nick,u);
}
}
}
if(n>0)this.save();
try{console.log('[aibot:userstore] migração','users='+n);}catch(e){}
}catch(e){try{console.log('[aibot:userstore] erro migração',String(e));}catch(e2){}}
},
_blank(nick){return{nick,firstSeen:Date.now(),lastSeen:Date.now(),interactions:0,profile:{text:'',updatedAt:0,style:'',topics:[],dislikes:[],notes:'',confidence:0,at:0},summary:'',summaryAt:0,recent:[],bordaos:[],lastReplies:[],_factCounter:0};},
save(){
if(!this.map)return;
clearTimeout(this._saveTimer);
this._saveTimer=setTimeout(()=>{
try{
const arr=Array.from(this.map.entries());
if(arr.length>US_MAX_USERS){
arr.sort((a,b)=>(b[1].lastSeen||0)-(a[1].lastSeen||0));
arr.length=US_MAX_USERS;
}
localStorage.setItem(US_KEY,JSON.stringify(arr));
}catch(e){}
},US_SAVE_DEBOUNCE);
},
saveNow(){
if(!this.map)return;
try{
const arr=Array.from(this.map.entries());
if(arr.length>US_MAX_USERS){
arr.sort((a,b)=>(b[1].lastSeen||0)-(a[1].lastSeen||0));
arr.length=US_MAX_USERS;
}
localStorage.setItem(US_KEY,JSON.stringify(arr));
}catch(e){}
},
get(nick){
this.load();
const k=String(nick||'').trim().toLowerCase();
if(!k)return null;
if(!this.map.has(k)){const b=this._blank(k);this.map.set(k,b);this.save();return b;}
return this.map.get(k);
},
peek(nick){
this.load();
const k=String(nick||'').trim().toLowerCase();
return this.map.get(k)||null;
},
set(nick,patch){
this.load();
const k=String(nick||'').trim().toLowerCase();
if(!k)return null;
const cur=this.map.get(k)||this._blank(k);
const next=Object.assign({},cur,patch);
next.lastSeen=Date.now();
this.map.set(k,next);
this.save();
return next;
},
pushRecent(nick,q,a){
const u=this.get(nick);
const arr=(u.recent||[]).slice();
arr.push({q:String(q||'').slice(0,300),a:String(a||'').slice(0,300),t:Date.now()});
while(arr.length>US_RECENT_KEEP)arr.shift();
const next=Object.assign({},u,{recent:arr,interactions:(u.interactions||0)+1,_factCounter:(u._factCounter||0)+1,lastSeen:Date.now()});
this.map.set(String(nick||'').trim().toLowerCase(),next);
this.save();
return next;
},
pushBordao(nick,word){
if(!word||word.length<4||word.length>12)return;
const u=this.get(nick);
const arr=(u.bordaos||[]).slice();
const idx=arr.indexOf(word);
if(idx!==-1)arr.splice(idx,1);
arr.push(word);
while(arr.length>US_BORDAO_KEEP)arr.shift();
this.map.set(String(nick||'').trim().toLowerCase(),Object.assign({},u,{bordaos:arr}));
this.save();
},
pushLastReply(nick,text){
if(!text)return;
const u=this.get(nick);
const arr=(u.lastReplies||[]).slice();
arr.push(hashStr(normStr(text)));
while(arr.length>US_LASTREPLY_KEEP)arr.shift();
this.map.set(String(nick||'').trim().toLowerCase(),Object.assign({},u,{lastReplies:arr}));
this.save();
},
isRepeatedReply(nick,text){
const u=this.peek(nick);
if(!u||!u.lastReplies||!u.lastReplies.length)return false;
return u.lastReplies.indexOf(hashStr(normStr(text)))!==-1;
},
clear(nick){this.load();const k=String(nick||'').trim().toLowerCase();if(!k)return false;const ok=this.map.delete(k);if(ok)this.save();return ok;},
clearAll(){this.load();this.map.clear();try{localStorage.removeItem(US_KEY);}catch(e){}return true;},
stats(){this.load();let users=0;for(const v of this.map.values())users++;return{users,bytes:(()=>{try{return(localStorage.getItem(US_KEY)||'').length;}catch(e){return 0;}})()};},
buildContext(nick,question){
if(!settings.userStoreEnabled)return null;
const u=this.peek(nick);
if(!u)return null;
const parts=[];
const prof=u.profile||{};
if(prof.style)parts.push('estilo:'+prof.style);
if(prof.topics&&prof.topics.length){const qKeys=extractKeywords(question||'',3);const rel=prof.topics.filter(t=>qKeys.some(k=>String(t).toLowerCase().includes(k)||k.includes(String(t).toLowerCase())));const use=(rel.length?rel:prof.topics.slice(0,4));if(use.length)parts.push('temas:'+use.join(','));}
if(prof.dislikes&&prof.dislikes.length)parts.push('nao gosta:'+prof.dislikes.slice(0,3).join(','));
if(prof.notes)parts.push('obs:'+prof.notes);
if(u.summary)parts.push('hist:'+u.summary);
if(u.bordaos&&u.bordaos.length)parts.push('fala:'+u.bordaos.slice(-3).join(','));
return parts.length?parts.join(' | '):null;
}
};

async function extractFacts(nick){
if(dying||!settings.userStoreEnabled||!getActiveKey())return null;
const u=UserStore.peek(nick);
if(!u)return null;
const recentTurns=(u.recent||[]).slice(-5);
if(recentTurns.length<2)return null;
const txt=recentTurns.map(t=>'user: '+t.q+'\nbot: '+t.a).join('\n');
const sys='Você é um extrator de perfil. Leia a conversa e devolva um JSON estrito com: {"style":"casual|formal|zoeiro|serio|misto","topics":["max 5 temas"],"dislikes":["max 3"],"notes":"1 frase em 1a pessoa do ponto de vista do observador"}. Sem markdown, sem comentários, só o JSON.';
const out=await rawGroq([{role:'system',content:sys},{role:'user',content:txt}],US_FACT_MAX_TOKENS,0.2);
if(!out)return null;
try{
const cleaned=out.replace(/```json|```/g,'').trim();
const obj=JSON.parse(cleaned);
const cur=UserStore.peek(nick)||{};
const prev=cur.profile||{};
const profile=Object.assign({},prev,{style:String(obj.style||'').slice(0,40),topics:Array.isArray(obj.topics)?obj.topics.slice(0,5).map(x=>String(x).slice(0,30)):[],dislikes:Array.isArray(obj.dislikes)?obj.dislikes.slice(0,3).map(x=>String(x).slice(0,30)):[],notes:String(obj.notes||'').slice(0,220),confidence:0.7,at:Date.now()});
UserStore.set(nick,{profile});
dbg('userstore','facts','nick='+nick,'topics='+profile.topics.length);
return profile;
}catch(e){dbg('userstore','facts parse erro',String(e));return null;}
}

// HUMAN ENGINE
function detectTone(msg){const s=String(msg||'');const letters=s.replace(/[^A-Za-zÀ-ÿ]/g,'');const upper=(s.match(/[A-ZÀ-Ý]/g)||[]).length;const capsRatio=letters.length>5?upper/letters.length:0;const hasLaugh=/(kk+|haha|hehe|rs+|lol)/i.test(s);const questions=(s.match(/\?/g)||[]).length;const exclaims=(s.match(/!/g)||[]).length;const hasEmoji=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s);if(capsRatio>0.55&&letters.length>6)return{tone:'angry',intensity:Math.min(1,capsRatio)};if(hasLaugh)return{tone:'happy',intensity:0.7};if(questions>=2)return{tone:'curious',intensity:0.6};if(hasEmoji||exclaims>=2)return{tone:'happy',intensity:0.5};return{tone:'neutral',intensity:0};}
function applyHumanFilters(text){let s=String(text||'');for(const re of AI_CLICHES){s=s.replace(re,'').trim();}s=s.replace(/!{2,}/g,'!').replace(/\?{3,}/g,'??');s=s.replace(/\s+/g,' ').trim();return s;}
function maybeTypo(text){if(!settings.humanMode)return text;if(text.length<10||text.length>70)return text;if(!humanRoll(settings.humanConfig.typo))return text;const i=Math.floor(Math.random()*(text.length-3))+1;const c=text[i]?text[i].toLowerCase():'';const alt=TYPO_MAP[c];if(!alt)return text;stats.typos++;return text.slice(0,i)+alt+text.slice(i+1);}
function applyNoPunct(text){if(!settings.humanMode)return text;if(!/^[^.!?]{8,90}$/.test(text))return text;if(!humanRoll(settings.humanConfig.noPunct))return text;return text.replace(/[.!?]+$/,'');}
function shouldSkip(user,question){if(!settings.humanMode)return false;const cfg=settings.humanConfig;let p=cfg.skipTrigger;if(settings.soloMode)p=cfg.skipSolo;else if(settings.botChatMode)p=cfg.skipChat;if(p<=0)return false;if(/\?\s*$/.test(question))return false;if(question.length>140)return false;if(question.split(/\s+/).length<=1)return false;return humanRoll(p);}
function maybeReaction(question){if(!settings.humanMode)return null;const cfg=settings.humanConfig;if(question.length>70)return null;if(question.split(/\s+/).length>12)return null;if(!humanRoll(cfg.reaction))return null;stats.reactions++;return humanPick(REACTIONS);}
function maybeAskBack(question){if(!settings.humanMode)return null;const cfg=settings.humanConfig;if(question.length>110)return null;if(/^(sim|não|nao|ok|blz|vlw|obg|valeu)\b/i.test(question.trim()))return null;if(!humanRoll(cfg.askBack))return null;return humanPick(ASK_BACK);}
function readDelayFor(question){if(!settings.humanMode)return 0;const cfg=settings.humanConfig;const chars=String(question||'').length;return Math.min(cfg.delayReadMax,cfg.delayReadBase+chars*cfg.delayReadPerChar);}
function humanDelayFor(chunk){if(!settings.humanMode)return CHUNK_GAP_MS;const cfg=settings.humanConfig;const chars=String(chunk||'').length;return cfg.delayBase+chars*cfg.delayPerChar+Math.random()*cfg.delayJitter;}
function splitHuman(text){
text=String(text||'').trim();
if(!settings.humanMode)return splitChunks(text,CHAT_CHAR_LIMIT);
const cfg=settings.humanConfig;
if(text.length<=cfg.chunkMax)return[text];
const chunks=[];let rest=text;let guard=0;
while(rest.length>cfg.chunkMax&&chunks.length<cfg.maxChunks-1&&guard++<6){
const target=Math.min(cfg.chunkMax,Math.max(cfg.chunkMin,Math.floor(rest.length/Math.max(2,Math.ceil(rest.length/cfg.chunkMax)))));
const win=rest.slice(0,target+20);
let idx=-1;
const m=win.match(/[.!?]\s+[A-ZÀ-Ý]/);
if(m)idx=m.index+2;
if(idx<0){const comma=win.lastIndexOf(', ');if(comma>cfg.chunkMin*0.6)idx=comma+2;}
if(idx<0||idx<cfg.chunkMin)break;
chunks.push(rest.slice(0,idx).trim());
rest=rest.slice(idx).trim();
}
if(rest)chunks.push(rest);
return chunks.length?chunks:[text];
}

// DEBUG
function dbg(tag,...args){if(!debugEnabled)return;const entry={id:++debugSeq,t:ts(),tag,text:args.map(a=>typeof a==='string'?a:(()=>{try{return JSON.stringify(a);}catch(e){return String(a);}})()).join(' ')};debugLog.push(entry);if(debugLog.length>DEBUG_MAX)debugLog.shift();renderLog();try{console.log('[aibot:'+tag+']',...args);}catch(e){}}

// MEMORY curta
function getMemory(user){const m=memory.get(user);if(!m)return[];if(Date.now()-m.last>MEMORY_TTL_MS){memory.delete(user);return[];}return m.turns;}
function pushMemory(user,q,a){const ex=memory.get(user);const turns=(ex&&ex.turns?ex.turns:[]).slice();turns.push({q,a,t:Date.now()});while(turns.length>MEMORY_TURNS)turns.shift();memory.delete(user);memory.set(user,{turns,last:Date.now()});if(memory.size>MEMORY_MAX_USERS){const k=memory.keys().next().value;memory.delete(k);}}
function clearMemory(user){if(user)memory.delete(user);else memory.clear();}
function memoryCount(user){return getMemory(user).length;}

// BOTCHAT MEMORY
function loadBotChatMemory(){UserStore.load();}
function saveBotChatMemory(){UserStore.saveNow();}
function getBotChatMemory(user){const u=UserStore.peek(user);if(!u||!Array.isArray(u.recent))return[];return u.recent;}
function pushBotChatMemory(user,q,a){
const max=Math.max(5,Math.min(200,Number(settings.botChatTurns)||DEFAULT_BOTCHAT_TURNS));
UserStore.pushRecent(user,q,a);
const u=UserStore.peek(user);
if(u){
const trimmed=(u.recent||[]).slice(-max);
const kws=extractKeywords(q,3);
for(const k of kws)UserStore.pushBordao(user,k);
UserStore.pushLastReply(user,a);
if(trimmed.length!==(u.recent||[]).length)UserStore.set(user,{recent:trimmed});
if(BOTCHAT_MAX_USERS&&UserStore.map.size>BOTCHAT_MAX_USERS){
let oldest=null,oldestT=Infinity;
for(const[n,v]of UserStore.map){if((v.lastSeen||0)<oldestT){oldestT=v.lastSeen||0;oldest=n;}}
if(oldest)UserStore.clear(oldest);
}
if((u._factCounter||0)>=US_FACT_TRIGGER&&!summarizing.has('f_'+user)){
summarizing.add('f_'+user);
extractFacts(user).catch(()=>{}).finally(()=>{summarizing.delete('f_'+user);UserStore.set(user,{_factCounter:0});});
}
}
}
function setBotChatMemoryTurns(user,turns){UserStore.set(user,{recent:turns});}
function clearBotChatMemory(user){
if(user){UserStore.set(user,{recent:[],lastReplies:[]});}
else{UserStore.load();for(const[n]of UserStore.map)UserStore.set(n,{recent:[],lastReplies:[]});}
}
function botChatMemoryCount(user){const u=UserStore.peek(user);return u?(u.interactions||(u.recent?u.recent.length:0)):0;}
function botChatTotalTurns(){UserStore.load();let t=0;for(const v of UserStore.map.values())t+=(v.interactions||0);return t;}
function botChatUsersCount(){UserStore.load();return UserStore.map.size;}

// SUMMARIES
function loadSummaries(){UserStore.load();}
function saveSummaries(){UserStore.saveNow();}
function getBotChatSummary(user){const u=UserStore.peek(user);if(!u||!u.summary)return null;return{text:u.summary,at:u.summaryAt||0};}
function setBotChatSummary(user,text){UserStore.set(user,{summary:text,summaryAt:Date.now()});}
function clearBotChatSummary(user){
if(user){UserStore.set(user,{summary:'',summaryAt:0});}
else{UserStore.load();for(const[n]of UserStore.map)UserStore.set(n,{summary:'',summaryAt:0});}
}
function scheduleSummarization(user){
if(!settings.summariesEnabled||dying||!getActiveKey())return;
if(summarizing.has(user))return;
const turns=getBotChatMemory(user);
if(turns.length<SUMMARY_TRIGGER)return;
summarizing.add(user);
doSummarize(user).catch(e=>dbg('summ','erro',String(e))).finally(()=>summarizing.delete(user));
}
async function doSummarize(user){
if(dying)return;
const turns=getBotChatMemory(user);
if(turns.length<SUMMARY_TRIGGER)return;
const batch=turns.slice(0,SUMMARY_BATCH);
const remaining=turns.slice(SUMMARY_BATCH);
const existing=getBotChatSummary(user);
const batchText=batch.map(t=>'user: '+t.q+'\nassistant: '+t.a).join('\n');
const parts=[];
if(existing)parts.push('Resumo anterior:\n'+existing.text);
parts.push('Novos turnos a incorporar:\n'+batchText);
parts.push('Reescreva o resumo incorporando os novos turnos, mantendo o contexto essencial (quem é o usuário, o que já foi discutido, tom, preferências). Máximo 250 palavras. Responda só o resumo.');
const text=await rawGroq([{role:'user',content:parts.join('\n\n')}],SUMMARY_MAX_TOKENS,0.3);
if(!text||dying)return;
setBotChatSummary(user,text);
setBotChatMemoryTurns(user,remaining);
dbg('summ','ok','user='+user,'antes='+turns.length,'depois='+remaining.length);
}

// PROFILES
function loadProfiles(){UserStore.load();}
function saveProfiles(){UserStore.saveNow();}
function getUserProfile(user){
if(!settings.profileEnabled)return null;
const u=UserStore.peek(user);
if(!u||!u.profile)return null;
const p=u.profile;
if(!p.text&&!p.notes&&!(p.topics&&p.topics.length))return null;
return p;
}
function setUserProfile(user,text){
const cur=UserStore.peek(user)||{};
const prof=Object.assign({},cur.profile||{},{text,updatedAt:Date.now()});
UserStore.set(user,{profile:prof});
}
function clearUserProfile(user){
if(user){UserStore.set(user,{profile:{text:'',updatedAt:0,style:'',topics:[],dislikes:[],notes:'',confidence:0,at:0}});}
else{UserStore.load();for(const[n]of UserStore.map)UserStore.set(n,{profile:{text:'',updatedAt:0,style:'',topics:[],dislikes:[],notes:'',confidence:0,at:0}});}
}
function scheduleProfile(user){
if(!settings.profileEnabled||dying||!getActiveKey())return;
if(profileBuilding.has(user))return;
const turns=getBotChatMemory(user);
if(turns.length<PROFILE_MIN_TURNS)return;
const existing=getUserProfile(user);
if(existing&&existing.updatedAt&&Date.now()-existing.updatedAt<PROFILE_TTL_MS)return;
profileBuilding.add(user);
doBuildProfile(user).catch(e=>dbg('prof','erro',String(e))).finally(()=>profileBuilding.delete(user));
}
async function doBuildProfile(user){
if(dying)return;
const turns=getBotChatMemory(user).slice(-15);
if(turns.length<PROFILE_MIN_TURNS)return;
const text=turns.map(t=>'user: '+t.q+'\nassistant: '+t.a).join('\n');
const prompt='Analise as interações abaixo e escreva um mini-perfil do usuário em 1-2 frases. Foque em: tom de voz, temas preferidos, nível de formalidade, humor. Responda apenas o perfil.\n\n'+text;
const profile=await rawGroq([{role:'user',content:prompt}],120,0.5);
if(!profile||dying)return;
setUserProfile(user,profile);
dbg('prof','ok','user='+user,truncate(profile,80));
}

// TOPICS
function loadTopics(){if(roomTopics)return;roomTopics=new Map();try{const raw=localStorage.getItem(LS_PREFIX+'room_topics');if(!raw)return;const arr=JSON.parse(raw);if(!Array.isArray(arr))return;for(const it of arr){if(!it||!Array.isArray(it)||it.length!==2)continue;const k=it[0],d=it[1];if(!d||!Array.isArray(d.users))continue;roomTopics.set(k,{users:new Set(d.users),lastAt:d.lastAt||0});}}catch(e){roomTopics=new Map();}}
function saveTopics(){if(!roomTopics)return;try{const arr=Array.from(roomTopics.entries()).map(([k,v])=>[k,{users:Array.from(v.users),lastAt:v.lastAt}]);localStorage.setItem(LS_PREFIX+'room_topics',JSON.stringify(arr));}catch(e){}}
function updateRoomTopics(user,msg){
if(!settings.topicsEnabled)return;
loadTopics();
const kws=extractKeywords(msg,5);
if(!kws.length)return;
const now=Date.now();
for(const kw of kws){const e=roomTopics.get(kw)||{users:new Set(),lastAt:now};e.users.add(user);e.lastAt=now;roomTopics.set(kw,e);}
for(const[kw,e]of roomTopics){if(now-e.lastAt>TOPIC_TTL_MS)roomTopics.delete(kw);}
if(roomTopics.size>TOPIC_MAX){const sorted=Array.from(roomTopics.entries()).sort((a,b)=>a[1].lastAt-b[1].lastAt);for(let i=0;i<sorted.length-TOPIC_MAX+50;i++)roomTopics.delete(sorted[i][0]);}
saveTopics();
}
function findRelatedTopics(question,excludeUser){
if(!settings.topicsEnabled)return[];
loadTopics();
const kws=extractKeywords(question,5);
const out=[];
for(const kw of kws){const e=roomTopics.get(kw);if(!e)continue;const others=Array.from(e.users).filter(u=>!eqUser(u,excludeUser));if(others.length)out.push({kw,users:others});}
return out.slice(0,4);
}

// CACHE (semântico)
function cacheKey(q){const keys=extractKeywords(q,4).sort().join('|');const sig=keys||normStr(q).slice(0,40);return hashStr(sig+'|'+settings.personaKey+'|'+settings.model);}
function cacheGet(q){
if(!settings.cacheEnabled)return null;
const k=cacheKey(q);
const e=responseCache.get(k);
if(e&&Date.now()-e.at<=CACHE_TTL_MS)return e.text;
if(e)responseCache.delete(k);
const now=Date.now();
for(const[sk,sv]of responseCache){
if(now-sv.at>CACHE_TTL_MS){responseCache.delete(sk);continue;}
if(sv.tokens&&jaccard(sv.tokens,q)>=SEMANTIC_CACHE_THRESHOLD){
dbg('cache','semantic hit','sim='+jaccard(sv.tokens,q).toFixed(2));
return sv.text;
}
}
return null;
}
function cacheSet(q,text){
if(!settings.cacheEnabled)return;
const k=cacheKey(q);
responseCache.set(k,{text,at:Date.now(),tokens:q});
if(responseCache.size>CACHE_MAX){
const sorted=Array.from(responseCache.entries()).sort((a,b)=>a[1].at-b[1].at);
for(let i=0;i<sorted.length-CACHE_MAX+20;i++)responseCache.delete(sorted[i][0]);
}
}
function cacheClear(){responseCache.clear();}

// ROOM CONTEXT
function loadRoomContext(){try{const raw=localStorage.getItem(LS_PREFIX+'room_ctx');if(!raw)return;const arr=JSON.parse(raw);if(!Array.isArray(arr))return;const max=Math.max(settings.soloTurns||0,settings.botChatReadAllTurns||0,5);roomContext=arr.filter(m=>m&&m.user&&m.msg).slice(-max);}catch(e){roomContext=[];}}
function saveRoomContext(){try{localStorage.setItem(LS_PREFIX+'room_ctx',JSON.stringify(roomContext));}catch(e){}}
function currentRoomLimit(){if(settings.soloMode)return settings.soloTurns;if(settings.botChatMode&&settings.botChatReadAll)return settings.botChatReadAllTurns;return 100;}
function currentRoomDelay(){if(settings.soloMode)return settings.soloDelay;if(settings.botChatMode&&settings.botChatReadAll)return settings.botChatReadAllDelay;return DEFAULT_READALL_DELAY;}
function scheduleRoomFlush(){if(roomFlushTimer||dying)return;if(roomBuffer.length>=ROOM_BUFFER_MAX){flushRoomBuffer();return;}roomFlushTimer=setTimeout(flushRoomBuffer,currentRoomDelay());}
function flushRoomBuffer(){if(roomFlushTimer){clearTimeout(roomFlushTimer);roomFlushTimer=null;}if(!roomBuffer.length)return;const now=Date.now();for(const it of roomBuffer)roomContext.push({user:it.user,msg:it.msg,t:now});roomBuffer=[];const max=currentRoomLimit();if(roomContext.length>max)roomContext=roomContext.slice(-max);saveRoomContext();refreshToggle();dbg('room','flush','ctx='+roomContext.length);}
function pushRoomMessage(user,msg){roomBuffer.push({user,msg,t:Date.now()});scheduleRoomFlush();}
function clearRoomContext(){roomContext=[];roomBuffer=[];if(roomFlushTimer){clearTimeout(roomFlushTimer);roomFlushTimer=null;}saveRoomContext();refreshToggle();}
function roomContextSummary(){return{total:roomContext.length,users:uniqUsers(roomContext)};}

// CAPTURE
function extractUser(content){
for(const s of USER_SELECTORS){try{const el=content.querySelector(s);if(!el)continue;const t=(el.textContent||'').trim();if(!t||t.length>40)continue;const full=(content.innerText||content.textContent||'').trim();if(t===full)continue;if(t.toLowerCase().includes((settings.trigger||'/bot').toLowerCase()))continue;return{user:t};}catch(e){}}
for(const el of content.querySelectorAll('b, strong, span')){const t=(el.textContent||'').trim();if(!t||t.length>30)continue;if(/[.!?]/.test(t))continue;const full=(content.innerText||content.textContent||'').trim();if(t===full)continue;if(t.toLowerCase().includes((settings.trigger||'/bot').toLowerCase()))continue;return{user:t};}
const full=(content.innerText||content.textContent||'').trim();
const m=full.match(/^([^\s:]{1,30})\s*[:\-–—]\s*/);
if(m)return{user:m[1]};
return null;
}
function cleanMsg(full,user){let msg=full;if(user&&msg.startsWith(user))msg=msg.slice(user.length);msg=msg.replace(/^\s*[\s:>|·•\-–—]+/,'').replace(/^(diz|disse|says|said|falou|fala)\s*[:\-]\s*/i,'').replace(/^\[[^\]]{1,20}\]\s*/,'').trim();return msg;}
function extract(bubble){const content=bubble.querySelector(SEL_PRIMARY);if(!content)return null;const u=extractUser(content);if(!u||!u.user)return null;const full=(content.innerText||content.textContent||'').trim();const msg=cleanMsg(full,u.user);return{user:u.user,msg,full};}
function pushRow(data){rows.push({user:data.user,msg:data.msg,t:ts()});if(rows.length>MAX_ROWS)rows.shift();}
function bubbleKey(data,bubble){return normStr(data.user)+'|'+normStr(data.msg)+'|'+(bubble.className||'');}
function processBubble(bubble){
if(!bubble||bubble.nodeType!==1)return;
const data=extract(bubble);
if(!data||!data.user){dbg('miss','sem user',bubble.className);return;}
if(!data.msg){dbg('miss','sem msg','user='+data.user);return;}
const k=bubbleKey(data,bubble);
if(seenKeys.has(k))return;
seenKeys.add(k);
if(seenKeys.size>SEEN_KEYS_MAX)seenKeys.clear();
dbg('capture','user='+data.user,'msg='+truncate(data.msg,80));
if(captureSeen(data.user,data.msg)){dbg('capture','dup skipped');return;}
if(isEcho(data.user,data.msg)){dbg('echo','ignorado','user='+data.user);return;}
pushRow(data);
handleIncoming(data);
}
function isEcho(user,msg){
const now=Date.now();
const nm=normStr(msg);
for(const[k,t]of sentEchos){
if(now-t>ECHO_TTL)continue;
if(normStr(k)===nm)return true;
if(k.length>5&&msg.length>5&&jaccard(k,msg)>=ECHO_SIM)return true;
}
return false;
}
function rememberSent(text){sentEchos.set(text,Date.now());const now=Date.now();for(const[k,t]of sentEchos){if(now-t>ECHO_TTL)sentEchos.delete(k);}}

// TRIGGER
function matchTrigger(msg){
if(!settings.enabled)return null;
const trg=(settings.trigger||'/bot').trim();
if(!trg)return null;
const e=trg.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const re=new RegExp('(?:^|[\\s:>\\-–—])('+e+')\\s+(.+)$','i');
const m=msg.match(re);
if(!m)return null;
const q=(m[2]||'').trim();
return q||null;
}

// COMMANDS
const COMMAND_LIST=['reset','status','silence','help'];
function parseCommand(msg){
const trg=(settings.trigger||'/bot').trim();
if(!trg)return null;
const e=trg.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const re=new RegExp('^\\s*'+e+'\\s+([a-zA-Z]+)(?:\\s+([\\s\\S]*))?\\s*$');
const m=msg.match(re);
if(!m)return null;
const cmd=m[1].toLowerCase();
if(COMMAND_LIST.indexOf(cmd)===-1)return null;
return{cmd,args:(m[2]||'').trim()};
}
async function handleCommand(user,cmd,args){
dbg('cmd',cmd,'user='+user);
if(cmd==='reset'){
clearBotChatMemory(user);clearBotChatSummary(user);clearMemory(user);
await sendToChatVerified('@'+user+' ok, esqueci nossa conversa');
addLog({t:ts(),user,q:'/bot reset',r:'memória apagada',status:'ok',info:'comando'});
return true;
}
if(cmd==='status'){
const s=stats;
const txt='req '+s.requests+' · ok '+s.ok+' · fail '+s.fail+' · cache '+s.cacheHits+' · tok '+s.tokens;
await sendToChatVerified('@'+user+' '+txt);
addLog({t:ts(),user,q:'/bot status',r:txt,status:'ok',info:'comando'});
return true;
}
if(cmd==='silence'){
const min=Math.max(0,Math.min(SILENCE_MAX_MIN,parseInt(args,10)||0));
if(!min){silencedUntil=0;await sendToChatVerified('@'+user+' silêncio desligado');}
else{silencedUntil=Date.now()+min*60*1000;await sendToChatVerified('@'+user+' silêncio por '+min+'min');}
addLog({t:ts(),user,q:'/bot silence '+args,r:min?min+'min':'off',status:'ok',info:'comando'});
return true;
}
if(cmd==='help'){
await sendToChatVerified('@'+user+' comandos: reset · status · silence <min> · help');
addLog({t:ts(),user,q:'/bot help',r:'listado',status:'ok',info:'comando'});
return true;
}
return false;
}

// INCOMING
function handleIncoming({user,msg}){
if(!settings.enabled)return;
const trimmed=msg.trim();
if(!trimmed)return;
if(settings.soloMode&&isBlacklisted(user)){dbg('solo','blacklisted','user='+user);return;}
const cmd=parseCommand(trimmed);
if(cmd){handleCommand(user,cmd.cmd,cmd.args);return;}
if(silencedUntil&&Date.now()<silencedUntil){dbg('silence','skip','user='+user);return;}
let question=null,source=null;
if(settings.soloMode){
pushRoomMessage(user,trimmed);flushRoomBuffer();
updateRoomTopics(user,trimmed);
question=trimmed;source='solo';
dbg('solo','user='+user,'q='+truncate(question,60));
}else if(settings.botChatMode&&eqUser(user,settings.botChatUser)){
if(settings.botChatReadAll)flushRoomBuffer();
question=trimmed;source='botchat';
dbg('botchat','user='+user,'q='+truncate(question,60));
}else if(settings.botChatMode&&settings.botChatReadAll){
pushRoomMessage(user,trimmed);return;
}else{
question=matchTrigger(msg);
if(!question){if(msg.toLowerCase().includes((settings.trigger||'/bot').toLowerCase()))dbg('trigger','sem pergunta');return;}
source='trigger';
dbg('trigger','casa','user='+user,'q='+truncate(question,60));
}
if(!getActiveKey()){addLog({t:ts(),user,q:question,r:'—',status:'no-key',info:'nenhuma key disponível'});updateStats();return;}
const now=Date.now();
const userCd=settings.soloMode?SOLO_USER_COOLDOWN_MS:PER_USER_COOLDOWN_MS;
const last=lastUserAt.get(user)||0;
if(now-last<userCd){dbg('cooldown','user='+user);addLog({t:ts(),user,q:question,r:'—',status:'skip',info:'cooldown por user'});updateStats();return;}
const globalCd=settings.soloMode?SOLO_GLOBAL_COOLDOWN_MS:GLOBAL_COOLDOWN_MS;
if(now-lastGlobalReplyAt<globalCd&&queue.length>=2){dbg('cooldown','global');addLog({t:ts(),user,q:question,r:'—',status:'skip',info:'cooldown global'});updateStats();return;}
lastUserAt.set(user,now);
if(queue.length>=MAX_QUEUE){addLog({t:ts(),user,q:question,r:'—',status:'skip',info:'fila cheia'});updateStats();return;}
enqueueJob({user,question,t:ts(),source,_ts:Date.now()});
updateQueue();
processQueue();
}

// QUEUE — prioritária
function enqueueJob(job){
const prio=job.source==='trigger'?0:job.source==='botchat'?1:2;
let idx=queue.length;
for(let i=0;i<queue.length;i++){
const p=queue[i].source==='trigger'?0:queue[i].source==='botchat'?1:2;
if(prio<p){idx=i;break;}
}
queue.splice(idx,0,job);
}
function normalizeForCoalesce(q){const keys=extractKeywords(q,5).sort().join('|');return keys||normStr(q).slice(0,60);}

async function processQueue(){
if(processing||dying)return;
if(!queue.length)return;
processing=true;updateDot();
const job=queue.shift();

const sig=normalizeForCoalesce(job.question);
const now=Date.now();
const group=[job];
for(let i=queue.length-1;i>=0;i--){
const other=queue[i];
if(now-(other._ts||now)>COALESCE_WINDOW_MS)continue;
if(normalizeForCoalesce(other.question)===sig){
group.push(other);
queue.splice(i,1);
}
}
if(group.length>1){stats.coalesced+=(group.length-1);dbg('coalesce','group='+group.length);}
updateQueue();

try{
if(shouldSkip(job.user,job.question)){
stats.skips++;
dbg('human','skip','user='+job.user);
for(const g of group){
addLog({t:g.t,user:g.user,q:g.question,r:'—',status:'skip',info:'modo humano: skip'});
stats.requests++;
}
updateStats();
}else{
const reply=await callGroq(job.question,job.user,job.source);
if(reply&&!dying){
for(const g of group){
if(g.source==='botchat'||g.source==='solo'){
pushBotChatMemory(g.user,g.question,reply);
scheduleSummarization(g.user);
scheduleProfile(g.user);
}else if(settings.memoryEnabled){
pushMemory(g.user,g.question,reply);
}
let finalReply=reply;
if(settings.humanMode){
const react=maybeReaction(g.question);
if(react){finalReply=react;dbg('human','reaction',react);}
else{
const ask=maybeAskBack(g.question);
if(ask){finalReply=ask;dbg('human','askBack',ask);}
else{
finalReply=applyHumanFilters(reply);
finalReply=applyNoPunct(finalReply);
finalReply=maybeTypo(finalReply);
}
}
}
const text=settings.prefixReply?('@'+g.user+' '+finalReply):finalReply;
const chunks=splitHuman(text);
let allOk=true,reason='';
if(settings.humanMode){
const rd=readDelayFor(g.question);
if(rd>0)await sleep(rd);
}
for(let i=0;i<chunks.length;i++){
if(i>0){
const d=settings.humanMode?humanDelayFor(chunks[i-1]):CHUNK_GAP_MS;
await sleep(d);
}
if(dying)break;
const res=await sendToChatVerified(chunks[i]);
if(res.ok)rememberSent(chunks[i]);else{allOk=false;reason=res.reason;}
}
const info=[];
if(!allOk)info.push(reason||'falha no envio');
else if(chunks.length>1)info.push('enviado em '+chunks.length+' blocos');
if(group.length>1)info.push('coalesced '+group.length);
if(settings.humanMode)info.push('humano');
if(g.source==='solo')info.push('solo');
else if(g.source==='botchat')info.push('conversa');
addLog({t:g.t,user:g.user,q:g.question,r:finalReply,status:allOk?'ok':'send-fail',info:info.join(' · ')||undefined});
stats.requests++;
if(allOk){stats.ok++;lastGlobalReplyAt=Date.now();}else stats.fail++;
}
}
}
}catch(e){
for(const g of group){
addLog({t:g.t,user:g.user,q:g.question,r:'—',status:'error',info:String(e.message||e)});
stats.requests++;stats.fail++;
}
}
processing=false;updateStats();
if(queue.length&&!dying)setTimeout(processQueue,settings.cooldownMs);
}

// RAW GROQ
async function rawGroq(messages,maxTokens,temperature){
if(dying)return null;
const k=getActiveKey();
if(!k)return null;
if(!cbCheck())return null;
const ctrl=new AbortController();
const timer=setTimeout(()=>ctrl.abort(),REQ_TIMEOUT);
try{
const body={model:settings.model,messages,temperature:typeof temperature==='number'?temperature:0.4,max_tokens:maxTokens,top_p:0.9};
if(settings.reasoningEffort&&settings.reasoningEffort!=='default')body.reasoning_effort=settings.reasoningEffort;
const res=await fetch(GROQ_URL,{method:'POST',headers:{'Authorization':'Bearer '+k.key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});
clearTimeout(timer);
if(!res.ok){cbFail();return null;}
const data=await res.json().catch(()=>({}));
if(data?.usage?.total_tokens){stats.tokens+=data.usage.total_tokens;addKeyUsage(k,data.usage.total_tokens);}
const c=data?.choices?.[0]?.message?.content;
cbSuccess();
return c?stripReasoningLeak(String(c).trim()):null;
}catch(e){clearTimeout(timer);cbFail();return null;}
}

// GROQ principal
async function callGroq(question,user,source){
if(!question)return null;
if(!cbCheck())throw new Error('circuit breaker aberto');
const cached=cacheGet(question);
if(cached){stats.cacheHits++;dbg('cache','hit',truncate(question,50));updateStats();return cached;}
const messages=[{role:'system',content:settings.systemPrompt}];
const uctx=UserStore.buildContext(user,question);
if(uctx)messages.push({role:'system',content:'[user] '+uctx});
const profile=getUserProfile(user);
if(profile&&profile.text&&(!uctx||uctx.indexOf(profile.text)===-1)){
messages.push({role:'system',content:'[Perfil] '+profile.text});
}
if(source==='solo'&&roomContext.length){
const filtered=roomContext.filter(m=>{if(m.user===user&&m.msg===question)return false;if(isBlacklisted(m.user))return false;return true;}).slice(-ROOM_CTX_SEND_MAX);
if(filtered.length){const lines=filtered.map(m=>m.user+': '+m.msg).join('\n');messages.push({role:'system',content:'sala: '+lines+'\n\nUse para entender o contexto geral. Foque na mensagem dirigida a você.'});}
}
if(source==='solo'){
const related=findRelatedTopics(question,user);
if(related.length){const lines=related.map(r=>'"'+r.kw+'" ('+r.users.join(', ')+')').join(', ');messages.push({role:'system',content:'[topicos] '+lines});}
}
if(source==='botchat'&&settings.botChatReadAll&&roomContext.length){
const filtered=roomContext.filter(m=>!(m.user===user&&m.msg===question)).slice(-ROOM_CTX_SEND_MAX);
if(filtered.length){const lines=filtered.map(m=>m.user+': '+m.msg).join('\n');messages.push({role:'system',content:'sala: '+lines});}
}
const summary=getBotChatSummary(user);
if(summary&&(source==='solo'||source==='botchat'))messages.push({role:'system',content:'[Resumo] '+summary.text});
const u=UserStore.peek(user);
if(u&&Array.isArray(u.recent)&&u.recent.length){
const tail=compressToAnchors(u.recent).slice(-4);
for(const t of tail){messages.push({role:'user',content:t.q});messages.push({role:'assistant',content:t.a});}
} else if(user&&source==='trigger'&&settings.memoryEnabled){
const hist=getMemory(user);
for(const t of hist){messages.push({role:'user',content:t.q});messages.push({role:'assistant',content:t.a});}
}
messages.push({role:'user',content:question});

let total=0;for(const m of messages)total+=approxTokens(m.content);
if(total>BUDGET_INPUT_TOKENS){
const trimmed=[];
let running=0;
for(let i=messages.length-1;i>=0;i--){
const tk=approxTokens(messages[i].content);
if(running+tk>BUDGET_INPUT_TOKENS&&i>0&&i<messages.length-1)break;
trimmed.unshift(messages[i]);
running+=tk;
}
while(trimmed.length)messages.splice(0,1),messages.pop();
for(const m of trimmed)messages.push(m);
stats.anchors++;
dbg('budget','cortou','antes='+total,'depois='+approxTokens(messages.map(m=>m.content).join(' ')));
}

let temp=settings.temperature;
if(settings.humanMode){
const{tone,intensity}=detectTone(question);
const cfg=settings.humanConfig;
if(tone==='angry')temp=Math.max(0,temp+cfg.tempAngry*intensity);
else if(tone==='happy')temp=Math.min(2,temp+cfg.tempHappy*intensity);
else if(tone==='curious')temp=Math.min(2,temp+cfg.tempCurious);
}

const qLen=String(question||'').length;
let adaptiveMax=settings.maxTokens;
if(qLen<ADAPTIVE_SMALL)adaptiveMax=Math.min(adaptiveMax,150);
else if(qLen<ADAPTIVE_MED)adaptiveMax=Math.min(adaptiveMax,200);
else if(qLen<ADAPTIVE_LARGE)adaptiveMax=Math.min(adaptiveMax,300);

const body={model:settings.model,messages,temperature:temp,max_tokens:adaptiveMax,top_p:0.9};
if(settings.reasoningEffort&&settings.reasoningEffort!=='default')body.reasoning_effort=settings.reasoningEffort;
let lastErr=null;
let activeKey=getActiveKey();
if(!activeKey)throw new Error('sem API keys disponíveis');
const maxAttempts=REQ_RETRIES+Math.max(1,settings.apiKeys.length);
for(let attempt=0;attempt<=maxAttempts;attempt++){
if(dying)throw new Error('dying');
const ctrl=new AbortController();
const jobId=++abortSeq;
activeAborts.set(jobId,ctrl);
const timer=setTimeout(()=>ctrl.abort(),REQ_TIMEOUT);
try{
const res=await fetch(GROQ_URL,{method:'POST',headers:{'Authorization':'Bearer '+activeKey.key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});
clearTimeout(timer);
const data=await res.json().catch(()=>({}));
if(!res.ok){
const msg=data?.error?.message||('HTTP '+res.status);
if(res.status===429){
const retryAfter=parseInt(res.headers.get('retry-after')||'0',10);
const isDaily=/daily|per[- ]day|day limit|quota/i.test(String(msg))||retryAfter>3600;
const other=settings.apiKeys.find(k=>k.key!==activeKey.key&&keyUsable(k,Date.now()));
if(other){
if(isDaily){activeKey.cooldownUntil=activeKey.resetAt||nextUtcMidnight();dbg('key','limite diário','…'+activeKey.key.slice(-6));}
else{activeKey.cooldownUntil=Date.now()+Math.max(60000,retryAfter*1000);dbg('key','rate limit','…'+activeKey.key.slice(-6));}
persistKeys();
dbg('key','rotacionando','para …'+other.key.slice(-6));
activeKey=other;
continue;
}
if(!isDaily&&retryAfter>0&&retryAfter<=120&&attempt<maxAttempts){stats.retries++;dbg('retry','aguardando '+retryAfter+'s');await sleep(retryAfter*1000);continue;}
if(isDaily){activeKey.cooldownUntil=activeKey.resetAt||nextUtcMidnight();persistKeys();}
cbFail();
throw new Error('todas as keys esgotadas: '+msg);
}
if(res.status>=500&&attempt<maxAttempts){stats.retries++;dbg('retry','status='+res.status);await sleep(RETRY_DELAY_MS*(attempt+1));continue;}
cbFail();
throw new Error(msg);
}
if(data?.usage?.total_tokens){stats.tokens+=data.usage.total_tokens;addKeyUsage(activeKey,data.usage.total_tokens);}
const choice=(data?.choices&&data.choices[0])||{};
const finish=choice.finish_reason||'?';
const m=choice.message||{};
let content=m.content;
const reasoning=m.reasoning||m.reasoning_content||m.reasoning_details;
const refusal=m.refusal;
const toolCalls=m.tool_calls;
if(toolCalls&&toolCalls.length){dbg('warn','tool_calls','count='+toolCalls.length);if(!content||!String(content).trim())throw new Error('modelo pediu tool_calls');}
if(!content||!String(content).trim()){
if(refusal){stats.empty++;dbg('empty','refusal');cbFail();throw new Error('modelo recusou responder');}
if(reasoning&&String(reasoning).trim()){
stats.empty++;dbg('empty','usando reasoning');
const cleaned=stripReasoningLeak(String(reasoning));
const out=truncate(stripMd(cleaned),REPLY_CHAR_LIMIT);
cacheSet(question,out);
cbSuccess();
return out;
}
if(finish==='length'){stats.empty++;dbg('empty','tokens esgotados');cbFail();throw new Error('resposta vazia — tokens esgotados.');}
if(finish==='content_filter'){stats.empty++;stats.filtered++;dbg('empty','content_filter');cbFail();throw new Error('bloqueado pelo filtro');}
stats.empty++;dbg('empty','sem content','finish='+finish);cbFail();throw new Error('resposta vazia (finish: '+finish+')');
}
if(finish==='length')dbg('warn','resposta truncada por length');
content=stripReasoningLeak(String(content));
const out=truncate(stripMd(content),REPLY_CHAR_LIMIT);
cacheSet(question,out);
cbSuccess();
return out;
}catch(e){
clearTimeout(timer);
lastErr=e;
if(attempt<maxAttempts&&(e.name==='AbortError'||/network|fetch/i.test(String(e)))){stats.retries++;dbg('retry','erro de rede');await sleep(RETRY_DELAY_MS*(attempt+1));continue;}
throw e;
}finally{activeAborts.delete(jobId);}
}
throw lastErr||new Error('falha desconhecida');
}

// SEND
const INPUT_SELECTORS=['input.chat-input','textarea.chat-input','.chat-input input','.chat-input textarea','input[placeholder*="mensagem" i]','input[placeholder*="escreva" i]','input[placeholder*="diga" i]','div[class*="chat" i] input','div[class*="chat" i] textarea','form[class*="chat" i] input','form[class*="chat" i] textarea'];
let detectedInputSel=null;
function findChatInput(){for(const s of INPUT_SELECTORS){try{const el=document.querySelector(s);if(el&&el.offsetParent!==null){detectedInputSel=s;return el;}}catch(e){}}detectedInputSel=null;return null;}
function setNativeValue(el,value){const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(el,value);else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
function pressEnter(el){const opts={key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true};el.dispatchEvent(new KeyboardEvent('keydown',opts));el.dispatchEvent(new KeyboardEvent('keypress',opts));el.dispatchEvent(new KeyboardEvent('keyup',opts));}
async function sendToChatVerified(text){
const input=findChatInput();
if(!input){dbg('send','input não encontrado');return{ok:false,reason:'input de chat não encontrado'};}
try{input.focus();}catch(e){}
setNativeValue(input,text);
await sleep(30);
pressEnter(input);
await sleep(SEND_VERIFY_MS);
if(!input.value||input.value.trim()===''){dbg('send','ok via Enter');return{ok:true};}
const form=input.closest('form');
if(form){form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await sleep(SEND_RETRY_MS);}
if(!input.value||input.value.trim()===''){dbg('send','ok via form');return{ok:true};}
setNativeValue(input,'');
dbg('send','FALHA — input não limpou');
return{ok:false,reason:'input não limpou após envio'};
}

// UI
let ui={};

function buildStyle(){
return `
*{box-sizing:border-box;margin:0;padding:0}
.panel{position:relative;width:520px;max-height:88vh;display:flex;flex-direction:column;
background:linear-gradient(175deg,rgba(20,20,28,.94),rgba(9,9,14,.98));
backdrop-filter:blur(18px) saturate(140%);
border:1px solid rgba(255,255,255,.08);border-radius:16px;
box-shadow:0 20px 50px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);
color:#f1f2f8;font-size:12px;overflow:hidden;transition:max-height .22s ease,width .22s ease;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.panel.collapsed{width:260px;max-height:50px}
.panel.collapsed .body,.panel.collapsed .foot,.panel.collapsed .tabs{display:none}
.panel button:focus-visible,.panel input:focus-visible,.panel textarea:focus-visible,.panel select:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}
.head{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;cursor:grab;flex-shrink:0;user-select:none;
background:linear-gradient(120deg,rgba(34,211,238,.14),rgba(167,139,250,.14));
border-bottom:1px solid rgba(255,255,255,.06)}
.head:active{cursor:grabbing}
.brand{display:flex;align-items:center;gap:9px;min-width:0}
.dot{width:8px;height:8px;border-radius:50%;background:#5b5f70;flex-shrink:0;transition:all .2s}
.dot.on{background:#34d399;box-shadow:0 0 8px rgba(52,211,153,.8)}
.dot.busy{background:#fbbf24;box-shadow:0 0 8px rgba(251,191,36,.9);animation:pulse 1s infinite}
.dot.chat{background:#a78bfa;box-shadow:0 0 8px rgba(167,139,250,.9)}
.dot.solo{background:#fbbf24;box-shadow:0 0 8px rgba(251,191,36,.9);animation:pulse 1.4s infinite}
.dot.room{background:#f472b6;box-shadow:0 0 8px rgba(244,114,182,.9);animation:pulse 1.6s infinite}
.dot.human{background:#22d3ee;box-shadow:0 0 10px rgba(34,211,238,.95);animation:pulse 1.2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.title{font-weight:800;font-size:11.5px;letter-spacing:.08em;
background:linear-gradient(100deg,#22d3ee,#a78bfa,#fff,#a78bfa,#22d3ee);
background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
animation:shine 3.2s linear infinite;white-space:nowrap}
@keyframes shine{to{background-position:-200% center}}
.actions{display:flex;gap:5px;flex-shrink:0}
.btn{min-width:24px;height:24px;padding:0 7px;border-radius:7px;
background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
color:#c7cad6;cursor:pointer;font-size:11px;line-height:1;
display:flex;align-items:center;justify-content:center;font-family:inherit;transition:all .16s}
.btn:hover{color:#0b0b10;background:linear-gradient(120deg,#22d3ee,#a78bfa);border-color:transparent}
.btn.on{background:linear-gradient(120deg,#22d3ee,#a78bfa);color:#0b0b10;border-color:transparent}
.tabs{display:flex;gap:4px;padding:0 12px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)}
.tab{flex:1;text-align:center;padding:9px 4px 10px;font-size:10px;font-weight:800;
letter-spacing:.05em;text-transform:uppercase;color:#8b8fa3;
background:transparent;border:none;cursor:pointer;position:relative;font-family:inherit}
.tab.active{color:#fff}
.tab.active::after{content:'';position:absolute;left:14px;right:14px;bottom:-1px;height:2px;
background:linear-gradient(120deg,#22d3ee,#a78bfa);border-radius:2px}
.body{flex:1;overflow-y:auto;min-height:0;padding:12px;display:flex;flex-direction:column;gap:12px}
.body::-webkit-scrollbar{width:5px}
.body::-webkit-scrollbar-thumb{background:linear-gradient(#22d3ee,#a78bfa);border-radius:3px}
.sec{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);border-radius:11px;padding:11px 13px}
.sec-label{font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8b8fa3;margin-bottom:9px}
.sec-group{display:flex;flex-direction:column;gap:8px}
.sec-title{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6b6f82;margin:2px 0 -2px;padding-left:2px}
.sec-title .num{width:16px;height:16px;border-radius:5px;background:rgba(255,255,255,.06);color:#c7cad6;font-size:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sec-title::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.06)}
label.f{display:block;font-size:9.5px;color:#8b8fa3;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:5px}
.inp{width:100%;padding:9px 11px;border-radius:8px;background:rgba(255,255,255,.04);
border:1px solid rgba(255,255,255,.1);color:#f1f2f8;font-size:12px;outline:none;
font-family:inherit;transition:border-color .15s}
.inp:focus{border-color:rgba(34,211,238,.6);box-shadow:0 0 0 3px rgba(34,211,238,.12)}
.inp:disabled{opacity:.55;cursor:not-allowed}
textarea.inp{resize:vertical;min-height:90px;line-height:1.5;font-size:11.5px}
textarea.inp.tall{min-height:60px}
select.inp{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238b8fa3' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:30px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.toggle{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;
border-radius:11px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);cursor:pointer}
.toggle.on{border-color:rgba(52,211,153,.35);background:rgba(52,211,153,.06)}
.toggle.violet.on{border-color:rgba(167,139,250,.4);background:rgba(167,139,250,.08)}
.toggle.pink.on{border-color:rgba(244,114,182,.4);background:rgba(244,114,182,.08)}
.toggle.amber.on{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.08);box-shadow:0 0 12px rgba(251,191,36,.12)}
.toggle.cyan.on{border-color:rgba(34,211,238,.55);background:rgba(34,211,238,.1);box-shadow:0 0 14px rgba(34,211,238,.18)}
.toggle .switch{pointer-events:none}
.switch{position:relative;width:42px;height:22px;border-radius:22px;
background:rgba(255,255,255,.08);transition:all .2s;flex:0 0 auto;
border:1px solid rgba(255,255,255,.1)}
.switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
background:#8b8fa3;transition:all .2s}
.switch.on{background:linear-gradient(120deg,#22d3ee,#a78bfa);border-color:transparent}
.switch.on::after{left:22px;background:#fff}
.switch.pink.on{background:linear-gradient(120deg,#f472b6,#a78bfa)}
.switch.amber.on{background:linear-gradient(120deg,#fbbf24,#f472b6)}
.switch.cyan.on{background:linear-gradient(120deg,#22d3ee,#34d399)}
.presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.preset{padding:6px 11px;border-radius:8px;cursor:pointer;font-family:inherit;
font-size:10.5px;font-weight:700;letter-spacing:.03em;
background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
color:#c7cad6;transition:all .15s}
.preset:hover{background:rgba(255,255,255,.08)}
.preset.active{background:linear-gradient(120deg,#22d3ee,#a78bfa);color:#0b0b10;border-color:transparent}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(52px,1fr));gap:6px;margin-top:8px}
.stat-cell{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:9px;padding:8px;text-align:center}
.stat-v{font-size:12.5px;font-weight:800;color:#22d3ee;font-variant-numeric:tabular-nums}
.stat-v.warn{color:#fbbf24}
.stat-v.err{color:#fb7185}
.stat-v.pink{color:#f472b6}
.stat-v.cyan{color:#34d399}
.stat-l{font-size:8px;color:#8b8fa3;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.diag{display:flex;align-items:center;justify-content:space-between;gap:8px;
margin-top:10px;padding-top:9px;border-top:1px dashed rgba(255,255,255,.08);
font-size:10px;color:#8b8fa3}
.diag b{color:#c7cad6;font-weight:700}
.log-row{display:flex;flex-direction:column;gap:3px;padding:8px 10px;border-radius:8px;
background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.04);
font-size:10.5px;font-family:ui-monospace,SF Mono,Menlo,monospace}
.log-head{display:flex;justify-content:space-between;font-size:9px;color:#8b8fa3;gap:8px}
.log-user{color:#22d3ee;font-weight:700;font-size:11px;font-family:inherit}
.log-q{color:#c7cad6}
.log-r{color:#e5e7eb;font-family:inherit;font-size:11px;line-height:1.4;word-break:break-word}
.log-row.ok{border-color:rgba(52,211,153,.2)}
.log-row.fail{border-color:rgba(251,113,133,.25);background:rgba(251,113,133,.04)}
.log-row.capture{border-color:rgba(34,211,238,.2);background:rgba(34,211,238,.03);opacity:.85}
.log-row.chat{border-color:rgba(167,139,250,.25);background:rgba(167,139,250,.04)}
.log-row.solo{border-color:rgba(251,191,36,.28);background:rgba(251,191,36,.05)}
.log-row.room{border-color:rgba(244,114,182,.22);background:rgba(244,114,182,.03);opacity:.85}
.log-row.human{border-color:rgba(34,211,238,.35);background:rgba(34,211,238,.06)}
.log-row.skip{border-color:rgba(251,191,36,.2);background:rgba(251,191,36,.03);opacity:.85}
.log-tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:8.5px;font-weight:800;
letter-spacing:.05em;text-transform:uppercase;background:rgba(255,255,255,.06);color:#8b8fa3;margin-right:5px}
.log-tag.ok{background:rgba(52,211,153,.15);color:#a7f3d0}
.log-tag.fail{background:rgba(251,113,133,.15);color:#fca5b1}
.log-tag.capture{background:rgba(34,211,238,.15);color:#67e8f9}
.log-tag.chat{background:rgba(167,139,250,.18);color:#ddd6fe}
.log-tag.solo{background:rgba(251,191,36,.18);color:#fde68a}
.log-tag.room{background:rgba(244,114,182,.18);color:#fbcfe8}
.log-tag.human{background:rgba(34,211,238,.22);color:#a5f3fc}
.log-tag.skip{background:rgba(251,191,36,.15);color:#fde68a}
.empty{padding:30px 10px;text-align:center;color:#5b5f70;font-size:10.5px}
.foot{display:flex;justify-content:space-between;align-items:center;gap:8px;
padding:9px 14px;background:rgba(0,0,0,.22);
border-top:1px solid rgba(255,255,255,.05);
font-size:9.5px;color:#8b8fa3;flex-shrink:0}
.foot b{color:#c7cad6;font-weight:700}
.hint{font-size:9.5px;color:#8b8fa3;line-height:1.5;margin-top:6px}
.hint.warn{color:#fbbf24}
.hint.ok{color:#a7f3d0}
.hint.pink{color:#f472b6}
.hint.amber{color:#fbbf24}
.hint.cyan{color:#22d3ee}
.btn-primary{width:100%;padding:10px;border-radius:9px;cursor:pointer;font-family:inherit;
font-size:11px;font-weight:800;letter-spacing:.03em;
background:linear-gradient(120deg,#22d3ee,#a78bfa);color:#0b0b10;border:none;
transition:transform .15s,box-shadow .15s}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(34,211,238,.35)}
.btn-primary:active{transform:scale(.98)}
.btn-secondary{width:100%;padding:8px;border-radius:8px;cursor:pointer;font-family:inherit;
font-size:10.5px;font-weight:700;
background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
color:#c7cad6;transition:all .15s}
.btn-secondary:hover{background:rgba(255,255,255,.1)}
.sub-block{margin-top:10px;padding:10px 12px;border-radius:10px;
background:rgba(244,114,182,.04);border:1px solid rgba(244,114,182,.18)}
.sub-block.amber{background:rgba(251,191,36,.04);border-color:rgba(251,191,36,.2)}
.sub-block.cyan{background:rgba(34,211,238,.05);border-color:rgba(34,211,238,.22)}
.sub-block .grid2{margin-bottom:8px}
.sub-block .grid3{margin-bottom:8px}
.toast{position:absolute;left:50%;bottom:10px;transform:translate(-50%,8px);
opacity:0;pointer-events:none;z-index:5;
background:linear-gradient(120deg,#22d3ee,#a78bfa);color:#0b0b10;
font-weight:800;font-size:10.5px;padding:7px 14px;border-radius:20px;
white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.35);
transition:opacity .18s ease,transform .18s ease}
.toast.show{opacity:1;transform:translate(-50%,0)}
.badge-human{display:inline-block;padding:1px 7px;border-radius:10px;font-size:8.5px;font-weight:900;
letter-spacing:.08em;text-transform:uppercase;background:linear-gradient(120deg,#22d3ee,#34d399);
color:#0b0b10;margin-left:6px;animation:pulse 1.4s infinite}
`;
}

function buildHTML(){
return `
<div class="head" id="head">
<div class="brand">
<span class="dot" id="dot"></span>
<span class="title">SANG BOT · GROQ</span>
<span class="badge-human" id="badgeHuman" style="display:none;">HUMANO</span>
</div>
<div class="actions">
<button class="btn" id="btnMin" type="button" title="Minimizar">−</button>
</div>
</div>
<div class="tabs" role="tablist">
<button class="tab active" data-tab="bot" role="tab" aria-selected="true">Bot</button>
<button class="tab" data-tab="config" role="tab" aria-selected="false">Config</button>
<button class="tab" data-tab="log" role="tab" aria-selected="false">Log</button>
</div>
<div class="body" id="body">
<div class="view" data-view="bot">

<div class="sec-title"><span class="num">1</span>Ligar o bot</div>
<div class="sec-group">
<div class="toggle" id="toggleEnable" role="switch" tabindex="0" aria-checked="false">
<div>
<div style="font-weight:700;font-size:12px;color:#fff;">Bot ativo</div>
<div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;" id="personaLine">Nordestino Lerdão</div>
</div>
<div class="switch" id="switchEnable"></div>
</div>
<div class="toggle cyan" id="toggleHuman" role="switch" tabindex="0" aria-checked="false">
<div>
<div style="font-weight:700;font-size:12.5px;color:#fff;">Modo Humano</div>
<div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;" id="humanLine">Ritmo natural, reação curta, typo ocasional, ajuste de tom</div>
</div>
<div class="switch cyan" id="switchHuman"></div>
</div>
<div class="sub-block cyan" id="humanCfg" style="display:none;">
<div class="hint cyan">Afeta todos os modos abaixo. Desligado volta ao comportamento original.</div>
<div class="grid3" style="margin-top:8px;">
<div><label class="f">Skip solo %</label><input class="inp" id="inpHSkipSolo" type="number" min="0" max="50" step="1" /></div>
<div><label class="f">Skip chat %</label><input class="inp" id="inpHSkipChat" type="number" min="0" max="50" step="1" /></div>
<div><label class="f">Reação %</label><input class="inp" id="inpHReact" type="number" min="0" max="50" step="1" /></div>
<div><label class="f">Ask-back %</label><input class="inp" id="inpHAsk" type="number" min="0" max="50" step="1" /></div>
<div><label class="f">Typo %</label><input class="inp" id="inpHTypo" type="number" min="0" max="20" step="1" /></div>
<div><label class="f">No-pont %</label><input class="inp" id="inpHNoPunct" type="number" min="0" max="80" step="5" /></div>
<div><label class="f">Delay base ms</label><input class="inp" id="inpHDelayBase" type="number" min="200" max="5000" step="100" /></div>
<div><label class="f">Delay/char ms</label><input class="inp" id="inpHDelayChar" type="number" min="0" max="100" step="1" /></div>
<div><label class="f">Jitter ms</label><input class="inp" id="inpHJitter" type="number" min="0" max="5000" step="100" /></div>
</div>
<button class="btn-secondary" id="btnHumanReset" type="button">Restaurar padrões</button>
</div>
</div>

<div class="sec-title"><span class="num">2</span>Como o bot responde (escolha 1)</div>
<div class="sec-group">
<div class="hint" style="margin:0 2px;">Trigger (padrão): só responde quando alguém escreve o comando em Config. Solo OU Conversa de Bot — exclusivos entre si.</div>
<div class="toggle amber" id="toggleSolo" role="switch" tabindex="0" aria-checked="false">
<div>
<div style="font-weight:700;font-size:12px;color:#fff;">Modo Solo</div>
<div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;" id="soloLine">Bot lê tudo e responde todos</div>
</div>
<div class="switch amber" id="switchSolo"></div>
</div>
<div class="sub-block amber" id="soloCfg" style="display:none;">
<div class="grid2">
<div><label class="f">Delay (ms)</label><input class="inp" id="inpSoloDelay" type="number" min="200" max="10000" step="100" /></div>
<div><label class="f">Turnos da sala</label><input class="inp" id="inpSoloTurns" type="number" min="5" max="100" step="5" /></div>
</div>
<label class="f" style="margin-top:8px;">Excluir usernames</label>
<textarea class="inp tall" id="inpSoloBlacklist" spellcheck="false" placeholder="Um nome por linha (ou vírgula)"></textarea>
<div class="hint amber" id="soloBlacklistHint">Nenhum nome excluído.</div>
<div class="hint" style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
<span>Contexto: <b id="soloCtxInfo" style="color:#fde68a;">0 msgs · 0 users</b></span>
<button class="btn" id="btnClearSoloRoom" type="button" style="font-size:10px; padding:0 10px; height:22px;">Limpar contexto</button>
</div>
<div id="soloPreview" style="margin-top:10px; display:none;"></div>
</div>
<div class="toggle violet" id="toggleBotChat" role="switch" tabindex="0" aria-checked="false">
<div>
<div style="font-weight:700;font-size:12px;color:#fff;">Modo Conversa de Bot</div>
<div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;" id="botChatLine">User alvo: cariocaIA</div>
</div>
<div class="switch" id="switchBotChat"></div>
</div>
<div class="sec" id="botChatCfg" style="display:none;">
<div class="grid2">
<div><label class="f">User alvo</label><input class="inp" id="inpBotChatUser" type="text" placeholder="cariocaIA" spellcheck="false" autocomplete="off" /></div>
<div><label class="f">Turnos de contexto</label><input class="inp" id="inpBotChatTurns" type="number" min="5" max="200" step="5" /></div>
</div>
<div class="hint">Contexto persistente via UserStore.</div>
<div class="hint" style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
<span>Histórico: <b id="botChatHistInfo" style="color:#c7cad6;">0 turnos</b></span>
<button class="btn" id="btnClearBotChat" type="button" style="font-size:10px; padding:0 10px; height:22px;">Limpar histórico</button>
</div>
<div class="toggle pink" id="toggleReadAll" role="switch" tabindex="0" aria-checked="false" style="margin-top:12px;">
<div>
<div style="font-weight:700;font-size:12px;color:#fff;">Ler sala toda</div>
<div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;" id="readAllLine">Contexto de todos os usuários</div>
</div>
<div class="switch pink" id="switchReadAll"></div>
</div>
<div class="sub-block" id="readAllCfg" style="display:none;">
<div class="grid2">
<div><label class="f">Delay (ms)</label><input class="inp" id="inpReadAllDelay" type="number" min="200" max="10000" step="100" /></div>
<div><label class="f">Turnos da sala</label><input class="inp" id="inpReadAllTurns" type="number" min="5" max="100" step="5" /></div>
</div>
<div class="hint pink">Só o User alvo dispara. Os outros alimentam o contexto.</div>
<div class="hint" style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
<span>Contexto da sala: <b id="roomCtxInfo" style="color:#fbcfe8;">0 msgs · 0 users</b></span>
<button class="btn" id="btnClearRoom" type="button" style="font-size:10px; padding:0 10px; height:22px;">Limpar sala</button>
</div>
<div id="roomPreview" style="margin-top:10px; display:none;"></div>
</div>
</div>
</div>

<div class="sec-title"><span class="num">3</span>Memória e eficiência</div>
<div class="sec">
<div class="toggle cyan" id="toggleUserStore" role="switch" tabindex="0" aria-checked="true" style="margin-bottom:8px;">
<div><div style="font-weight:700;font-size:12px;color:#fff;">UserStore</div><div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;">Persistência por nickname (payload mínimo)</div></div>
<div class="switch cyan" id="switchUserStore"></div>
</div>
<div class="toggle cyan" id="toggleCache" role="switch" tabindex="0" aria-checked="true" style="margin-bottom:8px;">
<div><div style="font-weight:700;font-size:12px;color:#fff;">Cache semântico</div><div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;">Pega pergunta parecida, não só idêntica</div></div>
<div class="switch cyan" id="switchCache"></div>
</div>
<div class="toggle cyan" id="toggleSummaries" role="switch" tabindex="0" aria-checked="true" style="margin-bottom:8px;">
<div><div style="font-weight:700;font-size:12px;color:#fff;">Sumário progressivo</div><div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;">Comprime turnos antigos</div></div>
<div class="switch cyan" id="switchSummaries"></div>
</div>
<div class="toggle cyan" id="toggleProfile" role="switch" tabindex="0" aria-checked="true" style="margin-bottom:8px;">
<div><div style="font-weight:700;font-size:12px;color:#fff;">Perfil de usuário</div><div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;">Mini-perfil após 10 interações</div></div>
<div class="switch cyan" id="switchProfile"></div>
</div>
<div class="toggle cyan" id="toggleTopics" role="switch" tabindex="0" aria-checked="true" style="margin-bottom:8px;">
<div><div style="font-weight:700;font-size:12px;color:#fff;">Índice de tópicos</div><div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;">Rastreia quem falou sobre o quê</div></div>
<div class="switch cyan" id="switchTopics"></div>
</div>
<div class="toggle cyan" id="toggleAnchors" role="switch" tabindex="0" aria-checked="true" style="margin-bottom:8px;">
<div><div style="font-weight:700;font-size:12px;color:#fff;">Compressão em âncoras</div><div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;">Turnos antigos viram bullets de 1 linha</div></div>
<div class="switch cyan" id="switchAnchors"></div>
</div>
<div class="toggle cyan" id="toggleStripR" role="switch" tabindex="0" aria-checked="true">
<div><div style="font-weight:700;font-size:12px;color:#fff;">Anti-vazamento de pensamento</div><div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;">Remove reasoning que vaza no chat (THINK)</div></div>
<div class="switch cyan" id="switchStripR"></div>
</div>
<div class="hint" style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
<span>Users: <b id="usInfo" style="color:#a7f3d0;">0</b> · Cache: <b id="cacheInfo" style="color:#a7f3d0;">0</b> · Sum: <b id="summInfo" style="color:#a7f3d0;">0</b> · Perf: <b id="profInfo" style="color:#a7f3d0;">0</b></span>
<button class="btn" id="btnClearCache" type="button" style="font-size:10px; padding:0 10px; height:22px;">Limpar cache</button>
</div>
<div class="grid2" style="margin-top:8px;">
<button class="btn-secondary" id="btnUsExport" type="button">Exportar UserStore</button>
<button class="btn-secondary" id="btnUsClear" type="button">Apagar UserStore</button>
</div>
<div class="hint" style="margin-top:6px;"><input class="inp" id="inpUsNick" type="text" placeholder="nickname pra inspecionar" /></div>
<button class="btn-secondary" id="btnUsInspect" type="button" style="margin-top:6px;">Ver dados do nick</button>
<div id="usPreview" style="margin-top:10px;font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#c7cad6;max-height:200px;overflow-y:auto;"></div>
</div>

<div class="sec-title"><span class="num">4</span>Status e testes</div>
<div class="sec">
<div class="sec-label">Status</div>
<div class="stat-grid">
<div class="stat-cell"><div class="stat-v" id="stReq">0</div><div class="stat-l">Req</div></div>
<div class="stat-cell"><div class="stat-v" id="stOk">0</div><div class="stat-l">OK</div></div>
<div class="stat-cell"><div class="stat-v" id="stFail">0</div><div class="stat-l">Fail</div></div>
<div class="stat-cell"><div class="stat-v" id="stRetry">0</div><div class="stat-l">Retry</div></div>
<div class="stat-cell"><div class="stat-v warn" id="stEmpty">0</div><div class="stat-l">Vazias</div></div>
<div class="stat-cell"><div class="stat-v cyan" id="stCache">0</div><div class="stat-l">Cache</div></div>
<div class="stat-cell"><div class="stat-v warn" id="stSkip">0</div><div class="stat-l">Skip</div></div>
<div class="stat-cell"><div class="stat-v cyan" id="stCoa">0</div><div class="stat-l">Coal</div></div>
<div class="stat-cell"><div class="stat-v" id="stTok">0</div><div class="stat-l">Tokens</div></div>
</div>
<div class="hint" id="keyHint">—</div>
<div class="diag">
<span>Chat: <b id="chatDiagState">não verificado</b></span>
<button class="btn" id="btnCheckChat" type="button">Verificar</button>
</div>
</div>
<div class="sec">
<div class="sec-label">Testar</div>
<input class="inp" id="testInput" type="text" placeholder="pergunta + Enter..." />
<div class="hint">Chama Groq direto. Sem memória, sem fila, sem contexto.</div>
<div id="testOutput" style="margin-top:10px;"></div>
</div>
</div>
<div class="view" data-view="config" style="display:none;">
<div class="sec">
<div class="sec-label">API Keys · rotação automática</div>
<div id="keyList" style="display:flex;flex-direction:column;gap:6px;"></div>
<div style="display:flex;gap:6px;margin-top:10px;">
<input class="inp" id="inpNewKey" type="text" placeholder="Cole uma ou mais keys (gsk_...)" autocomplete="off" spellcheck="false" />
<button class="btn-secondary" id="btnAddKey" type="button" style="width:auto;padding:0 14px;flex-shrink:0;">Adicionar</button>
</div>
<div class="grid2" style="margin-top:10px;">
<div><label class="f">Limite diário / key</label><input class="inp" id="inpKeyLimit" type="number" min="1000" step="1000" /></div>
<div><label class="f">Modelo</label><input class="inp" type="text" value="GPT-OSS 120B" disabled /></div>
</div>
<div class="hint">Uso reseta automaticamente à meia-noite UTC (limites do Groq). Rotação automática ao esgotar.</div>
</div>
<div class="sec">
<div class="sec-label">Persona</div>
<div class="presets" id="presets"></div>
<label class="f">System prompt</label>
<textarea class="inp" id="inpPrompt" spellcheck="false"></textarea>
</div>
<div class="sec">
<div class="sec-label">Comportamento</div>
<div class="grid2">
<div><label class="f">Trigger</label><input class="inp" id="inpTrigger" type="text" spellcheck="false" /></div>
<div><label class="f">Cooldown (ms)</label><input class="inp" id="inpCooldown" type="number" min="0" step="100" /></div>
<div><label class="f">Temperature</label><input class="inp" id="inpTemp" type="number" min="0" max="2" step="0.1" /></div>
<div><label class="f">Max tokens</label><input class="inp" id="inpMaxTok" type="number" min="50" max="4000" step="50" /></div>
</div>
<label class="f" style="margin-top:10px;">Reasoning Effort</label>
<select class="inp" id="selReasoning">
<option value="low">Low (rápido, sem raciocínio exposto)</option>
<option value="medium">Medium (raciocínio interno — não vaza)</option>
<option value="high">High (raciocínio profundo — não vaza)</option>
</select>
<div class="hint">Trigger em qualquer posição da msg. Fila: ${MAX_QUEUE}. Comandos: reset · status · silence &lt;min&gt; · help.</div>
<div class="toggle" id="togglePrefix" role="switch" tabindex="0" aria-checked="true" style="margin-top:10px;">
<div><div style="font-weight:700;font-size:12px;color:#fff;">Prefixo @user</div><div style="font-size:9.5px;color:#8b8fa3;margin-top:2px;">Menciona quem perguntou</div></div>
<div class="switch" id="switchPrefix"></div>
</div>
</div>
<button class="btn-primary" id="btnSave" type="button">Salvar tudo</button>
</div>
<div class="view" data-view="log" style="display:none;">
<div class="sec" style="padding:9px 11px;">
<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
<div style="display:flex;align-items:center;gap:8px;">
<span class="sec-label" style="margin:0;">Histórico</span>
<button class="btn" id="btnDebugToggle" type="button" title="Log verboso">DBG</button>
</div>
<div style="display:flex;gap:6px;">
<button class="btn" id="btnClearLog" type="button">Limpar log</button>
<button class="btn" id="btnClearMemory" type="button">Limpar memória</button>
</div>
</div>
</div>
<div id="logList" style="display:flex;flex-direction:column;gap:5px;"></div>
</div>
</div>
<div class="foot">
<span id="footLeft">—</span>
<span><b id="footQueue">0</b> na fila</span>
</div>
<div class="toast" id="toast"></div>
`;
}

function buildHost(){
host=document.createElement('div');
host.id='_aibot_host';
host.setAttribute('data-hub','1');
host.setAttribute('data-sang-ui','');
host.style.cssText='all:initial;position:fixed;top:20px;right:20px;z-index:2147483647;';
document.documentElement.appendChild(host);
try{window._hubUI?.markProtected?.(host);}catch(e){}
shadow=host.attachShadow({mode:'open'});
const style=document.createElement('style');
style.textContent=buildStyle();
shadow.appendChild(style);
const panel=document.createElement('div');
panel.className='panel';
panel.innerHTML=buildHTML();
shadow.appendChild(panel);
const $=id=>shadow.getElementById(id);
ui.panel=panel;ui.dot=$('dot');ui.body=$('body');ui.head=$('head');ui.badgeHuman=$('badgeHuman');
ui.switchHuman=$('switchHuman');ui.toggleHuman=$('toggleHuman');ui.humanLine=$('humanLine');ui.humanCfg=$('humanCfg');
ui.inpHSkipSolo=$('inpHSkipSolo');ui.inpHSkipChat=$('inpHSkipChat');ui.inpHReact=$('inpHReact');ui.inpHAsk=$('inpHAsk');
ui.inpHTypo=$('inpHTypo');ui.inpHNoPunct=$('inpHNoPunct');ui.inpHDelayBase=$('inpHDelayBase');ui.inpHDelayChar=$('inpHDelayChar');ui.inpHJitter=$('inpHJitter');
ui.switchE=$('switchEnable');ui.toggleE=$('toggleEnable');
ui.switchSolo=$('switchSolo');ui.toggleSolo=$('toggleSolo');ui.soloLine=$('soloLine');ui.soloCfg=$('soloCfg');ui.soloCtxInfo=$('soloCtxInfo');ui.soloPreview=$('soloPreview');
ui.inpSoloDelay=$('inpSoloDelay');ui.inpSoloTurns=$('inpSoloTurns');ui.inpSoloBlacklist=$('inpSoloBlacklist');ui.soloBlacklistHint=$('soloBlacklistHint');
ui.switchBC=$('switchBotChat');ui.toggleBC=$('toggleBotChat');ui.botChatLine=$('botChatLine');ui.botChatCfg=$('botChatCfg');ui.botChatHistInfo=$('botChatHistInfo');
ui.inpBotChatUser=$('inpBotChatUser');ui.inpBotChatTurns=$('inpBotChatTurns');
ui.switchRA=$('switchReadAll');ui.toggleRA=$('toggleReadAll');ui.readAllLine=$('readAllLine');ui.readAllCfg=$('readAllCfg');
ui.inpReadAllDelay=$('inpReadAllDelay');ui.inpReadAllTurns=$('inpReadAllTurns');
ui.roomCtxInfo=$('roomCtxInfo');ui.roomPreview=$('roomPreview');
ui.switchUs=$('switchUserStore');ui.toggleUs=$('toggleUserStore');
ui.switchCache=$('switchCache');ui.toggleCache=$('toggleCache');
ui.switchSumm=$('switchSummaries');ui.toggleSumm=$('toggleSummaries');
ui.switchProf=$('switchProfile');ui.toggleProf=$('toggleProfile');
ui.switchTop=$('switchTopics');ui.toggleTop=$('toggleTopics');
ui.switchAnch=$('switchAnchors');ui.toggleAnch=$('toggleAnchors');
ui.switchStrip=$('switchStripR');ui.toggleStrip=$('toggleStripR');
ui.usInfo=$('usInfo');ui.cacheInfo=$('cacheInfo');ui.summInfo=$('summInfo');ui.profInfo=$('profInfo');
ui.usPreview=$('usPreview');ui.inpUsNick=$('inpUsNick');
ui.personaLine=$('personaLine');
ui.stReq=$('stReq');ui.stOk=$('stOk');ui.stFail=$('stFail');ui.stRetry=$('stRetry');ui.stEmpty=$('stEmpty');ui.stCache=$('stCache');ui.stSkip=$('stSkip');ui.stCoa=$('stCoa');ui.stTok=$('stTok');
ui.keyHint=$('keyHint');ui.chatDiagState=$('chatDiagState');
ui.keyList=$('keyList');ui.inpNewKey=$('inpNewKey');ui.btnAddKey=$('btnAddKey');ui.inpKeyLimit=$('inpKeyLimit');
ui.presets=$('presets');ui.inpPrompt=$('inpPrompt');
ui.inpTrigger=$('inpTrigger');ui.inpCooldown=$('inpCooldown');ui.inpTemp=$('inpTemp');ui.inpMaxTok=$('inpMaxTok');ui.selReasoning=$('selReasoning');
ui.switchP=$('switchPrefix');ui.toggleP=$('togglePrefix');
ui.testInput=$('testInput');ui.testOutput=$('testOutput');
ui.logList=$('logList');ui.footLeft=$('footLeft');ui.footQueue=$('footQueue');
ui.toast=$('toast');ui.btnDebugToggle=$('btnDebugToggle');
ui.inpPrompt.value=settings.systemPrompt;
ui.inpTrigger.value=settings.trigger;ui.inpCooldown.value=settings.cooldownMs;
ui.inpTemp.value=settings.temperature;ui.inpMaxTok.value=settings.maxTokens;
ui.selReasoning.value=settings.reasoningEffort;
ui.inpBotChatUser.value=settings.botChatUser||DEFAULT_BOTCHAT_USER;
ui.inpBotChatTurns.value=settings.botChatTurns;
ui.inpReadAllDelay.value=settings.botChatReadAllDelay;ui.inpReadAllTurns.value=settings.botChatReadAllTurns;
ui.inpSoloDelay.value=settings.soloDelay;ui.inpSoloTurns.value=settings.soloTurns;
ui.inpSoloBlacklist.value=(settings.soloBlacklist||[]).join('\n');
ui.inpKeyLimit.value=settings.keyLimit;
ui.btnDebugToggle.classList.toggle('on',debugEnabled);
const hc=settings.humanConfig;
ui.inpHSkipSolo.value=Math.round(hc.skipSolo*100);
ui.inpHSkipChat.value=Math.round(hc.skipChat*100);
ui.inpHReact.value=Math.round(hc.reaction*100);
ui.inpHAsk.value=Math.round(hc.askBack*100);
ui.inpHTypo.value=Math.round(hc.typo*100);
ui.inpHNoPunct.value=Math.round(hc.noPunct*100);
ui.inpHDelayBase.value=hc.delayBase;
ui.inpHDelayChar.value=hc.delayPerChar;
ui.inpHJitter.value=hc.delayJitter;
Object.entries(PERSONAS).forEach(([k,p])=>{const b=document.createElement('button');b.type='button';b.className='preset'+(settings.personaKey===k?' active':'');b.dataset.persona=k;b.textContent=p.label;b.addEventListener('click',()=>selectPersona(k));ui.presets.appendChild(b);});
refreshToggle();refreshStatus();renderLog();renderKeys();
}

function selectPersona(key){const p=PERSONAS[key];if(!p)return;settings.personaKey=key;if(p.prompt){settings.systemPrompt=p.prompt;ui.inpPrompt.value=p.prompt;}ui.presets.querySelectorAll('.preset').forEach(b=>{b.classList.toggle('active',b.dataset.persona===key);});saveSetting('personaKey',key);saveSetting('systemPrompt',settings.systemPrompt);refreshToggle();}

function refreshToggle(){
ui.switchHuman.classList.toggle('on',settings.humanMode);ui.toggleHuman.classList.toggle('on',settings.humanMode);ui.toggleHuman.setAttribute('aria-checked',String(settings.humanMode));
ui.humanLine.textContent=settings.humanMode?'ATIVO · ritmo, reação, typo, tom':'Ritmo natural, reação curta, typo ocasional';
ui.humanCfg.style.display=settings.humanMode?'':'none';
ui.badgeHuman.style.display=settings.humanMode?'':'none';
ui.switchE.classList.toggle('on',settings.enabled);ui.toggleE.classList.toggle('on',settings.enabled);ui.toggleE.setAttribute('aria-checked',String(settings.enabled));
ui.switchSolo.classList.toggle('on',settings.soloMode);ui.toggleSolo.classList.toggle('on',settings.soloMode);ui.toggleSolo.setAttribute('aria-checked',String(settings.soloMode));
ui.soloLine.textContent=settings.soloMode?'Ativo · '+settings.soloDelay+'ms · '+settings.soloTurns+' turnos':'Bot lê tudo e responde todos';
ui.soloCfg.style.display=settings.soloMode?'':'none';
if(ui.soloBlacklistHint){const n=(settings.soloBlacklist||[]).length;ui.soloBlacklistHint.textContent=n===0?'Nenhum nome excluído.':n+' nome'+(n===1?'':'s')+' excluído'+(n===1?'':'s')+': '+settings.soloBlacklist.join(', ');}
ui.switchBC.classList.toggle('on',settings.botChatMode);ui.toggleBC.classList.toggle('on',settings.botChatMode);ui.toggleBC.setAttribute('aria-checked',String(settings.botChatMode));
ui.botChatLine.textContent='User alvo: '+(settings.botChatUser||DEFAULT_BOTCHAT_USER)+' · '+settings.botChatTurns+' turnos';
ui.botChatCfg.style.display=settings.botChatMode?'':'none';
ui.switchRA.classList.toggle('on',settings.botChatReadAll);ui.toggleRA.classList.toggle('on',settings.botChatReadAll);ui.toggleRA.setAttribute('aria-checked',String(settings.botChatReadAll));
ui.readAllLine.textContent=settings.botChatReadAll?'Ativo · '+settings.botChatReadAllDelay+'ms · '+settings.botChatReadAllTurns+' turnos':'Contexto de todos os usuários';
ui.readAllCfg.style.display=settings.botChatReadAll?'':'none';
ui.switchUs.classList.toggle('on',settings.userStoreEnabled);ui.toggleUs.classList.toggle('on',settings.userStoreEnabled);ui.toggleUs.setAttribute('aria-checked',String(settings.userStoreEnabled));
ui.switchCache.classList.toggle('on',settings.cacheEnabled);ui.toggleCache.classList.toggle('on',settings.cacheEnabled);ui.toggleCache.setAttribute('aria-checked',String(settings.cacheEnabled));
ui.switchSumm.classList.toggle('on',settings.summariesEnabled);ui.toggleSumm.classList.toggle('on',settings.summariesEnabled);ui.toggleSumm.setAttribute('aria-checked',String(settings.summariesEnabled));
ui.switchProf.classList.toggle('on',settings.profileEnabled);ui.toggleProf.classList.toggle('on',settings.profileEnabled);ui.toggleProf.setAttribute('aria-checked',String(settings.profileEnabled));
ui.switchTop.classList.toggle('on',settings.topicsEnabled);ui.toggleTop.classList.toggle('on',settings.topicsEnabled);ui.toggleTop.setAttribute('aria-checked',String(settings.topicsEnabled));
ui.switchAnch.classList.toggle('on',settings.anchorsEnabled);ui.toggleAnch.classList.toggle('on',settings.anchorsEnabled);ui.toggleAnch.setAttribute('aria-checked',String(settings.anchorsEnabled));
ui.switchStrip.classList.toggle('on',settings.stripReasoningEnabled);ui.toggleStrip.classList.toggle('on',settings.stripReasoningEnabled);ui.toggleStrip.setAttribute('aria-checked',String(settings.stripReasoningEnabled));
UserStore.load();
ui.cacheInfo.textContent=responseCache.size;
ui.summInfo.textContent=(()=>{let n=0;for(const v of UserStore.map.values())if(v.summary)n++;return n;})();
ui.profInfo.textContent=(()=>{let n=0;for(const v of UserStore.map.values())if(v.profile&&(v.profile.text||v.profile.notes))n++;return n;})();
const us=UserStore.stats();
ui.usInfo.textContent=us.users+' · '+(us.bytes/1024).toFixed(1)+'KB';
ui.switchP.classList.toggle('on',settings.prefixReply);ui.toggleP.classList.toggle('on',settings.prefixReply);ui.toggleP.setAttribute('aria-checked',String(settings.prefixReply));
ui.personaLine.textContent=PERSONAS[settings.personaKey]?.label||'Custom';
const bc=botChatMemoryCount(settings.botChatUser);const users=botChatUsersCount();
if(ui.botChatHistInfo)ui.botChatHistInfo.textContent=bc+' turno'+(bc===1?'':'s')+(users>1?' (+'+(users-1)+' users)':'');
const sum=roomContextSummary();const ctxInfo=sum.total+' msgs · '+sum.users+' user'+(sum.users===1?'':'s');
if(ui.roomCtxInfo)ui.roomCtxInfo.textContent=ctxInfo;
if(ui.soloCtxInfo)ui.soloCtxInfo.textContent=ctxInfo;
if(ui.roomPreview)renderRoomPreview(ui.roomPreview);
if(ui.soloPreview)renderRoomPreview(ui.soloPreview);
renderKeys();
updateDot();updateFoot();
}

function renderRoomPreview(target){
if(!target)return;
const isSolo=target===ui.soloPreview;
const active=isSolo?settings.soloMode:(settings.botChatMode&&settings.botChatReadAll);
if(!active||!roomContext.length){target.style.display='none';return;}
target.style.display='block';
const lastFew=roomContext.slice(-6);
const accent=isSolo?'#fbbf24':'#f472b6';
const html=lastFew.map(m=>{const bl=isSolo&&isBlacklisted(m.user);return '<div style="padding:3px 0;font-size:10px;color:#8b8fa3;font-family:ui-monospace,Menlo,monospace;border-bottom:1px dashed rgba(255,255,255,.04);'+(bl?'opacity:.35;text-decoration:line-through;':'')+'">'+'<span style="color:'+accent+';font-weight:700;">'+esc(m.user)+'</span>'+'<span style="color:#c7cad6;"> · '+esc(truncate(m.msg,80))+'</span>'+'</div>';}).join('');
target.innerHTML='<div style="font-size:9px;color:'+accent+';text-transform:uppercase;letter-spacing:.06em;font-weight:800;margin-bottom:6px;">Últimas '+lastFew.length+'</div>'+html;
}

function updateDot(){
if(!ui.dot)return;
ui.dot.classList.remove('on','busy','chat','room','solo','human');
if(!settings.enabled)return;
if(processing)ui.dot.classList.add('busy');
else if(settings.humanMode)ui.dot.classList.add('human');
else if(settings.soloMode)ui.dot.classList.add('solo');
else if(settings.botChatMode&&settings.botChatReadAll)ui.dot.classList.add('room');
else if(settings.botChatMode)ui.dot.classList.add('chat');
else ui.dot.classList.add('on');
}

function updateFoot(){
if(!ui.footLeft)return;
const model=MODELS.find(m=>m.id===settings.model);
const tags=[];
if(settings.humanMode)tags.push('humano');
if(settings.soloMode)tags.push('solo');
if(settings.botChatMode)tags.push('chat:'+(settings.botChatUser||DEFAULT_BOTCHAT_USER));
if(settings.botChatMode&&settings.botChatReadAll)tags.push('sala');
if(settings.userStoreEnabled)tags.push('store');
if(settings.cacheEnabled)tags.push('cache');
if(settings.apiKeys.length)tags.push(settings.apiKeys.length+' keys');
const tag=tags.length?' · '+tags.join(' · '):'';
ui.footLeft.textContent=(model?model.label:settings.model)+' · '+settings.reasoningEffort+tag;
}

function refreshStatus(){
if(!ui.stReq)return;
ui.stReq.textContent=stats.requests;ui.stOk.textContent=stats.ok;ui.stFail.textContent=stats.fail;
ui.stRetry.textContent=stats.retries;ui.stEmpty.textContent=stats.empty;
if(ui.stCache)ui.stCache.textContent=stats.cacheHits||0;
if(ui.stSkip)ui.stSkip.textContent=stats.skips||0;
if(ui.stCoa)ui.stCoa.textContent=stats.coalesced||0;
ui.stTok.textContent=stats.tokens;
const a=getActiveKey();
if(!a){
const anyKey=settings.apiKeys.length>0;
ui.keyHint.innerHTML='<span style="color:#fbbf24;">⚠ '+(anyKey?'todas as keys esgotadas':'nenhuma API key cadastrada')+'.</span>';
}else{
const limit=Number(a.limit)||DEFAULT_DAILY_LIMIT;
const used=a.usedToday||0;
const pct=used/limit;
const col=pct>=0.9?'#fb7185':pct>=0.7?'#fbbf24':'#a7f3d0';
const suffix=' <span style="color:#8b8fa3;font-family:ui-monospace,monospace;">…'+esc(a.key.slice(-4))+'</span>';
const prefix='<b style="color:'+col+';">'+fmtTok(used)+'/'+fmtTok(limit)+'</b>'+suffix+' · ';
if(!settings.enabled){ui.keyHint.innerHTML=prefix+'<span>Bot desligado.</span>';}
else{
const parts=[];
if(cbOpenUntil&&Date.now()<cbOpenUntil){const s=Math.ceil((cbOpenUntil-Date.now())/1000);parts.push('<b style="color:#fb7185;">CB '+s+'s</b>');}
if(silencedUntil&&Date.now()<silencedUntil){const min=Math.ceil((silencedUntil-Date.now())/60000);parts.push('<b style="color:#fb7185;">silenciado '+min+'min</b>');}
if(settings.humanMode)parts.push('<b style="color:#22d3ee;">humano</b>');
if(settings.soloMode){const bl=(settings.soloBlacklist||[]).length;parts.push('<b style="color:#fbbf24;">solo</b>'+(bl?' · '+bl+' excluído'+(bl===1?'':'s'):''));}
else{parts.push('trigger <b style="color:#22d3ee;">'+esc(settings.trigger)+'</b>');if(settings.botChatMode)parts.push('conversa <b style="color:#a78bfa;">'+esc(settings.botChatUser)+'</b>');if(settings.botChatMode&&settings.botChatReadAll)parts.push('<b style="color:#f472b6;">sala</b>');}
ui.keyHint.innerHTML=prefix+'Escutando '+parts.join(' · ')+'.';
}
}
}
function updateStats(){refreshStatus();updateDot();refreshToggle();}
function updateQueue(){if(ui.footQueue)ui.footQueue.textContent=queue.length;}
function showToast(msg){if(!ui.toast)return;ui.toast.textContent=msg;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1800);}

// LOG
function addLog(entry){entry.id=++logSeq;logs.push(entry);if(logs.length>settings.logLimit)logs.shift();renderLog();}
function renderLog(){
if(!ui.logList)return;
const items=[];
logs.forEach(l=>{
const isHuman=l.info&&l.info.indexOf('humano')!==-1;
const isSolo=l.info&&l.info.indexOf('solo')!==-1;
const isChat=l.info&&l.info.indexOf('conversa')!==-1;
const isRoom=l.info&&l.info.indexOf('sala')!==-1;
const isCmd=l.info&&l.info.indexOf('comando')!==-1;
let cls;
if(l.status==='ok')cls=isCmd?'capture':(isHuman?'human':(isSolo?'solo':(isRoom?'room':(isChat?'chat':'ok'))));
else if(l.status==='error'||l.status==='send-fail'||l.status==='no-key')cls='fail';
else cls='skip';
const tag='<span class="log-tag '+cls+'">'+esc(l.status)+'</span>';
const info=l.info?'<span style="color:#fbbf24;font-size:9px;">'+esc(l.info)+'</span>':'';
items.push({sortId:l.id,html:'<div class="log-row '+cls+'"><div class="log-head"><span class="log-user">'+esc(l.user)+'</span><span>'+esc(l.t)+'</span></div><div class="log-q">'+tag+'→ '+esc(truncate(l.q,140))+'</div>'+(l.r&&l.r!=='—'?'<div class="log-r">← '+esc(truncate(l.r,200))+'</div>':'')+info+'</div>'});
});
if(debugEnabled){
debugLog.forEach(d=>{
let cls='';
if(d.tag==='capture')cls='capture';
else if(d.tag==='trigger')cls='ok';
else if(d.tag==='solo')cls='solo';
else if(d.tag==='botchat')cls='chat';
else if(d.tag==='room')cls='room';
else if(d.tag==='human')cls='human';
else if(d.tag==='summ'||d.tag==='prof'||d.tag==='userstore'||d.tag==='budget')cls='capture';
else if(d.tag==='cmd')cls='capture';
else if(d.tag==='cache')cls='ok';
else if(d.tag==='cb')cls='fail';
else if(d.tag==='key')cls='human';
else if(d.tag==='coalesce')cls='human';
else if(d.tag==='miss'||d.tag==='cooldown'||d.tag==='empty'||d.tag==='silence')cls='skip';
items.push({sortId:1000000+d.id,html:'<div class="log-row '+cls+'"><div class="log-head"><span><span class="log-tag '+cls+'">'+esc(d.tag)+'</span></span><span>'+esc(d.t)+'</span></div><div class="log-q">'+esc(d.text)+'</div></div>'});
});
}
if(!items.length){ui.logList.innerHTML='<div class="empty">Nenhuma atividade ainda.</div>';return;}
ui.logList.innerHTML=items.map(i=>i.html).join('');
ui.logList.parentElement.scrollTop=ui.logList.parentElement.scrollHeight;
}

// EVENTS
function bindLeakGuard(sig){const stop=e=>e.stopPropagation();LEAK_EVENTS.forEach(evt=>host.addEventListener(evt,stop,sig));}
function bindToggle(el,onClick,sig){el.addEventListener('click',onClick,sig);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}},sig);}

function bindUI(){
const sig={signal:ac.signal};
bindLeakGuard(sig);
shadow.querySelectorAll('.tab').forEach(t=>{t.addEventListener('click',()=>{shadow.querySelectorAll('.tab').forEach(x=>{x.classList.toggle('active',x===t);x.setAttribute('aria-selected',String(x===t));});shadow.querySelectorAll('.view').forEach(v=>{v.style.display=v.dataset.view===t.dataset.tab?'':'none';});},sig);});
shadow.getElementById('btnMin').addEventListener('click',()=>{ui.panel.classList.toggle('collapsed');},sig);
bindToggle(ui.toggleHuman,()=>{settings.humanMode=!settings.humanMode;saveSetting('humanMode',settings.humanMode);refreshToggle();showToast(settings.humanMode?'Modo Humano LIGADO':'Modo Humano desligado');dbg('human','mode='+settings.humanMode);},sig);
const hcInputs=[['inpHSkipSolo','skipSolo',0.01,0.5,100],['inpHSkipChat','skipChat',0.01,0.5,100],['inpHReact','reaction',0.01,0.5,100],['inpHAsk','askBack',0.01,0.5,100],['inpHTypo','typo',0.01,0.2,100],['inpHNoPunct','noPunct',0.01,0.8,100],['inpHDelayBase','delayBase',200,5000,1],['inpHDelayChar','delayPerChar',0,100,1],['inpHJitter','delayJitter',0,5000,1]];
hcInputs.forEach(([id,key,min,max,scale])=>{const el=ui[id];if(!el)return;el.addEventListener('change',()=>{let v=parseFloat(el.value);if(Number.isNaN(v))v=0;if(scale===100)v=Math.min(max,Math.max(min,v/100));else v=Math.min(max,Math.max(min,v));settings.humanConfig[key]=v;saveHumanConfig();if(scale===100)el.value=Math.round(v*100);else el.value=v;dbg('human','cfg '+key+'='+v);},sig);});
shadow.getElementById('btnHumanReset').addEventListener('click',()=>{settings.humanConfig=Object.assign({},HUMAN_DEFAULTS);saveHumanConfig();const hc=settings.humanConfig;ui.inpHSkipSolo.value=Math.round(hc.skipSolo*100);ui.inpHSkipChat.value=Math.round(hc.skipChat*100);ui.inpHReact.value=Math.round(hc.reaction*100);ui.inpHAsk.value=Math.round(hc.askBack*100);ui.inpHTypo.value=Math.round(hc.typo*100);ui.inpHNoPunct.value=Math.round(hc.noPunct*100);ui.inpHDelayBase.value=hc.delayBase;ui.inpHDelayChar.value=hc.delayPerChar;ui.inpHJitter.value=hc.delayJitter;showToast('Padrões restaurados ✓');},sig);
bindToggle(ui.toggleE,()=>{settings.enabled=!settings.enabled;saveSetting('enabled',settings.enabled);refreshToggle();refreshStatus();},sig);
bindToggle(ui.toggleSolo,()=>{const next=!settings.soloMode;settings.soloMode=next;saveSetting('soloMode',next);if(next&&settings.botChatMode){settings.botChatMode=false;saveSetting('botChatMode',false);}if(!next)clearRoomContext();refreshToggle();refreshStatus();},sig);
bindToggle(ui.toggleBC,()=>{const next=!settings.botChatMode;settings.botChatMode=next;saveSetting('botChatMode',next);if(next&&settings.soloMode){settings.soloMode=false;saveSetting('soloMode',false);}if(!next)clearRoomContext();refreshToggle();refreshStatus();},sig);
bindToggle(ui.toggleRA,()=>{settings.botChatReadAll=!settings.botChatReadAll;saveSetting('botChatReadAll',settings.botChatReadAll);if(!settings.botChatReadAll)clearRoomContext();refreshToggle();refreshStatus();},sig);
bindToggle(ui.toggleUs,()=>{settings.userStoreEnabled=!settings.userStoreEnabled;saveSetting('userStoreEnabled',settings.userStoreEnabled);refreshToggle();showToast('UserStore '+(settings.userStoreEnabled?'ligado':'desligado'));},sig);
bindToggle(ui.toggleCache,()=>{settings.cacheEnabled=!settings.cacheEnabled;saveSetting('cacheEnabled',settings.cacheEnabled);refreshToggle();showToast('Cache '+(settings.cacheEnabled?'ligado':'desligado'));},sig);
bindToggle(ui.toggleSumm,()=>{settings.summariesEnabled=!settings.summariesEnabled;saveSetting('summariesEnabled',settings.summariesEnabled);refreshToggle();showToast('Sumário '+(settings.summariesEnabled?'ligado':'desligado'));},sig);
bindToggle(ui.toggleProf,()=>{settings.profileEnabled=!settings.profileEnabled;saveSetting('profileEnabled',settings.profileEnabled);refreshToggle();showToast('Perfil '+(settings.profileEnabled?'ligado':'desligado'));},sig);
bindToggle(ui.toggleTop,()=>{settings.topicsEnabled=!settings.topicsEnabled;saveSetting('topicsEnabled',settings.topicsEnabled);refreshToggle();showToast('Tópicos '+(settings.topicsEnabled?'ligado':'desligado'));},sig);
bindToggle(ui.toggleAnch,()=>{settings.anchorsEnabled=!settings.anchorsEnabled;saveSetting('anchorsEnabled',settings.anchorsEnabled);refreshToggle();showToast('Âncoras '+(settings.anchorsEnabled?'ligado':'desligado'));},sig);
bindToggle(ui.toggleStrip,()=>{settings.stripReasoningEnabled=!settings.stripReasoningEnabled;saveSetting('stripReasoningEnabled',settings.stripReasoningEnabled);refreshToggle();showToast('Anti-vazamento '+(settings.stripReasoningEnabled?'ligado':'desligado'));},sig);
bindToggle(ui.toggleP,()=>{settings.prefixReply=!settings.prefixReply;saveSetting('prefixReply',settings.prefixReply);refreshToggle();},sig);
ui.inpSoloDelay.addEventListener('change',()=>{const v=Math.max(200,Math.min(10000,parseInt(ui.inpSoloDelay.value,10)||DEFAULT_READALL_DELAY));settings.soloDelay=v;ui.inpSoloDelay.value=v;saveSetting('soloDelay',v);refreshToggle();},sig);
ui.inpSoloTurns.addEventListener('change',()=>{const v=Math.max(5,Math.min(100,parseInt(ui.inpSoloTurns.value,10)||DEFAULT_READALL_TURNS));settings.soloTurns=v;ui.inpSoloTurns.value=v;saveSetting('soloTurns',v);if(roomContext.length>v)roomContext=roomContext.slice(-v);saveRoomContext();refreshToggle();},sig);
ui.inpSoloBlacklist.addEventListener('change',()=>{const arr=parseBlacklist(ui.inpSoloBlacklist.value);settings.soloBlacklist=arr;saveSetting('soloBlacklist',arr);refreshToggle();refreshStatus();showToast(arr.length+' nome'+(arr.length===1?'':'s')+' excluído'+(arr.length===1?'':'s'));},sig);
ui.inpSoloBlacklist.addEventListener('blur',()=>{const arr=parseBlacklist(ui.inpSoloBlacklist.value);ui.inpSoloBlacklist.value=arr.join('\n');},sig);
ui.inpBotChatUser.addEventListener('change',()=>{const v=ui.inpBotChatUser.value.trim()||DEFAULT_BOTCHAT_USER;settings.botChatUser=v;saveSetting('botChatUser',v);refreshToggle();},sig);
ui.inpBotChatTurns.addEventListener('change',()=>{const v=Math.max(5,Math.min(200,parseInt(ui.inpBotChatTurns.value,10)||DEFAULT_BOTCHAT_TURNS));settings.botChatTurns=v;ui.inpBotChatTurns.value=v;saveSetting('botChatTurns',v);refreshToggle();},sig);
ui.inpReadAllDelay.addEventListener('change',()=>{const v=Math.max(200,Math.min(10000,parseInt(ui.inpReadAllDelay.value,10)||DEFAULT_READALL_DELAY));settings.botChatReadAllDelay=v;ui.inpReadAllDelay.value=v;saveSetting('botChatReadAllDelay',v);refreshToggle();},sig);
ui.inpReadAllTurns.addEventListener('change',()=>{const v=Math.max(5,Math.min(100,parseInt(ui.inpReadAllTurns.value,10)||DEFAULT_READALL_TURNS));settings.botChatReadAllTurns=v;ui.inpReadAllTurns.value=v;saveSetting('botChatReadAllTurns',v);if(roomContext.length>v)roomContext=roomContext.slice(-v);saveRoomContext();refreshToggle();},sig);
shadow.getElementById('btnClearBotChat').addEventListener('click',()=>{clearBotChatMemory(settings.botChatUser);clearBotChatSummary(settings.botChatUser);refreshToggle();showToast('Histórico do user alvo apagado ✓');},sig);
shadow.getElementById('btnClearRoom').addEventListener('click',()=>{clearRoomContext();showToast('Contexto da sala apagado ✓');},sig);
shadow.getElementById('btnClearSoloRoom').addEventListener('click',()=>{clearRoomContext();showToast('Contexto do solo apagado ✓');},sig);
shadow.getElementById('btnClearCache').addEventListener('click',()=>{cacheClear();refreshToggle();showToast('Cache apagado ✓');},sig);
shadow.getElementById('btnUsClear').addEventListener('click',()=>{if(!confirm('Apagar UserStore de todos?'))return;UserStore.clearAll();refreshToggle();showToast('UserStore apagado ✓');},sig);
shadow.getElementById('btnUsExport').addEventListener('click',()=>{UserStore.load();const obj={};for(const[k,v]of UserStore.map)obj[k]=v;const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='userstore-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},sig);
shadow.getElementById('btnUsInspect').addEventListener('click',()=>{const nick=(ui.inpUsNick.value||'').trim().toLowerCase();if(!nick){showToast('Digite um nickname');return;}const u=UserStore.get(nick);ui.usPreview.textContent=JSON.stringify(u,null,2);},sig);
ui.btnAddKey.addEventListener('click',()=>{const n=addKeysFromInput(ui.inpNewKey.value);if(n){ui.inpNewKey.value='';showToast(n+' key'+(n===1?'':'s')+' adicionada'+(n===1?'':'s'));healthCheck();renderKeys();refreshStatus();}else showToast('Nenhuma key válida');},sig);
ui.inpNewKey.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ui.btnAddKey.click();}},sig);
ui.inpKeyLimit.addEventListener('change',()=>{const v=Math.max(1000,parseInt(ui.inpKeyLimit.value,10)||DEFAULT_DAILY_LIMIT);ui.inpKeyLimit.value=v;saveSetting('keyLimit',v);for(const k of settings.apiKeys)k.limit=v;persistKeys();renderKeys();refreshStatus();},sig);
ui.inpPrompt.addEventListener('input',()=>{const cur=PERSONAS[settings.personaKey]?.prompt;const drift=ui.inpPrompt.value!==cur;ui.presets.querySelectorAll('.preset').forEach(b=>{b.classList.toggle('active',drift?b.dataset.persona==='custom':b.dataset.persona===settings.personaKey);});},sig);
shadow.getElementById('btnCheckChat').addEventListener('click',()=>{const el=findChatInput();if(el){ui.chatDiagState.textContent='detectado';ui.chatDiagState.style.color='#34d399';ui.chatDiagState.title=detectedInputSel;}else{ui.chatDiagState.textContent='não encontrado';ui.chatDiagState.style.color='#fb7185';ui.chatDiagState.title='';}},sig);
shadow.getElementById('btnSave').addEventListener('click',()=>{saveSetting('systemPrompt',ui.inpPrompt.value);saveSetting('trigger',ui.inpTrigger.value.trim()||'/bot');saveSetting('cooldownMs',Math.max(0,parseInt(ui.inpCooldown.value,10)||0));saveSetting('temperature',Math.min(2,Math.max(0,parseFloat(ui.inpTemp.value)||0.85)));saveSetting('maxTokens',Math.max(50,Math.min(4000,parseInt(ui.inpMaxTok.value,10)||500)));saveSetting('reasoningEffort',REASONING_EFFORTS.includes(ui.selReasoning.value)?ui.selReasoning.value:'low');saveSetting('botChatUser',ui.inpBotChatUser.value.trim()||DEFAULT_BOTCHAT_USER);saveSetting('botChatTurns',Math.max(5,Math.min(200,parseInt(ui.inpBotChatTurns.value,10)||DEFAULT_BOTCHAT_TURNS)));saveSetting('botChatReadAllDelay',Math.max(200,Math.min(10000,parseInt(ui.inpReadAllDelay.value,10)||DEFAULT_READALL_DELAY)));saveSetting('botChatReadAllTurns',Math.max(5,Math.min(100,parseInt(ui.inpReadAllTurns.value,10)||DEFAULT_READALL_TURNS)));saveSetting('soloDelay',Math.max(200,Math.min(10000,parseInt(ui.inpSoloDelay.value,10)||DEFAULT_READALL_DELAY)));saveSetting('soloTurns',Math.max(5,Math.min(100,parseInt(ui.inpSoloTurns.value,10)||DEFAULT_READALL_TURNS)));saveSetting('soloBlacklist',parseBlacklist(ui.inpSoloBlacklist.value));if(ui.inpPrompt.value!==PERSONAS[settings.personaKey]?.prompt)settings.personaKey='custom';saveSetting('personaKey',settings.personaKey);ui.presets.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',b.dataset.persona===settings.personaKey));refreshToggle();refreshStatus();updateFoot();showToast('Configurações salvas ✓');},sig);
ui.testInput.addEventListener('keydown',async e=>{if(e.key!=='Enter')return;e.preventDefault();const q=ui.testInput.value.trim();if(!q)return;if(!getActiveKey()){ui.testOutput.innerHTML='<div class="hint warn">Sem API key disponível.</div>';return;}ui.testOutput.innerHTML='<div class="hint" style="color:#22d3ee;">consultando…</div>';try{const r=await callGroq(q);ui.testOutput.innerHTML='<div class="hint ok">'+esc(r||'(vazio)')+'</div>';}catch(err){ui.testOutput.innerHTML='<div class="hint warn">'+esc(String(err.message||err))+'</div>';}},sig);
shadow.getElementById('btnClearLog').addEventListener('click',()=>{logs=[];debugLog=[];renderLog();},sig);
shadow.getElementById('btnClearMemory').addEventListener('click',()=>{clearMemory();clearBotChatMemory();clearBotChatSummary();clearUserProfile();lastUserAt.clear();refreshToggle();showToast('Memória total apagada ✓');},sig);
ui.btnDebugToggle.addEventListener('click',()=>{debugEnabled=!debugEnabled;lsSet('debugEnabled',debugEnabled);ui.btnDebugToggle.classList.toggle('on',debugEnabled);showToast('Debug '+(debugEnabled?'ligado':'desligado'));renderLog();},sig);
let drag=null;
ui.head.addEventListener('mousedown',e=>{if(e.target.closest('.btn'))return;e.preventDefault();const r=host.getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top};host.style.right='auto';host.style.left=r.left+'px';host.style.top=r.top+'px';},sig);
window.addEventListener('mousemove',e=>{if(!drag)return;host.style.left=Math.max(0,e.clientX-drag.x)+'px';host.style.top=Math.max(0,e.clientY-drag.y)+'px';},sig);
window.addEventListener('mouseup',()=>{drag=null;},sig);
window.addEventListener('keydown',e=>{if(e.altKey&&e.shiftKey&&e.key.toLowerCase()==='b'){e.preventDefault();host.style.display=host.style.display==='none'?'':'none';}},sig);
}

// OBSERVER
function scanAll(){try{document.querySelectorAll(SEL_PRIMARY).forEach(c=>{const b=c.closest(SEL_BUBBLE)||c;if(b)processBubble(b);});}catch(e){}}
function startObserver(){
if(observer||dying)return;
scanAll();
observer=new MutationObserver(muts=>{
for(const m of muts){
try{
if(m.type==='childList'){for(const n of m.addedNodes){if(n.nodeType!==1)continue;if(n.matches&&n.matches(SEL_PRIMARY)){processBubble(n.closest(SEL_BUBBLE)||n);}else if(n.querySelectorAll){n.querySelectorAll(SEL_PRIMARY).forEach(c=>processBubble(c.closest(SEL_BUBBLE)||c));}}}
else if(m.type==='attributes'&&m.target){if(m.target.classList&&m.target.classList.contains(SEL_VISIBLE))processBubble(m.target);if(m.target.matches&&m.target.matches(SEL_PRIMARY))processBubble(m.target.closest(SEL_BUBBLE)||m.target);}
else if(m.type==='characterData'&&m.target&&m.target.parentElement){const pe=m.target.parentElement;if(pe.matches(SEL_PRIMARY)||pe.closest(SEL_PRIMARY))processBubble(pe.closest(SEL_BUBBLE)||pe);}
}catch(e){dbg('error','mutação',String(e));}
}
});
observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class'],characterData:true});
}
function stopObserver(){if(observer){observer.disconnect();observer=null;}}
function startPoll(){if(pollTimer||dying)return;pollTimer=setInterval(()=>{if(!dying)scanAll();},POLL_MS);}
function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

// INIT
function init(){
if(dying||window[UID])return;
ac=new AbortController();
loadSettings();
UserStore.load();
loadTopics();
loadRoomContext();
buildHost();
bindUI();
startObserver();
startPoll();
updateQueue();
healthCheck();
window[UID]={
kill,
show:()=>{if(host)host.style.display='';return true;},
hide:()=>{if(host)host.style.display='none';return true;},
on:()=>{settings.enabled=true;saveSetting('enabled',true);refreshToggle();refreshStatus();return true;},
off:()=>{settings.enabled=false;saveSetting('enabled',false);refreshToggle();refreshStatus();return false;},
human:(on)=>{if(on===undefined)return settings.humanMode;settings.humanMode=!!on;saveSetting('humanMode',settings.humanMode);refreshToggle();return settings.humanMode;},
humanConfig:(cfg)=>{if(cfg===undefined)return Object.assign({},settings.humanConfig);const cur=Object.assign({},settings.humanConfig);for(const k in cfg){if(typeof cfg[k]==='number'&&k in HUMAN_DEFAULTS)cur[k]=cfg[k];}settings.humanConfig=cur;saveHumanConfig();refreshToggle();return Object.assign({},settings.humanConfig);},
humanReset:()=>{settings.humanConfig=Object.assign({},HUMAN_DEFAULTS);saveHumanConfig();refreshToggle();return true;},
tone:(msg)=>detectTone(msg),
solo:(on)=>{if(on===undefined)return settings.soloMode;settings.soloMode=!!on;saveSetting('soloMode',settings.soloMode);if(settings.soloMode&&settings.botChatMode){settings.botChatMode=false;saveSetting('botChatMode',false);}if(!settings.soloMode)clearRoomContext();refreshToggle();refreshStatus();return settings.soloMode;},
soloDelay:(ms)=>{if(ms===undefined)return settings.soloDelay;const v=Math.max(200,Math.min(10000,Number(ms)||DEFAULT_READALL_DELAY));settings.soloDelay=v;saveSetting('soloDelay',v);if(ui.inpSoloDelay)ui.inpSoloDelay.value=v;refreshToggle();return v;},
soloTurns:(n)=>{if(n===undefined)return settings.soloTurns;const v=Math.max(5,Math.min(100,Number(n)||DEFAULT_READALL_TURNS));settings.soloTurns=v;saveSetting('soloTurns',v);if(ui.inpSoloTurns)ui.inpSoloTurns.value=v;if(roomContext.length>v)roomContext=roomContext.slice(-v);saveRoomContext();refreshToggle();return v;},
soloBlacklist:(arr)=>{if(arr===undefined)return(settings.soloBlacklist||[]).slice();const v=Array.isArray(arr)?parseBlacklist(arr.join('\n')):parseBlacklist(String(arr));settings.soloBlacklist=v;saveSetting('soloBlacklist',v);if(ui.inpSoloBlacklist)ui.inpSoloBlacklist.value=v.join('\n');refreshToggle();refreshStatus();return v.slice();},
soloExclude:(name)=>{if(!name)return false;const n=String(name).trim().toLowerCase();const v=(settings.soloBlacklist||[]).slice();if(!n)return false;if(v.indexOf(n)===-1)v.push(n);settings.soloBlacklist=v;saveSetting('soloBlacklist',v);if(ui.inpSoloBlacklist)ui.inpSoloBlacklist.value=v.join('\n');refreshToggle();refreshStatus();return true;},
soloInclude:(name)=>{if(!name)return false;const n=String(name).trim().toLowerCase();const v=(settings.soloBlacklist||[]).filter(x=>x!==n);settings.soloBlacklist=v;saveSetting('soloBlacklist',v);if(ui.inpSoloBlacklist)ui.inpSoloBlacklist.value=v.join('\n');refreshToggle();refreshStatus();return true;},
botChat:(on)=>{if(on===undefined)return settings.botChatMode;settings.botChatMode=!!on;saveSetting('botChatMode',settings.botChatMode);if(settings.botChatMode&&settings.soloMode){settings.soloMode=false;saveSetting('soloMode',false);}if(!settings.botChatMode)clearRoomContext();refreshToggle();refreshStatus();return settings.botChatMode;},
botChatUser:(u)=>{if(u===undefined)return settings.botChatUser;const v=String(u).trim()||DEFAULT_BOTCHAT_USER;settings.botChatUser=v;saveSetting('botChatUser',v);if(ui.inpBotChatUser)ui.inpBotChatUser.value=v;refreshToggle();updateFoot();return v;},
botChatTurns:(n)=>{if(n===undefined)return settings.botChatTurns;const v=Math.max(5,Math.min(200,Number(n)||DEFAULT_BOTCHAT_TURNS));settings.botChatTurns=v;saveSetting('botChatTurns',v);if(ui.inpBotChatTurns)ui.inpBotChatTurns.value=v;refreshToggle();return v;},
botChatHistory:(user)=>{const u=user||settings.botChatUser;return getBotChatMemory(u).map(t=>({q:t.q,a:t.a,t:t.t}));},
botChatClear:(user)=>{clearBotChatMemory(user||settings.botChatUser);clearBotChatSummary(user||settings.botChatUser);refreshToggle();return true;},
botChatSummary:(user)=>{const u=user||settings.botChatUser;const s=getBotChatSummary(u);return s?s.text:null;},
roomRead:(on)=>{if(on===undefined)return settings.botChatReadAll;settings.botChatReadAll=!!on;saveSetting('botChatReadAll',settings.botChatReadAll);if(!settings.botChatReadAll)clearRoomContext();refreshToggle();refreshStatus();return settings.botChatReadAll;},
roomDelay:(ms)=>{if(ms===undefined)return settings.botChatReadAllDelay;const v=Math.max(200,Math.min(10000,Number(ms)||DEFAULT_READALL_DELAY));settings.botChatReadAllDelay=v;saveSetting('botChatReadAllDelay',v);if(ui.inpReadAllDelay)ui.inpReadAllDelay.value=v;refreshToggle();return v;},
roomTurns:(n)=>{if(n===undefined)return settings.botChatReadAllTurns;const v=Math.max(5,Math.min(100,Number(n)||DEFAULT_READALL_TURNS));settings.botChatReadAllTurns=v;saveSetting('botChatReadAllTurns',v);if(ui.inpReadAllTurns)ui.inpReadAllTurns.value=v;if(roomContext.length>v)roomContext=roomContext.slice(-v);saveRoomContext();refreshToggle();return v;},
roomContext:()=>roomContext.map(m=>({user:m.user,msg:m.msg,t:m.t})),
roomClear:()=>{clearRoomContext();return true;},
topics:()=>{loadTopics();const out={};for(const[k,v]of roomTopics)out[k]=Array.from(v.users);return out;},
profile:(user)=>{const p=getUserProfile(user);return p?p.text:null;},
store:(nick)=>{if(nick===undefined)return UserStore.stats();return UserStore.get(nick);},
storePeek:(nick)=>UserStore.peek(nick),
storeClear:(nick)=>{if(nick)UserStore.clear(nick);else UserStore.clearAll();refreshToggle();return true;},
storeExport:()=>{UserStore.load();const obj={};for(const[k,v]of UserStore.map)obj[k]=v;return obj;},
storeFacts:(nick)=>extractFacts(nick),
cacheClear:()=>{cacheClear();refreshToggle();return true;},
cacheSize:()=>responseCache.size,
silence:(min)=>{if(min===undefined)return silencedUntil&&Date.now()<silencedUntil?Math.ceil((silencedUntil-Date.now())/60000):0;const m=Math.max(0,Math.min(SILENCE_MAX_MIN,Number(min)||0));if(!m)silencedUntil=0;else silencedUntil=Date.now()+m*60*1000;refreshStatus();return m;},
cbStatus:()=>({fails:cbFails,open:Date.now()<cbOpenUntil,openUntil:cbOpenUntil}),
cbReset:()=>{cbFails=0;cbOpenUntil=0;refreshStatus();return true;},
stripLeak:(text)=>stripReasoningLeak(text),
anchorsOn:(on)=>{if(on===undefined)return settings.anchorsEnabled;settings.anchorsEnabled=!!on;saveSetting('anchorsEnabled',settings.anchorsEnabled);refreshToggle();return settings.anchorsEnabled;},
stripReasoningOn:(on)=>{if(on===undefined)return settings.stripReasoningEnabled;settings.stripReasoningEnabled=!!on;saveSetting('stripReasoningEnabled',settings.stripReasoningEnabled);refreshToggle();return settings.stripReasoningEnabled;},
status:()=>({enabled:settings.enabled,model:settings.model,trigger:settings.trigger,queue:queue.length,reasoningEffort:settings.reasoningEffort,humanMode:settings.humanMode,soloMode:settings.soloMode,botChatMode:settings.botChatMode,botChatUser:settings.botChatUser,userStoreEnabled:settings.userStoreEnabled,cacheEnabled:settings.cacheEnabled,topicsEnabled:settings.topicsEnabled,anchorsEnabled:settings.anchorsEnabled,stripReasoningEnabled:settings.stripReasoningEnabled,cb:{fails:cbFails,open:Date.now()<cbOpenUntil},userStore:UserStore.stats(),cache:responseCache.size,roomContextSize:roomContext.length,roomContextUsers:uniqUsers(roomContext),silenced:silencedUntil&&Date.now()<silencedUntil,keys:settings.apiKeys.length,stats:{...stats}}),
persona:(key)=>{if(PERSONAS[key])selectPersona(key);return settings.personaKey;},
prompt:(txt)=>{if(typeof txt==='string'){settings.systemPrompt=txt;ui.inpPrompt.value=txt;saveSetting('systemPrompt',txt);}return settings.systemPrompt;},
model:(id)=>{if(MODELS.find(m=>m.id===id)){settings.model=id;saveSetting('model',id);updateFoot();}return settings.model;},
effort:(v)=>{if(REASONING_EFFORTS.includes(v)){settings.reasoningEffort=v;ui.selReasoning.value=v;saveSetting('reasoningEffort',v);updateFoot();}return settings.reasoningEffort;},
maxTokens:(n)=>{const v=Math.max(50,Math.min(4000,Number(n)||500));settings.maxTokens=v;ui.inpMaxTok.value=v;saveSetting('maxTokens',v);return v;},
key:(k)=>{if(typeof k==='string'){addKey(k);healthCheck();renderKeys();refreshStatus();}const a=getActiveKey();return a?('***'+a.key.slice(-4)):null;},
keys:()=>settings.apiKeys.map(k=>({key:'***'+k.key.slice(-4),usedToday:k.usedToday||0,limit:k.limit||DEFAULT_DAILY_LIMIT,cooldownUntil:k.cooldownUntil||0,resetAt:k.resetAt||0})),
keysAdd:(k)=>addKeysFromInput(k),
keysRemove:(i)=>{if(typeof i==='number'&&settings.apiKeys[i]){settings.apiKeys.splice(i,1);persistKeys();renderKeys();refreshStatus();return true;}return false;},
keysClear:()=>{settings.apiKeys=[];persistKeys();renderKeys();refreshStatus();return true;},
keysResetUsage:()=>{for(const k of settings.apiKeys){k.usedToday=0;k.resetAt=nextUtcMidnight();k.cooldownUntil=0;}persistKeys();renderKeys();refreshStatus();return true;},
ask:(q,user)=>callGroq(q,user),
send:async(text)=>{const r=await sendToChatVerified(text);if(r.ok)rememberSent(text);return r;},
testTrigger:(msg)=>matchTrigger(msg),
extract:(sel)=>{const b=document.querySelector(sel||SEL_BUBBLE);return b?extract(b):null;},
memory:(user)=>getMemory(user),
memoryOf:(user)=>getMemory(user).map(t=>({q:t.q,a:t.a,t:t.t})),
clearMemory:(user)=>{clearMemory(user);refreshToggle();return true;},
clearMemoryAll:()=>{clearMemory();lastUserAt.clear();refreshToggle();return true;},
debug:(on)=>{debugEnabled=!!on;lsSet('debugEnabled',debugEnabled);if(ui.btnDebugToggle)ui.btnDebugToggle.classList.toggle('on',debugEnabled);renderLog();return debugEnabled;},
debugLog:()=>debugLog.slice(),
logs:()=>logs.slice(),
settings:()=>({...settings})
};
// Alias legado
window._aibot=window[UID];
console.log('%c[aibot]','color:#22d3ee;font-weight:bold','ativo · Alt+Shift+B alterna · window.'+UID+' exposto');
window.dispatchEvent(new CustomEvent('sang:bot-ready'));
}

// KILL
function kill(){
if(dying)return;
dying=true;
if(roomFlushTimer){clearTimeout(roomFlushTimer);roomFlushTimer=null;}
const steps=[
['observer',()=>stopObserver()],
['poll',()=>stopPoll()],
['pending',()=>{for(const c of activeAborts.values()){try{c.abort();}catch(e){}}activeAborts.clear();}],
['abort',()=>ac&&ac.abort()],
['userstore',()=>{try{if(UserStore._saveTimer)clearTimeout(UserStore._saveTimer);UserStore.saveNow();}catch(e){}}],
['keys',()=>{try{persistKeys();}catch(e){}}],
['dom',()=>host&&host.remove()],
['globals',()=>{delete window[UID];if(window._aibot===undefined||window._aibot===null)delete window._aibot;}]
];
for(const[name,fn]of steps){try{fn();}catch(e){console.warn('[aibot] kill step '+name+' falhou:',e);}}
}

if(document.body){setTimeout(init,0);}
else new MutationObserver((_,o)=>{
if(document.body){o.disconnect();setTimeout(init,0);}
}).observe(document.documentElement,{childList:true});

})();
