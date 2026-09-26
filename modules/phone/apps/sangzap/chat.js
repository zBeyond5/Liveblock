// modules/phone/apps/sangzap/chat.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.chat) return;

    (function ensureFsHelpers() {
        if (S.__fsFull) return;
        S.__fsFull = true;

        function toFs(v) {
            if (v === null || v === undefined) return { nullValue: null };
            if (typeof v === 'string')  return { stringValue: v };
            if (typeof v === 'boolean') return { booleanValue: v };
            if (typeof v === 'number')  return Number.isInteger(v)
                ? { integerValue: String(v) }
                : { doubleValue: v };
            if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
            if (typeof v === 'object') {
                const fields = {};
                for (const k in v) fields[k] = toFs(v[k]);
                return { mapValue: { fields } };
            }
            return { nullValue: null };
        }

        function fromFs(v) {
            if (!v || typeof v !== 'object') return null;
            if ('nullValue' in v)      return null;
            if ('stringValue' in v)    return v.stringValue;
            if ('booleanValue' in v)   return v.booleanValue;
            if ('integerValue' in v)   return parseInt(v.integerValue, 10);
            if ('doubleValue' in v)    return v.doubleValue;
            if ('timestampValue' in v) return v.timestampValue;
            if ('arrayValue' in v)     return (v.arrayValue?.values || []).map(fromFs);
            if ('mapValue' in v) {
                const out = {};
                const f = v.mapValue?.fields || {};
                for (const k in f) out[k] = fromFs(f[k]);
                return out;
            }
            return null;
        }

        // Sobe o valor / parseDoc do hub pro nível completo. Não quebra
        // contacts/calls porque pra primitivos o resultado é idêntico.
        try {
            ctx.bridge.firestore.value = toFs;
            ctx.bridge.firestore.parseDoc = function(doc) {
                const out = {};
                const fields = doc?.fields || {};
                for (const k in fields) out[k] = fromFs(fields[k]);
                return out;
            };
        } catch(_) {}

        S.fsWrite = async function(path, payload, extraQuery) {
            const fields = {};
            for (const k in payload) fields[k] = toFs(payload[k]);
            const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&');
            const q = extraQuery ? (extraQuery + '&' + mask) : mask;
            return ctx.bridge.firestore.request('PATCH', path, { fields }, q);
        };

        S.fsCreate = async function(collectionPath, payload, docId) {
            const fields = {};
            for (const k in payload) fields[k] = toFs(payload[k]);
            const url = docId
                ? `${collectionPath}?documentId=${encodeURIComponent(docId)}`
                : collectionPath;
            return ctx.bridge.firestore.request('POST', url, { fields });
        };

        S.fsGet = async function(path) {
            const raw = await ctx.bridge.firestore.request('GET', path);
            if (!raw) return null;
            if (Array.isArray(raw.documents)) {
                return raw.documents.map(d => ({
                    id: d.name.split('/').pop(),
                    ...ctx.bridge.firestore.parseDoc(d)
                }));
            }
            if (raw.fields) {
                return {
                    id: (raw.name || '').split('/').pop(),
                    ...ctx.bridge.firestore.parseDoc(raw)
                };
            }
            return null;
        };

        S.fsDel = async function(path) {
            return ctx.bridge.firestore.request('DELETE', path);
        };
    })();

    const C = {};

    // ═══ CONFIG ═══
    const POLL_MS         = 1500;
    const TYPING_TTL      = 4000;
    const EDIT_WINDOW     = 15 * 60 * 1000;
    const PAGE_SIZE       = 40;
    const FETCH_SIZE      = 300;
    const DOUBLE_TAP_MS   = 280;
    const LONG_PRESS_MS   = 420;
    const LS_DELETED      = 'sangzap_deleted_for_me';
    const LS_QUEUE        = 'sangzap_offline_queue';
    const IMAGE_MAX_W     = 1280;
    const IMAGE_QUALITY   = 0.85;
    const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
    const MAX_DOC_BYTES   = 8 * 1024 * 1024;

    // ═══ STATE ═══
    let _root = null;
    let _threadEl = null;
    let _timer = null;
    let _typingTimer = null;
    let _presenceTimer = null;
    let _chatId = null;
    let _myNumber = null;
    let _meta = {};
    let _messages = [];
    let _byId = new Map();
    let _exhausted = false;
    let _typingUsers = [];
    let _reply = null;
    let _editing = null;
    let _pending = new Map();
    let _failed = new Map();
    let _selection = new Set();
    let _selectionMode = false;
    let _online = navigator.onLine !== false;
    let _draining = false;
    let _draftByChat = loadJSON('sangzap_drafts', {});

    // ═══ LOCAL STORAGE ═══
    function loadJSON(key, dflt) {
        try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : dflt; }
        catch(_) { return dflt; }
    }
    function saveJSON(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch(_) {}
    }
    function loadDeleted() {
        const r = loadJSON(LS_DELETED, []);
        return new Set(Array.isArray(r) ? r : []);
    }
    let _deletedForMe = loadDeleted();
    function saveDeleted() { saveJSON(LS_DELETED, [..._deletedForMe]); }

    function loadQueue() {
        const q = loadJSON(LS_QUEUE, []);
        return Array.isArray(q) ? q : [];
    }
    function saveQueue(q) { saveJSON(LS_QUEUE, q); }

    function saveDraft(text) {
        if (!_chatId) return;
        if (text && text.trim()) _draftByChat[_chatId] = text;
        else delete _draftByChat[_chatId];
        saveJSON('sangzap_drafts', _draftByChat);
    }

    // ═══ HELPERS ═══
    function authorName(m) {
        if (!m) return '';
        if (m.from === _myNumber) return 'Você';
        return _meta.nameFor ? _meta.nameFor(m.from) : S.shortNum(m.from);
    }

    function isNearBottom(slack) {
        if (!_threadEl) return true;
        return _threadEl.scrollHeight - _threadEl.scrollTop - _threadEl.clientHeight < (slack || 40);
    }
    function scrollToBottom(smooth) {
        if (!_threadEl) return;
        _threadEl.scrollTo({ top: _threadEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }

    function visibleMessages() {
        return _messages.filter(m => !_deletedForMe.has(m.id));
    }

    function escape(s) { return S.escape ? S.escape(s) : String(s ?? ''); }

    function renderText(raw, opts) {
        if (S.renderText) return S.renderText(raw, opts || { myName: _meta.myName });
        return escape(raw || '');
    }

    function withDateSeparators(msgs) {
        if (S.withDateSeparators) return S.withDateSeparators(msgs);
        return msgs;
    }

    // ═══ OFFLINE / CONNECTING ═══
    function bindOnline() {
        window.addEventListener('online', () => { _online = true; updateConnBar(); drainQueue(); });
        window.addEventListener('offline', () => { _online = false; updateConnBar(); });
        updateConnBar();
    }
    function updateConnBar() {
        const bar = _root?.querySelector('.sz-conn-bar');
        if (!bar) return;
        bar.classList.toggle('on', !_online);
        bar.textContent = _online ? '' : 'Conectando…';
    }

    // ═══ OFFLINE QUEUE ═══
    function enqueue(tmpId, chatId, payload, kind) {
        const q = loadQueue();
        q.push({ tmpId, chatId, payload, kind, ts: Date.now() });
        saveQueue(q);
    }
    function dequeue(tmpId) {
        const q = loadQueue().filter(x => x.tmpId !== tmpId);
        saveQueue(q);
    }
    async function drainQueue() {
        if (_draining || !_chatId) return;
        _draining = true;
        const q = loadQueue().filter(x => x.chatId === _chatId);
        for (const item of q) {
            try {
                const saved = await postMessage(item.payload, item.tmpId);
                dequeue(item.tmpId);
                const tmp = _messages.find(m => m.id === item.tmpId);
                if (tmp) {
                    const idx = _messages.indexOf(tmp);
                    _messages[idx] = saved;
                    _byId.delete(item.tmpId);
                    _byId.set(saved.id, saved);
                }
                _pending.delete(item.tmpId);
                _failed.delete(item.tmpId);
            } catch(_) {}
        }
        _draining = false;
        renderThread({ stickToBottom: true });
    }

    // ═══ FETCH ═══
    // Firestore REST não aceita `where=campo > valor` em query string.
    // Buscamos os últimos N documentos com orderBy + pageSize, filtramos no cliente.
    async function fetchRaw() {
        const path = `/sangzap_chats/${_chatId}/messages?orderBy=${encodeURIComponent('sentAt desc')}&pageSize=${FETCH_SIZE}`;
        try {
            let arr = await S.fsGet(path);
            if (!Array.isArray(arr)) arr = arr ? [arr] : [];
            arr.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
            return arr;
        } catch(e) {
            console.warn('[Sangzap/chat] fetchRaw:', e.message || e);
            return [];
        }
    }
    async function fetchPage(beforeTs) {
        const all = await fetchRaw();
        if (!beforeTs) return all.slice(-PAGE_SIZE);
        return all.filter(m => (m.sentAt || 0) < beforeTs).slice(-PAGE_SIZE);
    }
    async function fetchSince(ts) {
        const all = await fetchRaw();
        return ts ? all.filter(m => (m.sentAt || 0) > ts) : all;
    }

    // ═══ SEND — primitives ═══
    function buildDoc(payload, sentAt) {
        const base = {
            from: _myNumber,
            kind: payload.kind || 'text',
            body: S.sanitize ? S.sanitize(payload.body || '') : (payload.body || ''),
            sentAt: sentAt || Date.now(),
            deliveredAt: null,
            readAt: null
        };
        if (payload.replyTo) base.replyTo = payload.replyTo;
        if (payload.mentions && payload.mentions.length) base.mentions = payload.mentions;
        if (payload.forwarded) base.forwarded = 1;
        if (payload.storyId) base.storyId = payload.storyId;
        if (payload.audio) {
            base.audio = payload.audio;
            base.mime = payload.mime;
            base.size = payload.size;
            base.duration = payload.duration;
            if (Array.isArray(payload.waveform)) base.waveform = payload.waveform;
            if (Array.isArray(payload.peaks))     base.waveform = payload.peaks;
        }
        if (payload.media) {
            base.media = payload.media;
            base.mime = payload.mime;
            base.size = payload.size;
            if (payload.width)  base.width  = payload.width;
            if (payload.height) base.height = payload.height;
            if (payload.caption) base.caption = S.sanitize ? S.sanitize(payload.caption) : payload.caption;
        }
        if (payload.filename) base.filename = payload.filename;
        if (payload.thumb) base.thumb = payload.thumb;
        if (payload.lat != null) { base.lat = payload.lat; base.lng = payload.lng; }
        if (payload.place) base.place = payload.place;
        if (payload.contact) base.contact = payload.contact;
        return base;
    }

    async function postMessage(payload, tmpId) {
        const doc = buildDoc(payload);
        const msgId = S.msgId();
        await S.fsCreate(`/sangzap_chats/${_chatId}/messages`, doc, msgId);
        await S.fsWrite(`/sangzap_chats/${_chatId}`, {
            lastMessage: S.preview ? S.preview(doc) : (doc.body || ''),
            lastMessageAt: doc.sentAt,
            updatedAt: doc.sentAt
        });
        return { id: msgId, ...doc };
    }

    async function updateChatPreview() {
        const last = _messages[_messages.length - 1];
        if (!last) return;
        try {
            await S.fsWrite(`/sangzap_chats/${_chatId}`, {
                lastMessage: S.preview ? S.preview(last) : (last.body || ''),
                lastMessageAt: last.sentAt,
                updatedAt: Date.now()
            });
        } catch(_) {}
    }

    // ═══ MARK DELIVERED / READ ═══
    async function markDelivered(msgs) {
        const toMark = msgs.filter(m => m.from !== _myNumber && !m.deliveredAt && !m.deletedAt);
        if (!toMark.length) return;
        await Promise.all(toMark.map(m =>
            S.fsWrite(`/sangzap_chats/${_chatId}/messages/${m.id}`, { deliveredAt: Date.now() }).catch(() => {})
        ));
    }
    async function markRead(msgs) {
        const toMark = msgs.filter(m => m.from !== _myNumber && !m.readAt && !m.deletedAt);
        if (!toMark.length) return;
        await Promise.all(toMark.map(m =>
            S.fsWrite(`/sangzap_chats/${_chatId}/messages/${m.id}`, { readAt: Date.now() }).catch(() => {})
        ));
    }

    // ═══ EDIT / DELETE / REACT ═══
    async function editMessage(msgId, newBody) {
        await S.fsWrite(`/sangzap_chats/${_chatId}/messages/${msgId}`, {
            body: S.sanitize ? S.sanitize(newBody) : newBody,
            editedAt: Date.now()
        });
        await updateChatPreview();
    }
    async function deleteForEveryone(msgId) {
        await S.fsWrite(`/sangzap_chats/${_chatId}/messages/${msgId}`, {
            body: '',
            deletedAt: Date.now(),
            audio: null,
            media: null,
            reactions: null,
            waveform: null
        });
        await updateChatPreview();
    }
    function deleteForMe(msgId) {
        _deletedForMe.add(msgId);
        saveDeleted();
    }
    async function toggleReaction(msgId, emoji) {
        const m = _byId.get(msgId);
        if (!m) return;
        const reactions = Object.assign({}, m.reactions || {});
        const list = Array.isArray(reactions[emoji]) ? reactions[emoji].slice() : [];
        const i = list.indexOf(_myNumber);
        if (i >= 0) list.splice(i, 1); else list.push(_myNumber);
        if (list.length) reactions[emoji] = list; else delete reactions[emoji];
        m.reactions = reactions;
        renderThread();
        try {
            await S.fsWrite(`/sangzap_chats/${_chatId}/messages/${msgId}`, { reactions });
        } catch(e) { console.warn('[Sangzap/chat] react:', e); }
    }

    // ═══ TYPING / PRESENCE (RTDB — o hub já lida com auth) ═══
    let _typingSent = 0;
    function sendTyping() {
        if (!_chatId) return;
        const now = Date.now();
        if (now - _typingSent < TYPING_TTL / 2) return;
        _typingSent = now;
        try { ctx.bridge.rtdb.put(`sangzap/typing/${_chatId}/${_myNumber}`, { on: 1, ts: now }); } catch(_) {}
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
    function beatPresence() {
        try { ctx.bridge.rtdb.put(`sangzap/presence/${_myNumber}`, { online: 1, lastSeen: Date.now() }); } catch(_) {}
    }

    // ═══ POLL ═══
    async function tick() {
        if (!_chatId) return;
        if (!_online) { updateConnBar(); return; }
        try {
            const newest = _messages.length ? _messages[_messages.length - 1].sentAt : 0;
            const fresh = await fetchSince(newest);
            if (fresh.length) {
                for (const m of fresh) {
                    if (!_byId.has(m.id)) {
                        _messages.push(m);
                        _byId.set(m.id, m);
                        if (m.from !== _myNumber) playIncoming(m);
                    }
                }
                _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
                await markDelivered(fresh);
                await markRead(fresh);
                renderThread({ stickToBottom: isNearBottom() });
            }
            _typingUsers = await fetchTyping();
            renderTyping();
            drainQueue();
        } catch(e) { console.warn('[Sangzap/chat] tick:', e); }
    }

    function playIncoming(m) {
        if (document.hidden) return;
        try {
            if (m.muted) return;
            if (m.kind === 'audio') ctx.tone?.recSend?.(); else ctx.tone?.notify?.();
        } catch(_) {}
        try { navigator.vibrate?.(30); } catch(_) {}
    }

    // ═══ RENDER — thread ═══
    function renderThread(opts) {
        opts = opts || {};
        if (!_threadEl) return;
        const stick = opts.stickToBottom || isNearBottom();
        const msgs = visibleMessages();
        const decorated = withDateSeparators(msgs);
        const prevH = _threadEl.scrollHeight;

        _threadEl.innerHTML = decorated.map((m, i) => {
            if (m._sep) return renderDateSep(m);
            return renderRow(m, i, decorated);
        }).join('');

        _threadEl.querySelectorAll('.sz-audio-container[data-msgid]').forEach(el => {
            const msg = _byId.get(el.dataset.msgid);
            // audio.js expõe renderInto(bubble, msg) — não renderPlayer.
            if (msg && S.audio?.renderInto) {
                try { S.audio.renderInto(el, msg); } catch(_) {}
            }
        });

        if (stick) scrollToBottom(false);
        else _threadEl.scrollTop = _threadEl.scrollHeight - prevH + _threadEl.scrollTop;

        updateScrollBtn();
        updateSelBar();
    }

    function renderDateSep(sep) {
        return `<div class="sz-date-sep"><span>${escape(sep.label)}</span></div>`;
    }

    function groupedStatus(m, idx, list) {
        const prev = list[idx - 1];
        const next = list[idx + 1];
        const samePrev = prev && !prev._sep && prev.from === m.from && !prev.deletedAt;
        const sameNext = next && !next._sep && next.from === m.from && !next.deletedAt;
        return { head: !samePrev, tail: !sameNext, tight: samePrev };
    }

    function renderRow(m, idx, list) {
        const me = m.from === _myNumber;
        const pending = _pending.has(m.id);
        const failed = _failed.has(m.id);
        const g = groupedStatus(m, idx, list);
        const cls = [
            'sz-row', me ? 'me' : 'them',
            g.head ? 'head' : '', g.tail ? 'tail' : '', g.tight ? 'tight' : '',
            pending ? 'pending' : '', failed ? 'failed' : '',
            m.deletedAt ? 'deleted' : '',
            _selection.has(m.id) ? 'selected' : '',
            m.kind ? 'kind-' + m.kind : ''
        ].filter(Boolean).join(' ');

        const showAuthor = !me && _meta.kind === 'group' && g.head;
        const author = showAuthor ? `<div class="sz-author">${escape(authorName(m))}</div>` : '';
        const reply = m.replyTo ? renderReplyQuote(m) : '';
        const body = renderBody(m);
        const meta = renderMeta(m, pending, failed);
        const reactions = renderReactions(m);

        return `<div class="${cls}" data-id="${escape(m.id)}" data-from="${escape(m.from || '')}">
            <div class="sz-bubble">
                ${author}
                ${reply}
                <div class="sz-body">${body}</div>
                ${meta}
                ${reactions}
                ${failed ? `<button class="sz-retry" data-act="retry" data-id="${escape(m.id)}" type="button">↻ Reenviar</button>` : ''}
            </div>
        </div>`;
    }

    function renderReplyQuote(m) {
        const t = _byId.get(m.replyTo);
        if (!t) return '';
        const author = t.from === _myNumber ? 'Você' : authorName(t);
        const preview = t.deletedAt
            ? 'Mensagem apagada'
            : (t.kind === 'audio' ? '🎤 Áudio'
                : t.kind === 'image' ? '📷 Imagem'
                : t.kind === 'video' ? '🎬 Vídeo'
                : t.kind === 'doc'   ? '📄 Documento'
                : t.kind === 'location' ? '📍 Localização'
                : t.kind === 'contact'  ? '👤 Contato'
                : (t.body || ''));
        return `<button class="sz-quote" data-act="jump" data-reply-to="${escape(t.id)}" type="button">
            <div class="sz-quote-author">${escape(author)}</div>
            <div class="sz-quote-body">${escape(preview.slice(0, 120))}</div>
        </button>`;
    }

    function renderBody(m) {
        if (m.deletedAt) return `<span class="sz-deleted">🚫 Mensagem apagada</span>`;
        if (m.kind === 'audio') {
            return `<div class="sz-audio-container" data-msgid="${escape(m.id)}"></div>`;
        }
        if (m.kind === 'image') {
            const caption = m.caption ? `<div class="sz-caption">${renderText(m.caption)}</div>` : '';
            return `<div class="sz-image-wrap" data-act="lightbox" data-msgid="${escape(m.id)}">
                <img src="${escape(m.media || '')}" alt="" loading="lazy">
            </div>${caption}`;
        }
        if (m.kind === 'video') {
            const poster = m.thumb ? ` poster="${escape(m.thumb)}"` : '';
            const caption = m.caption ? `<div class="sz-caption">${renderText(m.caption)}</div>` : '';
            return `<div class="sz-video-wrap"><video controls preload="metadata" src="${escape(m.media || '')}"${poster}></video></div>${caption}`;
        }
        if (m.kind === 'doc') {
            const name = m.filename || 'Documento';
            const size = m.size ? S.fmtBytes(m.size) : '';
            return `<button class="sz-doc" data-act="open-doc" data-msgid="${escape(m.id)}" type="button">
                <span class="sz-doc-ico">📄</span>
                <span class="sz-doc-info">
                    <span class="sz-doc-name">${escape(name)}</span>
                    <span class="sz-doc-size">${escape(size)}</span>
                </span>
            </button>`;
        }
        if (m.kind === 'location') {
            const lat = m.lat, lng = m.lng;
            const place = m.place ? `<div class="sz-loc-place">${escape(m.place)}</div>` : '';
            const img = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=400x200&markers=${lat},${lng},red-pushpin`;
            return `<button class="sz-loc" data-act="open-loc" data-lat="${lat}" data-lng="${lng}" type="button">
                <span class="sz-loc-img"><img src="${escape(img)}" alt="" loading="lazy" onerror="this.style.display='none'"></span>
                ${place}
                <span class="sz-loc-coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            </button>`;
        }
        if (m.kind === 'contact') {
            const c = m.contact || {};
            return `<button class="sz-contact" data-act="open-contact" data-num="${escape(c.number || '')}" type="button">
                <span class="sz-contact-av">${escape((c.name || '?')[0].toUpperCase())}</span>
                <span class="sz-contact-info">
                    <span class="sz-contact-name">${escape(c.name || '')}</span>
                    <span class="sz-contact-num">${escape(S.shortNum ? S.shortNum(c.number) : c.number)}</span>
                </span>
            </button>`;
        }
        if (m.kind === 'story-reply') {
            return `<div class="sz-story-reply"><span class="sz-story-tag">respondeu ao story</span>${renderText(m.body || '')}</div>`;
        }
        const forwarded = m.forwarded ? `<div class="sz-forwarded"><span>↪</span> Encaminhada</div>` : '';
        return forwarded + `<div class="sz-text">${renderText(m.body || '')}</div>`;
    }

    function renderMeta(m, pending, failed) {
        const t = S.fmtTime ? S.fmtTime(m.sentAt || Date.now()) : '';
        let status = '';
        if (m.from === _myNumber && !m.deletedAt) {
            if (pending) status = '<span class="sz-tick pending" title="Enviando">🕑</span>';
            else if (failed) status = '<span class="sz-tick failed" title="Falhou">⚠</span>';
            else if (m.readAt) status = '<span class="sz-tick read">✓✓</span>';
            else if (m.deliveredAt) status = '<span class="sz-tick delivered">✓✓</span>';
            else status = '<span class="sz-tick">✓</span>';
        }
        const edited = m.editedAt ? '<span class="sz-edited">editada</span>' : '';
        return `<div class="sz-meta">${edited}<span>${escape(t)}</span>${status}</div>`;
    }

    function renderReactions(m) {
        const r = m.reactions || {};
        const entries = Object.entries(r).filter(([, list]) => Array.isArray(list) && list.length);
        if (!entries.length) return '';
        return `<div class="sz-reactions">${entries.map(([emoji, list]) => {
            const mine = list.includes(_myNumber) ? ' mine' : '';
            return `<button class="sz-react${mine}" data-act="react-tap" data-react="${escape(m.id)}" data-emoji="${escape(emoji)}" type="button">
                <span>${escape(emoji)}</span>${list.length > 1 ? `<span class="sz-react-n">${list.length}</span>` : ''}
            </button>`;
        }).join('')}</div>`;
    }

    function renderTyping() {
        const el = _root?.querySelector('.sz-typing');
        if (!el) return;
        if (!_typingUsers.length) { el.classList.remove('on'); el.textContent = ''; return; }
        el.classList.add('on');
        const names = _typingUsers.map(n => _meta.nameFor ? _meta.nameFor(n) : S.shortNum(n));
        if (names.length === 1) el.textContent = `${names[0]} digitando…`;
        else if (names.length === 2) el.textContent = `${names[0]} e ${names[1]} digitando…`;
        else el.textContent = `${names.length} pessoas digitando…`;
    }

    function updateScrollBtn() {
        const btn = _root?.querySelector('.sz-scroll-btn');
        if (!btn) return;
        btn.classList.toggle('on', !isNearBottom(120));
    }

    function updateSelBar() {
        const bar = _root?.querySelector('.sz-sel-bar');
        if (!bar) return;
        bar.classList.toggle('on', _selectionMode);
        const cnt = bar.querySelector('.sz-sel-count');
        if (cnt) cnt.textContent = String(_selection.size);
        const del = bar.querySelector('[data-act="sel-delete"]');
        const fwd = bar.querySelector('[data-act="sel-forward"]');
        if (del) del.disabled = _selection.size === 0;
        if (fwd) fwd.disabled = _selection.size === 0;
    }

    // ═══ CONTEXT MENU ═══
    function openMenu(msgId, x, y) {
        closeMenu();
        const m = _byId.get(msgId);
        if (!m) return;
        const me = m.from === _myNumber;
        const canEdit = me && !m.deletedAt && m.kind === 'text'
            && (Date.now() - (m.sentAt || 0)) < EDIT_WINDOW;
        const items = [
            { act: 'reply', label: 'Responder' },
            { act: 'react', label: 'Reagir' }
        ];
        if (!m.deletedAt && m.body) items.push({ act: 'copy', label: 'Copiar' });
        if (!m.deletedAt) {
            items.push({ act: 'forward', label: 'Encaminhar' });
            items.push({ act: 'select', label: 'Selecionar' });
        }
        if (canEdit) items.push({ act: 'edit', label: 'Editar' });
        if (!m.deletedAt) {
            items.push({ act: 'delete-me', label: 'Apagar para mim' });
            if (me) items.push({ act: 'delete-all', label: 'Apagar para todos', danger: true });
        }

        const menu = document.createElement('div');
        menu.className = 'sz-menu';
        menu.style.left = Math.min(x, innerWidth - 180) + 'px';
        menu.style.top = Math.min(y, innerHeight - 40 - items.length * 40) + 'px';
        menu.innerHTML = items.map(it =>
            `<button data-act="${it.act}" class="${it.danger ? 'danger' : ''}" type="button">${it.label}</button>`
        ).join('');
        menu.addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            e.stopPropagation();
            handleMenuAction(b.dataset.act, msgId);
            closeMenu();
        });
        document.body.appendChild(menu);
        setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
    }
    function closeMenu() { document.querySelectorAll('.sz-menu').forEach(m => m.remove()); }

    async function handleMenuAction(act, msgId) {
        const m = _byId.get(msgId);
        if (!m) return;
        if (act === 'reply') { setReply(m); return; }
        if (act === 'copy') {
            try { await navigator.clipboard.writeText(m.body || ''); ctx.toast?.('Copiado', 'ok'); } catch(_) {}
            return;
        }
        if (act === 'select') { enterSelection(msgId); return; }
        if (act === 'react') { openReactionPicker(msgId); return; }
        if (act === 'forward') { forwardOne(m); return; }
        if (act === 'edit') { setEditing(m); return; }
        if (act === 'delete-me') { deleteForMe(msgId); renderThread(); return; }
        if (act === 'delete-all') {
            try { await deleteForEveryone(msgId); ctx.toast?.('Apagada para todos', 'ok'); renderThread(); }
            catch(_) { ctx.toast?.('Falha ao apagar', 'err'); }
            return;
        }
    }

    // ═══ REACTION PICKER ═══
    function openReactionPicker(msgId) {
        const picker = document.createElement('div');
        picker.className = 'sz-react-picker';
        const emojis = S.recentEmojis || ['❤️', '😂', '😮', '😢', '👏', '🔥', '👍', '🎉'];
        picker.innerHTML = emojis.map(e => `<button data-emoji="${escape(e)}" type="button">${e}</button>`).join('');
        picker.addEventListener('click', async e => {
            const b = e.target.closest('button[data-emoji]');
            if (!b) return;
            e.stopPropagation();
            await toggleReaction(msgId, b.dataset.emoji);
            picker.remove();
        });
        document.body.appendChild(picker);
        setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 0);
    }

    // ═══ REPLY / EDIT ═══
    function setReply(m) {
        _reply = { id: m.id, from: m.from };
        _editing = null;
        renderComposer();
        _root?.querySelector('.sz-input')?.focus();
    }
    function clearReply() { _reply = null; renderComposer(); }
    function setEditing(m) {
        _editing = { id: m.id, body: m.body || '' };
        _reply = null;
        renderComposer();
        const inp = _root?.querySelector('.sz-input');
        if (inp) { inp.value = m.body || ''; inp.focus(); autoGrow(inp); }
    }
    function clearEditing() {
        _editing = null;
        renderComposer();
        const inp = _root?.querySelector('.sz-input');
        if (inp) { inp.value = ''; autoGrow(inp); }
    }

    function renderComposer() {
        const bar = _root?.querySelector('.sz-composer-bar');
        if (!bar) return;
        if (_editing) {
            bar.classList.add('on');
            bar.innerHTML = `<div class="sz-bar-ico">✎</div>
                <div class="sz-bar-text">
                    <div class="sz-bar-title">Editando</div>
                    <div class="sz-bar-body">${escape((_editing.body || '').slice(0, 100))}</div>
                </div>
                <button class="sz-bar-x" data-act="cancel-edit" type="button">✕</button>`;
        } else if (_reply) {
            bar.classList.add('on');
            const target = _byId.get(_reply.id);
            const author = target ? authorName(target) : '';
            const preview = target ? (target.kind === 'audio' ? '🎤 Áudio'
                : target.kind === 'image' ? '📷 Imagem'
                : (target.body || '').slice(0, 100)) : '';
            bar.innerHTML = `<div class="sz-bar-ico">↩</div>
                <div class="sz-bar-text">
                    <div class="sz-bar-title">${escape(author)}</div>
                    <div class="sz-bar-body">${escape(preview)}</div>
                </div>
                <button class="sz-bar-x" data-act="cancel-reply" type="button">✕</button>`;
        } else {
            bar.classList.remove('on');
            bar.innerHTML = '';
        }
    }

    // ═══ SEND FLOW — TEXT (optimistic) ═══
    async function sendText(text) {
        if (!text || !text.trim()) return;
        if (_editing) {
            const id = _editing.id;
            const m = _byId.get(id);
            if (m) m.body = text;
            clearEditing();
            renderThread();
            try { await editMessage(id, text); }
            catch(_) { ctx.toast?.('Falha ao editar', 'err'); }
            return;
        }

        const tmpId = 'tmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const mentions = S.extractMentions ? S.extractMentions(text) : [];
        const reply = _reply ? _reply.id : null;
        const pending = {
            id: tmpId,
            from: _myNumber,
            kind: 'text',
            body: text,
            sentAt: Date.now(),
            replyTo: reply || undefined,
            mentions: mentions.length ? mentions : undefined
        };
        _pending.set(tmpId, pending);
        _messages.push(pending);
        _byId.set(tmpId, pending);
        _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
        clearReply();
        renderThread({ stickToBottom: true });

        const payload = {
            kind: 'text',
            body: text,
            replyTo: reply || undefined,
            mentions: mentions.length ? mentions : undefined
        };

        if (!_online) {
            enqueue(tmpId, _chatId, payload, 'text');
            return;
        }

        try {
            const saved = await postMessage(payload, tmpId);
            _pending.delete(tmpId);
            _byId.delete(tmpId);
            _messages = _messages.filter(x => x.id !== tmpId);
            _messages.push(saved);
            _byId.set(saved.id, saved);
            _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
            try { ctx.tone?.send?.(); } catch(_) {}
            renderThread({ stickToBottom: true });
        } catch(e) {
            console.warn('[Sangzap/chat] send falhou:', e);
            _pending.delete(tmpId);
            _failed.set(tmpId, pending);
            renderThread();
            ctx.toast?.('Falha ao enviar', 'err');
        }
    }

    async function retrySend(tmpId) {
        const msg = _failed.get(tmpId);
        if (!msg) return;
        _failed.delete(tmpId);
        _pending.set(tmpId, msg);
        renderThread();
        const payload = {
            kind: msg.kind,
            body: msg.body,
            replyTo: msg.replyTo,
            mentions: msg.mentions
        };
        try {
            const saved = await postMessage(payload, tmpId);
            _pending.delete(tmpId);
            _byId.delete(tmpId);
            _messages = _messages.filter(x => x.id !== tmpId);
            _messages.push(saved);
            _byId.set(saved.id, saved);
            _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
            renderThread({ stickToBottom: true });
        } catch(_) {
            _pending.delete(tmpId);
            _failed.set(tmpId, msg);
            renderThread();
        }
    }

    // ═══ ATTACHMENTS ═══
    function openAttachSheet() {
        const body = _root;
        const sheet = document.createElement('div');
        sheet.className = 'sz-attach-sheet';
        sheet.innerHTML = `
            <button data-kind="image" type="button"><span>📷</span> Foto</button>
            <button data-kind="video" type="button"><span>🎬</span> Vídeo</button>
            <button data-kind="doc"   type="button"><span>📄</span> Documento</button>
            <button data-kind="location" type="button"><span>📍</span> Localização</button>
            <button data-kind="contact"  type="button"><span>👤</span> Contato</button>
            <button class="sz-attach-cancel" data-kind="cancel" type="button">Cancelar</button>
        `;
        body.appendChild(sheet);
        const close = () => sheet.remove();
        sheet.addEventListener('click', e => {
            const b = e.target.closest('button[data-kind]');
            if (!b) return;
            const k = b.dataset.kind;
            close();
            if (k === 'image')    pickFile('image/*');
            if (k === 'video')    pickFile('video/*');
            if (k === 'doc')      pickFile('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv,application/*');
            if (k === 'location') sendLocation();
            if (k === 'contact')  openContactPicker();
        });
        setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
    }

    function pickFile(accept) {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = accept;
        inp.style.cssText = 'position:fixed;top:-100px;left:-100px;width:0;height:0;opacity:0;';
        document.body.appendChild(inp);
        inp.addEventListener('change', () => {
            const f = inp.files?.[0];
            try { inp.remove(); } catch(_) {}
            if (!f) return;
            const mime = f.type || '';
            if (mime.startsWith('image/'))       return previewImage(f);
            if (mime.startsWith('video/'))       return previewVideo(f);
            return previewDoc(f);
        });
        inp.addEventListener('cancel', () => { try { inp.remove(); } catch(_) {} });
        inp.click();
    }

    async function previewImage(file) {
        if (file.size > 20 * 1024 * 1024) { ctx.toast?.('Imagem muito grande', 'err'); return; }
        const data = await readFile(file);
        const img = await loadImage(data.url);
        let w = img.naturalWidth, h = img.naturalHeight;
        let outW = w, outH = h;
        if (w > IMAGE_MAX_W) { outW = IMAGE_MAX_W; outH = Math.round(h * (IMAGE_MAX_W / w)); }
        const canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        const g = canvas.getContext('2d');
        try { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; } catch(_) {}
        g.drawImage(img, 0, 0, outW, outH);
        const media = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
        const size = Math.round(media.length * 0.75);
        if (size > MAX_IMAGE_BYTES) { ctx.toast?.('Imagem muito grande após redimensionar', 'err'); return; }
        URL.revokeObjectURL(data.url);
        openMediaPreview('image', { media, mime: 'image/jpeg', size, width: outW, height: outH });
    }

    async function previewVideo(file) {
        if (file.size > MAX_VIDEO_BYTES) { ctx.toast?.('Vídeo muito grande (máx 10MB)', 'err'); return; }
        const data = await readFile(file);
        openMediaPreview('video', { media: data.dataUrl, mime: file.type, size: file.size });
    }

    async function previewDoc(file) {
        if (file.size > MAX_DOC_BYTES) { ctx.toast?.('Documento muito grande (máx 8MB)', 'err'); return; }
        const data = await readFile(file);
        openMediaPreview('doc', { media: data.dataUrl, mime: file.type || 'application/octet-stream', size: file.size, filename: file.name });
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve({ dataUrl: String(fr.result || ''), url: URL.createObjectURL(file) });
            fr.onerror = reject;
            fr.readAsDataURL(file);
        });
    }
    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = url;
        });
    }

    function openMediaPreview(kind, payload) {
        const body = _root;
        const m = document.createElement('div');
        m.className = 'sz-media-preview';
        const preview = kind === 'image'
            ? `<img src="${escape(payload.media)}" alt="">`
            : kind === 'video'
                ? `<video controls src="${escape(payload.media)}"></video>`
                : `<div class="sz-doc-big">📄<div>${escape(payload.filename || 'Documento')}</div></div>`;
        m.innerHTML = `
            <div class="sz-media-preview-top">
                <button class="sz-media-close" type="button">✕</button>
            </div>
            <div class="sz-media-preview-body">${preview}</div>
            <div class="sz-media-preview-bottom">
                ${kind !== 'doc' ? `<input class="sz-media-caption" type="text" placeholder="Adicione uma legenda…" maxlength="400">` : ''}
                <button class="sz-media-send" type="button">Enviar</button>
            </div>
        `;
        body.appendChild(m);

        m.querySelector('.sz-media-close').addEventListener('click', () => m.remove());
        m.querySelector('.sz-media-send').addEventListener('click', async () => {
            const cap = m.querySelector('.sz-media-caption')?.value.trim() || '';
            m.remove();
            await sendAttachment(kind, payload, cap);
        });
    }

    async function sendAttachment(kind, payload, caption) {
        const tmpId = 'tmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const previewMsg = {
            id: tmpId,
            from: _myNumber,
            kind,
            media: payload.media,
            mime: payload.mime,
            size: payload.size,
            width: payload.width,
            height: payload.height,
            filename: payload.filename,
            caption: caption || undefined,
            sentAt: Date.now()
        };
        _pending.set(tmpId, previewMsg);
        _messages.push(previewMsg);
        _byId.set(tmpId, previewMsg);
        _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
        renderThread({ stickToBottom: true });

        const docPayload = {
            kind,
            media: payload.media,
            mime: payload.mime,
            size: payload.size,
            width: payload.width,
            height: payload.height,
            filename: payload.filename,
            caption: caption || undefined
        };

        if (!_online) { enqueue(tmpId, _chatId, docPayload, kind); return; }

        try {
            const saved = await postMessage(docPayload, tmpId);
            _pending.delete(tmpId);
            _byId.delete(tmpId);
            _messages = _messages.filter(x => x.id !== tmpId);
            _messages.push(saved);
            _byId.set(saved.id, saved);
            _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
            try { ctx.tone?.send?.(); } catch(_) {}
            renderThread({ stickToBottom: true });
        } catch(e) {
            _pending.delete(tmpId);
            _failed.set(tmpId, previewMsg);
            renderThread();
            ctx.toast?.('Falha ao enviar', 'err');
        }
    }

    async function sendLocation() {
        if (!navigator.geolocation) { ctx.toast?.('Localização não disponível', 'err'); return; }
        ctx.toast?.('Obtendo localização…', 'info');
        navigator.geolocation.getCurrentPosition(async pos => {
            const payload = { kind: 'location', lat: pos.coords.latitude, lng: pos.coords.longitude };
            await sendAttachment('location', payload, '');
        }, () => ctx.toast?.('Permissão negada', 'err'), { timeout: 8000 });
    }

    function openContactPicker() {
        // Acessor tolerante do common.js — cobre qualquer nome que contacts.js exponha.
        const contacts = S?.getContacts?.() || [];
        const body = _root;
        const m = document.createElement('div');
        m.className = 'sz-pick-contact';
        m.innerHTML = `
            <div class="sz-pick-contact-card">
                <div class="sz-pick-contact-title">Escolher contato</div>
                <div class="sz-pick-contact-list">
                    ${contacts.length ? contacts.map(c => {
                        const n = c.number || c.num;
                        if (!n) return '';
                        return `<button class="sz-item sz-contact-pick" data-num="${escape(n)}" data-name="${escape(c.name || S.shortNum(n))}" type="button">
                            <div class="sz-avatar"><span class="sz-av-fallback">${escape((c.name || '?')[0].toUpperCase())}</span></div>
                            <div class="sz-item-body">
                                <div class="sz-item-title">${escape(c.name || S.shortNum(n))}</div>
                                <div class="sz-item-preview">${escape(S.shortNum(n))}</div>
                            </div>
                        </button>`;
                    }).join('') : '<div class="sz-empty">Sem contatos</div>'}
                </div>
                <button class="sz-modal-cancel" data-cancel="1" type="button">Cancelar</button>
            </div>
        `;
        body.appendChild(m);
        m.querySelector('[data-cancel]').addEventListener('click', () => m.remove());
        m.querySelectorAll('.sz-contact-pick').forEach(b => b.addEventListener('click', async () => {
            const contact = { name: b.dataset.name, number: b.dataset.num };
            m.remove();
            await sendAttachment('contact', { kind: 'contact', contact }, '');
        }));
    }

    // ═══ LIGHTBOX ═══
    function openLightbox(msgId) {
        const msg = _byId.get(msgId);
        if (!msg || !msg.media) return;
        const overlay = document.createElement('div');
        overlay.className = 'sz-lightbox';
        const isVideo = msg.kind === 'video';
        overlay.innerHTML = `
            <button class="sz-lb-close" type="button">✕</button>
            ${isVideo
                ? `<video src="${escape(msg.media)}" controls autoplay></video>`
                : `<img src="${escape(msg.media)}" alt="">`}
            <button class="sz-lb-save" type="button" title="Abrir em nova aba">↗</button>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => {
            if (e.target.closest('.sz-lb-close, .sz-lb-save')) return;
            if (e.target.tagName === 'IMG') { overlay.classList.toggle('zoomed'); return; }
            overlay.remove();
        });
        overlay.querySelector('.sz-lb-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.sz-lb-save').addEventListener('click', e => {
            e.stopPropagation();
            try {
                const w = window.open();
                if (w) {
                    if (msg.kind === 'video') w.document.write(`<video controls autoplay src="${escape(msg.media)}" style="max-width:100%"></video>`);
                    else w.document.write(`<img src="${escape(msg.media)}" style="max-width:100%">`);
                }
            } catch(_) {}
        });
    }

    // ═══ SELECTION ═══
    function enterSelection(id) {
        _selectionMode = true;
        _selection.clear();
        if (id) _selection.add(id);
        updateSelBar(); renderThread();
    }
    function exitSelection() {
        _selectionMode = false;
        _selection.clear();
        updateSelBar(); renderThread();
    }
    function toggleSelection(id) {
        if (_selection.has(id)) _selection.delete(id); else _selection.add(id);
        if (_selection.size === 0) _selectionMode = false;
        updateSelBar(); renderThread();
    }
    function forwardOne(m) {
        const text = m.body || '';
        if (!text) { ctx.toast?.('Nada para encaminhar', 'err'); return; }
        _meta.onForward?.(m);
    }
    function forwardMany() {
        const list = [..._selection].map(id => _byId.get(id)).filter(Boolean);
        if (!list.length) return;
        _meta.onForwardMany?.(list);
        exitSelection();
    }
    async function deleteMany() {
        const list = [..._selection].map(id => _byId.get(id)).filter(Boolean);
        if (!list.length) return;
        for (const m of list) {
            if (m.from === _myNumber) { try { await deleteForEveryone(m.id); } catch(_) {} }
            else deleteForMe(m.id);
        }
        exitSelection();
        renderThread();
    }

    // ═══ PAGINATION ═══
    async function loadOlder() {
        if (_exhausted || !_chatId) return;
        const first = visibleMessages()[0];
        if (!first || !first.sentAt) return;
        const older = await fetchPage(first.sentAt);
        if (!older.length) { _exhausted = true; return; }
        for (const m of older) {
            if (!_byId.has(m.id)) { _messages.unshift(m); _byId.set(m.id, m); }
        }
        _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
        renderThread();
    }

    // ═══ MENTIONS AUTOCOMPLETE ═══
    function getMentionMembers() {
        if (_meta.kind !== 'group') return [];
        const list = _meta.members || [];
        return list
            .filter(n => n !== _myNumber)
            .map(n => ({ number: n, name: _meta.nameFor ? _meta.nameFor(n) : S.shortNum(n) }));
    }
    function bindMentions(inp) {
        const pop = _root.querySelector('.sz-mention-pop');
        if (!pop) return;
        function filter(term) {
            const members = getMentionMembers();
            if (!members.length) return [];
            const q = term.toLowerCase();
            return members.filter(m => m.name.toLowerCase().includes(q)).slice(0, 6);
        }
        function refresh() {
            const value = inp.value;
            const pos = inp.selectionStart || value.length;
            const before = value.slice(0, pos);
            const m = /@([\w\u00C0-\u017F]*)$/.exec(before);
            if (!m) { pop.classList.remove('on'); return; }
            const items = filter(m[1]);
            if (!items.length) { pop.classList.remove('on'); return; }
            pop.innerHTML = items.map((it, i) =>
                `<button data-name="${escape(it.name)}" data-i="${i}" type="button">${escape(it.name)}</button>`
            ).join('');
            pop.classList.add('on');
        }
        inp.addEventListener('input', refresh);
        inp.addEventListener('blur', () => setTimeout(() => pop.classList.remove('on'), 150));
        pop.addEventListener('click', e => {
            const b = e.target.closest('button[data-name]');
            if (!b) return;
            const value = inp.value;
            const pos = inp.selectionStart || value.length;
            const before = value.slice(0, pos);
            const after = value.slice(pos);
            const replaced = before.replace(/@([\w\u00C0-\u017F]*)$/, '@' + b.dataset.name + ' ');
            inp.value = replaced + after;
            inp.selectionStart = inp.selectionEnd = replaced.length;
            inp.focus();
            pop.classList.remove('on');
            sendTyping();
        });
    }

    // ═══ THREAD EVENTS ═══
    let _pressTimer = null;
    let _lastTapId = null;
    let _lastTapAt = 0;

    function bindThreadEvents() {
        const thread = _threadEl;
        if (!thread) return;

        thread.addEventListener('click', async e => {
            const b = e.target.closest('button[data-act]');
            if (b) {
                const act = b.dataset.act;
                if (act === 'react-tap') {
                    e.stopPropagation();
                    await toggleReaction(b.dataset.react, b.dataset.emoji);
                    return;
                }
                if (act === 'retry') { e.stopPropagation(); retrySend(b.dataset.id); return; }
                if (act === 'jump')  { e.stopPropagation(); scrollToMessage(b.dataset.replyTo); return; }
                if (act === 'lightbox') { e.stopPropagation(); openLightbox(b.dataset.msgid); return; }
                if (act === 'open-doc') {
                    e.stopPropagation();
                    const m = _byId.get(b.dataset.msgid);
                    if (m && m.media) {
                        try { const w = window.open(); if (w) w.location.href = m.media; } catch(_) {}
                    }
                    return;
                }
                if (act === 'open-loc') {
                    e.stopPropagation();
                    const { lat, lng } = b.dataset;
                    try { window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`, '_blank'); } catch(_) {}
                    return;
                }
                if (act === 'open-contact') {
                    e.stopPropagation();
                    _meta.onOpenChat?.(b.dataset.num);
                    return;
                }
            }
            const row = e.target.closest('.sz-row');
            if (!row) return;
            const id = row.dataset.id;
            if (_selectionMode) { toggleSelection(id); return; }
            const now = Date.now();
            if (_lastTapId === id && (now - _lastTapAt) < DOUBLE_TAP_MS) {
                _lastTapId = null;
                await toggleReaction(id, '❤️');
                return;
            }
            _lastTapId = id; _lastTapAt = now;
        });

        thread.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'touch' && e.button !== 0) return;
            const row = e.target.closest('.sz-row');
            if (!row) return;
            const id = row.dataset.id;
            const x = e.clientX, y = e.clientY;
            clearTimeout(_pressTimer);
            _pressTimer = setTimeout(() => {
                if (_selectionMode) return;
                openMenu(id, x, y);
                try { ctx.tone?.key?.(); } catch(_) {}
                try { navigator.vibrate?.(15); } catch(_) {}
            }, LONG_PRESS_MS);
        });
        ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(ev => {
            thread.addEventListener(ev, () => clearTimeout(_pressTimer));
        });
        thread.addEventListener('contextmenu', e => {
            e.preventDefault();
            const row = e.target.closest('.sz-row');
            if (!row) return;
            openMenu(row.dataset.id, e.clientX, e.clientY);
        });

        thread.addEventListener('scroll', () => {
            updateScrollBtn();
            if (thread.scrollTop < 40 && !_exhausted) loadOlder();
        }, { passive: true });
    }

    function scrollToMessage(id) {
        if (!id || !_threadEl) return;
        const el = _threadEl.querySelector(`.sz-row[data-id="${CSS.escape(id)}"]`);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
    }

    // ═══ COMPOSER / INPUT ═══
    function renderShell() {
        _root.innerHTML = `
            <div class="sz-chat">
                <div class="sz-conn-bar"></div>
                <div class="sz-thread"></div>
                <div class="sz-typing"></div>
                <button class="sz-scroll-btn" data-act="scroll-bottom" type="button" aria-label="Ir para o fim">↓</button>
                <div class="sz-composer-bar"></div>
                <div class="sz-sel-bar">
                    <button data-act="sel-cancel" type="button" aria-label="Cancelar">✕</button>
                    <span class="sz-sel-count">0</span>
                    <span class="sz-sel-spacer"></span>
                    <button data-act="sel-forward" type="button" title="Encaminhar">↪</button>
                    <button data-act="sel-delete" type="button" title="Apagar">🗑</button>
                </div>
                <div class="sz-input-bar">
                    <button class="sz-attach-btn" data-act="attach" type="button" aria-label="Anexar">+</button>
                    <textarea class="sz-input" rows="1" placeholder="Mensagem" maxlength="4000"></textarea>
                    <button class="sz-send-btn" data-act="send" type="button" aria-label="Enviar">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
                <div class="sz-mention-pop"></div>
            </div>
        `;
        _threadEl = _root.querySelector('.sz-thread');
        bindThreadEvents();
        bindInput();
        bindShell();
        bindOnline();

        const inp = _root.querySelector('.sz-input');
        const draft = _draftByChat[_chatId];
        if (inp && draft) { inp.value = draft; autoGrow(inp); }
    }

    function bindShell() {
        _root.addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            const act = b.dataset.act;
            if (act === 'scroll-bottom') scrollToBottom(true);
            else if (act === 'sel-cancel') exitSelection();
            else if (act === 'sel-forward') forwardMany();
            else if (act === 'sel-delete') deleteMany();
            else if (act === 'send') sendFromInput();
            else if (act === 'attach') openAttachSheet();
            else if (act === 'cancel-reply') clearReply();
            else if (act === 'cancel-edit') clearEditing();
        });
    }

    function bindInput() {
        const inp = _root.querySelector('.sz-input');
        if (!inp) return;

        inp.addEventListener('input', () => {
            autoGrow(inp);
            if (!_selectionMode) sendTyping();
            saveDraft(inp.value);
        });
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromInput(); }
            if (e.key === 'Escape') {
                if (_editing) clearEditing();
                else if (_reply) clearReply();
            }
        });
        inp.addEventListener('paste', async ev => {
            const items = ev.clipboardData?.items || [];
            for (const it of items) {
                if (it.type.startsWith('image/')) {
                    const file = it.getAsFile();
                    if (file) { ev.preventDefault(); await previewImage(file); return; }
                }
            }
        });
        bindMentions(inp);
    }

    function autoGrow(ta) {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }

    function sendFromInput() {
        const inp = _root.querySelector('.sz-input');
        if (!inp) return;
        const txt = inp.value.trim();
        if (!txt) return;
        inp.value = '';
        autoGrow(inp);
        saveDraft('');
        sendText(txt);
    }

    // ═══ PUBLIC ═══
    C.open = function(chatId, myNumber, meta, root) {
        C.close();
        _chatId = chatId;
        _myNumber = myNumber;
        _meta = meta || {};
        _root = root;
        if (!_root) { console.warn('[Sangzap/chat] root ausente'); return; }

        _messages = [];
        _byId = new Map();
        _pending = new Map();
        _failed = new Map();
        _exhausted = false;
        _reply = null;
        _editing = null;
        _selection.clear();
        _selectionMode = false;
        _typingUsers = [];

        renderShell();

        (async () => {
            const initial = await fetchPage(0);
            for (const m of initial) {
                _messages.push(m);
                _byId.set(m.id, m);
            }
            _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
            await markDelivered(initial);
            await markRead(initial);
            renderThread({ stickToBottom: true });
            _typingUsers = await fetchTyping();
            renderTyping();
            drainQueue();
        })();

        _timer = setInterval(tick, POLL_MS);
        beatPresence();
        _presenceTimer = setInterval(beatPresence, 25000);
    };

    C.close = function() {
        if (_timer) { clearInterval(_timer); _timer = null; }
        if (_typingTimer) { clearTimeout(_typingTimer); _typingTimer = null; }
        if (_presenceTimer) { clearInterval(_presenceTimer); _presenceTimer = null; }
        try { if (_myNumber) ctx.bridge.rtdb.put(`sangzap/presence/${_myNumber}`, { online: 0, lastSeen: Date.now() }); } catch(_) {}
        try { S.audio?.stopAll?.(); } catch(_) {}
        closeMenu();
        _chatId = null;
        _root = null;
        _threadEl = null;
    };

    C.send = (text) => { if (!_chatId) return Promise.resolve(null); sendText(text); return Promise.resolve(null); };
    C.sendAudio = async (payload) => {
        if (!_chatId) return null;
        const tmpId = 'tmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const previewMsg = {
            id: tmpId, from: _myNumber, kind: 'audio',
            audio: payload.audio, mime: payload.mime, size: payload.size,
            duration: payload.duration, waveform: payload.waveform || payload.peaks,
            sentAt: Date.now()
        };
        _pending.set(tmpId, previewMsg);
        _messages.push(previewMsg); _byId.set(tmpId, previewMsg);
        _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
        renderThread({ stickToBottom: true });

        const docPayload = { kind: 'audio', audio: payload.audio, mime: payload.mime, size: payload.size, duration: payload.duration, waveform: payload.waveform || payload.peaks };
        if (!_online) { enqueue(tmpId, _chatId, docPayload, 'audio'); return null; }
        try {
            const saved = await postMessage(docPayload, tmpId);
            _pending.delete(tmpId); _byId.delete(tmpId);
            _messages = _messages.filter(x => x.id !== tmpId);
            _messages.push(saved); _byId.set(saved.id, saved);
            _messages.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
            try { ctx.tone?.send?.(); } catch(_) {}
            renderThread({ stickToBottom: true });
            return saved;
        } catch(e) {
            _pending.delete(tmpId); _failed.set(tmpId, previewMsg);
            renderThread();
            return null;
        }
    };
    C.sendImage = async (payload, opts) => sendAttachment('image', payload, opts?.caption || payload.caption || '');
    C.sendVideo = async (payload, opts) => sendAttachment('video', payload, opts?.caption || payload.caption || '');
    C.sendDocument = async (payload, opts) => sendAttachment('doc', payload, opts?.caption || '');
    C.sendLocation = async (payload) => sendAttachment('location', payload, '');
    C.sendContact = async (payload) => sendAttachment('contact', payload, '');
    C.sendStoryReply = async (storyId, text) => {
        if (!_chatId) return null;
        const saved = await postMessage({ kind: 'story-reply', body: text, storyId });
        _messages.push(saved); _byId.set(saved.id, saved);
        renderThread({ stickToBottom: true });
        return saved;
    };
    C.edit = editMessage;
    C.delete = deleteForEveryone;
    C.deleteForMe = deleteForMe;
    C.typing = function() {
        if (!_chatId) return;
        sendTyping();
        if (_typingTimer) clearTimeout(_typingTimer);
        _typingTimer = setTimeout(() => {
            try { ctx.bridge.rtdb.put(`sangzap/typing/${_chatId}/${_myNumber}`, { on: 0, ts: Date.now() }); } catch(_) {}
        }, TYPING_TTL);
    };
    C.canEdit = (msg) => msg && msg.from === _myNumber && !msg.deletedAt
        && msg.kind === 'text' && (Date.now() - (msg.sentAt || 0)) < EDIT_WINDOW;
    C.chatId = () => _chatId;
    C.meta = () => _meta;
    C.messages = () => _messages.slice();
    C.refresh = () => renderThread();
    C.drainQueue = drainQueue;

    S.chat = C;
})();
