// modules/phone/apps/sangzap/shell.js
(function() {
    'use strict';

    // ═══ BOOT GUARD ═══
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Sangzap] phone ctx ausente'); return; }
    if (ctx.apps?.get?.('sangzap')) return;

    const APP_ID = 'sangzap';
    const APP_VERSION = '0.5.3';
    const DEFAULT_MODULE_BASE = 'https://cdn.jsdelivr.net/gh/zBeyond5/Liveblock@main/modules/phone';
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
    function loadScript(src, timeoutMs) {
        timeoutMs = timeoutMs || 8000;
        return new Promise((resolve) => {
            const s = document.createElement('script');
            let settled = false;
            const t = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.warn('[Sangzap] timeout', src);
                resolve(false);
            }, timeoutMs);
            const done = (ok) => {
                if (settled) return;
                settled = true;
                clearTimeout(t);
                if (!ok) console.warn('[Sangzap] falha ao carregar', src);
                resolve(ok);
            };
            s.src = src;
            s.async = false;    // preserva ordem de execução
            s.onload = () => done(true);
            s.onerror = () => done(false);
            document.head.appendChild(s);
        });
    }

    function loadModules() {
        if (_loadPromise) return _loadPromise;
        _loadPromise = (async () => {
            if (_moduleLoaded) return;

            // ═══ 1) common.js PRIMEIRO — os demais leem window._sangzapCtx ═══
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

            // ═══ 2) demais módulos em paralelo — S já existe ═══
            const rest = ['roster.js', 'chat.js', 'audio.js', 'groups.js', 'settings.js', 'stories.js'];
            const restResults = await Promise.all(rest.map(async (f) => {
                const url = `${BASE}/${f}?v=${APP_VERSION}`;
                const ok = await loadScript(url);
                return { file: f, url, ok };
            }));
            results.push(...restResults);

            // ═══ 3) verifica o que ficou registrado ═══
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

        // Painel de diagnóstico — só quando módulos críticos falharam
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

        // host vazio — chat.js v2 monta tudo dentro
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

        // usa mic existente se o chat tiver, senão injeta
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

            // skeleton inicial
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

            // perfil (nome + tema)
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

    // ═══ CSS ═══
    ctx.appendStyle(`
        :root { --sz-accent: #25d366; --sz-accent2: #128c7e; --sz-app-bg: ${DEFAULT_APP_BG}; }
        :root[data-sz-theme="roxo"] { --sz-accent: #a78bfa; --sz-accent2: #7c3aed; }
        :root[data-sz-theme="azul"] { --sz-accent: #38bdf8; --sz-accent2: #0284c7; }
        .ph-screen.sz-hide-bar .ph-app-bar { display: none !important; }

        .sz-app {
            position: absolute; inset: 0;
            display: flex; flex-direction: column;
            min-height: 0; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #e9ecf5;
            background: var(--sz-app-bg, #0e1621);
            transition: background .22s ease;
        }
        .sz-app.sz-settings-mode { background: #0b0f14; }
        .sz-app.sz-settings-mode .sz-hdr { background: rgba(255,255,255,.02); }

        /* Conn bar */
        .sz-conn-bar {
            display: none; padding: 6px 12px;
            background: #b45309; color: #fff;
            font-size: 10.5px; font-weight: 700;
            text-align: center; letter-spacing: .02em;
            animation: szFadeIn .2s ease;
            flex-shrink: 0;
        }
        .sz-conn-bar.on { display: block; }

        /* Header */
        .sz-hdr {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px;
            background: linear-gradient(180deg, rgba(255,255,255,.03), transparent);
            border-bottom: 1px solid rgba(255,255,255,.05);
            flex-shrink: 0;
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .sz-hdr-back, .sz-hdr-gear, .sz-hdr-call {
            width: 30px; height: 30px; flex-shrink: 0;
            border-radius: 9px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.12);
            color: #c7cad6; cursor: pointer; padding: 0;
            display: flex; align-items: center; justify-content: center;
            transition: all .18s cubic-bezier(.22,1,.36,1);
            font-size: 14px;
        }
        .sz-hdr-back svg { width: 13px; height: 13px; }
        .sz-hdr-back:hover, .sz-hdr-gear:hover, .sz-hdr-call:hover {
            background: rgba(37,211,102,.16); color: #86efac; border-color: rgba(37,211,102,.4);
            transform: translateY(-1px);
        }
        .sz-hdr-back:active, .sz-hdr-gear:active, .sz-hdr-call:active { transform: translateY(0) scale(.94); }
        .sz-hdr-title {
            flex: 1;
            font-size: 13px; font-weight: 800; letter-spacing: .1em;
            background: linear-gradient(100deg, var(--sz-accent), #22d3ee, var(--sz-accent));
            background-size: 220% auto;
            -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: szBlink 3.2s ease-in-out infinite;
            text-transform: uppercase;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sz-hdr-title-chat {
            font-size: 13.5px; letter-spacing: 0;
            text-transform: none;
            background: none; color: #e9ecf5;
            -webkit-text-fill-color: currentColor;
            animation: none;
        }

        .sz-tabs {
            display: grid; grid-template-columns: repeat(2, 1fr);
            border-bottom: 1px solid rgba(255,255,255,.05);
            background: rgba(0,0,0,.15);
            flex-shrink: 0;
        }
        .sz-tab {
            padding: 11px 4px; font-size: 11px; font-weight: 700;
            color: #8a90a8; background: transparent; border: none; cursor: pointer;
            font-family: inherit; position: relative;
            transition: color .18s, background .18s;
        }
        .sz-tab:hover { color: #d1d5db; background: rgba(255,255,255,.03); }
        .sz-tab.active { color: var(--sz-accent); }
        .sz-tab.active::after {
            content: ''; position: absolute; bottom: 0; left: 30%; right: 30%;
            height: 2px; background: linear-gradient(90deg, var(--sz-accent), #22d3ee);
            border-radius: 2px 2px 0 0;
            animation: szSlideIn .28s cubic-bezier(.22,1,.36,1);
        }

        .sz-body {
            flex: 1 1 auto; min-height: 0; overflow: hidden;
            display: flex; flex-direction: column; position: relative;
        }

        /* Skeleton */
        .sz-skeleton { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
        .sz-skel-row { display: flex; align-items: center; gap: 11px; padding: 4px 0; }
        .sz-skel-av {
            width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
            background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.09), rgba(255,255,255,.04));
            background-size: 200% 100%;
            animation: szSkel 1.4s ease-in-out infinite;
        }
        .sz-skel-lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .sz-skel-line {
            height: 10px; border-radius: 5px;
            background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.09), rgba(255,255,255,.04));
            background-size: 200% 100%;
            animation: szSkel 1.4s ease-in-out infinite;
        }
        .sz-skel-line.w70 { width: 70%; }
        .sz-skel-line.w55 { width: 55%; }
        .sz-skel-line.w80 { width: 80%; }
        .sz-skel-line.w60 { width: 60%; }
        .sz-skel-line.w40 { width: 40%; }
        .sz-skel-line.w30 { width: 30%; }
        .sz-skel-line.w45 { width: 45%; }
        .sz-skel-line.w35 { width: 35%; }

        /* Stub */
        .sz-stub {
            flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 8px; padding: 32px; text-align: center;
        }
        .sz-stub-icon { font-size: 38px; opacity: .35; margin-bottom: 6px; }
        .sz-stub-title { font-size: 15px; font-weight: 800; color: #e9ecf5; }
        .sz-stub-sub { font-size: 11px; color: #6b7280; line-height: 1.5; max-width: 240px; }

        /* Diagnóstico */
        .sz-diag {
            padding: 24px 16px;
            display: flex; flex-direction: column; gap: 10px;
            overflow-y: auto; flex: 1;
            font-size: 12px;
        }
        .sz-diag-icon { font-size: 42px; text-align: center; opacity: .5; }
        .sz-diag-title { font-size: 15px; font-weight: 800; color: #e9ecf5; text-align: center; }
        .sz-diag-sub { font-size: 11px; color: #8a90a8; text-align: center; }
        .sz-diag-base {
            display: block; padding: 8px 10px;
            background: rgba(0,0,0,.35);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 8px;
            font-family: ui-monospace, Menlo, monospace;
            font-size: 10px; color: #67e8f9;
            word-break: break-all;
        }
        .sz-diag-list {
            display: flex; flex-direction: column; gap: 4px;
            padding: 8px; border-radius: 10px;
            background: rgba(0,0,0,.22);
            border: 1px solid rgba(255,255,255,.06);
        }
        .sz-diag-row {
            display: flex; align-items: center; gap: 8px;
            padding: 5px 8px; border-radius: 6px;
            font-family: ui-monospace, Menlo, monospace;
            font-size: 10.5px;
        }
        .sz-diag-row.ok { color: #86efac; }
        .sz-diag-row.fail { color: #fca5b1; background: rgba(229,72,77,.08); }
        .sz-diag-ico { width: 12px; text-align: center; font-weight: 800; }
        .sz-diag-file { flex: 1; }
        .sz-diag-status { font-size: 9.5px; opacity: .8; }
        .sz-diag-hint {
            font-size: 10px; color: #8a90a8; line-height: 1.6;
            padding: 8px 10px; border-radius: 8px;
            background: rgba(37,211,102,.05);
            border: 1px solid rgba(37,211,102,.15);
        }
        .sz-diag-hint b { color: #86efac; }

        /* Roster */
        .sz-roster { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .sz-roster-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px; flex-shrink: 0; }
        .sz-search-wrap { flex: 1; min-width: 0; }
        .sz-search {
            width: 100%; padding: 9px 14px; border-radius: 20px;
            background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
            color: #e9ecf5; font-family: inherit; font-size: 11.5px; outline: none;
            box-sizing: border-box;
            transition: border-color .18s, background .18s, box-shadow .18s;
        }
        .sz-search::placeholder { color: #5c6280; }
        .sz-search:focus { border-color: rgba(37,211,102,.5); background: rgba(255,255,255,.07); box-shadow: 0 0 0 3px rgba(37,211,102,.12); }

        .sz-new-btn {
            width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            border: none; color: #fff; font-size: 18px; font-weight: 700;
            cursor: pointer; line-height: 1;
            box-shadow: 0 4px 12px rgba(37,211,102,.35);
            transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s;
        }
        .sz-new-btn:hover { transform: scale(1.06); box-shadow: 0 6px 16px rgba(37,211,102,.5); }
        .sz-new-btn:active { transform: scale(.94); }

        .sz-chips {
            display: flex; gap: 6px; padding: 0 12px 8px; flex-shrink: 0;
            overflow-x: auto; scrollbar-width: none;
        }
        .sz-chips::-webkit-scrollbar { display: none; }
        .sz-chip {
            flex-shrink: 0;
            padding: 6px 11px; border-radius: 14px;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.08);
            color: #b4bac8; font-family: inherit; font-size: 10.5px; font-weight: 700;
            cursor: pointer;
            display: flex; align-items: center; gap: 5px;
            transition: background .16s, border-color .16s, color .16s;
        }
        .sz-chip:hover { background: rgba(255,255,255,.07); }
        .sz-chip.on {
            background: rgba(37,211,102,.14);
            border-color: rgba(37,211,102,.4);
            color: var(--sz-accent);
        }
        .sz-chip-n {
            display: inline-block;
            min-width: 16px; height: 16px; padding: 0 5px;
            border-radius: 8px;
            background: rgba(255,255,255,.14); color: #e9ecf5;
            font-size: 9px; font-weight: 800; line-height: 16px; text-align: center;
        }
        .sz-chip.on .sz-chip-n { background: var(--sz-accent); color: #06280f; }

        .sz-roster-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 8px 12px; }
        .sz-roster-list::-webkit-scrollbar { width: 4px; }
        .sz-roster-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }
        .sz-roster-section-title {
            font-size: 9.5px; font-weight: 800; letter-spacing: .12em;
            text-transform: uppercase; color: #6b7280;
            padding: 10px 10px 6px;
        }

        .sz-item {
            display: flex; align-items: center; gap: 11px;
            width: 100%; padding: 10px;
            background: transparent; border: none; cursor: pointer;
            font-family: inherit; color: inherit; text-align: left;
            border-radius: 12px;
            transition: background .16s;
            -webkit-tap-highlight-color: transparent;
        }
        .sz-item:hover { background: rgba(255,255,255,.045); }
        .sz-item:active { background: rgba(255,255,255,.08); }

        .sz-avatar {
            position: relative;
            width: 44px; height: 44px; flex-shrink: 0;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            display: flex; align-items: center; justify-content: center;
            border: 1px solid rgba(255,255,255,.08);
            overflow: hidden;
        }
        .sz-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
        .sz-av-fallback { font-size: 17px; font-weight: 800; color: #fff; }
        .sz-online-dot {
            position: absolute; right: -2px; bottom: -2px;
            width: 12px; height: 12px; border-radius: 50%;
            background: #22c55e; border: 2px solid var(--sz-app-bg, #0e1621);
            box-shadow: 0 0 8px rgba(34,197,94,.7);
            animation: szPulse 2s ease-in-out infinite;
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
        .sz-item-typing { color: var(--sz-accent); font-style: italic; }
        .sz-item-badge {
            min-width: 18px; height: 18px; padding: 0 6px;
            border-radius: 9px; background: var(--sz-accent); color: #06280f;
            font-size: 10px; font-weight: 800; line-height: 18px; text-align: center;
            flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(37,211,102,.5);
        }
        .sz-pin, .sz-mute { font-size: 10px; margin-right: 4px; opacity: .75; }

        .sz-empty { padding: 32px 16px; text-align: center; font-size: 11.5px; color: #6b7280; line-height: 1.6; }
        .sz-empty b { color: var(--sz-accent); }

        /* Menus / modais */
        .sz-ctx-menu {
            position: absolute; z-index: 40;
            background: #1a222d; border: 1px solid rgba(255,255,255,.12);
            border-radius: 12px; padding: 5px;
            box-shadow: 0 12px 32px rgba(0,0,0,.7);
            min-width: 150px;
            animation: szFadeIn .16s ease;
        }
        .sz-ctx-menu.sz-ctx-center { top: 50%; left: 50%; transform: translate(-50%, -50%); }
        .sz-ctx-item {
            display: block; width: 100%;
            padding: 10px 12px;
            background: transparent; border: none;
            color: #e9ecf5; font-family: inherit;
            font-size: 11.5px; text-align: left; cursor: pointer;
            border-radius: 8px;
            transition: background .14s;
        }
        .sz-ctx-item:hover { background: rgba(255,255,255,.06); }
        .sz-ctx-item.danger { color: #fca5b1; }

        .sz-modal {
            position: absolute; inset: 0; z-index: 30;
            background: rgba(0,0,0,.65);
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
            display: flex; align-items: flex-end; justify-content: center;
            animation: szFadeIn .2s ease;
        }
        .sz-modal-card {
            width: 100%; max-height: 85%;
            background: linear-gradient(180deg, #131a24, #0b1218);
            border-top-left-radius: 18px; border-top-right-radius: 18px;
            border-top: 1px solid rgba(255,255,255,.08);
            display: flex; flex-direction: column;
            padding: 14px 0 0;
            animation: szSlideUp .3s cubic-bezier(.22,1,.36,1);
        }
        .sz-modal-title {
            font-size: 13px; font-weight: 800; color: #e9ecf5;
            padding: 0 16px 10px;
            border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .sz-modal-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
        .sz-modal-list { flex: 1; overflow-y: auto; padding: 8px; }
        .sz-modal-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 14px 14px; }
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

        .sz-gpick .sz-check { font-size: 16px; color: #8a90a8; margin-left: 8px; }
        .sz-gpick.selected { background: rgba(37,211,102,.08); }
        .sz-gpick.selected .sz-check { color: var(--sz-accent); }

        /* ═══ CHAT (chat.js v2 monta tudo em .sz-chat-host) ═══ */
        .sz-chat-host { flex: 1; min-height: 0; display: flex; flex-direction: column; }

        .sz-chat { display: flex; flex-direction: column; flex: 1; min-height: 0; position: relative; }
        .sz-thread {
            flex: 1 1 auto; min-height: 0; overflow-y: auto;
            padding: 12px 12px 4px;
            display: flex; flex-direction: column; gap: 4px;
            background:
                radial-gradient(circle at 20% 10%, rgba(37,211,102,.04), transparent 45%),
                radial-gradient(circle at 80% 90%, rgba(34,211,238,.04), transparent 45%);
        }
        .sz-thread::-webkit-scrollbar { width: 4px; }
        .sz-thread::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }

        .sz-row { display: flex; justify-content: flex-start; margin-top: 6px; }
        .sz-row.me { justify-content: flex-end; }
        .sz-row.tight { margin-top: 2px; }
        .sz-row.head { margin-top: 10px; }
        .sz-row.head.tight { margin-top: 2px; }
        .sz-row.flash .sz-bubble { animation: szFlash 1.2s ease; }
        .sz-row.selected .sz-bubble { box-shadow: 0 0 0 2px var(--sz-accent); }

        .sz-bubble {
            position: relative;
            max-width: 78%;
            padding: 7px 10px 5px;
            border-radius: 12px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.05);
            animation: szFadeIn .18s ease;
            word-break: break-word;
        }
        .sz-row.me .sz-bubble {
            background: linear-gradient(135deg, rgba(37,211,102,.24), rgba(18,140,126,.24));
            border-color: rgba(37,211,102,.3);
        }
        .sz-row.head .sz-bubble { border-top-left-radius: 12px; border-top-right-radius: 12px; }
        .sz-row.tail .sz-bubble { border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
        .sz-row:not(.head) .sz-bubble { border-top-left-radius: 4px; border-top-right-radius: 4px; }
        .sz-row:not(.tail) .sz-bubble { border-bottom-left-radius: 4px; border-bottom-right-radius: 4px; }
        .sz-row.pending .sz-bubble { opacity: .7; }
        .sz-row.failed .sz-bubble { border-color: rgba(229,72,77,.5); }

        .sz-author { font-size: 10px; font-weight: 800; color: var(--sz-accent); margin-bottom: 3px; }
        .sz-body { min-width: 0; }
        .sz-text { font-size: 12.5px; color: #e9ecf5; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
        .sz-deleted { font-size: 11px; font-style: italic; color: #8a90a8; }
        .sz-forwarded { font-size: 9.5px; font-style: italic; color: #86efac; margin-bottom: 3px; display: flex; align-items: center; gap: 4px; }
        .sz-caption { font-size: 12px; color: #e9ecf5; margin-top: 6px; line-height: 1.4; }

        .sz-meta {
            display: flex; align-items: center; justify-content: flex-end; gap: 4px;
            font-size: 9px; color: #8a90a8; margin-top: 2px;
            font-variant-numeric: tabular-nums;
        }
        .sz-row.me .sz-meta { color: rgba(134,239,172,.7); }
        .sz-tick { color: var(--sz-accent); font-weight: 700; }
        .sz-tick.delivered { color: #86efac; }
        .sz-tick.read { color: #67e8f9; }
        .sz-tick.failed { color: #fca5b1; }
        .sz-tick.pending { opacity: .75; }
        .sz-edited { font-size: 8px; opacity: .7; }
        .sz-retry {
            display: block; margin-top: 6px;
            background: rgba(229,72,77,.14); border: 1px solid rgba(229,72,77,.4);
            color: #fca5b1; border-radius: 6px;
            padding: 4px 8px; font-size: 10px; font-weight: 700;
            cursor: pointer; font-family: inherit;
        }
        .sz-retry:hover { background: rgba(229,72,77,.22); }

        .sz-date-sep {
            align-self: center; margin: 12px auto 6px;
            font-size: 9.5px; color: #8a90a8;
            padding: 3px 10px; border-radius: 10px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.06);
            font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
        }

        .sz-quote {
            display: block;
            width: 100%;
            text-align: left;
            padding: 5px 8px; border-left: 2px solid var(--sz-accent);
            background: rgba(0,0,0,.24); border-radius: 6px;
            margin-bottom: 5px;
            border: none; border-left: 2px solid var(--sz-accent);
            font-family: inherit; cursor: pointer;
        }
        .sz-quote-author { font-size: 9.5px; font-weight: 800; color: var(--sz-accent); }
        .sz-quote-body {
            font-size: 10px; color: #b4bac8; margin-top: 1px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .sz-msg-system, .sz-system {
            align-self: center; margin: 6px auto;
            font-size: 9.5px; color: #8a90a8;
            padding: 3px 10px; border-radius: 10px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.06);
        }

        .sz-reactions { display: flex; gap: 3px; margin-top: 4px; flex-wrap: wrap; }
        .sz-reactions .sz-react {
            flex: none;
            padding: 2px 7px; border-radius: 12px;
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.12);
            cursor: pointer; font-size: 12px;
            display: flex; align-items: center; gap: 3px;
            transition: background .14s, transform .14s;
        }
        .sz-reactions .sz-react.mine { background: rgba(37,211,102,.2); border-color: rgba(37,211,102,.5); }
        .sz-reactions .sz-react:hover { transform: scale(1.05); }
        .sz-react-n { font-size: 9px; color: #e9ecf5; font-weight: 700; }

        .sz-react-picker {
            position: fixed; z-index: 100;
            display: flex; gap: 4px;
            background: #1a222d; border: 1px solid rgba(255,255,255,.12);
            border-radius: 22px; padding: 6px;
            box-shadow: 0 12px 32px rgba(0,0,0,.7);
            animation: szSlideUp .2s cubic-bezier(.22,1,.36,1);
        }
        .sz-react-picker button {
            width: 34px; height: 34px; border-radius: 50%;
            background: transparent; border: none; cursor: pointer;
            font-size: 18px; line-height: 1;
            transition: background .14s, transform .14s;
        }
        .sz-react-picker button:hover { background: rgba(255,255,255,.08); transform: scale(1.15); }

        .sz-typing {
            font-size: 9.5px; color: var(--sz-accent);
            padding: 0 14px 3px; min-height: 0;
            font-style: italic; flex-shrink: 0;
            opacity: 0; transition: opacity .2s;
        }
        .sz-typing.on { min-height: 15px; opacity: 1; }

        .sz-scroll-btn {
            position: absolute; right: 14px; bottom: 90px;
            width: 34px; height: 34px; border-radius: 50%;
            background: #1a222d; border: 1px solid rgba(255,255,255,.14);
            color: #e9ecf5; font-size: 16px;
            cursor: pointer; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 6px 20px rgba(0,0,0,.5);
            opacity: 0; pointer-events: none;
            transition: opacity .2s, transform .2s;
            transform: translateY(6px);
            z-index: 5;
        }
        .sz-scroll-btn.on { opacity: 1; pointer-events: auto; transform: translateY(0); }

        .sz-composer-bar {
            display: none;
            align-items: center; gap: 10px;
            padding: 8px 12px;
            background: rgba(0,0,0,.4);
            border-top: 1px solid rgba(255,255,255,.05);
            flex-shrink: 0;
        }
        .sz-composer-bar.on { display: flex; }
        .sz-bar-ico { font-size: 16px; color: var(--sz-accent); }
        .sz-bar-text { flex: 1; min-width: 0; }
        .sz-bar-title { font-size: 10.5px; font-weight: 800; color: var(--sz-accent); }
        .sz-bar-body {
            font-size: 10.5px; color: #8a90a8; margin-top: 1px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sz-bar-x {
            background: transparent; border: none; color: #8a90a8;
            font-size: 14px; cursor: pointer; padding: 4px 6px;
            font-family: inherit;
        }
        .sz-bar-x:hover { color: #e9ecf5; }

        .sz-sel-bar {
            display: none;
            align-items: center; gap: 6px;
            padding: 8px 12px;
            background: rgba(37,211,102,.14);
            border-top: 1px solid rgba(37,211,102,.3);
            flex-shrink: 0;
        }
        .sz-sel-bar.on { display: flex; }
        .sz-sel-bar button {
            background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12);
            color: #e9ecf5; font-size: 14px; cursor: pointer;
            width: 32px; height: 32px; border-radius: 9px;
            display: flex; align-items: center; justify-content: center;
            font-family: inherit;
        }
        .sz-sel-bar button:disabled { opacity: .4; cursor: default; }
        .sz-sel-bar button:hover:not(:disabled) { background: rgba(255,255,255,.1); }
        .sz-sel-count { flex: 1; font-size: 12px; font-weight: 800; color: #e9ecf5; }
        .sz-sel-spacer { flex: 1; }

        .sz-input-bar {
            display: flex; align-items: flex-end; gap: 6px;
            padding: 10px;
            background: rgba(0,0,0,.3);
            border-top: 1px solid rgba(255,255,255,.06);
            flex-shrink: 0;
        }
        .sz-attach-btn, .sz-mic-btn {
            width: 34px; height: 34px; flex-shrink: 0;
            border-radius: 50%; border: 1px solid rgba(255,255,255,.12);
            background: rgba(255,255,255,.05); color: #c7cad6;
            font-size: 18px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            line-height: 1; font-family: inherit;
            transition: background .16s, color .16s, transform .16s;
        }
        .sz-attach-btn:hover, .sz-mic-btn:hover { background: rgba(37,211,102,.14); color: #86efac; }
        .sz-mic-btn.rec { background: #e5484d; border-color: #e5484d; color: #fff; animation: szPulse 1.2s ease-in-out infinite; }
        .sz-mic-btn.cancel { background: #6b7280; border-color: #6b7280; color: #fff; }
        .sz-mic-btn.locked { background: var(--sz-accent); border-color: var(--sz-accent); color: #06280f; }
        .sz-mic-btn.paused { background: #b45309; border-color: #b45309; color: #fff; }

        .sz-input {
            flex: 1; min-width: 0;
            padding: 9px 14px;
            border-radius: 20px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            color: #e9ecf5; font-family: inherit; font-size: 12.5px; outline: none;
            resize: none; max-height: 120px;
            line-height: 1.4;
            transition: border-color .16s, background .16s, box-shadow .16s;
            overflow-y: auto;
        }
        .sz-input::placeholder { color: #5c6280; }
        .sz-input:focus { border-color: rgba(37,211,102,.5); background: rgba(255,255,255,.08); box-shadow: 0 0 0 3px rgba(37,211,102,.12); }

        .sz-send-btn {
            width: 36px; height: 36px; flex-shrink: 0;
            border-radius: 50%; border: none;
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            color: #fff; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 12px rgba(37,211,102,.35);
            transition: transform .16s, box-shadow .16s;
        }
        .sz-send-btn:hover { transform: scale(1.06); box-shadow: 0 6px 16px rgba(37,211,102,.5); }
        .sz-send-btn:active { transform: scale(.92); }

        .sz-emoji-picker { display: none; }
        .sz-emoji-picker.on { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; background: rgba(0,0,0,.35); border-top: 1px solid rgba(255,255,255,.06); }
        .sz-emoji-picker button {
            width: 30px; height: 30px; border-radius: 8px;
            background: transparent; border: none; cursor: pointer;
            font-size: 16px; line-height: 1;
        }
        .sz-emoji-picker button:hover { background: rgba(255,255,255,.08); }

        .sz-mention-pop {
            position: absolute; left: 10px; right: 10px; bottom: 100%;
            max-height: 180px; overflow-y: auto;
            background: #1a222d; border: 1px solid rgba(255,255,255,.12);
            border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.7);
            display: none; z-index: 6;
        }
        .sz-mention-pop.on { display: block; }
        .sz-mention-pop button {
            display: block; width: 100%;
            padding: 9px 12px;
            background: transparent; border: none;
            color: #e9ecf5; font-family: inherit;
            font-size: 12px; text-align: left; cursor: pointer;
            border-radius: 8px;
        }
        .sz-mention-pop button:hover { background: rgba(255,255,255,.06); }

        /* Áudio */
        .sz-audio { display: flex; align-items: center; gap: 8px; padding: 2px; }
        .sz-audio-container { min-width: 180px; }
        .sz-audio-play {
            width: 32px; height: 32px; flex-shrink: 0;
            border-radius: 50%; border: none;
            background: rgba(255,255,255,.14); color: #e9ecf5;
            cursor: pointer; line-height: 1;
            display: flex; align-items: center; justify-content: center;
        }
        .sz-audio-play svg { width: 14px; height: 14px; }
        .sz-row.me .sz-audio-play { background: rgba(37,211,102,.4); color: #06280f; }
        .sz-audio-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .sz-audio-wave {
            position: relative; display: flex; align-items: center; gap: 1px;
            height: 24px; cursor: pointer;
        }
        .sz-bar {
            flex: 1; min-width: 2px;
            background: rgba(255,255,255,.28);
            border-radius: 1px;
            transition: background .12s;
        }
        .sz-bar.played { background: #86efac; }
        .sz-row.me .sz-bar { background: rgba(255,255,255,.35); }
        .sz-row.me .sz-bar.played { background: #fff; }
        .sz-audio-cursor {
            position: absolute; top: -2px; bottom: -2px;
            width: 2px; background: var(--sz-accent);
            border-radius: 1px; pointer-events: none;
            transition: left .08s linear;
        }
        .sz-audio-meta {
            display: flex; align-items: center; justify-content: space-between; gap: 6px;
        }
        .sz-audio-time { font-size: 9px; color: #8a90a8; font-variant-numeric: tabular-nums; }
        .sz-audio-speed {
            background: transparent; border: none; color: #8a90a8;
            font-size: 9px; font-weight: 800; cursor: pointer;
            padding: 0 4px; font-family: inherit;
        }
        .sz-audio-speed:hover { color: var(--sz-accent); }

        /* Mídia */
        .sz-image-wrap { cursor: pointer; border-radius: 10px; overflow: hidden; }
        .sz-image-wrap img { display: block; max-width: 100%; max-height: 300px; border-radius: 10px; }
        .sz-video-wrap video { display: block; max-width: 100%; max-height: 300px; border-radius: 10px; background: #000; }

        .sz-doc {
            display: flex; align-items: center; gap: 10px;
            width: 100%; padding: 8px;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 10px;
            cursor: pointer; font-family: inherit;
            text-align: left;
        }
        .sz-doc:hover { background: rgba(255,255,255,.08); }
        .sz-doc-ico { font-size: 22px; flex-shrink: 0; }
        .sz-doc-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .sz-doc-name { font-size: 11.5px; font-weight: 700; color: #e9ecf5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sz-doc-size { font-size: 9.5px; color: #8a90a8; }

        .sz-loc {
            display: block; width: 100%;
            padding: 0; border: none; background: transparent;
            border-radius: 10px; overflow: hidden;
            cursor: pointer; font-family: inherit; text-align: left;
        }
        .sz-loc-img { display: block; width: 100%; height: 130px; background: rgba(255,255,255,.04); overflow: hidden; }
        .sz-loc-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .sz-loc-place { font-size: 11.5px; font-weight: 700; color: #e9ecf5; margin-top: 6px; }
        .sz-loc-coords { font-size: 9.5px; color: #8a90a8; display: block; margin-top: 2px; }

        .sz-contact {
            display: flex; align-items: center; gap: 10px;
            width: 100%; padding: 8px;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 10px;
            cursor: pointer; font-family: inherit;
            text-align: left;
        }
        .sz-contact:hover { background: rgba(255,255,255,.08); }
        .sz-contact-av {
            width: 36px; height: 36px; border-radius: 50%;
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; font-weight: 800; color: #fff;
            flex-shrink: 0;
        }
        .sz-contact-info { flex: 1; min-width: 0; }
        .sz-contact-name { font-size: 11.5px; font-weight: 700; color: #e9ecf5; }
        .sz-contact-num { font-size: 10px; color: #8a90a8; margin-top: 2px; }

        /* Attach sheet */
        .sz-attach-sheet {
            position: absolute; left: 0; right: 0; bottom: 0; z-index: 25;
            background: linear-gradient(180deg, #131a24, #0b1218);
            border-top-left-radius: 18px; border-top-right-radius: 18px;
            border-top: 1px solid rgba(255,255,255,.08);
            padding: 14px 14px 18px;
            display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
            animation: szSlideUp .24s cubic-bezier(.22,1,.36,1);
        }
        .sz-attach-sheet button {
            padding: 14px 12px; border-radius: 12px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            color: #e9ecf5; font-family: inherit;
            font-size: 11.5px; font-weight: 700;
            cursor: pointer;
            display: flex; align-items: center; gap: 8px;
            transition: background .14s;
        }
        .sz-attach-sheet button:hover { background: rgba(37,211,102,.14); }
        .sz-attach-sheet button span { font-size: 18px; }
        .sz-attach-cancel { grid-column: 1 / -1; justify-content: center; }

        /* Media preview */
        .sz-media-preview {
            position: absolute; inset: 0; z-index: 26;
            background: rgba(0,0,0,.85);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            display: flex; flex-direction: column;
            animation: szFadeIn .2s ease;
        }
        .sz-media-preview-top { padding: 10px 12px; display: flex; justify-content: flex-end; }
        .sz-media-close {
            width: 34px; height: 34px; border-radius: 50%;
            background: rgba(255,255,255,.1); border: none; color: #fff;
            font-size: 16px; cursor: pointer; font-family: inherit;
        }
        .sz-media-preview-body {
            flex: 1; min-height: 0;
            display: flex; align-items: center; justify-content: center;
            padding: 8px;
        }
        .sz-media-preview-body img,
        .sz-media-preview-body video {
            max-width: 100%; max-height: 100%; border-radius: 10px;
            object-fit: contain;
        }
        .sz-doc-big {
            font-size: 48px; text-align: center; color: #e9ecf5;
            display: flex; flex-direction: column; align-items: center; gap: 10px;
        }
        .sz-doc-big div { font-size: 14px; font-weight: 700; }
        .sz-media-preview-bottom { display: flex; gap: 8px; padding: 12px; background: rgba(0,0,0,.5); }
        .sz-media-caption {
            flex: 1;
            padding: 10px 14px; border-radius: 20px;
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.12);
            color: #e9ecf5; font-family: inherit; font-size: 12px; outline: none;
        }
        .sz-media-caption::placeholder { color: #6b7280; }
        .sz-media-send {
            padding: 10px 20px; border-radius: 20px;
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            border: none; color: #fff;
            font-family: inherit; font-size: 12px; font-weight: 800;
            cursor: pointer;
            box-shadow: 0 6px 16px rgba(37,211,102,.4);
        }

        /* Lightbox */
        .sz-lightbox {
            position: fixed; inset: 0; z-index: 200;
            background: rgba(0,0,0,.92);
            display: flex; align-items: center; justify-content: center;
            animation: szFadeIn .2s ease;
            cursor: zoom-out;
        }
        .sz-lightbox img {
            max-width: 100%; max-height: 100%; object-fit: contain;
            transition: transform .3s cubic-bezier(.22,1,.36,1);
        }
        .sz-lightbox.zoomed img { transform: scale(1.8); cursor: zoom-in; }
        .sz-lightbox video { max-width: 100%; max-height: 100%; }
        .sz-lb-close, .sz-lb-save {
            position: absolute; top: 16px;
            width: 38px; height: 38px; border-radius: 50%;
            background: rgba(255,255,255,.14); border: none; color: #fff;
            font-size: 16px; cursor: pointer;
            font-family: inherit;
        }
        .sz-lb-close { right: 16px; }
        .sz-lb-save { right: 62px; }

        /* Pick contact */
        .sz-pick-contact {
            position: absolute; inset: 0; z-index: 27;
            background: rgba(0,0,0,.65);
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
            display: flex; align-items: flex-end; justify-content: center;
        }
        .sz-pick-contact-card {
            width: 100%; max-height: 80%;
            background: linear-gradient(180deg, #131a24, #0b1218);
            border-top-left-radius: 18px; border-top-right-radius: 18px;
            display: flex; flex-direction: column;
            padding: 14px 0 0;
        }
        .sz-pick-contact-title {
            font-size: 13px; font-weight: 800; color: #e9ecf5;
            padding: 0 16px 10px;
            border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .sz-pick-contact-list { flex: 1; overflow-y: auto; padding: 8px; }

        /* ═══ SETTINGS ═══ */
        .sz-settings { padding: 16px 14px 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex: 1; min-height: 0; }
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
            transition: border-color .16s, background .16s, box-shadow .16s;
        }
        .sz-textarea { min-height: 60px; resize: vertical; font-family: inherit; }
        .sz-field-hint { font-size: 9px; color: #6b7280; }
        .sz-profile-photo-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .sz-btn {
            padding: 10px 14px; border-radius: 10px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.12);
            color: #e9ecf5; font-family: inherit;
            font-size: 11.5px; font-weight: 700; cursor: pointer;
            transition: all .18s cubic-bezier(.22,1,.36,1);
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
        .sz-stories-tab { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .sz-stories-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 14px 8px; flex-shrink: 0;
        }
        .sz-stories-title { font-size: 14px; font-weight: 800; color: #e9ecf5; }
        .sz-stories-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 8px 16px; }

        .sz-ring {
            display: flex; align-items: center; gap: 11px;
            width: 100%; padding: 10px;
            background: transparent; border: none; cursor: pointer;
            font-family: inherit; color: inherit; text-align: left;
            border-radius: 12px;
            transition: background .14s;
        }
        .sz-ring:hover { background: rgba(255,255,255,.04); }
        .sz-ring-av {
            position: relative;
            width: 52px; height: 52px; flex-shrink: 0;
            border-radius: 50%; padding: 2px;
            background: linear-gradient(135deg, var(--sz-accent), #22d3ee);
            display: flex; align-items: center; justify-content: center;
        }
        .sz-ring.seen .sz-ring-av { background: rgba(255,255,255,.14); }
        .sz-ring.mine .sz-ring-av { background: linear-gradient(135deg, #a78bfa, #22d3ee); }
        .sz-ring-av img,
        .sz-ring-av .sz-av-fallback {
            width: 100%; height: 100%; border-radius: 50%;
            background: #0e1621;
            display: flex; align-items: center; justify-content: center;
            font-size: 17px; font-weight: 800; color: #fff;
            object-fit: cover;
        }
        .sz-ring-av .sz-av-fallback { border: 2px solid #0e1621; }
        .sz-ring-info { flex: 1; min-width: 0; }
        .sz-ring-name { font-size: 12.5px; font-weight: 700; color: #e9ecf5; }
        .sz-ring-sub { font-size: 10px; color: #8a90a8; margin-top: 2px; }
        .sz-ring.unseen .sz-ring-sub { color: var(--sz-accent); font-weight: 700; }

        /* Viewer */
        .sz-viewer {
            position: absolute; inset: 0; z-index: 100;
            background: rgba(0,0,0,.96);
            display: flex; align-items: stretch; justify-content: center;
            animation: szFadeIn .22s ease;
            transition: transform .22s cubic-bezier(.22,1,.36,1), opacity .22s;
            touch-action: none;
        }
        .sz-viewer-inner {
            position: relative; width: 100%; height: 100%;
            display: flex; flex-direction: column;
        }
        .sz-viewer-bars {
            display: flex; gap: 3px; padding: 8px 10px 4px; flex-shrink: 0;
        }
        .sz-viewer-bar {
            flex: 1; height: 3px; border-radius: 2px;
            background: rgba(255,255,255,.28);
            overflow: hidden;
        }
        .sz-viewer-bar-fill {
            display: block; width: 100%; height: 100%;
            background: #fff;
            transform-origin: left center;
        }
        .sz-viewer-head {
            display: flex; align-items: center; gap: 10px;
            padding: 6px 12px 10px; flex-shrink: 0;
        }
        .sz-viewer-head-info { flex: 1; min-width: 0; }
        .sz-viewer-head-name { font-size: 12px; font-weight: 800; color: #fff; }
        .sz-viewer-head-time { font-size: 10px; color: rgba(255,255,255,.7); margin-top: 1px; }
        .sz-viewer-viewers, .sz-viewer-del, .sz-viewer-close {
            background: rgba(255,255,255,.14); border: none;
            color: #fff; font-family: inherit; cursor: pointer;
            height: 30px; padding: 0 10px; border-radius: 15px;
            font-size: 11px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
            transition: background .14s;
        }
        .sz-viewer-close { width: 30px; padding: 0; font-size: 15px; }
        .sz-viewer-viewers:hover, .sz-viewer-del:hover, .sz-viewer-close:hover { background: rgba(255,255,255,.24); }

        .sz-viewer-body {
            flex: 1; min-height: 0;
            display: flex; align-items: center; justify-content: center;
            position: relative;
            padding: 8px 12px;
        }
        .sz-viewer-img {
            max-width: 100%; max-height: 100%;
            object-fit: contain;
            border-radius: 12px;
        }
        .sz-viewer-caption {
            position: absolute; bottom: 16px; left: 20px; right: 20px;
            text-align: center; color: #fff;
            font-size: 13px; line-height: 1.5;
            background: rgba(0,0,0,.45);
            padding: 8px 14px; border-radius: 10px;
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }

        .sz-viewer-reactions {
            display: flex; gap: 6px; justify-content: center;
            padding: 6px 12px 8px; flex-shrink: 0;
        }
        .sz-viewer-react {
            width: 40px; height: 40px; border-radius: 50%;
            background: rgba(255,255,255,.14); border: none;
            font-size: 20px; cursor: pointer; line-height: 1;
            transition: background .14s, transform .14s;
        }
        .sz-viewer-react:hover { background: rgba(255,255,255,.24); transform: scale(1.1); }
        .sz-viewer-react.mine {
            background: rgba(37,211,102,.4);
            box-shadow: 0 0 0 2px rgba(37,211,102,.6);
        }

        .sz-viewer-reply {
            display: flex; gap: 8px; padding: 8px 12px 14px;
            background: rgba(0,0,0,.5);
            flex-shrink: 0;
        }
        .sz-viewer-reply-input {
            flex: 1; padding: 10px 16px;
            border-radius: 22px;
            background: rgba(255,255,255,.14);
            border: 1px solid rgba(255,255,255,.2);
            color: #fff; font-family: inherit; font-size: 12.5px; outline: none;
        }
        .sz-viewer-reply-input::placeholder { color: rgba(255,255,255,.6); }
        .sz-viewer-reply-send {
            width: 40px; height: 40px; border-radius: 50%;
            background: linear-gradient(135deg, var(--sz-accent), var(--sz-accent2));
            border: none; color: #fff; font-size: 16px;
            cursor: pointer; font-family: inherit;
        }

        .sz-viewer-tap {
            position: absolute; top: 60px; bottom: 130px;
            width: 30%; z-index: 2; cursor: pointer;
        }
        .sz-viewer-tap.left { left: 0; }
        .sz-viewer-tap.right { right: 0; }

        /* Viewers modal */
        .sz-viewers-modal {
            position: absolute; inset: 0; z-index: 110;
            background: rgba(0,0,0,.6);
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
            display: flex; align-items: flex-end; justify-content: center;
            animation: szFadeIn .2s ease;
        }
        .sz-viewers-card {
            width: 100%; max-height: 70%;
            background: #131a24;
            border-top-left-radius: 18px; border-top-right-radius: 18px;
            padding: 14px 0 0;
            display: flex; flex-direction: column;
        }
        .sz-viewers-title {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 18px 10px;
            border-bottom: 1px solid rgba(255,255,255,.06);
            font-size: 13px; font-weight: 800; color: #e9ecf5;
        }
        .sz-viewers-count {
            background: rgba(37,211,102,.2); color: var(--sz-accent);
            font-size: 10px; font-weight: 800;
            padding: 2px 8px; border-radius: 8px;
        }
        .sz-viewers-list { flex: 1; overflow-y: auto; padding: 8px; }
        .sz-viewers-item {
            display: flex; align-items: center; gap: 10px;
            padding: 8px 10px; border-radius: 10px;
        }
        .sz-viewers-item:hover { background: rgba(255,255,255,.04); }
        .sz-viewers-name { font-size: 12px; font-weight: 700; color: #e9ecf5; }

        /* Animações */
        @keyframes szSlideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes szFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes szSlideIn { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes szBlink   { 0%,100% { background-position: 0% center; } 50% { background-position: 100% center; } }
        @keyframes szPulse   { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
        @keyframes szSkel    { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes szFlash   { 0%,100% { background-color: transparent; } 40% { background-color: rgba(37,211,102,.24); } }

        @media (prefers-reduced-motion: reduce) {
            .sz-hdr-title, .sz-chat-mic.rec, .sz-online-dot, .sz-mic-btn.rec, .sz-skel-av, .sz-skel-line { animation: none !important; }
            .sz-item, .sz-tab, .sz-hdr-back, .sz-hdr-gear, .sz-hdr-call, .sz-new-btn, .sz-send-btn, .sz-attach-btn, .sz-mic-btn, .sz-btn, .sz-ctx-item, .sz-chip { transition-duration: .01ms !important; }
        }
    `);
})();
