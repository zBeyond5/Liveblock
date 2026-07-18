// ==UserScript==
// @name         LiveBlock v4.7 — [By Sang]
// @namespace    http://tampermonkey.net/
// @version      4.7.6
// @description  Bloqueador de anúncios furtivo — anti-detecção + GPT patch + UI Completa + Menu de Redes
// @author       Sang
// @match        *://*.habblive.in/bigclient*
// @match        *://*.habblet.city/bigclient*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/adblock.js
// @downloadURL  https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/adblock.js
// ==/UserScript==

(function() {
    'use strict';

    const LOG = (...args) => console.log('🔵 [LiveBlock]', ...args);
    const WARN = (...args) => console.warn('🟡 [LiveBlock]', ...args);
    const ERR = (...args) => console.error('🔴 [LiveBlock]', ...args);

    // ─── VERSÃO
    const VERSION = "4.7.6";
    // Raw do script no GitHub — usado pra COMPARAR a versão instalada com a mais recente
    const RAW_URL = "https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/adblock.js";
    // Página de visualização do arquivo (não a de edição) — só como fallback pro usuário abrir manualmente
    const REPO_VIEW_URL = "https://github.com/zBeyond5/Liveblock/blob/main/adblock.js";

    LOG('🚀 Script iniciado em', document.URL, `| v${VERSION}`);

  try { // ─── TRY/CATCH GLOBAL.

    // ─── REDES
    const SOCIALS = [
        { icon: "💬", label: "Discord",   url: "https://discord.gg/" },
        { icon: "📸", label: "Instagram", url: "https://www.instagram.com/chris.koff" },
        { icon: "▶️", label: "YouTube",   url: "https://www.youtube.com/@chriemici6134" },
        { icon: "🌐", label: "GitHub",      url: "https://github.com/zBeyond5" }
    ];

    // ─── DESTROI INSTÂNCIA ANTERIOR
    if (window._lb) { try { window._lb.kill(); LOG('🗑️ Instância anterior destruída'); } catch(e) {} }
    if (window.__lb) { try { window.__lb.kill(); } catch(e) {} }
    delete window._lb;
    delete window.__lb;

    // ─── CAPTURA ERROS DO REACT
    (function catchReactErrors() {
        window.addEventListener('error', (e) => {
            const msg = e.message || '';
            if (msg.includes('Minified React error #200') || msg.includes('createPortal')) {
                e.preventDefault();
                e.stopPropagation();
                WARN('⚠️ React #200 capturado e ignorado');
                return false;
            }
        }, true);

        window.addEventListener('unhandledrejection', (e) => {
            const msg = String(e.reason || '');
            if (msg.includes('Minified React error #200') || msg.includes('createPortal')) {
                e.preventDefault();
                WARN('⚠️ Promise rejection React #200 capturada');
            }
        });

        const origError = console.error;
        console.error = function(...args) {
            const msg = args.map(a => String(a)).join(' ');
            if (msg.includes('Minified React error #200') || msg.includes('createPortal')) {
                WARN('⚠️ React #200 capturado no console.error');
                return;
            }
            return origError.apply(console, args);
        };
    })();

    // ─── FAKE GPT
    (function fakeGPT() {
        try {
            if (window.googletag && typeof window.googletag.pubads === 'function') {
                try {
                    const origRefresh = window.googletag.pubads().refresh;
                    if (origRefresh) {
                        window.googletag.pubads().refresh = function() { return this; };
                    }
                } catch(e) {}
                return;
            }

            const fakeSlots = [];
            const pubads = {
                setTargeting: function() { return this; },
                getTargeting: function() { return {}; },
                set: function() { return this; },
                get: function() { return null; },
                setCategoryExclusion: function() { return this; },
                clearCategoryExclusions: function() { return this; },
                enableSingleRequest: function() { return this; },
                disableInitialLoad: function() { return this; },
                refresh: function(slots) {
                    if (slots) {
                        slots.forEach(slot => {
                            const divId = slot.getSlotElementId ? slot.getSlotElementId() : null;
                            if (divId) {
                                const div = document.getElementById(divId);
                                if (div && !div.querySelector('iframe[data-gpt]')) {
                                    const iframe = document.createElement('iframe');
                                    iframe.style.cssText = 'width:0;height:0;display:none;';
                                    iframe.setAttribute('data-gpt', 'true');
                                    div.appendChild(iframe);
                                }
                            }
                        });
                    }
                    return this;
                },
                getSlots: function() { return fakeSlots; },
                addEventListener: function() {},
                removeEventListener: function() {}
            };

            const gpt = {
                pubads: function() { return pubads; },
                defineSlot: function(adUnit, size, divId) {
                    const slot = {
                        getSlotElementId: function() { return divId; },
                        addService: function() { return this; },
                        setTargeting: function() { return this; },
                        getTargeting: function() { return {}; }
                    };
                    fakeSlots.push(slot);
                    return slot;
                },
                enableServices: function() {},
                display: function(divId) {
                    const div = document.getElementById(divId);
                    if (div && !div.querySelector('iframe[data-gpt]')) {
                        const iframe = document.createElement('iframe');
                        iframe.style.cssText = 'width:0;height:0;display:none;';
                        iframe.setAttribute('data-gpt', 'true');
                        div.appendChild(iframe);
                    }
                },
                cmd: { push: function(fn) { if (typeof fn === 'function') try { fn(); } catch(e) {} } },
                apiReady: true,
                push: function(fn) { if (typeof fn === 'function') try { fn(); } catch(e) {} }
            };

            Object.defineProperty(window, 'googletag', {
                value: gpt,
                enumerable: false,
                configurable: false,
                writable: false
            });

            LOG('✅ Fake GPT injetado com sucesso');
        } catch(e) {
            ERR('❌ Erro no Fake GPT (ignorado, não é fatal):', e);
        }
    })();

    // ─── CONFIG
    const KEY = "lb4cfg";
    const cfg = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();

    const S = {
        on:       cfg.on       ?? true,
        logs:     cfg.logs     ?? false,
        dom:      cfg.dom      ?? true,
        min:      cfg.min      ?? false,
        tab:      cfg.tab      ?? "ctrl",
        pos:      cfg.pos      ?? null,
        nFetch:   0,
        nXhr:     0,
        logItems: [],
        t0:       Date.now(),
        killFlag: false,
        injected: false
    };

    // ─── PATTERNS DE ANÚNCIO
    const PATTERNS = [
        /securepubads/i, /doubleclick\.net/i, /googlesyndication/i,
        /googleads/i, /gampad\/ads/i, /\/ads\?/i, /div-gpt-ad/i,
        /adservice/i, /adserver/i, /adnxs/i, /openx/i, /rubicon/i,
        /pubmatic/i, /indexexchange/i, /sovrn/i, /contextweb/i,
        /amazon-adsystem/i, /criteo/i, /casale/i, /adform/i
    ];

    const isAd = url => {
        if (!url) return false;
        const str = String(url);
        return PATTERNS.some(rx => rx.test(str));
    };

    // ─── STEALTH CONSOLE
    const _origLog = console.log;
    const _origWarn = console.warn;
    const _origError = console.error;
    console.log = function(...a) {
        const s = a.map(x => String(x)).join(' ');
        if (/adblock|ad-block/i.test(s)) return;
        _origLog.apply(console, a);
    };
    console.warn = function(...a) {
        const s = a.map(x => String(x)).join(' ');
        if (/adblock|ad-block/i.test(s)) return;
        _origWarn.apply(console, a);
    };
    console.error = function(...a) {
        const s = a.map(x => String(x)).join(' ');
        if (/adblock|ad-block/i.test(s)) return;
        if (/Minified React error #200|createPortal/i.test(s)) return;
        _origError.apply(console, a);
    };

    // ─── CLEAN WINDOW
    const cleanWindow = () => {
        const props = Object.getOwnPropertyNames(window);
        const bad = ['__lb', '_lb', 'lb', 'adblock', 'adblocker', 'ublock', 'adguard'];
        props.forEach(p => {
            const low = p.toLowerCase();
            if (bad.some(b => low.includes(b))) {
                try { delete window[p]; } catch(e) {}
            }
        });
    };
    cleanWindow();

    // ─── HOOK FETCH
    const _fetch = window.fetch;
    window.fetch = function(...a) {
        const url = a[0]?.url || a[0];
        if (S.on && !S.killFlag && isAd(url)) {
            S.nFetch++;
            push("FETCH", String(url).slice(0, 60));
            return Promise.resolve(new Response(null, { status: 204 }));
        }
        return _fetch.apply(this, a);
    };

    // ─── HOOK XHR
    const _XHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const x = new _XHR();
        let blocked = false;
        const _open = x.open, _send = x.send;
        x.open = function(m, url, ...r) {
            blocked = S.on && !S.killFlag && isAd(url);
            if (blocked) {
                S.nXhr++;
                push("XHR", String(url || "").slice(0, 60));
                return;
            }
            return _open.call(this, m, url, ...r);
        };
        x.send = function(...a) {
            if (blocked) {
                setTimeout(() => {
                    try { if (x.onload) x.onload(); } catch(e) {}
                }, 0);
                return;
            }
            return _send.apply(this, a);
        };
        return x;
    };

    // ─── AD SELECTORS
    const AD_SEL = [
        "iframe[src*='doubleclick']",
        "iframe[src*='googlesyndication']",
        "[id*='div-gpt-ad']",
        "[class*='ad-block']",
        "[id*='ad-block']"
    ].join(",");

    const PROTECTED_IDS = ['root', 'dz', 'nitro-events', 'nitro-coins', 'client-box', 'app'];
    const PROTECTED_CLASSES = ['client-box', 'box-header', 'nitro-events', 'nitro-coins'];

    // NOTE: "protected" é palavra reservada em modo estrito ('use strict') e
    // quebrava a sintaxe do script inteiro. Renomeado para "isElementProtected".
    const isElementProtected = (el) => {
        let current = el;
        while (current && current !== document.body) {
            if (current.id && PROTECTED_IDS.includes(current.id)) return true;
            if (current.className && typeof current.className === 'string' &&
                PROTECTED_CLASSES.some(c => current.className.includes(c))) return true;
            current = current.parentElement;
        }
        return false;
    };

    const removeAds = () => {
        if (!S.on || S.killFlag || !S.dom) return;
        let n = 0;
        try {
            document.querySelectorAll(AD_SEL).forEach(el => {
                if (!isElementProtected(el)) {
                    el.remove();
                    n++;
                }
            });
        } catch(e) {}

        try {
            const all = document.querySelectorAll('div, section, aside');
            for (let el of all) {
                if (isElementProtected(el)) continue;

                const txt = (el.innerText || '').toLowerCase();
                if ((txt.includes('bloqueador') || txt.includes('adblock') || txt.includes('desabilite')) &&
                    el.offsetWidth > 50 && el.offsetHeight > 50) {
                    const st = window.getComputedStyle(el);
                    if (st.position === 'fixed' || st.position === 'absolute' || st.zIndex > 1000) {
                        el.remove(); n++;
                    }
                }
            }
            document.querySelectorAll('[style*="background:black"], [style*="background:#000"]').forEach(el => {
                if (!isElementProtected(el)) {
                    const st = window.getComputedStyle(el);
                    if (st.position === 'fixed' || st.position === 'absolute') { el.remove(); n++; }
                }
            });
            document.body.style.overflow = 'auto';
            document.body.style.pointerEvents = 'auto';
        } catch(e) {}
        if (n) push("DOM", `Removidos ${n}`);
    };

    // ─── LOG
    let _renderLogs = () => {}, _renderStats = () => {}, _toast = () => {};

    const push = (type, text, force = false) => {
        if (S.logs || force) {
            S.logItems.unshift({ t: new Date().toLocaleTimeString(), type, text });
            if (S.logItems.length > 100) S.logItems.length = 100;
            _renderLogs();
        }
        _renderStats(); // sempre atualiza Fetch/XHR na tela, independente do toggle de Logs
    };

    // ─── TIMERS
    let obs = null;

    const initObserver = () => {
        if (obs) obs.disconnect();
        obs = new MutationObserver(removeAds);
        obs.observe(document.documentElement, { childList: true, subtree: true });
    };

    const refreshLoop = () => {
        setInterval(() => {
            if (S.killFlag) return;
            cleanWindow();
            removeAds();
        }, 120000);
    };

    // ─── UI COMPLETA
    function injectUI() {
        if (S.injected) return;

        try {
            const UID = "_lb" + Math.random().toString(36).slice(2, 8);

            const style = document.createElement("style");
            style.setAttribute("data-lb", "1");
            style.textContent = `
            @keyframes lbFade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
            #${UID}{position:fixed;top:20px;right:20px;width:300px;font-family:system-ui,sans-serif;font-size:12px;color:#e0eaff;
            background:linear-gradient(160deg,#0d1525,#080e1c);border-radius:16px;
            border:1px solid rgba(100,140,255,.15);box-shadow:0 8px 32px rgba(0,0,0,.6);
            z-index:2147483647;overflow:visible;user-select:none;animation:lbFade .25s ease-out;}
            #${UID}.min .lb-body{display:none}
            #${UID} .lb-hdr{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;cursor:move}
            #${UID} .lb-brand{display:flex;align-items:center;gap:8px}
            #${UID} .lb-av{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#1a2840,#0f1a30);border:1px solid rgba(100,160,255,.2);overflow:hidden;flex-shrink:0}
            #${UID} .lb-av img{width:100%;height:100%;object-fit:cover}
            #${UID} .lb-bname{font-weight:700;font-size:12px;color:#f0f6ff}
            #${UID} .lb-timer{font-size:10px;color:#6090d0}
            #${UID} .lb-hbtn{width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);color:#8aabdd;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px}
            #${UID} .lb-hbtn:hover{background:rgba(255,255,255,.08)}
            #${UID} .lb-body{padding:10px;animation:lbFade .2s ease-out;position:relative}
            #${UID} .lb-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
            #${UID} .lb-stat{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px 10px}
            #${UID} .lb-slabel{font-size:9px;color:#6080aa;text-transform:uppercase;letter-spacing:.4px}
            #${UID} .lb-sval{font-size:18px;font-weight:700;color:#e8f0ff;font-variant-numeric:tabular-nums}
            #${UID} .lb-bar{height:2px;background:linear-gradient(90deg,#1e3a7a,#0e8a50);border-radius:2px;margin-bottom:8px;width:0%;transition:width .8s}
            #${UID} .lb-row{display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-top:1px solid rgba(255,255,255,.04)}
            #${UID} .lb-row:first-child{border-top:none}
            #${UID} .lb-rlabel{font-size:11px;color:#8aaad0;display:flex;align-items:center;gap:6px}
            #${UID} .lb-dot{width:5px;height:5px;border-radius:50%;display:inline-block}
            #${UID} .lb-dot.g{background:#30d090;box-shadow:0 0 6px rgba(48,208,144,.4)}
            #${UID} .lb-dot.b{background:#50a0ff;box-shadow:0 0 6px rgba(80,160,255,.3)}
            #${UID} .lb-dot.a{background:#f0a030;box-shadow:0 0 6px rgba(240,160,48,.3)}
            #${UID} .lb-tgl{width:50px;height:22px;border-radius:11px;cursor:pointer;border:1px solid rgba(255,255,255,.06);overflow:hidden;flex-shrink:0;transition:all .2s}
            #${UID} .lb-tgl.on{background:linear-gradient(135deg,#0e8a50,#0aad68);border-color:rgba(30,220,110,.2)}
            #${UID} .lb-tgl.off{background:linear-gradient(135deg,#7a1520,#9a1828);border-color:rgba(240,60,80,.2)}
            #${UID} .lb-tgltxt{display:flex;align-items:center;justify-content:center;height:100%;font-size:8px;font-weight:700;letter-spacing:.3px;color:rgba(255,255,255,.9)}
            #${UID} .lb-acts{display:flex;gap:4px;margin-top:8px}
            #${UID} .lb-act{flex:1;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);color:#8ab0d8;font-size:10px;font-weight:600;text-align:center;cursor:pointer;transition:all .15s}
            #${UID} .lb-act:hover{background:rgba(255,255,255,.06);color:#b0d0f0}
            #${UID} .lb-logs{height:120px;overflow-y:auto;border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:4px;margin-top:6px;display:flex;flex-direction:column;gap:2px;scrollbar-width:thin;scrollbar-color:rgba(60,100,180,.2) transparent}
            #${UID} .lb-log{padding:4px 6px;border-radius:4px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.03);word-break:break-all}
            #${UID} .lb-logtime{font-size:8px;color:#3a5888}
            #${UID} .lb-logtext{font-size:9px;color:#7090b8}
            #${UID} .lb-toast{position:absolute;left:10px;right:10px;bottom:10px;background:rgba(15,23,42,.95);color:#f8fbff;border:1px solid rgba(148,163,184,.12);border-radius:8px;padding:6px 10px;font-size:11px;font-weight:600;text-align:center;opacity:0;transform:translateY(4px);transition:opacity .2s,transform .2s;pointer-events:none;z-index:20}
            #${UID} .lb-toast.show{opacity:1;transform:translateY(0)}
            #${UID} .lb-pop{position:absolute;bottom:44px;left:10px;right:10px;background:#0d1525;
            border:1px solid rgba(100,140,255,.15);border-radius:12px;padding:6px;display:none;
            flex-direction:column;gap:2px;box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:30}
            #${UID} .lb-pop.show{display:flex}
            #${UID} .lb-poplink{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;
            color:#c0d8ff;font-size:11px;font-weight:600;text-decoration:none;cursor:pointer;transition:background .15s}
            #${UID} .lb-poplink:hover{background:rgba(255,255,255,.06)}
            `;
            document.head.appendChild(style);

            const root = document.createElement("div");
            root.id = UID;
            root.setAttribute("data-lb", "1");

            root.innerHTML = `
            <div class="lb-hdr" id="${UID}hdr">
                <div class="lb-brand">
                    <div class="lb-av"><img src="https://habbo.city/habbo-imaging/walkgif?figure=hd-180-1.lg-3116-1198-92.ch-989999893-2023-1035.fa-990003751-2070.hr-802-39.sh-295-62.ea-990002655-64.cc-990002809-100&direction=2&head_direction=3&gesture=sml&action=wav&size=l" alt=""></div>
                    <div><div class="lb-bname">LiveBlock <span style="color:#4a6ea0;font-weight:600;font-size:9px;">v${VERSION}</span></div><div class="lb-timer" id="${UID}tmr">00:00:00</div></div>
                </div>
                <div style="display:flex;gap:4px;">
                    <div class="lb-hbtn" id="${UID}min">_</div>
                    <div class="lb-hbtn" id="${UID}cls">✕</div>
                </div>
            </div>
            <div class="lb-body" id="${UID}body">
                <div class="lb-stats">
                    <div class="lb-stat"><div class="lb-slabel">Fetch</div><div class="lb-sval" id="${UID}nf">0</div></div>
                    <div class="lb-stat"><div class="lb-slabel">XHR</div><div class="lb-sval" id="${UID}nx">0</div></div>
                </div>
                <div class="lb-bar" id="${UID}bar"></div>
                <div class="lb-row">
                    <div class="lb-rlabel"><span class="lb-dot g"></span>Status</div>
                    <div class="lb-tgl on" id="${UID}tog0"><div class="lb-tgltxt">ON</div></div>
                </div>
                <div class="lb-row">
                    <div class="lb-rlabel"><span class="lb-dot b"></span>Logs</div>
                    <div class="lb-tgl on" id="${UID}tog1"><div class="lb-tgltxt">ON</div></div>
                </div>
                <div class="lb-row">
                    <div class="lb-rlabel"><span class="lb-dot a"></span>DOM</div>
                    <div class="lb-tgl on" id="${UID}tog2"><div class="lb-tgltxt">ON</div></div>
                </div>
                <div class="lb-acts">
                    <div class="lb-act" id="${UID}aClean">⚡ Limpar</div>
                    <div class="lb-act" id="${UID}aLogs">🗑 Logs</div>
                    <div class="lb-act" id="${UID}aSocial">🔗 Redes</div>
                    <div class="lb-act" id="${UID}aUpdate">🔄</div>
                </div>
                <div class="lb-pop" id="${UID}pop"></div>
                <div style="margin-top:6px;display:none;" id="${UID}pLogs">
                    <div class="lb-logs" id="${UID}logbox"></div>
                </div>
            </div>
            <div class="lb-toast" id="${UID}toast"></div>
            `;

            document.body.appendChild(root);

            if (S.pos) { root.style.left = S.pos.l+"px"; root.style.top = S.pos.t+"px"; root.style.right = "auto"; }
            if (S.min) root.classList.add("min");

            // Timer
            const tmr = root.querySelector(`#${UID}tmr`);
            const timerInterval = setInterval(() => {
                const s = Math.floor((Date.now() - S.t0) / 1000);
                const h = String(Math.floor(s/3600)).padStart(2,"0");
                const m = String(Math.floor((s%3600)/60)).padStart(2,"0");
                const sec = String(s%60).padStart(2,"0");
                tmr.textContent = `${h}:${m}:${sec}`;
            }, 1000);

            // Toast
            let toastTm = null;
            _toast = msg => {
                const t = root.querySelector(`#${UID}toast`);
                t.textContent = msg; t.classList.add("show");
                clearTimeout(toastTm);
                toastTm = setTimeout(() => t.classList.remove("show"), 1500);
            };

            // Stats
            _renderStats = () => {
                root.querySelector(`#${UID}nf`).textContent = S.nFetch;
                root.querySelector(`#${UID}nx`).textContent = S.nXhr;
                const bar = root.querySelector(`#${UID}bar`);
                bar.style.width = Math.min(100, (S.nFetch + S.nXhr) * 2.5) + "%";
            };

            // Logs
            const logBox = root.querySelector(`#${UID}logbox`);
            _renderLogs = () => {
                if (!S.logItems.length) { logBox.innerHTML = '<div style="color:#3a5888;text-align:center;padding:8px;font-size:9px;">Nenhum log.</div>'; return; }
                logBox.innerHTML = S.logItems.slice(0, 30).map(l =>
                    `<div class="lb-log"><div class="lb-logtime">${l.t}</div><div class="lb-logtext"><span style="color:${l.type==='FETCH'?'#6ab0ff':l.type==='XHR'?'#50d8b0':'#f0a030'};font-weight:700;">${l.type}</span> ${l.text}</div></div>`
                ).join("");
            };

            // Toggles
            const toggles = [
                { id: `${UID}tog0`, key: "on", on: "ON", off: "OFF" },
                { id: `${UID}tog1`, key: "logs", on: "ON", off: "OFF" },
                { id: `${UID}tog2`, key: "dom", on: "ON", off: "OFF" },
            ];
            toggles.forEach(({ id, key, on, off }) => {
                const el = root.querySelector(`#${id}`);
                el.addEventListener("click", () => {
                    S[key] = !S[key];
                    el.classList.toggle("on", S[key]);
                    el.classList.toggle("off", !S[key]);
                    el.querySelector(".lb-tgltxt").textContent = S[key] ? on : off;
                    push("STATE", `${key} ${S[key]?"on":"off"}`, true);
                    _toast(S[key] ? on : off);
                    save();
                });
                el.classList.toggle("on", S[key]);
                el.classList.toggle("off", !S[key]);
                el.querySelector(".lb-tgltxt").textContent = S[key] ? on : off;
            });

            // Popover de redes sociais (leve: sem timers, reaproveita o mesmo DOM)
            const popEl = root.querySelector(`#${UID}pop`);
            popEl.innerHTML = SOCIALS.map(s =>
                `<a class="lb-poplink" href="${s.url}" target="_blank" rel="noopener">${s.icon} ${s.label}</a>`
            ).join("");

            root.querySelector(`#${UID}aSocial`).addEventListener("click", (e) => {
                e.stopPropagation();
                popEl.classList.toggle("show");
            });

            document.addEventListener("click", (e) => {
                if (!popEl.contains(e.target) && e.target.id !== `${UID}aSocial`) {
                    popEl.classList.remove("show");
                }
            });

            // Ações
            root.querySelector(`#${UID}aClean`).addEventListener("click", () => { push("ACTION","Limpeza manual",true); _toast("Limpando..."); removeAds(); });
            root.querySelector(`#${UID}aLogs`).addEventListener("click", () => { S.logItems = []; _renderLogs(); _toast("Logs limpos"); });
            root.querySelector(`#${UID}aUpdate`).addEventListener("click", async () => {
                _toast("Checando versão...");
                push("ACTION", "Checagem de atualização iniciada", true);
                try {
                    const res = await fetch(RAW_URL + "?t=" + Date.now(), { cache: "no-store" });
                    const text = await res.text();
                    const match = text.match(/@version\s+([\d.]+)/);
                    if (!match) {
                        _toast("Não consegui ler a versão remota");
                        return;
                    }
                    const remote = match[1];
                    const rParts = remote.split(".").map(Number);
                    const lParts = VERSION.split(".").map(Number);
                    let isNewer = false;
                    for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
                        const r = rParts[i] || 0, l = lParts[i] || 0;
                        if (r > l) { isNewer = true; break; }
                        if (r < l) { break; }
                    }
                    if (isNewer) {
                        _toast(`Nova versão disponível: v${remote}`);
                        push("UPDATE", `Nova versão v${remote} encontrada (atual: v${VERSION})`, true);
                    } else {
                        _toast(`Você já está atualizado (v${VERSION})`);
                    }
                } catch (e) {
                    ERR('❌ Erro ao checar versão remota:', e);
                    _toast("Falha ao checar. Abrindo GitHub...");
                    window.open(REPO_VIEW_URL, "_blank");
                }
            });

            // Minimizar
            root.querySelector(`#${UID}min`).addEventListener("click", () => {
                S.min = !S.min; root.classList.toggle("min", S.min); save();
            });

            // Fechar
            root.querySelector(`#${UID}cls`).addEventListener("click", kill);

            // Drag
            const hdr = root.querySelector(`#${UID}hdr`);
            let drag = null;
            hdr.addEventListener("mousedown", e => {
                if (e.target.closest(".lb-hbtn")) return;
                const r = root.getBoundingClientRect();
                drag = { x: e.clientX - r.left, y: e.clientY - r.top };
                root.style.left = r.left+"px"; root.style.top = r.top+"px"; root.style.right = "auto";
            });
            const onMove = e => {
                if (!drag) return;
                root.style.left = Math.max(0, e.clientX - drag.x)+"px";
                root.style.top = Math.max(0, e.clientY - drag.y)+"px";
                S.pos = { l: parseInt(root.style.left), t: parseInt(root.style.top) };
            };
            const onUp = () => { if (drag) save(); drag = null; };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);

            // Duplo clique no header = minimizar
            hdr.addEventListener("dblclick", () => {
                S.min = !S.min; root.classList.toggle("min", S.min); save();
            });

            // Toggle logs
            let logsVisible = false;
            root.querySelector(`#${UID}tog1`).addEventListener("click", () => {
                logsVisible = !logsVisible;
                root.querySelector(`#${UID}pLogs`).style.display = logsVisible ? "block" : "none";
            });

            function kill() {
                S.killFlag = true;
                clearInterval(timerInterval);
                clearTimeout(toastTm);
                if (obs) obs.disconnect();
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                root.remove();
                style.remove();
                try { delete window._lb; } catch(e) {}
                try { delete window.__lb; } catch(e) {}
                cleanWindow();
            }

            window._lb = { kill, S };

            _renderStats();
            _renderLogs();
            push("INIT", "LiveBlock v4.7 ativo", true);
            _toast("LiveBlock ativo");

            S.injected = true; // só marca como injetado depois que tudo deu certo
            LOG('✅ UI injetada com sucesso!');

        } catch(e) {
            ERR('❌ Erro ao injetar UI (nova tentativa será feita):', e);
        }
    }

    // ─── SAVE
    const save = () => {
        try {
            localStorage.setItem(KEY, JSON.stringify({
                on: S.on, logs: S.logs, dom: S.dom,
                min: S.min, tab: S.tab, pos: S.pos
            }));
        } catch {}
    };

    // ─── INJEÇÃO AGRESSIVA COM FALLBACK
    let injectAttempts = 0;
    const maxAttempts = 25;

    const aggressiveInject = () => {
        injectAttempts++;

        if (S.injected) return;

        if (!document.body) {
            if (injectAttempts < maxAttempts) {
                setTimeout(aggressiveInject, 200);
            } else {
                ERR('❌ Falha ao encontrar body após várias tentativas');
            }
            return;
        }

        try {
            initObserver();
            injectUI();
            removeAds();
            refreshLoop();
        } catch(e) {
            ERR('❌ Erro durante injeção:', e);
            if (injectAttempts < maxAttempts) {
                setTimeout(aggressiveInject, 400);
            }
        }
    };

    if (document.body) {
        aggressiveInject();
    } else {
        document.addEventListener('DOMContentLoaded', aggressiveInject);
        setTimeout(aggressiveInject, 1000);
    }

    // ─── WINDOW STEALTH
    const _lbSym = Symbol('lb');
    Object.defineProperty(window, '_lb', {
        get() { return window[_lbSym]; },
        set(v) { window[_lbSym] = v; },
        enumerable: false,
        configurable: false
    });

    Object.defineProperty(window, '__lb', {
        get: () => undefined,
        enumerable: false,
        configurable: false
    });

    LOG('✅ LiveBlock v4.7 inicializado com sucesso');

  } catch (fatalErr) {
    // Se algo não previsto quebrar em qualquer ponto acima, loga em vez de
    // travar o script inteiro em silêncio.
    console.error('🔴 [LiveBlock] Erro fatal não tratado:', fatalErr);
  }

})();
