// modules/phone/apps/sangzap/chat.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.chat) return;

    const C = {};
    const POLL_MS = 1500;
    const TYPING_TTL = 4000;

    let _timer = null;
    let _typingTimer = null;
    let _chatId = null;
    let _myNumber = null;
    let _onUpdate = null;
    let _lastMsgTs = 0;
    let _typingSent = 0;

    // ═══ FETCH ═══
    async function fetchMessages(sinceTs) {
        const path = `/sangzap_chats/${_chatId}/messages`;
        const url = sinceTs
            ? `${path}?where=${encodeURIComponent(`sentAt > ${sinceTs}`)}&orderBy=${encodeURIComponent('sentAt asc')}`
            : `${path}?orderBy=${encodeURIComponent('sentAt asc')}&pageSize=120`;
        try {
            const docs = await ctx.bridge.firestore.request('GET', url);
            return docs.map(d => ({ id: d.id, ...d.data })).filter(Boolean);
        } catch(e) {
            console.warn('[Sangzap/chat] fetch falhou:', e);
            return [];
        }
    }

    async function postMessage(payload) {
        const doc = {
            from: _myNumber,
            kind: payload.kind || 'text',
            body: S.sanitize(payload.body || ''),
            sentAt: Date.now(),
            deliveredAt: null,
            readAt: null,
            ...(payload.audio ? { audio: payload.audio, mime: payload.mime, size: payload.size } : {}),
            ...(payload.media ? { media: payload.media, mime: payload.mime, size: payload.size } : {})
        };
        const msgId = S.msgId();
        await ctx.bridge.firestore.request('POST', `/sangzap_chats/${_chatId}/messages?documentId=${msgId}`, doc);
        await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${_chatId}`, {
            lastMessage: S.preview(doc),
            lastMessageAt: doc.sentAt,
            updatedAt: doc.sentAt
        });
        return { id: msgId, ...doc };
    }

    async function markRead(msgs) {
        const toMark = msgs.filter(m => m.from !== _myNumber && !m.readAt);
        if (!toMark.length) return;
        await Promise.all(toMark.map(m =>
            ctx.bridge.firestore.request('PATCH',
                `/sangzap_chats/${_chatId}/messages/${m.id}`,
                { readAt: Date.now() }
            ).catch(() => {})
        ));
    }

    // ═══ TYPING (RTDB) ═══
    function sendTyping() {
        const now = Date.now();
        if (now - _typingSent < TYPING_TTL / 2) return;
        _typingSent = now;
        try {
            ctx.bridge.rtdb.put(`sangzap/typing/${_chatId}/${_myNumber}`, { on: 1, ts: now });
        } catch(_) {}
    }
    async function fetchTyping() {
        try {
            const data = await ctx.bridge.rtdb.get(`sangzap/typing/${_chatId}`);
            if (!data) return [];
            const now = Date.now();
            const out = [];
            for (const [num, v] of Object.entries(data)) {
                if (num === _myNumber) continue;
                if (v && v.on && (now - (v.ts || 0)) < TYPING_TTL) out.push(num);
            }
            return out;
        } catch(_) { return []; }
    }

    // ═══ POLL ═══
    async function tick() {
        try {
            const msgs = await fetchMessages(_lastMsgTs);
            if (msgs.length) {
                _lastMsgTs = Math.max(...msgs.map(m => m.sentAt || 0));
                await markRead(msgs);
            }
            const all = await fetchMessages(0);
            const typing = await fetchTyping();
            _onUpdate?.(all, typing);
        } catch(e) {
            console.warn('[Sangzap/chat] tick:', e);
        }
    }

    // ═══ PUBLIC ═══
    C.open = function(chatId, myNumber, onUpdate) {
        C.close();
        _chatId = chatId;
        _myNumber = myNumber;
        _onUpdate = onUpdate;
        _lastMsgTs = 0;
        tick();
        _timer = setInterval(tick, POLL_MS);
    };
    C.close = function() {
        if (_timer) { clearInterval(_timer); _timer = null; }
        if (_typingTimer) { clearTimeout(_typingTimer); _typingTimer = null; }
        _chatId = null;
        _onUpdate = null;
    };
    C.send = function(text) {
        if (!_chatId) return Promise.resolve(null);
        return postMessage({ kind: 'text', body: text });
    };
    C.typing = function() {
        if (!_chatId) return;
        sendTyping();
        if (_typingTimer) clearTimeout(_typingTimer);
        _typingTimer = setTimeout(() => {
            try { ctx.bridge.rtdb.put(`sangzap/typing/${_chatId}/${_myNumber}`, { on: 0, ts: Date.now() }); } catch(_) {}
        }, TYPING_TTL);
    };
    C.chatId = () => _chatId;

    S.chat = C;
})();
