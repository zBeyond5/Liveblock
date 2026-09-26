// modules/phone/contacts.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Phone/contacts] shell não inicializado.'); return; }
    if (ctx.contacts._loaded) return;
    ctx.contacts._loaded = true;

    const bridge = window._hubBridge;
    if (!bridge) return;

    // ═══ CONFIG ═══
    const COL_DIR = 'phone_numbers';
    const COL_OWN = 'phone_owners';
    const ONLINE_MS = 5 * 60 * 1000;
    const HISTORY_MAX = 40;
    const MAX_CLAIM_ATTEMPTS = 8;
    const SESSIONS_REFRESH_MS = 8000;

    const LS_MY_NUMBER = 'sanghub_phone_my_number';
    const LS_CONTACTS  = 'sanghub_phone_contacts';
    const LS_HISTORY   = 'sanghub_phone_history';
    const LS_BLOCKED   = 'sanghub_phone_blocked';

    // ═══ STATE ═══
    let _contacts = [];
    let _history = [];
    let _blocked = [];
    let _sessionsCache = [];
    let _sessionsFetchedAt = 0;
    let _allocating = false;
    let _dialBuffer = '';
    let _searchQuery = '';
    let _dialLookupSeq = 0;
    let _cardEl = null;
    let _cardOpenNumber = null;

    // ═══ HELPERS ═══
    const esc = ctx.esc;
    const el = ctx.el;
    const I = ctx.I;

    function fmtNumber(n) {
        if (!n) return '';
        const clean = String(n).replace(/\D/g, '');
        if (clean.length !== 6) return clean;
        return clean.slice(0, 3) + '-' + clean.slice(3);
    }
    function parseNumber(s) { return String(s || '').replace(/\D/g, '').slice(0, 6); }
    function randNumber() { return String(Math.floor(100000 + Math.random() * 900000)); }
    function getMyUsername() { return bridge.player?.username || bridge.player?.name || bridge.deviceId || ''; }

    function fmtDurShort(ms) {
        const s = Math.floor(ms / 1000);
        if (s < 60) return s + 's';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'min' + (s % 60 ? ' ' + (s % 60) + 's' : '');
        return Math.floor(m / 60) + 'h ' + (m % 60) + 'min';
    }
    function timeAgo(ts) {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return 'agora';
        if (s < 3600) return Math.floor(s / 60) + 'min';
        if (s < 86400) return Math.floor(s / 3600) + 'h';
        if (s < 604800) return Math.floor(s / 86400) + 'd';
        const d = new Date(ts);
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    }
    function fullTimestamp(ts) {
        try {
            const d = new Date(ts);
            const pad = n => String(n).padStart(2, '0');
            return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' +
                   pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch(_) { return ''; }
    }

    // ═══ DIRETÓRIO ═══
    async function _getDirectory(number) {
        try {
            const doc = await bridge.firestore.request('GET', '/' + COL_DIR + '/' + number);
            if (!doc || !doc.fields) return null;
            return bridge.firestore.parseDoc(doc);
        } catch(_) { return null; }
    }
    async function _getOwner(username) {
        try {
            const doc = await bridge.firestore.request('GET', '/' + COL_OWN + '/' + encodeURIComponent(username));
            if (!doc || !doc.fields) return null;
            return bridge.firestore.parseDoc(doc);
        } catch(_) { return null; }
    }
    async function _writeDirectory(number, payload) {
        const fields = {};
        for (const k in payload) fields[k] = bridge.firestore.value(payload[k]);
        const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&');
        await bridge.firestore.request('PATCH', '/' + COL_DIR + '/' + number, { fields }, mask);
    }
    async function _writeOwner(username, payload) {
        const fields = {};
        for (const k in payload) fields[k] = bridge.firestore.value(payload[k]);
        const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&');
        await bridge.firestore.request('PATCH', '/' + COL_OWN + '/' + encodeURIComponent(username), { fields }, mask);
    }
    async function _mirrorToSession() {
        if (!ctx.myNumber || !bridge.deviceId) return;
        try {
            const fields = { phoneNumber: bridge.firestore.value(ctx.myNumber) };
            await bridge.firestore.request('PATCH', '/sessions/' + bridge.deviceId, { fields }, 'updateMask.fieldPaths=phoneNumber');
        } catch(_) {}
    }

    async function _ensureMyNumber() {
        if (ctx.myNumber) return ctx.myNumber;
        if (_allocating) return null;
        _allocating = true;
        try {
            try {
                const cached = localStorage.getItem(LS_MY_NUMBER);
                if (cached && /^\d{6}$/.test(cached)) { ctx.myNumber = cached; ctx.updateMyNumberUI(); return ctx.myNumber; }
            } catch(_) {}
            const username = getMyUsername();
            if (!username) return null;
            const owner = await _getOwner(username);
            if (owner && owner.number && /^\d{6}$/.test(String(owner.number))) {
                ctx.myNumber = String(owner.number);
                try { localStorage.setItem(LS_MY_NUMBER, ctx.myNumber); } catch(_) {}
                ctx.updateMyNumberUI();
                _mirrorToSession();
                return ctx.myNumber;
            }
            const displayName = bridge.player?.name || username;
            const avatarUrl = bridge.player?.avatarUrl || '';
            for (let i = 0; i < MAX_CLAIM_ATTEMPTS; i++) {
                const num = randNumber();
                const existing = await _getDirectory(num);
                if (existing && existing.username && existing.username !== username) continue;
                try {
                    const now = Date.now();
                    await _writeDirectory(num, { username, displayName, avatarUrl, createdAt: existing?.createdAt || now, updatedAt: now });
                    await _writeOwner(username, { number: num, createdAt: now });
                    ctx.myNumber = num;
                    try { localStorage.setItem(LS_MY_NUMBER, num); } catch(_) {}
                    ctx.updateMyNumberUI();
                    _mirrorToSession();
                    return num;
                } catch(e) { continue; }
            }
            console.warn('[Phone] Não foi possível alocar número após', MAX_CLAIM_ATTEMPTS, 'tentativas.');
            return null;
        } finally { _allocating = false; }
    }
    async function _refreshMyDirectory() {
        if (!ctx.myNumber) return;
        try {
            await _writeDirectory(ctx.myNumber, {
                username: getMyUsername(),
                displayName: bridge.player?.name || getMyUsername(),
                avatarUrl: bridge.player?.avatarUrl || '',
                updatedAt: Date.now()
            });
        } catch(_) {}
    }

    // ═══ CONTATOS ═══
    function loadContacts() {
        try {
            const raw = localStorage.getItem(LS_CONTACTS);
            const parsed = raw ? JSON.parse(raw) : [];
            _contacts = Array.isArray(parsed) ? parsed.filter(c => c && /^\d{6}$/.test(String(c.number))) : [];
        } catch(_) { _contacts = []; }
    }
    function saveContacts() { try { localStorage.setItem(LS_CONTACTS, JSON.stringify(_contacts)); } catch(_) {} }
    function hasContact(number) { return _contacts.some(c => c.number === number); }
    function removeContact(number) { _contacts = _contacts.filter(c => c.number !== number); saveContacts(); }
    async function addContactByNumber(number) {
        const clean = parseNumber(number);
        if (clean.length !== 6) return { ok: false, err: 'Número incompleto' };
        if (hasContact(clean)) return { ok: false, err: 'Já está salvo' };
        let username = '', name = '', avatarUrl = '';
        const dir = await _getDirectory(clean);
        if (dir) {
            username = dir.username || '';
            name = dir.displayName || '';
            avatarUrl = dir.avatarUrl || '';
        }
        await _fetchSessions(false);
        const live = username ? _findLiveSession(username) : null;
        if (live) { name = live.name || name; avatarUrl = live.avatarUrl || avatarUrl; }
        _contacts.push({ number: clean, username, savedName: name, savedAvatar: avatarUrl, savedAt: Date.now(), fav: false });
        saveContacts();
        return { ok: true };
    }
    function updateContactMeta(number, patch) {
        const c = _contacts.find(x => x.number === number);
        if (!c) return;
        let changed = false;
        for (const k in patch) {
            if (patch[k] != null && patch[k] !== '' && c[k] !== patch[k]) { c[k] = patch[k]; changed = true; }
        }
        if (changed) saveContacts();
    }
    function renameContact(number, novoNome) {
        const c = _contacts.find(x => x.number === number);
        if (!c) return false;
        const trimmed = String(novoNome || '').trim();
        if (!trimmed) return false;
        c.savedName = trimmed;
        c.manualName = true;
        saveContacts();
        return true;
    }
    function clearManualName(number) {
        const c = _contacts.find(x => x.number === number);
        if (!c) return;
        c.manualName = false;
        saveContacts();
    }
    function toggleFav(number) {
        const c = _contacts.find(x => x.number === number);
        if (!c) return false;
        c.fav = !c.fav;
        saveContacts();
        return c.fav;
    }

    // ═══ HISTÓRICO ═══
    function loadHistory() {
        try {
            const raw = localStorage.getItem(LS_HISTORY);
            const arr = raw ? JSON.parse(raw) : [];
            _history = Array.isArray(arr) ? arr.filter(h => h && typeof h.at === 'number') : [];
        } catch(_) { _history = []; }
    }
    function saveHistory() {
        if (_history.length > HISTORY_MAX) _history = _history.slice(0, HISTORY_MAX);
        try { localStorage.setItem(LS_HISTORY, JSON.stringify(_history)); } catch(_) {}
    }
    function pushHistory(entry) { _history.unshift(entry); saveHistory(); }
    function removeHistoryAt(id) { _history = _history.filter(h => h.id !== id); saveHistory(); }

    // Retorna a última interação registrada com um número (1:1 only)
    function _lastCallWith(number) {
        for (const h of _history) {
            if (h.kind !== '1:1') continue;
            const m = h.members[0];
            if (m && m.number === number) return h;
        }
        return null;
    }

    // ═══ BLOQUEIO ═══
    function loadBlocked() {
        try {
            const raw = localStorage.getItem(LS_BLOCKED);
            _blocked = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(_blocked)) _blocked = [];
            _blocked = _blocked.filter(n => /^\d{6}$/.test(String(n)));
        } catch(_) { _blocked = []; }
    }
    function saveBlocked() { try { localStorage.setItem(LS_BLOCKED, JSON.stringify(_blocked)); } catch(_) {} }
    function isBlocked(number) { return _blocked.includes(number); }
    function toggleBlock(number) {
        if (isBlocked(number)) { _blocked = _blocked.filter(n => n !== number); saveBlocked(); return false; }
        _blocked.push(number); saveBlocked(); return true;
    }

    // ═══ SESSÕES ═══
    async function _fetchSessions(force) {
        const now = Date.now();
        if (!force && _sessionsCache.length && (now - _sessionsFetchedAt) < SESSIONS_REFRESH_MS) return _sessionsCache;
        try {
            const data = await bridge.firestore.request('GET', '/sessions');
            _sessionsCache = (data?.documents || []).map(d => ({ id: d.name.split('/').pop(), ...bridge.firestore.parseDoc(d) }));
            _sessionsFetchedAt = now;
        } catch(_) {}
        return _sessionsCache;
    }
    function _findLiveSession(username) {
        if (!username) return null;
        const now = Date.now();
        const myId = bridge.deviceId || '';
        return _sessionsCache
            .filter(s => s.id !== myId && (now - (s.lastSeen || 0)) < ONLINE_MS)
            .find(s => s.name === username || s.username === username) || null;
    }

    // Prioridade: manualName (respeita override) > live > savedName > username > número
    function _enrichContact(c) {
        const live = _findLiveSession(c.username);
        let name;
        if (c.manualName) name = c.savedName || c.username || fmtNumber(c.number);
        else name = live?.name || c.savedName || c.username || fmtNumber(c.number);
        const avatarUrl = live?.avatarUrl || c.savedAvatar || '';
        if (live) {
            const patch = {};
            if (live.avatarUrl && live.avatarUrl !== c.savedAvatar) patch.savedAvatar = live.avatarUrl;
            if (!c.manualName && live.name && live.name !== c.savedName) patch.savedName = live.name;
            if (Object.keys(patch).length) updateContactMeta(c.number, patch);
        }
        return {
            number: c.number, username: c.username, name, avatarUrl,
            online: !!live, sessionId: live?.id || null,
            fav: !!c.fav, blocked: isBlocked(c.number),
            manualName: !!c.manualName
        };
    }

    // ═══ UI — CONTATOS ═══
    async function _renderContacts() {
        const content = ctx.screenEl?.querySelector('#phContent');
        if (!content) return;
        content.innerHTML = `<div class="ph-list"><div class="ph-empty">Carregando…</div></div>`;
        await _fetchSessions(false);
        const all = _contacts.map(_enrichContact);
        const q = _searchQuery.trim().toLowerCase();
        const filtered = q ? all.filter(c => (c.name || '').toLowerCase().includes(q) || c.number.includes(q) || (c.username || '').toLowerCase().includes(q)) : all;
        const onlineCount = all.filter(c => c.online && !c.blocked).length;
        const cntEl = ctx.frameEl?.querySelector('#phCount');
        if (cntEl) cntEl.textContent = String(onlineCount);

        if (!all.length) {
            content.innerHTML = `<div class="ph-list">
                <div class="ph-empty">
                    <strong>Sem contatos ainda.</strong><br>
                    Vá em <b>Discar</b>, digite o número de alguém e toque em <b>Salvar</b>.
                    <div class="hint">Passe o seu número clicando no cartão acima ☝</div>
                </div>
            </div>`;
            return;
        }

        const sortFn = (a, b) => {
            if (a.fav !== b.fav) return a.fav ? -1 : 1;
            if (a.online !== b.online) return a.online ? -1 : 1;
            return (a.name || '').localeCompare(b.name || '');
        };
        const favs = filtered.filter(c => c.fav).sort(sortFn);
        const others = filtered.filter(c => !c.fav && !c.blocked).sort(sortFn);
        const blocked = filtered.filter(c => c.blocked).sort(sortFn);

        const parts = [];
        parts.push(`<input class="ph-search" id="phSearch" type="text" placeholder="Buscar contato ou número…" value="${esc(_searchQuery)}" spellcheck="false" />`);
        parts.push(`<div class="ph-list" id="phListWrap">`);
        if (!favs.length && !others.length && !blocked.length) {
            parts.push(`<div class="ph-empty">Nada encontrado.</div>`);
        } else {
            const renderGroup = (arr) => arr.map(c => _rowHtml(c)).join('');
            if (favs.length) {
                parts.push(`<div class="ph-section-hdr fav">★ Favoritos <span class="line"></span></div>`);
                parts.push(renderGroup(favs));
            }
            if (others.length) parts.push(renderGroup(others));
            if (blocked.length) {
                parts.push(`<div class="ph-section-hdr blocked">Bloqueados <span class="line"></span></div>`);
                parts.push(renderGroup(blocked));
            }
        }
        parts.push(`</div>`);
        content.innerHTML = parts.join('');

        const searchInput = content.querySelector('#phSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                _searchQuery = searchInput.value;
                _renderContacts();
            });
            if (q) { searchInput.focus(); searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length); }
        }

        content.querySelectorAll('.ph-contact').forEach(row => {
            const num = row.dataset.num;
            const callBtn = row.querySelector('.ph-call-btn');
            const noteBtn = row.querySelector('.ph-note-btn');
            const rmBtn = row.querySelector('.ph-rm');

            // Clique no row → abre o card
            row.addEventListener('click', (e) => {
                if (e.target.closest('.ph-call-btn') || e.target.closest('.ph-note-btn') || e.target.closest('.ph-rm')) return;
                const c = all.find(x => x.number === num);
                if (c) _openContactCard(c);
            });
            // Duplo clique → liga direto
            row.addEventListener('dblclick', (e) => {
                e.preventDefault();
                if (isBlocked(num)) { ctx.toast('Contato bloqueado', 'err'); return; }
                ctx.tone.dial();
                _callByNumber(num);
            });
            // Botão ligar rápido
            if (callBtn && !callBtn.disabled) callBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isBlocked(num)) { ctx.toast('Contato bloqueado', 'err'); return; }
                ctx.tone.dial();
                _callByNumber(num);
            });
            if (rmBtn) rmBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeContact(num);
                ctx.toast('Contato removido', 'ok');
                _renderContacts();
            });
            if (noteBtn) ctx.notes.wireNoteButton?.(noteBtn, { number: num, name: row.dataset.name || '' });
        });
    }

    function _rowHtml(c) {
        const initial = (c.name || '?')[0] || '?';
        const av = c.avatarUrl
            ? `<div class="ph-av"><img src="${esc(c.avatarUrl)}" alt="" />${c.fav ? '<span class="fav-badge">★</span>' : ''}${c.online && !c.blocked ? '<span class="dot-online"></span>' : ''}</div>`
            : `<div class="ph-av">${esc(initial.toUpperCase())}${c.fav ? '<span class="fav-badge">★</span>' : ''}${c.online && !c.blocked ? '<span class="dot-online"></span>' : ''}</div>`;
        const meta = c.blocked
            ? `<span class="num">${esc(fmtNumber(c.number))}</span> · <span class="off">bloqueado</span>`
            : c.online
                ? `<span class="num">${esc(fmtNumber(c.number))}</span> · <span>online</span>`
                : `<span class="num">${esc(fmtNumber(c.number))}</span> · <span class="off">offline</span>`;
        return `<div class="ph-contact ${c.blocked ? 'blocked' : (c.online ? '' : 'offline')} ${c.fav ? 'fav' : ''}" data-num="${esc(c.number)}" data-name="${esc(c.name)}" title="Clique para detalhes · Duplo clique para ligar">
            ${av}
            <div class="ph-info">
                <div class="ph-name">${esc(c.name)}</div>
                <div class="ph-meta">${meta}</div>
            </div>
            <button class="ph-rm" data-rm="${esc(c.number)}" title="Remover">✕</button>
            <button class="ph-call-btn" ${c.online && !c.blocked ? '' : 'disabled'} title="${c.blocked ? 'Bloqueado' : c.online ? 'Ligar' : 'Offline'}">${I.phone}</button>
        </div>`;
    }

    // ═══ CARD DE CONTATO ═══
    function _closeCard() {
        if (!_cardEl) return;
        const el = _cardEl;
        _cardEl = null;
        _cardOpenNumber = null;
        el.classList.add('closing');
        setTimeout(() => { try { el.remove(); } catch(_) {} }, 240);
    }

    function _openContactCard(contact) {
        if (!ctx.screenEl) return;
        if (_cardEl) _closeCard();
        _cardOpenNumber = contact.number;

        const c = contact;
        const initial = (c.name || '?')[0] || '?';
        const av = c.avatarUrl
            ? `<div class="cc-av"><img src="${esc(c.avatarUrl)}" alt="" />${c.online && !c.blocked ? '<span class="dot-online"></span>' : ''}</div>`
            : `<div class="cc-av">${esc(initial.toUpperCase())}${c.online && !c.blocked ? '<span class="dot-online"></span>' : ''}</div>`;

        const last = _lastCallWith(c.number);
        let lastLine = `<span class="cc-last-empty">Nenhuma conversa ainda</span>`;
        if (last) {
            const dirIcon = last.direction === 'incoming' ? I.arrowIn : I.arrowOut;
            const dirClass = (last.status === 'missed' || last.status === 'rejected') ? 'dir-miss'
                           : (last.direction === 'incoming' ? 'dir-in' : 'dir-out');
            const durTxt = last.durationMs > 0 ? fmtDurShort(last.durationMs)
                          : (last.status === 'missed' ? 'perdida'
                          : last.status === 'rejected' ? 'recusada' : '—');
            const when = timeAgo(last.at);
            lastLine = `<span class="cc-last">
                <span class="${dirClass}" style="display:inline-flex;align-items:center;width:10px;height:10px;">${dirIcon}</span>
                <span>${esc(when)}</span>
                <span class="dot-sep">·</span>
                <span>${esc(durTxt)}</span>
            </span>`;
        }

        const statusTxt = c.blocked ? 'Bloqueado' : (c.online ? 'Online agora' : 'Offline');
        const statusCls = c.blocked ? 'bad' : (c.online ? 'ok' : 'neutral');

        const card = el('div', { class: 'cc-overlay' });
        card.innerHTML = `
            <div class="cc-panel">
                <button class="cc-close" title="Fechar" aria-label="Fechar">✕</button>
                <div class="cc-top">
                    ${av}
                    <div class="cc-nameline">
                        <div class="cc-name-display ${c.manualName ? 'manual' : ''}" id="ccNameDisplay" title="${c.manualName ? 'Nome personalizado' : 'Toque para editar'}">
                            <span>${esc(c.name)}</span>
                            <span class="cc-name-edit-hint">✎</span>
                        </div>
                        <div class="cc-name-edit" hidden>
                            <input type="text" class="cc-name-input" id="ccNameInput" value="${esc(c.name)}" maxlength="32" spellcheck="false" autocomplete="off" />
                            <button class="cc-name-save" id="ccNameSave" title="Salvar">✓</button>
                            <button class="cc-name-cancel" id="ccNameCancel" title="Cancelar">✕</button>
                        </div>
                        <div class="cc-number-line">
                            <span class="cc-number" id="ccNumber">${esc(fmtNumber(c.number))}</span>
                            <button class="cc-copy" id="ccCopy" title="Copiar número">${I.copy}</button>
                        </div>
                    </div>
                </div>

                <div class="cc-meta-grid">
                    <div class="cc-meta-row">
                        <span class="cc-meta-label">Status</span>
                        <span class="cc-badge ${statusCls}">${esc(statusTxt)}</span>
                    </div>
                    ${c.username ? `<div class="cc-meta-row">
                        <span class="cc-meta-label">Usuário</span>
                        <span class="cc-meta-val">${esc(c.username)}</span>
                    </div>` : ''}
                    <div class="cc-meta-row">
                        <span class="cc-meta-label">Última chamada</span>
                        <span class="cc-meta-val">${lastLine}</span>
                    </div>
                </div>

                <div class="cc-actions-main">
                    <button class="cc-btn cc-btn-primary" id="ccCall" ${(!c.online || c.blocked) ? 'disabled' : ''}>
                        ${I.phone}<span>Ligar</span>
                    </button>
                    <button class="cc-btn cc-btn-note" id="ccNote" ${c.blocked ? 'disabled' : ''}>
                        ${I.mic}<span>Recado</span>
                    </button>
                </div>

                <div class="cc-actions-sec">
                    <button class="cc-icon-btn ${c.fav ? 'active-fav' : ''}" id="ccFav" title="${c.fav ? 'Remover favorito' : 'Favoritar'}">
                        ${c.fav ? I.star : I.starOutline}
                        <span>${c.fav ? 'Favoritado' : 'Favoritar'}</span>
                    </button>
                    ${c.manualName ? `
                    <button class="cc-icon-btn" id="ccReset" title="Restaurar nome automático">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                            <path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/>
                        </svg>
                        <span>Restaurar</span>
                    </button>` : ''}
                    <button class="cc-icon-btn ${c.blocked ? 'active-block' : ''}" id="ccBlock" title="${c.blocked ? 'Desbloquear' : 'Bloquear'}">
                        ${I.block}
                        <span>${c.blocked ? 'Bloqueado' : 'Bloquear'}</span>
                    </button>
                    <button class="cc-icon-btn danger" id="ccRemove" title="Remover contato">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        <span>Remover</span>
                    </button>
                </div>
            </div>
        `;
        ctx.screenEl.appendChild(card);
        _cardEl = card;

        // ─── Eventos ───
        const closeBtn = card.querySelector('.cc-close');
        closeBtn.addEventListener('click', _closeCard);
        card.addEventListener('click', (e) => { if (e.target === card) _closeCard(); });

        // Copiar número
        const copyBtn = card.querySelector('#ccCopy');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(fmtNumber(c.number));
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = '✓';
                ctx.toast('Número copiado', 'ok');
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = I.copy;
                }, 1200);
            } catch(_) { ctx.toast('Falha ao copiar', 'err'); }
        });

        // Editar nome
        const nameDisplay = card.querySelector('#ccNameDisplay');
        const nameEdit = card.querySelector('.cc-name-edit');
        const nameInput = card.querySelector('#ccNameInput');
        const nameSave = card.querySelector('#ccNameSave');
        const nameCancel = card.querySelector('#ccNameCancel');

        const enterEditMode = () => {
            nameDisplay.hidden = true;
            nameEdit.hidden = false;
            nameInput.value = c.name;
            setTimeout(() => { nameInput.focus(); nameInput.select(); }, 30);
        };
        const exitEditMode = () => {
            nameEdit.hidden = true;
            nameDisplay.hidden = false;
        };
        const saveEdit = () => {
            const novo = nameInput.value.trim();
            if (!novo) { ctx.toast('Nome vazio', 'err'); nameInput.focus(); return; }
            if (novo === c.name) { exitEditMode(); return; }
            renameContact(c.number, novo);
            ctx.tone.fav();
            ctx.toast('Nome atualizado', 'ok');
            exitEditMode();
            // re-renderiza card e lista
            _closeCard();
            _renderContacts();
        };
        nameDisplay.addEventListener('click', enterEditMode);
        nameSave.addEventListener('click', saveEdit);
        nameCancel.addEventListener('click', exitEditMode);
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
            if (e.key === 'Escape') { e.preventDefault(); exitEditMode(); }
        });

        // Ligar
        const callBtn = card.querySelector('#ccCall');
        if (callBtn && !callBtn.disabled) callBtn.addEventListener('click', () => {
            _closeCard();
            ctx.tone.dial();
            _callByNumber(c.number);
        });

        // Recado — fecha o card e dispara o fluxo de gravação segurando
        const noteBtn = card.querySelector('#ccNote');
        if (noteBtn && !noteBtn.disabled) {
            // Reaproveita o wire do notes.js: ele usa pointerdown/up no botão.
            // Aqui fechamos o card antes para liberar o overlay de gravação.
            noteBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                _closeCard();
                // Redispatch manual no botão original da lista não é viável;
                // chamamos os helpers do próprio notes via ctx.
                if (ctx.notes.startFromCard) ctx.notes.startFromCard({ number: c.number, name: c.name }, noteBtn);
            });
        }

        // Favoritar
        card.querySelector('#ccFav').addEventListener('click', () => {
            const nowFav = toggleFav(c.number);
            ctx.tone.fav();
            ctx.toast(nowFav ? 'Favoritado' : 'Removido dos favoritos', 'fav');
            _closeCard();
            _renderContacts();
        });

        // Restaurar nome automático (só aparece se manualName)
        const resetBtn = card.querySelector('#ccReset');
        if (resetBtn) resetBtn.addEventListener('click', () => {
            clearManualName(c.number);
            ctx.tone.fav();
            ctx.toast('Nome restaurado', 'ok');
            _closeCard();
            _renderContacts();
        });

        // Bloquear / desbloquear
        card.querySelector('#ccBlock').addEventListener('click', () => {
            const nowBlk = toggleBlock(c.number);
            ctx.tone.block();
            ctx.toast(nowBlk ? 'Número bloqueado' : 'Número liberado', nowBlk ? 'err' : 'ok');
            _closeCard();
            _renderContacts();
        });

        // Remover
        card.querySelector('#ccRemove').addEventListener('click', () => {
            removeContact(c.number);
            ctx.tone.block();
            ctx.toast('Contato removido', 'ok');
            _closeCard();
            _renderContacts();
        });
    }

    // ═══ UI — RECENTES ═══
    function _renderHistory() {
        const content = ctx.screenEl?.querySelector('#phContent');
        if (!content) return;
        if (!_history.length) {
            content.innerHTML = `<div class="ph-list">
                <div class="ph-empty">
                    <strong>Sem chamadas ainda.</strong>
                    <div class="hint">Ligue para alguém pelo número ou pela lista de contatos.</div>
                </div>
            </div>`;
            return;
        }
        const rows = _history.map(h => {
            const first = h.members[0] || {};
            const initial = (first.name || '?')[0] || '?';
            const av = first.avatarUrl
                ? `<div class="ph-av"><img src="${esc(first.avatarUrl)}" alt="" /></div>`
                : `<div class="ph-av">${esc(initial.toUpperCase())}</div>`;
            const label = h.kind === 'group'
                ? (first.name || 'Grupo') + ' +' + (h.members.length - 1)
                : (first.name || fmtNumber(first.number));
            const dirClass = (h.status === 'missed' || h.status === 'rejected') ? 'dir-miss'
                            : (h.direction === 'incoming' ? 'dir-in' : 'dir-out');
            const dirIcon = h.direction === 'incoming' ? I.arrowIn : I.arrowOut;

            // DURAÇÃO — se > 0, mostra duração; senão, mostra status textual
            let durTxt, durCls;
            if (h.durationMs > 0) {
                durTxt = fmtDurShort(h.durationMs);
                durCls = 'dur';
            } else if (h.status === 'missed') {
                durTxt = 'perdida';
                durCls = 'miss';
            } else if (h.status === 'rejected') {
                durTxt = 'recusada';
                durCls = 'rej';
            } else {
                durTxt = '—';
                durCls = 'off';
            }

            const metaParts = [
                `<span class="${dirClass}" style="display:inline-flex;align-items:center;width:10px;height:10px;">${dirIcon}</span>`,
                h.kind === 'group' ? `<span class="grp">${h.members.length} pessoas</span>` : `<span class="num">${esc(fmtNumber(first.number))}</span>`,
                `<span class="when">${timeAgo(h.at)}</span>`,
                `<span class="dur ${durCls}">${esc(durTxt)}</span>`
            ];
            const canRecall = h.kind === '1:1' && first.number && first.number.length === 6 && !isBlocked(first.number);
            const callBtn = canRecall ? `<button class="ph-call-btn" data-num="${esc(first.number)}" title="Ligar">${I.phone}</button>` : '';
            const tooltip = `title="${esc(fullTimestamp(h.at))}${h.durationMs > 0 ? ' · ' + fmtDurShort(h.durationMs) : ''}"`;
            return `<div class="ph-contact" data-history-id="${esc(h.id)}" ${canRecall ? `data-num="${esc(first.number)}"` : ''} ${tooltip}>
                ${av}
                <div class="ph-info">
                    <div class="ph-name">${esc(label)}</div>
                    <div class="ph-meta">${metaParts.join('')}</div>
                </div>
                <button class="ph-rm" data-rm-id="${esc(h.id)}" title="Apagar">✕</button>
                ${callBtn}
            </div>`;
        }).join('');
        content.innerHTML = `<div class="ph-list">${rows}</div>`;
        content.querySelectorAll('.ph-contact').forEach(row => {
            const num = row.dataset.num;
            const id = row.dataset.historyId;
            const callBtn = row.querySelector('.ph-call-btn');
            const rmBtn = row.querySelector('.ph-rm');
            if (callBtn && num) callBtn.addEventListener('click', (e) => { e.stopPropagation(); ctx.tone.dial(); _callByNumber(num); });
            if (rmBtn) rmBtn.addEventListener('click', (e) => { e.stopPropagation(); removeHistoryAt(id); _renderHistory(); });
        });
    }

    // ═══ UI — DISCADOR ═══
    function _renderDial() {
        const content = ctx.screenEl?.querySelector('#phContent');
        if (!content) return;
        const keys = [
            { d: '1', sub: '' }, { d: '2', sub: 'ABC' }, { d: '3', sub: 'DEF' },
            { d: '4', sub: 'GHI' }, { d: '5', sub: 'JKL' }, { d: '6', sub: 'MNO' },
            { d: '7', sub: 'PQRS' }, { d: '8', sub: 'TUV' }, { d: '9', sub: 'WXYZ' },
            { util: 'back', svg: I.backspace }, { d: '0', sub: '+' }, { util: 'clear', svg: I.clear }
        ];
        const keypadHtml = keys.map(k => k.util
            ? `<button class="ph-key util" data-util="${k.util}">${k.svg}</button>`
            : `<button class="ph-key" data-digit="${k.d}"><span>${k.d}</span>${k.sub ? `<span class="sub">${k.sub}</span>` : ''}</button>`
        ).join('');
        content.innerHTML = `
            <div class="ph-dial">
                <div class="ph-dial-display">
                    <div class="ph-dial-num empty" id="phDialNum">_ _ _ — _ _ _</div>
                    <div class="ph-dial-hint" id="phDialHint">digite um número de 6 dígitos</div>
                </div>
                <div class="ph-keypad">${keypadHtml}</div>
                <div class="ph-dial-actions">
                    <button class="ph-dial-btn save" id="phSave" disabled>${I.save}<span>Salvar</span></button>
                    <button class="ph-dial-btn call" id="phCall" disabled>${I.phone}<span>Ligar</span></button>
                </div>
            </div>`;
        content.querySelectorAll('.ph-key').forEach(k => {
            k.addEventListener('click', () => {
                ctx.tone.key();
                k.classList.remove('pressed'); void k.offsetWidth; k.classList.add('pressed');
                if (k.dataset.digit) { if (_dialBuffer.length < 6) _dialBuffer += k.dataset.digit; }
                else if (k.dataset.util === 'back') _dialBuffer = _dialBuffer.slice(0, -1);
                else if (k.dataset.util === 'clear') _dialBuffer = '';
                _updateDialDisplay();
            });
        });
        content.querySelector('#phCall').addEventListener('click', () => {
            if (_dialBuffer.length === 6) { ctx.tone.dial(); _callByNumber(_dialBuffer); }
        });
        content.querySelector('#phSave').addEventListener('click', async () => {
            if (_dialBuffer.length !== 6) return;
            const res = await addContactByNumber(_dialBuffer);
            if (res.ok) {
                ctx.toast('Contato salvo', 'ok');
                _dialBuffer = '';
                _updateDialDisplay();
                const tabs = ctx.frameEl?.querySelectorAll('.ph-tab');
                tabs?.forEach(b => b.classList.toggle('active', b.dataset.tab === 'contatos'));
                ctx.renderTab();
            } else ctx.toast(res.err || 'Erro', 'err');
        });
        _updateDialDisplay();
    }

    async function _updateDialDisplay() {
        const numEl = ctx.screenEl?.querySelector('#phDialNum');
        const hintEl = ctx.screenEl?.querySelector('#phDialHint');
        const callBtn = ctx.screenEl?.querySelector('#phCall');
        const saveBtn = ctx.screenEl?.querySelector('#phSave');
        if (!numEl || !hintEl) return;
        const b = _dialBuffer;
        numEl.innerHTML = _dialDisplayHtml(b);
        numEl.classList.toggle('empty', b.length === 0);
        const full = b.length === 6;
        if (callBtn) callBtn.disabled = !full || b === ctx.myNumber || isBlocked(b);
        if (saveBtn) saveBtn.disabled = !full || hasContact(b) || b === ctx.myNumber;

        if (!full) {
            hintEl.textContent = b.length === 0 ? 'digite um número de 6 dígitos' : (b.length + '/6');
            hintEl.className = 'ph-dial-hint';
            return;
        }
        if (b === ctx.myNumber) { hintEl.innerHTML = 'este é o <span class="name">seu número</span>'; hintEl.className = 'ph-dial-hint'; return; }
        if (isBlocked(b)) { hintEl.textContent = 'número bloqueado'; hintEl.className = 'ph-dial-hint blocked'; return; }
        const seq = ++_dialLookupSeq;
        hintEl.textContent = 'consultando…'; hintEl.className = 'ph-dial-hint';
        const dir = await _getDirectory(b);
        if (seq !== _dialLookupSeq) return;
        if (dir && dir.username) {
            const name = dir.displayName || dir.username;
            hintEl.innerHTML = `<span class="name">${esc(name)}</span> · ${hasContact(b) ? 'salvo' : 'não salvo'}`;
        } else { hintEl.textContent = 'número não registrado'; hintEl.className = 'ph-dial-hint err'; }
    }
    function _dialDisplayHtml(b) {
        if (!b) return '_ _ _ — _ _ _';
        if (b.length <= 3) {
            const shown = b.split('').join(' ');
            const pad = Math.max(0, 3 - b.length);
            const rest = pad ? ' ' + '_ '.repeat(pad).trim() : '';
            return shown + rest + ' — _ _ _';
        }
        const head = b.slice(0, 3).split('').join(' ');
        const tail = b.slice(3).split('').join(' ');
        const padTail = Math.max(0, 3 - (b.length - 3));
        const tailPad = padTail ? ' ' + '_ '.repeat(padTail).trim() : '';
        return head + ' <span class="dash">—</span> ' + tail + tailPad;
    }

    // ═══ LIGAR POR NÚMERO ═══
    async function _callByNumber(number) {
        const clean = parseNumber(number);
        if (clean.length !== 6) { ctx.toast('Número incompleto', 'err'); return; }
        if (clean === ctx.myNumber) { ctx.toast('Você não pode ligar para si mesmo', 'err'); return; }
        if (isBlocked(clean)) { ctx.toast('Número bloqueado', 'err'); return; }
        await _fetchSessions(true);
        let username = '';
        const dir = await _getDirectory(clean);
        if (dir && dir.username) username = dir.username;
        let live = null;
        if (username) live = _findLiveSession(username);
        if (!live) {
            const now = Date.now();
            const myId = bridge.deviceId || '';
            live = _sessionsCache.find(s => s.id !== myId && s.phoneNumber === clean && (now - (s.lastSeen || 0)) < ONLINE_MS) || null;
        }
        if (!live) {
            if (dir) updateContactMeta(clean, { username: dir.username || '', savedName: dir.displayName || '', savedAvatar: dir.avatarUrl || '' });
            const name = dir?.displayName || username || fmtNumber(clean);
            pushHistory({
                id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                direction: 'outgoing', kind: '1:1', status: 'missed',
                members: [{ number: clean, name, avatarUrl: dir?.avatarUrl || '' }],
                at: Date.now(), durationMs: 0
            });
            ctx.calls.busyTone?.('Fora de área', name + ' não está disponível.');
            return;
        }
        if (hasContact(clean)) updateContactMeta(clean, { username: live.name || username || '', savedName: live.name || '', savedAvatar: live.avatarUrl || '' });
        ctx.calls.call?.([{
            id: live.id, name: live.name || username || fmtNumber(clean),
            avatarUrl: live.avatarUrl || '', number: clean, lastSeen: live.lastSeen || 0
        }]);
    }

    // ═══ ESTILO ═══
    ctx.appendStyle(`
        .ph-search { margin: 0 12px 6px; padding: 6px 10px 6px 26px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px; color: #f1f2f8; font-size: 10.5px; font-family: inherit; outline: none;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238890a8' stroke-width='2.6' stroke-linecap='round'><circle cx='11' cy='11' r='7'/><line x1='21' y1='21' x2='16.5' y2='16.5'/></svg>");
            background-repeat: no-repeat; background-position: 9px center; transition: border-color .2s, background-color .2s; }
        .ph-search:focus { border-color: rgba(34,211,238,.55); background-color: rgba(255,255,255,.08); }
        .ph-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 4px; }
        .ph-list::-webkit-scrollbar { width: 4px; }
        .ph-list::-webkit-scrollbar-thumb { background: rgba(167,139,250,.35); border-radius: 2px; }
        .ph-empty { padding: 30px 20px; text-align: center; font-size: 10.5px; color: #8a90a8; line-height: 1.6; }
        .ph-empty strong { color: #a7f3d0; font-weight: 800; }
        .ph-empty .hint { font-size: 9.5px; color: #5c6280; margin-top: 8px; }
        .ph-section-hdr { padding: 8px 4px 4px; font-size: 8.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
            color: #a8aec4; display: flex; align-items: center; gap: 6px; }
        .ph-section-hdr .line { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(168,174,196,.24), transparent); }
        .ph-section-hdr.fav { color: #fbbf24; }
        .ph-section-hdr.blocked { color: #fb7185; }
        .ph-contact { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px;
            background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.07); cursor: pointer; position: relative;
            transition: background .2s cubic-bezier(.22,1,.36,1), border-color .2s cubic-bezier(.22,1,.36,1),
                        transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s cubic-bezier(.22,1,.36,1); }
        .ph-contact:hover { background: rgba(255,255,255,.075); border-color: rgba(34,211,238,.38);
            transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.3), 0 0 0 1px rgba(34,211,238,.08); }
        .ph-contact:active { transform: translateY(0) scale(.985); }
        .ph-contact.offline { opacity: .55; }
        .ph-contact.offline:hover { opacity: .75; }
        .ph-contact.blocked { border-color: rgba(251,113,133,.32); background: rgba(251,113,133,.06); }
        .ph-contact.blocked .ph-name { text-decoration: line-through; color: #a8aec4; }
        .ph-contact.fav { border-color: rgba(251,191,36,.24); }
        .ph-contact.fav:hover { border-color: rgba(251,191,36,.46); }
        .ph-av { width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
            background: linear-gradient(135deg, rgba(34,211,238,.22), rgba(167,139,250,.22));
            border: 1px solid rgba(255,255,255,.1);
            display: flex; align-items: center; justify-content: center;
            overflow: hidden; position: relative; color: #a8aec4; font-size: 14px; font-weight: 800; }
        .ph-av img { position: absolute; top: -25%; left: -40%; width: 210%; height: 210%; object-fit: cover; }
        .ph-av.sm { width: 30px; height: 30px; font-size: 11px; border-radius: 10px; }
        .ph-av .dot-online { position: absolute; bottom: -1px; right: -1px; width: 10px; height: 10px; border-radius: 50%;
            background: #34d399; border: 2px solid #1a1830; animation: phPulseDot 2s ease-in-out infinite; }
        .ph-av .fav-badge { position: absolute; top: -4px; left: -4px; width: 14px; height: 14px; border-radius: 50%;
            background: linear-gradient(135deg, #fbbf24, #f59e0b); border: 1px solid #1a1830;
            display: inline-flex; align-items: center; justify-content: center; font-size: 8px; color: #1a1410; }
        .ph-info { flex: 1; min-width: 0; }
        .ph-name { font-size: 11.5px; font-weight: 700; color: #e8eaf4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ph-meta { font-size: 9px; color: #a8aec4; margin-top: 2px; font-variant-numeric: tabular-nums;
            display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .ph-meta .num { color: #67e8f9; font-weight: 700; letter-spacing: .03em; }
        .ph-meta .off { color: #7d8399; }
        .ph-meta .when { color: #8a90a8; }
        .ph-meta .dur { font-weight: 700; }
        .ph-meta .dur.dur { color: #a7f3d0; }
        .ph-meta .dur.miss { color: #fca5b1; }
        .ph-meta .dur.rej { color: #fca5b1; font-weight: 600; }
        .ph-meta .dur.off { color: #6b7280; }
        .ph-meta .dir-in { color: #a7f3d0; }
        .ph-meta .dir-out { color: #67e8f9; }
        .ph-meta .dir-miss { color: #fca5b1; }
        .ph-meta .grp { color: #c4b5fd; font-weight: 700; }
        .ph-call-btn { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
            border: 1px solid rgba(52,211,153,.4); background: rgba(52,211,153,.14);
            color: #a7f3d0; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all .2s cubic-bezier(.22,1,.36,1); pointer-events: auto; }
        .ph-call-btn:hover { background: rgba(52,211,153,.24); box-shadow: 0 0 12px rgba(52,211,153,.35); }
        .ph-call-btn:disabled { opacity: .35; cursor: not-allowed; }
        .ph-call-btn svg { width: 12px; height: 12px; }
        .ph-note-btn { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
            border: 1px solid rgba(167,139,250,.4); background: rgba(167,139,250,.14);
            color: #c4b5fd; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all .2s cubic-bezier(.22,1,.36,1); pointer-events: auto; touch-action: none; }
        .ph-note-btn:hover { background: rgba(167,139,250,.24); box-shadow: 0 0 12px rgba(167,139,250,.35); }
        .ph-note-btn.recording { background: linear-gradient(135deg, #fb7185, #f472b6); color: #fff; border-color: transparent; animation: phSpeaking 1.4s ease-in-out infinite; }
        .ph-note-btn svg { width: 12px; height: 12px; }
        .ph-rm { flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px; background: transparent;
            border: none; cursor: pointer; color: #7d8399; font-family: inherit; font-size: 12px; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity .15s, color .15s, background .15s; }
        .ph-contact:hover .ph-rm { opacity: 1; }
        .ph-rm:hover { color: #fca5b1; background: rgba(251,113,133,.14); }
        .ph-dial { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0 18px 12px; }
        .ph-dial-display { padding: 12px 0 16px; text-align: center; min-height: 62px;
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
        .ph-dial-num { font-size: 28px; font-weight: 800; letter-spacing: .08em;
            font-variant-numeric: tabular-nums; color: #f1f2f8; transition: color .2s;
            min-height: 34px; display: flex; align-items: center; justify-content: center; }
        .ph-dial-num .dash { color: #22d3ee; margin: 0 2px; }
        .ph-dial-num.empty { color: #4f5468; }
        .ph-dial-hint { font-size: 9.5px; color: #8890a8; letter-spacing: .05em; min-height: 12px; }
        .ph-dial-hint.err { color: #fca5b1; }
        .ph-dial-hint.blocked { color: #fb7185; }
        .ph-dial-hint .name { color: #67e8f9; font-weight: 800; }
        .ph-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
        .ph-key { padding: 12px 0 10px; border-radius: 14px;
            background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03));
            border: 1px solid rgba(255,255,255,.09);
            color: #e8eaf4; font-family: inherit; font-size: 19px; font-weight: 700;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            cursor: pointer; user-select: none;
            transition: background .12s, border-color .12s, transform .12s, box-shadow .12s;
            position: relative; line-height: 1; box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .ph-key .sub { font-size: 7.5px; color: #8890a8; letter-spacing: .06em; margin-top: 3px; font-weight: 800; text-transform: uppercase; }
        .ph-key:hover { background: linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.05)); border-color: rgba(34,211,238,.35); box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 0 0 1px rgba(34,211,238,.08); }
        .ph-key:active { transform: scale(.94); background: linear-gradient(180deg, rgba(34,211,238,.22), rgba(34,211,238,.08)); }
        .ph-key.pressed { animation: phKeyPress .25s cubic-bezier(.22,1,.36,1); }
        .ph-key.util { color: #a8aec4; font-size: 15px; }
        .ph-key.util:hover { color: #67e8f9; }
        .ph-key.util svg { width: 16px; height: 16px; }
        .ph-dial-actions { display: flex; gap: 8px; }
        .ph-dial-btn { flex: 1; padding: 11px 10px; border-radius: 12px; border: none;
            font-family: inherit; font-size: 11px; font-weight: 800; letter-spacing: .04em;
            cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
            transition: all .16s cubic-bezier(.22,1,.36,1); }
        .ph-dial-btn svg { width: 14px; height: 14px; }
        .ph-dial-btn.call { background: linear-gradient(135deg, #34d399, #22d3ee); color: #062420;
            box-shadow: 0 8px 20px rgba(52,211,153,.3), inset 0 1px 0 rgba(255,255,255,.25); }
        .ph-dial-btn.call:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(52,211,153,.4), inset 0 1px 0 rgba(255,255,255,.3); }
        .ph-dial-btn.save { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); color: #c7cad6; }
        .ph-dial-btn.save:hover:not(:disabled) { background: rgba(255,255,255,.12); transform: translateY(-1px); }
        .ph-dial-btn:disabled { opacity: .35; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
        .ph-dial-btn:active:not(:disabled) { transform: translateY(0) scale(.97); }

        /* ═══ CARD DE CONTATO ═══ */
        .cc-overlay {
            position: absolute; inset: 0;
            background: rgba(10,8,22,.72);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            display: flex; align-items: center; justify-content: center;
            padding: 20px 14px;
            z-index: 30;
            animation: phFadeIn .22s ease;
        }
        .cc-overlay.closing { animation: ccOut .22s ease forwards; }
        @keyframes ccOut { to { opacity: 0; } }
        @keyframes ccSlideIn {
            from { opacity: 0; transform: translateY(14px) scale(.96); }
            to { opacity: 1; transform: none; }
        }
        .cc-panel {
            position: relative;
            width: 100%; max-width: 300px;
            max-height: calc(100% - 40px);
            overflow-y: auto;
            border-radius: 18px;
            padding: 18px 16px 16px;
            background:
                radial-gradient(circle at 20% 0%, rgba(34,211,238,.14), transparent 55%),
                radial-gradient(circle at 85% 100%, rgba(167,139,250,.16), transparent 55%),
                linear-gradient(175deg, #1f1c38 0%, #16132c 60%, #0f0d22 100%);
            border: 1px solid rgba(255,255,255,.1);
            box-shadow: 0 24px 60px rgba(0,0,0,.75), 0 0 40px rgba(34,211,238,.06), inset 0 1px 0 rgba(255,255,255,.08);
            animation: ccSlideIn .32s cubic-bezier(.16,1,.3,1);
            isolation: isolate;
        }
        .cc-panel::-webkit-scrollbar { width: 4px; }
        .cc-panel::-webkit-scrollbar-thumb { background: rgba(167,139,250,.35); border-radius: 2px; }

        .cc-close {
            position: absolute; top: 10px; right: 10px;
            width: 26px; height: 26px; border-radius: 8px;
            background: transparent; border: 1px solid rgba(255,255,255,.12);
            color: #a8aec4; cursor: pointer; font-family: inherit; font-size: 13px; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            transition: all .15s;
        }
        .cc-close:hover { background: rgba(251,113,133,.16); color: #fca5b1; border-color: rgba(251,113,133,.4); }

        .cc-top { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; margin-top: 4px; }
        .cc-av {
            width: 68px; height: 68px; border-radius: 20px; flex-shrink: 0;
            background: linear-gradient(135deg, rgba(34,211,238,.24), rgba(167,139,250,.24));
            border: 1px solid rgba(255,255,255,.12);
            display: flex; align-items: center; justify-content: center;
            overflow: hidden; position: relative;
            color: #a8aec4; font-size: 24px; font-weight: 800;
            box-shadow: 0 10px 26px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1);
        }
        .cc-av img { position: absolute; top: -25%; left: -40%; width: 210%; height: 210%; object-fit: cover; }
        .cc-av .dot-online { position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; border-radius: 50%;
            background: #34d399; border: 3px solid #16132c; animation: phPulseDot 2s ease-in-out infinite; }

        .cc-nameline { flex: 1; min-width: 0; }
        .cc-name-display {
            font-size: 15px; font-weight: 800; color: #f1f2f8; letter-spacing: .02em;
            display: flex; align-items: center; gap: 6px;
            cursor: pointer; padding: 3px 4px; margin: -3px -4px;
            border-radius: 8px;
            transition: background .15s, color .15s;
        }
        .cc-name-display:hover { background: rgba(34,211,238,.08); color: #fff; }
        .cc-name-display.manual { color: #a7f3d0; }
        .cc-name-display .cc-name-edit-hint {
            font-size: 10px; color: #67e8f9; opacity: 0;
            transition: opacity .15s;
        }
        .cc-name-display:hover .cc-name-edit-hint { opacity: .8; }
        .cc-name-edit { display: flex; gap: 4px; align-items: center; }
        .cc-name-input {
            flex: 1; min-width: 0; padding: 6px 9px; font-size: 13px; font-weight: 700;
            background: rgba(255,255,255,.07); border: 1px solid rgba(34,211,238,.5);
            border-radius: 8px; color: #f1f2f8; font-family: inherit; outline: none;
            box-shadow: 0 0 0 3px rgba(34,211,238,.14);
        }
        .cc-name-save, .cc-name-cancel {
            width: 26px; height: 26px; border-radius: 7px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-family: inherit;
            font-size: 12px; font-weight: 800; line-height: 1; border: 1px solid transparent;
        }
        .cc-name-save { background: linear-gradient(135deg, #34d399, #22d3ee); color: #062420; }
        .cc-name-save:hover { filter: brightness(1.1); }
        .cc-name-cancel { background: rgba(255,255,255,.06); color: #c7cad6; border-color: rgba(255,255,255,.12); }
        .cc-name-cancel:hover { background: rgba(255,255,255,.1); }

        .cc-number-line { display: flex; align-items: center; gap: 6px; margin-top: 5px; }
        .cc-number { font-size: 11px; color: #67e8f9; font-weight: 700; letter-spacing: .06em; font-variant-numeric: tabular-nums; }
        .cc-copy {
            width: 18px; height: 18px; border-radius: 5px;
            background: transparent; border: none; cursor: pointer; color: #8a90a8; padding: 0;
            display: flex; align-items: center; justify-content: center;
            transition: color .15s, background .15s, transform .15s;
            font-family: inherit;
        }
        .cc-copy svg { width: 11px; height: 11px; }
        .cc-copy:hover { color: #67e8f9; background: rgba(34,211,238,.14); }
        .cc-copy.copied { color: #a7f3d0; background: rgba(52,211,153,.16); font-size: 11px; font-weight: 800; transform: scale(1.15); }

        .cc-meta-grid {
            display: flex; flex-direction: column; gap: 1px;
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.06);
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 12px;
        }
        .cc-meta-row {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 9px 12px;
            border-bottom: 1px solid rgba(255,255,255,.04);
            font-size: 10.5px;
        }
        .cc-meta-row:last-child { border-bottom: none; }
        .cc-meta-label { color: #8a90a8; text-transform: uppercase; letter-spacing: .06em; font-weight: 800; font-size: 8.5px; }
        .cc-meta-val { color: #e8eaf4; font-weight: 600; display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .cc-badge {
            display: inline-flex; align-items: center; gap: 4px;
            padding: 3px 9px; border-radius: 14px;
            font-size: 9px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase;
        }
        .cc-badge::before { content: ''; width: 5px; height: 5px; border-radius: 50%; }
        .cc-badge.ok { background: rgba(52,211,153,.14); color: #a7f3d0; border: 1px solid rgba(52,211,153,.34); }
        .cc-badge.ok::before { background: #34d399; box-shadow: 0 0 6px rgba(52,211,153,.75); }
        .cc-badge.bad { background: rgba(251,113,133,.14); color: #fca5b1; border: 1px solid rgba(251,113,133,.34); }
        .cc-badge.bad::before { background: #fb7185; }
        .cc-badge.neutral { background: rgba(255,255,255,.06); color: #c7cad6; border: 1px solid rgba(255,255,255,.1); }
        .cc-badge.neutral::before { background: #5b5f70; }

        .cc-last { display: inline-flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
        .cc-last .dir-in { color: #a7f3d0; }
        .cc-last .dir-out { color: #67e8f9; }
        .cc-last .dir-miss { color: #fca5b1; }
        .cc-last .dot-sep { color: #5b5f70; }
        .cc-last-empty { color: #5c6280; font-style: italic; font-weight: 500; }

        .cc-actions-main { display: flex; gap: 8px; margin-bottom: 10px; }
        .cc-btn {
            flex: 1; padding: 11px 12px; border-radius: 11px; border: none; cursor: pointer;
            font-family: inherit; font-size: 11px; font-weight: 800; letter-spacing: .04em;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            transition: all .16s cubic-bezier(.22,1,.36,1);
        }
        .cc-btn svg { width: 14px; height: 14px; }
        .cc-btn-primary {
            background: linear-gradient(135deg, #34d399, #22d3ee);
            color: #062420;
            box-shadow: 0 8px 20px rgba(52,211,153,.3), inset 0 1px 0 rgba(255,255,255,.25);
        }
        .cc-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(52,211,153,.4), inset 0 1px 0 rgba(255,255,255,.3); }
        .cc-btn-note {
            background: linear-gradient(135deg, rgba(167,139,250,.22), rgba(244,114,182,.22));
            color: #e9d5ff;
            border: 1px solid rgba(167,139,250,.4);
        }
        .cc-btn-note:hover:not(:disabled) { background: linear-gradient(135deg, rgba(167,139,250,.32), rgba(244,114,182,.32)); transform: translateY(-1px); }
        .cc-btn:disabled { opacity: .35; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
        .cc-btn:active:not(:disabled) { transform: translateY(0) scale(.97); }

        .cc-actions-sec {
            display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
        }
        .cc-icon-btn {
            display: flex; align-items: center; justify-content: center; gap: 5px;
            padding: 9px 8px; border-radius: 10px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            color: #c7cad6; cursor: pointer; font-family: inherit;
            font-size: 9.5px; font-weight: 700; letter-spacing: .03em;
            transition: all .16s cubic-bezier(.22,1,.36,1);
        }
        .cc-icon-btn svg { width: 12px; height: 12px; flex-shrink: 0; }
        .cc-icon-btn:hover { background: rgba(255,255,255,.1); color: #fff; transform: translateY(-1px); }
        .cc-icon-btn:active { transform: translateY(0) scale(.96); }
        .cc-icon-btn.active-fav { background: linear-gradient(135deg, rgba(251,191,36,.18), rgba(245,158,11,.18)); color: #fde68a; border-color: rgba(251,191,36,.4); }
        .cc-icon-btn.active-block { background: rgba(251,113,133,.14); color: #fca5b1; border-color: rgba(251,113,133,.36); }
        .cc-icon-btn.danger:hover { background: rgba(251,113,133,.14); color: #fca5b1; border-color: rgba(251,113,133,.36); }

        @media (prefers-reduced-motion: reduce) {
            .cc-panel { animation: none !important; }
            .cc-overlay, .cc-overlay.closing { animation: none !important; }
        }
    `);

    // ═══ INIT ═══
    loadContacts();
    loadHistory();
    loadBlocked();
    _fetchSessions(true).catch(() => {});

    // ═══ EXPORTAR ═══
    Object.assign(ctx.contacts, {
        ensureMyNumber: _ensureMyNumber,
        refreshMyDirectory: _refreshMyDirectory,
        renderContacts: _renderContacts,
        renderDial: _renderDial,
        renderHistory: _renderHistory,
        findLiveSession: _findLiveSession,
        fetchSessions: _fetchSessions,
        pushHistory,
        isBlocked,
        hasContact,
        addContactByNumber,
        removeContact,
        updateContactMeta,
        renameContact,
        clearManualName,
        toggleFav,
        toggleBlock,
        fmtNumber,
        parseNumber,
        openContactCard: _openContactCard,
        closeContactCard: _closeCard,
        get contacts() { return _contacts; },
        get history() { return _history; },
        get blocked() { return _blocked; },
        get sessionsCache() { return _sessionsCache; },
        callByNumber: _callByNumber
    });
})();
