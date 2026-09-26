// modules/phone/apps/config.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Phone/config] shell não inicializado.'); return; }
    if (ctx.apps.get('config')) return;

    // ═══ CONFIG ═══
    const APP_ID = 'config';
    const APP_VERSION = '1.1.0';
    const LS_KEY = 'sanghub_phone_config';

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

    // Aceita http(s):// ou data:image/. Rejeita o resto.
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
        const screen = ctx.screenEl;
        if (!screen) return;
        const url = safeUrl(cfg.wallpaperUrl);
        if (url) screen.style.setProperty('--phone-wallpaper', `url('${url}')`);
        else screen.style.removeProperty('--phone-wallpaper');
    }

    // Aplica wallpaper salvo no boot (antes do usuário abrir o app)
    try { applyWallpaper(load()); } catch(_) {}

    // ═══ REGISTRO ═══
    ctx.apps.register({
        id: APP_ID,
        name: 'Ajustes',
        get icon() { return iconHtmlFor(load()); },
        accent: '#a78bfa',
        order: 100,

        mount(root, ctx) {
            const cfg = load();
            // Fullscreen real: esconde header/tabs/meu-número do shell
            ctx.screenEl?.classList.add('cfg-fullscreen');
            renderApp(root, cfg);
        },

        unmount() {
            ctx.screenEl?.classList.remove('cfg-fullscreen');
        }
    });

    // ═══ RENDER ═══
    function renderApp(root, cfg) {
        const initialIcon = iconHtmlFor(cfg);
        const initialWallpaper = safeUrl(cfg.wallpaperUrl);

        root.innerHTML = `
            <div class="cfg-app">
                <div class="cfg-app-header">
                    <button class="cfg-back" id="cfgBack" title="Voltar" aria-label="Voltar">${ctx.I.back}</button>
                    <div class="cfg-app-title">AJUSTES</div>
                    <div class="cfg-app-version">v${APP_VERSION}</div>
                </div>

                <div class="cfg-app-body">
                    <div class="cfg-hero">
                        <div class="cfg-hero-icon" id="cfgHeroIcon">
                            ${initialIcon}
                        </div>
                        <div class="cfg-hero-info">
                            <div class="cfg-hero-title">Personalizar celular</div>
                            <div class="cfg-hero-sub">Tema, ícone, papel de parede e comportamento</div>
                        </div>
                    </div>

                    <div class="cfg-section">
                        <div class="cfg-section-title">Ícone do app</div>
                        <div class="cfg-field">
                            <label class="cfg-field-label" for="cfgIconUrl">URL do ícone</label>
                            <input class="cfg-input" id="cfgIconUrl" type="url"
                                placeholder="https://exemplo.com/icon.png"
                                value="${esc(cfg.iconUrl || '')}"
                                spellcheck="false" autocomplete="off" autocapitalize="off" />
                            <div class="cfg-field-hint">Formatos: .png, .jpg, .svg ou data URL. Deixe vazio para o ícone padrão.</div>
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
                            <div class="cfg-field-hint">Imagem aplicada atrás da interface. Deixe vazio para o fundo padrão.</div>
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
                            <span class="cfg-info-label">Versão do celular</span>
                            <span class="cfg-info-val">Android ${esc(window._phoneCtx?.__ANDROID_VERSION || '14')}</span>
                        </div>
                        <div class="cfg-info-row">
                            <span class="cfg-info-label">Versão do app</span>
                            <span class="cfg-info-val">${APP_VERSION}</span>
                        </div>
                        <div class="cfg-info-row">
                            <span class="cfg-info-label">Armazenamento</span>
                            <span class="cfg-info-val"><code>${LS_KEY}</code></span>
                        </div>
                    </div>

                    <button class="cfg-reset-btn" id="cfgReset">Restaurar configurações padrão</button>

                    <div class="cfg-app-foot">Sang Phone · todos os ajustes são locais</div>
                </div>
            </div>
        `;

        // ═══ Back ═══
        root.querySelector('#cfgBack').addEventListener('click', () => {
            try { ctx.apps.get(APP_ID)?.unmount?.(); } catch(_) {}
            ctx.renderTab();
        });

        // ═══ Hero icon live update ═══
        function updateHero() {
            const hero = root.querySelector('#cfgHeroIcon');
            if (!hero) return;
            hero.innerHTML = iconHtmlFor(cfg);
        }

        // ═══ Icon URL ═══
        const iconInput = root.querySelector('#cfgIconUrl');
        let iconDebounce = null;
        iconInput.addEventListener('input', () => {
            clearTimeout(iconDebounce);
            iconDebounce = setTimeout(() => {
                cfg.iconUrl = iconInput.value.trim();
                save(cfg);
                updateHero();
                try { ctx.apps._notify?.(); } catch(_) {}
            }, 350);
        });

        root.querySelector('#cfgIconReset').addEventListener('click', () => {
            cfg.iconUrl = '';
            save(cfg);
            iconInput.value = '';
            updateHero();
            try { ctx.apps._notify?.(); } catch(_) {}
            ctx.toast('Ícone restaurado', 'ok');
        });

        // ═══ Theme radios ═══
        root.querySelectorAll('.cfg-radio').forEach(btn => {
            btn.addEventListener('click', () => {
                cfg.theme = btn.dataset.value;
                save(cfg);
                root.querySelectorAll('.cfg-radio').forEach(b => b.classList.toggle('active', b === btn));
                ctx.toast('Tema: ' + btn.dataset.value, 'ok');
            });
        });

        // ═══ Wallpaper ═══
        const wpInput = root.querySelector('#cfgWallpaper');
        const wpPreview = root.querySelector('#cfgWallpaperPreview');
        let wpDebounce = null;
        function updateWallpaperPreview() {
            const url = safeUrl(cfg.wallpaperUrl);
            if (url) {
                wpPreview.style.backgroundImage = `url('${url.replace(/'/g, "%27")}')`;
                wpPreview.innerHTML = '';
            } else {
                wpPreview.style.backgroundImage = '';
                wpPreview.innerHTML = `<span class="cfg-wallpaper-empty">vazio</span>`;
            }
        }
        wpInput.addEventListener('input', () => {
            clearTimeout(wpDebounce);
            wpDebounce = setTimeout(() => {
                cfg.wallpaperUrl = wpInput.value.trim();
                save(cfg);
                applyWallpaper(cfg);
                updateWallpaperPreview();
            }, 350);
        });

        // ═══ Toggles ═══
        root.querySelectorAll('.cfg-switch input[data-key]').forEach(input => {
            input.addEventListener('change', () => {
                const key = input.dataset.key;
                cfg[key] = input.checked;
                save(cfg);
                ctx.toast(input.checked ? 'Ativado' : 'Desativado', 'ok');
            });
        });

        // ═══ Reset geral ═══
        root.querySelector('#cfgReset').addEventListener('click', () => {
            const btn = root.querySelector('#cfgReset');
            if (!btn.dataset.confirm) {
                btn.dataset.confirm = '1';
                btn.textContent = 'Confirmar? Toque de novo';
                btn.classList.add('danger');
                setTimeout(() => {
                    if (btn.dataset.confirm) {
                        delete btn.dataset.confirm;
                        btn.textContent = 'Restaurar configurações padrão';
                        btn.classList.remove('danger');
                    }
                }, 2500);
                return;
            }
            // Confirma
            cfg = { ...DEFAULTS };
            save(cfg);
            applyWallpaper(cfg);
            try { ctx.apps._notify?.(); } catch(_) {}
            ctx.tone.fav();
            ctx.toast('Configurações restauradas', 'ok');
            // Re-render
            root.innerHTML = '';
            renderApp(root, cfg);
        });
    }

    // ═══ CSS ═══
    ctx.appendStyle(`
        /* Wallpaper overlay — atrás de tudo, controlado por --phone-wallpaper */
        .ph-screen::after {
            content: '';
            position: absolute; inset: 0;
            background-image: var(--phone-wallpaper, none);
            background-size: cover;
            background-position: center;
            border-radius: 32px;
            pointer-events: none;
            z-index: 0;
        }

        /* Fullscreen do app: esconde header, tabs, cartão-meu-número e app-bar do shell */
        .ph-screen.cfg-fullscreen .ph-hdr,
        .ph-screen.cfg-fullscreen .ph-me,
        .ph-screen.cfg-fullscreen .ph-tabs,
        .ph-screen.cfg-fullscreen .ph-app-bar {
            display: none !important;
        }
        .ph-screen.cfg-fullscreen .ph-content {
            margin-top: 4px;
        }

        /* ═══ APP ROOT ═══ */
        .cfg-app {
            display: flex; flex-direction: column;
            min-height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #e9ecf5;
        }
        .cfg-app-header {
            position: sticky; top: 0; z-index: 10;
            display: flex; align-items: center; gap: 10px;
            padding: 10px 14px 10px;
            background: linear-gradient(180deg, rgba(16,14,34,.94) 0%, rgba(16,14,34,.86) 70%, rgba(16,14,34,0) 100%);
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        }
        .cfg-back {
            width: 30px; height: 30px; flex-shrink: 0;
            border-radius: 9px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.12);
            color: #a8aec4; cursor: pointer; font-family: inherit; padding: 0;
            display: flex; align-items: center; justify-content: center;
            transition: all .16s cubic-bezier(.22,1,.36,1);
        }
        .cfg-back:hover { background: rgba(255,255,255,.12); color: #fff; transform: translateX(-1px); }
        .cfg-back:active { transform: scale(.94); }
        .cfg-back svg { width: 14px; height: 14px; }

        .cfg-app-title {
            flex: 1; min-width: 0;
            font-size: 13px; font-weight: 800; letter-spacing: .1em;
            background: linear-gradient(100deg, #22d3ee 0%, #a78bfa 50%, #22d3ee 100%);
            background-size: 220% auto;
            -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: phScreenBlink 3.2s ease-in-out infinite;
            text-transform: uppercase;
        }
        .cfg-app-version {
            font-size: 9px; color: #8a90a8; letter-spacing: .06em;
            padding: 3px 7px; border-radius: 6px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.08);
            font-variant-numeric: tabular-nums;
        }

        .cfg-app-body {
            flex: 1; min-height: 0;
            padding: 4px 14px 22px;
            display: flex; flex-direction: column; gap: 14px;
        }
        .cfg-app-foot {
            text-align: center; font-size: 9px; color: #5c6280;
            letter-spacing: .06em; padding: 12px 0 4px;
        }

        /* ═══ HERO ═══ */
        .cfg-hero {
            display: flex; align-items: center; gap: 14px;
            padding: 14px 14px;
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
        .cfg-hero-title {
            font-size: 13px; font-weight: 800; color: #f1f2f8;
            letter-spacing: .01em;
        }
        .cfg-hero-sub {
            font-size: 9.5px; color: #8a90a8;
            margin-top: 3px; line-height: 1.4;
        }

        /* ═══ SECTIONS ═══ */
        .cfg-section {
            display: flex; flex-direction: column; gap: 9px;
            padding: 12px 12px 13px;
            border-radius: 14px;
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

        /* ═══ FIELDS ═══ */
        .cfg-field { display: flex; flex-direction: column; gap: 6px; }
        .cfg-field-label {
            font-size: 9.5px; font-weight: 800; letter-spacing: .06em;
            text-transform: uppercase; color: #a8aec4;
        }
        .cfg-input {
            width: 100%;
            padding: 9px 11px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 9px;
            color: #f1f2f8;
            font-family: inherit; font-size: 11.5px;
            outline: none;
            transition: border-color .18s, box-shadow .18s, background .18s;
            box-sizing: border-box;
        }
        .cfg-input::placeholder { color: #5c6280; }
        .cfg-input:focus {
            border-color: rgba(34,211,238,.6);
            box-shadow: 0 0 0 3px rgba(34,211,238,.14);
            background: rgba(255,255,255,.07);
        }
        .cfg-field-hint {
            font-size: 9px; color: #6b7280; line-height: 1.5;
        }

        .cfg-mini-btn {
            align-self: flex-start;
            padding: 7px 12px;
            border-radius: 8px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.1);
            color: #c7cad6;
            font-family: inherit; font-size: 10px; font-weight: 700;
            letter-spacing: .03em; cursor: pointer;
            transition: all .16s cubic-bezier(.22,1,.36,1);
        }
        .cfg-mini-btn:hover {
            background: rgba(34,211,238,.14);
            color: #67e8f9;
            border-color: rgba(34,211,238,.4);
            transform: translateY(-1px);
        }
        .cfg-mini-btn:active { transform: translateY(0) scale(.96); }

        /* ═══ RADIO GROUP ═══ */
        .cfg-option-row { display: flex; flex-direction: column; gap: 6px; }
        .cfg-option-label {
            font-size: 9.5px; font-weight: 800; letter-spacing: .06em;
            text-transform: uppercase; color: #a8aec4;
        }
        .cfg-radio-group {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 5px;
            background: rgba(0,0,0,.22);
            border: 1px solid rgba(255,255,255,.06);
            border-radius: 10px;
            padding: 3px;
        }
        .cfg-radio {
            padding: 7px 4px;
            border-radius: 7px;
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
        .cfg-wallpaper-row {
            display: flex; gap: 9px; align-items: center;
        }
        .cfg-wallpaper-preview {
            width: 42px; height: 42px; flex-shrink: 0;
            border-radius: 10px;
            background-color: rgba(255,255,255,.03);
            background-size: cover;
            background-position: center;
            border: 1px solid rgba(255,255,255,.1);
            display: flex; align-items: center; justify-content: center;
            overflow: hidden;
        }
        .cfg-wallpaper-empty {
            font-size: 8px; color: #4b5060;
            letter-spacing: .06em; text-transform: uppercase; font-weight: 700;
        }
        .cfg-wallpaper-row .cfg-input { flex: 1; min-width: 0; }

        /* ═══ TOGGLES ═══ */
        .cfg-toggle-row {
            display: flex; align-items: center; gap: 12px;
            padding: 4px 0;
        }
        .cfg-toggle-row + .cfg-toggle-row {
            border-top: 1px dashed rgba(255,255,255,.05);
            padding-top: 9px;
        }
        .cfg-toggle-text { flex: 1; min-width: 0; }
        .cfg-toggle-label { font-size: 11.5px; font-weight: 700; color: #e8eaf4; }
        .cfg-toggle-sub { font-size: 9px; color: #6b7280; margin-top: 2px; line-height: 1.4; }

        .cfg-switch {
            position: relative; display: inline-block;
            width: 36px; height: 20px; flex-shrink: 0;
            cursor: pointer;
        }
        .cfg-switch input {
            opacity: 0; width: 0; height: 0; position: absolute;
        }
        .cfg-switch-track {
            position: absolute; inset: 0;
            border-radius: 20px;
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.12);
            transition: background .24s cubic-bezier(.22,1,.36,1), border-color .24s, box-shadow .24s;
        }
        .cfg-switch-track::before {
            content: ''; position: absolute;
            width: 14px; height: 14px; left: 2px; top: 2px;
            background: #8a90a8;
            border-radius: 50%;
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
        .cfg-switch input:focus-visible + .cfg-switch-track {
            box-shadow: 0 0 0 3px rgba(34,211,238,.25);
        }

        /* ═══ INFO ROWS ═══ */
        .cfg-info-row {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 6px 0;
            font-size: 11px;
        }
        .cfg-info-row + .cfg-info-row {
            border-top: 1px dashed rgba(255,255,255,.05);
        }
        .cfg-info-label { color: #8a90a8; }
        .cfg-info-val { color: #e8eaf4; font-weight: 700; font-variant-numeric: tabular-nums; }
        .cfg-info-val code {
            background: rgba(255,255,255,.06);
            padding: 2px 6px; border-radius: 4px;
            font-family: ui-monospace, 'SF Mono', Menlo, monospace;
            font-size: 9.5px; color: #67e8f9;
            letter-spacing: .02em;
        }

        /* ═══ RESET ═══ */
        .cfg-reset-btn {
            padding: 11px 12px;
            border-radius: 11px;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.1);
            color: #c7cad6;
            font-family: inherit; font-size: 11px; font-weight: 800;
            letter-spacing: .04em; cursor: pointer;
            transition: all .18s cubic-bezier(.22,1,.36,1);
        }
        .cfg-reset-btn:hover {
            background: rgba(255,255,255,.08);
            transform: translateY(-1px);
        }
        .cfg-reset-btn:active { transform: translateY(0) scale(.98); }
        .cfg-reset-btn.danger {
            background: rgba(251,113,133,.14);
            border-color: rgba(251,113,133,.45);
            color: #fca5b1;
            animation: phSpeaking 1.4s ease-in-out infinite;
        }
        .cfg-reset-btn.danger:hover {
            background: rgba(251,113,133,.22);
        }

        @media (prefers-reduced-motion: reduce) {
            .cfg-app-title, .cfg-reset-btn.danger { animation: none !important; }
            .cfg-back, .cfg-mini-btn, .cfg-radio, .cfg-reset-btn { transition-duration: .01ms; }
        }
    `);
})();
