
(function() {
    'use strict';
    const UID = '_admin';
    if (window[UID]) return;

    const bridge = window._hubBridge;
    if (!bridge) {
        console.warn('[Admin] _hubBridge não encontrado — carregue via o hub.');
        return;
    }

    // ═══ CONFIG ═══
    const ADMIN_U_B64 = 'c2FuZw==';
    const ADMIN_P_B64 = 'ZGV2ZWxvcGVyMTI=';
    const ADMIN_TOKEN_KEY = 'sanghub_admin_token';
    const ADMIN_TTL = 30 * 24 * 60 * 60 * 1000;
    const SESSAO_ONLINE_MS = 5 * 60 * 1000;
    const SESSOES_REFRESH_MS = 30 * 1000;

    // ═══ STATE ═══
    let _admAuthed = false;
    let _admPanelEl = null;
    let _admModalEl = null;
    let _sessoesTimer = null;

    // ═══ AUTH ═══
    function _admCheck(u, p) {
        try { return u === atob(ADMIN_U_B64) && p === atob(ADMIN_P_B64); }
        catch(e) { return false; }
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

    // ═══ KILL ═══
    function _admKillModal() {
        if (_admModalEl) { _admAnimateOutAndRemove(_admModalEl); _admModalEl = null; }
    }

    function _admKillPanel() {
        if (_admPanelEl) { _admAnimateOutAndRemove(_admPanelEl); _admPanelEl = null; }
        if (_sessoesTimer) { clearInterval(_sessoesTimer); _sessoesTimer = null; }
    }

    function _admAnimateOutAndRemove(el) {
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
        t.setAttribute('data-hub', '1');
        t.className = 'adm-toast' + (kind ? ' ' + kind : '');
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 250);
        }, 2200);
    }

    // ═══ STYLE ═══
    let _admStyleInjected = false;
    function _admEnsureStyle() {
        if (_admStyleInjected) return;
        _admStyleInjected = true;
        const st = document.createElement('style');
        st.setAttribute('data-hub-admin', '1');
        st.textContent = `
        @keyframes hubFade{from{opacity:0;transform:translateY(-8px) scale(0.98)}to{opacity:1;transform:none}}
        @property --adm-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
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
        .adm-dot.offline{background:#5b5f70}

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

        .adm-sess-line{animation:admSlideIn .22s cubic-bezier(0.16,1,0.3,1) backwards;
            display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;
            font-size:10px;color:#c7cad6;background:rgba(255,255,255,0.02);
            border:1px solid rgba(255,255,255,0.04);transition:background .15s}
        .adm-sess-line:hover{background:rgba(255,255,255,0.05)}
        .adm-sess-info{flex:1;min-width:0}
        .adm-sess-name{font-weight:700;color:#f1f2f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .adm-sess-meta{font-size:8.5px;color:#8b8fa3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;
            font-family:ui-monospace,'SF Mono',Menlo,monospace}
        .adm-sess-toggle{cursor:pointer;flex-shrink:0;font-size:8.5px;font-weight:800;padding:4px 8px;border-radius:6px;
            letter-spacing:.03em;transition:all .15s}
        .adm-sess-toggle.block{background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.3);color:#fca5b1}
        .adm-sess-toggle.block:hover{background:rgba(251,113,133,.2)}
        .adm-sess-toggle.unblock{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:#a7f3d0}
        .adm-sess-toggle.unblock:hover{background:rgba(52,211,153,.2)}

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

    // ═══ ICONS ═══
    const ICON = {
        lock:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>`,
        gear:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        status:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
        shield:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        zap:     `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        user:    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        refresh: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>`,
        upload:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
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
    function fmtDuracao(ms) {
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
        if (m < 60) return m + 'min atrás';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h atrás';
        return Math.floor(h / 24) + 'd atrás';
    }

    // ═══ LOGIN ═══
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

    // ═══ PANEL ═══
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
                    <div style="font-size: 9px; color: #8b8fa3; letter-spacing: .06em; text-transform: uppercase; margin-top: 2px;">Sang Hub · v${bridge.HUB_VERSION}</div>
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

        const st = bridge.state;
        const syncTxt = st?.syncState || 'loading';
        const modsActive = st ? Object.values(st.moduleStates || {}).filter(x => x === 'loaded').length : 0;
        const modsTotal = st ? ((st.manifest && st.manifest.modules) ? st.manifest.modules.length : 0) : 0;
        const fp = bridge.gate.fp;
        const devId = bridge.deviceId;
        const fpShort = fp ? (fp.slice(0, 14) + '…' + fp.slice(-8)) : '(calculando)';
        const devShort = devId ? (devId.slice(0, 12) + '…') : '(calculando)';
        const onBlk = fp && bridge.blk.full().includes(fp);
        const mode = bridge.gate.mode;
        const hasToken = _admHasToken();

        // ─── STATUS ───
        const statusContent = document.createElement('div');
        statusContent.innerHTML = `
            <div class="adm-row">
                <span class="adm-row-label">Sync</span>
                <span class="adm-row-val" style="display:flex;align-items:center;gap:6px;">
                    <span class="adm-dot ${syncTxt}"></span>
                    <span>${syncTxt}${st?.lastSyncAt ? ' · ' + st.lastSyncAt : ''}</span>
                </span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Módulos ativos</span>
                <span class="adm-row-val">${modsActive} <span style="color:#5b5f70;">/</span> ${modsTotal}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Device ID</span>
                <span class="adm-row-val" id="_admDevCopy" title="Clique para copiar" style="font-family:ui-monospace,monospace;font-size:9.5px;cursor:pointer;color:#22d3ee;
                    padding:2px 7px;border-radius:6px;background:rgba(34,211,238,0.08);transition:background .15s;">
                    ${devShort}
                </span>
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
                <span class="adm-row-label">Dispositivo (local)</span>
                <span class="adm-badge ${onBlk ? 'bad' : 'ok'}">${onBlk ? 'Bloqueado' : 'Livre'}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Secret</span>
                <span class="adm-badge ${bridge.gate.on ? 'ok' : 'bad'}">${bridge.gate.on ? 'Ativo' : 'Bloqueado'}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Modo</span>
                <span class="adm-badge ${mode === 'auto' ? 'neutral' : mode === 'on' ? 'ok' : 'bad'}">${mode.toUpperCase()}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Firestore</span>
                <span class="adm-badge ${bridge.firestore.configured() ? 'ok' : 'neutral'}">${bridge.firestore.configured() ? 'Conectado' : 'Não configurado'}</span>
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
                <strong style="color:#c7cad6;">AUTO</strong> usa blacklist local + bloqueio remoto (Firestore).<br />
                <strong style="color:#c7cad6;">FORÇAR</strong> ignora tudo isso e controla direto.
            </div>
            <div style="display: flex; gap: 6px; margin-bottom: 10px;">
                <button id="_admBlkAdd" class="adm-action-btn" style="flex:1; padding: 9px; border-radius: 9px; cursor: pointer; font-family: inherit;
                    font-size: 10px; font-weight: 800; background: rgba(251,113,133,0.1);
                    border: 1px solid rgba(251,113,133,0.3); color: #fca5b1;">
                    ${ICON.shield} Bloquear este (local)
                </button>
                <button id="_admBlkRem" class="adm-action-btn" style="flex:1; padding: 9px; border-radius: 9px; cursor: pointer; font-family: inherit;
                    font-size: 10px; font-weight: 800; background: rgba(52,211,153,0.1);
                    border: 1px solid rgba(52,211,153,0.3); color: #a7f3d0;">
                    ${ICON.zap} Desbloquear este (local)
                </button>
            </div>
            <div id="_admBlkList" style="display: flex; flex-direction: column; gap: 4px; max-height: 130px; overflow-y: auto;"></div>
        `;

        // ─── SESSÕES ───
        const sessoesContent = document.createElement('div');
        sessoesContent.innerHTML = bridge.firestore.configured()
            ? `<div style="display:flex;gap:6px;margin-bottom:10px;">
                   <button id="_admSessRefresh" class="adm-action-btn" style="flex:1; padding: 8px; border-radius: 9px; cursor: pointer; font-family: inherit;
                       font-size: 10px; font-weight: 800; background: rgba(34,211,238,0.1);
                       border: 1px solid rgba(34,211,238,0.3); color: #67e8f9;">
                       ${ICON.refresh} Atualizar lista
                   </button>
               </div>
               <div id="_admSessList" style="display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto;">
                   <div style="padding:10px;text-align:center;font-size:9.5px;color:#5b5f70;">Carregando…</div>
               </div>`
            : `<div style="padding:10px;text-align:center;font-size:9.5px;color:#5b5f70;">
                   Firestore não configurado — preencha FIREBASE_PROJECT_ID e FIREBASE_API_KEY no hub.
               </div>`;

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
        body.appendChild(sec('Sessões ao vivo', ICON.users, sessoesContent));
        body.appendChild(sec('Ações', ICON.zap, actionsContent));
        body.appendChild(sec('Sessão Admin', ICON.user, forgetContent));

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
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            foot.querySelector('#_admFootRight').textContent = hh + ':' + mm;
        }, 30000);
        (function tickInicial() {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            foot.querySelector('#_admFootRight').textContent = hh + ':' + mm;
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

        // ─── COPIAR IDs ───
        const devCopyEl = statusContent.querySelector('#_admDevCopy');
        devCopyEl.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(devId || ''); _admToast('Device ID copiado', 'ok'); }
            catch(e) { _admToast('Falha ao copiar', 'err'); }
        });
        devCopyEl.addEventListener('mouseenter', () => { devCopyEl.style.background = 'rgba(34,211,238,0.18)'; });
        devCopyEl.addEventListener('mouseleave', () => { devCopyEl.style.background = 'rgba(34,211,238,0.08)'; });

        const fpCopyEl = statusContent.querySelector('#_admFpCopy');
        fpCopyEl.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(fp || ''); _admToast('Fingerprint copiado', 'ok'); }
            catch(e) { _admToast('Falha ao copiar', 'err'); }
        });
        fpCopyEl.addEventListener('mouseenter', () => { fpCopyEl.style.background = 'rgba(34,211,238,0.18)'; });
        fpCopyEl.addEventListener('mouseleave', () => { fpCopyEl.style.background = 'rgba(34,211,238,0.08)'; });

        // ─── MODO SECRET ───
        secretContent.querySelectorAll('button[data-mode]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await bridge.gate.setMode(btn.dataset.mode);
                _admToast('Modo secret: ' + btn.dataset.mode.toUpperCase(), 'ok');
                _admKillPanel();
                _admMountPanel();
                try { bridge.refreshManifest(true); } catch(e) {}
            });
        });

        // ─── BLACKLIST LOCAL ───
        function _renderBlkList() {
            const listEl = secretContent.querySelector('#_admBlkList');
            const fixos = bridge.blk.fixed();
            const extras = bridge.blk.extra();
            if (extras.length === 0 && fixos.length === 0) {
                listEl.innerHTML = '<div style="padding:10px;text-align:center;font-size:9.5px;color:#5b5f70;">Nenhum hash na blacklist.</div>';
                return;
            }
            const parts = [];
            let idx = 0;
            fixos.forEach(h => {
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
                el.addEventListener('click', async () => {
                    const i = parseInt(el.dataset.rm, 10);
                    const arr = bridge.blk.extra();
                    const alvo = arr[i];
                    await bridge.blk.remove(alvo);
                    _renderBlkList();
                });
            });
        }
        _renderBlkList();

        secretContent.querySelector('#_admBlkAdd').addEventListener('click', async () => {
            if (!fp) { _admToast('Fingerprint não calculado', 'err'); return; }
            if (bridge.blk.extra().includes(fp) || bridge.blk.fixed().includes(fp)) {
                _admToast('Já está na lista', 'err');
                return;
            }
            await bridge.blk.add(fp);
            _renderBlkList();
            _admToast('Dispositivo bloqueado (local)', 'ok');
            _admKillPanel();
            _admMountPanel();
            try { bridge.refreshManifest(true); } catch(e) {}
        });

        secretContent.querySelector('#_admBlkRem').addEventListener('click', async () => {
            if (!fp) { _admToast('Fingerprint não calculado', 'err'); return; }
            if (!bridge.blk.extra().includes(fp)) {
                _admToast(bridge.blk.fixed().includes(fp) ? 'Na lista fixa — não pode remover aqui' : 'Não está na lista', 'err');
                return;
            }
            await bridge.blk.remove(fp);
            _renderBlkList();
            _admToast('Dispositivo desbloqueado (local)', 'ok');
            _admKillPanel();
            _admMountPanel();
            try { bridge.refreshManifest(true); } catch(e) {}
        });

        // ─── SESSÕES (Firestore) ───
        async function carregarSessoes() {
            const listEl = sessoesContent.querySelector('#_admSessList');
            if (!listEl) return;
            try {
                const data = await bridge.firestore.request('GET', '/sessions');
                const docs = data?.documents || [];
                const sessoes = docs.map(d => {
                    const id = d.name.split('/').pop();
                    return { id, ...bridge.firestore.parseDoc(d) };
                }).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

                if (!sessoes.length) {
                    listEl.innerHTML = '<div style="padding:10px;text-align:center;font-size:9.5px;color:#5b5f70;">Nenhuma sessão registrada ainda.</div>';
                    return;
                }

                const myId = bridge.deviceId;

                listEl.innerHTML = sessoes.map((s, i) => {
                    const ago = Date.now() - (s.lastSeen || 0);
                    const online = ago < SESSAO_ONLINE_MS;
                    const bloqueado = s.blocked === true;
                    const voceMesmo = s.id === myId;
                    const tempo = online
                        ? 'ativa ' + fmtDuracao(Date.now() - (s.sessionStart || s.lastSeen || Date.now()))
                        : fmtAtras(ago);
                    const devShort = s.id.slice(0, 8) + '…' + s.id.slice(-4);
                    return `<div class="adm-sess-line" style="animation-delay:${i * 25}ms;">
                        <span class="adm-dot ${online ? 'live' : 'offline'}" title="${online ? 'Online' : 'Offline'}"></span>
                        <div class="adm-sess-info">
                            <div class="adm-sess-name">${escHtml(s.name || 'Sem nome')}${voceMesmo ? ' (você)' : ''}</div>
                            <div class="adm-sess-meta">${devShort} · ${tempo} · v${escHtml(s.hubVersion || '?')}${s.mission ? ' · ' + escHtml(s.mission) : ''}</div>
                        </div>
                        <span data-sess-id="${s.id}" data-blocked="${bloqueado}" class="adm-sess-toggle ${bloqueado ? 'unblock' : 'block'}">
                            ${bloqueado ? 'Desbloquear' : 'Bloquear'}
                        </span>
                    </div>`;
                }).join('');

                listEl.querySelectorAll('[data-sess-id]').forEach(el => {
                    el.addEventListener('click', async () => {
                        const alvoId = el.dataset.sessId;
                        const estavaBloqueado = el.dataset.blocked === 'true';
                        el.style.opacity = '.5';
                        try {
                            await bridge.firestore.request('PATCH', '/sessions/' + alvoId, {
                                fields: { blocked: bridge.firestore.value(!estavaBloqueado) }
                            }, 'updateMask.fieldPaths=blocked');
                            _admToast(estavaBloqueado ? 'Sessão desbloqueada' : 'Sessão bloqueada', 'ok');
                            carregarSessoes();
                        } catch(e) {
                            _admToast('Falha ao atualizar sessão', 'err');
                            el.style.opacity = '';
                        }
                    });
                });
            } catch(e) {
                listEl.innerHTML = '<div style="padding:10px;text-align:center;font-size:9.5px;color:#fca5b1;">Falha ao carregar sessões.</div>';
            }
        }

        if (bridge.firestore.configured()) {
            carregarSessoes();
            sessoesContent.querySelector('#_admSessRefresh')?.addEventListener('click', carregarSessoes);
            _sessoesTimer = setInterval(() => {
                if (!_admPanelEl) { clearInterval(_sessoesTimer); _sessoesTimer = null; return; }
                carregarSessoes();
            }, SESSOES_REFRESH_MS);
        }

        // ─── AÇÕES ───
        actionsContent.querySelector('#_admReload').addEventListener('click', () => {
            try { bridge.refreshManifest(true); _admToast('Manifesto recarregado', 'ok'); } catch(e) { _admToast('Erro', 'err'); }
        });
        actionsContent.querySelector('#_admUpdate').addEventListener('click', () => {
            _admToast('Use o botão de update no hub principal', 'ok');
        });
        actionsContent.querySelector('#_admKillMod').addEventListener('click', () => {
            try {
                let n = 0;
                (bridge.state.manifest.modules || []).forEach(mod => {
                    if (bridge.state.moduleStates[mod.id] === 'loaded') {
                        bridge.deactivateModule(mod);
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
    }

    // ═══ OPEN / TOGGLE / KILL ═══
    function _admOpen() {
        if (_admAuthed || _admHasToken()) {
            _admAuthed = true;
            _admMountPanel();
        } else {
            _admMountLogin();
        }
    }

    function toggle() {
        if (_admPanelEl || _admModalEl) {
            _admKillPanel();
            _admKillModal();
            return;
        }
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
