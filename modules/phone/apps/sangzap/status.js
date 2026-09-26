// modules/phone/apps/sangzap/status.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.status) return;

    const ST = {};
    const TTL = 24 * 60 * 60 * 1000;
    const VIEWER_MS = 5000;
    const POLL_MS = 5000;

    let _myNumber = null;
    let _timer = null;
    let _onUpdate = null;
    let _cache = [];

    // ═══ CRUD ═══
    async function fetchFrom(number) {
        try {
            const docs = await ctx.bridge.firestore.request('GET',
                `/sangzap_status/${number}/items?orderBy=${encodeURIComponent('createdAt desc')}&pageSize=30`);
            return docs.map(d => ({ id: d.id, ...d.data })).filter(x => x && x.expiresAt > Date.now());
        } catch(_) { return []; }
    }

    ST.post = async function(kind, body, media) {
        const now = Date.now();
        const id = 'st' + now.toString(36) + Math.random().toString(36).slice(2, 6);
        const doc = {
            kind,
            body: kind === 'text' ? S.sanitize(body || '').slice(0, 200) : '',
            media: media || '',
            caption: kind !== 'text' ? S.sanitize(body || '').slice(0, 200) : '',
            createdAt: now,
            expiresAt: now + TTL,
            viewers: []
        };
        await ctx.bridge.firestore.request('POST',
            `/sangzap_status/${_myNumber}/items?documentId=${id}`, doc);
        return { id, ...doc };
    };

    ST.markViewed = async function(number, statusId) {
        try {
            // lê, adiciona, escreve — Firestore REST não tem arrayUnion sem auth SDK
            const doc = await ctx.bridge.firestore.parseDoc(`sangzap_status/${number}/items`, statusId);
            const viewers = new Set(doc?.viewers || []);
            if (viewers.has(_myNumber)) return;
            viewers.add(_myNumber);
            await ctx.bridge.firestore.request('PATCH',
                `/sangzap_status/${number}/items/${statusId}`,
                { viewers: [...viewers] });
        } catch(_) {}
    };

    // ═══ AGG ═══
    async function fetchAll() {
        const contacts = ctx.contacts?.contacts || [];
        const nums = new Set([_myNumber]);
        for (const c of contacts) {
            const n = c.number || c.num;
            if (n && n !== _myNumber) nums.add(n);
        }
        const out = [];
        await Promise.all([...nums].map(async n => {
            const items = await fetchFrom(n);
            if (!items.length) return;
            let prof = { displayName: '', avatar: '' };
            try { prof = await ctx.bridge.firestore.parseDoc('sangzap_profiles', n) || prof; } catch(_) {}
            out.push({
                number: n,
                profile: prof,
                items: items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
                unseen: items.some(i => !(i.viewers || []).includes(_myNumber))
            });
        }));
        return out;
    }

    async function tick() {
        _cache = await fetchAll();
        _onUpdate?.(_cache);
    }

    // ═══ VIEWER ═══
    ST.openViewer = function(body, user, startIdx = 0) {
        const overlay = document.createElement('div');
        overlay.className = 'sz-status-viewer';
        body.appendChild(overlay);

        let idx = Math.max(0, Math.min(startIdx, user.items.length - 1));
        let timer = null;

        function render() {
            clearTimeout(timer);
            const it = user.items[idx];
            if (!it) { close(); return; }
            const name = user.profile?.displayName || S.shortNum(user.number);
            const avatar = user.profile?.avatar
                ? `<img src="${S.escape(user.profile.avatar)}" alt="" />`
                : `<span class="sz-av-fallback">${S.escape((name || '?')[0].toUpperCase())}</span>`;

            const mediaHtml = it.kind === 'image'
                ? `<div class="sz-status-media"><img src="${S.escape(it.media)}" alt="" /></div>`
                : '';

            const progress = user.items.map((_, i) => {
                const on = i < idx ? 'done' : i === idx ? 'active' : '';
                return `<span class="sz-status-bar ${on}"></span>`;
            }).join('');

            overlay.innerHTML = `
                <div class="sz-status-top">
                    <div class="sz-status-progress">${progress}</div>
                    <div class="sz-status-head">
                        <div class="sz-avatar sz-avatar-sm">${avatar}</div>
                        <div class="sz-status-head-name">${S.escape(name)}</div>
                        <div class="sz-status-head-time">${S.fmtRelative(it.createdAt)}</div>
                        <button class="sz-status-close" id="szStatusClose">×</button>
                    </div>
                </div>
                <div class="sz-status-content">
                    ${mediaHtml}
                    ${it.body ? `<div class="sz-status-text">${S.escape(it.body)}</div>` : ''}
                    ${it.caption ? `<div class="sz-status-caption">${S.escape(it.caption)}</div>` : ''}
                </div>
                <div class="sz-status-tap left" data-dir="prev"></div>
                <div class="sz-status-tap right" data-dir="next"></div>
            `;

            overlay.querySelector('#szStatusClose').addEventListener('click', close);
            overlay.querySelectorAll('.sz-status-tap').forEach(el => {
                el.addEventListener('click', () => {
                    if (el.dataset.dir === 'next') next();
                    else prev();
                });
            });

            ST.markViewed(user.number, it.id);
            if (user.number !== _myNumber) {
                const seen = new Set(it.viewers || []);
                seen.add(_myNumber);
                it.viewers = [...seen];
            }

            // barra ativa anima em VIEWER_MS
            const active = overlay.querySelector('.sz-status-bar.active');
            if (active) {
                active.style.transition = `width ${VIEWER_MS}ms linear`;
                active.style.width = '0%';
                void active.offsetWidth;
                active.style.width = '100%';
            }
            timer = setTimeout(next, VIEWER_MS);
        }

        function next() {
            if (idx < user.items.length - 1) { idx++; render(); }
            else close();
        }
        function prev() {
            if (idx > 0) { idx--; render(); }
        }
        function close() {
            clearTimeout(timer);
            overlay.remove();
            tick();
        }

        render();
    };

    // ═══ TAB ═══
    ST.renderTab = function(body, myNumber) {
        _myNumber = myNumber;
        body.innerHTML = `
            <div class="sz-status-tab">
                <div class="sz-status-actions">
                    <button class="sz-btn sz-btn-primary" id="szStatusNew">+ Novo status</button>
                </div>
                <div class="sz-status-list" id="szStatusList">
                    <div class="sz-empty">Carregando…</div>
                </div>
            </div>
        `;

        const list = body.querySelector('#szStatusList');

        function paint(users) {
            if (!users.length) {
                list.innerHTML = `<div class="sz-empty">Nenhum status ativo.</div>`;
                return;
            }
            list.innerHTML = users.map(u => {
                const name = u.profile?.displayName || S.shortNum(u.number);
                const avatar = u.profile?.avatar
                    ? `<img src="${S.escape(u.profile.avatar)}" alt="" />`
                    : `<span class="sz-av-fallback">${S.escape((name || '?')[0].toUpperCase())}</span>`;
                const ring = u.unseen ? ' unseen' : '';
                return `
                    <button class="sz-status-user${ring}" data-num="${S.escape(u.number)}">
                        <div class="sz-avatar sz-avatar-ring">${avatar}</div>
                        <div class="sz-item-body">
                            <div class="sz-item-title">${S.escape(name)}</div>
                            <div class="sz-item-preview">${u.items.length} atualizaç${u.items.length === 1 ? 'ão' : 'ões'}</div>
                        </div>
                    </button>
                `;
            }).join('');
            list.querySelectorAll('.sz-status-user').forEach(btn => {
                btn.addEventListener('click', () => {
                    const u = users.find(x => x.number === btn.dataset.num);
                    if (u) ST.openViewer(body, u);
                });
            });
        }

        ST.start(myNumber, paint);

        body.querySelector('#szStatusNew').addEventListener('click', () => openComposer(body, myNumber));
    };

    function openComposer(body, myNumber) {
        const modal = document.createElement('div');
        modal.className = 'sz-modal';
        modal.innerHTML = `
            <div class="sz-modal-card">
                <div class="sz-modal-title">Novo status</div>
                <div class="sz-modal-body">
                    <textarea class="sz-input sz-textarea" id="szStatusText"
                        maxlength="200" placeholder="O que está acontecendo?"></textarea>
                    <button class="sz-btn ghost" id="szStatusImg">+ Foto</button>
                    <div class="sz-status-img-preview" id="szStatusImgPreview"></div>
                </div>
                <div class="sz-modal-actions">
                    <button class="sz-btn" id="szStatusCancel">Cancelar</button>
                    <button class="sz-btn sz-btn-primary" id="szStatusPost">Publicar</button>
                </div>
            </div>
        `;
        body.appendChild(modal);

        let media = '';
        modal.querySelector('#szStatusImg').addEventListener('click', async () => {
            const dataUrl = await S.profile?.pickAndCrop?.();
            if (!dataUrl) return;
            media = dataUrl;
            modal.querySelector('#szStatusImgPreview').innerHTML = `<img src="${S.escape(dataUrl)}" alt="" />`;
        });
        modal.querySelector('#szStatusCancel').addEventListener('click', () => modal.remove());
        modal.querySelector('#szStatusPost').addEventListener('click', async () => {
            const text = modal.querySelector('#szStatusText').value.trim();
            if (!text && !media) { ctx.toast?.('Escreva algo ou escolha foto', 'err'); return; }
            try {
                await ST.post(media ? 'image' : 'text', text, media);
                modal.remove();
                ctx.toast?.('Status publicado', 'ok');
                tick();
            } catch(e) {
                console.warn('[Sangzap/status] post:', e);
                ctx.toast?.('Falha ao publicar', 'err');
            }
        });
    }

    // ═══ POLL ═══
    ST.start = function(myNumber, onUpdate) {
        _myNumber = myNumber;
        _onUpdate = onUpdate;
        ST.stop();
        tick();
        _timer = setInterval(tick, POLL_MS);
    };
    ST.stop = function() {
        if (_timer) { clearInterval(_timer); _timer = null; }
    };
    ST.get = () => _cache;

    S.status = ST;
})();
