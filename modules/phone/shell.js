// modules/phone/shell.js
(function() {
    'use strict';
    const UID = '_phone';
    if (window[UID]) return;

    const bridge = window._hubBridge;
    if (!bridge || !bridge.rtdb) { console.warn('[Phone] _hubBridge.rtdb ausente.'); return; }
    if (!bridge.firestore || !bridge.firestore.configured || !bridge.firestore.configured()) { console.warn('[Phone] Firestore off.'); return; }

    // ═══ CONFIG DO SHELL ═══
    const ANDROID_VERSION = '14';
    const PHONE_VERSION = '1.2.0';
    const MIN_TUCK_X = 260;
    const MIN_TUCK_Y = -140;
    const FRAME_HALF_H = 285;
    const LS_MINIMIZED = 'sanghub_phone_minimized';
    const MODULES_BASE = 'https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/modules/phone';

    // ═══ CTX COMPARTILHADO ═══
    const ctx = window._phoneCtx = window._phoneCtx || {};
    ctx.phase = 'idle';
    ctx.myNumber = null;
    ctx.deviceId = bridge.deviceId || '';
    ctx.contacts = ctx.contacts || {};
    ctx.calls = ctx.calls || {};
    ctx.notes = ctx.notes || {};
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

    // ═══ AUDIO CONTEXT (compartilhado) ═══
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
        const lp  = c.createBiquadFilter();
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
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, now);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.035, now + 0.03);
                gain.gain.setValueAtTime(0.035, now + 0.72);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
                osc.connect(gain).connect(c.destination);
                osc.start(now);
                osc.stop(now + 0.83);
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
        fav() { _tone(1318.51, 0.06, 'sine', 0.02, 0.006); setTimeout(() => _tone(1760, 0.08, 'sine', 0.016, 0.008), 55); }
    };

    // ═══ ÍCONES COMPARTILHADOS ═══
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
        back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`
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

    // ═══ STATE ═══
    let _dying = false;
    let _minimized = false;
    try { _minimized = localStorage.getItem(LS_MINIMIZED) === '1'; } catch(_) {}
    let _host = null, _shadow = null, _root = null;
    let _frameEl = null;
    let _screenEl = null;
    let _myNumEl = null;
    let _activeTab = 'home';
    let _openAppId = null;
    let _clockTimer = null;

    // ═══ HOST SHADOW ═══
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
        @keyframes phDots { 0%,20%{opacity:.3} 50%{opacity:1} 80%,100%{opacity:.3} }
        @keyframes phScreenBlink { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes phPulseDot { 0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,.55)} 50%{box-shadow:0 0 0 6px rgba(52,211,153,0)} }
        @keyframes phKeyPress { 0%{transform:scale(1)} 40%{transform:scale(.9)} 100%{transform:scale(1)} }
        @keyframes phToastIn { from{opacity:0;transform:translateY(-8px) scale(.94)} to{opacity:1;transform:none} }
        @keyframes phStackIn { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:none} }
        @keyframes phRingGlow {
            0%, 100% { box-shadow: 0 30px 80px rgba(0,0,0,.7), 0 0 0 2px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(0,0,0,.5), 0 0 0 0 rgba(52,211,153,.5); }
            50% { box-shadow: 0 30px 80px rgba(0,0,0,.7), 0 0 0 2px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(0,0,0,.5), 0 0 0 12px rgba(52,211,153,0); }
        }
        @keyframes phTipHint { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,.35); } 50% { box-shadow: 0 0 0 8px rgba(34,211,238,0); } }
        @keyframes phNotchHint { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,.4); } 50% { box-shadow: 0 0 0 5px rgba(34,211,238,0); } }
        @keyframes phSpeaking {
            0%,100% { box-shadow: 0 0 0 0 rgba(34,211,238,.55), 0 0 0 0 rgba(52,211,153,.35) inset; transform: scale(1); }
            50%     { box-shadow: 0 0 0 8px rgba(34,211,238,0), 0 0 6px 3px rgba(52,211,153,.35) inset; transform: scale(1.05); }
        }
        @keyframes phRecordPulse {
            0%,100% { box-shadow: 0 30px 80px rgba(0,0,0,.7), 0 0 0 2px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(0,0,0,.5), 0 0 0 0 rgba(251,113,133,.6); }
            50% { box-shadow: 0 30px 80px rgba(0,0,0,.7), 0 0 0 2px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(0,0,0,.5), 0 0 0 14px rgba(251,113,133,0); }
        }
        @keyframes phRecWave { 0%,100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
        @keyframes phAuroraLine {
            0%   { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
        }

        .ph-frame {
            position: fixed; top: 50%; right: 24px;
            margin-top: ${-FRAME_HALF_H}px;
            width: 280px; height: 570px;
            transform-origin: 100% 50%;
            transform: translate(0, 0) rotate(0deg);
            transition: transform 1.05s cubic-bezier(.7, 0, .3, 1);
            pointer-events: auto;
            border-radius: 42px;
            padding: 10px;
            background: linear-gradient(160deg, #2a2844 0%, #1e1c36 45%, #141228 100%);
            box-shadow:
                0 30px 80px rgba(0,0,0,.6),
                0 0 0 2px rgba(255,255,255,.06),
                inset 0 1px 0 rgba(255,255,255,.16),
                inset 0 -1px 0 rgba(0,0,0,.55);
            user-select: none;
            isolation: isolate;
            will-change: transform;
            animation: phFadeIn .35s ease;
        }
        .ph-frame::before {
            content: '';
            position: absolute; inset: 0;
            border-radius: inherit; padding: 1px;
            pointer-events: none;
            background: linear-gradient(140deg, rgba(34,211,238,.4), rgba(167,139,250,.4) 35%, rgba(244,114,182,.32) 65%, rgba(52,211,153,.36));
            background-size: 200% 200%;
            animation: phAuroraLine 10s linear infinite;
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            z-index: 1;
            opacity: .9;
        }
        .ph-frame.min {
            transform: translate(${MIN_TUCK_X}px, ${MIN_TUCK_Y}px) rotate(-90deg);
            box-shadow: 0 0 22px rgba(0,0,0,.5), 0 0 0 2px rgba(255,255,255,.05), inset 0 1px 0 rgba(255,255,255,.12);
        }
        .ph-frame.min::before { opacity: .5; }
        .ph-frame.ringing:not(.min) { animation: phRingGlow 1.6s ease-in-out infinite; }
        .ph-frame.recording:not(.min) { animation: phRecordPulse 1.4s ease-in-out infinite; }
        .ph-frame.hidden { opacity: 0; pointer-events: none; }
        .ph-frame.min::after {
            content: ''; position: absolute; top: 14px; bottom: 14px; left: 0; width: 10px;
            border-radius: 42px 0 0 42px;
            background: linear-gradient(90deg, rgba(34,211,238,.28), transparent);
            animation: phTipHint 3.2s ease-in-out infinite;
            pointer-events: none;
        }

        .ph-side { position: absolute; right: -3px; width: 3px; border-radius: 2px; background: linear-gradient(180deg, rgba(255,255,255,.24), rgba(255,255,255,.06)); }
        .ph-side.vol1 { top: 120px; height: 40px; }
        .ph-side.vol2 { top: 168px; height: 40px; }
        .ph-side.pwr  { top: 130px; right: auto; left: -3px; height: 60px; }

        .ph-notch {
            position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
            width: 90px; height: 22px;
            border-radius: 0 0 16px 16px;
            background: #05060a;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            z-index: 40; pointer-events: auto; cursor: pointer;
            transition: background .2s, transform .2s;
        }
        .ph-notch:hover { background: #0a0c14; animation: phNotchHint 1.6s ease-in-out infinite; }
        .ph-notch:active { transform: translateX(-50%) scale(.94); }
        .ph-notch::before { content: ''; width: 46px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.08); box-shadow: inset 0 1px 0 rgba(0,0,0,.6); }
        .ph-notch::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #1a1c26, #05060a); box-shadow: inset 0 0 3px rgba(80,160,220,.4); }

        .ph-screen {
            position: relative; width: 100%; height: 100%;
            border-radius: 32px; overflow: hidden;
            background:
                radial-gradient(circle at 15% 10%, rgba(34,211,238,.22), transparent 48%),
                radial-gradient(circle at 88% 88%, rgba(167,139,250,.24), transparent 52%),
                radial-gradient(circle at 50% 55%, rgba(244,114,182,.12), transparent 62%),
                linear-gradient(175deg, #1c1a35 0%, #16142c 45%, #0f0d22 100%);
            display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #e9ecf5;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
        }
        .ph-screen::before {
            content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1;
            background: linear-gradient(140deg, rgba(255,255,255,.055) 0%, transparent 28%);
            border-radius: 32px;
        }

        .ph-status { padding: 8px 18px 4px; display: flex; align-items: center; justify-content: space-between;
            font-size: 10px; color: #b8bdd0; flex-shrink: 0; position: relative; z-index: 2; }
        .ph-status-time { font-weight: 700; font-variant-numeric: tabular-nums; }
        .ph-status-icons { display: flex; align-items: center; gap: 5px; font-size: 9px; }
        .ph-status-icons .sig { display: inline-flex; gap: 1px; align-items: flex-end; height: 8px; }
        .ph-status-icons .sig i { display: inline-block; width: 2px; background: currentColor; border-radius: 1px; }
        .ph-status-icons .sig i:nth-child(1){ height: 3px; opacity: .5; }
        .ph-status-icons .sig i:nth-child(2){ height: 5px; opacity: .7; }
        .ph-status-icons .sig i:nth-child(3){ height: 7px; }
        .ph-status-icons .sig i:nth-child(4){ height: 9px; }
        .ph-status-icons .dot-notif {
            width: 5px; height: 5px; border-radius: 50%; background: #fb7185;
            box-shadow: 0 0 6px rgba(251,113,133,.8);
            animation: phPulseDot 1.8s ease-in-out infinite;
            display: none;
        }
        .ph-status-icons .dot-notif.on { display: inline-block; }

        .ph-hdr { padding: 6px 18px 6px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 2; }
        .ph-hdr-title { font-size: 13px; font-weight: 800; letter-spacing: .04em;
            background: linear-gradient(100deg,#22d3ee 0%,#a78bfa 50%,#22d3ee 100%);
            background-size: 220% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: phScreenBlink 3.2s ease-in-out infinite; }
        .ph-hdr-sub { font-size: 8.5px; color: #8a92a8; letter-spacing: .06em; text-transform: uppercase; margin-top: 2px; }
        .ph-hdr-count { font-size: 10px; font-weight: 800; color: #a7f3d0; }

        .ph-me { margin: 0 14px 8px; padding: 8px 12px; border-radius: 12px;
            background: linear-gradient(120deg, rgba(34,211,238,.12), rgba(167,139,250,.12));
            border: 1px solid rgba(34,211,238,.32);
            display: flex; align-items: center; justify-content: space-between;
            cursor: pointer; user-select: none;
            transition: background .2s, border-color .2s, transform .2s;
            position: relative; z-index: 2; }
        .ph-me:hover { background: linear-gradient(120deg, rgba(34,211,238,.18), rgba(167,139,250,.18)); border-color: rgba(34,211,238,.5); transform: translateY(-1px); }
        .ph-me:active { transform: scale(.98); }
        .ph-me-label { font-size: 8.5px; color: #a8aec4; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
        .ph-me-number { font-size: 16px; font-weight: 800; letter-spacing: .06em; font-variant-numeric: tabular-nums;
            background: linear-gradient(100deg,#22d3ee 0%,#a78bfa 50%,#22d3ee 100%);
            background-size: 220% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: phScreenBlink 4s ease-in-out infinite; }
        .ph-me-number.loading { color: #5c6280; background: none; animation: none; font-weight: 600; letter-spacing: .12em; }
        .ph-me-copy { font-size: 8px; font-weight: 800; color: #67e8f9; letter-spacing: .08em;
            padding: 2px 6px; border-radius: 5px; background: rgba(34,211,238,.14); border: 1px solid rgba(34,211,238,.32); }
        .ph-me-copy svg { width: 10px; height: 10px; display: block; }

        .ph-tabs { display: flex; gap: 2px; padding: 0 14px 8px; flex-shrink: 0; position: relative; z-index: 2; }
        .ph-tab { flex: 1; padding: 7px 0; font-size: 8.5px; font-weight: 800;
            text-transform: uppercase; letter-spacing: .04em;
            color: #8890a8; background: transparent; border: none; cursor: pointer;
            border-bottom: 2px solid transparent; font-family: inherit;
            transition: color .2s, border-color .2s; }
        .ph-tab:hover { color: #d1d5db; }
        .ph-tab.active { color: #7dd3fc; border-color: #22d3ee; }
        .ph-tab:disabled { opacity: .35; cursor: not-allowed; }

        .ph-content { flex: 1; min-height: 0; position: relative; z-index: 2; display: flex; flex-direction: column; }

        /* Esconder header e cartão de número na home */
        .ph-screen[data-tab="home"] .ph-hdr,
        .ph-screen[data-tab="home"] .ph-me { display: none; }

        /* ═══ HOME ═══ */
        .ph-home-wrap {
            flex: 1; min-height: 0; overflow-y: auto;
            padding: 10px 14px 14px;
            display: flex; flex-direction: column; gap: 12px;
        }
        .ph-home-wrap::-webkit-scrollbar { width: 4px; }
        .ph-home-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }

        .ph-home-clock {
            padding: 14px 4px 4px;
            display: flex; flex-direction: column; gap: 2px;
        }
        .ph-home-time {
            font-size: 42px; font-weight: 800; letter-spacing: -.03em;
            color: #f6f7fb;
            font-variant-numeric: tabular-nums;
            line-height: 1;
            text-shadow: 0 2px 14px rgba(0,0,0,.4);
        }
        .ph-home-date {
            font-size: 11px; color: #a8aec4; letter-spacing: .02em;
            text-transform: capitalize;
            font-weight: 600;
        }

        .ph-home-me {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 12px; border-radius: 14px;
            background: linear-gradient(120deg, rgba(34,211,238,.14), rgba(167,139,250,.14));
            border: 1px solid rgba(34,211,238,.32);
            cursor: pointer; font-family: inherit;
            color: inherit; text-align: left;
            transition: background .2s, border-color .2s, transform .15s;
            width: 100%;
        }
        .ph-home-me:hover { background: linear-gradient(120deg, rgba(34,211,238,.2), rgba(167,139,250,.2)); border-color: rgba(34,211,238,.5); }
        .ph-home-me:active { transform: scale(.985); }
        .ph-home-me-lbl { font-size: 8.5px; color: #a8aec4; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
        .ph-home-me-num {
            flex: 1; text-align: right;
            font-size: 16px; font-weight: 800; letter-spacing: .05em;
            font-variant-numeric: tabular-nums;
            background: linear-gradient(100deg,#22d3ee 0%,#a78bfa 50%,#22d3ee 100%);
            background-size: 220% auto;
            -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: phScreenBlink 4s ease-in-out infinite;
        }
        .ph-home-me-num.loading { background: none; color: #5c6280; animation: none; letter-spacing: .12em; font-weight: 600; }
        .ph-home-me-copy {
            width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
            display: inline-flex; align-items: center; justify-content: center;
            background: rgba(34,211,238,.16); border: 1px solid rgba(34,211,238,.32);
            color: #67e8f9;
        }
        .ph-home-me-copy svg { width: 11px; height: 11px; }

        .ph-home-featured {
            display: flex; align-items: center; gap: 12px;
            padding: 14px; border-radius: 16px;
            background: linear-gradient(135deg, rgba(52,211,153,.16), rgba(34,211,238,.14));
            border: 1px solid rgba(52,211,153,.34);
            cursor: pointer; font-family: inherit;
            color: inherit; text-align: left;
            transition: background .2s, border-color .2s, transform .15s;
            width: 100%;
        }
        .ph-home-featured:hover { background: linear-gradient(135deg, rgba(52,211,153,.22), rgba(34,211,238,.2)); border-color: rgba(52,211,153,.55); }
        .ph-home-featured:active { transform: scale(.985); }
        .ph-home-featured-ico {
            width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
            display: inline-flex; align-items: center; justify-content: center;
            background: linear-gradient(135deg, #34d399, #22d3ee);
            color: #062420;
            box-shadow: 0 8px 22px rgba(52,211,153,.35), inset 0 1px 0 rgba(255,255,255,.3);
        }
        .ph-home-featured-ico svg { width: 20px; height: 20px; }
        .ph-home-featured-txt { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .ph-home-featured-title { font-size: 13px; font-weight: 800; color: #f1f2f8; letter-spacing: .01em; }
        .ph-home-featured-sub { font-size: 10px; color: #a7f3d0; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ph-home-featured-arrow { color: #a7f3d0; font-size: 22px; line-height: 1; opacity: .65; padding-right: 2px; }

        .ph-home-grid-hdr {
            font-size: 9px; font-weight: 800; letter-spacing: .1em;
            text-transform: uppercase; color: #8890a8;
            padding: 4px 2px 0;
        }
        .ph-home-grid {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 10px;
        }
        .ph-home-app {
            display: flex; flex-direction: column; align-items: center; gap: 6px;
            padding: 10px 4px 8px; border-radius: 14px;
            background: rgba(255,255,255,.045);
            border: 1px solid rgba(255,255,255,.06);
            cursor: pointer; font-family: inherit;
            color: inherit;
            transition: background .2s, border-color .2s, transform .15s;
        }
        .ph-home-app:hover { background: rgba(255,255,255,.09); border-color: rgba(34,211,238,.28); transform: translateY(-1px); }
        .ph-home-app:active { transform: scale(.96); }
        .ph-home-app-icon {
            width: 44px; height: 44px; border-radius: 13px;
            display: inline-flex; align-items: center; justify-content: center;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
        }
        .ph-home-app-icon svg { width: 22px; height: 22px; }
        .ph-home-app-name {
            font-size: 9px; font-weight: 700; color: #c7cad6;
            max-width: 100%; overflow: hidden; text-overflow: ellipsis;
            white-space: nowrap; text-align: center;
            letter-spacing: .01em;
        }
        .ph-home-empty {
            grid-column: 1 / -1;
            padding: 24px 10px; text-align: center;
            font-size: 10.5px; color: #6b7280; line-height: 1.5;
        }

        /* App bar (dentro de apps) */
        .ph-app-bar {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 12px; margin: 0 12px 8px;
            border-radius: 10px;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.08);
            flex-shrink: 0;
        }
        .ph-app-bar > span {
            font-size: 12px; font-weight: 800; color: #e9ecf5;
            letter-spacing: .02em;
        }
        .ph-app-back {
            width: 26px; height: 26px; border-radius: 7px;
            background: transparent; border: none;
            color: #a8aec4; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center;
            transition: color .15s, background .15s;
        }
        .ph-app-back:hover { color: #67e8f9; background: rgba(34,211,238,.12); }
        .ph-app-back svg { width: 14px; height: 14px; }
        .ph-app-root { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }

        .ph-home { padding: 6px 0 8px; flex-shrink: 0; display: flex; justify-content: center; position: relative; z-index: 2; }
        .ph-home::before { content: ''; width: 100px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.26); }

        .ph-toast { position: absolute; top: 74px; left: 50%; transform: translateX(-50%);
            padding: 8px 14px; border-radius: 9px; font-size: 10.5px; font-weight: 700; letter-spacing: .02em;
            background: linear-gradient(175deg, rgba(24,22,44,.98), rgba(14,12,32,.99));
            border: 1px solid rgba(34,211,238,.5); color: #cffafe;
            box-shadow: 0 10px 26px rgba(0,0,0,.55), 0 0 24px rgba(34,211,238,.18);
            backdrop-filter: blur(10px); animation: phToastIn .22s cubic-bezier(.22,1,.36,1);
            transition: opacity .2s, transform .2s; z-index: 20; pointer-events: none;
            max-width: 240px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ph-toast.ok { color: #a7f3d0; border-color: rgba(52,211,153,.55); }
        .ph-toast.err { color: #fecdd3; border-color: rgba(251,113,133,.55); }
        .ph-toast.fav { color: #fde68a; border-color: rgba(251,191,36,.6); }
        .ph-toast.out { opacity: 0; transform: translateX(-50%) translateY(-8px); }

        @media (prefers-reduced-motion: reduce) {
            .ph-frame, .ph-frame.min { transition-duration: .01ms; }
            .ph-frame.ringing, .ph-frame.recording { animation: none !important; }
            .ph-frame.min::after { animation: none !important; }
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
            <div class="ph-screen" data-tab="home">
                <div class="ph-status">
                    <span class="ph-status-time" id="phTime">--:--</span>
                    <span class="ph-status-icons">
                        <span class="sig"><i></i><i></i><i></i><i></i></span>
                        <span style="font-size:9px;font-weight:800;letter-spacing:.02em;">LTE</span>
                        <span class="dot-notif" id="phNotifDot"></span>
                    </span>
                </div>
                <div class="ph-hdr">
                    <div>
                        <div class="ph-hdr-title">CELULAR</div>
                        <div class="ph-hdr-sub">Android ${ANDROID_VERSION} · v${PHONE_VERSION}</div>
                    </div>
                    <span class="ph-hdr-count" id="phCount">0</span>
                </div>
                <div class="ph-me" id="phMe" title="Clique para copiar">
                    <span class="ph-me-label">meu número</span>
                    <span class="ph-me-number loading" id="phMyNum">··· — ···</span>
                    <span class="ph-me-copy">${ctx.I.copy}</span>
                </div>
                <div class="ph-tabs">
                    <button class="ph-tab active" data-tab="home">Início</button>
                    <button class="ph-tab" data-tab="contatos">Contatos</button>
                    <button class="ph-tab" data-tab="discar">Discar</button>
                    <button class="ph-tab" data-tab="recentes">Recentes</button>
                </div>
                <div class="ph-content" id="phContent"></div>
                <div class="ph-home"></div>
            </div>
        `;
        _root.appendChild(_frameEl);
        _screenEl = _frameEl.querySelector('.ph-screen');
        _myNumEl = _frameEl.querySelector('#phMyNum');
        ctx.frameEl = _frameEl;
        ctx.screenEl = _screenEl;

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
        _frameEl.querySelector('#phMe').addEventListener('click', (e) => { e.stopPropagation(); _copyMyNumber(); });
        _frameEl.querySelectorAll('.ph-tab').forEach(t => {
            t.addEventListener('click', () => {
                if (ctx.phase !== 'idle' && ctx.phase !== 'busy') return;
                _activeTab = t.dataset.tab;
                _openAppId = null;
                _renderTab();
            });
        });
    }

    function _tickClock() {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const t1 = _frameEl?.querySelector('#phTime');
        if (t1) t1.textContent = hh + ':' + mm;
        const t2 = _frameEl?.querySelector('#phHomeTime');
        if (t2) t2.textContent = hh + ':' + mm;
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

    function _updateMyNumberUI() {
        if (!_myNumEl) return;
        if (ctx.myNumber) {
            _myNumEl.textContent = ctx.contacts.fmtNumber ? ctx.contacts.fmtNumber(ctx.myNumber) : ctx.myNumber;
            _myNumEl.classList.remove('loading');
        } else {
            _myNumEl.textContent = '··· — ···';
            _myNumEl.classList.add('loading');
        }
        // Também atualiza o da home se estiver na tela
        const homeNum = _screenEl?.querySelector('#phHomeNum');
        if (homeNum) {
            if (ctx.myNumber) {
                homeNum.textContent = ctx.contacts.fmtNumber ? ctx.contacts.fmtNumber(ctx.myNumber) : ctx.myNumber;
                homeNum.classList.remove('loading');
            } else {
                homeNum.textContent = '··· — ···';
                homeNum.classList.add('loading');
            }
        }
    }
    ctx.updateMyNumberUI = _updateMyNumberUI;

    async function _copyMyNumber() {
        if (!ctx.myNumber) { _toast('Número ainda sendo gerado', 'err'); return; }
        const formatted = ctx.contacts.fmtNumber ? ctx.contacts.fmtNumber(ctx.myNumber) : ctx.myNumber;
        try { await navigator.clipboard.writeText(formatted); _toast('Número copiado', 'ok'); }
        catch(_) { _toast('Falha ao copiar', 'err'); }
    }

    // ═══ TABS ROUTER ═══
    function _renderTab() {
        if (!_screenEl) return;
        if (ctx.phase !== 'idle' && ctx.phase !== 'busy') return;
        _screenEl.setAttribute('data-tab', _activeTab);
        _screenEl.querySelectorAll('.ph-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _activeTab));
        if (_activeTab === 'home') _renderHome();
        else if (_activeTab === 'discar') ctx.contacts.renderDial?.();
        else if (_activeTab === 'recentes') ctx.contacts.renderHistory?.();
        else ctx.contacts.renderContacts?.();
    }
    ctx.renderTab = _renderTab;

    // ═══ HOME ═══
    function _fmtHomeDate(d) {
        try {
            const s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
            // "domingo, 26 de setembro" → "Domingo, 26 de setembro"
            return s.charAt(0).toUpperCase() + s.slice(1);
        } catch(_) {
            return d.toDateString();
        }
    }

    function _renderHome() {
        const content = _screenEl.querySelector('#phContent');
        if (!content) return;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');

        const myNumTxt = ctx.myNumber
            ? (ctx.contacts.fmtNumber ? ctx.contacts.fmtNumber(ctx.myNumber) : ctx.myNumber)
            : '··· — ···';
        const numCls = ctx.myNumber ? '' : ' loading';

        const apps = ctx.apps.all();
        const gridHtml = apps.length
            ? apps.map(a => {
                const icon = a.icon || ctx.I.apps;
                const accent = a.accent || '#a78bfa';
                return `<button class="ph-home-app" data-app-id="${esc(a.id)}">
                    <span class="ph-home-app-icon" style="color:${esc(accent)}">${icon}</span>
                    <span class="ph-home-app-name">${esc(a.name || a.id)}</span>
                </button>`;
            }).join('')
            : `<div class="ph-home-empty">Nenhum app instalado.<br><span style="color:#5c6280;font-size:9.5px;margin-top:4px;display:block;">Apps são registrados via <code>ctx.apps.register()</code></span></div>`;

        content.innerHTML = `
            <div class="ph-home-wrap">
                <div class="ph-home-clock">
                    <div class="ph-home-time" id="phHomeTime">${hh}:${mm}</div>
                    <div class="ph-home-date">${esc(_fmtHomeDate(now))}</div>
                </div>
                <button class="ph-home-me" id="phHomeMe" title="Clique para copiar">
                    <span class="ph-home-me-lbl">meu número</span>
                    <span class="ph-home-me-num${numCls}" id="phHomeNum">${esc(myNumTxt)}</span>
                    <span class="ph-home-me-copy">${ctx.I.copy}</span>
                </button>
                <button class="ph-home-featured" id="phHomeFeatured">
                    <span class="ph-home-featured-ico">${ctx.I.phone}</span>
                    <span class="ph-home-featured-txt">
                        <span class="ph-home-featured-title">Chamadas</span>
                        <span class="ph-home-featured-sub" id="phHomeFeaturedSub">—</span>
                    </span>
                    <span class="ph-home-featured-arrow">›</span>
                </button>
                <div class="ph-home-grid-hdr">Apps</div>
                <div class="ph-home-grid" id="phHomeGrid">${gridHtml}</div>
            </div>
        `;

        // Handlers
        content.querySelector('#phHomeMe').addEventListener('click', () => _copyMyNumber());
        content.querySelector('#phHomeFeatured').addEventListener('click', () => {
            _activeTab = 'contatos';
            _renderTab();
        });
        content.querySelectorAll('.ph-home-app').forEach(b => {
            b.addEventListener('click', () => _openApp(b.dataset.appId));
        });

        // Popula o sub do card de chamadas em background
        _updateHomeFeaturedSub();
    }

    async function _updateHomeFeaturedSub() {
        const elSub = _screenEl?.querySelector('#phHomeFeaturedSub');
        if (!elSub) return;
        try {
            if (ctx.contacts.fetchSessions) await ctx.contacts.fetchSessions(false);
            const cache = ctx.contacts.sessionsCache || [];
            const contactsList = ctx.contacts.contacts || [];
            const myId = bridge.deviceId || '';
            const now = Date.now();
            const online = cache.filter(s => s.id !== myId && (now - (s.lastSeen || 0)) < 5 * 60 * 1000).length;
            const parts = [];
            parts.push(online === 1 ? '1 online' : online + ' online');
            const cc = contactsList.length;
            if (cc) parts.push(cc === 1 ? '1 contato' : cc + ' contatos');
            elSub.textContent = parts.join(' · ');
        } catch(_) {
            elSub.textContent = '—';
        }
    }

    // ═══ APP LAUNCHER ═══
    function _openApp(id) {
        if (!_screenEl) return;
        const app = ctx.apps.get(id);
        if (!app) return;
        const content = _screenEl.querySelector('#phContent');
        if (!content) return;

        // Encerra app anterior
        if (_openAppId && _openAppId !== id) {
            const prev = ctx.apps.get(_openAppId);
            try { prev?.unmount?.(); } catch(_) {}
        }
        _openAppId = id;
        // Sempre volta pra home quando fecha o app
        _activeTab = 'home';
        _screenEl.setAttribute('data-tab', 'app');

        content.innerHTML = '';
        const bar = el('div', { class: 'ph-app-bar' });
        bar.innerHTML = `<button class="ph-app-back" title="Voltar">${ctx.I.back}</button><span>${esc(app.name || id)}</span>`;
        bar.querySelector('.ph-app-back').addEventListener('click', () => {
            try { app.unmount?.(); } catch(_) {}
            _openAppId = null;
            _activeTab = 'home';
            _renderTab();
        });
        content.appendChild(bar);
        const appRoot = el('div', { class: 'ph-app-root' });
        content.appendChild(appRoot);
        try { app.mount(appRoot, ctx); }
        catch(e) { appRoot.innerHTML = `<div class="ph-home-empty">Erro ao abrir app.</div>`; console.warn('[Phone] app mount falhou:', e); }
    }
    ctx.openApp = _openApp;

    ctx.setNotifDot = (on) => {
        const d = _frameEl?.querySelector('#phNotifDot');
        if (d) d.classList.toggle('on', !!on);
    };

    ctx.announceCall = () => _frameEl?.classList.add('ringing');
    ctx.clearCallGlow = () => _frameEl?.classList.remove('ringing');
    ctx.setRecording = (on) => _frameEl?.classList.toggle('recording', on);

    // ═══ TECLADO FÍSICO — discador ═══
    // Intercepta dígitos, backspace e escape quando:
    //   - o telefone está visível e não minimizado
    //   - a aba ativa é 'discar'
    //   - a chamada está em idle ou busy
    //   - nenhum input real (search, etc) está focado dentro do shadow
    // Simula cliques nos botões do keypad — respeita o estado interno de contacts.js
    function _handlePhysicalKeys(e) {
        if (_dying) return;
        if (!_frameEl || _frameEl.classList.contains('hidden')) return;
        if (_minimized) return;
        if (_activeTab !== 'discar') return;
        if (ctx.phase !== 'idle' && ctx.phase !== 'busy') return;
        // Não atropelar inputs dentro do telefone (ex: busca em contatos)
        const ae = _shadow?.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        // Não atropelar inputs fora do telefone
        const outAe = document.activeElement;
        if (outAe && outAe !== _host && (outAe.tagName === 'INPUT' || outAe.tagName === 'TEXTAREA' || outAe.isContentEditable)) return;

        const k = e.key;
        let sel = null;
        if (k.length === 1 && k >= '0' && k <= '9') {
            sel = `.ph-key[data-digit="${k}"]`;
        } else if (k === 'Backspace') {
            sel = `.ph-key[data-util="back"]`;
        } else if (k === 'Escape' || k === 'Delete') {
            sel = `.ph-key[data-util="clear"]`;
        } else if (k === 'Enter') {
            sel = `#phCall`;
        } else {
            return;
        }
        const btn = _screenEl?.querySelector(sel);
        if (!btn || btn.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        btn.click();
    }
    // Captura na fase de captura para rodar ANTES dos handlers do jogo
    document.addEventListener('keydown', _handlePhysicalKeys, true);

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
        _updateMyNumberUI();
        if (!ctx.myNumber) ctx.contacts.ensureMyNumber?.();
        if (ctx.phase === 'idle' || ctx.phase === 'busy') _renderTab();
    }
    function kill() {
        if (_dying) return;
        _dying = true;
        try { ctx.calls.cleanup?.(); } catch(_) {}
        try { ctx.notes.cancelNote?.(); } catch(_) {}
        try { ctx.notes.stopPoll?.(); } catch(_) {}
        try { document.removeEventListener('keydown', _handlePhysicalKeys, true); } catch(_) {}
        if (_clockTimer) { clearInterval(_clockTimer); _clockTimer = null; }
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

        // Carrega módulos filhos em paralelo
        const base = MODULES_BASE;
        await Promise.all([
            _loadModule('contacts', base + '/contacts.js'),
            _loadModule('calls',    base + '/calls.js'),
            _loadModule('notes',    base + '/notes.js')
        ]);
        // Apps opcionais — descomente conforme forem adicionados
        // await Promise.all([
        //   _loadModule('config', base + '/apps/config.js')
        // ]);

        // Atualiza home se apps registrarem quando home já estiver renderizada
        ctx.apps.onChange(() => {
            if (_activeTab === 'home' && !_openAppId) _renderHome();
        });

        // Alocação de número
        if (ctx.contacts.ensureMyNumber) {
            ctx.contacts.ensureMyNumber().then(n => {
                if (n && !_minimized) _toast('Seu número: ' + (ctx.contacts.fmtNumber?.(n) || n), 'ok');
            });
        }

        _renderTab();
        ctx.notes.startNotesPoll?.();
    }

    window[UID] = { toggle, kill };
    _boot();
})();
