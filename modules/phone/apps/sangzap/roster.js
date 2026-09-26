// modules/phone/apps/sangzap/roster.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.roster) return;

    const R = {};
    const POLL_MS = 3000;

    let _timer = null;
    let _cache = [];
    let _onUpdate = null;
    let _myNumber = null;

    // ═══ FETCH ═══
    async function fetchChats() {
        // Firestore REST: filtra por array-contains myNumber
        const url = `/sangzap_chats?` +
            `where=${encodeURIComponent(`members array-contains "${_myNumber}"`)}` +
            `&orderBy=${encodeURIComponent('lastMessageAt desc')}` +
            `&pageSize=80`;
        try {
            const docs = await ctx.bridge.firestore.request('GET', url);
            return docs.map(d => ({ id: d.id, ...d.data })).filter(Boolean);
        } catch(e) {
            console.warn('[Sangzap/roster] fetchChats falhou:', e);
            return [];
        }
    }

    // ═══ ENRICH ═══
    async function enrich(chats) {
        const nums = new Set();
        for (const c of chats) {
            if (c.kind === '1:1') {
                const other = (c.members || []).find(n => n !== _myNumber);
                if (other) nums.add(other);
            }
        }
        const profiles = {};
        await Promise.all([...nums].map(async n => {
            try {
                const p = await ctx.bridge.firestore.parseDoc('sangzap_profiles', n);
                if (p) profiles[n] = p;
            } catch(_) {}
        }));
        return chats.map(c => {
            const other = c.kind === '1:1'
                ? (c.members || []).find(n => n !== _myNumber)
                : null;
            const p = other ? profiles[other] : null;
            return {
                ...c,
                title: c.kind === 'group'
                    ? (c.name || 'Grupo')
                    : (p?.displayName || S.shortNum(other) || 'Contato'),
                avatar: p?.avatar || '',
                other
            };
        });
    }

    // ═══ POLL ═══
    async function tick() {
        try {
            const chats = await fetchChats();
            _cache = await enrich(chats);
            _onUpdate?.(_cache);
        } catch(e) {
            console.warn('[Sangzap/roster] tick:', e);
        }
    }

    // ═══ PUBLIC ═══
    R.start = function(myNumber, onUpdate) {
        _myNumber = myNumber;
        _onUpdate = onUpdate;
        R.stop();
        tick();
        _timer = setInterval(tick, POLL_MS);
    };
    R.stop = function() {
        if (_timer) { clearInterval(_timer); _timer = null; }
    };
    R.get = function() { return _cache; };
    R.refresh = tick;

    S.roster = R;
})();
