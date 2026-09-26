// modules/phone/apps/sangzap/shell.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Sangzap] phone ctx ausente'); return; }
    if (ctx.apps.get('sangzap')) return;

    const APP_ID = 'sangzap';
    const APP_VERSION = '0.2.0';
    const BASE = (ctx.moduleBase || '') + '/apps/sangzap';

    const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

    let _activeTab = 'chats';
    let _activeChatId = null;
    let _root = null;
    let _myNumber = null;
    let _moduleLoaded = false;
    let _searchQuery = '';
    let _showArchived = false;

    // ═══ MODULE LOADER ═══
    async function loadModules() {
        if (_moduleLoaded) return;
        const files = ['common.js', 'roster.js', 'chat.js', 'audio.js', 'groups.js', 'settings.js', 'stories.js'];
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
                    <button class="sz-hdr-gear" id="szGear" aria-label="Configurações" title="Configurações">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </button>
                </header>

                <div class="sz-tabs" id="szTabs">
                    <button class="sz-tab${_activeTab === 'chats' ? ' active' : ''}" data-tab="chats">
                        Conversas
                    </button>
                    <button class="sz-tab${_activeTab === 'stories' ? ' active' : ''}" data-tab="stories">
                        Stories
                    </button>
                </div>

                <div class="sz-body" id="szBody"></div>
            </div>
        `;

        _root.querySelector('#szBack').addEventListener('click', () => {
            if (_activeChatId) { closeChat(); return; }
            if (_activeTab === 'settings') { _activeTab = 'chats'; render(); return; }
            try { ctx.closeApp(); } catch(_) {}
        });

        _root.querySelector('#szGear').addEventListener('click', () => {
            _activeTab = 'settings';
            _activeChatId = null;
            render();
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
        else if (_activeTab === 'stories') S.stories.renderTab(body, _myNumber);
        else if (_activeTab === 'settings') S.settings.render(body, _myNumber);
    }

    // ═══ ROSTER ═══
    function renderRoster(body) {
        body.innerHTML = `
            <div class="sz-roster">
                <div class="sz-roster-head">
                    <div class="sz-search-wrap">
                        <input class="sz-search" id="szSearch" type="text" placeholder="Buscar…" value="${S.escape(_searchQuery)}" />
                    </div>
                    <button class="sz-new-btn" id="szNew" title="Nova conversa">+</button>
                </div>
                <div class="sz-roster-list" id="szRosterList">
                    <div class="sz-empty">Carregando…</div>
                </div>
            </div>
        `;

        body.querySelector('#szNew').addEventListener('click', openNewChatPicker);

        const list = body.querySelector('#szRosterList');
        const searchEl = body.querySelector('#szSearch');
        searchEl.addEventListener('input', () => {
            _searchQuery = searchEl.value;
            paint(S.roster.filter(_searchQuery));
        });

        function paint(entries) {
            if (!entries.length) {
                list.innerHTML = `<div class="sz-empty">${_searchQuery ? 'Nada encontrado.' : 'Sem contatos. Adicione contatos no telefone.'}</div>`;
                return;
            }
            list.innerHTML = entries.map(c => {
                const unread = c.unread || 0;
                const isGroup = c.kind === 'group';
                const online = !isGroup && c.online;
                const avatar = c.avatar
                    ? `<img src="${S.escape(c.avatar)}" alt="" />`
                    : `<span class="sz-av-fallback">${S.escape((c.title || '?')[0].toUpperCase())}</span>`;
                const dot = online ? `<span class="sz-online-dot" title="Online"></span>` : '';
                const pin = c.pinned ? `<span class="sz-pin" title="Fixado">📌</span>` : '';
                const mute = c.muted ? `<span class="sz-mute" title="Silenciado">🔇</span>` : '';
                const recadoLine = c.recado && !c.lastMessage
                    ? `<span class="sz-item-preview sz-item-recado">${S.escape(c.recado)}</span>`
                    : `<span class="sz-item-preview">${S.escape(c.lastMessage || (isGroup ? '' : c.recado || 'Toque para conversar'))}</span>`;
                return `
                    <button class="sz-item" data-chat="${S.escape(c.chatId)}" data-kind="${c.kind}" data-num="${S.escape(c.number || '')}">
                        <div class="sz-avatar">${avatar}${dot}</div>
                        <div class="sz-item-body">
                            <div class="sz-item-top">
                                <span class="sz-item-title">${pin}${S.escape(c.title)}${mute}</span>
                                <span class="sz-item-time">${c.lastMessageAt ? S.fmtRelative(c.lastMessageAt) : (online ? 'online' : S.timeAgo(c.lastSeen))}</span>
                            </div>
                            <div class="sz-item-bot">
                                ${recadoLine}
                                ${unread ? `<span class="sz-item-badge">${unread}</span>` : ''}
                            </div>
                        </div>
                    </button>
                `;
            }).join('');
            list.querySelectorAll('.sz-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const c = entries.find(x => x.chatId === btn.dataset.chat);
                    if (c) openChat(c.chatId, c);
                });
                btn.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    const c = entries.find(x => x.chatId === btn.dataset.chat);
                    if (c) openContextMenu(c);
                });
            });
        }

        S.roster.start(_myNumber, (all) => paint(S.roster.filter(_searchQuery)));
    }

    function openContextMenu(entry) {
        const body = _root.querySelector('#szBody');
        const menu = document.createElement('div');
        menu.className = 'sz-ctx-menu';
        menu.innerHTML = `
            <button class="sz-ctx-item" data-act="pin">${entry.pinned ? 'Desafixar' : 'Fixar'}</button>
            <button class="sz-ctx-item" data-act="mute">${entry.muted ? 'Ativar som' : 'Silenciar'}</button>
            <button class="sz-ctx-item" data-act="archive">${entry.archived ? 'Restaurar' : 'Arquivar'}</button>
        `;
        body.appendChild(menu);
        const close = () => menu.remove();
        setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
        menu.querySelectorAll('.sz-ctx-item').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const act = btn.dataset.act;
                if (act === 'pin') await S.roster.pin(entry.chatId, !entry.pinned);
                if (act === 'mute') await S.roster.mute(entry.chatId, !entry.muted);
                if (act === 'archive') await S.roster.archive(entry.chatId, !entry.archived);
                close();
            });
        });
    }

    // ═══ NEW CHAT ═══
    function openNewChatPicker() {
        const contacts = (ctx.contacts?.contacts || []);
        const body = _root.querySelector('#szBody');
        const modal = document.createElement('div');
        modal.className = 'sz-modal';
        modal.innerHTML = `
            <div class="sz-modal-card">
                <div class="sz-modal-title">Nova conversa</div>
                <div class="sz-modal-list">
                    ${contacts.length ? contacts.map(c => {
                        const n = c.number || c.num;
                        if (!n || n === _myNumber) return '';
                        return `<button class="sz-item sz-pick" data-num="${S.escape(n)}">
                            <div class="sz-avatar"><span class="sz-av-fallback">${S.escape((c.name || '?')[0].toUpperCase())}</span></div>
                            <div class="sz-item-body">
                                <div class="sz-item-title">${S.escape(c.name || S.shortNum(n))}</div>
                                <div class="sz-item-preview">${S.escape(S.shortNum(n))}</div>
                            </div>
                        </button>`;
                    }).join('') : `<div class="sz-empty">Sem contatos no telefone.</div>`}
                </div>
                <button class="sz-btn ghost" id="szNewGroupBtn">Novo grupo</button>
                <button class="sz-modal-cancel" id="szPickCancel">Cancelar</button>
            </div>
        `;
        body.appendChild(modal);

        modal.querySelector('#szPickCancel').addEventListener('click', () => modal.remove());
        modal.querySelector('#szNewGroupBtn').addEventListener('click', () => {
            modal.remove();
            openGroupPicker();
        });
        modal.querySelectorAll('.sz-pick').forEach(btn => {
            btn.addEventListener('click', async () => {
                const num = btn.dataset.num;
                if (!num || num === _myNumber) return;
                const chatId = S.chatIdFor(_myNumber, num);
                modal.remove();
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
                openChat(chatId, { chatId, kind: '1:1', number: num, title: S.shortNum(num) });
            });
        });
    }

    function openGroupPicker() {
        const contacts = (ctx.contacts?.contacts || []);
        const sel = new Set();
        const body = _root.querySelector('#szBody');
        const m = document.createElement('div');
        m.className = 'sz-modal';
        m.innerHTML = `
            <div class="sz-modal-card">
                <div class="sz-modal-title">Novo grupo</div>
                <div class="sz-modal-body">
                    <input class="sz-input" id="szGroupName" placeholder="Nome do grupo" maxlength="40" />
                </div>
                <div class="sz-modal-list">
                    ${contacts.map(c => {
                        const n = c.number || c.num;
                        if (!n || n === _myNumber) return '';
                        return `<button class="sz-item sz-gpick" data-num="${S.escape(n)}">
                            <div class="sz-avatar"><span class="sz-av-fallback">${S.escape((c.name || '?')[0].toUpperCase())}</span></div>
                            <div class="sz-item-body"><div class="sz-item-title">${S.escape(c.name || S.shortNum(n))}</div></div>
                            <span class="sz-check">○</span>
                        </button>`;
                    }).join('')}
                </div>
                <div class="sz-modal-actions">
                    <button class="sz-btn" id="szGCancel">Cancelar</button>
                    <button class="sz-btn sz-btn-primary" id="szGCreate">Criar</button>
                </div>
            </div>
        `;
        body.appendChild(m);

        m.querySelectorAll('.sz-gpick').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = btn.dataset.num;
                if (sel.has(n)) sel.delete(n); else sel.add(n);
                btn.classList.toggle('selected', sel.has(n));
                btn.querySelector('.sz-check').textContent = sel.has(n) ? '●' : '○';
            });
        });
        m.querySelector('#szGCancel').addEventListener('click', () => m.remove());
        m.querySelector('#szGCreate').addEventListener('click', async () => {
            const name = m.querySelector('#szGroupName').value.trim() || 'Grupo';
            if (sel.size < 2) { ctx.toast?.('Escolha 2+ contatos', 'err'); return; }
            try {
                const chat = await S.groups.create(name, [...sel]);
                m.remove();
                ctx.toast?.('Grupo criado', 'ok');
                openChat(chat.id, { chatId: chat.id, kind: 'group', title: chat.name });
            } catch(e) {
                console.warn('[Sangzap/groups] create:', e);
                ctx.toast?.('Falha ao criar grupo', 'err');
            }
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
        const isGroup = meta.kind === 'group';

        body.innerHTML = `
            <div class="sz-chat">
                <div class="sz-chat-head">
                    <button class="sz-chat-back" id="szChatBack">‹</button>
                    <div class="sz-chat-title">${S.escape(meta.title || 'Chat')}</div>
                    ${!isGroup && meta.number ? `<button class="sz-chat-call" id="szChatCall" title="Ligar">📞</button>` : ''}
                </div>
                <div class="sz-chat-thread" id="szThread"></div>
                <div class="sz-chat-typing" id="szTyping"></div>
                <div class="sz-chat-input">
                    <button class="sz-chat-plus" id="szChatPlus" title="Anexar">+</button>
                    <input class="sz-chat-field" id="szField" type="text" placeholder="Mensagem" maxlength="4000" />
                    <button class="sz-chat-mic" id="szMic" title="Segurar para gravar">🎤</button>
                    <button class="sz-chat-send" id="szSend" aria-label="Enviar">↑</button>
                </div>
            </div>
        `;

        body.querySelector('#szChatBack').addEventListener('click', closeChat);

        const callBtn = body.querySelector('#szChatCall');
        if (callBtn) callBtn.addEventListener('click', () => {
            try { ctx.calls?.call?.([meta.number]); } catch(_) {}
        });

        const thread = body.querySelector('#szThread');
        const typingEl = body.querySelector('#szTyping');
        const field = body.querySelector('#szField');

        function paint(msgs, typing) {
            const stick = isNearBottom(thread);
            const msgsById = {};
            for (const m of msgs) msgsById[m.id] = m;

            thread.innerHTML = msgs.map(m => {
                const mine = m.from === _myNumber;
                if (m.kind === 'system') {
                    return `<div class="sz-msg-system">${S.escape(m.body || '')}</div>`;
                }
                if (m.deletedAt) {
                    return `<div class="sz-msg${mine ? ' mine' : ''}"><div class="sz-msg-bubble sz-msg-deleted">Mensagem apagada</div></div>`;
                }
                const isAudio = m.kind === 'audio';
                const isImage = m.kind === 'image';
                const isStoryReply = m.kind === 'story-reply';
                let bodyHtml;
                if (isAudio) bodyHtml = `<div class="sz-msg-audio" data-audio-id="${S.escape(m.id)}"></div>`;
                else if (isImage) bodyHtml = `<div class="sz-msg-image"><img src="${S.escape(m.media || '')}" alt="" /></div>`;
                else bodyHtml = `<div class="sz-msg-text">${S.escape(m.body || '')}</div>`;

                const reply = m.replyTo && msgsById[m.replyTo]
                    ? `<div class="sz-msg-reply">${S.escape(msgsById[m.replyTo].body || '').slice(0, 60)}</div>`
                    : '';
                const storyTag = isStoryReply ? `<div class="sz-msg-story-tag">💬 Story</div>` : '';

                return `
                    <div class="sz-msg${mine ? ' mine' : ''}" data-msg="${S.escape(m.id)}">
                        <div class="sz-msg-bubble">
                            ${reply}
                            ${storyTag}
                            ${bodyHtml}
                            <div class="sz-msg-meta">
                                ${m.editedAt ? `<span class="sz-edited">editado</span>` : ''}
                                <span>${S.fmtTime(m.sentAt)}</span>
                                ${mine ? `<span class="sz-tick">${m.readAt ? '✓✓' : m.deliveredAt ? '✓✓' : '✓'}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            thread.querySelectorAll('.sz-msg-audio').forEach(el => {
                const msg = msgsById[el.dataset.audioId];
                if (msg && S.audio) S.audio.renderInto(el, msg);
            });

            thread.querySelectorAll('.sz-msg').forEach(el => {
                el.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    const msg = msgsById[el.dataset.msg];
                    if (msg) openMsgMenu(msg);
                });
            });

            if (stick) thread.scrollTop = thread.scrollHeight;
            if (typing && typing.length) {
                typingEl.textContent = typing.length === 1 ? 'digitando…' : typing.length + ' digitando…';
            } else typingEl.textContent = '';
        }

        function openMsgMenu(msg) {
            const menu = document.createElement('div');
            menu.className = 'sz-ctx-menu';
            const canEdit = S.chat.canEdit(msg);
            menu.innerHTML = `
                <button class="sz-ctx-item" data-act="reply">Responder</button>
                ${canEdit ? `<button class="sz-ctx-item" data-act="edit">Editar</button>` : ''}
                <button class="sz-ctx-item danger" data-act="delete">Apagar</button>
            `;
            body.appendChild(menu);
            const close = () => menu.remove();
            setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
            menu.querySelectorAll('.sz-ctx-item').forEach(btn => {
                btn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const act = btn.dataset.act;
                    if (act === 'reply') {
                        field.value = '';
                        field.dataset.replyTo = msg.id;
                        field.focus();
                    } else if (act === 'edit') {
                        const text = prompt('Editar mensagem:', msg.body);
                        if (text != null) await S.chat.edit(msg.id, text);
                    } else if (act === 'delete') {
                        if (confirm('Apagar esta mensagem?')) await S.chat.delete(msg.id);
                    }
                    close();
                });
            });
        }

        S.chat.open(_activeChatId, _myNumber, meta, paint);

        function send() {
            const text = field.value.trim();
            if (!text) return;
            const replyTo = field.dataset.replyTo || null;
            field.value = '';
            delete field.dataset.replyTo;
            S.chat.send(text, replyTo ? { replyTo } : undefined).catch(e => console.warn('[Sangzap] send:', e));
        }

        body.querySelector('#szSend').addEventListener('click', send);
        field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); send(); }
        });
        field.addEventListener('input', () => S.chat.typing());

        // Mic
        const mic = body.querySelector('#szMic');
        mic.addEventListener('pointerdown', async (ev) => {
            ev.preventDefault();
            await S.audio.start(
                (state) => mic.classList.toggle('rec', state === 'rec'),
                (payload) => S.chat.sendAudio(payload).catch(() => {})
            );
        });
        mic.addEventListener('pointerup', (ev) => { ev.preventDefault(); S.audio.stop(); });
        mic.addEventListener('pointerleave', () => { if (S.audio.isRecording()) S.audio.stop(); });

        // Anexo (imagem)
        body.querySelector('#szChatPlus').addEventListener('click', async () => {
            const dataUrl = await S.settings?.pickAndCropSquare?.();
            if (!dataUrl) return;
            await S.chat.sendImage({ media: dataUrl, mime: 'image/jpeg', size: dataUrl.length });
        });
    }

    function isNearBottom(el) {
        return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
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
            _activeTab = 'chats';
            _activeChatId = null;
            _searchQuery = '';

            await loadModules();
            render();
        },

        unmount() {
            try { S.roster?.stop(); } catch(_) {}
            try { S.chat?.close(); } catch(_) {}
            try { S.stories?.stop(); } catch(_) {}
            _root = null;
        }
    });

    // ═══ CSS ═══
    ctx.appendStyle(`
        :root[data-sz-theme="roxo"] { --sz-accent: #a78bfa; --sz-accent2: #7c3aed; }
        :root[data-sz-theme="azul"] { --sz-accent: #38bdf8; --sz-accent2: #0284c7; }
        :root { --sz-accent: #25d366; --sz-accent2: #128c7e; }

        .sz-app {
            display: flex; flex-direction: column;
            height: 100%; min-height: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #e9ecf5;
            background: linear-gradient(175deg, #0e1621 0%, #0b1218 100%);
        }

        .sz-hdr {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px;
            background: linear-gradient(180deg, rgba(14,22,33,.97), rgba(14,22,33,.85));
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            flex-shrink: 0;
            border-bottom: 1px solid rgba(255,255,255,.05);
        }
        .sz-hdr-back, .sz-hdr-gear {
            width: 30px; height: 30px; flex-shrink: 0;
            border-radius: 9px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.12);
            color: #c7cad6; cursor: pointer; padding: 0;
            display: flex; align-items: center; justify-content: center;
            transition: all .16s cubic-bezier(.22,1,.36,1);
        }
        .sz-hdr-back svg { width: 13px; height: 13px; }
        .sz-hdr-back:hover, .sz-hdr-gear:hover {
            background: rgba(37,211,102,.16); color: #86efac; border-color: rgba(37,211,102,.4);
        }
        .sz-hdr-title {
            flex: 1;
            font-size: 13px; font-weight: 800; letter-spacing: .1em;
            background: linear-gradient(100deg, var(--sz-accent), #22d3ee, var(--sz-accent));
            background-size: 220% auto;
            -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: phScreenBlink 3.2s ease-in-out infinite;
            text-transform: uppercase;
        }

        .sz-tabs {
            display: grid; grid-template-columns: repeat(2, 1fr);
            border-bottom: 1px solid rgba(255,255,255,.05);
            background: rgba(0,0,0,.2);
            flex-shrink: 0;
        }
        .sz-tab {
            padding: 10px 4px; font-size: 11px; font-weight: 700;
            color: #8a90a8; background: transparent; border: none; cursor: pointer;
            font-family: inherit; position: relative;
            transition: color .16s, background .16s;
        }
        .sz-tab:hover { color: #d1d5db; background: rgba(255,255,255,.03); }
        .sz-tab.active { color: var(--sz-accent); }
        .sz-tab.active::after {
            content: ''; position: absolute; bottom: 0; left: 30%; right: 30%;
            height: 2px; background: linear-gradient(90deg, var(--sz-accent), #22d3ee);
            border-radius: 2px;
        }

        .sz-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }

        .sz-roster { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .sz-roster-head {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px 8px; flex-shrink: 0;
        }
        .sz-search-wrap { flex: 1; min-width: 0; }
        .sz-search {
            width: 100%; padding: 8px 12px;
            border-radius: 20px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.08);
            color: #e9ecf5; font-family: inherit; font-size: 11.5px; outline: none;
            box-sizing: border-box;
            transition: border-color .16s, background .16s;
        }
        .sz-search::placeholder { color: #5c6280; }
        .sz-search:focus { border-color: rgba(37,211,102,.45); background: rgba(255,255,255,.07); }

        .sz-new-btn {
            width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            border: none; color: #fff; font-size: 18px; font-weight: 700;
            cursor: pointer; line-height: 1;
            box-shadow: 0 4px 12px rgba(37,211,102,.3);
            transition: transform .16s cubic-bezier(.22,1,.36,1);
        }
        .sz-new-btn:hover { transform: scale(1.06); }
        .sz-new-btn:active { transform: scale(.94); }

        .sz-roster-list { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
        .sz-roster-list::-webkit-scrollbar { width: 4px; }
        .sz-roster-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }

        .sz-item {
            display: flex; align-items: center; gap: 11px;
            width: 100%; padding: 10px;
            background: transparent; border: none; cursor: pointer;
            font-family: inherit; color: inherit; text-align: left;
            border-radius: 12px; transition: background .14s;
        }
        .sz-item:hover { background: rgba(255,255,255,.04); }
        .sz-item:active { background: rgba(255,255,255,.07); }

        .sz-avatar {
            position: relative;
            width: 44px; height: 44px; flex-shrink: 0;
            border-radius: 50%; overflow: visible;
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            display: flex; align-items: center; justify-content: center;
            border: 1px solid rgba(255,255,255,.08);
        }
        .sz-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
        .sz-av-fallback { font-size: 17px; font-weight: 800; color: #fff; }
        .sz-online-dot {
            position: absolute; right: 0; bottom: 0;
            width: 11px; height: 11px; border-radius: 50%;
            background: #22c55e; border: 2px solid #0e1621;
            box-shadow: 0 0 6px rgba(34,197,94,.8);
        }
        .sz-avatar-lg { width: 84px; height: 84px; }
        .sz-avatar-sm { width: 30px; height: 30px; }
        .sz-avatar-sm .sz-av-fallback { font-size: 12px; }

        .sz-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .sz-item-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .sz-item-title { font-size: 12.5px; font-weight: 700; color: #e9ecf5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sz-item-time { font-size: 9.5px; color: #6b7280; flex-shrink: 0; font-variant-numeric: tabular-nums; }
        .sz-item-bot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .sz-item-preview { font-size: 11px; color: #8a90a8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .sz-item-recado { color: #86efac; font-style: italic; }
        .sz-item-badge {
            min-width: 18px; height: 18px; padding: 0 6px;
            border-radius: 9px; background: var(--sz-accent); color: #06280f;
            font-size: 10px; font-weight: 800; line-height: 18px; text-align: center;
            flex-shrink: 0;
        }
        .sz-pin, .sz-mute { font-size: 10px; margin-right: 4px; opacity: .75; }

        .sz-empty { padding: 32px 16px; text-align: center; font-size: 11px; color: #6b7280; line-height: 1.6; }
        .sz-empty b { color: var(--sz-accent); }

        .sz-ctx-menu {
            position: absolute; z-index: 40;
            background: #1a222d; border: 1px solid rgba(255,255,255,.12);
            border-radius: 10px; padding: 4px;
            box-shadow: 0 8px 24px rgba(0,0,0,.6);
            min-width: 140px;
            top: 50%; left: 50%; transform: translate(-50%, -50%);
            animation: phFadeIn .14s ease;
        }
        .sz-ctx-item {
            display: block; width: 100%;
            padding: 9px 12px;
            background: transparent; border: none;
            color: #e9ecf5; font-family: inherit;
            font-size: 11.5px; text-align: left; cursor: pointer;
            border-radius: 7px;
        }
        .sz-ctx-item:hover { background: rgba(255,255,255,.06); }
        .sz-ctx-item.danger { color: #fca5b1; }

        .sz-modal {
            position: absolute; inset: 0; z-index: 30;
            background: rgba(0,0,0,.65);
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
            display: flex; align-items: flex-end; justify-content: center;
            animation: phFadeIn .2s ease;
        }
        .sz-modal-card {
            width: 100%; max-height: 85%;
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
        .sz-modal-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
        .sz-modal-list { flex: 1; overflow-y: auto; padding: 8px 8px; }
        .sz-modal-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 14px 14px; }
        .sz-modal-cancel {
            margin: 8px 14px 14px;
            padding: 11px; border-radius: 10px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            color: #c7cad6; font-family: inherit;
            font-size: 11.5px; font-weight: 700; cursor: pointer;
        }
        .sz-modal-cancel:hover { background: rgba(255,255,255,.09); }

        .sz-gpick .sz-check { font-size: 16px; color: #8a90a8; margin-left: 8px; }
        .sz-gpick.selected { background: rgba(37,211,102,.08); }
        .sz-gpick.selected .sz-check { color: var(--sz-accent); }

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
            color: var(--sz-accent); font-size: 22px; line-height: 1;
            cursor: pointer; padding: 0;
            display: flex; align-items: center; justify-content: center;
        }
        .sz-chat-back:hover { background: rgba(37,211,102,.14); }
        .sz-chat-title { flex: 1; font-size: 12.5px; font-weight: 700; color: #e9ecf5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sz-chat-call {
            background: transparent; border: none; font-size: 16px;
            cursor: pointer; padding: 2px 4px;
        }
        .sz-chat-call:hover { transform: scale(1.15); }

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
        .sz-msg-bubble.sz-msg-deleted { opacity: .55; font-style: italic; font-size: 11px; color: #8a90a8; }
        .sz-msg-text { font-size: 12px; color: #e9ecf5; line-height: 1.45; word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap; }
        .sz-msg-image img { max-width: 200px; border-radius: 8px; display: block; }
        .sz-msg-reply {
            padding: 5px 8px; border-left: 2px solid var(--sz-accent);
            background: rgba(0,0,0,.22); border-radius: 6px;
            font-size: 10px; color: #b4bac8; margin-bottom: 4px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sz-msg-story-tag { font-size: 9px; color: #86efac; margin-bottom: 3px; font-weight: 700; letter-spacing: .05em; }
        .sz-msg-meta {
            display: flex; align-items: center; justify-content: flex-end; gap: 4px;
            font-size: 9px; color: #8a90a8; margin-top: 2px;
            font-variant-numeric: tabular-nums;
        }
        .sz-msg.mine .sz-msg-meta { color: rgba(134,239,172,.7); }
        .sz-tick { color: var(--sz-accent); font-weight: 700; }
        .sz-edited { font-size: 8px; opacity: .7; }

        .sz-msg-system {
            align-self: center; margin: 4px auto;
            font-size: 9.5px; color: #8a90a8;
            padding: 3px 10px; border-radius: 10px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.06);
        }

        .sz-chat-typing {
            font-size: 9.5px; color: var(--sz-accent);
            padding: 0 14px 2px; min-height: 14px;
            font-style: italic; flex-shrink: 0;
        }

        .sz-chat-input {
            display: flex; align-items: center; gap: 6px;
            padding: 10px 10px;
            background: rgba(0,0,0,.3);
            border-top: 1px solid rgba(255,255,255,.06);
            flex-shrink: 0;
        }
        .sz-chat-plus {
            width: 32px; height: 32px; flex-shrink: 0;
            border-radius: 50%; border: 1px solid rgba(255,255,255,.12);
            background: rgba(255,255,255,.05); color: #c7cad6;
            font-size: 18px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            line-height: 1;
        }
        .sz-chat-plus:hover { background: rgba(37,211,102,.14); color: #86efac; }
        .sz-chat-field {
            flex: 1; min-width: 0;
            padding: 10px 14px; border-radius: 22px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            color: #e9ecf5; font-family: inherit; font-size: 12px; outline: none;
            transition: border-color .16s, background .16s;
        }
        .sz-chat-field::placeholder { color: #5c6280; }
        .sz-chat-field:focus { border-color: rgba(37,211,102,.5); background: rgba(255,255,255,.08); }
        .sz-chat-send, .sz-chat-mic {
            width: 36px; height: 36px; flex-shrink: 0;
            border-radius: 50%; border: none;
            color: #fff; font-size: 15px; font-weight: 700;
            cursor: pointer; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            transition: transform .16s cubic-bezier(.22,1,.36,1);
        }
        .sz-chat-send {
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            box-shadow: 0 4px 12px rgba(37,211,102,.35);
        }
        .sz-chat-mic {
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.14);
        }
        .sz-chat-send:hover, .sz-chat-mic:hover { transform: scale(1.06); }
        .sz-chat-send:active, .sz-chat-mic:active { transform: scale(.92); }
        .sz-chat-mic.rec {
            background: #e5484d; border-color: #e5484d;
            animation: phSpeaking 1.2s ease-in-out infinite;
            box-shadow: 0 0 14px rgba(229,72,77,.55);
        }

        /* ═══ AUDIO ═══ */
        .sz-msg-audio { padding: 4px 0; }
        .sz-audio { display: flex; align-items: center; gap: 8px; padding: 2px 4px 2px 2px; }
        .sz-audio-btn {
            width: 30px; height: 30px; flex-shrink: 0;
            border-radius: 50%; border: none;
            background: rgba(255,255,255,.14); color: #e9ecf5;
            font-size: 12px; cursor: pointer; line-height: 1;
            display: flex; align-items: center; justify-content: center;
        }
        .sz-msg.mine .sz-audio-btn { background: rgba(37,211,102,.35); color: #06280f; }
        .sz-audio-wave { display: flex; align-items: center; gap: 2px; height: 26px; flex: 1; min-width: 60px; }
        .sz-audio-wave span { width: 2px; border-radius: 1px; background: rgba(255,255,255,.28); transition: background .12s; }
        .sz-audio-wave span.on { background: #86efac; }
        .sz-audio-time { font-size: 9px; color: #8a90a8; font-variant-numeric: tabular-nums; }

        /* ═══ SETTINGS ═══ */
        .sz-settings { padding: 16px 14px 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; height: 100%; }
        .sz-profile-loading { padding: 32px; text-align: center; color: #6b7280; font-size: 11px; }
        .sz-settings-hero { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 0; }
        .sz-settings-num { font-size: 11px; color: var(--sz-accent); letter-spacing: .08em; font-variant-numeric: tabular-nums; }
        .sz-section { display: flex; flex-direction: column; gap: 6px; }
        .sz-section-title {
            font-size: 9px; font-weight: 800; letter-spacing: .12em;
            text-transform: uppercase; color: #8a90a8;
            padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .sz-input {
            width: 100%; padding: 10px 12px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 10px; color: #e9ecf5;
            font-family: inherit; font-size: 12px; outline: none;
            box-sizing: border-box;
            transition: border-color .16s, background .16s;
        }
        .sz-input:focus { border-color: rgba(37,211,102,.5); background: rgba(255,255,255,.07); }
        .sz-textarea { min-height: 60px; resize: vertical; font-family: inherit; }
        .sz-field-hint { font-size: 9px; color: #6b7280; }
        .sz-profile-photo-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .sz-btn {
            padding: 10px 14px; border-radius: 10px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.12);
            color: #e9ecf5; font-family: inherit;
            font-size: 11.5px; font-weight: 700; cursor: pointer;
            transition: all .16s cubic-bezier(.22,1,.36,1);
            text-align: center;
        }
        .sz-btn:hover { background: rgba(255,255,255,.1); transform: translateY(-1px); }
        .sz-btn:active { transform: translateY(0) scale(.98); }
        .sz-btn-primary {
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            border-color: transparent; color: #fff;
            box-shadow: 0 6px 16px rgba(37,211,102,.3);
        }
        .sz-btn.ghost { background: transparent; }
        .sz-profile-foot { text-align: center; font-size: 9px; color: #6b7280; padding-top: 6px; }

        .sz-option-row { display: flex; flex-direction: column; gap: 6px; }
        .sz-option-label { font-size: 9.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #a8aec4; }
        .sz-radio-group {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 5px; background: rgba(0,0,0,.22);
            border: 1px solid rgba(255,255,255,.06);
            border-radius: 10px; padding: 3px;
        }
        .sz-radio {
            padding: 7px 4px; border-radius: 7px;
            background: transparent; border: none;
            color: #8a90a8; font-family: inherit;
            font-size: 10px; font-weight: 800;
            letter-spacing: .04em; text-transform: uppercase;
            cursor: pointer; transition: all .18s cubic-bezier(.22,1,.36,1);
        }
        .sz-radio.active {
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            color: #0b0b10;
        }

        .sz-toggle-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
        .sz-toggle-text { flex: 1; min-width: 0; }
        .sz-toggle-label { font-size: 11.5px; font-weight: 700; color: #e8eaf4; }
        .sz-toggle-sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
        .sz-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; cursor: pointer; }
        .sz-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .sz-switch-track {
            position: absolute; inset: 0; border-radius: 20px;
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.12);
            transition: background .24s, border-color .24s;
        }
        .sz-switch-track::before {
            content: ''; position: absolute;
            width: 14px; height: 14px; left: 2px; top: 2px;
            background: #8a90a8; border-radius: 50%;
            transition: transform .24s cubic-bezier(.22,1,.36,1), background .24s;
        }
        .sz-switch input:checked + .sz-switch-track {
            background: linear-gradient(120deg, rgba(52,211,153,.42), rgba(34,211,238,.42));
            border-color: rgba(52,211,153,.6);
        }
        .sz-switch input:checked + .sz-switch-track::before {
            background: linear-gradient(135deg, #34d399, #22d3ee);
            transform: translateX(16px);
        }

        /* ═══ STORIES ═══ */
        .sz-stories-tab { display: flex; flex-direction: column; height: 100%; }
        .sz-status-actions { padding: 12px 14px 8px; flex-shrink: 0; }
        .sz-stories-feed { flex: 1; overflow-y: auto; padding: 4px 10px 16px; display: flex; flex-direction: column; gap: 12px; }
        .sz-story {
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.06);
            border-radius: 14px; overflow: hidden;
            transition: border-color .16s;
        }
        .sz-story.seen { opacity: .72; }
        .sz-story-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
        .sz-story-head-info { flex: 1; min-width: 0; }
        .sz-story-author { font-size: 12px; font-weight: 700; color: #e9ecf5; }
        .sz-story-time { font-size: 9.5px; color: #6b7280; margin-top: 2px; }
        .sz-story-viewers { font-size: 10px; color: var(--sz-accent); font-weight: 700; }
        .sz-story-media { background: #000; }
        .sz-story-media img { width: 100%; max-height: 300px; object-fit: cover; display: block; }
        .sz-story-caption { padding: 10px 12px 6px; font-size: 11.5px; color: #d1d5db; line-height: 1.5; }
        .sz-story-reactions { padding: 0 12px 6px; display: flex; gap: 4px; font-size: 14px; }
        .sz-story-actions {
            display: flex; gap: 4px; padding: 8px 10px 10px;
            border-top: 1px solid rgba(255,255,255,.05);
        }
        .sz-react {
            flex: 1; padding: 7px 0;
            background: transparent; border: 1px solid rgba(255,255,255,.06);
            border-radius: 8px; cursor: pointer; font-size: 15px;
            transition: all .14s;
        }
        .sz-react:hover { background: rgba(37,211,102,.12); border-color: rgba(37,211,102,.35); transform: scale(1.08); }
        .sz-react:active { transform: scale(.94); }
        .sz-story-img-preview img { max-width: 100%; max-height: 200px; border-radius: 10px; display: block; margin: 6px auto; }

        @keyframes phSlideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes phFadeIn { from { opacity: 0; } to { opacity: 1; } }

        @media (prefers-reduced-motion: reduce) {
            .sz-hdr-title, .sz-chat-mic.rec { animation: none !important; }
            .sz-item, .sz-tab, .sz-hdr-back, .sz-hdr-gear, .sz-new-btn, .sz-chat-send, .sz-chat-mic, .sz-chat-plus, .sz-modal-cancel, .sz-btn, .sz-react { transition-duration: .01ms; }
        }
    `);
})();
