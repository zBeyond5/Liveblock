// ==UserScript==
// @name         Sang Hub
// @namespace    http://tampermonkey.net/
// @version      1.1.0
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

    // Página
    if (/\/me(\/|$|\?)/.test(location.pathname)) {
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

    const HUB_VERSION = "1.1.0";
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

    // ─── VOZ ───
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

    const TABS = [
        { id: 'modules', label: 'Módulos' },
        { id: 'misc', label: 'Adicionais' }
    ];

    const LOG_PREFIX = '🔶 [Hub]';
    const HLOG = (...a) => console.log(LOG_PREFIX, ...a);
    const HWARN = (...a) => console.warn(LOG_PREFIX, ...a);
    const HERR = (...a) => console.error(LOG_PREFIX, ...a);

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
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    (function setupSocketHook() {
        if (window._hubSocket) return;

        const connectCbs = [];
        const messageCbs = [];
        let active = null;

        const OriginalWebSocket = window.WebSocket;

        function HookedWebSocket(...args) {
            const ws = new OriginalWebSocket(...args);
            active = ws;
            connectCbs.forEach(cb => { try { cb(ws); } catch(e) { console.error('[Hub Socket] onConnect cb error:', e); } });

            ws.addEventListener('message', (event) => {
                messageCbs.forEach(cb => { try { cb(event, ws); } catch(e) { console.error('[Hub Socket] onMessage cb error:', e); } });
            });

            ws.addEventListener('close', () => {
                if (active === ws) active = null;
            });

            return ws;
        }

        HookedWebSocket.prototype = OriginalWebSocket.prototype;

        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => {
            HookedWebSocket[k] = OriginalWebSocket[k];
        });

        window.WebSocket = HookedWebSocket;

        window._hubSocket = {
            getActive: () => active,
            onConnect: (cb) => { connectCbs.push(cb); if (active) cb(active); },
            onMessage: (cb) => { messageCbs.push(cb); },
            _original: OriginalWebSocket
        };

        HLOG('🔌 Hook de WebSocket instalado');
    })();

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
                HLOG('💀 Matando instância antiga: ' + instanceKey);
                window[instanceKey].kill();
                delete window[instanceKey];
                HLOG('✅ Instância ' + instanceKey + ' removida');
                return true;
            }
            if (window[instanceKey]) {
                delete window[instanceKey];
                HLOG('⚠️ Instância ' + instanceKey + ' removida (sem kill)');
                return true;
            }
        } catch(e) {
            HWARN('Erro ao matar instância ' + instanceKey + ':', e);
            try { delete window[instanceKey]; } catch(e2) {}
        }
        return false;
    }

    async function loadModule(mod) {
        if (!mod?.url) throw new Error('Módulo sem URL');
        if (mod.instanceKey) {
            killInstance(mod.instanceKey);
        }

        const url = mod.url + (mod.url.includes('?') ? '&' : '?') + 't=' + Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const code = await res.text();
        injectCode(code, mod.id);

        HLOG('✅ Módulo "' + mod.name + '" carregado');
    }

    function tryUnload(mod) {
        const key = mod.instanceKey;
        if (key) {
            return killInstance(key);
        }
        return false;
    }

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

    function getCachedManifest() {
        return getCache('sanghub_manifest_cache', MANIFEST_CACHE_MS);
    }

    function setCachedManifest(data) {
        setCache('sanghub_manifest_cache', data);
    }

    // Playtime
    function loadTotalPlaytimeMs() {
        try {
            const raw = localStorage.getItem(PLAYTIME_KEY);
            return raw ? (parseInt(raw, 10) || 0) : 0;
        } catch(e) { return 0; }
    }

    function saveTotalPlaytimeMs(ms) {
        try { localStorage.setItem(PLAYTIME_KEY, String(Math.floor(ms))); } catch(e) {}
    }

    const playtime = {
        baseTotalMs: loadTotalPlaytimeMs(),
        sessionStartedAt: Date.now(),
        flushTimer: null
    };

    function sessionElapsedMs() {
        return Date.now() - playtime.sessionStartedAt;
    }

    function currentTotalMs() {
        return playtime.baseTotalMs + sessionElapsedMs();
    }

    function flushPlaytime() {
        saveTotalPlaytimeMs(currentTotalMs());
    }

    function formatDuration(ms) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const pad = n => String(n).padStart(2, '0');
        return pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    function formatClock() {
        return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function loadPlayerCache() {
        try {
            const raw = localStorage.getItem(PLAYER_CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch(e) { return null; }
    }

    async function fetchWithRetry(url, opts, timeout, retries) {
        let lastErr = null;
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
        const res = await fetchWithRetry(
            MANIFEST_URL + '?t=' + Date.now(),
            { cache: 'no-store' },
            FETCH_TIMEOUT_MS,
            FETCH_RETRIES
        );
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
            const versionMatch = code.match(/HUB_VERSION\s*=\s*["']([^"']+)["']/);
            if (!versionMatch) return;
            const remoteVersion = versionMatch[1];
            if (remoteVersion !== state.currentHubVersion) {
                HLOG('🔄 Nova versão do Hub: v' + remoteVersion + ' (atual: v' + state.currentHubVersion + ')');
                if (toastFn) toastFn('Atualizando Hub para v' + remoteVersion + '...', 'ok');
                applyHubUpdate(code);
            }
        } catch(e) {
            HWARN('Erro ao verificar Hub:', e);
        } finally {
            state.isUpdating = false;
        }
    }

    function applyHubUpdate(code) {
        try {
            new Function(code);
        } catch(e) {
            HERR('❌ Update com erro de sintaxe, abortando (UI atual preservada):', e);
            if (toastFn) toastFn('Update inválido — mantendo versão atual', 'error');
            return;
        }

        try {
            flushPlaytime();
            if (window._hubUI && typeof window._hubUI.kill === 'function') {
                window._hubUI.kill();
            }
            document.querySelectorAll('[data-hub], [data-lb]').forEach(el => el.remove());

            const script = document.createElement('script');
            script.textContent = code;
            document.documentElement.appendChild(script);
            script.remove();

            HLOG('✅ Hub atualizado (hot reload)');
        } catch(e) {
            HERR('❌ Falha ao aplicar atualização:', e);
        }
    }

    async function refreshManifest(bypassCache) {
        state.syncState = 'loading';
        if (renderChromeFn) renderChromeFn();
        if (renderListFn) renderListFn();

        try {
            const manifest = await fetchManifest(bypassCache);
            const oldVersion = state.manifest.version;
            const newVersion = manifest.version;

            if (oldVersion && oldVersion !== newVersion) {
                HLOG('📋 Manifesto v' + oldVersion + ' → v' + newVersion);
                if (toastFn) toastFn('Manifesto v' + newVersion, 'ok');

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

            manifest.modules
                .filter(m => m.enabled !== false && m.autoload === true && state.moduleStates[m.id] !== STATUS.LOADED)
                .forEach(mod => activateModule(mod));
        } catch(e) {
            HERR('❌ Falha no manifesto:', e);
            state.syncState = 'error';
            if (toastFn) toastFn('Erro ao carregar manifesto', 'error');
        }

        if (renderChromeFn) renderChromeFn();
        if (renderListFn) renderListFn();
    }

    async function autoUpdateLoop() {
        if (state.killFlag) return;
        HLOG('🔄 Verificando atualizações...');
        await checkHubUpdate();

        try {
            const cached = getCachedManifest();
            const fresh = await fetchManifest(true);
            if (cached && fresh && cached.version !== fresh.version) {
                HLOG('📋 Manifesto atualizado: v' + cached.version + ' → v' + fresh.version);
                await refreshManifest(true);
            } else if (!cached) {
                await refreshManifest(true);
            }
        } catch(e) {
            HWARN('Erro no auto-update:', e);
        }

        if (!state.killFlag) {
            if (state.updateTimer) clearTimeout(state.updateTimer);
            state.updateTimer = setTimeout(autoUpdateLoop, UPDATE_INTERVAL_MS);
        }
    }

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
        // Marca UNLOADED antes do kill: o kill() do módulo pode disparar
        // sang:module-close, e queremos que esse handler seja no-op aqui.
        state.moduleStates[mod.id] = STATUS.UNLOADED;
        const ok = tryUnload(mod);
        // Se o dispatcher de voz foi junto com o módulo, libera o cache do handler.
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

    // ─── VOZ: matcher + dispatcher ───
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

    // Retorna true se consumiu (comando de menu/módulo), false se não bateu em nada.
    // Regras: verbo de ação precisa estar na PRIMEIRA palavra, e sem verbo só alterna
    // em frases curtas (nome/apelido do módulo). Evita falsos positivos no chat.
    function handleVoiceCommand(raw) {
        const transcript = normalize(raw);
        if (!transcript) return false;

        // Menu — exige frase inteira (aceita "o menu" opcional)
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

        // Verbo de ação precisa estar na PRIMEIRA palavra (aceita forma no infinitivo)
        const ehFechar = VOICE_CLOSE.includes(primeira)
            || VOICE_CLOSE.includes(primeira + 'r');
        const ehAbrir = VOICE_OPEN.includes(primeira)
            || VOICE_OPEN.includes(primeira + 'r');

        if (ehFechar) {
            if (status === STATUS.LOADED) deactivateModule(mod);
            return true;
        }
        if (ehAbrir) {
            if (status !== STATUS.LOADED) activateModule(mod);
            return true;
        }

        // Sem verbo — só alterna se for frase curta (nome/apelido)
        if (palavras.length <= 3) {
            handleModuleClick(mod);
            return true;
        }

        return false;
    }

    // ─── VOZ: registro no despachante do voz.js ───
    // Quando voz.js está ativo, ele chama este handler (prioridade -1, abaixo dos módulos).
    let vozHandlerRegistrado = null;

    function tentarRegistrarHandlerVoz() {
        if (!window._voiceCommands?.registrar) return false;
        if (vozHandlerRegistrado) return true;
        vozHandlerRegistrado = (texto) => handleVoiceCommand(texto);
        window._voiceCommands.registrar(/.*/, vozHandlerRegistrado, -1);
        HLOG('🎤 handler de voz registrado no voz.js');
        return true;
    }

    function limparHandlerVoz() {
        if (vozHandlerRegistrado && window._voiceCommands?.remover) {
            window._voiceCommands.remover(vozHandlerRegistrado);
        }
        vozHandlerRegistrado = null;
    }

    // Tenta registrar já no boot (caso voz.js tenha carregado antes do Hub).
    // Retries acontecem em sang:voz-ready / sang:voz-state / activateModule,
    // todos amarrados ao ciclo de vida da UI (AbortController).
    tentarRegistrarHandlerVoz();

    function setupGifIcon(item, canvas, liveImg, originalUrl) {
        const ctx = canvas.getContext('2d');
        const probe = new Image();
        probe.src = originalUrl;
        probe.onload = () => {
            canvas.width = probe.naturalWidth || 32;
            canvas.height = probe.naturalHeight || 32;
            ctx.drawImage(probe, 0, 0);
        };
        probe.onerror = () => HWARN('Não foi possível pré-visualizar o GIF: ' + originalUrl);

        let playTimer = null;

        function play() {
            liveImg.src = '';
            liveImg.src = originalUrl;
            liveImg.hidden = false;
            canvas.hidden = true;

            clearTimeout(playTimer);
            playTimer = setTimeout(stop, GIF_PLAY_MS);
        }

        function stop() {
            clearTimeout(playTimer);
            playTimer = null;
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
        if (/^https?:\/\//i.test(icon) || /^data:image/i.test(icon) || /\.(png|svg|jpg|jpeg|webp)(\?.*)?$/i.test(icon)) {
            return `<img src="${icon}" alt="icon" />`;
        }
        if (/\.gif(\?.*)?$/i.test(icon)) {
            return `<canvas class="hub-gif-frozen"></canvas><img class="hub-gif-live" data-original="${icon}" alt="icon" hidden />`;
        }
        return icon;
    }

    function modulesForTab(tabId) {
        return state.manifest.modules.filter(m => {
            if (m.enabled === false || m.secret === true) return false;
            const isMisc = m.misc === true;
            return tabId === 'misc' ? isMisc : !isMisc;
        });
    }

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
        #${UID} .hub-hbtn:focus-visible,#${UID} .hub-item:focus-visible,#${UID}pill:focus-visible,#${UID} .hub-tab:focus-visible{outline:2px solid var(--hub-cyan);outline-offset:2px}
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
        #${UID} .hub-retry:hover{background:rgba(251,113,133,0.22)}

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
        #${UID} .hub-icon img, #${UID} .hub-icon svg, #${UID} .hub-icon canvas{
            width:100%;height:100%;object-fit:contain;display:block;border-radius:10px;
            filter:drop-shadow(0 3px 7px rgba(0,0,0,0.4));transition:filter .2s ease}
        #${UID} .hub-icon [hidden]{display:none !important}
        #${UID} .hub-icon::before{
            content:'';position:absolute;inset:-6px;border-radius:15px;padding:1.5px;
            background:conic-gradient(from var(--hub-angle),var(--hub-cyan),var(--hub-violet),#fff,var(--hub-violet),var(--hub-cyan));
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
            -webkit-mask-composite:xor;mask-composite:exclude;
            opacity:0;transition:opacity .25s ease;animation:hubIconRing 2.6s linear infinite;animation-play-state:paused;pointer-events:none}
        #${UID} .hub-item:hover .hub-icon::before{opacity:1;animation-play-state:running}
        #${UID} .hub-item:hover .hub-icon img,#${UID} .hub-item:hover .hub-icon svg,#${UID} .hub-item:hover .hub-icon canvas{
            filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5))}

        #${UID} .hub-info{flex:1;min-width:0}
        #${UID} .hub-name{font-weight:700;color:#ffffff;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.01em}
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
        #${UID} .hub-ftr b{color:#d1d5db}

        #${UID} .hub-toast{position:absolute;left:14px;right:14px;bottom:40px;padding:9px 14px;border-radius:11px;
            font-size:10.5px;font-weight:700;text-align:center;opacity:0;transform:translateY(8px);transition:all .22s cubic-bezier(0.16,1,0.3,1);
            pointer-events:none;z-index:20;border:1px solid;background:rgba(14,14,20,0.96);backdrop-filter:blur(10px);color:#f3f4f6}
        #${UID} .hub-toast.show{opacity:1;transform:translateY(0)}
        #${UID} .hub-toast.ok{border-color:rgba(52,211,153,0.5);color:#a7f3d0;box-shadow:0 6px 18px rgba(52,211,153,0.15)}
        #${UID} .hub-toast.error{border-color:rgba(251,113,133,0.5);color:#fecdd3;box-shadow:0 6px 18px rgba(251,113,133,0.15)}
        #${UID} .hub-toast.warn,#${UID} .hub-toast.info{border-color:rgba(34,211,238,0.5);color:#cffafe;box-shadow:0 6px 18px rgba(34,211,238,0.15)}

        /* Card (pill expandido) */
        #${UID}pill{
            --hub-cyan:#22d3ee; --hub-violet:#a78bfa; --hub-grad:linear-gradient(120deg,var(--hub-cyan),var(--hub-violet));
            position:fixed;top:20px;left:20px;width:250px;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;
            border-radius:20px;z-index:2147483647;user-select:none;animation:hubFade .25s ease-out;
            padding:2px}
        #${UID}pill::before{
            content:'';position:absolute;inset:0;border-radius:20px;padding:2px;
            background:conic-gradient(from var(--hub-angle),var(--hub-cyan),var(--hub-violet),#fff,var(--hub-violet),var(--hub-cyan));
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
            -webkit-mask-composite:xor;mask-composite:exclude;
            animation:hubPillRing 6s linear infinite;pointer-events:none;
            box-shadow:0 0 14px rgba(34,211,238,0.35),0 0 22px rgba(167,139,250,0.2)}
        #${UID}pill{transition:opacity .18s ease .04s;opacity:1}
        #${UID}pillinner{
            display:block;border-radius:18px;cursor:grab;color:#f1f2f8;
            background:linear-gradient(175deg,rgba(20,20,28,0.94),rgba(9,9,14,0.98));
            box-shadow:0 20px 50px rgba(0,0,0,0.55);overflow:hidden}
        #${UID}pillinner:active{cursor:grabbing}
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
            overflow:hidden;position:relative;
            display:flex;align-items:center;justify-content:center;color:var(--hub-muted,#8b8fa3);font-size:13px}
        #${UID}pill .hub-p-player-info{flex:1;min-width:0}
        #${UID}pill .hub-p-player-name{font-size:10.5px;font-weight:700;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID}pill .hub-p-player-mission{font-size:9px;color:#8b8fa3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}

        #${UID}pill .hub-p-stats{margin:9px 13px 11px;display:flex;gap:8px}
        #${UID}pill .hub-p-stat{flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);
            border-radius:10px;padding:6px 8px}
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
                <div class="hub-hbtn" id="${UID}voice" title="Ativar controle por voz" role="button" tabindex="0" aria-label="Ativar controle por voz">${MIC_SVG}</div>
                <div class="hub-hbtn" id="${UID}update" title="Auto-update" role="button" tabindex="0" aria-label="Verificar atualizações">${UPDATE_SVG}</div>
                <div class="hub-hbtn" id="${UID}refresh" title="Recarregar manifesto" role="button" tabindex="0" aria-label="Recarregar manifesto">${REFRESH_SVG}</div>
                <div class="hub-hbtn" id="${UID}min" title="Minimizar" role="button" tabindex="0" aria-label="Minimizar painel">−</div>
                <div class="hub-hbtn" id="${UID}cls" title="Fechar (${SHORTCUT_LABEL})" role="button" tabindex="0" aria-label="Fechar painel">✕</div>
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

        // Card
        const pill = document.createElement('div');
        pill.id = UID + 'pill';
        pill.setAttribute('data-hub', '1');
        pill.innerHTML = `
        <div id="${UID}pillinner">
            <div class="hub-p-hdr">
                <span class="hub-p-icon">${MAIN_ICON_SM}</span>
                <span class="hub-p-title">SANG HUB</span>
                <span class="hub-p-clock" id="${UID}clock">--:--</span>
            </div>
            <div class="hub-p-divider"></div>
            <div class="hub-p-player" id="${UID}player">
                <span class="hub-p-player-avatar" id="${UID}playeravatar">👤</span>
                <div class="hub-p-player-info">
                    <div class="hub-p-player-name" id="${UID}playername">—</div>
                    <div class="hub-p-player-mission" id="${UID}playermission">—</div>
                </div>
            </div>
            <div class="hub-p-stats">
                <div class="hub-p-stat">
                    <div class="hub-p-stat-label">Sessão</div>
                    <div class="hub-p-stat-value session" id="${UID}sessiontime">00:00:00</div>
                </div>
                <div class="hub-p-stat">
                    <div class="hub-p-stat-label">Total</div>
                    <div class="hub-p-stat-value total" id="${UID}totaltime">00:00:00</div>
                </div>
            </div>
        </div>
        `;
        document.body.appendChild(pill);
        uiPill = pill;

        // Ancora
        function syncPos(fromEl, toEl) {
            const r = fromEl.getBoundingClientRect();
            toEl.style.left = r.left + 'px';
            toEl.style.top = r.top + 'px';
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
            setTimeout(() => {
                root.classList.add('hidden');
                pill.classList.remove('hidden');
            }, 220);
        }
        function hideAll() { root.classList.add('hidden'); pill.classList.add('hidden'); }

        showPanelFn = showPanel;
        showPillFn = showPill;

        function onKeyActivate(handler) {
            return (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
            };
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
            const x = Math.max(0, e.clientX - drag.x);
            const y = Math.max(0, e.clientY - drag.y);
            root.style.left = x + 'px';
            root.style.top = y + 'px';
        }, { signal: ac.signal });
        document.addEventListener('mouseup', () => { drag = null; }, { signal: ac.signal });

        const pillInner = pill.querySelector('#' + UID + 'pillinner');
        let pillDrag = null;
        let pillDidDrag = false;
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
        pillInner.setAttribute('role', 'button');
        pillInner.setAttribute('tabindex', '0');
        pillInner.setAttribute('aria-label', 'Abrir painel Sang Hub');
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
        btnMin.addEventListener('keydown', onKeyActivate(showPill), { signal: ac.signal });
        btnCls.addEventListener('click', hideAll, { signal: ac.signal });
        btnCls.addEventListener('keydown', onKeyActivate(hideAll), { signal: ac.signal });
        btnRefresh.addEventListener('click', () => refreshManifest(true), { signal: ac.signal });
        btnRefresh.addEventListener('keydown', onKeyActivate(() => refreshManifest(true)), { signal: ac.signal });
        const onUpdateClick = () => { toastFn('Verificando atualizações…', 'info'); autoUpdateLoop(); };
        btnUpdate.addEventListener('click', onUpdateClick, { signal: ac.signal });
        btnUpdate.addEventListener('keydown', onKeyActivate(onUpdateClick), { signal: ac.signal });

        // ─── VOZ: reconhecimento próprio (fallback quando voz.js está off) ───
        let recognition = null, voiceActive = false, lastVoiceAt = 0;
        // vozHabilitado: true quando o voz.js está no comando.
        // Boot: best-effort (window._voz se existir; sang:voz-query dispatched abaixo).
        // Runtime: só muda via sang:voz-state.
        let vozHabilitado = !!(window._voz?.habilitado);

        function updateVoiceBtn() {
            btnVoice.classList.toggle('listening', voiceActive);
            btnVoice.classList.toggle('cedido', vozHabilitado);
            btnVoice.title = vozHabilitado
                ? 'Mic cedido ao voz.js (desligue o voz.js para usar)'
                : (voiceActive ? 'Escutando… (clique para desativar)' : 'Ativar controle por voz');
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
                btnVoice.classList.add('hearing');
                setTimeout(() => btnVoice.classList.remove('hearing'), 400);
                handleVoiceCommand(e.results[e.results.length - 1][0].transcript);
            };
            recognition.onerror = e => {
                HWARN('Voz:', e.error);
                if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                    voiceActive = false; updateVoiceBtn();
                    try { localStorage.setItem(VOICE_KEY, '0'); } catch(e2) {}
                    toastFn('Permissão de microfone negada', 'error');
                }
            };
            recognition.onend = () => {
                if (!voiceActive) return;
                // voz.js assumiu — não reinicia
                if (vozHabilitado) return;
                try { recognition.start(); } catch(e) {}
            };
            return recognition;
        }

        function setVoiceActive(on) {
            voiceActive = on;
            updateVoiceBtn();
            try { localStorage.setItem(VOICE_KEY, on ? '1' : '0'); } catch(e) {}
            const rec = ensureRecognition();
            if (on) {
                // Se voz.js está no comando, guarda a intenção mas não inicia captura
                if (vozHabilitado) return;
                try { rec.start(); } catch(e) {}
            } else {
                try { rec.stop(); } catch(e) {}
            }
        }

        if (!SpeechRecognitionAPI) {
            btnVoice.style.display = 'none';
        } else {
            const toggleVoice = () => setVoiceActive(!voiceActive);
            btnVoice.addEventListener('click', toggleVoice, { signal: ac.signal });
            btnVoice.addEventListener('keydown', onKeyActivate(toggleVoice), { signal: ac.signal });

            // Coordenação com voz.js: cede/retoma o mic quando o estado dele muda
            window.addEventListener('sang:voz-state', (e) => {
                const novo = !!e?.detail?.habilitado;
                if (novo === vozHabilitado) return;
                vozHabilitado = novo;

                if (vozHabilitado) {
                    if (voiceActive && recognition) {
                        try { recognition.stop(); } catch(_) {}
                    }
                    HLOG('🎤 mic cedido ao voz.js');
                } else if (voiceActive && recognition) {
                    try { recognition.start(); } catch(_) {}
                    HLOG('🎤 mic retomado (voz.js desligado)');
                }
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
                const active = btn.dataset.tab === tabId;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', String(active));
            });
            if (renderListFn) renderListFn();
        }
        tabsEl.querySelectorAll('.hub-tab').forEach(btn => {
            btn.addEventListener('click', () => setActiveTab(btn.dataset.tab), { signal: ac.signal });
            btn.addEventListener('keydown', onKeyActivate(() => setActiveTab(btn.dataset.tab)), { signal: ac.signal });
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
                const retryBtn = listEl.querySelector('#' + UID + 'retry');
                retryBtn.addEventListener('click', () => refreshManifest(true));
                retryBtn.addEventListener('keydown', onKeyActivate(() => refreshManifest(true)));
                return;
            }

            const visible = modulesForTab(state.activeTab);
            if (!visible.length) {
                const emptyMsg = state.activeTab === 'misc' ? 'Nenhum adicional disponível.' : 'Nenhum módulo disponível.';
                listEl.innerHTML = `<div class="hub-empty">${emptyMsg}</div>`;
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
                item.setAttribute('aria-pressed', String(status === STATUS.LOADED));

                const iconHtml = parseIcon(mod.icon);
                const safeName = escapeHtml(mod.name);
                const safeDesc = escapeHtml(mod.description || '');
                const noUnloadHint = !mod.instanceKey ? ' title="Este módulo precisa de reload da página para desativar"' : '';

                item.innerHTML = `
                    <div class="hub-icon">${iconHtml}</div>
                    <div class="hub-info"${noUnloadHint}>
                        <div class="hub-name">${safeName}</div>
                        <div class="hub-desc">${safeDesc}</div>
                    </div>
                    <span class="hub-chip ${status}">${status === STATUS.UNLOADED ? 'OFF' : status === STATUS.LOADING ? '...' : status === STATUS.LOADED ? 'ATIVO' : 'ERR'}</span>
                `;

                const gifCanvas = item.querySelector('.hub-gif-frozen');
                const gifLive = item.querySelector('.hub-gif-live');
                if (gifCanvas && gifLive) {
                    setupGifIcon(item, gifCanvas, gifLive, gifLive.getAttribute('data-original'));
                }

                item.addEventListener('click', () => handleModuleClick(mod));
                item.addEventListener('keydown', onKeyActivate(() => handleModuleClick(mod)));
                listEl.appendChild(item);
            });
        };

        renderChromeFn = () => {
            syncDot.className = 'hub-sync-dot ' + state.syncState;
            syncSubtitle.textContent = state.syncState === 'loading' ? 'sincronizando…' :
                                       state.syncState === 'synced' ? 'sync ' + (state.lastSyncAt || '') : 'falha';
            ftrMid.textContent = state.manifest.version ? 'v' + state.manifest.version : '·';
        };

        // ─── CICLO DE VIDA: módulo fecha sozinho → Hub atualiza ───
        window.addEventListener('sang:module-close', (e) => {
            const id = e?.detail?.id;
            if (!id) return;
            if (state.moduleStates[id] !== STATUS.LOADED) return;
            state.moduleStates[id] = STATUS.UNLOADED;
            HLOG('📴 Módulo fechado externamente: ' + id);
            if (renderListFn) renderListFn();
            flashItem(id, 'ok');
        }, { signal: ac.signal });

        // ─── VOZ: retries de registro do handler ───
        // voz.js só emite sang:voz-state (não há ready/query hoje). Escutamos ele
        // pra re-tentar o registro caso voz.js tenha carregado depois do Hub.
        window.addEventListener('sang:voz-state', tentarRegistrarHandlerVoz, { signal: ac.signal });
        window.addEventListener('sang:voz-ready', tentarRegistrarHandlerVoz, { signal: ac.signal });
        // Forward-compat: se voz.js implementar, responde com sang:voz-state.
        try { window.dispatchEvent(new CustomEvent('sang:voz-query')); } catch(_) {}

        // Clock/stats
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

        // Nome/missão/avatar
        const nameEl = pill.querySelector('#' + UID + 'playername');
        const missionEl = pill.querySelector('#' + UID + 'playermission');
        const avatarEl = pill.querySelector('#' + UID + 'playeravatar');

        function applyPlayerData(data) {
            nameEl.textContent = data.name || '—';
            missionEl.textContent = data.mission || '—';
            if (data.avatarUrl) {
                avatarEl.innerHTML = `<img src="${data.avatarUrl}" style="position:absolute;top:-25%;left:-40%;width:180%;height:180%;object-fit:cover" alt="avatar" />`;
            }
        }

        const cached = loadPlayerCache();
        if (cached) applyPlayerData(cached);

        function kill() {
            limparHandlerVoz();
            state.killFlag = true;
            voiceActive = false;
            if (recognition) { try { recognition.stop(); } catch(e) {} }
            flushPlaytime();
            if (state.updateTimer) clearTimeout(state.updateTimer);
            if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
            clearInterval(clockTimer);
            if (playtime.flushTimer) clearInterval(playtime.flushTimer);
            ac.abort();
            document.querySelectorAll('#' + UID + ', #' + UID + 'pill, style[data-hub]').forEach(el => el.remove());
        }
        window._hubUI = { kill };

        showPill();
    }

    async function boot() {
        await new Promise(resolve => {
            if (document.body) return resolve();
            const iv = setInterval(() => { if (document.body) { clearInterval(iv); resolve(); } }, 80);
        });

        buildUI();
        await refreshManifest(false);

        playtime.flushTimer = setInterval(flushPlaytime, PLAYTIME_FLUSH_MS);
        window.addEventListener('beforeunload', flushPlaytime);

        if (!state.killFlag) {
            state.updateTimer = setTimeout(autoUpdateLoop, UPDATE_INTERVAL_MS);
            HLOG('🔄 Auto-update: ' + (UPDATE_INTERVAL_MS / 60000) + 'min');
        }

        state.heartbeatTimer = setInterval(() => {
            if (state.killFlag) return;
            if (!state.updateTimer) {
                HLOG('🔄 Reiniciando auto-update');
                state.updateTimer = setTimeout(autoUpdateLoop, UPDATE_INTERVAL_MS);
            }
        }, 60000);
    }

    boot().catch(e => HERR('❌ Erro fatal:', e));
})();
