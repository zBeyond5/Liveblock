// modules/phone/apps/sangzap/roster.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.roster) return;

    // ═══ CONFIG ═══
    const POLL_MS = 4000;            // ciclo principal
    const TYPING_POLL_MS = 5000;     // ciclo de typing
    const PROFILE_TTL = 60_000;      // cache de perfil — 1 min
    const PRESENCE_TTL = 12_000;     // cache de presença — 12s
    const TYPING_TTL = 5000;         // digitando expira em 5s
    const FETCH_CONCURRENCY = 6;     // limite do browser por host

    const R = {};

    // ═══ STATE ═══
    let _timer = null;
    let _typingTimer = null;
    let _onUpdate = null;
    let _myNumber = null;
    let _cache = [];
    let _sections = [];
    let _counts = { all: 0, unread: 0, groups: 0, archived: 0 };
    let _lastHash = 0;
    let _paused = false;
    let _running = false;
    let _abort = false;

    // ═══ CACHES ═══
    const _profileCache = new Map();  // num -> { data, ts }
    const _presenceCache = new Map(); // num -> { data, ts }
    const _typingMap = new Map();     // chatId -> Map<num, ts>

    // ═══ HELPERS ═══
    function hash(entries) {
        let h = 2166136261;
        for (const e of entries) {
            const s = `${e.chatId}|${e.unread||0}|${e.lastMessageAt||0}|${e.online?1:0}|${e.pinned?1:0}|${(e.lastMessage||'').slice(0,40)}|${e.typingCount||0}`;
            for (let i = 0; i < s.length; i++) h = ((h ^ s.charCodeAt(i)) * 16777619) >>> 0;
        }
        return h;
    }

    async function runConcurrent(tasks, limit) {
        const out = [];
        let i = 0;
        const workers = Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
            while (i < tasks.length) {
                const idx = i++;
                try { out[idx] = await tasks[idx](); }
                catch(_) { out[idx] = null; }
            }
        });
        await Promise.all(workers);
        return out;
    }

    // ═══ FETCH — chats ═══
    async function fetchChats() {
        const url = `/sangzap_chats?` +
            `where=${encodeURIComponent(`members array-contains "${_myNumber}"`)}` +
            `&orderBy=${encodeURIComponent('lastMessageAt desc')}` +
            `&pageSize=200`;
        try {
            const docs = await ctx.bridge.firestore.request('GET', url);
            return docs.map(d => ({ id: d.id, ...d.data() })).filter(Boolean);
        } catch(e) {
            console.warn('[Sangzap/roster] fetchChats:', e);
            return null; // null = falha; preserva cache antigo
        }
    }

    // ═══ FETCH — perfis (com TTL) ═══
    async function fetchProfiles(nums) {
        const now = Date.now();
        const stale = [];
        const out = {};
        for (const n of nums) {
            const c = _profileCache.get(n);
            if (c && now - c.ts < PROFILE_TTL) out[n] = c.data;
            else stale.push(n);
        }
        if (stale.length) {
            const tasks = stale.map(n => async () => {
                try {
                    const p = await ctx.bridge.firestore.parseDoc('sangzap_profiles', n);
                    const data = p || {};
                    _profileCache.set(n, { data, ts: Date.now() });
                    return { n, data };
                } catch(_) { return { n, data: _profileCache.get(n)?.data || {} }; }
            });
            const results = await runConcurrent(tasks, FETCH_CONCURRENCY);
            for (const r of results) if (r) out[r.n] = r.data;
        }
        return out;
    }

    // ═══ FETCH — presença em 1 request ═══
    async function fetchAllPresence() {
        const now = Date.now();
        // se o cache está fresco, evita o GET
        let newest = 0;
        for (const v of _presenceCache.values()) if (v.ts > newest) newest = v.ts;
        if (newest && now - newest < PRESENCE_TTL) {
            const out = {};
            for (const [k, v] of _presenceCache) out[k] = v.data;
            return out;
        }
        try {
            const data = await ctx.bridge.rtdb.get('sangzap/presence') || {};
            const out = {};
            for (const [n, v] of Object.entries(data)) {
                _presenceCache.set(n, { data: v, ts: now });
                out[n] = v;
            }
            return out;
        } catch(_) {
            const out = {};
            for (const [k, v] of _presenceCache) out[k] = v.data;
            return out;
        }
    }

    // ═══ FETCH — typing em 1 request ═══
    async function fetchAllTyping() {
        try {
            const data = await ctx.bridge.rtdb.get('sangzap/typing') || {};
            const now = Date.now();
            _typingMap.clear();
            for (const [chatId, users] of Object.entries(data)) {
                if (!users || typeof users !== 'object') continue;
                const inner = new Map();
                for (const [num, v] of Object.entries(users)) {
                    if (num === _myNumber) continue;
                    if (v && v.on && (now - (v.ts || 0)) < TYPING_TTL) inner.set(num, v.ts);
                }
                if (inner.size) _typingMap.set(chatId, inner);
            }
        } catch(_) {}
    }

    // ═══ MERGE ═══
    function build(contacts, chats, profiles, presence) {
        const chatByNum = {};
        for (const c of chats) {
            if (c.kind === '1:1') {
                const other = (c.members || []).find(n => n !== _myNumber);
                if (other) chatByNum[other] = c;
            }
        }

        const entries = [];
        const seen = new Set();

        // 1:1 a partir dos contatos salvos
        for (const ct of contacts) {
            const n = ct.number || ct.num;
            if (!n || n === _myNumber) continue;
            seen.add(n);
            const chat = chatByNum[n];
            const prof = profiles[n] || {};
            const t = _typingMap.get(chat?.id || '');
            entries.push({
                kind: '1:1',
                number: n,
                chatId: chat?.id || S.chatIdFor(_myNumber, n),
                title: prof.displayName || ct.name || S.shortNum(n),
                avatar: prof.avatar || ct.avatarUrl || '',
                recado: prof.recado || '',
                lastMessage: chat?.lastMessage || '',
                lastMessageAt: chat?.lastMessageAt || 0,
                unread: chat?.unread || 0,
                pinned: !!chat?.pinned,
                muted: !!chat?.muted,
                archived: !!chat?.archived,
                online: presence[n]?.online === 1,
                lastSeen: presence[n]?.lastSeen || 0,
                typingCount: t ? t.size : 0,
                fromContact: true
            });
        }

        // 1:1 sem contato salvo (não perde histórico)
        for (const c of chats) {
            if (c.kind !== '1:1') continue;
            const other = (c.members || []).find(n => n !== _myNumber);
            if (!other || seen.has(other)) continue;
            const prof = profiles[other] || {};
            const t = _typingMap.get(c.id);
            entries.push({
                kind: '1:1',
                number: other,
                chatId: c.id,
                title: prof.displayName || S.shortNum(other),
                avatar: prof.avatar || '',
                recado: prof.recado || '',
                lastMessage: c.lastMessage || '',
                lastMessageAt: c.lastMessageAt || 0,
                unread: c.unread || 0,
                pinned: !!c.pinned,
                muted: !!c.muted,
                archived: !!c.archived,
                online: presence[other]?.online === 1,
                lastSeen: presence[other]?.lastSeen || 0,
                typingCount: t ? t.size : 0,
                fromContact: false
            });
        }

        // grupos
        for (const c of chats) {
            if (c.kind !== 'group') continue;
            const t = _typingMap.get(c.id);
            entries.push({
                kind: 'group',
                chatId: c.id,
                title: c.name || 'Grupo',
                avatar: c.avatar || '',
                recado: '',
                members: c.members || [],
                lastMessage: c.lastMessage || '',
                lastMessageAt: c.lastMessageAt || 0,
                unread: c.unread || 0,
                pinned: !!c.pinned,
                muted: !!c.muted,
                archived: !!c.archived,
                typingCount: t ? t.size : 0,
                fromContact: false
            });
        }

        // ordenação
        entries.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            if (!!a.lastMessageAt !== !!b.lastMessageAt) return a.lastMessageAt ? -1 : 1;
            if (a.lastMessageAt !== b.lastMessageAt) return b.lastMessageAt - a.lastMessageAt;
            return (a.title || '').localeCompare(b.title || '', 'pt-BR');
        });

        return entries;
    }

    // ═══ SEÇÕES + CHIPS ═══
    function buildSections(opts) {
        const { query = '', chip = 'all', includeArchived = false } = opts || {};
        let list = includeArchived ? _cache.slice() : _cache.filter(x => !x.archived);

        if (chip === 'unread') list = list.filter(x => (x.unread || 0) > 0);
        else if (chip === 'groups') list = list.filter(x => x.kind === 'group');

        if (query) {
            const q = query.toLowerCase().trim();
            list = list.filter(x => {
                const hay = (x.title + ' ' + (x.number || '') + ' ' + (x.lastMessage || '')).toLowerCase();
                return hay.includes(q);
            });
        }

        const pinned = list.filter(x => x.pinned);
        const rest = list.filter(x => !x.pinned);
        const sections = [];
        if (pinned.length) sections.push({ id: 'pinned', title: 'Fixadas', items: pinned });
        if (rest.length) sections.push({ id: 'main', title: pinned.length ? 'Conversas' : '', items: rest });
        return sections;
    }

    function buildCounts() {
        let unread = 0, groups = 0, all = 0;
        for (const e of _cache) {
            if (e.archived) continue;
            all++;
            if ((e.unread || 0) > 0) unread++;
            if (e.kind === 'group') groups++;
        }
        return { all, unread, groups, archived: _cache.filter(x => x.archived).length };
    }

    // ═══ PREVIEW PARTS (icon + text) ═══
    R.previewParts = function(entry) {
        const msg = entry?.lastMessage || '';
        if (entry?.typingCount > 0) return { icon: '✏️', text: 'digitando…', kind: 'typing' };
        if (!msg) return { icon: '', text: entry?.recado || '', kind: 'empty' };
        if (msg.startsWith('🎤')) return { icon: '🎤', text: msg.replace(/^🎤\s*/, ''), kind: 'audio' };
        if (msg.startsWith('📷')) return { icon: '📷', text: msg.replace(/^📷\s*/, ''), kind: 'image' };
        if (msg.startsWith('💬')) return { icon: '💬', text: msg.replace(/^💬\s*/, ''), kind: 'story-reply' };
        if (msg.startsWith('📄')) return { icon: '📄', text: msg.replace(/^📄\s*/, ''), kind: 'doc' };
        if (msg.startsWith('📍')) return { icon: '📍', text: msg.replace(/^📍\s*/, ''), kind: 'location' };
        return { icon: '', text: msg, kind: 'text' };
    };

    // ═══ TICK ═══
    async function tick() {
        if (_abort || !_running) return;
        try {
            const contacts = (ctx.contacts?.contacts || []).slice();
            const chats = await fetchChats();
            if (chats === null) return; // falha: mantém cache

            const nums = new Set();
            for (const c of chats) for (const n of (c.members || [])) if (n !== _myNumber) nums.add(n);
            for (const ct of contacts) { const n = ct.number || ct.num; if (n) nums.add(n); }

            const [profiles, presence] = await Promise.all([
                fetchProfiles(nums),
                fetchAllPresence()
            ]);

            if (_abort || !_running) return;

            const next = build(contacts, chats, profiles, presence);
            const h = hash(next);
            const nextCounts = buildCounts.call(null); // só pra reuso do método abaixo

            _cache = next;
            _sections = buildSections({ query: '', chip: 'all' });
            _counts = (function() {
                let unread = 0, groups = 0, all = 0, archived = 0;
                for (const e of _cache) {
                    if (e.archived) { archived++; continue; }
                    all++;
                    if ((e.unread || 0) > 0) unread++;
                    if (e.kind === 'group') groups++;
                }
                return { all, unread, groups, archived };
            })();

            if (h !== _lastHash) {
                _lastHash = h;
                try { _onUpdate?.(_cache, _counts, _sections); } catch(e) { console.warn('[Sangzap/roster] onUpdate:', e); }
            }
        } catch(e) {
            console.warn('[Sangzap/roster] tick:', e);
        }
    }

    // ═══ TYPING LOOP ═══
    async function typingTick() {
        if (_abort || !_running || _paused) return;
        await fetchAllTyping();
        // força re-tick leve pra atualizar previews
        if (_typingMap.size) tick();
    }

    // ═══ LIFECYCLE ═══
    let _visibilityBound = false;
    function bindVisibility() {
        if (_visibilityBound) return;
        _visibilityBound = true;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) R.pause();
            else R.resume();
        });
    }

    R.start = function(myNumber, onUpdate) {
        if (!myNumber) { console.warn('[Sangzap/roster] start sem myNumber'); return; }
        _myNumber = myNumber;
        _onUpdate = onUpdate;
        _running = true;
        _abort = false;
        _lastHash = 0;
        bindVisibility();
        R.stop();
        tick();
        typingTick();
        _timer = setInterval(tick, POLL_MS);
        _typingTimer = setInterval(typingTick, TYPING_POLL_MS);
    };

    R.stop = function() {
        _running = false;
        if (_timer) { clearInterval(_timer); _timer = null; }
        if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
    };

    R.pause = function() {
        _paused = true;
        if (_timer) { clearInterval(_timer); _timer = null; }
        if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
    };

    R.resume = function() {
        if (!_running) return;
        _paused = false;
        if (!_timer) {
            tick();
            _timer = setInterval(tick, POLL_MS);
        }
        if (!_typingTimer) {
            typingTick();
            _typingTimer = setInterval(typingTick, TYPING_POLL_MS);
        }
    };

    R.refresh = tick;
    R.invalidate = function() {
        _profileCache.clear();
        _presenceCache.clear();
        _typingMap.clear();
        tick();
    };
    R.invalidateProfile = function(num) {
        if (num) _profileCache.delete(num);
    };

    // ═══ READ ═══
    R.get = () => _cache;
    R.all = () => _cache;
    R.getEntry = (chatId) => _cache.find(x => x.chatId === chatId) || null;
    R.sections = (opts) => buildSections(opts);
    R.counts = () => ({ ..._counts });
    R.archived = () => _cache.filter(x => x.archived);
    R.totalUnread = () => _cache.reduce((s, x) => s + (x.muted ? 0 : (x.unread || 0)), 0);

    // mantém compatibilidade com o shell atual (`filter(string)`)
    R.filter = function(arg) {
        const opts = typeof arg === 'string' ? { query: arg } : (arg || {});
        const flat = buildSections(opts).flatMap(s => s.items);
        return flat;
    };

    // ═══ MUTATIONS — optimistic + rollback ═══
    async function patchChat(chatId, patch, applyLocal, rollback) {
        const idx = _cache.findIndex(x => x.chatId === chatId);
        if (idx >= 0 && applyLocal) applyLocal(_cache[idx]);
        _onUpdate?.(_cache, _counts, _sections);
        try {
            await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, patch);
            _lastHash = 0; // força notify no próximo tick (recomputa)
        } catch(e) {
            if (idx >= 0 && rollback) rollback(_cache[idx]);
            _onUpdate?.(_cache, _counts, _sections);
            throw e;
        }
    }

    R.pin = (chatId, on) => patchChat(chatId, { pinned: !!on },
        (e) => { e.pinned = !!on; },
        (e) => { e.pinned = !on; });

    R.mute = (chatId, on) => patchChat(chatId, { muted: !!on },
        (e) => { e.muted = !!on; },
        (e) => { e.muted = !on; });

    R.archive = (chatId, on) => patchChat(chatId, { archived: !!on },
        (e) => { e.archived = !!on; },
        (e) => { e.archived = !on; });

    S.roster = R;
})();
