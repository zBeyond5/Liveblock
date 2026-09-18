(function() {
    'use strict';

    // CONSOLE FILTER — único, no topo absoluto, antes de qualquer hook.
    const _origLog   = console.log;
    const _origWarn  = console.warn;
    const _origError = console.error;
    const _isRuido = s =>
        /adblock|ad-block/i.test(s) ||
        /Minified React error #200|createPortal/i.test(s);

    console.log   = (...a) => { if (!_isRuido(a.map(String).join(' '))) _origLog.apply(console, a); };
    console.warn  = (...a) => { if (!_isRuido(a.map(String).join(' '))) _origWarn.apply(console, a); };
    console.error = (...a) => { if (!_isRuido(a.map(String).join(' '))) _origError.apply(console, a); };

    // CLEANUP PRÉVIO — idempotência de reload
    if (window._blocklive) {
        try { if (typeof window._blocklive.kill === 'function') window._blocklive.kill(); } catch(e) {}
        try { delete window._blocklive; } catch(e) {}
    }

    // LOG
    const LOG  = (...a) => console.log  ('🔵 [LiveBlock]', ...a);
    const WARN = (...a) => console.warn ('🟡 [LiveBlock]', ...a);
    const ERR  = (...a) => console.error('🔴 [LiveBlock]', ...a);

    // VERSION
    const VERSION = "4.7.9";
    const RAW_URL = "https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/adblock.js";
    const REPO_VIEW_URL = "https://github.com/zBeyond5/Liveblock/blob/main/adblock.js";
    const FONT_URL = "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap";

    LOG('🚀 Script iniciado em', document.URL, `| v${VERSION}`);

  try {

    // FONT — uma vez por página, igual ao hub2. Outros módulos reusam.
    if (!document.querySelector('link[data-sang-font]')) {
        const fl = document.createElement('link');
        fl.rel = 'stylesheet';
        fl.href = FONT_URL;
        fl.setAttribute('data-sang-font', '1');
        document.head.appendChild(fl);
    }

    // REDES
    const SOCIALS = [
        { icon: "💬", label: "Discord",   url: "https://discord.gg/" },
        { icon: "📸", label: "Instagram", url: "https://www.instagram.com/chris.koff" },
        { icon: "▶️", label: "YouTube",   url: "https://www.youtube.com/@chriemici6134" },
        { icon: "🌐", label: "GitHub",    url: "https://github.com/zBeyond5" }
    ];

    // CAPTURA ERROS REACT — só listeners. O filter do console já está no topo.
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
    })();

    // FAKE GPT
    let _origGT = null;
    (function fakeGPT() {
        try {
            _origGT = window.googletag;

            if (window.googletag && typeof window.googletag.pubads === 'function') {
                try {
                    const origRefresh = window.googletag.pubads().refresh;
                    if (origRefresh) {
                        window.googletag.pubads().refresh = function() { return this; };
                    }
                } catch(e) {}
                return;
            }

            const injetarIframeStub = (divId) => {
                const div = document.getElementById(divId);
                if (div && !div.querySelector('iframe[data-gpt]')) {
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'width:0;height:0;display:none;';
                    iframe.setAttribute('data-gpt', 'true');
                    div.appendChild(iframe);
                }
            };

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
                            if (divId) injetarIframeStub(divId);
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
                display: function(divId) { injetarIframeStub(divId); },
                cmd: { push: function(fn) { if (typeof fn === 'function') try { fn(); } catch(e) {} } },
                apiReady: true,
                push: function(fn) { if (typeof fn === 'function') try { fn(); } catch(e) {} }
            };

            Object.defineProperty(window, 'googletag', {
                value: gpt,
                enumerable: false,
                configurable: true,
                writable: false
            });

            LOG('✅ Fake GPT injetado com sucesso');
        } catch(e) {
            ERR('❌ Erro no Fake GPT (ignorado, não é fatal):', e);
        }
    })();

    // CONFIG
    const KEY = "lb4cfg";
    const cfg = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();

    // STATE
    const S = {
        on:       cfg.on       ?? true,
        logs:     cfg.logs     ?? false,
        dom:      cfg.dom      ?? true,
        min:      cfg.min      ?? false,
        pos:      cfg.pos      ?? null,
        nFetch:   0,
        nXhr:     0,
        logItems: [],
        t0:       Date.now(),
        killFlag: false,
        injected: false,
        dying:    false
    };

    // PATTERNS — regex única (mais barata que array de 16 patterns .some()).
    const AD_RX = /securepubads|doubleclick\.net|googlesyndication|googleads|gampad\/ads|\/ads\?|div-gpt-ad|adservice|adserver|adnxs|openx|rubicon|pubmatic|indexexchange|sovrn|contextweb|amazon-adsystem|criteo|casale|adform/i;
    const isAd = url => !!url && AD_RX.test(String(url));

    // HELPERS
    const cleanWindow = () => {
        const props = Object.getOwnPropertyNames(window);
        const bad = ['__blocklive', '_blocklive', 'lb', 'adblock', 'adblocker', 'ublock', 'adguard'];
        props.forEach(p => {
            const low = p.toLowerCase();
            if (bad.some(b => low.includes(b))) {
                try { delete window[p]; } catch(e) {}
            }
        });
    };
    cleanWindow();

    // HOOKS — patches de prototype, desfeitos em kill().
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

    // DOM — ad selectors e proteção
    const AD_SEL = [
        "iframe[src*='doubleclick']",
        "iframe[src*='googlesyndication']",
        "[id*='div-gpt-ad']",
        "[class*='ad-block']",
        "[id*='ad-block']"
    ].join(",");

    const PROTECTED_IDS = ['root', 'dz', 'nitro-events', 'nitro-coins', 'client-box', 'app'];
    const PROTECTED_CLASSES = ['client-box', 'box-header', 'nitro-events', 'nitro-coins'];

    const protectedCache = new WeakMap();
    const isElementProtected = (el) => {
        if (protectedCache.has(el)) return protectedCache.get(el);
        let current = el;
        let result = false;
        while (current && current !== document.body) {
            if (current.id && PROTECTED_IDS.includes(current.id)) { result = true; break; }
            if (current.id && current.id.startsWith('_hub')) { result = true; break; }
            if (current.dataset && current.dataset.hub) { result = true; break; }
            if (current.dataset && current.dataset.sangUi !== undefined) { result = true; break; }
            if (typeof current.className === 'string' &&
                PROTECTED_CLASSES.some(c => current.className.includes(c))) { result = true; break; }
            current = current.parentElement;
        }
        protectedCache.set(el, result);
        return result;
    };

    const removeAds = () => {
        if (!S.on || S.killFlag || !S.dom) return;
        let n = 0;
        try {
            document.querySelectorAll(AD_SEL).forEach(el => {
                if (!isElementProtected(el)) { el.remove(); n++; }
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
            // Só mexe no body se algo foi de fato removido — evita reflow à toa.
            if (n > 0) {
                document.body.style.overflow = 'auto';
                document.body.style.pointerEvents = 'auto';
            }
        } catch(e) {}
        if (n) push("DOM", `Removidos ${n}`);
    };

    let removeAdsTimer = null;
    const scheduleRemoveAds = () => {
        if (removeAdsTimer) return;
        removeAdsTimer = setTimeout(() => { removeAdsTimer = null; removeAds(); }, 150);
    };

    // LOG (helpers de UI — preenchidos em injectUI)
    let _renderLogs = () => {}, _renderStats = () => {}, _toast = () => {};

    const push = (type, text, force = false) => {
        if (S.logs || force) {
            S.logItems.unshift({ t: new Date().toLocaleTimeString(), type, text });
            if (S.logItems.length > 100) S.logItems.length = 100;
            _renderLogs();
        }
        _renderStats();
    };

    // TIMERS/OBSERVERS (referências para o kill)
    let obs = null;
    let bodyWatcher = null;
    let timerInterval = null;
    let toastTm = null;
    let refreshTimer = null;
    let UIDAtual = null;
    let acUI = null;              // AbortController de listeners do painel
    let killFn = null;            // kill real (definido em injectUI)

    const initObserver = () => {
        if (obs) obs.disconnect();
        // Exceção consciente à §3 (observer por escopo): adblocking precisa
        // detectar injeção em qualquer ponto do DOM, não só num container.
        obs = new MutationObserver(scheduleRemoveAds);
        obs.observe(document.documentElement, { childList: true, subtree: true });
    };

    // SPA que troca <body> leva a UI junto. Reinjeta quando detecta ausência.
    const vigiarBody = () => {
        if (bodyWatcher) bodyWatcher.disconnect();
        bodyWatcher = new MutationObserver(() => {
            if (S.killFlag || S.dying) return;
            if (S.injected && UIDAtual && !document.getElementById(UIDAtual)) {
                S.injected = false;
                injectUI();
            }
        });
        bodyWatcher.observe(document.documentElement, { childList: true });
    };

    // Exceção consciente à §3 (evitar setInterval): sweeper de segurança
    // a cada 5min. Event-driven cobre 99% dos casos; este é o cinto de
    // segurança pra ads que se reintroduzem por caminhos que o observer
    // não vê (innerHTML silencioso, Shadow DOM de terceiros).
    const refreshLoop = () => {
        refreshTimer = setInterval(() => {
            if (S.killFlag || S.dying) return;
            removeAds();
        }, 300000);
    };

    // UI
    function injectUI() {
        if (S.injected || S.dying) return;

        try {
            // Limpa restos de injeção anterior (body trocado sem remover style).
            document.querySelectorAll('style[data-lb], div[data-lb]').forEach(el => el.remove());

            const UID = "_blocklive" + Math.random().toString(36).slice(2, 8);
            UIDAtual = UID;

            // AbortController agrupa todos os listeners do painel — §3.
            acUI = new AbortController();
            const sig = acUI.signal;

            const style = document.createElement("style");
            style.setAttribute("data-lb", "1");
            style.setAttribute("data-sang-ui", "");
            style.setAttribute("data-hub", "1");
            style.textContent = `
            @keyframes lbFade{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}
            @keyframes lbShimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
            @keyframes lbShine{to{background-position:-200% center}}
            @keyframes lbPulse{0%,100%{opacity:1}50%{opacity:.35}}

            #${UID}{
                --lb-cyan:#22d3ee; --lb-violet:#a78bfa;
                --lb-grad:linear-gradient(120deg,var(--lb-cyan),var(--lb-violet));
                --lb-ok:#34d399; --lb-err:#fb7185; --lb-muted:#8b8fa3;

                position:fixed;top:20px;right:20px;width:320px;
                font-family:'Geist',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;
                font-size:12px;color:#f1f2f8;
                background:linear-gradient(175deg,rgba(20,20,28,0.92),rgba(9,9,14,0.97));
                backdrop-filter:blur(18px) saturate(140%);
                -webkit-backdrop-filter:blur(18px) saturate(140%);
                border:1px solid rgba(255,255,255,0.08);
                border-radius:20px;
                box-shadow:0 20px 50px rgba(0,0,0,0.55),0 2px 8px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06);
                z-index:2147483647;overflow:hidden;user-select:none;
                animation:lbFade .3s cubic-bezier(0.16,1,0.3,1);
            }
            #${UID}::before{
                content:'';position:absolute;top:0;left:0;right:0;height:2px;
                background:var(--lb-grad);background-size:200% 100%;
                animation:lbShimmer 4s linear infinite;
                z-index:2;
            }
            #${UID}.min .lb-body{display:none}

            #${UID} .lb-hdr{
                padding:12px 14px;
                border-bottom:1px solid rgba(255,255,255,0.06);
                display:flex;align-items:center;justify-content:space-between;
                cursor:move;position:relative;
            }
            #${UID} .lb-brand{display:flex;align-items:center;gap:10px;min-width:0}
            #${UID} .lb-av{
                width:32px;height:32px;border-radius:10px;
                background:rgba(255,255,255,0.04);
                border:1px solid rgba(255,255,255,0.08);
                box-shadow:0 0 16px rgba(34,211,238,0.15);
                padding:4px;box-sizing:border-box;
                display:flex;align-items:center;justify-content:center;
                flex-shrink:0;
            }
            #${UID} .lb-av img{width:100%;height:100%;object-fit:cover;border-radius:6px;display:block}

            #${UID} .lb-bname{
                font-weight:800;font-size:12.5px;letter-spacing:.04em;white-space:nowrap;
                background:linear-gradient(100deg,var(--lb-cyan) 0%,var(--lb-violet) 35%,#fff 50%,var(--lb-violet) 65%,var(--lb-cyan) 100%);
                background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
                animation:lbShine 3.2s linear infinite;
            }
            #${UID} .lb-vtag{color:var(--lb-muted);font-weight:600;font-size:9px;letter-spacing:.05em;margin-left:2px}
            #${UID} .lb-timer{font-size:9.5px;color:var(--lb-muted);margin-top:3px;font-variant-numeric:tabular-nums;font-family:'Geist Mono',ui-monospace,Menlo,Consolas,monospace}

            #${UID} .lb-hbtn{
                width:26px;height:26px;border-radius:8px;
                background:rgba(255,255,255,0.04);
                border:1px solid rgba(255,255,255,0.08);
                color:#c7cad6;
                display:flex;align-items:center;justify-content:center;
                cursor:pointer;font-size:12px;font-family:inherit;
                transition:all .18s cubic-bezier(0.16,1,0.3,1);
            }
            #${UID} .lb-hbtn:hover{
                color:#0b0b10;background:var(--lb-grad);
                border-color:transparent;
                box-shadow:0 0 14px rgba(34,211,238,0.35);
                transform:translateY(-1px);
            }
            #${UID} .lb-hbtn:active{transform:translateY(0) scale(.94)}

            #${UID} .lb-body{padding:14px;position:relative;animation:lbFade .25s cubic-bezier(0.16,1,0.3,1)}

            #${UID} .lb-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
            #${UID} .lb-stat{
                background:rgba(255,255,255,0.025);
                border:1px solid rgba(255,255,255,0.05);
                border-radius:13px;padding:9px 11px;
                transition:border-color .18s;
            }
            #${UID} .lb-stat:hover{border-color:rgba(167,139,250,0.25)}
            #${UID} .lb-slabel{font-size:9px;color:var(--lb-muted);text-transform:uppercase;letter-spacing:.08em;font-weight:700}
            #${UID} .lb-sval{font-size:19px;font-weight:800;color:#ffffff;font-variant-numeric:tabular-nums;margin-top:3px;letter-spacing:-.02em}

            #${UID} .lb-bar{
                height:2px;border-radius:2px;margin-bottom:10px;
                background:rgba(255,255,255,0.05);
                overflow:hidden;position:relative;
            }
            #${UID} .lb-bar::after{
                content:'';position:absolute;inset:0;width:0%;
                background:var(--lb-grad);
                border-radius:2px;
                transition:width .8s cubic-bezier(0.16,1,0.3,1);
                box-shadow:0 0 8px rgba(34,211,238,0.4);
            }
            #${UID} .lb-bar[data-w]::after{width:attr(data-w)}

            #${UID} .lb-row{
                display:flex;align-items:center;justify-content:space-between;
                padding:8px 0;
                border-top:1px solid rgba(255,255,255,0.04);
            }
            #${UID} .lb-row:first-of-type{border-top:none}
            #${UID} .lb-rlabel{
                font-size:11.5px;color:#c7cad6;font-weight:500;
                display:flex;align-items:center;gap:8px;
            }
            #${UID} .lb-dot{width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0}
            #${UID} .lb-dot.g{background:var(--lb-ok);box-shadow:0 0 6px rgba(52,211,153,.7)}
            #${UID} .lb-dot.b{background:var(--lb-cyan);box-shadow:0 0 6px rgba(34,211,238,.6)}
            #${UID} .lb-dot.a{background:var(--lb-violet);box-shadow:0 0 6px rgba(167,139,250,.6)}

            #${UID} .lb-tgl{
                width:56px;height:24px;border-radius:12px;
                cursor:pointer;overflow:hidden;flex-shrink:0;
                border:1px solid transparent;
                transition:all .22s cubic-bezier(0.16,1,0.3,1);
                display:flex;align-items:center;justify-content:center;
            }
            #${UID} .lb-tgl.on{
                background:linear-gradient(135deg,rgba(52,211,153,.22),rgba(52,211,153,.08));
                border-color:rgba(52,211,153,.35);
                box-shadow:0 0 12px rgba(52,211,153,.2),inset 0 1px 0 rgba(255,255,255,.06);
            }
            #${UID} .lb-tgl.off{
                background:linear-gradient(135deg,rgba(251,113,133,.18),rgba(251,113,133,.06));
                border-color:rgba(251,113,133,.3);
            }
            #${UID} .lb-tgl:hover{transform:translateY(-1px)}
            #${UID} .lb-tgl:active{transform:translateY(0) scale(.96)}
            #${UID} .lb-tgltxt{
                font-size:8.5px;font-weight:800;letter-spacing:.1em;
                color:rgba(255,255,255,.92);
            }
            #${UID} .lb-tgl.on .lb-tgltxt{color:#6ee7b7}
            #${UID} .lb-tgl.off .lb-tgltxt{color:#fda4af}

            #${UID} .lb-acts{display:flex;gap:6px;margin-top:12px}
            #${UID} .lb-act{
                flex:1;padding:8px 6px;border-radius:10px;
                border:1px solid rgba(255,255,255,0.06);
                background:rgba(255,255,255,0.02);
                color:var(--lb-muted);
                font-size:10px;font-weight:600;text-align:center;
                cursor:pointer;
                transition:all .18s cubic-bezier(0.16,1,0.3,1);
                white-space:nowrap;overflow:hidden;
            }
            #${UID} .lb-act:hover{
                background:rgba(255,255,255,0.05);
                color:#e8e8f0;
                border-color:rgba(167,139,250,0.3);
                transform:translateY(-1px);
                box-shadow:0 4px 12px rgba(0,0,0,.3);
            }
            #${UID} .lb-act:active{transform:translateY(0) scale(.97)}

            #${UID} .lb-logs{
                height:120px;overflow-y:auto;
                border:1px solid rgba(255,255,255,0.05);
                border-radius:12px;padding:6px;margin-top:8px;
                display:flex;flex-direction:column;gap:3px;
                background:rgba(0,0,0,0.15);
                scrollbar-width:thin;
                scrollbar-color:rgba(167,139,250,.3) transparent;
            }
            #${UID} .lb-logs::-webkit-scrollbar{width:5px}
            #${UID} .lb-logs::-webkit-scrollbar-thumb{background:linear-gradient(var(--lb-cyan),var(--lb-violet));border-radius:3px}
            #${UID} .lb-log{
                padding:5px 8px;border-radius:8px;
                background:rgba(255,255,255,0.02);
                border:1px solid rgba(255,255,255,0.04);
                word-break:break-all;
            }
            #${UID} .lb-logtime{font-size:8.5px;color:var(--lb-muted);font-family:'Geist Mono',ui-monospace,Menlo,Consolas,monospace}
            #${UID} .lb-logtext{font-size:10px;color:#c7cad6;margin-top:2px}

            #${UID} .lb-toast{
                position:absolute;left:14px;right:14px;bottom:14px;
                background:rgba(14,14,20,0.96);
                color:#f3f4f6;
                border:1px solid rgba(34,211,238,0.4);
                border-radius:11px;
                padding:9px 14px;
                font-size:11px;font-weight:700;text-align:center;
                opacity:0;transform:translateY(8px);
                transition:all .22s cubic-bezier(0.16,1,0.3,1);
                pointer-events:none;z-index:20;
                backdrop-filter:blur(10px);
                box-shadow:0 6px 18px rgba(34,211,238,0.15);
            }
            #${UID} .lb-toast.show{opacity:1;transform:translateY(0)}

            #${UID} .lb-pop{
                position:absolute;bottom:56px;left:14px;right:14px;
                background:linear-gradient(175deg,rgba(20,20,28,0.96),rgba(9,9,14,0.99));
                backdrop-filter:blur(18px) saturate(140%);
                -webkit-backdrop-filter:blur(18px) saturate(140%);
                border:1px solid rgba(167,139,250,0.25);
                border-radius:14px;padding:6px;
                display:none;flex-direction:column;gap:2px;
                box-shadow:0 12px 32px rgba(0,0,0,0.7),0 0 0 1px rgba(34,211,238,0.06);
                z-index:30;
            }
            #${UID} .lb-pop.show{display:flex;animation:lbFade .2s cubic-bezier(0.16,1,0.3,1)}
            #${UID} .lb-poplink{
                display:flex;align-items:center;gap:8px;
                padding:8px 10px;border-radius:9px;
                color:#c7cad6;font-size:11.5px;font-weight:600;
                text-decoration:none;cursor:pointer;
                transition:all .18s cubic-bezier(0.16,1,0.3,1);
            }
            #${UID} .lb-poplink:hover{
                background:rgba(255,255,255,0.05);
                color:#fff;
                padding-left:14px;
            }
            `;
            document.head.appendChild(style);

            const root = document.createElement("div");
            root.id = UID;
            root.setAttribute("data-lb", "1");
            root.setAttribute("data-sang-ui", "");
            root.setAttribute("data-hub", "1");

            root.innerHTML = `
            <div class="lb-hdr" id="${UID}hdr">
                <div class="lb-brand">
                    <div class="lb-av"><img src="https://habbo.city/habbo-imaging/walkgif?figure=hd-180-1.lg-3116-1198-92.ch-989999893-2023-1035.fa-990003751-2070.hr-802-39.sh-295-62.ea-990002655-64.cc-990002809-100&direction=2&head_direction=3&gesture=sml&action=wav&size=l" alt=""></div>
                    <div>
                        <div class="lb-bname">LiveBlock<span class="lb-vtag">v${VERSION}</span></div>
                        <div class="lb-timer" id="${UID}tmr">00:00:00</div>
                    </div>
                </div>
                <div style="display:flex;gap:6px;">
                    <div class="lb-hbtn" id="${UID}min" title="Minimizar">−</div>
                    <div class="lb-hbtn" id="${UID}cls" title="Fechar">✕</div>
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
                <div style="margin-top:8px;display:none;" id="${UID}pLogs">
                    <div class="lb-logs" id="${UID}logbox"></div>
                </div>
            </div>
            <div class="lb-toast" id="${UID}toast"></div>
            `;

            document.body.appendChild(root);

            // §17 — sinaliza pro LiveBooster não matar animações deste painel.
            try { window._hubUI?.markProtected?.(root); } catch(e) {}

            if (S.pos) { root.style.left = S.pos.l+"px"; root.style.top = S.pos.t+"px"; root.style.right = "auto"; }
            if (S.min) root.classList.add("min");

            const tmr = root.querySelector(`#${UID}tmr`);
            timerInterval = setInterval(() => {
                const s = Math.floor((Date.now() - S.t0) / 1000);
                const h = String(Math.floor(s/3600)).padStart(2,"0");
                const m = String(Math.floor((s%3600)/60)).padStart(2,"0");
                const sec = String(s%60).padStart(2,"0");
                tmr.textContent = `${h}:${m}:${sec}`;
            }, 1000);

            toastTm = null;
            _toast = msg => {
                const t = root.querySelector(`#${UID}toast`);
                t.textContent = msg; t.classList.add("show");
                clearTimeout(toastTm);
                toastTm = setTimeout(() => t.classList.remove("show"), 1500);
            };

            _renderStats = () => {
                root.querySelector(`#${UID}nf`).textContent = S.nFetch;
                root.querySelector(`#${UID}nx`).textContent = S.nXhr;
                const bar = root.querySelector(`#${UID}bar`);
                const w = Math.min(100, (S.nFetch + S.nXhr) * 2.5);
                bar.dataset.w = w;
                // attr() ainda não é confiável em todos os navegadores pra width
                // em ::after; aplica direto no inline style do pseudo via
                // variável CSS local.
                bar.style.setProperty('--w', w + '%');
                const after = bar;
                // atalho: aplica direto via style do elemento, o ::after lê de attr
                // (mantido por compat — o fallback abaixo garante a barra).
                requestAnimationFrame(() => {
                    const inner = bar;
                    // width real do pseudo não dá pra setar direto; usa CSS var.
                    inner.style.cssText = inner.style.cssText;
                });
            };

            const logBox = root.querySelector(`#${UID}logbox`);
            _renderLogs = () => {
                if (!S.logItems.length) {
                    logBox.innerHTML = '<div style="color:#8b8fa3;text-align:center;padding:12px;font-size:10px;">Nenhum log.</div>';
                    return;
                }
                logBox.innerHTML = S.logItems.slice(0, 30).map(l =>
                    `<div class="lb-log"><div class="lb-logtime">${l.t}</div><div class="lb-logtext"><span style="color:${l.type==='FETCH'?'#22d3ee':l.type==='XHR'?'#34d399':'#a78bfa'};font-weight:700;font-family:'Geist Mono',monospace;">${l.type}</span> ${l.text}</div></div>`
                ).join("");
            };

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
                }, { signal: sig });
                el.classList.toggle("on", S[key]);
                el.classList.toggle("off", !S[key]);
                el.querySelector(".lb-tgltxt").textContent = S[key] ? on : off;
            });

            const popEl = root.querySelector(`#${UID}pop`);
            popEl.innerHTML = SOCIALS.map(s =>
                `<a class="lb-poplink" href="${s.url}" target="_blank" rel="noopener">${s.icon} ${s.label}</a>`
            ).join("");

            root.querySelector(`#${UID}aSocial`).addEventListener("click", (e) => {
                e.stopPropagation();
                popEl.classList.toggle("show");
            }, { signal: sig });

            const onDocClick = (e) => {
                if (!popEl.contains(e.target) && e.target.id !== `${UID}aSocial`) {
                    popEl.classList.remove("show");
                }
            };
            document.addEventListener("click", onDocClick, { signal: sig, capture: true });

            root.querySelector(`#${UID}aClean`).addEventListener("click", () => {
                push("ACTION","Limpeza manual",true); _toast("Limpando..."); removeAds();
            }, { signal: sig });
            root.querySelector(`#${UID}aLogs`).addEventListener("click", () => {
                S.logItems = []; _renderLogs(); _toast("Logs limpos");
            }, { signal: sig });
            root.querySelector(`#${UID}aUpdate`).addEventListener("click", async () => {
                _toast("Checando versão...");
                push("ACTION", "Checagem de atualização iniciada", true);
                try {
                    const res = await fetch(RAW_URL + "?t=" + Date.now(), { cache: "no-store" });
                    const text = await res.text();
                    const match = text.match(/@version\s+([\d.]+)/);
                    if (!match) { _toast("Não consegui ler a versão remota"); return; }
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
            }, { signal: sig });

            root.querySelector(`#${UID}min`).addEventListener("click", () => {
                S.min = !S.min; root.classList.toggle("min", S.min); save();
            }, { signal: sig });

            root.querySelector(`#${UID}cls`).addEventListener("click", () => killFn?.(), { signal: sig });

            // Drag
            const hdr = root.querySelector(`#${UID}hdr`);
            let drag = null;
            hdr.addEventListener("mousedown", e => {
                if (e.target.closest(".lb-hbtn")) return;
                const r = root.getBoundingClientRect();
                drag = { x: e.clientX - r.left, y: e.clientY - r.top };
                root.style.left = r.left+"px"; root.style.top = r.top+"px"; root.style.right = "auto";
            }, { signal: sig });
            const onMove = e => {
                if (!drag) return;
                root.style.left = Math.max(0, e.clientX - drag.x)+"px";
                root.style.top = Math.max(0, e.clientY - drag.y)+"px";
                S.pos = { l: parseInt(root.style.left), t: parseInt(root.style.top) };
            };
            const onUp = () => { if (drag) save(); drag = null; };
            document.addEventListener("mousemove", onMove, { signal: sig });
            document.addEventListener("mouseup", onUp, { signal: sig });

            hdr.addEventListener("dblclick", () => {
                S.min = !S.min; root.classList.toggle("min", S.min); save();
            }, { signal: sig });

            let logsVisible = false;
            root.querySelector(`#${UID}tog1`).addEventListener("click", () => {
                logsVisible = !logsVisible;
                root.querySelector(`#${UID}pLogs`).style.display = logsVisible ? "block" : "none";
            }, { signal: sig });

            // KILL — §15 (contrato canônico, atômico, idempotente).
            killFn = function kill() {
                if (S.dying) return;
                S.dying = true;
                S.killFlag = true;

                const steps = [
                    ['timers',    () => { clearInterval(timerInterval); clearTimeout(toastTm); clearTimeout(removeAdsTimer); clearInterval(refreshTimer); }],
                    ['observers', () => { obs?.disconnect(); bodyWatcher?.disconnect(); }],
                    ['listeners', () => acUI?.abort()],
                    ['patches',   () => {
                        window.fetch = _fetch;
                        window.XMLHttpRequest = _XHR;
                        console.log = _origLog;
                        console.warn = _origWarn;
                        console.error = _origError;
                        if (_origGT) window.googletag = _origGT;
                    }],
                    ['dom',       () => { root.parentNode && root.remove(); style.parentNode && style.remove(); }],
                    ['global',    () => { try { delete window._blocklive; } catch(e) {} cleanWindow(); }],
                    ['notify',    () => window.dispatchEvent(new CustomEvent('sang:module-close', { detail: { id: 'blocklive' } }))]
                ];

                for (const [name, step] of steps) {
                    try { step(); } catch (e) { WARN(`kill step "${name}" falhou:`, e); }
                }
            };

            // §15 — API pública: kill obrigatório, show/hide se tem UI flutuante.
            window._blocklive = {
                kill: killFn,
                show: () => { S.min = false; root.classList.remove("min"); save(); },
                hide: () => { S.min = true;  root.classList.add("min");    save(); },
                S
            };

            _renderStats();
            _renderLogs();
            push("INIT", `LiveBlock v${VERSION} ativo`, true);
            _toast("LiveBlock ativo");

            S.injected = true;
            LOG('✅ UI injetada com sucesso!');

        } catch(e) {
            ERR('❌ Erro ao injetar UI (nova tentativa será feita):', e);
        }
    }

    // STORAGE
    const save = () => {
        try {
            localStorage.setItem(KEY, JSON.stringify({
                on: S.on, logs: S.logs, dom: S.dom,
                min: S.min, pos: S.pos
            }));
        } catch {}
    };

    // INIT
    let injectAttempts = 0;
    const maxAttempts = 25;

    const aggressiveInject = () => {
        injectAttempts++;

        if (S.injected || S.dying) return;

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
            vigiarBody();
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

    LOG(`✅ LiveBlock v${VERSION} inicializado com sucesso`);

  } catch (fatalErr) {
    console.error('🔴 [LiveBlock] Erro fatal não tratado:', fatalErr);
  }

})();
