// modules/phone/apps/sangzap/shell.js
(function() {
    'use strict';

    // ═══ BOOT GUARD ═══
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Sangzap] phone ctx ausente'); return; }
    if (ctx.apps?.get?.('sangzap')) return;

    const APP_ID = 'sangzap';
    const APP_VERSION = '0.6.0';
    const DEFAULT_MODULE_BASE = 'https://raw.githubusercontent.com/zBeyond5/Liveblock/main/modules/phone';
    const DEFAULT_APP_BG = '#0e1621';

    const MODULE_BASE = (ctx.moduleBase || DEFAULT_MODULE_BASE).replace(/\/+$/, '');
    const BASE = MODULE_BASE + '/apps/sangzap';

    const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

    // ═══ STATE ═══
    const _state = {
        activeTab: 'chats',
        activeChatId: null,
        chatMeta: null,
        searchQuery: '',
        rosterChip: 'all',
        rosterSections: [],
        rosterCounts: { all: 0, unread: 0, groups: 0, archived: 0 },
        myNumber: null,
        myName: '',
        root: null,
        screenEl: null,
        appBg: DEFAULT_APP_BG,
        mounted: false,
        destroyed: false,
        online: navigator.onLine !== false,
        pendingOpen: null
    };

    let S = null;
    let _moduleLoaded = false;
    let _loadPromise = null;
    let _loadFailed = false;
    let _moduleDiagnostic = null;
    let _unreadTotal = 0;
    let _historyBound = false;
    let _histPushed = false;
    let _connBound = false;
    let _micCleanup = null;

    // ═══ SAFE BINDING ═══
    function bindS() { S = window._sangzapCtx || null; return S; }
    function safe(fn, fallback) {
        try { return fn(); } catch(e) { console.warn('[Sangzap] safe:', e); return fallback; }
    }
    const esc = (s) => safe(() => S?.escape?.(s), String(s ?? ''));
    const fmtTime = (ts) => safe(() => S?.fmtTime?.(ts), '');
    const fmtRelative = (ts) => safe(() => S?.fmtRelative?.(ts), '');
    const timeAgo = (ts) => safe(() => S?.timeAgo?.(ts), '');
    const shortNum = (n) => safe(() => S?.shortNum?.(n), String(n ?? ''));
    const chatIdFor = (a, b) => safe(() => S?.chatIdFor?.(a, b), [String(a), String(b)].sort().join('-'));

    // ═══ MODULE LOADER ═══
    async function loadScript(src, timeoutMs) {
        timeoutMs = timeoutMs || 8000;
        const ctrl = new AbortController();
        const t = setTimeout(() => { try { ctrl.abort(); } catch(_) {} }, timeoutMs);
        try {
            const res = await fetch(src, { cache: 'no-store', signal: ctrl.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const code = await res.text();
            const s = document.createElement('script');
            s.textContent = code;
            document.head.appendChild(s);
            s.remove();
            return true;
        } catch(e) {
            console.warn('[Sangzap] falha ao carregar', src, e.message || e);
            return false;
        } finally {
            clearTimeout(t);
        }
    }

    function loadModules() {
        if (_loadPromise) return _loadPromise;
        _loadPromise = (async () => {
            if (_moduleLoaded) return;

            // ═══ 1) common.js PRIMEIRO — registra window._sangzapCtx ═══
            const commonUrl = `${BASE}/common.js?v=${APP_VERSION}`;
            const commonOk = await loadScript(commonUrl);
            const results = [{ file: 'common.js', url: commonUrl, ok: commonOk }];
            bindS();

            if (!commonOk || !S) {
                console.error('[Sangzap] FALHA CRÍTICA em common.js. ok:', commonOk, '| S:', S, '| Base:', BASE);
                _loadFailed = true;
                _moduleDiagnostic = { base: BASE, results, missing: ['common'] };
                return;
            }

            // ═══ 2) style.js + resto em paralelo — S já existe ═══
            // style.js precisa de window._sangzapCtx (registrado acima) e do
            // ctx.root do telefone (existe desde o boot do phone).
            // Não entra na lista de módulos críticos: se falhar, o app ainda
            // funciona — só fica sem CSS.
            const rest = ['style.js', 'roster.js', 'chat.js', 'audio.js', 'groups.js', 'settings.js', 'stories.js'];
            const restResults = await Promise.all(rest.map(async (f) => {
                const url = `${BASE}/${f}?v=${APP_VERSION}`;
                const ok = await loadScript(url);
                return { file: f, url, ok };
            }));
            results.push(...restResults);

            // ═══ 3) verifica apenas módulos críticos de lógica ═══
            const missing = [];
            if (!S.roster)   missing.push('roster');
            if (!S.chat)     missing.push('chat');
            if (!S.audio)    missing.push('audio');
            if (!S.groups)   missing.push('groups');
            if (!S.settings) missing.push('settings');
            if (!S.stories)  missing.push('stories');

            _moduleDiagnostic = { base: BASE, results, missing };
            _loadFailed = missing.length >= 5;

            if (missing.length) console.warn('[Sangzap] módulos faltando:', missing.join(', '));
            else console.log('[Sangzap] todos os módulos prontos de', BASE);

            _moduleLoaded = true;
        })();
        return _loadPromise;
    }

    // ═══ APP BAR / BG / BADGE ═══
    function hidePhoneBar() { try { _state.screenEl?.classList?.add('sz-hide-bar'); } catch(_) {} }
    function showPhoneBar() { try { _state.screenEl?.classList?.remove('sz-hide-bar'); } catch(_) {} }
    function refreshAppBadge(total) { _unreadTotal = total || 0; try { ctx.apps?._notify?.(); } catch(_) {} }
    function applyAppBg() {
        const bg = _state.appBg || DEFAULT_APP_BG;
        try {
            _state.root?.style?.setProperty('--sz-app-bg', bg);
            document.documentElement?.style?.setProperty('--sz-app-bg', bg);
        } catch(_) {}
    }

    // ═══ CONEXÃO ═══
    function bindConnection() {
        if (_connBound) return;
        _connBound = true;
        window.addEventListener('online', () => {
            _state.online = true;
            updateConnBar();
            try { S?.chat?.drainQueue?.(); } catch(_) {}
        });
        window.addEventListener('offline', () => {
            _state.online = false;
            updateConnBar();
        });
        updateConnBar();
    }
    function updateConnBar() {
        const bar = _state.root?.querySelector('.sz-conn-bar');
        if (!bar) return;
        const off = !_state.online;
        bar.classList.toggle('on', off);
        bar.textContent = off ? 'Sem conexão — mensagens serão reenviadas quando voltar' : '';
    }

    // ═══ HISTORY / ANDROID BACK ═══
    function historyPush() {
        try {
            history.pushState({ __sz: 1, t: Date.now() }, '');
            _histPushed = true;
        } catch(_) {}
    }
    function historyExit() {
        try { history.back(); } catch(_) {}
    }
    function bindHistory() {
        if (_historyBound) return;
        _historyBound = true;
        window.addEventListener('popstate', () => {
            if (!_state.mounted) { _histPushed = false; return; }
            if (_state.activeChatId) {
                closeChat(false);
                historyPush();
                return;
            }
            if (_state.activeTab === 'settings') {
                _state.activeTab = 'chats';
                render();
                historyPush();
                return;
            }
            _histPushed = false;
            try { ctx.closeApp?.(); } catch(_) {}
        });
    }

    // ═══ NAV ═══
    function goHome() {
        if (_state.activeChatId) { historyExit(); return; }
        if (_state.activeTab === 'settings') { historyExit(); return; }
        try { ctx.closeApp?.(); } catch(_) {}
    }

    // ═══ RENDER ═══
    function render() {
        if (!_state.root || _state.destroyed) return;
        bindS();
        const root = _state.root;
        const inSettings = _state.activeTab === 'settings' && !_state.activeChatId;
        const inChat = !!_state.activeChatId;
        const showTabs = !inChat && !inSettings;
        const isGroup = _state.chatMeta?.kind === 'group';
        const chatTitle = isGroup
            ? (_state.chatMeta?.title || 'Grupo')
            : (_state.chatMeta?.number ? shortNum(_state.chatMeta.number) : 'Chat');

        root.innerHTML = `
            <div class="sz-app${inSettings ? ' sz-settings-mode' : ''}">
                <div class="sz-conn-bar"></div>
                <header class="sz-hdr">
                    ${inChat
                        ? `<button class="sz-hdr-back" id="szBack" aria-label="Voltar">‹</button>
                           <div class="sz-hdr-title sz-hdr-title-chat">${esc(chatTitle)}</div>
                           ${!isGroup && _state.chatMeta?.number
                                ? `<button class="sz-hdr-call" id="szCall" aria-label="Ligar">📞</button>` : ''}`
                        : `<button class="sz-hdr-back" id="szBack" aria-label="Voltar">${ctx.I?.back || '←'}</button>
                           <div class="sz-hdr-title">SANGZAP</div>
                           ${!inSettings
                                ? `<button class="sz-hdr-gear" id="szGear" aria-label="Configurações">
                                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                   </button>`
                                : ''}`
                    }
                </header>

                ${showTabs ? `
                    <div class="sz-tabs" id="szTabs" role="tablist">
                        <button class="sz-tab${_state.activeTab === 'chats' ? ' active' : ''}" data-tab="chats" role="tab">Conversas</button>
                        <button class="sz-tab${_state.activeTab === 'stories' ? ' active' : ''}" data-tab="stories" role="tab">Stories</button>
                    </div>
                ` : ''}

                <div class="sz-body" id="szBody"></div>
            </div>
        `;

        root.querySelector('#szBack')?.addEventListener('click', goHome);
        root.querySelector('#szGear')?.addEventListener('click', () => {
            _state.activeTab = 'settings';
            _state.activeChatId = null;
            _state.chatMeta = null;
            historyPush();
            render();
        });
        root.querySelector('#szCall')?.addEventListener('click', () => {
            const num = _state.chatMeta?.number;
            if (!num) return;
            try {
                if (typeof ctx.calls?.call === 'function') ctx.calls.call([num]);
                else ctx.toast?.('Chamadas indisponíveis', 'err');
            } catch(e) { console.warn('[Sangzap] call:', e); }
        });
        root.querySelectorAll('.sz-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.tab === _state.activeTab) return;
                _state.activeTab = btn.dataset.tab;
                _state.activeChatId = null;
                _state.chatMeta = null;
                render();
            });
        });

        const body = root.querySelector('#szBody');
        if (!body) return;

        if (_loadFailed && !inChat && _state.activeTab === 'chats') {
            renderDiagnostic(body);
            return;
        }

        try {
            if (inChat) renderChat(body);
            else if (_state.activeTab === 'chats') renderRoster(body);
            else if (_state.activeTab === 'stories') {
                if (S?.stories?.renderTab) S.stories.renderTab(body, _state.myNumber);
                else renderStub(body, 'Stories', 'Módulo indisponível.');
            }
            else if (inSettings) {
                if (S?.settings?.render) S.settings.render(body, _state.myNumber);
                else renderStub(body, 'Ajustes', 'Módulo indisponível.');
            }
        } catch(e) {
            console.error('[Sangzap] erro de render:', e);
            renderStub(body, 'Erro', 'Falha ao montar esta tela.');
        }
    }

    function renderDiagnostic(body) {
        const d = _moduleDiagnostic || { base: BASE, results: [], missing: ['?'] };
        const rows = d.results.map(r => `
            <div class="sz-diag-row ${r.ok ? 'ok' : 'fail'}">
                <span class="sz-diag-ico">${r.ok ? '✓' : '✗'}</span>
                <span class="sz-diag-file">${esc(r.file)}</span>
                <span class="sz-diag-status">${r.ok ? 'ok' : '404/timeout'}</span>
            </div>
        `).join('');
        const missingTxt = (d.missing || []).join(', ') || '—';
        body.innerHTML = `
            <div class="sz-diag">
                <div class="sz-diag-icon">⚠</div>
                <div class="sz-diag-title">Módulos não carregaram</div>
                <div class="sz-diag-sub">Base consultada:</div>
                <code class="sz-diag-base">${esc(d.base)}</code>
                <div class="sz-diag-list">${rows || '<div class="sz-diag-row">sem dados</div>'}</div>
                <div class="sz-diag-hint">
                    Ausentes: <b>${esc(missingTxt)}</b><br>
                    Abra o console (F12) → aba Network → filtre por <b>sangzap</b> e veja o status HTTP.
                    Se algum arquivo retorna 404, o path no repo está diferente.
                </div>
                <button class="sz-btn sz-btn-primary" id="szDiagRetry" type="button">Tentar de novo</button>
            </div>
        `;
        body.querySelector('#szDiagRetry')?.addEventListener('click', () => {
            _loadPromise = null;
            _moduleLoaded = false;
            _loadFailed = false;
            _moduleDiagnostic = null;
            document.querySelectorAll('script[src*="/apps/sangzap/"]').forEach(s => {
                try { s.remove(); } catch(_) {}
            });
            render();
        });
    }

    function renderStub(body, title, sub) {
        body.innerHTML = `
            <div class="sz-stub">
                <div class="sz-stub-icon">💬</div>
                <div class="sz-stub-title">${esc(title)}</div>
                <div class="sz-stub-sub">${esc(sub || '')}</div>
            </div>
        `;
    }

    // ═══ ROSTER ═══
    function renderRoster(body) {
        body.innerHTML = `
            <div class="sz-roster">
                <div class="sz-roster-head">
                    <div class="sz-search-wrap">
                        <input class="sz-search" id="szSearch" type="text" placeholder="Buscar…" value="${esc(_state.searchQuery)}" autocomplete="off" spellcheck="false" />
                    </div>
                    <button class="sz-new-btn" id="szNew" title="Nova conversa">+</button>
                </div>
                <div class="sz-chips" id="szChips">
                    <button class="sz-chip${_state.rosterChip === 'all' ? ' on' : ''}" data-chip="all">Todas</button>
                    <button class="sz-chip${_state.rosterChip === 'unread' ? ' on' : ''}" data-chip="unread">Não lidas <span class="sz-chip-n" data-n="unread">0</span></button>
                    <button class="sz-chip${_state.rosterChip === 'groups' ? ' on' : ''}" data-chip="groups">Grupos <span class="sz-chip-n" data-n="groups">0</span></button>
                    <button class="sz-chip${_state.rosterChip === 'archived' ? ' on' : ''}" data-chip="archived">Arquivadas <span class="sz-chip-n" data-n="archived">0</span></button>
                </div>
                <div class="sz-roster-list" id="szRosterList"><div class="sz-empty">Carregando…</div></div>
            </div>
        `;

        body.querySelector('#szNew')?.addEventListener('click', openNewChatPicker);
        const searchEl = body.querySelector('#szSearch');
        const chips = body.querySelector('#szChips');
        const list = body.querySelector('#szRosterList');
        if (!searchEl || !chips || !list) return;

        searchEl.addEventListener('input', () => {
            _state.searchQuery = searchEl.value;
            repaint();
        });
        chips.addEventListener('click', (e) => {
            const b = e.target.closest('.sz-chip');
            if (!b) return;
            _state.rosterChip = b.dataset.chip;
            chips.querySelectorAll('.sz-chip').forEach(c => c.classList.toggle('on', c === b));
            repaint();
        });

        function updateCounts(counts) {
            _state.rosterCounts = counts || _state.rosterCounts;
            chips.querySelectorAll('.sz-chip-n').forEach(el => {
                const k = el.dataset.n;
                const n = _state.rosterCounts[k] || 0;
                el.textContent = n > 99 ? '99+' : String(n);
                el.style.display = n > 0 ? '' : 'none';
            });
        }

        function repaint() {
            const opts = {
                query: _state.searchQuery,
                chip: _state.rosterChip === 'archived' ? 'all' : _state.rosterChip,
                includeArchived: _state.rosterChip === 'archived'
            };
            const sections = S?.roster?.sections
                ? S.roster.sections(opts)
                : [{ id: 'main', title: '', items: [] }];
            _state.rosterSections = sections;
            paint(sections);
        }

        function paint(sections) {
            const flat = sections.flatMap(s => s.items);
            if (!flat.length) {
                list.innerHTML = `<div class="sz-empty">${_state.searchQuery ? 'Nada encontrado.' : (S?.roster ? 'Sem contatos. Adicione no telefone.' : 'Módulo indisponível.')}</div>`;
                refreshAppBadge(0);
                return;
            }
            let totalUnread = 0;
            const html = sections.map(sec => {
                const items = sec.items.map(c => {
                    if (!c || !c.chatId) return '';
                    const unread = c.muted ? 0 : (c.unread || 0);
                    totalUnread += unread;
                    const isGroup = c.kind === 'group';
                    const online = !isGroup && c.online;
                    const title = c.title || shortNum(c.number || '');
                    const initial = (title || '?').trim()[0]?.toUpperCase() || '?';
                    const avatar = c.avatar
                        ? `<img src="${esc(c.avatar)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(initial)}'))" />`
                        : `<span class="sz-av-fallback">${esc(initial)}</span>`;
                    const dot = online ? `<span class="sz-online-dot" title="Online"></span>` : '';
                    const pin = c.pinned ? `<span class="sz-pin" title="Fixado">📌</span>` : '';
                    const mute = c.muted ? `<span class="sz-mute" title="Silenciado">🔇</span>` : '';

                    let previewHtml = '';
                    if (S?.roster?.previewParts) {
                        const parts = S.roster.previewParts(c);
                        if (parts.kind === 'typing') {
                            previewHtml = `<span class="sz-item-preview sz-item-typing">${esc(parts.text)}</span>`;
                        } else {
                            const recado = c.recado && !c.lastMessage;
                            previewHtml = `<span class="sz-item-preview${recado ? ' sz-item-recado' : ''}">${parts.icon ? esc(parts.icon) + ' ' : ''}${esc(parts.text || (isGroup ? '' : 'Toque para conversar'))}</span>`;
                        }
                    } else {
                        previewHtml = `<span class="sz-item-preview">${esc(c.lastMessage || (isGroup ? '' : c.recado || 'Toque para conversar'))}</span>`;
                    }
                    const timeTxt = c.lastMessageAt
                        ? fmtRelative(c.lastMessageAt)
                        : (online ? 'online' : (c.lastSeen ? timeAgo(c.lastSeen) : ''));

                    return `
                        <button class="sz-item" data-chat="${esc(c.chatId)}" data-num="${esc(c.number || '')}" type="button">
                            <div class="sz-avatar">${avatar}${dot}</div>
                            <div class="sz-item-body">
                                <div class="sz-item-top">
                                    <span class="sz-item-title">${pin}${esc(title)}${mute}</span>
                                    <span class="sz-item-time">${esc(timeTxt)}</span>
                                </div>
                                <div class="sz-item-bot">
                                    ${previewHtml}
                                    ${unread ? `<span class="sz-item-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
                                </div>
                            </div>
                        </button>
                    `;
                }).filter(Boolean).join('');
                return sec.title
                    ? `<div class="sz-roster-section-title">${esc(sec.title)}</div>${items}`
                    : items;
            }).join('');
            list.innerHTML = html;
            refreshAppBadge(totalUnread);

            list.querySelectorAll('.sz-item').forEach(btn => {
                const entry = flat.find(x => x.chatId === btn.dataset.chat);
                if (!entry) return;
                let lpTimer = null, lpFired = false;
                btn.addEventListener('click', () => {
                    if (lpFired) { lpFired = false; return; }
                    openChat(entry.chatId, entry);
                });
                btn.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    openContextMenu(entry);
                });
                btn.addEventListener('pointerdown', (ev) => {
                    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
                    lpFired = false;
                    lpTimer = setTimeout(() => { lpFired = true; openContextMenu(entry); }, 550);
                });
                ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
                    btn.addEventListener(evt, () => {
                        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
                    })
                );
            });
        }

        if (S?.roster?.start) {
            S.roster.start(_state.myNumber, (entries, counts) => {
                if (!_state.mounted) return;
                updateCounts(counts);
                repaint();
            });
            setTimeout(() => updateCounts(S.roster.counts?.()), 60);
        }
    }

    function openContextMenu(entry) {
        const body = _state.root?.querySelector('#szBody');
        if (!body) return;
        const menu = document.createElement('div');
        menu.className = 'sz-ctx-menu sz-ctx-center';
        menu.innerHTML = `
            <button class="sz-ctx-item" data-act="pin">${entry.pinned ? 'Desafixar' : 'Fixar'}</button>
            <button class="sz-ctx-item" data-act="mute">${entry.muted ? 'Ativar som' : 'Silenciar'}</button>
            <button class="sz-ctx-item" data-act="archive">${entry.archived ? 'Restaurar' : 'Arquivar'}</button>
        `;
        body.appendChild(menu);
        const close = () => { try { menu.remove(); } catch(_) {} };
        setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
        menu.querySelectorAll('.sz-ctx-item').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const act = btn.dataset.act;
                try {
                    if (act === 'pin' && S?.roster?.pin) await S.roster.pin(entry.chatId, !entry.pinned);
                    if (act === 'mute' && S?.roster?.mute) await S.roster.mute(entry.chatId, !entry.muted);
                    if (act === 'archive' && S?.roster?.archive) await S.roster.archive(entry.chatId, !entry.archived);
                } catch(_) {}
                close();
            });
        });
    }

    // ═══ NEW CHAT / GROUP ═══
    function openNewChatPicker() {
        const contacts = ctx.contacts?.contacts || [];
        const body = _state.root?.querySelector('#szBody');
        if (!body) return;
        const modal = document.createElement('div');
        modal.className = 'sz-modal';
        modal.innerHTML = `
            <div class="sz-modal-card">
                <div class="sz-modal-title">Nova conversa</div>
                <div class="sz-modal-list">
                    ${contacts.length ? contacts.map(c => {
                        const n = c?.number || c?.num;
                        if (!n || n === _state.myNumber) return '';
                        const name = c.name || shortNum(n);
                        const initial = (name || '?')[0].toUpperCase();
                        return `<button class="sz-item sz-pick" data-num="${esc(n)}" type="button">
                            <div class="sz-avatar"><span class="sz-av-fallback">${esc(initial)}</span></div>
                            <div class="sz-item-body">
                                <div class="sz-item-title">${esc(name)}</div>
                                <div class="sz-item-preview">${esc(shortNum(n))}</div>
                            </div>
                        </button>`;
                    }).join('') : `<div class="sz-empty">Sem contatos no telefone.</div>`}
                </div>
                <button class="sz-btn ghost" id="szNewGroupBtn" type="button">Novo grupo</button>
                <button class="sz-modal-cancel" id="szPickCancel" type="button">Cancelar</button>
            </div>
        `;
        body.appendChild(modal);

        modal.querySelector('#szPickCancel')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#szNewGroupBtn')?.addEventListener('click', () => {
            modal.remove();
            openGroupPicker();
        });
        modal.querySelectorAll('.sz-pick').forEach(btn => {
            btn.addEventListener('click', async () => {
                const num = btn.dataset.num;
                if (!num || num === _state.myNumber) return;
                const chatId = chatIdFor(_state.myNumber, num);
                modal.remove();
                try {
                    await ctx.bridge?.firestore?.request?.('PATCH', `/sangzap_chats/${chatId}`, {
                        kind: '1:1',
                        members: [_state.myNumber, num].sort(),
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        lastMessage: '',
                        lastMessageAt: 0
                    });
                } catch(_) {}
                openChat(chatId, { chatId, kind: '1:1', number: num, title: shortNum(num) });
            });
        });
    }

    function openGroupPicker() {
        const contacts = ctx.contacts?.contacts || [];
        const sel = new Set();
        const body = _state.root?.querySelector('#szBody');
        if (!body) return;
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
                        const n = c?.number || c?.num;
                        if (!n || n === _state.myNumber) return '';
                        const name = c.name || shortNum(n);
                        const initial = (name || '?')[0].toUpperCase();
                        return `<button class="sz-item sz-gpick" data-num="${esc(n)}" type="button">
                            <div class="sz-avatar"><span class="sz-av-fallback">${esc(initial)}</span></div>
                            <div class="sz-item-body"><div class="sz-item-title">${esc(name)}</div></div>
                            <span class="sz-check">○</span>
                        </button>`;
                    }).join('')}
                </div>
                <div class="sz-modal-actions">
                    <button class="sz-btn" id="szGCancel" type="button">Cancelar</button>
                    <button class="sz-btn sz-btn-primary" id="szGCreate" type="button">Criar</button>
                </div>
            </div>
        `;
        body.appendChild(m);

        m.querySelectorAll('.sz-gpick').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = btn.dataset.num;
                if (sel.has(n)) sel.delete(n); else sel.add(n);
                btn.classList.toggle('selected', sel.has(n));
                const chk = btn.querySelector('.sz-check');
                if (chk) chk.textContent = sel.has(n) ? '●' : '○';
            });
        });
        m.querySelector('#szGCancel')?.addEventListener('click', () => m.remove());
        m.querySelector('#szGCreate')?.addEventListener('click', async () => {
            const name = (m.querySelector('#szGroupName')?.value || '').trim() || 'Grupo';
            if (sel.size < 2) { ctx.toast?.('Escolha 2+ contatos', 'err'); return; }
            try {
                if (!S?.groups?.create) throw new Error('sem groups');
                const chat = await S.groups.create(name, [...sel]);
                m.remove();
                ctx.toast?.('Grupo criado', 'ok');
                openChat(chat.id, { chatId: chat.id, kind: 'group', title: chat.name, members: chat.members });
            } catch(e) { ctx.toast?.('Falha ao criar grupo', 'err'); }
        });
    }

    // ═══ CHAT ═══
    function openChat(chatId, meta) {
        _state.activeChatId = chatId;
        _state.chatMeta = meta || {};
        historyPush();
        render();
    }
    function closeChat(fromUI) {
        if (fromUI !== false) { historyExit(); return; }
        try { _micCleanup?.(); } catch(_) {}
        _micCleanup = null;
        try { S?.chat?.close?.(); } catch(_) {}
        try { S?.audio?.clearCache?.(); } catch(_) {}
        _state.activeChatId = null;
        _state.chatMeta = null;
        render();
    }

    function renderChat(body) {
        const meta = _state.chatMeta || {};
        const isGroup = meta.kind === 'group';

        const host = document.createElement('div');
        host.className = 'sz-chat-host';
        body.appendChild(host);

        const chatMeta = {
            chatId: _state.activeChatId,
            kind: meta.kind || '1:1',
            number: meta.number || '',
            title: meta.title || '',
            members: meta.members || (meta.number ? [_state.myNumber, meta.number] : [_state.myNumber]),
            myName: _state.myName || '',
            nameFor: nameForNumber,
            onForward: (msg) => {
                ctx.toast?.('Encaminhar: escolha o destino', 'info');
            },
            onForwardMany: (list) => {
                ctx.toast?.(`${list.length} mensagens prontas`, 'info');
            },
            onOpenChat: (num) => {
                if (!num) return;
                const cid = chatIdFor(_state.myNumber, num);
                openChat(cid, { chatId: cid, kind: '1:1', number: num, title: shortNum(num) });
            }
        };

        if (S?.chat?.open) {
            try { S.chat.open(_state.activeChatId, _state.myNumber, chatMeta, host); }
            catch(e) {
                console.warn('[Sangzap] chat.open:', e);
                renderStub(body, 'Erro', 'Chat indisponível.');
                return;
            }
        } else {
            renderStub(body, 'Chat indisponível', 'Recarregue o telefone.');
            return;
        }

        setTimeout(bindMicGesture, 40);
    }

    // ═══ NAME RESOLVER ═══
    const _nameCache = new Map();
    function nameForNumber(num) {
        if (!num) return '';
        if (num === _state.myNumber) return _state.myName || 'Você';
        if (_nameCache.has(num)) return _nameCache.get(num);
        try {
            const entry = S?.roster?.getEntry?.(chatIdFor(_state.myNumber, num)) ||
                          S?.roster?.all?.()?.find(x => x.number === num);
            if (entry?.title) { _nameCache.set(num, entry.title); return entry.title; }
        } catch(_) {}
        const contacts = ctx.contacts?.contacts || [];
        const c = contacts.find(x => (x.number || x.num) === num);
        if (c?.name) { _nameCache.set(num, c.name); return c.name; }
        return shortNum(num);
    }

    // ═══ MIC GESTURE (integra audio v2) ═══
    function bindMicGesture() {
        const host = _state.root?.querySelector('.sz-chat-host');
        if (!host) return;

        let mic = host.querySelector('[data-act="mic"], .sz-mic-btn');
        if (!mic) {
            const bar = host.querySelector('.sz-input-bar');
            if (!bar) return;
            mic = document.createElement('button');
            mic.className = 'sz-mic-btn';
            mic.type = 'button';
            mic.setAttribute('aria-label', 'Gravar áudio');
            mic.innerHTML = '🎤';
            bar.insertBefore(mic, bar.querySelector('.sz-send-btn') || null);
        }

        if (!S?.audio?.startGesture) {
            mic.addEventListener('click', () => ctx.toast?.('Áudio indisponível', 'err'));
            return;
        }

        const rec = S.audio.startGesture({
            trigger: mic,
            onState: (state, m) => {
                mic.classList.toggle('rec', state === 'rec');
                mic.classList.toggle('cancel', state === 'cancel');
                mic.classList.toggle('locked', state === 'locked' || state === 'paused');
                mic.classList.toggle('paused', state === 'paused');
            },
            onDone: (payload) => {
                try { S.chat?.sendAudio?.(payload); } catch(_) {}
            },
            onCancel: () => {},
            onError: (msg) => ctx.toast?.(msg, 'err'),
            onLevel: () => {}
        });
        if (rec && typeof rec.destroy === 'function') {
            _micCleanup = () => { try { rec.destroy(); } catch(_) {} };
        } else {
            _micCleanup = () => {};
        }
    }

    // ═══ DEEP-LINK / PENDING DATA ═══
    function handleOpenWithData(data) {
        if (!data) return;
        if (data.kind === 'chat' && data.chatId) {
            openChat(data.chatId, data.meta || {
                chatId: data.chatId,
                kind: data.meta?.kind || (data.meta?.number ? '1:1' : 'group'),
                number: data.number || '',
                title: data.title || ''
            });
        } else if (data.kind === 'story' && data.author) {
            _state.activeTab = 'stories';
            _state.activeChatId = null;
            render();
        }
    }

    // ═══ APP REGISTRATION ═══
    ctx.apps.register({
        id: APP_ID,
        name: 'Sangzap',
        icon: ICON,
        accent: '#25d366',
        bg: 'linear-gradient(135deg, #25d366, #128c7e)',
        appBg: DEFAULT_APP_BG,
        order: 5,
        dock: true,
        get badge() { return _unreadTotal || 0; },

        onOpenWithData(data) {
            if (!_state.mounted) { _state.pendingOpen = data; return; }
            handleOpenWithData(data);
        },

        async mount(root, appCtx) {
            if (!root) { console.warn('[Sangzap] mount sem root'); return; }
            if (_state.mounted) { try { this.unmount(); } catch(_) {} }

            _state.root = root;
            _state.myNumber = appCtx?.myNumber || ctx.myNumber || '';
            _state.screenEl = appCtx?.screenEl || ctx.screenEl || null;
            _state.appBg = appCtx?.appBg || ctx.appBg || DEFAULT_APP_BG;
            _state.activeTab = 'chats';
            _state.activeChatId = null;
            _state.chatMeta = null;
            _state.searchQuery = '';
            _state.rosterChip = 'all';
            _state.mounted = true;
            _state.destroyed = false;
            _state.online = navigator.onLine !== false;
            _nameCache.clear();

            hidePhoneBar();
            applyAppBg();
            bindHistory();
            bindConnection();

            root.style.position = 'relative';
            root.style.height = '100%';
            root.style.minHeight = '0';
            root.style.overflow = 'hidden';
            root.style.display = 'block';

            root.innerHTML = `
                <div class="sz-app">
                    <div class="sz-conn-bar"></div>
                    <header class="sz-hdr">
                        <button class="sz-hdr-back" aria-label="Voltar">${ctx.I?.back || '←'}</button>
                        <div class="sz-hdr-title">SANGZAP</div>
                    </header>
                    <div class="sz-body">
                        <div class="sz-skeleton">
                            <div class="sz-skel-row"><div class="sz-skel-av"></div><div class="sz-skel-lines"><div class="sz-skel-line w70"></div><div class="sz-skel-line w40"></div></div></div>
                            <div class="sz-skel-row"><div class="sz-skel-av"></div><div class="sz-skel-lines"><div class="sz-skel-line w55"></div><div class="sz-skel-line w30"></div></div></div>
                            <div class="sz-skel-row"><div class="sz-skel-av"></div><div class="sz-skel-lines"><div class="sz-skel-line w80"></div><div class="sz-skel-line w45"></div></div></div>
                            <div class="sz-skel-row"><div class="sz-skel-av"></div><div class="sz-skel-lines"><div class="sz-skel-line w60"></div><div class="sz-skel-line w35"></div></div></div>
                        </div>
                    </div>
                </div>
            `;

            await loadModules();
            if (_state.destroyed) return;
            bindS();

            try {
                if (S?.settings?.get && _state.myNumber) {
                    const prof = await S.settings.get(_state.myNumber);
                    if (prof?.displayName) _state.myName = prof.displayName;
                    if (prof?.theme) document.documentElement.dataset.szTheme = prof.theme;
                }
            } catch(_) {}
            if (_state.destroyed) return;

            historyPush();
            render();

            if (_state.pendingOpen) {
                const p = _state.pendingOpen;
                _state.pendingOpen = null;
                handleOpenWithData(p);
            }
        },

        unmount() {
            _state.mounted = false;
            _state.destroyed = true;
            showPhoneBar();
            try { _micCleanup?.(); } catch(_) {}
            _micCleanup = null;
            try { S?.roster?.stop?.(); } catch(_) {}
            try { S?.chat?.close?.(); } catch(_) {}
            try { S?.stories?.stop?.(); } catch(_) {}
            try { S?.audio?.cancel?.(); } catch(_) {}
            try { S?.audio?.clearCache?.(); } catch(_) {}
            try {
                _state.root?.querySelectorAll('audio,video').forEach(el => {
                    try { el.pause(); } catch(_) {}
                });
            } catch(_) {}
            _state.root = null;
            _state.chatMeta = null;
            _state.activeChatId = null;
            _histPushed = false;
        }
    });
})();
