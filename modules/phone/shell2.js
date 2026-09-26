// modules/phone/shell.js
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

    (function installFirestoreGate() {
        const fs = bridge.firestore;
        if (!fs || fs.__gated) return;
        fs.__gated = true;
        const origRequest = fs.request.bind(fs);

        const MAX_CONCURRENT = 3;
        const MIN_GAP_MS     = 120;
        const BACKOFF_STEPS  = [1500, 3000, 6000, 12000];

        let inFlight      = 0;
        let lastDispatch  = 0;
        let backoffUntil  = 0;
        let backoffIdx    = 0;
        const readQ  = [];
        const writeQ = [];

        const isWrite = (m) => m === 'POST' || m === 'PATCH' || m === 'DELETE' || m === 'PUT';

        function pump() {
            if (inFlight >= MAX_CONCURRENT) return;
            if (!readQ.length && !writeQ.length) return;
            const now = Date.now();
            if (now < backoffUntil) {
                setTimeout(pump, backoffUntil - now + 50);
                return;
            }
            const since = now - lastDispatch;
            if (since < MIN_GAP_MS) {
                setTimeout(pump, MIN_GAP_MS - since);
                return;
            }
            const item = writeQ.shift() || readQ.shift();
            lastDispatch = Date.now();
            inFlight++;
            origRequest(item.method, item.path, item.body, item.q)
                .then((r) => { backoffIdx = 0; item.resolve(r); })
                .catch((e) => {
                    const msg = String(e?.message || e);
                    if (/\b429\b/.test(msg) && (item.attempt || 0) < 2) {
                        item.attempt = (item.attempt || 0) + 1;
                        backoffUntil = Date.now() + BACKOFF_STEPS[Math.min(backoffIdx, BACKOFF_STEPS.length - 1)];
                        backoffIdx = Math.min(backoffIdx + 1, BACKOFF_STEPS.length - 1);
                        (isWrite(item.method) ? writeQ : readQ).unshift(item);
                    } else {
                        item.reject(e);
                    }
                })
                .finally(() => { inFlight--; setTimeout(pump, 10); });
        }

        fs.request = function(method, path, body, q) {
            return new Promise((resolve, reject) => {
                const item = { method, path, body, q, resolve, reject, attempt: 0 };
                (isWrite(method) ? writeQ : readQ).push(item);
                pump();
            });
        };
    })();

    // CONFIG — imutável; preservado entre mounts para consistência de referências.
    // Se precisares de campo mutável, NÃO edite P.config; usa P.state.
    if (!P.config) {
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
            DEFAULT_APP_BG_SSOLID: '#0f1115',
            DEFAULT_APP_BG_SOLID:  '#0f1115',
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
    }
    const C = P.config;

    ctx.moduleBase = C.MODULES_BASE;
    ctx.deviceId   = bridge.deviceId || '';
    ctx.bridge     = bridge;

    // STATE — referência preservada entre mounts (home/apps/core capturam
    // `const S = P.state` no topo; reassinar P.state quebraria essas closures).
    // bootToken NÃO é resetado aqui — só incrementado em _boot() e kill().
    if (!P.state) P.state = {};
    Object.assign(P.state, {
        view:         'lock',
        activeAppId:  null,
        chamadasTab:  'contatos',
        inCallView:   false,
        prevView:     'home',
        dying:        false,
        frameEl:      null, screenEl: null, stageEl: null, contentEl: null
    });
    if (typeof P.state.bootToken !== 'number') P.state.bootToken = 0;
    P.state.minimized = true;
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
        const myToken = ++P.state.bootToken;
        // alive() cobre os dois casos de invalidação:
        //  - kill() chamado durante o boot (dying=true, token++)
        //  - novo shell montou por cima (token++ no top-level do novo _boot)
        const alive = () => P.state.bootToken === myToken && !P.state.dying;

        const base = C.MODULES_BASE;

        // 1) style — só define a string CSS, não depende de nada
        await P.loadModule('style', base + C.URLS.style);
        if (!alive()) return;

        // 2) core — infra + frame. Se falhar, aborta (sem core não há frame)
        await P.loadModule('core', base + C.URLS.core);
        if (!alive()) return;
        if (!P.core) { console.error('[Phone] core.js falhou — abortando boot.'); return; }

        // 3) home + apps — paralelo. Dependências cruzadas só em runtime.
        await Promise.all([
            P.loadModule('home', base + C.URLS.home),
            P.loadModule('apps', base + C.URLS.apps)
        ]);
        if (!alive()) return;
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
        if (!alive()) return;

        // 7) Reações cruzadas entre módulos
        ctx.apps.onChange(() => {
            if (!alive()) return;
            if (P.state.view === 'home') P.home?.renderHome?.();
            if (P.state.view === 'app' && P.state.activeAppId === 'calls') P.apps?.updateMyNumberUI?.();
        });

        try {
            ctx.notes?.onUnreadChange?.(() => {
                if (alive()) P.apps?.refreshRecadosBadge?.();
            });
            P.apps?.refreshRecadosBadge?.();
        } catch(_) {}

        if (ctx.contacts.ensureMyNumber) {
            ctx.contacts.ensureMyNumber().then(() => {
                if (alive()) P.apps?.updateMyNumberUI?.();
            });
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
        if (s.inCallView)                           P.core?.showView?.('call');
        else if (s.view === 'app' && s.activeAppId) P.core?.showView?.('app');
        else if (s.view === 'home')                 P.home?.renderHome?.();
        else                                        P.home?.renderLock?.();
    }

    function kill() {
        const s = P.state;
        if (s.dying) return;
        s.dying = true;
        s.bootToken++;   // invalida _boot() em execução mesmo se o próximo mount resetar dying

        try { ctx.calls.cleanup?.(); }    catch(_) {}
        try { ctx.notes.cancelNote?.(); } catch(_) {}
        try { ctx.notes.stopPoll?.(); }   catch(_) {}

        // Listeners globais — mesmas referências usadas nos addEventListener abaixo
        try { document.removeEventListener('keydown', _onPhysicalKey, true); } catch(_) {}
        try { window.removeEventListener('sang:phone-incoming', _onPhoneIncoming); } catch(_) {}
        try { window.removeEventListener('sang:player-updated', _onPlayerUpdated); } catch(_) {}

        P.home?.teardown?.();
        P.apps?.teardown?.();
        P.core?.teardown?.();

        // Limpa listeners internos do registry; preserva _registry (módulos externos registram ali)
        if (ctx.apps && Array.isArray(ctx.apps._listeners)) ctx.apps._listeners.length = 0;

        // Deleta namespaces para forçar re-execução dos IIFEs no próximo mount.
        // Os guards `if (P.<ns>) return` em cada arquivo dependem disso.
        delete P.home;
        delete P.apps;
        delete P.core;
        delete ctx._phoneCss;

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

    // LISTENERS GLOBAIS — nomeados para permitir remoção em kill()
    function _onPhoneIncoming(e) {
        if (P.state.dying) return;
        if (!P.apps) return;  // boot incompleto — descarta
        try { ctx.calls.onIncoming?.(e?.detail); } catch(_) {}
    }
    function _onPlayerUpdated() {
        if (P.state.dying) return;
        if (!P.apps) return;
        if (ctx.myNumber) ctx.contacts.refreshMyDirectory?.();
    }

    document.addEventListener('keydown', _onPhysicalKey, true);
    window.addEventListener('sang:phone-incoming', _onPhoneIncoming);
    window.addEventListener('sang:player-updated', _onPlayerUpdated);

    // EXPORT
    window[UID] = {
        toggle,
        kill,
        _lock:      () => P.home?.lock?.(),
        _forceLock: () => P.home?.lock?.(),
        get ctx() { return ctx; }
    };

    _boot().catch(e => console.error('[Phone] boot falhou:', e));
})();
