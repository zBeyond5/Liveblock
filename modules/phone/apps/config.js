// modules/phone/apps/config.js
(function() {
    'use strict';
    const ctx = window._phoneCtx;
    if (!ctx) { console.warn('[Phone/config] shell não inicializado.'); return; }
    if (ctx.apps.get('config')) return;

    const LS_KEY = 'sanghub_phone_config';
    const DEFAULTS = { theme: 'aurora', sound: true, previewOnCall: true };

    function load() {
        try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(LS_KEY) || '{}')) }; }
        catch(_) { return { ...DEFAULTS }; }
    }
    function save(cfg) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch(_) {} }

    ctx.apps.register({
        id: 'config',
        name: 'Ajustes',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        accent: '#a78bfa',
        order: 100,

        mount(root, ctx) {
            const cfg = load();
            const esc = ctx.esc;
            root.innerHTML = `
                <div class="cfg-body">
                    <div class="cfg-row">
                        <div class="cfg-label">Tema</div>
                        <select class="cfg-select" data-key="theme">
                            <option value="aurora"${cfg.theme === 'aurora' ? ' selected' : ''}>Aurora</option>
                            <option value="noite"${cfg.theme === 'noite' ? ' selected' : ''}>Noite</option>
                            <option value="claro"${cfg.theme === 'claro' ? ' selected' : ''}>Claro</option>
                        </select>
                    </div>
                    <div class="cfg-row">
                        <div class="cfg-label">Som</div>
                        <input class="cfg-check" type="checkbox" data-key="sound" ${cfg.sound ? 'checked' : ''} />
                    </div>
                    <div class="cfg-row">
                        <div class="cfg-label">Prévia em chamada</div>
                        <input class="cfg-check" type="checkbox" data-key="previewOnCall" ${cfg.previewOnCall ? 'checked' : ''} />
                    </div>
                    <div class="cfg-hint">
                        Este é um app de exemplo. Ele registrou-se via <code>ctx.apps.register()</code>.
                        Persistência fica em <code>localStorage:${esc(LS_KEY)}</code>.
                    </div>
                </div>
            `;
            root.querySelectorAll('[data-key]').forEach(input => {
                input.addEventListener('change', () => {
                    const key = input.dataset.key;
                    cfg[key] = input.type === 'checkbox' ? input.checked : input.value;
                    save(cfg);
                    ctx.toast('Salvo', 'ok');
                });
            });
        },
        unmount() {}
    });

    // Estilo do app
    ctx.appendStyle(`
        .ph-app-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px 8px;
            border-bottom: 1px solid rgba(255,255,255,.06); font-size: 11px; font-weight: 800;
            letter-spacing: .06em; color: #e9ecf5; }
        .ph-app-back { width: 26px; height: 26px; border-radius: 7px; background: transparent;
            border: 1px solid rgba(255,255,255,.12); color: #a8aec4; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-family: inherit; padding: 0; }
        .ph-app-back:hover { background: rgba(255,255,255,.08); color: #fff; }
        .ph-app-back svg { width: 13px; height: 13px; }
        .ph-app-root { flex: 1; min-height: 0; overflow-y: auto; }
        .ph-apps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 16px 14px; }
        .ph-app-item { display: flex; flex-direction: column; align-items: center; gap: 8px;
            padding: 12px 6px; border-radius: 14px; cursor: pointer;
            transition: background .2s, transform .2s, box-shadow .2s; }
        .ph-app-item:hover { background: rgba(255,255,255,.06); transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,.35); }
        .ph-app-item:active { transform: translateY(0) scale(.96); }
        .ph-app-icon { width: 52px; height: 52px; border-radius: 16px;
            background: linear-gradient(135deg, rgba(34,211,238,.18), rgba(167,139,250,.18));
            border: 1px solid rgba(255,255,255,.1);
            display: flex; align-items: center; justify-content: center;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .ph-app-icon svg { width: 26px; height: 26px; }
        .ph-app-name { font-size: 10.5px; font-weight: 700; color: #e8eaf4; text-align: center; }
        .cfg-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
        .cfg-row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 10px 12px; border-radius: 10px;
            background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); }
        .cfg-label { font-size: 11.5px; font-weight: 700; color: #e8eaf4; }
        .cfg-select { padding: 6px 10px; border-radius: 8px;
            background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
            color: #f1f2f8; font-family: inherit; font-size: 11px; }
        .cfg-check { width: 16px; height: 16px; accent-color: #22d3ee; cursor: pointer; }
        .cfg-hint { font-size: 9.5px; color: #8a90a8; line-height: 1.55; margin-top: 8px;
            padding: 10px 12px; border-radius: 10px;
            background: rgba(34,211,238,.05); border: 1px solid rgba(34,211,238,.15); }
        .cfg-hint code { background: rgba(255,255,255,.06); padding: 1px 5px; border-radius: 4px;
            font-family: ui-monospace, monospace; font-size: 9px; color: #67e8f9; }
    `);
})();
