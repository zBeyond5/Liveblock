// modules/phone/apps/sangzap/shell.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Sangzap] phone ctx ausente'); return; }
    if (ctx.apps.get('sangzap')) return;

    const APP_ID = 'sangzap';
    const APP_VERSION = '0.1.0';
    const BASE = (ctx.moduleBase || '') + '/apps/sangzap';

    const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

    let _mounted = false;
    let _activeTab = 'chats';
    let _activeChatId = null;
    let _root = null;
    let _screenEl = null;
    let _myNumber = null;
    let _moduleLoaded = false;

    // ═══ MODULE LOADER ═══
    async function loadModules() {
        if (_moduleLoaded) return;
        const files = ['common.js', 'roster.js', 'chat.js'];
        for (const f of files) {
            await new Promise((resolve) => {
                const s = document.createElement('script');
                s.src = `${BASE}/${f}?v=${APP_VERSION}`;
                s.onload = resolve;
                s.onerror = () => { console.warn('[Sangzap] falha ao carregar', f); resolve(); };
                document.head.appendChild(s);
            });
        }
        _moduleLoaded = true;
    }

    // ═══ RENDER ═══
    function render() {
        if (!_root) return;
        _root.innerHTML = `
            <div class="sz-app">
                <header class="sz-hdr">
                    <button class="sz-hdr-back" id="szBack" aria-label="Voltar">${ctx.I.back}</button>
                    <div class="sz-hdr-title">SANGZAP</div>
                    <div class="sz-hdr-ver">v${APP_VERSION}</div>
                </header>

                <div class="sz-tabs" id="szTabs">
                    <button class="sz-tab${_activeTab === 'chats' ? ' active' : ''}" data-tab="chats">
                        Conversas
                    </button>
                    <button class="sz-tab${_activeTab === 'status' ? ' active' : ''}" data-tab="status">
                        Status
                    </button>
                    <button class="sz-tab${_activeTab === 'stories' ? ' active' : ''}" data-tab="stories">
                        Stories
                    </button>
                    <button class="sz-tab${_activeTab === 'profile' ? ' active' : ''}" data-tab="profile">
                        Perfil
                    </button>
                </div>

                <div class="sz-body" id="szBody"></div>
            </div>
        `;

        _root.querySelector('#szBack').addEventListener('click', () => {
            if (_activeChatId) { closeChat(); return; }
            try { ctx.closeApp(); } catch(_) {}
        });
        _root.querySelectorAll('.sz-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeTab = btn.dataset.tab;
                _activeChatId = null;
                render();
            });
        });

        const body = _root.querySelector('#szBody');
        if (_activeChatId) renderChat(body);
        else if (_activeTab === 'chats') renderRoster(body);
        else renderStub(body, _activeTab);
    }

    // ═══ ROSTER ═══
    function renderRoster(body) {
        body.innerHTML = `
            <div class="sz-roster">
                <div class="sz-roster-head">
                    <div class="sz-roster-title">Conversas</div>
                    <button class="sz-new-btn" id="szNew" title="Nova conversa">+</button>
                </div>
                <div class="sz-roster-list" id="szRosterList">
                    <div class="sz-empty">Carregando…</div>
                </div>
            </div>
        `;

        body.querySelector('#szNew').addEventListener('click', openNewChatPicker);

        const list = body.querySelector('#szRosterList');

        function paint(chats) {
            if (!chats.length) {
                list.innerHTML = `<div class="sz-empty">Nenhuma conversa ainda. Toque em <b>+</b> para começar.</div>`;
                return;
            }
            list.innerHTML = chats.map(c => {
                const unread = c.unread || 0;
                const avatar = c.avatar
                    ? `<img src="${S.escape(c.avatar)}" alt="" />`
                    : `<span class="sz-av-fallback">${S.escape((c.title || '?')[0].toUpperCase())}</span>`;
                return `
                    <button class="sz-item" data-chat="${S.escape(c.id)}">
                        <div class="sz-avatar">${avatar}</div>
                        <div class="sz-item-body">
                            <div class="sz-item-top">
                                <span class="sz-item-title">${S.escape(c.title)}</span>
                                <span class="sz-item-time">${S.fmtRelative(c.lastMessageAt)}</span>
                            </div>
                            <div class="sz-item-bot">
                                <span class="sz-item-preview">${S.escape(c.lastMessage || '')}</span>
                                ${unread ? `<span class="sz-item-badge">${unread}</span>` : ''}
                            </div>
                        </div>
                    </button>
                `;
            }).join('');
            list.querySelectorAll('.sz-item').forEach(btn => {
                btn.addEventListener('click', () => openChat(btn.dataset.chat, chats.find(c => c.id === btn.dataset.chat)));
            });
        }

        S.roster.start(_myNumber, paint);
    }

    function openNewChatPicker() {
        const contacts = (ctx.contacts?.contacts || []);
        const root = _root.querySelector('#szBody');
        const modal = document.createElement('div');
        modal.className = 'sz-modal';
        modal.innerHTML = `
            <div class="sz-modal-card">
                <div class="sz-modal-title">Nova conversa</div>
                <div class="sz-modal-list">
                    ${contacts.length ? contacts.map(c => `
                        <button class="sz-item sz-pick" data-num="${S.escape(c.number || c.num || '')}">
                            <div class="sz-avatar"><span class="sz-av-fallback">${S.escape((c.name || '?')[0].toUpperCase())}</span></div>
                            <div class="sz-item-body">
                                <div class="sz-item-title">${S.escape(c.name || S.shortNum(c.number))}</div>
                                <div class="sz-item-preview">${S.escape(S.shortNum(c.number))}</div>
                            </div>
                        </button>
                    `).join('') : `<div class="sz-empty">Sem contatos no telefone.</div>`}
                </div>
                <button class="sz-modal-cancel" id="szPickCancel">Cancelar</button>
            </div>
        `;
        root.appendChild(modal);

        modal.querySelector('#szPickCancel').addEventListener('click', () => modal.remove());
        modal.querySelectorAll('.sz-pick').forEach(btn => {
            btn.addEventListener('click', async () => {
                const num = btn.dataset.num;
                if (!num || num === _myNumber) return;
                const chatId = S.chatIdFor(_myNumber, num);
                modal.remove();
                // cria doc se não existir (idempotente — PATCH com merge)
                try {
                    await ctx.bridge.firestore.request('PATCH', `/sangzap_chats/${chatId}`, {
                        kind: '1:1',
                        members: [_myNumber, num].sort(),
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        lastMessage: '',
                        lastMessageAt: 0
                    });
                } catch(_) {}
                openChat(chatId, { id: chatId, kind: '1:1', members: [_myNumber, num], title: S.shortNum(num) });
            });
        });
    }

    // ═══ CHAT ═══
    function openChat(chatId, meta) {
        _activeChatId = chatId;
        _root.dataset.chatMeta = JSON.stringify(meta || {});
        render();
    }
    function closeChat() {
        S.chat.close();
        _activeChatId = null;
        render();
    }

    function renderChat(body) {
        const meta = JSON.parse(_root.dataset.chatMeta || '{}');
        body.innerHTML = `
            <div class="sz-chat">
                <div class="sz-chat-head">
                    <button class="sz-chat-back" id="szChatBack">‹</button>
                    <div class="sz-chat-title">${S.escape(meta.title || 'Chat')}</div>
                </div>
                <div class="sz-chat-thread" id="szThread"></div>
                <div class="sz-chat-typing" id="szTyping"></div>
                <div class="sz-chat-input">
                    <input class="sz-chat-field" id="szField" type="text" placeholder="Mensagem" maxlength="4000" />
                    <button class="sz-chat-send" id="szSend" aria-label="Enviar">↑</button>
                </div>
            </div>
        `;

        body.querySelector('#szChatBack').addEventListener('click', closeChat);
        const thread = body.querySelector('#szThread');
        const typingEl = body.querySelector('#szTyping');
        const field = body.querySelector('#szField');

        function paint(msgs, typing) {
            const stick = isNearBottom(thread);
            thread.innerHTML = msgs.map(m => {
                const mine = m.from === _myNumber;
                return `
                    <div class="sz-msg${mine ? ' mine' : ''}">
                        <div class="sz-msg-bubble">
                            <div class="sz-msg-text">${S.escape(m.body || '')}</div>
                            <div class="sz-msg-meta">
                                <span>${S.fmtTime(m.sentAt)}</span>
                                ${mine ? `<span class="sz-tick">${m.readAt ? '✓✓' : m.deliveredAt ? '✓✓' : '✓'}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            if (stick) thread.scrollTop = thread.scrollHeight;

            if (typing && typing.length) {
                typingEl.textContent = typing.length === 1
                    ? 'digitando…'
                    : typing.length + ' digitando…';
            } else typingEl.textContent = '';
        }

        S.chat.open(_activeChatId, _myNumber, paint);

        function send() {
            const text = field.value.trim();
            if (!text) return;
            field.value = '';
            S.chat.send(text).catch(e => console.warn('[Sangzap] send:', e));
        }
        body.querySelector('#szSend').addEventListener('click', send);
        field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); send(); }
        });
        field.addEventListener('input', () => S.chat.typing());
    }

    function isNearBottom(el) {
        return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    }

    // ═══ STUB ═══
    function renderStub(body, tab) {
        const labels = {
            status: 'Status 24h',
            stories: 'Stories',
            profile: 'Perfil'
        };
        body.innerHTML = `
            <div class="sz-stub">
                <div class="sz-stub-title">${labels[tab] || tab}</div>
                <div class="sz-stub-sub">Em construção — Fase ${tab === 'profile' ? 3 : tab === 'status' ? 4 : 5}.</div>
            </div>
        `;
    }

    // ═══ APP REGISTRATION ═══
    ctx.apps.register({
        id: APP_ID,
        name: 'Sangzap',
        icon: ICON,
        accent: '#25d366',
        bg: 'linear-gradient(135deg, #25d366, #128c7e)',
        order: 5,
        dock: true,

        async mount(root, appCtx) {
            _root = root;
            _myNumber = appCtx.myNumber;
            _screenEl = appCtx.screenEl;
            _activeTab = 'chats';
            _activeChatId = null;
            _mounted = true;

            await loadModules();
            render();
        },

        unmount() {
            _mounted = false;
            try { S.roster.stop(); } catch(_) {}
            try { S.chat.close(); } catch(_) {}
            _root = null;
        }
    });

    // ═══ CSS ═══
    ctx.appendStyle(`
        .sz-app {
            display: flex; flex-direction: column;
            height: 100%; min-height: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #e9ecf5;
            background: linear-gradient(175deg, #0e1621 0%, #0b1218 100%);
        }

        .sz-hdr {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 14px;
            background: linear-gradient(180deg, rgba(14,22,33,.97), rgba(14,22,33,.85));
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            flex-shrink: 0;
            border-bottom: 1px solid rgba(255,255,255,.05);
        }
        .sz-hdr-back {
            width: 32px; height: 32px; flex-shrink: 0;
            border-radius: 10px;
            background: rgba(255,255,255,.07);
            border: 1px solid rgba(255,255,255,.13);
            color: #c7cad6; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all .16s cubic-bezier(.22,1,.36,1);
            padding: 0;
        }
        .sz-hdr-back svg { width: 14px; height: 14px; }
        .sz-hdr-back:hover {
            background: rgba(37,211,102,.16);
            color: #86efac;
            border-color: rgba(37,211,102,.45);
        }
        .sz-hdr-title {
            flex: 1;
            font-size: 13px; font-weight: 800; letter-spacing: .1em;
            background: linear-gradient(100deg, #25d366, #22d3ee, #25d366);
            background-size: 220% auto;
            -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: phScreenBlink 3.2s ease-in-out infinite;
            text-transform: uppercase;
        }
        .sz-hdr-ver {
            font-size: 9px; color: #8a90a8; letter-spacing: .06em;
            padding: 3px 7px; border-radius: 6px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.08);
            font-variant-numeric: tabular-nums;
        }

        .sz-tabs {
            display: grid; grid-template-columns: repeat(4, 1fr);
            border-bottom: 1px solid rgba(255,255,255,.05);
            background: rgba(0,0,0,.2);
            flex-shrink: 0;
        }
        .sz-tab {
            padding: 10px 4px;
            font-size: 11px; font-weight: 700;
            color: #8a90a8;
            background: transparent; border: none; cursor: pointer;
            font-family: inherit;
            position: relative;
            transition: color .16s, background .16s;
        }
        .sz-tab:hover { color: #d1d5db; background: rgba(255,255,255,.03); }
        .sz-tab.active { color: #86efac; }
        .sz-tab.active::after {
            content: ''; position: absolute; bottom: 0; left: 20%; right: 20%;
            height: 2px; background: linear-gradient(90deg, #25d366, #22d3ee);
            border-radius: 2px;
        }

        .sz-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }

        /* ═══ ROSTER ═══ */
        .sz-roster { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .sz-roster-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 14px 8px;
            flex-shrink: 0;
        }
        .sz-roster-title { font-size: 15px; font-weight: 800; color: #e9ecf5; }
        .sz-new-btn {
            width: 30px; height: 30px; border-radius: 50%;
            background: linear-gradient(135deg, #25d366, #128c7e);
            border: none; color: #fff; font-size: 18px; font-weight: 700;
            cursor: pointer; line-height: 1;
            box-shadow: 0 6px 16px rgba(37,211,102,.35);
            transition: transform .16s cubic-bezier(.22,1,.36,1);
        }
        .sz-new-btn:hover { transform: scale(1.06); }
        .sz-new-btn:active { transform: scale(.94); }
        .sz-roster-list { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
        .sz-roster-list::-webkit-scrollbar { width: 4px; }
        .sz-roster-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }

        .sz-item {
            display: flex; align-items: center; gap: 11px;
            width: 100%; padding: 10px 10px;
            background: transparent; border: none; cursor: pointer;
            font-family: inherit; color: inherit; text-align: left;
            border-radius: 12px;
            transition: background .14s;
        }
        .sz-item:hover { background: rgba(255,255,255,.04); }
        .sz-item:active { background: rgba(255,255,255,.07); }

        .sz-avatar {
            width: 44px; height: 44px; flex-shrink: 0;
            border-radius: 50%; overflow: hidden;
            background: linear-gradient(135deg, #25d366, #128c7e);
            display: flex; align-items: center; justify-content: center;
            border: 1px solid rgba(255,255,255,.08);
        }
        .sz-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .sz-av-fallback { font-size: 17px; font-weight: 800; color: #fff; }

        .sz-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .sz-item-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .sz-item-title { font-size: 12.5px; font-weight: 700; color: #e9ecf5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sz-item-time { font-size: 9.5px; color: #6b7280; flex-shrink: 0; font-variant-numeric: tabular-nums; }
        .sz-item-bot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .sz-item-preview {
            font-size: 11px; color: #8a90a8;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
        }
        .sz-item-badge {
            min-width: 18px; height: 18px; padding: 0 6px;
            border-radius: 9px; background: #25d366; color: #06280f;
            font-size: 10px; font-weight: 800; line-height: 18px; text-align: center;
            flex-shrink: 0;
        }

        .sz-empty {
            padding: 32px 16px; text-align: center;
            font-size: 11px; color: #6b7280; line-height: 1.6;
        }
        .sz-empty b { color: #86efac; }

        /* ═══ NEW CHAT MODAL ═══ */
        .sz-modal {
            position: absolute; inset: 0; z-index: 20;
            background: rgba(0,0,0,.65);
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
            display: flex; align-items: flex-end; justify-content: center;
            animation: phFadeIn .2s ease;
        }
        .sz-modal-card {
            width: 100%; max-height: 80%;
            background: linear-gradient(180deg, #131a24, #0b1218);
            border-top-left-radius: 18px; border-top-right-radius: 18px;
            border-top: 1px solid rgba(255,255,255,.08);
            display: flex; flex-direction: column;
            padding: 14px 0 0;
            animation: phSlideUp .28s cubic-bezier(.22,1,.36,1);
        }
        .sz-modal-title {
            font-size: 13px; font-weight: 800; color: #e9ecf5;
            padding: 0 16px 10px;
            border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .sz-modal-list { flex: 1; overflow-y: auto; padding: 8px 8px; }
        .sz-modal-cancel {
            margin: 8px 14px 14px;
            padding: 11px; border-radius: 10px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            color: #c7cad6; font-family: inherit;
            font-size: 11.5px; font-weight: 700; cursor: pointer;
            transition: background .16s;
        }
        .sz-modal-cancel:hover { background: rgba(255,255,255,.09); }

        /* ═══ CHAT ═══ */
        .sz-chat { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .sz-chat-head {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 12px;
            background: rgba(37,211,102,.06);
            border-bottom: 1px solid rgba(255,255,255,.05);
            flex-shrink: 0;
        }
        .sz-chat-back {
            width: 26px; height: 26px; border-radius: 8px;
            background: transparent; border: none;
            color: #86efac; font-size: 22px; line-height: 1;
            cursor: pointer; padding: 0;
            display: flex; align-items: center; justify-content: center;
        }
        .sz-chat-back:hover { background: rgba(37,211,102,.14); }
        .sz-chat-title { font-size: 12.5px; font-weight: 700; color: #e9ecf5; }

        .sz-chat-thread {
            flex: 1; min-height: 0; overflow-y: auto;
            padding: 12px 12px 4px;
            display: flex; flex-direction: column; gap: 6px;
            background:
                radial-gradient(circle at 20% 10%, rgba(37,211,102,.04), transparent 45%),
                radial-gradient(circle at 80% 90%, rgba(34,211,238,.04), transparent 45%);
        }
        .sz-chat-thread::-webkit-scrollbar { width: 4px; }
        .sz-chat-thread::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }

        .sz-msg { display: flex; justify-content: flex-start; }
        .sz-msg.mine { justify-content: flex-end; }
        .sz-msg-bubble {
            max-width: 78%;
            padding: 7px 10px 5px;
            border-radius: 12px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.05);
            animation: phFadeIn .18s ease;
        }
        .sz-msg.mine .sz-msg-bubble {
            background: linear-gradient(135deg, rgba(37,211,102,.22), rgba(18,140,126,.22));
            border-color: rgba(37,211,102,.28);
        }
        .sz-msg-text {
            font-size: 12px; color: #e9ecf5;
            line-height: 1.45;
            word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap;
        }
        .sz-msg-meta {
            display: flex; align-items: center; justify-content: flex-end; gap: 4px;
            font-size: 9px; color: #8a90a8;
            margin-top: 2px;
            font-variant-numeric: tabular-nums;
        }
        .sz-msg.mine .sz-msg-meta { color: rgba(134,239,172,.7); }
        .sz-tick { color: #86efac; font-weight: 700; }

        .sz-chat-typing {
            font-size: 9.5px; color: #86efac;
            padding: 0 14px 2px;
            min-height: 14px;
            font-style: italic;
            flex-shrink: 0;
        }

        .sz-chat-input {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px;
            background: rgba(0,0,0,.3);
            border-top: 1px solid rgba(255,255,255,.06);
            flex-shrink: 0;
        }
        .sz-chat-field {
            flex: 1; min-width: 0;
            padding: 10px 14px;
            border-radius: 22px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            color: #e9ecf5; font-family: inherit; font-size: 12px; outline: none;
            transition: border-color .16s, background .16s;
        }
        .sz-chat-field::placeholder { color: #5c6280; }
        .sz-chat-field:focus { border-color: rgba(37,211,102,.5); background: rgba(255,255,255,.08); }
        .sz-chat-send {
            width: 38px; height: 38px; flex-shrink: 0;
            border-radius: 50%;
            background: linear-gradient(135deg, #25d366, #128c7e);
            border: none; color: #fff; font-size: 18px; font-weight: 700;
            cursor: pointer; line-height: 1;
            box-shadow: 0 4px 12px rgba(37,211,102,.35);
            transition: transform .16s cubic-bezier(.22,1,.36,1);
        }
        .sz-chat-send:hover { transform: scale(1.06); }
        .sz-chat-send:active { transform: scale(.92); }

        /* ═══ STUB ═══ */
        .sz-stub {
            flex: 1;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 8px; padding: 32px;
            text-align: center;
        }
        .sz-stub-title { font-size: 16px; font-weight: 800; color: #e9ecf5; }
        .sz-stub-sub { font-size: 11px; color: #6b7280; }

        @media (prefers-reduced-motion: reduce) {
            .sz-hdr-title { animation: none !important; }
            .sz-item, .sz-tab, .sz-hdr-back, .sz-new-btn, .sz-chat-send, .sz-modal-cancel { transition-duration: .01ms; }
        }
    `);
})();
