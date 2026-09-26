// modules/phone.js
(function() {
    'use strict';
    const UID = '_phone';
    if (window[UID]) return;

    const bridge = window._hubBridge;
    if (!bridge || !bridge.rtdb) { console.warn('[Phone] _hubBridge.rtdb ausente.'); return; }
    if (!bridge.firestore || !bridge.firestore.configured || !bridge.firestore.configured()) { console.warn('[Phone] Firestore off.'); return; }

    // ═══ CONFIG ═══
    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];
    const POLL_MS = 400;
    const ONLINE_MS = 5 * 60 * 1000;
    const CALL_TIMEOUT_MS = 45000;
    const RINGBACK_CYCLE_MS = 4000;   // chamando: 1s on / 3s off
    const RING_CYCLE_MS = 1500;       // recebendo: 800ms on / 700ms off
    const BUSY_CYCLE_MS = 500;        // ocupado: 250ms on / 250ms off

    // ═══ STATE ═══
    let _dying = false;
    let _phase = 'idle';           // idle | outgoing | incoming | active
    let _pc = null;
    let _localStream = null;
    let _remoteAudio = null;
    let _pollTimer = null;
    let _durTimer = null;
    let _timeoutTimer = null;
    let _ringTimer = null;
    let _startedAt = 0;
    let _peer = null;              // { id, name, avatarUrl }
    let _incomingOffer = null;
    let _answered = false;
    let _iceSeen = new Set();
    let _busyDismissTimer = null;

    let _host = null, _shadow = null, _root = null;
    let _frameEl = null;
    let _screenEl = null;

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
    function fmtDur(ms) {
        const s = Math.floor(ms / 1000), m = Math.floor(s / 60), ss = s % 60;
        return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    }
    function shortHash(h, a, b) { a = a || 8; b = b || 4; return !h ? '—' : (h.length <= a + b + 1 ? h : h.slice(0, a) + '…' + h.slice(-b)); }

    // ═══ AUDIO CONTEXT ═══
    let _actx = null;
    function _ctx() {
        if (_actx) return _actx;
        try { _actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { _actx = null; }
        return _actx;
    }
    function tone(freq, dur, type, peak, attack) {
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

    // ═══ TONES ═══
    function toneRingback() {
        tone(425, 1.0, 'sine', 0.045, 0.03);   // tom de chamada (BR: 425Hz)
    }
    function toneRing() {
        // toque de recebimento: 425 + 480Hz (mais rico, "chama" mesmo)
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
    }
    function toneBusy() {
        tone(425, 0.25, 'sine', 0.05, 0.015);
    }
    function toneHangup() {
        tone(320, 0.14, 'sine', 0.04, 0.006);
        setTimeout(() => tone(240, 0.16, 'sine', 0.03, 0.008), 90);
    }
    function toneDial() {
        tone(425, 0.08, 'sine', 0.035, 0.01);
    }
    function tonePickup() {
        tone(659.25, 0.09, 'sine', 0.03, 0.012);
        setTimeout(() => tone(987.77, 0.13, 'sine', 0.025, 0.014), 70);
    }
    function toneNotify() {
        tone(880, 0.06, 'sine', 0.03, 0.01);
        setTimeout(() => tone(1174.66, 0.09, 'sine', 0.025, 0.012), 55);
    }

    // ═══ LOOP DE TONS ═══
    function stopRingLoop() {
        if (_ringTimer) { clearInterval(_ringTimer); _ringTimer = null; }
    }
    function startRingbackLoop() {
        stopRingLoop();
        toneRingback();
        _ringTimer = setInterval(toneRingback, RINGBACK_CYCLE_MS);
    }
    function startRingLoop() {
        stopRingLoop();
        toneRing();
        _ringTimer = setInterval(toneRing, RING_CYCLE_MS);
    }
    function startBusyLoop() {
        stopRingLoop();
        let n = 0;
        toneBusy();
        _ringTimer = setInterval(() => {
            toneBusy();
            if (++n >= 10) stopRingLoop();
        }, BUSY_CYCLE_MS);
    }

    // ═══ SHADOW HOST ═══
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
        _injectStyle();
        ['keydown','input','beforeinput','keyup'].forEach(ev => {
            _root.addEventListener(ev, e => e.stopPropagation());
        });
    }

    // ═══ STYLE ═══
    function _injectStyle() {
        const st = document.createElement('style');
        st.textContent = `
        :host, * { box-sizing: border-box; }

        @keyframes phIn { from { opacity: 0; transform: translateY(-14px) scale(.95); } to { opacity: 1; transform: none; } }
        @keyframes phFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes phShake {
            0%,100% { transform: translateX(0); }
            2% { transform: translateX(-4px); } 4% { transform: translateX(4px); }
            6% { transform: translateX(-4px); } 8% { transform: translateX(4px); }
            10% { transform: translateX(-3px); } 12% { transform: translateX(3px); }
            14% { transform: translateX(-2px); } 16% { transform: translateX(2px); }
            18% { transform: translateX(-1px); } 20%,100% { transform: translateX(0); }
        }
        @keyframes phRipple {
            0%   { box-shadow: 0 0 0 0 rgba(52,211,153,.55); }
            100% { box-shadow: 0 0 0 22px rgba(52,211,153,0); }
        }
        @keyframes phRippleRed {
            0%   { box-shadow: 0 0 0 0 rgba(251,113,133,.55); }
            100% { box-shadow: 0 0 0 22px rgba(251,113,133,0); }
        }
        @keyframes phDots { 0%,20%{opacity:.3} 50%{opacity:1} 80%,100%{opacity:.3} }
        @keyframes phScreenBlink { 0%,100%{opacity:.6} 50%{opacity:1} }

        .ph-frame {
            position: fixed; top: 80px; left: 80px;
            width: 280px; height: 570px;
            pointer-events: auto;
            border-radius: 42px;
            padding: 10px;
            background:
                linear-gradient(160deg, #1a1c26 0%, #0d0e15 100%);
            box-shadow:
                0 30px 80px rgba(0,0,0,.7),
                0 0 0 2px rgba(255,255,255,.04),
                inset 0 1px 0 rgba(255,255,255,.12),
                inset 0 -1px 0 rgba(0,0,0,.5);
            user-select: none;
            animation: phIn .4s cubic-bezier(.22,1,.36,1);
            isolation: isolate;
        }
        .ph-frame.dragging { cursor: grabbing; }
        .ph-frame.ringing { animation: phIn .4s cubic-bezier(.22,1,.36,1), phShake 1.5s cubic-bezier(.36,.07,.19,.97) infinite; }

        /* Botões laterais cosméticos */
        .ph-side {
            position: absolute; right: -3px; width: 3px; border-radius: 2px;
            background: linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,.05));
        }
        .ph-side.vol1 { top: 120px; height: 40px; }
        .ph-side.vol2 { top: 168px; height: 40px; }
        .ph-side.pwr  { top: 130px; right: auto; left: -3px; height: 60px; }

        /* Notch / earpiece */
        .ph-notch {
            position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
            width: 90px; height: 22px; border-radius: 0 0 16px 16px;
            background: #05060a;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            cursor: grab; z-index: 30;
            pointer-events: auto;
        }
        .ph-notch:active { cursor: grabbing; }
        .ph-notch::before {
            content: ''; width: 46px; height: 4px; border-radius: 2px;
            background: rgba(255,255,255,.08);
            box-shadow: inset 0 1px 0 rgba(0,0,0,.6);
        }
        .ph-notch::after {
            content: ''; width: 6px; height: 6px; border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, #1a1c26, #05060a);
            box-shadow: inset 0 0 3px rgba(80,160,220,.4);
        }

        /* Screen */
        .ph-screen {
            position: relative; width: 100%; height: 100%;
            border-radius: 32px; overflow: hidden;
            background: linear-gradient(175deg, #0a0c14 0%, #05060a 100%);
            display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #e9ecf5;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
        }
        .ph-screen::before {
            content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1;
            background: linear-gradient(140deg, rgba(255,255,255,.04) 0%, transparent 25%);
            border-radius: 32px;
        }

        /* Status bar */
        .ph-status {
            padding: 8px 18px 4px; display: flex; align-items: center; justify-content: space-between;
            font-size: 10px; color: #b8bdd0; flex-shrink: 0; position: relative; z-index: 2;
        }
        .ph-status-time { font-weight: 700; font-variant-numeric: tabular-nums; }
        .ph-status-icons { display: flex; align-items: center; gap: 5px; font-size: 9px; }
        .ph-status-icons .sig { display: inline-flex; gap: 1px; align-items: flex-end; height: 8px; }
        .ph-status-icons .sig i { display: inline-block; width: 2px; background: currentColor; border-radius: 1px; }
        .ph-status-icons .sig i:nth-child(1){ height: 3px; opacity: .5; }
        .ph-status-icons .sig i:nth-child(2){ height: 5px; opacity: .7; }
        .ph-status-icons .sig i:nth-child(3){ height: 7px; }
        .ph-status-icons .sig i:nth-child(4){ height: 9px; }

        /* Header */
        .ph-hdr {
            padding: 6px 18px 12px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: space-between;
            position: relative; z-index: 2;
        }
        .ph-hdr-title {
            font-size: 13px; font-weight: 800; letter-spacing: .04em;
            background: linear-gradient(100deg,#22d3ee 0%,#a78bfa 50%,#22d3ee 100%);
            background-size: 220% auto;
            -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: phScreenBlink 3.2s ease-in-out infinite;
        }
        .ph-hdr-sub { font-size: 8.5px; color: #6b7280; letter-spacing: .06em; text-transform: uppercase; margin-top: 2px; }
        .ph-hdr-count { font-size: 10px; font-weight: 800; color: #a7f3d0; }

        /* Content area */
        .ph-content {
            flex: 1; min-height: 0; position: relative; z-index: 2;
            display: flex; flex-direction: column;
        }

        /* Contacts list */
        .ph-list {
            flex: 1; min-height: 0; overflow-y: auto;
            padding: 0 12px 12px;
            display: flex; flex-direction: column; gap: 4px;
        }
        .ph-list::-webkit-scrollbar { width: 4px; }
        .ph-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

        .ph-empty {
            padding: 40px 20px; text-align: center;
            font-size: 10.5px; color: #6b7280; line-height: 1.5;
        }

        .ph-contact {
            display: flex; align-items: center; gap: 10px;
            padding: 9px 10px; border-radius: 12px;
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.05);
            cursor: pointer; position: relative;
            transition: background .2s cubic-bezier(.22,1,.36,1),
                        border-color .2s cubic-bezier(.22,1,.36,1),
                        transform .25s cubic-bezier(.22,1,.36,1),
                        box-shadow .25s cubic-bezier(.22,1,.36,1);
        }
        .ph-contact:hover {
            background: rgba(255,255,255,.06);
            border-color: rgba(34,211,238,.32);
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(0,0,0,.3), 0 0 0 1px rgba(34,211,238,.06);
        }
        .ph-contact:active { transform: translateY(0) scale(.985); }
        .ph-contact.me { border-color: rgba(167,139,250,.35); }
        .ph-contact.self { cursor: default; opacity: .55; }
        .ph-contact.self:hover { transform: none; box-shadow: none; border-color: rgba(255,255,255,.05); }

        .ph-av {
            width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
            background: linear-gradient(135deg, rgba(34,211,238,.18), rgba(167,139,250,.18));
            border: 1px solid rgba(255,255,255,.08);
            display: flex; align-items: center; justify-content: center;
            overflow: hidden; position: relative; color: #8b8fa3; font-size: 14px;
        }
        .ph-av img { position: absolute; top: -25%; left: -40%; width: 210%; height: 210%; object-fit: cover; }

        .ph-info { flex: 1; min-width: 0; }
        .ph-name { font-size: 11.5px; font-weight: 700; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ph-meta { font-size: 9px; color: #8b8fa3; margin-top: 2px; font-variant-numeric: tabular-nums; }

        .ph-call-btn {
            flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
            border: 1px solid rgba(52,211,153,.35);
            background: rgba(52,211,153,.1);
            color: #a7f3d0; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all .2s cubic-bezier(.22,1,.36,1);
            pointer-events: auto;
        }
        .ph-call-btn:hover { background: rgba(52,211,153,.2); box-shadow: 0 0 12px rgba(52,211,153,.3); }
        .ph-call-btn svg { width: 12px; height: 12px; }

        /* Call screen (outgoing / incoming / active) */
        .ph-call {
            position: absolute; inset: 0;
            display: flex; flex-direction: column; align-items: center; justify-content: space-between;
            padding: 34px 20px 30px;
            background: linear-gradient(180deg, rgba(10,14,22,0) 0%, rgba(10,14,22,.85) 100%);
            animation: phFadeIn .3s ease;
            z-index: 5;
        }
        .ph-call-top { display: flex; flex-direction: column; align-items: center; gap: 14px; }
        .ph-call-av {
            width: 96px; height: 96px; border-radius: 32px;
            background: linear-gradient(135deg, rgba(34,211,238,.22), rgba(167,139,250,.22));
            border: 2px solid rgba(255,255,255,.12);
            display: flex; align-items: center; justify-content: center;
            overflow: hidden; position: relative; color: #8b8fa3; font-size: 34px;
            box-shadow: 0 20px 50px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.1);
        }
        .ph-call-av img { position: absolute; top: -25%; left: -40%; width: 210%; height: 210%; object-fit: cover; }
        .ph-call.outgoing .ph-call-av { box-shadow: 0 20px 50px rgba(0,0,0,.55), 0 0 0 6px rgba(34,211,238,.08), inset 0 1px 0 rgba(255,255,255,.1); }
        .ph-call.incoming .ph-call-av { box-shadow: 0 20px 50px rgba(0,0,0,.55), 0 0 0 6px rgba(52,211,153,.15), inset 0 1px 0 rgba(255,255,255,.1); }
        .ph-call.active  .ph-call-av { box-shadow: 0 20px 50px rgba(0,0,0,.55), 0 0 0 6px rgba(52,211,153,.25), inset 0 1px 0 rgba(255,255,255,.1); }

        .ph-call-name { font-size: 15px; font-weight: 800; color: #f1f2f8; text-align: center; letter-spacing: .02em; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ph-call-state { font-size: 10.5px; color: #9ca3af; display: flex; align-items: center; gap: 3px; letter-spacing: .04em; }
        .ph-call-state .dot { animation: phDots 1.4s infinite; }
        .ph-call-state .dot:nth-child(2) { animation-delay: .2s; }
        .ph-call-state .dot:nth-child(3) { animation-delay: .4s; }
        .ph-call-timer { font-size: 22px; font-weight: 800; color: #a7f3d0; font-variant-numeric: tabular-nums; letter-spacing: .04em; margin-top: 4px; }

        .ph-call-actions {
            display: flex; gap: 26px; align-items: center; justify-content: center;
        }
        .ph-round-btn {
            width: 56px; height: 56px; border-radius: 50%;
            border: none; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-family: inherit;
            transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s cubic-bezier(.22,1,.36,1), filter .15s;
            position: relative;
        }
        .ph-round-btn:hover { transform: translateY(-2px) scale(1.04); }
        .ph-round-btn:active { transform: scale(.95); }
        .ph-round-btn svg { width: 24px; height: 24px; }

        .ph-round-btn.green {
            background: linear-gradient(135deg, #34d399, #22d3ee);
            box-shadow: 0 10px 26px rgba(52,211,153,.4), inset 0 1px 0 rgba(255,255,255,.25);
            animation: phRipple 2s ease-out infinite;
        }
        .ph-round-btn.red {
            background: linear-gradient(135deg, #fb7185, #f472b6);
            box-shadow: 0 10px 26px rgba(251,113,133,.4), inset 0 1px 0 rgba(255,255,255,.25);
        }
        .ph-round-btn.red.incoming { animation: phRippleRed 2s ease-out infinite; }
        .ph-round-btn.small {
            width: 46px; height: 46px;
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.12);
            box-shadow: none;
            color: #c7cad6;
        }
        .ph-round-btn.small:hover { background: rgba(255,255,255,.14); }
        .ph-round-btn.small.active { background: rgba(251,113,133,.18); color: #fca5b1; border-color: rgba(251,113,133,.4); }

        .ph-round-btn-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .ph-round-btn-label { font-size: 8.5px; color: #9ca3af; letter-spacing: .05em; text-transform: uppercase; }

        /* Busy / fora de área */
        .ph-busy {
            position: absolute; inset: 0;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 14px; padding: 30px;
            background: rgba(8,10,14,.92);
            animation: phFadeIn .25s ease;
            z-index: 6;
        }
        .ph-busy-icon {
            width: 68px; height: 68px; border-radius: 22px;
            background: rgba(251,113,133,.12);
            border: 1px solid rgba(251,113,133,.35);
            display: flex; align-items: center; justify-content: center;
            color: #fb7185;
        }
        .ph-busy-icon svg { width: 30px; height: 30px; }
        .ph-busy-title { font-size: 14px; font-weight: 800; color: #f1f2f8; text-align: center; }
        .ph-busy-sub { font-size: 10.5px; color: #9ca3af; text-align: center; line-height: 1.5; max-width: 200px; }

        /* Home bar */
        .ph-home {
            padding: 6px 0 8px; flex-shrink: 0; display: flex; justify-content: center;
            position: relative; z-index: 2;
        }
        .ph-home::before {
            content: ''; width: 100px; height: 4px; border-radius: 2px;
            background: rgba(255,255,255,.22);
        }

        /* Tabs (Contatos / Recentes) */
        .ph-tabs {
            display: flex; gap: 4px; padding: 0 18px 8px; flex-shrink: 0;
            position: relative; z-index: 2;
        }
        .ph-tab {
            flex: 1; padding: 6px 0; font-size: 9px; font-weight: 800;
            text-transform: uppercase; letter-spacing: .08em;
            color: #6b7280; background: transparent; border: none; cursor: pointer;
            border-bottom: 2px solid transparent; font-family: inherit;
            transition: color .2s, border-color .2s;
        }
        .ph-tab:hover { color: #d1d5db; }
        .ph-tab.active { color: #67e8f9; border-color: #22d3ee; }
        `;
        _shadow.appendChild(st);
    }

    // ═══ ICONS ═══
    const I = {
        phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
        phoneDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(135deg)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
        micOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="21" y2="21"/><path d="M12 1a3 3 0 0 0-3 3v5"/><path d="M15 9v3a3 3 0 0 1-4.29 2.71"/><path d="M19 10v2a7 7 0 0 1-1.32 4.13"/><path d="M5 10v2a7 7 0 0 0 3 5.71"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`,
        mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
        off: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
        signal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="3" y1="20" x2="3" y2="20"/><line x1="8" y1="16" x2="8" y2="20"/><line x1="13" y1="12" x2="13" y2="20"/><line x1="18" y1="8" x2="18" y2="20"/></svg>`
    };

    // ═══ SESSION FETCH ═══
    async function _listSessions() {
        try {
            const data = await bridge.firestore.request('GET', '/sessions');
            return (data?.documents || []).map(d => ({ id: d.name.split('/').pop(), ...bridge.firestore.parseDoc(d) }));
        } catch(e) { return []; }
    }

    // ═══ RTDB HELPERS (wrapper) ═══
    const sigPath = (targetId, sub) => 'signaling/' + targetId + (sub ? '/' + sub : '');
    const sigGet = (targetId, sub) => bridge.rtdb.get(sigPath(targetId, sub));
    const sigPut = (targetId, sub, v) => bridge.rtdb.put(sigPath(targetId, sub), v);
    const sigPost = (targetId, sub, v) => bridge.rtdb.post(sigPath(targetId, sub), v);
    const sigDel = (targetId, sub) => bridge.rtdb.del(sigPath(targetId, sub));

    // ═══ WEBRTC ═══
    function _waitIce(pc, timeoutMs) {
        return new Promise(resolve => {
            if (pc.iceGatheringState === 'complete') return resolve();
            const onChange = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', onChange);
                    resolve();
                }
            };
            pc.addEventListener('icegatheringstatechange', onChange);
            setTimeout(() => { try { pc.removeEventListener('icegatheringstatechange', onChange); } catch(_) {} resolve(); }, timeoutMs || 2500);
        });
    }
    async function _ensureStream() {
        if (_localStream && _localStream.active) return _localStream;
        _localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        return _localStream;
    }

    // ═══ OUTGOING CALL ═══
    async function _call(target) {
        if (_phase !== 'idle') return;

        // Fora de área: lastSeen antigo → nem tenta
        const lastSeen = target.lastSeen || 0;
        if (Date.now() - lastSeen > ONLINE_MS) {
            _busyTone('Fora de área', target.name + ' está offline.');
            return;
        }

        let stream;
        try { stream = await _ensureStream(); }
        catch (e) { _busyTone('Sem microfone', 'Permissão negada.'); return; }

        _peer = { id: target.id, name: target.name || 'Sem nome', avatarUrl: target.avatarUrl || '' };
        _phase = 'outgoing';
        _answered = false;
        _iceSeen.clear();
        _renderCall();

        // limpa sinalização anterior deste alvo
        await sigDel(target.id, '');
        await new Promise(r => setTimeout(r, 80));

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        _pc = pc;
        stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));

        pc.onicecandidate = (ev) => {
            if (!ev.candidate) return;
            sigPost(target.id, 'ice/caller', ev.candidate.toJSON()).catch(() => {});
        };
        pc.onconnectionstatechange = () => {
            const s = pc.connectionState;
            if (s === 'connected' && _phase === 'outgoing') {
                _phase = 'active';
                _startedAt = Date.now();
                stopRingLoop();
                tonePickup();
                _renderCall();
                _startTimers();
            }
            if (['failed', 'disconnected', 'closed'].includes(s) && _phase !== 'idle') {
                _endCall(true, 'Conexão perdida');
            }
        };

        try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            await _waitIce(pc, 2200);

            const ok = await sigPut(target.id, 'offer', {
                type: 'offer',
                kind: 'phone',
                sdp: pc.localDescription.sdp,
                fromId: bridge.deviceId || '',
                fromName: bridge.player?.name || 'Usuário',
                fromAvatar: bridge.player?.avatarUrl || '',
                ts: Date.now()
            });
            if (!ok) { _endCall(true, 'Falha de rede'); return; }
        } catch (e) {
            _endCall(true, 'Erro ao iniciar');
            return;
        }

        _pollTimer = setInterval(() => _pollSignal(target.id, 'caller'), POLL_MS);
        _pollSignal(target.id, 'caller');
        startRingbackLoop();
        _startTimeout(CALL_TIMEOUT_MS, () => { _endCall(true, 'Sem resposta'); });
    }

    // ═══ RECEBER OFERTA (evento do hub) ═══
    function _onIncoming(offer) {
        if (!offer) return;
        // hangup remoto
        if (offer.type === 'hangup') {
            if (_peer && offer.fromId === _peer.id) {
                _endCall(false, 'Encerrada');
            }
            return;
        }
        if (offer.type !== 'offer' || !offer.sdp) return;
        if (_phase !== 'idle') {
            // já em chamada → respondo ocupado
            try {
                sigPut(offer.fromId || 'unknown', 'answer', { type: 'reject', reason: 'busy', ts: Date.now() });
            } catch(_) {}
            // também manda no meu path caso o caller esteja lendo de lá
            if (offer.fromId) {
                bridge.rtdb.put('signaling/' + bridge.deviceId + '/answer', { type: 'reject', reason: 'busy', ts: Date.now() }).catch(() => {});
            }
            return;
        }
        _incomingOffer = offer;
        _peer = {
            id: offer.fromId || '',
            name: offer.fromName || 'Sem nome',
            avatarUrl: offer.fromAvatar || ''
        };
        _phase = 'incoming';
        _renderCall();
        startRingLoop();
        toneNotify();
        _startTimeout(CALL_TIMEOUT_MS, () => { _rejectCall('timeout'); });
    }

    // ═══ ATENDER ═══
    async function _acceptCall() {
        const offer = _incomingOffer;
        if (!offer || _phase !== 'incoming') return;
        stopRingLoop();
        _cancelTimeout();

        let stream;
        try { stream = await _ensureStream(); }
        catch (e) { _rejectCall('no-mic'); return; }

        _phase = 'active';
        _startedAt = Date.now();
        _answered = true;
        _iceSeen.clear();
        _renderCall();
        _startTimers();

        try {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            _pc = pc;
            stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));

            const remote = new MediaStream();
            pc.ontrack = (ev) => {
                ev.streams[0].getAudioTracks().forEach(t => remote.addTrack(t));
                _remoteAudio = new Audio();
                _remoteAudio.srcObject = remote;
                _remoteAudio.autoplay = true;
                _remoteAudio.play().catch(() => {});
                window._phoneRemoteEl = _remoteAudio;
            };
            pc.onicecandidate = (ev) => {
                if (!ev.candidate) return;
                sigPost(bridge.deviceId, 'ice/callee', ev.candidate.toJSON()).catch(() => {});
            };
            pc.onconnectionstatechange = () => {
                const s = pc.connectionState;
                if (['failed', 'disconnected', 'closed'].includes(s) && _phase !== 'idle') {
                    _endCall(true, 'Conexão perdida');
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer.sdp }));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await sigPut(bridge.deviceId, 'answer', {
                type: 'answer',
                sdp: answer.sdp,
                fromId: bridge.deviceId,
                ts: Date.now()
            });

            // inicia poll do meu próprio path para pegar ICE do caller
            _pollTimer = setInterval(() => _pollSignal(bridge.deviceId, 'callee'), POLL_MS);
            _pollSignal(bridge.deviceId, 'callee');
        } catch (e) {
            _endCall(true, 'Erro ao atender');
        }
    }

    // ═══ RECUSAR ═══
    function _rejectCall(reason) {
        const offer = _incomingOffer;
        stopRingLoop();
        _cancelTimeout();
        if (offer && offer.fromId) {
            // dois writes: no path dele (para o caller) e no meu (fallback)
            sigPut(offer.fromId, 'answer', { type: 'reject', reason: reason || 'rejected', ts: Date.now() }).catch(() => {});
        }
        _cleanupCall();
        _phase = 'idle';
        _incomingOffer = null;
        _peer = null;
        _showContacts();
    }

    // ═══ POLL DE SINALIZAÇÃO ═══
    async function _pollSignal(targetId, role) {
        if (_phase === 'idle') return;
        const doc = await sigGet(targetId, '');
        if (!doc) return;

        // hangup remoto
        if (doc.offer && doc.offer.type === 'hangup' && doc.offer.fromId && doc.offer.fromId !== bridge.deviceId) {
            _endCall(false, 'Encerrada');
            return;
        }

        // caller: aplica answer
        if (role === 'caller' && doc.answer && !_answered) {
            if (doc.answer.type === 'reject') {
                const reason = doc.answer.reason || 'rejected';
                const label = reason === 'busy' ? 'Ocupado' :
                              reason === 'timeout' ? 'Sem resposta' : 'Recusada';
                _endCall(true, label);
                return;
            }
            if (doc.answer.sdp && _pc) {
                try {
                    await _pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: doc.answer.sdp }));
                    _answered = true;
                } catch(_) {}
            }
        }

        // ICE — cada lado lê a lista do outro
        const remoteIceKey = role === 'caller' ? 'ice/callee' : 'ice/caller';
        const remoteIce = await sigGet(targetId, remoteIceKey);
        if (remoteIce && _pc) {
            for (const k in remoteIce) {
                if (_iceSeen.has(k)) continue;
                _iceSeen.add(k);
                const cand = remoteIce[k];
                if (cand && cand.candidate) {
                    try { await _pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(_) {}
                }
            }
        }
    }

    // ═══ ENCERRAR ═══
    function _endCall(notifyRemote, label) {
        stopRingLoop();
        _cancelTimeout();

        if (notifyRemote && _peer && _peer.id) {
            sigPut(_peer.id, 'offer', {
                type: 'hangup',
                kind: 'phone',
                fromId: bridge.deviceId || '',
                ts: Date.now()
            }).catch(() => {});
        }

        toneHangup();
        _cleanupCall();

        // limpa a sinalização após breve atraso
        const targetId = _peer?.id;
        if (targetId) {
            setTimeout(() => { sigDel(targetId, '').catch(() => {}); }, 1500);
        }

        _phase = 'idle';
        _peer = null;
        _incomingOffer = null;
        _showContacts();

        if (label) _busyTone(label, '');
    }

    function _cleanupCall() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        if (_durTimer) { clearInterval(_durTimer); _durTimer = null; }
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        if (_pc) {
            try { _pc.getSenders().forEach(s => { try { s.track?.stop?.(); } catch(e) {} }); } catch(e) {}
            try { _pc.close(); } catch(e) {}
            _pc = null;
        }
        if (_remoteAudio) { try { _remoteAudio.pause(); _remoteAudio.srcObject = null; } catch(e) {} _remoteAudio = null; delete window._phoneRemoteEl; }
        if (_localStream) {
            try { _localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
            _localStream = null;
        }
        _startedAt = 0;
        _answered = false;
        _iceSeen.clear();
    }

    // ═══ TIMEOUTS / TIMERS ═══
    function _startTimeout(ms, cb) {
        _cancelTimeout();
        _timeoutTimer = setTimeout(cb, ms);
    }
    function _cancelTimeout() {
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
    }
    function _startTimers() {
        if (_durTimer) clearInterval(_durTimer);
        _durTimer = setInterval(() => {
            const elt = _root.querySelector('#phTimer');
            if (elt) elt.textContent = _startedAt ? fmtDur(Date.now() - _startedAt) : '00:00';
        }, 250);
    }

    // ═══ TELA OCUPADO / FORA DE ÁREA ═══
    function _busyTone(title, sub) {
        _phase = 'busy';
        _renderBusy(title, sub);
        startBusyLoop();
        if (_busyDismissTimer) clearTimeout(_busyDismissTimer);
        _busyDismissTimer = setTimeout(() => {
            if (_phase === 'busy') {
                _phase = 'idle';
                _showContacts();
            }
        }, 4500);
    }

    // ═══ UI — FRAME ═══
    function _ensureFrame() {
        if (_frameEl) return;
        _ensureHost();

        _frameEl = el('div', { class: 'ph-frame', id: 'phFrame' });
        _frameEl.innerHTML = `
            <div class="ph-side vol1"></div>
            <div class="ph-side vol2"></div>
            <div class="ph-side pwr"></div>
            <div class="ph-notch" id="phNotch"></div>
            <div class="ph-screen">
                <div class="ph-status">
                    <span class="ph-status-time" id="phTime">--:--</span>
                    <span class="ph-status-icons">
                        <span class="sig"><i></i><i></i><i></i><i></i></span>
                        <span style="font-size:9px;font-weight:800;letter-spacing:.02em;">LTE</span>
                    </span>
                </div>
                <div class="ph-hdr">
                    <div>
                        <div class="ph-hdr-title">CELULAR</div>
                        <div class="ph-hdr-sub">Sang Hub · P2P</div>
                    </div>
                    <span class="ph-hdr-count" id="phCount">0</span>
                </div>
                <div class="ph-tabs" id="phTabs" style="display:none;">
                    <button class="ph-tab active" data-tab="contatos">Contatos</button>
                    <button class="ph-tab" data-tab="sobre">Sobre</button>
                </div>
                <div class="ph-content" id="phContent"></div>
                <div class="ph-home"></div>
            </div>
        `;
        _root.appendChild(_frameEl);
        _screenEl = _frameEl.querySelector('.ph-screen');

        // clock do status bar
        _tickClock();
        setInterval(() => { if (!_dying) _tickClock(); }, 15000);

        // drag no notch
        _bindDrag(_frameEl.querySelector('#phNotch'));
    }
    function _tickClock() {
        const t = _frameEl?.querySelector('#phTime');
        if (!t) return;
        const d = new Date();
        t.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    // ═══ DRAG ═══
    function _bindDrag(handle) {
        let offX = 0, offY = 0, dragging = false;
        function onDown(e) {
            if (!_frameEl) return;
            const r = _frameEl.getBoundingClientRect();
            offX = e.clientX - r.left; offY = e.clientY - r.top;
            dragging = true;
            _frameEl.classList.add('dragging');
            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup', onUp, true);
            e.preventDefault();
        }
        function onMove(e) {
            if (!dragging || !_frameEl) return;
            const nx = Math.max(4, Math.min(window.innerWidth - _frameEl.offsetWidth - 4, e.clientX - offX));
            const ny = Math.max(4, Math.min(window.innerHeight - _frameEl.offsetHeight - 4, e.clientY - offY));
            _frameEl.style.left = nx + 'px';
            _frameEl.style.top  = ny + 'px';
        }
        function onUp() {
            dragging = false;
            if (_frameEl) _frameEl.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup', onUp, true);
        }
        handle.addEventListener('mousedown', onDown);
    }

    // ═══ VIEWS ═══
    function _showContacts() {
        _renderContacts();
    }

    async function _renderContacts() {
        if (!_screenEl) return;
        const content = _screenEl.querySelector('#phContent');
        if (!content) return;
        _phase = 'idle';

        content.innerHTML = `<div class="ph-list"><div class="ph-empty">Buscando contatos…</div></div>`;
        const all = await _listSessions();
        const myId = bridge.deviceId || '';
        const now = Date.now();

        const online = all
            .filter(s => s.id !== myId && (now - (s.lastSeen || 0)) < ONLINE_MS)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const countEl = _frameEl.querySelector('#phCount');
        if (countEl) countEl.textContent = String(online.length);

        if (!online.length) {
            content.innerHTML = `<div class="ph-list"><div class="ph-empty">Nenhum contato online.<br>Volte quando alguém estiver jogando.</div></div>`;
            return;
        }

        const html = online.map(s => {
            const nm = esc(s.name || shortHash(s.id, 6, 4));
            const av = s.avatarUrl
                ? `<div class="ph-av"><img src="${esc(s.avatarUrl)}" alt="" /></div>`
                : `<div class="ph-av">${esc((s.name || '?')[0] || '?').toUpperCase()}</div>`;
            const ago = Math.floor((now - (s.lastSeen || 0)) / 1000);
            const meta = ago < 60 ? 'agora' : ago < 3600 ? Math.floor(ago / 60) + ' min atrás' : Math.floor(ago / 3600) + 'h atrás';
            return `<div class="ph-contact" data-id="${esc(s.id)}" data-name="${esc(s.name || 'Sem nome')}" data-avatar="${esc(s.avatarUrl || '')}">
                ${av}
                <div class="ph-info">
                    <div class="ph-name">${nm}</div>
                    <div class="ph-meta">${meta}</div>
                </div>
                <button class="ph-call-btn" title="Ligar">${I.phone}</button>
            </div>`;
        }).join('');

        content.innerHTML = `<div class="ph-list">${html}</div>`;

        content.querySelectorAll('.ph-contact').forEach(elc => {
            const btn = elc.querySelector('.ph-call-btn');
            const trigger = (e) => {
                e.stopPropagation();
                toneDial();
                _call({
                    id: elc.dataset.id,
                    name: elc.dataset.name,
                    avatarUrl: elc.dataset.avatar,
                    lastSeen: all.find(x => x.id === elc.dataset.id)?.lastSeen || 0
                });
            };
            btn.addEventListener('click', trigger);
            elc.addEventListener('dblclick', trigger);
        });
    }

    function _renderCall() {
        if (!_screenEl) return;
        const content = _screenEl.querySelector('#phContent');
        if (!content) return;
        const peer = _peer || {};
        const av = peer.avatarUrl
            ? `<div class="ph-call-av"><img src="${esc(peer.avatarUrl)}" alt="" /></div>`
            : `<div class="ph-call-av">${esc((peer.name || '?')[0] || '?').toUpperCase()}</div>`;

        let stateText = '', actions = '';
        if (_phase === 'outgoing') {
            stateText = `<div class="ph-call-state">Chamando<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>`;
            actions = `
                <div class="ph-round-btn red" id="phHangup" title="Cancelar">${I.phoneDown}</div>
            `;
        } else if (_phase === 'incoming') {
            stateText = `<div class="ph-call-state">Recebendo chamada</div>`;
            actions = `
                <div class="ph-round-btn-wrap">
                    <div class="ph-round-btn red incoming" id="phReject" title="Recusar">${I.phoneDown}</div>
                    <div class="ph-round-btn-label">Recusar</div>
                </div>
                <div class="ph-round-btn-wrap">
                    <div class="ph-round-btn green" id="phAccept" title="Atender">${I.phone}</div>
                    <div class="ph-round-btn-label">Atender</div>
                </div>
            `;
        } else if (_phase === 'active') {
            stateText = `<div class="ph-call-timer" id="phTimer">00:00</div>`;
            actions = `
                <div class="ph-round-btn-wrap">
                    <div class="ph-round-btn small" id="phMute" title="Mudo">${I.mic}</div>
                    <div class="ph-round-btn-label">Mudo</div>
                </div>
                <div class="ph-round-btn-wrap">
                    <div class="ph-round-btn red" id="phHangup" title="Desligar">${I.phoneDown}</div>
                    <div class="ph-round-btn-label">Desligar</div>
                </div>
            `;
        }

        content.innerHTML = `
            <div class="ph-call ${_phase}">
                <div class="ph-call-top">
                    ${av}
                    <div class="ph-call-name">${esc(peer.name || '—')}</div>
                    ${stateText}
                </div>
                <div class="ph-call-actions">${actions}</div>
            </div>
        `;

        const hangup = content.querySelector('#phHangup');
        if (hangup) hangup.addEventListener('click', () => _endCall(true, 'Encerrada'));
        const accept = content.querySelector('#phAccept');
        if (accept) accept.addEventListener('click', () => _acceptCall());
        const reject = content.querySelector('#phReject');
        if (reject) reject.addEventListener('click', () => _rejectCall('rejected'));
        const mute = content.querySelector('#phMute');
        if (mute) mute.addEventListener('click', () => {
            if (!_localStream) return;
            const track = _localStream.getAudioTracks()[0];
            if (!track) return;
            track.enabled = !track.enabled;
            mute.classList.toggle('active', !track.enabled);
            mute.innerHTML = track.enabled ? I.mic : I.micOff;
        });
    }

    function _renderBusy(title, sub) {
        if (!_screenEl) return;
        const content = _screenEl.querySelector('#phContent');
        if (!content) return;
        content.innerHTML = `
            <div class="ph-busy">
                <div class="ph-busy-icon">${I.off}</div>
                <div class="ph-busy-title">${esc(title || 'Ocupado')}</div>
                <div class="ph-busy-sub">${esc(sub || 'O contato não pode atender agora.')}</div>
            </div>
        `;
    }

    // ═══ TOGGLE / KILL ═══
    function toggle() {
        _ctx();
        if (_frameEl && _frameEl.isConnected && !_frameEl.hidden) {
            _frameEl.hidden = true;
            return;
        }
        _ensureFrame();
        _frameEl.hidden = false;
        _tickClock();
        if (_phase === 'idle' || _phase === 'busy') _showContacts();
    }

    function kill() {
        if (_dying) return;
        _dying = true;
        stopRingLoop();
        _cleanupCall();
        _cancelTimeout();
        if (_busyDismissTimer) clearTimeout(_busyDismissTimer);
        try { if (_host) _host.remove(); } catch(e) {}
        try { if (_actx) _actx.close(); } catch(e) {}
        try { delete window[UID]; } catch(e) {}
    }

    // ═══ EVENT LISTENERS ═══
    window.addEventListener('sang:phone-incoming', (e) => {
        try { _onIncoming(e?.detail); } catch(_) {}
    });

    // expõe — mesma API dos outros módulos (yt.js etc)
    window[UID] = {
        kill,
        toggle,
        show: () => {
            if (_frameEl) { _frameEl.hidden = false; }
            else { _ensureFrame(); }
            _tickClock();
            if (_phase === 'idle' || _phase === 'busy') _showContacts();
        },
        hide: () => { if (_frameEl) _frameEl.hidden = true; }
    };

    // Auto-monta no carregamento — o hub só chama kill() pra descarregar.
    try {
        _ensureFrame();
        _tickClock();
        if (_phase === 'idle' || _phase === 'busy') _showContacts();
    } catch(e) { console.warn('[Phone] init falhou:', e); }
})();
