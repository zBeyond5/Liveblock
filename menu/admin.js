// modules/admin.js — Painel Admin do Sang Hub
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
        @keyframes admBoxIn{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
        @keyframes admPanelIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}
        @keyframes admShine{to{background-position:-200% center}}
        @keyframes admShake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
        @keyframes admPulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes admSlideIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:none}}
        @keyframes admLive{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,.6)}50%{opacity:.7;box-shadow:0 0 0 4px rgba(52,211,153,0)}}

        .adm-box{position:relative;animation:admBoxIn .4s cubic-bezier(0.16,1,0.3,1)}
        .adm-box.adm-shake{animation:admShake .4s ease}

        .adm-panel{animation:admPanelIn .3s cubic-bezier(0.16,1,0.3,1)}

        .adm-title-shine{background:linear-gradient(100deg,#22d3ee 0%,#a78bfa 35%,#fff 50%,#a78bfa 65%,#22d3ee 100%);
            background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
            animation:admShine 3.2s linear infinite}

        .adm-input{width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:12px;
            background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:9px;
            color:#f1f2f8;font-size:12.5px;outline:none;font-family:inherit;transition:border-color .18s,box-shadow .18s}
        .adm-input:focus{border-color:rgba(34,211,238,.6);box-shadow:0 0 0 3px rgba(34,211,238,.15)}

        .adm-sec{background:rgba(255,255,255,0.022);border:1px solid rgba(255,255,255,0.055);
            border-radius:10px;padding:10px 12px;margin-bottom:6px}
        .adm-sec:last-child{margin-bottom:0}
        .adm-sec-head{display:flex;align-items:center;gap:6px;
            font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
            color:#7d8194;margin-bottom:8px;padding-bottom:6px;
            border-bottom:1px solid rgba(255,255,255,0.045)}
        .adm-sec-head svg{opacity:.7}

        .adm-dot{display:inline-block;width:6px;height:6px;border-radius:50%;vertical-align:middle;flex-shrink:0}
        .adm-dot.loading{background:#22d3ee;animation:admPulse 1s infinite}
        .adm-dot.synced{background:#34d399;box-shadow:0 0 6px rgba(52,211,153,.7)}
        .adm-dot.error{background:#fb7185}
        .adm-dot.live{background:#34d399;animation:admLive 2s ease-in-out infinite}
        .adm-dot.offline{background:#4b4f60}

        .adm-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:14px;font-size:8.5px;
            font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:1px solid transparent}
        .adm-badge::before{content:'';width:4px;height:4px;border-radius:50%;flex-shrink:0}
        .adm-badge.ok{background:rgba(52,211,153,.1);color:#a7f3d0;border-color:rgba(52,211,153,.28)}
        .adm-badge.ok::before{background:#34d399}
        .adm-badge.bad{background:rgba(251,113,133,.1);color:#fca5b1;border-color:rgba(251,113,133,.28)}
        .adm-badge.bad::before{background:#fb7185}
        .adm-badge.neutral{background:rgba(255,255,255,.04);color:#c7cad6;border-color:rgba(255,255,255,.08)}
        .adm-badge.neutral::before{background:#5b5f70}

        .adm-row{display:flex;justify-content:space-between;align-items:center;
            font-size:10px;padding:5px 0;color:#c7cad6}
        .adm-row + .adm-row { border-top:1px dashed rgba(255,255,255,.035) }
        .adm-row-label{color:#8b8fa3;letter-spacing:.01em}
        .adm-row-val{color:#f1f2f8;font-weight:700;font-variant-numeric:tabular-nums;font-size:10px}

        .adm-action-btn{transition:all .15s cubic-bezier(0.16,1,0.3,1);display:flex;align-items:center;gap:5px;justify-content:center;
            cursor:pointer;font-family:inherit;border-radius:8px}
        .adm-action-btn:hover{background:rgba(255,255,255,0.07)!important;transform:translateY(-1px)}
        .adm-action-btn:active{transform:translateY(0) scale(.97)}
        .adm-action-btn svg{flex-shrink:0}

        .adm-mode-btn{transition:all .15s cubic-bezier(0.16,1,0.3,1);cursor:pointer;font-family:inherit;border-radius:8px;
            padding:7px 4px;font-size:9.5px;font-weight:800;letter-spacing:.05em}
        .adm-mode-btn:hover:not(.active){background:rgba(255,255,255,0.07)!important}
        .adm-mode-btn:active{transform:scale(.97)}

        .adm-blk-line{display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:6px;
            font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:8.5px;color:#b8bcca;
            background:rgba(255,255,255,0.018);border:1px solid rgba(255,255,255,0.035)}
        .adm-blk-line.fixed{color:#7d8194}
        .adm-blk-hash{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .adm-blk-rm{cursor:pointer;color:#fb7185;font-size:10px;font-weight:800;flex-shrink:0;
            width:16px;height:16px;display:flex;align-items:center;justify-content:center;
            border-radius:4px;transition:background .15s}
        .adm-blk-rm:hover{background:rgba(251,113,133,.15)}

        .adm-sess-line{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:9px;
            background:rgba(255,255,255,0.022);border:1px solid rgba(255,255,255,0.045);
            transition:background .15s;animation:admSlideIn .22s cubic-bezier(0.16,1,0.3,1) backwards}
        .adm-sess-line:hover{background:rgba(255,255,255,0.045)}
        .adm-sess-info{flex:1;min-width:0}
        .adm-sess-name{font-weight:700;color:#f1f2f8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .adm-sess-meta{font-size:8.5px;color:#7d8194;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;
            font-family:ui-monospace,'SF Mono',Menlo,monospace}
        .adm-sess-toggle{cursor:pointer;flex-shrink:0;font-size:8.5px;font-weight:800;padding:5px 9px;border-radius:6px;
            letter-spacing:.03em;transition:all .15s;white-space:nowrap}
        .adm-sess-toggle.block{background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.3);color:#fca5b1}
        .adm-sess-toggle.block:hover{background:rgba(251,113,133,.22)}
        .adm-sess-toggle.unblock{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:#a7f3d0}
        .adm-sess-toggle.unblock:hover{background:rgba(52,211,153,.22)}

        .adm-foot{padding:8px 14px;background:rgba(0,0,0,0.22);border-top:1px solid rgba(255,255,255,0.045);
            display:flex;align-items:center;justify-content:space-between;gap:8px;
            font-size:9px;color:#7d8194;flex-shrink:0}

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
        `;
        document.head.appendChild(st);
    }

    // ═══ ICONS ═══
    const ICON = {
        lock:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>`,
        shield:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        status:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
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
            width: 320px; border-radius: 14px; padding: 20px;
            background: linear-gradient(175deg, rgba(20,20,28,0.98), rgba(9,9,14,0.99));
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 24px 60px rgba(0,0,0,0.7);
        `;

        box.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom: 2px;">
                ${ICON.lock}
                <span class="adm-title-shine" style="font-size: 12.5px; font-weight: 800; letter-spacing: .08em;">ACESSO RESTRITO</span>
            </div>
            <div style="font-size: 9px; color: #7d8194; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 16px;">Sang Hub · Painel Administrativo</div>

            <label style="display:block; font-size: 9px; color: #8b8fa3; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; font-weight: 700;">Usuário</label>
            <input id="_admU" class="adm-input" type="text" autocomplete="off" spellcheck="false" />

            <label style="display:block; font-size: 9px; color: #8b8fa3; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; font-weight: 700;">Senha</label>
            <input id="_admP" class="adm-input" type="password" autocomplete="off" spellcheck="false" />

            <label style="display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: #c7cad6; margin-bottom: 14px; cursor: pointer; user-select: none;">
                <input id="_admR" type="checkbox" style="accent-color: #22d3ee; width: 13px; height: 13px; cursor: pointer;" />
                Lembrar de mim neste dispositivo
            </label>

            <div id="_admErr" style="font-size: 10px; color: #fca5b1; min-height: 13px; margin-bottom: 8px;"></div>

            <div style="display: flex; gap: 8px;">
                <button id="_admCancel" class="adm-action-btn" style="flex: 1; padding: 10px; border-radius: 8px;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                    color: #c7cad6; font-size: 10.5px; font-weight: 700;">Cancelar</button>
                <button id="_admOk" class="adm-action-btn" style="flex: 1; padding: 10px; border-radius: 8px;
                    background: linear-gradient(120deg, #22d3ee, #a78bfa); border: none;
                    color: #0b0b10; font-size: 10.5px; font-weight: 800;
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
            _admKillModal();
            _admMountPanel();
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
            position: fixed; top: 16px; left: 16px; width: 344px; max-height: 92vh;
            z-index: 2147483647; display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #f1f2f8; user-select: none;
            background: linear-gradient(175deg, rgba(18,18,26,0.97), rgba(8,8,13,0.99));
            backdrop-filter: blur(16px) saturate(140%);
            border: 1px solid rgba(255,255,255,0.07);
            border-radius: 14px;
            box-shadow: 0 22px 55px rgba(0,0,0,0.65);
            overflow: hidden;
        `;

        // ─── HEADER ───
        const hdr = document.createElement('div');
        hdr.style.cssText = `
            padding: 11px 13px; display: flex; align-items: center; justify-content: space-between;
            cursor: grab; flex-shrink: 0;
            background: linear-gradient(120deg, rgba(34,211,238,0.1), rgba(167,139,250,0.1));
            border-bottom: 1px solid rgba(255,255,255,0.055);
        `;
        hdr.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px;
                    border-radius:7px; background:rgba(34,211,238,0.14); border:1px solid rgba(34,211,238,0.32);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </span>
                <div>
                    <div class="adm-title-shine" style="font-size: 11.5px; font-weight: 800; letter-spacing: .1em;">PAINEL ADMIN</div>
                    <div style="font-size: 8.5px; color: #7d8194; letter-spacing: .05em; text-transform: uppercase; margin-top: 1px;">Sang Hub · v${bridge.HUB_VERSION}</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span class="adm-dot live" title="Sessão ativa"></span>
                <span id="_admClose" title="Fechar (Esc)" style="cursor: pointer; font-size: 13px; color: #8b8fa3;
                    width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
                    border-radius: 6px; transition: all .15s;">✕</span>
            </div>
        `;

        // ─── BODY ───
        const body = document.createElement('div');
        body.style.cssText = `padding: 10px; overflow-y: auto; flex: 1; min-height: 0;`;

        // ─── FOOT ───
        const foot = document.createElement('div');
        foot.className = 'adm-foot';
        foot.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="adm-dot live" style="width:6px; height:6px;"></span>
                <span>Sessão ativa</span>
            </div>
            <span id="_admFootRight" style="font-variant-numeric: tabular-nums;">—</span>
        `;

        // ─── SEC HELPER ───
        function sec(label, iconSvg, contentEl) {
            const s = document.createElement('div');
            s.className = 'adm-sec';
            const head = document.createElement('div');
            head.className = 'adm-sec-head';
            head.innerHTML = `${iconSvg}<span>${label}</span>`;
            s.appendChild(head);
            s.appendChild(contentEl);
            return s;
        }

        // ═══ COLETA DE ESTADO ═══
        const st = bridge.state;
        const fp = bridge.gate.fp;
        const devId = bridge.deviceId;
        const onBlk = fp && bridge.blk.full().includes(fp);
        const mode = bridge.gate.mode;
        const fsOk = bridge.firestore.configured();

        // ═══ 1. SESSÕES AO VIVO ═══
        const sessContent = document.createElement('div');
        sessContent.innerHTML = fsOk
            ? `<div id="_admSessList" style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;">
                   <div style="padding:10px;text-align:center;font-size:9.5px;color:#5b5f70;">Carregando…</div>
               </div>
               <button id="_admSessRefresh" class="adm-action-btn" style="width:100%; margin-top:6px; padding:6px; font-size:9.5px; font-weight:700;
                   background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); color:#c7cad6;">
                   ${ICON.refresh} <span>Atualizar lista</span>
               </button>`
            : `<div style="padding:10px;text-align:center;font-size:9.5px;color:#7d8194;">
                   Firestore não configurado no hub.
               </div>`;

        // ═══ 2. STATUS (separado: remoto vs local) ═══
        const statusContent = document.createElement('div');

        // Sessão remota: pode estar bloqueada pelo admin em OUTRO device ou aqui mesmo
        const sessaoRemotaTxt = 'verificando…';
        const sessaoRemotaCls = 'neutral';

        statusContent.innerHTML = `
            <div class="adm-row">
                <span class="adm-row-label">Sessão remota</span>
                <span class="adm-row-val" id="_admRemotaVal">
                    <span class="adm-badge ${sessaoRemotaCls}">${sessaoRemotaTxt}</span>
                </span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Blacklist local</span>
                <span class="adm-badge ${onBlk ? 'bad' : 'ok'}">${onBlk ? 'Bloqueado' : 'Limpo'}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Modo</span>
                <span class="adm-badge ${mode === 'auto' ? 'neutral' : mode === 'on' ? 'ok' : 'bad'}">${mode.toUpperCase()}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Firestore</span>
                <span class="adm-badge ${fsOk ? 'ok' : 'neutral'}">${fsOk ? 'Conectado' : 'Off'}</span>
            </div>
            <div class="adm-row">
                <span class="adm-row-label">Device ID</span>
                <span class="adm-row-val" id="_admDevCopy" title="Clique para copiar"
                    style="font-family:ui-monospace,monospace;font-size:9px;cursor:pointer;color:#22d3ee;">${shortHash(devId, 8, 4)}</span>
            </div>
        `;

        // ═══ 3. MODO SECRET ═══
        const modoContent = document.createElement('div');
        const modeBtnStyle = (isActive) => `
            flex:1;
            background: ${isActive ? 'linear-gradient(120deg,#22d3ee,#a78bfa)' : 'rgba(255,255,255,0.035)'};
            color: ${isActive ? '#0b0b10' : '#c7cad6'};
            border: 1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.07)'};
        `;
        modoContent.innerHTML = `
            <div style="display:flex; gap:5px;">
                <button data-mode="auto" class="adm-mode-btn ${mode==='auto'?'active':''}" style="${modeBtnStyle(mode==='auto')}">AUTO</button>
                <button data-mode="on" class="adm-mode-btn ${mode==='on'?'active':''}" style="${modeBtnStyle(mode==='on')}">FORÇAR ON</button>
                <button data-mode="off" class="adm-mode-btn ${mode==='off'?'active':''}" style="${modeBtnStyle(mode==='off')}">FORÇAR OFF</button>
            </div>
            <div style="font-size:9px; color:#7d8194; margin-top:8px; line-height:1.5;">
                <b style="color:#a8adbf;">AUTO</b> respeita blacklist local + bloqueio remoto.<br>
                <b style="color:#a8adbf;">FORÇAR</b> ignora ambos (só este device).
            </div>
        `;

        // ═══ 4. BLACKLIST LOCAL ═══
        const blkContent = document.createElement('div');
        blkContent.innerHTML = `
            <div style="display:flex; gap:5px; margin-bottom:8px;">
                <button id="_admBlkAdd" class="adm-action-btn" style="flex:1; padding:7px; font-size:9.5px; font-weight:700;
                    background:rgba(251,113,133,0.08); border:1px solid rgba(251,113,133,0.28); color:#fca5b1;">
                    ${ICON.shield} <span>Bloquear este</span>
                </button>
                <button id="_admBlkRem" class="adm-action-btn" style="flex:1; padding:7px; font-size:9.5px; font-weight:700;
                    background:rgba(52,211,153,0.08); border:1px solid rgba(52,211,153,0.28); color:#a7f3d0;">
                    ${ICON.zap} <span>Desbloquear</span>
                </button>
            </div>
            <div id="_admBlkList" style="display:flex; flex-direction:column; gap:3px; max-height:110px; overflow-y:auto;"></div>
        `;

        // ═══ 5. AÇÕES ═══
        const acoesContent = document.createElement('div');
        acoesContent.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:5px;';
        const actBtns = [
            { id: '_admReload', icon: ICON.refresh, label: 'Manifesto',   color: '#22d3ee' },
            { id: '_admKillMod', icon: ICON.stop,   label: 'Desativar',   color: '#a78bfa' },
            { id: '_admClean',  icon: ICON.broom,   label: 'Limpar cache', color: '#a78bfa' },
            { id: '_admRePage', icon: ICON.reload,  label: 'Recarregar',  color: '#fb7185' }
        ];
        actBtns.forEach(a => {
            const b = document.createElement('button');
            b.id = a.id;
            b.className = 'adm-action-btn';
            b.innerHTML = `${a.icon} <span>${a.label}</span>`;
            b.style.cssText = `padding:7px 6px; font-size:9.5px; font-weight:700;
                background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
                color:${a.color};`;
            acoesContent.appendChild(b);
        });

        // ═══ 6. SESSÃO ADMIN ═══
        const adminContent = document.createElement('div');
        adminContent.innerHTML = `
            <button id="_admLogout" class="adm-action-btn" style="width:100%; padding:8px; font-size:9.5px; font-weight:700;
                background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); color:#c7cad6; margin-bottom:5px;">
                ${ICON.exit} <span>Sair (sem token)</span>
            </button>
            <button id="_admForget" class="adm-action-btn" style="width:100%; padding:8px; font-size:9.5px; font-weight:700;
                background:rgba(251,113,133,0.08); border:1px solid rgba(251,113,133,0.28); color:#fca5b1;">
                ${ICON.trash} <span>Esquecer dispositivo</span>
            </button>
        `;

        body.appendChild(sec('Sessões ao vivo', ICON.users, sessContent));
        body.appendChild(sec('Status', ICON.status, statusContent));
        body.appendChild(sec('Modo secret', ICON.zap, modoContent));
        body.appendChild(sec('Blacklist local', ICON.shield, blkContent));
        body.appendChild(sec('Ações', ICON.refresh, acoesContent));
        body.appendChild(sec('Sessão admin', ICON.user, adminContent));

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

        // ─── COPIAR DEVICE ID ───
        const devCopyEl = statusContent.querySelector('#_admDevCopy');
        devCopyEl.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(devId || ''); _admToast('Device ID copiado', 'ok'); }
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
        function _renderBlkList() {
            const listEl = blkContent.querySelector('#_admBlkList');
            const fixos = bridge.blk.fixed();
            const extras = bridge.blk.extra();
            if (extras.length === 0 && fixos.length === 0) {
                listEl.innerHTML = '<div style="padding:8px;text-align:center;font-size:9px;color:#5b5f70;">Nenhum hash.</div>';
                return;
            }
            const parts = [];
            fixos.forEach(h => {
                parts.push(`<div class="adm-blk-line fixed">
                    <span class="adm-blk-hash">${shortHash(h, 10, 6)}</span>
                    <span style="font-size:7.5px; padding:1px 5px; border-radius:4px; background:rgba(139,143,163,0.14); color:#7d8194; font-weight:800; letter-spacing:.04em;">FIXO</span>
                </div>`);
            });
            extras.forEach((h, i) => {
                parts.push(`<div class="adm-blk-line">
                    <span class="adm-blk-hash">${shortHash(h, 10, 6)}</span>
                    <span data-rm="${i}" class="adm-blk-rm" title="Remover">✕</span>
                </div>`);
            });
            listEl.innerHTML = parts.join('');
            listEl.querySelectorAll('[data-rm]').forEach(el => {
                el.addEventListener('click', async () => {
                    const i = parseInt(el.dataset.rm, 10);
                    const arr = bridge.blk.extra();
                    await bridge.blk.remove(arr[i]);
                    _renderBlkList();
                });
            });
        }
        _renderBlkList();

        blkContent.querySelector('#_admBlkAdd').addEventListener('click', async () => {
            if (!fp) { _admToast('Fingerprint não calculado', 'err'); return; }
            if (bridge.blk.extra().includes(fp) || bridge.blk.fixed().includes(fp)) {
                _admToast('Já está na lista', 'err');
                return;
            }
            await bridge.blk.add(fp);
            _renderBlkList();
            _admToast('Fingerprint bloqueado (local)', 'ok');
        });

        blkContent.querySelector('#_admBlkRem').addEventListener('click', async () => {
            if (!fp) { _admToast('Fingerprint não calculado', 'err'); return; }
            if (!bridge.blk.extra().includes(fp)) {
                _admToast(bridge.blk.fixed().includes(fp) ? 'Na lista fixa — não removível' : 'Não está na lista', 'err');
                return;
            }
            await bridge.blk.remove(fp);
            _renderBlkList();
            _admToast('Fingerprint desbloqueado (local)', 'ok');
        });

        // ─── SESSÕES (Firestore) ───
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

                // Atualiza badge da própria sessão remota no Status
                const eu = sessoes.find(s => s.id === myId);
                const remEl = statusContent.querySelector('#_admRemotaVal');
                if (remEl) {
                    if (!eu) {
                        remEl.innerHTML = `<span class="adm-badge neutral">sem registro</span>`;
                    } else if (eu.blocked === true) {
                        remEl.innerHTML = `<span class="adm-badge bad">Bloqueada</span>`;
                    } else {
                        remEl.innerHTML = `<span class="adm-badge ok">Livre</span>`;
                    }
                }

                if (!sessoes.length) {
                    listEl.innerHTML = '<div style="padding:10px;text-align:center;font-size:9.5px;color:#5b5f70;">Nenhuma sessão registrada.</div>';
                    return;
                }

                listEl.innerHTML = sessoes.map((s, i) => {
                    const ago = Date.now() - (s.lastSeen || 0);
                    const online = ago < SESSAO_ONLINE_MS;
                    const bloqueado = s.blocked === true;
                    const voceMesmo = s.id === myId;
                    const tempo = online
                        ? 'ativa ' + fmtDuracao(Date.now() - (s.sessionStart || s.lastSeen || Date.now()))
                        : fmtAtras(ago);
                    return `<div class="adm-sess-line" style="animation-delay:${i * 20}ms;">
                        <span class="adm-dot ${online ? 'live' : 'offline'}" title="${online ? 'Online' : 'Offline'}"></span>
                        <div class="adm-sess-info">
                            <div class="adm-sess-name">${escHtml(s.name || 'Sem nome')}${voceMesmo ? ' (você)' : ''}</div>
                            <div class="adm-sess-meta">${shortHash(s.id, 7, 4)} · ${tempo} · v${escHtml(s.hubVersion || '?')}</div>
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
                            _admToast(estavaBloqueado ? 'Desbloqueado' : 'Bloqueado', 'ok');
                            carregarSessoes();
                        } catch(e) {
                            _admToast('Falha ao atualizar', 'err');
                            el.style.opacity = '';
                        }
                    });
                });
            } catch(e) {
                listEl.innerHTML = '<div style="padding:10px;text-align:center;font-size:9.5px;color:#fca5b1;">Falha ao carregar.</div>';
            }
        }

        if (fsOk) {
            carregarSessoes();
            sessContent.querySelector('#_admSessRefresh')?.addEventListener('click', carregarSessoes);
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
                    if (bridge.state.moduleStates[mod.id] === 'loaded') {
                        bridge.deactivateModule(mod);
                        n++;
                    }
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
        acoesContent.querySelector('#_admRePage').addEventListener('click', () => {
            location.reload();
        });

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
