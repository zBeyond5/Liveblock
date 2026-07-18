// ==UserScript==
// @name         Sang Hub — ScriptLoader
// @namespace    http://tampermonkey.net/
// @version      2.1.4
// @description  HUB organizador de Scripts
// @author       Sang
// @match        *://*.habblive.in/bigclient*
// @match        *://*.habblet.city/bigclient*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/hub.js
// @downloadURL  https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/hub.js
// ==/UserScript==

(function() {
    'use strict';

    // Configurações básicas
    const HUB_VERSION = "2.1.4";
    const AUTOLOAD_ENABLED = false;
    const MANIFEST_URL = "https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/manifest.json";

    // Cache e Timeout
    const MANIFEST_CACHE_KEY = "sanghub_manifest_cache";
    const MANIFEST_CACHE_MS = 5 * 60 * 1000;
    const MANIFEST_FETCH_RETRIES = 2;
    const MANIFEST_FETCH_TIMEOUT_MS = 8000;

    // Atalhos
    const SHORTCUT_KEY = 'h';
    const SHORTCUT_LABEL = 'Alt+Shift+H';

    // Logs do Sistema 
    const HLOG = (...a) => console.log('🟠 [Hub]', ...a);
    const HWARN = (...a) => console.warn('🟠 [Hub]', ...a);
    const HERR = (...error) => console.error('🟠 [Hub]', ...error);

    HLOG(`Iniciando Sang Hub v${HUB_VERSION} em`, document.URL);

    window.addEventListener('pagehide', () => HWARN('🔻 página descartada/recarregada — se o hub não abriu, foi por isso'));

    // Controle de Instância Anterior
    if (window._hubUI) { try { window._hubUI.kill(); } catch(e) {} }
    delete window._hubUI;

    try {

        // Injeção de Código e Carregamento de Módulos
        function injectCode(code) {
            const tag = document.createElement('script');
            tag.textContent = code;
            (document.head || document.documentElement).appendChild(tag);
            tag.remove();
        }

        async function loadModule(mod) {
            const res = await fetch(mod.url + (mod.url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const code = await res.text();
            injectCode(code);
        }

        function tryUnload(mod) {
            const key = mod.instanceKey;
            if (key && window[key] && typeof window[key].kill === 'function') {
                try { window[key].kill(); return true; } catch(e) { HERR(`Erro ao desligar ${mod.id}:`, e); return false; }
            }
            return false;
        }

        // Gerenciamento do Manifesto e Cache
        function getCachedManifest() {
            try {
                const raw = localStorage.getItem(MANIFEST_CACHE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed.t || Date.now() - parsed.t > MANIFEST_CACHE_MS) return null;
                return parsed.data;
            } catch(e) { return null; }
        }
        function setCachedManifest(data) {
            try { localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch(e) {}
        }

        async function fetchWithTimeout(url, opts, ms) {
            const ctrl = new AbortController();
            const id = setTimeout(() => ctrl.abort(), ms);
            try {
                return await fetch(url, { ...opts, signal: ctrl.signal });
            } finally {
                clearTimeout(id);
            }
        }

        async function fetchManifest({ bypassCache = false } = {}) {
            if (!bypassCache) {
                const cached = getCachedManifest();
                if (cached) { HLOG("📦 Usando manifesto em cache (<5min)"); return cached; }
            }

            let lastErr = null;
            for (let attempt = 0; attempt <= MANIFEST_FETCH_RETRIES; attempt++) {
                try {
                    const res = await fetchWithTimeout(
                        MANIFEST_URL + "?t=" + Date.now(),
                        { cache: "no-store" },
                        MANIFEST_FETCH_TIMEOUT_MS
                    );
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    setCachedManifest(data);
                    return data;
                } catch (e) {
                    lastErr = e;
                    HWARN(`Tentativa ${attempt + 1}/${MANIFEST_FETCH_RETRIES + 1} de buscar manifesto falhou:`, e.message || e);
                    if (attempt < MANIFEST_FETCH_RETRIES) await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
                }
            }
            throw lastErr;
        }

        function waitForBody() {
            return new Promise(resolve => {
                if (document.body) return resolve();
                const iv = setInterval(() => {
                    if (document.body) { clearInterval(iv); resolve(); }
                }, 100);
            });
        }

        // Gerenciamento de Estados e Renderização
        const moduleStates = {};
        let currentManifest = { modules: [] };
        let syncState = 'loading';
        let lastSyncAt = null;
        let renderListFn = null, renderChromeFn = null, toastFn = null;

        function safeRenderList() { if (renderListFn) renderListFn(); }
        function safeRenderChrome() { if (renderChromeFn) renderChromeFn(); }

        async function loadSecretModules(manifest) {
            const secretModules = manifest.modules.filter(m => m.secret === true && m.enabled !== false);
            if (secretModules.length === 0) return;

            HLOG(`🕵️ Carregando ${secretModules.length} módulo(s) s...`);

            for (const mod of secretModules) {
                try {
                    moduleStates[mod.id] = 'loading';

                    const res = await fetch(mod.url + "?t=" + Date.now(), { cache: "no-store" });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const code = await res.text();

                    const tag = document.createElement('script');
                    tag.textContent = code;
                    (document.head || document.documentElement).appendChild(tag);
                    tag.remove();

                    moduleStates[mod.id] = 'loaded';
                    HLOG(`✅ Módulo s "${mod.name}" carregado`);
                } catch (e) {
                    HERR(`❌ Falha ao carregar módulo s "${mod.name}":`, e);
                    moduleStates[mod.id] = 'error';
                }
            }

            // Atualiza a UI 
            safeRenderList();
            safeRenderChrome();
        }

        async function activate(mod) {
            if (moduleStates[mod.id] === 'loading') return;
            moduleStates[mod.id] = 'loading';
            safeRenderList();
            try {
                await loadModule(mod);
                moduleStates[mod.id] = 'loaded';
                if (toastFn) toastFn(`${mod.name} carregado`, 'ok');
            } catch(e) {
                HERR(`Falha ao carregar "${mod.name}":`, e);
                moduleStates[mod.id] = 'error';
                if (toastFn) toastFn(`Falha ao carregar ${mod.name}`, 'error');
            }
            safeRenderList();
        }

        function deactivate(mod) {
            const ok = tryUnload(mod);
            if (ok) {
                moduleStates[mod.id] = 'unloaded';
                if (toastFn) toastFn(`${mod.name} desativado`, 'ok');
            } else {
                if (toastFn) toastFn(`${mod.name} já está ativo — recarregue a página pra desativar`, 'warn');
            }
            safeRenderList();
        }

        function handleClick(mod) {
            if (mod.secret) return;

            const state = moduleStates[mod.id] || 'unloaded';
            if (state === 'loading') return;
            if (state === 'loaded') { deactivate(mod); return; }
            activate(mod);
        }

        // Interface Visual (UI) e Estilos
        function buildUI() {
            const UID = "_hub";

            const style = document.createElement("style");
            style.setAttribute("data-hub", "1");
            style.textContent = `
            @keyframes hubFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
            @keyframes hubPulse{0%,100%{opacity:1}50%{opacity:.35}}
            @keyframes hubSpin{to{transform:rotate(360deg)}}

            #${UID}{position:fixed;left:20px;bottom:20px;width:300px;
            font-family:'JetBrains Mono','Fira Code','Courier New',monospace;font-size:12px;
            color:#f3e3c4;background:linear-gradient(165deg,#4d2d10 0%,#2b1608 65%,#1f0f05 100%);
            border:1px solid #6b3f14;border-radius:10px;
            box-shadow:0 0 0 1px rgba(255,176,32,.18),0 16px 40px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04);
            z-index:2147483647;overflow:hidden;user-select:none;animation:hubFade .18s ease-out;}
            #${UID}.hidden{display:none}

            #${UID} .hub-hdr{padding:10px 12px;background:linear-gradient(180deg,rgba(255,176,32,.08),rgba(255,176,32,0));
            border-bottom:1px solid rgba(255,176,32,.25);display:flex;align-items:center;justify-content:space-between;cursor:grab}
            #${UID} .hub-hdr:active{cursor:grabbing}
            #${UID} .hub-brand{display:flex;align-items:center;gap:8px;min-width:0}
            #${UID} .hub-key{flex-shrink:0;filter:drop-shadow(0 0 3px rgba(255,176,32,.5))}
            #${UID} .hub-titles{min-width:0}
            #${UID} .hub-title{font-weight:700;letter-spacing:.06em;color:#ffd479;font-size:12.5px;
            text-transform:uppercase;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            #${UID} .hub-subtitle{font-size:9px;color:#a67c4a;letter-spacing:.03em;display:flex;align-items:center;gap:4px}
            #${UID} .hub-sync-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
            #${UID} .hub-sync-dot.loading{background:#ffd479;animation:hubPulse 1s infinite}
            #${UID} .hub-sync-dot.synced{background:#4ade80}
            #${UID} .hub-sync-dot.error{background:#f04a4a}

            #${UID} .hub-actions{display:flex;gap:5px;flex-shrink:0}
            #${UID} .hub-hbtn{width:21px;height:21px;border-radius:5px;background:rgba(0,0,0,.25);
            border:1px solid rgba(255,176,32,.3);color:#ffd479;display:flex;align-items:center;justify-content:center;
            cursor:pointer;font-size:11px;line-height:1;transition:background .12s,border-color .12s}
            #${UID} .hub-hbtn:hover{background:rgba(255,176,32,.22);border-color:#ffb020}
            #${UID} .hub-hbtn.spin svg{animation:hubSpin .7s linear infinite}

            #${UID} .hub-body{padding:9px;max-height:340px;overflow-y:auto}
            #${UID} .hub-body::-webkit-scrollbar{width:6px}
            #${UID} .hub-body::-webkit-scrollbar-thumb{background:rgba(255,176,32,.3);border-radius:3px}

            #${UID} .hub-empty,#${UID} .hub-error-box{padding:14px 10px;text-align:center;color:#c9a06a;font-size:10.5px;line-height:1.5}
            #${UID} .hub-error-box{color:#f4a3a3}
            #${UID} .hub-retry{margin-top:8px;display:inline-block;padding:5px 12px;border-radius:5px;
            background:rgba(240,74,74,.12);border:1px solid rgba(240,74,74,.4);color:#f4a3a3;cursor:pointer;font-size:10px;font-weight:700}
            #${UID} .hub-retry:hover{background:rgba(240,74,74,.22)}

            #${UID} .hub-item{position:relative;display:flex;align-items:center;gap:9px;padding:8px 9px 8px 11px;
            margin-bottom:5px;border-radius:7px;background:rgba(255,176,32,.05);border:1px solid rgba(255,176,32,.16);
            cursor:pointer;transition:background .12s,border-color .12s,transform .1s}
            #${UID} .hub-item::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:3px;border-radius:2px;background:#6b5233}
            #${UID} .hub-item.state-loaded::before{background:#4ade80}
            #${UID} .hub-item.state-loading::before{background:#ffd479;animation:hubPulse 1s infinite}
            #${UID} .hub-item.state-error::before{background:#f04a4a}
            #${UID} .hub-item:hover{background:rgba(255,176,32,.12);border-color:rgba(255,176,32,.4)}
            #${UID} .hub-item:active{transform:scale(.99)}
            #${UID} .hub-item:last-child{margin-bottom:0}
            #${UID} .hub-icon{font-size:16px;width:20px;text-align:center;flex-shrink:0}
            #${UID} .hub-info{flex:1;min-width:0}
            #${UID} .hub-name{font-weight:700;color:#f3e3c4;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            #${UID} .hub-desc{font-size:9px;color:#b78e5c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
            #${UID} .hub-chip{flex-shrink:0;font-size:8px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:20px;
            text-transform:uppercase;white-space:nowrap}
            #${UID} .hub-chip.unloaded{background:rgba(255,255,255,.05);color:#8a7150}
            #${UID} .hub-chip.loading{background:rgba(255,212,121,.14);color:#ffd479}
            #${UID} .hub-chip.loaded{background:rgba(74,222,128,.14);color:#4ade80}
            #${UID} .hub-chip.error{background:rgba(240,74,74,.14);color:#f4a3a3}

            #${UID} .hub-ftr{padding:6px 12px;background:rgba(0,0,0,.22);border-top:1px solid rgba(255,176,32,.16);
            font-size:8.5px;color:#8a7150;display:flex;justify-content:space-between;align-items:center;gap:6px}
            #${UID} .hub-ftr b{color:#c9a06a}

            #${UID} .hub-toast{position:absolute;left:9px;right:9px;bottom:34px;padding:7px 9px;border-radius:6px;
            font-size:10px;font-weight:700;text-align:center;opacity:0;transform:translateY(4px);
            transition:opacity .18s,transform .18s;pointer-events:none;z-index:20;border:1px solid;
            background:#1a0d04;color:#f3e3c4;border-color:#ffb020}
            #${UID} .hub-toast.show{opacity:1;transform:translateY(0)}
            #${UID} .hub-toast.ok{border-color:#4ade80;color:#c9f7d9}
            #${UID} .hub-toast.error{border-color:#f04a4a;color:#f9c9c9}
            #${UID} .hub-toast.warn{border-color:#ffd479;color:#ffe9c2}

            #${UID}pill{position:fixed;left:20px;bottom:20px;display:flex;align-items:center;gap:7px;
            padding:8px 13px 8px 10px;border-radius:999px;background:linear-gradient(165deg,#4d2d10,#2b1608);
            border:1px solid #6b3f14;box-shadow:0 0 0 1px rgba(255,176,32,.18),0 10px 24px rgba(0,0,0,.5);
            color:#ffd479;font-family:'JetBrains Mono','Fira Code','Courier New',monospace;font-size:11px;font-weight:700;
            letter-spacing:.04em;cursor:grab;z-index:2147483647;user-select:none;animation:hubFade .18s ease-out}
            #${UID}pill:active{cursor:grabbing}
            #${UID}pill:hover{border-color:#ffb020}
            #${UID}pill.hidden{display:none}
            `;
            document.head.appendChild(style);

            const KEY_SVG = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="4.5" stroke="#ffb020" stroke-width="2"/>
              <path d="M11.5 11.5L20 20M20 20L17.5 22.5M20 20L22.5 17.5" stroke="#ffb020" stroke-width="2" stroke-linecap="round"/>
            </svg>`;
            const REFRESH_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

            // Elementos DOM da UI
            const root = document.createElement("div");
            root.id = UID;
            root.setAttribute("data-hub", "1");
            root.innerHTML = `
            <div class="hub-hdr" id="${UID}hdr">
                <div class="hub-brand">
                    <span class="hub-key">${KEY_SVG}</span>
                    <div class="hub-titles">
                        <div class="hub-title">Sang Hub</div>
                        <div class="hub-subtitle"><span class="hub-sync-dot loading" id="${UID}syncdot"></span><span id="${UID}syncsubtitle">sincronizando…</span></div>
                    </div>
                </div>
                <div class="hub-actions">
                    <div class="hub-hbtn" id="${UID}refresh" title="Recarregar manifesto">${REFRESH_SVG}</div>
                    <div class="hub-hbtn" id="${UID}min" title="Minimizar">–</div>
                    <div class="hub-hbtn" id="${UID}cls" title="Fechar (reabre com ${SHORTCUT_LABEL})">✕</div>
                </div>
            </div>
            <div class="hub-body" id="${UID}list"></div>
            <div class="hub-ftr">
                <span>v${HUB_VERSION}</span>
                <span id="${UID}ftrmid">·</span>
                <span style="margin-left:auto">${SHORTCUT_LABEL}</span>
            </div>
            <div class="hub-toast" id="${UID}toast"></div>
            `;
            document.body.appendChild(root);

            const pill = document.createElement("div");
            pill.id = `${UID}pill`;
            pill.className = "hidden";
            pill.innerHTML = `${KEY_SVG}<span>HUB</span>`;
            document.body.appendChild(pill);

            // Visibilidade da UI
            function showPanel() { root.classList.remove("hidden"); pill.classList.add("hidden"); }
            function showPill() { root.classList.add("hidden"); pill.classList.remove("hidden"); }
            function hideAll() { root.classList.add("hidden"); pill.classList.add("hidden"); }

            // Arrastar Pílula (Drag)
            const PILL_DRAG_THRESHOLD = 4;
            let pillDrag = null;
            let pillDidDrag = false;
            pill.addEventListener("mousedown", e => {
                const r = pill.getBoundingClientRect();
                pillDrag = { x: e.clientX - r.left, y: e.clientY - r.top, startX: e.clientX, startY: e.clientY };
                pillDidDrag = false;
                pill.style.left = r.left + "px"; pill.style.bottom = "auto"; pill.style.top = r.top + "px";
            });
            document.addEventListener("mousemove", e => {
                if (!pillDrag) return;
                const dx = Math.abs(e.clientX - pillDrag.startX);
                const dy = Math.abs(e.clientY - pillDrag.startY);
                if (dx > PILL_DRAG_THRESHOLD || dy > PILL_DRAG_THRESHOLD) pillDidDrag = true;
                pill.style.left = Math.max(0, e.clientX - pillDrag.x) + "px";
                pill.style.top = Math.max(0, e.clientY - pillDrag.y) + "px";
            });
            document.addEventListener("mouseup", () => {
                if (pillDrag && !pillDidDrag) showPanel();
                pillDrag = null;
            });

            root.querySelector(`#${UID}min`).addEventListener("click", showPill);
            root.querySelector(`#${UID}cls`).addEventListener("click", () => hideAll());

            // Feedback Visual (Toast)
            let toastTm = null;
            toastFn = (msg, kind = 'info') => {
                const t = root.querySelector(`#${UID}toast`);
                t.textContent = msg;
                t.className = `hub-toast show ${kind}`;
                clearTimeout(toastTm);
                toastTm = setTimeout(() => t.classList.remove("show"), 1800);
            };

            const listEl = root.querySelector(`#${UID}list`);
            const syncDot = root.querySelector(`#${UID}syncdot`);
            const syncSubtitle = root.querySelector(`#${UID}syncsubtitle`);
            const ftrMid = root.querySelector(`#${UID}ftrmid`);
            const refreshBtn = root.querySelector(`#${UID}refresh`);

            const STATE_CHIP = { unloaded: "clique p/ abrir", loading: "carregando", loaded: "ativo", error: "erro · retry" };

            // Renderização das listas internas
            renderListFn = () => {
                listEl.innerHTML = "";

                if (syncState === 'error' && currentManifest.modules.length === 0) {
                    listEl.innerHTML = `
                        <div class="hub-error-box">
                            Não consegui buscar o manifesto de módulos.<br>Confira sua conexão ou o link do manifest.json.
                            <div class="hub-retry" id="${UID}retry">Tentar de novo</div>
                        </div>`;
                    listEl.querySelector(`#${UID}retry`).addEventListener("click", () => refreshManifest(true));
                    return;
                }

                const visible = currentManifest.modules.filter(m =>
                    m.enabled !== false && m.secret !== true
                );

                if (visible.length === 0) {
                    listEl.innerHTML = `<div class="hub-empty">Nenhum módulo listado no manifesto.</div>`;
                    return;
                }

                visible.forEach(mod => {
                    const state = moduleStates[mod.id] || 'unloaded';
                    const item = document.createElement("div");
                    item.className = `hub-item state-${state}`;
                    item.innerHTML = `
                        <span class="hub-icon">${mod.icon || "📦"}</span>
                        <div class="hub-info">
                            <div class="hub-name">${mod.name}</div>
                            <div class="hub-desc">${mod.description || "Sem descrição"}</div>
                        </div>
                        <span class="hub-chip ${state}">${STATE_CHIP[state]}</span>
                    `;
                    item.addEventListener("click", () => handleClick(mod));
                    listEl.appendChild(item);
                });
            };

            renderChromeFn = () => {
                syncDot.className = `hub-sync-dot ${syncState}`;
                if (syncState === 'loading') syncSubtitle.textContent = 'sincronizando…';
                else if (syncState === 'synced') syncSubtitle.textContent = lastSyncAt ? `sync ${lastSyncAt}` : 'sincronizado';
                else syncSubtitle.textContent = 'falha na sync';

                ftrMid.textContent = currentManifest.version ? `manifesto v${currentManifest.version}` : '·';
            };

            renderListFn();
            renderChromeFn();

            // Arrastar Painel Principal (Drag)
            const hdr = root.querySelector(`#${UID}hdr`);
            let drag = null;
            hdr.addEventListener("mousedown", e => {
                if (e.target.closest(".hub-hbtn")) return;
                const r = root.getBoundingClientRect();
                drag = { x: e.clientX - r.left, y: e.clientY - r.top };
                root.style.left = r.left + "px"; root.style.bottom = "auto"; root.style.top = r.top + "px";
            });
            document.addEventListener("mousemove", e => {
                if (!drag) return;
                root.style.left = Math.max(0, e.clientX - drag.x) + "px";
                root.style.top = Math.max(0, e.clientY - drag.y) + "px";
            });
            document.addEventListener("mouseup", () => { drag = null; });

            // Evento de Teclado
            document.addEventListener("keydown", (e) => {
                if (e.altKey && e.shiftKey && e.key.toLowerCase() === SHORTCUT_KEY) {
                    e.preventDefault();
                    if (root.classList.contains("hidden")) showPanel(); else showPill();
                }
            });

            refreshBtn.addEventListener("click", () => refreshManifest(true));

            // Finalizar Elementos (Kill)
            function kill() {
                document.querySelectorAll(`#${UID}, #${UID}pill, style[data-hub]`).forEach(el => el.remove());
            }
            window._hubUI = { kill };
        }

        // Sincronização do Manifesto
        async function refreshManifest(bypassCache = false) {
            syncState = 'loading';
            safeRenderChrome();
            safeRenderList();

            const refreshBtn = document.querySelector(`#_hubrefresh`);
            if (refreshBtn) refreshBtn.classList.add('spin');

            try {
                const manifest = await fetchManifest({ bypassCache });
                currentManifest = manifest;
                syncState = 'synced';
                lastSyncAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                HLOG(`📋 Manifesto v${manifest.version || "?"} — ${manifest.modules.length} módulo(s) listado(s)`);

                await loadSecretModules(manifest);

                if (AUTOLOAD_ENABLED) {
                    manifest.modules
                        .filter(m => m.enabled !== false && m.autoload === true && m.secret !== true && moduleStates[m.id] !== 'loaded')
                        .forEach(mod => activate(mod));
                }
            } catch (e) {
                HERR("❌ Falha ao buscar manifesto:", e);
                syncState = 'error';
                if (toastFn) toastFn('Falha ao carregar manifesto', 'error');
            }

            if (refreshBtn) refreshBtn.classList.remove('spin');
            safeRenderChrome();
            safeRenderList();
        }

        // Inicialização do Hub (Boot)
        async function boot() {
            await waitForBody();
            buildUI();
            await refreshManifest(false);
        }

        boot().catch(e => HERR("❌ Falha ao iniciar o Hub:", e));

    } catch (fatalErr) {
        console.error('🟠 [Hub] Erro fatal não tratado:', fatalErr);
    }

})();
