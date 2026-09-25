// modules/admin.js
(function() {
    'use strict';
    const UID = '_admin';
    if (window[UID]) return;

    const bridge = window._hubBridge;
    if (!bridge) {
        console.warn('[Admin] _hubBridge não encontrado.');
        return;
    }

    // ═══ CONFIG ═══
    const ADMIN_U_B64 = 'c2FuZw==';
    const ADMIN_P_B64 = 'ZGV2ZWxvcGVyMTI=';
    const ADMIN_TOKEN_KEY = 'sanghub_admin_token';
    const ADMIN_TTL = 30 * 24 * 60 * 60 * 1000;
    const SESSAO_ONLINE_MS = 5 * 60 * 1000;
    const SESSOES_REFRESH_MS = 20 * 1000;

    // ═══ STATE ═══
    let _admAuthed = false;
    let _admPanelEl = null;
    let _admModalEl = null;
    let _sessoesTimer = null;

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

    // ═══ KILL ═══
    function _admKillModal() { if (_admModalEl) { _admAnimateOut(_admModalEl); _admModalEl = null; } }
    function _admKillPanel() {
        if (_admPanelEl) { _admAnimateOut(_admPanelEl); _admPanelEl = null; }
        if (_sessoesTimer) { clearInterval(_sessoesTimer); _sessoesTimer = null; }
    }
    function _admAnimateOut(el) {
        if (!el) return;
        el.style.transition = 'opacity .16s ease, transform .16s ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(.97)';
        setTimeout(() => el.remove(), 160);
    }

    // ═══ TOAST ═══
    function _admToast(msg, kind) {
        _admEnsureStyle();
        const t = document.createElement('div');
        t.className = 'adm-toast' + (kind ? ' ' + kind : '');
        t.setAttribute('data-hub-admin', '1');
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2400);
    }

    // ═══ STYLE ═══
    let _admStyleInjected = false;
    function _admEnsureStyle() {
        if (_admStyleInjected) return;
        _admStyleInjected = true;
        const st = document.createElement('style');
        st.setAttribute('data-hub-admin', '1');
        st.textContent = `
        /* ═══ AURORA GLASS ═══ */
        @property --aur-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
        @keyframes aurSpin{to{--aur-angle:360deg}}
        @keyframes aurShine{to{background-position:-200% center}}
        @keyframes aurFade{from{opacity:0}to{opacity:1}}
        @keyframes aurPopIn{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
        @keyframes aurPanelIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}
        @keyframes aurShake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
        @keyframes aurPulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes aurLive{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,.6)}50%{opacity:.75;box-shadow:0 0 0 4px rgba(52,211,153,0)}}
        @keyframes aurSlideIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:none}}
        @keyframes aurFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(8px,-6px) scale(1.05)}}

        .adm-box{position:relative;animation:aurPopIn .4s cubic-bezier(0.16,1,0.3,1)}
        .adm-box.adm-shake{animation:aurShake .4s ease}

        .adm-panel{animation:aurPanelIn .3s cubic-bezier(0.16,1,0.3,1);
            position:relative;isolation:isolate}

        /* Aurora background glows */
        .adm-panel::before{
            content:'';position:absolute;inset:0;z-index:-1;border-radius:inherit;overflow:hidden;
            background:
                radial-gradient(circle at 12% 0%, rgba(34,211,238,0.14), transparent 42%),
                radial-gradient(circle at 88% 100%, rgba(167,139,250,0.14), transparent 42%),
                radial-gradient(circle at 50% 50%, rgba(74,222,128,0.05), transparent 60%),
                radial-gradient(circle at 100% 0%, rgba(244,114,182,0.06), transparent 45%),
                linear-gradient(175deg, rgba(14,18,28,0.82), rgba(8,10,16,0.92));
            animation:aurFloat 18s ease-in-out infinite;
        }
        /* Iridescent border */
        .adm-panel::after{
            content:'';position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;
            padding:1px;
            background:linear-gradient(135deg, rgba(34,211,238,0.35), rgba(167,139,250,0.3) 40%, rgba(244,114,182,0.25) 70%, rgba(52,211,153,0.3));
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
            -webkit-mask-composite:xor;mask-composite:exclude;
        }

        .adm-title-shine{
            background:linear-gradient(100deg,#22d3ee 0%,#a78bfa 35%,#fff 50%,#f472b6 65%,#22d3ee 100%);
            background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
            animation:aurShine 3.4s linear infinite;
        }

        .adm-input{width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:12px;
            background:rgba(255,255,255,0.045);border:1px solid rgba(255,255,255,0.1);border-radius:9px;
            color:#f1f2f8;font-size:12.5px;outline:none;font-family:inherit;
            transition:border-color .18s,box-shadow .18s,background .18s}
        .adm-input:focus{border-color:rgba(34,211,238,.55);
            box-shadow:0 0 0 3px rgba(34,211,238,.14),0 0 24px rgba(34,211,238,.1);
            background:rgba(255,255,255,0.06)}

        /* Sections with glass effect */
        .adm-sec{position:relative;background:rgba(255,255,255,0.024);
            border:1px solid rgba(255,255,255,0.06);
            border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;min-height:0;
            backdrop-filter:blur(6px);
            transition:border-color .25s,background .25s,box-shadow .25s}
        .adm-sec:hover{border-color:rgba(34,211,238,0.16);
            background:rgba(255,255,255,0.032);
            box-shadow:0 0 24px rgba(34,211,238,0.04)}
        .adm-sec-head{display:flex;align-items:center;justify-content:space-between;gap:6px;
            font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
            color:#8b8fa3;margin-bottom:8px;padding-bottom:6px;
            border-bottom:1px solid rgba(255,255,255,0.05)}
        .adm-sec-head > span{display:flex;align-items:center;gap:6px}
        .adm-sec-head svg{opacity:.75}

        /* Dots */
        .adm-dot{display:inline-block;width:6px;height:6px;border-radius:50%;vertical-align:middle;flex-shrink:0}
        .adm-dot.loading{background:#22d3ee;animation:aurPulse 1s infinite}
        .adm-dot.synced{background:#34d399;box-shadow:0 0 8px rgba(52,211,153,.75)}
        .adm-dot.error{background:#fb7185}
        .adm-dot.live{background:#34d399;animation:aurLive 2s ease-in-out infinite}
        .adm-dot.offline{background:#4b4f60}

        /* Badges */
        .adm-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:14px;font-size:8.5px;
            font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:1px solid transparent}
        .adm-badge::before{content:'';width:4px;height:4px;border-radius:50%;flex-shrink:0}
        .adm-badge.ok{background:rgba(52,211,153,.1);color:#a7f3d0;border-color:rgba(52,211,153,.28)}
        .adm-badge.ok::before{background:#34d399;box-shadow:0 0 5px rgba(52,211,153,.7)}
        .adm-badge.bad{background:rgba(251,113,133,.1);color:#fca5b1;border-color:rgba(251,113,133,.28)}
        .adm-badge.bad::before{background:#fb7185}
        .adm-badge.neutral{background:rgba(255,255,255,.045);color:#c7cad6;border-color:rgba(255,255,255,.08)}
        .adm-badge.neutral::before{background:#5b5f70}

        /* Rows */
        .adm-row{display:flex;justify-content:space-between;align-items:center;
            font-size:10px;padding:5px 0;color:#c7cad6}
        .adm-row + .adm-row{border-top:1px dashed rgba(255,255,255,.04)}
        .adm-row-label{color:#8b8fa3}
        .adm-row-val{color:#f1f2f8;font-weight:700;font-variant-numeric:tabular-nums;font-size:10px}

        /* Buttons */
        .adm-action-btn{transition:all .15s cubic-bezier(0.16,1,0.3,1);
            display:flex;align-items:center;gap:5px;justify-content:center;cursor:pointer;font-family:inherit;border-radius:8px}
        .adm-action-btn:hover{background:rgba(255,255,255,0.08)!important;transform:translateY(-1px);
            box-shadow:0 4px 14px rgba(0,0,0,.25)}
        .adm-action-btn:active{transform:translateY(0) scale(.97)}
        .adm-action-btn svg{flex-shrink:0}

        .adm-mode-btn{transition:all .18s cubic-bezier(0.16,1,0.3,1);cursor:pointer;font-family:inherit;border-radius:7px;
            padding:6px 4px;font-size:9px;font-weight:800;letter-spacing:.04em;
            position:relative;overflow:hidden}
        .adm-mode-btn:hover:not(.active){background:rgba(255,255,255,0.07)!important;transform:translateY(-1px)}
        .adm-mode-btn:active{transform:scale(.97)}

        /* Blacklist */
        .adm-blk-line{display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:6px;
            font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:8.5px;color:#b8bcca;
            background:rgba(255,255,255,0.018);border:1px solid rgba(255,255,255,0.035)}
        .adm-blk-line.fixed{color:#7d8194}
        .adm-blk-hash{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .adm-blk-rm{cursor:pointer;color:#fb7185;font-size:10px;font-weight:800;flex-shrink:0;
            width:16px;height:16px;display:flex;align-items:center;justify-content:center;
            border-radius:4px;transition:background .15s}
        .adm-blk-rm:hover{background:rgba(251,113,133,.15)}

        /* Sessions (main content) */
        .adm-sess-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:4px;padding-right:2px}
        .adm-sess-list::-webkit-scrollbar{width:5px}
        .adm-sess-list::-webkit-scrollbar-thumb{background:linear-gradient(#22d3ee,#a78bfa);border-radius:3px}
        .adm-sess-line{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;
            background:rgba(255,255,255,0.024);border:1px solid rgba(255,255,255,0.05);
            transition:all .18s cubic-bezier(0.16,1,0.3,1);
            animation:aurSlideIn .22s cubic-bezier(0.16,1,0.3,1) backwards;
            backdrop-filter:blur(4px)}
        .adm-sess-line:hover{background:rgba(255,255,255,0.05);
            border-color:rgba(34,211,238,0.18);
            box-shadow:0 4px 16px rgba(0,0,0,.2),0 0 24px rgba(34,211,238,0.03)}
        .adm-sess-name{font-weight:700;color:#f1f2f8;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            flex-shrink:0;max-width:34%;min-width:70px}
        .adm-sess-meta{flex:1;min-width:0;font-size:9px;color:#8b8fa3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            font-family:ui-monospace,'SF Mono',Menlo,monospace;letter-spacing:.01em}

        /* Switch — block/unblock */
        .adm-switch{position:relative;display:inline-block;width:30px;height:16px;flex-shrink:0;cursor:pointer}
        .adm-switch input{opacity:0;width:0;height:0;position:absolute}
        .adm-switch-track{position:absolute;inset:0;background:linear-gradient(120deg,rgba(52,211,153,0.18),rgba(34,211,238,0.18));
            border:1px solid rgba(52,211,153,0.42);border-radius:20px;transition:.22s cubic-bezier(0.16,1,0.3,1);
            box-shadow:inset 0 0 6px rgba(52,211,153,.08)}
        .adm-switch-track::before{content:'';position:absolute;width:12px;height:12px;left:1px;top:1px;
            background:linear-gradient(135deg,#34d399,#22d3ee);border-radius:50%;transition:.22s cubic-bezier(0.16,1,0.3,1);
            box-shadow:0 0 8px rgba(52,211,153,.7)}
        .adm-switch input:checked + .adm-switch-track{
            background:linear-gradient(120deg,rgba(251,113,133,0.2),rgba(244,114,182,0.2));
            border-color:rgba(251,113,133,0.48);
            box-shadow:inset 0 0 6px rgba(251,113,133,.1)}
        .adm-switch input:checked + .adm-switch-track::before{
            background:linear-gradient(135deg,#fb7185,#f472b6);
            transform:translateX(14px);box-shadow:0 0 8px rgba(251,113,133,.75)}
        .adm-switch.busy{opacity:.5;pointer-events:none}

        /* Footer */
        .adm-foot{padding:9px 14px;background:rgba(0,0,0,0.22);
            border-top:1px solid rgba(255,255,255,0.05);
            display:flex;align-items:center;justify-content:space-between;gap:8px;
            font-size:9px;color:#8b8fa3;flex-shrink:0;
            border-radius:0 0 14px 14px}

        /* Toast */
        .adm-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-10px);
            z-index:2147483647;padding:10px 18px;border-radius:10px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            font-size:11.5px;font-weight:700;color:#cffafe;
            background:linear-gradient(175deg,rgba(14,18,24,0.97),rgba(8,10,14,0.98));
            border:1px solid rgba(34,211,238,0.5);
            box-shadow:0 10px 30px rgba(0,0,0,0.5),0 0 40px rgba(34,211,238,0.1);
            backdrop-filter:blur(10px);
            transition:opacity .25s ease,transform .25s ease;opacity:0;pointer-events:none}
        .adm-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        .adm-toast.ok{color:#a7f3d0;border-color:rgba(52,211,153,0.5);box-shadow:0 10px 30px rgba(0,0,0,0.5),0 0 40px rgba(52,211,153,0.12)}
        .adm-toast.err{color:#fecdd3;border-color:rgba(251,113,133,0.5);box-shadow:0 10px 30px rgba(0,0,0,0.5),0 0 40px rgba(251,113,133,0.12)}

        .adm-icon-box{display:inline-flex;align-items:center;justify-content:center;
            width:24px;height:24px;border-radius:8px;
            background:linear-gradient(135deg,rgba(34,211,238,0.14),rgba(167,139,250,0.14));
            border:1px solid rgba(34,211,238,0.32);flex-shrink:0}
        `;
        document.head.appendChild(st);
    }

    // ═══ ICONS ═══
    const ICON = {
        lock:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>`,
        gear:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
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
        users:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
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

    // ═══ LOGIN ═══
    function _admMountLogin() {
        _admEnsureStyle();
        _admKillModal();
        _admKillPanel();

        const wrap = document.createElement('div');
        wrap.setAttribute('data-hub-admin', '1');
        wrap.setAttribute('data-sang-ui', '');
        wrap.style.cssText = `
            position: fixed; inset: 0; z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            background: radial-gradient(circle at 50% 40%, rgba(34,211,238,0.06), transparent 60%),
                        radial-gradient(circle at 20% 80%, rgba(167,139,250,0.06), transparent 50%),
                        rgba(0,0,0,0.62);
            backdrop-filter: blur(8px);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            animation:aurFade .2s ease-out;
        `;

        const box = document.createElement('div');
        box.className = 'adm-box';
        box.style.cssText = `
            width: 320px; border-radius: 14px; padding: 20px; position:relative; isolation:isolate;
            background: linear-gradient(175deg, rgba(16,20,30,0.9), rgba(8,10,16,0.96));
            backdrop-filter: blur(24px) saturate(160%);
            border: 1px solid transparent;
            box-shadow: 0 24px 60px rgba(0,0,0,0.7), 0 0 60px rgba(34,211,238,0.06);
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

    // ═══ PANEL ═══
    function _admMountPanel() {
        _admEnsureStyle();
        _admKillModal();
        _admKillPanel();

        const wrap = document.createElement('div');
        wrap.className = 'adm-panel';
        wrap.setAttribute('data-hub-admin', '1');
        wrap.setAttribute('data-sang-ui', '');
        wrap.style.cssText = `
            position: fixed; top: 16px; left: 16px; width: 880px; max-width: 96vw; max-height: 92vh;
            z-index: 2147483647; display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #f1f2f8; user-select: none;
            backdrop-filter: blur(28px) saturate(180%);
            border-radius: 14px;
            box-shadow: 0 24px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06);
            overflow: hidden;
        `;

        // ─── HEADER ───
        const hdr = document.createElement('div');
        hdr.style.cssText = `
            padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;
            cursor: grab; flex-shrink: 0;
            background: linear-gradient(120deg, rgba(34,211,238,0.08), rgba(167,139,250,0.08) 50%, rgba(244,114,182,0.06));
            border-bottom: 1px solid rgba(255,255,255,0.055);
        `;
        hdr.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="adm-icon-box">${ICON.gear}</span>
                <div>
                    <div class="adm-title-shine" style="font-size:12px; font-weight:800; letter-spacing:.1em;">PAINEL ADMIN</div>
                    <div style="font-size:8.5px; color:#7d8194; letter-spacing:.05em; text-transform:uppercase; margin-top:1px;">Sang Hub · v${bridge.HUB_VERSION} · Aurora</div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="adm-dot live" title="Sessão ativa"></span>
                <span id="_admClose" title="Fechar (Esc)" style="cursor:pointer; font-size:13px; color:#8b8fa3;
                    width:24px; height:24px; display:flex; align-items:center; justify-content:center;
                    border-radius:6px; transition:all .15s;">✕</span>
            </div>
        `;

        // ─── BODY: 2 colunas ───
        const body = document.createElement('div');
        body.style.cssText = `display:flex; gap:10px; padding:10px; flex:1; min-height:0;`;

        const colMain = document.createElement('div');
        colMain.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column;';

        const colSide = document.createElement('div');
        colSide.style.cssText = 'width:280px; flex-shrink:0; display:flex; flex-direction:column; gap:8px; overflow-y:auto; padding-right:2px;';
        colSide.className = 'adm-sess-list';

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

        // ═══ COLUNA PRINCIPAL: SESSÕES ═══
        const fsOk = bridge.firestore.configured();
        const sessContent = document.createElement('div');
        sessContent.style.cssText = 'display:flex; flex-direction:column; flex:1; min-height:0;';
        sessContent.innerHTML = fsOk
            ? `<div class="adm-sess-list" id="_admSessList">
                   <div style="padding:16px;text-align:center;font-size:9.5px;color:#5b5f70;">Carregando…</div>
               </div>`
            : `<div style="padding:16px;text-align:center;font-size:9.5px;color:#7d8194;">Firestore não configurado.</div>`;

        const sessRefresh = fsOk
            ? `<button id="_admSessRefresh" title="Atualizar agora" style="cursor:pointer; background:transparent;
                   border:1px solid rgba(255,255,255,0.08); border-radius:6px; width:22px; height:22px;
                   color:#c7cad6; display:flex; align-items:center; justify-content:center; transition:all .15s;">${ICON.refresh}</button>`
            : '';

        const sessSec = sec('Sessões ao vivo', ICON.users, sessContent, sessRefresh);
        sessSec.style.flex = '1';
        colMain.appendChild(sessSec);

        // ═══ SIDEBAR ═══
        // — Status
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
                    style="font-family:ui-monospace,monospace;font-size:9px;cursor:pointer;color:#22d3ee;">${shortHash(bridge.deviceId, 8, 4)}</span>
            </div>
        `;
        colSide.appendChild(sec('Status', ICON.status, statusContent));

        // — Módulos secret
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

        // — Blacklist local
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

        // — Ações
        const acoesContent = document.createElement('div');
        acoesContent.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:5px;';
        [
            { id: '_admReload',  icon: ICON.refresh, label: 'Manifesto',   color: '#22d3ee' },
            { id: '_admKillMod', icon: ICON.stop,    label: 'Desativar',   color: '#a78bfa' },
            { id: '_admClean',   icon: ICON.broom,   label: 'Caches',      color: '#a78bfa' },
            { id: '_admRePage',  icon: ICON.reload,  label: 'Recarregar',  color: '#fb7185' }
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

        // — Sessão admin
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
        _admPanelEl = wrap;

        // ─── FECHAR / DRAG / ESC ───
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
            clearInterval(_footTimer);
            if (_sessoesTimer) { clearInterval(_sessoesTimer); _sessoesTimer = null; }
        };
        const _origKill = _admKillPanel;
        _admKillPanel = () => { _cleanup(); _origKill(); };

        // ─── COPIAR ID ───
        statusContent.querySelector('#_admDevCopy')?.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(bridge.deviceId || ''); _admToast('Device ID copiado', 'ok'); }
            catch(e) { _admToast('Falha ao copiar', 'err'); }
        });

        // ─── MODO SECRET ───
        modoContent.querySelectorAll('button[data-mode]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await bridge.gate.setMode(btn.dataset.mode);
                _admToast('Modo: ' + btn.dataset.mode.toUpperCase(), 'ok');
                _admKillPanel();
                _admMountPanel();
                try { bridge.refreshManifest(true); } catch(e) {}
            });
        });

        // ─── BLACKLIST LOCAL ───
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

        // ─── SESSÕES ───
        async function carregarSessoes() {
            const listEl = sessContent.querySelector('#_admSessList');
            if (!listEl) return;
            try {
                const data = await bridge.firestore.request('GET', '/sessions');
                const docs = data?.documents || [];
                const sessoes = docs.map(d => {
                    const id = d.name.split('/').pop();
                    return { id, ...bridge.firestore.parseDoc(d) };
                }).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

                const myId = bridge.deviceId;
                const eu = sessoes.find(s => s.id === myId);
                const suaEl = statusContent.querySelector('#_admSuaSessao');
                if (suaEl) {
                    if (!eu) suaEl.innerHTML = `<span class="adm-badge neutral">sem registro</span>`;
                    else if (eu.blocked === true) suaEl.innerHTML = `<span class="adm-badge bad">Bloqueada</span>`;
                    else suaEl.innerHTML = `<span class="adm-badge ok">Livre</span>`;
                }

                if (!sessoes.length) {
                    listEl.innerHTML = '<div style="padding:16px;text-align:center;font-size:9.5px;color:#5b5f70;">Nenhuma sessão registrada.</div>';
                    return;
                }

                listEl.innerHTML = sessoes.map((s, i) => {
                    const ago = Date.now() - (s.lastSeen || 0);
                    const online = ago < SESSAO_ONLINE_MS;
                    const bloq = s.blocked === true;
                    const euMesmo = s.id === myId;
                    const tempo = online
                        ? 'ativa ' + fmtDur(Date.now() - (s.sessionStart || s.lastSeen || Date.now()))
                        : 'há ' + fmtAtras(ago);
                    return `<div class="adm-sess-line" style="animation-delay:${i * 20}ms;">
                        <span class="adm-dot ${online ? 'live' : 'offline'}" title="${online ? 'Online' : 'Offline'}"></span>
                        <span class="adm-sess-name">${escHtml(s.name || 'Sem nome')}${euMesmo ? ' (você)' : ''}</span>
                        <span class="adm-sess-meta">${shortHash(s.id, 7, 4)} · ${tempo} · v${escHtml(s.hubVersion || '?')}</span>
                        <label class="adm-switch" title="${bloq ? 'Bloqueado — clique para liberar' : 'Livre — clique para bloquear'}">
                            <input type="checkbox" ${bloq ? 'checked' : ''} data-toggle-id="${s.id}" />
                            <span class="adm-switch-track"></span>
                        </label>
                    </div>`;
                }).join('');

                listEl.querySelectorAll('input[data-toggle-id]').forEach(inp => {
                    inp.addEventListener('change', async () => {
                        const alvoId = inp.dataset.toggleId;
                        const novo = inp.checked;
                        const sw = inp.closest('.adm-switch');
                        sw.classList.add('busy');
                        try {
                            await bridge.firestore.request('PATCH', '/sessions/' + alvoId, {
                                fields: { blocked: bridge.firestore.value(novo) }
                            }, 'updateMask.fieldPaths=blocked');
                            _admToast(novo ? 'Sessão bloqueada' : 'Sessão liberada', 'ok');
                            carregarSessoes();
                        } catch(e) {
                            _admToast('Falha ao atualizar', 'err');
                            inp.checked = !novo;
                            sw.classList.remove('busy');
                        }
                    });
                });
            } catch(e) {
                listEl.innerHTML = '<div style="padding:16px;text-align:center;font-size:9.5px;color:#fca5b1;">Falha ao carregar.</div>';
            }
        }

        if (fsOk) {
            carregarSessoes();
            sessSec.querySelector('#_admSessRefresh')?.addEventListener('click', carregarSessoes);
            _sessoesTimer = setInterval(() => {
                if (!_admPanelEl) { clearInterval(_sessoesTimer); _sessoesTimer = null; return; }
                carregarSessoes();
            }, SESSOES_REFRESH_MS);
        }

        // ─── AÇÕES ───
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

        // ─── ADMIN ───
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
        document.querySelectorAll('style[data-hub-admin]').forEach(el => el.remove());
        _admStyleInjected = false;
        delete window[UID];
        try { window.dispatchEvent(new CustomEvent('sang:module-close', { detail: { id: 'admin' } })); } catch(e) {}
    }

    window[UID] = { kill, toggle };
})();
