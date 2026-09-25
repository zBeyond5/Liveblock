// ==UserScript==
// @name         Sang Hub
// @namespace    http://tampermonkey.net/
// @version      1.2.1
// @description  Gerenciador de módulos
// @author       Sang
// @match        *://*.habblive.in/bigclient*
// @match        *://*.habblet.city/bigclient*
// @match        *://*.habblive.in/me*
// @match        *://*.habblet.city/me*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/menu/hub2.js
// @downloadURL  https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/menu/hub2.js
// ==/UserScript==

(function() {
    'use strict';

    // ═══ CONTEXTO ═══
    const IS_CORE = /^https?:\/\/(?:[^/]*\.)?(?:habblive\.in|habblet\.city)\/(?:bigclient|me)/i.test(location.href);

    // ═══ CAPTURA /me ═══
    if (IS_CORE && /\/me(\/|$|\?)/.test(location.pathname)) {
        function buildHeadshotUrl(walkgifUrl) {
            try {
                const u = new URL(walkgifUrl);
                u.pathname = u.pathname.replace('/walkgif', '/avatarimage');
                u.searchParams.set('headonly', '1');
                u.searchParams.set('size', 'm');
                u.searchParams.set('direction', '2');
                u.searchParams.set('head_direction', '3');
                return u.toString();
            } catch(e) { return walkgifUrl; }
        }
        function captureFromMePage() {
            const nameEl = document.querySelector('#new-personal-info > div:nth-child(2) > a > div > img');
            const mottoEl = document.querySelector('#motto-container > div > p > input[type=text]');
            const name = nameEl ? nameEl.getAttribute('alt') || '' : '';
            const mission = mottoEl ? mottoEl.value.trim() : '';
            const rawAvatarUrl = nameEl ? nameEl.getAttribute('src') || '' : '';
            const avatarUrl = rawAvatarUrl ? buildHeadshotUrl(rawAvatarUrl) : '';
            if (!name) return false;
            try {
                localStorage.setItem('sanghub_player_cache', JSON.stringify({ name, mission, avatarUrl, capturedAt: Date.now() }));
            } catch(e) {}
            return true;
        }
        let attempts = 0;
        const captureInterval = setInterval(() => {
            attempts++;
            const ok = captureFromMePage();
            if (ok || attempts >= 20) clearInterval(captureInterval);
        }, 500);
        return;
    }

    // ═══ GATE ═══
    const _blk = ['fa58cccd9de60c7a30726b2c23670a5747d4b5e684a935fae5954548873f1031'];
    const _blkExtraKey = 'sanghub_blk_extra';
    const _ovr = 'sanghub_p2';
    const DEVICE_ID_KEY = 'sanghub_device_id';

    let _secretOn = true;
    let _blocked = false;
    let _fp = '';
    let _deviceId = '';

    function _stableUA() {
        return navigator.userAgent.replace(/\d+\.\d+\.\d+\.\d+/g, '');
    }
    async function _calc() {
        const parts = [
            _stableUA(),
            navigator.language.split('-')[0],
            navigator.hardwareConcurrency,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            navigator.platform
        ].join('|');
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    function _getDeviceId() {
        try {
            let id = localStorage.getItem(DEVICE_ID_KEY);
            if (!id) {
                id = crypto.randomUUID ? crypto.randomUUID() :
                    Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
                localStorage.setItem(DEVICE_ID_KEY, id);
            }
            return id;
        } catch(e) { return 'unknown-' + Date.now(); }
    }
    function _getBlkExtra() {
        try { const a = JSON.parse(localStorage.getItem(_blkExtraKey) || '[]'); return Array.isArray(a) ? a : []; }
        catch(e) { return []; }
    }
    function _setBlkExtra(arr) {
        try { localStorage.setItem(_blkExtraKey, JSON.stringify(arr)); } catch(e) {}
    }
    function _fullBlk() { return _blk.concat(_getBlkExtra()); }

    async function _gate() {
        try {
            _fp = await _calc();
            if (!_deviceId) _deviceId = _getDeviceId();
            const o = localStorage.getItem(_ovr);
            if (o === '0') _secretOn = false;
            else if (o === '1') _secretOn = true;
            else _secretOn = !_fullBlk().includes(_fp);
            _blocked = await _verificarBloqueioRemoto();
        } catch(e) {
            _secretOn = true;
            _blocked = false;
        }
    }

    // ═══ LOG ═══
    const HLOG  = (...a) => console.log('🔶 [Hub]', ...a);
    const HWARN = (...a) => console.warn('🔶 [Hub]', ...a);
    const HERR  = (...a) => console.error('🔶 [Hub]', ...a);

    // ═══ FIRESTORE ═══
    const FIREBASE_PROJECT_ID = 'sanghub-ecf46';
    const FIREBASE_API_KEY    = 'AIzaSyCffa6tw3mSzTJtq_u2AVz9w1PRnTAGJyI';
    const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const FS_AUTH_KEY = 'sanghub_fs_auth';
    const HEARTBEAT_MS = 2 * 60 * 1000;
    const BLOCK_POLL_MS = 10 * 1000;

    function fsConfigured() {
        return FIREBASE_PROJECT_ID !== 'SEU_PROJECT_ID' && FIREBASE_API_KEY !== 'SUA_WEB_API_KEY';
    }
    function fsValue(v) {
        if (v === null || v === undefined) return { nullValue: null };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        return { stringValue: String(v) };
    }
    function fsParseDoc(doc) {
        const out = {};
        const fields = doc?.fields || {};
        for (const k in fields) {
            const v = fields[k];
            const t = Object.keys(v)[0];
            out[k] = t === 'integerValue' ? parseInt(v[t], 10) : v[t];
        }
        return out;
    }

    let _fsAuth = null;
    function _fsLoadAuth() {
        try { return JSON.parse(localStorage.getItem(FS_AUTH_KEY) || 'null'); } catch(e) { return null; }
    }
    function _fsSaveAuth(a) {
        try { localStorage.setItem(FS_AUTH_KEY, JSON.stringify(a)); } catch(e) {}
    }
    async function _fsSignUp() {
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnSecureToken: true })
        });
        if (!res.ok) throw new Error('auth HTTP ' + res.status);
        const d = await res.json();
        return { idToken: d.idToken, refreshToken: d.refreshToken, expiresAt: Date.now() + (Number(d.expiresIn) * 1000) - 60000 };
    }
    async function _fsRefresh(refreshToken) {
        const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
        });
        if (!res.ok) throw new Error('refresh HTTP ' + res.status);
        const d = await res.json();
        return { idToken: d.access_token, refreshToken: d.refresh_token, expiresAt: Date.now() + (Number(d.expires_in) * 1000) - 60000 };
    }
    async function _fsGetToken() {
        _fsAuth = _fsAuth || _fsLoadAuth();
        if (_fsAuth && _fsAuth.expiresAt > Date.now()) return _fsAuth.idToken;
        try {
            _fsAuth = (_fsAuth && _fsAuth.refreshToken) ? await _fsRefresh(_fsAuth.refreshToken) : await _fsSignUp();
        } catch(e) {
            _fsAuth = await _fsSignUp();
        }
        _fsSaveAuth(_fsAuth);
        return _fsAuth.idToken;
    }
    async function fsRequest(method, path, body, extraQuery) {
        if (!fsConfigured()) throw new Error('Firestore não configurado');
        const token = await _fsGetToken();
        const url = FS_BASE + path + (extraQuery ? '?' + extraQuery : '');
        const res = await fetch(url, {
            method,
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) throw new Error('FS HTTP ' + res.status + ' (' + path + ')');
        if (res.status === 204) return null;
        return res.json();
    }
    async function _verificarBloqueioRemoto() {
    if (!fsConfigured() || !_deviceId) return false;
    try {
        const doc = await fsRequest('GET', '/sessions/' + _deviceId);
        const s = fsParseDoc(doc);
        if (s.blocked !== true) return false;
        if (s.blockedUntil && Date.now() > s.blockedUntil) {
            // expirou — limpa e considera livre
            try {
                await fsRequest('PATCH', '/sessions/' + _deviceId, {
                    fields: { blocked: fsValue(false), blockedUntil: fsValue(0) }
                }, 'updateMask.fieldPaths=blocked&updateMask.fieldPaths=blockedUntil');
            } catch(e) {}
            return false;
        }
        return true;
    } catch(e) {
        if (/404/.test(String(e.message || ''))) return false;
        return false;
    }
}

    let _heartbeatTimer = null;
    const SESSION_HEARTBEAT_FIELDS = ['name', 'mission', 'hubVersion', 'lastSeen', 'ua'];

    async function _criarOuAtualizarSessao() {
        if (!fsConfigured() || !_deviceId) return;
        const player = loadPlayerCache() || {};
        const now = Date.now();
        const mask = SESSION_HEARTBEAT_FIELDS.map(f => 'updateMask.fieldPaths=' + f).join('&');
        try {
            await fsRequest('PATCH', '/sessions/' + _deviceId, {
                fields: {
                    name:         fsValue(player.name || ''),
                    mission:      fsValue(player.mission || ''),
                    hubVersion:   fsValue(HUB_VERSION),
                    lastSeen:     fsValue(now),
                    ua:           fsValue(navigator.userAgent.slice(0, 120)),
                    sessionStart: fsValue(now),
                    blocked:      fsValue(false),
                    fingerprint:  fsValue(_fp || '')
                }
            }, mask);
        } catch(e) { HWARN('Sessão inicial falhou:', e); }
    }
    async function _enviarHeartbeat() {
        if (!fsConfigured() || !_deviceId) return;
        const player = loadPlayerCache() || {};
        const mask = SESSION_HEARTBEAT_FIELDS.map(f => 'updateMask.fieldPaths=' + f).join('&');
        try {
            await fsRequest('PATCH', '/sessions/' + _deviceId, {
                fields: {
                    name:       fsValue(player.name || ''),
                    mission:    fsValue(player.mission || ''),
                    hubVersion: fsValue(HUB_VERSION),
                    lastSeen:   fsValue(Date.now()),
                    ua:         fsValue(navigator.userAgent.slice(0, 120))
                }
            }, mask);
        } catch(e) { HWARN('Heartbeat falhou:', e); }
    }
    function _iniciarHeartbeat() {
        if (!fsConfigured() || _heartbeatTimer) return;
        _criarOuAtualizarSessao();
        _heartbeatTimer = setInterval(_enviarHeartbeat, HEARTBEAT_MS);
    }

    // ═══ BLOQUEIO — UI ═══
    let _blockStyleInjected = false;
    function _ensureBlockStyle() {
        if (_blockStyleInjected) return;
        _blockStyleInjected = true;
        const st = document.createElement('style');
        st.setAttribute('data-hub-block', '1');
        st.textContent = `
            @keyframes _hbFadeIn{from{opacity:0}to{opacity:1}}
            @keyframes _hbPopIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
            @keyframes _hbSlideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
        `;
        document.head.appendChild(st);
    }

    let _blockOverlayEl = null;
    function _mostrarBloqueioOverlay() {
        if (_blockOverlayEl) return;
        _ensureBlockStyle();
        const el = document.createElement('div');
        el.id = '_hubBlockOverlay';
        el.setAttribute('data-hub-block', '1');
        el.setAttribute('data-sang-ui', '');
        el.style.cssText = `
            position: fixed; inset: 0; z-index: 2147483646;
            display: flex; align-items: center; justify-content: center;
            background:
                radial-gradient(circle at 50% 35%, rgba(251,113,133,0.10), transparent 55%),
                radial-gradient(circle at 20% 80%, rgba(167,139,250,0.06), transparent 50%),
                rgba(0,0,0,0.72);
            backdrop-filter: blur(10px);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            animation: _hbFadeIn .3s ease;
        `;
        el.innerHTML = `
            <div style="max-width: 380px; padding: 30px 26px; text-align: center;
                border-radius: 18px; border: 1px solid rgba(251,113,133,0.28);
                background: linear-gradient(175deg, rgba(22,16,26,0.96), rgba(10,8,14,0.98));
                box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 80px rgba(251,113,133,0.12);
                animation: _hbPopIn .35s cubic-bezier(0.16,1,0.3,1);">
                <div style="width: 54px; height: 54px; margin: 0 auto 16px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 15px; background: rgba(251,113,133,0.12);
                    border: 1px solid rgba(251,113,133,0.35);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        <line x1="9.5" y1="9.5" x2="14.5" y2="14.5"/>
                        <line x1="14.5" y1="9.5" x2="9.5" y2="14.5"/>
                    </svg>
                </div>
                <div style="font-size: 16px; font-weight: 800; color: #fff; letter-spacing: .02em; margin-bottom: 6px;">
                    Dispositivo bloqueado
                </div>
                <div style="font-size: 11.5px; color: #9ca3af; line-height: 1.55; margin-bottom: 18px;">
                    Sua sessão foi bloqueada pelo administrador.<br>O acesso ao hub foi encerrado.
                </div>
                <button id="_hubBlockClose" style="cursor: pointer; font-family: inherit;
                    padding: 9px 22px; border-radius: 9px; font-size: 11px; font-weight: 700;
                    background: rgba(251,113,133,0.12); border: 1px solid rgba(251,113,133,0.35);
                    color: #fca5b1; letter-spacing: .04em; transition: background .15s;">
                    Fechar
                </button>
            </div>
        `;
        document.body.appendChild(el);
        _blockOverlayEl = el;
        el.querySelector('#_hubBlockClose').addEventListener('click', () => {
            el.style.transition = 'opacity .2s';
            el.style.opacity = '0';
            setTimeout(() => { el.remove(); _blockOverlayEl = null; }, 200);
        });
    }

    function _mostrarBloqueioToast() {
        _ensureBlockStyle();
        const el = document.createElement('div');
        el.id = '_hubBlockToast';
        el.setAttribute('data-hub-block', '1');
        el.setAttribute('data-sang-ui', '');
        el.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 2147483646;
            display: flex; align-items: center; gap: 11px;
            padding: 12px 16px; border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(175deg, rgba(22,16,26,0.96), rgba(10,8,14,0.98));
            border: 1px solid rgba(251,113,133,0.32);
            box-shadow: 0 12px 32px rgba(0,0,0,0.6), 0 0 40px rgba(251,113,133,0.1);
            backdrop-filter: blur(12px);
            animation: _hbSlideIn .35s cubic-bezier(0.16,1,0.3,1);
            max-width: 300px;
        `;
        el.innerHTML = `
            <span style="flex-shrink: 0; width: 30px; height: 30px;
                display: flex; align-items: center; justify-content: center;
                border-radius: 9px; background: rgba(251,113,133,0.12);
                border: 1px solid rgba(251,113,133,0.32);">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
            </span>
            <div style="min-width: 0;">
                <div style="font-size: 11.5px; font-weight: 800; color: #fff; letter-spacing: .02em;">
                    Você está bloqueado
                </div>
                <div style="font-size: 9.5px; color: #9ca3af; margin-top: 2px;">
                    O acesso ao hub foi desativado.
                </div>
            </div>
        `;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.transition = 'opacity .3s, transform .3s';
            el.style.opacity = '0';
            el.style.transform = 'translateX(20px)';
            setTimeout(() => el.remove(), 300);
        }, 8000);
    }

    // ═══ AUTODESTRUIÇÃO ═══
    function _autodestruir() {
        HLOG('💥 Autodestruindo hub');
        try { window._admin?.kill?.(); } catch(e) {}
        try { window._hubUI?.kill?.(); } catch(e) {}
        // Heartbeat continua rodando — admin precisa ver a sessão online
        if (!_heartbeatTimer && fsConfigured() && _deviceId) {
            _enviarHeartbeat();
            _heartbeatTimer = setInterval(_enviarHeartbeat, HEARTBEAT_MS);
        }
    }

    // ═══ BLOCK WATCHER ═══
    let _blockWatcherId = null;
    function _iniciarBlockWatcher() {
        if (_blockWatcherId) return;
        _blockWatcherId = setInterval(async () => {
            try {
                const antesB = _blocked;
                const antesS = _secretOn;
                await _gate();
                if (antesB !== _blocked) {
                    if (_blocked) {
                        HLOG('🚫 Bloqueio em runtime detectado');
                        _autodestruir();
                        _mostrarBloqueioOverlay();
                    } else {
                        HLOG('✅ Desbloqueado — recarregando');
                        location.reload();
                    }
                    return;
                }
                if (antesS !== _secretOn) {
                    HLOG('🔐 Módulos secret mudaram — refresh');
                    try { refreshManifest(true); } catch(e) {}
                }
            } catch(e) { /* silencioso */ }
        }, BLOCK_POLL_MS);
    }

    // ═══ ADMIN LOADER ═══
    const ADMIN_MODULE = {
        id: 'admin',
        name: 'Admin',
        instanceKey: '_admin',
        url: 'https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/menu/admin.js'
    };
    async function _carregarAdmin() {
        if (window._admin) return;
        try { await loadModule(ADMIN_MODULE); }
        catch(e) { HERR('Falha admin:', e); }
    }
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            if (_blocked) return;
            if (window._admin?.toggle) window._admin.toggle();
            else _carregarAdmin().then(() => window._admin?.toggle?.());
        }
    });

    // ═══ CONSTANTES ═══
    const HUB_VERSION = "1.2.1";
    const HUB_UPDATE_URL = "https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/menu/hub2.js";
    const MANIFEST_URL = "https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/menu/manifest.json";
    const UPDATE_INTERVAL_MS = 3 * 60 * 1000;
    const MANIFEST_CACHE_MS = 2 * 60 * 1000;
    const FETCH_TIMEOUT_MS = 5000;
    const FETCH_RETRIES = 2;
    const SHORTCUT_KEY = 'h';
    const SHORTCUT_LABEL = 'Alt+Shift+H';
    const GIF_PLAY_MS = 2000;
    const PLAYTIME_KEY = 'sanghub_playtime_total_ms';
    const PLAYTIME_FLUSH_MS = 60 * 1000;
    const CLOCK_TICK_MS = 1000;
    const PLAYER_CACHE_KEY = 'sanghub_player_cache';
    const VOICE_KEY = 'sanghub_voice_enabled';
    const VOICE_COOLDOWN_MS = 1200;
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    const VOICE_OPEN  = ['abra', 'abre', 'abrir', 'ativa', 'ativar', 'liga', 'ligar', 'inicia', 'iniciar'];
    const VOICE_CLOSE = ['feche', 'fecha', 'fechar', 'desativa', 'desativar', 'desliga', 'desligar', 'para', 'parar'];
    const VOICE_ALIASES = {
        packetlive:  ['packet', 'packet manager', 'analisador', 'analyzer'],
        blocklive:   ['liveblock', 'adblock', 'bloqueador'],
        boosterlive: ['booster', 'booster fps'],
        gameslive:   ['jogos', 'games', 'gameslive'],
        photolive:   ['photoswap', 'fotoswap', 'foto'],
        yt:          ['youtube'],
        iptv:        ['iptv', 'tv'],
        prozilla:    ['prozilla'],
        galeria:     ['galeria'],
        voz:         ['voz', 'microfone', 'mic'],
        groq:        ['sang', 'sang ai', 'chat ia', 'ia']
    };
    const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const STATUS = { UNLOADED: 'unloaded', LOADING: 'loading', LOADED: 'loaded', ERROR: 'error' };
    const TABS = [{ id: 'modules', label: 'Módulos' }, { id: 'misc', label: 'Adicionais' }];

    const state = {
        manifest: { modules: [] },
        moduleStates: {},
        syncState: 'loading',
        lastSyncAt: null,
        killFlag: false,
        currentHubVersion: HUB_VERSION,
        updateTimer: null,
        heartbeatTimer: null,
        isUpdating: false,
        activeTab: 'modules'
    };

    let renderListFn = null;
    let renderChromeFn = null;
    let toastFn = null;
    let uiRoot = null;
    let uiPill = null;
    let showPanelFn = null;
    let showPillFn = null;

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    // ═══ WEBSOCKET HOOK ═══
    (function setupSocketHook() {
        if (window._hubSocket) return;
        const connectCbs = [];
        const messageCbs = [];
        let active = null;
        const OriginalWebSocket = window.WebSocket;
        function HookedWebSocket(...args) {
            const ws = new OriginalWebSocket(...args);
            active = ws;
            connectCbs.forEach(cb => { try { cb(ws); } catch(e) {} });
            ws.addEventListener('message', (event) => {
                messageCbs.forEach(cb => { try { cb(event, ws); } catch(e) {} });
            });
            ws.addEventListener('close', () => { if (active === ws) active = null; });
            return ws;
        }
        HookedWebSocket.prototype = OriginalWebSocket.prototype;
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => { HookedWebSocket[k] = OriginalWebSocket[k]; });
        window.WebSocket = HookedWebSocket;
        window._hubSocket = {
            getActive: () => active,
            onConnect: (cb) => { connectCbs.push(cb); if (active) cb(active); },
            onMessage: (cb) => { messageCbs.push(cb); },
            _original: OriginalWebSocket
        };
    })();

    // ═══ MODULE LOADING ═══
    function injectCode(code, id) {
        const tag = document.createElement('script');
        tag.textContent = code;
        if (id) tag.setAttribute('data-module', id);
        (document.head || document.documentElement).appendChild(tag);
        tag.remove();
    }
    function killInstance(instanceKey) {
        if (!instanceKey) return false;
        try {
            if (window[instanceKey] && typeof window[instanceKey].kill === 'function') {
                window[instanceKey].kill();
                delete window[instanceKey];
                return true;
            }
            if (window[instanceKey]) { delete window[instanceKey]; return true; }
        } catch(e) {
            try { delete window[instanceKey]; } catch(e2) {}
        }
        return false;
    }
    async function loadModule(mod) {
        if (!mod?.url) throw new Error('Módulo sem URL');
        if (mod.instanceKey) killInstance(mod.instanceKey);
        const url = mod.url + (mod.url.includes('?') ? '&' : '?') + 't=' + Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        injectCode(await res.text(), mod.id);
    }
    function tryUnload(mod) {
        if (mod.instanceKey) return killInstance(mod.instanceKey);
        return false;
    }

    // ═══ CACHE ═══
    function getCache(key, ttl) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed.t || Date.now() - parsed.t > ttl) return null;
            return parsed.data;
        } catch(e) { return null; }
    }
    function setCache(key, data) {
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch(e) {}
    }
    function getCachedManifest() { return getCache('sanghub_manifest_cache', MANIFEST_CACHE_MS); }
    function setCachedManifest(data) { setCache('sanghub_manifest_cache', data); }

    // ═══ PLAYTIME ═══
    function loadTotalPlaytimeMs() {
        try { return parseInt(localStorage.getItem(PLAYTIME_KEY) || '0', 10) || 0; } catch(e) { return 0; }
    }
    function saveTotalPlaytimeMs(ms) {
        try { localStorage.setItem(PLAYTIME_KEY, String(Math.floor(ms))); } catch(e) {}
    }
    const playtime = { baseTotalMs: loadTotalPlaytimeMs(), sessionStartedAt: Date.now(), flushTimer: null };
    function sessionElapsedMs() { return Date.now() - playtime.sessionStartedAt; }
    function currentTotalMs() { return playtime.baseTotalMs + sessionElapsedMs(); }
    function flushPlaytime() { saveTotalPlaytimeMs(currentTotalMs()); }
    function formatDuration(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        const pad = n => String(n).padStart(2, '0');
        return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
    }
    function formatClock() {
        return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    function loadPlayerCache() {
        try { return JSON.parse(localStorage.getItem(PLAYER_CACHE_KEY) || 'null'); } catch(e) { return null; }
    }

    // ═══ FETCH / MANIFEST ═══
    async function fetchWithRetry(url, opts, timeout, retries) {
        let lastErr;
        for (let i = 0; i <= retries; i++) {
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), timeout);
                const res = await fetch(url, { ...opts, signal: ctrl.signal });
                clearTimeout(timer);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res;
            } catch(e) {
                lastErr = e;
                if (i < retries) await new Promise(r => setTimeout(r, 600 * (i + 1)));
            }
        }
        throw lastErr;
    }
    async function fetchManifest(bypassCache) {
        if (!bypassCache) {
            const cached = getCachedManifest();
            if (cached) return cached;
        }
        const res = await fetchWithRetry(MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' }, FETCH_TIMEOUT_MS, FETCH_RETRIES);
        const data = await res.json();
        setCachedManifest(data);
        return data;
    }
    async function checkHubUpdate() {
        if (state.isUpdating) return;
        state.isUpdating = true;
        try {
            const res = await fetchWithRetry(HUB_UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' }, 5000, 1);
            const code = await res.text();
            const m = code.match(/HUB_VERSION\s*=\s*["']([^"']+)["']/);
            if (!m) return;
            const v = m[1];
            if (v !== state.currentHubVersion) {
                if (toastFn) toastFn('Atualizando Hub para v' + v + '...', 'ok');
                applyHubUpdate(code);
            }
        } catch(e) { HWARN('Erro update:', e); }
        finally { state.isUpdating = false; }
    }
    function applyHubUpdate(code) {
        try { new Function(code); }
        catch(e) { HERR('Update inválido:', e); return; }
        try {
            flushPlaytime();
            if (window._hubUI?.kill) window._hubUI.kill();
            document.querySelectorAll('[data-hub]:not([data-hub-block]), [data-lb]').forEach(el => el.remove());
            const script = document.createElement('script');
            script.textContent = code;
            document.documentElement.appendChild(script);
            script.remove();
        } catch(e) { HERR('Falha ao aplicar:', e); }
    }
    async function refreshManifest(bypassCache) {
        state.syncState = 'loading';
        if (renderChromeFn) renderChromeFn();
        if (renderListFn) renderListFn();
        try {
            const manifest = await fetchManifest(bypassCache);
            const oldV = state.manifest.version, newV = manifest.version;
            if (oldV && oldV !== newV) {
                const newIds = new Set(manifest.modules.map(m => m.id));
                (state.manifest.modules || []).forEach(mod => {
                    if (!newIds.has(mod.id) && state.moduleStates[mod.id] === STATUS.LOADED) {
                        tryUnload(mod);
                        state.moduleStates[mod.id] = STATUS.UNLOADED;
                    }
                });
            }
            state.manifest = manifest;
            state.syncState = 'synced';
            state.lastSyncAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            manifest.modules.filter(m => {
                if (state.moduleStates[m.id] === STATUS.LOADED) return false;
                if (m.secret === true) return _secretOn;
                return m.enabled !== false && m.autoload === true;
            }).forEach(mod => activateModule(mod));
        } catch(e) {
            HERR('Falha manifesto:', e);
            state.syncState = 'error';
            if (toastFn) toastFn('Erro ao carregar manifesto', 'error');
        }
        if (renderChromeFn) renderChromeFn();
        if (renderListFn) renderListFn();
    }
    async function autoUpdateLoop() {
        if (state.killFlag) return;
        await checkHubUpdate();
        try {
            const cached = getCachedManifest();
            const fresh = await fetchManifest(true);
            if (cached && fresh && cached.version !== fresh.version) await refreshManifest(true);
            else if (!cached) await refreshManifest(true);
        } catch(e) { HWARN('Erro auto-update:', e); }
        if (!state.killFlag) {
            if (state.updateTimer) clearTimeout(state.updateTimer);
            state.updateTimer = setTimeout(autoUpdateLoop, UPDATE_INTERVAL_MS);
        }
    }

    // ═══ MODULE STATE ═══
    function flashItem(modId, kind) {
        if (!uiRoot) return;
        const el = uiRoot.querySelector('.hub-item[data-mod-id="' + CSS.escape(String(modId)) + '"]');
        if (!el) return;
        const cls = 'hub-flash-' + kind;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 700);
    }
    async function activateModule(mod) {
        if (state.moduleStates[mod.id] === STATUS.LOADING) return;
        state.moduleStates[mod.id] = STATUS.LOADING;
        if (renderListFn) renderListFn();
        try {
            await loadModule(mod);
            state.moduleStates[mod.id] = STATUS.LOADED;
            tentarRegistrarHandlerVoz();
            if (toastFn) toastFn(mod.name + ' carregado', 'ok');
            if (renderListFn) renderListFn();
            flashItem(mod.id, 'ok');
        } catch(e) {
            HERR('Falha em "' + mod.name + '":', e);
            state.moduleStates[mod.id] = STATUS.ERROR;
            if (toastFn) toastFn('Falha em ' + mod.name, 'error');
            if (renderListFn) renderListFn();
            flashItem(mod.id, 'error');
        }
    }
    function deactivateModule(mod) {
        state.moduleStates[mod.id] = STATUS.UNLOADED;
        const ok = tryUnload(mod);
        if (!window._voiceCommands?.registrar) vozHandlerRegistrado = null;
        if (toastFn) toastFn(mod.name + (ok ? ' desativado' : ' — recarregue'), ok ? 'ok' : 'warn');
        if (renderListFn) renderListFn();
    }
    function handleModuleClick(mod) {
        if (mod.secret) return;
        const status = state.moduleStates[mod.id] || STATUS.UNLOADED;
        if (status === STATUS.LOADING) return;
        if (status === STATUS.LOADED) { deactivateModule(mod); return; }
        activateModule(mod);
    }

    // ═══ VOZ ═══
    function matchModule(transcript) {
        const words = transcript.split(/\s+/);
        let best = null, bestScore = 0;
        state.manifest.modules.forEach(mod => {
            if (mod.secret || mod.enabled === false) return;
            const aliasWords = (VOICE_ALIASES[mod.id] || []).flatMap(a => normalize(a).split(/\s+/));
            const nameWords = normalize(mod.name).split(/\s+/);
            const candidates = [...new Set([...nameWords, ...aliasWords])].filter(w => w.length > 2);
            const score = candidates.filter(w => words.includes(w)).length;
            if (score > bestScore) { bestScore = score; best = mod; }
        });
        return best;
    }
    function handleVoiceCommand(raw) {
        const transcript = normalize(raw);
        if (!transcript) return false;
        if (/^(mostrar?|mostra|esconder?|esconde|abrir?|abre|abra|fechar?|fecha|feche)\s+(o\s+)?menu$/.test(transcript)) {
            if (/^(mostrar?|mostra|abrir?|abre|abra)/.test(transcript)) showPanelFn?.();
            else showPillFn?.();
            return true;
        }
        const mod = matchModule(transcript);
        if (!mod) return false;
        const palavras = transcript.split(/\s+/);
        const primeira = palavras[0];
        const status = state.moduleStates[mod.id] || STATUS.UNLOADED;
        if (VOICE_CLOSE.includes(primeira) || VOICE_CLOSE.includes(primeira + 'r')) {
            if (status === STATUS.LOADED) deactivateModule(mod);
            return true;
        }
        if (VOICE_OPEN.includes(primeira) || VOICE_OPEN.includes(primeira + 'r')) {
            if (status !== STATUS.LOADED) activateModule(mod);
            return true;
        }
        if (palavras.length <= 3) { handleModuleClick(mod); return true; }
        return false;
    }
    let vozHandlerRegistrado = null;
    function tentarRegistrarHandlerVoz() {
        if (!window._voiceCommands?.registrar) return false;
        if (vozHandlerRegistrado) return true;
        vozHandlerRegistrado = (texto) => handleVoiceCommand(texto);
        window._voiceCommands.registrar(/.*/, vozHandlerRegistrado, -1);
        return true;
    }
    function limparHandlerVoz() {
        if (vozHandlerRegistrado && window._voiceCommands?.remover) window._voiceCommands.remover(vozHandlerRegistrado);
        vozHandlerRegistrado = null;
    }
    tentarRegistrarHandlerVoz();

    // ═══ UI HELPERS ═══
    function setupGifIcon(item, canvas, liveImg, originalUrl) {
        const ctx = canvas.getContext('2d');
        const probe = new Image();
        probe.src = originalUrl;
        probe.onload = () => {
            canvas.width = probe.naturalWidth || 32;
            canvas.height = probe.naturalHeight || 32;
            ctx.drawImage(probe, 0, 0);
        };
        let playTimer = null;
        function play() {
            liveImg.src = originalUrl;
            liveImg.hidden = false;
            canvas.hidden = true;
            clearTimeout(playTimer);
            playTimer = setTimeout(stop, GIF_PLAY_MS);
        }
        function stop() {
            clearTimeout(playTimer);
            liveImg.hidden = true;
            canvas.hidden = false;
        }
        item.addEventListener('mouseenter', play);
        item.addEventListener('mouseleave', stop);
    }
    function parseIcon(icon) {
        if (!icon) return '<span style="font-size:26px;">📦</span>';
        icon = icon.trim();
        if (/^<svg/i.test(icon)) return icon;
        if (/^https?:\/\//i.test(icon) || /^data:image/i.test(icon) || /\.(png|svg|jpg|jpeg|webp)(\?.*)?$/i.test(icon))
            return `<img src="${icon}" alt="icon" />`;
        if (/\.gif(\?.*)?$/i.test(icon))
            return `<canvas class="hub-gif-frozen"></canvas><img class="hub-gif-live" data-original="${icon}" alt="icon" hidden />`;
        return icon;
    }
    function modulesForTab(tabId) {
        return state.manifest.modules.filter(m => {
            if (m.enabled === false || m.secret === true) return false;
            const isMisc = m.misc === true;
            return tabId === 'misc' ? isMisc : !isMisc;
        });
    }

    // ═══ BUILD UI ═══
    function buildUI() {
        const UID = '_hub';
        const ac = new AbortController();

        const style = document.createElement('style');
        style.setAttribute('data-hub', '1');
        style.textContent = `
        @keyframes hubFade{from{opacity:0;transform:translateY(-8px) scale(0.98)}to{opacity:1;transform:none}}
        @keyframes hubItemIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
        @keyframes hubPulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes hubSpin{to{transform:rotate(360deg)}}
        @keyframes hubShimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        @keyframes hubTitleShine{to{background-position:-200% center}}
        @keyframes hubIconRing{to{--hub-angle:360deg}}
        @keyframes hubPillRing{to{--hub-angle:360deg}}
        @keyframes hubFlashOk{0%{box-shadow:0 0 0 0 rgba(52,211,153,.45)}100%{box-shadow:0 0 0 16px rgba(52,211,153,0)}}
        @keyframes hubFlashErr{0%{box-shadow:0 0 0 0 rgba(251,113,133,.45)}100%{box-shadow:0 0 0 16px rgba(251,113,133,0)}}
        @property --hub-angle{syntax:'<angle>';inherits:false;initial-value:0deg}

        #${UID}{
            --hub-cyan:#22d3ee; --hub-violet:#a78bfa; --hub-grad:linear-gradient(120deg,var(--hub-cyan),var(--hub-violet));
            --hub-ok:#34d399; --hub-err:#fb7185; --hub-muted:#8b8fa3;
            position:fixed;top:20px;left:20px;width:336px;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;font-size:13px;
            color:#f1f2f8;background:linear-gradient(175deg,rgba(20,20,28,0.92),rgba(9,9,14,0.97));backdrop-filter:blur(18px) saturate(140%);
            border:1px solid rgba(255,255,255,0.08);border-radius:20px;
            box-shadow:0 20px 50px rgba(0,0,0,0.55),0 2px 8px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06);
            z-index:2147483647;overflow:hidden;user-select:none;animation:hubFade .3s cubic-bezier(0.16,1,0.3,1);
            max-height:85vh;display:flex;flex-direction:column}
        #${UID}.hidden{display:none}
        #${UID}{transition:width .22s cubic-bezier(0.16,1,0.3,1),max-height .22s cubic-bezier(0.16,1,0.3,1),opacity .18s ease}
        #${UID}.hub-collapsed{width:250px;max-height:100px;opacity:0}
        #${UID}::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--hub-grad);
            background-size:200% 100%;animation:hubShimmer 4s linear infinite}
        #${UID} .hub-hdr{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:grab;flex-shrink:0}
        #${UID} .hub-hdr:active{cursor:grabbing}
        #${UID} .hub-brand{display:flex;align-items:center;gap:11px;min-width:0}
        #${UID} .hub-key{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;
            background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);box-shadow:0 0 16px rgba(34,211,238,0.15);padding:5px;box-sizing:border-box}
        #${UID} .hub-title{font-weight:800;font-size:13.5px;letter-spacing:.06em;white-space:nowrap;
            background:linear-gradient(100deg,var(--hub-cyan) 0%,var(--hub-violet) 35%,#fff 50%,var(--hub-violet) 65%,var(--hub-cyan) 100%);
            background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
            animation:hubTitleShine 3.2s linear infinite}
        #${UID} .hub-subtitle{font-size:9.5px;color:var(--hub-muted);display:flex;align-items:center;gap:5px;margin-top:3px}
        #${UID} .hub-sync-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        #${UID} .hub-sync-dot.loading{background:var(--hub-cyan);animation:hubPulse 1s infinite}
        #${UID} .hub-sync-dot.synced{background:var(--hub-ok);box-shadow:0 0 6px rgba(52,211,153,0.7)}
        #${UID} .hub-sync-dot.error{background:var(--hub-err)}
        #${UID} .hub-actions{display:flex;gap:6px;flex-shrink:0}
        #${UID} .hub-hbtn{width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
            color:#c7cad6;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;
            transition:all .18s cubic-bezier(0.16,1,0.3,1);flex-shrink:0}
        #${UID} .hub-hbtn:hover{color:#0b0b10;background:var(--hub-grad);border-color:transparent;box-shadow:0 0 14px rgba(34,211,238,0.35);transform:translateY(-1px)}
        #${UID} .hub-hbtn:focus-visible,#${UID} .hub-item:focus-visible,#${UID} .hub-tab:focus-visible{outline:2px solid var(--hub-cyan);outline-offset:2px}
        #${UID} .hub-hbtn.spin svg{animation:hubSpin .6s linear infinite}
        #${UID} .hub-hbtn.listening{color:#0b0b10;background:var(--hub-grad);border-color:transparent;box-shadow:0 0 10px rgba(34,211,238,.5)}
        #${UID} .hub-hbtn.hearing{animation:hubPulse .35s ease-in-out}
        #${UID} .hub-hbtn.cedido{opacity:.4;pointer-events:none}
        #${UID} .hub-tabs{display:flex;gap:4px;padding:0 12px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.06)}
        #${UID} .hub-tab{flex:1;text-align:center;padding:9px 6px 10px;font-size:10.5px;font-weight:800;letter-spacing:.05em;
            text-transform:uppercase;color:var(--hub-muted);background:transparent;border:none;cursor:pointer;position:relative;
            transition:color .18s ease;font-family:inherit}
        #${UID} .hub-tab:hover{color:#d1d5db}
        #${UID} .hub-tab.active{color:#fff}
        #${UID} .hub-tab.active::after{content:'';position:absolute;left:14px;right:14px;bottom:-1px;height:2px;
            background:var(--hub-grad);border-radius:2px}
        #${UID} .hub-body{padding:12px;overflow-y:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:7px}
        #${UID} .hub-body::-webkit-scrollbar{width:5px}
        #${UID} .hub-body::-webkit-scrollbar-thumb{background:linear-gradient(var(--hub-cyan),var(--hub-violet));border-radius:3px}
        #${UID} .hub-empty,#${UID} .hub-error-box{padding:20px;text-align:center;color:var(--hub-muted);font-size:11px}
        #${UID} .hub-error-box{color:#fca5b1}
        #${UID} .hub-retry{display:inline-block;padding:6px 14px;margin-top:10px;border-radius:8px;
            background:rgba(251,113,133,0.12);border:1px solid rgba(251,113,133,0.35);color:#fca5b1;cursor:pointer;font-size:10px;font-weight:700;transition:all .18s}
        #${UID} .hub-item{display:flex;align-items:center;gap:14px;padding:11px 13px;
            border-radius:13px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.05);cursor:pointer;
            transition:all .2s cubic-bezier(0.16,1,0.3,1);position:relative;overflow:hidden;
            animation:hubItemIn .3s cubic-bezier(0.16,1,0.3,1) backwards}
        #${UID} .hub-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:transparent;transition:background .2s}
        #${UID} .hub-item.state-loaded::before{background:var(--hub-grad)}
        #${UID} .hub-item.state-loading::before{background:var(--hub-cyan);animation:hubPulse 1s infinite}
        #${UID} .hub-item.state-error::before{background:var(--hub-err)}
        #${UID} .hub-item:hover{background:rgba(255,255,255,0.05);border-color:rgba(167,139,250,0.35);
            transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,0.35),0 0 0 1px rgba(34,211,238,0.08)}
        #${UID} .hub-item:active{transform:translateY(-1px) scale(0.99)}
        #${UID} .hub-item.hub-flash-ok{animation:hubItemIn .3s cubic-bezier(0.16,1,0.3,1) backwards,hubFlashOk .7s ease-out}
        #${UID} .hub-item.hub-flash-error{animation:hubItemIn .3s cubic-bezier(0.16,1,0.3,1) backwards,hubFlashErr .7s ease-out}
        #${UID} .hub-icon{width:48px;height:48px;min-width:48px;min-height:48px;display:flex;align-items:center;justify-content:center;position:relative}
        #${UID} .hub-icon img,#${UID} .hub-icon svg,#${UID} .hub-icon canvas{width:100%;height:100%;object-fit:contain;display:block;border-radius:10px;
            filter:drop-shadow(0 3px 7px rgba(0,0,0,0.4));transition:filter .2s ease}
        #${UID} .hub-icon [hidden]{display:none !important}
        #${UID} .hub-icon::before{content:'';position:absolute;inset:-6px;border-radius:15px;padding:1.5px;
            background:conic-gradient(from var(--hub-angle),var(--hub-cyan),var(--hub-violet),#fff,var(--hub-violet),var(--hub-cyan));
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
            -webkit-mask-composite:xor;mask-composite:exclude;
            opacity:0;transition:opacity .25s ease;animation:hubIconRing 2.6s linear infinite;animation-play-state:paused;pointer-events:none}
        #${UID} .hub-item:hover .hub-icon::before{opacity:1;animation-play-state:running}
        #${UID} .hub-info{flex:1;min-width:0}
        #${UID} .hub-name{font-weight:700;color:#ffffff;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .hub-desc{font-size:9.5px;color:var(--hub-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
        #${UID} .hub-chip{flex-shrink:0;display:flex;align-items:center;gap:5px;font-size:8.5px;font-weight:800;padding:4px 9px;
            border-radius:20px;text-transform:uppercase;letter-spacing:0.06em;border:1px solid transparent}
        #${UID} .hub-chip::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0}
        #${UID} .hub-chip.unloaded{background:rgba(255,255,255,0.04);color:#8b8fa3;border-color:rgba(255,255,255,0.06)}
        #${UID} .hub-chip.unloaded::before{background:#5b5f70}
        #${UID} .hub-chip.loading{background:rgba(34,211,238,0.1);color:var(--hub-cyan);border-color:rgba(34,211,238,0.25)}
        #${UID} .hub-chip.loading::before{background:var(--hub-cyan);animation:hubPulse 1s infinite}
        #${UID} .hub-chip.loaded{background:rgba(52,211,153,0.1);color:var(--hub-ok);border-color:rgba(52,211,153,0.25)}
        #${UID} .hub-chip.loaded::before{background:var(--hub-ok);box-shadow:0 0 5px rgba(52,211,153,0.8)}
        #${UID} .hub-chip.error{background:rgba(251,113,133,0.1);color:var(--hub-err);border-color:rgba(251,113,133,0.25)}
        #${UID} .hub-chip.error::before{background:var(--hub-err)}
        #${UID} .hub-ftr{padding:10px 16px;background:rgba(0,0,0,0.25);border-top:1px solid rgba(255,255,255,0.05);
            font-size:9.5px;color:var(--hub-muted);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
        #${UID} .hub-toast{position:absolute;left:14px;right:14px;bottom:40px;padding:9px 14px;border-radius:11px;
            font-size:10.5px;font-weight:700;text-align:center;opacity:0;transform:translateY(8px);transition:all .22s cubic-bezier(0.16,1,0.3,1);
            pointer-events:none;z-index:20;border:1px solid;background:rgba(14,14,20,0.96);backdrop-filter:blur(10px);color:#f3f4f6}
        #${UID} .hub-toast.show{opacity:1;transform:translateY(0)}
        #${UID} .hub-toast.ok{border-color:rgba(52,211,153,0.5);color:#a7f3d0}
        #${UID} .hub-toast.error{border-color:rgba(251,113,133,0.5);color:#fecdd3}
        #${UID} .hub-toast.warn,#${UID} .hub-toast.info{border-color:rgba(34,211,238,0.5);color:#cffafe}
        #${UID}pill{--hub-cyan:#22d3ee; --hub-violet:#a78bfa; --hub-grad:linear-gradient(120deg,var(--hub-cyan),var(--hub-violet));
            position:fixed;top:20px;left:20px;width:250px;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;
            border-radius:20px;z-index:2147483647;user-select:none;animation:hubFade .25s ease-out;padding:2px}
        #${UID}pill::before{content:'';position:absolute;inset:0;border-radius:20px;padding:2px;
            background:conic-gradient(from var(--hub-angle),var(--hub-cyan),var(--hub-violet),#fff,var(--hub-violet),var(--hub-cyan));
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
            -webkit-mask-composite:xor;mask-composite:exclude;
            animation:hubPillRing 6s linear infinite;pointer-events:none;
            box-shadow:0 0 14px rgba(34,211,238,0.35),0 0 22px rgba(167,139,250,0.2)}
        #${UID}pill{transition:opacity .18s ease .04s;opacity:1}
        #${UID}pillinner{display:block;border-radius:18px;cursor:grab;color:#f1f2f8;
            background:linear-gradient(175deg,rgba(20,20,28,0.94),rgba(9,9,14,0.98));
            box-shadow:0 20px 50px rgba(0,0,0,0.55);overflow:hidden}
        #${UID}pill.hidden{display:none}
        #${UID}pill .hub-p-hdr{padding:11px 13px;display:flex;align-items:center;gap:9px}
        #${UID}pill .hub-p-icon{flex-shrink:0;width:28px;height:28px;border-radius:9px;background:rgba(255,255,255,0.05);
            border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center}
        #${UID}pill .hub-p-icon img{width:16px;height:16px;object-fit:contain}
        #${UID}pill .hub-p-title{flex:1;min-width:0;font-weight:800;font-size:11.5px;letter-spacing:.05em;white-space:nowrap;
            background:linear-gradient(100deg,var(--hub-cyan) 0%,var(--hub-violet) 35%,#fff 50%,var(--hub-violet) 65%,var(--hub-cyan) 100%);
            background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
            animation:hubTitleShine 3.2s linear infinite}
        #${UID}pill .hub-p-clock{flex-shrink:0;font-size:10px;font-weight:700;color:#e5e7eb;font-variant-numeric:tabular-nums}
        #${UID}pill .hub-p-divider{height:1px;background:rgba(255,255,255,0.06);margin:0 13px}
        #${UID}pill .hub-p-player{margin:9px 13px 0;display:flex;align-items:center;gap:9px;
            background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:10px;padding:7px 8px}
        #${UID}pill .hub-p-player-avatar{width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.05);flex-shrink:0;
            overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;color:#8b8fa3;font-size:13px}
        #${UID}pill .hub-p-player-info{flex:1;min-width:0}
        #${UID}pill .hub-p-player-name{font-size:10.5px;font-weight:700;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID}pill .hub-p-player-mission{font-size:9px;color:#8b8fa3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
        #${UID}pill .hub-p-stats{margin:9px 13px 11px;display:flex;gap:8px}
        #${UID}pill .hub-p-stat{flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:6px 8px}
        #${UID}pill .hub-p-stat-label{font-size:8px;color:#8b8fa3;text-transform:uppercase;letter-spacing:.05em}
        #${UID}pill .hub-p-stat-value{font-size:12.5px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
        #${UID}pill .hub-p-stat-value.session{color:var(--hub-cyan)}
        #${UID}pill .hub-p-stat-value.total{color:var(--hub-violet)}
        `;
        document.head.appendChild(style);

        const MAIN_ICON = `<img src="https://raw.githubusercontent.com/zBeyond5/Liveblock/main/assets/PNG/menu.png" style="width:20px; height:20px; object-fit:contain;" />`;
        const MAIN_ICON_SM = `<img src="https://raw.githubusercontent.com/zBeyond5/Liveblock/main/assets/PNG/menu.png" style="width:16px; height:16px; object-fit:contain;" />`;
        const REFRESH_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>`;
        const UPDATE_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
        const MIC_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

        const tabsHtml = TABS.map(t =>
            `<button class="hub-tab${t.id === state.activeTab ? ' active' : ''}" data-tab="${t.id}" role="button" tabindex="0" aria-pressed="${t.id === state.activeTab}">${escapeHtml(t.label)}</button>`
        ).join('');

        const root = document.createElement('div');
        root.id = UID;
        root.setAttribute('data-hub', '1');
        root.setAttribute('data-sang-ui', '');
        root.classList.add('hidden');
        root.innerHTML = `
        <div class="hub-hdr" id="${UID}hdr">
            <div class="hub-brand">
                <span class="hub-key">${MAIN_ICON}</span>
                <div>
                    <div class="hub-title">SANG HUB</div>
                    <div class="hub-subtitle"><span class="hub-sync-dot loading" id="${UID}syncdot"></span><span id="${UID}syncsubtitle">iniciando…</span></div>
                </div>
            </div>
            <div class="hub-actions">
                <div class="hub-hbtn" id="${UID}voice" title="Voz" role="button" tabindex="0">${MIC_SVG}</div>
                <div class="hub-hbtn" id="${UID}update" title="Auto-update" role="button" tabindex="0">${UPDATE_SVG}</div>
                <div class="hub-hbtn" id="${UID}refresh" title="Recarregar manifesto" role="button" tabindex="0">${REFRESH_SVG}</div>
                <div class="hub-hbtn" id="${UID}min" title="Minimizar" role="button" tabindex="0">−</div>
                <div class="hub-hbtn" id="${UID}cls" title="Fechar" role="button" tabindex="0">✕</div>
            </div>
        </div>
        <div class="hub-tabs" id="${UID}tabs">${tabsHtml}</div>
        <div class="hub-body" id="${UID}list"></div>
        <div class="hub-ftr">
            <span>v${HUB_VERSION}</span>
            <span id="${UID}ftrmid">·</span>
            <span>${SHORTCUT_LABEL}</span>
        </div>
        <div class="hub-toast" id="${UID}toast"></div>
        `;
        document.body.appendChild(root);
        uiRoot = root;

        const pill = document.createElement('div');
        pill.id = UID + 'pill';
        pill.setAttribute('data-hub', '1');
        pill.setAttribute('data-sang-ui', '');
        pill.innerHTML = `
        <div id="${UID}pillinner">
            <div class="hub-p-hdr">
                <span class="hub-p-icon">${MAIN_ICON_SM}</span>
                <span class="hub-p-title">SANG HUB</span>
                <span class="hub-p-clock" id="${UID}clock">--:--</span>
            </div>
            <div class="hub-p-divider"></div>
            <div class="hub-p-player">
                <span class="hub-p-player-avatar" id="${UID}playeravatar">👤</span>
                <div class="hub-p-player-info">
                    <div class="hub-p-player-name" id="${UID}playername">—</div>
                    <div class="hub-p-player-mission" id="${UID}playermission">—</div>
                </div>
            </div>
            <div class="hub-p-stats">
                <div class="hub-p-stat"><div class="hub-p-stat-label">Sessão</div><div class="hub-p-stat-value session" id="${UID}sessiontime">00:00:00</div></div>
                <div class="hub-p-stat"><div class="hub-p-stat-label">Total</div><div class="hub-p-stat-value total" id="${UID}totaltime">00:00:00</div></div>
            </div>
        </div>`;
        document.body.appendChild(pill);
        uiPill = pill;

        function syncPos(from, to) {
            const r = from.getBoundingClientRect();
            to.style.left = r.left + 'px';
            to.style.top = r.top + 'px';
        }
        function showPanel() {
            syncPos(pill, root);
            pill.classList.add('hidden');
            root.classList.remove('hidden');
            requestAnimationFrame(() => root.classList.remove('hub-collapsed'));
        }
        function showPill() {
            syncPos(root, pill);
            root.classList.add('hub-collapsed');
            setTimeout(() => { root.classList.add('hidden'); pill.classList.remove('hidden'); }, 220);
        }
        function hideAll() { root.classList.add('hidden'); pill.classList.add('hidden'); }
        showPanelFn = showPanel;
        showPillFn = showPill;

        function onKeyActivate(h) {
            return (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h(); } };
        }

        let drag = null;
        const hdr = root.querySelector('#' + UID + 'hdr');
        hdr.addEventListener('mousedown', e => {
            if (e.target.closest('.hub-hbtn')) return;
            const r = root.getBoundingClientRect();
            drag = { x: e.clientX - r.left, y: e.clientY - r.top };
            root.style.left = r.left + 'px';
            root.style.top = r.top + 'px';
        }, { signal: ac.signal });
        document.addEventListener('mousemove', e => {
            if (!drag) return;
            root.style.left = Math.max(0, e.clientX - drag.x) + 'px';
            root.style.top = Math.max(0, e.clientY - drag.y) + 'px';
        }, { signal: ac.signal });
        document.addEventListener('mouseup', () => { drag = null; }, { signal: ac.signal });

        const pillInner = pill.querySelector('#' + UID + 'pillinner');
        let pillDrag = null, pillDidDrag = false;
        pillInner.addEventListener('mousedown', e => {
            const r = pill.getBoundingClientRect();
            pillDrag = { x: e.clientX - r.left, y: e.clientY - r.top, sx: e.clientX, sy: e.clientY };
            pillDidDrag = false;
            pill.style.left = r.left + 'px';
            pill.style.top = r.top + 'px';
        }, { signal: ac.signal });
        document.addEventListener('mousemove', e => {
            if (!pillDrag) return;
            if (Math.abs(e.clientX - pillDrag.sx) > 3 || Math.abs(e.clientY - pillDrag.sy) > 3) pillDidDrag = true;
            pill.style.left = Math.max(0, e.clientX - pillDrag.x) + 'px';
            pill.style.top = Math.max(0, e.clientY - pillDrag.y) + 'px';
        }, { signal: ac.signal });
        document.addEventListener('mouseup', () => {
            if (pillDrag && !pillDidDrag) showPanel();
            pillDrag = null;
        }, { signal: ac.signal });
        pillInner.addEventListener('keydown', onKeyActivate(showPanel), { signal: ac.signal });

        let toastTm = null;
        toastFn = (msg, kind) => {
            const el = root.querySelector('#' + UID + 'toast');
            el.textContent = msg;
            el.className = 'hub-toast show ' + (kind || 'info');
            clearTimeout(toastTm);
            toastTm = setTimeout(() => el.classList.remove('show'), 2200);
        };

        const btnMin = root.querySelector('#' + UID + 'min');
        const btnCls = root.querySelector('#' + UID + 'cls');
        const btnRefresh = root.querySelector('#' + UID + 'refresh');
        const btnUpdate = root.querySelector('#' + UID + 'update');
        const btnVoice = root.querySelector('#' + UID + 'voice');

        btnMin.addEventListener('click', showPill, { signal: ac.signal });
        btnCls.addEventListener('click', hideAll, { signal: ac.signal });
        btnRefresh.addEventListener('click', () => refreshManifest(true), { signal: ac.signal });
        btnUpdate.addEventListener('click', () => { toastFn('Verificando…', 'info'); autoUpdateLoop(); }, { signal: ac.signal });

        let recognition = null, voiceActive = false, lastVoiceAt = 0;
        let vozHabilitado = !!(window._voz?.habilitado);
        function updateVoiceBtn() {
            btnVoice.classList.toggle('listening', voiceActive);
            btnVoice.classList.toggle('cedido', vozHabilitado);
        }
        function ensureRecognition() {
            if (recognition) return recognition;
            recognition = new SpeechRecognitionAPI();
            recognition.lang = 'pt-BR';
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.onresult = e => {
                const now = Date.now();
                if (now - lastVoiceAt < VOICE_COOLDOWN_MS) return;
                lastVoiceAt = now;
                handleVoiceCommand(e.results[e.results.length - 1][0].transcript);
            };
            recognition.onerror = () => { voiceActive = false; updateVoiceBtn(); };
            recognition.onend = () => {
                if (!voiceActive || vozHabilitado) return;
                try { recognition.start(); } catch(e) {}
            };
            return recognition;
        }
        function setVoiceActive(on) {
            voiceActive = on;
            updateVoiceBtn();
            try { localStorage.setItem(VOICE_KEY, on ? '1' : '0'); } catch(e) {}
            const rec = ensureRecognition();
            if (on) { if (!vozHabilitado) try { rec.start(); } catch(e) {} }
            else try { rec.stop(); } catch(e) {}
        }
        if (!SpeechRecognitionAPI) btnVoice.style.display = 'none';
        else {
            btnVoice.addEventListener('click', () => setVoiceActive(!voiceActive), { signal: ac.signal });
            window.addEventListener('sang:voz-state', (e) => {
                const novo = !!e?.detail?.habilitado;
                if (novo === vozHabilitado) return;
                vozHabilitado = novo;
                if (vozHabilitado && voiceActive && recognition) try { recognition.stop(); } catch(_) {}
                else if (!vozHabilitado && voiceActive && recognition) try { recognition.start(); } catch(_) {}
                updateVoiceBtn();
            }, { signal: ac.signal });
            if (localStorage.getItem(VOICE_KEY) === '1') setVoiceActive(true);
            updateVoiceBtn();
        }

        const tabsEl = root.querySelector('#' + UID + 'tabs');
        function setActiveTab(tabId) {
            if (state.activeTab === tabId) return;
            state.activeTab = tabId;
            tabsEl.querySelectorAll('.hub-tab').forEach(btn => {
                const a = btn.dataset.tab === tabId;
                btn.classList.toggle('active', a);
                btn.setAttribute('aria-pressed', String(a));
            });
            if (renderListFn) renderListFn();
        }
        tabsEl.querySelectorAll('.hub-tab').forEach(btn => {
            btn.addEventListener('click', () => setActiveTab(btn.dataset.tab), { signal: ac.signal });
        });

        document.addEventListener('keydown', e => {
            if (e.altKey && e.shiftKey && e.key.toLowerCase() === SHORTCUT_KEY) {
                e.preventDefault();
                root.classList.contains('hidden') ? showPanel() : showPill();
            }
        }, { signal: ac.signal });

        const listEl = root.querySelector('#' + UID + 'list');
        const syncDot = root.querySelector('#' + UID + 'syncdot');
        const syncSubtitle = root.querySelector('#' + UID + 'syncsubtitle');
        const ftrMid = root.querySelector('#' + UID + 'ftrmid');

        renderListFn = () => {
            listEl.innerHTML = '';
            if (state.syncState === 'error' && !state.manifest.modules.length) {
                listEl.innerHTML = `<div class="hub-error-box">Erro ao carregar manifesto.<div class="hub-retry" id="${UID}retry" role="button" tabindex="0">Tentar novamente</div></div>`;
                const r = listEl.querySelector('#' + UID + 'retry');
                r.addEventListener('click', () => refreshManifest(true));
                return;
            }
            const visible = modulesForTab(state.activeTab);
            if (!visible.length) {
                listEl.innerHTML = `<div class="hub-empty">${state.activeTab === 'misc' ? 'Nenhum adicional.' : 'Nenhum módulo.'}</div>`;
                return;
            }
            visible.forEach((mod, idx) => {
                const status = state.moduleStates[mod.id] || STATUS.UNLOADED;
                const item = document.createElement('div');
                item.className = 'hub-item state-' + status;
                item.dataset.modId = mod.id;
                item.style.animationDelay = Math.min(idx * 35, 250) + 'ms';
                item.setAttribute('role', 'button');
                item.setAttribute('tabindex', '0');
                item.innerHTML = `
                    <div class="hub-icon">${parseIcon(mod.icon)}</div>
                    <div class="hub-info">
                        <div class="hub-name">${escapeHtml(mod.name)}</div>
                        <div class="hub-desc">${escapeHtml(mod.description || '')}</div>
                    </div>
                    <span class="hub-chip ${status}">${status === STATUS.UNLOADED ? 'OFF' : status === STATUS.LOADING ? '...' : status === STATUS.LOADED ? 'ATIVO' : 'ERR'}</span>
                `;
                const c = item.querySelector('.hub-gif-frozen');
                const l = item.querySelector('.hub-gif-live');
                if (c && l) setupGifIcon(item, c, l, l.getAttribute('data-original'));
                item.addEventListener('click', () => handleModuleClick(mod));
                listEl.appendChild(item);
            });
        };
        renderChromeFn = () => {
            syncDot.className = 'hub-sync-dot ' + state.syncState;
            syncSubtitle.textContent = state.syncState === 'loading' ? 'sincronizando…' :
                                       state.syncState === 'synced' ? 'sync ' + (state.lastSyncAt || '') : 'falha';
            ftrMid.textContent = state.manifest.version ? 'v' + state.manifest.version : '·';
        };

        window.addEventListener('sang:module-close', (e) => {
            const id = e?.detail?.id;
            if (!id || state.moduleStates[id] !== STATUS.LOADED) return;
            state.moduleStates[id] = STATUS.UNLOADED;
            if (renderListFn) renderListFn();
            flashItem(id, 'ok');
        }, { signal: ac.signal });
        window.addEventListener('sang:voz-state', tentarRegistrarHandlerVoz, { signal: ac.signal });
        window.addEventListener('sang:voz-ready', tentarRegistrarHandlerVoz, { signal: ac.signal });
        try { window.dispatchEvent(new CustomEvent('sang:voz-query')); } catch(_) {}

        const clockEl = pill.querySelector('#' + UID + 'clock');
        const sessionEl = pill.querySelector('#' + UID + 'sessiontime');
        const totalEl = pill.querySelector('#' + UID + 'totaltime');
        function renderPillStats() {
            clockEl.textContent = formatClock();
            sessionEl.textContent = formatDuration(sessionElapsedMs());
            totalEl.textContent = formatDuration(currentTotalMs());
        }
        const clockTimer = setInterval(() => {
            if (state.killFlag) return;
            if (!pill.classList.contains('hidden')) renderPillStats();
        }, CLOCK_TICK_MS);
        renderPillStats();
        renderListFn();
        renderChromeFn();

        const nameEl = pill.querySelector('#' + UID + 'playername');
        const missionEl = pill.querySelector('#' + UID + 'playermission');
        const avatarEl = pill.querySelector('#' + UID + 'playeravatar');
        const cached = loadPlayerCache();
        if (cached) {
            nameEl.textContent = cached.name || '—';
            missionEl.textContent = cached.mission || '—';
            if (cached.avatarUrl) avatarEl.innerHTML = `<img src="${cached.avatarUrl}" style="position:absolute;top:-25%;left:-40%;width:210%;height:210%;object-fit:cover" alt="avatar" />`;
        }

        function kill() {
            limparHandlerVoz();
            state.killFlag = true;
            voiceActive = false;
            if (recognition) try { recognition.stop(); } catch(e) {}
            flushPlaytime();
            if (state.updateTimer) clearTimeout(state.updateTimer);
            if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
            clearInterval(clockTimer);
            if (playtime.flushTimer) clearInterval(playtime.flushTimer);
            if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
            ac.abort();
            document.querySelectorAll('#' + UID + ', #' + UID + 'pill, style[data-hub]').forEach(el => el.remove());
        }
        window._hubUI = { kill, markProtected(el) { el?.setAttribute?.('data-sang-ui', ''); return el; } };

        window._hubBridge = {
            get state() { return state; },
            STATUS,
            HUB_VERSION,
            get deviceId() { return _deviceId; },
            get fingerprint() { return _fp; },
            refreshManifest,
            deactivateModule,
            activateModule,
            toast: (msg, kind) => { if (toastFn) toastFn(msg, kind); },
            log: HLOG, warn: HWARN, err: HERR,
            gate: {
                get fp() { return _fp; },
                get secretOn() { return _secretOn; },
                get blocked() { return _blocked; },
                get mode() {
                    const o = localStorage.getItem(_ovr);
                    return o === '0' ? 'off' : o === '1' ? 'on' : 'auto';
                },
                async setMode(m) {
                    if (m === 'auto') localStorage.removeItem(_ovr);
                    else localStorage.setItem(_ovr, m === 'on' ? '1' : '0');
                    await _gate();
                    return _secretOn;
                },
                recompute: _gate
            },
            blk: {
                fixed: () => _blk.slice(),
                extra: _getBlkExtra,
                async add(fp) {
                    const a = _getBlkExtra();
                    if (!a.includes(fp) && !_blk.includes(fp)) { a.push(fp); _setBlkExtra(a); }
                    await _gate();
                },
                async remove(fp) {
                    const a = _getBlkExtra();
                    const i = a.indexOf(fp);
                    if (i > -1) { a.splice(i, 1); _setBlkExtra(a); }
                    await _gate();
                },
                full: _fullBlk
            },
            firestore: {
                configured: fsConfigured,
                request: fsRequest,
                parseDoc: fsParseDoc,
                value: fsValue
            }
        };

        showPill();
    }

    // ═══ BOOT ═══
    async function boot() {
        await new Promise(resolve => {
            if (document.body) return resolve();
            const iv = setInterval(() => { if (document.body) { clearInterval(iv); resolve(); } }, 80);
        });

        await _gate();
        _iniciarHeartbeat();
        _iniciarBlockWatcher();

        if (_blocked) {
            HLOG('🚫 Bloqueado no boot — toast apenas');
            _mostrarBloqueioToast();
            return;
        }

        buildUI();
        await refreshManifest(false);
        setTimeout(_carregarAdmin, 1500);

        playtime.flushTimer = setInterval(flushPlaytime, PLAYTIME_FLUSH_MS);
        window.addEventListener('beforeunload', flushPlaytime);

        if (!state.killFlag) {
            state.updateTimer = setTimeout(autoUpdateLoop, UPDATE_INTERVAL_MS);
        }

        state.heartbeatTimer = setInterval(() => {
            if (state.killFlag) return;
            if (!state.updateTimer) state.updateTimer = setTimeout(autoUpdateLoop, UPDATE_INTERVAL_MS);
        }, 60000);
    }

    boot().catch(e => HERR('❌ Erro fatal:', e));
})();
