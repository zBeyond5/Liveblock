// modules/phone/apps/config.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Phone/config] shell não inicializado.'); return; }
    if (ctx.apps.get('settings')) return;

    // ═══ CONFIG ═══
    const APP_ID = 'settings';       // mesmo id do built-in — sobrescreve
    const APP_VERSION = '1.2.0';
    const LS_KEY = 'sanghub_phone_config';
    const LS_PIN = 'sanghub_phone_pin';

    const DEFAULT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

    const DEFAULTS = {
        theme: 'aurora',
        sound: true,
        previewOnCall: true,
        iconUrl: '',
        wallpaperUrl: ''
    };

    const esc = ctx.esc;

    // ═══ STORAGE ═══
    function load() {
        try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(LS_KEY) || '{}')) }; }
        catch(_) { return { ...DEFAULTS }; }
    }
    function save(cfg) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch(_) {}
    }
    function getPin() {
        try { return localStorage.getItem(LS_PIN) || ''; } catch(_) { return ''; }
    }
    function setPin(pin) {
        try {
            if (pin) localStorage.setItem(LS_PIN, pin);
            else localStorage.removeItem(LS_PIN);
        } catch(_) {}
    }

    // ═══ HELPERS ═══
    function safeUrl(url) {
        if (!url) return '';
        const s = String(url).trim();
        if (/^https?:\/\//i.test(s)) return s.replace(/['"()\\\s]/g, '');
        if (/^data:image\//i.test(s)) return s.replace(/['"()\\\s]/g, '');
        return '';
    }
    function iconHtmlFor(cfg) {
        const url = safeUrl(cfg.iconUrl);
        if (!url) return DEFAULT_ICON;
        return `<img src="${esc(url)}" alt="icon" style="width:100%;height:100%;object-fit:contain;display:block;border-radius:8px;" />`;
    }
    function applyWallpaper(cfg) {
        const el = ctx.root?.querySelector('#phWallpaper');
        if (!el) return;
        const url = safeUrl(cfg.wallpaperUrl);
        if (url) el.style.setProperty('--phone-wallpaper', `url('${url}')`);
        else el.style.removeProperty('--phone-wallpaper');
    }

    // Aplica wallpaper salvo assim que o shell monta o frame
    setTimeout(() => { try { applyWallpaper(load()); } catch(_) {} }, 0);

    // ═══ REGISTRO ═══
    ctx.apps.register({
        id: APP_ID,
        name: 'Ajustes',
        get icon() { return iconHtmlFor(load()); },
        accent: '#a78bfa',
        bg: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
        order: 10,

        mount(root, ctx) {
            let cfg = load();
            renderApp(root, () => cfg, (next) => { cfg = next; });
        },

        unmount() {}
    });

    // ═══ RENDER ═══
    function renderApp(root, getCfg, setCfg) {
        const cfg = getCfg();
        const initialIcon = iconHtmlFor(cfg);
        const initialWallpaper = safeUrl(cfg.wallpaperUrl);
        const hasPin = !!getPin();

        root.innerHTML = `
            <div class="cfg-app">
                <div class="cfg-app-body">
                    <div class="cfg-hero">
                        <div class="cfg-hero-icon" id="cfgHeroIcon">${initialIcon}</div>
                        <div class="cfg-hero-info">
                            <div class="cfg-hero-title">Personalizar celular</div>
                            <div class="cfg-hero-sub">Tema, ícone, papel de parede e segurança</div>
                        </div>
                    </div>

                    <div class="cfg-section">
                        <div class="cfg-section-title">Segurança</div>
                        ${hasPin ? `
                            <button class="cfg-action" data-act="change-pin">
                                <span class="cfg-action-text">
                                    <span class="cfg-action-lbl">Alterar PIN</span>
                                    <span class="cfg-action-sub">Trocar o PIN de desbloqueio</span>
                                </span>
                                <span class="cfg-action-val">›</span>
                            </button>
                            <button class="cfg-action danger" data-act="remove-pin">
                                <span class="cfg-action-text">
                                    <span class="cfg-action-lbl">Remover PIN</span>
                                    <span class="cfg-action-sub">Sem PIN, a tela desbloqueia só com toque</span>
                                </span>
                                <span class="cfg-action-val">›</span>
                            </button>
                            <button class="cfg-action" data-act="lock-now">
                                <span class="cfg-action-text">
                                    <span class="cfg-action-lbl">Bloquear agora</span>
                                    <span class="cfg-action-sub">Volta para a tela de bloqueio</span>
                                </span>
                                <span class="cfg-action-val">›</span>
                            </button>
                        ` : `
                            <button class="cfg-action" data-act="set-pin">
                                <span class="cfg-action-text">
                                    <span class="cfg-action-lbl">Definir PIN</span>
                                    <span class="cfg-action-sub">Protege o desbloqueio com 4 dígitos</span>
                                </span>
                                <span class="cfg-action-val">›</span>
                            </button>
                        `}
                    </div>

                    <div class="cfg-section">
                        <div class="cfg-section-title">Ícone do app</div>
                        <div class="cfg-field">
                            <label class="cfg-field-label" for="cfgIconUrl">URL do ícone</label>
                            <input class="cfg-input" id="cfgIconUrl" type="url"
                                placeholder="https://exemplo.com/icon.png"
                                value="${esc(cfg.iconUrl || '')}"
                                spellcheck="false" autocomplete="off" autocapitalize="off" />
                            <div class="cfg-field-hint">.png, .jpg, .svg ou data URL. Vazio = ícone padrão.</div>
                        </div>
                        <button class="cfg-mini-btn" id="cfgIconReset">Restaurar ícone padrão</button>
                    </div>

                    <div class="cfg-section">
                        <div class="cfg-section-title">Aparência</div>
                        <div class="cfg-option-row">
                            <div class="cfg-option-label">Tema</div>
                            <div class="cfg-radio-group" data-key="theme">
                                <button class="cfg-radio${cfg.theme === 'aurora' ? ' active' : ''}" data-value="aurora">Aurora</button>
                                <button class="cfg-radio${cfg.theme === 'noite' ? ' active' : ''}" data-value="noite">Noite</button>
                                <button class="cfg-radio${cfg.theme === 'claro' ? ' active' : ''}" data-value="claro">Claro</button>
                            </div>
                        </div>
                        <div class="cfg-field">
                            <label class="cfg-field-label" for="cfgWallpaper">Papel de parede</label>
                            <div class="cfg-wallpaper-row">
                                <div class="cfg-wallpaper-preview" id="cfgWallpaperPreview" style="${initialWallpaper ? `background-image:url('${esc(initialWallpaper)}')` : ''}">
                                    ${initialWallpaper ? '' : `<span class="cfg-wallpaper-empty">vazio</span>`}
                                </div>
                                <input class="cfg-input" id="cfgWallpaper" type="url"
                                    placeholder="https://exemplo.com/fundo.jpg"
                                    value="${esc(cfg.wallpaperUrl || '')}"
                                    spellcheck="false" autocomplete="off" autocapitalize="off" />
                            </div>
                            <div class="cfg-field-hint">Imagem aplicada atrás da interface.</div>
                        </div>
                    </div>

                    <div class="cfg-section">
                        <div class="cfg-section-title">Comportamento</div>
                        <div class="cfg-toggle-row">
                            <div class="cfg-toggle-text">
                                <div class="cfg-toggle-label">Som</div>
                                <div class="cfg-toggle-sub">Tons de chamada, teclado e notificações</div>
                            </div>
                            <label class="cfg-switch">
                                <input type="checkbox" data-key="sound" ${cfg.sound ? 'checked' : ''} />
                                <span class="cfg-switch-track"></span>
                            </label>
                        </div>
                        <div class="cfg-toggle-row">
                            <div class="cfg-toggle-text">
                                <div class="cfg-toggle-label">Prévia em chamada</div>
                                <div class="cfg-toggle-sub">Expandir telefone automaticamente</div>
                            </div>
                            <label class="cfg-switch">
                                <input type="checkbox" data-key="previewOnCall" ${cfg.previewOnCall ? 'checked' : ''} />
                                <span class="cfg-switch-track"></span>
                            </label>
                        </div>
                    </div>

                    <div class="cfg-section">
                        <div class="cfg-section-title">Sobre</div>
                        <div class="cfg-info-row">
                            <span class="cfg-info-label">Sistema</span>
                            <span class="cfg-info-val">Android ${esc(window._phoneCtx?.__ANDROID_VERSION || '14')}</span>
                        </div>
                        <div class="cfg-info-row">
                            <span class="cfg-info-label">App</span>
                            <span class="cfg-info-val">v${APP_VERSION}</span>
                        </div>
                        <div class="cfg-info-row">
                            <span class="cfg-info-label">Armazenamento</span>
                            <span class="cfg-info-val"><code>${LS_KEY}</code></span>
                        </div>
                    </div>

                    <button class="cfg-reset-btn" id="cfgReset">Restaurar configurações padrão</button>
                    <div class="cfg-app-foot">Sang Phone · ajustes salvos localmente</div>
                </div>
            </div>
        `;

        // ═══ Hero icon live update ═══
        function updateHero() {
            const hero = root.querySelector('#cfgHeroIcon');
            if (hero) hero.innerHTML = iconHtmlFor(getCfg());
        }

        // ═══ Icon URL ═══
        const iconInput = root.querySelector('#cfgIconUrl');
        let iconDebounce = null;
        iconInput.addEventListener('input', () => {
            clearTimeout(iconDebounce);
            iconDebounce = setTimeout(() => {
                const c = getCfg(); c.iconUrl = iconInput.value.trim(); setCfg(c); save(c);
                updateHero();
                try { ctx.apps._notify?.(); } catch(_) {}
            }, 350);
        });
        root.querySelector('#cfgIconReset').addEventListener('click', () => {
            const c = getCfg(); c.iconUrl = ''; setCfg(c); save(c);
            iconInput.value = '';
            updateHero();
            try { ctx.apps._notify?.(); } catch(_) {}
            ctx.toast('Ícone restaurado', 'ok');
        });

        // ═══ Theme ═══
        root.querySelectorAll('.cfg-radio').forEach(btn => {
            btn.addEventListener('click', () => {
                const c = getCfg(); c.theme = btn.dataset.value; setCfg(c); save(c);
                root.querySelectorAll('.cfg-radio').forEach(b => b.classList.toggle('active', b === btn));
                ctx.toast('Tema: ' + btn.dataset.value, 'ok');
            });
        });

        // ═══ Wallpaper ═══
        const wpInput = root.querySelector('#cfgWallpaper');
        const wpPreview = root.querySelector('#cfgWallpaperPreview');
        function updateWallpaperPreview() {
            const url = safeUrl(getCfg().wallpaperUrl);
            if (url) {
                wpPreview.style.backgroundImage = `url('${url.replace(/'/g, "%27")}')`;
                wpPreview.innerHTML = '';
            } else {
                wpPreview.style.backgroundImage = '';
                wpPreview.innerHTML = `<span class="cfg-wallpaper-empty">vazio</span>`;
            }
        }
        let wpDebounce = null;
        wpInput.addEventListener('input', () => {
            clearTimeout(wpDebounce);
            wpDebounce = setTimeout(() => {
                const c = getCfg(); c.wallpaperUrl = wpInput.value.trim(); setCfg(c); save(c);
                applyWallpaper(c);
                updateWallpaperPreview();
            }, 350);
        });

        // ═══ Toggles ═══
        root.querySelectorAll('.cfg-switch input[data-key]').forEach(input => {
            input.addEventListener('change', () => {
                const c = getCfg(); c[input.dataset.key] = input.checked; setCfg(c); save(c);
                ctx.toast(input.checked ? 'Ativado' : 'Desativado', 'ok');
            });
        });

        // ═══ PIN actions ═══
        root.querySelectorAll('.cfg-action[data-act]').forEach(btn => {
            btn.addEventListener('click', () => handlePinAction(btn.dataset.act, root, getCfg, setCfg));
        });

        // ═══ Reset geral ═══
        const resetBtn = root.querySelector('#cfgReset');
        resetBtn.addEventListener('click', () => {
            if (!resetBtn.dataset.confirm) {
                resetBtn.dataset.confirm = '1';
                resetBtn.textContent = 'Confirmar? Toque de novo';
                resetBtn.classList.add('danger');
                setTimeout(() => {
                    if (resetBtn.dataset.confirm) {
                        delete resetBtn.dataset.confirm;
                        resetBtn.textContent = 'Restaurar configurações padrão';
                        resetBtn.classList.remove('danger');
                    }
                }, 2500);
                return;
            }
            const next = { ...DEFAULTS };
            setCfg(next); save(next);
            applyWallpaper(next);
            try { ctx.apps._notify?.(); } catch(_) {}
            ctx.tone.fav();
            ctx.toast('Configurações restauradas', 'ok');
            root.innerHTML = '';
            renderApp(root, getCfg, setCfg);
        });
    }

    // ═══ PIN FLOW ═══
    function handlePinAction(act, root, getCfg, setCfg) {
        const hasPin = !!getPin();
        if (act === 'set-pin') {
            openPinModal(root, {
                title: 'Definir PIN',
                sub: 'Escolha 4 dígitos',
                mode: 'set-new',
                onDone: () => { ctx.toast('PIN definido', 'ok'); rerender(root, getCfg, setCfg); }
            });
        } else if (act === 'change-pin') {
            openPinModal(root, {
                title: 'PIN atual',
                sub: 'Digite o PIN atual para continuar',
                mode: 'check-current',
                onDone: () => {
                    openPinModal(root, {
                        title: 'Novo PIN',
                        sub: 'Escolha 4 dígitos',
                        mode: 'set-new',
                        onDone: () => { ctx.toast('PIN alterado', 'ok'); rerender(root, getCfg, setCfg); }
                    });
                }
            });
        } else if (act === 'remove-pin') {
            openPinModal(root, {
                title: 'Confirmar',
                sub: 'Digite o PIN atual para remover',
                mode: 'check-current',
                onDone: () => {
                    setPin('');
                    ctx.toast('PIN removido', 'ok');
                    rerender(root, getCfg, setCfg);
                }
            });
        } else if (act === 'lock-now') {
            try { ctx.closeApp?.(); } catch(_) {}
            // Pede ao shell pra voltar pra lock
            setTimeout(() => {
                try { window._phone?._lock?.(); } catch(_) {}
                // Fallback: dispara um toggle+lock via API pública, se existir
                try {
                    if (typeof window._phone?._forceLock === 'function') window._phone._forceLock();
                } catch(_) {}
            }, 100);
        }
    }

    function rerender(root, getCfg, setCfg) {
        root.innerHTML = '';
        renderApp(root, getCfg, setCfg);
    }

    function openPinModal(root, opts) {
        root.querySelector('.cfg-pin-modal')?.remove();
        const modal = ctx.el('div', { class: 'cfg-pin-modal' });
        modal.innerHTML = `
            <div class="cfg-pin-title">${esc(opts.title)}</div>
            <div class="cfg-pin-sub" id="cfgPinSub">${esc(opts.sub)}</div>
            <div class="cfg-pin-dots" id="cfgPinDots">
                <span class="cfg-pin-dot"></span>
                <span class="cfg-pin-dot"></span>
                <span class="cfg-pin-dot"></span>
                <span class="cfg-pin-dot"></span>
            </div>
            <div class="cfg-pin-pad" id="cfgPinPad"></div>
            <button class="cfg-pin-cancel" id="cfgPinCancel">Cancelar</button>
        `;
        root.appendChild(modal);

        let buf = '';
        let firstPin = '';
        let mode = opts.mode;

        const dots = modal.querySelectorAll('.cfg-pin-dot');
        const subEl = modal.querySelector('#cfgPinSub');
        const updateDots = () => dots.forEach((d, i) => d.classList.toggle('filled', i < buf.length));

        const pad = modal.querySelector('#cfgPinPad');
        const keys = [
            { d: '1' }, { d: '2', sub: 'ABC' }, { d: '3', sub: 'DEF' },
            { d: '4', sub: 'GHI' }, { d: '5', sub: 'JKL' }, { d: '6', sub: 'MNO' },
            { d: '7', sub: 'PQRS' }, { d: '8', sub: 'TUV' }, { d: '9', sub: 'WXYZ' },
            { util: 'back' }, { d: '0' }, { util: 'ok' }
        ];
        pad.innerHTML = keys.map(k => {
            if (k.util === 'back') return `<button class="cfg-pin-key util" data-util="back">${ctx.I.backspace}</button>`;
            if (k.util === 'ok') return `<button class="cfg-pin-key util ok" data-util="ok">✓</button>`;
            return `<button class="cfg-pin-key" data-digit="${k.d}">${k.d}${k.sub ? `<span class="sub">${k.sub}</span>` : ''}</button>`;
        }).join('');

        const closeModal = () => modal.remove();

        const shake = () => {
            const wrap = modal.querySelector('#cfgPinDots');
            if (wrap) { wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); }
        };

        const fail = (msg) => {
            try { ctx.tone.errorPin?.(); } catch(_) {}
            shake();
            if (subEl) subEl.textContent = msg;
            buf = '';
            updateDots();
            setTimeout(() => { if (subEl) subEl.textContent = opts.sub; }, 900);
        };

        const complete = () => {
            const pin = buf;
            if (mode === 'check-current') {
                if (pin !== getPin()) return fail('PIN incorreto');
                try { ctx.tone.unlock?.(); } catch(_) {}
                closeModal();
                opts.onDone?.();
                return;
            }
            if (mode === 'set-new') {
                firstPin = pin;
                mode = 'set-confirm';
                buf = '';
                if (subEl) subEl.textContent = 'Repita os 4 dígitos';
                updateDots();
                return;
            }
            if (mode === 'set-confirm') {
                if (pin !== firstPin) {
                    firstPin = '';
                    mode = 'set-new';
                    return fail('PINs não coincidem');
                }
                setPin(pin);
                try { ctx.tone.unlock?.(); } catch(_) {}
                closeModal();
                opts.onDone?.();
            }
        };

        pad.querySelectorAll('.cfg-pin-key').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.remove('pressed'); void btn.offsetWidth; btn.classList.add('pressed');
                if (btn.dataset.digit != null) {
                    try { ctx.tone.key?.(); } catch(_) {}
                    if (buf.length < 4) buf += btn.dataset.digit;
                } else if (btn.dataset.util === 'back') {
                    try { ctx.tone.key?.(); } catch(_) {}
                    buf = buf.slice(0, -1);
                } else if (btn.dataset.util === 'ok') {
                    if (buf.length === 4) complete();
                    return;
                }
                updateDots();
                if (buf.length === 4) setTimeout(complete, 60);
            });
        });

        modal.querySelector('#cfgPinCancel').addEventListener('click', closeModal);
    }

    // ═══ CSS ═══
    ctx.appendStyle(`
        /* ═══ APP ROOT ═══ */
        .cfg-app {
            display: flex; flex-direction: column;
            min-height: 0; height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #e9ecf5;
            position: relative;
        }
        .cfg-app-body {
            flex: 1; min-height: 0; overflow-y: auto;
            padding: 6px 14px 22px;
            display: flex; flex-direction: column; gap: 12px;
        }
        .cfg-app-body::-webkit-scrollbar { width: 4px; }
        .cfg-app-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }
        .cfg-app-foot {
            text-align: center; font-size: 9px; color: #5c6280;
            letter-spacing: .06em; padding: 12px 0 4px;
        }

        /* ═══ HERO ═══ */
        .cfg-hero {
            display: flex; align-items: center; gap: 14px;
            padding: 14px;
            border-radius: 16px;
            background:
                radial-gradient(circle at 15% 20%, rgba(34,211,238,.14), transparent 55%),
                radial-gradient(circle at 85% 90%, rgba(167,139,250,.16), transparent 55%),
                linear-gradient(175deg, rgba(255,255,255,.045), rgba(255,255,255,.015));
            border: 1px solid rgba(255,255,255,.09);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
        }
        .cfg-hero-icon {
            width: 58px; height: 58px; flex-shrink: 0;
            border-radius: 16px;
            background: linear-gradient(135deg, rgba(34,211,238,.22), rgba(167,139,250,.22));
            border: 1px solid rgba(34,211,238,.34);
            display: flex; align-items: center; justify-content: center;
            color: #67e8f9; overflow: hidden;
            box-shadow: 0 12px 26px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1);
        }
        .cfg-hero-icon svg { width: 30px; height: 30px; }
        .cfg-hero-info { flex: 1; min-width: 0; }
        .cfg-hero-title { font-size: 13px; font-weight: 800; color: #f1f2f8; letter-spacing: .01em; }
        .cfg-hero-sub { font-size: 9.5px; color: #8a90a8; margin-top: 3px; line-height: 1.4; }

        /* ═══ SECTIONS ═══ */
        .cfg-section {
            display: flex; flex-direction: column; gap: 8px;
            padding: 12px; border-radius: 14px;
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.06);
        }
        .cfg-section-title {
            font-size: 9px; font-weight: 800; letter-spacing: .12em;
            text-transform: uppercase; color: #8a90a8;
            padding-bottom: 7px;
            border-bottom: 1px solid rgba(255,255,255,.06);
            margin-bottom: 2px;
        }

        /* ═══ ACTION ROWS ═══ */
        .cfg-action {
            display: flex; align-items: center; justify-content: space-between;
            gap: 10px; padding: 11px 12px;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 11px;
            cursor: pointer; font-family: inherit; color: inherit; text-align: left;
            transition: background .18s, border-color .18s, transform .15s;
        }
        .cfg-action:hover { background: rgba(255,255,255,.08); border-color: rgba(34,211,238,.3); }
        .cfg-action:active { transform: scale(.985); }
        .cfg-action-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .cfg-action-lbl { font-size: 12px; font-weight: 700; color: #e9ecf5; }
        .cfg-action-sub { font-size: 9.5px; color: #8a90a8; line-height: 1.4; }
        .cfg-action-val { font-size: 16px; color: #8a90a8; flex-shrink: 0; line-height: 1; }
        .cfg-action.danger .cfg-action-lbl { color: #fca5b1; }
        .cfg-action.danger .cfg-action-val { color: #fca5b1; }
        .cfg-action.danger:hover { border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.08); }

        /* ═══ FIELDS ═══ */
        .cfg-field { display: flex; flex-direction: column; gap: 6px; }
        .cfg-field-label {
            font-size: 9.5px; font-weight: 800; letter-spacing: .06em;
            text-transform: uppercase; color: #a8aec4;
        }
        .cfg-input {
            width: 100%; padding: 9px 11px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 9px; color: #f1f2f8;
            font-family: inherit; font-size: 11.5px; outline: none;
            transition: border-color .18s, box-shadow .18s, background .18s;
            box-sizing: border-box;
        }
        .cfg-input::placeholder { color: #5c6280; }
        .cfg-input:focus { border-color: rgba(34,211,238,.6); box-shadow: 0 0 0 3px rgba(34,211,238,.14); background: rgba(255,255,255,.07); }
        .cfg-field-hint { font-size: 9px; color: #6b7280; line-height: 1.5; }

        .cfg-mini-btn {
            align-self: flex-start;
            padding: 7px 12px; border-radius: 8px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            color: #c7cad6;
            font-family: inherit; font-size: 10px; font-weight: 700;
            letter-spacing: .03em; cursor: pointer;
            transition: all .16s cubic-bezier(.22,1,.36,1);
        }
        .cfg-mini-btn:hover { background: rgba(34,211,238,.14); color: #67e8f9; border-color: rgba(34,211,238,.4); transform: translateY(-1px); }
        .cfg-mini-btn:active { transform: translateY(0) scale(.96); }

        /* ═══ RADIO GROUP ═══ */
        .cfg-option-row { display: flex; flex-direction: column; gap: 6px; }
        .cfg-option-label {
            font-size: 9.5px; font-weight: 800; letter-spacing: .06em;
            text-transform: uppercase; color: #a8aec4;
        }
        .cfg-radio-group {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 5px; background: rgba(0,0,0,.22);
            border: 1px solid rgba(255,255,255,.06);
            border-radius: 10px; padding: 3px;
        }
        .cfg-radio {
            padding: 7px 4px; border-radius: 7px;
            background: transparent; border: none;
            color: #8a90a8;
            font-family: inherit; font-size: 10px; font-weight: 800;
            letter-spacing: .04em; text-transform: uppercase;
            cursor: pointer;
            transition: all .18s cubic-bezier(.22,1,.36,1);
        }
        .cfg-radio:hover:not(.active) { color: #d1d5db; background: rgba(255,255,255,.04); }
        .cfg-radio.active {
            background: linear-gradient(135deg, #22d3ee, #a78bfa);
            color: #0b0b10;
            box-shadow: 0 4px 12px rgba(34,211,238,.3), inset 0 1px 0 rgba(255,255,255,.25);
        }
        .cfg-radio:active:not(.active) { transform: scale(.96); }

        /* ═══ WALLPAPER ROW ═══ */
        .cfg-wallpaper-row { display: flex; gap: 9px; align-items: center; }
        .cfg-wallpaper-preview {
            width: 42px; height: 42px; flex-shrink: 0;
            border-radius: 10px;
            background-color: rgba(255,255,255,.03);
            background-size: cover; background-position: center;
            border: 1px solid rgba(255,255,255,.1);
            display: flex; align-items: center; justify-content: center;
            overflow: hidden;
        }
        .cfg-wallpaper-empty { font-size: 8px; color: #4b5060; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; }
        .cfg-wallpaper-row .cfg-input { flex: 1; min-width: 0; }

        /* ═══ TOGGLES ═══ */
        .cfg-toggle-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
        .cfg-toggle-row + .cfg-toggle-row { border-top: 1px dashed rgba(255,255,255,.05); padding-top: 9px; }
        .cfg-toggle-text { flex: 1; min-width: 0; }
        .cfg-toggle-label { font-size: 11.5px; font-weight: 700; color: #e8eaf4; }
        .cfg-toggle-sub { font-size: 9px; color: #6b7280; margin-top: 2px; line-height: 1.4; }

        .cfg-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; cursor: pointer; }
        .cfg-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .cfg-switch-track {
            position: absolute; inset: 0; border-radius: 20px;
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.12);
            transition: background .24s, border-color .24s, box-shadow .24s;
        }
        .cfg-switch-track::before {
            content: ''; position: absolute;
            width: 14px; height: 14px; left: 2px; top: 2px;
            background: #8a90a8; border-radius: 50%;
            transition: transform .24s cubic-bezier(.22,1,.36,1), background .24s, box-shadow .24s;
        }
        .cfg-switch input:checked + .cfg-switch-track {
            background: linear-gradient(120deg, rgba(52,211,153,.42), rgba(34,211,238,.42));
            border-color: rgba(52,211,153,.6);
            box-shadow: inset 0 0 8px rgba(52,211,153,.16);
        }
        .cfg-switch input:checked + .cfg-switch-track::before {
            background: linear-gradient(135deg, #34d399, #22d3ee);
            transform: translateX(16px);
            box-shadow: 0 0 8px rgba(52,211,153,.75);
        }

        /* ═══ INFO ROWS ═══ */
        .cfg-info-row {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 6px 0; font-size: 11px;
        }
        .cfg-info-row + .cfg-info-row { border-top: 1px dashed rgba(255,255,255,.05); }
        .cfg-info-label { color: #8a90a8; }
        .cfg-info-val { color: #e8eaf4; font-weight: 700; font-variant-numeric: tabular-nums; }
        .cfg-info-val code {
            background: rgba(255,255,255,.06);
            padding: 2px 6px; border-radius: 4px;
            font-family: ui-monospace, 'SF Mono', Menlo, monospace;
            font-size: 9.5px; color: #67e8f9; letter-spacing: .02em;
        }

        /* ═══ RESET ═══ */
        .cfg-reset-btn {
            padding: 11px 12px; border-radius: 11px;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.1);
            color: #c7cad6;
            font-family: inherit; font-size: 11px; font-weight: 800;
            letter-spacing: .04em; cursor: pointer;
            transition: all .18s cubic-bezier(.22,1,.36,1);
        }
        .cfg-reset-btn:hover { background: rgba(255,255,255,.08); transform: translateY(-1px); }
        .cfg-reset-btn:active { transform: translateY(0) scale(.98); }
        .cfg-reset-btn.danger {
            background: rgba(251,113,133,.14);
            border-color: rgba(251,113,133,.45);
            color: #fca5b1;
            animation: phSpeaking 1.4s ease-in-out infinite;
        }
        .cfg-reset-btn.danger:hover { background: rgba(251,113,133,.22); }

        /* ═══ PIN MODAL ═══ */
        .cfg-pin-modal {
            position: absolute; inset: 0; z-index: 30;
            background: linear-gradient(175deg, rgba(20,18,40,.98), rgba(10,8,26,.99));
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 14px; padding: 22px;
            animation: phFadeIn .22s ease;
        }
        .cfg-pin-title { font-size: 13px; font-weight: 800; color: #e9ecf5; text-align: center; letter-spacing: .02em; }
        .cfg-pin-sub { font-size: 10.5px; color: #8890a8; text-align: center; line-height: 1.5; max-width: 200px; min-height: 15px; }
        .cfg-pin-dots { display: flex; gap: 14px; justify-content: center; padding: 6px 0; }
        .cfg-pin-dot {
            width: 12px; height: 12px; border-radius: 50%;
            background: transparent; border: 2px solid rgba(255,255,255,.35);
            transition: background .15s, border-color .15s, transform .15s;
        }
        .cfg-pin-dot.filled {
            background: #67e8f9; border-color: #67e8f9;
            box-shadow: 0 0 12px rgba(34,211,238,.7);
            transform: scale(1.1);
        }
        .cfg-pin-dots.shake { animation: phPinShake .5s cubic-bezier(.36,.07,.19,.97); }
        .cfg-pin-pad {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 8px; width: 100%; max-width: 200px;
        }
        .cfg-pin-key {
            padding: 12px 0 10px; border-radius: 14px;
            background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.035));
            border: 1px solid rgba(255,255,255,.09);
            color: #e5e7eb; font-family: inherit;
            font-size: 19px; font-weight: 700;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            cursor: pointer; user-select: none;
            transition: background .12s, border-color .12s, transform .12s;
            line-height: 1;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        }
        .cfg-pin-key .sub { font-size: 7.5px; color: #7b8296; letter-spacing: .06em; margin-top: 3px; font-weight: 800; text-transform: uppercase; }
        .cfg-pin-key:hover { background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.05)); border-color: rgba(34,211,238,.32); }
        .cfg-pin-key:active { transform: scale(.94); background: linear-gradient(180deg, rgba(34,211,238,.2), rgba(34,211,238,.08)); }
        .cfg-pin-key.pressed { animation: phKeyPress .25s cubic-bezier(.22,1,.36,1); }
        .cfg-pin-key.util { color: #8890a4; font-size: 15px; }
        .cfg-pin-key.util:hover { color: #67e8f9; }
        .cfg-pin-key.util svg { width: 16px; height: 16px; }
        .cfg-pin-key.util.ok { color: #a7f3d0; }
        .cfg-pin-key.util.ok:hover { color: #fff; background: rgba(52,211,153,.14); }
        .cfg-pin-cancel {
            background: transparent; border: 1px solid rgba(255,255,255,.14);
            color: #a8aec4; font-family: inherit; font-size: 10.5px; font-weight: 700;
            padding: 8px 18px; border-radius: 8px; cursor: pointer;
            transition: background .15s, color .15s, border-color .15s;
        }
        .cfg-pin-cancel:hover { background: rgba(255,255,255,.06); color: #e9ecf5; }

        @keyframes phPinShake { 10%,90%{transform:translateX(-3px)} 20%,80%{transform:translateX(4px)} 30%,50%,70%{transform:translateX(-6px)} 40%,60%{transform:translateX(6px)} }

        @media (prefers-reduced-motion: reduce) {
            .cfg-reset-btn.danger, .cfg-pin-key.pressed, .cfg-pin-dots.shake { animation: none !important; }
            .cfg-action, .cfg-mini-btn, .cfg-radio, .cfg-reset-btn { transition-duration: .01ms; }
        }
    `);
})();
