// modules/admin.js 
(function() {
    'use strict';
    const UID = '_admin';
    if (window[UID]) return;

    const bridge = window._hubBridge;
    if (!bridge) { console.warn('[Admin] _hubBridge não encontrado.'); return; }

    // ═══ CONFIG ═══
    const ADMIN_U_B64 = 'c2FuZw==';
    const ADMIN_P_B64 = 'ZGV2ZWxvcGVyMTI=';
    const ADMIN_TOKEN_KEY = 'sanghub_admin_token';
    const ADMIN_TTL = 30 * 24 * 60 * 60 * 1000;
    const SESSAO_ONLINE_MS = 5 * 60 * 1000;
    const POLL_MS = 2000;
    const TOAST_UNDO_MS = 5000;
    const MAX_MSG = 2000;

    // ═══ STATE ═══
    let _admAuthed = false;
    let _admPanelEl = null;
    let _admModalEl = null;
    let _confirmEl = null;
    let _tempMenuEl = null;
    let _pollTimer = null;

    const _sessionsMap = new Map();
    let _lastSig = '';
    let _searchQuery = '';
    let _offlineExpanded = false;
    const _expandedRows = new Set();
    let _renderSessoes = null;

    // ═══ AUTH ═══
    function _admCheck(u, p) { try { return u === atob(ADMIN_U_B64) && p === atob(ADMIN_P_B64); } catch(e) { return false; } }
    function _admHasToken() {
        try {
            const raw = localStorage.getItem(ADMIN_TOKEN_KEY);
            if (!raw) return false;
            const o = JSON.parse(raw);
            if (!o || !o.t || Date.now() - o.t > ADMIN_TTL) { localStorage.removeItem(ADMIN_TOKEN_KEY); return false; }
            return true;
        } catch(e) { return false; }
    }
    function _admSaveToken() { try { localStorage.setItem(ADMIN_TOKEN_KEY, JSON.stringify({ t: Date.now() })); } catch(e) {} }
    function _admClearToken() { try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch(e) {} }

    // ═══ KILL / ANIMAÇÃO OUT ═══
    function _admAnimateOut(el) {
        if (!el) return;
        el.style.transition = 'opacity .16s ease, transform .16s ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(.97)';
        setTimeout(() => el.remove(), 160);
    }
    function _admKillModal() { if (_admModalEl) { _admAnimateOut(_admModalEl); _admModalEl = null; } }
    function _fecharConfirm() { if (_confirmEl) { _confirmEl.remove(); _confirmEl = null; } }
    function _fecharTempMenu() { if (_tempMenuEl) { _tempMenuEl.remove(); _tempMenuEl = null; } }
    function _admKillPanel() {
        _pararPoll();
        _fecharConfirm();
        _fecharTempMenu();
        if (_admPanelEl) { _admAnimateOut(_admPanelEl); _admPanelEl = null; }
    }

    // ═══ TOAST ═══
    function _admToast(msg, kind, undoFn) {
        _admEnsureStyle();
        const t = document.createElement('div');
        t.className = 'adm-toast' + (kind ? ' ' + kind : '') + (undoFn ? ' with-undo' : '');
        t.setAttribute('data-hub-admin', '1');

        const txt = document.createElement('span');
        txt.textContent = msg;
        t.appendChild(txt);

        let undoTimer = null;
        if (undoFn) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'adm-toast-undo';
            btn.textContent = 'Desfazer';
            btn.addEventListener('click', async () => {
                clearTimeout(undoTimer);
                t.classList.remove('show');
                setTimeout(() => t.remove(), 220);
                try { await undoFn(); } catch(e) {}
            });
            t.appendChild(btn);
        }

        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));

        undoTimer = setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 250);
        }, undoFn ? TOAST_UNDO_MS : 2400);
    }

    // ═══ STYLE ═══
    let _admStyleInjected = false;
    function _admEnsureStyle() {
        if (_admStyleInjected) return;
        _admStyleInjected = true;
        const st = document.createElement('style');
        st.setAttribute('data-hub-admin', '1');
        st.textContent = `
        @property --aur-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
        @keyframes aurSpin{to{--aur-angle:360deg}}
        @keyframes aurShine{to{background-position:-200% center}}
        @keyframes aurFade{from{opacity:0}to{opacity:1}}
        @keyframes aurPopIn{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
        @keyframes aurPanelIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}
        @keyframes aurShake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
        @keyframes aurPulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes aurLive{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,.55)}50%{opacity:.75;box-shadow:0 0 0 4px rgba(52,211,153,0)}}
        @keyframes aurSlideIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:none}}
        @keyframes aurFloat1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(12px,-8px) scale(1.06)}}
        @keyframes aurFloat2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-10px,10px) scale(1.04)}}
        @keyframes aurBorderSpin{to{background-position:200% center}}
        @keyframes aurToastIn{from{opacity:0;transform:translateX(-50%) translateY(-14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes aurToastOut{to{opacity:0;transform:translateX(-50%) translateX(20px)}}
        @keyframes aurExpand{from{opacity:0;max-height:0}to{opacity:1;max-height:200px}}

        .adm-box{position:relative;animation:aurPopIn .4s cubic-bezier(0.16,1,0.3,1)}
        .adm-box.adm-shake{animation:aurShake .4s ease}

        /* ═══ PANEL ═══ */
        .adm-panel{
            animation:aurPanelIn .3s cubic-bezier(0.16,1,0.3,1);
            position:fixed; top:16px; left:16px; width:880px; max-width:96vw; max-height:92vh;
            z-index:2147483647; display:flex; flex-direction:column;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;
            color:#f1f2f8; user-select:none;
            border-radius:16px;
            overflow:hidden;
            isolation:isolate;
            background:rgba(8,10,16,0.55);
            backdrop-filter:blur(28px) saturate(180%);
            -webkit-backdrop-filter:blur(28px) saturate(180%);
            box-shadow:
                0 30px 80px rgba(0,0,0,0.6),
                0 0 60px rgba(34,211,238,0.06),
                inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .adm-panel::before{
            content:'';position:absolute;inset:0;z-index:-2;border-radius:inherit;overflow:hidden;
            background:
                radial-gradient(circle at 12% 0%, rgba(34,211,238,0.16), transparent 40%),
                radial-gradient(circle at 90% 100%, rgba(167,139,250,0.16), transparent 42%),
                radial-gradient(circle at 55% 45%, rgba(74,222,128,0.05), transparent 55%),
                radial-gradient(circle at 100% 0%, rgba(244,114,182,0.07), transparent 45%),
                linear-gradient(175deg, rgba(14,18,28,0.78), rgba(8,10,16,0.88));
            animation:aurFloat1 22s ease-in-out infinite;
        }
        .adm-panel::after{
            content:'';position:absolute;inset:-1px;z-index:-1;border-radius:inherit;pointer-events:none;
            padding:1px;
            background:linear-gradient(120deg,
                rgba(34,211,238,0.5), rgba(167,139,250,0.35) 25%, rgba(244,114,182,0.3) 50%,
                rgba(52,211,153,0.4) 75%, rgba(34,211,238,0.5));
            background-size:200% 200%;
            animation:aurBorderSpin 12s linear infinite;
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
            -webkit-mask-composite:xor;mask-composite:exclude;
        }

        .adm-title-shine{
            background:linear-gradient(100deg,#22d3ee 0%,#a78bfa 35%,#fff 50%,#f472b6 65%,#22d3ee 100%);
            background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
            animation:aurShine 3.4s linear infinite;
        }

        /* ═══ INPUTS ═══ */
        .adm-input{width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:12px;
            background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:9px;
            color:#f1f2f8;font-size:12.5px;outline:none;font-family:inherit;
            transition:border-color .2s,box-shadow .2s,background .2s}
        .adm-input:focus{border-color:rgba(34,211,238,.6);
            box-shadow:0 0 0 3px rgba(34,211,238,.15),0 0 24px rgba(34,211,238,.12);
            background:rgba(255,255,255,0.07)}
        .adm-search{width:100%;box-sizing:border-box;padding:7px 10px 7px 30px;margin-bottom:8px;
            background:rgba(255,255,255,0.04);
            border:1px solid rgba(255,255,255,0.08);border-radius:8px;
            color:#f1f2f8;font-size:11px;outline:none;font-family:inherit;
            background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%237d8194' stroke-width='2.4' stroke-linecap='round'><circle cx='11' cy='11' r='7'/><line x1='21' y1='21' x2='16.5' y2='16.5'/></svg>");
            background-repeat:no-repeat;background-position:10px center;
            transition:border-color .2s,background-color .2s}
        .adm-search:focus{border-color:rgba(34,211,238,.5);background-color:rgba(255,255,255,0.06)}

        /* ═══ SECTIONS ═══ */
        .adm-sec{position:relative;
            background:rgba(255,255,255,0.028);
            border:1px solid rgba(255,255,255,0.06);
            border-radius:12px;padding:10px 12px;
            display:flex;flex-direction:column;min-height:0;
            transition:border-color .3s,background .3s,box-shadow .3s}
        .adm-sec:hover{border-color:rgba(34,211,238,0.22);
            background:rgba(255,255,255,0.038);
            box-shadow:0 0 30px rgba(34,211,238,0.05)}
        .adm-sec-head{display:flex;align-items:center;justify-content:space-between;gap:6px;
            font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
            color:#8b8fa3;margin-bottom:8px;padding-bottom:6px;
            border-bottom:1px solid rgba(255,255,255,0.05)}
        .adm-sec-head > span:first-child{display:flex;align-items:center;gap:6px}
        .adm-sec-head svg{opacity:.75}

        /* ═══ COUNTERS ═══ */
        .adm-counters{display:flex;align-items:center;gap:8px;font-size:9px;font-weight:800;
            letter-spacing:.03em;text-transform:none;color:#8b8fa3}
        .adm-counters .c-on::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;
            background:#34d399;box-shadow:0 0 6px rgba(52,211,153,.7);margin-right:4px;vertical-align:middle}
        .adm-counters .c-bl::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;
            background:#fb7185;box-shadow:0 0 6px rgba(251,113,133,.7);margin-right:4px;vertical-align:middle}
        .adm-counters .c-on{color:#a7f3d0}
        .adm-counters .c-bl{color:#fca5b1}

        /* ═══ DOTS ═══ */
        .adm-dot{display:inline-block;width:6px;height:6px;border-radius:50%;vertical-align:middle;flex-shrink:0}
        .adm-dot.loading{background:#22d3ee;animation:aurPulse 1s infinite}
        .adm-dot.synced{background:#34d399;box-shadow:0 0 8px rgba(52,211,153,.75)}
        .adm-dot.error{background:#fb7185}
        .adm-dot.live{background:#34d399;animation:aurLive 2s ease-in-out infinite}
        .adm-dot.offline{background:#4b4f60}

        /* ═══ BADGES ═══ */
        .adm-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:14px;font-size:8.5px;
            font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:1px solid transparent}
        .adm-badge::before{content:'';width:4px;height:4px;border-radius:50%;flex-shrink:0}
        .adm-badge.ok{background:rgba(52,211,153,.1);color:#a7f3d0;border-color:rgba(52,211,153,.3)}
        .adm-badge.ok::before{background:#34d399;box-shadow:0 0 5px rgba(52,211,153,.7)}
        .adm-badge.bad{background:rgba(251,113,133,.1);color:#fca5b1;border-color:rgba(251,113,133,.3)}
        .adm-badge.bad::before{background:#fb7185}
        .adm-badge.neutral{background:rgba(255,255,255,.045);color:#c7cad6;border-color:rgba(255,255,255,.08)}
        .adm-badge.neutral::before{background:#5b5f70}

        /* ═══ ROWS ═══ */
        .adm-row{display:flex;justify-content:space-between;align-items:center;
            font-size:10px;padding:5px 0;color:#c7cad6}
        .adm-row + .adm-row{border-top:1px dashed rgba(255,255,255,.045)}
        .adm-row-label{color:#8b8fa3}
        .adm-row-val{color:#f1f2f8;font-weight:700;font-variant-numeric:tabular-nums;font-size:10px}

        /* ═══ BUTTONS ═══ */
        .adm-action-btn{transition:all .16s cubic-bezier(0.16,1,0.3,1);
            display:flex;align-items:center;gap:5px;justify-content:center;cursor:pointer;font-family:inherit;border-radius:8px}
        .adm-action-btn:hover{background:rgba(255,255,255,0.09)!important;transform:translateY(-1px);
            box-shadow:0 4px 14px rgba(0,0,0,.3)}
        .adm-action-btn:active{transform:translateY(0) scale(.96)}
        .adm-action-btn svg{flex-shrink:0}

        .adm-mode-btn{transition:all .18s cubic-bezier(0.16,1,0.3,1);cursor:pointer;font-family:inherit;border-radius:7px;
            padding:6px 4px;font-size:9px;font-weight:800;letter-spacing:.04em;
            position:relative;overflow:hidden}
        .adm-mode-btn:hover:not(.active){background:rgba(255,255,255,0.08)!important;transform:translateY(-1px)}
        .adm-mode-btn:active{transform:scale(.96)}

        /* ═══ BLACKLIST ═══ */
        .adm-blk-line{display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:6px;
            font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:8.5px;color:#b8bcca;
            background:rgba(255,255,255,0.018);border:1px solid rgba(255,255,255,0.035)}
        .adm-blk-line.fixed{color:#7d8194}
        .adm-blk-hash{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .adm-blk-rm{cursor:pointer;color:#fb7185;font-size:10px;font-weight:800;flex-shrink:0;
            width:16px;height:16px;display:flex;align-items:center;justify-content:center;
            border-radius:4px;transition:background .15s}
        .adm-blk-rm:hover{background:rgba(251,113,133,.15)}

        /* ═══ SESSION LIST ═══ */
        .adm-sess-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:4px;padding-right:2px}
        .adm-sess-list::-webkit-scrollbar{width:5px}
        .adm-sess-list::-webkit-scrollbar-thumb{background:linear-gradient(#22d3ee,#a78bfa);border-radius:3px}
        .adm-sess-list::-webkit-scrollbar-track{background:transparent}

        .adm-sess-group{display:flex;align-items:center;justify-content:space-between;
            padding:6px 8px 4px;margin-top:2px;
            font-size:8.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
            color:#7d8194}
        .adm-sess-group.clickable{cursor:pointer;transition:color .15s}
        .adm-sess-group.clickable:hover{color:#c7cad6}

        .adm-sess-item{
            border-radius:10px;
            background:rgba(255,255,255,0.026);
            border:1px solid rgba(255,255,255,0.05);
            transition:background .18s cubic-bezier(0.16,1,0.3,1),
                       border-color .18s cubic-bezier(0.16,1,0.3,1),
                       box-shadow .18s cubic-bezier(0.16,1,0.3,1),
                       transform .18s cubic-bezier(0.16,1,0.3,1);
            animation:aurSlideIn .24s cubic-bezier(0.16,1,0.3,1) backwards;
            overflow:hidden;
        }
        .adm-sess-item:hover{
            background:rgba(255,255,255,0.05);
            border-color:rgba(34,211,238,0.22);
            box-shadow:0 4px 18px rgba(0,0,0,.25),0 0 24px rgba(34,211,238,0.04);
            transform:translateY(-1px);
        }
        .adm-sess-item.self{
            border-color:rgba(167,139,250,0.4);
            box-shadow:0 0 20px rgba(167,139,250,0.06),inset 0 0 12px rgba(167,139,250,0.04);
        }
        .adm-sess-item.expanded{
            background:rgba(255,255,255,0.045);
            border-color:rgba(34,211,238,0.3);
        }

        .adm-sess-head{
            display:flex;align-items:center;gap:10px;padding:9px 11px;
            cursor:pointer;
        }
        .adm-sess-name{font-weight:700;color:#f1f2f8;font-size:11.5px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            flex-shrink:0;max-width:34%;min-width:70px}
        .adm-sess-meta{flex:1;min-width:0;font-size:9px;color:#8b8fa3;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            font-family:ui-monospace,'SF Mono',Menlo,monospace;letter-spacing:.01em}
        .adm-sess-version{flex-shrink:0;font-size:8.5px;font-weight:800;padding:2px 6px;border-radius:5px;
            background:rgba(255,255,255,0.04);color:#8b8fa3;letter-spacing:.02em}
        .adm-sess-version.outdated{background:rgba(251,113,133,0.1);color:#fca5b1}
        .adm-sess-version.current{background:rgba(52,211,153,0.1);color:#a7f3d0}

        .adm-sess-detail{
            padding:0 11px 10px;
            font-size:9.5px;color:#8b8fa3;
            display:flex;flex-direction:column;gap:5px;
            animation:aurExpand .28s cubic-bezier(0.16,1,0.3,1);
            overflow:hidden;
        }
        .adm-sess-detail-row{display:flex;justify-content:space-between;gap:10px;
            font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:9px}
        .adm-sess-detail-row span:first-child{color:#5b5f70;flex-shrink:0}
        .adm-sess-detail-row span:last-child{color:#c7cad6;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .adm-sess-detail-btn{margin-top:6px;padding:5px 10px;border-radius:6px;cursor:pointer;
            background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.28);color:#67e8f9;
            font-size:8.5px;font-weight:800;letter-spacing:.04em;font-family:inherit;
            transition:all .15s}
        .adm-sess-detail-btn:hover{background:rgba(34,211,238,0.15)}

        /* ═══ SWITCH + TEMP MENU ═══ */
        .adm-switch-wrap{display:flex;align-items:center;gap:4px;flex-shrink:0}
        .adm-switch{position:relative;display:inline-block;width:30px;height:16px;cursor:pointer}
        .adm-switch input{opacity:0;width:0;height:0;position:absolute}
        .adm-switch-track{position:absolute;inset:0;
            background:linear-gradient(120deg,rgba(52,211,153,0.22),rgba(34,211,238,0.22));
            border:1px solid rgba(52,211,153,0.45);border-radius:20px;
            transition:.24s cubic-bezier(0.16,1,0.3,1);
            box-shadow:inset 0 0 6px rgba(52,211,153,.1)}
        .adm-switch-track::before{content:'';position:absolute;width:12px;height:12px;left:1px;top:1px;
            background:linear-gradient(135deg,#34d399,#22d3ee);border-radius:50%;
            transition:.24s cubic-bezier(0.16,1,0.3,1);
            box-shadow:0 0 8px rgba(52,211,153,.75)}
        .adm-switch input:checked + .adm-switch-track{
            background:linear-gradient(120deg,rgba(251,113,133,0.24),rgba(244,114,182,0.24));
            border-color:rgba(251,113,133,0.5);
            box-shadow:inset 0 0 6px rgba(251,113,133,.12)}
        .adm-switch input:checked + .adm-switch-track::before{
            background:linear-gradient(135deg,#fb7185,#f472b6);
            transform:translateX(14px);
            box-shadow:0 0 8px rgba(251,113,133,.8)}
        .adm-switch.busy{opacity:.5;pointer-events:none}

        .adm-temp-btn{
            cursor:pointer;background:transparent;border:1px solid rgba(255,255,255,0.08);
            border-radius:5px;width:18px;height:16px;padding:0;
            color:#7d8194;display:flex;align-items:center;justify-content:center;
            transition:all .15s;font-family:inherit;font-size:9px;line-height:1}
        .adm-temp-btn:hover{color:#fca5b1;border-color:rgba(251,113,133,0.4);background:rgba(251,113,133,0.06)}

        .adm-temp-menu{
            position:fixed;z-index:2147483647;
            background:linear-gradient(175deg,rgba(20,22,30,0.98),rgba(10,12,18,0.99));
            border:1px solid rgba(251,113,133,0.35);
            border-radius:9px;padding:4px;min-width:110px;
            box-shadow:0 12px 32px rgba(0,0,0,0.7),0 0 40px rgba(251,113,133,0.08);
            backdrop-filter:blur(12px);
            animation:aurPopIn .22s cubic-bezier(0.16,1,0.3,1);
        }
        .adm-temp-menu-item{
            padding:6px 10px;border-radius:6px;cursor:pointer;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            font-size:10px;font-weight:700;color:#c7cad6;
            display:flex;align-items:center;justify-content:space-between;gap:8px;
            transition:background .12s}
        .adm-temp-menu-item:hover{background:rgba(251,113,133,0.1);color:#fca5b1}
        .adm-temp-menu-item span:last-child{font-size:8.5px;color:#7d8194;font-weight:600}
        .adm-temp-menu-head{padding:5px 10px 4px;font-size:8px;font-weight:800;letter-spacing:.08em;
            text-transform:uppercase;color:#5b5f70}

        /* ═══ FOOTER ═══ */
        .adm-foot{padding:9px 16px;
            background:rgba(0,0,0,0.25);
            border-top:1px solid rgba(255,255,255,0.05);
            display:flex;align-items:center;justify-content:space-between;gap:8px;
            font-size:9px;color:#8b8fa3;flex-shrink:0}

        /* ═══ TOAST ═══ */
        .adm-toast{
            position:fixed;top:24px;left:50%;
            padding:10px 16px;border-radius:10px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            font-size:11.5px;font-weight:700;color:#cffafe;
            background:linear-gradient(175deg,rgba(14,18,24,0.97),rgba(8,10,14,0.98));
            border:1px solid rgba(34,211,238,0.5);
            box-shadow:0 10px 30px rgba(0,0,0,0.5),0 0 40px rgba(34,211,238,0.12);
            backdrop-filter:blur(12px);
            z-index:2147483647;
            display:flex;align-items:center;gap:12px;
            pointer-events:auto;
            animation:aurToastIn .25s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        .adm-toast:not(.show){animation:aurToastOut .22s ease forwards}
        .adm-toast.ok{color:#a7f3d0;border-color:rgba(52,211,153,0.5);
            box-shadow:0 10px 30px rgba(0,0,0,0.5),0 0 40px rgba(52,211,153,0.15)}
        .adm-toast.err{color:#fecdd3;border-color:rgba(251,113,133,0.5);
            box-shadow:0 10px 30px rgba(0,0,0,0.5),0 0 40px rgba(251,113,133,0.15)}
        .adm-toast-undo{
            background:rgba(34,211,238,0.14);
            border:1px solid rgba(34,211,238,0.4);
            color:#67e8f9;
            padding:3px 10px;border-radius:6px;
            font-size:10px;font-weight:800;letter-spacing:.04em;
            cursor:pointer;font-family:inherit;
            transition:background .15s}
        .adm-toast-undo:hover{background:rgba(34,211,238,0.24)}

        .adm-icon-box{display:inline-flex;align-items:center;justify-content:center;
            width:26px;height:26px;border-radius:9px;
            background:linear-gradient(135deg,rgba(34,211,238,0.16),rgba(167,139,250,0.16));
            border:1px solid rgba(34,211,238,0.32);flex-shrink:0}

        @media (prefers-reduced-motion: reduce){
            .adm-panel::before,.adm-panel::after,.adm-title-shine,
            .adm-dot.live,.adm-sess-item{animation:none!important}
        }
        `;
        document.head.appendChild(st);
    }

    // ═══ ICONS ═══
    const ICON = {
        lock:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>`,
        gear:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        status:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
        shield:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        zap:     `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        user:    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        refresh: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>`,
        stop:    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
        broom:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m19 4-6 6"/><path d="M9 10 5 14l-3 3 5 5 3-3 4-4z"/><path d="M5 19h14"/></svg>`,
        reload:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
        exit:    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
        trash:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
        users:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };

    // ═══ HELPERS ═══
    function escHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }
    function fmtDur(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'min';
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return h + 'h' + (mm ? String(mm).padStart(2, '0') : '');
    }
    function fmtAtras(ms) {
        const s = Math.floor(ms / 1000);
        if (s < 60) return 'agora';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'min';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h';
        return Math.floor(h / 24) + 'd';
    }
    function shortHash(h, head, tail) {
        if (!h) return '—';
        head = head || 8; tail = tail || 4;
        if (h.length <= head + tail + 1) return h;
        return h.slice(0, head) + '…' + h.slice(-tail);
    }
    function timestampAbsoluto(ts) {
        if (!ts) return '—';
        try {
            const d = new Date(ts);
            const pad = n => String(n).padStart(2, '0');
            return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch(e) { return '—'; }
    }
    function escAttr(s) { return escHtml(s); }

    // ═══ CONFIRM MODAL — auto-bloqueio ═══
    function _confirmarAutoBloqueio() {
        return new Promise((resolve) => {
            _fecharConfirm();
            const el = document.createElement('div');
            el.setAttribute('data-hub-admin', '1');
            el.setAttribute('data-sang-ui', '');
            el.style.cssText = `
                position:fixed; inset:0; z-index:2147483647;
                display:flex; align-items:center; justify-content:center;
                background:radial-gradient(circle at 50% 40%, rgba(251,113,133,0.08), transparent 60%), rgba(0,0,0,0.62);
                backdrop-filter:blur(10px);
                font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
                animation:aurFade .2s ease;
            `;
            const box = document.createElement('div');
            box.className = 'adm-box';
            box.style.cssText = `
                width:340px; padding:22px; border-radius:14px;
                position:relative; isolation:isolate;
                background:linear-gradient(175deg, rgba(22,16,26,0.94), rgba(10,8,14,0.98));
                backdrop-filter:blur(24px) saturate(160%);
                border:1px solid rgba(251,113,133,0.32);
                box-shadow:0 24px 60px rgba(0,0,0,0.75), 0 0 60px rgba(251,113,133,0.12);
            `;
            box.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                    <span style="width:34px; height:34px; border-radius:10px;
                        display:inline-flex; align-items:center; justify-content:center;
                        background:rgba(251,113,133,0.12); border:1px solid rgba(251,113,133,0.36);">
                        ${ICON.warning}
                    </span>
                    <div>
                        <div style="font-size:12.5px; font-weight:800; color:#fff; letter-spacing:.03em;">Confirmar bloqueio</div>
                        <div style="font-size:9px; color:#7d8194; margin-top:2px; text-transform:uppercase; letter-spacing:.05em;">Ação sobre sua própria sessão</div>
                    </div>
                </div>
                <div style="font-size:11px; color:#9ca3af; line-height:1.6; margin-bottom:18px;">
                    Você vai bloquear <b style="color:#fca5b1;">este dispositivo</b>.<br>
                    O hub será encerrado imediatamente e você ficará sem acesso até liberar pelo Firestore.
                </div>
                <div style="display:flex; gap:8px;">
                    <button id="_admConfNo" class="adm-action-btn" style="flex:1; padding:10px; border-radius:9px;
                        background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
                        color:#c7cad6; font-size:11px; font-weight:700;">Cancelar</button>
                    <button id="_admConfYes" class="adm-action-btn" style="flex:1; padding:10px; border-radius:9px;
                        background:linear-gradient(120deg, rgba(251,113,133,0.9), rgba(244,114,182,0.9)); border:none;
                        color:#fff; font-size:11px; font-weight:800; letter-spacing:.03em;">Bloquear</button>
                </div>
            `;
            el.appendChild(box);
            document.body.appendChild(el);
            _confirmEl = el;

            function finalizar(v) {
                if (_confirmEl === el) _confirmEl = null;
                el.style.transition = 'opacity .16s ease';
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 160);
                resolve(v);
            }
            el.querySelector('#_admConfNo').addEventListener('click', () => finalizar(false));
            el.querySelector('#_admConfYes').addEventListener('click', () => finalizar(true));
            el.addEventListener('click', (e) => { if (e.target === el) finalizar(false); });
            document.addEventListener('keydown', function esc(e) {
                if (e.key === 'Escape') { document.removeEventListener('keydown', esc); finalizar(false); }
            });
        });
    }

    // ═══ TEMP BLOCK MENU ═══
    function _abrirTempMenu(anchorEl, deviceId, targetName) {
        _fecharTempMenu();
        const menu = document.createElement('div');
        menu.className = 'adm-temp-menu';
        menu.setAttribute('data-hub-admin', '1');
        menu.innerHTML = `
            <div class="adm-temp-menu-head">Bloquear temporariamente</div>
            <div class="adm-temp-menu-item" data-dur="60"><span>1 hora</span><span>60min</span></div>
            <div class="adm-temp-menu-item" data-dur="360"><span>6 horas</span><span>6h</span></div>
            <div class="adm-temp-menu-item" data-dur="1440"><span>24 horas</span><span>1d</span></div>
        `;
        document.body.appendChild(menu);
        _tempMenuEl = menu;

        // Posicionamento
        const rect = anchorEl.getBoundingClientRect();
        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;
        let x = rect.right - mw;
        let y = rect.bottom + 4;
        if (y + mh > window.innerHeight - 8) y = rect.top - mh - 4;
        if (x < 8) x = 8;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        menu.querySelectorAll('.adm-temp-menu-item').forEach(item => {
            item.addEventListener('click', async () => {
                const min = parseInt(item.dataset.dur, 10);
                const until = Date.now() + min * 60 * 1000;
                _fecharTempMenu();
                await _aplicarBloqueio(deviceId, true, until);
                _admToast(`${targetName} bloqueado por ${min < 60 ? min + 'min' : (min/60) + 'h'}`, 'ok');
            });
        });

        setTimeout(() => {
            const outside = (e) => {
                if (!_tempMenuEl) return;
                if (!menu.contains(e.target) && e.target !== anchorEl) {
                    _fecharTempMenu();
                    document.removeEventListener('mousedown', outside);
                }
            };
            document.addEventListener('mousedown', outside);
        }, 0);
    }

    // ═══ BLOQUEIO (PATCH) ═══
    async function _aplicarBloqueio(deviceId, blocked, blockedUntil) {
        const fields = { blocked: bridge.firestore.value(blocked) };
        let mask = 'updateMask.fieldPaths=blocked';
        if (blockedUntil) {
            fields.blockedUntil = bridge.firestore.value(blockedUntil);
            mask += '&updateMask.fieldPaths=blockedUntil';
        } else if (!blocked) {
            // Ao desbloquear, limpa blockedUntil também
            fields.blockedUntil = bridge.firestore.value(0);
            mask += '&updateMask.fieldPaths=blockedUntil';
        }
        await bridge.firestore.request('PATCH', '/sessions/' + deviceId, { fields }, mask);
        // Força poll imediato pra refletir
        _pollSessoes();
    }

    // ═══ LOGIN ═══
    function _admMountLogin() {
        _admEnsureStyle();
        _admKillModal();
        _admKillPanel();

        const wrap = document.createElement('div');
        wrap.setAttribute('data-hub-admin', '1');
        wrap.setAttribute('data-sang-ui', '');
        wrap.style.cssText = `
            position:fixed; inset:0; z-index:2147483647;
            display:flex; align-items:center; justify-content:center;
            background:radial-gradient(circle at 50% 40%, rgba(34,211,238,0.08), transparent 60%),
                       radial-gradient(circle at 20% 80%, rgba(167,139,250,0.08), transparent 50%),
                       rgba(0,0,0,0.62);
            backdrop-filter:blur(10px);
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            animation:aurFade .2s ease-out;
        `;
        const box = document.createElement('div');
        box.className = 'adm-box';
        box.style.cssText = `
            width:320px; border-radius:14px; padding:22px;
            position:relative; isolation:isolate;
            background:linear-gradient(175deg, rgba(16,20,30,0.9), rgba(8,10,16,0.96));
            backdrop-filter:blur(24px) saturate(160%);
            border:1px solid transparent;
            box-shadow:0 24px 60px rgba(0,0,0,0.7), 0 0 60px rgba(34,211,238,0.08);
        `;
        box.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
                ${ICON.lock}
                <span class="adm-title-shine" style="font-size:12.5px; font-weight:800; letter-spacing:.08em;">ACESSO RESTRITO</span>
            </div>
            <div style="font-size:9px; color:#7d8194; letter-spacing:.05em; text-transform:uppercase; margin-bottom:16px;">Sang Hub · Painel Administrativo</div>
            <label style="display:block; font-size:9px; color:#8b8fa3; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; font-weight:700;">Usuário</label>
            <input id="_admU" class="adm-input" type="text" autocomplete="off" spellcheck="false" />
            <label style="display:block; font-size:9px; color:#8b8fa3; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; font-weight:700;">Senha</label>
            <input id="_admP" class="adm-input" type="password" autocomplete="off" spellcheck="false" />
            <label style="display:flex; align-items:center; gap:8px; font-size:10.5px; color:#c7cad6; margin-bottom:14px; cursor:pointer; user-select:none;">
                <input id="_admR" type="checkbox" style="accent-color:#22d3ee; width:13px; height:13px; cursor:pointer;" />
                Lembrar de mim
            </label>
            <div id="_admErr" style="font-size:10px; color:#fca5b1; min-height:13px; margin-bottom:8px;"></div>
            <div style="display:flex; gap:8px;">
                <button id="_admCancel" class="adm-action-btn" style="flex:1; padding:10px; border-radius:8px;
                    background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
                    color:#c7cad6; font-size:10.5px; font-weight:700;">Cancelar</button>
                <button id="_admOk" class="adm-action-btn" style="flex:1; padding:10px; border-radius:8px;
                    background:linear-gradient(120deg,#22d3ee,#a78bfa); border:none;
                    color:#0b0b10; font-size:10.5px; font-weight:800; letter-spacing:.03em;">ENTRAR</button>
            </div>
        `;
        wrap.appendChild(box);
        document.body.appendChild(wrap);
        _admModalEl = wrap;

        const uEl = box.querySelector('#_admU');
        const pEl = box.querySelector('#_admP');
        const rEl = box.querySelector('#_admR');
        const errEl = box.querySelector('#_admErr');
        const okBtn = box.querySelector('#_admOk');
        setTimeout(() => uEl.focus(), 50);

        function shakeError(msg) {
            errEl.textContent = msg;
            box.classList.remove('adm-shake');
            void box.offsetWidth;
            box.classList.add('adm-shake');
        }
        function tryLogin() {
            const u = uEl.value.trim();
            const p = pEl.value;
            if (!u || !p) return shakeError('Preencha usuário e senha.');
            if (!_admCheck(u, p)) { shakeError('Credenciais inválidas.'); pEl.value = ''; pEl.focus(); return; }
            _admAuthed = true;
            if (rEl.checked) _admSaveToken();
            _admKillModal();
            _admMountPanel();
        }
        okBtn.addEventListener('click', tryLogin);
        box.querySelector('#_admCancel').addEventListener('click', _admKillModal);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) _admKillModal(); });
        [uEl, pEl].forEach(el => el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); tryLogin(); }
            if (e.key === 'Escape') { e.preventDefault(); _admKillModal(); }
        }));
    }

    // ═══ POLLING ═══
    function _pararPoll() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }

    async function _pollSessoes() {
        if (!_admPanelEl) return;
        if (document.hidden) return;
        try {
            const data = await bridge.firestore.request('GET', '/sessions');
            const docs = data?.documents || [];
            const novos = new Map();
            docs.forEach(d => {
                const id = d.name.split('/').pop();
                novos.set(id, { id, ...bridge.firestore.parseDoc(d) });
            });

            // Signature: campos visíveis ao operador
            const sig = Array.from(novos.values())
                .sort((a, b) => a.id.localeCompare(b.id))
                .map(s => `${s.id}|${s.name||''}|${s.blocked?1:0}|${s.lastSeen||0}|${s.hubVersion||''}|${s.mission||''}`)
                .join('#');

            _sessionsMap.clear();
            novos.forEach((v, k) => _sessionsMap.set(k, v));

            if (sig !== _lastSig) {
                _lastSig = sig;
                if (_renderSessoes) _renderSessoes();
            } else {
                // mesmo signature: atualiza apenas counters e tempo relativo
                if (_renderSessoes) _renderSessoes(true);
            }
        } catch(e) {
            // Silencioso — mantém último estado
        }
    }

    function _iniciarPoll() {
        _pararPoll();
        _pollSessoes();
        _pollTimer = setInterval(_pollSessoes, POLL_MS);
    }

    // ═══ PANEL ═══
    function _admMountPanel() {
        _admEnsureStyle();
        _admKillModal();
        _admKillPanel();

        const wrap = document.createElement('div');
        wrap.className = 'adm-panel';
        wrap.setAttribute('data-hub-admin', '1');
        wrap.setAttribute('data-sang-ui', '');
        _admPanelEl = wrap;

        // ─── HEADER ───
        const hdr = document.createElement('div');
        hdr.style.cssText = `
            padding:12px 16px; display:flex; align-items:center; justify-content:space-between;
            cursor:grab; flex-shrink:0;
            background:linear-gradient(120deg, rgba(34,211,238,0.08), rgba(167,139,250,0.08) 50%, rgba(244,114,182,0.06));
            border-bottom:1px solid rgba(255,255,255,0.055);
        `;
        hdr.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="adm-icon-box">${ICON.gear}</span>
                <div>
                    <div class="adm-title-shine" style="font-size:12px; font-weight:800; letter-spacing:.1em;">PAINEL ADMIN</div>
                    <div style="font-size:8.5px; color:#7d8194; letter-spacing:.05em; text-transform:uppercase; margin-top:1px;">Sang Hub · v${escHtml(bridge.HUB_VERSION)} · Aurora</div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="adm-dot live" title="Sessão ativa"></span>
                <span id="_admClose" title="Fechar (Esc)" style="cursor:pointer; font-size:13px; color:#8b8fa3;
                    width:26px; height:26px; display:flex; align-items:center; justify-content:center;
                    border-radius:7px; transition:all .15s;">✕</span>
            </div>
        `;

        // ─── BODY ───
        const body = document.createElement('div');
        body.style.cssText = `display:flex; gap:10px; padding:10px; flex:1; min-height:0;`;

        const colMain = document.createElement('div');
        colMain.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column;';

        const colSide = document.createElement('div');
        colSide.style.cssText = 'width:280px; flex-shrink:0; display:flex; flex-direction:column; gap:8px; overflow-y:auto; padding-right:2px;';

        // ─── FOOTER ───
        const foot = document.createElement('div');
        foot.className = 'adm-foot';
        foot.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="adm-dot live" style="width:6px; height:6px;"></span>
                <span>Sessão ativa</span>
            </div>
            <span id="_admFootRight" style="font-variant-numeric:tabular-nums;">—</span>
        `;

        // ─── SEC HELPER ───
        function sec(label, iconSvg, contentEl, extraHead) {
            const s = document.createElement('div');
            s.className = 'adm-sec';
            const h = document.createElement('div');
            h.className = 'adm-sec-head';
            h.innerHTML = `<span>${iconSvg}${label}</span>${extraHead || ''}`;
            s.appendChild(h);
            s.appendChild(contentEl);
            return s;
        }

        // ═══ COLUNA PRINCIPAL ═══
        const fsOk = bridge.firestore.configured();
        const sessContent = document.createElement('div');
        sessContent.style.cssText = 'display:flex; flex-direction:column; flex:1; min-height:0;';

        const countersHtml = `<div class="adm-counters" id="_admCounters">
            <span class="c-on" id="_admCOnline">0</span>
            <span class="c-bl" id="_admCBlocked">0</span>
        </div>`;

        sessContent.innerHTML = fsOk
            ? `<div id="_admSearchWrap" style="display:none;"></div>
               <div class="adm-sess-list" id="_admSessList">
                   <div style="padding:16px;text-align:center;font-size:9.5px;color:#5b5f70;">Conectando…</div>
               </div>`
            : `<div style="padding:16px;text-align:center;font-size:9.5px;color:#7d8194;">Firestore não configurado.</div>`;

        const sessSec = sec('Sessões ao vivo', ICON.users, sessContent, countersHtml);
        sessSec.style.flex = '1';
        colMain.appendChild(sessSec);

        // ═══ SIDEBAR — Status ═══
        const statusContent = document.createElement('div');
        statusContent.innerHTML = `
            <div class="adm-row">
                <span class="adm-row-label">Sua sessão</span>
                <span class="adm-row-val" id="_admSuaSessao">
                    <span class="adm-badge ${bridge.gate.blocked ? 'bad' : 'ok'}">${bridge.gate.blocked ? 'Bloqueada' : 'Livre'}</span>
                </span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Firestore</span>
                <span class="adm-badge ${fsOk ? 'ok' : 'neutral'}">${fsOk ? 'OK' : 'Off'}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Device ID</span>
                <span class="adm-row-val" id="_admDevCopy" title="Clique para copiar"
                    style="font-family:ui-monospace,monospace;font-size:9px;cursor:pointer;color:#22d3ee;
                    padding:2px 6px;border-radius:5px;background:rgba(34,211,238,0.06);transition:background .15s;">
                    ${shortHash(bridge.deviceId, 8, 4)}
                </span>
            </div>
        `;
        colSide.appendChild(sec('Status', ICON.status, statusContent));

        // ═══ SIDEBAR — Modo secret ═══
        const mode = bridge.gate.mode;
        const modoContent = document.createElement('div');
        const modeBtnStyle = (on) => `
            flex:1;
            background: ${on ? 'linear-gradient(120deg,#22d3ee,#a78bfa)' : 'rgba(255,255,255,0.035)'};
            color: ${on ? '#0b0b10' : '#c7cad6'};
            border: 1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.07)'};
        `;
        modoContent.innerHTML = `
            <div style="display:flex; gap:4px;">
                <button data-mode="auto" class="adm-mode-btn ${mode==='auto'?'active':''}" style="${modeBtnStyle(mode==='auto')}">AUTO</button>
                <button data-mode="on" class="adm-mode-btn ${mode==='on'?'active':''}" style="${modeBtnStyle(mode==='on')}">ON</button>
                <button data-mode="off" class="adm-mode-btn ${mode==='off'?'active':''}" style="${modeBtnStyle(mode==='off')}">OFF</button>
            </div>
            <div style="font-size:8.5px; color:#7d8194; margin-top:7px; line-height:1.45;">
                Afeta apenas <b style="color:#a8adbf;">módulos secret</b>. Não bloqueia o hub.
            </div>
        `;
        colSide.appendChild(sec('Módulos secret', ICON.zap, modoContent));

        // ═══ SIDEBAR — Blacklist ═══
        const blkContent = document.createElement('div');
        blkContent.innerHTML = `
            <div style="display:flex; gap:5px; margin-bottom:7px;">
                <button id="_admBlkAdd" class="adm-action-btn" style="flex:1; padding:6px; font-size:9px; font-weight:700;
                    background:rgba(251,113,133,0.08); border:1px solid rgba(251,113,133,0.28); color:#fca5b1;">
                    ${ICON.shield} <span>Bloquear</span>
                </button>
                <button id="_admBlkRem" class="adm-action-btn" style="flex:1; padding:6px; font-size:9px; font-weight:700;
                    background:rgba(52,211,153,0.08); border:1px solid rgba(52,211,153,0.28); color:#a7f3d0;">
                    ${ICON.zap} <span>Liberar</span>
                </button>
            </div>
            <div id="_admBlkList" style="display:flex; flex-direction:column; gap:3px; max-height:100px; overflow-y:auto;"></div>
        `;
        colSide.appendChild(sec('Blacklist local', ICON.shield, blkContent));

        // ═══ SIDEBAR — Ações ═══
        const acoesContent = document.createElement('div');
        acoesContent.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:5px;';
        [
            { id: '_admReload',  icon: ICON.refresh, label: 'Manifesto',  color: '#22d3ee' },
            { id: '_admKillMod', icon: ICON.stop,    label: 'Desativar',  color: '#a78bfa' },
            { id: '_admClean',   icon: ICON.broom,   label: 'Caches',     color: '#a78bfa' },
            { id: '_admRePage',  icon: ICON.reload,  label: 'Recarregar', color: '#fb7185' }
        ].forEach(a => {
            const b = document.createElement('button');
            b.id = a.id;
            b.className = 'adm-action-btn';
            b.innerHTML = `${a.icon} <span>${a.label}</span>`;
            b.style.cssText = `padding:6px; font-size:9px; font-weight:700;
                background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
                color:${a.color};`;
            acoesContent.appendChild(b);
        });
        colSide.appendChild(sec('Ações', ICON.refresh, acoesContent));

        // ═══ SIDEBAR — Sessão admin ═══
        const adminContent = document.createElement('div');
        adminContent.innerHTML = `
            <button id="_admLogout" class="adm-action-btn" style="width:100%; padding:7px; font-size:9px; font-weight:700;
                background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); color:#c7cad6; margin-bottom:5px;">
                ${ICON.exit} <span>Sair</span>
            </button>
            <button id="_admForget" class="adm-action-btn" style="width:100%; padding:7px; font-size:9px; font-weight:700;
                background:rgba(251,113,133,0.08); border:1px solid rgba(251,113,133,0.28); color:#fca5b1;">
                ${ICON.trash} <span>Esquecer device</span>
            </button>
        `;
        colSide.appendChild(sec('Sessão admin', ICON.user, adminContent));

        body.appendChild(colMain);
        body.appendChild(colSide);

        wrap.appendChild(hdr);
        wrap.appendChild(body);
        wrap.appendChild(foot);
        document.body.appendChild(wrap);

        // ═══ FECHAR / DRAG / ESC ═══
        const closeBtn = hdr.querySelector('#_admClose');
        closeBtn.addEventListener('click', _admKillPanel);
        closeBtn.addEventListener('mouseover', () => { closeBtn.style.background = 'rgba(251,113,133,0.15)'; closeBtn.style.color = '#fca5b1'; });
        closeBtn.addEventListener('mouseout',  () => { closeBtn.style.background = 'transparent'; closeBtn.style.color = '#8b8fa3'; });

        let drag = null;
        hdr.addEventListener('mousedown', (e) => {
            if (e.target.closest('#_admClose')) return;
            const r = wrap.getBoundingClientRect();
            drag = { x: e.clientX - r.left, y: e.clientY - r.top };
            wrap.style.left = r.left + 'px';
            wrap.style.top = r.top + 'px';
            wrap.style.cursor = 'grabbing';
        });
        const _moveH = (e) => {
            if (!drag) return;
            wrap.style.left = Math.max(0, e.clientX - drag.x) + 'px';
            wrap.style.top  = Math.max(0, e.clientY - drag.y) + 'px';
        };
        const _upH = () => { drag = null; wrap.style.cursor = ''; };
        document.addEventListener('mousemove', _moveH);
        document.addEventListener('mouseup', _upH);

        const _escH = (e) => { if (e.key === 'Escape') _admKillPanel(); };
        document.addEventListener('keydown', _escH);

        const _visH = () => { if (!document.hidden && _admPanelEl) _pollSessoes(); };
        document.addEventListener('visibilitychange', _visH);

        const _footTimer = setInterval(() => {
            if (!_admPanelEl) return;
            const now = new Date();
            foot.querySelector('#_admFootRight').textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        }, 30000);
        (function tick() {
            const now = new Date();
            foot.querySelector('#_admFootRight').textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        })();

        const _cleanup = () => {
            document.removeEventListener('mousemove', _moveH);
            document.removeEventListener('mouseup', _upH);
            document.removeEventListener('keydown', _escH);
            document.removeEventListener('visibilitychange', _visH);
            clearInterval(_footTimer);
            _pararPoll();
        };
        const _origKill = _admKillPanel;
        _admKillPanel = () => { _cleanup(); _origKill(); };

        // ═══ COPIAR DEVICE ID ═══
        const devCopyEl = statusContent.querySelector('#_admDevCopy');
        devCopyEl.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(bridge.deviceId || ''); _admToast('Device ID copiado', 'ok'); }
            catch(e) { _admToast('Falha ao copiar', 'err'); }
        });
        devCopyEl.addEventListener('mouseenter', () => { devCopyEl.style.background = 'rgba(34,211,238,0.14)'; });
        devCopyEl.addEventListener('mouseleave', () => { devCopyEl.style.background = 'rgba(34,211,238,0.06)'; });

        // ═══ MODO SECRET ═══
        modoContent.querySelectorAll('button[data-mode]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await bridge.gate.setMode(btn.dataset.mode);
                _admToast('Modo: ' + btn.dataset.mode.toUpperCase(), 'ok');
                try { bridge.refreshManifest(true); } catch(e) {}
                // Atualiza visual sem remontar
                modoContent.querySelectorAll('button[data-mode]').forEach(b => {
                    const on = b.dataset.mode === btn.dataset.mode;
                    b.classList.toggle('active', on);
                    b.style.background = on ? 'linear-gradient(120deg,#22d3ee,#a78bfa)' : 'rgba(255,255,255,0.035)';
                    b.style.color = on ? '#0b0b10' : '#c7cad6';
                    b.style.border = on ? '1px solid transparent' : '1px solid rgba(255,255,255,0.07)';
                });
            });
        });

        // ═══ BLACKLIST ═══
        const fp = bridge.gate.fp;
        function _renderBlkList() {
            const listEl = blkContent.querySelector('#_admBlkList');
            const fixos = bridge.blk.fixed();
            const extras = bridge.blk.extra();
            if (extras.length === 0 && fixos.length === 0) {
                listEl.innerHTML = '<div style="padding:6px;text-align:center;font-size:8.5px;color:#5b5f70;">Vazia.</div>';
                return;
            }
            const parts = [];
            fixos.forEach(h => parts.push(`<div class="adm-blk-line fixed">
                <span class="adm-blk-hash">${shortHash(h, 8, 5)}</span>
                <span style="font-size:7px; padding:1px 5px; border-radius:4px; background:rgba(139,143,163,0.14); color:#7d8194; font-weight:800;">FIXO</span>
            </div>`));
            extras.forEach((h, i) => parts.push(`<div class="adm-blk-line">
                <span class="adm-blk-hash">${shortHash(h, 8, 5)}</span>
                <span data-rm="${i}" class="adm-blk-rm" title="Remover">✕</span>
            </div>`));
            listEl.innerHTML = parts.join('');
            listEl.querySelectorAll('[data-rm]').forEach(el => el.addEventListener('click', async () => {
                const i = parseInt(el.dataset.rm, 10);
                await bridge.blk.remove(bridge.blk.extra()[i]);
                _renderBlkList();
            }));
        }
        _renderBlkList();

        blkContent.querySelector('#_admBlkAdd').addEventListener('click', async () => {
            if (!fp) return _admToast('Fingerprint não calculado', 'err');
            if (bridge.blk.extra().includes(fp) || bridge.blk.fixed().includes(fp)) return _admToast('Já está na lista', 'err');
            await bridge.blk.add(fp);
            _renderBlkList();
            _admToast('Fingerprint bloqueado', 'ok');
        });
        blkContent.querySelector('#_admBlkRem').addEventListener('click', async () => {
            if (!fp) return _admToast('Fingerprint não calculado', 'err');
            if (!bridge.blk.extra().includes(fp)) {
                return _admToast(bridge.blk.fixed().includes(fp) ? 'Na lista fixa' : 'Não está na lista', 'err');
            }
            await bridge.blk.remove(fp);
            _renderBlkList();
            _admToast('Fingerprint liberado', 'ok');
        });

        // ═══════════════════════════════════════════════════════
        // RENDER SESSÕES
        // ═══════════════════════════════════════════════════════
        const listEl = sessContent.querySelector('#_admSessList');
        const searchWrap = sessContent.querySelector('#_admSearchWrap');
        const cOnline = sessSec.querySelector('#_admCOnline');
        const cBlocked = sessSec.querySelector('#_admCBlocked');

        // Input de busca (mostrado condicionalmente)
        searchWrap.innerHTML = `<input id="_admSearch" class="adm-search" type="text" placeholder="Buscar por nome ou device ID…" autocomplete="off" spellcheck="false" />`;
        const searchInput = searchWrap.querySelector('#_admSearch');
        searchInput.addEventListener('input', () => {
            _searchQuery = searchInput.value.trim().toLowerCase();
            _lastSig = ''; // força re-render
            if (_renderSessoes) _renderSessoes();
        });

        function renderRow(s, idx, now) {
            const ago = now - (s.lastSeen || 0);
            const online = ago < SESSAO_ONLINE_MS;
            const bloq = s.blocked === true;
            const euMesmo = s.id === bridge.deviceId;
            const hubV = s.hubVersion || '?';
            const vCls = hubV === bridge.HUB_VERSION ? 'current' : 'outdated';
            const tempo = online
                ? 'ativa ' + fmtDur(now - (s.sessionStart || s.lastSeen || now))
                : 'há ' + fmtAtras(ago);
            const expanded = _expandedRows.has(s.id);

            return `<div class="adm-sess-item ${euMesmo ? 'self' : ''} ${expanded ? 'expanded' : ''}"
                        data-sess-id="${escAttr(s.id)}"
                        style="animation-delay:${Math.min(idx * 18, 240)}ms;">
                <div class="adm-sess-head" data-head>
                    <span class="adm-dot ${online ? 'live' : 'offline'}" title="${online ? 'Online' : 'Offline'}"></span>
                    <span class="adm-sess-name" title="${escAttr(s.name || 'Sem nome')}">${escHtml(s.name || 'Sem nome')}${euMesmo ? ' <span style="color:#a78bfa">(você)</span>' : ''}</span>
                    <span class="adm-sess-meta">${shortHash(s.id, 7, 4)} · ${tempo}</span>
                    <span class="adm-sess-version ${vCls}">v${escHtml(hubV)}</span>
                    <span class="adm-switch-wrap">
                        <label class="adm-switch" title="${bloq ? 'Bloqueado — clique para liberar' : 'Livre — clique para bloquear'}">
                            <input type="checkbox" ${bloq ? 'checked' : ''} data-toggle-id="${escAttr(s.id)}" data-name="${escAttr(s.name || 'Sessão')}" />
                            <span class="adm-switch-track"></span>
                        </label>
                        ${!bloq ? `<button class="adm-temp-btn" data-temp-id="${escAttr(s.id)}" data-temp-name="${escAttr(s.name || 'Sessão')}" title="Bloquear temporariamente">⏱</button>` : ''}
                    </span>
                </div>
                ${expanded ? `
                <div class="adm-sess-detail">
                    <div class="adm-sess-detail-row"><span>deviceId</span><span title="${escAttr(s.id)}">${escHtml(s.id)}</span></div>
                    ${s.fingerprint ? `<div class="adm-sess-detail-row"><span>fingerprint</span><span title="${escAttr(s.fingerprint)}">${shortHash(s.fingerprint, 12, 6)}</span></div>` : ''}
                    ${s.sessionStart ? `<div class="adm-sess-detail-row"><span>início</span><span>${timestampAbsoluto(s.sessionStart)}</span></div>` : ''}
                    <div class="adm-sess-detail-row"><span>último sinal</span><span>${timestampAbsoluto(s.lastSeen)}</span></div>
                    ${s.ua ? `<div class="adm-sess-detail-row"><span>user agent</span><span title="${escAttr(s.ua)}">${escHtml(s.ua.slice(0, 42))}…</span></div>` : ''}
                    ${s.mission ? `<div class="adm-sess-detail-row"><span>missão</span><span title="${escAttr(s.mission)}">${escHtml(s.mission)}</span></div>` : ''}
                    <button class="adm-sess-detail-btn" data-copy-id="${escAttr(s.id)}">Copiar tudo</button>
                </div>` : ''}
            </div>`;
        }

        function recomputarFiltrados() {
            const all = Array.from(_sessionsMap.values());
            const q = _searchQuery;
            const filtrados = q
                ? all.filter(s =>
                    (s.name || '').toLowerCase().includes(q) ||
                    s.id.toLowerCase().includes(q) ||
                    (s.mission || '').toLowerCase().includes(q))
                : all;

            const now = Date.now();
            const online = filtrados.filter(s => (now - (s.lastSeen || 0)) < SESSAO_ONLINE_MS);
            const offline = filtrados.filter(s => (now - (s.lastSeen || 0)) >= SESSAO_ONLINE_MS);
            return { all, filtrados, online, offline };
        }

        function _renderCounters(all) {
            const now = Date.now();
            const on = all.filter(s => (now - (s.lastSeen || 0)) < SESSAO_ONLINE_MS).length;
            const bl = all.filter(s => s.blocked === true).length;
            cOnline.textContent = on;
            cBlocked.textContent = bl;
        }

        function _updateOwnSessionBadge() {
            const eu = _sessionsMap.get(bridge.deviceId);
            const suaEl = statusContent.querySelector('#_admSuaSessao');
            if (!suaEl) return;
            if (!eu) suaEl.innerHTML = `<span class="adm-badge neutral">sem registro</span>`;
            else if (eu.blocked === true) suaEl.innerHTML = `<span class="adm-badge bad">Bloqueada</span>`;
            else suaEl.innerHTML = `<span class="adm-badge ok">Livre</span>`;
        }

        _renderSessoes = function(skipRebuild) {
            const { all, filtrados, online, offline } = recomputarFiltrados();
            _renderCounters(all);
            _updateOwnSessionBadge();

            // Mostra/esconde busca
            const total = all.length;
            if (total > 5) {
                searchWrap.style.display = '';
            } else {
                searchWrap.style.display = 'none';
                if (_searchQuery) { _searchQuery = ''; searchInput.value = ''; }
            }

            if (!filtrados.length) {
                listEl.innerHTML = `<div style="padding:16px;text-align:center;font-size:9.5px;color:#5b5f70;">
                    ${_searchQuery ? 'Nada encontrado.' : (all.length ? 'Nenhuma sessão com filtro.' : 'Nenhuma sessão registrada.')}
                </div>`;
                return;
            }

            const now = Date.now();
            let html = '';
            let idx = 0;

            if (online.length) {
                html += `<div class="adm-sess-group">Online · ${online.length}</div>`;
                html += online.map(s => renderRow(s, idx++, now)).join('');
            }
            if (offline.length) {
                const totalOff = offline.length;
                const showOffline = _offlineExpanded || totalOff <= 5;
                html += `<div class="adm-sess-group clickable" data-toggle-offline="1">
                    <span>Offline · ${totalOff}</span>
                    <span style="font-size:10px;">${showOffline ? '▾' : '▸'}</span>
                </div>`;
                if (showOffline) {
                    html += offline.map(s => renderRow(s, idx++, now)).join('');
                }
            }
            listEl.innerHTML = html;

            // ─── Eventos ───
            // Group toggle offline
            const grp = listEl.querySelector('[data-toggle-offline]');
            if (grp) grp.addEventListener('click', () => {
                _offlineExpanded = !_offlineExpanded;
                _lastSig = '';
                _renderSessoes();
            });

            // Row expand (clicar no head, exceto switch/temp btn)
            listEl.querySelectorAll('.adm-sess-item').forEach(item => {
                const head = item.querySelector('[data-head]');
                if (!head) return;
                head.addEventListener('click', (e) => {
                    if (e.target.closest('.adm-switch') || e.target.closest('.adm-temp-btn')) return;
                    const id = item.dataset.sessId;
                    if (_expandedRows.has(id)) _expandedRows.delete(id);
                    else _expandedRows.add(id);
                    _lastSig = '';
                    _renderSessoes();
                });
            });

            // Switch toggle
            listEl.querySelectorAll('input[data-toggle-id]').forEach(inp => {
                inp.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const alvoId = inp.dataset.toggleId;
                    const alvoNome = inp.dataset.name || 'Sessão';
                    const novo = inp.checked;
                    const euMesmo = alvoId === bridge.deviceId;

                    // Confirmação de auto-bloqueio
                    if (novo && euMesmo) {
                        inp.checked = false;
                        const ok = await _confirmarAutoBloqueio();
                        if (!ok) return;
                        inp.checked = true;
                    }

                    const sw = inp.closest('.adm-switch');
                    sw.classList.add('busy');
                    try {
                        await _aplicarBloqueio(alvoId, novo, 0);
                        if (novo) {
                            // Undo no toast
                            _admToast(`${alvoNome} bloqueado`, 'ok', async () => {
                                try {
                                    await _aplicarBloqueio(alvoId, false, 0);
                                    _admToast('Bloqueio desfeito', 'ok');
                                } catch(err) { _admToast('Falha ao desfazer', 'err'); }
                            });
                        } else {
                            _admToast(`${alvoNome} liberado`, 'ok');
                        }
                    } catch(err) {
                        _admToast('Falha ao atualizar', 'err');
                        inp.checked = !novo;
                        sw.classList.remove('busy');
                    }
                });
            });

            // Temp block btn
            listEl.querySelectorAll('[data-temp-id]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _abrirTempMenu(btn, btn.dataset.tempId, btn.dataset.tempName);
                });
            });

            // Copy all
            listEl.querySelectorAll('[data-copy-id]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.copyId;
                    const s = _sessionsMap.get(id);
                    if (!s) return;
                    const txt = [
                        `deviceId: ${s.id}`,
                        `nome: ${s.name || ''}`,
                        `missão: ${s.mission || ''}`,
                        `fingerprint: ${s.fingerprint || ''}`,
                        `hub: v${s.hubVersion || '?'}`,
                        `sessionStart: ${timestampAbsoluto(s.sessionStart)}`,
                        `lastSeen: ${timestampAbsoluto(s.lastSeen)}`,
                        `blocked: ${s.blocked === true}`,
                        `ua: ${s.ua || ''}`
                    ].join('\n');
                    try { await navigator.clipboard.writeText(txt); _admToast('Copiado', 'ok'); }
                    catch(err) { _admToast('Falha ao copiar', 'err'); }
                });
            });
        };

        // ═══ AÇÕES ═══
        acoesContent.querySelector('#_admReload').addEventListener('click', () => {
            try { bridge.refreshManifest(true); _admToast('Manifesto recarregado', 'ok'); } catch(e) { _admToast('Erro', 'err'); }
        });
        acoesContent.querySelector('#_admKillMod').addEventListener('click', () => {
            try {
                let n = 0;
                (bridge.state.manifest.modules || []).forEach(mod => {
                    if (bridge.state.moduleStates[mod.id] === 'loaded') { bridge.deactivateModule(mod); n++; }
                });
                _admToast(n + ' módulos desativados', 'ok');
            } catch(e) { _admToast('Erro', 'err'); }
        });
        acoesContent.querySelector('#_admClean').addEventListener('click', () => {
            try {
                localStorage.removeItem('sanghub_manifest_cache');
                localStorage.removeItem('sanghub_player_cache');
                _admToast('Caches limpos', 'ok');
            } catch(e) { _admToast('Erro', 'err'); }
        });
        acoesContent.querySelector('#_admRePage').addEventListener('click', () => location.reload());

        // ═══ ADMIN ═══
        adminContent.querySelector('#_admLogout').addEventListener('click', () => {
            _admAuthed = false;
            _admKillPanel();
            _admToast('Sessão encerrada', 'ok');
        });
        adminContent.querySelector('#_admForget').addEventListener('click', () => {
            _admClearToken();
            _admAuthed = false;
            _admKillPanel();
            _admToast('Token removido', 'ok');
        });

        // ═══ LIGA POLLING ═══
        if (fsOk) {
            _renderSessoes();
            _iniciarPoll();
        }
    }

    // ═══ OPEN / TOGGLE / KILL ═══
    function _admOpen() {
        if (_admAuthed || _admHasToken()) { _admAuthed = true; _admMountPanel(); }
        else _admMountLogin();
    }
    function toggle() {
        if (_admPanelEl || _admModalEl) { _admKillPanel(); _admKillModal(); return; }
        _admOpen();
    }
    function kill() {
        _admKillPanel();
        _admKillModal();
        _fecharConfirm();
        _fecharTempMenu();
        document.querySelectorAll('style[data-hub-admin]').forEach(el => el.remove());
        _admStyleInjected = false;
        delete window[UID];
        try { window.dispatchEvent(new CustomEvent('sang:module-close', { detail: { id: 'admin' } })); } catch(e) {}
    }

    window[UID] = { kill, toggle };
})();
