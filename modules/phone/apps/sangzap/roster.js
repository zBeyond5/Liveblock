// modules/phone/apps/sangzap/roster.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.roster) return;

    const R = {};
    const POLL_MS = 4000;

    let _timer = null;
    let _cache = [];
    let _onUpdate = null;
    let _myNumber = null;

    // ═══ FETCH ═══
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
            return [];
        }
    }

    async function fetchProfiles(nums) {
        const out = {};
        await Promise.all([...nums].map(async n => {
            try {
                const p = await ctx.bridge.firestore.parseDoc('sangzap_profiles', n);
                if (p) out[n] = p;
            } catch(_) {}
        }));
        return out;
    }

    // ═══ PRESENCE (via RTDB, com fallback gracioso) ═══
    async function fetchPresence(nums) {
        const out = {};
        await Promise.all([...nums].map(async n => {
            try {
                const p = await ctx.bridge.rtdb.get(`sangzap/presence/${n}`);
                if (p) out[n] = p;
            } catch(_) {}
        }));
        return out;
    }

    // ═══ MERGE: contatos + conversas ═══
    function build(contacts, chats, profiles, presence) {
        // mapa número → chat
        const chatByNum = {};
        for (const c of chats) {
            if (c.kind === '1:1') {
                const other = (c.members || []).find(n => n !== _myNumber);
                if (other) chatByNum[other] = c;
            }
        }
        // entradas 1:1 — um item por contato salvo, com ou sem chat
        const entries = [];
        const seen = new Set();
        for (const ct of contacts) {
            const n = ct.number || ct.num;
            if (!n || n === _myNumber) continue;
            seen.add(n);
            const chat = chatByNum[n];
            const prof = profiles[n] || {};
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
                fromContact: true
            });
        }
        // chats 1:1 sem contato salvo (nunca perde histórico)
        for (const c of chats) {
            if (c.kind !== '1:1') continue;
            const other = (c.members || []).find(n => n !== _myNumber);
            if (!other || seen.has(other)) continue;
            const prof = profiles[other] || {};
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
                fromContact: false
            });
        }
        // grupos
        for (const c of chats) {
            if (c.kind !== 'group') continue;
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
                fromContact: false
            });
        }
        // ordenação: pinned → com lastMessageAt → nome
        entries.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            if (!!a.lastMessageAt !== !!b.lastMessageAt) return a.lastMessageAt ? -1 : 1;
            if (a.lastMessageAt !== b.lastMessageAt) return b.lastMessageAt - a.lastMessageAt;
            return (a.title || '').localeCompare(b.title || '', 'pt-BR');
        });
        return entries;
    }

    // ═══ POLL ═══
    async function tick() {
        try {
            const contacts = (ctx.contacts?.contacts || []).slice();
            const chats = await fetchChats();
            const nums = new Set();
            for (const c of chats) for (const n of (c.members || [])) if (n !== _myNumber) nums.add(n);
            for (const ct of contacts) { const n = ct.number || ct.num; if (n) nums.add(n); }

            const [profiles, presence] = await Promise.all([
                fetchProfiles(nums),
                fetchPresence(nums)
            ]);
            _cache = build(contacts, chats, profiles, presence);
            _onUpdate?.(_cache);
        } catch(e) {
            console.warn('[Sangzap/roster] tick:', e);
        }
    }

    // ═══ FILTRO / BUSCA ═══
    R.filter = function(query) {
        if (!query) return _cache.filter(x => !x.archived);
        const q = query.toLowerCase().trim();
        return _cache.filter(x => {
            if (x.archived) return false;
            const hay = (x.title + ' ' + (x.number || '') + ' ' + (x.lastMessage || '')).toLowerCase();
            return hay.includes(q);
        });
    };
    R.archived = () => _cache.filter(x => x.archived);
    R.all = () => _cache;

    // ═══ MUTATIONS ═══
    R.pin = async function(chatId, on) {
        try { await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, { pinned: !!on }); }
        catch(_) {}
        tick();
    };
    R.mute = async function(chatId, on) {
        try { await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, { muted: !!on }); }
        catch(_) {}
        tick();
    };
    R.archive = async function(chatId, on) {
        try { await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, { archived: !!on }); }
        catch(_) {}
        tick();
    };

    // ═══ LIFECYCLE ═══
    R.start = function(myNumber, onUpdate) {
        _myNumber = myNumber;
        _onUpdate = onUpdate;
        R.stop();
        tick();
        _timer = setInterval(tick, POLL_MS);
    };
    R.stop = function() { if (_timer) { clearInterval(_timer); _timer = null; } };
    R.refresh = tick;

    S.roster = R;
})();
