// modules/phone/shell.js
// Núcleo: cria _phoneCtx, valida bridge, define P.config + P.state,
// carrega os 4 módulos internos (style, core, home, apps) e depois os externos.
// Não monta DOM, não desenha nada, não tem lógica de home nem de PIN.
(function() {
    'use strict';
    const UID = '_phone';
    if (window[UID]) return;

    // CTX PRIMEIRO — sobrevive a qualquer guard
    const ctx = window._phoneCtx = window._phoneCtx || {};
    ctx.phase    = 'idle';
    ctx.myNumber = ctx.myNumber || null;
    ctx.contacts = ctx.contacts || {};
    ctx.calls    = ctx.calls    || {};
    ctx.notes    = ctx.notes    || {};

    const P = ctx._phone = ctx._phone || {};

    // GUARDS
    const bridge = window._hubBridge;
    if (!bridge || !bridge.rtdb) { console.warn('[Phone] _hubBridge.rtdb ausente.'); return; }
    if (!bridge.firestore || !bridge.firestore.configured || !bridge.firestore.configured()) {
        console.warn('[Phone] Firestore off.'); return;
    }

    // CONFIG (imutável — leitura por todos os módulos via P.config)
    P.config = Object.freeze({
        ANDROID_VERSION: '14',
        PHONE_VERSION:   '1.4.2',
        MIN_TUCK_X:      260,
        MIN_TUCK_Y:     -140,
        FRAME_HALF_H:    285,
        LS_MINIMIZED:    'sanghub_phone_minimized',
        LS_PIN:          'sanghub_phone_pin',
        LS_LAYOUT:       'sanghub_phone_layout',
        LS_HOME_CFG:     'sanghub_phone_home_cfg',
        MODULES_BASE:    'https://raw.githubusercontent.com/zBeyond5/Liveblock/main/modules/phone',
        MAX_DOCK_APPS:   4,
        GRID_COLS:       4,
        GRID_ROWS:       4,
        PAGE_SIZE:       16,
        DEFAULT_APP_BG:       'linear-gradient(180deg, #16181c 0%, #0d0f12 100%)',
        DEFAULT_APP_BG_SOLID: '#0f1115',
        // Caminhos relativos a MODULES_BASE
        URLS: Object.freeze({
            style:    '/style.js',
            core:     '/core.js',
            home:     '/home.js',
            apps:     '/apps.js',
            contacts: '/contacts.js',
            calls:    '/calls.js',
            notes:    '/notes.js',
            config:   '/apps/config.js',
            sangzap:  '/apps/sangzap/shell.js'
        })
    });
    const C = P.config;

    ctx.moduleBase = C.MODULES_BASE;
    ctx.deviceId   = bridge.deviceId || '';
    ctx.bridge     = bridge;

    // STATE (mutável — compartilhado entre home/apps/core/shell)
    // Regra: qualquer campo lido por 2+ módulos mora aqui.
    // Campos internos de um módulo (ex: _layout, _homeCfg) ficam no próprio arquivo.
    P.state = {
        view:         'lock',      // 'lock' | 'home' | 'app' | 'call'
        activeAppId:  null,        // id do app atualmente montado (ou null)
        chamadasTab:  'contatos',  // aba ativa dentro do app Chamadas
        pinSet:       '',          // PIN string ('' = sem PIN)
        minimized:    false,       // frame minimizado
        inCallView:   false,       // view de chamada ativa
        dying:        false,       // kill() em andamento — bloqueia novas ações
        // Preenchidos por core.js quando o frame é construído:
        frameEl:      null,
        screenEl:     null,
        stageEl:      null,
        contentEl:    null
    };

    // Restauração mínima do localStorage (layout/homeCfg ficam em home.js)
    try { P.state.minimized = localStorage.getItem(C.LS_MINIMIZED) === '1'; } catch(_) {}
    try { P.state.pinSet    = localStorage.getItem(C.LS_PIN) || ''; }        catch(_) {}

    // MODULE LOADER
    P.loadModule = async function(name, url) {
        try {
            const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const code = await res.text();
            const s = document.createElement('script');
            s.textContent = code;
            document.documentElement.appendChild(s);
            s.remove();
            return true;
        } catch(e) {
            console.warn('[Phone] Falha ao carregar ' + name + ':', e);
            return false;
        }
    };

    // BOOT
    async function _boot() {
        const base = C.MODULES_BASE;

        // 1) style — só define a string CSS, não depende de nada
        await P.loadModule('style', base + C.URLS.style);

        // 2) core — infra + frame. Se falhar, aborta (sem core não há frame)
        await P.loadModule('core', base + C.URLS.core);
        if (!P.core) { console.error('[Phone] core.js falhou — abortando boot.'); return; }

        // 3) home + apps — paralelo. Ambos dependem só de core.
        //    Referências cruzadas (P.home ↔ P.apps) são resolvidas em runtime,
        //    nunca no top-level do módulo — por isso paralelo é seguro.
        await Promise.all([
            P.loadModule('home', base + C.URLS.home),
            P.loadModule('apps', base + C.URLS.apps)
        ]);
        if (!P.home) console.warn('[Phone] home.js falhou — telefone em modo degradado.');
        if (!P.apps) console.warn('[Phone] apps.js falhou — telefone em modo degradado.');

        // 4) Constrói infra
        P.core.ensureHost();
        P.core.injectBaseStyle();
        P.core.ensureFrame();

        // 5) View inicial
        if (P.home) P.home.renderLock();
        else        P.core.showView('lock');

        // 6) Módulos externos — paralelo, independentes entre si
        await Promise.all([
            P.loadModule('contacts', base + C.URLS.contacts),
            P.loadModule('calls',    base + C.URLS.calls),
            P.loadModule('notes',    base + C.URLS.notes),
            P.loadModule('config',   base + C.URLS.config),
            P.loadModule('sangzap',  base + C.URLS.sangzap)
        ]);

        // 7) Reações cruzadas entre módulos
        ctx.apps.onChange(() => {
            if (P.state.view === 'home') P.home?.renderHome();
            if (P.state.view === 'app' && P.state.activeAppId === 'calls') P.apps?.updateMyNumberUI();
        });

        try {
            ctx.notes?.onUnreadChange?.(() => P.apps?.refreshRecadosBadge?.());
            P.apps?.refreshRecadosBadge?.();
        } catch(_) {}

        if (ctx.contacts.ensureMyNumber) {
            ctx.contacts.ensureMyNumber().then(() => P.apps?.updateMyNumberUI?.());
        }

        ctx.notes.startNotesPoll?.();
        P.apps?.startPhasePoll?.();
    }

    // TOGGLE / KILL
    function toggle() {
        ctx.getAudioCtx?.();
        const frame = P.state.frameEl;
        if (frame && frame.isConnected && !frame.classList.contains('hidden')) {
            frame.classList.add('hidden');
            return;
        }
        P.core?.ensureFrame?.();
        P.state.frameEl?.classList.remove('hidden');
        P.core?.tickClock?.();
        if (!ctx.myNumber) ctx.contacts.ensureMyNumber?.();

        const s = P.state;
        if (s.inCallView)                       P.core.showView('call');
        else if (s.view === 'app' && s.activeAppId) P.core.showView('app');
        else if (s.view === 'home')             P.home?.renderHome?.();
        else                                    P.home?.renderLock?.();
    }

    function kill() {
        const s = P.state;
        if (s.dying) return;
        s.dying = true;

        try { ctx.calls.cleanup?.(); }   catch(_) {}
        try { ctx.notes.cancelNote?.(); } catch(_) {}
        try { ctx.notes.stopPoll?.(); }  catch(_) {}
        try { document.removeEventListener('keydown', _onPhysicalKey, true); } catch(_) {}
        P.home?.teardown?.();
        P.apps?.teardown?.();
        P.core?.teardown?.();
        try { delete window[UID]; } catch(_) {}
    }

    // TECLADO FÍSICO — captura e despacha; não conhece lógica de PIN
    function _onPhysicalKey(e) {
        const s = P.state;
        if (s.dying) return;
        const frame = s.frameEl;
        if (!frame || frame.classList.contains('hidden')) return;
        if (s.minimized) return;

        const shadow = P.core?.getShadow?.();
        const ae = shadow?.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        const outAe = document.activeElement;
        const host  = P.core?.getHost?.();
        if (outAe && outAe !== host &&
            (outAe.tagName === 'INPUT' || outAe.tagName === 'TEXTAREA' || outAe.isContentEditable)) return;

        const k = e.key;
        let sel = null, scope = null;

        if (s.view === 'lock' && s.pinSet) {
            scope = frame.querySelector('#phLockPad');
        } else if (s.view === 'app' && s.activeAppId === 'calls' && s.chamadasTab === 'discar') {
            scope = frame.querySelector('#phContent');
        } else return;

        if (!scope) return;

        if (k.length === 1 && k >= '0' && k <= '9')      sel = `.ph-key[data-digit="${k}"]`;
        else if (k === 'Backspace')                       sel = `.ph-key[data-util="back"]`;
        else if (k === 'Enter' || k === 'Escape') {
            if (s.view === 'lock')   sel = `.ph-key[data-util="ok"]`;
            else if (k === 'Enter')  sel = `#phCall`;
            else                     sel = `.ph-key[data-util="clear"]`;
        } else return;

        const btn = scope.querySelector(sel);
        if (!btn || btn.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        btn.click();
    }
    document.addEventListener('keydown', _onPhysicalKey, true);

    // LISTENERS GLOBAIS — registrados só depois do boot para não chamar P.apps cedo demais
    function _wireGlobalListeners() {
        window.addEventListener('sang:phone-incoming', (e) => {
            if (!P.apps) return;  // ainda não bootou — descarta
            try { ctx.calls.onIncoming?.(e?.detail); } catch(_) {}
        });
        window.addEventListener('sang:player-updated', () => {
            if (!P.apps) return;
            if (ctx.myNumber) ctx.contacts.refreshMyDirectory?.();
        });
    }
    _wireGlobalListeners();

    // EXPORT
    window[UID] = {
        toggle,
        kill,
        _lock:      () => P.home?.lock?.(),
        _forceLock: () => P.home?.lock?.(),
        get ctx() { return ctx; }
    };

    _boot();
})();
