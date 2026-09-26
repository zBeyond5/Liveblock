// modules/phone/shell.js
(function() {
    'use strict';
    const UID = '_phone';
    if (window[UID]) return;

    const bridge = window._hubBridge;
    if (!bridge || !bridge.rtdb) { console.warn('[Phone] _hubBridge.rtdb ausente.'); return; }
    if (!bridge.firestore || !bridge.firestore.configured || !bridge.firestore.configured()) { console.warn('[Phone] Firestore off.'); return; }

    // ═══ CONFIG ═══
    const ANDROID_VERSION = '14';
    const PHONE_VERSION = '1.4.0';
    const MIN_TUCK_X = 260;
    const MIN_TUCK_Y = -140;
    const FRAME_HALF_H = 285;
    const LS_MINIMIZED = 'sanghub_phone_minimized';
    const LS_PIN = 'sanghub_phone_pin';
    const LS_LAYOUT = 'sanghub_phone_layout';
    const LS_HOME_CFG = 'sanghub_phone_home_cfg';
    const MODULES_BASE = 'https://cdn.jsdelivr.net/gh/zBeyond5/Liveblock@main/modules/phone';
    const MAX_DOCK_APPS = 4;
    const GRID_COLS = 4;
    const GRID_ROWS = 4;
    const PAGE_SIZE = GRID_COLS * GRID_ROWS;
    const DEFAULT_APP_BG = 'linear-gradient(180deg, #16181c 0%, #0d0f12 100%)';
    const DEFAULT_APP_BG_SOLID = '#0f1115';

    // ═══ CTX ═══
    const ctx = window._phoneCtx = window._phoneCtx || {};
    ctx.moduleBase = MODULES_BASE;
    ctx.phase = 'idle';
    ctx.myNumber = null;
    ctx.deviceId = bridge.deviceId || '';
    ctx.bridge = bridge;
    ctx.contacts = ctx.contacts || {};
    ctx.calls = ctx.calls || {};
    ctx.notes = ctx.notes || {};

    // ═══ UTILS ═══
    function el(tag, attrs, ...children) {
        const n = document.createElement(tag);
        if (attrs) for (const k in attrs) {
            if (k === 'class') n.className = attrs[k];
            else if (k === 'html') n.innerHTML = attrs[k];
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
            else n.setAttribute(k, attrs[k]);
        }
        children.flat().forEach(c => { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return n;
    }
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    ctx.el = el;
    ctx.esc = esc;

    // ═══ AUDIO ═══
    let _actx = null;
    function _ctx() {
        if (_actx) return _actx;
        try { _actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { _actx = null; }
        return _actx;
    }
    ctx.getAudioCtx = _ctx;
    function _tone(freq, dur, type, peak, attack) {
        const c = _ctx();
        if (!c) return;
        if (c.state === 'suspended') c.resume().catch(() => {});
        const now = c.currentTime;
        const osc = c.createOscillator();
        const lp = c.createBiquadFilter();
        const gain = c.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(Math.min(freq * 2.6, 3200), now);
        lp.Q.setValueAtTime(0.6, now);
        const a = attack != null ? attack : 0.02;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak || 0.04, now + a);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(lp).connect(gain).connect(c.destination);
        osc.start(now);
        osc.stop(now + dur + 0.03);
    }
    ctx.tone = {
        raw: _tone,
        ringback() { _tone(425, 1.0, 'sine', 0.045, 0.03); },
        ring() {
            const c = _ctx();
            if (!c) return;
            if (c.state === 'suspended') c.resume().catch(() => {});
            const now = c.currentTime;
            [425, 480].forEach(f => {
                const osc = c.createOscillator(); const gain = c.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(f, now);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.035, now + 0.03);
                gain.gain.setValueAtTime(0.035, now + 0.72);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
                osc.connect(gain).connect(c.destination);
                osc.start(now); osc.stop(now + 0.83);
            });
        },
        busy() { _tone(425, 0.25, 'sine', 0.05, 0.015); },
        hangup() { _tone(320, 0.14, 'sine', 0.04, 0.006); setTimeout(() => _tone(240, 0.16, 'sine', 0.03, 0.008), 90); },
        dial() { _tone(425, 0.08, 'sine', 0.035, 0.01); },
        key() { _tone(880, 0.035, 'sine', 0.02, 0.006); },
        pickup() { _tone(659.25, 0.09, 'sine', 0.03, 0.012); setTimeout(() => _tone(987.77, 0.13, 'sine', 0.025, 0.014), 70); },
        notify() { _tone(880, 0.06, 'sine', 0.03, 0.01); setTimeout(() => _tone(1174.66, 0.09, 'sine', 0.025, 0.012), 55); },
        join() { _tone(783.99, 0.07, 'sine', 0.028, 0.01); setTimeout(() => _tone(1046.5, 0.09, 'sine', 0.022, 0.012), 60); },
        tuck() { _tone(660, 0.09, 'sine', 0.018, 0.012); setTimeout(() => _tone(440, 0.12, 'sine', 0.014, 0.014), 60); },
        pull() { _tone(660, 0.08, 'sine', 0.02, 0.01); setTimeout(() => _tone(880, 0.1, 'sine', 0.018, 0.012), 70); setTimeout(() => _tone(1174.66, 0.12, 'sine', 0.014, 0.014), 150); },
        recStart() { _tone(587.33, 0.06, 'sine', 0.024, 0.008); setTimeout(() => _tone(880, 0.06, 'sine', 0.02, 0.01), 55); },
        recSend() { _tone(1046.5, 0.07, 'sine', 0.024, 0.008); setTimeout(() => _tone(1318.51, 0.09, 'sine', 0.02, 0.01), 55); },
        recCancel() { _tone(392, 0.08, 'sine', 0.022, 0.01); setTimeout(() => _tone(261.63, 0.1, 'sine', 0.018, 0.012), 60); },
        block() { _tone(220, 0.12, 'sine', 0.026, 0.008); setTimeout(() => _tone(174.61, 0.13, 'sine', 0.02, 0.01), 80); },
        fav() { _tone(1318.51, 0.06, 'sine', 0.02, 0.006); setTimeout(() => _tone(1760, 0.08, 'sine', 0.016, 0.008), 55); },
        unlock() { _tone(659.25, 0.08, 'sine', 0.026, 0.012); setTimeout(() => _tone(987.77, 0.11, 'sine', 0.022, 0.014), 60); },
        errorPin() { _tone(220, 0.1, 'sine', 0.03, 0.008); setTimeout(() => _tone(180, 0.14, 'sine', 0.024, 0.01), 70); },
        home() { _tone(523.25, 0.05, 'sine', 0.02, 0.008); }
    };

    // ═══ ICONS ═══
    ctx.I = {
        phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
        phoneDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(135deg)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
        micOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="21" y2="21"/><path d="M12 1a3 3 0 0 0-3 3v5"/><path d="M15 9v3a3 3 0 0 1-4.29 2.71"/><path d="M19 10v2a7 7 0 0 1-1.32 4.13"/><path d="M5 10v2a7 7 0 0 0 3 5.71"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`,
        mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
        off: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
        backspace: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>`,
        clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
        save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
        plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        arrowIn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(135deg)"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
        arrowOut: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(-45deg)"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
        star: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>`,
        starOutline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>`,
        block: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
        note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`,
        apps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
        back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
        gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>`,
        unlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0"/></svg>`,
        search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>`,
        wifi: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5 12.5a10 10 0 0 1 14 0l-1.5 1.5a8 8 0 0 0-11 0L5 12.5zm-3.5-3.5a15 15 0 0 1 21 0l-1.5 1.5a13 13 0 0 0-18 0L1.5 9z"/></svg>`
    };

    // ═══ TOAST ═══
    function _toast(msg, kind) {
        if (!_screenEl) return;
        const t = el('div', { class: 'ph-toast' + (kind ? ' ' + kind : '') }, msg);
        _screenEl.appendChild(t);
        setTimeout(() => t.classList.add('out'), 1800);
        setTimeout(() => t.remove(), 2100);
    }
    ctx.toast = _toast;

    // ═══ APPS REGISTRY ═══
    ctx.apps = ctx.apps || {
        _registry: [],
        _listeners: [],
        register(app) {
            if (!app || !app.id || !app.mount) return false;
            if (this._registry.find(a => a.id === app.id)) return false;
            this._registry.push(app);
            this._registry.sort((a, b) => (a.order || 100) - (b.order || 100));
            this._notify();
            return true;
        },
        get(id) { return this._registry.find(a => a.id === id) || null; },
        all() { return this._registry.slice(); },
        onChange(fn) { if (typeof fn === 'function') this._listeners.push(fn); },
        _notify() { this._listeners.forEach(f => { try { f(); } catch(_) {} }); },
        open(id) { _openApp(id); }
    };

    // ═══ STATE ═══
    let _dying = false;
    let _minimized = false;
    try { _minimized = localStorage.getItem(LS_MINIMIZED) === '1'; } catch(_) {}
    let _view = 'lock';
    let _activeAppId = null;
    let _chamadasTab = 'contatos';
    let _pinBuf = '';
    let _pinSet = '';
    try { _pinSet = localStorage.getItem(LS_PIN) || ''; } catch(_) {}
    let _prevView = 'home';
    let _currentPage = 0;

    // ═══ LAYOUT (pages[pageIndex][slot] = appId | null) ═══
    let _layout = {
        pages: [new Array(PAGE_SIZE).fill(null)],
        dock: []
    };
    let _layoutInitialized = false;

    (function _loadLayout() {
        try {
            const raw = localStorage.getItem(LS_LAYOUT);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return;

            if (Array.isArray(p.pages) && p.pages.length) {
                _layout.pages = p.pages.map(pg => {
                    const a = new Array(PAGE_SIZE).fill(null);
                    if (Array.isArray(pg)) pg.forEach((id, i) => { if (i < PAGE_SIZE && id) a[i] = id; });
                    return a;
                });
                _layoutInitialized = true;
            }
            else if (Array.isArray(p.grid)) {
                _layout.pages = [new Array(PAGE_SIZE).fill(null)];
                p.grid.forEach((id, i) => {
                    if (!id) return;
                    const page = Math.floor(i / PAGE_SIZE);
                    while (_layout.pages.length <= page) _layout.pages.push(new Array(PAGE_SIZE).fill(null));
                    _layout.pages[page][i % PAGE_SIZE] = id;
                });
                _layoutInitialized = true;
                _saveLayout();
            }

            if (Array.isArray(p.dock)) _layout.dock = p.dock.slice(0, MAX_DOCK_APPS);
        } catch(_) {}
    })();

    function _saveLayout() {
        try { localStorage.setItem(LS_LAYOUT, JSON.stringify(_layout)); } catch(_) {}
    }

    // ═══ HOME CONFIG ═══
    let _homeCfg = {
        clockX: 0, clockY: 0,
        searchX: 0, searchY: 0,
        showClock: true,
        showSearch: true,
        iconSize: 'normal',   // small | normal | large
        gridGap: 'normal'     // tight | normal | wide
    };
    (function _loadHomeCfg() {
        try {
            const raw = localStorage.getItem(LS_HOME_CFG);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (p && typeof p === 'object') Object.assign(_homeCfg, p);
        } catch(_) {}
    })();
    function _saveHomeCfg() {
        try { localStorage.setItem(LS_HOME_CFG, JSON.stringify(_homeCfg)); } catch(_) {}
    }
    function _applyHomeCfg() {
        const home = _frameEl?.querySelector('.ph-home');
        if (!home) return;
        home.dataset.iconSize = _homeCfg.iconSize;
        home.dataset.gridGap  = _homeCfg.gridGap;
    }

    let _dragSrc = null;
    let _suppressClick = false;
    let _dragPageTimer = null;

    let _host = null, _shadow = null, _root = null;
    let _frameEl = null;
    let _screenEl = null;
    let _stageEl = null;
    let _contentEl = null;
    let _clockTimer = null;
    let _phasePollTimer = null;

    // ═══ HOST ═══
    function _ensureHost() {
        if (_host && _shadow) return;
        _host = document.createElement('div');
        _host.id = '_phone_host';
        _host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483646;pointer-events:none;';
        document.documentElement.appendChild(_host);
        _shadow = _host.attachShadow({ mode: 'open' });
        _root = document.createElement('div');
        _root.setAttribute('data-hub', '1');
        _root.setAttribute('data-sang-ui', '');
        _shadow.appendChild(_root);
        try { window._hubUI?.markProtected?.(_host); } catch(e) {}
        ctx.root = _root;
        ['keydown','input','beforeinput','keyup'].forEach(ev => { _root.addEventListener(ev, e => e.stopPropagation()); });
    }
    function _appendStyle(css) {
        const s = document.createElement('style');
        s.textContent = css;
        _shadow.appendChild(s);
    }
    ctx.appendStyle = _appendStyle;

    // ═══ STYLE ═══
    function _injectBaseStyle() {
        _appendStyle(`
        :host, * { box-sizing: border-box; }

        @keyframes phFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes phScreenBlink { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes phPulseDot { 0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,.55)} 50%{box-shadow:0 0 0 6px rgba(52,211,153,0)} }
        @keyframes phKeyPress { 0%{transform:scale(1)} 40%{transform:scale(.9)} 100%{transform:scale(1)} }
        @keyframes phToastIn { from{opacity:0;transform:translateY(-8px) scale(.94)} to{opacity:1;transform:none} }
        @keyframes phRingGlow {
            0%, 100% { box-shadow: 0 30px 80px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.03), inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.7), 0 0 0 0 rgba(52,211,153,.5); }
            50% { box-shadow: 0 30px 80px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.03), inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.7), 0 0 0 12px rgba(52,211,153,0); }
        }
        @keyframes phRecordPulse {
            0%,100% { box-shadow: 0 30px 80px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.03), inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.7), 0 0 0 0 rgba(251,113,133,.55); }
            50% { box-shadow: 0 30px 80px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.03), inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.7), 0 0 0 14px rgba(251,113,133,0); }
        }
        @keyframes phPinShake { 10%,90%{transform:translateX(-3px)} 20%,80%{transform:translateX(4px)} 30%,50%,70%{transform:translateX(-6px)} 40%,60%{transform:translateX(6px)} }
        @keyframes phSwipeHint { 0%,100%{transform:translateY(0);opacity:.55} 50%{transform:translateY(-6px);opacity:.9} }
        @keyframes phStageFadeIn { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes phSpeaking { 0%,100%{opacity:1} 50%{opacity:.55} }

        .ph-frame {
            position: fixed; top: 50%; right: 24px;
            margin-top: ${-FRAME_HALF_H}px;
            width: 280px; height: 570px;
            transform-origin: 100% 50%;
            transform: translate(0, 0) rotate(0deg);
            transition: transform 1.05s cubic-bezier(.7, 0, .3, 1);
            pointer-events: auto;
            border-radius: 44px;
            padding: 9px;
            background:
                linear-gradient(155deg, #3a3a3f 0%, #2b2b30 22%, #1c1c20 55%, #131316 100%);
            box-shadow:
                0 26px 60px rgba(0,0,0,.72),
                0 8px 20px rgba(0,0,0,.55),
                inset 0 1px 1px rgba(255,255,255,.22),
                inset 0 -1px 1px rgba(0,0,0,.85),
                inset 1px 0 0 rgba(255,255,255,.06),
                inset -1px 0 0 rgba(0,0,0,.5),
                0 0 0 1px rgba(0,0,0,.85);
            user-select: none;
            isolation: isolate;
            will-change: transform;
            animation: phFadeIn .35s ease;
        }
        .ph-frame::before {
            content: '';
            position: absolute; inset: 7px;
            border-radius: 38px;
            pointer-events: none;
            background: transparent;
            box-shadow:
                inset 0 0 0 1px rgba(0,0,0,.9),
                inset 0 0 0 2px rgba(255,255,255,.02);
            z-index: 2;
        }
        .ph-frame::after {
            content: '';
            position: absolute; inset: 0;
            border-radius: inherit;
            pointer-events: none;
            background:
                radial-gradient(140% 90% at 8% 4%, rgba(255,255,255,.14), transparent 42%),
                radial-gradient(120% 90% at 100% 100%, rgba(0,0,0,.5), transparent 55%);
            z-index: 1;
            mix-blend-mode: overlay;
            opacity: .9;
        }
        .ph-frame.min {
            transform: translate(${MIN_TUCK_X}px, ${MIN_TUCK_Y}px) rotate(-90deg);
            box-shadow:
                0 0 24px rgba(0,0,0,.55),
                0 0 0 1px rgba(0,0,0,.85),
                inset 0 1px 1px rgba(255,255,255,.16),
                inset 0 -1px 1px rgba(0,0,0,.7);
        }
        .ph-frame.ringing:not(.min) { animation: phRingGlow 1.6s ease-in-out infinite; }
        .ph-frame.recording:not(.min) { animation: phRecordPulse 1.4s ease-in-out infinite; }
        .ph-frame.hidden { opacity: 0; pointer-events: none; }
        .ph-frame.min::after {
            content: ''; position: absolute; top: 14px; bottom: 14px; left: 0; width: 10px;
            border-radius: 42px 0 0 42px;
            background: linear-gradient(90deg, rgba(52,211,153,.25), transparent);
            animation: phSwipeHint 3.2s ease-in-out infinite;
            pointer-events: none;
            mix-blend-mode: normal;
            opacity: 1;
            z-index: 4;
        }

        .ph-side {
            position: absolute; right: -2px; width: 3px;
            border-radius: 2px;
            background: linear-gradient(90deg, #2f2f34 0%, #4a4a52 40%, #2a2a2e 100%);
            box-shadow:
                inset 0 0 0 1px rgba(0,0,0,.7),
                1px 0 3px rgba(0,0,0,.5);
            z-index: 3;
        }
        .ph-side.vol1 { top: 118px; height: 42px; border-radius: 2px 2px 1px 1px; }
        .ph-side.vol2 { top: 168px; height: 42px; border-radius: 2px 2px 1px 1px; }
        .ph-side.pwr  {
            top: 128px; right: auto; left: -2px; height: 62px;
            border-radius: 1px 2px 2px 1px;
            background: linear-gradient(90deg, #2a2a2e 0%, #4a4a52 60%, #2f2f34 100%);
            box-shadow:
                inset 0 0 0 1px rgba(0,0,0,.7),
                -1px 0 3px rgba(0,0,0,.5);
        }

        .ph-notch {
            position: absolute; top: 9px; left: 50%; transform: translateX(-50%);
            width: 88px; height: 22px;
            border-radius: 0 0 16px 16px;
            background: #030408;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            z-index: 40; pointer-events: auto; cursor: pointer;
            transition: background .2s, transform .15s;
            box-shadow:
                inset 0 -1px 0 rgba(255,255,255,.06),
                inset 0 1px 2px rgba(0,0,0,.9),
                0 1px 0 rgba(255,255,255,.03);
        }
        .ph-notch:hover { background: #0a0c14; }
        .ph-notch:active { transform: translateX(-50%) scale(.94); }
        .ph-notch::before {
            content: ''; width: 44px; height: 4px; border-radius: 2px;
            background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01));
            box-shadow: inset 0 1px 1px rgba(0,0,0,.9);
        }
        .ph-notch::after {
            content: ''; width: 6px; height: 6px; border-radius: 50%;
            background:
                radial-gradient(circle at 35% 30%, #1a1c26 0%, #05060a 70%);
            box-shadow:
                inset 0 0 3px rgba(80,160,220,.5),
                0 0 2px rgba(80,160,220,.3);
        }

        .ph-screen {
            position: relative; width: 100%; height: 100%;
            border-radius: 36px; overflow: hidden;
            background:
                radial-gradient(circle at 15% 10%, rgba(52,211,153,.22), transparent 52%),
                radial-gradient(circle at 88% 88%, rgba(16,185,129,.25), transparent 55%),
                radial-gradient(circle at 50% 55%, rgba(52,211,153,.10), transparent 65%),
                linear-gradient(175deg, #1e3028 0%, #16241e 45%, #0c1a14 100%);
            display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #e9ecf5;
            box-shadow:
                inset 0 0 30px rgba(0,0,0,.55),
                inset 0 0 0 1px rgba(0,0,0,.95),
                inset 0 1px 0 rgba(255,255,255,.05),
                0 0 0 1px rgba(255,255,255,.03);
            transition: background .3s ease;
        }

        .ph-screen.app-active {
            background: var(--active-app-bg-solid, ${DEFAULT_APP_BG_SOLID});
        }
        .ph-screen.app-active .ph-wallpaper { opacity: 0; }
        .ph-screen.app-active .ph-status {
            background: var(--active-app-bg-solid, ${DEFAULT_APP_BG_SOLID});
            border-bottom: 1px solid rgba(255,255,255,.03);
        }
        .ph-screen.app-active .ph-home-bar {
            background: var(--active-app-bg-solid, ${DEFAULT_APP_BG_SOLID});
        }

        .ph-wallpaper {
            position: absolute; inset: 0; z-index: 0;
            background-image: var(--phone-wallpaper, none);
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            border-radius: 36px;
            pointer-events: none;
            transition: opacity .25s ease;
        }
        .ph-screen::before {
            content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1;
            background:
                linear-gradient(155deg,
                    rgba(255,255,255,.08) 0%,
                    rgba(255,255,255,.02) 12%,
                    transparent 32%);
            border-radius: 36px;
        }
        .ph-screen::after {
            content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 4;
            border-radius: 36px;
            background:
                radial-gradient(120% 90% at 50% 50%, transparent 60%, rgba(0,0,0,.35) 100%);
            mix-blend-mode: multiply;
            opacity: .85;
        }

        .ph-status {
            padding: 10px 22px 6px;
            display: flex; align-items: center; justify-content: space-between;
            font-size: 10px; color: #c2c8dc; flex-shrink: 0;
            position: relative; z-index: 6;
            background: linear-gradient(180deg, rgba(8,20,14,.72) 0%, rgba(8,20,14,.35) 60%, rgba(8,20,14,0) 100%);
            text-shadow: 0 1px 2px rgba(0,0,0,.6);
            transition: background .3s ease;
        }
        .ph-status-time { font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
        .ph-status-icons { display: flex; align-items: center; gap: 5px; font-size: 9px; }
        .ph-status-icons .sig { display: inline-flex; gap: 1px; align-items: flex-end; height: 8px; }
        .ph-status-icons .sig i { display: inline-block; width: 2px; background: currentColor; border-radius: 1px; }
        .ph-status-icons .sig i:nth-child(1){ height: 3px; opacity: .5; }
        .ph-status-icons .sig i:nth-child(2){ height: 5px; opacity: .7; }
        .ph-status-icons .sig i:nth-child(3){ height: 7px; }
        .ph-status-icons .sig i:nth-child(4){ height: 9px; }
        .ph-status-icons .wifi svg { width: 10px; height: 10px; }
        .ph-status-icons .dot-notif {
            width: 5px; height: 5px; border-radius: 50%; background: #fb7185;
            box-shadow: 0 0 6px rgba(251,113,133,.85);
            animation: phPulseDot 1.8s ease-in-out infinite;
            display: none;
        }
        .ph-status-icons .dot-notif.on { display: inline-block; }

        .ph-stage {
            flex: 1; min-height: 0; position: relative; z-index: 3;
            display: flex; flex-direction: column;
        }
        .ph-view {
            position: absolute; inset: 0;
            display: none; flex-direction: column; min-height: 0;
        }
        .ph-view.active { display: flex; animation: phStageFadeIn .32s cubic-bezier(.22,1,.36,1); }

        .ph-view-app { background: var(--app-bg, ${DEFAULT_APP_BG}); }
        .ph-view-call { background: linear-gradient(175deg, #12241d 0%, #08140f 100%); }

        .ph-lock {
            flex: 1; min-height: 0;
            display: flex; flex-direction: column;
            padding: 12px 20px 16px;
        }
        .ph-lock-clock { padding-top: 30px; text-align: center; }
        .ph-lock-time {
            font-size: 60px; font-weight: 800; letter-spacing: -.035em;
            color: #f6f7fb; line-height: 1;
            font-variant-numeric: tabular-nums;
            text-shadow: 0 4px 24px rgba(0,0,0,.55), 0 0 40px rgba(52,211,153,.18);
        }
        .ph-lock-date {
            font-size: 12px; color: #c2c8dc; margin-top: 6px;
            letter-spacing: .02em; font-weight: 600;
            text-transform: capitalize;
            text-shadow: 0 1px 3px rgba(0,0,0,.5);
        }
        .ph-lock-mid { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
        .ph-lock-swipe {
            display: flex; flex-direction: column; align-items: center; gap: 8px;
            color: #c8d6cc; cursor: pointer; user-select: none;
            padding: 14px 22px; border-radius: 14px;
            background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02));
            border: 1px solid rgba(255,255,255,.1);
            box-shadow: 0 6px 20px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08);
            transition: background .2s, border-color .2s, transform .15s;
        }
        .ph-lock-swipe:hover { background: linear-gradient(180deg, rgba(52,211,153,.14), rgba(52,211,153,.05)); border-color: rgba(52,211,153,.4); }
        .ph-lock-swipe:active { transform: scale(.96); }
        .ph-lock-swipe-icon { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
            animation: phSwipeHint 2.6s ease-in-out infinite; }
        .ph-lock-swipe-icon svg { width: 26px; height: 26px; }
        .ph-lock-swipe-text { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }

        .ph-lock-pin-wrap {
            display: flex; flex-direction: column; align-items: center; gap: 14px;
            width: 100%; max-width: 220px;
        }
        .ph-lock-pin-dots { display: flex; gap: 14px; justify-content: center; padding: 6px 0; }
        .ph-lock-pin-dot {
            width: 12px; height: 12px; border-radius: 50%;
            background: transparent; border: 2px solid rgba(255,255,255,.35);
            transition: background .15s, border-color .15s, transform .15s;
        }
        .ph-lock-pin-dot.filled {
            background: #6ee7b7; border-color: #6ee7b7;
            box-shadow: 0 0 12px rgba(52,211,153,.75);
            transform: scale(1.1);
        }
        .ph-lock-pin-label {
            font-size: 10.5px; color: #c2c8dc; letter-spacing: .06em;
            text-transform: uppercase; font-weight: 700;
        }
        .ph-lock-pin.shake .ph-lock-pin-dots { animation: phPinShake .5s cubic-bezier(.36,.07,.19,.97); }

        .ph-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .ph-key {
            padding: 12px 0 10px; border-radius: 14px;
            background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.03));
            border: 1px solid rgba(255,255,255,.1);
            color: #e5e7eb; font-family: inherit;
            font-size: 19px; font-weight: 700;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            cursor: pointer; user-select: none;
            transition: background .12s, border-color .12s, transform .12s, box-shadow .12s;
            line-height: 1;
            box-shadow:
                inset 0 1px 0 rgba(255,255,255,.1),
                0 2px 6px rgba(0,0,0,.28);
        }
        .ph-key .sub { font-size: 7.5px; color: #7b8296; letter-spacing: .06em; margin-top: 3px; font-weight: 800; text-transform: uppercase; }
        .ph-key:hover { background: linear-gradient(180deg, rgba(52,211,153,.16), rgba(52,211,153,.06)); border-color: rgba(52,211,153,.4); }
        .ph-key:active { transform: scale(.94); background: linear-gradient(180deg, rgba(52,211,153,.28), rgba(52,211,153,.12)); box-shadow: inset 0 1px 0 rgba(255,255,255,.12); }
        .ph-key.pressed { animation: phKeyPress .25s cubic-bezier(.22,1,.36,1); }
        .ph-key.util { color: #8890a4; font-size: 15px; }
        .ph-key.util:hover { color: #6ee7b7; }
        .ph-key.util svg { width: 16px; height: 16px; }
        .ph-key.util.ok { color: #a7f3d0; }
        .ph-key.util.ok:hover { color: #fff; background: rgba(52,211,153,.2); }

        .ph-home {
            flex: 1; min-height: 0;
            display: flex; flex-direction: column;
            padding: 10px 14px 0;
        }
        .ph-home-clock { padding: 4px 6px 8px; flex-shrink: 0; }
        .ph-home-time {
            font-size: 56px; font-weight: 800; letter-spacing: -.04em; color: #f6f7fb; line-height: 1;
            font-variant-numeric: tabular-nums;
            text-shadow: 0 2px 14px rgba(0,0,0,.5);
        }
        .ph-home-date {
            font-size: 11px; color: #a8aec4; letter-spacing: .02em; margin-top: 3px;
            text-transform: capitalize; font-weight: 600;
            text-shadow: 0 1px 2px rgba(0,0,0,.4);
        }

        .ph-home-search {
            display: flex; align-items: center; gap: 8px;
            padding: 7px 14px; border-radius: 22px;
            background: linear-gradient(120deg, #10a37f, #16c596);
            color: #fff; margin-bottom: 12px;
            font-size: 11px; font-weight: 700; letter-spacing: .02em;
            box-shadow: 0 6px 18px rgba(16,163,127,.4), inset 0 1px 0 rgba(255,255,255,.28);
            cursor: text;
            flex-shrink: 0;
        }
        .ph-home-search svg { width: 12px; height: 12px; margin-left: auto; opacity: .9; }
        .ph-home-search input {
            flex: 1; background: transparent; border: none; outline: none;
            color: #fff; font-family: inherit; font-size: 11px; font-weight: 700;
            padding: 0;
        }
        .ph-home-search input::placeholder { color: rgba(255,255,255,.75); }

        /* ═══ MULTI-PAGE WRAPPER ═══ */
        .ph-home-pages-wrap {
            flex: 1; min-height: 0;
            margin: 0 -14px;
            overflow: hidden;
            position: relative;
            touch-action: pan-y;
        }
        .ph-home-pages {
            display: flex;
            height: 100%;
            transition: transform .32s cubic-bezier(.22,1,.36,1);
            will-change: transform;
        }
        .ph-home-page {
            flex: 0 0 100%;
            min-width: 100%;
            height: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 0 14px 12px;
            box-sizing: border-box;
            -webkit-overflow-scrolling: touch;
        }
        .ph-home-page::-webkit-scrollbar { width: 4px; }
        .ph-home-page::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }

        /* ═══ GRID 4×4 ═══ */
        .ph-home-grid {
            display: grid;
            grid-template-columns: repeat(${GRID_COLS}, 1fr);
            grid-auto-rows: minmax(72px, auto);
            gap: 6px 4px;
        }
        .ph-home-slot {
            position: relative;
            border-radius: 12px;
            border: 1px dashed rgba(255,255,255,0);
            background: transparent;
            transition: border-color .16s, background .16s;
            min-height: 72px;
        }
        .ph-home-slot.drag-over {
            border-color: rgba(110,231,183,.6);
            background: rgba(52,211,153,.1);
        }
        .ph-home-slot.drag-over::after {
            content: ''; position: absolute; inset: 6px;
            border-radius: 10px;
            background: rgba(52,211,153,.06);
        }

        .ph-home-app {
            position: relative;
            display: flex; flex-direction: column; align-items: center; gap: 4px;
            padding: 6px 2px 4px; border-radius: 12px;
            background: transparent; border: none;
            cursor: pointer; font-family: inherit;
            color: inherit; text-align: center;
            transition: background .18s, transform .15s, opacity .15s;
            -webkit-tap-highlight-color: transparent;
            min-height: 72px;
            justify-content: flex-start;
        }
        .ph-home-app:hover { background: rgba(255,255,255,.08); }
        .ph-home-app:active { transform: scale(.94); }
        .ph-home-app[draggable="true"] { cursor: grab; }
        .ph-home-app.dragging { opacity: .3; cursor: grabbing; }
        .ph-home-app.drop-before::before,
        .ph-home-app.drop-after::after {
            content: ''; position: absolute; top: 4px; bottom: 4px; width: 2px;
            background: #6ee7b7; border-radius: 2px;
            box-shadow: 0 0 8px rgba(52,211,153,.8);
            pointer-events: none;
            z-index: 2;
        }
        .ph-home-app.drop-before::before { left: -2px; }
        .ph-home-app.drop-after::after { right: -2px; }
        .ph-home-app-icon {
            width: 42px; height: 42px; border-radius: 13px;
            display: inline-flex; align-items: center; justify-content: center;
            background: rgba(255,255,255,.1);
            border: 1px solid rgba(255,255,255,.14);
            box-shadow: 0 6px 16px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.16);
            position: relative;
            flex-shrink: 0;
        }
        .ph-home-app-icon svg { width: 22px; height: 22px; }
        .ph-home-app-name {
            font-size: 9px; font-weight: 700; color: #dfe3ef;
            max-width: 100%; overflow: hidden; text-overflow: ellipsis;
            white-space: nowrap; letter-spacing: .01em;
            text-shadow: 0 1px 2px rgba(0,0,0,.6);
        }
        .ph-home-empty {
            grid-column: 1 / -1;
            padding: 24px 10px; text-align: center;
            font-size: 10.5px; color: #6b7280; line-height: 1.5;
        }

        .ph-home-dots { display: flex; gap: 5px; justify-content: center; padding: 6px 0 8px; flex-shrink: 0; }
        .ph-home-dots span {
            width: 5px; height: 5px; border-radius: 50%;
            background: rgba(255,255,255,.32);
            cursor: pointer;
            transition: background .2s, transform .2s;
        }
        .ph-home-dots span.active { background: #6ee7b7; box-shadow: 0 0 6px rgba(52,211,153,.8); transform: scale(1.15); }

        .ph-dock {
            flex-shrink: 0;
            margin: 0 -6px;
            padding: 8px 10px 4px;
            border-radius: 18px;
            background: linear-gradient(180deg, rgba(52,211,153,.14), rgba(52,211,153,.05));
            backdrop-filter: blur(16px) saturate(150%);
            -webkit-backdrop-filter: blur(16px) saturate(150%);
            border: 1px solid rgba(52,211,153,.22);
            box-shadow: 0 8px 24px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08);
            display: grid;
            grid-template-columns: repeat(${MAX_DOCK_APPS}, 1fr);
            gap: 4px;
            margin-bottom: 8px;
            min-height: 56px;
        }
        .ph-dock .ph-home-app { padding: 4px 2px; min-height: 0; }
        .ph-dock .ph-home-app-icon { width: 38px; height: 38px; border-radius: 12px; }
        .ph-dock .ph-home-app-icon svg { width: 20px; height: 20px; }
        .ph-dock .ph-home-app-name { display: none; }

        .ph-dock-slot {
            border-radius: 12px;
            border: 1px dashed rgba(255,255,255,0);
            background: transparent;
            transition: border-color .16s, background .16s;
            min-height: 56px;
        }
        .ph-dock-slot.drag-over {
            border-color: rgba(110,231,183,.6);
            background: rgba(52,211,153,.1);
        }

        /* ═══ APP BAR ═══ */
        .ph-app-bar {
            display: flex; align-items: center; gap: 8px;
            padding: 9px 12px; margin: 0 12px 8px;
            border-radius: 11px;
            background: linear-gradient(180deg, #16382c 0%, #0f2820 100%);
            border: 1px solid rgba(52,211,153,.34);
            box-shadow:
                inset 0 1px 0 rgba(110,231,183,.16),
                inset 0 -1px 0 rgba(0,0,0,.4),
                0 6px 16px rgba(0,0,0,.4);
            flex-shrink: 0;
        }
        .ph-app-bar > span.ph-app-title {
            font-size: 12px; font-weight: 800; color: #d1fae5;
            letter-spacing: .02em; text-shadow: 0 1px 2px rgba(0,0,0,.5);
            flex: 1;
        }
        .ph-app-back {
            width: 26px; height: 26px; border-radius: 7px;
            background: transparent; border: none;
            color: #6ee7b7; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center;
            transition: color .15s, background .15s;
            flex-shrink: 0;
        }
        .ph-app-back:hover { color: #a7f3d0; background: rgba(52,211,153,.2); }
        .ph-app-back svg { width: 14px; height: 14px; }

        /* ═══ NUMBER PILL (my number no app-bar) ═══ */
        .ph-app-num {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 4px 9px;
            border-radius: 9px;
            background: rgba(52,211,153,.16);
            border: 1px solid rgba(52,211,153,.34);
            color: #a7f3d0;
            font-family: inherit;
            font-size: 10px; font-weight: 800;
            letter-spacing: .04em;
            font-variant-numeric: tabular-nums;
            cursor: pointer;
            transition: background .15s, border-color .15s, transform .12s;
            flex-shrink: 0;
        }
        .ph-app-num:hover { background: rgba(52,211,153,.28); border-color: rgba(52,211,153,.6); }
        .ph-app-num:active { transform: scale(.94); }
        .ph-app-num svg { width: 10px; height: 10px; opacity: .85; }
        .ph-app-num.loading { color: #5c6280; background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.1); letter-spacing: .14em; }

        /* ═══ TABS ═══ */
        .ph-tabs {
            display: flex; gap: 2px;
            padding: 6px 10px 0;
            flex-shrink: 0;
            margin: 0 12px 8px;
            background: linear-gradient(180deg, #123028 0%, #0d2320 100%);
            border: 1px solid rgba(52,211,153,.22);
            border-radius: 11px;
            box-shadow:
                inset 0 1px 0 rgba(110,231,183,.1),
                0 6px 16px rgba(0,0,0,.35);
        }
        .ph-tab {
            flex: 1; padding: 8px 0 9px;
            font-size: 8px; font-weight: 800;
            text-transform: uppercase; letter-spacing: .03em;
            color: #8fa79a; background: transparent; border: none; cursor: pointer;
            border-bottom: 2px solid transparent; font-family: inherit;
            transition: color .2s, border-color .2s;
            display: inline-flex; align-items: center; justify-content: center; gap: 3px;
            -webkit-tap-highlight-color: transparent;
        }
        .ph-tab:hover { color: #d1fae5; }
        .ph-tab.active { color: #6ee7b7; border-color: #34d399; }
        .ph-tab .tab-badge {
            display: none;
            min-width: 11px; height: 11px;
            padding: 0 3px;
            border-radius: 6px;
            background: linear-gradient(135deg, #fb7185, #f472b6);
            color: #fff;
            font-size: 7px; font-weight: 900;
            line-height: 11px;
            letter-spacing: 0;
            box-shadow: 0 0 6px rgba(251,113,133,.55);
            animation: phPulseDot 1.8s ease-in-out infinite;
        }
        .ph-tab .tab-badge.on { display: inline-flex; align-items: center; justify-content: center; }

        .ph-content { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }

        .ph-settings { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 14px 14px; }
        .ph-settings::-webkit-scrollbar { width: 4px; }
        .ph-settings::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }
        .ph-settings-group-title {
            font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
            color: #8890a8; padding: 14px 4px 6px;
        }
        .ph-setting-item {
            display: flex; align-items: center; justify-content: space-between;
            gap: 10px; padding: 12px 14px;
            background: linear-gradient(180deg, rgba(20,40,32,.92), rgba(12,28,22,.95));
            border: 1px solid rgba(52,211,153,.14);
            border-radius: 12px; margin-bottom: 6px;
            cursor: pointer; font-family: inherit; color: inherit; text-align: left;
            width: 100%;
            box-shadow: inset 0 1px 0 rgba(110,231,183,.08);
            transition: background .2s, border-color .2s, transform .15s;
        }
        .ph-setting-item:hover { background: linear-gradient(180deg, rgba(24,52,40,.98), rgba(16,36,28,.98)); border-color: rgba(52,211,153,.4); }
        .ph-setting-item:active { transform: scale(.985); }
        .ph-setting-item-lbl { font-size: 12px; font-weight: 700; color: #e9ecf5; letter-spacing: .01em; }
        .ph-setting-item-sub { font-size: 9.5px; color: #8fa79a; margin-top: 2px; }
        .ph-setting-item-val { font-size: 10px; font-weight: 800; color: #6ee7b7; letter-spacing: .04em; }
        .ph-setting-item.danger .ph-setting-item-lbl { color: #fca5b1; }
        .ph-setting-item.danger .ph-setting-item-val { color: #fca5b1; }
        .ph-setting-item.danger:hover { border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.08); }

        .ph-pin-modal {
            position: absolute; inset: 0; z-index: 30;
            background: linear-gradient(175deg, rgba(12,28,22,.98), rgba(6,16,12,.99));
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 14px; padding: 24px;
            animation: phFadeIn .22s ease;
        }
        .ph-pin-modal-title { font-size: 13px; font-weight: 800; color: #e9ecf5; text-align: center; letter-spacing: .02em; }
        .ph-pin-modal-sub { font-size: 10.5px; color: #8fa79a; text-align: center; line-height: 1.5; max-width: 200px; }
        .ph-pin-modal-cancel {
            background: transparent; border: 1px solid rgba(255,255,255,.14);
            color: #a8aec4; font-family: inherit; font-size: 10.5px; font-weight: 700;
            padding: 8px 18px; border-radius: 8px; cursor: pointer;
            transition: background .15s, color .15s, border-color .15s;
        }
        .ph-pin-modal-cancel:hover { background: rgba(255,255,255,.06); color: #e9ecf5; }

        .ph-home-bar {
            padding: 6px 0 8px; flex-shrink: 0; display: flex; justify-content: center;
            position: relative; z-index: 6;
            background: transparent; border: none; width: 100%; cursor: pointer;
            font-family: inherit;
            transition: background .18s, opacity .15s;
            -webkit-tap-highlight-color: transparent;
        }
        .ph-home-bar:hover { background: rgba(255,255,255,.03); }
        .ph-home-bar:active { opacity: .55; }
        .ph-home-bar::before {
            content: ''; width: 100px; height: 4px; border-radius: 2px;
            background: rgba(255,255,255,.28);
            box-shadow: 0 1px 2px rgba(0,0,0,.4);
            transition: background .2s, width .2s;
        }
        .ph-home-bar:hover::before { background: rgba(255,255,255,.5); width: 112px; }
        .ph-home-bar:active::before { background: rgba(110,231,183,.85); }

        .ph-toast { position: absolute; top: 74px; left: 50%; transform: translateX(-50%);
            padding: 8px 14px; border-radius: 9px; font-size: 10.5px; font-weight: 700; letter-spacing: .02em;
            background: linear-gradient(175deg, rgba(16,36,28,.98), rgba(8,20,14,.99));
            border: 1px solid rgba(52,211,153,.5); color: #d1fae5;
            box-shadow: 0 10px 26px rgba(0,0,0,.55), 0 0 24px rgba(52,211,153,.18);
            backdrop-filter: blur(10px); animation: phToastIn .22s cubic-bezier(.22,1,.36,1);
            transition: opacity .2s, transform .2s; z-index: 50; pointer-events: none;
            max-width: 240px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ph-toast.ok { color: #a7f3d0; border-color: rgba(52,211,153,.65); }
        .ph-toast.err { color: #fecdd3; border-color: rgba(251,113,133,.55); }
        .ph-toast.fav { color: #fde68a; border-color: rgba(251,191,36,.6); }
        .ph-toast.out { opacity: 0; transform: translateX(-50%) translateY(-8px); }

        /* ═══ HOME: RELÓGIO E BUSCA MOVÍVEIS ═══ */
        .ph-home-clock {
            position: relative;
            cursor: grab;
            touch-action: none;
            user-select: none;
            transition: transform .18s cubic-bezier(.22,1,.36,1);
        }
        .ph-home-clock.dragging { cursor: grabbing; transition: none; }

        .ph-home-search {
            cursor: grab;
            touch-action: none;
            transition: transform .18s cubic-bezier(.22,1,.36,1);
        }
        .ph-home-search.dragging { cursor: grabbing; transition: none; }
        .ph-home-search input { cursor: text; }

        /* ═══ HOME: TAMANHO E ESPAÇAMENTO ═══ */
        .ph-home[data-icon-size="small"] .ph-home-app-icon { width: 36px; height: 36px; border-radius: 11px; }
        .ph-home[data-icon-size="small"] .ph-home-app-icon svg { width: 18px; height: 18px; }
        .ph-home[data-icon-size="large"] .ph-home-app-icon { width: 48px; height: 48px; border-radius: 14px; }
        .ph-home[data-icon-size="large"] .ph-home-app-icon svg { width: 26px; height: 26px; }
        .ph-home[data-grid-gap="tight"] .ph-home-grid { gap: 4px 2px; }
        .ph-home[data-grid-gap="wide"]  .ph-home-grid { gap: 12px 8px; }

        /* ═══ HOME: MENU DE CONTEXTO ═══ */
        .ph-ctx-menu {
            position: fixed;
            z-index: 60;
            min-width: 210px;
            padding: 6px;
            border-radius: 12px;
            background: linear-gradient(180deg, rgba(16,36,28,.98), rgba(8,20,14,.99));
            border: 1px solid rgba(52,211,153,.32);
            box-shadow: 0 16px 42px rgba(0,0,0,.7), 0 0 0 1px rgba(0,0,0,.5);
            color: #e9ecf5;
            pointer-events: auto;
            animation: phFadeIn .16s ease;
        }
        .ph-ctx-item {
            display: flex; align-items: center; gap: 10px;
            padding: 8px 12px; border-radius: 8px;
            font-size: 11px; font-weight: 700;
            cursor: pointer; border: none;
            background: transparent; color: inherit;
            width: 100%; text-align: left; font-family: inherit;
            transition: background .12s;
        }
        .ph-ctx-item:hover { background: rgba(52,211,153,.16); }
        .ph-ctx-item .ctx-val { margin-left: auto; color: #6ee7b7; font-weight: 800; font-size: 10px; letter-spacing: .04em; }
        .ph-ctx-sep { height: 1px; margin: 4px 6px; background: rgba(255,255,255,.08); }
        .ph-ctx-label {
            font-size: 9px; font-weight: 800; letter-spacing: .12em;
            text-transform: uppercase; color: #8890a8;
            padding: 8px 12px 4px;
        }

        @media (prefers-reduced-motion: reduce) {
            .ph-frame, .ph-frame.min { transition-duration: .01ms; }
            .ph-frame.ringing, .ph-frame.recording { animation: none !important; }
            .ph-frame.min::after { animation: none !important; }
            .ph-view.active { animation: none !important; }
            .ph-home-pages { transition-duration: .01ms; }
            .ph-home-clock, .ph-home-search { transition-duration: .01ms; }
        }
        `);
    }

    // ═══ FRAME ═══
    function _ensureFrame() {
        if (_frameEl) return;
        _ensureHost();

        _frameEl = el('div', { class: 'ph-frame' + (_minimized ? ' min' : ''), id: 'phFrame' });
        _frameEl.innerHTML = `
            <div class="ph-side vol1"></div>
            <div class="ph-side vol2"></div>
            <div class="ph-side pwr"></div>
            <div class="ph-notch" id="phNotch" title="Clique para ${_minimized ? 'expandir' : 'minimizar'}"></div>
            <div class="ph-screen">
                <div class="ph-wallpaper" id="phWallpaper"></div>
                <div class="ph-status">
                    <span class="ph-status-time" id="phTime">--:--</span>
                    <span class="ph-status-icons">
                        <span class="sig"><i></i><i></i><i></i><i></i></span>
                        <span class="wifi">${ctx.I.wifi}</span>
                        <span style="font-size:9px;font-weight:800;letter-spacing:.02em;">LTE</span>
                        <span class="dot-notif" id="phNotifDot"></span>
                    </span>
                </div>
                <div class="ph-stage" id="phStage">
                    <div class="ph-view ph-view-lock" id="phViewLock"></div>
                    <div class="ph-view ph-view-home" id="phViewHome"></div>
                    <div class="ph-view ph-view-app" id="phViewApp"></div>
                    <div class="ph-view ph-view-call" id="phViewCall"></div>
                </div>
                <button class="ph-home-bar" id="phHomeBar" type="button" title="Início" aria-label="Ir para o início"></button>
            </div>
        `;
        _root.appendChild(_frameEl);
        _screenEl = _frameEl.querySelector('.ph-screen');
        _stageEl = _frameEl.querySelector('#phStage');
        ctx.frameEl = _frameEl;
        ctx.screenEl = _screenEl;

        _contentEl = document.createElement('div');
        _contentEl.className = 'ph-content';
        _contentEl.id = 'phContent';

        _tickClock();
        if (_clockTimer) clearInterval(_clockTimer);
        _clockTimer = setInterval(() => { if (!_dying) _tickClock(); }, 15000);

        const notch = _frameEl.querySelector('#phNotch');
        notch.addEventListener('click', (e) => { e.stopPropagation(); _setMinimized(!_minimized); });
        _frameEl.addEventListener('click', (e) => {
            if (!_minimized) return;
            if (e.target.closest('#phNotch')) return;
            _setMinimized(false);
        });

        const homeBar = _frameEl.querySelector('#phHomeBar');
        homeBar.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_inCallView || (ctx.phase !== 'idle' && ctx.phase !== 'busy')) return;
            if (_view === 'lock' || _view === 'home') return;
            try { ctx.tone.home(); } catch(_) {}
            _goHome();
        });

        _frameEl.addEventListener('contextmenu', (e) => {
            if (_view !== 'home') return;
            if (e.target.closest('input, textarea')) return;
            e.preventDefault();
            _openHomeCtx(e.clientX, e.clientY);
        });
    }

    function _tickClock() {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const t1 = _frameEl?.querySelector('#phTime');
        if (t1) t1.textContent = hh + ':' + mm;
        const t2 = _frameEl?.querySelector('#phLockTime');
        if (t2) t2.textContent = hh + ':' + mm;
        const t3 = _frameEl?.querySelector('#phHomeTime');
        if (t3) t3.textContent = hh + ':' + mm;
    }

    function _setMinimized(v) {
        if (v === _minimized) return;
        _minimized = !!v;
        try { localStorage.setItem(LS_MINIMIZED, _minimized ? '1' : '0'); } catch(_) {}
        if (!_frameEl) return;
        _frameEl.classList.toggle('min', _minimized);
        const notch = _frameEl.querySelector('#phNotch');
        if (notch) notch.title = _minimized ? 'Clique para expandir' : 'Clique para minimizar';
        try { if (_minimized) ctx.tone.tuck(); else ctx.tone.pull(); } catch(_) {}
    }
    ctx.setMinimized = _setMinimized;
    ctx.getMinimized = () => _minimized;

    // ═══ VIEW ROUTER ═══
    function _showView(name) {
        _view = name;
        const views = {
            lock: _frameEl.querySelector('#phViewLock'),
            home: _frameEl.querySelector('#phViewHome'),
            app: _frameEl.querySelector('#phViewApp'),
            call: _frameEl.querySelector('#phViewCall')
        };
        for (const k in views) {
            if (!views[k]) continue;
            views[k].classList.toggle('active', k === name);
        }
        if (name !== 'app' && name !== 'call') {
            if (_contentEl.parentElement) _contentEl.parentElement.removeChild(_contentEl);
        }
        if (name !== 'home') _closeHomeCtx();
        if (_screenEl) {
            _screenEl.classList.toggle('app-active', name === 'app' || name === 'call');
        }
    }

    // ═══ LOCK SCREEN ═══
    function _renderLock() {
        _showView('lock');
        const view = _frameEl.querySelector('#phViewLock');
        if (!view) return;

        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const dateStr = _fmtHomeDate(d);

        if (_pinSet) {
            view.innerHTML = `
                <div class="ph-lock">
                    <div class="ph-lock-clock">
                        <div class="ph-lock-time" id="phLockTime">${hh}:${mm}</div>
                        <div class="ph-lock-date">${esc(dateStr)}</div>
                    </div>
                    <div class="ph-lock-mid">
                        <div class="ph-lock-pin-wrap ph-lock-pin" id="phLockPin">
                            <div class="ph-lock-pin-dots" id="phLockDots">
                                <span class="ph-lock-pin-dot"></span>
                                <span class="ph-lock-pin-dot"></span>
                                <span class="ph-lock-pin-dot"></span>
                                <span class="ph-lock-pin-dot"></span>
                            </div>
                            <div class="ph-lock-pin-label" id="phLockLabel">Digite o PIN</div>
                        </div>
                    </div>
                    <div class="ph-keypad" id="phLockPad"></div>
                </div>
            `;
            _wirePinPad(view, { onComplete: _tryUnlock });
            _updatePinDots(view, 0);
        } else {
            view.innerHTML = `
                <div class="ph-lock">
                    <div class="ph-lock-clock">
                        <div class="ph-lock-time" id="phLockTime">${hh}:${mm}</div>
                        <div class="ph-lock-date">${esc(dateStr)}</div>
                    </div>
                    <div class="ph-lock-mid">
                        <div class="ph-lock-swipe" id="phLockSwipe">
                            <span class="ph-lock-swipe-icon">${ctx.I.unlock}</span>
                            <span class="ph-lock-swipe-text">Toque para desbloquear</span>
                        </div>
                    </div>
                </div>
            `;
            view.querySelector('#phLockSwipe').addEventListener('click', _unlock);
        }
    }

    function _tryUnlock(pin) {
        if (pin === _pinSet) {
            _pinBuf = '';
            try { ctx.tone.unlock(); } catch(_) {}
            _unlock();
        } else {
            try { ctx.tone.errorPin(); } catch(_) {}
            const view = _frameEl.querySelector('#phViewLock');
            const pinWrap = view.querySelector('#phLockPin');
            const label = view.querySelector('#phLockLabel');
            if (pinWrap) {
                pinWrap.classList.remove('shake'); void pinWrap.offsetWidth; pinWrap.classList.add('shake');
            }
            if (label) label.textContent = 'PIN incorreto';
            setTimeout(() => {
                _pinBuf = '';
                _updatePinDots(view, 0);
                if (label) label.textContent = 'Digite o PIN';
            }, 600);
        }
    }

    function _unlock() {
        _pinBuf = '';
        _showView('home');
        _renderHome();
    }

    function _lock() {
        _pinBuf = '';
        _renderLock();
    }

    function _updatePinDots(view, count) {
        const dots = view.querySelectorAll('#phLockDots .ph-lock-pin-dot');
        dots.forEach((d, i) => d.classList.toggle('filled', i < count));
    }

    function _wirePinPad(view, opts) {
        const pad = view.querySelector('#phLockPad');
        if (!pad) return;
        const keys = [
            { d: '1', sub: '' }, { d: '2', sub: 'ABC' }, { d: '3', sub: 'DEF' },
            { d: '4', sub: 'GHI' }, { d: '5', sub: 'JKL' }, { d: '6', sub: 'MNO' },
            { d: '7', sub: 'PQRS' }, { d: '8', sub: 'TUV' }, { d: '9', sub: 'WXYZ' },
            { util: 'back', svg: ctx.I.backspace }, { d: '0', sub: '' }, { util: 'ok', svg: '✓' }
        ];
        pad.innerHTML = keys.map(k => k.util
            ? `<button class="ph-key util${k.util === 'ok' ? ' ok' : ''}" data-util="${k.util}">${k.svg}</button>`
            : `<button class="ph-key" data-digit="${k.d}"><span>${k.d}</span>${k.sub ? `<span class="sub">${k.sub}</span>` : ''}</button>`
        ).join('');
        pad.querySelectorAll('.ph-key').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.remove('pressed'); void btn.offsetWidth; btn.classList.add('pressed');
                if (btn.dataset.digit != null) {
                    try { ctx.tone.key(); } catch(_) {}
                    if (_pinBuf.length < 4) _pinBuf += btn.dataset.digit;
                } else if (btn.dataset.util === 'back') {
                    try { ctx.tone.key(); } catch(_) {}
                    _pinBuf = _pinBuf.slice(0, -1);
                } else if (btn.dataset.util === 'ok') {
                    if (_pinBuf.length === 4 && opts?.onComplete) opts.onComplete(_pinBuf);
                    return;
                }
                _updatePinDots(view, _pinBuf.length);
                if (_pinBuf.length === 4 && opts?.onComplete) {
                    const pin = _pinBuf;
                    setTimeout(() => opts.onComplete(pin), 60);
                }
            });
        });
    }

    // ═══ HOME (multi-page grid) ═══
    function _renderHome() {
        _showView('home');
        _syncLayout();

        const view = _frameEl.querySelector('#phViewHome');
        if (!view) return;

        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const dateStr = _fmtHomeDate(d);

        const dockApps = _resolveDockApps();
        const pagesCount = _layout.pages.length;
        if (_currentPage >= pagesCount) _currentPage = Math.max(0, pagesCount - 1);

        const pagesHtml = _layout.pages.map((page, pi) => `
            <div class="ph-home-page" data-page="${pi}">
                <div class="ph-home-grid" data-page="${pi}">
                    ${page.map((appId, slot) => {
                        if (!appId) return `<div class="ph-home-slot" data-page="${pi}" data-slot="${slot}"></div>`;
                        const app = _resolveAppDef(appId);
                        if (!app) return `<div class="ph-home-slot" data-page="${pi}" data-slot="${slot}"></div>`;
                        return _homeAppHtml(app, pi, slot);
                    }).join('')}
                </div>
            </div>
        `).join('');

        const dotsHtml = _layout.pages.map((_, i) =>
            `<span${i === _currentPage ? ' class="active"' : ''} data-dot="${i}"></span>`
        ).join('');

        // dock: apps existentes + slots vazios (alvos de drop)
        const dockHtml = [];
        for (let i = 0; i < MAX_DOCK_APPS; i++) {
            const a = dockApps[i];
            if (a) dockHtml.push(_homeAppHtml(a, -1, i, true));
            else   dockHtml.push(`<div class="ph-dock-slot" data-dock-slot="${i}"></div>`);
        }

        const clockStyle  = (_homeCfg.clockX  || _homeCfg.clockY)
            ? ` style="transform:translate(${_homeCfg.clockX}px,${_homeCfg.clockY}px)"` : '';
        const searchStyle = (_homeCfg.searchX || _homeCfg.searchY)
            ? ` style="transform:translate(${_homeCfg.searchX}px,${_homeCfg.searchY}px)"` : '';

        const clockHtml = _homeCfg.showClock
            ? `<div class="ph-home-clock"${clockStyle}>
                 <div class="ph-home-time" id="phHomeTime">${hh}:${mm}</div>
                 <div class="ph-home-date">${esc(dateStr)}</div>
               </div>`
            : '';
        const searchHtml = _homeCfg.showSearch
            ? `<label class="ph-home-search"${searchStyle}>
                 <input type="text" id="phHomeSearch" placeholder="Buscar" spellcheck="false" autocomplete="off" />
                 ${ctx.I.search}
               </label>`
            : '';

        view.innerHTML = `
            <div class="ph-home" data-icon-size="${_homeCfg.iconSize}" data-grid-gap="${_homeCfg.gridGap}">
                ${clockHtml}
                ${searchHtml}
                <div class="ph-home-pages-wrap" id="phPagesWrap">
                    <div class="ph-home-pages" id="phPages" style="transform:translateX(${-_currentPage * 100}%)">
                        ${pagesHtml}
                    </div>
                </div>
                <div class="ph-home-dots" id="phDots">${dotsHtml}</div>
                <div class="ph-dock" id="phDock">${dockHtml.join('')}</div>
            </div>
        `;

        _bindAppClicks(view.querySelectorAll('.ph-home-app'));
        _wireDrag(view);
        _wireSwipe(view);
        _wireDots(view);
        _wireHomeMovables(view);

        const search = view.querySelector('#phHomeSearch');
        if (search) search.addEventListener('input', () => _filterApps(search.value));
    }

    function _resolveDockApps() {
        return _layout.dock
            .map(id => _resolveAppDef(id))
            .filter(Boolean)
            .slice(0, MAX_DOCK_APPS);
    }

    function _homeAppHtml(a, page, slot, isDock) {
        const icon = a.icon || ctx.I.apps;
        const accent = a.accent || '#a78bfa';
        const bg = a.bg || null;
        const iconStyle = bg
            ? `background:${esc(bg)};border-color:transparent;color:#fff`
            : `color:${esc(accent)}`;
        const dataAttrs = isDock
            ? `data-dock-index="${slot}"`
            : `data-page="${page}" data-slot="${slot}"`;
        return `<button class="ph-home-app" data-app-id="${esc(a.id)}" ${dataAttrs} draggable="true">
            <span class="ph-home-app-icon" style="${iconStyle}">${icon}</span>
            <span class="ph-home-app-name">${esc(a.name || a.id)}</span>
        </button>`;
    }

    function _resolveAppDef(id) {
        const registered = ctx.apps.get(id);
        if (registered) return registered;
        if (id === 'calls') return _builtinCallsDef();
        if (id === 'settings') return _builtinSettingsDef();
        return null;
    }

    function _builtinCallsDef() {
        return {
            id: 'calls',
            name: 'Chamadas',
            icon: ctx.I.phone,
            accent: '#eafff4',
            bg: 'linear-gradient(135deg, #86efac 0%, #22c55e 100%)',
            appBg: 'linear-gradient(180deg, #143a2c 0%, #0a1a14 100%)',
            appBgSolid: '#0f2820',
            builtin: 'calls',
            dock: true,
            order: 0
        };
    }
    function _builtinSettingsDef() {
        return {
            id: 'settings',
            name: 'Ajustes',
            icon: ctx.I.gear,
            accent: '#94a3b8',
            bg: 'linear-gradient(135deg, #94a3b8, #64748b)',
            appBg: 'linear-gradient(180deg, #1a1a20 0%, #0e0e12 100%)',
            appBgSolid: '#14141a',
            builtin: 'settings',
            order: 10
        };
    }
    function _builtinFallbacks() {
        const list = [];
        if (!ctx.apps.get('calls')) list.push(_builtinCallsDef());
        if (!ctx.apps.get('settings')) list.push(_builtinSettingsDef());
        return list;
    }

    // Sincroniza layout com registry — remove órfãos, semeia novos (dock:true vai pro dock)
    function _syncLayout() {
        const all = [..._builtinFallbacks(), ...ctx.apps.all()];
        const validIds = new Set(all.map(a => a.id));

        let dirty = false;
        for (const page of _layout.pages) {
            for (let i = 0; i < page.length; i++) {
                if (page[i] && !validIds.has(page[i])) { page[i] = null; dirty = true; }
            }
        }
        const dockBefore = _layout.dock.length;
        _layout.dock = _layout.dock.filter(id => validIds.has(id));
        if (_layout.dock.length !== dockBefore) dirty = true;

        const present = new Set([
            ..._layout.pages.flat().filter(Boolean),
            ..._layout.dock
        ]);
        for (const a of all) {
            if (present.has(a.id)) continue;
            if (a.dock && _layout.dock.length < MAX_DOCK_APPS) {
                _layout.dock.push(a.id);
                present.add(a.id);
                dirty = true;
                continue;
            }
            let placed = false;
            for (const page of _layout.pages) {
                const idx = page.indexOf(null);
                if (idx !== -1) { page[idx] = a.id; placed = true; dirty = true; break; }
            }
            if (!placed) {
                const np = new Array(PAGE_SIZE).fill(null);
                np[0] = a.id;
                _layout.pages.push(np);
                dirty = true;
            }
        }

        if (!_layoutInitialized) _layoutInitialized = true;
        if (dirty) _saveLayout();
    }

    function _bindAppClicks(nodes) {
        nodes.forEach(b => {
            b.addEventListener('click', (e) => {
                if (_suppressClick) return;
                if (b.dataset.dockIndex != null) { _openApp(b.dataset.appId); return; }
                _openApp(b.dataset.appId);
            });
        });
    }

    // ═══ DRAG & DROP — grid + dock + multi-page ═══
    function _clearDropHints() {
        _frameEl?.querySelectorAll('.drop-before, .drop-after, .drag-over')
            .forEach(el => el.classList.remove('drop-before', 'drop-after', 'drag-over'));
    }

    function _handleDragEdge(e) {
        if (!_dragSrc) { _cancelDragPageTimer(); return; }
        const wrap = _frameEl?.querySelector('#phPagesWrap');
        if (!wrap) return;
        const r = wrap.getBoundingClientRect();
        if (e.clientY < r.top || e.clientY > r.bottom) { _cancelDragPageTimer(); return; }
        const x = e.clientX - r.left;
        const EDGE = 42;
        let dir = 0;
        if (x < EDGE && _currentPage > 0) dir = -1;
        else if (x > r.width - EDGE && _currentPage < _layout.pages.length - 1) dir = 1;
        if (dir === 0) { _cancelDragPageTimer(); return; }
        if (_dragPageTimer) return;
        _dragPageTimer = setTimeout(() => {
            _dragPageTimer = null;
            _currentPage += dir;
            const pages = _frameEl?.querySelector('#phPages');
            if (pages) {
                pages.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1)';
                pages.style.transform  = `translateX(${-_currentPage * 100}%)`;
            }
            _renderDotsState();
        }, 420);
    }
    function _cancelDragPageTimer() {
        if (_dragPageTimer) { clearTimeout(_dragPageTimer); _dragPageTimer = null; }
    }

    // Position: { kind: 'page', page, slot } | { kind: 'dock', index }
    function _wireDrag(container) {
        if (!container) return;

        // slots vazios da grade
        container.querySelectorAll('.ph-home-slot').forEach(slotEl => {
            slotEl.addEventListener('dragover', (e) => {
                if (!_dragSrc) return;
                e.preventDefault();
                e.stopPropagation();
                slotEl.classList.add('drag-over');
            });
            slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over'));
            slotEl.addEventListener('drop', (e) => {
                if (!_dragSrc) return;
                e.preventDefault();
                e.stopPropagation();
                slotEl.classList.remove('drag-over');
                const page = parseInt(slotEl.dataset.page, 10);
                const slot = parseInt(slotEl.dataset.slot, 10);
                _handleDrop(_dragSrc, { kind: 'page', page, slot });
            });
        });

        // slots vazios do dock
        container.querySelectorAll('.ph-dock-slot').forEach(slotEl => {
            slotEl.addEventListener('dragover', (e) => {
                if (!_dragSrc) return;
                e.preventDefault();
                e.stopPropagation();
                slotEl.classList.add('drag-over');
            });
            slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over'));
            slotEl.addEventListener('drop', (e) => {
                if (!_dragSrc) return;
                e.preventDefault();
                e.stopPropagation();
                slotEl.classList.remove('drag-over');
                const idx = parseInt(slotEl.dataset.dockSlot, 10);
                _handleDrop(_dragSrc, { kind: 'dock', index: idx });
            });
        });

        // apps (grid ou dock)
        container.querySelectorAll('.ph-home-app').forEach(btn => {
            btn.addEventListener('dragstart', e => {
                const id = btn.dataset.appId;
                let src;
                if (btn.dataset.dockIndex != null) {
                    src = { kind: 'dock', index: parseInt(btn.dataset.dockIndex, 10) };
                } else {
                    src = { kind: 'page', page: parseInt(btn.dataset.page, 10), slot: parseInt(btn.dataset.slot, 10) };
                }
                _dragSrc = { id, src };
                _suppressClick = true;
                btn.classList.add('dragging');
                try {
                    e.dataTransfer.setData('text/plain', id);
                    e.dataTransfer.effectAllowed = 'move';
                } catch(_) {}
            });
            btn.addEventListener('dragend', () => {
                _dragSrc = null;
                _cancelDragPageTimer();
                btn.classList.remove('dragging');
                _clearDropHints();
                setTimeout(() => { _suppressClick = false; }, 0);
            });
            btn.addEventListener('dragover', e => {
                if (!_dragSrc || _dragSrc.id === btn.dataset.appId) return;
                e.preventDefault();
                e.stopPropagation();
                const r = btn.getBoundingClientRect();
                const before = (e.clientX - r.left) < r.width / 2;
                btn.classList.toggle('drop-before', before);
                btn.classList.toggle('drop-after', !before);
            });
            btn.addEventListener('dragleave', () => btn.classList.remove('drop-before', 'drop-after'));
            btn.addEventListener('drop', e => {
                if (!_dragSrc) return;
                e.preventDefault();
                e.stopPropagation();
                btn.classList.remove('drop-before', 'drop-after');
                let dst;
                if (btn.dataset.dockIndex != null) {
                    dst = { kind: 'dock', index: parseInt(btn.dataset.dockIndex, 10) };
                } else {
                    dst = { kind: 'page', page: parseInt(btn.dataset.page, 10), slot: parseInt(btn.dataset.slot, 10) };
                }
                _handleDrop(_dragSrc, dst);
            });
        });
    }

    function _handleDrop(src, dst) {
        if (!src || !src.src) return;
        const s = src.src;
        _dragSrc = null;

        if (s.kind === 'page' && s.page >= _layout.pages.length) return;
        if (dst.kind === 'page' && dst.page >= _layout.pages.length) return;

        if (s.kind === 'page' && dst.kind === 'page') {
            const a = _layout.pages[s.page][s.slot];
            const b = _layout.pages[dst.page][dst.slot];
            _layout.pages[dst.page][dst.slot] = a;
            _layout.pages[s.page][s.slot] = b;
        } else if (s.kind === 'dock' && dst.kind === 'page') {
            const a = _layout.dock[s.index];
            const b = _layout.pages[dst.page][dst.slot];
            _layout.pages[dst.page][dst.slot] = a;
            if (b) _layout.dock[s.index] = b;
            else _layout.dock.splice(s.index, 1);
        } else if (s.kind === 'page' && dst.kind === 'dock') {
            const a = _layout.pages[s.page][s.slot];
            const b = _layout.dock[dst.index];
            _layout.dock[dst.index] = a;
            if (b) _layout.pages[s.page][s.slot] = b;
            else _layout.pages[s.page][s.slot] = null;
        } else if (s.kind === 'dock' && dst.kind === 'dock') {
            const a = _layout.dock[s.index];
            const b = _layout.dock[dst.index];
            _layout.dock[dst.index] = a;
            _layout.dock[s.index] = b;
        }

        _saveLayout();
        _clearDropHints();
        _renderHome();
    }

    // ═══ SWIPE ENTRE PÁGINAS ═══
    function _wireSwipe(view) {
        const wrap = view.querySelector('#phPagesWrap');
        const pages = view.querySelector('#phPages');
        if (!wrap || !pages) return;

        let startX = 0, startY = 0, deltaX = 0, deltaY = 0;
        let active = false, decided = false, horizontal = false;
        let startPage = _currentPage;
        const THRESHOLD = 0.22;

        const setTranslate = (px) => {
            const base = -_currentPage * wrap.clientWidth;
            pages.style.transition = 'none';
            pages.style.transform = `translateX(${base + px}px)`;
        };
        const resetTranslate = (withAnim) => {
            pages.style.transition = withAnim ? '' : 'none';
            pages.style.transform = `translateX(${-_currentPage * 100}%)`;
            if (!withAnim) requestAnimationFrame(() => { pages.style.transition = ''; });
        };

        wrap.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (e.target.closest('.ph-home-app')) return;
            active = true; decided = false; horizontal = false;
            startX = e.clientX; startY = e.clientY;
            deltaX = 0; deltaY = 0;
            startPage = _currentPage;
        });
        wrap.addEventListener('pointermove', (e) => {
            if (!active) return;
            deltaX = e.clientX - startX;
            deltaY = e.clientY - startY;
            if (!decided) {
                if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
                    decided = true;
                    horizontal = Math.abs(deltaX) > Math.abs(deltaY);
                    if (horizontal) wrap.setPointerCapture?.(e.pointerId);
                } else return;
            }
            if (!horizontal) return;
            const atStart = _currentPage === 0 && deltaX > 0;
            const atEnd = _currentPage === _layout.pages.length - 1 && deltaX < 0;
            const eff = (atStart || atEnd) ? deltaX * 0.32 : deltaX;
            setTranslate(eff);
        });
        const finish = (e) => {
            if (!active) return;
            active = false;
            if (!horizontal) return;
            const w = wrap.clientWidth || 1;
            const ratio = deltaX / w;
            let target = _currentPage;
            if (ratio < -THRESHOLD && _currentPage < _layout.pages.length - 1) target = _currentPage + 1;
            else if (ratio > THRESHOLD && _currentPage > 0) target = _currentPage - 1;
            _currentPage = target;
            resetTranslate(true);
            _renderDotsState();
        };
        wrap.addEventListener('pointerup', finish);
        wrap.addEventListener('pointercancel', finish);
        wrap.addEventListener('pointerleave', finish);
    }

    function _wireDots(view) {
        view.querySelectorAll('#phDots span').forEach(dot => {
            dot.addEventListener('click', () => {
                const i = parseInt(dot.dataset.dot, 10);
                if (isNaN(i)) return;
                _currentPage = i;
                _renderHome();
            });
        });
    }

    function _renderDotsState() {
        const dots = _frameEl?.querySelectorAll('#phDots span');
        if (dots) dots.forEach((d, i) => d.classList.toggle('active', i === _currentPage));
    }

    function _filterApps(q) {
        q = String(q || '').trim().toLowerCase();
        const grid = _frameEl?.querySelector('.ph-home-page[data-page="0"] .ph-home-grid');
        if (!grid) return;
        if (!q) { _renderHome(); return; }
        const all = [..._builtinFallbacks(), ...ctx.apps.all()];
        const results = all.filter(a => (a.name || a.id).toLowerCase().includes(q));
        grid.innerHTML = results.length
            ? results.map((a, i) => _homeAppHtml(a, 0, i)).join('')
            : `<div class="ph-home-empty">Nada encontrado.</div>`;
        _bindAppClicks(grid.querySelectorAll('.ph-home-app'));
    }

    // ═══ MOVÍVEIS: RELÓGIO E BUSCA ═══
    function _wireHomeMovables(view) {
        const items = [
            { el: view.querySelector('.ph-home-clock'),  x: 'clockX',  y: 'clockY'  },
            { el: view.querySelector('.ph-home-search'), x: 'searchX', y: 'searchY' }
        ];
        items.forEach(({ el: node, x: xKey, y: yKey }) => {
            if (!node) return;
            let startX = 0, startY = 0, baseX = 0, baseY = 0;
            let dragging = false, moved = false, pid = null;
            node.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                dragging = true; moved = false; pid = e.pointerId;
                startX = e.clientX; startY = e.clientY;
                baseX = _homeCfg[xKey] || 0;
                baseY = _homeCfg[yKey] || 0;
            });
            node.addEventListener('pointermove', (e) => {
                if (!dragging || e.pointerId !== pid) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (!moved) {
                    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
                    moved = true;
                    node.classList.add('dragging');
                    try { node.setPointerCapture(pid); } catch(_) {}
                    if (node.classList.contains('ph-home-search')) node.querySelector('input')?.blur();
                }
                e.preventDefault();
                node.style.transition = 'none';
                node.style.transform  = `translate(${baseX + dx}px, ${baseY + dy}px)`;
            });
            const finish = (e) => {
                if (!dragging) return;
                dragging = false;
                const wasMoved = moved;
                moved = false;
                node.classList.remove('dragging');
                node.style.transition = '';
                if (wasMoved && e.pointerId === pid) {
                    _homeCfg[xKey] = baseX + (e.clientX - startX);
                    _homeCfg[yKey] = baseY + (e.clientY - startY);
                    _saveHomeCfg();
                }
                pid = null;
            };
            node.addEventListener('pointerup', finish);
            node.addEventListener('pointercancel', finish);
        });
    }

    // ═══ MENU DE CONTEXTO DA HOME ═══
    function _closeHomeCtx() {
        _root?.querySelector('.ph-ctx-menu')?.remove();
    }

    function _openHomeCtx(x, y) {
        _closeHomeCtx();
        const menu = document.createElement('div');
        menu.className = 'ph-ctx-menu';
        const szLabel  = { small: 'Pequeno', normal: 'Normal', large: 'Grande' }[_homeCfg.iconSize] || 'Normal';
        const gapLabel = { tight: 'Compacto', normal: 'Normal', wide: 'Amplo' }[_homeCfg.gridGap] || 'Normal';
        menu.innerHTML = `
            <div class="ph-ctx-label">Home</div>
            <button class="ph-ctx-item" data-act="toggle-clock">
                <span>Mostrar relógio</span><span class="ctx-val">${_homeCfg.showClock ? 'on' : 'off'}</span>
            </button>
            <button class="ph-ctx-item" data-act="toggle-search">
                <span>Mostrar busca</span><span class="ctx-val">${_homeCfg.showSearch ? 'on' : 'off'}</span>
            </button>
            <div class="ph-ctx-sep"></div>
            <div class="ph-ctx-label">Aparência</div>
            <button class="ph-ctx-item" data-act="size">
                <span>Tamanho dos ícones</span><span class="ctx-val" data-val="size">${szLabel}</span>
            </button>
            <button class="ph-ctx-item" data-act="gap">
                <span>Espaçamento da grade</span><span class="ctx-val" data-val="gap">${gapLabel}</span>
            </button>
            <div class="ph-ctx-sep"></div>
            <button class="ph-ctx-item" data-act="reset-pos"><span>Repor posições</span></button>
            <button class="ph-ctx-item" data-act="reset-layout"><span>Restaurar grade</span></button>
        `;
        _root.appendChild(menu);
        requestAnimationFrame(() => {
            const mw = menu.offsetWidth, mh = menu.offsetHeight;
            menu.style.left = Math.max(8, Math.min(x, window.innerWidth  - mw - 8)) + 'px';
            menu.style.top  = Math.max(8, Math.min(y, window.innerHeight - mh - 8)) + 'px';
        });

        const onDoc = (ev) => {
            if (!menu.contains(ev.target)) {
                _closeHomeCtx();
                document.removeEventListener('pointerdown', onDoc, true);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', onDoc, true), 0);

        menu.addEventListener('click', (e) => {
            const btn = e.target.closest('.ph-ctx-item');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'toggle-clock') {
                _homeCfg.showClock = !_homeCfg.showClock;
                _saveHomeCfg(); _closeHomeCtx(); _renderHome();
            } else if (act === 'toggle-search') {
                _homeCfg.showSearch = !_homeCfg.showSearch;
                _saveHomeCfg(); _closeHomeCtx(); _renderHome();
            } else if (act === 'size') {
                const seq = ['small', 'normal', 'large'];
                _homeCfg.iconSize = seq[(seq.indexOf(_homeCfg.iconSize) + 1) % seq.length];
                _saveHomeCfg();
                menu.querySelector('[data-val="size"]').textContent =
                    { small: 'Pequeno', normal: 'Normal', large: 'Grande' }[_homeCfg.iconSize];
                _applyHomeCfg();
            } else if (act === 'gap') {
                const seq = ['tight', 'normal', 'wide'];
                _homeCfg.gridGap = seq[(seq.indexOf(_homeCfg.gridGap) + 1) % seq.length];
                _saveHomeCfg();
                menu.querySelector('[data-val="gap"]').textContent =
                    { tight: 'Compacto', normal: 'Normal', wide: 'Amplo' }[_homeCfg.gridGap];
                _applyHomeCfg();
            } else if (act === 'reset-pos') {
                _homeCfg.clockX = _homeCfg.clockY = 0;
                _homeCfg.searchX = _homeCfg.searchY = 0;
                _saveHomeCfg(); _closeHomeCtx(); _renderHome();
            } else if (act === 'reset-layout') {
                try { localStorage.removeItem(LS_LAYOUT); } catch(_) {}
                _layout = { pages: [new Array(PAGE_SIZE).fill(null)], dock: [] };
                _layoutInitialized = false;
                _currentPage = 0;
                _syncLayout(); _saveLayout(); _closeHomeCtx(); _renderHome();
            }
        });
    }

    function _fmtHomeDate(d) {
        try {
            const s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
            return s.charAt(0).toUpperCase() + s.slice(1);
        } catch(_) {
            return d.toDateString();
        }
    }

    async function _copyMyNumber() {
        if (!ctx.myNumber) { _toast('Número ainda sendo gerado', 'err'); return; }
        const formatted = ctx.contacts.fmtNumber ? ctx.contacts.fmtNumber(ctx.myNumber) : ctx.myNumber;
        try { await navigator.clipboard.writeText(formatted); _toast('Número copiado', 'ok'); }
        catch(_) { _toast('Falha ao copiar', 'err'); }
    }

    function _updateMyNumberUI() {
        const pill = _frameEl?.querySelector('#phAppMyNum');
        if (!pill) return;
        if (ctx.myNumber) {
            pill.textContent = ctx.contacts.fmtNumber ? ctx.contacts.fmtNumber(ctx.myNumber) : ctx.myNumber;
            pill.classList.remove('loading');
        } else {
            pill.textContent = '··· — ···';
            pill.classList.add('loading');
        }
    }
    ctx.updateMyNumberUI = _updateMyNumberUI;

    // ═══ OPEN APP ═══
    function _openApp(id) {
        if (_dying) return;
        const app = _resolveAppDef(id);
        if (!app) return;

        if (_activeAppId && _activeAppId !== id) {
            _unmountActiveApp();
        }
        _activeAppId = id;
        _showView('app');
        const view = _frameEl.querySelector('#phViewApp');
        if (!view) return;
        view.innerHTML = '';

        view.style.setProperty('--app-bg', app.appBg || DEFAULT_APP_BG);
        _screenEl.style.setProperty('--active-app-bg-solid', app.appBgSolid || app.appBg || DEFAULT_APP_BG_SOLID);

        const bar = el('div', { class: 'ph-app-bar' });
        const showNumPill = app.builtin === 'calls';
        bar.innerHTML = `
            <button class="ph-app-back" title="Voltar">${ctx.I.back}</button>
            <span class="ph-app-title">${esc(app.name || id)}</span>
            ${showNumPill ? `<button class="ph-app-num loading" id="phAppMyNum" title="Copiar meu número">··· — ···</button>` : ''}
        `;
        bar.querySelector('.ph-app-back').addEventListener('click', _goHome);
        if (showNumPill) {
            bar.querySelector('#phAppMyNum').addEventListener('click', _copyMyNumber);
            _updateMyNumberUI();
        }
        view.appendChild(bar);

        if (app.builtin === 'calls') _mountCallsApp(view);
        else if (app.builtin === 'settings') _mountSettingsApp(view);
        else _mountGenericApp(view, app);
    }
    ctx.openApp = _openApp;

    ctx.goToTab = (tabId) => {
        if (!_frameEl) return false;
        if (!['contatos','discar','recentes','recados'].includes(tabId)) return false;
        _chamadasTab = tabId;
        if (_view !== 'app' || _activeAppId !== 'calls') {
            _openApp('calls');
            return true;
        }
        const tabs = _frameEl.querySelector('#phViewApp .ph-tabs');
        if (tabs) tabs.querySelectorAll('.ph-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        _renderChamadasContent();
        return true;
    };

    function _unmountActiveApp() {
        if (!_activeAppId) return;
        const app = ctx.apps.get(_activeAppId);
        try { app?.unmount?.(); } catch(_) {}
        _activeAppId = null;
    }

    function _goHome() {
        _unmountActiveApp();
        try {
            _screenEl?.style?.removeProperty('--active-app-bg-solid');
        } catch(_) {}
        _showView('home');
        _renderHome();
    }
    ctx.goHome = _goHome;

    // ═══ CHAMADAS APP ═══
    function _mountCallsApp(view) {
        const tabs = el('div', { class: 'ph-tabs' });
        tabs.innerHTML = `
            <button class="ph-tab${_chamadasTab === 'contatos' ? ' active' : ''}" data-tab="contatos">Contatos</button>
            <button class="ph-tab${_chamadasTab === 'discar' ? ' active' : ''}" data-tab="discar">Discar</button>
            <button class="ph-tab${_chamadasTab === 'recentes' ? ' active' : ''}" data-tab="recentes">Recentes</button>
            <button class="ph-tab${_chamadasTab === 'recados' ? ' active' : ''}" data-tab="recados" title="Recados de voz">Recados<span class="tab-badge" id="phBadgeRecados"></span></button>
        `;
        view.appendChild(tabs);
        view.appendChild(_contentEl);

        tabs.querySelectorAll('.ph-tab').forEach(t => {
            t.addEventListener('click', () => {
                _chamadasTab = t.dataset.tab;
                tabs.querySelectorAll('.ph-tab').forEach(b => b.classList.toggle('active', b === t));
                _renderChamadasContent();
            });
        });
        _renderChamadasContent();
        _refreshRecadosBadge();
    }

    function _renderChamadasContent() {
        if (_chamadasTab === 'discar') ctx.contacts.renderDial?.();
        else if (_chamadasTab === 'recentes') ctx.contacts.renderHistory?.();
        else if (_chamadasTab === 'recados') _renderRecadosTab();
        else ctx.contacts.renderContacts?.();
    }

    function _renderRecadosTab() {
        if (!_contentEl) return;
        _contentEl.innerHTML = '';
        const inboxRoot = document.createElement('div');
        inboxRoot.className = 'ph-inbox-root';
        inboxRoot.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;';
        _contentEl.appendChild(inboxRoot);
        if (ctx.notes?.renderInbox) {
            try { ctx.notes.renderInbox(inboxRoot); }
            catch(e) {
                console.warn('[Phone/shell] renderInbox falhou:', e);
                inboxRoot.innerHTML = '<div class="ph-list"><div class="ph-empty">Erro ao abrir recados.</div></div>';
            }
        } else {
            inboxRoot.innerHTML = '<div class="ph-list"><div class="ph-empty">Módulo de recados indisponível.</div></div>';
        }
    }

    function _refreshRecadosBadge() {
        const badge = _frameEl?.querySelector('#phBadgeRecados');
        if (!badge) return;
        let n = 0;
        try { n = ctx.notes?.getUnreadCount?.() || 0; } catch(_) {}
        if (n > 0) {
            badge.textContent = n > 9 ? '9+' : String(n);
            badge.classList.add('on');
        } else {
            badge.textContent = '';
            badge.classList.remove('on');
        }
    }

    ctx.renderTab = () => {
        if (_view === 'app' && _activeAppId === 'calls') _renderChamadasContent();
    };

    // ═══ CONFIGURAÇÕES APP (fallback builtin) ═══
    let _pinFlow = null;
    let _pinBufFlow = '';
    let _pinFirstFlow = '';

    function _mountSettingsApp(view) {
        view.innerHTML = '';
        const wrap = el('div', { class: 'ph-settings' });
        view.appendChild(wrap);

        const hasPin = !!_pinSet;
        wrap.innerHTML = `
            <div class="ph-settings-group-title">Segurança</div>
            ${hasPin ? `
                <button class="ph-setting-item" data-act="change-pin">
                    <span>
                        <span class="ph-setting-item-lbl">Alterar PIN</span>
                        <div class="ph-setting-item-sub">Trocar o PIN de desbloqueio</div>
                    </span>
                    <span class="ph-setting-item-val">›</span>
                </button>
                <button class="ph-setting-item danger" data-act="remove-pin">
                    <span>
                        <span class="ph-setting-item-lbl">Remover PIN</span>
                        <div class="ph-setting-item-sub">Sem PIN, a tela desbloqueia só com toque</div>
                    </span>
                    <span class="ph-setting-item-val">›</span>
                </button>
                <button class="ph-setting-item" data-act="lock-now">
                    <span>
                        <span class="ph-setting-item-lbl">Bloquear agora</span>
                        <div class="ph-setting-item-sub">Volta para a tela de bloqueio</div>
                    </span>
                    <span class="ph-setting-item-val">›</span>
                </button>
            ` : `
                <button class="ph-setting-item" data-act="set-pin">
                    <span>
                        <span class="ph-setting-item-lbl">Definir PIN</span>
                        <div class="ph-setting-item-sub">Protege o desbloqueio com 4 dígitos</div>
                    </span>
                    <span class="ph-setting-item-val">›</span>
                </button>
            `}
            <div class="ph-settings-group-title">Sobre</div>
            <div class="ph-setting-item" style="cursor:default">
                <span>
                    <span class="ph-setting-item-lbl">Android</span>
                    <div class="ph-setting-item-sub">Versão do sistema</div>
                </span>
                <span class="ph-setting-item-val">${ANDROID_VERSION}</span>
            </div>
            <div class="ph-setting-item" style="cursor:default">
                <span>
                    <span class="ph-setting-item-lbl">Sang Phone</span>
                    <div class="ph-setting-item-sub">Versão do app</div>
                </span>
                <span class="ph-setting-item-val">v${PHONE_VERSION}</span>
            </div>
        `;
        wrap.querySelectorAll('.ph-setting-item[data-act]').forEach(btn => {
            btn.addEventListener('click', () => _handleSettingAction(btn.dataset.act, view));
        });
    }

    function _handleSettingAction(act, view) {
        if (act === 'set-pin') {
            _pinFlow = 'set-new'; _pinBufFlow = ''; _pinFirstFlow = '';
            _openPinModal(view, 'Definir PIN', 'Escolha 4 dígitos');
        } else if (act === 'change-pin') {
            _pinFlow = 'remove-current'; _pinBufFlow = '';
            _openPinModal(view, 'PIN atual', 'Digite o PIN atual para continuar', { afterCheck: () => {
                _pinFlow = 'set-new'; _pinBufFlow = ''; _pinFirstFlow = '';
                _openPinModal(view, 'Novo PIN', 'Escolha 4 dígitos');
            }});
        } else if (act === 'remove-pin') {
            _pinFlow = 'remove-current'; _pinBufFlow = '';
            _openPinModal(view, 'Confirmar', 'Digite o PIN atual para remover', { onSuccess: () => {
                _pinSet = '';
                try { localStorage.removeItem(LS_PIN); } catch(_) {}
                try { ctx.tone.unlock?.(); } catch(_) {}
                _toast('PIN removido', 'ok');
                _mountSettingsApp(view);
            }});
        } else if (act === 'lock-now') {
            _goHome();
            setTimeout(_lock, 60);
        }
    }

    function _openPinModal(view, title, sub, opts) {
        view.querySelector('.ph-pin-modal')?.remove();
        const modal = el('div', { class: 'ph-pin-modal' });
        modal.innerHTML = `
            <div class="ph-pin-modal-title">${esc(title)}</div>
            <div class="ph-pin-modal-sub">${esc(sub)}</div>
            <div class="ph-lock-pin-wrap ph-lock-pin">
                <div class="ph-lock-pin-dots" id="phModalDots">
                    <span class="ph-lock-pin-dot"></span>
                    <span class="ph-lock-pin-dot"></span>
                    <span class="ph-lock-pin-dot"></span>
                    <span class="ph-lock-pin-dot"></span>
                </div>
            </div>
            <div class="ph-keypad" id="phModalPad" style="width:100%;max-width:200px"></div>
            <button class="ph-pin-modal-cancel" id="phModalCancel">Cancelar</button>
        `;
        view.appendChild(modal);

        const dots = modal.querySelectorAll('#phModalDots .ph-lock-pin-dot');
        const updateDots = (n) => dots.forEach((d, i) => d.classList.toggle('filled', i < n));
        const clearBuf = () => { _pinBufFlow = ''; updateDots(0); };

        const pad = modal.querySelector('#phModalPad');
        const keys = [
            { d: '1', sub: '' }, { d: '2', sub: 'ABC' }, { d: '3', sub: 'DEF' },
            { d: '4', sub: 'GHI' }, { d: '5', sub: 'JKL' }, { d: '6', sub: 'MNO' },
            { d: '7', sub: 'PQRS' }, { d: '8', sub: 'TUV' }, { d: '9', sub: 'WXYZ' },
            { util: 'back', svg: ctx.I.backspace }, { d: '0', sub: '' }, { util: 'ok', svg: '✓' }
        ];
        pad.innerHTML = keys.map(k => k.util
            ? `<button class="ph-key util${k.util === 'ok' ? ' ok' : ''}" data-util="${k.util}">${k.svg}</button>`
            : `<button class="ph-key" data-digit="${k.d}"><span>${k.d}</span>${k.sub ? `<span class="sub">${k.sub}</span>` : ''}</button>`
        ).join('');

        const closeModal = () => {
            modal.remove();
            _pinFlow = null; _pinBufFlow = ''; _pinFirstFlow = '';
        };

        const _pinWrong = () => {
            try { ctx.tone.errorPin(); } catch(_) {}
            const wrap = modal.querySelector('.ph-lock-pin');
            if (wrap) { wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); }
            modal.querySelector('.ph-pin-modal-sub').textContent = 'PIN incorreto.';
            clearBuf();
            setTimeout(() => {
                modal.querySelector('.ph-pin-modal-sub').textContent = sub;
            }, 800);
        };

        const handleComplete = () => {
            const pin = _pinBufFlow;
            if (_pinFlow === 'remove-current') {
                if (pin !== _pinSet) return _pinWrong();
                if (opts?.onSuccess) return opts.onSuccess();
                if (opts?.afterCheck) return opts.afterCheck();
            }
            if (_pinFlow === 'set-new') {
                _pinFirstFlow = pin;
                _pinFlow = 'set-confirm'; _pinBufFlow = '';
                modal.querySelector('.ph-pin-modal-title').textContent = 'Confirmar PIN';
                modal.querySelector('.ph-pin-modal-sub').textContent = 'Repita os 4 dígitos';
                updateDots(0);
                return;
            }
            if (_pinFlow === 'set-confirm') {
                if (pin !== _pinFirstFlow) {
                    try { ctx.tone.errorPin(); } catch(_) {}
                    modal.querySelector('.ph-pin-modal-sub').textContent = 'PINs não coincidem. Tente de novo.';
                    _pinFirstFlow = ''; _pinFlow = 'set-new'; _pinBufFlow = '';
                    setTimeout(() => updateDots(0), 400);
                    return;
                }
                _pinSet = pin;
                try { localStorage.setItem(LS_PIN, pin); } catch(_) {}
                try { ctx.tone.unlock(); } catch(_) {}
                _toast('PIN definido', 'ok');
                closeModal();
                _mountSettingsApp(view);
                return;
            }
        };

        pad.querySelectorAll('.ph-key').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.remove('pressed'); void btn.offsetWidth; btn.classList.add('pressed');
                if (btn.dataset.digit != null) {
                    try { ctx.tone.key(); } catch(_) {}
                    if (_pinBufFlow.length < 4) _pinBufFlow += btn.dataset.digit;
                } else if (btn.dataset.util === 'back') {
                    try { ctx.tone.key(); } catch(_) {}
                    _pinBufFlow = _pinBufFlow.slice(0, -1);
                } else if (btn.dataset.util === 'ok') {
                    if (_pinBufFlow.length === 4) handleComplete();
                    return;
                }
                updateDots(_pinBufFlow.length);
                if (_pinBufFlow.length === 4) setTimeout(handleComplete, 60);
            });
        });
        modal.querySelector('#phModalCancel').addEventListener('click', closeModal);
    }

    // ═══ GENERIC APP ═══
    function _mountGenericApp(view, app) {
        const root = document.createElement('div');
        root.style.cssText = 'flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;';
        view.appendChild(root);
        try { app.mount(root, ctx); }
        catch(e) {
            root.innerHTML = `<div class="ph-home-empty">Erro ao abrir app.</div>`;
            console.warn('[Phone] app mount falhou:', e);
        }
    }

    // ═══ CALL VIEW ═══
    let _inCallView = false;
    function _checkPhase() {
        const active = ctx.phase !== 'idle' && ctx.phase !== 'busy';
        if (active && !_inCallView) {
            _inCallView = true;
            _prevView = _view;
            _showView('call');
            const view = _frameEl.querySelector('#phViewCall');
            if (view) {
                view.innerHTML = '';
                view.appendChild(_contentEl);
            }
        } else if (!active && _inCallView) {
            _inCallView = false;
            if (_prevView === 'app' && _activeAppId) {
                const view = _frameEl.querySelector('#phViewApp');
                if (view) view.appendChild(_contentEl);
                _showView('app');
            } else {
                _goHome();
            }
        }
    }
    function _startPhasePoll() {
        if (_phasePollTimer) return;
        _phasePollTimer = setInterval(_checkPhase, 250);
    }

    // ═══ UI HELPERS PÚBLICOS ═══
    ctx.setNotifDot = (on) => {
        const d = _frameEl?.querySelector('#phNotifDot');
        if (d) d.classList.toggle('on', !!on);
    };
    ctx.announceCall = () => _frameEl?.classList.add('ringing');
    ctx.clearCallGlow = () => _frameEl?.classList.remove('ringing');
    ctx.setRecording = (on) => _frameEl?.classList.toggle('recording', on);

    // ═══ TECLADO FÍSICO ═══
    function _handlePhysicalKeys(e) {
        if (_dying) return;
        if (!_frameEl || _frameEl.classList.contains('hidden')) return;
        if (_minimized) return;

        const ae = _shadow?.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        const outAe = document.activeElement;
        if (outAe && outAe !== _host && (outAe.tagName === 'INPUT' || outAe.tagName === 'TEXTAREA' || outAe.isContentEditable)) return;

        const k = e.key;
        let sel = null;
        let scope = null;

        if (_view === 'lock' && _pinSet) {
            scope = _frameEl.querySelector('#phLockPad');
        } else if (_view === 'app' && _activeAppId === 'calls' && _chamadasTab === 'discar') {
            scope = _frameEl.querySelector('#phContent');
        } else return;

        if (!scope) return;

        if (k.length === 1 && k >= '0' && k <= '9') sel = `.ph-key[data-digit="${k}"]`;
        else if (k === 'Backspace') sel = `.ph-key[data-util="back"]`;
        else if (k === 'Enter' || k === 'Escape') {
            if (_view === 'lock') sel = `.ph-key[data-util="ok"]`;
            else if (k === 'Enter') sel = `#phCall`;
            else sel = `.ph-key[data-util="clear"]`;
        }
        else return;

        const btn = scope.querySelector(sel);
        if (!btn || btn.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        btn.click();
    }
    document.addEventListener('keydown', _handlePhysicalKeys, true);
    document.addEventListener('dragover', _handleDragEdge, true);
    document.addEventListener('dragend', _cancelDragPageTimer, true);
    document.addEventListener('drop',    _cancelDragPageTimer, true);

    // ═══ MODULE LOADER ═══
    async function _loadModule(name, url) {
        try {
            const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const code = await res.text();
            const s = document.createElement('script');
            s.textContent = code;
            document.documentElement.appendChild(s);
            s.remove();
            return true;
        } catch(e) {
            console.warn('[Phone] Falha ao carregar ' + name + ':', e);
            return false;
        }
    }

    // ═══ TOGGLE / KILL ═══
    function toggle() {
        ctx.getAudioCtx?.();
        if (_frameEl && _frameEl.isConnected && !_frameEl.classList.contains('hidden')) {
            _frameEl.classList.add('hidden');
            return;
        }
        _ensureFrame();
        _frameEl.classList.remove('hidden');
        _tickClock();
        if (!ctx.myNumber) ctx.contacts.ensureMyNumber?.();
        if (_inCallView) _showView('call');
        else if (_view === 'app' && _activeAppId) _showView('app');
        else if (_view === 'home') _renderHome();
        else _renderLock();
    }
    function kill() {
        if (_dying) return;
        _dying = true;
        try { ctx.calls.cleanup?.(); } catch(_) {}
        try { ctx.notes.cancelNote?.(); } catch(_) {}
        try { ctx.notes.stopPoll?.(); } catch(_) {}
        try { document.removeEventListener('keydown', _handlePhysicalKeys, true); } catch(_) {}
        try { document.removeEventListener('dragover', _handleDragEdge, true); } catch(_) {}
        try { document.removeEventListener('dragend', _cancelDragPageTimer, true); } catch(_) {}
        try { document.removeEventListener('drop',    _cancelDragPageTimer, true); } catch(_) {}
        _cancelDragPageTimer();
        if (_clockTimer) { clearInterval(_clockTimer); _clockTimer = null; }
        if (_phasePollTimer) { clearInterval(_phasePollTimer); _phasePollTimer = null; }
        try { if (_host) _host.remove(); } catch(e) {}
        try { if (_actx) _actx.close(); } catch(e) {}
        try { delete window[UID]; } catch(e) {}
    }

    // ═══ EVENT LISTENERS ═══
    window.addEventListener('sang:phone-incoming', (e) => {
        try { ctx.calls.onIncoming?.(e?.detail); } catch(_) {}
    });
    window.addEventListener('sang:player-updated', () => {
        if (ctx.myNumber) ctx.contacts.refreshMyDirectory?.();
    });

    // ═══ BOOT ═══
    async function _boot() {
        _ensureHost();
        _injectBaseStyle();
        _ensureFrame();

        _renderLock();

        const base = MODULES_BASE;
        await Promise.all([
            _loadModule('contacts', base + '/contacts.js'),
            _loadModule('calls',    base + '/calls.js'),
            _loadModule('notes',    base + '/notes.js'),
            _loadModule('config',   base + '/apps/config.js'),
            _loadModule('sangzap',  base + '/apps/sangzap/shell.js')
        ]);

        ctx.apps.onChange(() => {
            if (_view === 'home') _renderHome();
            if (_view === 'app' && _activeAppId === 'calls') _updateMyNumberUI();
        });

        try {
            ctx.notes?.onUnreadChange?.(_refreshRecadosBadge);
            _refreshRecadosBadge();
        } catch(_) {}

        if (ctx.contacts.ensureMyNumber) {
            ctx.contacts.ensureMyNumber().then(() => {
                _updateMyNumberUI();
            });
        }

        ctx.notes.startNotesPoll?.();
        _startPhasePoll();
    }

    window[UID] = { toggle, kill, _lock: _lock, _forceLock: _lock };
    _boot();
})();
