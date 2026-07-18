// ==UserScript==
// @name         Sang Hub — ScriptLoader
// @namespace    http://tampermonkey.net/
// @version      2.0.2
// @description  Central que lista e carrega scripts (LiveBlock e outros) sob demanda
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

    const HUB_VERSION = "2.0.2";

    // Troque pelo link "Raw" do seu manifest.json no GitHub
    const MANIFEST_URL = "https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/manifest.json";

    const MANIFEST_CACHE_KEY = "sanghub_manifest_cache";
    const MANIFEST_CACHE_MS = 5 * 60 * 1000; // 5 minutos

    // Atalho pra reabrir o painel mesmo depois de fechar no X
    const SHORTCUT_KEY = 'h';
    const SHORTCUT_LABEL = 'Alt+Shift+H';

    const HLOG = (...a) => console.log('🟠 [Hub]', ...a);
    const HWARN = (...a) => console.warn('🟠 [Hub]', ...a);
    const HERR = (...a) => console.error('🟠 [Hub]', ...a);

    HLOG(`Iniciando Sang Hub v${HUB_VERSION} em`, document.URL);

    // ─── DESTRÓI INSTÂNCIA ANTERIOR (recarregamento do próprio hub)
    if (window._hubUI) { try { window._hubUI.kill(); } catch(e) {} }
    delete window._hubUI;

  try {

    // ─── Injeta código bruto no contexto real da página (não eval — cria
    // uma <script> de verdade, então overrides de window.fetch/XHR etc.
    // dos módulos funcionam normalmente).
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

    // ─── MANIFESTO (com cache curto)
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
    async function fetchManifest() {
        const cached = getCachedManifest();
        if (cached) { HLOG("📦 Usando manifesto em cache (<5min)"); return cached; }
        const res = await fetch(MANIFEST_URL + "?t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCachedManifest(data);
        return data;
    }

    function waitForBody() {
        return new Promise(resolve => {
            if (document.body) return resolve();
            const iv = setInterval(() => {
                if (document.body) { clearInterval(iv); resolve(); }
            }, 100);
        });
    }

    // ─── ESTADO
    const moduleStates = {}; // id -> 'unloaded' | 'loading' | 'loaded' | 'error'
    let uiRoot = null, renderListFn = null, toastFn = null;

    function safeRender() { if (renderListFn) renderListFn(); }

    async function activate(mod) {
        if (moduleStates[mod.id] === 'loading') return;
        moduleStates[mod.id] = 'loading';
        safeRender();
        try {
            await loadModule(mod);
            moduleStates[mod.id] = 'loaded';
            if (toastFn) toastFn(`${mod.name} carregado`);
        } catch(e) {
            HERR(`Falha ao carregar "${mod.name}":`, e);
            moduleStates[mod.id] = 'error';
            if (toastFn) toastFn(`Falha ao carregar ${mod.name}`);
        }
        safeRender();
    }

    function deactivate(mod) {
        const ok = tryUnload(mod);
        if (ok) {
            moduleStates[mod.id] = 'unloaded';
            if (toastFn) toastFn(`${mod.name} desativado`);
        } else {
            if (toastFn) toastFn(`${mod.name} já está ativo — recarregue a página pra desativar`);
        }
        safeRender();
    }

    function handleClick(mod) {
        const state = moduleStates[mod.id] || 'unloaded';
        if (state === 'loading') return;
        if (state === 'loaded') { deactivate(mod); return; }
        activate(mod);
    }

    // ─── UI
    function buildUI(manifest) {
        const UID = "_hub";

        const style = document.createElement("style");
        style.setAttribute("data-hub", "1");
        style.textContent = `
        @keyframes hubFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        #${UID}{position:fixed;left:20px;bottom:20px;width:290px;font-family:'Courier New',monospace;font-size:12px;
        color:#ffe9c2;background:linear-gradient(160deg,#4a2b0f,#2a1608);
        border:3px solid #ffb020;box-shadow:0 0 0 2px #1a0d04,0 10px 30px rgba(0,0,0,.7);
        z-index:2147483647;overflow:hidden;user-select:none;animation:hubFade .2s ease-out;}
        #${UID}.hidden{display:none}
        #${UID} .hub-hdr{padding:9px 10px;background:linear-gradient(180deg,#5c3712,#3a2109);
        border-bottom:3px solid #ffb020;display:flex;align-items:center;justify-content:space-between;cursor:move}
        #${UID} .hub-title{font-weight:700;letter-spacing:1px;color:#ffd479;font-size:12px;text-transform:uppercase;
        display:flex;align-items:center;gap:6px}
        #${UID} .hub-hbtn{width:20px;height:20px;background:#2a1608;border:2px solid #ffb020;color:#ffd479;
        display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;font-weight:700}
        #${UID} .hub-hbtn:hover{background:#ffb020;color:#2a1608}
        #${UID} .hub-body{padding:8px}
        #${UID} .hub-item{display:flex;align-items:center;gap:8px;padding:7px 8px;margin-bottom:5px;
        background:rgba(255,176,32,.06);border:2px solid rgba(255,176,32,.25);cursor:pointer;transition:all .12s}
        #${UID} .hub-item:hover{background:rgba(255,176,32,.14);border-color:#ffb020}
        #${UID} .hub-item:last-child{margin-bottom:0}
        #${UID} .hub-icon{font-size:16px;width:22px;text-align:center;flex-shrink:0}
        #${UID} .hub-info{flex:1;min-width:0}
        #${UID} .hub-name{font-weight:700;color:#ffe9c2;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .hub-desc{font-size:9px;color:#c9a06a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #${UID} .hub-dot{width:8px;height:8px;flex-shrink:0;border:1px solid rgba(0,0,0,.3)}
        #${UID} .hub-dot.unloaded{background:#6b5233}
        #${UID} .hub-dot.loading{background:#ffd479;animation:hubPulse 1s infinite}
        #${UID} .hub-dot.loaded{background:#4ade80}
        #${UID} .hub-dot.error{background:#f04a4a}
        @keyframes hubPulse{0%,100%{opacity:1}50%{opacity:.3}}
        #${UID} .hub-ftr{padding:6px 10px;background:#1a0d04;border-top:2px solid rgba(255,176,32,.25);
        font-size:9px;color:#a67c4a;text-align:center}
        #${UID} .hub-toast{position:absolute;left:8px;right:8px;bottom:8px;background:#1a0d04;color:#ffe9c2;
        border:2px solid #ffb020;padding:6px 8px;font-size:10px;font-weight:700;text-align:center;
        opacity:0;transform:translateY(4px);transition:opacity .2s,transform .2s;pointer-events:none;z-index:20}
        #${UID} .hub-toast.show{opacity:1;transform:translateY(0)}
        `;
        document.head.appendChild(style);

        const root = document.createElement("div");
        root.id = UID;
        root.setAttribute("data-hub", "1");
        root.innerHTML = `
        <div class="hub-hdr" id="${UID}hdr">
            <div class="hub-title">🏨 Sang Hub</div>
            <div class="hub-hbtn" id="${UID}cls">✕</div>
        </div>
        <div class="hub-body" id="${UID}list"></div>
        <div class="hub-ftr">v${HUB_VERSION} · Atalho: ${SHORTCUT_LABEL}</div>
        <div class="hub-toast" id="${UID}toast"></div>
        `;
        document.body.appendChild(root);
        uiRoot = root;

        // Toast
        let toastTm = null;
        toastFn = msg => {
            const t = root.querySelector(`#${UID}toast`);
            t.textContent = msg; t.classList.add("show");
            clearTimeout(toastTm);
            toastTm = setTimeout(() => t.classList.remove("show"), 1600);
        };

        const listEl = root.querySelector(`#${UID}list`);
        const STATE_LABEL = { unloaded: "Clique pra abrir", loading: "Carregando...", loaded: "Ativo", error: "Erro — clique p/ tentar de novo" };

        renderListFn = () => {
            listEl.innerHTML = "";
            manifest.modules.filter(m => m.enabled !== false).forEach(mod => {
                const state = moduleStates[mod.id] || 'unloaded';
                const item = document.createElement("div");
                item.className = "hub-item";
                item.innerHTML = `
                    <span class="hub-dot ${state}"></span>
                    <span class="hub-icon">${mod.icon || "📦"}</span>
                    <div class="hub-info">
                        <div class="hub-name">${mod.name}</div>
                        <div class="hub-desc">${mod.description ? mod.description : STATE_LABEL[state]}</div>
                    </div>
                `;
                item.addEventListener("click", () => handleClick(mod));
                listEl.appendChild(item);
            });
        };
        renderListFn();

        // Fechar (esconde, não destrói — reabre com atalho)
        root.querySelector(`#${UID}cls`).addEventListener("click", () => {
            root.classList.add("hidden");
        });

        // Drag
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

        // Atalho de teclado — reabre mesmo depois do X
        document.addEventListener("keydown", (e) => {
            if (e.altKey && e.shiftKey && e.key.toLowerCase() === SHORTCUT_KEY) {
                e.preventDefault();
                root.classList.toggle("hidden");
            }
        });

        function kill() {
            document.querySelectorAll(`#${UID}, style[data-hub]`).forEach(el => el.remove());
        }
        window._hubUI = { kill };
    }

    async function boot() {
        const manifest = await fetchManifest();
        HLOG(`📋 Manifesto v${manifest.version || "?"} — ${manifest.modules.length} módulo(s) listado(s)`);

        // Autoload: módulos marcados pra rodar sozinhos (ex: bloqueador de
        // anúncios), sem precisar abrir o hub e clicar.
        manifest.modules
            .filter(m => m.enabled !== false && m.autoload === true)
            .forEach(mod => activate(mod));

        await waitForBody();
        buildUI(manifest);
    }

    boot().catch(e => HERR("❌ Falha ao iniciar o Hub:", e));

  } catch (fatalErr) {
    console.error('🟠 [Hub] Erro fatal não tratado:', fatalErr);
  }

})();
