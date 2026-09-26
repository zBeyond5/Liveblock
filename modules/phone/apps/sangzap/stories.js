// modules/phone/apps/sangzap/stories.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.stories) return;

    // ═══ FS HELPERS — tradução inline Firestore REST ═══
    // Idempotente. Instala uma única vez.
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

        S.fsQuery = async function(structuredQuery) {
            const res = await ctx.bridge.firestore.request('POST', ':runQuery', { structuredQuery });
            return (Array.isArray(res) ? res : []).map(r => {
                if (!r || !r.document) return null;
                return {
                    id: (r.document.name || '').split('/').pop(),
                    ...ctx.bridge.firestore.parseDoc(r.document)
                };
            }).filter(Boolean);
        };

        S.fsDel = async function(path) {
            return ctx.bridge.firestore.request('DELETE', path);
        };
    })();

    const SG = {};
    const TTL = 24 * 60 * 60 * 1000;
    const POLL_MS = 6000;
    const PROFILE_TTL = 60_000;
    const VIEWER_DURATION = 5000;

    const REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];

    let _myNumber = null;
    let _timer = null;
    let _onUpdate = null;
    let _cache = [];
    let _groups = [];
    let _lastHash = 0;
    let _profileCache = new Map();
    let _openOverlay = null;
    let _overlayRaf = null;
    let _viewerCleanup = null;

    // ═══ PROFILE CACHE ═══
    async function getProfile(num) {
        if (!num) return {};
        const c = _profileCache.get(num);
        if (c && Date.now() - c.ts < PROFILE_TTL) return c.data;
        try {
            const p = await S.fsGet('/sangzap_profiles/' + num) || {};
            _profileCache.set(num, { data: p, ts: Date.now() });
            return p;
        } catch(_) {
            return c?.data || {};
        }
    }

    // ═══ FETCH ═══
    async function fetchFeed() {
        try {
            const docs = await S.fsGet(
                `/sangzap_stories?orderBy=${encodeURIComponent('createdAt desc')}&pageSize=80`
            );
            const now = Date.now();
            return (docs || []).filter(s => s && s.expiresAt > now);
        } catch(_) { return []; }
    }

    async function groupStories(stories) {
        const byAuthor = new Map();
        for (const s of stories) {
            if (!s.author) continue;
            if (!byAuthor.has(s.author)) byAuthor.set(s.author, []);
            byAuthor.get(s.author).push(s);
        }
        const groups = [];
        for (const [author, list] of byAuthor) {
            list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            const profile = await getProfile(author);
            const allSeen = list.every(s => (s.viewers || []).includes(_myNumber));
            const latest = list[list.length - 1];
            groups.push({ author, profile, stories: list, allSeen, latest });
        }
        groups.sort((a, b) => {
            const mineA = a.author === _myNumber;
            const mineB = b.author === _myNumber;
            if (mineA !== mineB) return mineA ? -1 : 1;
            if (a.allSeen !== b.allSeen) return a.allSeen ? 1 : -1;
            return (b.latest.createdAt || 0) - (a.latest.createdAt || 0);
        });
        return groups;
    }

    async function tick() {
        try {
            const stories = await fetchFeed();
            const groups = await groupStories(stories);
            const h = hashGroups(groups);
            _cache = stories;
            _groups = groups;
            if (h !== _lastHash) {
                _lastHash = h;
                _onUpdate?.(groups);
            }
        } catch(e) { console.warn('[Sangzap/stories] tick:', e); }
    }

    function hashGroups(groups) {
        let h = 5381;
        for (const g of groups) {
            const s = `${g.author}|${g.stories.length}|${g.allSeen?1:0}|${(g.stories.map(x=>x.id).join(','))}`;
            for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        }
        return h;
    }

    // ═══ CRUD ═══
    SG.post = async function(media, caption) {
        const now = Date.now();
        const id = 'sg' + now.toString(36) + Math.random().toString(36).slice(2, 6);
        const doc = {
            author: _myNumber,
            media: media || '',
            caption: S.sanitize ? S.sanitize(caption || '').slice(0, 200) : (caption || '').slice(0, 200),
            createdAt: now,
            expiresAt: now + TTL,
            viewers: [],
            reactions: {}
        };
        await S.fsCreate('/sangzap_stories', doc, id);
        return { id, ...doc };
    };

    SG.delete = async function(storyId) {
        try {
            await S.fsDel('/sangzap_stories/' + storyId);
            return true;
        } catch(e) { console.warn('[Sangzap/stories] delete:', e); return false; }
    };

    SG.markViewed = async function(storyId) {
        try {
            const doc = await S.fsGet('/sangzap_stories/' + storyId);
            const viewers = new Set(doc?.viewers || []);
            if (viewers.has(_myNumber)) return;
            viewers.add(_myNumber);
            await S.fsWrite('/sangzap_stories/' + storyId, { viewers: [...viewers] });
        } catch(_) {}
    };

    SG.react = async function(storyId, emoji) {
        try {
            const doc = await S.fsGet('/sangzap_stories/' + storyId);
            const reactions = { ...(doc?.reactions || {}) };
            if (reactions[_myNumber] === emoji) delete reactions[_myNumber];
            else reactions[_myNumber] = emoji;
            await S.fsWrite('/sangzap_stories/' + storyId, { reactions });
        } catch(_) {}
    };

    async function replyToStory(story, text) {
        if (!story || !text) return false;
        try {
            const chatId = S.chatIdFor(_myNumber, story.author);
            const now = Date.now();
            await S.fsWrite('/sangzap_chats/' + chatId, {
                kind: '1:1',
                members: [_myNumber, story.author].sort(),
                createdAt: now,
                updatedAt: now,
                lastMessage: '',
                lastMessageAt: 0
            }).catch(() => {});
            await S.fsCreate('/sangzap_chats/' + chatId + '/messages', {
                from: _myNumber,
                kind: 'story-reply',
                body: text,
                storyId: story.id,
                sentAt: now
            }, S.msgId());
            await S.fsWrite('/sangzap_chats/' + chatId, {
                lastMessage: '💬 Respondeu ao story',
                lastMessageAt: now,
                updatedAt: now
            });
            return true;
        } catch(e) { console.warn('[Sangzap/stories] reply:', e); return false; }
    }
    SG.reply = replyToStory;

    // ═══ TAB ═══
    SG.renderTab = function(body, myNumber) {
        _myNumber = myNumber;
        body.innerHTML = `
            <div class="sz-stories-tab">
                <div class="sz-stories-head">
                    <div class="sz-stories-title">Atualizações</div>
                    <button class="sz-new-btn" id="szStoryNew" type="button" title="Novo story" aria-label="Novo story">+</button>
                </div>
                <div class="sz-stories-list" id="szStoriesList">
                    <div class="sz-empty">Carregando…</div>
                </div>
            </div>
        `;
        const list = body.querySelector('#szStoriesList');
        body.querySelector('#szStoryNew').addEventListener('click', () => openComposer(body, myNumber));

        function paint(groups) {
            if (!groups.length) {
                list.innerHTML = `<div class="sz-empty">Nenhuma atualização. Toque em <b>+</b> pra publicar.</div>`;
                return;
            }
            const mine = groups.find(g => g.author === _myNumber);
            const others = groups.filter(g => g.author !== _myNumber);
            const parts = [];
            if (mine) parts.push(renderRing(mine, 'sz-ring-mine'));
            for (const g of others) parts.push(renderRing(g));
            list.innerHTML = parts.join('');

            list.querySelectorAll('.sz-ring[data-author]').forEach(el => {
                el.addEventListener('click', () => {
                    const author = el.dataset.author;
                    const groupIdx = _groups.findIndex(g => g.author === author);
                    if (groupIdx >= 0) openViewer(body, groupIdx, 0);
                });
            });
        }

        SG.start(myNumber, paint);
    };

    function renderRing(g, extraClass) {
        const name = g.profile?.displayName || S.shortNum(g.author);
        const avatar = g.profile?.avatar
            ? `<img src="${S.escape(g.profile.avatar)}" alt="" />`
            : `<span class="sz-av-fallback">${S.escape((name || '?')[0].toUpperCase())}</span>`;
        const mine = g.author === _myNumber;
        const cls = [
            'sz-ring',
            extraClass || '',
            mine ? 'mine' : '',
            g.allSeen && !mine ? 'seen' : 'unseen'
        ].filter(Boolean).join(' ');
        const when = S.fmtRelative ? S.fmtRelative(g.latest.createdAt) : '';
        const count = g.stories.length;
        const sub = mine
            ? `${count} ${count === 1 ? 'atualização' : 'atualizações'}`
            : (g.allSeen ? `${count} ${count === 1 ? 'vista' : 'vistas'}` : `${count} nova${count > 1 ? 's' : ''}`);
        const preview = mine ? '' : `<div class="sz-ring-preview">${S.escape(when)}</div>`;
        return `<button class="${cls}" data-author="${S.escape(g.author)}" type="button">
            <span class="sz-ring-av${g.allSeen && !mine ? ' seen' : ''}">${avatar}</span>
            <span class="sz-ring-info">
                <span class="sz-ring-name">${mine ? 'Meu status' : S.escape(name)}</span>
                <span class="sz-ring-sub">${S.escape(sub)}</span>
                ${preview}
            </span>
        </button>`;
    }

    // ═══ VIEWER ═══
    function openViewer(body, groupIdx, storyIdx) {
        closeViewer();
        const root = body.closest('.sz-app') || body;
        const overlay = document.createElement('div');
        overlay.className = 'sz-viewer';
        root.appendChild(overlay);
        _openOverlay = overlay;

        let gIdx = groupIdx;
        let sIdx = storyIdx;
        let autoTimer = null;
        let rafId = null;
        let progressStart = 0;
        let progressPaused = false;
        let progressPausedAt = 0;
        let progressPausedTotal = 0;
        let done = false;

        function currentGroup() { return _groups[gIdx]; }
        function currentStory() { const g = currentGroup(); return g ? g.stories[sIdx] : null; }

        function stopProgress() {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        }

        function next() {
            stopProgress();
            const g = currentGroup();
            if (!g) return close();
            if (sIdx < g.stories.length - 1) { sIdx++; render(); return; }
            if (gIdx < _groups.length - 1) { gIdx++; sIdx = 0; render(); return; }
            close();
        }
        function prev() {
            stopProgress();
            if (sIdx > 0) { sIdx--; render(); return; }
            if (gIdx > 0) { gIdx--; const g = currentGroup(); sIdx = g ? g.stories.length - 1 : 0; render(); return; }
            sIdx = 0;
            render();
        }
        function close() {
            if (done) return;
            done = true;
            stopProgress();
            try { overlay.remove(); } catch(_) {}
            if (_openOverlay === overlay) _openOverlay = null;
            if (_viewerCleanup === close) _viewerCleanup = null;
            tick();
        }

        async function markViewed(story) {
            if (!story) return;
            if (story.author === _myNumber) return;
            if ((story.viewers || []).includes(_myNumber)) return;
            story.viewers = [...(story.viewers || []), _myNumber];
            await SG.markViewed(story.id);
        }

        function progressDuration(story) {
            if (story && story.media && story.kind === 'video') return 15000;
            return VIEWER_DURATION;
        }

        function startProgress() {
            stopProgress();
            const story = currentStory();
            if (!story) return;
            const dur = progressDuration(story);
            progressStart = performance.now();
            progressPaused = false;
            progressPausedAt = 0;
            progressPausedTotal = 0;

            const fill = overlay.querySelector('.sz-viewer-bar.active .sz-viewer-bar-fill');
            if (!fill) return;

            function frame() {
                if (done) return;
                rafId = requestAnimationFrame(frame);
                if (progressPaused) return;
                const elapsed = performance.now() - progressStart - progressPausedTotal;
                const ratio = Math.min(1, elapsed / dur);
                fill.style.transform = `scaleX(${ratio})`;
                if (ratio >= 1) {
                    stopProgress();
                    next();
                }
            }
            rafId = requestAnimationFrame(frame);
        }

        function pauseProgress() {
            if (progressPaused) return;
            progressPaused = true;
            progressPausedAt = performance.now();
        }
        function resumeProgress() {
            if (!progressPaused) return;
            progressPausedTotal += performance.now() - progressPausedAt;
            progressPaused = false;
            progressPausedAt = 0;
        }

        async function render() {
            const g = currentGroup();
            if (!g) return close();
            const story = g.stories[sIdx];
            if (!story) return close();

            const name = g.profile?.displayName || S.shortNum(g.author);
            const avatar = g.profile?.avatar
                ? `<img src="${S.escape(g.profile.avatar)}" alt="" />`
                : `<span class="sz-av-fallback">${S.escape((name || '?')[0].toUpperCase())}</span>`;
            const when = S.fmtRelative ? S.fmtRelative(story.createdAt) : '';
            const mine = story.author === _myNumber;
            const media = story.media
                ? `<img src="${S.escape(story.media)}" alt="" class="sz-viewer-img" />`
                : '';
            const caption = story.caption
                ? `<div class="sz-viewer-caption">${S.escape(story.caption)}</div>`
                : '';
            const viewersCount = (story.viewers || []).length;
            const mineBar = mine
                ? `<button class="sz-viewer-viewers" data-act="open-viewers" type="button">
                       <span>👁 ${viewersCount}</span>
                   </button>
                   <button class="sz-viewer-del" data-act="delete" type="button" title="Apagar">🗑</button>`
                : '';
            const replyBar = !mine ? `
                <div class="sz-viewer-reply">
                    <input class="sz-viewer-reply-input" type="text" placeholder="Responder…" maxlength="400" />
                    <button class="sz-viewer-reply-send" data-act="send-reply" type="button">➤</button>
                </div>` : '';

            const bars = g.stories.map((_, i) => {
                const cls = i < sIdx ? 'done' : i === sIdx ? 'active' : '';
                return `<span class="sz-viewer-bar ${cls}"><span class="sz-viewer-bar-fill" style="transform:scaleX(${i < sIdx ? 1 : 0})"></span></span>`;
            }).join('');

            overlay.innerHTML = `
                <div class="sz-viewer-inner">
                    <div class="sz-viewer-bars">${bars}</div>
                    <header class="sz-viewer-head">
                        <div class="sz-avatar sz-avatar-sm sz-ring-av">${avatar}</div>
                        <div class="sz-viewer-head-info">
                            <div class="sz-viewer-head-name">${S.escape(name)}</div>
                            <div class="sz-viewer-head-time">${S.escape(when)}</div>
                        </div>
                        ${mineBar}
                        <button class="sz-viewer-close" data-act="close" type="button" aria-label="Fechar">✕</button>
                    </header>
                    <div class="sz-viewer-body">
                        ${media}
                        ${caption}
                    </div>
                    <div class="sz-viewer-reactions">
                        ${REACTIONS.map(e => `<button class="sz-viewer-react${story.reactions?.[_myNumber] === e ? ' mine' : ''}" data-emoji="${S.escape(e)}" type="button">${e}</button>`).join('')}
                    </div>
                    ${replyBar}
                    <div class="sz-viewer-tap left" data-dir="prev"></div>
                    <div class="sz-viewer-tap right" data-dir="next"></div>
                </div>
            `;

            markViewed(story);
            startProgress();

            overlay.querySelectorAll('[data-act]').forEach(el => {
                const act = el.dataset.act;
                if (act === 'close') el.addEventListener('click', close);
                else if (act === 'open-viewers') el.addEventListener('click', () => openViewersList(story));
                else if (act === 'delete') el.addEventListener('click', async () => {
                    if (!confirm('Apagar este story?')) return;
                    const ok = await SG.delete(story.id);
                    if (ok) { ctx.toast?.('Story apagado', 'ok'); next(); }
                    else ctx.toast?.('Falha ao apagar', 'err');
                });
                else if (act === 'send-reply') el.addEventListener('click', () => sendReplyFromViewer(story));
            });
            const replyInput = overlay.querySelector('.sz-viewer-reply-input');
            if (replyInput) {
                replyInput.addEventListener('keydown', e => {
                    if (e.key === 'Enter') { e.preventDefault(); sendReplyFromViewer(story); }
                });
                replyInput.addEventListener('focus', pauseProgress);
                replyInput.addEventListener('blur', resumeProgress);
            }

            overlay.querySelectorAll('.sz-viewer-react').forEach(btn => {
                btn.addEventListener('click', async ev => {
                    ev.stopPropagation();
                    const emoji = btn.dataset.emoji;
                    await SG.react(story.id, emoji);
                    const isMine = story.reactions?.[_myNumber] === emoji;
                    if (isMine) delete story.reactions[_myNumber];
                    else { story.reactions = story.reactions || {}; story.reactions[_myNumber] = emoji; }
                    render();
                });
            });

            overlay.querySelectorAll('.sz-viewer-tap').forEach(tap => {
                tap.addEventListener('click', e => {
                    e.stopPropagation();
                    if (tap.dataset.dir === 'prev') prev();
                    else next();
                });
            });

            const body_el = overlay.querySelector('.sz-viewer-body');
            body_el?.addEventListener('click', () => { next(); });

            let sx = 0, sy = 0, swiping = false, moved = false;
            overlay.addEventListener('pointerdown', e => {
                if (e.target.closest('input, button')) return;
                sx = e.clientX; sy = e.clientY; swiping = true; moved = false;
                pauseProgress();
            });
            overlay.addEventListener('pointermove', e => {
                if (!swiping) return;
                const dx = e.clientX - sx;
                const dy = e.clientY - sy;
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
                if (dy > 60 && Math.abs(dy) > Math.abs(dx)) {
                    overlay.style.transform = `translateY(${Math.min(dy, 200)}px)`;
                    overlay.style.opacity = String(Math.max(0.3, 1 - dy / 300));
                }
            });
            overlay.addEventListener('pointerup', e => {
                if (!swiping) return;
                swiping = false;
                overlay.style.transform = '';
                overlay.style.opacity = '';
                const dy = e.clientY - sy;
                const dx = e.clientX - sx;
                if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
                    close();
                } else {
                    resumeProgress();
                }
            });
            overlay.addEventListener('pointercancel', () => {
                swiping = false;
                overlay.style.transform = '';
                overlay.style.opacity = '';
                resumeProgress();
            });

            overlay.addEventListener('mousedown', e => {
                if (e.target.closest('input, button')) return;
                pauseProgress();
            });
            overlay.addEventListener('mouseup', () => resumeProgress());
        }

        async function sendReplyFromViewer(story) {
            const inp = overlay.querySelector('.sz-viewer-reply-input');
            if (!inp) return;
            const txt = inp.value.trim();
            if (!txt) return;
            inp.value = '';
            const ok = await replyToStory(story, txt);
            ctx.toast?.(ok ? 'Resposta enviada' : 'Falha ao responder', ok ? 'ok' : 'err');
        }

        render();
        _viewerCleanup = close;
    }

    function closeViewer() {
        stopGlobalOverlayRaf();
        if (_openOverlay) { try { _openOverlay.remove(); } catch(_) {} _openOverlay = null; }
        _viewerCleanup = null;
    }

    function stopGlobalOverlayRaf() {
        if (_overlayRaf) { cancelAnimationFrame(_overlayRaf); _overlayRaf = null; }
    }

    // ═══ VIEWERS LIST ═══
    async function openViewersList(story) {
        if (!story) return;
        const viewers = story.viewers || [];
        const root = _openOverlay || document.body;
        const m = document.createElement('div');
        m.className = 'sz-viewers-modal';
        m.innerHTML = `
            <div class="sz-viewers-card">
                <div class="sz-viewers-title">
                    <span>Visualizações</span>
                    <span class="sz-viewers-count">${viewers.length}</span>
                </div>
                <div class="sz-viewers-list" id="szViewersList">
                    ${viewers.length ? '<div class="sz-empty">Carregando…</div>' : '<div class="sz-empty">Ninguém viu ainda.</div>'}
                </div>
                <button class="sz-modal-cancel" data-act="close-viewers" type="button">Fechar</button>
            </div>
        `;
        root.appendChild(m);
        m.querySelector('[data-act="close-viewers"]').addEventListener('click', () => m.remove());

        if (!viewers.length) return;
        const list = m.querySelector('#szViewersList');
        const rows = await Promise.all(viewers.map(async num => {
            const prof = await getProfile(num);
            const name = prof?.displayName || S.shortNum(num);
            const av = prof?.avatar
                ? `<img src="${S.escape(prof.avatar)}" alt="" />`
                : `<span class="sz-av-fallback">${S.escape((name || '?')[0].toUpperCase())}</span>`;
            return `<div class="sz-viewers-item">
                <div class="sz-avatar sz-avatar-sm">${av}</div>
                <div class="sz-viewers-name">${S.escape(name)}</div>
            </div>`;
        }));
        list.innerHTML = rows.join('');
    }

    // ═══ COMPOSER ═══
    function openComposer(body, myNumber) {
        const modal = document.createElement('div');
        modal.className = 'sz-modal';
        modal.innerHTML = `
            <div class="sz-modal-card">
                <div class="sz-modal-title">Novo story</div>
                <div class="sz-modal-body">
                    <button class="sz-btn" id="szStoryPick" type="button">Escolher foto</button>
                    <div class="sz-story-img-preview" id="szStoryImgPreview"></div>
                    <textarea class="sz-input sz-textarea" id="szStoryCaption"
                        maxlength="200" placeholder="Legenda (opcional)"></textarea>
                </div>
                <div class="sz-modal-actions">
                    <button class="sz-btn" id="szStoryCancel" type="button">Cancelar</button>
                    <button class="sz-btn sz-btn-primary" id="szStoryPost" type="button">Publicar</button>
                </div>
            </div>
        `;
        body.appendChild(modal);

        let media = '';
        modal.querySelector('#szStoryPick').addEventListener('click', async () => {
            const dataUrl = await S.settings?.pickAndCropSquare?.();
            if (!dataUrl) return;
            media = dataUrl;
            modal.querySelector('#szStoryImgPreview').innerHTML = `<img src="${S.escape(dataUrl)}" alt="" />`;
        });
        modal.querySelector('#szStoryCancel').addEventListener('click', () => modal.remove());
        modal.querySelector('#szStoryPost').addEventListener('click', async () => {
            if (!media) { ctx.toast?.('Escolha uma foto', 'err'); return; }
            const caption = modal.querySelector('#szStoryCaption').value.trim();
            try {
                await SG.post(media, caption);
                modal.remove();
                ctx.toast?.('Story publicado', 'ok');
                _lastHash = 0;
                tick();
            } catch(e) {
                console.warn('[Sangzap/stories] post:', e);
                ctx.toast?.('Falha ao publicar', 'err');
            }
        });
    }

    // ═══ LIFECYCLE ═══
    SG.start = function(myNumber, onUpdate) {
        _myNumber = myNumber;
        _onUpdate = onUpdate;
        SG.stop();
        tick();
        _timer = setInterval(tick, POLL_MS);
    };
    SG.stop = function() {
        if (_timer) { clearInterval(_timer); _timer = null; }
        closeViewer();
    };
    SG.get = () => _cache;
    SG.groups = () => _groups;

    S.stories = SG;
})();
