// modules/phone/apps/sangzap/stories.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    const S = window._sangzapCtx;
    if (!ctx || !S) return;
    if (S.stories) return;

    const SG = {};
    const TTL = 24 * 60 * 60 * 1000;
    const POLL_MS = 6000;
    const REACTIONS = ['❤️', '😂', '😮', '😢', '👏'];

    let _myNumber = null;
    let _timer = null;
    let _onUpdate = null;
    let _cache = [];

    // ═══ CRUD ═══
    async function fetchFeed() {
        try {
            const docs = await ctx.bridge.firestore.request('GET',
                `/sangzap_stories?orderBy=${encodeURIComponent('createdAt desc')}&pageSize=40`);
            return docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s && s.expiresAt > Date.now());
        } catch(_) { return []; }
    }

    SG.post = async function(media, caption) {
        const now = Date.now();
        const id = 'sg' + now.toString(36) + Math.random().toString(36).slice(2, 6);
        const doc = {
            author: _myNumber,
            media: media || '',
            caption: S.sanitize(caption || '').slice(0, 200),
            createdAt: now,
            expiresAt: now + TTL,
            viewers: [],
            reactions: {}
        };
        await ctx.bridge.firestore.request('POST', `/sangzap_stories?documentId=${id}`, doc);
        return { id, ...doc };
    };

    SG.markViewed = async function(storyId) {
        try {
            const doc = await ctx.bridge.firestore.parseDoc('sangzap_stories', storyId);
            const viewers = new Set(doc?.viewers || []);
            if (viewers.has(_myNumber)) return;
            viewers.add(_myNumber);
            await ctx.bridge.firestore.request('PATCH', `/sangzap_stories/${storyId}`, { viewers: [...viewers] });
        } catch(_) {}
    };

    SG.react = async function(storyId, emoji) {
        try {
            const doc = await ctx.bridge.firestore.parseDoc('sangzap_stories', storyId);
            const reactions = { ...(doc?.reactions || {}) };
            reactions[_myNumber] = emoji;
            await ctx.bridge.firestore.request('PATCH', `/sangzap_stories/${storyId}`, { reactions });
        } catch(_) {}
    };

    async function fetchAll() {
        const stories = await fetchFeed();
        const authors = new Set(stories.map(s => s.author));
        const profiles = {};
        await Promise.all([...authors].map(async n => {
            try { profiles[n] = await ctx.bridge.firestore.parseDoc('sangzap_profiles', n) || {}; }
            catch(_) { profiles[n] = {}; }
        }));
        return stories.map(s => ({
            ...s,
            _author: profiles[s.author] || {},
            _mine: s.author === _myNumber,
            _seen: (s.viewers || []).includes(_myNumber)
        }));
    }

    async function tick() {
        _cache = await fetchAll();
        _onUpdate?.(_cache);
    }

    // ═══ TAB ═══
    SG.renderTab = function(body, myNumber) {
        _myNumber = myNumber;
        body.innerHTML = `
            <div class="sz-stories-tab">
                <div class="sz-status-actions">
                    <button class="sz-btn sz-btn-primary" id="szStoryNew">+ Novo story</button>
                </div>
                <div class="sz-stories-feed" id="szStoriesFeed">
                    <div class="sz-empty">Carregando…</div>
                </div>
            </div>
        `;

        const feed = body.querySelector('#szStoriesFeed');

        function paint(stories) {
            if (!stories.length) {
                feed.innerHTML = `<div class="sz-empty">Nenhum story ativo. Seja o primeiro.</div>`;
                return;
            }
            feed.innerHTML = stories.map(s => {
                const name = s._author?.displayName || S.shortNum(s.author);
                const avatar = s._author?.avatar
                    ? `<img src="${S.escape(s._author.avatar)}" alt="" />`
                    : `<span class="sz-av-fallback">${S.escape((name || '?')[0].toUpperCase())}</span>`;
                const seenMark = s._seen && !s._mine ? ' seen' : '';
                const mediaHtml = s.media ? `<div class="sz-story-media"><img src="${S.escape(s.media)}" alt="" /></div>` : '';
                const viewers = (s.viewers || []).length;
                const reactions = Object.values(s.reactions || {});
                const reactSummary = reactions.length
                    ? `<div class="sz-story-reactions">${reactions.slice(0, 4).map(r => `<span>${S.escape(r)}</span>`).join('')}</div>`
                    : '';
                return `
                    <article class="sz-story${seenMark}" data-id="${S.escape(s.id)}">
                        <header class="sz-story-head">
                            <div class="sz-avatar sz-avatar-sm">${avatar}</div>
                            <div class="sz-story-head-info">
                                <div class="sz-story-author">${S.escape(name)}</div>
                                <div class="sz-story-time">${S.fmtRelative(s.createdAt)}</div>
                            </div>
                            ${s._mine ? `<div class="sz-story-viewers">👁 ${viewers}</div>` : ''}
                        </header>
                        ${mediaHtml}
                        ${s.caption ? `<div class="sz-story-caption">${S.escape(s.caption)}</div>` : ''}
                        ${reactSummary}
                        <footer class="sz-story-actions">
                            ${REACTIONS.map(e => `<button class="sz-react" data-emoji="${e}">${e}</button>`).join('')}
                            <button class="sz-react sz-react-reply" data-reply="1" title="Responder">↩</button>
                        </footer>
                    </article>
                `;
            }).join('');

            feed.querySelectorAll('.sz-story').forEach(el => {
                const id = el.dataset.id;
                el.addEventListener('click', (ev) => {
                    if (ev.target.closest('.sz-react')) return;
                    SG.markViewed(id);
                });
                el.querySelectorAll('.sz-react').forEach(btn => {
                    btn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (btn.dataset.reply) {
                            const story = _cache.find(x => x.id === id);
                            if (!story) return;
                            const text = prompt('Responder ao story:');
                            if (!text) return;
                            replyToStory(story, text.trim());
                            return;
                        }
                        SG.react(id, btn.dataset.emoji);
                        ctx.toast?.(`Reagiu ${btn.dataset.emoji}`, 'ok');
                    });
                });
            });
        }

        SG.start(myNumber, paint);
        body.querySelector('#szStoryNew').addEventListener('click', () => openComposer(body, myNumber));
    };

    async function replyToStory(story, text) {
        try {
            const chatId = S.chatIdFor(_myNumber, story.author);
            const now = Date.now();
            await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, {
                kind: '1:1',
                members: [_myNumber, story.author].sort(),
                createdAt: now,
                updatedAt: now,
                lastMessage: '',
                lastMessageAt: 0
            }).catch(() => {});
            await ctx.bridge.firestore.request('POST',
                `/sangzap_chats/${chatId}/messages?documentId=${S.msgId()}`,
                { from: _myNumber, kind: 'story-reply', body: text, storyId: story.id, sentAt: now });
            await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, {
                lastMessage: '💬 Respondeu ao story',
                lastMessageAt: now,
                updatedAt: now
            });
            ctx.toast?.('Resposta enviada', 'ok');
        } catch(e) {
            console.warn('[Sangzap/stories] reply:', e);
            ctx.toast?.('Falha ao responder', 'err');
        }
    }

    function openComposer(body, myNumber) {
        const modal = document.createElement('div');
        modal.className = 'sz-modal';
        modal.innerHTML = `
            <div class="sz-modal-card">
                <div class="sz-modal-title">Novo story</div>
                <div class="sz-modal-body">
                    <button class="sz-btn" id="szStoryPick">Escolher foto</button>
                    <div class="sz-story-img-preview" id="szStoryImgPreview"></div>
                    <textarea class="sz-input sz-textarea" id="szStoryCaption"
                        maxlength="200" placeholder="Legenda (opcional)"></textarea>
                </div>
                <div class="sz-modal-actions">
                    <button class="sz-btn" id="szStoryCancel">Cancelar</button>
                    <button class="sz-btn sz-btn-primary" id="szStoryPost">Publicar</button>
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
    SG.stop = function() { if (_timer) { clearInterval(_timer); _timer = null; } };
    SG.get = () => _cache;

    S.stories = SG;
})();
