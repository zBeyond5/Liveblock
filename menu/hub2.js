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

    const _blk = [
        'fa58cccd9de60c7a30726b2c23670a5747d4b5e684a935fae5954548873f1031'
    ];
    const _blkExtraKey = 'sanghub_blk_extra';
    const _ovr = 'sanghub_p2';
    let _on = true;
    let _fp = '';

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
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function _getBlkExtra() {
        try {
            const raw = localStorage.getItem(_blkExtraKey);
            const arr = JSON.parse(raw || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch(e) { return []; }
    }

    function _setBlkExtra(arr) {
        try { localStorage.setItem(_blkExtraKey, JSON.stringify(arr)); } catch(e) {}
    }

    function _fullBlk() {
        return _blk.concat(_getBlkExtra());
    }

    async function _gate() {
        try {
            _fp = await _calc();
            const o = localStorage.getItem(_ovr);
            if (o === '0') { _on = false; return; }
            if (o === '1') { _on = true; return; }
            _on = !_fullBlk().includes(_fp);
        } catch(e) {
            _on = true;
        }
    }

    const ADMIN_U_B64 = 'c2FuZw==';
    const ADMIN_P_B64 = 'ZGV2ZWxvcGVyMTI=';
    const ADMIN_TOKEN_KEY = 'sanghub_admin_token';
    const ADMIN_TTL = 30 * 24 * 60 * 60 * 1000;

    let _admAuthed = false;
    let _admPanelEl = null;
    let _admModalEl = null;

    function _admCheck(u, p) {
        try {
            return u === atob(ADMIN_U_B64) && p === atob(ADMIN_P_B64);
        } catch(e) { return false; }
    }

    function _admHasToken() {
        try {
            const raw = localStorage.getItem(ADMIN_TOKEN_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (!obj || !obj.t) return false;
            if (Date.now() - obj.t > ADMIN_TTL) {
                localStorage.removeItem(ADMIN_TOKEN_KEY);
                return false;
            }
            return true;
        } catch(e) { return false; }
    }

    function _admSaveToken() {
        try { localStorage.setItem(ADMIN_TOKEN_KEY, JSON.stringify({ t: Date.now() })); } catch(e) {}
    }

    function _admClearToken() {
        try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch(e) {}
    }

    function _admKillModal() {
        if (_admModalEl) { _admAnimateOutAndRemove(_admModalEl); _admModalEl = null; }
    }

    function _admKillPanel() {
        if (_admPanelEl) { _admAnimateOutAndRemove(_admPanelEl); _admPanelEl = null; }
    }

    function _admToast(msg, kind) {
        _admEnsureStyle();
        const t = document.createElement('div');
        t.className = 'adm-toast' + (kind ? ' ' + kind : '');
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 250);
        }, 2200);
    }

    let _admStyleInjected = false;
    function _admEnsureStyle() {
        if (_admStyleInjected) return;
        _admStyleInjected = true;
        const st = document.createElement('style');
        st.setAttribute('data-hub-admin', '1');
        st.textContent = `
        @property --adm-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
        @keyframes admFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes admBoxIn{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
        @keyframes admPanelIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}
        @keyframes admRingSpin{to{--adm-angle:360deg}}
        @keyframes admShine{to{background-position:-200% center}}
        @keyframes admShake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
        @keyframes admPulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes admPulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(34,211,238,.4)}50%{box-shadow:0 0 0 6px rgba(34,211,238,0)}}
        @keyframes admStagger{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes admActionPulse{0%{box-shadow:0 0 0 0 rgba(34,211,238,.5)}100%{box-shadow:0 0 0 14px rgba(34,211,238,0)}}
        @keyframes admSlideIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
        @keyframes admLive{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,.6)}50%{opacity:.7;box-shadow:0 0 0 4px rgba(52,211,153,0)}}

        .adm-box{position:relative;animation:admBoxIn .4s cubic-bezier(0.16,1,0.3,1)}
        .adm-box::before{content:'';position:absolute;inset:-1px;border-radius:17px;padding:1px;
            background:conic-gradient(from var(--adm-angle),#22d3ee,#a78bfa,#fff,#a78bfa,#22d3ee);
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
            -webkit-mask-composite:xor;mask-composite:exclude;
            animation:admRingSpin 4.5s linear infinite;opacity:.5;pointer-events:none}
        .adm-box.adm-shake{animation:admShake .4s ease}
        .adm-box.adm-success::before{opacity:1;animation:admRingSpin 1s linear infinite}

        .adm-panel{position:relative;animation:admPanelIn .35s cubic-bezier(0.16,1,0.3,1)}
        .adm-panel::before{content:'';position:absolute;inset:-1px;border-radius:17px;padding:1px;
            background:conic-gradient(from var(--adm-angle),#22d3ee,#a78bfa,#fff,#a78bfa,#22d3ee);
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
            -webkit-mask-composite:xor;mask-composite:exclude;
            animation:admRingSpin 6s linear infinite;opacity:.35;pointer-events:none}

        .adm-title-shine{background:linear-gradient(100deg,#22d3ee 0%,#a78bfa 35%,#fff 50%,#a78bfa 65%,#22d3ee 100%);
            background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
            animation:admShine 3.2s linear infinite}

        .adm-input{width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:14px;
            background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:9px;
            color:#f1f2f8;font-size:12.5px;outline:none;font-family:inherit;transition:border-color .18s,box-shadow .18s}
        .adm-input:focus{border-color:rgba(34,211,238,.6);box-shadow:0 0 0 3px rgba(34,211,238,.15)}

        .adm-btn-primary{transition:transform .15s,box-shadow .15s,opacity .15s}
        .adm-btn-primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 18px rgba(34,211,238,.35)}
        .adm-btn-primary:active:not(:disabled){transform:translateY(0) scale(.97)}
        .adm-btn-primary:disabled{opacity:.8;cursor:default}
        .adm-btn-secondary{transition:background .15s,transform .15s}
        .adm-btn-secondary:hover{background:rgba(255,255,255,0.08)}
        .adm-btn-secondary:active{transform:scale(.97)}

        .adm-gear{animation:admPulseGlow 2.6s ease-in-out infinite}
        .adm-sec{animation:admStagger .4s cubic-bezier(0.16,1,0.3,1) backwards;
            background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);
            border-radius:12px;padding:12px 14px;transition:border-color .2s,background .2s}
        .adm-sec:hover{border-color:rgba(34,211,238,0.18);background:rgba(255,255,255,0.032)}
        .adm-sec-head{display:flex;align-items:center;gap:7px;
            font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
            color:#8b8fa3;margin-bottom:10px;padding-bottom:8px;
            border-bottom:1px solid rgba(255,255,255,0.05)}
        .adm-sec-head svg{opacity:.7}

        .adm-dot{display:inline-block;width:6px;height:6px;border-radius:50%;vertical-align:middle;flex-shrink:0}
        .adm-dot.loading{background:#22d3ee;animation:admPulse 1s infinite}
        .adm-dot.synced{background:#34d399;box-shadow:0 0 6px rgba(52,211,153,.7)}
        .adm-dot.error{background:#fb7185}
        .adm-dot.live{background:#34d399;animation:admLive 2s ease-in-out infinite}

        .adm-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:9px;
            font-weight:800;letter-spacing:.05em;text-transform:uppercase;border:1px solid transparent}
        .adm-badge::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .adm-badge.ok{background:rgba(52,211,153,.12);color:#a7f3d0;border-color:rgba(52,211,153,.3)}
        .adm-badge.ok::before{background:#34d399;box-shadow:0 0 5px rgba(52,211,153,.8)}
        .adm-badge.bad{background:rgba(251,113,133,.12);color:#fca5b1;border-color:rgba(251,113,133,.3)}
        .adm-badge.bad::before{background:#fb7185}
        .adm-badge.neutral{background:rgba(255,255,255,.05);color:#c7cad6;border-color:rgba(255,255,255,.1)}
        .adm-badge.neutral::before{background:#5b5f70}

        .adm-row{display:flex;justify-content:space-between;align-items:center;
            font-size:11px;padding:7px 0;color:#c7cad6;
            border-bottom:1px dashed rgba(255,255,255,.04)}
        .adm-row:last-child{border-bottom:none}
        .adm-row-label{display:flex;align-items:center;gap:6px;color:#8b8fa3}
        .adm-row-val{color:#f1f2f8;font-weight:700;font-variant-numeric:tabular-nums;font-size:11px}

        .adm-mode-btn{transition:all .18s cubic-bezier(0.16,1,0.3,1);position:relative;overflow:hidden}
        .adm-mode-btn:hover:not(.active){background:rgba(255,255,255,0.07)!important;transform:translateY(-1px)}
        .adm-mode-btn:active{transform:scale(.97)}
        .adm-mode-btn.active{box-shadow:0 4px 14px rgba(34,211,238,.35)}

        .adm-action-btn{transition:all .18s cubic-bezier(0.16,1,0.3,1);display:flex;align-items:center;gap:6px;justify-content:center}
        .adm-action-btn:hover{background:rgba(255,255,255,0.08)!important;transform:translateY(-1px);
            box-shadow:0 4px 12px rgba(0,0,0,.3)}
        .adm-action-btn:active{transform:translateY(0) scale(.97)}
        .adm-action-btn.pulse{animation:admActionPulse .55s ease}
        .adm-action-btn svg{flex-shrink:0}

        .adm-blk-line{animation:admSlideIn .25s cubic-bezier(0.16,1,0.3,1) backwards;
            display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:7px;
            font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:9px;color:#c7cad6;
            background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);
            transition:background .15s}
        .adm-blk-line:hover{background:rgba(255,255,255,0.05)}
        .adm-blk-line.fixed{color:#8b8fa3}
        .adm-blk-hash{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .adm-blk-tag{font-size:8px;padding:2px 6px;border-radius:5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
            background:rgba(139,143,163,0.15);color:#8b8fa3;flex-shrink:0}
        .adm-blk-rm{cursor:pointer;color:#fb7185;font-size:11px;font-weight:800;flex-shrink:0;
            width:18px;height:18px;display:flex;align-items:center;justify-content:center;
            border-radius:5px;transition:all .15s}
        .adm-blk-rm:hover{background:rgba(251,113,133,.15)}

        .adm-foot{padding:10px 16px;background:rgba(0,0,0,0.22);border-top:1px solid rgba(255,255,255,0.05);
            display:flex;align-items:center;justify-content:space-between;gap:8px;
            font-size:9.5px;color:#8b8fa3;flex-shrink:0}
        .adm-foot-live{display:flex;align-items:center;gap:6px}
        .adm-foot-live .adm-dot{width:7px;height:7px}

        .adm-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-10px);
            z-index:2147483647;padding:10px 18px;border-radius:10px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            font-size:11.5px;font-weight:700;color:#cffafe;
            background:rgba(14,14,20,0.97);border:1px solid rgba(34,211,238,0.5);
            box-shadow:0 10px 30px rgba(0,0,0,0.5);backdrop-filter:blur(10px);
            transition:opacity .25s ease,transform .25s ease;opacity:0;pointer-events:none}
        .adm-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        .adm-toast.ok{color:#a7f3d0;border-color:rgba(52,211,153,0.5)}
        .adm-toast.err{color:#fecdd3;border-color:rgba(251,113,133,0.5)}

        .adm-icon-box{display:inline-flex;align-items:center;justify-content:center;
            width:26px;height:26px;border-radius:8px;background:rgba(34,211,238,0.15);
            border:1px solid rgba(34,211,238,0.35);flex-shrink:0}
        `;
        document.head.appendChild(st);
    }

    function _admAnimateOutAndRemove(el) {
        if (!el) return;
        el.style.transition = 'opacity .16s ease, transform .16s ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(.97)';
        setTimeout(() => el.remove(), 160);
    }

    const ICON = {
        lock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>`,
        gear: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        status: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
        shield: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        zap: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        user: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        refresh: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>`,
        upload: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
        stop: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
        broom: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m19 4-6 6"/><path d="M9 10 5 14l-3 3 5 5 3-3 4-4z"/><path d="M5 19h14"/></svg>`,
        reload: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
        exit: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
        trash: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
    };

    function _admMountLogin() {
        _admEnsureStyle();
        _admKillModal();
        _admKillPanel();

        const wrap = document.createElement('div');
        wrap.setAttribute('data-hub', '1');
        wrap.setAttribute('data-sang-ui', '');
        wrap.style.cssText = `
            position: fixed; inset: 0; z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            animation: hubFade .2s ease-out;
        `;

        const box = document.createElement('div');
        box.className = 'adm-box';
        box.style.cssText = `
            width: 340px; border-radius: 16px; padding: 22px;
            background: linear-gradient(175deg, rgba(20,20,28,0.98), rgba(9,9,14,0.99));
            box-shadow: 0 24px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05);
        `;

        box.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom: 3px;">
                ${ICON.lock}
                <span class="adm-title-shine" style="font-size: 13px; font-weight: 800; letter-spacing: .08em;">ACESSO RESTRITO</span>
            </div>
            <div style="font-size: 9.5px; color: #8b8fa3; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 18px;">Sang Hub · Painel Administrativo</div>

            <label style="display:block; font-size: 9.5px; color: #8b8fa3; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; font-weight: 700;">Usuário</label>
            <input id="_admU" class="adm-input" type="text" autocomplete="off" spellcheck="false" />

            <label style="display:block; font-size: 9.5px; color: #8b8fa3; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; font-weight: 700;">Senha</label>
            <input id="_admP" class="adm-input" type="password" autocomplete="off" spellcheck="false" />

            <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #c7cad6; margin-bottom: 16px; cursor: pointer; user-select: none;">
                <input id="_admR" type="checkbox" style="accent-color: #22d3ee; width: 14px; height: 14px; cursor: pointer;" />
                Lembrar de mim neste dispositivo
            </label>

            <div id="_admErr" style="font-size: 10.5px; color: #fca5b1; min-height: 14px; margin-bottom: 10px;"></div>

            <div style="display: flex; gap: 8px;">
                <button id="_admCancel" class="adm-btn-secondary" style="flex: 1; padding: 11px; border-radius: 9px;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                    color: #c7cad6; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit;">Cancelar</button>
                <button id="_admOk" class="adm-btn-primary" style="flex: 1; padding: 11px; border-radius: 9px;
                    background: linear-gradient(120deg, #22d3ee, #a78bfa); border: none;
                    color: #0b0b10; font-size: 11px; font-weight: 800; cursor: pointer; font-family: inherit;
                    letter-spacing: .03em;">ENTRAR</button>
            </div>
        `;

        wrap.appendChild(box);
        document.body.appendChild(wrap);
        _admModalEl = wrap;

        const uEl = box.querySelector('#_admU');
        const pEl = box.querySelector('#_admP');
        const rEl = box.querySelector('#_admR');
        const errEl = box.querySelector('#_admErr');

        setTimeout(() => uEl.focus(), 50);

        const okBtn = box.querySelector('#_admOk');

        function shakeError(msg) {
            errEl.textContent = msg;
            box.classList.remove('adm-shake');
            void box.offsetWidth;
            box.classList.add('adm-shake');
        }

        function tryLogin() {
            const u = uEl.value.trim();
            const p = pEl.value;
            if (!u || !p) { shakeError('Preencha usuário e senha.'); return; }
            if (!_admCheck(u, p)) {
                shakeError('Credenciais inválidas.');
                pEl.value = '';
                pEl.focus();
                return;
            }
            _admAuthed = true;
            if (rEl.checked) _admSaveToken();

            box.classList.add('adm-success');
            okBtn.disabled = true;
            okBtn.textContent = 'ACESSO CONCEDIDO';
            setTimeout(() => {
                _admKillModal();
                _admMountPanel();
            }, 260);
        }

        okBtn.addEventListener('click', tryLogin);
        box.querySelector('#_admCancel').addEventListener('click', _admKillModal);

        wrap.addEventListener('click', (e) => { if (e.target === wrap) _admKillModal(); });

        [uEl, pEl].forEach(el => {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); tryLogin(); }
                if (e.key === 'Escape') { e.preventDefault(); _admKillModal(); }
            });
        });
    }

    function _admMountPanel() {
        _admEnsureStyle();
        _admKillModal();
        _admKillPanel();

        const wrap = document.createElement('div');
        wrap.className = 'adm-panel';
        wrap.setAttribute('data-hub', '1');
        wrap.setAttribute('data-sang-ui', '');
        wrap.style.cssText = `
            position: fixed; top: 20px; left: 20px; width: 420px; max-height: 88vh;
            z-index: 2147483647; display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #f1f2f8; user-select: none;
            background: linear-gradient(175deg, rgba(20,20,28,0.97), rgba(9,9,14,0.99));
            backdrop-filter: blur(18px) saturate(140%);
            border-radius: 16px;
            box-shadow: 0 24px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06);
            overflow: hidden;
        `;

        const hdr = document.createElement('div');
        hdr.style.cssText = `
            padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
            cursor: grab; flex-shrink: 0;
            background: linear-gradient(120deg, rgba(34,211,238,0.14), rgba(167,139,250,0.14));
            border-bottom: 1px solid rgba(255,255,255,0.06);
        `;
        hdr.innerHTML = `
            <div style="display: flex; align-items: center; gap: 11px;">
                <span class="adm-gear adm-icon-box">${ICON.gear}</span>
                <div>
                    <div class="adm-title-shine" style="font-size: 12.5px; font-weight: 800; letter-spacing: .1em;">PAINEL ADMIN</div>
                    <div style="font-size: 9px; color: #8b8fa3; letter-spacing: .06em; text-transform: uppercase; margin-top: 2px;">Sang Hub · v1.1.0</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="adm-dot live" title="Sessão ativa"></span>
                <span id="_admClose" title="Fechar (Esc)" style="cursor: pointer; font-size: 14px; color: #8b8fa3;
                    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
                    border-radius: 8px; transition: all .15s;">✕</span>
            </div>
        `;

        const body = document.createElement('div');
        body.style.cssText = `padding: 14px; overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px;`;

        const foot = document.createElement('div');
        foot.className = 'adm-foot';
        foot.innerHTML = `
            <div class="adm-foot-live">
                <span class="adm-dot live"></span>
                <span>Sessão ativa</span>
            </div>
            <span id="_admFootRight" style="font-variant-numeric: tabular-nums;">—</span>
        `;

        let _secIdx = 0;
        const sec = (label, iconSvg, content) => {
            const s = document.createElement('div');
            s.className = 'adm-sec';
            s.style.animationDelay = (_secIdx++ * 55) + 'ms';
            const head = document.createElement('div');
            head.className = 'adm-sec-head';
            head.innerHTML = `${iconSvg}<span>${label}</span>`;
            s.appendChild(head);
            s.appendChild(content);
            return s;
        };

        const syncTxt = (state && state.syncState) ? state.syncState : 'loading';
        const modsActive = state ? Object.values(state.moduleStates || {}).filter(x => x === 'loaded').length : 0;
        const modsTotal = state ? ((state.manifest && state.manifest.modules) ? state.manifest.modules.length : 0) : 0;
        const fpShort = _fp ? (_fp.slice(0, 14) + '…' + _fp.slice(-8)) : '(calculando)';
        const onBlk = _fp && _fullBlk().includes(_fp);
        const override = localStorage.getItem(_ovr);
        const mode = override === '0' ? 'off' : override === '1' ? 'on' : 'auto';
        const hasToken = _admHasToken();

        // ─── STATUS ───
        const statusContent = document.createElement('div');
        statusContent.innerHTML = `
            <div class="adm-row">
                <span class="adm-row-label">Sync</span>
                <span class="adm-row-val" style="display:flex;align-items:center;gap:6px;">
                    <span class="adm-dot ${syncTxt}"></span>
                    <span>${syncTxt}${state && state.lastSyncAt ? ' · ' + state.lastSyncAt : ''}</span>
                </span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Módulos ativos</span>
                <span class="adm-row-val">${modsActive} <span style="color:#5b5f70;">/</span> ${modsTotal}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Fingerprint</span>
                <span class="adm-row-val" id="_admFpCopy" title="Clique para copiar"
                    style="font-family:ui-monospace,monospace;font-size:9.5px;cursor:pointer;color:#22d3ee;
                    padding:2px 7px;border-radius:6px;background:rgba(34,211,238,0.08);transition:background .15s;">
                    ${fpShort}
                </span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Dispositivo</span>
                <span class="adm-badge ${onBlk ? 'bad' : 'ok'}">${onBlk ? 'Bloqueado' : 'Livre'}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Secret</span>
                <span class="adm-badge ${_on ? 'ok' : 'bad'}">${_on ? 'Ativo' : 'Bloqueado'}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Modo</span>
                <span class="adm-badge ${mode === 'auto' ? 'neutral' : mode === 'on' ? 'ok' : 'bad'}">${mode.toUpperCase()}</span>
            </div>
        `;

        // ─── SECRET ───
        const secretContent = document.createElement('div');
        const modeBtnStyle = (isActive) => `
            flex:1; padding: 9px; border-radius: 9px; cursor: pointer; font-family: inherit;
            font-size: 10px; font-weight: 800; letter-spacing: .06em;
            background: ${isActive ? 'linear-gradient(120deg,#22d3ee,#a78bfa)' : 'rgba(255,255,255,0.04)'};
            color: ${isActive ? '#0b0b10' : '#c7cad6'};
            border: 1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.08)'};
        `;

        secretContent.innerHTML = `
            <div style="display: flex; gap: 6px; margin-bottom: 10px;">
                <button data-mode="auto" class="adm-mode-btn ${mode==='auto'?'active':''}" style="${modeBtnStyle(mode==='auto')}">AUTO</button>
                <button data-mode="on" class="adm-mode-btn ${mode==='on'?'active':''}" style="${modeBtnStyle(mode==='on')}">FORÇAR ON</button>
                <button data-mode="off" class="adm-mode-btn ${mode==='off'?'active':''}" style="${modeBtnStyle(mode==='off')}">FORÇAR OFF</button>
            </div>
            <div style="font-size: 9.5px; color: #8b8fa3; margin-bottom: 10px; line-height: 1.55; padding: 8px 10px;
                background: rgba(34,211,238,0.05); border-left: 2px solid rgba(34,211,238,0.4); border-radius: 0 7px 7px 0;">
                <strong style="color:#c7cad6;">AUTO</strong> usa a blacklist por fingerprint.<br />
                <strong style="color:#c7cad6;">FORÇAR</strong> ignora a lista e controla direto.
            </div>
            <div style="display: flex; gap: 6px; margin-bottom: 10px;">
                <button id="_admBlkAdd" class="adm-action-btn" style="flex:1; padding: 9px; border-radius: 9px; cursor: pointer; font-family: inherit;
                    font-size: 10px; font-weight: 800; background: rgba(251,113,133,0.1);
                    border: 1px solid rgba(251,113,133,0.3); color: #fca5b1;">
                    ${ICON.shield} Bloquear este
                </button>
                <button id="_admBlkRem" class="adm-action-btn" style="flex:1; padding: 9px; border-radius: 9px; cursor: pointer; font-family: inherit;
                    font-size: 10px; font-weight: 800; background: rgba(52,211,153,0.1);
                    border: 1px solid rgba(52,211,153,0.3); color: #a7f3d0;">
                    ${ICON.zap} Desbloquear este
                </button>
            </div>
            <div id="_admBlkList" style="display: flex; flex-direction: column; gap: 4px; max-height: 130px; overflow-y: auto;"></div>
        `;

        // ─── AÇÕES ───
        const actionsContent = document.createElement('div');
        actionsContent.style.cssText = `display: grid; grid-template-columns: 1fr 1fr; gap: 6px;`;

        const actBtns = [
            { id: '_admReload',  icon: ICON.refresh, label: 'Recarregar manifesto', color: '#22d3ee' },
            { id: '_admUpdate',  icon: ICON.upload,  label: 'Verificar update',     color: '#22d3ee' },
            { id: '_admKillMod', icon: ICON.stop,    label: 'Desativar ativos',     color: '#a78bfa' },
            { id: '_admClean',   icon: ICON.broom,   label: 'Limpar caches',        color: '#a78bfa' },
            { id: '_admRePage',  icon: ICON.reload,  label: 'Recarregar página',    color: '#fb7185' },
            { id: '_admLogout',  icon: ICON.exit,    label: 'Sair (sem token)',     color: '#fb7185' }
        ];

        actBtns.forEach(a => {
            const b = document.createElement('button');
            b.id = a.id;
            b.className = 'adm-action-btn';
            b.innerHTML = `${a.icon} <span>${a.label}</span>`;
            b.style.cssText = `
                padding: 9px 8px; border-radius: 9px; cursor: pointer; font-family: inherit;
                font-size: 9.5px; font-weight: 700; letter-spacing: .02em;
                background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
                color: ${a.color};
            `;
            b.addEventListener('click', () => {
                b.classList.remove('pulse');
                void b.offsetWidth;
                b.classList.add('pulse');
            });
            actionsContent.appendChild(b);
        });

        // ─── FORGET ───
        const forgetContent = document.createElement('div');
        forgetContent.innerHTML = `
            <button id="_admForget" class="adm-action-btn" style="width: 100%; padding: 10px; border-radius: 9px; cursor: pointer; font-family: inherit;
                font-size: 10px; font-weight: 800; background: rgba(251,113,133,0.08);
                border: 1px solid rgba(251,113,133,0.3); color: #fca5b1; letter-spacing: .04em;">
                ${ICON.trash} Esquecer este dispositivo (apagar token)
            </button>
            <div style="margin-top: 9px; padding: 8px 10px; background: rgba(255,255,255,0.02);
                border-radius: 8px; font-size: 9.5px; color: #8b8fa3; display: flex; align-items: center; gap: 8px;
                border: 1px solid rgba(255,255,255,0.04);">
                <span class="adm-badge ${hasToken ? 'ok' : 'neutral'}" style="font-size:8px;">${hasToken ? 'Token salvo' : 'Sem token'}</span>
                <span style="color:#5b5f70;">Token expira em 30 dias.</span>
            </div>
        `;

        body.appendChild(sec('Status', ICON.status, statusContent));
        body.appendChild(sec('Controle de Secret', ICON.shield, secretContent));
        body.appendChild(sec('Ações', ICON.zap, actionsContent));
        body.appendChild(sec('Sessão Admin', ICON.user, forgetContent));

        wrap.appendChild(hdr);
        wrap.appendChild(body);
        wrap.appendChild(foot);
        document.body.appendChild(wrap);
        _admPanelEl = wrap;

        // ─── handlers ───

        const closeBtn = hdr.querySelector('#_admClose');
        closeBtn.addEventListener('click', _admKillPanel);
        closeBtn.addEventListener('mouseover', () => { closeBtn.style.background = 'rgba(251,113,133,0.15)'; closeBtn.style.color = '#fca5b1'; });
        closeBtn.addEventListener('mouseout',  () => { closeBtn.style.background = 'transparent'; closeBtn.style.color = '#8b8fa3'; });

        let drag = null;
        hdr.addEventListener('mousedown', (e) => {
            if (e.target.id === '_admClose' || e.target.closest('#_admClose')) return;
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

        const _cleanup = () => {
            document.removeEventListener('mousemove', _moveH);
            document.removeEventListener('mouseup', _upH);
            document.removeEventListener('keydown', _escH);
        };
        const _origKill = _admKillPanel;
        _admKillPanel = () => { _cleanup(); _origKill(); };

        const fpCopyEl = statusContent.querySelector('#_admFpCopy');
        fpCopyEl.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(_fp);
                _admToast('Fingerprint copiado', 'ok');
            } catch(e) {
                _admToast('Falha ao copiar', 'err');
            }
        });
        fpCopyEl.addEventListener('mouseenter', () => { fpCopyEl.style.background = 'rgba(34,211,238,0.18)'; });
        fpCopyEl.addEventListener('mouseleave', () => { fpCopyEl.style.background = 'rgba(34,211,238,0.08)'; });

        secretContent.querySelectorAll('button[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const m = btn.dataset.mode;
                if (m === 'auto') localStorage.removeItem(_ovr);
                else if (m === 'on') localStorage.setItem(_ovr, '1');
                else localStorage.setItem(_ovr, '0');
                _gate().then(() => {
                    _admToast('Modo secret: ' + m.toUpperCase(), 'ok');
                    _admKillPanel();
                    _admMountPanel();
                    try { refreshManifest(true); } catch(e) {}
                });
            });
        });

        function _renderBlkList() {
            const listEl = secretContent.querySelector('#_admBlkList');
            const extras = _getBlkExtra();
            if (extras.length === 0 && _blk.length === 0) {
                listEl.innerHTML = '<div style="padding:10px;text-align:center;font-size:9.5px;color:#5b5f70;">Nenhum hash na blacklist.</div>';
                return;
            }
            const parts = [];
            let idx = 0;
            _blk.forEach(h => {
                parts.push(`<div class="adm-blk-line fixed" style="animation-delay:${idx++ * 25}ms;">
                    <span class="adm-blk-hash">${h}</span>
                    <span class="adm-blk-tag">Fixo</span>
                </div>`);
            });
            extras.forEach((h, i) => {
                parts.push(`<div class="adm-blk-line" style="animation-delay:${idx++ * 25}ms;">
                    <span class="adm-blk-hash">${h}</span>
                    <span data-rm="${i}" class="adm-blk-rm" title="Remover">✕</span>
                </div>`);
            });
            listEl.innerHTML = parts.join('');
            listEl.querySelectorAll('[data-rm]').forEach(el => {
                el.addEventListener('click', () => {
                    const i = parseInt(el.dataset.rm, 10);
                    const arr = _getBlkExtra();
                    arr.splice(i, 1);
                    _setBlkExtra(arr);
                    _renderBlkList();
                    _gate().then(() => {});
                });
            });
        }
        _renderBlkList();

        secretContent.querySelector('#_admBlkAdd').addEventListener('click', () => {
            if (!_fp) { _admToast('Fingerprint não calculado', 'err'); return; }
            const arr = _getBlkExtra();
            if (arr.includes(_fp) || _blk.includes(_fp)) {
                _admToast('Já está na lista', 'err');
                return;
            }
            arr.push(_fp);
            _setBlkExtra(arr);
            _renderBlkList();
            _gate().then(() => {
                _admToast('Dispositivo bloqueado', 'ok');
                _admKillPanel();
                _admMountPanel();
                try { refreshManifest(true); } catch(e) {}
            });
        });

        secretContent.querySelector('#_admBlkRem').addEventListener('click', () => {
            if (!_fp) { _admToast('Fingerprint não calculado', 'err'); return; }
            const arr = _getBlkExtra();
            const idx = arr.indexOf(_fp);
            if (idx === -1) {
                if (_blk.includes(_fp)) {
                    _admToast('Na lista fixa — não pode remover aqui', 'err');
                } else {
                    _admToast('Não está na lista', 'err');
                }
                return;
            }
            arr.splice(idx, 1);
            _setBlkExtra(arr);
            _renderBlkList();
            _gate().then(() => {
                _admToast('Dispositivo desbloqueado', 'ok');
                _admKillPanel();
                _admMountPanel();
                try { refreshManifest(true); } catch(e) {}
            });
        });

        actionsContent.querySelector('#_admReload').addEventListener('click', () => {
            try { refreshManifest(true); _admToast('Manifesto recarregado', 'ok'); } catch(e) { _admToast('Erro', 'err'); }
        });
        actionsContent.querySelector('#_admUpdate').addEventListener('click', () => {
            try { autoUpdateLoop(); _admToast('Verificando…', 'ok'); } catch(e) { _admToast('Erro', 'err'); }
        });
        actionsContent.querySelector('#_admKillMod').addEventListener('click', () => {
            try {
                let n = 0;
                (state.manifest.modules || []).forEach(mod => {
                    if (state.moduleStates[mod.id] === 'loaded') {
                        deactivateModule(mod);
                        n++;
                    }
                });
                _admToast(n + ' módulos desativados', 'ok');
            } catch(e) { _admToast('Erro', 'err'); }
        });
        actionsContent.querySelector('#_admClean').addEventListener('click', () => {
            try {
                localStorage.removeItem('sanghub_manifest_cache');
                localStorage.removeItem('sanghub_player_cache');
                _admToast('Caches limpos', 'ok');
            } catch(e) { _admToast('Erro', 'err'); }
        });
        actionsContent.querySelector('#_admRePage').addEventListener('click', () => {
            location.reload();
        });
        actionsContent.querySelector('#_admLogout').addEventListener('click', () => {
            _admAuthed = false;
            _admKillPanel();
            _admToast('Sessão encerrada', 'ok');
        });

        forgetContent.querySelector('#_admForget').addEventListener('click', () => {
            _admClearToken();
            _admAuthed = false;
            _admKillPanel();
            _admToast('Token removido', 'ok');
        });

        const footRight = foot.querySelector('#_admFootRight');
        function _tickFoot() {
            if (!_admPanelEl) return;
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            footRight.textContent = hh + ':' + mm;
        }
        _tickFoot();
        const _footTimer = setInterval(_tickFoot, 30000);
        const _origKill2 = _admKillPanel;
        _admKillPanel = () => { clearInterval(_footTimer); _origKill2(); };
    }

    function _admOpen() {
        if (_admAuthed || _admHasToken()) {
            _admAuthed = true;
            _admMountPanel();
        } else {
            _admMountLogin();
        }
    }

    function _admToggle() {
        if (_admPanelEl || _admModalEl) {
            _admKillPanel();
            _admKillModal();
            return;
        }
        _admOpen();
    }

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            _admToggle();
        }
    });

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
                .filter(m => {
                    if (state.moduleStates[m.id] === STATUS.LOADED) return false;
                    if (m.secret === true) return _on;
                    return m.enabled !== false && m.autoload === true;
                })
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

        if (palavras.length <= 3) {
            handleModuleClick(mod);
            return true;
        }

        return false;
    }

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

        let recognition = null, voiceActive = false, lastVoiceAt = 0;
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

        window.addEventListener('sang:module-close', (e) => {
            const id = e?.detail?.id;
            if (!id) return;
            if (state.moduleStates[id] !== STATUS.LOADED) return;
            state.moduleStates[id] = STATUS.UNLOADED;
            HLOG('📴 Módulo fechado externamente: ' + id);
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

        function applyPlayerData(data) {
            nameEl.textContent = data.name || '—';
            missionEl.textContent = data.mission || '—';
            if (data.avatarUrl) {
                avatarEl.innerHTML = `<img src="${data.avatarUrl}" style="position:absolute;top:-25%;left:-40%;width:210%;height:210%;object-fit:cover" alt="avatar" />`;
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
        window._hubUI = {
            kill,
            markProtected(el) {
                if (el && typeof el.setAttribute === 'function') {
                    el.setAttribute('data-sang-ui', '');
                }
                return el;
            }
        };

        showPill();
    }

    async function boot() {
        await new Promise(resolve => {
            if (document.body) return resolve();
            const iv = setInterval(() => { if (document.body) { clearInterval(iv); resolve(); } }, 80);
        });

        await _gate();

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
